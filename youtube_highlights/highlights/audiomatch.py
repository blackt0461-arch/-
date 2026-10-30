"""音声照合: 切り抜き動画の音声が、元配信のどこから来たかを特定する。numpy が必要。

方法
  1. 特徴量: 8kHz の音声を 0.1 秒ごとに区切り、150〜3800Hz を対数間隔 24 帯域に分けた
     対数エネルギーを求める。
       - 各フレームで帯域平均を引く      → 音量差 (切り抜き側の音量調整) を無視
       - 各帯域で 3 秒移動平均を引く      → 一定の BGM・イコライザ差を無視
  2. 切り抜きを 10 秒ずつ (5 秒ずらし) の断片に分け、各断片と元配信全体との
     正規化相互相関 (NCC) を FFT で一括計算する。
  3. 相関の最大値が十分に高く (≥ MIN_NCC)、かつ他の位置と比べて突出している
     (ロバスト z ≥ MIN_Z) 断片だけを採用する。
  4. 「元配信上の位置 − 切り抜き上の位置」が揃って連続する断片を 1 区間にまとめる。
     切り抜きは編集で場面が飛ぶので、区間が複数になることもある。
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

SAMPLE_RATE = 8000
FPS = 10                      # 特徴量のフレームレート
HOP = SAMPLE_RATE // FPS      # 800 サンプル
WIN = 1024
N_BANDS = 24
CHUNK = 10 * FPS              # 断片の長さ (10 秒)
CHUNK_HOP = 5 * FPS           # 断片のずらし幅 (5 秒)
MIN_NCC = 0.45
MIN_Z = 8.0
MIN_Z_SINGLE = 12.0           # 前後の断片と繋がらない単独の一致はより厳しく


def _band_matrix() -> np.ndarray:
    freqs = np.fft.rfftfreq(WIN, 1.0 / SAMPLE_RATE)
    edges = np.geomspace(150.0, 3800.0, N_BANDS + 1)
    m = np.zeros((freqs.size, N_BANDS), dtype=np.float32)
    for b in range(N_BANDS):
        m[(freqs >= edges[b]) & (freqs < edges[b + 1]), b] = 1.0
    return m


def features(samples: np.ndarray) -> np.ndarray:
    """(フレーム数, 帯域数) の特徴量。"""
    x = np.asarray(samples, dtype=np.float32)
    if x.size < WIN:
        return np.zeros((0, N_BANDS), dtype=np.float32)
    n = 1 + (x.size - WIN) // HOP
    window = np.hanning(WIN).astype(np.float32)
    bands = _band_matrix()
    out = np.empty((n, N_BANDS), dtype=np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(x, WIN)[::HOP][:n]
    step = 20000  # メモリ節約のため分割して FFT
    for i in range(0, n, step):
        spec = np.abs(np.fft.rfft(frames[i : i + step] * window, axis=1)) ** 2
        out[i : i + step] = np.log(spec.astype(np.float32) @ bands + 1e-8)
    out -= out.mean(axis=1, keepdims=True)
    k = 3 * FPS
    kernel = np.ones(k, dtype=np.float32) / k
    for b in range(N_BANDS):
        out[:, b] -= np.convolve(out[:, b], kernel, mode="same")
    return out


@lru_cache(maxsize=4)
def load_features(pcm_path: str) -> np.ndarray:
    data = np.fromfile(pcm_path, dtype="<i2").astype(np.float32) / 32768.0
    return features(data)


class StreamIndex:
    """元配信の特徴量の FFT を 1 度だけ計算しておき、断片との NCC を高速に求める。"""

    def __init__(self, feats: np.ndarray, max_chunk: int = CHUNK):
        self.n = feats.shape[0]
        self.nfft = 1 << int(np.ceil(np.log2(self.n + max_chunk)))
        self.spec = np.fft.rfft(feats.T, n=self.nfft, axis=1)        # (帯域, nfft/2+1)
        s1 = feats.sum(axis=1).astype(np.float64)
        s2 = (feats.astype(np.float64) ** 2).sum(axis=1)
        self.c1 = np.concatenate([[0.0], np.cumsum(s1)])
        self.c2 = np.concatenate([[0.0], np.cumsum(s2)])

    def ncc(self, chunk: np.ndarray) -> np.ndarray:
        """chunk (L, 帯域) と元配信の全位置との正規化相互相関。長さ n-L+1。"""
        L, nb = chunk.shape
        c = chunk - chunk.mean()
        norm = np.sqrt((c * c).sum())
        if norm < 1e-6 or self.n < L:
            return np.zeros(max(0, self.n - L + 1))
        c = c / norm
        cs = np.fft.rfft(c.T, n=self.nfft, axis=1)
        corr = np.fft.irfft((self.spec * np.conj(cs)).sum(axis=0), n=self.nfft)[: self.n - L + 1]
        cnt = L * nb
        w1 = self.c1[L:] - self.c1[:-L]
        w2 = self.c2[L:] - self.c2[:-L]
        var = np.maximum(w2 - w1 * w1 / cnt, 1e-9)
        return corr / np.sqrt(var)


_INDEX_CACHE: dict[int, StreamIndex] = {}


def _get_index(stream_feats: np.ndarray) -> StreamIndex:
    key = id(stream_feats)
    if key not in _INDEX_CACHE:
        _INDEX_CACHE.clear()
        _INDEX_CACHE[key] = StreamIndex(stream_feats)
    return _INDEX_CACHE[key]


def match_chunks(stream_feats: np.ndarray, clip_feats: np.ndarray) -> list[tuple[int, int, float, float]]:
    """切り抜きの各断片について (切り抜き上の位置, 元配信上の位置, NCC, z) を返す (採用分のみ候補)。"""
    index = _get_index(stream_feats)
    out = []
    for start in range(0, max(1, clip_feats.shape[0] - CHUNK + 1), CHUNK_HOP):
        chunk = clip_feats[start : start + CHUNK]
        if chunk.shape[0] < CHUNK or chunk.std() < 0.05:
            continue  # 短すぎる・無音
        r = index.ncc(chunk)
        if r.size == 0:
            continue
        pos = int(np.argmax(r))
        peak = float(r[pos])
        med = float(np.median(r))
        mad = float(np.median(np.abs(r - med))) * 1.4826 + 1e-6
        out.append((start, pos, peak, (peak - med) / mad))
    return out


def match_clip(
    stream_feats: np.ndarray, clip_feats: np.ndarray, tolerance: int = 3
) -> list[tuple[float, float]]:
    """切り抜きが対応する元配信上の区間 (秒) のリスト。見つからなければ空。"""
    hits = [h for h in match_chunks(stream_feats, clip_feats) if h[2] >= MIN_NCC and h[3] >= MIN_Z]
    # 連続する断片 (オフセットが揃っている) をまとめる
    groups: list[list[tuple[int, int, float, float]]] = []
    for h in hits:
        offset = h[1] - h[0]
        if groups:
            last = groups[-1][-1]
            if abs((last[1] - last[0]) - offset) <= tolerance and h[0] - last[0] <= 2 * CHUNK_HOP:
                groups[-1].append(h)
                continue
        groups.append([h])
    intervals = []
    for g in groups:
        if len(g) == 1 and g[0][3] < MIN_Z_SINGLE:
            continue
        start = g[0][1] / FPS
        end = (g[-1][1] + CHUNK) / FPS
        intervals.append((start, end))
    return _merge(intervals)


def _merge(intervals: list[tuple[float, float]], gap: float = 5.0) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1] + gap:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out

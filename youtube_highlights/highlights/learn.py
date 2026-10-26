"""実際に伸びた切り抜き動画から「どんな場面を・どう切り抜くと伸びるか」を学ぶ。

データの作り方 (build_dataset)
  1. 配信者名で切り抜きを検索 (再生数順・新しい順)。
  2. 切り抜きごとに概要欄から元配信と時刻を特定 (clips.locate_from_text)。
     時刻が無い切り抜きは、元配信の自動字幕と照合 (transcript) して特定する。
  3. 元配信ごとにチャット・よく再生された部分・コメントを取得して解析 (detect.analyze)。
  4. 切り抜かれた区間 = 正例、同じ配信の切り抜かれていない区間 (同じ長さ・ランダム) = 負例 として、
     区間の特徴 (window_features) を記録する。正例には再生数・投稿日数・チャンネル登録者数も付ける。

学習 (train)
  A. 切り抜かれやすさ: 正例 vs 負例 のロジスティック回帰 (特徴は標準化、L2 正則化)。
  B. 伸びやすさ: 正例について
       log10(再生数) = a + b_age·log10(日数) + b_subs·log10(登録者数) + Σ b_k·特徴_k
     のリッジ回帰。チャンネル規模と年齢を差し引いた上で、どの特徴が再生数に効くか。
  C. 作り方: 伸びた切り抜き (年齢・規模を差し引いた残差が上位半分) の
       前振り (区間の始まり〜最初の盛り上がり)・余韻 (最後の盛り上がり〜区間の終わり)・長さ の中央値。

結果は model.json に保存し、検出 (rank_highlights) と切り抜き作成 (ClipOptions の lead / tail) に使う。
"""

from __future__ import annotations

import json
import math
import os
import random
import re
import statistics
import time
from collections import Counter
from typing import Sequence

from .chat import ChatMessage
from .detect import Analysis, Highlight
from .log import log

FEATURES = [
    "score_max", "score_mean", "reaction_max", "reaction_mean", "activity_max", "activity_mean",
    "heatmap_max", "comments_max", "money_max", "n_peaks", "chat_rate_ratio",
    "share_laugh", "share_surprise", "share_hype", "share_cute", "share_applause", "share_clip",
    "position", "length_min",
]

FEATURE_LABEL = {
    "score_max": "盛り上がりスコアの最大値", "score_mean": "盛り上がりスコアの平均",
    "reaction_max": "チャット反応の最大値", "reaction_mean": "チャット反応の平均",
    "activity_max": "チャット速度の最大値", "activity_mean": "チャット速度の平均",
    "heatmap_max": "よく再生された部分", "comments_max": "コメント欄での言及", "money_max": "スパチャ",
    "n_peaks": "盛り上がりの山の数", "chat_rate_ratio": "チャット量 (配信の普段比)",
    "share_laugh": "反応のうち笑いの割合", "share_surprise": "反応のうち驚きの割合",
    "share_hype": "反応のうち盛り上がりの割合", "share_cute": "反応のうちてぇてぇの割合",
    "share_applause": "反応のうち拍手の割合", "share_clip": "反応のうち「切り抜き希望」の割合",
    "position": "配信内の位置 (0=冒頭, 1=最後)", "length_min": "区間の長さ (分)",
}

_YT_ID = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:[^\s]*&)?v=|live/|shorts/))([A-Za-z0-9_-]{11})")


# ---------------------------------------------------------------------------
# 区間の特徴
# ---------------------------------------------------------------------------
def window_features(analysis: Analysis, messages: Sequence[ChatMessage], start: float, end: float,
                    duration: float) -> dict[str, float]:
    b = analysis.bin_size
    i0, i1 = max(0, int(start // b)), min(len(analysis.score), max(int(start // b) + 1, int(math.ceil(end / b))))
    seg = analysis.score[i0:i1] or [0.0]
    f: dict[str, float] = {"score_max": max(seg), "score_mean": sum(seg) / len(seg)}
    for k in ("reaction", "activity", "heatmap", "comments", "money"):
        vals = analysis.components.get(k, [])[i0:i1]
        if k in ("reaction", "activity"):
            f[f"{k}_mean"] = sum(vals) / len(vals) if vals else 0.0
        f[f"{k}_max"] = max(vals) if vals else 0.0
    f["n_peaks"] = float(sum(1 for i in range(1, len(seg) - 1) if seg[i] >= 2 and seg[i] >= seg[i - 1] and seg[i] > seg[i + 1]))
    # チャット量 (配信全体の 1 分あたりの中央値に対する比) と反応の種類の割合
    inside = [m for m in messages if start <= m.time <= end]
    per_min: Counter[int] = Counter(int(m.time // 60) for m in messages)
    med = statistics.median(per_min.values()) if per_min else 0.0
    rate = len(inside) / max(1e-6, (end - start) / 60)
    f["chat_rate_ratio"] = rate / med if med else 0.0
    cats: Counter[str] = Counter()
    for m in inside:
        for c in m.reactions:
            cats[c] += 1
    total = sum(cats.values())
    for c in ("laugh", "surprise", "hype", "cute", "applause", "clip"):
        f[f"share_{c}"] = cats[c] / total if total else 0.0
    f["position"] = start / duration if duration else 0.0
    f["length_min"] = (end - start) / 60
    return {k: float(f.get(k, 0.0)) for k in FEATURES}


def peaks_in(analysis: Analysis, start: float, end: float, z: float = 2.0) -> list[float]:
    """区間内の盛り上がりの山の時刻。"""
    b = analysis.bin_size
    s = analysis.score
    i0, i1 = max(1, int(start // b)), min(len(s) - 1, int(math.ceil(end / b)))
    return [i * b for i in range(i0, i1) if s[i] >= z and s[i] >= s[i - 1] and s[i] > s[i + 1]]


# ---------------------------------------------------------------------------
# データ集め
# ---------------------------------------------------------------------------
def source_ids(text: str, own_id: str) -> list[str]:
    out = []
    for vid in _YT_ID.findall(text or ""):
        if vid != own_id and vid not in out:
            out.append(vid)
    return out


def build_dataset(names: list[str], workdir: str, out_path: str, per_name: int = 40, negatives: int = 3,
                  use_transcript: bool = True, pause: float = 0.7, seed: int = 1) -> int:
    """学習データを作り、JSON Lines で out_path に追記する。Returns: 追加した行数。"""
    from .clips import intervals_from_times, locate_from_text
    from .detect import Config, analyze
    from .fetch import _yt_dlp, fetch
    from .trends import search_clips

    rnd = random.Random(seed)
    yt = _yt_dlp()
    done = set()
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line).get("clip_id"))
                except ValueError:
                    pass
    # 1-2. 切り抜きを集めて元配信の位置を特定
    located: dict[str, list[dict]] = {}
    with yt.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True}) as flat, \
         yt.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True,
                       "sleep_interval_requests": pause}) as full:
        for name in names:
            cands: dict[str, dict] = {}
            for sort in ("views", "date"):
                try:
                    for r in search_clips(flat, f"{name} 切り抜き", sort, per_name):
                        cands.setdefault(r["id"], r)
                except Exception as e:
                    log(f"検索に失敗: {e}")
            log(f"「{name}」の切り抜き候補 {len(cands)} 本の元配信を調べています...")
            for cid, r in cands.items():
                if cid in done:
                    continue
                try:
                    info = full.extract_info(f"https://www.youtube.com/watch?v={cid}", download=False)
                except Exception as e:
                    log(f"  取得失敗 {cid}: {str(e)[:80]}")
                    continue
                text = (info.get("description") or "") + "\n" + (info.get("title") or "")
                for sid in source_ids(text, cid)[:2]:
                    times, method = locate_from_text(text, sid, 24 * 3600, float(info.get("duration") or 0))
                    rec = {"clip_id": cid, "stream_id": sid, "title": info.get("title") or "",
                           "views": int(info.get("view_count") or r.get("views") or 0),
                           "duration": float(info.get("duration") or 0),
                           "upload_date": info.get("upload_date") or "",
                           "subs": info.get("channel_follower_count"), "channel_id": info.get("channel_id") or "",
                           "times": times, "method": method, "streamer": name}
                    located.setdefault(sid, []).append(rec)
                    break
    # 3-4. 元配信ごとに解析して特徴を記録
    added = 0
    with open(out_path, "a", encoding="utf-8") as out:
        for sid, recs in located.items():
            url = f"https://www.youtube.com/watch?v={sid}"
            try:
                data = fetch(url, workdir, use_chat=True, max_comments=200)
            except Exception as e:
                log(f"元配信 {sid} の取得に失敗: {str(e)[:80]}")
                continue
            if not data.duration or data.duration < 600 or not data.messages:
                continue  # 配信アーカイブ (チャットあり) だけを使う
            an = analyze(data.duration, Config(top=50), messages=data.messages, heatmap=data.heatmap,
                         comments=data.comments)
            index = None
            if use_transcript and any(not r["times"] for r in recs):
                from .transcript import TranscriptIndex, fetch_transcript
                with yt.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as full:
                    from .transcript import stream_transcript
                    tr = stream_transcript(full, url, sid, workdir)
                    index = TranscriptIndex(tr) if tr else None
            used: list[tuple[float, float]] = []
            for r in recs:
                intervals = []
                if r["times"]:
                    intervals = intervals_from_times(r["times"], r["duration"], data.duration)
                elif index is not None:
                    try:
                        with yt.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as full:
                            info = full.extract_info(f"https://www.youtube.com/watch?v={r['clip_id']}", download=False)
                            ctr = fetch_transcript(full, info)
                        intervals = index.match(ctr) if ctr else []
                        r["method"] = "transcript" if intervals else ""
                    except Exception:
                        intervals = []
                if not intervals or sum(e - s for s, e in intervals) > 600:
                    continue  # 位置不明・まとめ動画は除く
                s, e = intervals[0][0], intervals[-1][1]
                pk = peaks_in(an, s, e)
                row = {**{k: v for k, v in r.items() if k != "times"}, "label": 1, "start": s, "end": e,
                       "stream_duration": data.duration,
                       "lead": (pk[0] - s) if pk else None, "tail": (e - pk[-1]) if pk else None,
                       "n_segments": len(intervals), "features": window_features(an, data.messages, s, e, data.duration)}
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                used.append((s - 60, e + 60))
                added += 1
                # 負例: 同じ長さで、どの切り抜きとも重ならない区間
                length = e - s
                for _ in range(negatives):
                    for _try in range(20):
                        ns = rnd.uniform(0, max(0.0, data.duration - length))
                        if all(ns + length < u0 or ns > u1 for u0, u1 in used):
                            neg = {"clip_id": None, "stream_id": sid, "label": 0, "start": ns, "end": ns + length,
                                   "stream_duration": data.duration,
                                   "features": window_features(an, data.messages, ns, ns + length, data.duration)}
                            out.write(json.dumps(neg, ensure_ascii=False) + "\n")
                            break
            out.flush()
            log(f"元配信 {data.title[:30]}: 切り抜き {sum(1 for _ in used)} 本を記録")
            time.sleep(pause)
    return added


def row_key(r: dict) -> str:
    """重複判定用のキー (正例は切り抜き ID、負例は配信と区間)。"""
    if r.get("clip_id"):
        return r["clip_id"]
    feats = json.dumps({k: round(v, 4) for k, v in sorted((r.get("features") or {}).items())})
    return f"{r.get('stream_id')}:{round(r.get('start', 0))}:{round(r.get('end', 0))}:{feats}"


def merge_datasets(dst: str, srcs: list[str]) -> int:
    """ほかの人が集めた学習データ (JSON Lines) を dst に合流する。Returns: 追加した行数。"""
    seen = {row_key(r) for r in load_dataset(dst)} if os.path.exists(dst) else set()
    added = 0
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with open(dst, "a", encoding="utf-8") as out:
        for src in srcs:
            for r in load_dataset(src):
                if r.get("features") and set(FEATURES) <= set(r["features"]) and row_key(r) not in seen:
                    seen.add(row_key(r))
                    out.write(json.dumps(r, ensure_ascii=False) + "\n")
                    added += 1
    return added


def load_dataset(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    return rows


# ---------------------------------------------------------------------------
# 学習
# ---------------------------------------------------------------------------
def _standardize(rows: list[dict]) -> tuple[list[float], list[float]]:
    cols = list(zip(*[[r["features"][k] for k in FEATURES] for r in rows]))
    mean = [statistics.fmean(c) for c in cols]
    std = [statistics.pstdev(c) or 1.0 for c in cols]
    return mean, std


def _logistic(X: list[list[float]], y: list[int], l2: float = 1.0, iters: int = 300, lr: float = 0.5) -> tuple[list[float], float]:
    """L2 正則化つきロジスティック回帰 (勾配降下)。"""
    n, k = len(X), len(X[0])
    w, b = [0.0] * k, 0.0
    for _ in range(iters):
        gw, gb = [0.0] * k, 0.0
        for xi, yi in zip(X, y):
            z = b + sum(a * c for a, c in zip(w, xi))
            p = 1 / (1 + math.exp(-max(-30, min(30, z))))
            d = p - yi
            gb += d
            for j in range(k):
                gw[j] += d * xi[j]
        w = [wj - lr * (gj / n + l2 * wj / n) for wj, gj in zip(w, gw)]
        b -= lr * gb / n
    return w, b


def _auc(scores: list[float], labels: list[int]) -> float:
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        return float("nan")
    wins = sum((p > q) + 0.5 * (p == q) for p in pos for q in neg)
    return wins / (len(pos) * len(neg))


def _age_days(upload_date: str) -> float | None:
    if not upload_date or len(upload_date) != 8:
        return None
    t = time.mktime(time.strptime(upload_date, "%Y%m%d"))
    return max(1.0, (time.time() - t) / 86400)


def train(rows: list[dict], seed: int = 1) -> dict:
    """学習してモデル (辞書) を返す。"""
    from .trends import _solve

    rows = [r for r in rows if r.get("features")]
    pos = [r for r in rows if r.get("label") == 1]
    neg = [r for r in rows if r.get("label") == 0]
    if len(pos) < 10 or len(neg) < 10:
        raise ValueError(f"学習データが足りません (切り抜き {len(pos)} 件・比較用 {len(neg)} 件。各 10 件以上必要)")
    mean, std = _standardize(rows)

    def z(r):
        return [(r["features"][k] - m) / s for k, m, s in zip(FEATURES, mean, std)]

    # A. 切り抜かれやすさ (配信単位で 5 分割し、テスト配信で AUC を測る)
    streams = sorted({r["stream_id"] for r in rows})
    rnd = random.Random(seed)
    rnd.shuffle(streams)
    fold = {s: i % 5 for i, s in enumerate(streams)}
    test_scores, test_labels = [], []
    for k in range(5):
        tr = [r for r in rows if fold[r["stream_id"]] != k]
        te = [r for r in rows if fold[r["stream_id"]] == k]
        if not te or len({r["label"] for r in tr}) < 2:
            continue
        w, b = _logistic([z(r) for r in tr], [r["label"] for r in tr])
        test_scores += [b + sum(a * c for a, c in zip(w, z(r))) for r in te]
        test_labels += [r["label"] for r in te]
    w, b = _logistic([z(r) for r in rows], [r["label"] for r in rows])
    baseline_auc = _auc([r["features"]["score_max"] for r in rows], [r["label"] for r in rows])

    # B. 伸びやすさ
    vrows = [r for r in pos if r.get("views") and _age_days(r.get("upload_date", "")) and r.get("subs")]
    views_model = None
    resid: dict[str, float] = {}
    if len(vrows) >= 15:
        names = ["log10(日数)", "log10(登録者数)", "切り抜きの長さ (分)"] + FEATURES
        X = [[math.log10(_age_days(r["upload_date"])), math.log10(max(1, r["subs"])), r.get("duration", 0) / 60] + z(r)
             for r in vrows]
        y = [math.log10(r["views"]) for r in vrows]
        mx = [statistics.fmean(c) for c in zip(*X)]
        my = statistics.fmean(y)
        Xc = [[v - m for v, m in zip(row, mx)] for row in X]
        yc = [v - my for v in y]
        kdim = len(names)
        xtx = [[sum(r[i] * r[j] for r in Xc) + (1.0 if i == j else 0.0) for j in range(kdim)] for i in range(kdim)]
        xty = [sum(r[i] * v for r, v in zip(Xc, yc)) for i in range(kdim)]
        beta = _solve(xtx, xty)
        views_model = {"names": names, "coef": beta, "n": len(vrows)}
        # 規模・年齢だけで説明した後の残差 (= 内容・作り方による伸び)
        for r, row, v in zip(vrows, Xc, yc):
            resid[r["clip_id"]] = v - (beta[0] * row[0] + beta[1] * row[1])

    # C. 作り方 (伸びた切り抜きの前振り・余韻・長さ)
    good = [r for r in pos if r["clip_id"] in resid and resid[r["clip_id"]] >= statistics.median(resid.values())] \
        if resid else pos

    def med(key, src):
        vals = [r[key] for r in src if r.get(key) is not None and r[key] >= 0]
        return statistics.median(vals) if vals else None

    production = {
        "lead": med("lead", good), "tail": med("tail", good),
        "length": statistics.median([r["end"] - r["start"] for r in good]) if good else None,
        "lead_all": med("lead", pos), "tail_all": med("tail", pos), "n_good": len(good),
    }
    return {
        "version": 1, "created": time.strftime("%Y-%m-%d %H:%M"),
        "n_pos": len(pos), "n_neg": len(neg), "n_streams": len(streams),
        "features": FEATURES, "mean": mean, "std": std,
        "clip": {"w": w, "b": b, "cv_auc": _auc(test_scores, test_labels), "baseline_auc": baseline_auc},
        "views": views_model, "production": production,
    }


def save_model(model: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, indent=1)


def load_model(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------------------
# 使う側
# ---------------------------------------------------------------------------
def clip_probability(model: dict, feats: dict[str, float]) -> float:
    c = model["clip"]
    zs = [(feats.get(k, 0.0) - m) / s for k, m, s in zip(model["features"], model["mean"], model["std"])]
    z = c["b"] + sum(a * v for a, v in zip(c["w"], zs))
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


def rank_highlights(model: dict, analysis: Analysis, messages: Sequence[ChatMessage],
                    duration: float) -> list[tuple[float, Highlight]]:
    """検出した区間を「切り抜かれやすさ」の高い順に並べる。"""
    scored = [(clip_probability(model, window_features(analysis, messages, h.start, h.end, duration)), h)
              for h in analysis.highlights]
    return sorted(scored, key=lambda x: -x[0])


def apply_production(model: dict | None, opts) -> None:
    """学習した前振り・余韻を ClipOptions に反映する (極端な値は丸める)。"""
    if not model or not model.get("production"):
        return
    p = model["production"]
    if p.get("lead") is not None:
        opts.lead = min(40.0, max(4.0, float(p["lead"])))
    if p.get("tail") is not None:
        opts.tail = min(30.0, max(2.0, float(p["tail"])))


def report_text(model: dict) -> str:
    c = model["clip"]
    lines = [f"学習データ: 切り抜かれた区間 {model['n_pos']} 件・比較用 {model['n_neg']} 件・配信 {model['n_streams']} 本",
             f"切り抜かれやすさの予測精度 (AUC, 学習に使っていない配信で測定): {c['cv_auc']:.2f}"
             f"  ※ 盛り上がりスコアだけの場合 {c['baseline_auc']:.2f}。0.5 = 当てずっぽう, 1.0 = 完璧", "",
             "■ 切り抜かれやすい場面の特徴 (係数が大きいほど切り抜かれやすい)"]
    for k, wv in sorted(zip(model["features"], c["w"]), key=lambda x: -abs(x[1]))[:10]:
        lines.append(f"  {'+' if wv > 0 else '−'} {FEATURE_LABEL.get(k, k):<28} {wv:+.2f}")
    v = model.get("views")
    if v:
        lines += ["", f"■ 再生数への影響 (切り抜き {v['n']} 本。日数・登録者数は 10 倍あたり、長さは 1 分あたり、ほかは標準偏差 1 つ分あたりの倍率)"]
        for name, bv in sorted(zip(v["names"], v["coef"]), key=lambda x: -abs(x[1]))[:10]:
            lines.append(f"  {FEATURE_LABEL.get(name, name):<28} ×{10 ** bv:.2f}")
    p = model["production"]
    lines += ["", "■ 伸びた切り抜きの作り方 (中央値)"]
    if p.get("lead") is not None:
        lines.append(f"  前振り: 最初の盛り上がりの {p['lead']:.0f} 秒前から始める")
    if p.get("tail") is not None:
        lines.append(f"  余韻  : 最後の盛り上がりの {p['tail']:.0f} 秒後まで入れる")
    if p.get("length") is not None:
        lines.append(f"  長さ  : {p['length'] / 60:.1f} 分")
    return "\n".join(lines)

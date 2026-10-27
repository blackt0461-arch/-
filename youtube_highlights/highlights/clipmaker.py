"""検出した盛り上がり区間から、字幕・効果音・テロップ付きの切り抜き動画を作る。

流れ (1 本ごと)
  1. 検出区間より広めに元動画をダウンロード (download_section)
  2. 出来事の瞬間を音声で特定 (find_events)
       チャットの反応は、配信の遅延 (2〜20 秒) と入力時間のぶん出来事より遅れ、その遅れは配信ごとに違う。
       そこで、チャットの盛り上がりの山の直前 20 秒の中から「音が急に大きくなった瞬間」
       (配信者の笑い声・叫び声・ツッコミ) を探し、それを出来事の瞬間とする。
  3. 文字起こし: Whisper (faster-whisper) で切り抜きの音声から直接。単語ごとの時刻が取れるので
       字幕がずれない。Whisper が無ければ YouTube の自動字幕で代用。
  4. 区間の決定 (plan_clip): 最初の出来事の lead 秒前 (前振り) 〜 最後の出来事の tail 秒後 (余韻)。
       端は文の切れ目 (字幕の行の境目) に合わせる。lead / tail は学習結果 (model.json) があればそれを使う。
  5. 書き出し (render): 字幕 (ASS) の焼き込み・効果音のミックス・フェード・縦型変換
"""

from __future__ import annotations

import os
import re
import shutil
import struct
import subprocess
import unicodedata
import wave
from collections import Counter
from dataclasses import dataclass, field

from .chat import CATEGORY_WEIGHT, ChatMessage, normalize
from .detect import Highlight
from .fetch import ffmpeg_exe
from .fonts import find_font
from .log import log
from .sfx import CATEGORY_SFX, sfx_path

CATEGORY_TITLE = {
    "laugh": "爆笑シーン",
    "surprise": "まさかの展開",
    "hype": "神展開",
    "cute": "てぇてぇ",
    "applause": "おめでとう",
    "clip": "名場面",
}


@dataclass
class ClipOptions:
    vertical: bool = False         # 縦型 (ショート用 1080x1920)
    captions: bool = True          # 字幕
    sfx: bool = False              # 効果音 (既定: なし。配信の空気を壊さないよう、付けるなら控えめなものだけ)
    pops: bool = False             # 「草」などのリアクション文字 (既定: なし)
    chat: bool = True              # 流れるコメント (実際のチャット)
    title: bool = True             # 上部のタイトルテロップ
    lead: float = 12.0             # 最初の出来事の何秒前から始めるか (前振り)
    tail: float = 6.0              # 最後の出来事の何秒後まで入れるか (余韻)
    min_len: float = 20.0
    max_len: float = 180.0
    sfx_volume: float = 0.7
    custom_title: str = ""
    asr: str = "auto"              # auto (Whisper があれば Whisper) / whisper / youtube / off
    whisper_model: str = "large-v3-turbo"
    refine: bool = True            # 音声で出来事の瞬間を合わせる


@dataclass
class ClipPlan:
    index: int
    start: float                   # 元配信上の秒
    end: float
    title: str
    category: str
    captions: list[tuple[float, float, str]] = field(default_factory=list)   # 元配信上の時刻
    effects: list[tuple[float, str]] = field(default_factory=list)           # (時刻, 効果音の種類)
    pops: list[tuple[float, str]] = field(default_factory=list)              # (時刻, リアクション文字)
    chats: list[tuple[float, str]] = field(default_factory=list)             # (時刻, チャット)
    events: list[float] = field(default_factory=list)                        # 出来事の瞬間
    quote: str = ""                # 出来事の瞬間のセリフ (投稿用タイトルの提案に使う)
    source_title: str = ""
    source_url: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


# ---------------------------------------------------------------------------
# テキスト処理
# ---------------------------------------------------------------------------
_CUSTOM_EMOJI = re.compile(r":[^:\s]{2,40}:")
_BRACKET_TAG = re.compile(r"\[[^\]]*\]|［[^］]*］")


def clean_text(text: str) -> str:
    """字幕に描けない文字 (カラー絵文字・カスタム絵文字) を除く。"""
    text = _CUSTOM_EMOJI.sub("", text)
    out = []
    for ch in text:
        if ord(ch) > 0xFFFF or unicodedata.category(ch) in ("So", "Cs", "Co") or ch in "‍️":
            continue
        out.append(ch)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def caption_lines(transcript: list[tuple[float, str]], max_chars: int = 16,
                  max_dur: float = 3.5, gap: float = 0.8) -> list[tuple[float, float, str]]:
    """自動字幕 (単語ごとの時刻付き) を、表示用の行 (開始, 終了, 文) にまとめる。"""
    lines: list[tuple[float, float, str]] = []
    cur, t0, last = "", None, 0.0
    for t, text in transcript:
        text = clean_text(_BRACKET_TAG.sub("", text)).strip()
        if not text:
            continue
        if t0 is not None and (t - last > gap or len(cur) + len(text) > max_chars or t - t0 > max_dur):
            lines.append((t0, t, cur))
            cur, t0 = "", None
        if t0 is None:
            t0 = t
        sep = " " if cur and cur[-1].isascii() and cur[-1].isalnum() and text[0].isascii() and text[0].isalnum() else ""
        cur += sep + text
        last = t
    if cur and t0 is not None:
        lines.append((t0, last + 1.2, cur))
    # 表示時間を整える (次の行が出るまで、最大 4 秒)
    out = []
    for i, (s, e, txt) in enumerate(lines):
        nxt = lines[i + 1][0] if i + 1 < len(lines) else e
        out.append((s, min(max(e, s + 0.8), nxt if nxt > s else e, s + 4.0), txt))
    return out


def words_to_lines(words: list[tuple[float, float, str]], max_chars: int = 16, max_dur: float = 3.5,
                   gap: float = 0.6) -> list[tuple[float, float, str]]:
    """Whisper の単語 (開始, 終了, 文字) を、表示用の行にまとめる。句点や間 (ま) で改行する。"""
    lines: list[tuple[float, float, str]] = []
    cur, t0, t_end = "", None, 0.0
    for s0, e0, text in words:
        text = clean_text(text)
        if not text:
            continue
        if t0 is not None and (s0 - t_end > gap or len(cur) + len(text) > max_chars or e0 - t0 > max_dur):
            lines.append((t0, t_end, cur))
            cur, t0 = "", None
        if t0 is None:
            t0 = s0
        sep = " " if cur and cur[-1].isascii() and cur[-1].isalnum() and text[0].isascii() and text[0].isalnum() else ""
        cur += sep + text
        t_end = e0
        if cur[-1] in "。！？!?":
            lines.append((t0, t_end, cur))
            cur, t0 = "", None
    if cur and t0 is not None:
        lines.append((t0, t_end, cur))
    out = []
    for i, (s0, e0, txt) in enumerate(lines):
        txt = txt.rstrip("。、")
        if not txt:
            continue
        nxt = lines[i + 1][0] if i + 1 < len(lines) else e0 + 1.0
        out.append((s0, max(e0 + 0.3, s0 + 0.8) if nxt > e0 + 0.3 else max(nxt, s0 + 0.5), txt))
    return out


# ---------------------------------------------------------------------------
# 音声: 出来事の瞬間を探す
# ---------------------------------------------------------------------------
HOP = 0.05  # 音量包絡の時間刻み (秒)


def extract_wav(src: str, out_wav: str, sr: int = 16000) -> str:
    subprocess.run([ffmpeg_exe() or "ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1",
                    "-ar", str(sr), "-c:a", "pcm_s16le", out_wav], check=True)
    return out_wav


def audio_envelope(wav_path: str) -> list[float]:
    """HOP 秒ごとの音量 (dB)。"""
    with wave.open(wav_path, "rb") as w:
        sr, n = w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    step = max(1, int(sr * HOP))
    try:
        import numpy as np
        x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        k = len(x) // step
        if k == 0:
            return []
        rms = np.sqrt((x[: k * step].reshape(k, step) ** 2).mean(axis=1)) + 1e-6
        return [float(v) for v in 20 * np.log10(rms)]
    except ImportError:
        import math
        vals = struct.unpack(f"<{len(raw) // 2}h", raw)
        out = []
        for i in range(0, len(vals) - step + 1, step):
            seg = vals[i : i + step : 4]  # 間引いて計算を軽くする
            ms = sum(v * v for v in seg) / len(seg) / (32768.0 ** 2)
            out.append(10 * math.log10(ms + 1e-12))
        return out


def find_events(env: list[float], section_start: float, peaks: list[float], before: float = 20.0,
                after: float = 3.0, min_prominence: float = 4.0, fallback_shift: float = 3.0) -> list[float]:
    """チャットの山ごとに、出来事の瞬間 (元配信上の秒) を音声から推定する。

    山の before 秒前〜after 秒後の範囲で
        「直後 1 秒の平均音量 − 直前 3 秒の平均音量」
    が最大になる時刻 (= 急に音が大きくなった瞬間) を探す。差が min_prominence dB 未満なら
    音声では決められないので、山の fallback_shift 秒前とする。
    """
    n = len(env)
    w_after, w_before = int(1.0 / HOP), int(3.0 / HOP)
    prefix = [0.0]
    for v in env:
        prefix.append(prefix[-1] + v)

    def mean(i, j):
        i, j = max(0, i), min(n, j)
        return (prefix[j] - prefix[i]) / (j - i) if j > i else -120.0

    events = []
    for p in peaks:
        lo = int((p - before - section_start) / HOP)
        hi = int((p + after - section_start) / HOP)
        best, best_i = -1e9, None
        for i in range(max(w_before, lo), min(n - w_after, hi)):
            score = mean(i, i + w_after) - mean(i - w_before, i)
            if score > best:
                best, best_i = score, i
        if best_i is not None and best >= min_prominence:
            events.append(section_start + best_i * HOP)
        else:
            events.append(p - fallback_shift)
    return events


# ---------------------------------------------------------------------------
# 計画
# ---------------------------------------------------------------------------
def _dominant(messages: list[ChatMessage], t0: float, t1: float) -> tuple[str | None, str | None]:
    """[t0, t1] のチャットで一番多い反応の種類と、一番多かった短いチャット。"""
    cats: Counter[str] = Counter()
    texts: Counter[str] = Counter()
    for m in messages:
        if t0 <= m.time <= t1 and m.reactions:
            for c, v in m.reactions.items():
                cats[c] += CATEGORY_WEIGHT[c] * v
            t = clean_text(normalize(m.text))
            if 0 < len(t) <= 8:
                texts[t] += 1
    cat = cats.most_common(1)[0][0] if cats else None
    text = texts.most_common(1)[0][0] if texts else None
    return cat, text


def _snap_start(t: float, lines: list[tuple[float, float, str]], window: float = 5.0) -> float:
    """t の近く (前後 window 秒) で始まる行のうち、直前に間 (ま) がある行の頭に合わせる。
    行の途中なら、その行の頭に戻す。"""
    for s0, e0, _ in lines:
        if s0 < t < e0 and t - s0 <= window:
            return s0
    cands = [s0 for i, (s0, _e, _) in enumerate(lines)
             if abs(s0 - t) <= window and (i == 0 or s0 - lines[i - 1][1] >= 0.4)]
    return min(cands, key=lambda c: abs(c - t)) if cands else t


def _snap_end(t: float, lines: list[tuple[float, float, str]], window: float = 5.0) -> float:
    """t が行の途中なら、その行の終わりまで延ばす。"""
    for s0, e0, _ in lines:
        if s0 < t < e0 and e0 - t <= window:
            return e0 + 0.3
    return t


def plan_clip(
    index: int,
    h: Highlight,
    messages: list[ChatMessage],
    lines: list[tuple[float, float, str]] | None,
    duration: float,
    opts: ClipOptions,
    chat_delay: float = 8.0,
    events: list[float] | None = None,
    source_title: str = "",
    source_url: str = "",
) -> ClipPlan:
    """区間と、字幕・効果音などの配置を決める。

    lines : 表示用の字幕の行 (元配信上の時刻)。区間の端を文の切れ目に合わせるのにも使う。
    events: 出来事の瞬間 (find_events の結果)。無ければチャットの山の時刻を使う。
    """
    lines = lines or []
    events = sorted(events if events else (h.peaks or [h.peak]))
    start = max(0.0, events[0] - opts.lead)
    end = min(duration, events[-1] + opts.tail)
    if end - start < opts.min_len:          # 短すぎる時は主に前 (前振り) を足す
        need = opts.min_len - (end - start)
        start = max(0.0, start - need * 0.7)
        end = min(duration, end + need * 0.3)
    if end - start > opts.max_len:
        end = start + opts.max_len
    start = max(0.0, _snap_start(start, lines))
    end = min(duration, _snap_end(end, lines))

    cat, _ = _dominant(messages, events[0], events[-1] + chat_delay + 15)
    category = cat or "clip"
    plan = ClipPlan(
        index=index, start=start, end=end, category=category, events=events,
        title=opts.custom_title or CATEGORY_TITLE.get(category, "名場面"),
        source_title=source_title, source_url=source_url,
    )
    if opts.captions:
        plan.captions = [(s0, e0, t) for s0, e0, t in lines if e0 > start and s0 < end]
    # 出来事の直前〜直後に話していたセリフ (一番近い行)
    near = [ln for ln in lines if events[0] - 6 <= ln[1] and ln[0] <= events[0] + 2 and 4 <= len(ln[2]) <= 24]
    if near:
        plan.quote = min(near, key=lambda ln: abs(ln[0] - events[0]))[2]

    if opts.sfx or opts.pops:
        last = -1e9
        for ev in events:
            if not (start + 0.5 <= ev <= end - 1) or ev - last < 6:
                continue
            # 出来事の後に来るチャットの反応から、効果音の種類を決める
            c, text = _dominant(messages, ev, ev + chat_delay + 20)
            if opts.sfx:
                plan.effects.append((max(start, ev - 0.15), CATEGORY_SFX.get(c or category, "pop")))
            if opts.pops and text:
                plan.pops.append((ev, text))
            last = ev
            if len(plan.effects) >= 4:
                break

    if opts.chat:
        per_sec: Counter[int] = Counter()
        for m in messages:
            if start <= m.time <= end - 1 and m.kind == "text":
                t = clean_text(m.text)
                if not t or len(t) > 24 or per_sec[int(m.time)] >= 2:
                    continue
                per_sec[int(m.time)] += 1
                plan.chats.append((m.time, t))
    return plan


# ---------------------------------------------------------------------------
# 字幕ファイル (ASS)
# ---------------------------------------------------------------------------
def _ts(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _esc(text: str) -> str:
    return text.replace("\\", "＼").replace("{", "｛").replace("}", "｝").replace("\n", "\\N")


def build_ass(plan: ClipPlan, font: str, vertical: bool = False) -> str:
    W, H = (1080, 1920) if vertical else (1920, 1080)
    cap_margin = 420 if vertical else 70
    title_align, title_margin = (8, 300) if vertical else (7, 40)
    styles = [
        # 名前, 文字サイズ, 文字色, 縁色, 背景色, 太字, 枠の種類, 縁, 影, 配置, 左右余白, 上下余白
        ("Caption", 70 if vertical else 66, "&H00FFFFFF", "&H00000000", "&H80000000", -1, 1, 5, 1, 2, 60, cap_margin),
        ("Title", 64 if vertical else 50, "&H0000E6FF", "&H00101010", "&HB0000000", -1, 3, 14, 0, title_align, 40, title_margin),
        ("Credit", 30, "&H00FFFFFF", "&H00000000", "&H80000000", 0, 1, 2, 0, 1, 30, 24),
        ("Pop", 150, "&H0000F0FF", "&H001C1CE0", "&H00000000", -1, 1, 9, 3, 5, 0, 0),
        ("Chat", 48, "&H00FFFFFF", "&H00000000", "&H00000000", -1, 1, 3, 0, 7, 0, 0),
    ]
    out = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
    ]
    for name, size, prim, outl, back, bold, bstyle, ow, sh, align, ml, mv in styles:
        out.append(f"Style: {name},{font},{size},{prim},&H000000FF,{outl},{back},{bold},0,0,0,100,100,0,0,"
                   f"{bstyle},{ow},{sh},{align},{ml},{ml},{mv},1")
    out += ["", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]

    def ev(layer, s, e, style, text):
        out.append(f"Dialogue: {layer},{_ts(s)},{_ts(e)},{style},,0,0,0,,{text}")

    dur = plan.duration
    if plan.title:
        ev(2, 0, dur, "Title", "{\\fad(300,0)}" + _esc(plan.title))
    if plan.source_title:
        ev(2, 0, dur, "Credit", _esc("元配信: " + plan.source_title[:40]))
    for s, e, text in plan.captions:
        ev(3, s - plan.start, e - plan.start, "Caption", "{\\fad(60,60)}" + _esc(text))
    px, py = (int(W * 0.5), int(H * 0.36)) if vertical else (int(W * 0.78), int(H * 0.42))
    for t, text in plan.pops:
        rel = t - plan.start
        ev(4, rel, rel + 1.6, "Pop",
           f"{{\\pos({px},{py})\\frz8\\fad(60,300)\\fscx40\\fscy40\\t(0,120,\\fscx125\\fscy125)"
           f"\\t(120,220,\\fscx100\\fscy100)}}" + _esc(text))
    # 流れるコメント: 上部のレーンに、重ならないよう順に割り当てる
    lanes_top = 380 if vertical else 110
    n_lanes = 6 if vertical else 5
    lane_free = [-1e9] * n_lanes
    flow = 6.0
    for t, text in plan.chats:
        rel = t - plan.start
        lane = min(range(n_lanes), key=lambda i: lane_free[i])
        if lane_free[lane] > rel:
            continue  # 混みすぎ
        width = 48 * max(2, len(text))
        lane_free[lane] = rel + flow * (width + 40) / (W + width)
        y = lanes_top + lane * 62
        ev(1, rel, rel + flow, "Chat", f"{{\\move({W},{y},{-width},{y})\\alpha&H20&}}" + _esc(text))
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# ダウンロード・書き出し
# ---------------------------------------------------------------------------
MARGIN = 2.0  # ダウンロード範囲の前後の余白 (秒)


def download_section(url: str, start: float, end: float, out_base: str,
                     source_file: str | None = None, max_height: int = 1080) -> str:
    """元配信の [start - MARGIN, end + MARGIN] を mp4 で保存してパスを返す。"""
    s0 = max(0.0, start - MARGIN)
    out = out_base + ".src.mp4"
    if os.path.exists(out):
        return out
    ff = ffmpeg_exe()
    if not ff:
        raise RuntimeError("ffmpeg が見つかりません (起動.bat から開き直すと自動で入ります)")
    if source_file:
        # 手元の動画ファイルから切り出す
        subprocess.run([ff, "-loglevel", "error", "-y", "-ss", f"{s0:.2f}", "-i", source_file,
                        "-t", f"{end + MARGIN - s0:.2f}", "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "18", "-c:a", "aac", "-b:a", "192k", out], check=True)
        return out
    from .fetch import _yt_dlp
    yt_dlp = _yt_dlp()
    from yt_dlp.utils import download_range_func

    opts = {
        "quiet": True, "no_warnings": True,
        "format": f"bv*[height<={max_height}]+ba/b[height<={max_height}]/b",
        "download_ranges": download_range_func(None, [(s0, end + MARGIN)]),
        "force_keyframes_at_cuts": True,
        "merge_output_format": "mp4",
        "outtmpl": out_base + ".dl.%(ext)s",
        "ffmpeg_location": ff,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    import glob
    files = [f for f in glob.glob(out_base + ".dl.*") if not f.endswith(".part")]
    if not files:
        raise RuntimeError("動画をダウンロードできませんでした")
    os.replace(files[0], out)
    return out


def render(plan: ClipPlan, src: str, out_path: str, opts: ClipOptions, workdir: str,
           se_dir: str | None = None, src_offset: float | None = None) -> str:
    """切り出した元動画 src に字幕・効果音などを付けて out_path に書き出す。

    src_offset: src の 0 秒が元配信の何秒か (既定: plan.start - MARGIN)
    """
    ff = ffmpeg_exe()
    if not ff:
        raise RuntimeError("ffmpeg が見つかりません")
    os.makedirs(workdir, exist_ok=True)
    font = find_font(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    fontdir = os.path.join(workdir, "fonts")
    family = "sans-serif"
    if font:
        os.makedirs(fontdir, exist_ok=True)
        dst = os.path.join(fontdir, os.path.basename(font[0]))
        if not os.path.exists(dst):
            shutil.copyfile(font[0], dst)
        family = font[1]
    else:
        log("※ 日本語フォントが見つかりませんでした。fonts フォルダにフォントを置いてください")
    name = f"clip{plan.index}"
    with open(os.path.join(workdir, name + ".ass"), "w", encoding="utf-8") as f:
        f.write(build_ass(plan, family, opts.vertical))

    offset = (plan.start - max(0.0, plan.start - MARGIN)) if src_offset is None else plan.start - src_offset
    dur = plan.duration
    W, H = (1080, 1920) if opts.vertical else (1920, 1080)
    if opts.vertical:
        v = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=20:2[bg];"
             f"[b]scale={W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2")
    else:
        v = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2"
    v += (f",setsar=1,fps=30,fade=t=in:d=0.3,fade=t=out:st={max(0.0, dur - 0.4):.2f}:d=0.4,"
          f"ass={name}.ass:fontsdir=fonts[v]")
    inputs = ["-ss", f"{offset:.3f}", "-t", f"{dur:.3f}", "-i", os.path.abspath(src)]
    a = f"[0:a]aresample=48000,afade=t=in:d=0.2,afade=t=out:st={max(0.0, dur - 0.5):.2f}:d=0.5[m]"
    mix = ["[m]"]
    for i, (t, kind) in enumerate(plan.effects, 1):
        inputs += ["-i", os.path.abspath(sfx_path(kind, os.path.join(workdir, "se"), se_dir))]
        ms = int(max(0.0, t - plan.start) * 1000)
        a += f";[{i}:a]aresample=48000,adelay={ms}|{ms},volume={opts.sfx_volume}[s{i}]"
        mix.append(f"[s{i}]")
    if len(mix) > 1:
        a += f";{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=first[a]"
    else:
        a = a.replace("[m]", "[a]")
    cmd = [ff, "-loglevel", "error", "-y", *inputs, "-filter_complex", v + ";" + a,
           "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-movflags", "+faststart",
           os.path.abspath(out_path)]
    r = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError("動画の書き出しに失敗しました: " + (r.stderr or "")[-800:])
    return out_path


def compile_clips(paths: list[str], out_path: str) -> str:
    """同じ設定で書き出した切り抜きを 1 本につなぐ (再エンコードなし)。"""
    ff = ffmpeg_exe()
    lst = out_path + ".txt"
    with open(lst, "w", encoding="utf-8") as f:
        for p in paths:
            f.write("file '" + os.path.abspath(p).replace("'", "'\\''") + "'\n")
    try:
        subprocess.run([ff, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                        "-c", "copy", "-movflags", "+faststart", out_path], check=True)
    finally:
        os.remove(lst)
    return out_path


def suggest_title(plan: ClipPlan, streamer: str = "") -> str:
    """投稿用タイトルの提案。

    人気の切り抜き 4,475 本の分析 (チャンネル規模と投稿日数を差し引いた比較) で
    「」のセリフ引用 (×1.20) と 【】内の名前 (コラボ ×1.24) が伸びやすかったので、その形にする。
    """
    from .clips import _clean_channel
    name = _clean_channel(streamer) if streamer else ""
    head = f"「{plan.quote}」" if plan.quote else ""
    tail = f"【{name}/切り抜き】" if name else "【切り抜き】"
    return f"{head}{plan.title}{tail}"


def description_text(plan: ClipPlan, video_id: str, streamer: str = "") -> str:
    """投稿用の説明文 (元配信へのリンク付き)。多くの切り抜きガイドラインで元配信の記載が必須。"""
    from .report import fmt_time
    link = f"https://youtu.be/{video_id}?t={int(plan.start)}" if video_id else plan.source_url
    return (f"{suggest_title(plan, streamer)}\n\n"
            f"▼元配信 ({fmt_time(plan.start)}〜)\n{plan.source_title}\n{link}\n\n"
            "※ 配信者・事務所の切り抜きガイドラインを確認のうえ投稿してください。\n")


# ---------------------------------------------------------------------------
# まとめて作る
# ---------------------------------------------------------------------------
def clip_filename(video_id: str, start: float, vertical: bool) -> str:
    return f"{video_id or 'video'}_{int(start):05d}{'_v' if vertical else ''}.mp4"


def load_transcript(url: str, video_id: str, workdir: str) -> list[tuple[float, str]] | None:
    """元配信の自動字幕 (字幕照合と共通のキャッシュを使う)。"""
    from .fetch import _yt_dlp
    from .transcript import stream_transcript
    with _yt_dlp().YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
        return stream_transcript(ydl, url, video_id, workdir)


def make_clips(
    data,
    highlights: list[Highlight],
    out_dir: str,
    workdir: str,
    opts: ClipOptions,
    *,
    chat_delay: float = 8.0,
    source_file: str | None = None,
    compile_all: bool = True,
    se_dir: str | None = None,
    keep_source: bool = False,
    model: dict | None = None,
) -> list[dict]:
    """highlights それぞれを切り抜き動画にする。Returns: 作ったファイルの情報のリスト。

    model: 学習結果 (learn.train)。あれば前振り・余韻の長さを伸びた切り抜きに合わせる。
    """
    from . import asr
    from .learn import apply_production
    from .report import fmt_time

    if model:
        apply_production(model, opts)
        log(f"学習結果を使用: 前振り {opts.lead:.0f} 秒・余韻 {opts.tail:.0f} 秒")

    os.makedirs(out_dir, exist_ok=True)
    clip_work = os.path.join(workdir, "clipwork")
    os.makedirs(clip_work, exist_ok=True)
    use_whisper = opts.captions and opts.asr in ("auto", "whisper") and asr.available()
    if opts.captions and opts.asr == "whisper" and not use_whisper:
        log("※ 音声認識 (Whisper) が入っていないため、YouTube の自動字幕を使います")
    yt_lines: list[tuple[float, float, str]] = []
    if opts.captions and not use_whisper and opts.asr != "off" and data.video_id:
        transcript = load_transcript(data.url, data.video_id, workdir)
        yt_lines = caption_lines(transcript or [])
        if not transcript:
            log("※ 元配信に自動字幕が無いため、字幕なしで作ります")

    results = []
    total = len(highlights)
    for k, h in enumerate(highlights, 1):
        peaks = sorted(h.peaks or [h.peak])
        # 出来事はチャットの山より最大 20 秒前にありうる。前振りと余白も含めて広めに取る
        rough_start = max(0.0, min(h.time, peaks[0] - 20) - opts.lead - 6)
        rough_end = min(data.duration, max(h.end, peaks[-1]) + opts.tail + 8)
        log(f"[{k}/{total}] {fmt_time(rough_start)}〜{fmt_time(rough_end)} をダウンロード中...")
        base = os.path.join(clip_work, f"{data.video_id or 'video'}_{int(rough_start):05d}_{int(rough_end):05d}")
        src = download_section(data.url, rough_start, rough_end, base, source_file=source_file)
        sec0 = max(0.0, rough_start - MARGIN)
        wav = extract_wav(src, base + ".wav")

        events = list(peaks)
        if opts.refine:
            events = find_events(audio_envelope(wav), sec0, peaks)
            log(f"[{k}/{total}] 出来事の瞬間: " + "、".join(fmt_time(e) for e in events)
                + f" (チャットの山より平均 {sum(p - e for p, e in zip(peaks, events)) / len(peaks):.1f} 秒前)")
        lines = yt_lines
        if use_whisper:
            log(f"[{k}/{total}] 文字起こし中 (Whisper)...")
            try:
                words = asr.transcribe(wav, model=opts.whisper_model)
                lines = words_to_lines([(s0 + sec0, e0 + sec0, t) for s0, e0, t in words])
            except Exception as e:  # 音声認識の失敗で動画づくり全体を止めない
                log(f"※ 音声認識に失敗しました ({str(e)[:200]})。YouTube の自動字幕で代用します")
                use_whisper = False
                if data.video_id and not yt_lines:
                    yt_lines = caption_lines(load_transcript(data.url, data.video_id, workdir) or [])
                lines = yt_lines
        plan = plan_clip(k, h, data.messages, lines, data.duration, opts, chat_delay, events=events,
                         source_title=data.title, source_url=data.url)
        name = clip_filename(data.video_id, plan.start, opts.vertical)
        out = os.path.join(out_dir, name)
        log(f"[{k}/{total}] {fmt_time(plan.start)}〜{fmt_time(plan.end)} を書き出し中...")
        render(plan, src, out, opts, clip_work, se_dir, src_offset=sec0)
        if not keep_source:
            for f in (src, wav):
                try:
                    os.remove(f)
                except OSError:
                    pass
        desc = description_text(plan, data.video_id, getattr(data, "channel", ""))
        with open(out[:-4] + ".txt", "w", encoding="utf-8") as f:
            f.write(desc)
        results.append({"file": name, "start": plan.start, "end": plan.end, "title": plan.title,
                        "suggested_title": suggest_title(plan, getattr(data, "channel", "")),
                        "description": desc, "vertical": opts.vertical, "events": plan.events})
        log(f"[{k}/{total}] 完成: {name}")
    if compile_all and len(results) > 1:
        log("まとめ動画を作成中...")
        name = f"{data.video_id or 'video'}_まとめ{'_v' if opts.vertical else ''}.mp4"
        compile_clips([os.path.join(out_dir, r["file"]) for r in results], os.path.join(out_dir, name))
        results.append({"file": name, "start": results[0]["start"], "end": results[-1]["end"],
                        "title": "まとめ", "description": "", "vertical": opts.vertical, "compiled": True})
    return results

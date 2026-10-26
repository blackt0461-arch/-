"""再生数の多い切り抜き動画の傾向分析 (動画のメタデータから)。

手順
  1. 配信者名で「○○ 切り抜き」を検索し、切り抜きチャンネルを見つける (collect)
  2. 見つかったチャンネルの「動画」「ショート」一覧を、投稿日 (目安) 付きで取得 (collect_channels)
     検索結果は人気順・新着順に偏るので、チャンネルの普段の動画を偏りなく集めるのが目的
  3. 回帰分析 (regress)
       log10(再生数) = チャンネル固有の水準 + b_age × log10(投稿からの日数) + Σ b_k × 特徴_k
     チャンネル内で平均を引いてから (固定効果) 最小二乗法。10^b_k が「その特徴があると何倍か」。
     チャンネル単位のブートストラップで 95% 区間を出す (区間が 1 をまたぐ特徴は「はっきりしない」)。
     投稿 7 日未満の動画は再生数がまだ伸びている途中なので除く。
"""

from __future__ import annotations

import json
import math
import re
import statistics
import time
import unicodedata
from collections import defaultdict
from urllib.parse import quote

from .log import log

SORT_PARAM = {"views": "CAM%253D", "date": "CAI%253D"}

DURATION_BUCKETS = [(0, 61, "〜1分"), (61, 181, "1〜3分"), (181, 361, "3〜6分"), (361, 601, "6〜10分"),
                    (601, 1201, "10〜20分"), (1201, 10 ** 9, "20分〜")]

TITLE_FEATURES = {
    "【】で囲んだ語": lambda t: "【" in t,
    "「」でセリフ引用": lambda t: "「" in t and "」" in t,
    "ｗ / 草": lambda t: bool(re.search(r"[wｗ]{1,}(?![a-zA-Z])|草", t)),
    "！？ / ！ / ？": lambda t: bool(re.search(r"[!！?？]", t)),
    "→ (展開の予告)": lambda t: "→" in t,
    "…/... (含み)": lambda t: "…" in t or "..." in t,
    "まとめ / 総集編": lambda t: bool(re.search(r"まとめ|総集編", t)),
    "手描き / アニメ": lambda t: bool(re.search(r"手描き|手書き|アニメ", t)),
    "英語タイトル": lambda t: sum(c.isascii() and c.isalpha() for c in t) > len(t) * 0.5,
    "数字を含む": lambda t: bool(re.search(r"\d", t)),
    "#ハッシュタグ": lambda t: "#" in t or "＃" in t,
}


def title_flags(title: str) -> dict[str, bool]:
    t = unicodedata.normalize("NFKC", title)
    return {name: bool(fn(title) or fn(t)) for name, fn in TITLE_FEATURES.items()}


def search_clips(ydl, query: str, sort: str = "views", limit: int = 100) -> list[dict]:
    """検索結果 (動画のみ) のメタデータ。"""
    url = f"https://www.youtube.com/results?search_query={quote(query)}&sp={SORT_PARAM[sort]}"
    ydl.params["playlistend"] = limit
    res = ydl.extract_info(url, download=False)
    out = []
    for e in res.get("entries") or []:
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", e.get("id") or ""):
            continue
        if e.get("live_status") in ("was_live", "is_live", "is_upcoming"):
            continue  # 配信アーカイブそのもの
        if not e.get("view_count") or not e.get("duration"):
            continue
        out.append({"id": e["id"], "title": e.get("title") or "", "views": int(e["view_count"]),
                    "duration": float(e["duration"]), "channel": e.get("channel") or "",
                    "channel_id": e.get("channel_id") or "", "query": query, "sort": sort})
    return out


def collect(names: list[str], limit: int = 100, sorts: tuple[str, ...] = ("views", "date"),
            pause: float = 1.0) -> list[dict]:
    """配信者名ごとに「名前 切り抜き」を検索して集める。"""
    from .fetch import _yt_dlp
    rows: dict[str, dict] = {}
    with _yt_dlp().YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True}) as ydl:
        for name in names:
            for sort in sorts:
                q = f"{name} 切り抜き"
                try:
                    found = search_clips(ydl, q, sort, limit)
                except Exception as e:
                    log(f"検索「{q}」に失敗: {e}")
                    continue
                for r in found:
                    r["streamer"] = name
                    rows.setdefault(r["id"], r)
                log(f"「{q}」({'再生数順' if sort == 'views' else '新しい順'}): {len(found)} 本")
                time.sleep(pause)
    return list(rows.values())


def with_relative(rows: list[dict], min_per_channel: int = 3) -> list[dict]:
    by_ch: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_ch[r["channel_id"] or r["channel"]].append(r)
    out = []
    for items in by_ch.values():
        if len(items) < min_per_channel:
            continue
        med = statistics.median(math.log10(r["views"]) for r in items)
        for r in items:
            out.append({**r, "rel": math.log10(r["views"]) - med, "flags": title_flags(r["title"])})
    return out


def _summ(vals: list[float]) -> dict:
    if not vals:
        return {"n": 0}
    return {"n": len(vals), "median_rel": statistics.median(vals), "mean_rel": statistics.fmean(vals),
            "x_median": 10 ** statistics.median(vals)}


def analyze(rows: list[dict]) -> dict:
    """傾向の集計。値は「チャンネル内の中央値の何倍か」(x_median) と相対 log 値。"""
    rel = with_relative(rows)
    result: dict = {"total": len(rows), "used": len(rel),
                    "channels": len({r["channel_id"] or r["channel"] for r in rel})}
    result["duration"] = []
    for lo, hi, label in DURATION_BUCKETS:
        vals = [r["rel"] for r in rel if lo <= r["duration"] < hi]
        result["duration"].append({"label": label, **_summ(vals)})
    result["title"] = []
    for name in TITLE_FEATURES:
        yes = [r["rel"] for r in rel if r["flags"][name]]
        no = [r["rel"] for r in rel if not r["flags"][name]]
        if len(yes) >= 5 and len(no) >= 5:
            result["title"].append({"feature": name, "with": _summ(yes), "without": _summ(no),
                                    "effect": statistics.median(yes) - statistics.median(no)})
    result["title"].sort(key=lambda x: -x["effect"])
    lens = [(len(r["title"]), r["rel"]) for r in rel]
    result["title_length"] = []
    for lo, hi in ((0, 30), (30, 45), (45, 60), (60, 80), (80, 200)):
        vals = [v for n, v in lens if lo <= n < hi]
        result["title_length"].append({"label": f"{lo}〜{hi - 1}文字" if hi < 200 else f"{lo}文字〜", **_summ(vals)})
    # 一番伸びた長さ (中央値が最大のバケツ、サンプル 10 以上)
    good = [d for d in result["duration"] if d.get("n", 0) >= 10]
    result["best_duration"] = max(good, key=lambda d: d["median_rel"])["label"] if good else None
    top = sorted(rel, key=lambda r: -r["rel"])[:15]
    result["top_examples"] = [{"title": r["title"], "views": r["views"], "duration": r["duration"],
                               "channel": r["channel"], "x": round(10 ** r["rel"], 1)} for r in top]
    return result


def to_text(res: dict) -> str:
    lines = [f"切り抜き {res['total']} 本 (うち比較に使えた {res['used']} 本・{res['channels']} チャンネル)", "",
             "■ 動画の長さ別 (チャンネル内の普段の再生数の何倍か・中央値)"]
    for d in res["duration"]:
        if d.get("n"):
            lines.append(f"  {d['label']:<8} ×{d['x_median']:.2f}  (n={d['n']})")
    lines += ["", "■ タイトルの特徴 (あり/なしの中央値の比)"]
    for t in res["title"]:
        lines.append(f"  {t['feature']:<14} ×{10 ** t['effect']:.2f}  (あり n={t['with']['n']}, なし n={t['without']['n']})")
    lines += ["", "■ タイトルの長さ別"]
    for d in res["title_length"]:
        if d.get("n"):
            lines.append(f"  {d['label']:<10} ×{d['x_median']:.2f}  (n={d['n']})")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# チャンネルの動画一覧
# ---------------------------------------------------------------------------
def collect_channels(channel_ids: list[str], limit: int = 100, pause: float = 1.0) -> list[dict]:
    """チャンネルごとに「動画」「ショート」一覧 (新しい順) を取得する。"""
    from .fetch import _yt_dlp
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "playlistend": limit,
            "extractor_args": {"youtubetab": {"approximate_date": [""]}}}
    rows = []
    now = time.time()
    with _yt_dlp().YoutubeDL(opts) as ydl:
        for i, cid in enumerate(channel_ids, 1):
            for tab, kind in (("videos", "video"), ("shorts", "short")):
                try:
                    res = ydl.extract_info(f"https://www.youtube.com/channel/{cid}/{tab}", download=False)
                except Exception:
                    continue  # ショート欄が無いチャンネルなど
                subs = res.get("channel_follower_count")
                n = 0
                for e in res.get("entries") or []:
                    if not e.get("view_count") or not e.get("timestamp"):
                        continue
                    age = max(1.0, (now - e["timestamp"]) / 86400)
                    rows.append({"id": e.get("id"), "channel_id": cid, "channel": res.get("channel") or "",
                                 "subs": subs, "kind": kind, "views": int(e["view_count"]),
                                 "duration": float(e.get("duration") or 0), "title": e.get("title") or "",
                                 "age_days": age})
                    n += 1
                log(f"[{i}/{len(channel_ids)}] {res.get('channel') or cid} の{'動画' if kind == 'video' else 'ショート'}: {n} 本")
                time.sleep(pause)
    return rows


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """連立一次方程式 (ガウスの消去法)。"""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        if abs(m[c][c]) < 1e-12:
            continue
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                if f:
                    m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] if abs(m[i][i]) > 1e-12 else 0.0 for i in range(n)]


def design(row: dict) -> dict[str, float]:
    """回帰に使う説明変数 (基準: 通常動画・10〜20 分)。"""
    x: dict[str, float] = {"log10(日数)": math.log10(row["age_days"])}
    if row["kind"] == "short":
        x["ショート"] = 1.0
    else:
        d = row["duration"]
        for lo, hi, label in DURATION_BUCKETS[1:]:
            if label != "10〜20分" and lo <= d < hi:
                x[f"長さ {label}"] = 1.0
    for k, v in title_flags(row["title"]).items():
        if v:
            x[f"タイトル: {k}"] = 1.0
    groups = re.findall(r"【([^】]*)】", row["title"])
    n_names = len(re.findall(r"[/／]", groups[-1])) if groups else 0
    if n_names >= 3:
        x["タイトル: 【】内に 4 人以上の名前 (コラボ)"] = 1.0
    tl = len(row["title"])
    if tl < 30:
        x["タイトル 30 文字未満"] = 1.0
    elif tl >= 80:
        x["タイトル 80 文字以上"] = 1.0
    return x


def regress(rows: list[dict], min_age: float = 7.0, ridge: float = 1.0, boot: int = 200,
            seed: int = 1) -> dict:
    """チャンネル固定効果つきの回帰。Returns: 係数・倍率・95% 区間・サンプル数。"""
    import random
    rows = [r for r in rows if r["age_days"] >= min_age and r["views"] > 0]
    by_ch: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_ch[r["channel_id"]].append(r)
    by_ch = {k: v for k, v in by_ch.items() if len(v) >= 10}
    feats = sorted({k for v in by_ch.values() for r in v for k in design(r)})
    counts = {f: sum(1 for v in by_ch.values() for r in v if f in design(r)) for f in feats}
    feats = [f for f in feats if counts[f] >= 15]

    k = len(feats)
    # チャンネルごとの (平均を引いた) X'X と X'y を先に計算しておく。ブートストラップはその足し算だけで済む
    stats = {}
    for c, items in by_ch.items():
        X = [[d.get(f, 0.0) for f in feats] for d in (design(r) for r in items)]
        y = [math.log10(r["views"]) for r in items]
        mx = [sum(col) / len(items) for col in zip(*X)]
        my = sum(y) / len(y)
        Xc = [[v - m for v, m in zip(row, mx)] for row in X]
        yc = [v - my for v in y]
        stats[c] = ([[sum(r[i] * r[j] for r in Xc) for j in range(k)] for i in range(k)],
                    [sum(r[i] * v for r, v in zip(Xc, yc)) for i in range(k)])

    def fit(channels: list[str]) -> list[float]:
        xtx = [[ridge if i == j else 0.0 for j in range(k)] for i in range(k)]
        xty = [0.0] * k
        for c in channels:
            a_, b_ = stats[c]
            for i in range(k):
                xty[i] += b_[i]
                row, src = xtx[i], a_[i]
                for j in range(k):
                    row[j] += src[j]
        return _solve(xtx, xty)

    chans = list(by_ch)
    if not chans or not feats:
        return {"n": 0, "channels": 0, "coef": []}
    beta = fit(chans)
    rnd = random.Random(seed)
    samples = [fit([rnd.choice(chans) for _ in chans]) for _ in range(boot)]
    coef = []
    for i, f in enumerate(feats):
        bs = sorted(s[i] for s in samples)
        lo, hi = bs[int(0.025 * len(bs))], bs[int(0.975 * len(bs)) - 1]
        coef.append({"feature": f, "beta": beta[i], "x": 10 ** beta[i], "lo": 10 ** lo, "hi": 10 ** hi,
                     "n": counts[f], "clear": (lo > 0 or hi < 0)})
    return {"n": sum(len(v) for v in by_ch.values()), "channels": len(chans), "coef": coef}


def regress_text(res: dict) -> str:
    lines = [f"動画 {res['n']} 本・{res['channels']} チャンネル (投稿 7 日以上・1 チャンネル 10 本以上)",
             "チャンネルの大きさと投稿からの日数を差し引いた、特徴ごとの再生数の倍率 [95% 区間]",
             "(基準: 10〜20 分の通常動画。★ = 区間が 1 をまたがない = はっきりした差)", ""]
    for c in sorted(res["coef"], key=lambda c: -c["beta"]):
        if c["feature"].startswith("log10"):
            continue
        mark = "★" if c["clear"] else "  "
        lines.append(f"{mark} {c['feature']:<34} ×{c['x']:.2f}  [{c['lo']:.2f}〜{c['hi']:.2f}]  n={c['n']}")
    age = next((c for c in res["coef"] if c["feature"].startswith("log10")), None)
    if age:
        lines.append(f"\n(投稿からの日数が 10 倍になると再生数は ×{age['x']:.2f})")
    return "\n".join(lines)


def save(rows: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

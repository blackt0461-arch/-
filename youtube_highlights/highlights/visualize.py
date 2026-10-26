"""解析結果をブラウザで見られる HTML レポート (グラフ付き) にする。

外部ライブラリ・ネット接続なしで表示できる 1 ファイルの HTML を書き出す。
"""

from __future__ import annotations

import json
import math

from .clips import METHOD_LABEL, STATUS_LABEL, ClipSearchResult
from .detect import REASON_LABEL, Analysis
from .evaluate import Evaluation
from .report import fmt_time


def _round(xs, nd=3):
    return [round(x, nd) for x in xs]


def build_payload(
    analysis: Analysis,
    title: str,
    url: str,
    video_id: str,
    duration: float,
    threshold: float,
    evaluation: Evaluation | None = None,
    search: ClipSearchResult | None = None,
) -> dict:
    hl = []
    # 切り抜き場面が 1 つも無い時は当たり・外れを付けない (全部「外れ」に見えてしまうため)
    results = {id(r.highlight): r for r in evaluation.results} if evaluation and evaluation.scenes else {}
    by_score = sorted(analysis.highlights, key=lambda h: h.score, reverse=True)
    rank = {id(h): i + 1 for i, h in enumerate(by_score)}
    for h in analysis.highlights:
        r = results.get(id(h))
        hl.append({
            "time": h.time, "start": h.start, "end": h.end, "peak": h.peak,
            "score": round(h.score, 2), "label": h.label, "samples": h.samples,
            "reasons": h.reasons, "rank": rank[id(h)],
            "hit": (bool(r.scenes) if r else None),
            "clips": (sum(evaluation.scenes[j].n_clips for j in r.scenes) if r else 0),
        })
    scenes = []
    metrics = None
    if evaluation and evaluation.scenes:
        for sc, cov in zip(evaluation.scenes, evaluation.covered):
            uniq = list({id(c): c for c in sc.clips}.values())
            scenes.append({
                "start": sc.start, "end": sc.end, "n": sc.n_clips, "covered": cov,
                "clips": [{"title": c.title, "url": c.url, "views": c.view_count, "method": c.method}
                          for c in uniq[:8]],
            })
        lift = evaluation.lift
        metrics = {
            "precision": evaluation.precision, "recall": evaluation.recall, "f1": evaluation.f1,
            "lift": None if math.isnan(lift) else lift,
            "baseline": evaluation.baseline_precision,
            "offset": evaluation.median_abs_offset,
            "hits": sum(1 for r in evaluation.results if r.scenes),
            "n": len(evaluation.results), "covered": sum(evaluation.covered),
            "scenes": len(evaluation.scenes), "tolerance": evaluation.tolerance,
            "timePrecision": evaluation.time_precision, "timeRecall": evaluation.time_recall,
        }
    order = ["reaction", "comments", "heatmap", "activity", "audio", "money"]
    comps = [
        {"key": k, "name": REASON_LABEL[k], "values": _round(analysis.components[k], 2)}
        for k in order if k in analysis.components
    ]
    comment_lines = []
    for h in analysis.highlights:
        line = f"{fmt_time(h.time)} {h.label}"
        if h.samples:
            line += "「" + "」「".join(h.samples) + "」"
        comment_lines.append(line)
    search_info = None
    if search is not None and (search.candidates or search.queries):
        cnt = search.counts()
        order = ["located", "unlocated", "no_mention", "older", "length", "fetch_error"]
        search_info = {
            "counts": [{"status": k, "label": STATUS_LABEL[k], "n": cnt[k]} for k in order if cnt.get(k)],
            "diagnosis": search.diagnosis(),
            "queries": [{"q": q, "n": n} for q, n in search.queries],
            "transcript": search.stream_transcript,
            "candidates": [
                {"title": c.title, "url": c.url, "channel": c.channel, "status": c.status,
                 "label": STATUS_LABEL.get(c.status, c.status), "detail": c.detail, "query": c.query}
                for c in sorted(search.candidates, key=lambda c: order.index(c.status) if c.status in order else 99)
            ],
        }
    return {
        "search": search_info,
        "evaluated": evaluation is not None,
        "excluded": [{"title": c.title, "url": c.url, "span": round(sum(e - s0 for s0, e in c.intervals))}
                     for c in (evaluation.excluded if evaluation else [])],
        "methodLabel": METHOD_LABEL,
        "commentText": "\n".join(comment_lines),
        "title": title, "url": url, "videoId": video_id, "duration": duration,
        "bin": analysis.bin_size, "threshold": threshold,
        "score": _round(analysis.score, 3), "components": comps,
        "highlights": hl, "scenes": scenes, "metrics": metrics,
    }


def write_html(path: str, payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    page_title = "ハイライト分析" + (f" - {payload['title'][:40]}" if payload["title"] else "")
    html = TEMPLATE.replace("__DATA__", data).replace("__TITLE__", _esc(page_title))
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


TEMPLATE = r"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6; --series-1-fill: rgba(42,120,214,0.12);
  --series-2: #eb6834;
  --good: #0ca30c; --good-text: #006300; --critical: #d03b3b;
  --badge: #0b0b0b; --badge-ink: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --series-1: #3987e5; --series-1-fill: rgba(57,135,229,0.16);
    --series-2: #d95926;
    --good: #0ca30c; --good-text: #0ca30c; --critical: #d03b3b;
    --badge: #f0efec; --badge-ink: #0b0b0b;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --series-1: #3987e5; --series-1-fill: rgba(57,135,229,0.16);
  --series-2: #d95926;
  --good: #0ca30c; --good-text: #0ca30c; --critical: #d03b3b;
  --badge: #f0efec; --badge-ink: #0b0b0b;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 32px 0 8px; }
a { color: var(--series-1); }
.sub { color: var(--ink-2); margin: 0 0 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }
.tile .k { color: var(--ink-2); font-size: 13px; }
.tile .v { font-size: 30px; font-weight: 600; line-height: 1.2; }
.tile .d { color: var(--muted); font-size: 12px; }
.legend { display: flex; flex-wrap: wrap; gap: 16px; color: var(--ink-2); font-size: 12px; margin: 0 0 8px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 14px; height: 10px; border-radius: 2px; }
.hint { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
svg { display: block; width: 100%; overflow: visible; }
svg text { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.tip { position: fixed; pointer-events: none; background: var(--surface); color: var(--ink);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15); display: none; z-index: 10; max-width: 300px; }
.tip b { font-variant-numeric: tabular-nums; }
.tip .row { display: flex; justify-content: space-between; gap: 16px; }
.tip .row span:first-child { color: var(--ink-2); }
.multi { display: grid; grid-template-columns: 1fr; gap: 4px; }
.multi .name { font-size: 12px; color: var(--ink-2); margin: 6px 0 0; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--grid); vertical-align: top; }
th { color: var(--ink-2); font-weight: 600; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ok { color: var(--good-text); font-weight: 600; white-space: nowrap; }
.ng { color: var(--critical); font-weight: 600; white-space: nowrap; }
.chat { color: var(--ink-2); }
.table-wrap { overflow-x: auto; }
@media (max-width: 640px) { .why { display: none; } }
button { font: inherit; font-size: 12px; color: var(--ink); background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.copy textarea { width: 100%; min-height: 120px; resize: vertical; font: 13px/1.6 ui-monospace, Consolas, "BIZ UDGothic", monospace;
  background: var(--page); color: var(--ink); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.copy .bar { display: flex; justify-content: space-between; align-items: center; margin: 0 0 8px; gap: 8px; }
.copy .bar b { font-size: 14px; }
button.primary { background: var(--series-1); color: #fff; border-color: transparent; padding: 6px 14px; }
#home { display: inline-block; margin: 0 0 12px; font-size: 13px; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0; }
.counts span { background: var(--page); border: 1px solid var(--border); border-radius: 999px; padding: 2px 12px; font-size: 13px; }
.diag { border-left: 3px solid var(--series-2); padding: 4px 0 4px 12px; margin: 0 0 12px; }
.diag p { margin: 2px 0; }
details summary { cursor: pointer; color: var(--ink-2); font-size: 13px; margin: 8px 0; }
.notice { color: var(--ink-2); }
.mk-opts { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; margin: 0 0 12px; font-size: 13px; color: var(--ink-2); }
.mk-opts select, .mk-opts input[type=text] { font: inherit; color: var(--ink); background: var(--page); border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px; }
.mk-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; margin-top: 12px; }
.mk-list .card { padding: 12px; }
.mk-list video { width: 100%; border-radius: 8px; background: #000; max-height: 420px; }
.mk-list .t { font-weight: 600; margin: 6px 0 2px; }
.mk-list .a { display: flex; gap: 12px; font-size: 13px; flex-wrap: wrap; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
</head>
<body>
<main>
  <a id="home" href="/" hidden>← 別の配信を解析する</a>
  <h1 id="title"></h1>
  <p class="sub" id="sub"></p>
  <div id="tiles" class="tiles"></div>

  <div class="card copy" id="copy-card" style="margin-bottom:16px">
    <div class="bar"><b>コメント欄に貼る用</b><button class="primary" id="copy">コピー</button></div>
    <textarea id="copy-text" readonly></textarea>
  </div>

  <div class="card">
    <div class="toolbar">
      <div class="legend" id="legend"></div>
      <button id="reset" hidden>全体を表示</button>
    </div>
    <svg id="main"></svg>
    <p class="hint">グラフ上をドラッグすると拡大、クリックするとその時刻の動画を開きます。</p>
  </div>

  <h2>シグナルごとの内訳</h2>
  <div class="card"><div class="multi" id="multi"></div></div>

  <h2>検出したシーン</h2>
  <div class="card table-wrap"><table id="hl"></table></div>

  <div id="maker" hidden>
    <h2 id="clips">切り抜き動画を作る</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">上の表の「動画」で選んだシーンを、字幕・効果音・テロップ付きの動画にします (1 本あたり数分かかります)。</p>
      <div class="mk-opts">
        <label>形 <select id="mk-vertical"><option value="">横型 (16:9)</option><option value="1">縦型 (ショート 9:16)</option></select></label>
        <label><input type="checkbox" id="mk-captions" checked> 字幕</label>
        <label><input type="checkbox" id="mk-sfx" checked> 効果音・リアクション文字</label>
        <label><input type="checkbox" id="mk-chat" checked> コメントを流す</label>
        <label><input type="checkbox" id="mk-compile" checked> まとめ動画も作る</label>
        <label>タイトル <input type="text" id="mk-title" maxlength="30" placeholder="空欄なら自動"></label>
      </div>
      <button class="primary" id="mk-go">選んだシーンを動画にする</button>
      <div id="mk-progress" class="hint"></div>
      <p class="hint">公開する場合は、配信者・事務所の切り抜きガイドラインに従ってください (元配信へのリンクの記載が必要なことが多いです。説明文の例を動画ごとに用意しています)。</p>
    </div>
    <div id="mk-list" class="mk-list"></div>
  </div>

  <div id="search-sec" hidden>
    <h2>切り抜き検索の内訳</h2>
    <div class="card">
      <div id="diag"></div>
      <div id="counts" class="counts"></div>
      <p class="hint" id="queries"></p>
      <details><summary>候補の一覧を見る</summary><div class="table-wrap"><table id="cands"></table></div></details>
    </div>
  </div>

  <div id="scenes-sec" hidden>
    <h2>実際に切り抜かれた場面</h2>
    <div class="card table-wrap"><table id="sc"></table></div>
  </div>
</main>
<div class="tip" id="tip"></div>
<script>
const D = __DATA__;
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const pct = (v) => (v * 100).toFixed(0) + "%";
function fmt(t) {
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function link(t) {
  if (D.videoId) return `https://youtu.be/${D.videoId}?t=${Math.floor(t)}`;
  if (D.url) return D.url + (D.url.includes("?") ? "&" : "?") + "t=" + Math.floor(t);
  return null;
}
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---- 戻るリンク・コピー ----
if (location.protocol.startsWith("http")) $("home").hidden = false;
if (D.commentText) {
  $("copy-text").value = D.commentText;
  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(D.commentText); }
    catch (e) { $("copy-text").select(); document.execCommand("copy"); }
    $("copy").textContent = "コピーしました ✓";
    setTimeout(() => { $("copy").textContent = "コピー"; }, 2000);
  });
} else {
  $("copy-card").hidden = true;
}

// ---- 見出し・指標 ----
$("title").textContent = D.title || "ハイライト分析";
const subParts = [`長さ ${fmt(D.duration)}`, `検出 ${D.highlights.length} 件`];
if (D.url) subParts.push(`<a href="${esc(D.url)}" target="_blank" rel="noopener">動画を開く</a>`);
$("sub").innerHTML = subParts.join(" ・ ");
if (D.evaluated && !D.metrics) {
  $("tiles").innerHTML = `<div class="card tile" style="grid-column:1/-1"><div class="k">正確性の評価</div>
    <div class="notice">元配信上の位置が分かる切り抜き動画が見つからなかったため、評価できませんでした。下の「切り抜き検索の内訳」で原因を確認できます。</div></div>`;
}
if (D.metrics) {
  const M = D.metrics;
  const tiles = [
    ["適合率", pct(M.precision), `検出 ${M.n} 件中 ${M.hits} 件が切り抜かれていた`],
    ["再現率", pct(M.recall), `切り抜き場面 ${M.scenes} か所中 ${M.covered} か所を検出`],
    ["ランダム比", M.lift == null ? "-" : M.lift.toFixed(1) + " 倍", `ランダムに選んだ場合の適合率 ${pct(M.baseline)}`],
    ["時間の重なり", pct(M.timePrecision), `検出区間のうち切り抜かれた部分の割合 (切り抜き区間の ${pct(M.timeRecall)} をカバー)`],
    ["タイミング誤差", M.offset == null ? "-" : Math.round(M.offset) + " 秒", "当たったシーンの、切り抜き開始とのずれ (中央値)"],
  ];
  $("tiles").innerHTML = tiles.map(([k, v, d]) =>
    `<div class="card tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join("");
}

// ---- 凡例 ----
const legend = [`<span><i class="sw" style="background:var(--series-1)"></i>盛り上がりスコア</span>`,
  `<span><i class="sw" style="background:none;border-top:2px dashed var(--muted);height:0"></i>しきい値</span>`,
  `<span><i class="sw" style="background:var(--badge);border-radius:50%;width:12px;height:12px"></i>検出したシーン (数字はスコア順位)</span>`,
  `<span><i class="sw" style="background:var(--ink-2);opacity:0.2"></i>検出した区間</span>`];
if (D.metrics) {
  legend.push(`<span><i class="sw" style="background:var(--series-2)"></i>実際に切り抜かれた場面 (濃いほど本数が多い)</span>`);
  legend.push(`<span><span class="ok">✓ 当たり</span><span class="ng">✗ 外れ</span></span>`);
}
$("legend").innerHTML = legend.join("");

// ---- 描画 ----
let view = [0, D.duration];
const tip = $("tip");

function axisTicks(t0, t1, px) {
  const span = t1 - t0, target = Math.max(2, Math.floor(px / 90));
  const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  const step = steps.find((s) => span / s <= target) || 7200;
  const out = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return out;
}

function lineChart(svg, values, opts) {
  svg.innerHTML = "";
  const W = svg.clientWidth || svg.parentNode.clientWidth;
  const H = opts.height;
  const padL = 36, padR = 8, padT = opts.padTop || 8;
  const trackH = opts.track ? 22 : 0;
  const padB = (opts.axis ? 22 : 4) + trackH;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("height", H);
  const [t0, t1] = view;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * iw;
  const i0 = Math.max(0, Math.floor(t0 / D.bin)), i1 = Math.min(values.length - 1, Math.ceil(t1 / D.bin));
  let vmax = opts.ymax || 0;
  for (let i = i0; i <= i1; i++) vmax = Math.max(vmax, values[i]);
  vmax = vmax > 0 ? vmax * 1.08 : 1;
  const y = (v) => padT + ih - (v / vmax) * ih;

  // グリッド (y)
  const ystep = vmax > 8 ? 4 : vmax > 4 ? 2 : vmax > 2 ? 1 : 0.5;
  for (let v = 0; v <= vmax; v += ystep) {
    el("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: css(v === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
    if (opts.axis || v > 0) { const t = el("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end" }, svg); t.textContent = v; }
  }
  // 切り抜き場面のトラック
  if (opts.track) {
    const ty = padT + ih + 6;
    const maxN = Math.max(1, ...D.scenes.map((s) => s.n));
    for (const s of D.scenes) {
      if (s.end < t0 || s.start > t1) continue;
      const r = el("rect", { x: x(Math.max(s.start, t0)), y: ty, width: Math.max(2, x(Math.min(s.end, t1)) - x(Math.max(s.start, t0))),
        height: 12, rx: 2, fill: css("--series-2"), "fill-opacity": 0.35 + 0.65 * (s.n / maxN) }, svg);
      r.dataset.scene = D.scenes.indexOf(s);
    }
    const lab = el("text", { x: padL - 6, y: ty + 10, "text-anchor": "end" }, svg); lab.textContent = "切抜";
  }
  // x 軸
  if (opts.axis) {
    for (const t of axisTicks(t0, t1, iw)) {
      const tx = el("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, svg); tx.textContent = fmt(t);
    }
  }
  // しきい値
  if (opts.threshold != null && opts.threshold < vmax) {
    el("line", { x1: padL, x2: W - padR, y1: y(opts.threshold), y2: y(opts.threshold), stroke: css("--muted"), "stroke-dasharray": "4 4", "stroke-width": 1 }, svg);
  }
  // 線 + 面
  let d = "";
  for (let i = i0; i <= i1; i++) d += (i === i0 ? "M" : "L") + x((i + 0.5) * D.bin).toFixed(1) + "," + y(values[i]).toFixed(1);
  if (opts.fill) el("path", { d: d + `L${x((i1 + 0.5) * D.bin)},${y(0)}L${x((i0 + 0.5) * D.bin)},${y(0)}Z`, fill: css("--series-1-fill") }, svg);
  el("path", { d, fill: "none", stroke: css("--series-1"), "stroke-width": opts.fill ? 2 : 1.5, "stroke-linejoin": "round" }, svg);

  // 検出区間 (面) の帯
  if (opts.markers || opts.bands) {
    for (const h of D.highlights) {
      if (h.end < t0 || h.start > t1) continue;
      const a = x(Math.max(h.start, t0)), z = x(Math.min(h.end, t1));
      el("rect", { x: a, y: padT, width: Math.max(2, z - a), height: ih, fill: css("--ink-2"), "fill-opacity": 0.08 }, svg);
    }
  }
  // 検出マーカー
  if (opts.markers) {
    for (const h of D.highlights) {
      if (h.peak < t0 || h.peak > t1) continue;
      const px = x(h.peak + D.bin / 2), py = y(h.score);
      el("circle", { cx: px, cy: py, r: 9, fill: css("--badge"), stroke: css("--surface"), "stroke-width": 2 }, svg);
      const t = el("text", { x: px, y: py + 4, "text-anchor": "middle", style: `fill:${css("--badge-ink")};font-size:10px;font-weight:600` }, svg);
      t.textContent = h.rank;
      if (h.hit !== null) {
        const m = el("text", { x: px, y: py - 13, "text-anchor": "middle", style: `fill:${css(h.hit ? "--good-text" : "--critical")};font-size:13px;font-weight:700` }, svg);
        m.textContent = h.hit ? "✓" : "✗";
      }
    }
  }
  // クロスヘア
  const cross = el("line", { y1: padT, y2: padT + ih, stroke: css("--ink-2"), "stroke-width": 1, visibility: "hidden" }, svg);
  const sel = el("rect", { y: padT, height: ih, fill: css("--series-1"), "fill-opacity": 0.12, visibility: "hidden" }, svg);
  const hit = el("rect", { x: padL, y: 0, width: iw, height: H, fill: "transparent", style: "cursor:crosshair" }, svg);
  const tAt = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = Math.min(Math.max((ev.clientX - r.left) * (W / r.width), padL), W - padR);
    return t0 + ((px - padL) / iw) * (t1 - t0);
  };
  let dragFrom = null;
  hit.addEventListener("pointerdown", (ev) => { dragFrom = tAt(ev); hit.setPointerCapture(ev.pointerId); });
  hit.addEventListener("pointermove", (ev) => {
    const t = tAt(ev);
    cross.setAttribute("x1", x(t)); cross.setAttribute("x2", x(t)); cross.setAttribute("visibility", "visible");
    if (dragFrom != null && Math.abs(x(t) - x(dragFrom)) > 4) {
      sel.setAttribute("x", Math.min(x(t), x(dragFrom))); sel.setAttribute("width", Math.abs(x(t) - x(dragFrom)));
      sel.setAttribute("visibility", "visible");
    }
    showTip(ev, t);
  });
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); tip.style.display = "none"; });
  hit.addEventListener("pointerup", (ev) => {
    const t = tAt(ev);
    if (dragFrom != null && Math.abs(x(t) - x(dragFrom)) > 4) {
      view = [Math.min(t, dragFrom), Math.max(t, dragFrom)];
      if (view[1] - view[0] < 30) view = [Math.max(0, view[0] - 15), Math.min(D.duration, view[1] + 15)];
      renderAll();
    } else if (dragFrom != null) {
      const u = link(t);
      if (u) window.open(u, "_blank", "noopener");
    }
    dragFrom = null;
  });
}

function showTip(ev, t) {
  const i = Math.min(D.score.length - 1, Math.max(0, Math.floor(t / D.bin)));
  let html = `<div class="row"><span>時刻</span><b>${fmt(i * D.bin)}</b></div>`;
  html += `<div class="row"><span>盛り上がりスコア</span><b>${D.score[i].toFixed(2)}</b></div>`;
  for (const c of D.components) html += `<div class="row"><span>${esc(c.name)}</span><b>${c.values[i].toFixed(1)}</b></div>`;
  const h = D.highlights.find((h) => t >= h.time && t <= h.end + D.bin);
  if (h) {
    html += `<hr style="border:0;border-top:1px solid var(--grid);margin:6px 0">`;
    html += `<div><b>#${h.rank} ${esc(h.label)}</b> ${fmt(h.time)}</div>`;
    if (h.samples.length) html += `<div class="chat">「${h.samples.map(esc).join("」「")}」</div>`;
    if (h.hit !== null) html += `<div class="${h.hit ? "ok" : "ng"}">${h.hit ? "✓ 切り抜き " + h.clips + " 本" : "✗ 切り抜きなし"}</div>`;
  }
  const s = D.scenes.find((s) => t >= s.start && t <= s.end);
  if (s) html += `<div style="margin-top:4px">切り抜き場面 ${fmt(s.start)}-${fmt(s.end)}(${s.n} 本)<br><span class="chat">${esc(s.clips[0].title.slice(0, 40))}</span></div>`;
  tip.innerHTML = html;
  tip.style.display = "block";
  const w = tip.offsetWidth, hgt = tip.offsetHeight;
  let lx = ev.clientX + 14, ly = ev.clientY + 14;
  if (lx + w > window.innerWidth - 8) lx = ev.clientX - w - 14;
  if (ly + hgt > window.innerHeight - 8) ly = ev.clientY - hgt - 14;
  tip.style.left = lx + "px"; tip.style.top = ly + "px";
}

function renderAll() {
  lineChart($("main"), D.score, { height: 300, axis: true, fill: true, markers: true, threshold: D.threshold, track: D.scenes.length > 0, padTop: 20 });
  const multi = $("multi");
  multi.innerHTML = "";
  for (const c of D.components) {
    const name = document.createElement("div"); name.className = "name"; name.textContent = c.name; multi.appendChild(name);
    const svg = document.createElementNS(NS, "svg"); multi.appendChild(svg);
    lineChart(svg, c.values, { height: 70, axis: false, bands: true });
  }
  $("reset").hidden = view[0] === 0 && view[1] === D.duration;
}
$("reset").addEventListener("click", () => { view = [0, D.duration]; renderAll(); });
let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 100); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
renderAll();

// ---- 表 ----
{
  const evald = D.metrics != null;
  const app = location.protocol.startsWith("http");
  let h = `<tr>${app ? '<th title="動画にするシーンを選ぶ">動画</th>' : ""}<th>順位</th><th>時刻</th><th>内容</th><th>区間</th><th>スコア</th>${evald ? "<th>判定</th>" : ""}<th class="why">根拠</th><th>代表的なチャット</th></tr>`;
  for (const [i, x] of D.highlights.entries()) {
    const u = link(x.time);
    const ts = u ? `<a href="${u}" target="_blank" rel="noopener">${fmt(x.time)}</a>` : fmt(x.time);
    const judge = evald ? `<td>${x.hit ? `<span class="ok">✓ ${x.clips} 本</span>` : `<span class="ng">✗ なし</span>`}</td>` : "";
    const pick = app ? `<td><input type="checkbox" class="pick" data-i="${i}" ${x.rank <= 3 ? "checked" : ""} aria-label="#${x.rank} を動画にする"></td>` : "";
    h += `<tr>${pick}<td class="num">${x.rank}</td><td class="num">${ts}</td><td>${esc(x.label)}</td><td class="num">${Math.round(x.end - x.start)} 秒</td><td class="num">${x.score.toFixed(2)}</td>${judge}<td class="why">${x.reasons.map(esc).join("、") || "-"}</td><td class="chat">${x.samples.length ? "「" + x.samples.map(esc).join("」「") + "」" : ""}</td></tr>`;
  }
  $("hl").innerHTML = h;
}
// ---- 切り抜き動画 (アプリから開いた時だけ) ----
if (location.protocol.startsWith("http") && D.videoId) {
  $("maker").hidden = false;
  const report = location.pathname.split("/").pop();
  const loadClips = async () => {
    let items = [];
    try { items = await (await fetch("/api/clips?video=" + encodeURIComponent(D.videoId))).json(); } catch (e) { return; }
    $("mk-list").innerHTML = items.map((c) => `<div class="card">
      <video controls preload="metadata" src="/clips/${encodeURIComponent(c.file)}"></video>
      <div class="t">${esc(c.compiled ? "まとめ動画" : c.title)} <span class="chat">${c.compiled ? "" : fmt(c.start) + "〜" + fmt(c.end)}${c.vertical ? "・縦型" : ""}</span></div>
      <div class="a"><a href="/clips/${encodeURIComponent(c.file)}?download=1">ダウンロード</a>
      ${c.description ? `<a href="#" data-desc="${esc(c.description)}" class="copy-desc">説明文をコピー</a>` : ""}<span class="chat">${esc(c.created || "")}</span></div></div>`).join("");
  };
  $("mk-list").addEventListener("click", async (ev) => {
    const a = ev.target.closest(".copy-desc");
    if (!a) return;
    ev.preventDefault();
    try { await navigator.clipboard.writeText(a.dataset.desc); a.textContent = "コピーしました ✓"; } catch (e) { alert(a.dataset.desc); }
  });
  $("mk-go").addEventListener("click", async () => {
    const indices = [...document.querySelectorAll(".pick:checked")].map((c) => +c.dataset.i);
    if (!indices.length) { $("mk-progress").textContent = "表の「動画」でシーンを選んでください"; return; }
    const options = { vertical: !!$("mk-vertical").value, captions: $("mk-captions").checked, sfx: $("mk-sfx").checked,
      chat: $("mk-chat").checked, compile: $("mk-compile").checked && indices.length > 1, clipTitle: $("mk-title").value };
    const r = await fetch("/api/clip", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, indices, options }) });
    const j = await r.json();
    if (!r.ok) { $("mk-progress").textContent = j.error; return; }
    $("mk-go").disabled = true;
    watchJob(j.id);
  });
  const watchJob = (id) => {
    const tick = async () => {
      const j = await (await fetch("/api/job/" + id)).json();
      const last = j.logs.length ? j.logs[j.logs.length - 1] : "";
      $("mk-progress").textContent = `作成中 (${Math.floor(j.elapsed / 60)} 分 ${j.elapsed % 60} 秒): ${last}`;
      if (j.status === "running") return;
      clearInterval(t);
      $("mk-go").disabled = false;
      $("mk-progress").textContent = j.status === "done" ? "完成しました ✓" : "失敗しました: " + j.error;
      loadClips();
    };
    const t = setInterval(tick, 1500);
    tick();
  };
  fetch("/api/info").then((r) => r.json()).then((info) => {
    if (!info.clips) { $("mk-go").disabled = true; $("mk-progress").textContent = "動画の書き出しに必要な ffmpeg がありません。「起動」から開き直してください。"; }
    if (info.current) watchJob(info.current);
  });
  loadClips();
}

if (D.scenes.length) {
  $("scenes-sec").hidden = false;
  const methodName = D.methodLabel;
  let h = `<tr><th>区間</th><th>本数</th><th>検出</th><th>切り抜き動画</th></tr>`;
  for (const s of D.scenes) {
    const u = link(s.start);
    const ts = u ? `<a href="${u}" target="_blank" rel="noopener">${fmt(s.start)}</a>` : fmt(s.start);
    const clips = s.clips.map((c) => (c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)) +
      ` <span class="chat">(${c.views ? c.views.toLocaleString() + " 回再生・" : ""}${methodName[c.method] || ""})</span>`).join("<br>");
    h += `<tr><td class="num">${ts}-${fmt(s.end)}</td><td class="num">${s.n}</td><td>${s.covered ? '<span class="ok">✓ 検出</span>' : '<span class="ng">✗ 見逃し</span>'}</td><td>${clips}</td></tr>`;
  }
  $("sc").innerHTML = h;
}
if (D.excluded && D.excluded.length) {
  $("scenes-sec").hidden = false;
  const p = document.createElement("p");
  p.className = "hint";
  p.innerHTML = `元配信の 10 分以上を使った「まとめ動画」${D.excluded.length} 本は、配信のほぼ全体が当たりになってしまうため評価から外しました: `
    + D.excluded.map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a> (${Math.round(c.span / 60)} 分)`).join("、");
  $("scenes-sec").appendChild(p);
}
if (D.search) {
  const S = D.search;
  $("search-sec").hidden = false;
  if (S.diagnosis.length) $("diag").innerHTML = `<div class="diag"><b>考えられる原因</b>${S.diagnosis.map((d) => `<p>${esc(d)}</p>`).join("")}</div>`;
  $("counts").innerHTML = S.counts.map((c) => `<span>${c.status === "located" ? "✓ " : ""}${esc(c.label)}: <b>${c.n}</b> 本</span>`).join("");
  $("queries").innerHTML = "検索語: " + S.queries.map((q) => `「${esc(q.q)}」${q.n < 0 ? "(失敗)" : q.n + " 件"}`).join("、")
    + (S.transcript === false ? " ・ 元配信に自動字幕なし (字幕照合は使えません)" : S.transcript ? " ・ 字幕照合: 使用" : "");
  let h = `<tr><th>判定</th><th>動画</th><th>チャンネル</th><th>詳細</th></tr>`;
  for (const c of S.candidates) {
    const cls = c.status === "located" ? "ok" : "";
    h += `<tr><td class="${cls}">${esc(c.label)}</td><td><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title || c.url)}</a></td><td>${esc(c.channel)}</td><td class="chat">${esc(c.detail)}</td></tr>`;
  }
  $("cands").innerHTML = h;
}
</script>
</body>
</html>
"""

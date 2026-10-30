"""ブラウザで操作できるローカル Web アプリ。

python app.py で起動すると http://127.0.0.1:8765 がブラウザで開く。
URL を貼って「解析する」を押すと、取得 → 解析 → (切り抜きとの照合) → グラフ付きレポート
までを自動で行い、終わるとレポートのページに移動する。
外部ライブラリ不要 (標準ライブラリの http.server のみ)。自分のパソコンからのみ接続できる。
"""

from __future__ import annotations

import importlib.util
import json
import math
import os
import re
import threading
import time
import uuid
import webbrowser
from dataclasses import asdict, dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote

from .clipmaker import ClipOptions, make_clips
from .detect import Config, Highlight, analyze
from .evaluate import evaluate
from .fetch import ffmpeg_exe, fetch, video_id_from_url
from .learn import load_model, rank_highlights
from .log import set_sink
from .pipeline import data_sources, gather_clips
from .report import fmt_time
from .visualize import build_payload, write_html

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKDIR = os.path.join(BASE, "data")
REPORTS = os.path.join(BASE, "reports")
HISTORY = os.path.join(REPORTS, "history.json")
REPORT_NAME = re.compile(r"^report_[A-Za-z0-9_-]+\.html$")

CLIPS = os.path.join(BASE, "clips")
CLIP_INDEX = os.path.join(CLIPS, "index.json")
CLIP_NAME = re.compile(r"^[\w-]+\.(mp4|txt)$")
SE_DIR = os.path.join(BASE, "se")
MODEL = os.path.join(BASE, "model.json")
LEARN_DATASET = os.path.join(BASE, "learn", "dataset.jsonl")
TRENDS_DIR = os.path.join(BASE, "trends")

STEP_FETCH = "動画の情報・チャット・コメントを取得"
STEP_ANALYZE = "盛り上がりを解析"
STEP_EVAL = "切り抜き動画を検索して照合"
STEP_REPORT = "レポートを作成"
STEP_PREPARE = "準備 (チャット・字幕の読み込み)"
STEP_CLIPS = "切り抜き動画を作成 (ダウンロード・音声解析・字幕)"
STEP_TRENDS = "人気の切り抜きの情報を集めて分析"
STEP_LEARN_DATA = "切り抜きと元配信を調べて学習データを作成"
STEP_TRAIN = "学習"


class UserError(Exception):
    """利用者に見せるエラー。"""


@dataclass
class Job:
    id: str
    url: str
    options: dict
    kind: str = "analyze"              # analyze / clip
    steps: list[str] = field(default_factory=list)
    status: str = "running"            # running / done / error
    step: int = 0
    logs: list[str] = field(default_factory=list)
    started: float = field(default_factory=time.time)
    report: str | None = None
    error: str | None = None
    title: str = ""
    clips: list[dict] = field(default_factory=list)
    report_file: str = ""
    indices: list[int] = field(default_factory=list)
    result_text: str = ""

    def log(self, msg: str) -> None:
        self.logs.append(msg)
        del self.logs[:-200]

    def set_step(self, name: str) -> None:
        self.step = self.steps.index(name)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "status": self.status, "steps": self.steps,
            "stepIndex": len(self.steps) if self.status == "done" else self.step,
            "logs": self.logs[-50:], "elapsed": round(time.time() - self.started),
            "report": self.report, "error": self.error, "title": self.title, "clips": self.clips,
            "resultText": self.result_text,
        }


def _steps_for(kind: str, opts: dict) -> list[str]:
    if kind == "clip":
        return [STEP_PREPARE, STEP_CLIPS]
    if kind == "trends":
        return [STEP_TRENDS]
    if kind == "learn":
        return [STEP_LEARN_DATA, STEP_TRAIN]
    steps = [STEP_FETCH, STEP_ANALYZE]
    if opts.get("evaluate") or opts.get("clipUrls"):
        steps.append(STEP_EVAL)
    steps.append(STEP_REPORT)
    if opts.get("makeClips"):
        steps.append(STEP_CLIPS)
    return steps


_jobs: dict[str, Job] = {}
_current: Job | None = None
_lock = threading.Lock()


def capabilities() -> dict:
    has_ffmpeg = ffmpeg_exe() is not None
    audio = importlib.util.find_spec("numpy") is not None and has_ffmpeg
    ytdlp = importlib.util.find_spec("yt_dlp") is not None
    from . import asr
    return {"audio": audio, "ytdlp": ytdlp, "clips": has_ffmpeg, "whisper": asr.available()}


# ---------------------------------------------------------------------------
# 履歴
# ---------------------------------------------------------------------------
def load_history() -> list[dict]:
    try:
        with open(HISTORY, encoding="utf-8") as f:
            items = json.load(f)
    except (OSError, ValueError):
        return []
    return [h for h in items if os.path.exists(os.path.join(REPORTS, h.get("file", "")))]


def save_history(entry: dict) -> None:
    items = [h for h in load_history() if h.get("file") != entry["file"]]
    items.insert(0, entry)
    os.makedirs(REPORTS, exist_ok=True)
    with open(HISTORY, "w", encoding="utf-8") as f:
        json.dump(items[:100], f, ensure_ascii=False, indent=1)


def load_clip_index() -> list[dict]:
    try:
        with open(CLIP_INDEX, encoding="utf-8") as f:
            items = json.load(f)
    except (OSError, ValueError):
        return []
    return [c for c in items if os.path.exists(os.path.join(CLIPS, c.get("file", "")))]


def save_clips(video_id: str, made: list[dict]) -> None:
    files = {m["file"] for m in made}
    items = [c for c in load_clip_index() if c["file"] not in files]
    stamp = time.strftime("%Y-%m-%d %H:%M")
    items = [{**m, "video": video_id, "created": stamp} for m in made] + items
    os.makedirs(CLIPS, exist_ok=True)
    with open(CLIP_INDEX, "w", encoding="utf-8") as f:
        json.dump(items[:500], f, ensure_ascii=False, indent=1)


def _friendly(e: BaseException) -> str:
    msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e)).replace("ERROR: ", "").strip()  # yt-dlp の色付け文字を除く
    if "ffmpeg is not installed" in msg or "ffmpeg not found" in msg:
        return ("動画の切り出しに必要な ffmpeg が見つかりませんでした。アプリを閉じて「起動」から開き直してください "
                "(自動でインストールされます)。直らない場合は、このフォルダの bin を削除してから開き直してください。")
    if "Private video" in msg or "members-only" in msg or "Join this channel" in msg:
        return "この動画は非公開またはメンバー限定のため取得できません。"
    if "Video unavailable" in msg or "not available" in msg:
        return "動画が見つかりません。URL が正しいか、動画が公開されているか確認してください。"
    if "Sign in to confirm" in msg:
        return ("YouTube に「ボットではないことを確認」を求められました。しばらく時間をおいてから試してください。"
                f"\n(詳細: {msg[:300]})")
    if "is offline" in msg or "will begin" in msg or "This live event" in msg:
        return "配信がまだ終わっていないか、開始前です。アーカイブが公開されてから試してください。"
    if "Unable to download" in msg or "HTTP Error" in msg or "timed out" in msg.lower():
        return f"YouTube への接続に失敗しました。ネット接続を確認してください。\n(詳細: {msg[:300]})"
    return f"エラーが発生しました: {msg[:500]}"


def run_job(job: Job) -> None:
    global _current
    set_sink(job.log)
    try:
        if job.kind == "clip":
            _run_clip(job)
        elif job.kind == "trends":
            _run_trends(job)
        elif job.kind == "learn":
            _run_learn(job)
        else:
            _run_analyze(job)
        job.status = "done"
    except UserError as e:
        job.error, job.status = str(e), "error"
    except SystemExit as e:
        job.error, job.status = str(e) or "処理が中断されました", "error"
    except Exception as e:  # yt-dlp・ffmpeg のエラーなど
        job.error, job.status = _friendly(e), "error"
    finally:
        set_sink(None)
        with _lock:
            _current = None


def _run_analyze(job: Job) -> None:
    opts = job.options
    job.set_step(STEP_FETCH)
    if opts.get("refresh"):
        vid = video_id_from_url(job.url)
        for name in os.listdir(WORKDIR) if os.path.isdir(WORKDIR) else []:
            if vid and name.startswith(vid + "."):
                os.remove(os.path.join(WORKDIR, name))
    data = fetch(job.url, WORKDIR, use_chat=True, max_comments=int(opts.get("maxComments", 500)))
    job.title = data.title
    if not data.duration:
        raise UserError("動画の長さが取得できませんでした。配信が終了してアーカイブになっているか確認してください。")
    sources = data_sources(data)
    if not sources:
        raise UserError("解析に使えるデータがありませんでした (チャットのリプレイ・コメント・再生回数の山のいずれも取得できません)。"
                        "再生回数が少ない動画や、チャットとコメントが無効の動画は解析できません。")
    job.log("使用データ: " + "、".join(sources))

    job.set_step(STEP_ANALYZE)
    top = int(opts["top"]) if opts.get("top") else None
    cfg = Config(top=top)
    result = analyze(data.duration, cfg, messages=data.messages, heatmap=data.heatmap, comments=data.comments)
    job.log(f"{len(result.highlights)} 件のシーンを検出しました")

    ev = found = None
    if STEP_EVAL in job.steps:
        job.set_step(STEP_EVAL)
        extra = [u for u in re.split(r"\s+", opts.get("clipUrls") or "") if u]
        found = gather_clips(
            data, WORKDIR, search=bool(opts.get("evaluate")), max_clips=int(opts.get("maxClips", 20)),
            match_audio=bool(opts.get("matchAudio")), extra_urls=extra,
        )
        ev = evaluate(result.highlights, found.clips, data.duration)
        if ev.scenes:
            job.log(f"切り抜き場面 {len(ev.scenes)} か所と照合: 適合率 {ev.precision:.0%}・再現率 {ev.recall:.0%}")
        else:
            job.log("位置が分かる切り抜き動画が見つかりませんでした")

    job.set_step(STEP_REPORT)
    name = f"report_{data.video_id or uuid.uuid4().hex[:8]}.html"
    payload = build_payload(result, data.title, data.url, data.video_id, data.duration, cfg.threshold, ev, found)
    model = load_model(MODEL)
    if model:
        probs = {id(h): p for p, h in rank_highlights(model, result, data.messages, data.duration)}
        for item, h in zip(payload["highlights"], result.highlights):
            item["prob"] = round(probs[id(h)], 3)
    os.makedirs(REPORTS, exist_ok=True)
    write_html(os.path.join(REPORTS, name), payload)
    # 後から切り抜き動画を作れるよう、検出結果を保存しておく
    with open(os.path.join(REPORTS, name[:-5] + ".json"), "w", encoding="utf-8") as f:
        json.dump({"url": data.url, "video_id": data.video_id, "title": data.title, "duration": data.duration,
                   "chat_delay": cfg.chat_delay, "highlights": [asdict(h) for h in result.highlights]},
                  f, ensure_ascii=False)
    entry = {
        "file": name, "title": data.title, "url": data.url, "channel": data.channel,
        "duration": fmt_time(data.duration), "created": time.strftime("%Y-%m-%d %H:%M"),
        "count": len(result.highlights),
    }
    if ev and ev.scenes:
        entry.update(precision=ev.precision, recall=ev.recall, lift=None if math.isnan(ev.lift) else ev.lift)
    save_history(entry)
    job.report = "/report/" + name

    if STEP_CLIPS in job.steps:
        job.set_step(STEP_CLIPS)
        n = int(opts.get("clipCount") or 3)
        model = load_model(MODEL)
        if model:   # 学習結果があれば「切り抜かれやすさ」の高い順
            chosen = [h for _p, h in rank_highlights(model, result, data.messages, data.duration)[:n]]
        else:
            chosen = sorted(result.highlights, key=lambda h: h.score, reverse=True)[:n]
        chosen.sort(key=lambda h: h.start)
        _make(job, data, chosen, opts, cfg.chat_delay)


def _run_clip(job: Job) -> None:
    job.set_step(STEP_PREPARE)
    path = os.path.join(REPORTS, job.report_file[:-5] + ".json")
    try:
        with open(path, encoding="utf-8") as f:
            saved = json.load(f)
    except (OSError, ValueError):
        raise UserError("このレポートには切り抜き用のデータがありません。もう一度解析してから試してください。")
    highlights = [Highlight(**h) for h in saved["highlights"]]
    chosen = [highlights[i] for i in job.indices if 0 <= i < len(highlights)]
    if not chosen:
        raise UserError("切り抜くシーンが選ばれていません。")
    job.title = saved.get("title", "")
    data = fetch(saved["url"], WORKDIR, use_chat=True, max_comments=0)
    job.report = "/report/" + job.report_file
    job.set_step(STEP_CLIPS)
    _make(job, data, chosen, job.options, saved.get("chat_delay", 8.0))


def _names(opts: dict) -> list[str]:
    names = [n.strip() for n in re.split(r"[\n,、]", opts.get("names") or "") if n.strip()]
    if not names:
        raise UserError("配信者名を 1 人以上入力してください")
    return names[:30]


def _run_trends(job: Job) -> None:
    import collections

    from .trends import analyze as t_analyze
    from .trends import collect, collect_channels, regress, regress_text, save, to_text
    job.set_step(STEP_TRENDS)
    out = TRENDS_DIR
    os.makedirs(out, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M")
    rows = collect(_names(job.options), limit=int(job.options.get("perName") or 100))
    save(rows, os.path.join(out, f"search_{stamp}.json"))
    cnt = collections.Counter(r["channel_id"] for r in rows if r["channel_id"])
    official = {r["channel_id"] for r in rows
                if any(k in r["channel"] for k in ("Ch.", "ch.", "Channel", "公式"))
                and not any(k in r["channel"] for k in ("切り抜き", "切抜", "clip", "Clip"))}
    ids = [c for c, _n in cnt.most_common() if c not in official][: int(job.options.get("channels") or 40)]
    ch_rows = collect_channels(ids)
    save(ch_rows, os.path.join(out, f"channels_{stamp}.json"))
    res = regress(ch_rows)
    with open(os.path.join(out, f"result_{stamp}.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    job.result_text = regress_text(res) + "\n\n----- 参考: 検索結果だけでの集計 (偏りあり) -----\n" + to_text(t_analyze(rows))
    with open(os.path.join(out, f"result_{stamp}.txt"), "w", encoding="utf-8") as f:
        f.write(job.result_text)


def _run_learn(job: Job) -> None:
    from .learn import build_dataset, load_dataset, report_text, save_model, train
    dataset = LEARN_DATASET
    os.makedirs(os.path.dirname(dataset), exist_ok=True)
    job.set_step(STEP_LEARN_DATA)
    if not job.options.get("trainOnly"):
        n = build_dataset(_names(job.options), WORKDIR, dataset, per_name=int(job.options.get("perName") or 40))
        job.log(f"切り抜き {n} 本ぶんのデータを追加しました")
    job.set_step(STEP_TRAIN)
    try:
        model = train(load_dataset(dataset) if os.path.exists(dataset) else [])
    except ValueError as e:
        raise UserError(str(e) + "。配信者を増やして、もう一度「配信から学習」を実行してください。")
    save_model(model, MODEL)
    job.result_text = report_text(model)


def _make(job: Job, data, chosen: list[Highlight], opts: dict, chat_delay: float) -> None:
    if not ffmpeg_exe():
        raise UserError("動画の書き出しに必要な ffmpeg がありません。「起動」から開き直すと自動でインストールされます。")
    copts = ClipOptions(
        vertical=bool(opts.get("vertical")), captions=opts.get("captions", True) is not False,
        sfx=bool(opts.get("sfx", False)), chat=opts.get("chat", True) is not False,
        custom_title=(opts.get("clipTitle") or "").strip()[:30],
    )
    made = make_clips(data, chosen, CLIPS, WORKDIR, copts, chat_delay=chat_delay,
                      compile_all=bool(opts.get("compile", True)), se_dir=SE_DIR, model=load_model(MODEL))
    save_clips(data.video_id, made)
    job.clips = made
    job.log(f"切り抜き動画を {len([m for m in made if not m.get('compiled')])} 本作りました")


def start_job(url: str, options: dict, kind: str = "analyze", report_file: str = "",
              indices: list[int] | None = None) -> Job:
    global _current
    if kind == "clip":
        if not REPORT_NAME.match(report_file or ""):
            raise UserError("レポートが指定されていません")
        url = ""
    elif kind in ("trends", "learn"):
        url = ""
    else:
        vid = video_id_from_url((url or "").strip())
        if not vid:
            raise UserError("YouTube の動画・配信の URL を入力してください (例: https://www.youtube.com/watch?v=...)")
        url = f"https://www.youtube.com/watch?v={vid}"
    with _lock:
        if _current is not None:
            raise UserError("別の処理を実行中です。終わるまでお待ちください。")
        job = Job(id=uuid.uuid4().hex[:12], url=url, options=options, kind=kind,
                  steps=_steps_for(kind, options), report_file=report_file, indices=list(indices or []))
        _jobs[job.id] = job
        _current = job
    threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return job


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "HighlightsApp"

    def log_message(self, fmt, *args):  # アクセスログは出さない
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _send_file(self, fp: str, ctype: str, download_name: str | None = None) -> None:
        """Range 指定に対応したファイル送信 (動画のシーク再生に必要)。"""
        size = os.path.getsize(fp)
        start, end = 0, size - 1
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if download_name:
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(download_name)}")
        self.end_headers()
        with open(fp, "rb") as f:
            f.seek(start)
            left = end - start + 1
            try:
                while left > 0:
                    chunk = f.read(min(1 << 20, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass  # 再生位置を変えた時など、ブラウザが途中で切ることがある

    def do_GET(self):
        path, _, query = self.path.partition("?")
        path = unquote(path)
        params = parse_qs(query)
        if path == "/":
            self._send(200, INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/api/info":
            m = load_model(MODEL)
            summary = None
            if m:
                summary = {"created": m.get("created"), "n_pos": m.get("n_pos"), "n_streams": m.get("n_streams"),
                           "auc": m.get("clip", {}).get("cv_auc"), "production": m.get("production")}
            self._json({**capabilities(), "current": _current.id if _current else None, "model": summary})
        elif path == "/api/history":
            self._json(load_history())
        elif path == "/api/clips":
            vid = (params.get("video") or [""])[0]
            self._json([c for c in load_clip_index() if not vid or c.get("video") == vid])
        elif path.startswith("/api/job/"):
            job = _jobs.get(path.rsplit("/", 1)[-1])
            self._json(job.to_dict() if job else {"error": "not found"}, 200 if job else 404)
        elif path.startswith("/report/"):
            name = path.rsplit("/", 1)[-1]
            fp = os.path.join(REPORTS, name)
            if REPORT_NAME.match(name) and os.path.isfile(fp):
                with open(fp, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            else:
                self._send(404, "レポートが見つかりません".encode("utf-8"), "text/plain; charset=utf-8")
        elif path.startswith("/clips/"):
            name = path.rsplit("/", 1)[-1]
            fp = os.path.join(CLIPS, name)
            if CLIP_NAME.match(name) and os.path.isfile(fp):
                if name.endswith(".txt"):
                    with open(fp, "rb") as f:
                        self._send(200, f.read(), "text/plain; charset=utf-8")
                else:
                    self._send_file(fp, "video/mp4", name if "download" in params else None)
            else:
                self._send(404, b"not found", "text/plain")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        if self.path not in ("/api/analyze", "/api/clip", "/api/trends", "/api/learn"):
            return self._send(404, b"not found", "text/plain")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 100_000)) or b"{}")
            if self.path in ("/api/trends", "/api/learn"):
                job = start_job("", body.get("options") or {}, kind=self.path.rsplit("/", 1)[-1])
            elif self.path == "/api/clip":
                job = start_job("", body.get("options") or {}, kind="clip",
                                report_file=str(body.get("report") or ""),
                                indices=[int(i) for i in body.get("indices") or []])
            else:
                job = start_job(body.get("url", ""), body.get("options") or {})
            self._json({"id": job.id})
        except UserError as e:
            self._json({"error": str(e)}, 400)
        except (ValueError, TypeError):
            self._json({"error": "リクエストが不正です"}, 400)


def serve(port: int = 8765, open_browser: bool = True) -> None:
    for p in range(port, port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            break
        except OSError:
            continue
    else:
        raise SystemExit("空いているポートが見つかりませんでした")
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print("=" * 60)
    print(" 配信ハイライト抽出 を起動しました")
    print(f" ブラウザで {url} を開いてください (自動で開きます)")
    print(" 終了するときは、この画面を閉じてください")
    print("=" * 60)
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


INDEX_HTML = r"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>配信ハイライト抽出</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --border: rgba(11,11,11,0.12); --accent: #2a78d6; --accent-ink: #ffffff;
  --good: #006300; --critical: #d03b3b; --soft: rgba(42,120,214,0.08);
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --border: rgba(255,255,255,0.12); --accent: #3987e5; --accent-ink: #ffffff;
    --good: #0ca30c; --critical: #e66767; --soft: rgba(57,135,229,0.12);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --border: rgba(255,255,255,0.12); --accent: #3987e5; --accent-ink: #ffffff;
  --good: #0ca30c; --critical: #e66767; --soft: rgba(57,135,229,0.12);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 15px/1.7 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; }
h1 { font-size: 26px; margin: 0 0 4px; }
.lead { color: var(--ink-2); margin: 0 0 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin: 0 0 16px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
input[type=url] { flex: 1 1 320px; min-width: 0; font: inherit; font-size: 16px; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--page); color: var(--ink); }
input[type=url]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button { font: inherit; cursor: pointer; border-radius: 10px; }
.go { background: var(--accent); color: var(--accent-ink); border: 0; font-size: 16px; font-weight: 600; padding: 12px 24px; }
.go:disabled { opacity: 0.5; cursor: default; }
label.check { display: flex; gap: 8px; align-items: flex-start; margin: 14px 0 0; cursor: pointer; }
label.check input { margin-top: 6px; width: 16px; height: 16px; }
.note { color: var(--muted); font-size: 13px; }
details { margin: 12px 0 0; }
summary { cursor: pointer; color: var(--ink-2); font-size: 14px; }
.opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 12px 0 0; }
.opts label { font-size: 13px; color: var(--ink-2); display: block; }
textarea { width: 100%; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--page); color: var(--ink); resize: vertical; margin-top: 4px; }
select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--page); color: var(--ink); width: 100%; }
.steps { list-style: none; padding: 0; margin: 8px 0 12px; }
.steps li { display: flex; gap: 10px; align-items: center; padding: 4px 0; color: var(--muted); }
.steps li.done { color: var(--ink-2); }
.steps li.now { color: var(--ink); font-weight: 600; }
.ico { width: 20px; text-align: center; flex: none; }
.spin { width: 14px; height: 14px; border: 2px solid var(--grid); border-top-color: var(--accent); border-radius: 50%;
  display: inline-block; animation: sp 0.8s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
.logs { background: var(--page); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 8px 0 0;
  font: 12px/1.6 ui-monospace, Consolas, monospace; color: var(--ink-2); max-height: 180px; overflow: auto; white-space: pre-wrap; }
.err { border-color: var(--critical); }
.err b { color: var(--critical); }
.hist { list-style: none; padding: 0; margin: 0; }
.hist li { padding: 10px 0; border-bottom: 1px solid var(--grid); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.hist li:last-child { border-bottom: 0; }
.hist a { color: var(--ink); text-decoration: none; font-weight: 600; }
.hist a:hover { color: var(--accent); }
.hist .meta { color: var(--muted); font-size: 12px; }
.badge { font-size: 12px; white-space: nowrap; background: var(--soft); color: var(--ink-2); border-radius: 999px; padding: 2px 10px; }
h2 { font-size: 16px; margin: 0 0 8px; }
.tip-list { margin: 0; padding-left: 20px; color: var(--ink-2); font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>配信ハイライト抽出</h1>
  <p class="lead">YouTube の配信(アーカイブ)の URL を貼り付けて「解析する」を押すと、視聴者の反応から面白かったシーンを見つけます。</p>

  <form class="card" id="form">
    <div class="row">
      <input type="url" id="url" placeholder="https://www.youtube.com/watch?v=..." required autocomplete="off">
      <button class="go" id="go" type="submit">解析する</button>
    </div>
    <label class="check"><input type="checkbox" id="evaluate" checked>
      <span>実際の切り抜き動画と照合して、正確性を測る<br><span class="note">切り抜き動画を検索するので、1〜3 分ほど長くかかります</span></span></label>
    <label class="check"><input type="checkbox" id="makeClips">
      <span>切り抜き動画も作る (字幕・コメント付き)<br><span class="note" id="clipNote">スコア上位のシーンをダウンロードして動画にします。1 本あたり数分かかります</span></span></label>
    <div id="clipOpts" class="opts" style="margin:6px 0 0 24px" hidden>
      <div><label for="clipCount">本数</label>
        <select id="clipCount"><option>1</option><option selected>3</option><option>5</option><option>10</option></select></div>
      <div><label for="vertical">形</label>
        <select id="vertical"><option value="">横型 (16:9)</option><option value="1">縦型 (ショート 9:16)</option></select></div>
    </div>
    <div id="clipBox" style="margin:10px 0 0 24px">
      <label for="clipUrls" class="note">知っている切り抜き動画の URL (任意・複数なら改行で区切る)。検索で見つからなくても直接調べます</label>
      <textarea id="clipUrls" rows="2" placeholder="https://www.youtube.com/watch?v=..."></textarea>
    </div>
    <details>
      <summary>詳細設定</summary>
      <div class="opts">
        <div><label for="top">見つけるシーンの数</label>
          <select id="top"><option value="">自動 (10 分に 1 件くらい)</option><option>5</option><option>10</option><option>15</option><option>20</option><option>30</option></select></div>
        <div><label for="comments">読み込むコメント数</label>
          <select id="comments"><option value="0">読まない (速い)</option><option value="200">200 件</option><option value="500" selected>500 件 (標準)</option><option value="1000">1000 件 (遅い)</option></select></div>
        <div><label for="clips">調べる切り抜き候補数</label>
          <select id="clips"><option value="10">少なめ (速い)</option><option value="20" selected>標準</option><option value="40">多め (遅い)</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="matchAudio">
        <span>音声照合も使う <span class="note" id="audioNote">(概要欄に時刻が書かれていない切り抜きも、音声で位置を特定します。かなり時間がかかります)</span></span></label>
      <label class="check"><input type="checkbox" id="refresh">
        <span>保存済みのデータを使わず、取得し直す</span></label>
    </details>
  </form>

  <div class="card" id="progress" hidden>
    <h2 id="ptitle">解析中...</h2>
    <ul class="steps" id="steps"></ul>
    <div class="note" id="elapsed"></div>
    <div class="logs" id="logs"></div>
  </div>

  <div class="card err" id="error" hidden>
    <b>うまくいきませんでした</b>
    <p id="errmsg" style="white-space:pre-wrap;margin:8px 0"></p>
    <ul class="tip-list">
      <li>URL が正しいか、動画が公開されているか確認してください</li>
      <li>配信直後はチャットのリプレイが準備中のことがあります。少し時間をおいてください</li>
      <li>直らない場合は、このアプリを一度閉じて「起動」から開き直してください (取得ツールが最新版に更新されます)</li>
    </ul>
  </div>

  <details class="card" id="learnCard">
    <summary style="font-size:15px;color:var(--ink)"><b>学習・分析</b> <span class="note" id="modelState"></span></summary>
    <p class="note">人気の切り抜き動画を調べて、どんな切り抜きが伸びるかを分析・学習します。学習結果は自動切り抜きに使われます
      (場面の選び方・前振りと余韻の長さ)。</p>
    <label class="note" for="names">配信者名 (1 行に 1 人。多いほど正確ですが時間がかかります)</label>
    <textarea id="names" rows="4" placeholder="兎田ぺこら&#10;宝鐘マリン&#10;葛葉"></textarea>
    <div class="row" style="margin-top:10px">
      <button class="go" type="button" id="trendsGo" style="font-size:14px;padding:8px 16px">傾向を分析 (速い)</button>
      <button class="go" type="button" id="learnGo" style="font-size:14px;padding:8px 16px">配信から学習 (時間がかかる)</button>
    </div>
    <p class="note">「傾向を分析」: 切り抜きの長さ・タイトルと再生数の関係 (数分)。<br>
      「配信から学習」: 切り抜かれた場面の元配信のチャットなどを調べ、切り抜かれやすい場面と伸びる作り方を学習 (1 人あたり数十分)。</p>
    <pre id="learnResult" class="logs" hidden style="max-height:none"></pre>
  </details>

  <div class="card" id="histCard" hidden>
    <h2>これまでの結果</h2>
    <ul class="hist" id="hist"></ul>
  </div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let timer = null;

async function init() {
  const info = await (await fetch("/api/info")).json();
  if (!info.audio) {
    $("matchAudio").disabled = true;
    $("audioNote").textContent = "(使うには「起動」から開き直して、追加の部品をインストールしてください)";
  }
  if (!info.clips) {
    $("makeClips").disabled = true;
    $("clipNote").textContent = "動画の書き出しに必要な ffmpeg がありません。「起動」から開き直すと自動でインストールされます";
  }
  if (!info.ytdlp) showError("yt-dlp がインストールされていません。「起動」から開き直してください。");
  if (info.current) watch(info.current);
  if (info.model) {
    const p = info.model.production || {};
    $("modelState").textContent = `学習済み (${info.model.created}・切り抜き ${info.model.n_pos} 本・配信 ${info.model.n_streams} 本`
      + (p.lead != null ? `・前振り ${Math.round(p.lead)} 秒・余韻 ${Math.round(p.tail)} 秒` : "") + ")";
  } else {
    $("modelState").textContent = "(未学習)";
  }
  loadHistory();
}

async function loadHistory() {
  const items = await (await fetch("/api/history")).json();
  $("histCard").hidden = items.length === 0;
  $("hist").innerHTML = items.map((h) => {
    const acc = h.precision != null ? `<span class="badge">適合率 ${Math.round(h.precision * 100)}%・再現率 ${Math.round(h.recall * 100)}%</span>`
                                    : `<span class="badge">${h.count} 件</span>`;
    return `<li><div><a href="/report/${esc(h.file)}">${esc(h.title || h.file)}</a>
      <div class="meta">${esc(h.channel || "")}${h.channel ? " ・ " : ""}長さ ${esc(h.duration)} ・ ${esc(h.created)}</div></div>${acc}</li>`;
  }).join("");
}

function showError(msg) {
  $("error").hidden = false;
  $("errmsg").textContent = msg;
}

$("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("error").hidden = true;
  const options = {
    evaluate: $("evaluate").checked, matchAudio: $("matchAudio").checked, refresh: $("refresh").checked,
    top: $("top").value, maxComments: $("comments").value, maxClips: $("clips").value,
    clipUrls: $("evaluate").checked ? $("clipUrls").value : "",
    makeClips: $("makeClips").checked, clipCount: $("clipCount").value, vertical: !!$("vertical").value,
  };
  $("go").disabled = true;
  try {
    const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: $("url").value, options }) });
    const j = await r.json();
    if (!r.ok) { showError(j.error); $("go").disabled = false; return; }
    watch(j.id);
  } catch (e) {
    showError("アプリに接続できません。黒い画面 (アプリ本体) が閉じていないか確認してください。");
    $("go").disabled = false;
  }
});

function watch(id) {
  $("go").disabled = true;
  $("progress").hidden = false;
  clearInterval(timer);
  const tick = async () => {
    let j;
    try { j = await (await fetch("/api/job/" + id)).json(); }
    catch (e) { clearInterval(timer); showError("アプリとの接続が切れました。黒い画面が閉じていないか確認してください。"); return; }
    $("ptitle").textContent = j.title ? `解析中: ${j.title}` : "解析中...";
    $("steps").innerHTML = j.steps.map((s, i) => {
      const st = i < j.stepIndex || j.status === "done" ? "done" : i === j.stepIndex && j.status === "running" ? "now" : "";
      const ico = st === "done" ? "✓" : st === "now" ? '<span class="spin"></span>' : "○";
      return `<li class="${st}"><span class="ico">${ico}</span>${esc(s)}</li>`;
    }).join("");
    const m = Math.floor(j.elapsed / 60), s = j.elapsed % 60;
    $("elapsed").textContent = `経過時間 ${m ? m + " 分 " : ""}${s} 秒`;
    $("logs").textContent = j.logs.join("\n");
    $("logs").scrollTop = $("logs").scrollHeight;
    if (j.status === "done" && !j.report) {
      clearInterval(timer);
      $("progress").hidden = true;
      $("go").disabled = false;
      $("learnCard").open = true;
      $("learnResult").hidden = false;
      $("learnResult").textContent = j.resultText;
      init();
      return;
    }
    if (j.status === "done") {
      clearInterval(timer);
      $("ptitle").textContent = "完了しました。結果を表示します...";
      location.href = j.report + (j.clips && j.clips.length ? "#clips" : "");
    } else if (j.status === "error") {
      clearInterval(timer);
      $("progress").hidden = true;
      $("go").disabled = false;
      showError(j.error);
    }
  };
  tick();
  timer = setInterval(tick, 1000);
}

async function startLearn(kind) {
  $("error").hidden = true;
  const r = await fetch("/api/" + kind, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options: { names: $("names").value } }) });
  const j = await r.json();
  if (!r.ok) { showError(j.error); return; }
  watch(j.id);
}
$("trendsGo").addEventListener("click", () => startLearn("trends"));
$("learnGo").addEventListener("click", () => startLearn("learn"));
$("evaluate").addEventListener("change", () => { $("clipBox").hidden = !$("evaluate").checked; });
$("makeClips").addEventListener("change", () => { $("clipOpts").hidden = !$("makeClips").checked; });
init();
</script>
</body>
</html>
"""

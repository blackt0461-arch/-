import json
import os
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from threading import Thread

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import highlights.webapp as w  # noqa: E402
from highlights.chat import parse_live_chat_lines  # noqa: E402
from highlights.clips import Candidate, Clip, ClipSearchResult  # noqa: E402
from highlights.fetch import VideoData  # noqa: E402
from test_highlights import DURATION, synth_chat  # noqa: E402


def fake_fetch(url, workdir, use_chat=True, max_comments=500, use_audio=False):
    if "zzzzzzzzzzz" in url:
        raise Exception("ERROR: [youtube] zzzzzzzzzzz: Video unavailable")
    return VideoData(url=url, video_id="abcDEF12345", title="テスト配信", duration=DURATION,
                     messages=parse_live_chat_lines(synth_chat()))


def fake_gather(data, workdir, **kw):
    return ClipSearchResult(clips=[Clip("a", "切り抜き", "https://youtu.be/a", intervals=[(595, 660)])],
                            candidates=[Candidate("a", "切り抜き", "https://youtu.be/a", status="located")])


MADE = []


def fake_make(data, highlights, out_dir, workdir, opts, **kw):
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for h in highlights:
        name = f"{data.video_id}_{int(h.start):05d}{'_v' if opts.vertical else ''}.mp4"
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(bytes(range(256)) * 40)
        out.append({"file": name, "start": h.start, "end": h.end, "title": "爆笑シーン", "description": "説明",
                    "vertical": opts.vertical})
    MADE.append((len(highlights), opts))
    return out


class WebAppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.saved = (w.WORKDIR, w.REPORTS, w.HISTORY, w.fetch, w.gather_clips, w.CLIPS, w.CLIP_INDEX, w.make_clips, w.ffmpeg_exe)
        w.CLIPS = os.path.join(cls.tmp.name, "clips")
        w.CLIP_INDEX = os.path.join(w.CLIPS, "index.json")
        w.make_clips = fake_make
        w.ffmpeg_exe = lambda: "ffmpeg"
        w.WORKDIR = os.path.join(cls.tmp.name, "data")
        w.REPORTS = os.path.join(cls.tmp.name, "reports")
        w.HISTORY = os.path.join(w.REPORTS, "history.json")
        w.fetch, w.gather_clips = fake_fetch, fake_gather
        cls.server = w.ThreadingHTTPServer(("127.0.0.1", 0), w.Handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        (w.WORKDIR, w.REPORTS, w.HISTORY, w.fetch, w.gather_clips, w.CLIPS, w.CLIP_INDEX, w.make_clips,
         w.ffmpeg_exe) = cls.saved
        cls.tmp.cleanup()

    def post(self, url, options=None):
        req = urllib.request.Request(self.base + "/api/analyze", method="POST",
                                     data=json.dumps({"url": url, "options": options or {}}).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return r.read().decode("utf-8")

    def wait(self, job_id):
        for _ in range(100):
            j = json.loads(self.get("/api/job/" + job_id))
            if j["status"] != "running":
                return j
            time.sleep(0.1)
        self.fail("job did not finish")

    def test_flow(self):
        self.assertIn("配信ハイライト抽出", self.get("/"))
        code, j = self.post("https://example.com/x")
        self.assertEqual(code, 400)

        code, j = self.post("https://youtu.be/zzzzzzzzzzz")
        self.assertEqual(code, 200)
        j = self.wait(j["id"])
        self.assertEqual(j["status"], "error")
        self.assertIn("見つかりません", j["error"])

        code, j = self.post("https://www.youtube.com/watch?v=abcDEF12345", {"evaluate": True, "top": "4"})
        j = self.wait(j["id"])
        self.assertEqual(j["status"], "done", j)
        page = self.get(j["report"])
        self.assertIn('"metrics": {', page)
        hist = json.loads(self.get("/api/history"))
        self.assertEqual(hist[0]["file"], "report_abcDEF12345.html")
        self.assertEqual(hist[0]["count"], 4)

    def test_clip_flow(self):
        code, j = self.post("https://www.youtube.com/watch?v=abcDEF12345",
                            {"makeClips": True, "clipCount": "2", "vertical": True, "top": "4"})
        j = self.wait(j["id"])
        self.assertEqual(j["status"], "done", j)
        self.assertEqual(len(j["clips"]), 2)
        self.assertTrue(MADE[-1][1].vertical)
        # レポートから後で 1 本だけ作る
        req = urllib.request.Request(self.base + "/api/clip", method="POST",
                                     data=json.dumps({"report": "report_abcDEF12345.html", "indices": [0],
                                                      "options": {"sfx": False}}).encode())
        with urllib.request.urlopen(req) as r:
            jid = json.load(r)["id"]
        j = self.wait(jid)
        self.assertEqual(j["status"], "done", j)
        self.assertFalse(MADE[-1][1].sfx)
        clips = json.loads(self.get("/api/clips?video=abcDEF12345"))
        self.assertGreaterEqual(len(clips), 2)
        # Range 付きの動画配信
        req = urllib.request.Request(self.base + "/clips/" + clips[0]["file"], headers={"Range": "bytes=100-199"})
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.status, 206)
            self.assertEqual(r.read(), (bytes(range(256)) * 40)[100:200])

    def test_clip_errors(self):
        req = urllib.request.Request(self.base + "/api/clip", method="POST",
                                     data=json.dumps({"report": "../x.html", "indices": [0]}).encode())
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code, 400)

    def test_learn_and_trends_jobs(self):
        import highlights.trends as tr
        from test_learn import synth_rows
        saved = (w.LEARN_DATASET, w.TRENDS_DIR, w.MODEL, tr.collect, tr.collect_channels)
        w.LEARN_DATASET = os.path.join(self.tmp.name, "learn", "dataset.jsonl")
        w.TRENDS_DIR = os.path.join(self.tmp.name, "trends")
        w.MODEL = os.path.join(self.tmp.name, "model.json")
        try:
            os.makedirs(os.path.dirname(w.LEARN_DATASET))
            with open(w.LEARN_DATASET, "w", encoding="utf-8") as f:
                for r in synth_rows():
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")

            def post(path, options):
                req = urllib.request.Request(self.base + path, method="POST",
                                             data=json.dumps({"options": options}).encode())
                try:
                    with urllib.request.urlopen(req) as r:
                        return json.load(r)
                except urllib.error.HTTPError as e:
                    return json.load(e)

            j = self.wait(post("/api/learn", {"trainOnly": True})["id"])
            self.assertEqual(j["status"], "done", j)
            self.assertIn("前振り", j["resultText"])
            info = json.loads(self.get("/api/info"))
            self.assertEqual(info["model"]["n_pos"], 90)
            # 学習結果があると、検出したシーンに「切り抜かれやすさ」が付く
            code, a = self.post("https://www.youtube.com/watch?v=abcDEF12345", {"top": "4"})
            a = self.wait(a["id"])
            self.assertIn('"prob":', self.get(a["report"]))

            tr.collect = lambda names, limit=100: [
                {"id": f"v{i}", "title": "t", "views": 100 + i, "duration": 300, "channel": "c",
                 "channel_id": "UCx", "query": "", "sort": "views", "streamer": names[0]} for i in range(5)]
            tr.collect_channels = lambda ids, limit=100: [
                {"id": f"v{i}", "channel_id": "UCx", "channel": "c", "subs": 1, "kind": "video",
                 "views": 1000 + i * 10, "duration": 100 if i % 2 else 900, "title": "t", "age_days": 30 + i}
                for i in range(40)]
            j = self.wait(post("/api/trends", {"names": "テスト"})["id"])
            self.assertEqual(j["status"], "done", j)
            self.assertIn("倍率", j["resultText"])
            self.assertIn("配信者名", post("/api/trends", {"names": ""}).get("error", "") or
                          self.wait(post("/api/trends", {"names": ""})["id"])["error"])
        finally:
            (w.LEARN_DATASET, w.TRENDS_DIR, w.MODEL, tr.collect, tr.collect_channels) = saved

    def test_report_path_is_restricted(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.get("/report/..%2Fhistory.json")


if __name__ == "__main__":
    unittest.main()

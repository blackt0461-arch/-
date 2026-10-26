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
from highlights.clips import Clip  # noqa: E402
from highlights.fetch import VideoData  # noqa: E402
from test_highlights import DURATION, synth_chat  # noqa: E402


def fake_fetch(url, workdir, use_chat=True, max_comments=500, use_audio=False):
    if "zzzzzzzzzzz" in url:
        raise Exception("ERROR: [youtube] zzzzzzzzzzz: Video unavailable")
    return VideoData(url=url, video_id="abcDEF12345", title="テスト配信", duration=DURATION,
                     messages=parse_live_chat_lines(synth_chat()))


def fake_gather(data, workdir, **kw):
    return [Clip("a", "切り抜き", "https://youtu.be/a", intervals=[(595, 660)])], 3


class WebAppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.saved = (w.WORKDIR, w.REPORTS, w.HISTORY, w.fetch, w.gather_clips)
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
        w.WORKDIR, w.REPORTS, w.HISTORY, w.fetch, w.gather_clips = cls.saved
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

    def test_report_path_is_restricted(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.get("/report/..%2Fhistory.json")


if __name__ == "__main__":
    unittest.main()

import io
import json
import os
import random
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import highlights.fetch as fetch_mod  # noqa: E402
from highlights.clips import collect_clips, search_queries, _clean_channel  # noqa: E402

SID = "STREAMid001"
KANA = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだでどばびぶべぼ"
rnd = random.Random(7)
WORDS = ["".join(rnd.choice(KANA) for _ in range(rnd.randint(2, 4))) for _ in range(300)]


def transcript(sec, seed, start=0.0):
    r = random.Random(seed)
    out, t = [], start
    while t < start + sec:
        out.append((t, " ".join(r.choice(WORDS) for _ in range(r.randint(1, 4)))))
        t += r.uniform(0.8, 2.5)
    return out


STREAM_TR = transcript(3600, 1)


def json3(segs):
    return json.dumps({"events": [{"tStartMs": int(t * 1000), "segs": [{"utf8": s}]} for t, s in segs]}).encode()


def piece(a, b):
    return [(t - a, s) for t, s in STREAM_TR if a <= t < b]


CAPTIONS = {SID: STREAM_TR, "clipBtrans1": piece(1000, 1040), "clipGnomen1": piece(2500, 2530),
            "clipDother1": transcript(60, 99)}

VIDEOS = {
    SID: {"description": "", "duration": 3600, "upload_date": "20260101"},
    "clipAlink01": {"description": f"元配信 https://youtu.be/{SID}?t=600", "duration": 60},
    "clipBtrans1": {"description": f"元配信 https://www.youtube.com/live/{SID}", "duration": 40},
    "clipCnocap1": {"description": f"元配信 https://youtu.be/{SID}", "duration": 30},
    "clipDother1": {"description": "別の配信の切り抜き", "duration": 60},
    "clipEolder1": {"description": f"https://youtu.be/{SID}?t=100", "duration": 60, "upload_date": "20251231"},
    "clipFerror1": None,
    "clipGnomen1": {"description": "ここすき", "duration": 30},
}


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeYDL:
    def __init__(self, opts):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def extract_info(self, url, download=False):
        if url.startswith("ytsearch") or "/results?search_query=" in url:
            ids = [v for v in VIDEOS if v != SID] + [SID, "UCchannelxxxxxxxxx"]
            return {"entries": [{"id": v, "url": f"https://www.youtube.com/watch?v={v}", "title": v,
                                 "duration": (VIDEOS.get(v) or {}).get("duration")} for v in ids]}
        vid = url.rsplit("=", 1)[-1]
        v = VIDEOS.get(vid)
        if v is None:
            raise Exception("ERROR: [youtube] Sign in to confirm you're not a bot")
        info = {"id": vid, "title": f"切り抜き {vid}", "webpage_url": url, "channel": "clipper",
                "description": v["description"], "duration": v["duration"],
                "upload_date": v.get("upload_date", "20260105"), "view_count": 100, "language": "ja"}
        if vid in CAPTIONS:
            info["automatic_captions"] = {"ja-orig": [{"ext": "json3", "url": "fake://" + vid}]}
        return info

    def urlopen(self, url):
        return FakeResponse(json3(CAPTIONS[url.split("://")[1]]))


class FakeYtDlp:
    YoutubeDL = FakeYDL


class CollectClipsTest(unittest.TestCase):
    def setUp(self):
        self.saved = fetch_mod._yt_dlp
        fetch_mod._yt_dlp = lambda: FakeYtDlp
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        fetch_mod._yt_dlp = self.saved
        self.tmp.cleanup()

    def test_statuses(self):
        res = collect_clips(SID, "雑談", "Test Ch. テスト", 3600, "20260101", self.tmp.name, max_clips=10)
        st = {c.video_id: (c.status, c.detail) for c in res.candidates}
        self.assertEqual(st["clipAlink01"], ("located", "概要欄の時刻リンク"))
        self.assertEqual(st["clipBtrans1"], ("located", "字幕照合"))
        self.assertEqual(st["clipGnomen1"], ("located", "字幕照合"))   # リンクが無くても字幕で一致
        self.assertEqual(st["clipCnocap1"], ("unlocated", "切り抜きに字幕が無い"))
        self.assertEqual(st["clipDother1"][0], "no_mention")
        self.assertEqual(st["clipEolder1"][0], "older")
        self.assertEqual(st["clipFerror1"][0], "fetch_error")
        self.assertNotIn("UCchannelxxxxxxxxx", st)          # チャンネルなど動画以外は除外
        self.assertNotIn(SID, st)
        located = {c.video_id: c.intervals for c in res.clips}
        self.assertAlmostEqual(located["clipBtrans1"][0][0], 1000, delta=3)
        self.assertAlmostEqual(located["clipGnomen1"][0][0], 2500, delta=3)
        self.assertTrue(res.stream_transcript)
        self.assertTrue(any("時刻が書かれていない" in d for d in res.diagnosis()))

    def test_manual_url(self):
        res = collect_clips(SID, "雑談", "", 3600, "20260101", self.tmp.name, max_clips=0,
                            extra_urls=["https://youtu.be/clipBtrans1"])
        self.assertEqual([c.video_id for c in res.clips], ["clipBtrans1"])

    def test_queries(self):
        self.assertEqual(_clean_channel("Pekora Ch. 兎田ぺこら"), "Pekora 兎田ぺこら")
        self.assertEqual(_clean_channel("名前 / ホロライブ"), "名前")
        qs = search_queries(SID, "【雑談】まったり #vtuber", "名前チャンネル")
        self.assertIn(("名前 切り抜き", "date"), qs)
        self.assertIn(("まったり 切り抜き", "relevance"), qs)


if __name__ == "__main__":
    unittest.main()

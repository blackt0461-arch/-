import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from highlights.chat import parse_live_chat_lines  # noqa: E402
from highlights.cli import main  # noqa: E402
from highlights.clips import Clip, intervals_from_times, load_truth_file, locate_from_text, parse_t  # noqa: E402
from highlights.detect import Config, Highlight, analyze  # noqa: E402
from highlights.evaluate import build_scenes, evaluate  # noqa: E402
from highlights.visualize import build_payload, write_html  # noqa: E402
from test_highlights import DURATION, EVENTS, synth_chat  # noqa: E402

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

SID = "abcDEF12345"


def hl(t, end=None, score=5.0):
    return Highlight(time=t, peak=t + 10, start=t + 10, end=end or t + 40, score=score,
                     label="😂 爆笑", reasons=[], samples=[])


class DescriptionTest(unittest.TestCase):
    def test_parse_t(self):
        self.assertEqual(parse_t("1234"), 1234)
        self.assertEqual(parse_t("1234s"), 1234)
        self.assertEqual(parse_t("1h2m3s"), 3723)
        self.assertEqual(parse_t("5m"), 300)
        self.assertIsNone(parse_t(""))

    def test_link_with_t(self):
        text = f"元配信はこちら\nhttps://youtu.be/{SID}?t=3723\n#切り抜き"
        self.assertEqual(locate_from_text(text, SID, 7200), ([3723.0], "link"))
        text = f"https://www.youtube.com/watch?v={SID}&t=1h0m5s"
        self.assertEqual(locate_from_text(text, SID, 7200), ([3605.0], "link"))
        text = f"https://www.youtube.com/live/{SID}?si=xx&t=600"
        self.assertEqual(locate_from_text(text, SID, 7200), ([600.0], "link"))

    def test_description_timestamp(self):
        text = f"元配信 (1:02:03~)\nhttps://youtu.be/{SID}\n0:00 オープニング"
        self.assertEqual(locate_from_text(text, SID, 7200), ([3723.0], "description"))

    def test_other_video_ignored(self):
        text = "元配信 https://youtu.be/zzzzzzzzzzz?t=100"
        times, _ = locate_from_text(text, SID, 7200)
        self.assertEqual(times, [])  # 別の動画へのリンクの時刻は使わない…が「元配信」行の時刻表記も無い

    def test_out_of_range(self):
        self.assertEqual(locate_from_text(f"youtu.be/{SID}?t=99999", SID, 7200)[0], [])

    def test_intervals(self):
        self.assertEqual(intervals_from_times([100.0], 60, 7200), [(100.0, 160.0)])
        self.assertEqual(intervals_from_times([100.0], 600, 7200), [(100.0, 220.0)])


class MetricsTest(unittest.TestCase):
    def test_scenes_merge(self):
        clips = [Clip("a", "A", "", intervals=[(100, 150)]), Clip("b", "B", "", intervals=[(160, 200)]),
                 Clip("c", "C", "", intervals=[(1000, 1030)])]
        scenes = build_scenes(clips)
        self.assertEqual([(s.start, s.end, s.n_clips) for s in scenes], [(100, 200, 2), (1000, 1030, 1)])

    def test_metrics(self):
        clips = [Clip("a", "A", "", intervals=[(100, 150)]), Clip("b", "B", "", intervals=[(1000, 1030)]),
                 Clip("c", "C", "", intervals=[(2000, 2030)])]
        highlights = [hl(90, score=9), hl(990, score=3), hl(3000, score=5)]
        ev = evaluate(highlights, clips, 3600, tolerance=30)
        self.assertAlmostEqual(ev.precision, 2 / 3)
        self.assertAlmostEqual(ev.recall, 2 / 3)
        self.assertEqual([bool(r.scenes) for r in ev.results], [True, True, False])
        self.assertEqual(ev.precision_at[3], 2 / 3)
        self.assertGreater(ev.lift, 1.0)
        self.assertLess(ev.baseline_precision, 0.2)
        self.assertEqual(ev.median_abs_offset, 10)

    def test_no_clips(self):
        ev = evaluate([hl(100)], [], 3600)
        self.assertEqual(ev.precision, 0.0)
        self.assertEqual(ev.scenes, [])

    def test_truth_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write("# 正解\n10:00,10:40,転ぶ\n1500\n0:40:00, ,\n")
        try:
            clips = load_truth_file(f.name, 3600)
        finally:
            os.remove(f.name)
        self.assertEqual([c.intervals[0] for c in clips], [(600, 640), (1500, 1530), (2400, 2430)])

    def test_end_to_end_with_truth(self):
        """合成配信: 仕込んだ出来事 = 切り抜かれた場面 とすると、全部当たるはず。"""
        messages = parse_live_chat_lines(synth_chat())
        result = analyze(DURATION, Config(top=4), messages=messages)
        clips = [Clip(str(t), str(t), "", intervals=[(t - 5, t + 40)]) for t, _ in EVENTS]
        clips.append(Clip("x", "見逃し", "", intervals=[(1800, 1830)]))
        ev = evaluate(result.highlights, clips, DURATION)
        self.assertEqual(ev.precision, 1.0)
        self.assertEqual(ev.recall, 4 / 5)


class ReportTest(unittest.TestCase):
    def test_html_and_cli(self):
        with tempfile.TemporaryDirectory() as d:
            chat = os.path.join(d, "c.live_chat.json")
            with open(chat, "w", encoding="utf-8") as f:
                f.write("\n".join(synth_chat()))
            truth = os.path.join(d, "truth.csv")
            with open(truth, "w", encoding="utf-8") as f:
                f.write("10:00,10:40\n25:00,25:30\n")
            html = os.path.join(d, "r.html")
            out = os.path.join(d, "out.txt")
            stdout = sys.stdout
            try:
                with open(out, "w", encoding="utf-8") as sys.stdout:
                    main(["--chat-file", chat, "--duration", str(DURATION), "-n", "4",
                          "--truth", truth, "--html", html, "--no-open"])
            finally:
                sys.stdout = stdout
            with open(out, encoding="utf-8") as f:
                text = f.read()
            self.assertIn("適合率 : 50%", text)
            self.assertIn("再現率 : 100%", text)
            with open(html, encoding="utf-8") as f:
                page = f.read()
            self.assertIn('"metrics": {', page)
            self.assertNotIn("__DATA__", page)

    def test_payload_without_eval(self):
        result = analyze(DURATION, Config(top=4), messages=parse_live_chat_lines(synth_chat()))
        p = build_payload(result, "t", "", "", DURATION, 1.5)
        self.assertIsNone(p["metrics"])
        self.assertEqual(len(p["score"]), len(result.score))
        with tempfile.TemporaryDirectory() as d:
            write_html(os.path.join(d, "x.html"), p)


@unittest.skipIf(np is None, "numpy が無い")
class AudioMatchTest(unittest.TestCase):
    SR = 8000

    def speechlike(self, sec, seed):
        rng = np.random.default_rng(seed)
        out, t = [], 0.0
        while t < sec:
            d = rng.uniform(0.08, 0.4)
            n = int(d * self.SR)
            tt = np.arange(n) / self.SR
            if rng.random() < 0.2:
                out.append(rng.normal(0, 0.003, n))
            else:
                s = sum(np.sin(2 * np.pi * f * tt) * rng.uniform(0.2, 1) for f in rng.uniform(300, 3500, 3))
                s = (s + rng.normal(0, 0.05, n)) * np.hanning(n) * rng.uniform(0.2, 1)
                out.append(s)
            t += d
        return np.concatenate(out)[: int(sec * self.SR)].astype(np.float32)

    def test_locates_edited_clip(self):
        from highlights.audiomatch import features, match_clip

        sr = self.SR
        stream = self.speechlike(900, 1)
        sf = features(stream)
        # 2 場面をつなぎ、音量を半分にし、BGM とノイズを重ねた「切り抜き」
        seg = np.concatenate([stream[200 * sr: 230 * sr], stream[600 * sr: 625 * sr]])
        tt = np.arange(seg.size) / sr
        bgm = 0.15 * (np.sin(2 * np.pi * 440 * tt) + np.sin(2 * np.pi * 659 * tt))
        clip = 0.5 * seg + bgm + np.random.default_rng(5).normal(0, 0.02, seg.size)
        got = match_clip(sf, features(clip))
        self.assertEqual(len(got), 2, got)
        self.assertAlmostEqual(got[0][0], 200, delta=1)
        self.assertAlmostEqual(got[1][0], 600, delta=1)
        # 無関係な音声は一致しない
        self.assertEqual(match_clip(sf, features(self.speechlike(60, 99))), [])


if __name__ == "__main__":
    unittest.main()

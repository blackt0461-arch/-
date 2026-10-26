import os
import struct
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from highlights.chat import ChatMessage, classify  # noqa: E402
from highlights.clipmaker import (  # noqa: E402
    ClipOptions, ClipPlan, audio_envelope, build_ass, caption_lines, clean_text, description_text, find_events,
    plan_clip, words_to_lines,
)
from highlights.detect import Highlight  # noqa: E402
from highlights.fonts import font_family  # noqa: E402
from highlights.sfx import KINDS, sfx_path  # noqa: E402


def msgs():
    out = []
    for i in range(300):
        t = 40 + i * 0.4
        txt = "なるほど"
        if 70 <= t <= 85:
            txt = ["草", "wwww", "草"][i % 3]
        elif 95 <= t <= 100:
            txt = "えぇ!?"
        out.append(ChatMessage(t, f"u{i}", txt, reactions=classify(txt)))
    return out


TRANSCRIPT = [(30 + i * 0.5, w) for i, w in enumerate(["今日は", "みんなで", "ゲームを", "やって", "いきます"] * 50)]


class TextTest(unittest.TestCase):
    def test_clean(self):
        self.assertEqual(clean_text("草😂:_kusa:ｗ"), "草ｗ")
        self.assertEqual(clean_text("  a   b "), "a b")

    def test_caption_lines(self):
        lines = caption_lines([(0, "今日は"), (0.4, "いい"), (0.8, "天気"), (3.0, "ですね"), (3.3, "[音楽]")])
        self.assertEqual([t for _s, _e, t in lines], ["今日はいい天気", "ですね"])
        self.assertLessEqual(lines[0][1], 3.0)          # 次の行が出る前に消える
        self.assertEqual(caption_lines([(0, "hello"), (0.3, "world")])[0][2], "hello world")

    def test_long_line_split(self):
        tr = [(i * 0.3, "あいう") for i in range(10)]
        self.assertTrue(all(len(t) <= 16 for _s, _e, t in caption_lines(tr)))


class PlanTest(unittest.TestCase):
    LINES = caption_lines(TRANSCRIPT)

    def test_plan(self):
        h = Highlight(time=60, peak=68, start=63, end=100, score=8, label="", reasons=[], samples=[], peaks=[68, 92])
        plan = plan_clip(1, h, msgs(), self.LINES, 180, ClipOptions(lead=10, tail=5, sfx=True), events=[66, 90])
        self.assertLessEqual(plan.start, 56.5)          # 最初の出来事の 10 秒前 (行の頭に合わせる)
        self.assertGreaterEqual(plan.end, 95)           # 最後の出来事の 5 秒後
        self.assertEqual(plan.category, "laugh")
        self.assertEqual([round(t) for t, _k in plan.effects], [66, 90])   # 効果音は出来事の瞬間
        self.assertTrue(plan.captions)
        for s0, e0, _t in self.LINES:                   # 字幕の行の途中で始まらない
            self.assertFalse(s0 < plan.start < e0 - 0.01, (s0, e0, plan.start))

    def test_defaults_keep_the_mood(self):
        """既定では「草」などのリアクション文字・効果音は付けず、実際のコメントは流す。"""
        h = Highlight(time=60, peak=68, start=63, end=100, score=8, label="", reasons=[], samples=[], peaks=[68])
        plan = plan_clip(1, h, msgs(), self.LINES, 180, ClipOptions())
        self.assertEqual(plan.pops, [])
        self.assertEqual(plan.effects, [])
        self.assertTrue(plan.chats)

    def test_min_length(self):
        h = Highlight(time=60, peak=62, start=60, end=65, score=8, label="", reasons=[], samples=[], peaks=[62])
        plan = plan_clip(1, h, [], None, 180, ClipOptions(min_len=30))
        self.assertGreaterEqual(plan.duration, 29.99)
        self.assertEqual(plan.category, "clip")

    def test_options_off(self):
        h = Highlight(time=60, peak=68, start=63, end=100, score=8, label="", reasons=[], samples=[], peaks=[68])
        plan = plan_clip(1, h, msgs(), self.LINES, 180, ClipOptions(captions=False, sfx=False, chat=False))
        self.assertEqual((plan.captions, plan.effects, plan.pops, plan.chats), ([], [], [], []))


class EventTest(unittest.TestCase):
    def test_find_event_before_chat_peak(self):
        # 0.05 秒刻み・60 秒の音量。100+22 = 122 秒で急に大きくなる (笑い声)。チャットの山は 135 秒
        env = [-40.0] * 1200
        for i in range(440, 520):
            env[i] = -12.0
        ev = find_events(env, 100.0, [135.0])
        self.assertAlmostEqual(ev[0], 122.0, delta=0.2)

    def test_fallback_without_clear_onset(self):
        ev = find_events([-30.0] * 1200, 100.0, [135.0])
        self.assertEqual(ev, [132.0])

    def test_envelope(self):
        import math
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.wav")
            with wave.open(p, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(16000)
                frames = b"".join(struct.pack("<h", int((0.5 if i >= 16000 else 0.01) * 32767 * math.sin(i / 5)))
                                  for i in range(32000))
                w.writeframes(frames)
            env = audio_envelope(p)
            self.assertEqual(len(env), 40)
            self.assertGreater(env[30] - env[5], 25)


class WordsTest(unittest.TestCase):
    def test_words_to_lines(self):
        words = [(0.0, 0.3, "今日は"), (0.3, 0.6, "いい"), (0.6, 0.9, "天気"), (0.9, 1.2, "ですね。"),
                 (2.5, 2.8, "そう"), (2.8, 3.1, "だね")]
        lines = words_to_lines(words)
        self.assertEqual([t for _s, _e, t in lines], ["今日はいい天気ですね", "そうだね"])
        self.assertAlmostEqual(lines[0][0], 0.0)
        self.assertLessEqual(lines[0][1], 2.5)

    def test_hallucination_filter(self):
        from highlights.asr import HALLUCINATIONS
        self.assertTrue(HALLUCINATIONS.search("ご視聴ありがとうございました"))
        self.assertFalse(HALLUCINATIONS.search("ありがとう"))


class AssTest(unittest.TestCase):
    def test_ass(self):
        plan = ClipPlan(index=1, start=100, end=130, title="爆笑{シーン}", category="laugh",
                        captions=[(101, 103, "こんにちは")], pops=[(110, "草")],
                        chats=[(100.5 + i * 0.1, f"コメント{i}") for i in range(40)], source_title="配信")
        text = build_ass(plan, "Test Font")
        self.assertIn("PlayResX: 1920", text)
        self.assertIn("Style: Caption,Test Font,", text)
        self.assertIn("0:00:01.00,0:00:03.00,Caption", text)   # 切り抜き先頭からの相対時刻
        self.assertIn("爆笑｛シーン｝", text)                    # ASS の制御文字は全角に
        self.assertLess(text.count(",Chat,"), 40)               # 混みすぎるコメントは間引く
        self.assertIn("PlayResY: 1920", build_ass(plan, "F", vertical=True))

    def test_description(self):
        plan = ClipPlan(index=1, start=3723, end=3800, title="爆笑シーン", category="laugh", source_title="配信")
        self.assertIn("https://youtu.be/abcDEF12345?t=3723", description_text(plan, "abcDEF12345"))


class TitleTest(unittest.TestCase):
    def test_quote_and_title(self):
        from highlights.clipmaker import suggest_title
        lines = [(55.0, 57.0, "今日はゲームします"), (64.0, 66.5, "嘘でしょなんで落ちるの"), (70.0, 72.0, "もう一回")]
        h = Highlight(time=60, peak=68, start=63, end=80, score=8, label="", reasons=[], samples=[], peaks=[68])
        plan = plan_clip(1, h, msgs(), lines, 180, ClipOptions(), events=[66.0])
        self.assertEqual(plan.quote, "嘘でしょなんで落ちるの")
        self.assertEqual(suggest_title(plan, "Pekora Ch. 兎田ぺこら"), "「嘘でしょなんで落ちるの」爆笑シーン【Pekora 兎田ぺこら/切り抜き】")


class SfxFontTest(unittest.TestCase):
    def test_sfx(self):
        with tempfile.TemporaryDirectory() as d:
            for k in KINDS:
                with wave.open(sfx_path(k, d)) as w:
                    self.assertEqual(w.getframerate(), 44100)
                    self.assertGreater(w.getnframes(), 1000)
            user = os.path.join(d, "se")
            os.makedirs(user)
            open(os.path.join(user, "don.mp3"), "wb").close()
            self.assertEqual(sfx_path("don", d, user), os.path.join(user, "don.mp3"))

    def test_font_family(self):
        # 最小の TTF (name テーブルだけ) を作って読めるか
        name = "Test Gothic".encode("utf-16-be")
        name_table = struct.pack(">HHH", 0, 1, 6 + 12) + struct.pack(">HHHHHH", 3, 1, 0x409, 1, len(name), 0) + name
        head = struct.pack(">IHHHH", 0x00010000, 1, 0, 0, 0)
        rec = b"name" + struct.pack(">III", 0, 12 + 16, len(name_table))
        with tempfile.NamedTemporaryFile(suffix=".ttf", delete=False) as f:
            f.write(head + rec + name_table)
        try:
            self.assertEqual(font_family(f.name), "Test Gothic")
        finally:
            os.remove(f.name)


class RenderTest(unittest.TestCase):
    """実際に ffmpeg で書き出す (ffmpeg が無い環境ではスキップ)。"""

    def test_render(self):
        import subprocess

        from highlights.clipmaker import compile_clips, render
        from highlights.fetch import ffmpeg_exe
        ff = ffmpeg_exe()
        if not ff:
            self.skipTest("ffmpeg が無い")
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "src.mp4")
            subprocess.run([ff, "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30",
                            "-f", "lavfi", "-i", "sine=frequency=300", "-t", "8", "-c:v", "libx264",
                            "-preset", "ultrafast", "-c:a", "aac", src], check=True)
            plan = ClipPlan(index=1, start=102, end=105, title="テスト", category="laugh",
                            captions=[(102.5, 104, "こんにちは")], effects=[(103, "don")], pops=[(103, "草")],
                            chats=[(102.2, "コメント")], source_title="配信")
            outs = []
            for vertical in (False, True):
                out = os.path.join(d, f"out{int(vertical)}.mp4")
                render(plan, src, out, ClipOptions(vertical=vertical), os.path.join(d, "work"))
                outs.append(out)
                probe = subprocess.run([ff, "-i", out], capture_output=True, text=True).stderr
                self.assertIn("1080x1920" if vertical else "1920x1080", probe)
                self.assertIn("Duration: 00:00:03", probe)
            compile_clips([outs[0], outs[0]], os.path.join(d, "all.mp4"))
            probe = subprocess.run([ff, "-i", os.path.join(d, "all.mp4")], capture_output=True, text=True).stderr
            self.assertIn("Duration: 00:00:06", probe)


if __name__ == "__main__":
    unittest.main()


class FfmpegPathTest(unittest.TestCase):
    """yt-dlp は PATH 上の「ffmpeg」しか確認しないので、imageio-ffmpeg 版を PATH に出す必要がある。"""

    def test_expose_on_path(self):
        import highlights.fetch as fm
        saved_bin, saved_path = fm.BIN_DIR, os.environ.get("PATH", "")
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "ffmpeg-win-x86_64-v7.1.exe")
            with open(src, "wb") as f:
                f.write(b"x" * 100)
            fm.BIN_DIR = os.path.join(d, "bin")
            try:
                out = fm._expose_on_path(src)
                self.assertEqual(os.path.basename(out), "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
                self.assertEqual(os.path.getsize(out), 100)
                self.assertTrue(os.environ["PATH"].startswith(fm.BIN_DIR + os.pathsep))
                fm._expose_on_path(src)  # 2 回目は PATH に重複して足さない
                self.assertEqual(os.environ["PATH"].count(fm.BIN_DIR), 1)
            finally:
                fm.BIN_DIR = saved_bin
                os.environ["PATH"] = saved_path

import json
import os
import random
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from highlights.chat import classify, load_live_chat, parse_live_chat_lines  # noqa: E402
from highlights.cli import main  # noqa: E402
from highlights.detect import Config, analyze  # noqa: E402
from highlights.signals import extract_timestamps, rolling_robust_z  # noqa: E402


def chat_line(t, author, text, paid=None):
    key = "liveChatPaidMessageRenderer" if paid else "liveChatTextMessageRenderer"
    renderer = {
        "message": {"runs": [{"text": text}]},
        "authorName": {"simpleText": author},
        "authorExternalChannelId": "UC" + author,
    }
    if paid:
        renderer["purchaseAmountText"] = {"simpleText": paid}
    return json.dumps(
        {
            "replayChatItemAction": {
                "actions": [{"addChatItemAction": {"item": {key: renderer}}}],
                "videoOffsetTimeMsec": str(int(t * 1000)),
            }
        },
        ensure_ascii=False,
    )


NORMAL = ["こんばんは", "なるほど", "それな", "初見です", "かわいい", "hi", "がんばれ", "?", "おつ"]
LAUGH = ["草", "wwwww", "草草草", "ｗｗｗ", "腹筋崩壊", "lol", "😂"]
SURPRISE = ["えぇ!?", "!?", "まじか", "うそでしょ"]

# (出来事の時刻, 反応の種類)
EVENTS = [(600, LAUGH), (1500, SURPRISE), (2400, LAUGH), (3100, LAUGH)]
DURATION = 3600


def synth_chat(seed=1):
    rnd = random.Random(seed)
    lines = []
    for sec in range(DURATION):
        # 配信後半ほどチャットが増える (ベースラインのドリフト)
        rate = 0.6 + 1.2 * sec / DURATION
        for _ in range(int(rate) + (rnd.random() < rate % 1)):
            lines.append(chat_line(sec + rnd.random(), f"u{rnd.randrange(400)}", rnd.choice(NORMAL)))
    for t0, words in EVENTS:
        # 出来事の 3〜20 秒後に多数の視聴者が反応する
        for i in range(60):
            t = t0 + 3 + rnd.random() * 17
            lines.append(chat_line(t, f"r{t0}_{i}", rnd.choice(words)))
    # 1 人の連投スパム (検出されてはいけない)
    for i in range(80):
        lines.append(chat_line(1900 + i * 0.2, "spammer", "wwwwwwww"))
    # スパチャ
    lines.append(chat_line(2405, "rich", "草", paid="¥10,000"))
    return lines


class ClassifyTest(unittest.TestCase):
    def test_categories(self):
        self.assertIn("laugh", classify("草"))
        self.assertIn("laugh", classify("ｗｗｗｗ"))
        self.assertIn("laugh", classify("それはないw"))
        self.assertNotIn("laugh", classify("wow"))
        self.assertNotIn("laugh", classify("what"))
        self.assertIn("surprise", classify("えぇ!?"))
        self.assertIn("applause", classify("8888888"))
        self.assertIn("clip", classify("ここすき"))
        self.assertEqual(classify("こんばんは"), {})

    def test_intensity(self):
        self.assertGreater(classify("wwwwwwwwww")["laugh"], classify("ww")["laugh"])

    def test_timestamps(self):
        self.assertEqual(extract_timestamps("12:34 ここ好き 1:02:03"), [754, 3723])
        self.assertEqual(extract_timestamps("12:75 と 2024:01:01"), [])

    def test_robust_z_ignores_drift(self):
        xs = [i / 10 for i in range(200)]
        xs[100] += 30
        z = rolling_robust_z(xs, 30)
        self.assertEqual(max(range(200), key=z.__getitem__), 100)
        self.assertLess(max(z[:90]), 1.0)


class ParserTest(unittest.TestCase):
    def test_parse(self):
        msgs = parse_live_chat_lines(
            [chat_line(5, "a", "草"), chat_line(-3, "b", "待機"), chat_line(9, "c", "ありがとう", paid="¥1,000")]
        )
        self.assertEqual(len(msgs), 2)
        self.assertEqual(msgs[1].kind, "paid")
        self.assertEqual(msgs[1].amount, 1000)

    def test_emoji_runs(self):
        line = json.dumps({"replayChatItemAction": {"videoOffsetTimeMsec": "1000", "actions": [
            {"addChatItemAction": {"item": {"liveChatTextMessageRenderer": {
                "message": {"runs": [{"emoji": {"emojiId": "😂", "shortcuts": [":joy:"]}},
                                     {"emoji": {"emojiId": "UCxx/abc", "shortcuts": [":_kusa:"]}}]},
                "authorExternalChannelId": "UCa"}}}}]}})
        msgs = parse_live_chat_lines([line])
        self.assertEqual(msgs[0].text, "😂:_kusa:")
        self.assertIn("laugh", msgs[0].reactions)


class DetectTest(unittest.TestCase):
    def setUp(self):
        self.messages = parse_live_chat_lines(synth_chat())

    def test_finds_events_from_chat(self):
        result = analyze(DURATION, Config(top=6), messages=self.messages)
        times = [h.time for h in result.highlights]
        for t0, _ in EVENTS:
            self.assertTrue(
                any(t0 - 25 <= t <= t0 + 5 for t in times),
                f"event at {t0} not found in {times}",
            )
        # スパム区間は拾わない
        self.assertFalse(any(1880 <= t <= 1940 for t in times), times)
        labels = {round(h.peak / 300): h.label for h in result.highlights}
        self.assertIn("驚き", labels[5])
        self.assertIn("爆笑", labels[2])

    def test_timestamp_precedes_event(self):
        """出力タイムスタンプは出来事の少し前 (前振りから見られる位置) になる。"""
        result = analyze(DURATION, Config(top=4), messages=self.messages)
        for h in result.highlights:
            nearest = min((t0 for t0, _ in EVENTS), key=lambda t0: abs(t0 - h.time))
            self.assertLessEqual(h.time, nearest)
            self.assertGreaterEqual(h.time, nearest - 25)

    def test_heatmap_and_comments_only(self):
        heatmap = [
            {"start_time": i * 36, "end_time": (i + 1) * 36, "value": 1.0 if i == 50 else 0.1 + 0.01 * (i % 3)}
            for i in range(100)
        ]
        comments = [
            {"text": "1:23:20 ここ草", "like_count": 50},
            {"text": "23:20 好き", "like_count": 3},
            {"text": "23:22 www", "like_count": 0},
        ]
        result = analyze(5400, Config(top=3), heatmap=heatmap, comments=comments)
        times = [h.peak for h in result.highlights]
        self.assertTrue(any(1790 <= t <= 1840 for t in times), times)  # ヒートマップの山
        self.assertTrue(any(1395 <= t <= 1410 for t in times), times)  # 23:20 付近
        self.assertTrue(any(4995 <= t <= 5010 for t in times), times)  # 1:23:20

    def test_cli_offline(self):
        with tempfile.TemporaryDirectory() as d:
            chat = os.path.join(d, "x.live_chat.json")
            with open(chat, "w", encoding="utf-8") as f:
                f.write("\n".join(synth_chat()))
            info = os.path.join(d, "x.info.json")
            with open(info, "w", encoding="utf-8") as f:
                json.dump({"id": "abc", "title": "テスト配信", "duration": DURATION}, f)
            out = os.path.join(d, "out.json")
            stdout = sys.stdout
            try:
                with open(out, "w", encoding="utf-8") as sys.stdout:
                    main(["--info-json", info, "--chat-file", chat, "-f", "json", "-n", "4"])
            finally:
                sys.stdout = stdout
            with open(out, encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(len(data["highlights"]), 4)
            self.assertTrue(data["highlights"][0]["link"].startswith("https://youtu.be/abc?t="))
            self.assertEqual(len(load_live_chat(chat)), len(parse_live_chat_lines(synth_chat())))


if __name__ == "__main__":
    unittest.main()

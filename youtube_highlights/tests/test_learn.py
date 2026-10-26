import math
import os
import random
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from highlights.chat import parse_live_chat_lines  # noqa: E402
from highlights.clipmaker import ClipOptions  # noqa: E402
from highlights.detect import Config, analyze  # noqa: E402
from highlights.learn import (  # noqa: E402
    FEATURES, apply_production, clip_probability, rank_highlights, report_text, source_ids, train, window_features,
)
from highlights.trends import design, regress, title_flags  # noqa: E402
from test_highlights import DURATION, synth_chat  # noqa: E402


def synth_rows(seed=0, n_streams=30):
    rnd = random.Random(seed)
    rows = []
    for s in range(n_streams):
        for i in range(12):
            lab = 1 if i < 3 else 0
            f = {k: rnd.gauss(0, 1) for k in FEATURES}
            if lab:
                f["reaction_max"] += 1.5
                f["share_laugh"] += 1.0
            r = {"stream_id": f"s{s}", "label": lab, "features": f, "start": 0, "end": 60}
            if lab:
                age = rnd.uniform(10, 300)
                r.update(clip_id=f"c{s}_{i}", subs=10 ** rnd.uniform(4, 6), duration=rnd.uniform(60, 900),
                         upload_date=time.strftime("%Y%m%d", time.localtime(time.time() - 86400 * age)),
                         lead=rnd.uniform(5, 25), tail=rnd.uniform(2, 12))
                r["views"] = int(10 ** (0.8 * math.log10(r["subs"]) + 0.3 * math.log10(age)
                                        + 0.2 * f["share_laugh"] + rnd.gauss(0, 0.2)))
            rows.append(r)
    return rows


class TrainTest(unittest.TestCase):
    def test_train_recovers_signal(self):
        m = train(synth_rows())
        w = dict(zip(m["features"], m["clip"]["w"]))
        self.assertEqual(max(w, key=w.get), "reaction_max")
        self.assertGreater(m["clip"]["cv_auc"], 0.8)
        v = dict(zip(m["views"]["names"], m["views"]["coef"]))
        self.assertAlmostEqual(v["log10(登録者数)"], 0.8, delta=0.15)
        self.assertGreater(v["share_laugh"], 0.1)
        self.assertIn("前振り", report_text(m))

    def test_too_little_data(self):
        with self.assertRaises(ValueError):
            train(synth_rows(n_streams=2)[:5])

    def test_apply_production(self):
        opts = ClipOptions()
        apply_production({"production": {"lead": 18.0, "tail": 100.0}}, opts)
        self.assertEqual((opts.lead, opts.tail), (18.0, 30.0))   # 極端な値は丸める
        apply_production(None, opts)
        self.assertEqual(opts.lead, 18.0)


class MergeTest(unittest.TestCase):
    def test_merge_dedup(self):
        import json
        import tempfile

        from highlights.learn import load_dataset, merge_datasets
        rows = synth_rows(n_streams=3)
        with tempfile.TemporaryDirectory() as d:
            a, b, dst = (os.path.join(d, n) for n in ("a.jsonl", "b.jsonl", "out/dataset.jsonl"))
            for path, part in ((a, rows[:20]), (b, rows[10:] + [{"clip_id": "bad", "features": {}}])):
                with open(path, "w", encoding="utf-8") as f:
                    f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in part)
            self.assertEqual(merge_datasets(dst, [a, b]), len(rows))   # 重複と壊れた行は入れない
            self.assertEqual(merge_datasets(dst, [a]), 0)
            self.assertEqual(len(load_dataset(dst)), len(rows))


class FeatureTest(unittest.TestCase):
    def test_window_features_and_ranking(self):
        msgs = parse_live_chat_lines(synth_chat())
        an = analyze(DURATION, Config(top=4), messages=msgs)
        hot = window_features(an, msgs, 595, 625, DURATION)
        cold = window_features(an, msgs, 1000, 1030, DURATION)
        self.assertEqual(set(hot), set(FEATURES))
        self.assertGreater(hot["reaction_max"], cold["reaction_max"])
        self.assertGreater(hot["share_laugh"], cold["share_laugh"])
        model = train(synth_rows())
        ranked = rank_highlights(model, an, msgs, DURATION)
        self.assertEqual(len(ranked), len(an.highlights))
        self.assertTrue(all(0 <= p <= 1 for p, _h in ranked))
        self.assertGreater(clip_probability(model, hot), clip_probability(model, cold))

    def test_source_ids(self):
        text = "元配信 https://youtu.be/AAAAAAAAAAA?t=10\nhttps://www.youtube.com/watch?v=BBBBBBBBBBB&t=5 https://youtu.be/SELFxxxxxxx"
        self.assertEqual(source_ids(text, "SELFxxxxxxx"), ["AAAAAAAAAAA", "BBBBBBBBBBB"])


class TrendsTest(unittest.TestCase):
    def test_regress_recovers_effects(self):
        rnd = random.Random(1)
        rows = []
        for c in range(25):
            base = rnd.uniform(3, 6)
            for _ in range(50):
                d = rnd.choice([100, 500, 900, 1500])
                age = 10 ** rnd.uniform(1, 3)
                lv = base + 0.3 * math.log10(age) + (math.log10(0.5) if d == 100 else 0) + rnd.gauss(0, 0.2)
                rows.append({"channel_id": f"c{c}", "kind": "video", "duration": d, "title": "テスト",
                             "views": int(10 ** lv), "age_days": age})
        res = {c["feature"]: c for c in regress(rows, boot=30)["coef"]}
        self.assertAlmostEqual(res["長さ 1〜3分"]["x"], 0.5, delta=0.08)
        self.assertTrue(res["長さ 1〜3分"]["clear"])
        self.assertAlmostEqual(res["log10(日数)"]["beta"], 0.3, delta=0.05)

    def test_title_features(self):
        f = title_flags("【ホロライブ/A/B/C/D】まさかの展開→爆笑ｗ「嘘でしょ」")
        self.assertTrue(f["【】で囲んだ語"] and f["「」でセリフ引用"] and f["ｗ / 草"] and f["→ (展開の予告)"])
        x = design({"kind": "video", "duration": 100, "title": "【A/B/C/D】x", "age_days": 10})
        self.assertIn("タイトル: 【】内に 4 人以上の名前 (コラボ)", x)
        self.assertEqual(design({"kind": "video", "duration": 100, "title": "【閉じてない", "age_days": 10})["log10(日数)"], 1.0)


if __name__ == "__main__":
    unittest.main()

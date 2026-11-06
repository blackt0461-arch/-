# 授業（data/<授業>/lessons/*.json）をテストの JSON に登録し、全問カバーを確かめる。
#   python3 test-study/tools/lessons.py denshi1 midterm
import json, os, sys, glob

course, test = sys.argv[1], sys.argv[2]
base = os.path.join(os.path.dirname(__file__), '..', 'data', course)
tp = os.path.join(base, test + '.json')
d = json.load(open(tp))
ids = [q['id'] for q in d['questions']]
lec_of = {q['id']: q.get('lecture') for q in d['questions']}
TYPES = {'cover', 'text', 'analogy', 'formula', 'point', 'flow', 'table', 'steps', 'quiz', 'summary'}
lessons, covered, problems = [], {}, []
for f in sorted(glob.glob(os.path.join(base, 'lessons', 'l*.json'))):
    L = json.load(open(f))
    n = len(L['slides'])
    for i, s in enumerate(L['slides']):
        if s.get('type') not in TYPES: problems.append(f"{L['id']} slide {i}: type {s.get('type')}")
        if s.get('fig') and not os.path.exists(os.path.join(base, s['fig'])): problems.append(f"{L['id']} slide {i}: fig {s['fig']} がない")
        if s.get('type') == 'quiz' and not (0 <= s.get('answer', -1) < len(s.get('choices', []))): problems.append(f"{L['id']} slide {i}: quiz answer")
    for qid, sl in (L.get('covers') or {}).items():
        if qid not in lec_of: problems.append(f"{L['id']}: covers に知らない問題 {qid}"); continue
        if not sl or any(not (0 <= x < n) for x in sl): problems.append(f"{L['id']}: {qid} のスライド番号が変")
        covered.setdefault(qid, []).append(L['id'])
    lessons.append({'id': L['id'], 'lecture': L.get('lecture'), 'title': L['title'], 'sub': L.get('sub', ''), 'minutes': L.get('minutes', 10),
                    'file': 'lessons/' + os.path.basename(f), 'covers': L.get('covers') or {}})
missing = [i for i in ids if i not in covered]
quizzes = sum(1 for f in glob.glob(os.path.join(base, 'lessons', 'l*.json')) for s in json.load(open(f))['slides'] if s.get('type') == 'quiz')
order = lambda L: -1 if L['id'] == 'l0' else int(L['id'][1:]) if L['id'][1:].isdigit() else 99
d['lessons'] = sorted(lessons, key=order)
json.dump(d, open(tp, 'w'), ensure_ascii=False, indent=1)
print('授業', len(lessons), '本・スライド', sum(len(json.load(open(os.path.join(base, L['file']))).get('slides', [])) for L in lessons), '枚・クイズ', quizzes, '問')
print('カバーされていない問題:', missing or 'なし')
print('問題点:', problems or 'なし')

# 授業を小分け（パート）にする区切りを決めて、テストの JSON の lessons に parts を書く
#   python3 test-study/tools/parts.py <授業> <テスト>
# 区切り方：なるべく確認クイズ（quiz）のあとで切る。1パートは 6〜14 枚、目安 10 枚。
# parts = [{"title": パートの名前, "from": 最初のスライド番号, "to": 最後の次の番号}]（番号は 0 から）
import json, os, sys

D = os.path.dirname(os.path.abspath(__file__))
course, test = sys.argv[1], sys.argv[2]
tpath = os.path.join(D, '..', 'data', course, test + '.json')
T = json.load(open(tpath))
MIN, AIM, MAX = 6, 10, 14


def cuts_for(slides):
    """区切りの場所を、全体の「むり」が一番小さくなるように選ぶ（動的計画法）。
    切る場所のむり：クイズの後 0／「ここを覚える」・式・導き方の後 3／それ以外 9（ただし最後の要約の前とクイズの前は切らない）
    長さのむり：(枚数−10)²/4。6枚未満・14枚をこえるパートは作らない"""
    n = len(slides)
    def cut_cost(c):  # c 枚目の前で切る
        prev, nxt = slides[c - 1]['type'], slides[c]['type']
        if nxt in ('summary', 'quiz'):
            return None
        if prev == 'quiz':
            return 0
        if prev in ('point', 'formula', 'steps'):
            return 3
        return 9
    best = {0: (0, [])}
    for c in range(1, n + 1):
        cc = 0 if c == n else cut_cost(c)
        if cc is None:
            continue
        opts = []
        for a, (cost, path) in best.items():
            ln = c - a
            if a < c and MIN <= ln <= MAX:
                opts.append((cost + cc + (ln - AIM) ** 2 / 4, path + [c]))
        if opts:
            best[c] = min(opts)
    if n not in best:
        return []
    return best[n][1][:-1]


def title_of(slides, a, b):
    for s in slides[a:b]:
        if s['type'] not in ('cover', 'quiz') and s.get('title'):
            return s['title']
    return ''


for L in T['lessons']:
    data = json.load(open(os.path.join(D, '..', 'data', course, L['file'])))
    slides = data['slides']
    bounds = [0] + cuts_for(slides) + [len(slides)]
    L['parts'] = [{'title': title_of(slides, a, b), 'from': a, 'to': b} for a, b in zip(bounds, bounds[1:])]
    print(f"{L['id']} {L['lecture']} {len(slides)}枚 → {len(L['parts'])}パート:", ' / '.join(f"{p['to'] - p['from']}枚「{p['title']}」" for p in L['parts']))

json.dump(T, open(tpath, 'w'), ensure_ascii=False, indent=1)
open(tpath, 'a').write('\n')
print('書きこみ:', tpath)

# ドライブの記録（受け口 server/Code.gs）を読む・書く道具。Claude が記述の答えを採点するときに使う。
#   python3 test-study/tools/drive.py records            … ドライブの記録をぜんぶ表示（JSON）
#   python3 test-study/tools/drive.py graded             … 採点ずみの答えの uid の一覧
#   python3 test-study/tools/drive.py post grades.json   … 採点を書きこむ（下の形の配列）
# grades.json の1件： {"uid": 答えのuid, "q": 問題のkey, "grade": "ok|mid|ng", "score": 0-100,
#   "comment": "...", "missing": ["..."], "better": "...", "self": 自己採点, "yours": 答えの文（短く）, "at": 答えた時刻(ms)}
# 自己採点より採点が低いときは、その問題がまた早めに出るように「できごと」も足す（ev/claude/<uid>）。
import json, sys, time, urllib.request

URL = 'https://script.google.com/macros/s/AKfycbyea0Gsfce0Ew9m5dkyaJGPqhq95pzdZbOgFMfmQZPpPChuvUbxXO-hlUKdiR8gqJsw/exec'
KEY = 'test-study-builtin-key'  # js/cloud.js の BUILTIN と同じ
RANK = {'ng': 0, 'mid': 1, 'ok': 2}


def sync(records):
    body = json.dumps({'fn': 'sync', 'key': KEY, 'args': {'state': {'records': records, 'plan': {}}}}).encode()
    req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    if j.get('error'):
        raise SystemExit('エラー: ' + j['error'])
    return j['result']


cmd = sys.argv[1] if len(sys.argv) > 1 else 'records'
if cmd == 'records':
    print(json.dumps(sync({}), ensure_ascii=False, indent=1))
elif cmd == 'graded':
    recs = sync({})['records']
    print('\n'.join(k[2:] for k in recs if k.startswith('採/')))
elif cmd == 'post':
    grades = json.load(open(sys.argv[2]))
    now = int(time.time() * 1000)
    out = {}
    for g in grades:
        uid = g.pop('uid')
        g['t'] = now
        out['採/' + uid] = g
        if g.get('self') in RANK and RANK[g['grade']] < RANK[g['self']]:
            out['ev/claude/' + uid] = {'q': g['q'], 'r': g['grade'], 'at': now, 't': now, 'src': 'claude'}
    sync(out)
    print('書きこみました:', len(grades), '件')

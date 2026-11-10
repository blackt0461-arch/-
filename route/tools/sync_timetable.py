#!/usr/bin/env python3
"""いどうナビ：授業リマインダーの時間割（/api/timetable）を読んで、本人のアカウント（kw_app_data・route の tt）に写す。

- 合言葉は環境の秘密の設定（class-reminder-omega.vercel.app 用）にあり、通信の途中で自動で付く。コードには書かない。
- Supabase へは Management API（鍵は環境が自動で付ける）。
- 使い方：python3 -I sync_timetable.py   （変化がなければ書かない）
"""
import datetime
import json
import sys
import urllib.request

API = 'https://class-reminder-omega.vercel.app/api/timetable'
DB = 'https://api.supabase.com/v1/projects/zmteazudhtnzvfvmndqn/database/query'
PLACE = '立命館大学 BKC'


def get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def sql(q):
    body = json.dumps({'query': q}).encode('utf-8')
    req = urllib.request.Request(DB, data=body, method='POST', headers={'Authorization': 'Bearer proxy-injected', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def build(api):
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date().isoformat()
    terms = api.get('terms') or []
    # 今の学期（なければ、これから始まる一番近い学期。それもなければ最後の学期）
    cur = [t for t in terms if t['start_date'] <= today <= t['end_date']]
    nxt = sorted([t for t in terms if t['start_date'] > today], key=lambda t: t['start_date'])
    term = (cur or nxt or sorted(terms, key=lambda t: t['end_date'])[-1:] or [None])[0]
    if not term:
        return None
    sessions = []
    for c in term.get('courses') or []:
        tests = {t['session_no']: t['kind'] for t in c.get('tests') or []}
        slots = c.get('slots') or []
        for s in c.get('sessions') or []:
            wd = (datetime.date.fromisoformat(s['date']).weekday() + 1) % 7  # 0=日
            room = next((x.get('room') or '' for x in slots if x.get('weekday') == wd and x.get('start') == s.get('start')), '')
            sessions.append({'date': s['date'], 'start': s['start'], 'end': s['end'], 'subject': c['subject'], 'room': room,
                             'no': s.get('no'), 'test': tests.get(s.get('no'), ''), 'extra': bool(s.get('extra'))})
    sessions.sort(key=lambda x: (x['date'], x['start']))
    return {'name': term.get('name', ''), 'place': PLACE, 'term': {'start': term['start_date'], 'end': term['end_date']},
            'sessions': sessions, 'src': '授業リマインダー /api/timetable', 'at': api.get('generated_at', '')}


def main():
    api = get(API, {'Authorization': 'Bearer proxy-injected'})
    tt = build(api)
    if not tt:
        print('学期が見つかりませんでした')
        return 1
    cur = sql("select d.data->'tt' tt from kw_app_data d join kw_users u on u.id=d.user_id where u.username='kotetsu' and d.app='route'")
    old = (cur[0]['tt'] if cur else None) or {}
    if old.get('sessions') == tt['sessions'] and old.get('term') == tt['term']:
        print(f"変化なし（{tt['name']}・{len(tt['sessions'])}回）")
        return 0
    lit = json.dumps(tt, ensure_ascii=False).replace("'", "''")
    sql("update kw_app_data d set data = d.data || jsonb_build_object('tt', '" + lit + "'::jsonb), updated_at = clock_timestamp() "
        "from kw_users u where u.id=d.user_id and u.username='kotetsu' and d.app='route'")
    tests = [f"{s['date'][5:]} {s['subject']} {s['test']}" for s in tt['sessions'] if s['test']]
    print(f"写しました：{tt['name']}（{tt['term']['start']}〜{tt['term']['end']}）授業 {len(tt['sessions'])}回。テスト：" + ('、'.join(tests) or 'なし'))
    return 0


if __name__ == '__main__':
    sys.exit(main())

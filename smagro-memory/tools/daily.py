"""スマグロ さいてきか の毎朝のデータ更新。Claude の予定（kotetsuworks-site の環境）から動かす。2026-11-10
1. Supabase の公開バケット smagro から、きのうの data.json・feats.json・cache.json を取ってくる
2. update.py でデータを集める（新しいページと古い30件だけ。相手の負担を小さく）
3. 合言葉を Supabase の Management API で読み（この環境の中継が鍵を付ける）、Edge Function smagro-upload に送る
   合言葉は画面にも出さない・ファイルにも書かない。
  python3 daily.py          → 1〜3
  python3 daily.py --send   → 3 だけ（手元のファイルをそのまま送る）
GameWith は GitLab のサーバーからの読み取りを断る（403）ので、GitLab では動かさない。"""
import os, sys, json, gzip, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REF = 'zmteazudhtnzvfvmndqn'
BASE = f'https://{REF}.supabase.co'
FILES = {'data': os.path.join(HERE, '..', 'data.json'), 'feats': os.path.join(HERE, '..', 'feats.json'), 'cache': os.path.join(HERE, 'cache.json')}


def fetch_prev():
    for k, path in FILES.items():
        try:
            with urllib.request.urlopen(f'{BASE}/storage/v1/object/public/smagro/{k}.json', timeout=60) as r:
                open(path, 'wb').write(r.read())
            print('取ってきた', k)
        except Exception as e:  # まだ無いときは リポジトリの中のものを使う
            print('リポジトリのものを使う', k, e)


def key():
    q = json.dumps({'query': 'select key from smagro_upload_key where id = 1'}).encode()
    req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}/database/query', data=q, method='POST', headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())[0]['key']


def send():
    k = key()
    for name in ('cache', 'feats', 'data'):   # data を最後に
        body = gzip.compress(open(FILES[name], 'rb').read())
        req = urllib.request.Request(f'{BASE}/functions/v1/smagro-upload', data=body, method='POST',
                                     headers={'X-Smagro-Key': k, 'X-Smagro-File': name, 'Content-Type': 'application/octet-stream'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                print('置いた', r.read().decode())
        except urllib.error.HTTPError as e:
            sys.exit(f'置けなかった {name} {e.code} {e.read().decode()}')


if __name__ == '__main__':
    if '--send' not in sys.argv:
        fetch_prev()
        subprocess.run([sys.executable, os.path.join(HERE, 'update.py')], check=True)
    send()

"""GitLab の予定の作業（.gitlab-ci.yml の smagro-update）から動かす。2026-11-10
1. Supabase の公開バケット smagro から、きのうの data.json・feats.json・cache.json を取ってくる
2. update.py でデータを集める（新しいページと古い30件だけ。相手の負担を小さく）
3. 3つのファイルを Edge Function smagro-upload に送る。身分証は GitLab が作業ごとに出す ID トークン（SMAGRO_ID_TOKEN）
鍵はどこにも書かない。"""
import os, sys, json, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://zmteazudhtnzvfvmndqn.supabase.co'
FILES = {'data.json': os.path.join(HERE, '..', 'data.json'), 'feats.json': os.path.join(HERE, '..', 'feats.json'), 'cache.json': os.path.join(HERE, 'cache.json')}

for name, path in FILES.items():
    try:
        with urllib.request.urlopen(f'{BASE}/storage/v1/object/public/smagro/{name}', timeout=60) as r:
            open(path, 'wb').write(r.read())
        print('取ってきた', name)
    except Exception as e:  # まだ無い（はじめて）ときは リポジトリの中のものを使う
        print('リポジトリのものを使う', name, e)

subprocess.run([sys.executable, os.path.join(HERE, 'update.py')], check=True)

tok = os.environ.get('SMAGRO_ID_TOKEN')
if not tok:
    sys.exit('SMAGRO_ID_TOKEN がない（.gitlab-ci.yml の id_tokens を確かめる）')
body = json.dumps({k.split('.')[0]: open(p, encoding='utf-8').read() for k, p in FILES.items()}).encode()
req = urllib.request.Request(f'{BASE}/functions/v1/smagro-upload', data=body, method='POST',
                             headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        print('置いた', r.read().decode())
except urllib.error.HTTPError as e:
    sys.exit(f'置けなかった {e.code} {e.read().decode()}')

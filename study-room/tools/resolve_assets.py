# catalog.js に書いた Poly Haven の素材IDから、ダウンロード先をまとめて js/assets.js を作り直す。
# 使い方: python3 study-room/tools/resolve_assets.py
import json,re,urllib.request,sys
import os
here=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','js')
src=open(os.path.join(here,'catalog.js')).read()+open(os.path.join(here,'exterior.js')).read()
models=sorted(set(re.findall(r"model: '([^']+)'",src))|set(re.findall(r"placeModel\(g, '([^']+)'",src))|set(re.findall(r"'(shrub_0\d)'",src)))
texs=sorted(set(re.findall(r"tex: '([^']+)'",src))|set(re.findall(r"texturedMaterial\('([^']+)'",src)))
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'study-room-builder/1.0'}),timeout=30))
out={'models':{},'textures':{}}; bad=[]
for m in models:
  try:
    d=get(f'https://api.polyhaven.com/files/{m}')['gltf']['1k']['gltf']
    out['models'][m]={'url':d['url'],'mb':round((d['size']+sum(v['size'] for v in d['include'].values()))/1e6,1),'inc':{k:v['url'] for k,v in d['include'].items() if not k.endswith('.bin')} | {k:v['url'] for k,v in d['include'].items() if k.endswith('.bin')}}
  except Exception as e: bad.append(('model',m,str(e)))
for t in texs:
  try:
    d=get(f'https://api.polyhaven.com/files/{t}')
    r={}
    for k,n in [('Diffuse','map'),('col_01','map'),('col_1','map'),('nor_gl','normal'),('Rough','rough'),('AO','ao')]:
      if k in d and n not in r: r[n]=d[k]['1k']['jpg']['url']; r.setdefault('sizes',{})[n]=d[k]['1k']['jpg']['size']
    if 'map' not in r: bad.append(('tex-nodiff',t,list(d.keys())))
    out['textures'][t]=r
  except Exception as e: bad.append(('tex',t,str(e)))
print('BAD',bad)
print({k:v['mb'] for k,v in out['models'].items()})
open(os.path.join(here,'assets.js'),'w').write('// Poly Haven の素材の場所（scratch の resolve.py で自動生成）\nexport const ASSETS = '+json.dumps(out,ensure_ascii=False,indent=0)+';\n')

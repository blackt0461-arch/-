"""スマグロ さいてきか のデータを GameWith から集めて ../data.json を作り直す。

GitHub Actions で1日1回動く（GameWith から公開・自動収集の許可あり）。
相手のサーバーに負担をかけないように:
  - 一覧ページ（6ページ）は毎回読む
  - くわしいページは、新しいものと、古い順に MAX_REFRESH 件だけ読み直す
  - 1ページごとに WAIT 秒あける
読んだ結果は cache.json に入れておき、次の日に使い回す。
"""
import re, json, html, os, sys, time, datetime, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data.json')
CACHE = os.path.join(HERE, 'cache.json')
BASE = 'https://gamewith.jp/dq-smashgrow/'
UA = 'Mozilla/5.0 (compatible; smagro-saitekika/1.0; personal tool)'
WAIT = 2.0
MAX_REFRESH = int(os.environ.get('MAX_REFRESH', '30'))
PAGES = dict(sim='558001', memlist='555869', weapons='555827', armor='555859', acc='555866')
BOSS_SECTIONS = ('チャレンジクエスト', '遺跡', '強敵マッチ', 'マルチクエスト')


def get(pid):
    req = urllib.request.Request(BASE + pid, headers={'User-Agent': UA, 'Accept-Language': 'ja'})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # noqa
            print('retry', pid, e, file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise RuntimeError('fetch failed ' + pid)


def norm(t):
    t = html.unescape(t)
    t = t.replace('＋', '+').replace('％', '%').replace('　', ' ').replace('－', '-')
    return re.sub(r'\s+', ' ', t).strip()


def strip(x):
    return norm(re.sub(r'<[^>]+>', '', x))


# ---------- 一覧ページ ----------
def parse_sim(p):
    mem = []
    for m in re.finditer(r'\{id:`(\d+)`,n:`([^`]+)`,c:`([^`]+)`,ct:(\d+),i:`([^`]*)`,r:`([^`]*)`,aId:`\d*`,s:\{(.*?)\},get:\{t:`([^`]*)`', p):
        mid, n, c, ct, img, r, sblk, gt = m.groups()
        sm = re.search(r's:\{h:(\d+),a:(\d+),ma:(\d+),mh:(\d+),d:(\d+),md:(\d+),dx:(\d+),s:\[(.*?)\]', sblk)
        if not sm:
            continue
        mem.append(dict(id=int(mid), n=n, c=c, ct=int(ct), r=r, img=img, st=list(map(int, sm.groups()[:7])),
                        e=[norm(x) for x in re.findall(r'"([^"]*)"', sm.group(8))], get=gt))
    jobs = [dict(n=n, c=json.loads('[' + c + ']')) for n, c in re.findall(r'\{id:`\d+`,n:`([^`]+)`,c:\[([^\]]*)\]\}', p)]
    bosses = []
    for sec in re.finditer(r"tips-vertical-menu_title[^>]*>([^<]+)</div>\s*<ul>(.*?)</ul>", p, re.S):
        if sec.group(1).strip() in BOSS_SECTIONS:
            for pid, name in re.findall(r"dq-smashgrow/(\d+)'[^>]*>([^<]+)<", sec.group(2)):
                if '攻略' not in name:
                    bosses.append(pid)
    return mem, jobs, list(dict.fromkeys(bosses))


def parse_families(ml):
    famkey = dict(re.findall(r'data-key="(st\d+)">([^<]+)<', ml))
    fam = {}
    for name, filt in re.findall(r'<li data-id="m\d+" data-name="([^"]+)" data-filter="([^"]*)"', ml):
        for k in filt.split():
            if k in famkey:
                fam[name] = famkey[k]
    return fam, list(dict.fromkeys(famkey.values()))


def parse_equip_list(s, cat):
    out = []
    pre = {'w': 'ew', 'a': 'ea', 'c': 'ec'}[cat]
    pat = r'<li data-id="(' + pre + r'\d+)" data-name="([^"]+)" data-filter="([^"]*)"(.*?)</li>'
    for blk in re.finditer(pat, s, re.S):
        eid, name, filt, body = blk.groups()
        rare = re.search(r'\br(\d)\b', filt)
        d = dict(id=eid, n=name, cat=cat, rar=int(rare.group(1)) if rare else 0)
        im = re.search(r"data-original='(https://img\.gamewith\.jp/[^']+)'", body) or re.search(r"<img src='(https://img\.gamewith\.jp/img/[^']+)'", body)
        d['img'] = im.group(1) if im else ''
        if cat == 'c':
            t = norm(re.sub(r'<[^>]+>', '|', re.sub(r'<br>', '|', body)))
            def parts(x): return [y.strip() for y in x.split('|') if y.strip()] if x else []
            perf = re.search(r'性能\s*\|(.*?)特殊効果', t)
            sp = re.search(r'特殊効果\s*\|(.*?)入手', t)
            gt = re.search(r'入手\s*\|(.*)$', t)
            d.update(t='アクセ', perf=parts(perf.group(1) if perf else ''), lv=[[1, e] for e in parts(sp.group(1) if sp else '')],
                     totu=[], stat={}, get=' '.join(parts(gt.group(1)))[:60] if gt else '')
        else:
            url = re.search(r"dq-smashgrow/(\d+)'", body)
            typ = re.search(r'<span class="_status">([^<]+)</span>', body)
            le = re.search(r'特殊効果</div><div>(.*?)</div></div>', body, re.S)
            d.update(t=typ.group(1) if typ else '', src=url.group(1) if url else None,
                     allE=[strip(x) for x in re.split(r'<br>', le.group(1)) if strip(x)] if le else [])
        out.append(d)
    return out


# ---------- くわしいページ ----------
def article_tokens(s):
    i = s.find('id="article-body"')
    j = s.find('ドラクエスマグロの関連記事', i)
    seg = s[i:j if j > 0 else None]
    seg = re.sub(r'<script.*?</script>|<style.*?</style>|<noscript>.*?</noscript>', '', seg, flags=re.S)
    seg = re.sub(r'<(br|/td|/th|/tr|/li|/div|/p|hr)[^>]*>', '|', seg)
    seg = re.sub(r'<[^>]+>', ' ', seg)
    return [x.strip() for x in norm(seg).split('|') if x.strip()]


def parse_equip_detail(raw):
    toks = article_tokens(raw)
    d = {'el': ''}
    for k, tk in enumerate(toks[:-1]):
        if tk == '属性' and re.match(r'^[炎氷雷土風光闇無]属性$', toks[k + 1]):
            d['el'] = toks[k + 1][0]
            break
    stats = {}
    tb = re.search(r'<table class="stat_table">(.*?)</table>', raw, re.S)
    if tb:
        rows = re.findall(r'<tr>(.*?)</tr>', tb.group(1), re.S)
        hdr = [strip(x) for x in re.findall(r'<th[^>]*>(.*?)</th>', rows[0], re.S)][1:] if rows else []
        for r_ in rows[1:]:
            th = re.search(r'<th[^>]*>(.*?)</th>', r_, re.S)
            if not th:
                continue
            k = strip(th.group(1))
            vals = [strip(x) for x in re.findall(r'<td>(.*?)</td>', r_, re.S)]
            dd = {h_: int(v_) for h_, v_ in zip(hdr, vals) if v_.isdigit()}
            stats[k] = [dd.get('初期値'), dd.get('最大値')]
    d['stat'] = stats
    lv, tot = [], []
    st0 = next((k for k, tk in enumerate(toks) if 'の特殊効果' in tk), None)
    if st0 is not None:
        mode, L = 'lv', 1
        for tk in toks[st0:]:
            if 'の入手方法' in tk:
                break
            m1 = re.search(r'(\d)凸$', tk)
            m2 = re.search(r'Lv(\d+)$', tk)
            if m1:
                mode, L = 't', int(m1.group(1)); continue
            if m2:
                mode, L = 'lv', int(m2.group(1)); continue
            if tk in ('レベル効果', '凸効果', '特殊効果') or 'の特殊効果' in tk:
                continue
            (lv if mode == 'lv' else tot).append([L, tk])
    d['lv'], d['totu'] = lv, tot
    return d


def parse_boss(s):
    title = re.search(r'<title>【スマグロ】(.*?)の攻略', s)
    if not title:
        return None
    nm = re.sub(r'\(.*?\)|（.*?）', '', title.group(1)).strip()
    if '<div class="weak_resist_board">' not in s:
        return dict(n=nm, w={})
    board = s[s.find('<div class="weak_resist_board">'):]
    cut = re.search(r'<h[23]', board)
    board = board[:cut.start()] if cut else board[:4000]
    res = {}
    for lab, inner in re.findall(r'<div label="([^"]+)"></div><div>(.*?)</div>', board, re.S):
        els = re.findall(r"alt='(?:ドラクエスマグロの)?([炎氷雷土風光闇])'", inner)
        if els:
            res[lab] = sorted(set(els))
    return dict(n=nm, w=res)


def main():
    today = datetime.date.today().isoformat()
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    pg = {}
    for k, pid in PAGES.items():
        pg[k] = get(pid)
        time.sleep(WAIT)
    mem, jobs, boss_ids = parse_sim(pg['sim'])
    fam, fams = parse_families(pg['memlist'])
    if len(mem) < 50 or len(jobs) < 5:
        sys.exit('メモリの一覧が読めませんでした。ページの形が変わったかもしれません。')
    for m in mem:
        m['f'] = fam.get(m['n'], '')
    equip = parse_equip_list(pg['weapons'], 'w') + parse_equip_list(pg['armor'], 'a') + parse_equip_list(pg['acc'], 'c')
    seen, eq2 = set(), []
    for e in equip:
        if e['id'] not in seen:
            seen.add(e['id']); eq2.append(e)
    equip = eq2

    # くわしいページ: 新しいもの全部 + 古いものを少しずつ
    want = [e['src'] for e in equip if e.get('src')] + boss_ids
    new = [p for p in want if p not in cache]
    old = sorted([p for p in want if p in cache], key=lambda p: cache[p].get('at', ''))[:MAX_REFRESH]
    print('new pages:', new)
    for pid in new + old:
        try:
            raw = get(pid)
        except RuntimeError as e:
            print(e, file=sys.stderr); continue
        try:
            cache[pid] = dict(at=today, eq=parse_equip_detail(raw) if pid not in boss_ids else None,
                              boss=parse_boss(raw) if pid in boss_ids else None)
        except Exception as e:  # ページの形が違うときは、その1件だけ飛ばす
            print('parse failed', pid, e, file=sys.stderr)
        time.sleep(WAIT)
    print(f'detail pages: new {len(new)}, refreshed {len(old)}')
    for pid in [p for p in cache if p not in want]:
        del cache[pid]  # 一覧から消えたページは記録からも消す

    for e in equip:
        c = cache.get(e.get('src') or '', {}).get('eq')
        if not c:
            continue
        R = 2.5 if e['cat'] == 'w' else 3.3  # 初期値と最大値の片方しか載っていないときの見積もり
        stats = {}
        for k, (a, b) in c['stat'].items():
            if a is None and b is None: stats[k] = [0, 0]
            elif a is None: stats[k] = [round(b / R), b]
            elif b is None: stats[k] = [a, round(a * R)]
            else: stats[k] = [a, b]
        e.update(el=c['el'], stat=stats, lv=c['lv'], totu=c['totu'])

    bosses = []
    for pid in boss_ids:
        b = (cache.get(pid) or {}).get('boss')
        if not b:
            continue
        nm = b['n']
        base = re.sub(r'のほこら|EX|攻防戦|殲滅戦|防衛戦|奇襲作戦', '', nm).strip()
        b2 = re.sub(r'軍$', '', base)
        f2 = fam.get(base) or fam.get(nm) or fam.get(b2) or next((v for k, v in fam.items() if b2 and b2 in k), '')
        bosses.append(dict(n=nm, boss=base, f=f2, w=b['w']))

    data = dict(updated=today, mem=mem, jobs=jobs, equip=equip, boss=bosses, fam=fams)
    if os.path.exists(OUT):
        prev = json.load(open(OUT, encoding='utf-8'))
        if {k: v for k, v in prev.items() if k != 'updated'} == {k: v for k, v in data.items() if k != 'updated'}:
            data['updated'] = prev.get('updated', today)  # 中身が同じなら日付も変えない
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    print(f'mem {len(mem)} jobs {len(jobs)} equip {len(equip)} boss {len(bosses)}')


if __name__ == '__main__':
    main()

// いどうナビ：Yahoo!乗換案内の検索結果を読んで、経路を返す（本人の決定 2026-11-10。route/SPEC.md）
// 守り方：kotetsuworks.com からだけ受け付ける／1日の回数に上限／同じ検索はしばらく覚えて使い回す
import { parseYahoo } from './parse.js';

// kotetsuworks.com と、同じサイトの Cloudflare Pages のアドレス（kotetsuworks.pages.dev とその下）
const ALLOW_RE = /^https:\/\/(www\.)?kotetsuworks\.com$|^https:\/\/([a-z0-9-]+\.)?kotetsuworks\.pages\.dev$/;
const DAILY_MAX = 120;          // 1日に Yahoo! を見に行く回数の上限（1回の検索で「早い順」「安い順」の2回）
const CACHE_MS = 30 * 60 * 1000; // 同じ検索を覚えておく時間
const cache = new Map<string, { at: number; body: string }>();
let count = { day: '', n: 0 };

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}
const json = (o: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (!ALLOW_RE.test(origin)) return new Response('forbidden', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'method' }, 405, origin);

  const q = new URL(req.url).searchParams;
  const from = (q.get('from') || '').trim(), to = (q.get('to') || '').trim();
  const date = q.get('date') || '', time = q.get('time') || '', type = q.get('type') === '1' ? '1' : '4';
  if (!from || !to || from.length > 40 || to.length > 40 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return json({ error: 'bad_request' }, 400, origin);
  }
  const key = [from, to, date, time, type].join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return new Response(hit.body, { headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } });

  const today = new Date().toISOString().slice(0, 10);
  if (count.day !== today) count = { day: today, n: 0 };
  if (count.n + 2 > DAILY_MAX) return json({ error: 'daily_limit' }, 429, origin);
  count.n += 2;

  const [y, m, d] = date.split('-');
  const [hh, mm] = time.split(':');
  // s=0：到着が早い順、s=1：料金が安い順。両方の案をまとめて返し、どれを使うかはアプリが決める（定期を考えるため）
  const get = async (sort: string) => {
    const p = new URLSearchParams({ from, to, y, m, d, hh, m1: mm[0], m2: mm[1], type, ticket: 'ic', expkind: '1', ws: '3', s: sort });
    const r = await fetch('https://transit.yahoo.co.jp/search/result?' + p.toString(), {
      headers: { 'User-Agent': 'idounavi/1.0 (personal use; kotetsuworks.com/route/)', 'Accept-Language': 'ja' },
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    return parseYahoo(await r.text()) || [];
  };
  let routes: any[] = [];
  try {
    const fast = await get('0');
    const cheap = await get('1');
    const seen = new Set<string>();
    for (const rt of [...fast, ...cheap]) {
      const k = rt.dep + rt.arr + rt.steps.map((x: any) => x.line).join('/');
      if (!seen.has(k)) { seen.add(k); routes.push(rt); }
    }
  } catch (_e) {
    return json({ error: 'upstream' }, 502, origin);
  }
  if (!routes.length) return json({ error: 'no_route' }, 404, origin);
  const body = JSON.stringify({ routes: routes.slice(0, 6), source: 'Yahoo!乗換案内' });
  cache.set(key, { at: Date.now(), body });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return new Response(body, { headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } });
});

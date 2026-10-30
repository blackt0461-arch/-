// Chat assistant: turns Japanese requests ("明日は5時に起こして") into edits of alarms.json via Gemini.
// The model only proposes `changes`; the page shows them and saves only after the user confirms.

import { DAYS, DAY_JA, validate, resolveDay, expandTimes, todayJST, addDays, weekdayKey, defaultProfile } from './schedule.js';

export const DEFAULT_MODEL = 'gemini-3.6-flash';
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const OPS = ['override_time', 'override_off', 'override_clear', 'weekly_time', 'weekly_off', 'meeting', 'set_profile', 'remember_place'];

function describeSlot(slot) {
  if (!slot) return 'なし';
  const base = slot.extra ? `${slot.time}（+${slot.interval || 5}分×${slot.extra}回）` : slot.time;
  return slot.note ? `${base}［${slot.note}］` : base;
}

function profileOf(data) {
  return { ...defaultProfile(), ...(data.profile || {}) };
}

export function mapsUrl(origin, destination) {
  const q = new URLSearchParams({ api: '1', origin, destination, travelmode: 'transit' });
  return `https://www.google.com/maps/dir/?${q}`;
}

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function nowJST(now) {
  const d = new Date(now.getTime() + 9 * 3600e3);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

export function buildSystemPrompt(data, now = new Date()) {
  const today = todayJST(now);
  const weekly = ORDER.map(d => `- ${DAY_JA[d]}曜（${d}）: ${describeSlot(data.weekly[d])}`).join('\n');
  const overrides = Object.entries(data.overrides).filter(([date]) => date >= today)
    .map(([date, slot]) => `- ${date}（${DAY_JA[weekdayKey(date)]}）: ${describeSlot(slot)}`).join('\n') || '- なし';
  const upcoming = [];
  for (let i = 0; i < 21; i++) {
    const date = addDays(today, i);
    const { source, slot } = resolveDay(data, date);
    upcoming.push(`- ${date}（${DAY_JA[weekdayKey(date)]}）: ${slot ? expandTimes(slot).join(', ') : 'なし'}${source === 'override' ? ' ※例外' : ''}`);
  }
  const profile = profileOf(data);
  const places = Object.entries(data.places || {})
    .map(([name, p]) => `- ${name}: ${p.minutes}分${p.verified ? '（確認済み）' : '（未確認の見積もり）'}`).join('\n') || '- なし';
  return `あなたは目覚まし管理アプリのアシスタントです。ユーザーの日本語の指示（音声入力の誤変換を含むことがあります）を読み取り、アラーム設定の変更案と短い返事をJSONで返します。

## 現在
- 日時（日本時間）: ${nowJST(now)}（${DAY_JA[weekdayKey(today)]}曜日）
- 今日の日付: ${today}

## アプリの仕組み
- 曜日ごとの基本パターンがあり、毎週その時刻に鳴ります。
- 日付ごとの「例外」で、その日だけ時刻を変えたり、鳴らさないようにできます。例外は基本パターンより優先されます。
- 1回の起床につき、最初の時刻のあと「interval分おきにextra回」追加で鳴らせます（スヌーズ代わり）。例: 6:00, extra=2, interval=5 → 6:00, 6:05, 6:10。
- 変更は保存するとiPhoneに反映されます（充電時か22時の自動同期、または手動の同期）。

## 曜日ごとの基本パターン
${weekly}

## 例外の日
${overrides}

## 起床時刻の計算に使う設定
- 家の最寄り駅: ${profile.homeStation || '未設定'}
- 支度時間（起きてから支度が終わるまで）: ${profile.prepMinutes}分
- 家から最寄り駅まで: ${profile.walkMinutes}分
- 余裕時間（集合時刻より前に着いていたい分）: ${profile.bufferMinutes}分

## 覚えている移動時間（最寄り駅 → 場所、電車・乗り換え・到着後の徒歩を含む）
${places}

## これから21日間の実際の予定
${upcoming.join('\n')}

## 使える変更（changes の op）
- override_time: 指定日だけ時刻を変える（date, time, 必要なら extra, interval）
- override_off: 指定日だけ鳴らさない（date）
- override_clear: 指定日の例外を消して基本パターンに戻す（date）
- weekly_time: 曜日の基本時刻を変える（weekday, time, 必要なら extra, interval）
- weekly_off: その曜日は基本的に鳴らさない（weekday）
- meeting: 集合時刻から起床時刻を逆算して、その日の目覚ましにする（date, meetTime, place, travelMinutes, travelSource, 必要なら prepMinutes, walkMinutes, bufferMinutes）。起床時刻の計算はアプリが行うので、time は入れない
- set_profile: 設定を恒久的に変える（homeStation, prepMinutes, walkMinutes, bufferMinutes のうち変えるものだけ）
- remember_place: 場所までの移動時間を覚える（place, travelMinutes）。ユーザーが「渋谷は50分」「移動は1時間だった」のように教えたとき

## ルール
- date は "YYYY-MM-DD"、time は 24時間表記の "HH:MM"、weekday は mon/tue/wed/thu/fri/sat/sun。
- 「明日」「明後日」「来週の水曜」などは上の現在日時から計算する。「来週」は次の月曜〜日曜。
- 現在時刻が0:00〜4:00で「明日の朝」と言われたら、今日の朝か翌日の朝か曖昧なので確認する。
- 「5時」は朝の5:00。「午後」「夜」と言われない限り午前と解釈する。
- 「〜日だけ」「明日は」のような一時的な指示は override_*。「毎週」「いつも」「これから」は weekly_*。
- extra や interval の指定がなければ、その日（曜日）の既存の設定を引き継ぐ。既存がなければ extra=0, interval=5。
- 過去の日付は変更しない。頼まれていない日は変更しない。
- 予定を聞かれただけ（「明日何時？」など）のときは changes を空にして reply で答える。
- 指示が曖昧なら、推測で変更せず changes を空にして reply で質問する。
- 「10時に渋谷集合」「明日13時に〇〇大学」のように集合・待ち合わせ・到着時刻を言われたら meeting を使う。date は集合する日。
  - place は短い地名に揃える（「渋谷駅ハチ公前」→「渋谷」）。
  - mapsQuery には、Googleマップで検索して1か所に決まる文字列を入れる（正式名称＋市区町村、例：「神戸市役所 神戸市中央区」）。施設名に自信がなければ、その最寄り駅名（例：「三ノ宮駅」）にする。
  - 覚えている移動時間にある場所なら、その分数を travelMinutes に入れ、travelSource は "saved"。
  - ユーザーが移動時間を言ったら、その値で travelSource は "user"（同時に remember_place も出す）。
  - 「マップで見たら合ってた」「その時間で大丈夫」と言われたら、その場所の今の分数で remember_place を出す（確認済みになる）。
  - それ以外は、最寄り駅からその場所までの電車での所要時間（乗り換え・待ち時間・到着後の徒歩を含む）を見積もり、travelSource は "estimate"。迷ったら長いほうの時間にする。
  - 家の最寄り駅が未設定なら、変更せずに最寄り駅を質問する。
  - 「支度を長めに」「今日はゆっくり準備したい」はその回だけ prepMinutes を増やす（量の指定がなければ +15分）。「いつも支度40分」のような恒久的な指示は set_profile。
  - 起床時刻が深夜（0:00〜4:00）になる場合も、そのまま出してよい。
- reply は日本語で1〜2文。変更する場合は「11/1（日）を5:00にします」のように日付・曜日・時刻を明記する。保存はユーザーが確認ボタンで行うので「保存しました」とは言わない。`;
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    changes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: OPS },
          date: { type: 'STRING' },
          weekday: { type: 'STRING', enum: DAYS },
          time: { type: 'STRING' },
          extra: { type: 'INTEGER' },
          interval: { type: 'INTEGER' },
          meetTime: { type: 'STRING' },
          place: { type: 'STRING' },
          mapsQuery: { type: 'STRING' },
          travelMinutes: { type: 'INTEGER' },
          travelSource: { type: 'STRING', enum: ['saved', 'user', 'estimate'] },
          prepMinutes: { type: 'INTEGER' },
          walkMinutes: { type: 'INTEGER' },
          bufferMinutes: { type: 'INTEGER' },
          homeStation: { type: 'STRING' },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'changes'],
};

// Tried in order when the chosen model is overloaded (503) or unavailable (404).
export const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const RETRYABLE = new Set([500, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callModel(model, apiKey, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}: ${json.error?.message || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}

// history: [{role: 'user'|'model', text}]
// onRetry(message) is called before each retry so the page can show progress.
export async function askGemini({ apiKey, model, data, history, now = new Date(), onRetry = () => {} }) {
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(data, now) }] },
    contents: history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  };
  const primary = model || DEFAULT_MODEL;
  const models = [primary, ...FALLBACK_MODELS.filter(m => m !== primary)];
  let lastError;
  for (const [i, m] of models.entries()) {
    // The first model gets one retry after a short wait; busy spikes often pass quickly.
    for (let attempt = 0; attempt < (i === 0 ? 2 : 1); attempt++) {
      try {
        return { ...parseReply(await callModel(m, apiKey, body)), model: m };
      } catch (e) {
        lastError = e;
        if (!RETRYABLE.has(e.status) && e.status !== 404) throw e;
        if (e.status === 404) break;
        if (attempt === 0 && i === 0) { onRetry('混み合っているので、もう一度試しています…'); await sleep(2000); }
      }
    }
    if (i + 1 < models.length) onRetry(`混み合っているので、別のモデル（${models[i + 1]}）で試しています…`);
  }
  throw new Error(`${lastError.message}（時間をおいて、もう一度送ってください）`);
}

export function parseReply(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AIの返事を読み取れませんでした');
  const obj = JSON.parse(match[0]);
  return { reply: String(obj.reply || ''), changes: Array.isArray(obj.changes) ? obj.changes : [] };
}

function slotFrom(change, previous) {
  return {
    time: change.time,
    extra: Number.isInteger(change.extra) ? change.extra : (previous?.extra ?? 0),
    interval: Number.isInteger(change.interval) ? change.interval : (previous?.interval ?? 5),
  };
}

const isMinutes = v => Number.isInteger(v) && v >= 0 && v <= 600;

// Work back from a meeting: wake = meet - buffer - travel - walk - prep. Returns the override to set.
function planMeeting(next, c, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) throw new Error(`日付が不正です: ${c.date}`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.meetTime || '')) throw new Error(`集合時刻が不正です: ${c.meetTime}`);
  const place = String(c.place || '').trim();
  if (!place) throw new Error('集合場所がわかりません');
  const profile = profileOf(next);
  if (!profile.homeStation) throw new Error('家の最寄り駅が未設定です（設定 → 起床時刻の計算）');
  const saved = next.places?.[place];
  let travel, source;
  if (c.travelSource === 'maps' && isMinutes(c.travelMinutes)) { travel = c.travelMinutes; source = 'maps'; }
  else if (c.travelSource === 'user' && isMinutes(c.travelMinutes)) { travel = c.travelMinutes; source = 'user'; }
  else if (saved) { travel = saved.minutes; source = saved.verified ? 'saved' : 'estimate'; }
  else if (isMinutes(c.travelMinutes) && c.travelMinutes > 0) { travel = c.travelMinutes; source = 'estimate'; }
  else throw new Error(`${place} までの移動時間がわかりません`);
  const prep = isMinutes(c.prepMinutes) ? c.prepMinutes : profile.prepMinutes;
  const walk = isMinutes(c.walkMinutes) ? c.walkMinutes : profile.walkMinutes;
  const buffer = isMinutes(c.bufferMinutes) ? c.bufferMinutes : profile.bufferMinutes;
  let wake = toMinutes(c.meetTime) - buffer - travel - walk - prep;
  let date = c.date;
  while (wake < 0) { wake += 1440; date = addDays(date, -1); }
  if (date < today) throw new Error('起床時刻が過去になります');
  const prev = resolveDay(next, date).slot;
  const slot = {
    time: fromMinutes(wake),
    extra: prev?.extra ?? 0,
    interval: prev?.interval ?? 5,
    note: `${place} ${c.meetTime.replace(/^0/, '')}集合`,
  };
  // Remember estimates (unverified) so the next request reuses the same number.
  if (!saved || source === 'user' || source === 'maps') {
    next.places = { ...(next.places || {}), [place]: { minutes: travel, verified: source !== 'estimate' } };
  }
  return { date, slot, place, travel, source, prep, walk, buffer, mapsSummary: c.mapsSummary };
}

// When the traveller must be at the meeting place for `change` (meeting time minus buffer), as a Date.
export function meetingArriveBy(data, change) {
  const buffer = isMinutes(change.bufferMinutes) ? change.bufferMinutes : profileOf(data).bufferMinutes;
  return new Date(new Date(`${change.date}T${change.meetTime}:00+09:00`).getTime() - buffer * 60000);
}

// Apply proposed changes to a copy of `data`.
// Returns {data, lines, warnings, links} or throws on invalid input.
export function applyChanges(data, changes, now = new Date()) {
  const next = JSON.parse(JSON.stringify(data));
  next.profile = profileOf(next);
  const today = todayJST(now);
  const lines = [];
  const warnings = [];
  const links = [];
  const unverified = [];
  const md = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${DAY_JA[weekdayKey(date)]}）`;
  // Profile and place updates first, so a meeting in the same reply uses them.
  const order = { set_profile: 0, remember_place: 1 };
  const sorted = [...changes].sort((a, b) => (order[a.op] ?? 2) - (order[b.op] ?? 2));
  for (const c of sorted) {
    if (!OPS.includes(c.op)) throw new Error(`不明な操作: ${c.op}`);
    if (c.op === 'set_profile') {
      if (typeof c.homeStation === 'string' && c.homeStation.trim()) {
        next.profile.homeStation = c.homeStation.trim();
        lines.push(`最寄り駅を ${next.profile.homeStation} にする`);
      }
      const names = { prepMinutes: '支度時間', walkMinutes: '家から駅まで', bufferMinutes: '余裕時間' };
      for (const [k, name] of Object.entries(names)) {
        if (!isMinutes(c[k])) continue;
        next.profile[k] = c[k];
        lines.push(`${name}を ${c[k]}分 にする（これから毎回）`);
      }
    } else if (c.op === 'remember_place') {
      const place = String(c.place || '').trim();
      if (!place || !isMinutes(c.travelMinutes) || c.travelMinutes === 0) throw new Error('覚える移動時間が不正です');
      next.places = { ...(next.places || {}), [place]: { minutes: c.travelMinutes, verified: true } };
      lines.push(`${place} までの移動を ${c.travelMinutes}分 として覚える`);
    } else if (c.op === 'meeting') {
      const m = planMeeting(next, c, today);
      next.overrides[m.date] = m.slot;
      lines.push(`${md(m.date)} ${m.slot.time} 起床（${m.slot.note}）`);
      lines.push(`内訳：支度${m.prep}分＋駅まで${m.walk}分＋移動${m.travel}分＋余裕${m.buffer}分`);
      if (m.source === 'maps') lines.push(`✓ Googleマップで計算（${m.mapsSummary || '電車'}）`);
      if (m.source === 'estimate') {
        warnings.push(`${m.place} までの移動${m.travel}分は未確認です。マップで確かめて、合っていれば下のチェックを入れて保存、違っていたら「${m.place}は○分」と教えてください。`);
        unverified.push(m.place);
      }
      links.push({ label: `Googleマップで確認（${next.profile.homeStation} → ${m.place}）`, url: mapsUrl(next.profile.homeStation, m.place) });
    } else if (c.op.startsWith('override_')) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) throw new Error(`日付が不正です: ${c.date}`);
      if (c.date < today) throw new Error(`過去の日付は変更できません: ${c.date}`);
      if (c.op === 'override_time') {
        const prev = resolveDay(next, c.date).slot;
        next.overrides[c.date] = slotFrom(c, prev);
        lines.push(`${md(c.date)} を ${describeSlot(next.overrides[c.date])} にする`);
      } else if (c.op === 'override_off') {
        next.overrides[c.date] = null;
        lines.push(`${md(c.date)} は鳴らさない`);
      } else {
        delete next.overrides[c.date];
        lines.push(`${md(c.date)} の例外を解除（${describeSlot(next.weekly[weekdayKey(c.date)])}）`);
      }
    } else {
      if (!DAYS.includes(c.weekday)) throw new Error(`曜日が不正です: ${c.weekday}`);
      if (c.op === 'weekly_time') {
        next.weekly[c.weekday] = slotFrom(c, next.weekly[c.weekday]);
        lines.push(`毎週${DAY_JA[c.weekday]}曜を ${describeSlot(next.weekly[c.weekday])} にする`);
      } else {
        next.weekly[c.weekday] = null;
        lines.push(`毎週${DAY_JA[c.weekday]}曜は鳴らさない`);
      }
    }
  }
  validate(next);
  return { data: next, lines, warnings, links, unverified: [...new Set(unverified)] };
}

// Chat assistant: turns Japanese requests ("明日は5時に起こして") into edits of alarms.json via Gemini.
// The model only proposes `changes`; the page shows them and saves only after the user confirms.

import { DAYS, DAY_JA, validate, resolveDay, expandTimes, todayJST, addDays, weekdayKey } from './schedule.js';

export const DEFAULT_MODEL = 'gemini-3.6-flash';
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const OPS = ['override_time', 'override_off', 'override_clear', 'weekly_time', 'weekly_off'];

function describeSlot(slot) {
  if (!slot) return 'なし';
  return slot.extra ? `${slot.time}（+${slot.interval || 5}分×${slot.extra}回）` : slot.time;
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

## これから21日間の実際の予定
${upcoming.join('\n')}

## 使える変更（changes の op）
- override_time: 指定日だけ時刻を変える（date, time, 必要なら extra, interval）
- override_off: 指定日だけ鳴らさない（date）
- override_clear: 指定日の例外を消して基本パターンに戻す（date）
- weekly_time: 曜日の基本時刻を変える（weekday, time, 必要なら extra, interval）
- weekly_off: その曜日は基本的に鳴らさない（weekday）

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
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'changes'],
};

// history: [{role: 'user'|'model', text}]
export async function askGemini({ apiKey, model, data, history, now = new Date() }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || DEFAULT_MODEL)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(data, now) }] },
    contents: history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message || res.statusText}`);
  const text = json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return parseReply(text);
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

// Apply proposed changes to a copy of `data`. Returns {data, lines} or throws on invalid input.
export function applyChanges(data, changes, now = new Date()) {
  const next = JSON.parse(JSON.stringify(data));
  const today = todayJST(now);
  const lines = [];
  const md = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${DAY_JA[weekdayKey(date)]}）`;
  for (const c of changes) {
    if (!OPS.includes(c.op)) throw new Error(`不明な操作: ${c.op}`);
    if (c.op.startsWith('override_')) {
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
  return { data: next, lines };
}

// Shared logic for the alarm manager. Used by index.html (browser) and tools/*.mjs (Node).
// The Shortcut on the iPhone only reads `schedule`, so every edit must call regenerate().

export const PREFIX = '⏰auto';
export const ONCE = '単発';
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_JA = { sun: '日', mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土' };
export const HORIZON_DAYS = 60;
const KEEP_PAST_OVERRIDE_DAYS = 7;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyData() {
  return {
    version: 1,
    timezone: 'Asia/Tokyo',
    weekly: Object.fromEntries(DAYS.map(d => [d, null])),
    overrides: {},
    profile: defaultProfile(),
    places: {},
    schedule: {},
    updatedAt: null,
  };
}

// Inputs for working back from a meeting time to a wake-up time.
export function defaultProfile() {
  return { homeStation: '', prepMinutes: 30, walkMinutes: 20, bufferMinutes: 10 };
}
export const PROFILE_KEYS = ['prepMinutes', 'walkMinutes', 'bufferMinutes'];

// Today's date in JST as YYYY-MM-DD.
export function todayJST(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayKey(dateStr) {
  return DAYS[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const t = (h * 60 + m + mins) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// "06:30" -> "6:30 AM". Shortcuts parses this form unambiguously.
function toAmPm(time) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Expand {time, extra, interval} into the list of ring times.
export function expandTimes(slot) {
  const times = [slot.time];
  for (let i = 1; i <= (slot.extra || 0); i++) times.push(addMinutes(slot.time, i * (slot.interval || 5)));
  return times;
}

export function validateSlot(slot, where) {
  if (slot === null) return;
  if (typeof slot !== 'object' || !TIME_RE.test(slot.time || '')) throw new Error(`${where}: time は "HH:MM"（24時間）で指定してください`);
  if (slot.extra != null && !(Number.isInteger(slot.extra) && slot.extra >= 0 && slot.extra <= 10)) throw new Error(`${where}: extra は 0〜10 の整数`);
  if (slot.interval != null && !(Number.isInteger(slot.interval) && slot.interval >= 1 && slot.interval <= 60)) throw new Error(`${where}: interval は 1〜60 の整数（分）`);
}

export function validate(data) {
  for (const d of DAYS) validateSlot(data.weekly?.[d] ?? null, `weekly.${d}`);
  for (const [date, slot] of Object.entries(data.overrides || {})) {
    if (!DATE_RE.test(date)) throw new Error(`overrides: 日付 "${date}" は YYYY-MM-DD で指定してください`);
    validateSlot(slot, `overrides.${date}`);
  }
  for (const k of PROFILE_KEYS) {
    const v = data.profile?.[k];
    if (v != null && !(Number.isInteger(v) && v >= 0 && v <= 300)) throw new Error(`profile.${k} は 0〜300 の整数（分）`);
  }
  for (const [place, p] of Object.entries(data.places || {})) {
    if (!(Number.isInteger(p?.minutes) && p.minutes > 0 && p.minutes <= 600)) throw new Error(`places.${place}: minutes は 1〜600 の整数（分）`);
  }
}

// What should ring on `date`: {source, slot}. slot === null means no alarm.
export function resolveDay(data, date) {
  if (Object.prototype.hasOwnProperty.call(data.overrides || {}, date)) {
    return { source: 'override', slot: data.overrides[date] };
  }
  return { source: 'weekly', slot: data.weekly[weekdayKey(date)] ?? null };
}

// Alarms the Shortcut should have ON for `date`. Weekly days use repeating alarms labelled
// "⏰auto 金 06:30" so they keep ringing even if a sync is missed; overrides use one-shot
// alarms labelled "⏰auto 単発 05:00".
export function alarmsFor(data, date) {
  const { source, slot } = resolveDay(data, date);
  if (!slot) return [];
  const ja = DAY_JA[weekdayKey(date)];
  // A meeting-based alarm carries where to go and the travel minutes its time assumed, so the
  // Shortcut can re-check the travel time with Apple Maps and shift the alarm by the difference.
  const trip = slot.meeting ? { dest: slot.meeting.dest, travel: slot.meeting.travel } : {};
  return expandTimes(slot).map(time => source === 'weekly'
    ? { label: `${PREFIX} ${ja} ${time}`, time, ampm: toAmPm(time), repeat: `${ja}曜日` }
    : { label: `${PREFIX} ${ONCE} ${time}`, time, ampm: toAmPm(time), repeat: '', ...trip });
}

// Rebuild `schedule` for today..today+HORIZON and drop overrides that are long past.
export function regenerate(data, now = new Date()) {
  validate(data);
  const today = todayJST(now);
  const cutoff = addDays(today, -KEEP_PAST_OVERRIDE_DAYS);
  for (const date of Object.keys(data.overrides)) if (date < cutoff) delete data.overrides[date];
  data.overrides = Object.fromEntries(Object.entries(data.overrides).sort(([a], [b]) => a.localeCompare(b)));

  // `candidates` lists today's and tomorrow's alarms with their exact ring time. The Shortcut
  // looks up today's entry and keeps the ones ringing within the next 24 hours, so same-day
  // changes are picked up too. `scope`/`labels`/`alarms` are the older next-morning format.
  const withAt = date => alarmsFor(data, date).map(a => ({ ...a, at: `${date}T${a.time}:00+09:00` }));
  const schedule = {};
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const date = addDays(today, i);
    const alarms = alarmsFor(data, date);
    schedule[date] = {
      scope: `${PREFIX} ${DAY_JA[weekdayKey(date)]} `,
      labels: alarms.map(a => a.label).join('\n'),
      alarms,
      candidates: [...withAt(date), ...withAt(addDays(date, 1))],
    };
  }
  data.schedule = schedule;
  // Flat list of every alarm from today to the horizon, for Shortcuts that filter by time only.
  data.upcoming = Object.keys(schedule).flatMap(withAt);
  data.updatedAt = now.toISOString();
  return data;
}

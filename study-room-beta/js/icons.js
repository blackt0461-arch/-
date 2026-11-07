// 線のアイコン集（24×24、線の色は文字色、線の太さは CSS の stroke-width で決める）
// 使い方：icon('home') → '<span class="ic" aria-hidden="true"><svg ...></svg></span>'

const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// 小数を短く
const f = (n) => +n.toFixed(2);

// 歯車の外形（計算で作る）
function gearPath(cx, cy, rOut, rIn, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const w = step * 0.2; // 歯の半分の幅（角度）
    pts.push([a - step / 2 + w * 0.6, rIn], [a - w, rOut], [a + w, rOut], [a + step / 2 - w * 0.6, rIn]);
  }
  return 'M' + pts.map(([a, r]) => `${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`).join('L') + 'z';
}

// 星の外形（計算で作る）
function starPath(cx, cy, rOut, rIn, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const r = i % 2 ? rIn : rOut;
    pts.push(`${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`);
  }
  return 'M' + pts.join('L') + 'z';
}

// 放射状の短い線（太陽の光など）
function rays(cx, cy, r1, r2, n, from = 0, to = Math.PI * 2, closed = true) {
  let d = '';
  const cnt = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / cnt;
    d += `M${f(cx + Math.cos(a) * r1)} ${f(cy + Math.sin(a) * r1)}L${f(cx + Math.cos(a) * r2)} ${f(cy + Math.sin(a) * r2)}`;
  }
  return d;
}

export const ICONS = {
  // ---- 画面・ナビ ----
  home: svg('<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9"/><path d="M10 20.5v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5.5"/>'),
  pencil: svg('<path d="M15.6 4.4a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L8.5 19.5 4 20.5l1-4.5z"/><path d="m13.5 6.5 4 4"/>'),
  chart: svg('<path d="M4 3.5v15a2 2 0 0 0 2 2h14.5"/><path d="M8.5 16.5v-4M12.5 16.5V8M16.5 16.5v-6.5"/>'),
  gear: svg(`<path d="${gearPath(12, 12, 9.5, 7.2, 8)}"/><circle cx="12" cy="12" r="3"/>`),
  flame: svg('<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3 1.9-5 3.4-6.7.4 1.7 1.3 2.9 2.4 3.4.3-3.4 1.8-6.2 4-8.1.4 2.9 1.9 4.6 3.1 6.2.8 1.2 1.1 2.6 1.1 4.2 0 4.2-3.1 7.6-7 7.6z"/><path d="M12 21c-1.7 0-3-1.2-3-2.9 0-1.5 1-2.5 1.8-3.4.3.8.8 1.3 1.4 1.5.3-1 .9-1.9 1.6-2.5.5 1.1 1.2 2.1 1.2 3.9 0 2.1-1.3 3.4-3 3.4z"/>'),
  gift: svg('<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12"/><path d="M12 8v12.5"/><path d="M12 8C10.6 4.4 6.5 3.4 6.5 5.9 6.5 7.3 8.2 8 12 8z"/><path d="M12 8c1.4-3.6 5.5-4.6 5.5-2.1 0 1.4-1.7 2.1-5.5 2.1z"/>'),
  book: svg('<path d="M5 18.5V5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2 1.5 1.5 0 0 0 1.5 1.5H19"/><path d="M10 3v6.5l2-1.4 2 1.4V3"/>'),
  camera: svg('<path d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.6-2.5h5.2l1.6 2.5h2.3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.4c2.1.8 3.5 2.8 3.5 5.6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7"/>'),
  userPlus: svg('<circle cx="10" cy="8" r="4"/><path d="M2.5 21c0-4.1 3.4-7 7.5-7 1.5 0 2.9.4 4.1 1.1"/><path d="M19 14v6M16 17h6"/>'),
  shield: svg('<path d="M12 3 4.5 5.8v5.7c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V5.8z"/><path d="m9 12 2.2 2.2L15.2 10"/>'),
  box: svg('<path d="M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8l-8.5-4.3z"/><path d="M3.5 7.5 12 11.8l8.5-4.3M12 11.8v9"/><path d="m7.8 5.3 8.5 4.4"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="m15 5-7 7 7 7"/>'),
  chevronRight: svg('<path d="m9 5 7 7-7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="m4.5 12.5 5 5L19.5 7"/>'),
  lock: svg('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-8-8c2.3 0 4.4 1 5.9 2.5L20 8.5"/><path d="M20 3.5v5h-5"/>'),
  refresh: svg('<path d="M19.6 10A8 8 0 0 0 5.6 7.2L4 9"/><path d="M4 4v5h5"/><path d="M4.4 14a8 8 0 0 0 14 2.8L20 15"/><path d="M20 20v-5h-5"/>'),
  move: svg('<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  trash: svg('<path d="M4 6.5h16"/><path d="M9.5 6.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="m6 6.5 1 13a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-13"/><path d="M10 11v5.5M14 11v5.5"/>'),
  snow: svg('<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2M4.6 10.3l3.1-.5-1.1-3M19.4 13.7l-3.1.5 1.1 3M4.6 13.7l3.1.5-1.1 3M19.4 10.3l-3.1-.5 1.1-3"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>'),
  grid: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>'),
  download: svg('<path d="M12 3.5v11.5M7 10l5 5 5-5"/><path d="M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>'),
  logout: svg('<path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="15.5" cy="9" r="1.6"/><path d="m3.5 17 5-5.5 4 4.5 2.5-2.5 5 4.5"/>'),
  cloud: svg('<path d="M7 19a4.5 4.5 0 0 1-.7-8.9A6 6 0 0 1 17.8 9 5 5 0 0 1 17 19z"/>'),
  cloudOff: svg('<path d="m3 3 18 18"/><path d="M17.5 19H7a4.5 4.5 0 0 1-.7-8.9 6 6 0 0 1 1.1-2.6"/><path d="M10.2 4.8A6 6 0 0 1 17.8 9a5 5 0 0 1 3.4 7.7"/>'),
  alert: svg('<path d="M10.3 4.3 2.7 17.8A2 2 0 0 0 4.4 20.8h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5V14M12 17.3v.01"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.01"/>'),
  menu: svg('<path d="M4 6.5h16M4 12h16M4 17.5h16"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'),
  heart: svg('<path d="M12 20s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 6.8a4.4 4.4 0 0 1 8 2.6C20 15.3 12 20 12 20z"/>'),
  coin: svg('<ellipse cx="12" cy="7" rx="7.5" ry="3.5"/><path d="M4.5 7v5c0 1.9 3.4 3.5 7.5 3.5s7.5-1.6 7.5-3.5V7"/><path d="M4.5 12v5c0 1.9 3.4 3.5 7.5 3.5s7.5-1.6 7.5-3.5v-5"/>'),

  // ---- ごほうび・成績 ----
  star: svg(`<path d="${starPath(12, 12.6, 9.6, 4.3)}"/>`),
  trophy: svg('<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5v1.5a3.5 3.5 0 0 0 3 3.5M17 5.5h2.5v1.5a3.5 3.5 0 0 1-3 3.5"/><path d="M12 14v3.5"/><path d="M8 20.5h8"/><path d="M9 20.5c0-1.8 1.3-3 3-3s3 1.2 3 3"/>'),
  medal: svg('<path d="M8 2.5l2.6 6M16 2.5l-2.6 6"/><circle cx="12" cy="14.5" r="6"/><path d="M12 11.6l.9 1.9 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/>'),
  mission: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m8.5 10 1.5 1.5 2.5-2.5M8.5 15.5l1.5 1.5 2.5-2.5"/><path d="M14.5 10.5H16M14.5 16H16"/>'),
  sparkle: svg('<path d="M10.5 3c.6 4.6 1.6 5.6 6.2 6.2-4.6.6-5.6 1.6-6.2 6.2-.6-4.6-1.6-5.6-6.2-6.2C8.9 8.6 9.9 7.6 10.5 3z"/><path d="M18 14c.3 2.2.8 2.7 3 3-2.2.3-2.7.8-3 3-.3-2.2-.8-2.7-3-3 2.2-.3 2.7-.8 3-3z"/>'),
  level: svg('<path d="M12 2.8 19.5 7v10L12 21.2 4.5 17V7z"/><path d="m8.5 11.5 3.5-2.2 3.5 2.2M8.5 15.2l3.5-2.2 3.5 2.2"/>'),

  // ---- 時間帯 ----
  sun: svg(`<circle cx="12" cy="12" r="4"/><path d="${rays(12, 12, 6.8, 9.2, 8, -Math.PI / 2)}"/>`),
  moon: svg('<path d="M19.8 14.6A8.3 8.3 0 1 1 9.4 4.2a6.6 6.6 0 0 0 10.4 10.4z"/>'),
  sunset: svg(`<path d="M3 18h18M7 21h10"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="${rays(12, 18, 7.2, 8.9, 4, Math.PI * 1.05, Math.PI * 1.95, false)}"/><path d="M12 2.5V8M9.8 6 12 8.2 14.2 6"/>`),

  // ---- 家具・ジャンル ----
  sofa: svg('<path d="M5 10.5V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2.5"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M5.5 18v2M18.5 18v2"/>'),
  lamp: svg('<path d="M8.5 3h7l3 7.5h-13z"/><path d="M12 10.5V20.5M8 20.5h8"/>'),
  chair: svg('<path d="M7 11.5V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6.5"/><rect x="5.5" y="11.5" width="13" height="3" rx="1"/><path d="M7 14.5V21M17 14.5V21"/>'),
  table: svg('<rect x="2.5" y="7" width="19" height="3" rx="1"/><path d="M5 10v10M19 10v10M5 14h14"/>'),
  shelf: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16"/><path d="M7.5 9V5.5M10 9V6M13 15v-3.5l2.2.6V15"/>'),
  plant: svg('<path d="M6.5 14h11l-1.6 6.5a1 1 0 0 1-1 .8H9.1a1 1 0 0 1-1-.8z"/><path d="M12 14V7.5"/><path d="M12 9.5c0-3.4 2.2-5.6 6.5-5.6 0 3.8-2.3 5.6-6.5 5.6z"/><path d="M12 11.5c0-2.6-1.9-4.6-6-4.6 0 3 1.9 4.6 6 4.6z"/>'),
  vase: svg('<path d="M9 3h6"/><path d="M10 3v3.3C7.5 7.8 6 10 6 13.2 6 17.5 8.6 21 12 21s6-3.5 6-7.8c0-3.2-1.5-5.4-4-6.9V3"/>'),
  frame: svg('<path d="M8.5 6 12 3l3.5 3"/><rect x="4" y="6" width="16" height="15" rx="1"/><rect x="7.5" y="9.5" width="9" height="8" rx=".5"/>'),
  curtain: svg('<path d="M3 3.5h18"/><path d="M5 3.5V21h4c-1.6-2.8-1.6-5.6 1.2-8.5C9.3 9.8 9 6.8 9.6 3.5"/><path d="M19 3.5V21h-4c1.6-2.8 1.6-5.6-1.2-8.5 .9-2.7 1.2-5.7.6-9"/><path d="M8.5 12.6l2.2-.2M15.5 12.6l-2.2-.2"/>'),
  brush: svg('<rect x="3.5" y="3" width="14" height="5" rx="1.5"/><path d="M17.5 5.5h2a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H12v2.5"/><rect x="10.5" y="13.5" width="3" height="7.5" rx="1"/>'),
  door: svg('<path d="M6 21V4.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M3.5 21h17"/><path d="M14.8 12h.01"/>'),
  window: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>'),
  music: svg('<path d="M9 18V5.5l11-2.5v13"/><path d="M9 9.5l11-2.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),

  // ---- 部屋 ----
  cook: svg('<path d="M4 11h16v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M2.5 11h19"/><path d="M9 7.5c0-1.5 1-1.5 1-3M14 7.5c0-1.5 1-1.5 1-3"/>'),
  bath: svg('<path d="M3 12h18v2.5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V5.5A2 2 0 0 1 8 3.5a2 2 0 0 1 2 2"/><path d="M7.5 19.5 6.5 21M16.5 19.5l1 1.5"/>'),
  drop: svg('<path d="M12 3.2c3.2 4 5.5 7.2 5.5 10.3a5.5 5.5 0 0 1-11 0c0-3.1 2.3-6.3 5.5-10.3z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>'),
  attic: svg('<path d="M2.5 12 12 3.5l9.5 8.5"/><path d="M5 10v10.5h14V10"/><rect x="9.5" y="10.5" width="5" height="4.5" rx=".5"/><path d="M12 10.5V15"/>'),
  hanger: svg('<path d="M12 7.5a2 2 0 1 1 2-2"/><path d="M12 7.5v1.2L3.5 15a1.3 1.3 0 0 0 .8 2.4h15.4a1.3 1.3 0 0 0 .8-2.4L12 8.7"/>'),
  tatami: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 12h9M12.5 3.5v17M12.5 9.5h8"/>'),
  palette: svg('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-1 1.3-2-.6-1.3.1-2.5 1.5-2.5h2.2a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  wave: svg('<path d="M2.5 9c2.4 0 2.4-2 4.75-2S9.6 9 12 9s2.4-2 4.75-2S19.1 9 21.5 9"/><path d="M2.5 14c2.4 0 2.4-2 4.75-2S9.6 14 12 14s2.4-2 4.75-2 2.35 2 4.75 2"/><path d="M2.5 19c2.4 0 2.4-2 4.75-2S9.6 19 12 19s2.4-2 4.75-2 2.35 2 4.75 2"/>'),
  palm: svg('<path d="M12.5 21c.4-4 .3-8-1-11.5"/><path d="M11.5 9.5C9.5 6.5 6.5 6 3.5 7.5c2.5.2 4.5 1 5.5 3"/><path d="M11.5 9.5c2-3 5-3.5 8-2-2.5.2-4.5 1-5.5 3"/><path d="M11.5 9.5C11 6.5 9 4.5 6 4c1.5 1.5 2.5 3 2.5 5"/><path d="M11.5 9.5c.8-3 3-4.8 6-5-1.5 1.4-2.6 3-2.8 5"/><path d="M7 21h11"/>'),

  // ---- 教科 ----
  magnet: svg('<path d="M4.5 4h5v8a2.5 2.5 0 0 0 5 0V4h5v8a7.5 7.5 0 0 1-15 0z"/><path d="M4.5 8h5M14.5 8h5"/>'),
  ruler: svg('<path d="M3 16.8 16.8 3l4.2 4.2L7.2 21z"/><path d="m6.5 13.3 2 2M9 10.8l1.4 1.4M11.5 8.3l2 2M14 5.8l1.4 1.4"/>'),
  calc: svg('<rect x="5" y="2.8" width="14" height="18.4" rx="2.4"/><path d="M8.2 6.6h7.6M8.6 11h.01M12 11h.01M15.4 11h.01M8.6 14.4h.01M12 14.4h.01M15.4 14.4h.01M8.6 17.8h.01M12 17.8h.01M15.4 17.8h.01"/>'),
  chat: svg('<path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10.5L6 20.5V17h-.5A1.5 1.5 0 0 1 4 15.5v-10A1.5 1.5 0 0 1 5.5 4z"/><path d="M8.5 9h7M8.5 12.5h4.5"/>'),
  feather: svg('<path d="M20 4c-7.8-.4-13 4.6-13.4 13.4C15.4 17 20.4 11.8 20 4z"/><path d="M3.5 20.5 15 9"/><path d="M9.5 14.5h5.8"/>'),
  flask: svg('<path d="M9 3h6"/><path d="M10 3v6.2L4.6 18.3A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.7L14 9.2V3"/><path d="M7 15h10"/>'),
  bookOpen: svg('<path d="M12 6.5C10 5 7.2 4.5 3 4.5v14c4.2 0 7 .5 9 2 2-1.5 4.8-2 9-2v-14c-4.2 0-7 .5-9 2z"/><path d="M12 6.5v14"/>'),
  scroll: svg('<path d="M17 20.5H6.5A2.5 2.5 0 0 1 4 18v-1h10v1a2.5 2.5 0 0 0 5 0V6a2.5 2.5 0 0 1 2.5-2.5"/><path d="M6.5 17V6a2.5 2.5 0 0 1 2.5-2.5h12.5"/><path d="M10 8h5M10 11.5h5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>'),
};

// ジャンル id → アイコン名
export const GENRE_ICON = {
  light: 'lamp', sofa: 'sofa', chair: 'chair', table: 'table', storage: 'shelf', plant: 'plant',
  decor: 'vase', wallart: 'frame', textile: 'curtain', interior: 'brush', fixture: 'door', hobby: 'music',
};

// 教科 id → アイコン名
export const SUBJECT_ICON = {
  physics: 'magnet', math: 'ruler', english: 'chat',
  chem: 'flask', jp: 'bookOpen', social: 'globe',
};

// アイコンを HTML 文字列で返す（知らない名前は空の枠）
export function icon(name, cls = '') {
  const s = ICONS[name] || svg('');
  return `<span class="ic ${cls}" aria-hidden="true">${s}</span>`;
}

// ルーンランド：自作の絵（SVG）。絵文字のかわりに使う。どれも 32×32 の中にかく
const INK = '#5b4636';
const s = (body) => `<svg class="gi" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const P = {
  // ---- 魔法カード ----
  dragon: `<path d="M5 22c2-7 7-11 13-11 4 0 7 2 8 5l-3 1 2 3-4-1c-1 3-4 5-8 5H7z" fill="#e86b3a"/><path d="M14 11l-2-5 4 3 1-4 2 5" fill="#f2a24a"/><circle cx="20" cy="15" r="1.2" fill="${INK}" stroke="none"/><path d="M26 19c2 0 3 1 4 3M26 21c1 1 2 2 2 4" stroke="#e3a93b" stroke-width="2"/>`,
  shield: `<path d="M16 4l10 4v7c0 7-5 11-10 13C11 26 6 22 6 15V8z" fill="#8fc3e0"/><path d="M16 8l6 2.5v4.5c0 4.5-3 7-6 8.5-3-1.5-6-4-6-8.5v-4.5z" fill="#d7ecf7"/><path d="M16 11v9M12.5 15h7" stroke="#3f7fb0"/>`,
  portal: `<ellipse cx="16" cy="16" rx="11" ry="12" fill="#c9b6f2"/><path d="M16 9c4 0 6 3 6 6s-3 5-5.5 5-4-2-4-4 1.5-3 3.5-3 2.5 1 2.5 2" stroke="#6a3fd0" stroke-width="2"/><path d="M5 28h22" stroke-width="2"/>`,
  hero: `<path d="M7 25L22 6l3 1-1 3L9 27z" fill="#e8e3d6"/><path d="M25 25L10 6l-3 1 1 3 15 17z" fill="#e8e3d6"/><path d="M6 21l5 5M26 21l-5 5" stroke="#b9773a" stroke-width="2.6"/>`,
  dice: `<rect x="6" y="6" width="20" height="20" rx="5" fill="#fffaf0"/><circle cx="11.5" cy="11.5" r="1.8" fill="#d9573f" stroke="none"/><circle cx="16" cy="16" r="1.8" fill="${INK}" stroke="none"/><circle cx="20.5" cy="20.5" r="1.8" fill="${INK}" stroke="none"/><circle cx="20.5" cy="11.5" r="1.8" fill="${INK}" stroke="none"/><circle cx="11.5" cy="20.5" r="1.8" fill="${INK}" stroke="none"/>`,
  storm: `<path d="M5 8h20M8 13h17M10 18h12M13 23h7M15 27h3" stroke="#6b8fa8" stroke-width="2.4"/><path d="M24 4c3 2 3 6 0 8" stroke="#6b8fa8"/>`,
  treasure: `<path d="M9 6h14l5 7-12 14L4 13z" fill="#9ee0e4"/><path d="M4 13h24M12 6l-3 7 7 14 7-14-3-7" stroke="#2f8a96"/>`,
  thunder: `<path d="M18 3L8 18h7l-3 11 12-16h-7l4-10z" fill="#ffe066" stroke="#c4862a"/><path d="M4 8l3 1M25 24l3 1" stroke="#c4862a"/>`,
  knights: `<path d="M9 27h15l-1-4c3-2 4-6 2-9l-4-5-3-4-1 4-5 3-3 5 3 2 3-2 2 3-6 5z" fill="#d8cbb8"/><circle cx="18.5" cy="11" r="1.1" fill="${INK}" stroke="none"/><path d="M14 5l-2-2M7 27h19" /><path d="M23 7l5-4M25 9l4-2" stroke="#d9573f" stroke-width="2"/>`,
  catapult: `<path d="M5 26h22M8 26l4-7h9l3 7" fill="#b9773a"/><path d="M14 19L23 6" stroke="#8a5a3b" stroke-width="2.4"/><circle cx="24" cy="5" r="3" fill="#a8a29a"/><circle cx="10" cy="27" r="2.5" fill="#8a5a3b"/><circle cx="22" cy="27" r="2.5" fill="#8a5a3b"/>`,
  seal: `<circle cx="16" cy="16" r="11" fill="#e4d4ff" stroke="#7a4fd6"/><path d="M9 9l14 14M23 9L9 23" stroke="#7a4fd6" stroke-width="2.6"/><circle cx="16" cy="16" r="4" fill="#fff" stroke="#7a4fd6"/>`,
  thief: `<path d="M8 14c0-6 4-9 8-9s8 3 8 9" fill="#5b4636"/><rect x="7" y="13" width="18" height="5" rx="2.5" fill="#3a3a3a"/><circle cx="12" cy="15.5" r="1.3" fill="#fff" stroke="none"/><circle cx="20" cy="15.5" r="1.3" fill="#fff" stroke="none"/><path d="M10 27c1-5 3-8 6-8s5 3 6 8" fill="#7a6a5a"/><circle cx="25" cy="24" r="4" fill="#f2c25a"/>`,
  swap: `<path d="M6 11h17l-4-4M26 21H9l4 4" stroke="#5aa36a" stroke-width="2.6"/><path d="M5 15l5-5 5 5-5 5z" fill="#e9a3a0" stroke-width="1.2"/><path d="M17 17l5-5 5 5-5 5z" fill="#9fb9ea" stroke-width="1.2"/>`,
  wrath: `<path d="M4 18c3-7 9-11 15-10l5-4v5c3 1 5 4 5 7l-4 1 1 3-5-1-3 5H8z" fill="#9a2f2a"/><path d="M14 8l-3-5 5 3 1-4 2 5" fill="#f2c25a"/><circle cx="21" cy="12" r="1.4" fill="#ffe066" stroke="none"/><path d="M8 25c2 2 6 3 9 2" stroke="#ff7a2a" stroke-width="2"/>`,
  legend: `<path d="M16 3l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z" fill="#ffe066" stroke="#c4862a"/><path d="M16 22v7M12 29h8" stroke-width="2"/>`,
  quake: `<path d="M3 20h26" stroke-width="2"/><path d="M5 20l4-4 3 4 4-7 4 7 3-3 4 3" fill="#c9b48e"/><path d="M16 21l-2 3 3 2-2 4" stroke="#d9573f" stroke-width="1.8"/><path d="M3 9c3-2 5 2 8 0M21 7c3-2 5 2 8 0" stroke="#8a735c"/>`,
  // ---- イベント ----
  raid: `<path d="M4 20c3-6 8-9 14-9l5-5 1 5c3 1 5 3 5 6l-4 1 1 3-5-1-2 4H8z" fill="#7aa35a"/><circle cx="21" cy="15" r="1.3" fill="${INK}" stroke="none"/><path d="M8 25l-2 3M13 25l-1 3" /><path d="M18 11l-1-5 3 2" fill="#e3a93b"/>`,
  wave: `<path d="M3 22c3-1 4-8 10-9 5-1 8 3 6 6-1 2-4 2-5 0 3 0 3-4 0-4-4 0-5 7-11 9" fill="#8fc3e0"/><path d="M3 27c3 0 4-2 7-2s4 2 7 2 4-2 7-2 4 2 6 2" stroke="#3f7fb0" stroke-width="2"/>`,
  gold: `<circle cx="13" cy="18" r="8" fill="#f2c25a"/><circle cx="13" cy="18" r="5" stroke="#c4862a"/><circle cx="22" cy="10" r="5.5" fill="#f2c25a"/><path d="M22 7.5v5" stroke="#c4862a"/>`,
  glow: `<path d="M16 3l2.5 8.5L27 14l-8.5 2.5L16 25l-2.5-8.5L5 14l8.5-2.5z" fill="#f4eeff" stroke="#7a4fd6"/><path d="M26 22l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#f2c25a" stroke="#c4862a" stroke-width="1"/>`,
  fairy: `<circle cx="16" cy="11" r="3.5" fill="#fbe3c8"/><path d="M13 16h6l2 9h-10z" fill="#f7c6e3"/><path d="M13 16c-6-6-10-1-8 3s6 1 8-1M19 16c6-6 10-1 8 3s-6 1-8-1" fill="#e4f6f9" stroke="#7fb4c8"/><path d="M24 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#f2c25a" stroke="none"/>`,
  meteor: `<path d="M27 3L15 15M24 3l-9 9M27 7l-8 8" stroke="#f2a24a" stroke-width="2"/><circle cx="12" cy="20" r="7" fill="#8a735c"/><circle cx="10" cy="18" r="1.6" fill="#5b4636" stroke="none"/><circle cx="14" cy="22" r="1.2" fill="#5b4636" stroke="none"/><path d="M3 29h18" stroke="#d9573f" stroke-width="2"/>`,
  volcano: `<path d="M3 28l8-13h10l8 13z" fill="#8a735c"/><path d="M11 15l2 3 3-2 3 2 2-3" fill="#e86b3a" stroke="#c4462a"/><path d="M14 12c-1-3 1-5 0-8M18 12c1-3-1-5 1-8" stroke="#e86b3a" stroke-width="2"/><circle cx="10" cy="6" r="2" fill="#bdb3a6" stroke="none"/><circle cx="23" cy="5" r="2.5" fill="#bdb3a6" stroke="none"/>`,
  tornado: `<path d="M4 6h24M7 11h18M10 16h12M12 21h8M14 26h4" stroke="#7d8fa0" stroke-width="2.6"/><path d="M27 6c0 3-4 3-4 5s3 2 2 5" stroke="#7d8fa0"/>`,
  blizzard: `<path d="M16 3v26M5 9.5l22 13M27 9.5l-22 13" stroke="#5aa0d0" stroke-width="2"/><path d="M13 5l3 3 3-3M13 27l3-3 3 3M5 14l4-1-1-4M27 18l-4 1 1 4M5 18l4 1-1 4M27 14l-4-1 1-4" stroke="#5aa0d0"/>`,
  eclipse: `<circle cx="16" cy="16" r="9" fill="#ffe066" stroke="#c4862a"/><circle cx="19" cy="14" r="8" fill="#3d3550" stroke="#3d3550"/><path d="M16 2v3M16 27v3M2 16h3M27 16h3M6 6l2 2M24 24l2 2M6 26l2-2" stroke="#c4862a"/>`,
  ghost: `<path d="M7 28V14a9 9 0 0 1 18 0v14l-3-2-3 2-3-2-3 2-3-2z" fill="#eef2fb" stroke="#7a86a8"/><circle cx="12.5" cy="14" r="1.8" fill="#3d3550" stroke="none"/><circle cx="19.5" cy="14" r="1.8" fill="#3d3550" stroke="none"/><path d="M14 19.5q2 2 4 0" stroke="#7a86a8"/>`,
  village: `<path d="M4 27v-9l5-5 5 5v9zM16 27v-8l6-6 6 6v8z" fill="#fffaf0"/><path d="M3 19l6-6 6 6M15 20l7-7 7 7" stroke="#c8553d" stroke-width="2.2"/><rect x="7.5" y="21" width="3" height="6" fill="#c4a77a"/>`,
  shrine: `<path d="M4 28h24M7 28V15M12.5 28V15M19.5 28V15M25 28V15" stroke-width="2"/><path d="M3 14L16 5l13 9z" fill="#f4eeff" stroke="#7a4fd6"/><path d="M16 8v3" stroke="#7a4fd6"/>`,
  mine: `<path d="M3 28c0-14 6-19 13-19s13 5 13 19z" fill="#8a735c"/><path d="M10 28c0-7 3-10 6-10s6 3 6 10z" fill="#3a2e24"/><path d="M6 6l8 8M14 6l-8 8" stroke="#8a5a3b" stroke-width="2"/><circle cx="25" cy="8" r="3.5" fill="#f2c25a" stroke="#c4862a"/>`,
  tower: `<path d="M11 28l1.5-17h7L21 28z" fill="#e8e0d0"/><path d="M9 11h14V6h-3v2.5h-2.5V6h-3v2.5H12V6H9z" fill="#e8e0d0"/><rect x="14.5" y="15" width="3" height="4" rx="1.5" fill="#5b4636" stroke="none"/><path d="M16 6V2l4 1.5-4 1.5" fill="#e3a93b"/>`,
  // ---- その他 ----
  chest: `<rect x="5" y="14" width="22" height="12" rx="2" fill="#b9773a"/><path d="M5 15c0-6 4-8 11-8s11 2 11 8z" fill="#d18f45"/><path d="M5 15h22" /><rect x="14" y="13" width="4" height="6" rx="1" fill="#f2c25a"/>`,
  yay: `<path d="M8 28V5" stroke-width="2"/><path d="M8 6c5-2 8 2 13 0l3 8c-5 2-8-2-13 0z" fill="#e3a93b"/><path d="M22 20l1.5 3 3 .5-2.2 2 .6 3-2.9-1.5-2.9 1.5.6-3-2.2-2 3-.5z" fill="#f2c25a" stroke="#c4862a" stroke-width="1"/>`,
  oops: `<path d="M16 4l10 4v7c0 7-5 11-10 13C11 26 6 22 6 15V8z" fill="#e8d8c4"/><path d="M15 6l3 7-4 4 3 5-2 5" stroke="#d9573f" stroke-width="1.8"/>`,
  crown: `<path d="M5 24l-1-14 6 5 6-9 6 9 6-5-1 14z" fill="#f2c25a"/><path d="M5 24h22" stroke-width="2"/><circle cx="16" cy="18" r="1.6" fill="#d9573f" stroke="none"/>`,
  bot: `<rect x="7" y="9" width="18" height="15" rx="5" fill="#cfe0d8"/><path d="M16 9V5" /><circle cx="16" cy="4" r="1.6" fill="#e3a93b"/><circle cx="12.5" cy="16" r="2" fill="${INK}" stroke="none"/><circle cx="19.5" cy="16" r="2" fill="${INK}" stroke="none"/><path d="M13 20.5h6"/>`,
  castle: `<path d="M6 27V13h3v3h3v-3h3v3h2v-3h3v3h3v-3h3v14z" fill="#fffaf0"/><path d="M14 27v-5a2 2 0 0 1 4 0v5" fill="#c4a77a"/><path d="M16 13V5l5 2-5 2" fill="#e3a93b"/>`,
  wand: `<path d="M6 27L20 13" stroke-width="3" stroke="#8a5a3b"/><path d="M22 4l1.5 4.5L28 10l-4.5 1.5L22 16l-1.5-4.5L16 10l4.5-1.5z" fill="#f2c25a" stroke="#c4862a"/>`,
  rune: `<path d="M16 3l8 13-8 13-8-13z" fill="#f4eeff" stroke="#7a4fd6" stroke-width="1.8"/><path d="M16 9v14M12.5 13l7 5" stroke="#7a4fd6"/>`,
  rise: `<path d="M5 25l7-7 5 4 9-11" stroke="#5aa36a" stroke-width="2.6"/><path d="M19 11h7v7" stroke="#5aa36a" stroke-width="2.6"/>`,
  menu: `<path d="M7 10h18M7 16h18M7 22h18" stroke-width="2.4"/>`,
  undo: `<path d="M11 9L6 14l5 5" stroke-width="2.2"/><path d="M6 14h12a7 7 0 0 1 0 14h-4" stroke-width="2.2"/>`,
};
export function ic(name, cls = '') { const b = P[name]; return b ? s(b).replace('class="gi"', `class="gi ${cls}"`) : ''; }
// 盤面（SVG）の中に置く時
export function icAt(name, x, y, size) { const b = P[name]; return b ? `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${b}</svg>` : ''; }

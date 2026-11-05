// プロフィールのアイコン（平面的なイラスト）。色の丸の上に、白い形と こい線。
// 12種類（動物8・物4）。lv が付いている物は、その Lv から使える。
const K = '#2b2a33';
export const AVATAR_COLORS = ['#e86f5a', '#f2b84b', '#6cbf8a', '#5b8def', '#b28ad6', '#f29bb4', '#5cc4c9', '#8a7f6e'];
const eyes = (y = 30, dx = 8, r = 2.6) => `<circle cx="${32 - dx}" cy="${y}" r="${r}" fill="${K}"/><circle cx="${32 + dx}" cy="${y}" r="${r}" fill="${K}"/>`;
const cheeks = (y = 36) => `<circle cx="20" cy="${y}" r="3" fill="#f29bb4" opacity=".55"/><circle cx="44" cy="${y}" r="3" fill="#f29bb4" opacity=".55"/>`;
export const AVATARS = [
  { id: 'cat', name: 'ねこ', art: `<path d="M16 22 L18 10 L27 18 Z M48 22 L46 10 L37 18 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="32" cy="33" rx="18" ry="15" fill="#fff" stroke="${K}" stroke-width="2"/>${eyes(31)}<path d="M30 36 L34 36 L32 38.5 Z" fill="${K}"/><path d="M14 35 H22 M14 39 L22 37.5 M50 35 H42 M50 39 L42 37.5" stroke="${K}" stroke-width="1.5" stroke-linecap="round"/>${cheeks(38)}` },
  { id: 'dog', name: 'いぬ', art: `<ellipse cx="32" cy="32" rx="16" ry="16" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="16" cy="30" rx="6" ry="11" fill="${K}" transform="rotate(15 16 30)"/><ellipse cx="48" cy="30" rx="6" ry="11" fill="${K}" transform="rotate(-15 48 30)"/>${eyes(29, 7)}<ellipse cx="32" cy="38" rx="7" ry="5" fill="#fff" stroke="${K}" stroke-width="1.5"/><ellipse cx="32" cy="36" rx="3" ry="2.2" fill="${K}"/><path d="M32 38 V41" stroke="${K}" stroke-width="1.5"/>` },
  { id: 'rabbit', name: 'うさぎ', art: `<ellipse cx="25" cy="15" rx="5" ry="12" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="39" cy="15" rx="5" ry="12" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="25" cy="16" rx="2" ry="7" fill="#f29bb4"/><ellipse cx="39" cy="16" rx="2" ry="7" fill="#f29bb4"/><ellipse cx="32" cy="38" rx="16" ry="14" fill="#fff" stroke="${K}" stroke-width="2"/>${eyes(36, 7)}<path d="M29.5 41 Q32 43.5 34.5 41" fill="none" stroke="${K}" stroke-width="1.6" stroke-linecap="round"/>${cheeks(42)}` },
  { id: 'bear', name: 'くま', art: `<circle cx="18" cy="19" r="7" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="46" cy="19" r="7" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="32" cy="34" r="17" fill="#fff" stroke="${K}" stroke-width="2"/>${eyes(31, 7)}<ellipse cx="32" cy="40" rx="7" ry="5.5" fill="none" stroke="${K}" stroke-width="1.5"/><ellipse cx="32" cy="38" rx="2.8" ry="2" fill="${K}"/>` },
  { id: 'frog', name: 'かえる', lv: 5, art: `<circle cx="21" cy="21" r="8" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="43" cy="21" r="8" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="21" cy="21" r="3.5" fill="${K}"/><circle cx="43" cy="21" r="3.5" fill="${K}"/><ellipse cx="32" cy="38" rx="19" ry="13" fill="#fff" stroke="${K}" stroke-width="2"/><path d="M22 39 Q32 46 42 39" fill="none" stroke="${K}" stroke-width="2" stroke-linecap="round"/>${cheeks(38)}` },
  { id: 'owl', name: 'ふくろう', lv: 10, art: `<path d="M15 16 L22 22 L42 22 L49 16 L48 42 Q32 56 16 42 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><circle cx="25" cy="31" r="7" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="39" cy="31" r="7" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="25" cy="31" r="3" fill="${K}"/><circle cx="39" cy="31" r="3" fill="${K}"/><path d="M30 37 L34 37 L32 41 Z" fill="#f2b84b" stroke="${K}" stroke-width="1.2"/><path d="M24 46 Q26 44 28 46 M30 47 Q32 45 34 47 M36 46 Q38 44 40 46" fill="none" stroke="${K}" stroke-width="1.3"/>` },
  { id: 'fox', name: 'きつね', lv: 20, art: `<path d="M14 14 L24 24 L40 24 L50 14 L48 32 L32 50 L16 32 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M17 18 L22 24 M47 18 L42 24" stroke="${K}" stroke-width="1.5"/><path d="M24 36 Q28 33 30 36 M34 36 Q36 33 40 36" fill="none" stroke="${K}" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="46" r="2.6" fill="${K}"/>` },
  { id: 'penguin', name: 'ペンギン', lv: 30, art: `<ellipse cx="32" cy="35" rx="18" ry="19" fill="${K}"/><ellipse cx="32" cy="38" rx="12" ry="14" fill="#fff"/><circle cx="27" cy="30" r="2.4" fill="${K}"/><circle cx="37" cy="30" r="2.4" fill="${K}"/><path d="M28 35 L36 35 L32 39 Z" fill="#f2b84b"/>${cheeks(36)}` },
  { id: 'book', name: '本', art: `<path d="M12 18 Q22 14 32 19 Q42 14 52 18 V46 Q42 42 32 47 Q22 42 12 46 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M32 19 V47" stroke="${K}" stroke-width="2"/><path d="M17 25 H27 M17 30 H27 M17 35 H25 M37 25 H47 M37 30 H47 M37 35 H45" stroke="${K}" stroke-width="1.5" stroke-linecap="round"/>` },
  { id: 'plant', name: '観葉植物', art: `<path d="M22 40 H42 L39 54 H25 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="22" cy="26" rx="6" ry="12" transform="rotate(-30 22 26)" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="42" cy="26" rx="6" ry="12" transform="rotate(30 42 26)" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="32" cy="20" rx="6" ry="13" fill="#fff" stroke="${K}" stroke-width="2"/><path d="M32 30 V40" stroke="${K}" stroke-width="2"/>` },
  { id: 'lamp', name: 'ランプ', art: `<path d="M20 30 L26 12 H38 L44 30 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M32 30 V48" stroke="${K}" stroke-width="3"/><path d="M22 52 H42" stroke="${K}" stroke-width="3" stroke-linecap="round"/><path d="M26 34 L22 40 M38 34 L42 40 M32 35 V41" stroke="#fff7c2" stroke-width="2.5" stroke-linecap="round"/>` },
  { id: 'mug', name: 'マグカップ', art: `<path d="M16 22 H42 V44 Q42 52 34 52 H24 Q16 52 16 44 Z" fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M42 28 Q52 28 52 36 Q52 44 42 44" fill="none" stroke="${K}" stroke-width="2.5"/><path d="M24 14 Q22 10 25 7 M31 14 Q29 10 32 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>${eyes(34, 6, 2.2).replace(/cx="(\d+)"/g, (m, x) => `cx="${+x - 3}"`)}<path d="M26 40 Q29 42.5 32 40" fill="none" stroke="${K}" stroke-width="1.5" stroke-linecap="round"/>` },
];
const W = `fill="#fff" stroke="${K}" stroke-width="2" stroke-linejoin="round"`;
// ガチャのごほうびのアイコン（1.10.0〜）。夜の切り絵で描く。r＝★、series＝そのガチャ（band は OVERDRIVE、null はスタンダード）、at＝そのガチャを何回引いたらもらえるか（1.10.1〜。ランダムには出ない）
export const GACHA_AVATARS = [
  { id: 'guitar', at: 10, name: 'エレキギター', series: 'band', r: 4, art: `<g transform="rotate(-38 32 32)"><rect x="29.5" y="5" width="5" height="26" rx="1.5" ${W}/><rect x="28" y="2" width="8" height="7" rx="2" fill="${K}"/><path d="M32 29 C22 27 18 33 21 38 C17 42 18 52 26 54 C30 55 34 55 38 54 C46 52 47 42 43 38 C46 33 42 27 32 29 Z" ${W}/><rect x="27" y="40" width="10" height="3" rx="1" fill="${K}"/><rect x="27" y="46" width="10" height="3" rx="1" fill="${K}"/><path d="M32 6 V48" stroke="${K}" stroke-width="1"/></g>` },
  { id: 'drum', at: 20, name: 'スネアドラム', series: 'band', r: 4, art: `<path d="M14 28 V42 Q32 50 50 42 V28" ${W}/><ellipse cx="32" cy="28" rx="18" ry="6" ${W}/><path d="M18 33 L23 43 L28 34 L33 45 L38 34 L43 43 L47 34" fill="none" stroke="${K}" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 10 L36 26 M44 9 L30 25" stroke="${K}" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="10" r="2.6" fill="${K}"/><circle cx="44" cy="9" r="2.6" fill="${K}"/>` },
  { id: 'mic', at: 30, name: 'マイク', series: 'band', r: 4, art: `<path d="M26 30 H38 L35.5 54 H28.5 Z" ${W}/><circle cx="32" cy="20" r="11" ${W}/><path d="M24 16 H40 M22.5 21 H41.5 M24 26 H40 M27 11 V29 M32 9 V31 M37 11 V29" stroke="${K}" stroke-width="1.1" opacity=".7"/><rect x="25" y="30" width="14" height="4" rx="1.5" fill="${K}"/>` },
  { id: 'amp', at: 40, name: 'アンプ', series: 'band', r: 4, art: `<rect x="13" y="15" width="38" height="36" rx="4" ${W}/><rect x="13" y="15" width="38" height="9" rx="4" fill="${K}"/><circle cx="20" cy="19.5" r="2" fill="#fff"/><circle cx="27" cy="19.5" r="2" fill="#fff"/><circle cx="34" cy="19.5" r="2" fill="#fff"/><circle cx="32" cy="38" r="10" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="32" cy="38" r="5.5" fill="none" stroke="${K}" stroke-width="1.4"/><circle cx="32" cy="38" r="2.2" fill="${K}"/>` },
  { id: 'phones', at: 50, name: 'ヘッドホン', series: 'band', r: 4, art: `<path d="M16 38 V32 A16 16 0 0 1 48 32 V38" fill="none" stroke="${K}" stroke-width="4" stroke-linecap="round"/><rect x="10" y="33" width="11" height="17" rx="4" ${W}/><rect x="43" y="33" width="11" height="17" rx="4" ${W}/><rect x="13" y="37" width="5" height="9" rx="2" fill="${K}"/><rect x="46" y="37" width="5" height="9" rx="2" fill="${K}"/>` },
  { id: 'record', at: 100, name: 'レコード', series: 'band', r: 5, art: `<circle cx="32" cy="32" r="21" fill="${K}"/><circle cx="32" cy="32" r="17" fill="none" stroke="#fff" stroke-width=".7" opacity=".5"/><circle cx="32" cy="32" r="13.5" fill="none" stroke="#fff" stroke-width=".7" opacity=".5"/><circle cx="32" cy="32" r="8" ${W}/><circle cx="32" cy="32" r="1.8" fill="${K}"/><path d="M19 22 Q23 17 29 15" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>` },
  { id: 'moon', at: 10, name: '三日月', series: null, r: 4, art: `<path d="M38 12 A21 21 0 1 0 50 44 A16 16 0 1 1 38 12 Z" ${W}/><path d="M46 14 L47.6 18.4 L52 20 L47.6 21.6 L46 26 L44.4 21.6 L40 20 L44.4 18.4 Z" ${W}/><circle cx="26" cy="36" r="2" fill="${K}" opacity=".35"/><circle cx="31" cy="44" r="1.4" fill="${K}" opacity=".35"/>` },
  { id: 'scope', at: 20, name: '望遠鏡', series: null, r: 4, art: `<g transform="rotate(-28 32 30)"><rect x="12" y="23" width="34" height="11" rx="3" ${W}/><rect x="44" y="21" width="8" height="15" rx="2" ${W}/><rect x="8" y="25" width="5" height="7" rx="1.5" fill="${K}"/><rect x="24" y="23" width="3" height="11" fill="${K}"/></g><path d="M32 36 L22 54 M32 36 L42 54 M32 36 V54" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>` },
  { id: 'planet', at: 30, name: '惑星', series: null, r: 4, art: `<circle cx="32" cy="32" r="13" ${W}/><path d="M22 27 Q32 25 42 29 M21 34 Q31 33 43 36" fill="none" stroke="${K}" stroke-width="1.2" opacity=".5"/><ellipse cx="32" cy="33" rx="24" ry="6.5" transform="rotate(-18 32 33)" fill="none" stroke="${K}" stroke-width="2.4"/><circle cx="13" cy="15" r="1.6" fill="${K}"/><circle cx="51" cy="50" r="1.6" fill="${K}"/>` },
  { id: 'comet', at: 60, name: '流れ星', series: null, r: 5, art: `<path d="M8 48 L30 30 M14 54 L33 36 M6 40 L26 26" stroke="${K}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/><path d="M40 10 L44.5 21.5 L56.5 22.5 L47.3 30.3 L50.3 42 L40 35.6 L29.7 42 L32.7 30.3 L23.5 22.5 L35.5 21.5 Z" ${W}/><circle cx="40" cy="26" r="2" fill="${K}"/>` },
  { id: 'capsule', at: 80, name: 'ガチャカプセル', series: null, r: 5, art: `<circle cx="32" cy="34" r="19" ${W}/><path d="M13 34 A19 19 0 0 0 51 34 Z" fill="${K}"/><rect x="11" y="31.5" width="42" height="5" rx="2.5" ${W}/><path d="M22 22 Q26 17 32 16" fill="none" stroke="${K}" stroke-width="2" stroke-linecap="round" opacity=".35"/><path d="M28 44 L31 40 L34 44 L37 40" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>` },
  { id: 'crown', at: 100, name: '王冠', series: null, r: 5, art: `<path d="M12 46 L10 20 L22 32 L32 14 L42 32 L54 20 L52 46 Z" ${W}/><rect x="12" y="46" width="40" height="7" rx="2" ${W}/><circle cx="32" cy="36" r="3.2" fill="${K}"/><circle cx="21" cy="40" r="2.2" fill="${K}"/><circle cx="43" cy="40" r="2.2" fill="${K}"/><circle cx="10" cy="20" r="2.4" fill="${K}"/><circle cx="32" cy="14" r="2.4" fill="${K}"/><circle cx="54" cy="20" r="2.4" fill="${K}"/>` },
];

export const isGachaAvatar = (id) => GACHA_AVATARS.some(a => a.id === id);
export const avatarItemId = (id) => 'av-' + id; // 持ち物としての id
// そのガチャ（'standard' かシリーズ id）を引いた回数でもらえるアイコン（回数の少ない順）
export const pullRewards = (banner) => GACHA_AVATARS.filter(a => (a.series || 'standard') === banner).sort((x, y) => x.at - y.at);
export const avatarById = (id) => AVATARS.find(a => a.id === id) || GACHA_AVATARS.find(a => a.id === id) || AVATARS[0];
// 色を明るく・暗くする
const mix = (hex, to, a) => { const n = parseInt(hex.slice(1), 16), t = to ? 255 : 0; const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * a)); return `rgb(${c.join(',')})`; };
// 切り絵の雰囲気（1.9.3〜）：白い形は紙の色にして線をなくし、うしろに影の紙を1枚重ねる。こい色の部品は、背景の色を暗くした色
function paperParts(art, { paperCol = '#fffaf0', inkCol, shade }) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = art;
  const walk = (el) => {
    if (el.tagName === 'g') {
      const f = el.cloneNode(false), sh = el.cloneNode(false); let fi = '', si = '';
      for (const ch of [...el.children]) { const r = walk(ch); fi += r.front; si += r.shadow; }
      f.innerHTML = fi; sh.innerHTML = si; return { front: f.outerHTML, shadow: si ? sh.outerHTML : '' };
    }
    const f = (el.getAttribute('fill') || '').toLowerCase(), st = el.getAttribute('stroke');
    let shadow = '';
    if (f === '#fff') {
      const s2 = el.cloneNode(); s2.removeAttribute('stroke'); s2.setAttribute('fill', shade); s2.setAttribute('opacity', '.38'); shadow = s2.outerHTML;
      el.setAttribute('fill', paperCol); el.removeAttribute('stroke'); el.removeAttribute('stroke-width');
    } else if (f === K) el.setAttribute('fill', inkCol);
    else if ((f === 'none' || !f) && st === K) el.setAttribute('stroke', inkCol);
    return { front: el.outerHTML, shadow };
  };
  let shadow = '', front = '';
  for (const el of [...g.children]) { const r = walk(el); shadow += r.shadow; front += r.front; }
  return `<g transform="translate(2.2 2.6)">${shadow}</g>${front}`;
}
const dotsPat = (id, col, op) => `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${col}"/><circle cx="1" cy="1" r=".5" fill="#fff" opacity="${op}"/></pattern>`;
const star4 = (x, y, s, fill) => `<path class="av-tw" d="M${x} ${y - s} L${x + s * .3} ${y - s * .3} L${x + s} ${y} L${x + s * .3} ${y + s * .3} L${x} ${y + s} L${x - s * .3} ${y + s * .3} L${x - s} ${y} L${x - s * .3} ${y - s * .3} Z" fill="${fill}"/>`;
// ガチャのアイコンは「夜の切り絵」：紺や黒の紙に、クリーム色の切り絵。まわりに星。★5 は金、★4 は銀のふち
export const NIGHT_COLORS = ['#1c2238', '#241a33', '#2a1b1f', '#14262b'];
const cache = new Map();
function paperInner(av, colIdx) {
  const key = av.id + '|' + colIdx;
  if (cache.has(key)) return cache.get(key);
  let out;
  if (av.r) {
    const col = NIGHT_COLORS[colIdx % NIGHT_COLORS.length], acc = av.r >= 5 ? '#e6c068' : '#b9c6e0', id = 'avn' + (colIdx % NIGHT_COLORS.length);
    out = `<defs>${dotsPat(id, col, .1)}</defs><circle cx="32" cy="32" r="32" fill="url(#${id})"/><circle cx="32" cy="32" r="30" fill="none" stroke="${acc}" stroke-width="1.4" stroke-opacity=".85"/>
      ${star4(12, 16, 2.2, acc)}${star4(53, 13, 1.6, acc)}${star4(9, 44, 1.3, acc)}${star4(55, 40, 2, acc)}
      <g transform="translate(32 32) scale(.78) translate(-32 -32)">${paperParts(av.art, { paperCol: '#f3e8cf', inkCol: col, shade: '#000' })}</g>`;
  } else {
    const col = AVATAR_COLORS[colIdx] || AVATAR_COLORS[0], id = 'avp' + AVATAR_COLORS.indexOf(col);
    out = `<defs>${dotsPat(id, col, .18)}</defs><circle cx="32" cy="32" r="32" fill="url(#${id})"/><circle cx="32" cy="32" r="25" fill="${mix(col, true, 0.25)}"/>
      ${paperParts(av.art, { inkCol: mix(col, false, 0.6), shade: mix(col, false, 0.45) })}`;
  }
  cache.set(key, out);
  return out;
}
// アイコンの HTML。a = { avatar, avatarColor }
export function avatarHTML(a = {}, cls = 'avatar') {
  const av = avatarById(a.avatar || 'cat'), ci = Math.max(0, +(a.avatarColor ?? 0) || 0);
  let inner;
  try { inner = paperInner(av, ci); } catch (e) { inner = `<circle cx="32" cy="32" r="32" fill="${AVATAR_COLORS[ci] || AVATAR_COLORS[0]}"/>${av.art}`; } // 描けない時は前の形
  return `<span class="${cls}" aria-label="${av.name}"><svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg></span>`;
}

// チケットの見た目（SVG）。ログインボーナス・ガチャ・持ち物で使う
// kind: 'ticket'（レアチケット） | 'ticket4'（★4以上確定チケット） | 'ticket5'（★5限定チケット）
export const TICKET_NAME = { ticket: 'レアチケット', ticket4: '★4以上確定チケット', ticket5: '★5限定チケット' };
let n = 0;
export function ticketSVG(kind = 'ticket', cls = '') {
  const id = 'tk' + (n++);
  const five = kind === 'ticket5';
  const four = kind === 'ticket4' || five;
  const c1 = five ? '#2a2420' : four ? '#f3d6ff' : '#fff1c2', c2 = five ? '#14110e' : four ? '#b48cff' : '#f0b44c', c3 = five ? '#000' : four ? '#6f4bd8' : '#b97a1f';
  const ink = five ? '#ffd98a' : four ? '#2e1650' : '#4a2c00';
  // 文字は入れず、星の数でランクがわかるデザイン（レア＝3つ・★4＝4つ・★5＝5つ）
  const stars = five ? 5 : four ? 4 : 3;
  const star = (x, y, r) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`); } return `<polygon points="${pts.join(' ')}"/>`; };
  const row = Array.from({ length: stars }, (_, i) => star(80 + (i - (stars - 1) / 2) * 13, 64, 4.6)).join('');
  return `<svg class="ticket-svg ${cls}" viewBox="0 0 160 80" aria-label="${TICKET_NAME[kind] || 'レアチケット'}">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>
    </linearGradient>
    ${four ? `<linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fd3ff" stop-opacity=".0"/><stop offset=".3" stop-color="#7fd3ff" stop-opacity=".45"/><stop offset=".55" stop-color="#ff9ad5" stop-opacity=".45"/><stop offset=".8" stop-color="#ffe28a" stop-opacity=".45"/><stop offset="1" stop-color="#ffe28a" stop-opacity="0"/></linearGradient>` : ''}
    <radialGradient id="${id}r"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="${id}m"><rect width="160" height="80" rx="10" fill="#fff"/><g fill="#000"><circle cx="0" cy="40" r="10"/><circle cx="160" cy="40" r="10"/></g></mask>
    <clipPath id="${id}c"><rect width="160" height="80" rx="10"/></clipPath>
  </defs>
  <g mask="url(#${id}m)">
    <rect width="160" height="80" fill="url(#${id}g)"/>
    ${four ? `<rect width="160" height="80" fill="url(#${id}h)" ${five ? 'opacity=".55"' : ''}/>` : ''}
    <rect x="5" y="5" width="150" height="70" rx="7" fill="none" stroke="${five ? '#e7b84a' : ink}" stroke-opacity="${five ? 1 : 0.3}" stroke-width="1.4"/>
    <line x1="24" y1="9" x2="24" y2="71" stroke="${ink}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="2.5 3"/>
    <line x1="136" y1="9" x2="136" y2="71" stroke="${ink}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="2.5 3"/>
    <circle cx="80" cy="34" r="26" fill="url(#${id}r)"/>
    <g fill="${ink}" fill-opacity=".9">${star(80, 33, 19)}</g>
    <g fill="${ink}" fill-opacity=".75">${row}</g>
    <g clip-path="url(#${id}c)"><rect class="tk-shine" x="-80" y="-10" width="50" height="100" fill="url(#${id}s)" transform="skewX(-20)"/></g>
  </g>
</svg>`;
}

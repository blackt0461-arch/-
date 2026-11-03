// チケットの見た目（SVG）。ログインボーナス・ガチャ・持ち物で使う
// kind: 'ticket'（レアチケット） | 'ticket4'（★4以上確定チケット）
let n = 0;
export function ticketSVG(kind = 'ticket', cls = '') {
  const id = 'tk' + (n++);
  const four = kind === 'ticket4';
  const c1 = four ? '#f3d6ff' : '#fff1c2', c2 = four ? '#b48cff' : '#f0b44c', c3 = four ? '#6f4bd8' : '#b97a1f';
  const ink = four ? '#2e1650' : '#4a2c00';
  // ふちの切り取り線（半円の切り欠き）
  const notches = Array.from({ length: 7 }, (_, i) => `<circle cx="${18 + i * 22}" cy="0" r="3.2"/><circle cx="${18 + i * 22}" cy="80" r="3.2"/>`).join('');
  return `<svg class="ticket-svg ${cls}" viewBox="0 0 160 80" aria-label="${four ? '★4以上確定チケット' : 'レアチケット'}">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>
    </linearGradient>
    ${four ? `<linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fd3ff" stop-opacity=".0"/><stop offset=".3" stop-color="#7fd3ff" stop-opacity=".45"/><stop offset=".55" stop-color="#ff9ad5" stop-opacity=".45"/><stop offset=".8" stop-color="#ffe28a" stop-opacity=".45"/><stop offset="1" stop-color="#ffe28a" stop-opacity="0"/></linearGradient>` : ''}
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="${id}m"><rect width="160" height="80" rx="9" fill="#fff"/><g fill="#000">${notches}<circle cx="0" cy="40" r="9"/><circle cx="160" cy="40" r="9"/></g></mask>
    <clipPath id="${id}c"><rect width="160" height="80" rx="9"/></clipPath>
  </defs>
  <g mask="url(#${id}m)">
    <rect width="160" height="80" fill="url(#${id}g)"/>
    ${four ? `<rect width="160" height="80" fill="url(#${id}h)"/>` : ''}
    <rect x="6" y="6" width="148" height="68" rx="6" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="1.2"/>
    <line x1="112" y1="10" x2="112" y2="70" stroke="${ink}" stroke-opacity=".4" stroke-width="1.4" stroke-dasharray="3 3"/>
    <text x="16" y="31" font-family="Cormorant Garamond, serif" font-size="13" font-weight="700" letter-spacing="2.5" fill="${ink}">ROOMIN</text>
    <text x="16" y="52" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-size="13.5" font-weight="800" fill="${ink}">${four ? '★4以上確定' : 'レアチケット'}</text>
    <text x="16" y="66" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-size="7.5" font-weight="700" fill="${ink}" fill-opacity=".7">${four ? 'SUPER RARE TICKET' : 'RARE TICKET'}</text>
    <g transform="translate(134 40)">
      ${four
        ? `<path d="M0 -15 L4.4 -4.6 L15 -4.6 L6.4 2.2 L9.6 13 L0 6.4 L-9.6 13 L-6.4 2.2 L-15 -4.6 L-4.4 -4.6 Z" fill="${ink}" fill-opacity=".85"/><text x="0" y="5" text-anchor="middle" font-size="9" font-weight="900" fill="${c1}" font-family="sans-serif">4</text>`
        : `<path d="M0 -14 L4 -4.2 L14 -4.2 L6 2 L9 12 L0 6 L-9 12 L-6 2 L-14 -4.2 L-4 -4.2 Z" fill="${ink}" fill-opacity=".8"/>`}
    </g>
    <g clip-path="url(#${id}c)"><rect class="tk-shine" x="-80" y="-10" width="50" height="100" fill="url(#${id}s)" transform="skewX(-20)"/></g>
  </g>
</svg>`;
}

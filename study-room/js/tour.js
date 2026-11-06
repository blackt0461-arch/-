// はじめての人の案内（1.12.0）：部屋の画面で、ボタンを1つずつ光らせて説明する。
// steps = [{ sel: 'CSSセレクタ', title, text }]。sel がない（または見つからない）手順は、まん中にカードだけ出す。
// 戻り値の Promise は、最後まで見るか「スキップ」すると終わる（'done' | 'skip'）。
export function runTour(steps, { finish = 'はじめる' } = {}) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = `<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite">
      <div class="tour-top"><span class="tour-n"></span><button class="tour-skip">スキップ</button></div>
      <b class="tour-title"></b><p class="tour-text"></p>
      <div class="tour-foot"><span class="tour-dots"></span><button class="btn primary tour-next"></button></div></div>`;
    document.body.append(root);
    const hole = root.querySelector('.tour-hole'), card = root.querySelector('.tour-card');
    let i = 0;
    const end = (how) => { window.removeEventListener('resize', place); root.remove(); resolve(how); };
    function place() {
      const s = steps[i], t = s.sel && document.querySelector(s.sel);
      const r = t && t.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      if (r && r.width) {
        const pad = 6;
        Object.assign(hole.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: getComputedStyle(t).borderRadius || '14px' });
        root.classList.remove('center');
        const cw = Math.min(320, vw - 32);
        card.style.width = cw + 'px';
        card.style.left = `${Math.max(16, Math.min(vw - cw - 16, r.left + r.width / 2 - cw / 2))}px`;
        // 下半分のボタンなら、カードは上に。上半分なら下に
        if (r.top + r.height / 2 > vh / 2) { card.style.top = ''; card.style.bottom = `${vh - r.top + 18}px`; }
        else { card.style.bottom = ''; card.style.top = `${r.bottom + 18}px`; }
      } else {
        hole.style.display = 'none'; root.classList.add('center');
        card.style.left = card.style.top = card.style.bottom = card.style.width = '';
      }
    }
    function show() {
      const s = steps[i];
      root.querySelector('.tour-n').textContent = `${i + 1} / ${steps.length}`;
      root.querySelector('.tour-title').textContent = s.title;
      root.querySelector('.tour-text').textContent = s.text;
      root.querySelector('.tour-dots').innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
      root.querySelector('.tour-next').textContent = i === steps.length - 1 ? finish : '次へ';
      place();
    }
    root.querySelector('.tour-next').onclick = () => { if (++i >= steps.length) end('done'); else show(); };
    root.querySelector('.tour-skip').onclick = () => end('skip');
    window.addEventListener('resize', place);
    show();
  });
}

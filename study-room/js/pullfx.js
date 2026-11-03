// ガチャを引く演出。
// ① チケットを上へスワイプ（またはタップ）して切る
// ② 光の玉が昇る。色でレア度がわかる（青＝★3、紫＝★4、金＝★5）。ときどき青→紫→金へ「昇格」
// ③ 玉がはじけて、光の粒が飛び散る
// ④ ★5があれば、その家具だけを大きく見せる
// ⑤ 裏向きのカードを1枚ずつめくる（★4以上は裏から光がもれる）
// 右上の「スキップ」で、すぐ結果へ。
const COL = { 3: '#7fd3ff', 4: '#c69bff', 5: '#ffd36a' };

export function playPullFX(res, opt) {
  const { thumbHTML, hydrateThumbs, esc, vibrate, icon, ticketSVG, kind = 'ticket', onDone } = opt;
  const top = Math.max(...res.map(r => r.rarity));
  // 昇格演出：★4以上のとき、半分くらいは「青から始まって変わる」
  const fake = top >= 4 && Math.random() < 0.55;
  const steps = fake ? (top === 5 ? (Math.random() < 0.5 ? [3, 5] : [3, 4, 5]) : [3, 4]) : [top];
  const ten = res.length > 1;

  const ov = document.createElement('div');
  ov.className = `pfx r${steps[0]}`;
  ov.innerHTML = `
    <canvas class="pfx-cv"></canvas>
    <div class="pfx-pillars"><i></i><i></i><i></i></div>
    <button class="pfx-skip">スキップ ${icon('chevronRight')}</button>
    <div class="pfx-stage">
      <div class="pfx-ticket">${ticketSVG(kind, 'big')}<div class="pfx-cut"></div></div>
      <p class="pfx-hint">上にスワイプして チケットを切る</p>
      <div class="pfx-orb"><i></i></div>
      <div class="pfx-stars"></div>
    </div>
    <div class="pfx-flash"></div>
    <div class="pfx-spot hide"></div>
    <div class="pfx-cards ${ten ? 'ten' : 'one'} hide"></div>
    <div class="pfx-btns hide"><button class="btn ghost again">もう一度</button><button class="btn gold ok">OK</button></div>`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add('show'));

  // ---- 光の粒（canvas） ----
  const cv = ov.querySelector('.pfx-cv'), cx = cv.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(2, devicePixelRatio || 1);
  const fit = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit(); addEventListener('resize', fit);
  const parts = [];
  let rising = null; // 玉に吸いこまれる粒
  const burst = (x, y, color, n = 120, speed = 9) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * speed;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, decay: 0.008 + Math.random() * 0.012, r: 1 + Math.random() * 2.6, color: Math.random() < 0.25 ? '#ffffff' : color, star: Math.random() < 0.18 });
    }
  };
  const drawStar = (x, y, r) => { cx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } cx.closePath(); cx.fill(); };
  let alive = true;
  const tick = () => {
    if (!alive) return;
    cx.clearRect(0, 0, W, H);
    cx.globalCompositeOperation = 'lighter';
    if (rising) {
      if (Math.random() < 0.9) for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 120;
        parts.push({ x: rising.x + Math.cos(a) * d, y: rising.y + Math.sin(a) * d, tx: rising.x, ty: rising.y, life: 1, decay: 0.02, r: 1.2 + Math.random() * 1.5, color: rising.color, pull: true });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.pull) { p.x += (p.tx - p.x) * 0.09; p.y += (p.ty - p.y) * 0.09; }
      else { p.x += p.vx; p.y += p.vy; p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.06; }
      p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      cx.globalAlpha = Math.max(0, p.life);
      cx.fillStyle = p.color;
      if (p.star) drawStar(p.x, p.y, p.r * 2.6);
      else { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill(); }
    }
    cx.globalAlpha = 1;
    requestAnimationFrame(tick);
  };
  tick();

  const wait = (ms) => new Promise(r => setTimeout(r, skipped ? 0 : ms));
  let skipped = false;
  const stage = ov.querySelector('.pfx-stage');
  const setColor = (r) => { ov.classList.remove('r3', 'r4', 'r5'); ov.classList.add('r' + r); };

  // ---- ① チケットを切る ----
  const ticket = ov.querySelector('.pfx-ticket');
  let started = false, y0 = null;
  const start = () => { if (started) return; started = true; run(); };
  ticket.addEventListener('pointerdown', e => { y0 = e.clientY; });
  ov.addEventListener('pointermove', e => {
    if (y0 == null || started) return;
    const dy = Math.min(0, e.clientY - y0);
    ticket.style.transform = `translateY(${dy * 0.4}px)`;
    if (dy < -60) start();
  });
  ov.addEventListener('pointerup', () => { if (!started && y0 != null) start(); y0 = null; });
  ov.querySelector('.pfx-skip').onclick = (e) => { e.stopPropagation(); skipped = true; if (!started) start(); };

  async function run() {
    vibrate(25);
    ov.querySelector('.pfx-hint').remove();
    ticket.style.transform = '';
    ticket.classList.add('tear');
    await wait(650);
    ticket.remove();
    // ---- ② 光の玉 ----
    const orb = ov.querySelector('.pfx-orb');
    orb.classList.add('in');
    const ob = () => { const b = orb.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    rising = { ...ob(), color: COL[steps[0]] };
    await wait(1300);
    for (let i = 1; i < steps.length; i++) {
      // 昇格：ふるえて、ぱっと色が変わる
      orb.classList.add('charge');
      vibrate(30);
      await wait(700);
      orb.classList.remove('charge');
      setColor(steps[i]);
      rising.color = COL[steps[i]];
      const { x, y } = ob();
      burst(x, y, COL[steps[i]], 70, 6);
      flash(0.5);
      vibrate(steps[i] === 5 ? [50, 30, 90] : 40);
      await wait(900);
    }
    if (top === 5) {
      ov.classList.add('gold');
      const st = ov.querySelector('.pfx-stars');
      for (let i = 0; i < 5; i++) { const s = document.createElement('i'); s.textContent = '★'; s.style.animationDelay = (skipped ? 0 : i * 0.16) + 's'; st.append(s); }
      vibrate([30, 60, 30, 60, 120]);
      await wait(1400);
    }
    // ---- ③ はじける ----
    rising = null;
    orb.classList.add('pop');
    const { x, y } = ob();
    burst(x, y, COL[top], top === 5 ? 260 : top === 4 ? 180 : 120, top === 5 ? 13 : 10);
    flash(1);
    vibrate(top >= 5 ? [40, 40, 140] : top >= 4 ? [30, 40, 70] : 30);
    await wait(500);
    stage.remove();
    // ---- ④ ★5の見せ場 ----
    const fives = res.filter(r => r.rarity === 5 && !r.shard).slice(0, 3); // 新しい★5だけ（多くても3つ）
    for (const r of fives) {
      if (skipped) break;
      await showcase(r);
    }
    // ---- ⑤ カードをめくる ----
    await showCards();
  }

  function flash(a) {
    const f = ov.querySelector('.pfx-flash');
    f.style.transition = 'none'; f.style.opacity = a;
    requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = 0; });
  }

  function showcase(r) {
    return new Promise(resolve => {
      const sp = ov.querySelector('.pfx-spot');
      sp.innerHTML = `
        <div class="sp-rays"></div>
        <div class="sp-item"><span class="thumb">${thumbHTML(r.item)}</span></div>
        <div class="sp-stars">★★★★★</div>
        <b class="sp-name">${esc(r.item.name)}</b>
        ${r.shard ? '<i class="po-dup">かぶり → ★5のかけら</i>' : '<i class="po-new">NEW</i>'}
        <p class="sp-tap">タップでつづける</p>`;
      hydrateThumbs(sp);
      sp.classList.remove('hide');
      requestAnimationFrame(() => sp.classList.add('on'));
      burst(W / 2, H * 0.42, COL[5], 160, 11);
      const done = () => { sp.removeEventListener('click', done); sp.classList.remove('on'); setTimeout(() => { sp.classList.add('hide'); resolve(); }, 250); };
      setTimeout(() => sp.addEventListener('click', done), 600);
    });
  }

  async function showCards() {
    const box = ov.querySelector('.pfx-cards');
    box.innerHTML = res.map((r, i) => `
      <div class="pc r${r.rarity}" data-i="${i}">
        <div class="pc-in">
          <div class="pc-back"><span>${icon('sparkle')}</span></div>
          <div class="pc-front">
            <span class="stars">${'★'.repeat(r.rarity)}</span>
            <span class="thumb">${thumbHTML(r.item)}</span>
            <b>${esc(r.item.name)}</b>
            ${r.shard ? `<i class="po-dup">かぶり → ★${r.shard}のかけら</i>` : r.dup ? '<i class="po-dup">もう1つ</i>' : '<i class="po-new">NEW</i>'}
          </div>
        </div>
      </div>`).join('');
    hydrateThumbs(box);
    box.classList.remove('hide');
    const cards = [...box.querySelectorAll('.pc')];
    cards.forEach((c, i) => { c.style.animationDelay = (i * 0.05) + 's'; c.classList.add('deal'); });
    await wait(ten ? 700 : 400);
    const flip = (c) => {
      if (c.classList.contains('flip')) return;
      c.classList.add('flip');
      const r = res[+c.dataset.i];
      if (r.rarity >= 4) {
        const b = c.getBoundingClientRect();
        burst(b.left + b.width / 2, b.top + b.height / 2, COL[r.rarity], r.rarity === 5 ? 90 : 50, 6);
        vibrate(r.rarity === 5 ? 60 : 30);
      } else vibrate(8);
    };
    box.onclick = (e) => { const c = e.target.closest('.pc'); if (c) flip(c); };
    // 1枚ずつ自動でめくる（★4以上は少しためる）
    for (const c of cards) {
      const r = res[+c.dataset.i];
      if (!skipped && r.rarity >= 4) { c.classList.add('tease'); await wait(450); c.classList.remove('tease'); }
      flip(c);
      await wait(ten ? 230 : 300);
    }
    ov.querySelector('.pfx-skip').remove();
    ov.querySelector('.pfx-btns').classList.remove('hide');
  }

  const close = (again) => { alive = false; removeEventListener('resize', fit); ov.remove(); onDone && onDone(again); };
  ov.querySelector('.ok').onclick = () => close(false);
  ov.querySelector('.again').onclick = () => close(true);
}

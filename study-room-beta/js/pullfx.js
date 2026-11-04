// ガチャを引く演出（注文書と設計図）
// ① 家具の注文書に、指でサインする → 「受付」のハンコ
// ② 方眼の設計図が上から広がる
// ③ 出る家具の形が線で描かれる。線の色でレア度がわかる（青＝★3、紫＝★4、金＝★5）。ときどき途中で色が変わる「昇格」
// ④ 寸法が入り、光の線が上から下へなぞると本物の家具に変わる
// ⑤ ★4は「良品」、★5は「完成」のハンコ。名前が出る
// 10連は、1枚の紙に10この図面が並んで、まとめて本物に変わる。新しい★5はそのあと大きく見せる
// ⑥ 結果のカード
// 右上の「スキップ」で、すぐ結果へ。画面をタップすると早送り。
import { blueprintArt } from './thumbs.js';
const COL = { 3: '#7fd3ff', 4: '#c69bff', 5: '#ffd36a' };
const KIND_NAME = { ticket: 'レアチケット', ticket4: '★4以上確定チケット', ticket5: '★5限定確定チケット' };

export function playPullFX(res, opt) {
  const { thumbHTML, hydrateThumbs, esc, vibrate, icon, kind = 'ticket', onDone } = opt;
  const top = Math.max(...res.map(r => r.rarity));
  // 昇格演出：★4以上のとき、半分くらいは「青から始まって変わる」
  const fake = top >= 4 && Math.random() < 0.55;
  const steps = fake ? (top === 5 ? (Math.random() < 0.5 ? [3, 5] : [3, 4, 5]) : [3, 4]) : [top];
  const ten = res.length > 1;
  const now = new Date();
  const no = String(Math.floor(Math.random() * 9000) + 1000);

  const ov = document.createElement('div');
  ov.className = `pfx bpfx r${steps[0]}`;
  ov.innerHTML = `
    <canvas class="pfx-cv"></canvas>
    <button class="pfx-skip">スキップ ${icon('chevronRight')}</button>
    <div class="od">
      <div class="od-paper">
        <h3>家具 注文書</h3>
        <p class="od-row"><span>品名</span><b>？？？</b></p>
        <p class="od-row"><span>数</span><b>${res.length}</b></p>
        <p class="od-row"><span>支払い</span><b>${KIND_NAME[kind] || 'チケット'} ${res.length}枚</b></p>
        <p class="od-row"><span>日付</span><b>${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}</b></p>
        <div class="od-sign"><small>ここに指でサイン</small><canvas></canvas></div>
        <i class="od-ok">受付</i>
      </div>
      <p class="od-hint">サインすると注文できます</p>
    </div>
    <div class="bp">
      <div class="bp-art">
        <canvas class="bp-lines"></canvas>
        <img class="bp-real" alt="">
        <div class="bp-ghost"></div>
        <svg class="bp-dims" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div class="bp-scan"></div>
      </div>
      <div class="bp-grid"></div>
      <div class="bp-sweep"></div>
      <i class="bp-stamp"></i>
      <div class="bp-name"><i></i><b></b><small>タップでつづける</small></div>
      <div class="bp-tb"><span>図面</span><span>No. ${no}</span><span>品名</span><span class="tb-name">？？？</span><span>縮尺</span><span>1 : 20</span><span>日付</span><span>${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}</span></div>
      <p class="bp-msg"></p>
    </div>
    <div class="pfx-flash"></div>
`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add('show'));

  // 線を描くあいだ、出てくる家具の絵を先に用意しておく
  const artP = new Map();
  const getArt = (item) => { if (!artP.has(item.id)) artP.set(item.id, blueprintArt(item)); return artP.get(item.id); };
  res.forEach(r => getArt(r.item));
  const artWithin = (item, ms) => Promise.race([getArt(item), new Promise(z => setTimeout(() => z(null), skipped ? 0 : ms))]);

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

  let skipped = false, fast = false;
  const wait = (ms) => new Promise(r => {
    if (skipped) return r();
    const t0 = performance.now();
    const step = () => { if (skipped || fast || performance.now() - t0 >= ms) { fast = false; r(); } else requestAnimationFrame(step); };
    step();
  });
  const setColor = (r) => { ov.classList.remove('r3', 'r4', 'r5'); ov.classList.add('r' + r); ov.style.setProperty('--c', COL[r]); };
  setColor(steps[0]);
  const bp = ov.querySelector('.bp');
  bp.addEventListener('click', () => { fast = true; });

  // ---- ① 注文書にサイン ----
  const od = ov.querySelector('.od');
  const sc = od.querySelector('.od-sign canvas'), sg = sc.getContext('2d');
  let started = false, last = null, ink = 0;
  const fitSign = () => { const r = sc.getBoundingClientRect(); sc.width = r.width * dpr; sc.height = r.height * dpr; sg.setTransform(dpr, 0, 0, dpr, 0, 0); };
  requestAnimationFrame(fitSign);
  const pos = (e) => { const r = sc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  sc.addEventListener('pointerdown', e => { if (started) return; sc.setPointerCapture?.(e.pointerId); last = pos(e); od.classList.add('writing'); });
  sc.addEventListener('pointermove', e => {
    if (!last || started) return;
    const p = pos(e);
    sg.strokeStyle = '#1b2f6b'; sg.lineWidth = 2.6; sg.lineCap = 'round'; sg.lineJoin = 'round';
    sg.beginPath(); sg.moveTo(last[0], last[1]); sg.lineTo(p[0], p[1]); sg.stroke();
    ink += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p;
  });
  const lift = () => { if (!last) return; last = null; if (ink > 90 && !started) { started = true; run(); } };
  sc.addEventListener('pointerup', lift); sc.addEventListener('pointercancel', lift);
  ov.querySelector('.pfx-skip').onclick = (e) => { e.stopPropagation(); skipped = true; if (!started) { started = true; run(); } };

  async function run() {
    vibrate(20);
    const ok = od.querySelector('.od-ok');
    ok.classList.add('on');
    await wait(150);
    vibrate([30, 30, 50]);
    await wait(650);
    // ---- ② 注文書が上へ消えるのと同時に、設計図が広がる ----
    od.classList.add('out');
    bp.classList.add('on');
    setTimeout(() => od.remove(), 400);
    await wait(700);
    if (!ten) await single(res[0], steps);
    else {
      await grid();
      // 新しい★5だけ、大きく見せる（多くても2つ）
      for (const r of res.filter(r => r.rarity === 5 && !r.shard).slice(0, 2)) {
        if (skipped) break;
        await single(r, [5]);
      }
    }
    bp.classList.add('out');
    await wait(250);
    bp.style.display = 'none';
    await showCards();
  }

  function flash(a) {
    const f = ov.querySelector('.pfx-flash');
    f.style.transition = 'none'; f.style.opacity = a;
    requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = 0; });
  }

  // 1つの家具を、線 → 寸法 → 本物 → ハンコ の順に見せる
  async function single(r, cols) {
    const it = r.item, rar = r.rarity;
    bp.classList.remove('ten', 'real', 'dimmed', 'named', 'stamped', 'ghosted');
    bp.classList.add('one');
    setColor(cols[0]);
    const slow = rar === 3 ? 0.7 : rar === 4 ? 0.85 : 1;
    const box = bp.querySelector('.bp-art');
    const lc = bp.querySelector('.bp-lines'), real = bp.querySelector('.bp-real'), ghost = bp.querySelector('.bp-ghost'), dimsSvg = bp.querySelector('.bp-dims');
    const msg = bp.querySelector('.bp-msg');
    bp.querySelector('.tb-name').textContent = '？？？';
    bp.querySelector('.bp-name i').textContent = '★'.repeat(rar);
    bp.querySelector('.bp-name b').textContent = it.name;
    const st = bp.querySelector('.bp-stamp');
    st.className = 'bp-stamp r' + rar;
    st.innerHTML = rar >= 4 ? `<span>${rar === 5 ? '完成' : '良品'}<small>${'★'.repeat(rar)}</small></span>` : '';
    real.removeAttribute('src'); dimsSvg.innerHTML = ''; ghost.innerHTML = '';
    const R = box.getBoundingClientRect();
    lc.width = R.width * dpr; lc.height = R.height * dpr;
    const g = lc.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    msg.textContent = '製図中…';
    let art = null;
    if (!skipped) art = await artWithin(it, 6000);
    msg.textContent = '';
    // ③ 線を描く
    let bounds = { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 };
    if (art && art.segs && art.segs.length) {
      const segs = art.segs.slice().sort((p, q) => (Math.min(p[1], p[3]) - Math.min(q[1], q[3])) + (Math.random() - 0.5) * 0.04);
      bounds = segs.reduce((b, q) => ({ x0: Math.min(b.x0, q[0], q[2]), y0: Math.min(b.y0, q[1], q[3]), x1: Math.max(b.x1, q[0], q[2]), y1: Math.max(b.y1, q[1], q[3]) }), { x0: 1, y0: 1, x1: 0, y1: 0 });
      const drawUpTo = (n, from, color) => {
        g.strokeStyle = color; g.lineWidth = 1.3; g.lineCap = 'round'; g.shadowColor = color; g.shadowBlur = 6;
        g.beginPath();
        for (let k = from; k < n; k++) { const q = segs[k]; g.moveTo(q[0] * R.width, q[1] * R.height); g.lineTo(q[2] * R.width, q[3] * R.height); }
        g.stroke();
      };
      const dur = 1500 * slow;
      let done = 0;
      await new Promise(z => {
        const t0 = performance.now();
        const f = () => {
          const k = (skipped || fast) ? 1 : Math.min(1, (performance.now() - t0) / dur);
          const n = Math.floor(segs.length * (1 - Math.pow(1 - k, 1.6)));
          if (n > done) { drawUpTo(n, done, COL[cols[0]]); done = n; }
          if (k >= 1) { fast = false; z(); } else requestAnimationFrame(f);
        };
        f();
      });
      vibrate(8);
      // 昇格：線の色が変わる
      for (let s = 1; s < cols.length; s++) {
        await wait(500);
        g.clearRect(0, 0, R.width, R.height); drawUpTo(segs.length, 0, COL[cols[s]]);
        setColor(cols[s]); flash(0.45);
        burst(R.left + R.width / 2, R.top + R.height / 2, COL[cols[s]], 70, 6);
        vibrate(cols[s] === 5 ? [50, 30, 90] : 40);
      }
      if (art.url) real.src = art.url;
    } else {
      // 線が作れないとき（着せ替えなど）は、色が変わる演出だけにして、そのまま絵を見せる
      for (let s = 1; s < cols.length; s++) { await wait(400); setColor(cols[s]); flash(0.45); vibrate(40); }
      ghost.innerHTML = thumbHTML(it); hydrateThumbs(ghost);
      const im = ghost.querySelector('img');
      if (im && !im.classList.contains('thumb-wait')) real.src = im.src;
      else { const { renderThumb } = await import('./thumbs.js'); const u = await Promise.race([renderThumb(it), new Promise(z => setTimeout(() => z(null), skipped ? 0 : 3000))]); if (u) real.src = u; }
      ghost.innerHTML = '';
    }
    // ④ 寸法
    if (art && art.dims) {
      const b = bounds, pad = 4;
      const X0 = b.x0 * 100, X1 = b.x1 * 100, Y0 = b.y0 * 100, Y1 = b.y1 * 100;
      const yb = Math.min(97, Y1 + pad), xr = Math.min(97, X1 + pad);
      dimsSvg.innerHTML = `<path d="M${X0} ${yb} H${X1} M${X0} ${yb - 1.5} V${yb + 1.5} M${X1} ${yb - 1.5} V${yb + 1.5} M${xr} ${Y0} V${Y1} M${xr - 1.5} ${Y0} H${xr + 1.5} M${xr - 1.5} ${Y1} H${xr + 1.5}"/>`;
      box.querySelector('.bp-dt')?.remove(); box.querySelector('.bp-dt2')?.remove();
      box.insertAdjacentHTML('beforeend', `<span class="bp-dt" style="left:${(X0 + X1) / 2}%;top:${yb}%">W ${art.dims.w}</span><span class="bp-dt2" style="left:${xr}%;top:${(Y0 + Y1) / 2}%">H ${art.dims.h}</span>`);
    }
    bp.classList.add('dimmed');
    await wait(600 * slow);
    // ⑤ 光の線がなぞって本物に
    bp.classList.add('real');
    vibrate(rar >= 4 ? 30 : 10);
    await wait(1000);
    // ⑥ ハンコと名前
    bp.querySelector('.tb-name').textContent = it.name;
    bp.classList.add('named');
    if (rar >= 4) {
      bp.classList.add('stamped');
      flash(rar === 5 ? 0.6 : 0.35);
      const b = st.getBoundingClientRect();
      burst(b.left + b.width / 2, b.top + b.height / 2, COL[rar], rar === 5 ? 160 : 70, rar === 5 ? 10 : 7);
      vibrate(rar === 5 ? [60, 60, 120] : 40);
    }
    // タップするまで待つ（スキップのときは待たない）
    if (!skipped) await new Promise(z => { const go = () => { bp.removeEventListener('click', go); z(); }; setTimeout(() => bp.addEventListener('click', go), 500); });
    fast = false;
  }

  // 10連：1枚の紙に10この図面。1つずつ線で描いて、まとめて本物に
  async function grid() {
    bp.classList.remove('one');
    bp.classList.add('ten');
    setColor(steps[0]);
    const gd = bp.querySelector('.bp-grid');
    gd.innerHTML = res.map(r => `<div class="bg-c r${r.rarity}" style="--cc:${COL[r.rarity]}"><canvas></canvas><img class="bg-real" alt=""><i>${'★'.repeat(r.rarity)}</i></div>`).join('');
    const cells = [...gd.querySelectorAll('.bg-c')].map((el, i) => ({ el, r: res[i], cv: el.querySelector('canvas'), img: el.querySelector('.bg-real'), segs: null }));
    const paint = (c, color, k = 1) => {
      const R = c.cv.getBoundingClientRect();
      if (c.cv.width !== Math.round(R.width * dpr)) { c.cv.width = Math.round(R.width * dpr); c.cv.height = Math.round(R.height * dpr); }
      const g = c.cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, R.width, R.height);
      if (!c.segs) return;
      // 図面のマスは縦長なので、正方形の絵を真ん中に
      const sz = Math.min(R.width, R.height), ox = (R.width - sz) / 2, oy = (R.height - sz) / 2;
      g.strokeStyle = color; g.lineWidth = 0.9; g.lineCap = 'round'; g.shadowColor = color; g.shadowBlur = 3;
      g.beginPath();
      const n = Math.floor(c.segs.length * k);
      for (let j = 0; j < n; j++) { const q = c.segs[j]; g.moveTo(ox + q[0] * sz, oy + q[1] * sz); g.lineTo(ox + q[2] * sz, oy + q[3] * sz); }
      g.stroke();
    };
    const colOf = (c, upto) => COL[Math.min(c.r.rarity, upto)];
    // 1つずつ描く（線の準備が間に合わない物は、あとで本物になる）
    for (const c of cells) {
      const art = await artWithin(c.r.item, 1500);
      if (art && art.segs) {
        c.segs = art.segs.slice().sort((p, q) => Math.min(p[1], p[3]) - Math.min(q[1], q[3]));
        c.url = art.url;
        const t0 = performance.now(), dur = 260;
        await new Promise(z => { const f = () => { const k = (skipped || fast) ? 1 : Math.min(1, (performance.now() - t0) / dur); paint(c, colOf(c, steps[0]), k); if (k >= 1) z(); else requestAnimationFrame(f); }; f(); });
      } else c.el.classList.add('wait');
      c.el.classList.add('draw');
      vibrate(5);
    }
    fast = false;
    await wait(350);
    // 昇格：レア度の高いマスから色が変わる
    for (let s = 1; s < steps.length; s++) {
      setColor(steps[s]); flash(0.4); vibrate(40);
      cells.forEach(c => paint(c, colOf(c, steps[s])));
      await wait(600);
    }
    setColor(top);
    // 本物の絵を用意（線が作れなかった物は小さな絵で）
    const { renderThumb } = await import('./thumbs.js');
    await Promise.all(cells.map(async c => {
      let u = c.url;
      if (!u) { const a2 = await artWithin(c.r.item, 2500); u = a2?.url || null; }
      if (!u) u = await Promise.race([renderThumb(c.r.item), new Promise(z => setTimeout(() => z(null), skipped ? 0 : 2500))]);
      if (!u) { const tmp = document.createElement('div'); tmp.innerHTML = thumbHTML(c.r.item); const im = tmp.querySelector('img'); if (im && !im.classList.contains('thumb-wait')) u = im.src; }
      if (u) c.img.src = u;
    }));
    bp.classList.add('real');
    vibrate(top >= 4 ? [30, 40, 70] : 20);
    cells.forEach((c, i) => setTimeout(() => c.el.classList.add('real'), skipped ? 0 : 250 + Math.floor(i / 5) * 420));
    await wait(1100);
    if (top >= 4) { flash(top === 5 ? 0.5 : 0.3); burst(innerWidth / 2, innerHeight * 0.42, COL[top], top === 5 ? 160 : 80, 9); }
    await wait(700);
    gd.innerHTML = '';
  }

  async function showCards() {
    ov.insertAdjacentHTML('beforeend', `<div class="pfx-cards ${ten ? 'ten' : 'one'} hide"></div>
    <div class="pfx-btns hide"><button class="btn ghost again">もう一度</button><button class="btn gold ok">OK</button></div>`);
    ov.querySelector('.ok').onclick = () => close(false);
    ov.querySelector('.again').onclick = () => close(true);
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
    // 設計図で描いた絵があれば、カードにもすぐ使う
    box.querySelectorAll('.pc').forEach((c, i) => getArt(res[i].item).then(a => {
      const im = c.querySelector('img.thumb-wait');
      if (a?.url && im) { im.src = a.url; im.classList.remove('thumb-wait'); }
    }));
    box.classList.remove('hide');
    // 設計図でもう見せたので、カードは表向きのまま並べる（めくり直さない）
    const cards = [...box.querySelectorAll('.pc')];
    cards.forEach((c, i) => { c.classList.add('flip', 'open'); c.style.animationDelay = (i * 0.04) + 's'; c.classList.add('deal'); });
    await wait(ten ? 450 : 250);
    ov.querySelector('.pfx-skip').remove();
    ov.querySelector('.pfx-btns').classList.remove('hide');
  }

  const close = (again) => { alive = false; removeEventListener('resize', fit); ov.remove(); onDone && onDone(again); };

}

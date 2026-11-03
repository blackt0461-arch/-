/* ===== うかぶメモ（ピクチャ・イン・ピクチャ） =====
 * けっかを キャンバスに かいて 動画にし、iPhone の ピクチャ・イン・ピクチャで ゲームの上に うかべる。
 * うかべられない 機種では、同じ メモを 画像で 出す。
 */
const Pip = (() => {
  const W = 800, H = 450;
  const COL = { 赤: '#e5534b', 青: '#4f8cf0', 黄: '#e8c33a', 緑: '#4cb860', 紫: '#a36ae0' };
  let timer = null, video = null, canvas = null;

  function lines(entry) {
    const r = entry.r;
    const eq = [['武器', r.W], ...PARTS.map(p => [p.replace('防具', ''), r.eq[p]]), ['アクセ', r.eq.c0]];
    const lvTxt = x => { const s = S.eq[x.it.id] || {}; return x.it.maxLv > 1 && (s.lv > 1 || s.t) ? ` Lv${s.lv || 1}${s.t ? s.t + '凸' : ''}` : ''; };
    return {
      title: `${entry.idx === 0 ? '★' : ''}${entry.idx + 1}人め ${entry.p.job}`,
      eq: eq.map(([k, x]) => [k, x ? x.it.n + lvTxt(x) : 'なし']),
      mem: r.slots.map((c, j) => [c, r.mem[j] ? r.mem[j].m.n + (r.mem[j].rank !== 'S' ? ' ' + r.mem[j].rank : '') : 'あき'])
    };
  }

  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function draw(c, L, tick) {
    const x = c.getContext('2d');
    x.fillStyle = '#070816'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#0d1030'; x.strokeStyle = '#f3efe0'; x.lineWidth = 6;
    x.beginPath(); x.roundRect(8, 8, W - 16, H - 16, 16); x.fill(); x.stroke();
    x.textBaseline = 'middle';
    x.font = '30px "DotGothic16", sans-serif'; x.fillStyle = '#f6c945';
    x.fillText(fit(x, L.title, W - 90), 30, 44);
    x.font = '40px "DotGothic16", sans-serif';
    const y0 = 104, lh = 56;
    // 左：そうび（つけるものだけ）
    const eq = L.eq.filter(([, v]) => v !== 'なし');
    eq.forEach(([, v], i) => { x.fillStyle = '#f3efe0'; x.fillText(fit(x, v, 370), 30, y0 + i * lh); });
    // 右：メモリ（枠の色つき）
    x.strokeStyle = '#3a3f7a'; x.lineWidth = 2; x.beginPath(); x.moveTo(412, 80); x.lineTo(412, H - 30); x.stroke();
    L.mem.forEach(([c, v], i) => {
      const y = y0 + i * lh;
      const cs = c === '虹' ? ['#e5534b', '#e8c33a', '#4cb860', '#4f8cf0'] : [...c].map(z => COL[z] || '#888');
      cs.forEach((col, k) => { x.fillStyle = col; x.fillRect(428 + k * 9, y - 16, 7, 32); });
      x.fillStyle = v === 'あき' ? '#8d90b8' : '#f3efe0'; x.fillText(fit(x, v, W - 480), 470, y);
    });
    // カーソルを ちかちか させて 動画の フレームを 出しつづける
    x.fillStyle = tick % 2 ? '#f6c945' : '#0d1030';
    x.beginPath(); x.moveTo(W - 48, 32); x.lineTo(W - 30, 44); x.lineTo(W - 48, 56); x.fill();
  }

  function stop() {
    clearInterval(timer); timer = null;
    if (video) { try { if (document.pictureInPictureElement === video) document.exitPictureInPicture(); } catch (e) { } video.srcObject = null; }
    video = null; canvas = null;
  }

  async function open(idx) {
    const R = lastResult; if (!R || R.err) return;
    const entry = idx === 0 ? R.main : R.subs.find(s => s.idx === idx);
    if (!entry) return;
    stop();
    try { await document.fonts.load('30px "DotGothic16"'); } catch (e) { }
    const L = lines(entry);
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    let tick = 0; draw(canvas, L, tick);
    const sh = document.getElementById('sheet');
    const canStream = typeof canvas.captureStream === 'function';
    const canPip = canStream && (document.pictureInPictureEnabled || 'webkitSetPresentationMode' in HTMLVideoElement.prototype);
    if (canPip) {
      video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
      video.style.cssText = 'width:100%;border-radius:8px;display:block;margin-top:8px';
      video.srcObject = canvas.captureStream(4);
      timer = setInterval(() => { tick++; draw(canvas, L, tick); }, 500);
    }
    sh.innerHTML = `<div class="win"><span class="tag">うかぶメモ</span>
      <div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:0">${esc(L.title)}</h2><button class="btn" data-act="pipclose">とじる</button></div>
      <div id="pipbox"></div>
      ${canPip ? `<button class="btn big" style="margin-top:10px" data-act="pipgo">▶ うかべる</button>
        <div class="note" style="margin-top:6px">うかべたら ゲームに きりかえてください。メモは 小さな まどで 上に のこります。まどは ゆびで うごかしたり、ひろげたり できます。</div>`
      : `<div class="note" style="margin-top:6px">この きしゅでは うかべられませんでした。この がめんを スクショして、ゲーム中は 写真アプリで 見てください。</div>`}
      <div class="note" id="pipmsg"></div></div>`;
    sh.hidden = false;
    const box = document.getElementById('pipbox');
    if (canPip) { box.appendChild(video); video.play().catch(() => { }); }
    else { const img = new Image(); img.src = canvas.toDataURL('image/png'); img.style.cssText = 'width:100%;border-radius:8px;display:block;margin-top:8px'; img.alt = 'メモ'; box.appendChild(img); }
  }

  async function go() {
    if (!video) return;
    const msg = document.getElementById('pipmsg');
    try {
      if (video.paused) await video.play().catch(() => { });
      if (document.pictureInPictureEnabled && video.requestPictureInPicture) await video.requestPictureInPicture();
      else if (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture')) video.webkitSetPresentationMode('picture-in-picture');
      else throw new Error('unsupported');
      if (msg) msg.textContent = 'うかべました。ゲームに きりかえてください。';
    } catch (e) {
      if (msg) msg.innerHTML = 'うかべられませんでした。上の メモを スクショして、ゲーム中は 写真アプリで 見てください。';
    }
  }

  return { open, go, stop };
})();

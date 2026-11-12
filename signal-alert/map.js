'use strict';
// 電波マップ と 圏外の予告
// 位置情報はこの端末の中(localStorage)だけに保存し、外部には送らない。
// 地図画像は使わず、記録した点を自前で描く(通信状況が悪くても表示でき、外部サービスも不要)。

(function () {
  const MAP_KEY = 'signal-alert-map-v1';
  const SET_KEY = 'signal-alert-settings-v1';
  const MCFG = {
    minMoveM: 25,             // この距離以上動いたら新しい点として記録
    maxPoints: 3000,          // 保存する点の上限(古いものから消す)
    maxAccuracyM: 100,        // 位置の誤差がこれより大きい時は記録しない
    posFreshMs: 15000,        // この時間より古い位置は使わない
    warnRadiusM: 200,         // 過去に悪かった場所にこの距離まで近づいたら予告
    warnCooldownMs: 5 * 60 * 1000, // 予告を繰り返さない時間
    ignoreRecentMs: 10 * 60 * 1000, // 直近10分の記録は予告に使わない(通り過ぎた場所で鳴らないように)
    nearRadiusM: 500,         // 「周辺」表示の半径
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    locToggle: $('opt-location'), predictToggle: $('opt-predict'),
    canvas: $('map'), info: $('map-info'), viewBtn: $('map-view'),
    demoBtn: $('map-demo'), clearBtn: $('map-clear'), banner: $('warn-banner'),
  };

  let settings = load(SET_KEY, { location: false, predict: true });
  let points = load(MAP_KEY, []);
  let pos = null;            // {lat, lng, acc, t}
  let watchId = null;
  let lastSaved = null;
  let lastWarn = 0;
  let view = 'near';         // near | all
  let demo = null;           // デモ表示中の点(保存しない)

  function load(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; } catch (e) { return def; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }

  // 2点間の距離(m)
  function dist(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // ===== 位置情報 =====
  function startWatch() {
    if (watchId !== null || !settings.location) return;
    if (!('geolocation' in navigator)) { setInfo('位置情報なし'); return; }
    try {
      watchId = navigator.geolocation.watchPosition(onPos, onPosError, {
        enableHighAccuracy: true, maximumAge: 5000, timeout: 20000,
      });
    } catch (e) {
      onPosError();
    }
  }
  function stopWatch() {
    if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} }
    watchId = null;
  }
  function onPos(p) {
    pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    checkWarning();
    draw();
  }
  function onPosError(err) {
    stopWatch();
    const denied = err && err.code === 1;
    setInfo(denied ? '位置情報が未許可' : '位置情報なし');
  }

  // ===== 記録(app.js が測定のたびに呼ぶ) =====
  function onSample(ms) {
    if (!settings.location || !pos) return;
    if (Date.now() - pos.t > MCFG.posFreshMs || pos.acc > MCFG.maxAccuracyM) return;
    const kind = ms === null ? 'bad' : ms > CONFIG.slowMs ? 'slow' : 'good';
    const here = { lat: pos.lat, lng: pos.lng };
    if (lastSaved) {
      const d = dist(lastSaved, here);
      const changed = kind !== lastSaved.k;
      if (d < MCFG.minMoveM && !(changed && d >= 5)) return;
    }
    const pt = { lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6), k: kind, ms, t: Date.now() };
    points.push(pt);
    if (points.length > MCFG.maxPoints) points.splice(0, points.length - MCFG.maxPoints);
    lastSaved = pt;
    save(MAP_KEY, points);
    draw();
  }

  // ===== 圏外の予告 =====
  function checkWarning() {
    if (!settings.predict || !running || !pos || state !== 'good') return;
    const now = Date.now();
    if (now - lastWarn < MCFG.warnCooldownMs) return;
    let nearest = null, nd = Infinity;
    for (const p of points) {
      if (p.k === 'good' || now - p.t < MCFG.ignoreRecentMs) continue;
      const d = dist(pos, p);
      if (d < nd) { nd = d; nearest = p; }
    }
    if (!nearest || nd > MCFG.warnRadiusM) return;
    lastWarn = now;
    const what = nearest.k === 'bad' ? '圏外' : '遅く';
    showBanner(`約${Math.max(10, Math.round(nd / 10) * 10)}m先は${what}になりやすい`);
    playWarn();
  }
  function playWarn() {     // 予告:中くらいの音を2回
    if (typeof beep !== 'function') return;
    beep(880, 0, 0.2, 0.3);
    beep(880, 0.35, 0.2, 0.3);
  }
  let bannerTimer = null;
  function showBanner(text) {
    els.banner.textContent = text;
    els.banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { els.banner.hidden = true; }, 15000);
  }

  // ===== 描画 =====
  function setInfo(t) { els.info.textContent = t; }

  function draw() {
    const c = els.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = 260;
    if (!w) return;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(0, 0, w, h);

    const list = demo ? demo.points : points;
    const me = demo ? demo.pos : pos;

    if (!list.length && !me) {
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '13px sans-serif'; g.textAlign = 'center';
      g.fillText(settings.location ? 'まだ記録なし' : '「場所を記録」をオンにすると記録します', w / 2, h / 2);
      g.textAlign = 'left';
      return;
    }

    // 表示範囲を決める(メートル座標)
    const center = me || list[list.length - 1];
    const toXY = (p) => ({
      x: (p.lng - center.lng) * 111320 * Math.cos(center.lat * Math.PI / 180),
      y: (p.lat - center.lat) * 110540,
    });
    let shown = list, half;
    if (view === 'near') {
      half = MCFG.nearRadiusM;
      shown = list.filter((p) => dist(center, p) <= half * 1.5);
    } else {
      half = 100;
      for (const p of list) { const q = toXY(p); half = Math.max(half, Math.abs(q.x) * h / w, Math.abs(q.y)); }
      half *= 1.1;
    }
    const scale = (h / 2 - 10) / half;           // 1m あたりのピクセル
    const px = (p) => { const q = toXY(p); return { x: w / 2 + q.x * scale, y: h / 2 - q.y * scale }; };

    // 点(良好→遅い→圏外の順に重ねる)
    const color = { good: '#86efac', slow: '#fde047', bad: '#f87171' };
    for (const k of ['good', 'slow', 'bad']) {
      g.fillStyle = color[k];
      for (const p of shown) {
        if (p.k !== k) continue;
        const q = px(p);
        if (q.x < -5 || q.x > w + 5 || q.y < -5 || q.y > h + 5) continue;
        g.beginPath(); g.arc(q.x, q.y, k === 'good' ? 3 : 5, 0, Math.PI * 2); g.fill();
      }
    }

    // 予告の範囲と現在地
    if (me) {
      const q = px(me);
      if (settings.predict) {
        g.strokeStyle = 'rgba(96,165,250,.6)'; g.setLineDash([4, 4]); g.lineWidth = 1;
        g.beginPath(); g.arc(q.x, q.y, MCFG.warnRadiusM * scale, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(q.x, q.y, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(q.x, q.y, 6, 0, Math.PI * 2); g.fill();
    }

    // 北の向きと縮尺
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '12px sans-serif';
    g.fillText('↑北', 8, 16);
    const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    const target = (w * 0.3) / scale;
    const len = nice.find((n) => n >= target) || nice[nice.length - 1];
    const lpx = len * scale;
    g.fillRect(w - 12 - lpx, h - 14, lpx, 2);
    g.textAlign = 'right';
    g.fillText(len >= 1000 ? `${len / 1000}km` : `${len}m`, w - 12, h - 20);
    g.textAlign = 'left';

    // 凡例(左下)
    let lx = 8;
    g.font = '12px sans-serif'; g.textBaseline = 'middle';
    for (const [k, name] of [['good', '良好'], ['slow', '遅い'], ['bad', '圏外']]) {
      g.fillStyle = color[k]; g.beginPath(); g.arc(lx + 5, h - 13, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(name, lx + 14, h - 13);
      lx += 14 + g.measureText(name).width + 12;
    }
    g.textBaseline = 'alphabetic';

    const bad = list.filter((p) => p.k === 'bad').length;
    const slow = list.filter((p) => p.k === 'slow').length;
    setInfo(`${demo ? 'デモ ' : ''}圏外 ${bad} ・ 遅い ${slow}`);
  }

  // ===== デモ(実際の記録は変えない) =====
  function makeDemo() {
    // 駅から大学までの通学路を想定。途中にトンネル(圏外)と地下通路(遅い)がある
    const base = { lat: 34.7025, lng: 135.4959 };
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const f = i / 120;
      const lat = base.lat + f * 0.018 + Math.sin(f * 6) * 0.0012;
      const lng = base.lng + f * 0.022;
      let k = 'good';
      if (i >= 40 && i <= 52) k = 'bad';
      else if ((i >= 36 && i < 40) || (i > 52 && i <= 55) || (i >= 88 && i <= 93)) k = 'slow';
      pts.push({ lat, lng, k, ms: k === 'bad' ? null : k === 'slow' ? 1400 : 120, t: 0 });
    }
    return { points: pts, pos: { lat: pts[30].lat, lng: pts[30].lng } };
  }

  // ===== 設定と操作 =====
  function applySettings() {
    els.locToggle.checked = settings.location;
    els.predictToggle.checked = settings.predict;
    els.predictToggle.disabled = !settings.location;
  }
  els.locToggle.addEventListener('change', () => {
    settings.location = els.locToggle.checked;
    save(SET_KEY, settings);
    applySettings();
    setInfo('');
    if (settings.location) startWatch(); else { stopWatch(); pos = null; }
    draw();
  });
  els.predictToggle.addEventListener('change', () => {
    settings.predict = els.predictToggle.checked;
    save(SET_KEY, settings);
    draw();
  });
  els.viewBtn.addEventListener('click', () => {
    view = view === 'near' ? 'all' : 'near';
    els.viewBtn.textContent = view === 'near' ? '全体' : '周辺';
    draw();
  });
  els.demoBtn.addEventListener('click', () => {
    demo = demo ? null : makeDemo();
    els.demoBtn.textContent = demo ? '終了' : 'デモ';
    if (demo && settings.predict) showBanner('約200m先は圏外になりやすい');
    if (!demo) setInfo('');
    draw();
  });
  els.clearBtn.addEventListener('click', () => {
    points = []; lastSaved = null; save(MAP_KEY, points); setInfo(''); draw();
  });
  els.banner.addEventListener('click', () => { els.banner.hidden = true; });
  window.addEventListener('resize', draw);

  // 位置情報は「アプリを開いている間」だけ使う
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (settings.location) startWatch(); }
    else stopWatch();
  });

  applySettings();
  if (settings.location) startWatch();
  draw();

  window.SignalMap = { onSample, draw };
})();

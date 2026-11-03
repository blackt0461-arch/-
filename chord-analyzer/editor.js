// 作曲ツールのような編集画面：再生と聞き比べ、トラック（元の曲・コード・歌詞・メロ）、コードのパレットと道具。
// コードの変更は歌本（songbook）を通して記録する（保存・訂正のくせ・精度アップのデータ送信が同じしくみで動く）
import { parseChordName, NOTE_NAMES } from './chord-engine.js';

const PX_PER_BEAT = 40;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない環境 */ } },
};

// キーに合うコード（長調の Ⅰ〜Ⅶ）
const DIATONIC = [[0, '', 'Ⅰ'], [2, 'm', 'Ⅱm'], [4, 'm', 'Ⅲm'], [5, '', 'Ⅳ'], [7, '', 'Ⅴ'], [9, 'm', 'Ⅵm'], [11, 'm7-5', 'Ⅶm7-5']];

/**
 * app：{ getAnalysis, media, songbook, playSequence, playNotes, chartItems(), shapeName(name), voicingNotes(name), keyOf(), rerender() }
 */
export function initEditor(app) {
  const el = {
    play: $('ed-play'), back: $('ed-back'), loop: $('ed-loop'), speed: $('song-speed'), time: $('ed-time'),
    mode: $('ed-mode'), volOrig: $('ed-vol-orig'), volChord: $('ed-vol-chord'),
    scroller: $('ed-scroller'), ruler: $('ed-ruler'), wave: $('ed-wave'), chords: $('ed-chords'), lyrics: $('ed-lyrics'), notes: $('ed-notes'),
    sel: $('ed-sel'), palette: $('ed-palette'), variants: $('ed-variants'),
    undo: $('ed-undo'), add: $('ed-add'), del: $('ed-del'), audition: $('ed-audition'), more: $('ed-more'),
  };
  let selected = -1, playing = false, synth = null, raf = 0, history = [], adding = false;
  let mix = store.get('editorMix', { mode: 'both', orig: 0.8, chord: 0.8 });

  // ---- 時刻 ↔ 横の位置（拍の線にそろえる） ----
  const beatsOf = () => {
    const a = app.getAnalysis();
    if (a?.beats?.length >= 2) return a.beats;
    const p = 0.5; return Array.from({ length: Math.ceil((a?.duration ?? 10) / p) + 1 }, (_, i) => i * p);
  };
  const period = (b) => (b.at(-1) - b[0]) / Math.max(1, b.length - 1);
  function xOf(t) {
    const b = beatsOf(), p = period(b);
    if (t <= b[0]) return ((t - b[0]) / p) * PX_PER_BEAT + PX_PER_BEAT;
    let i = b.findIndex((x) => x > t) - 1;
    if (i < 0) i = b.length - 1;
    const next = b[i + 1] ?? b[i] + p;
    return (i + (t - b[i]) / (next - b[i]) + 1) * PX_PER_BEAT;
  }
  function tOf(x) {
    const b = beatsOf(), p = period(b);
    const k = x / PX_PER_BEAT - 1;
    if (k < 0) return Math.max(0, b[0] + k * p);
    const i = Math.floor(k), f = k - i;
    const s = b[i] ?? b.at(-1) + (i - b.length + 1) * p, e = b[i + 1] ?? s + p;
    return s + f * (e - s);
  }
  // 拍（半拍）の線にそろえる
  const snap = (t) => { const x = xOf(t); return tOf(Math.round(x / (PX_PER_BEAT / 2)) * (PX_PER_BEAT / 2)); };

  // ---- 描く ----
  function render() {
    const a = app.getAnalysis();
    if (!a) return;
    const width = Math.ceil(xOf(a.duration) + PX_PER_BEAT * 2);
    el.scroller.querySelectorAll('.ed-lane-body, .ed-ruler').forEach((n) => { n.style.width = `${width}px`; });
    // 小節の番号と線
    const b = beatsOf(), down = ((a.downbeat ?? 0) % 4 + 4) % 4;
    el.ruler.innerHTML = b.map((t, i) => ((i - down) % 4 === 0 ? `<span style="left:${xOf(t)}px">${(i - down) / 4 + 1}</span>` : '')).join('');
    const grid = `background-size:${PX_PER_BEAT}px 100%;background-position:${PX_PER_BEAT}px 0`;
    el.scroller.querySelectorAll('.ed-lane-body').forEach((n) => { n.style.cssText += `;${grid}`; });
    renderWave(a, width);
    renderChords(a);
    renderLyrics();
    renderNotes(a);
    renderPalette();
    updateHead(app.media.currentTime);
  }
  function renderWave(a, width) {
    const peaks = a.peaks ?? [];
    if (!peaks.length) { el.wave.innerHTML = ''; return; }
    const step = a.peakStep ?? 0.05, h = 44, mid = h / 2;
    const pts = peaks.map((v, i) => `${xOf(i * step).toFixed(1)},${(mid - v * mid * 0.95).toFixed(1)}`);
    const back = peaks.map((v, i) => `${xOf(i * step).toFixed(1)},${(mid + v * mid * 0.95).toFixed(1)}`).reverse();
    el.wave.innerHTML = `<svg width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" preserveAspectRatio="none"><polygon points="${pts.join(' ')} ${back.join(' ')}"/></svg>`;
  }
  function renderChords(a) {
    el.chords.innerHTML = a.timeline.map((s, i) => {
      const x = xOf(s.start), w = Math.max(14, xOf(s.end) - x - 2);
      return `<div class="ed-blk${i === selected ? ' sel' : ''}" data-i="${i}" style="left:${x}px;width:${w}px">${i === selected && i > 0 ? '<span class="ed-h l" data-h="l"></span>' : ''}<b>${esc(app.shapeName(s.name))}</b>${i === selected && i < a.timeline.length - 1 ? '<span class="ed-h r" data-h="r"></span>' : ''}</div>`;
    }).join('') + '<div class="ed-head"></div>';
  }
  function renderLyrics() {
    const spans = app.songbook.lyricSpans();
    el.lyrics.innerHTML = (spans.length ? spans.map((s) => `<span class="ed-lyr" style="left:${xOf(s.start)}px;max-width:${Math.max(30, xOf(s.end) - xOf(s.start) - 4)}px">${esc(s.text)}</span>`).join('') : '<span class="ed-empty">歌本に歌詞を入れると、ここに並びます</span>') + '<div class="ed-head"></div>';
  }
  function renderNotes(a) {
    const ev = a.events ?? [];
    el.notes.innerHTML = ev.flatMap((e) => e.notes.map((m) => {
      const y = Math.max(2, Math.min(38, 40 - ((m - 40) / 48) * 38));
      return `<i style="left:${xOf(e.t)}px;top:${y}px;width:${Math.max(4, xOf(e.t + Math.min(e.dur ?? 0.15, 1)) - xOf(e.t))}px"></i>`;
    })).join('') + '<div class="ed-head"></div>';
  }

  // ---- パレット（キーに合うコード）と、選んだコードの変化形 ----
  function renderPalette() {
    const a = app.getAnalysis();
    const key = app.keyOf();
    const tonic = key ? (key.minor ? (key.root + 3) % 12 : key.root) : 0;
    const cur = selected >= 0 ? a.timeline[selected]?.name : null;
    const curShape = cur ? app.shapeName(cur) : null;
    el.sel.innerHTML = cur
      ? `<b>${esc(curShape)}</b> を選んでいます・下のコードを押すと、音が鳴って入れかわります`
      : adding ? '<b>足すコードを選んでください</b>（再生位置に足します）' : 'コードのブロックを押して選んでください（押すと音が鳴ります）';
    el.palette.innerHTML = DIATONIC.map(([iv, q, deg]) => {
      const name = `${NOTE_NAMES[(tonic + iv) % 12]}${q}`;
      return `<button type="button" class="ed-pc${curShape === name ? ' cur' : ''}" data-name="${esc(name)}">${esc(name)}<small>${deg}</small></button>`;
    }).join('') + '<button type="button" class="ed-pc" data-more="1">…<small>ほか</small></button>';
    el.variants.innerHTML = curShape ? variantsOf(curShape).map((v) => `<button type="button" class="ed-var" data-name="${esc(v)}">${esc(v)}</button>`).join('') : '';
  }
  function variantsOf(name) {
    const p = parseChordName(name);
    if (!p) return [];
    const root = name.match(/^[A-G][#♯b♭]?/)?.[0] ?? '';
    const minor = p.type.suffix.startsWith('m') && !p.type.suffix.startsWith('maj');
    const list = minor ? [`${root}m7`, `${root}m9`, `${root}`, `${root}sus4`, `${root}m6`] : [`${root}7`, `${root}maj7`, `${root}add9`, `${root}sus4`, `${root}m`, `${root}6`];
    const tones = p.type.intervals.map((i) => NOTE_NAMES[(p.root + i) % 12]);
    tones.slice(1).forEach((b) => list.push(`${name.split('/')[0]}/${b}`));
    return [...new Set(list)].filter((x) => x !== name);
  }

  // ---- 再生と聞き比べ ----
  // 元の曲は動画（音声）で、コードは押さえ方の音で、同じ時刻から一緒に鳴らす。
  // 「コードだけ」でも時計として元の曲を消音で流す
  function applyMix() {
    const m = app.media;
    m.volume = Math.min(1, mix.orig);
    m.muted = mix.mode === 'chord';
    synth?.setVolume(mix.mode === 'orig' ? 0 : mix.chord);
    el.mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mix.mode)));
    el.volOrig.value = Math.round(mix.orig * 100);
    el.volChord.value = Math.round(mix.chord * 100);
    store.set('editorMix', mix);
  }
  async function startChords() {
    synth?.stop();
    synth = null;
    if (!playing) return;
    synth = await app.playSequence(app.chartItems(), { from: app.media.currentTime, rate: app.media.playbackRate, volume: mix.mode === 'orig' ? 0 : mix.chord });
  }
  async function play() {
    playing = true;
    el.play.textContent = '⏸';
    el.play.setAttribute('aria-label', '止める');
    applyMix();
    try { await app.media.play(); } catch { /* 再生できないときは何もしない */ }
    await startChords();
    tick();
  }
  function pause() {
    playing = false;
    el.play.textContent = '▶';
    el.play.setAttribute('aria-label', '再生');
    app.media.pause();
    synth?.stop();
    synth = null;
    cancelAnimationFrame(raf);
  }
  function seek(t) {
    app.media.currentTime = Math.max(0, t);
    updateHead(t);
    if (playing) startChords();
  }
  // 再生位置の線を動かし、見えるところに保つ。くり返しがオンなら、選んだコードの間をくり返す
  function tick() {
    if (!playing) return;
    const t = app.media.currentTime;
    const loopOn = el.loop.getAttribute('aria-pressed') === 'true';
    const seg = app.getAnalysis()?.timeline[selected];
    if (loopOn && seg && (t >= seg.end || t < seg.start - 0.3)) { seek(seg.start); }
    updateHead(t);
    raf = requestAnimationFrame(tick);
  }
  function updateHead(t) {
    const x = xOf(t);
    el.scroller.querySelectorAll('.ed-head').forEach((h) => { h.style.left = `${x}px`; });
    const dur = app.getAnalysis()?.duration ?? 0;
    el.time.textContent = `${fmt(t)} / ${fmt(dur)}`;
    if (playing) {
      const view = el.scroller;
      const target = x - view.clientWidth / 3;
      if (x < view.scrollLeft + 60 || x > view.scrollLeft + view.clientWidth - 60) view.scrollLeft = Math.max(0, target);
    }
  }
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  el.play.addEventListener('click', () => (playing ? pause() : play()));
  el.back.addEventListener('click', () => seek(0));
  el.loop.addEventListener('click', () => el.loop.setAttribute('aria-pressed', String(el.loop.getAttribute('aria-pressed') !== 'true')));
  el.mode.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; mix.mode = b.dataset.mode; applyMix(); });
  el.volOrig.addEventListener('input', () => { mix.orig = el.volOrig.value / 100; applyMix(); });
  el.volChord.addEventListener('input', () => { mix.chord = el.volChord.value / 100; applyMix(); });
  app.media.addEventListener('ended', pause);
  app.media.addEventListener('pause', () => { if (playing && !app.media.ended) pause(); });

  // ---- トラックの操作：押して選ぶ・つまみで長さを変える・空いたところを押すとそこへ移動 ----
  let drag = null;
  el.scroller.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.ed-h');
    if (!h) return;
    e.preventDefault();
    const seg = app.getAnalysis().timeline[selected];
    drag = { side: h.dataset.h, startX: e.clientX, orig: h.dataset.h === 'l' ? xOf(seg.start) : xOf(seg.end) };
    h.setPointerCapture?.(e.pointerId);
  });
  el.scroller.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = drag.orig + (e.clientX - drag.startX);
    const blk = el.chords.querySelector('.ed-blk.sel');
    if (!blk) return;
    const left = parseFloat(blk.style.left), right = left + parseFloat(blk.style.width);
    if (drag.side === 'l') { blk.style.left = `${Math.min(x, right - 14)}px`; blk.style.width = `${Math.max(14, right - x)}px`; } else blk.style.width = `${Math.max(14, x - left)}px`;
    drag.x = x;
  });
  el.scroller.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.x === undefined) return;
    const t = snap(tOf(d.x));
    if (d.side === 'l') edit({ kind: 'move', seg: selected, start: +t.toFixed(3) });
    else edit({ kind: 'move', seg: selected + 1, start: +t.toFixed(3) });
  });
  el.scroller.addEventListener('click', (e) => {
    if (e.target.closest('.ed-h')) return;
    const blk = e.target.closest('.ed-blk');
    const body = e.target.closest('.ed-lane-body, .ed-ruler');
    if (blk) {
      selected = Number(blk.dataset.i);
      adding = false;
      const seg = app.getAnalysis().timeline[selected];
      app.playNotes(app.voicingNotes(seg.name));
      if (!playing) seek(seg.start + 0.01);
      renderChords(app.getAnalysis());
      renderPalette();
      return;
    }
    if (body) {
      const x = e.clientX - body.getBoundingClientRect().left;
      seek(tOf(x));
    }
  });

  // ---- パレットで入れかえる・足す ----
  function choose(name) {
    app.playNotes(app.voicingNotes(name));
    const a = app.getAnalysis();
    if (adding) {
      adding = false;
      const t = snap(app.media.currentTime);
      edit({ kind: 'add', start: +t.toFixed(3), name });
      selected = a.timeline.findIndex((s) => t >= s.start - 0.01 && t < s.end);
      render();
      return;
    }
    if (selected < 0) return;
    edit({ kind: 'rename', seg: selected, name });
  }
  el.palette.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.more) { if (selected >= 0) app.songbook.editSeg(selected); return; }
    choose(b.dataset.name);
  });
  el.variants.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choose(b.dataset.name); });

  // ---- 道具 ----
  function edit(ed) {
    const a = app.getAnalysis();
    history.push(a.timeline.map((s) => ({ ...s })));
    if (history.length > 100) history.shift();
    app.songbook.commitEdit(ed);
    if (selected >= a.timeline.length) selected = a.timeline.length - 1;
    render();
    if (playing) startChords();
  }
  el.undo.addEventListener('click', () => {
    const prev = history.pop();
    if (!prev) return;
    app.songbook.undo(prev);
    if (selected >= prev.length) selected = prev.length - 1;
    render();
    if (playing) startChords();
  });
  el.add.addEventListener('click', () => { adding = true; selected = -1; renderChords(app.getAnalysis()); renderPalette(); });
  el.del.addEventListener('click', () => { if (selected > 0) { edit({ kind: 'remove', seg: selected }); selected -= 1; render(); } });
  el.audition.addEventListener('click', () => {
    const a = app.getAnalysis();
    const seg = a.timeline[selected] ?? a.timeline.find((s) => app.media.currentTime >= s.start && app.media.currentTime < s.end);
    if (seg) app.playNotes(app.voicingNotes(seg.name));
  });

  function onAnalysis() {
    selected = -1; history = []; adding = false;
    pause();
    applyMix();
    render();
    el.scroller.scrollLeft = 0;
  }
  app.media.addEventListener('timeupdate', () => { if (!playing) updateHead(app.media.currentTime); });
  return { onAnalysis, render, pause };
}

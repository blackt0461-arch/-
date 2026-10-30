// 曲（YouTube など）を聞き取った結果から、コード進行とタブ譜を作る

/** YouTube のリンク（watch?v=・youtu.be・shorts など）から動画 ID を取り出す。読めなければ null */
export function parseYouTubeId(text) {
  const t = text.trim();
  const m = t.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(t) ? t : null;
}

/** 秒を「1:05」の形にする */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 1秒に何十回も判定したコード（frames: [{ t, name, confidence }]）を、
 * 「0:12 から C、0:14 から G」のようなコード進行にまとめる。
 * - 前後の判定の多数決で、一瞬だけの誤判定をならす
 * - 信頼度が低いところは「コードなし」として扱う
 * - 短すぎるコードは前のコードの続きとみなす
 */
export function buildChordTimeline(frames, { minDuration = 0.5, minConfidence = 70, window = 5 } = {}) {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const labels = sorted.map((f) => (f.confidence >= minConfidence ? f.name : null));
  const half = Math.floor(window / 2);
  const smoothed = labels.map((_, i) => {
    const counts = new Map();
    for (let j = Math.max(0, i - half); j <= Math.min(labels.length - 1, i + half); j++) {
      counts.set(labels[j], (counts.get(labels[j]) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  });

  // 同じコードが続くところを1つの区間にまとめる。ベース音だけの違い（G と G/D）は同じコードとみなす
  // （動画を飛ばした大きな空きでは区切る）
  const base = (name) => (name === null ? null : name.split('/')[0]);
  const segments = [];
  smoothed.forEach((name, i) => {
    const t = sorted[i].t;
    const last = segments[segments.length - 1];
    if (last && last.base === base(name) && t - last.end < 1) {
      last.end = t;
      last.names.push(name);
    } else {
      segments.push({ base: base(name), names: [name], start: t, end: t });
    }
  });

  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    const close = last && seg.start - last.end < 1;
    if (close && (last.base === seg.base || seg.end - seg.start < minDuration)) {
      // 同じコードの続き、または短すぎる区間は前のコードの続きとみなす
      last.end = seg.end;
      if (last.base === seg.base) last.names.push(...seg.names);
    } else {
      merged.push({ ...seg, names: [...seg.names] });
    }
  }
  // 表示する名前は、その区間でいちばん多かった判定（例：G が多ければ G、G/B が多ければ G/B）
  merged.forEach((seg) => {
    const counts = new Map();
    seg.names.forEach((n) => counts.set(n, (counts.get(n) || 0) + 1));
    seg.name = seg.base === null ? null : [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  });
  return merged
    .filter((seg) => seg.name !== null && seg.end - seg.start >= minDuration * 0.5)
    .map(({ name, start, end }) => ({ name, start, end }));
}

/**
 * 判定した音の並び（frames: [{ t, notes: [MIDI…], onset }]）から、新しく鳴り始めた音（発音）を拾う。
 * 少し前から鳴り続けている音は数えない。ほぼ同時に鳴り始めた音は1つにまとめる（和音）。
 * onset が true のフレームは「弾き直した」瞬間なので、鳴り続けている音でも新しい発音として数える。
 */
export function detectNoteEvents(frames, { holdSeconds = 0.25, groupSeconds = 0.08, maxNotes = 3 } = {}) {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const lastSeen = new Map();
  const events = [];
  for (const { t, notes, onset } of sorted) {
    const fresh = notes.slice(0, maxNotes).filter((m) => onset || !(lastSeen.has(m) && t - lastSeen.get(m) <= holdSeconds));
    notes.forEach((m) => lastSeen.set(m, t));
    if (!fresh.length) continue;
    const last = events[events.length - 1];
    if (last && t - last.t <= groupSeconds) {
      fresh.forEach((m) => { if (!last.notes.includes(m) && last.notes.length < maxNotes) last.notes.push(m); });
    } else {
      events.push({ t, notes: [...fresh] });
    }
  }
  events.forEach((e) => e.notes.sort((a, b) => a - b));
  return events;
}

/**
 * 音の並びを、ギターのどの弦の何フレットで弾くかに割り当てる。
 * 同じ音でも弾ける場所が何か所もあるので、「手の位置の移動が少なく、低いフレットで、
 * 和音は無理なく押さえられる」ように、曲全体でいちばん楽な組み合わせを選ぶ（動的計画法）。
 */
export function assignTab(events, tuning, { capo = 0, maxFret = 15 } = {}) {
  const optionsFor = (midi) => tuning.strings
    .map((open, s) => ({ string: s, fret: midi - open - capo }))
    .filter((p) => p.fret >= 0 && p.fret <= maxFret);

  // 各発音の弾き方の候補（和音は弦が重ならない組み合わせ）
  const candidates = events.map(({ notes }) => {
    const playable = notes.filter((m) => optionsFor(m).length);
    const results = [];
    const pick = (i, used) => {
      if (results.length > 200) return;
      if (i === playable.length) {
        const fretted = used.filter((p) => p.fret > 0).map((p) => p.fret);
        const spread = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
        if (spread > 4) return;
        const center = fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : null;
        const cost = fretted.reduce((a, f) => a + f * 0.05 + (f > 12 ? 1 : 0), 0) + spread * 0.5;
        results.push({ positions: [...used], center, cost });
        return;
      }
      for (const p of optionsFor(playable[i])) {
        if (used.some((u) => u.string === p.string)) continue;
        pick(i + 1, [...used, p]);
      }
    };
    pick(0, []);
    return results.length ? results : [{ positions: [], center: null, cost: 0 }];
  });

  // 前の発音からの手の移動を含めた合計がいちばん小さくなる道すじを選ぶ。
  // 各候補について「そこまでの最小の合計」と「どの候補から来たか」だけを覚えておき、最後にたどり直す
  if (!candidates.length) return [];
  const move = (a, b) => (a === null || b === null ? 0 : Math.abs(a - b) * 0.3);
  let layer = candidates[0].map((c) => ({ total: c.cost, center: c.center, from: -1 }));
  const layers = [layer];
  for (let i = 1; i < candidates.length; i++) {
    layer = candidates[i].map((c) => {
      let best = null;
      layers[i - 1].forEach((p, j) => {
        const total = p.total + c.cost + move(p.center, c.center);
        if (!best || total < best.total) best = { total, center: c.center ?? p.center, from: j };
      });
      return best;
    });
    layers.push(layer);
  }
  let k = layer.reduce((bi, c, i) => (c.total < layer[bi].total ? i : bi), 0);
  const chosen = new Array(candidates.length);
  for (let i = candidates.length - 1; i >= 0; i--) {
    chosen[i] = candidates[i][k].positions;
    k = layers[i][k].from;
  }
  return events.map((e, i) => ({ t: e.t, positions: chosen[i] }));
}

/**
 * タブ譜を文字で書く。上が1弦、下が6弦。1行に perLine 個の発音を並べ、行の頭に時間を付ける。
 *   0:12
 *   e|---0-----|
 *   B|-----1---|
 */
export function formatTab(tabEvents, { perLine = 16, stringNames = ['E', 'A', 'D', 'G', 'B', 'e'] } = {}) {
  const blocks = [];
  for (let i = 0; i < tabEvents.length; i += perLine) {
    const chunk = tabEvents.slice(i, i + perLine);
    const lines = stringNames.map((n) => `${n}|`);
    chunk.forEach(({ positions }) => {
      const width = Math.max(1, ...positions.map((p) => String(p.fret).length));
      for (let s = 0; s < 6; s++) {
        const p = positions.find((q) => q.string === s);
        const text = p ? String(p.fret).padEnd(width, '-') : '-'.repeat(width);
        lines[s] += `-${text}`;
      }
    });
    blocks.push([formatTime(chunk[0].t), ...lines.map((l) => `${l}-|`).reverse()].join('\n'));
  }
  return blocks.join('\n\n');
}

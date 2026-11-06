// 読み上げ（スマホに入っている日本語の声を使う。お金はかからない）
// ・授業のスライドは、作業役が書いた話し言葉（say / sayExplain）を読む
// ・それがないときや問題文は、toSpeech() で数式を日本語の読み方に直してから読む
//   例：$\frac{1}{2}$ → にぶんのいち、$V_{GS}$ → ブイジーエス、$x^2$ → エックスのにじょう

const LETTER = {
  A: 'エー', B: 'ビー', C: 'シー', D: 'ディー', E: 'イー', F: 'エフ', G: 'ジー', H: 'エイチ', I: 'アイ', J: 'ジェイ', K: 'ケー', L: 'エル', M: 'エム',
  N: 'エヌ', O: 'オー', P: 'ピー', Q: 'キュー', R: 'アール', S: 'エス', T: 'ティー', U: 'ユー', V: 'ブイ', W: 'ダブリュー', X: 'エックス', Y: 'ワイ', Z: 'ゼット',
};
const GREEK = {
  alpha: 'アルファ', beta: 'ベータ', gamma: 'ガンマ', Gamma: 'ガンマ', delta: 'デルタ', Delta: 'デルタ', epsilon: 'イプシロン', varepsilon: 'イプシロン', eta: 'イータ', theta: 'シータ',
  lambda: 'ラムダ', mu: 'ミュー', pi: 'パイ', sigma: 'シグマ', Sigma: 'シグマ', tau: 'タウ', phi: 'ファイ', varphi: 'ファイ', omega: 'オメガ', Omega: 'オーム', rho: 'ロー',
};
const OPS = {
  approx: 'だいたい', simeq: 'だいたい', cong: 'だいたい', gg: 'よりずっと大きい', ll: 'よりずっと小さい', ge: '以上', geq: '以上', le: '以下', leq: '以下', lt: 'より小さい', gt: 'より大きい',
  ne: 'ノットイコール', neq: 'ノットイコール', times: 'かける', cdot: 'かける', pm: 'プラスマイナス', infty: 'むげんだい', to: 'を', rightarrow: 'ならば', Rightarrow: 'ならば',
  sum: 'シグマ', int: 'インテグラル', partial: 'ラウンド', propto: 'に比例する', triangleq: 'と決める', equiv: 'と決める', ldots: 'など', cdots: 'など', dots: 'など', prime: 'ダッシュ',
  sin: 'サイン', cos: 'コサイン', tan: 'タンジェント', log: 'ログ', exp: 'イクスポネンシャル', lim: 'リミット', Re: '実部', Im: '虚部',
};
const WORDS = [
  ['MOSFET', 'モスフェット'], ['NMOS', 'エヌモス'], ['PMOS', 'ピーモス'], ['CMOS', 'シーモス'], ['MOS', 'モス'], ['GND', 'グランド'], ['OPアンプ', 'オペアンプ'], ['dB', 'デシベル'],
  ['mA', 'ミリアンペア'], ['kΩ', 'キロオーム'], ['MΩ', 'メガオーム'], ['Ω', 'オーム'], ['mV', 'ミリボルト'], ['NFB', 'エヌエフビー'], ['STEP', 'ステップ'], ['CIS', 'シーアイエス'],
];
const NUM = ['ゼロ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
const SUBWORD = { out: 'アウト', in: 'イン', closed: 'クローズド', open: 'オープン', sub: 'サブ', sat: 'サット', ox: 'オーエックス', max: 'マックス', min: 'ミニマム', eff: 'イーエフエフ' };
const spellLatin = (w) => SUBWORD[w] || w.split('').map((ch) => LETTER[ch.toUpperCase()] || ch).join('');

// { } の組をひとつ取り出す
function group(s, i) {
  if (s[i] !== '{') { // { がないときは1文字（\コマンドなら1語）
    if (s[i] === '\\') { const m = s.slice(i).match(/^\\[A-Za-z]+/); return [m ? m[0] : s[i], i + (m ? m[0].length : 1)]; }
    return [s[i] || '', i + 1];
  }
  let d = 0, j = i;
  for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) break; } }
  return [s.slice(i + 1, j), j + 1];
}
// 数式（LaTeX）を読み方に
export function texToYomi(s) {
  s = String(s).replace(/\/\\!\//g, '//').replace(/\\!/g, '');
  let out = '', i = 0;
  const push = (x) => { out += (out && !/\s$/.test(out) ? ' ' : '') + x; };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const m = s.slice(i).match(/^\\([A-Za-z]+|.)/); const cmd = m[1]; i += m[0].length;
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const [a, i1] = group(s, i); const [b, i2] = group(s, i1); i = i2;
        if (/^d[a-z]$/.test(a) && /^d[a-z]$/.test(b)) { push(`ディー${spellLatin(a[1])} ディー${spellLatin(b[1])}`); continue; } // 微分 dv/dt
        if (/^d$/.test(a) && /^d[a-z]$/.test(b)) { push(`ディー ディー${spellLatin(b[1])}`); continue; }
        if (/^\\partial/.test(a) && /^\\partial/.test(b)) { push(`${texToYomi(a)} ${texToYomi(b)}`); continue; } // 偏微分
        push(`${texToYomi(b)}ぶんの${texToYomi(a)}`);
      } else if (cmd === 'sqrt') { const [a, i1] = group(s, i); i = i1; push(`ルート ${texToYomi(a)}`); }
      else if (['mathrm', 'text', 'mathbf', 'boldsymbol', 'mathit', 'operatorname', 'bar', 'vec', 'hat', 'overline'].includes(cmd)) { const [a, i1] = group(s, i); i = i1; push(cmd === 'text' ? a : texToYomi(a)); }
      else if (['left', 'right', 'big', 'Big', 'bigg', ',', '!', ';', ' ', 'quad', 'qquad', 'displaystyle'].includes(cmd)) { /* 読まない */ }
      else if (cmd === '/') { /* 「\!/\!」の一部 */ }
      else if (cmd === 'int' || cmd === 'sum') { // 積分・足し算の範囲：「ゼロから 2パイまで」
        push(OPS[cmd]);
        let lo = null, hi = null;
        for (let r = 0; r < 2; r++) {
          if (s[i] === '_') { const [a, i1] = group(s, i + 1); lo = a; i = i1; }
          else if (s[i] === '^') { const [a, i1] = group(s, i + 1); hi = a; i = i1; }
        }
        if (lo !== null || hi !== null) push(`${lo !== null ? texToYomi(lo) + 'から' : ''}${hi !== null ? texToYomi(hi) + 'まで' : ''}`);
      }
      else if (GREEK[cmd]) push(GREEK[cmd]);
      else if (OPS[cmd]) push(OPS[cmd]);
      else if (cmd === '{' || cmd === '}') { /* */ }
      else push(spellLatin(cmd));
    } else if (ch === '_') {
      const [a, i1] = group(s, i + 1); i = i1;
      out += (/^[a-z]{2,}$/.test(a) && SUBWORD[a] ? SUBWORD[a] : texToYomi(a).replace(/\s+/g, '')); // 下つきは続けて読む：V_{GS} → ブイジーエス
    } else if (ch === '^') {
      const [a, i1] = group(s, i + 1); i = i1;
      const y = texToYomi(a).replace(/\s+/g, '');
      if (a === '2') push('のにじょう'); else if (a === '3') push('のさんじょう'); else if (a === '*') push('スター'); else if (a === '-1') push('のぎゃくすう'); else push(`の${y}じょう`);
    } else if (ch === '/' && s[i + 1] === '/') { push('へいれつ'); i += 2; }
    else if (/[A-Za-z]/.test(ch)) { push(LETTER[ch.toUpperCase()]); i++; }
    else if (/[0-9.]/.test(ch)) { const m = s.slice(i).match(/^[0-9.]+/); push(m[0] === '0' ? 'ゼロ' : m[0]); i += m[0].length; }
    else if (ch === '=') { push('イコール'); i++; }
    else if (ch === '+') { push('プラス'); i++; }
    else if (ch === '-' || ch === '−') { push(out.trim() ? 'マイナス' : 'マイナス'); i++; }
    else if (ch === '<') { push('より小さい'); i++; }
    else if (ch === '>') { push('より大きい'); i++; }
    else if (ch === '/') { push('わる'); i++; }
    else if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '{' || ch === '}') { if (ch === '(' || ch === '[') out += '、'; i++; }
    else if (ch === '|') { i++; }
    else if (ch === '*') { push('スター'); i++; }
    else { if (ch.trim()) push(ch); i++; }
  }
  return out.replace(/\s+/g, ' ').trim();
}
// 画面の文（**太字**、==マーカー==、$数式$、英字）を読み方に
export function toSpeech(text) {
  let s = String(text || '');
  s = s.replace(/\$\$([\s\S]+?)\$\$|\$([^$]+)\$/g, (_, a, b) => ' ' + texToYomi(a || b) + ' ');
  s = s.replace(/\*\*|==/g, '').replace(/^\s*[-・]\s+/gm, '').replace(/[（(]/g, '、').replace(/[）)]/g, '、').replace(/→|⇒/g, '、すると、').replace(/[↑]/g, 'が上がる').replace(/[↓]/g, 'が下がる');
  for (const [w, y] of WORDS) s = s.split(w).join(y);
  s = s.replace(/\b[A-Za-z]{1,4}\b/g, (w) => spellLatin(w));
  return s.replace(/\n+/g, '。').replace(/、{2,}/g, '、').replace(/\s+/g, ' ').trim();
}

// ---- 声を出す ----
const CFG_KEY = 'ts_voice_v1';
export const cfg = (() => { try { return { rate: 1, auto: false, ...(JSON.parse(localStorage.getItem(CFG_KEY)) || {}) }; } catch (e) { return { rate: 1, auto: false }; } })();
export const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* */ } };
export const supported = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let voice = null;
function pickVoice() {
  const vs = (window.speechSynthesis?.getVoices() || []).filter((v) => /^ja/i.test(v.lang));
  const pref = ['Kyoko', 'O-Ren', 'Google 日本語', 'Otoya', 'Hattori', 'Nanami', 'Haruka'];
  voice = pref.map((n) => vs.find((v) => v.name.includes(n))).find(Boolean) || vs.find((v) => v.localService) || vs[0] || null;
}
if (supported()) { pickVoice(); window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

let token = 0;
export function stop() { token++; if (supported()) window.speechSynthesis.cancel(); }
export const speaking = () => supported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
// 長い文は「。」で区切って順に読む（途中で止まるのを防ぐ）。読み終わったら onend
export function speak(text, onend) {
  stop();
  if (!supported() || !text) { if (onend) setTimeout(onend, 0); return; }
  const my = token;
  const parts = String(text).split(/(?<=[。！？!?])/).map((x) => x.trim()).filter(Boolean);
  let k = 0;
  const next = () => {
    if (my !== token) return;
    if (k >= parts.length) { if (onend) onend(); return; }
    const u = new SpeechSynthesisUtterance(parts[k++]);
    u.lang = 'ja-JP'; if (voice) u.voice = voice; u.rate = cfg.rate;
    u.onend = next; u.onerror = () => { if (my === token) next(); };
    window.speechSynthesis.speak(u);
  };
  next();
}

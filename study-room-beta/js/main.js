// 画面の流れ：ログイン →（一括ダウンロード）→ 部屋（ホーム）
// 下のアイコン：部屋／模様がえ／解く／図鑑／メニュー（記録・フレンド・設定・管理者）
import { Room3D, moodNow, weatherToday } from './room3d.js';
import { ROOMS, roomDef, roomShape, STYLES, styleDef, homeOf, VILLA_MIN_ITEMS } from './rooms.js';
import { FIX_VARIANTS, FIX_NAMES } from './roomfix.js';
import { GENRES, ITEMS, itemById, itemsOf, SPECIAL_IDS, STARTER } from './items.js';
import { icon, GENRE_ICON, SUBJECT_ICON } from './icons.js';
import { ticketSVG, TICKET_NAME } from './tickets.js';
import * as G from './gacha.js';
import { thumbHTML, hydrateThumbs } from './thumbs.js';
import { loadModel, isLite } from './loaders.js';
import { validProblems, SYMBOLS } from './problems.js';
import { SUBJECT_PROBLEMS } from './subjects/index.js';
import { playPullFX } from './pullfx.js';
import { SKINS, skinById, skinItemId, skinThumbURL } from './skins.js';
import * as S from './store.js';
import * as Auth from './auth.js';
import * as DL from './download.js';
import * as Sync from './sync.js';
import * as R from './report.js';
import * as EV from './events.js';
import * as ERR from './errlog.js';
import { rpc } from './cloud.js';
import { PUZZLES, puzzleById, levelInfo, mountPuzzle, livesOf, slideRate } from './puzzles.js';
import { openPuzzleHelp } from './puzzlehelp.js';
import { ENDLESS, endlessById, mountEndless, MILESTONES, MILESTONE_GAUGE, milestonesPassed, nextMilestone, MERGE_ITEMS } from './endless.js';
import { runTour } from './tour.js';
import * as BGM from './bgm.js';
import { AVATARS, AVATAR_COLORS, GACHA_AVATARS, NIGHT_COLORS, avatarHTML, avatarItemId, pullRewards } from './avatars.js';
import { studyParams, puzzleParams, radarSVG, TITLES, titleById, earnedTitles } from './profile.js';
import * as Calc from './calc.js';

// bank：data/bank/<科目>.json の問題バンク（教科書に合わせた 教科 → ジャンル → 単元）。あとから読みこむ
const SUBJECTS = [
  { id: 'jp', name: '国語', bank: true },
  { id: 'math', name: '数学', bank: true },
  { id: 'english', name: '英語', bank: true },
  { id: 'physics', name: '物理（公式）', ready: true },
  { id: 'physics4', name: '物理（4択）', bank: true },
  { id: 'chem', name: '化学', bank: true },
  { id: 'bio', name: '生物', bank: true },
  { id: 'earth', name: '地学', bank: true },
  { id: 'social', name: '社会', bank: true },
];
Object.assign(SUBJECT_ICON, { physics4: 'magnet', bio: 'plant', earth: 'sun' });
// 前からある問題を、教科書の ジャンル・単元 に入れなおす（[ジャンル, 単元]。単元が null なら前の名前のまま）
const OLD_UNIT = {
  math: { '数と式': ['数学I', '数と式'], '二次関数': ['数学I', '二次関数'], '図形と計量': ['数学I', '図形と計量'], 'データの分析': ['数学I', 'データの分析'],
    '場合の数と確率': ['数学A', '場合の数と確率'], '整数の性質': ['数学A', '数学と人間の活動'], '図形の性質': ['数学A', '図形の性質'],
    '式と証明': ['数学II', '式と証明'], '複素数と方程式': ['数学II', '複素数と方程式'], '図形と方程式': ['数学II', '図形と方程式'], '三角関数': ['数学II', '三角関数'],
    '指数・対数': ['数学II', '指数関数と対数関数'], '微分・積分': ['数学II', '微分法と積分法'], '数列': ['数学B', '数列'], 'ベクトル': ['数学C', 'ベクトル'] },
  english: { '文法（時制）': ['文法', '時制'], '文法（助動詞）': ['文法', '助動詞'], '文法（受動態）': ['文法', '受動態'], '文法（不定詞・動名詞）': ['文法', '不定詞と動名詞'],
    '文法（分詞）': ['文法', '分詞'], '文法（比較）': ['文法', '比較'], '文法（関係詞）': ['文法', '関係詞'], '文法（仮定法）': ['文法', '仮定法'], '語順整序': ['文法', '語順整序'],
    '語彙': ['語彙・熟語', '重要単語'], 'イディオム・熟語': ['語彙・熟語', 'イディオム・熟語'], '会話表現': ['会話表現', '日常の会話'], '発音・アクセント': ['発音・アクセント', 'アクセント'] },
  chem: { '物質の構成': ['化学基礎', '物質の構成'], '原子の構造': ['化学基礎', '原子の構造と周期表'], '周期表': ['化学基礎', '原子の構造と周期表'], '化学結合': ['化学基礎', '化学結合'],
    '物質量': ['化学基礎', '物質量と化学反応式'], '化学反応式': ['化学基礎', '物質量と化学反応式'], '酸と塩基': ['化学基礎', '酸と塩基'], '中和・pH': ['化学基礎', '酸と塩基'],
    '酸化還元': ['化学基礎', '酸化還元反応'], '電池・電気分解': ['化学', '化学反応とエネルギー'], '熱化学': ['化学', '化学反応とエネルギー'], '反応速度と平衡': ['化学', '反応速度と化学平衡'],
    '気体の性質': ['化学', '物質の状態'], '無機物質': ['化学', '無機物質'], '有機化合物': ['化学', '有機化合物'] },
  jp: { '漢字の読み': ['言葉（漢字・語彙・文法・敬語）', '漢字の読み'], '漢字の書き（同音異義語）': ['言葉（漢字・語彙・文法・敬語）', '同音異義語'],
    '語彙・慣用句・ことわざ': ['言葉（漢字・語彙・文法・敬語）', '慣用句・ことわざ'], '四字熟語': ['言葉（漢字・語彙・文法・敬語）', '四字熟語'], '敬語': ['言葉（漢字・語彙・文法・敬語）', '敬語'],
    '文法（品詞・助詞・助動詞）': ['言葉（漢字・語彙・文法・敬語）', '文法（品詞・助詞・助動詞）'], '古文単語': ['古文', '古文単語'],
    '古典文法（助動詞の意味・活用・係り結び）': ['古文', '古典文法（助動詞）'], '漢文（返り点・句法・再読文字）': ['漢文', '漢文の句法'], '文学史': ['文学史', '文学史いろいろ'] },
};
// 社会は「ジャンル（中身）」の名前なので、かっこの前をジャンル、中をそろえる
const SOCIAL_UNIT = { '地図と地理情報': '地図と地理情報', '気候': '気候と生活', '地形': '地形と自然環境', '産業': '世界の産業と貿易', '人口': '地球的課題', '防災': '自然災害と防災',
  '近代化': '近代化と私たち', '大衆化': '国際秩序の変化や大衆化と私たち', 'グローバル化': 'グローバル化と私たち', '近世': '江戸時代' };
function regroup(sid, p) {
  if (sid === 'social') { const m = /^(.+?)（(.+)）$/.exec(p.unit || ''); if (m) return { ...p, genre: m[1], unit: SOCIAL_UNIT[m[2]] || m[2] }; return { ...p, genre: 'そのほか' }; }
  const g = OLD_UNIT[sid]?.[p.unit];
  return g ? { ...p, genre: g[0], unit: g[1] || p.unit } : p;
}
const PROBLEMS = validProblems();
const ALLP = { physics: PROBLEMS };
for (const [sid, list] of Object.entries(SUBJECT_PROBLEMS)) ALLP[sid] = list.map(p => regroup(sid, p));
const byId = Object.fromEntries(Object.values(ALLP).flat().map(p => [p.id, p]));
function probs(id = subjectId) { return ALLP[id] || []; }
// 問題バンクを読みこむ（1科目1回だけ。読めなくても前からある問題は使える）
const bankLoading = {}, bankDone = {};
function loadBank(sid) {
  if (!SUBJECTS.find(x => x.id === sid)?.bank) return Promise.resolve();
  return bankLoading[sid] ||= fetch(`data/bank/${sid}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(list => {
    const have = new Set((ALLP[sid] || []).map(p => p.id));
    const add = list.filter(p => !have.has(p.id) && Array.isArray(p.choices) && p.choices.length === 4 && p.answer >= 0 && p.answer < 4);
    ALLP[sid] = [...(ALLP[sid] || []), ...add];
    for (const p of add) byId[p.id] = p;
    bankDone[sid] = true;
  }).catch(e => { delete bankLoading[sid]; console.warn('bank', sid, e); });
}
const loadAllBanks = () => Promise.all(SUBJECTS.filter(x => x.bank).map(x => loadBank(x.id)));
// えらんだ範囲（ジャンル・単元）の問題だけ
function scoped(sid = subjectId) {
  const sc = S.subject(sid).scope, all = probs(sid);
  if (sc?.wrong) { const w = S.wrongList(S.subject(sid), all); return w.length ? w : all; }
  if (!sc || (!sc.genre && !sc.unit)) return all;
  const list = all.filter(p => (!sc.genre || p.genre === sc.genre) && (!sc.unit || p.unit === sc.unit));
  return list.length ? list : all;
}
const scopeLabel = (sc) => sc?.wrong ? 'まちがえた問題' : !sc || (!sc.genre && !sc.unit) ? 'すべて' : [sc.genre, sc.unit].filter(Boolean).join(' ・ ');

// ---- テスト勉強用の問題集（設定でコードを入れると、教科えらびに科目が増える） ----
// 中身は js/packs.js に暗号で入っていて、コードがないと開けない。入れたコードは記録（profile.codes）に残す
const packOf = {}; // 科目id → 問題集
const packCode = {}; // 科目id → 開いたコード（管理者がほかの人に渡す時に使う）
async function openCode(code) {
  const [{ PACKS }, { openPack }] = await Promise.all([import('./packs.js'), import('./packcrypt.js')]);
  const found = [];
  for (const sealed of PACKS) { const p = await openPack(code, sealed); if (p) found.push(p); }
  return found;
}
function addPack(p) {
  const sid = 'pack-' + p.id;
  const list = (p.problems || []).map(q => ({ ...q, id: sid + ':' + q.id, grade: q.grade || 'hs1', level: q.level || 1, unit: q.unit || p.name }))
    .filter(q => q.text && Array.isArray(q.choices) && q.choices.length === 4 && q.answer >= 0 && q.answer < 4);
  if (!list.length) return null;
  ALLP[sid] = list;
  for (const q of list) byId[q.id] = q;
  if (!SUBJECTS.some(x => x.id === sid)) SUBJECTS.push({ id: sid, name: p.name, pack: true });
  else SUBJECTS.find(x => x.id === sid).name = p.name;
  if (!SUBJECT_ICON[sid]) SUBJECT_ICON[sid] = p.icon || 'star';
  packOf[sid] = p;
  return sid;
}
// 管理者がサイドを変えた知らせ（MODE:side:時刻）を当てる。サイドは管理者だけが変えられる。
// 前は「勉強｜パズル」を押した時刻（modeAt）とくらべていたため、押したあとだと管理者の変更が無視された。
// いまは、サイドだけの時刻（sideAt）とくらべる（サーバーも記録に直接書く：sr_admin_set_side）
function applySide(modes) {
  const pr = S.profile(), last = modes[modes.length - 1];
  if (!last || last.t <= (pr.sideAt || 0)) return false;
  const changed = (pr.side || pr.mode) !== last.m;
  pr.side = last.m; pr.sideAt = last.t; pr.mode = last.m; pr.modeAt = Date.now(); S.save(); Sync.push?.();
  app.querySelector('.mode-sheet')?.remove();
  if (changed && app.querySelector('.home')) { showHome(); toast(`管理者が「${last.m === 'puzzle' ? 'パズルサイド' : 'スタディサイド'}」に変えました`, 3200); }
  return changed;
}
const modesOf = (codes) => codes.filter(c => /^MODE:/.test(c)).map(c => c.split(':')).map(([, m, t]) => ({ m, t: +t || 0 })).filter(x => x.m === 'study' || x.m === 'puzzle').sort((a, b) => a.t - b.t);
// 開いている間も、ときどき（3分ごと・画面にもどった時）管理者の変更を見る
let sideCheckedAt = 0;
async function checkSide() {
  const u = Auth.currentUser();
  if (!u || Date.now() - sideCheckedAt < 60e3 || !houseEntered) return;
  sideCheckedAt = Date.now();
  try { applySide(modesOf((await rpc('sr_my_codes', { p_token: u.token })) || [])); } catch (e) { /* オフライン */ }
}
setInterval(checkSide, 180e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkSide(); });
// ログインした時に、入れてあるコードの問題集を開く。管理者から渡された問題集も受け取る
async function loadSavedPacks() {
  const pr = S.profile();
  const { normCode } = await import('./packcrypt.js');
  const u = Auth.currentUser();
  let granted = [];
  if (u) { try { granted = (await rpc('sr_my_codes', { p_token: u?.token })) || []; } catch (e) { /* まだ準備できていない・オフライン */ } }
  // 「MODE:puzzle:時刻」は、管理者がモードを変えた知らせ（問題集ではない）。いちばん新しいものを使う
  const modes = modesOf(granted);
  granted = granted.filter(c => !/^MODE:/.test(c));
  applySide(modes);
  const fresh = granted.map(normCode).filter(c => !(pr.codes || []).includes(c));
  const got = [];
  for (const c of [...(pr.codes || []), ...fresh]) {
    try {
      const found = await openCode(c);
      for (const p of found) { const sid = addPack(p); if (sid) packCode[sid] = c; if (fresh.includes(c)) got.push(p.name); }
    } catch (e) { console.warn('pack', e); }
  }
  if (fresh.length) {
    pr.codes = [...new Set([...(pr.codes || []), ...fresh])];
    S.save(); Sync.push?.();
    if (got.length) toast(`管理者から「${got.join('」「')}」が届きました。教科えらびに増えています`, 3600);
  }
}
const UNITS = ['力学', '熱', '波動', '電磁気'];
const COLORS = ['#ff8a5b', '#4fc3f7', '#c792ea', '#9ccc65', '#ffd54f', '#f06292', '#4db6ac'];
const SURFACE_KINDS = [['wall', '壁'], ['floor', '床'], ['door', 'ドア'], ['window', '窓'], ['curtain', 'カーテン']];

const app = document.getElementById('app');
const canvas = document.getElementById('room');
let room3d = null;
let user = null;
let subjectId = 'physics';
let visiting = null; // フレンドの部屋を見ているとき { username, house, current }

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 新しいデザイン：お知らせは上の細い帯に、1つずつ順番に。押すとその場所へ（称号 → プロフィール など）（1.12.0）
const toastQ = [];
let toastBusy = false;
function toastNext() {
  const t = document.getElementById('toast');
  const item = toastQ.shift();
  if (!item) { toastBusy = false; t.classList.remove('show'); return; }
  toastBusy = true;
  const go = /称号/.test(item.msg) ? () => showProfile() : /プレゼントBOX/.test(item.msg) ? () => showGiftBox() : null;
  t.innerHTML = `<span class="nx-tm">${esc(item.msg)}</span>${go ? '<u>見る</u>' : ''}${toastQ.length ? `<i class="nx-tq">あと${toastQ.length}件</i>` : ''}`;
  t.classList.add('show', 'nx-toast'); t.classList.toggle('tap', !!go);
  t.onclick = () => { clearTimeout(t._h); if (go) { toastQ.length = 0; t.classList.remove('show'); toastBusy = false; go(); } else toastNext(); };
  clearTimeout(t._h); t._h = setTimeout(() => { t.classList.remove('show'); setTimeout(toastNext, 260); }, Math.min(Math.max(item.ms, 1800), 3400));
}
function toast(msg, ms = 2200) {
  if (UINEXT) {
    if (toastQ.some(x => x.msg === msg) || document.getElementById('toast')?.querySelector('.nx-tm')?.textContent === msg && toastBusy) return;
    toastQ.push({ msg, ms });
    if (!toastBusy) toastNext(); else { const q = document.querySelector('#toast .nx-tq'); if (q) q.textContent = `あと${toastQ.length}件`; else document.getElementById('toast')?.insertAdjacentHTML('beforeend', `<i class="nx-tq">あと${toastQ.length}件</i>`); }
    return;
  }
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* なし */ } }
function sub() { return S.subject(subjectId); }
const HS = () => S.house();
const isAdmin = () => Auth.isAdmin();
// テスト版（study-room-beta/ に置いた物）。管理者だけが入れる。ためして許可が出たら study-room/ に写して本番にする
const BETA = /-beta\//.test(location.pathname);
// 新しいデザイン（1.12.0 から標準）。UI改善案（docs/roomin-ui-review.html）。
// 管理者は設定で前のデザインにもどして見くらべられる（studyroom.uinext = '0'）。自動の確かめ（テスト）も '0' で前のデザインを確かめる
const UINEXT = (() => { try { return localStorage.getItem('studyroom.uinext') !== '0'; } catch (e) { return true; } })();
if (UINEXT) document.body.classList.add('uinext');
if (BETA) document.documentElement.classList.add('is-beta');
function showBetaOnly() {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`<div class="screen center"><div class="card login">
    <h1 class="brand">ROOMIN</h1>
    <p class="sub">ここは管理者だけが使える「テスト版」です</p>
    <a class="btn primary big" href="../study-room/">いつものアプリを開く</a>
    <button class="link logout">ほかのアカウントでログイン</button></div></div>`);
  app.append(el);
  el.querySelector('.logout').onclick = () => { Auth.logOut(); showLogin('login'); };
}
const isPuzzle = () => S.profile().mode === 'puzzle';
const freePuzzle = () => isAdmin() || S.sideOf() === 'puzzle'; // スタディサイドの人は、勉強した回数ぶんだけパズル
// 家具が買えるまで、あと何回（勉強なら問題の数、パズルならクリアの数）
const needText = (gap) => isPuzzle() ? `あと${Math.max(1, Math.ceil(gap / 36))}回` : `あと${Math.max(1, Math.ceil(gap / 24))}問`;
const rankNow = () => S.rankInfo();
function closeSheets() { app.querySelectorAll('.sheet, .float-bar').forEach(e => e.remove()); }
function sheet(html, cls = '') {
  closeSheets();
  const el = h(`<div class="sheet ${cls}"><div class="grab"></div>${html}</div>`);
  app.append(el);
  hydrateThumbs(el);
  if (UINEXT) setTimeout(() => nxCloseRule(el), 0);
  return el;
}
// 新しいデザイン：下から出る画面の閉じ方を「右上の × ・下になぞる」にそろえる（1.12.0）。
// 画面ごとの「やめる」「とじる」の文字ボタンは、右上の × と同じ働きにして、下の文字ボタンはかくす
function nxCloseRule(el) {
  if (!el.isConnected) return;
  const head = el.querySelector('.sh-head, .hs-top');
  let x = el.querySelector('.sh-x, .hs-close');
  const closer = el.querySelector('.link.close, button.close:not(.sh-x), .back2.link');
  if (!x && head && closer) {
    x = h(`<button class="sh-x nx-x" aria-label="とじる">${icon('x')}</button>`);
    x.onclick = () => closer.click();
    head.append(x);
  }
  if (x && closer && closer !== x && closer.classList.contains('link')) el.classList.add('nx-hasx');
  const grab = el.querySelector('.grab');
  if (!grab || (!x && !closer)) return;
  let y0 = null;
  const start = (e) => { y0 = e.clientY; el.style.transition = 'none'; };
  const move = (e) => { if (y0 == null) return; const d = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${d}px)`; };
  const end = (e) => { if (y0 == null) return; const d = e.clientY - y0; y0 = null; el.style.transition = ''; el.style.transform = ''; if (d > 80) (x || closer).click(); };
  for (const t of [grab, head].filter(Boolean)) { t.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; t.setPointerCapture(e.pointerId); start(e); }); t.addEventListener('pointermove', move); t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); }
}

// =========================== ログイン ===========================
// この端末で一度でも使ったことがあれば「ログイン」、初めてなら「登録」から見せる
function usedHereBefore() {
  try { for (let i = 0; i < localStorage.length; i++) if (/^studyroom\.(v1\.user\.|users$)/.test(localStorage.key(i))) return true; } catch (e) { /* なし */ }
  return false;
}
function showLogin(mode = usedHereBefore() ? 'login' : 'signup') {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card login">
        <h1 class="brand">ROOMIN</h1>
        <p class="sub">問題を解くと、部屋ができていく</p>
        <form>
          <label>ユーザー名<input name="name" autocomplete="username" required maxlength="16"></label>
          <label>パスワード<input name="pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></label>
          <p class="err"></p>
          <button class="btn primary big" type="submit">${mode === 'login' ? 'ログイン' : '登録してはじめる'}</button>
        </form>
        <button class="link swap">${mode === 'login' ? 'はじめての人は、こちらで登録' : 'もう登録している人は、ログイン'}</button>
        ${mode === 'login' ? '<button class="link forgot">パスワードを忘れた</button>' : `<p class="note agree">登録すると、<a href="legal/terms.html" target="_blank" rel="noopener">利用規約</a>と<a href="legal/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>に同意したことになります。</p>`}
        <p class="note">記録はネット上に保存されます。どのスマホ・パソコンからでも、同じユーザー名とパスワードで続きから遊べます。</p>
      </div>
    </div>`);
  app.append(el);
  el.querySelector('.swap').onclick = () => showLogin(mode === 'login' ? 'signup' : 'login');
  el.querySelector('.forgot')?.addEventListener('click', showPasswordReset);
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = el.querySelector('.err');
    err.textContent = '';
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = mode === 'login' ? await Auth.logIn(f.name.value, f.pw.value) : await Auth.signUp(f.name.value, f.pw.value);
      S.useUser(r.id);
      Sync.reset();
      await Sync.adopt(r.data);
      if (r.moved) toast('この端末の記録を、ネットに引っ越しました', 3000);
      // 新しく始めた人へ：新規登録記念のレアチケット10枚をプレゼントBOXに
      const welcome = mode === 'signup' && !r.moved;
      if (welcome) { try { S.addGift({ id: 'welcome', kind: 'ticket', amount: 10, title: '新規登録記念', from: 'operator' }); S.save(); } catch (e) { console.warn('welcome', e); } }
      startAs(Auth.currentUser());
      if (welcome) setTimeout(() => toast('新規登録記念のプレゼントが、プレゼントBOXに届いています', 3600), 1500);
    } catch (ex) { err.textContent = ex.message; vibrate(80); btn.disabled = false; }
  };
}

// パスワードを忘れた：ユーザー名＋復元コードで新しいパスワードにする（1.12.0）
function showPasswordReset() {
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('lock')}</span><div><h3>パスワードを忘れた</h3><p>設定で作った「復元コード」で、新しいパスワードにできます</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <form class="pr-form">
      <label>ユーザー名<input name="u" autocomplete="username" required maxlength="16"></label>
      <label>復元コード<input name="c" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>
      <label>新しいパスワード<input name="p" type="password" autocomplete="new-password" required minlength="4"></label>
      <p class="err"></p>
      <button class="btn primary big" type="submit">新しいパスワードにする</button>
    </form>
    <p class="note">復元コードを作っていない時は、新しく登録したアカウントの「要望・バグ報告」から、管理者に知らせてください。</p>`, 'news-sheet pr-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err'), btn = f.querySelector('button'); btn.disabled = true; err.textContent = '';
    try {
      const r = await rpc('sr_password_reset', { p_username: f.u.value.trim(), p_code: f.c.value, p_new: f.p.value });
      el.remove(); toast(`「${r.username}」のパスワードを変えました。新しいパスワードでログインしてください（復元コードは使ったので、ログインしたら作りなおしてください）`, 5200);
    } catch (ex) { err.textContent = ex.code === 'bad_code' ? 'ユーザー名か復元コードがちがいます' : ex.code === 'too_many' ? '何度もまちがえたので、1時間ほど待ってからためしてください' : ex.message; btn.disabled = false; vibrate(60); }
  };
}

function startAs(u) {
  // 前の人が開いた問題集は外す
  for (const sid of Object.keys(packOf)) { delete ALLP[sid]; delete packOf[sid]; const i = SUBJECTS.findIndex(x => x.id === sid); if (i >= 0) SUBJECTS.splice(i, 1); }
  user = u;
  S.useUser(u.id);
  visiting = null;
  if (room3d) room3d.roomDef = null; // 別の人の家を出しっぱなしにしない
  if (DL.canDownload() && !DL.downloadState()) showDownload(); else enterHouse();
}

// =========================== 下のスロット（ゲーム風HUD） ===========================
// 左下に四角いスロットを6つ、右下に大きな「解く」（まわりの輪がゲージ）。
// 部屋の画面ではいちばん左が「買う」、ほかの画面では「部屋」（部屋にもどる）。
// 「家具」「みんな」は、下から半分だけの画面で中身を出す。
function tabbar(active) {
  const st = sub();
  const resume = st.session && st.session.idx < st.session.set.length;
  const due = S.stats(st, probs()).due;
  const hs = HS(), max = S.gaugeMax(hs);
  const pct = Math.min(100, Math.round(hs.gauge / max * 100));
  const need = Math.max(1, Math.ceil((max - hs.gauge) / 24));
  const buy = canBuyNow();
  const first = active === 'room' ? ['buy', 'gift', '買う'] : ['room', 'home', '部屋'];
  const slots = [first, ['furn', 'sofa', '家具'], ['gacha', 'star', 'ガチャ'], ['zukan', 'book', '図鑑'], ['social', 'users', 'みんな'], ['menu', 'menu', 'メニュー']];
  if (UINEXT) return tabbarNext(active, { resume, due, pct, buy });
  const dot = (k) => (k === 'menu' && newsBadge) || (k === 'social' && friendBadge) || (k === 'gacha' && ticketCount()) || (k === 'room' && buy);
  const el = h(`<nav class="tabbar hotbar ${active === 'room' ? 'on-room' : ''}">
    <div class="slots">${slots.map(([k, ic, n]) => `
      <button data-t="${k}" class="sl ${k === active ? 'on' : ''} ${k === 'buy' && buy ? 'hot' : ''}" aria-label="${n}">${icon(ic)}<span class="sl-t">${n}</span>${dot(k) ? '<i class="dot"></i>' : ''}${k === 'buy' && buy ? `<span class="buy-tip">${buyCount() > 1 ? `${buyCount()}つ買える！` : '買える！'}</span>` : ''}</button>`).join('')}</div>
    <div class="solve-wrap">
      ${active === 'room' ? `<div class="mode-toggle" role="group" aria-label="勉強とパズルの切りかえ"><button data-mode="study" class="${isPuzzle() ? '' : 'on'}">${icon('pencil')}勉強</button><button data-mode="puzzle" class="${isPuzzle() ? 'on' : ''}">${icon('grid')}パズル${!freePuzzle() ? `<i class="mt-n">${S.puzzleTickets()}</i>` : ''}</button></div>` : ''}
      ${!buy && active === 'room' ? `<span class="solve-need">${needText(max - hs.gauge)}</span>` : ''}
      ${buy && active === 'room' ? `<span class="solve-need full">${icon('sparkle')}満タン${buyCount() > 1 ? ` ×${buyCount()}` : ''}</span>` : ''}
      ${isPuzzle() ? `<button data-t="play" class="solve-ring ${buy ? 'full' : ''}" style="--p:${pct}" aria-label="パズル">
        <span class="sr-in">${icon('grid')}<b>パズル</b></span>${!S.playedToday() ? '<i class="dot"></i>' : ''}` : `<button data-t="play" class="solve-ring ${buy ? 'full' : ''}" style="--p:${pct}" aria-label="解く">
        <span class="sr-in">${icon(resume ? 'refresh' : 'pencil')}<b>${resume ? '続きから' : '解く'}</b></span>${resume || due || !S.playedToday() ? '<i class="dot"></i>' : ''}`}
      </button>
    </div>
  </nav>`);
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => goTab(b.dataset.t));
  el.querySelectorAll('.mode-toggle [data-mode]').forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; setMode(b.dataset.mode); vibrate(12); });
  // ゲージが満タンになった時に1回だけ知らせる
  if (active === 'room') {
    if (buy && !hs.fullNotified) {
      hs.fullNotified = true; S.save();
      setTimeout(() => { toast('ゲージ満タン！「買う」で家具を1つ買えます', 3200); vibrate([30, 40, 60]); }, 700);
    } else if (!buy && hs.fullNotified) { hs.fullNotified = false; S.save(); }
  }
  return el;
}
// 新しいデザインの下のメニュー：いつも同じ5つ（部屋・家具・解く・ガチャ・みんな）。メニューは右上の自分のアイコンから
function tabbarNext(active, { resume, due, pct, buy }) {
  const dot = (k) => (k === 'menu' && newsBadge) || (k === 'social' && friendBadge) || (k === 'gacha' && ticketCount());
  const slot = ([k, ic, n]) => `<button data-t="${k}" class="sl ${k === active ? 'on' : ''}" aria-label="${n}">${icon(ic)}<span class="sl-t">${n}</span>${dot(k) ? '<i class="dot"></i>' : ''}</button>`;
  const ring = isPuzzle()
    ? `<button data-t="play" class="solve-ring ${buy ? 'full' : ''}" style="--p:${pct}" aria-label="パズル"><span class="sr-in">${icon('grid')}<b>パズル</b></span>${!S.playedToday() ? '<i class="dot"></i>' : ''}</button>`
    : `<button data-t="play" class="solve-ring ${buy ? 'full' : ''}" style="--p:${pct}" aria-label="解く"><span class="sr-in">${icon(resume ? 'refresh' : 'pencil')}<b>${resume ? '続きから' : '解く'}</b></span>${resume || due || !S.playedToday() ? '<i class="dot"></i>' : ''}</button>`;
  // 「解く」は右下の端（スマホを片手で持った時に、親指がいちばん届く場所）。「勉強｜パズル」の切りかえはその上に見える形で
  const el = h(`<nav class="tabbar hotbar nx-bar ${active === 'room' ? 'on-room' : ''}">
    <div class="slots">${[['room', 'home', '部屋'], ['furn', 'sofa', '家具'], ['gacha', 'star', 'ガチャ'], ['social', 'users', 'みんな']].map(slot).join('')}</div>
    <div class="solve-wrap">
      ${active === 'room' ? `<div class="mode-toggle" role="group" aria-label="勉強とパズルの切りかえ"><button data-mode="study" class="${isPuzzle() ? '' : 'on'}">${icon('pencil')}勉強</button><button data-mode="puzzle" class="${isPuzzle() ? 'on' : ''}">${icon('grid')}パズル${!freePuzzle() ? `<i class="mt-n">${S.puzzleTickets()}</i>` : ''}</button></div>` : ''}
      ${ring}
    </div>
  </nav>`);
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => goTab(b.dataset.t));
  el.querySelectorAll('.mode-toggle [data-mode]').forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; setMode(b.dataset.mode); vibrate(12); });
  return el;
}
function goTab(t) {
  if (visiting) leaveVisit(false);
  if (t === 'room') return showHome();
  if (t === 'buy') {
    if (canBuyNow()) return buyFlow();
    const hs = HS(), gap = S.gaugeMax(hs) - hs.gauge;
    return toast(isPuzzle() ? `${needText(gap)} パズルをクリアすると、家具が買えます` : `${needText(gap)} 解くと、家具が買えます`, 2200);
  }
  if (t === 'edit') return showEdit();
  if (t === 'furn') return halfFurniture();
  if (t === 'gacha') return showGacha();
  if (t === 'play') return isPuzzle() ? showPuzzleHub() : chooseSubject();
  if (t === 'zukan') return showZukan();
  if (t === 'social') return halfSocial();
  if (t === 'menu') return showMenu();
}
// =========================== プレゼントBOX ===========================
const GIFT_LABEL = { ticket: 'レアチケット', ticket4: '★4以上確定チケット', ticket5: '★5限定チケット', exchange: '家具の引きかえ券', shards4: '★4のかけら', shards5: '★5のかけら', gauge: 'ゲージ', item: '家具' };
const lvGift = (g) => g.kind === 'item' && /^lv:\d+$/.test(g.itemId || '') ? +g.itemId.slice(3) : 0;
function giftArt(g) {
  if (lvGift(g)) return `<span class="gb-ic gb-lv"><small>Lv</small>${lvGift(g)}</span>`;
  if (g.kind === 'ticket' || g.kind === 'ticket4' || g.kind === 'ticket5') return ticketSVG(g.kind, 'mini');
  if (g.kind === 'item') { const it = itemById(g.itemId); return it ? `<span class="thumb">${thumbHTML(it)}</span>` : icon('gift'); }
  return `<span class="gb-ic">${icon(g.kind === 'gauge' ? 'level' : g.kind.startsWith('shards') ? 'sparkle' : 'gift')}</span>`;
}
function giftName(g) { if (lvGift(g)) return `Lv${lvGift(g)} まで上がる`; return g.kind === 'item' ? (itemById(g.itemId)?.name || '家具') : GIFT_LABEL[g.kind] || 'プレゼント'; }
// 運営からのプレゼントを取りに行って、まだならBOXに入れる（1分に1回まで）
let giftsCheckedAt = 0;
async function refreshGifts(force = false) {
  const u = Auth.currentUser();
  if (!u || (!force && Date.now() - giftsCheckedAt < 60000)) return;
  giftsCheckedAt = Date.now();
  let list;
  try { list = await rpc('sr_gift_list', { p_token: u?.token }); } catch (e) { return; }
  let added = 0;
  for (const g of list || []) {
    const id = 'op' + g.id;
    if (S.giftSeen(id)) continue;
    S.addGift({ id, kind: g.kind, amount: g.amount, itemId: g.item_id, title: g.title, from: 'operator', at: Date.parse(g.created_at) || Date.now() });
    S.markGiftSeen(id);
    added++;
  }
  if (added) {
    S.save();
    updateGiftBadge();
    toast(`プレゼントが ${added}件 届きました`, 2400);
  }
}
function updateGiftBadge() {
  const b = app.querySelector('.home .giftbox'), n = S.gifts().length;
  if (!b) return;
  b.querySelector('.gb-n')?.remove();
  if (n) b.insertAdjacentHTML('beforeend', `<i class="gb-n">${n > 99 ? '99+' : n}</i>`);
}
function showGiftBox() {
  const list = [...S.gifts()].sort((a, b) => (b.at || 0) - (a.at || 0));
  const from = { rank: 'Lvアップ', play: 'がんばったごほうび', master: '克服', operator: '運営から', gacha: 'ガチャのごほうび' };
  const day = (t) => t ? new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '';
  const el = screenWithTabs('gifts', `<button class="icon back">${icon('back')}</button><h2>プレゼントBOX</h2><span class="gb-count"><b>${list.length}</b> 件</span>`, 'room', `
    ${list.length ? `<button class="btn primary big gb-all">${icon('gift')}まとめて受け取る</button>
    <div class="gb-list">${list.map(g => `
      <div class="gb-row" data-id="${esc(g.id)}">
        <span class="gb-art">${giftArt(g)}</span>
        <span class="gb-t"><b>${esc(giftName(g))}${(g.amount > 1 || g.kind !== 'item') && !lvGift(g) ? ` ×${g.amount || 1}` : ''}</b><small>${esc(g.title || from[g.from] || '')}${g.at ? '・' + day(g.at) : ''}</small></span>
        <button class="btn ghost sm gb-get">受け取る</button>
      </div>`).join('')}</div>`
      : `<div class="gb-empty">${icon('gift')}<p>いまは何も届いていません。<br>Lvが上がったときや、運営からのプレゼントがここに届きます。</p></div>`}`);
  el.querySelector('.back').onclick = () => showHome();
  const take = (ids) => {
    const got = ids.map(id => S.claimGift(id)).filter(Boolean);
    if (!got.length) return;
    if (got.some(lvGift)) ensureRooms(); // レベルが上がったら、新しい部屋や置ける数も
    S.save(); vibrate([20, 40, 20]);
    toast(got.length === 1 ? `${giftName(got[0])}${got[0].kind !== 'item' ? ' ×' + (got[0].amount || 1) : ''}を受け取りました` : `${got.length}件 受け取りました`, 2200);
    showGiftBox();
  };
  el.querySelectorAll('.gb-get').forEach(b => b.onclick = () => take([b.closest('.gb-row').dataset.id]));
  el.querySelector('.gb-all')?.addEventListener('click', () => take(list.map(g => g.id)));
  hydrateThumbs(el);
}

// =========================== 着せ替え ===========================
function ownsSkin(id) { return id === 'a' || S.owned(skinItemId(id)) > 0; }
function applySkin() {
  const want = S.profile().skin || 'a';
  const id = ownsSkin(want) ? want : 'a';
  if (id === 'a') delete document.documentElement.dataset.skin; else document.documentElement.dataset.skin = id;
}
function showSkins() {
  const cur = S.profile().skin && ownsSkin(S.profile().skin) ? S.profile().skin : 'a';
  const have = SKINS.filter(x => ownsSkin(x.id)).length;
  const el = screenWithTabs('skins', `<button class="icon back">${icon('back')}</button><h2>着せ替え</h2><span class="sk-count"><b>${have}</b> / ${SKINS.length}</span>`, 'menu', `
    <p class="note">画面の見た目を変えられます。★4・★5の着せ替えは、レアガチャで手に入ります（バンドの5つはバンドシリーズ限定）。</p>
    <div class="skin-grid">${SKINS.map(x => {
      const own = ownsSkin(x.id);
      return `<button class="skin-card ${x.id === cur ? 'on' : ''} ${own ? '' : 'locked'}" data-s="${x.id}">
        <img src="${skinThumbURL(x.id)}" alt="">
        <span class="sk-t"><b>${esc(x.name)}</b><i>${x.rarity ? '★'.repeat(x.rarity) + (x.series ? '・バンド限定' : '') : '基本'}</i><small>${esc(x.desc)}</small></span>
        <em>${x.id === cur ? '使っている' : own ? '使う' : '未入手'}</em></button>`;
    }).join('')}</div>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelectorAll('.skin-card').forEach(b => b.onclick = () => {
    const id = b.dataset.s;
    if (!ownsSkin(id)) return toast('レアガチャで手に入ります', 2000);
    S.profile().skin = id; S.save(); applySkin(); vibrate(15);
    toast(`「${skinById(id).name}」にしました`, 1600);
    showSkins();
  });
}

// 下から半分だけの画面（大きなボタンが並ぶ）
function halfSheet(title, items) {
  if (!app.querySelector('.home')) showHome();
  closeSheets();
  const el = sheet(`
    <div class="hs-top"><h3 class="hs-title">${title}</h3><button class="hs-close" aria-label="部屋にもどる">${icon('x')}</button></div>
    <div class="hgrid">${items.map((x, i) => `<button class="hc ${x.hot ? 'hot' : ''}" data-i="${i}">${icon(x.ic)}<b>${x.name}</b>${x.sub ? `<small>${x.sub}</small>` : ''}${x.dot ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>`, 'half-sheet');
  el.querySelectorAll('.hc').forEach(b => b.onclick = () => { el.remove(); items[+b.dataset.i].go(); });
  el.querySelector('.hs-close').onclick = () => el.remove();
  // 上の部屋のところをタップしても、とじて部屋にもどる
  setTimeout(() => {
    const away = (e) => { if (!el.isConnected) return document.removeEventListener('pointerdown', away, true); if (!el.contains(e.target) && !e.target.closest('.hotbar')) { el.remove(); document.removeEventListener('pointerdown', away, true); } };
    document.addEventListener('pointerdown', away, true);
  });
  return el;
}
function halfFurniture() {
  const hs = HS(), max = S.gaugeMax(hs);
  const r = curRoom();
  const items = [
    { ic: 'gift', name: '買う', sub: canBuyNow() ? `今すぐ${buyCount()}つ買える` : `ゲージ ${Math.min(100, Math.round(hs.gauge / max * 100))}%`, hot: canBuyNow(), go: () => goTab('buy') },
    { ic: 'move', name: '模様がえ', sub: `置いている ${r.placed.length}`, go: showEdit },
    { ic: 'star', name: 'レアガチャ', sub: `チケット ${hs.rareTickets || 0}`, dot: ticketCount() > 0, go: () => showGacha() },
    { ic: 'book', name: '図鑑', go: showZukan },
    { ic: 'box', name: '持ち物', go: () => showBag() },
    { ic: 'door', name: '部屋えらび', go: () => app.querySelector('.room-name')?.click() },
    { ic: 'grid', name: '自動で並べる', sub: '家具を選んで、いい感じに', go: () => showArrange() },
  ];
  if (isAdmin() && hs.gauge < max) items.push({ ic: 'sparkle', name: '管理者', sub: 'ゲージを満タン', go: () => { hs.gauge = max; S.save(); showHome(); } });
  halfSheet('家具', items);
}
function halfSocial() {
  halfSheet('みんな', [
    { ic: 'trophy', name: 'ランキング', sub: '今週かせいだポイント', go: showRanking },
    { ic: 'users', name: 'フレンド', sub: friendBadge ? `申請 ${friendBadge}件` : '部屋を見に行く', dot: friendBadge > 0, go: showFriends },
    { ic: 'camera', name: '写真', sub: '部屋をとる', go: () => { showHome(); photoMode(); } },
  ]);
}
// 管理者：チケット・かけら・引きかえ券も、使ってもなくならないよう いつも 99 にしておく
function adminTopUp() {
  const hs = HS();
  for (const k of ['rareTickets', 'rareTickets4', 'rareTickets5', 'shards4', 'shards5', 'tickets']) if ((hs[k] || 0) < 99) hs[k] = 99;
}
function canBuyNow() { const hs = HS(); return hs.gauge >= S.gaugeMax(hs) || hs.tickets > 0; }
// いま何個買えるか（ゲージは満タンをこえてもためておける。1つ買うごとに満タンの分だけ減る）
function buyCount() {
  const hs = HS(); let g = hs.gauge, u = hs.unlocks, n = 0;
  while (n < 99) { const m = S.gaugeMax({ unlocks: u }); if (g < m) break; g -= m; u++; n++; }
  return n + (isAdmin() ? 0 : hs.tickets || 0);
}
function ticketCount() { const hs = HS(); return (hs.rareTickets || 0) + (hs.rareTickets4 || 0) + (hs.rareTickets5 || 0); }

// =========================== 家具（買う・ガチャ・模様がえ・図鑑・持ち物） ===========================
function showFurnitureHub() {
  const hs = HS(), max = S.gaugeMax(hs);
  const pct = Math.min(100, Math.round(hs.gauge / max * 100));
  const el = screenWithTabs('furn', `<h2>家具</h2><span></span>`, 'furn', `
    <div class="hub">
      <button class="hub-card buy ${canBuyNow() ? 'ready' : ''}" data-h="buy">
        ${canBuyNow() ? '<i class="dot"></i>' : ''}<span class="hub-ic">${icon('gift')}</span><b>家具を買う</b>
        <small>${canBuyNow() ? '今すぐ1つ買えます' : `ゲージ ${pct}%`}</small>
        <span class="hub-bar"><i style="width:${pct}%"></i></span>
      </button>
      <button class="hub-card gacha" data-h="gacha">
        ${ticketCount() ? '<i class="dot"></i>' : ''}<span class="hub-art">${ticketSVG('ticket', 'mini')}</span><b>レアガチャ</b>
        <small>チケット ${hs.rareTickets || 0}枚${hs.rareTickets4 ? `・★4確定 ${hs.rareTickets4}` : ''}${hs.rareTickets5 ? `・★5限定 ${hs.rareTickets5}` : ''}</small>
      </button>
      <button class="hub-card" data-h="edit"><span class="hub-ic">${icon('move')}</span><b>模様がえ</b><small>持っている家具を動かす</small></button>
      <button class="hub-card" data-h="zukan"><span class="hub-ic">${icon('book')}</span><b>図鑑</b><small>${ITEMS.filter(i => S.collected(i.id)).length + G.GACHA_ITEMS.filter(i => !ITEMS.includes(i) && S.collected(i.id)).length} 種類 集めた</small></button>
      <button class="hub-card" data-h="bag"><span class="hub-ic">${icon('box')}</span><b>持ち物</b><small>家具・チケット・かけら</small></button>
    </div>`);
  el.querySelectorAll('.hub-card').forEach(b => b.onclick = () => {
    const k = b.dataset.h;
    if (k === 'buy') { if (!canBuyNow()) return toast('問題を解いてゲージをためると買えます'); showHome(); return buyFlow(); }
    if (k === 'gacha') return showGacha();
    if (k === 'edit') return showEdit();
    if (k === 'zukan') return showZukan();
    if (k === 'bag') return showBag();
  });
}

// =========================== みんな（ランキング・フレンド） ===========================
function showSocial() { return showRanking(); }
function bindSocialTabs(el) {
  el.querySelectorAll('.soc button').forEach(b => b.onclick = () => (b.dataset.s === 'friends' ? showFriends() : showRanking()));
}

// =========================== レアガチャ ===========================
function gachaOwned(id) { return S.realOwned(id); }
function showGacha(banner = null) {
  if (isAdmin()) adminTopUp();
  const hs = HS();
  const act = G.activeSeries();
  // 限定が左、恒常（スタンダード）が右。1つのガチャが1枚のカード。横にめくって選ぶ
  const heroOf = (sid) => G.bySeries(sid).find(i => i.rarity === 5) || G.bySeries(sid)[0];
  const banners = [...act.map(s => ({ id: s.id, name: s.name, title: s.title, desc: s.desc, limited: true, hero: heroOf(s.id), end: s.end })),
    { id: 'standard', name: 'スタンダード', title: 'STANDARD', desc: '★5は上質な定番（いつでも）から出ます', hero: G.gachaById('g5-grand-piano') || G.byRarity(5).find(i => !i.limited) }];
  let idx = Math.max(0, banners.findIndex(x => x.id === banner));
  const t1 = hs.rareTickets || 0, t4 = hs.rareTickets4 || 0, t5 = hs.rareTickets5 || 0;
  const s4 = hs.shards4 || 0, s5 = hs.shards5 || 0;
  // 出る家具：★5 → ★4 の順に5つ
  const lineup = (b) => {
    const pool = b.limited ? G.bySeries(b.id) : [...G.byRarity(5), ...G.byRarity(4)].filter(i => !i.limited && i.place !== 'skin' && i.place !== 'avatar');
    // 全部（★5 → ★4 → ★3 の順）。横にスライドして見る
    return [...pool].sort((x, y) => (y.rarity || 0) - (x.rarity || 0));
  };
  const daysLeft = (b) => b.end ? Math.max(0, Math.ceil((Date.parse(b.end) - Date.now()) / 864e5)) : null;
  const el = screenWithTabs('gacha', `<button class="icon back">${icon('back')}</button><h2>レアガチャ</h2><span class="gc-have">${ticketSVG('ticket', 'mini')}<b>${t1}</b></span>`, 'gacha', `
    <div class="gc-car">${banners.map((x, k) => `
      <button class="gc-card banner ${x.limited ? 'b-' + x.id : 'b-standard'}" data-k="${k}">
        <div class="bn-glow"></div>
        <span class="gc-txt">
          ${x.limited ? `<i class="bn-tag">期間限定</i>` : '<i class="bn-tag std">いつでも</i>'}
          <span class="bn-kicker">${esc(x.limited ? x.name : 'スタンダード')}</span>
          <span class="bn-title">${esc(x.title || x.name)}</span>
          <small>${esc(x.desc || '')}</small>
          ${x.limited && daysLeft(x) != null && daysLeft(x) < 400 ? `<small class="gc-days">あと${daysLeft(x)}日</small>` : ''}
          ${x.limited && SAMPLE_ROOMS[x.id] ? `<span class="bn-sample">${icon('home')}モデルハウスを見る</span>` : ''}
        </span>
        ${x.hero ? `<span class="gc-hero thumb">${thumbHTML(x.hero)}</span>` : ''}
      </button>`).join('')}</div>
    ${banners.length > 1 ? `<div class="gc-dots">${banners.map((x, k) => `<i data-k="${k}"></i>`).join('')}</div>` : ''}
    <div class="gc-reward"></div>
    <div class="gc-line"><p class="gc-h">出る家具<span class="gc-n"></span><small>横にスライド・押すと3Dで見られる</small></p><div class="gc-row"></div></div>
    <div class="gc-chips">
      <button class="chip shard-btn" data-r="4"><span class="shard s4">${icon('sparkle')}</span>★4かけら <b>${s4}/${G.SHARD_COST}</b></button>
      <button class="chip shard-btn" data-r="5"><span class="shard s5">${icon('sparkle')}</span>★5かけら <b>${s5}/${G.SHARD_COST}</b></button>
      <button class="chip rates-btn">割合</button>
    </div>
    ${UINEXT && t1 < 1 && !t4 && !(t5 && act.length) ? ticketHowTo() : ''}
    <div class="pull-btns gc-pulls ${UINEXT && t1 < 1 && !t4 && !(t5 && act.length) ? 'nx-hide' : ''}">
      <button class="btn ghost pull1" ${t1 < 1 ? 'disabled' : ''}><span>1回引く<small>レアチケット 1枚</small></span></button>
      <button class="btn gold pull10" ${t1 < 10 ? 'disabled' : ''}><span>10回引く<small>10枚・★4以上1つ確定</small></span></button>
      ${t4 ? `<button class="btn special pull4 wide">${ticketSVG('ticket4', 'mini')}<span>★4以上確定で引く<small>のこり ${t4}枚</small></span></button>` : ''}
      ${t5 && act.length ? `<button class="btn special pull5 wide">${ticketSVG('ticket5', 'mini')}<span>★5限定確定で引く<small>${esc(act[0].name)}・のこり ${t5}枚</small></span></button>` : ''}
    </div>`);
  el.querySelector('.back').onclick = halfFurniture;
  const car = el.querySelector('.gc-car');
  const cur = () => banners[idx];
  // いま選んでいるガチャに合わせて、下の「出る家具」と点を変える
  const sync = () => {
    const b = cur();
    el.querySelectorAll('.gc-dots i').forEach((d, k) => d.classList.toggle('on', k === idx));
    el.querySelectorAll('.gc-card').forEach((c, k) => c.classList.toggle('on', k === idx));
    const row = el.querySelector('.gc-row');
    row.innerHTML = lineup(b).map(it => `<button class="gc-it r${it.rarity || 3} ${gachaOwned(it.id) ? 'have' : ''}" data-id="${it.id}">
      <span class="thumb">${thumbHTML(it)}</span><i class="gc-r">★${it.rarity || 3}</i>${gachaOwned(it.id) ? `<i class="gc-ok">${icon('check')}</i>` : ''}</button>`).join('');
    hydrateThumbs(row);
    const list = lineup(b).map(it => itemById(it.id) || it);
    row.scrollLeft = 0;
    el.querySelector('.gc-n').textContent = `${list.length}種類`;
    // このガチャを引いた回数のごほうび（アイコン）
    const bk = b.limited ? b.id : 'standard', rw = pullRewards(bk), n = S.profile().pulls?.[bk] || 0, next = rw.find(a => a.at > n);
    el.querySelector('.gc-reward').innerHTML = rw.length ? `<div class="gr-head">${icon('gift')}<b>引いた回数のごほうび</b><small>このガチャ ${n}回</small></div>
      <div class="gr-row">${rw.map(a => `<span class="gr-it ${n >= a.at ? 'got' : ''} ${next === a ? 'next' : ''}">${avatarHTML({ avatar: a.id }, 'avatar')}<i>${a.at}回</i></span>`).join('')}</div>
      <p class="gr-next">${next ? `あと <b>${next.at - n}回</b> でアイコン「${esc(next.name)}」` : 'ぜんぶもらいました！'}</p>` : '';
    row.querySelectorAll('.gc-it').forEach((x, k) => x.onclick = () => gachaItemViewer(list, k));
  };
  // 横にめくり終わったら、真ん中のカードを選んだことにする
  let t = 0;
  car.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => {
    const w = car.querySelector('.gc-card')?.offsetWidth || 1;
    const k = Math.max(0, Math.min(banners.length - 1, Math.round(car.scrollLeft / (w + 10))));
    if (k !== idx) { idx = k; sync(); }
  }, 80); }, { passive: true });
  const go = (k) => { const c = car.querySelectorAll('.gc-card')[k]; if (c) car.scrollTo({ left: c.offsetLeft - car.offsetLeft - 16, behavior: 'smooth' }); };
  el.querySelectorAll('.gc-dots i').forEach(d => d.onclick = () => { idx = +d.dataset.k; sync(); go(idx); });
  el.querySelectorAll('.gc-card').forEach(c => c.onclick = () => {
    const k = +c.dataset.k;
    if (k !== idx) { idx = k; sync(); return go(k); }
    if (cur().limited && SAMPLE_ROOMS[cur().id]) showSampleRoom(cur().id);
  });
  sync();
  requestAnimationFrame(() => { const c = car.querySelectorAll('.gc-card')[idx]; if (c) car.scrollLeft = c.offsetLeft - car.offsetLeft - 16; });
  el.querySelector('.rates-btn').onclick = () => {
    const b = cur();
    const sh = sheet(`<div class="sh-head"><span class="sh-ic">${icon('star')}</span><div><h3>提供割合</h3><p>${esc(b.limited ? b.name : 'スタンダード')}</p></div></div>
      <div class="rates-body"><p>★5：5%（${b.limited ? 'うち半分は限定シリーズ' : 'いつでも出る家具のみ'}）<br>★4：25%<br>★3：70%</p>
      <p>10回引くと★4以上が必ず1つ入ります。</p><p>★4・★5がかぶったら、それぞれのかけら1個になります。★3がかぶったら、もう1つ持てます。</p>
      <p>引いた回数のごほうび（アイコン）は、決まった回数で必ずもらえます。ガチャからランダムには出ません。</p></div>
      <h4 class="odds-h">家具ごとの出る確率（1回あたり）</h4>
      <div class="odds">${[5, 4, 3].map(r => { const list = G.oddsFor(b.id).filter(o => o.rarity === r); return `<div class="odds-g"><b>★${r}</b><small>合計 ${(list.reduce((n, o) => n + o.p, 0) * 100).toFixed(1)}%・${list.length}種</small></div>${list.map(o => `<div class="odds-r"><span>${esc(o.item.name)}${o.limited ? '<i>限定</i>' : ''}</span><b>${(o.p * 100).toFixed(o.p * 100 < 0.1 ? 3 : 2)}%</b></div>`).join('')}`; }).join('')}</div>
      <button class="link close">とじる</button>`, 'rates-sheet');
    sh.querySelector('.close').onclick = () => sh.remove();
  };
  const opts = () => ({ banner: cur().id });
  el.querySelector('.nx-howto .go')?.addEventListener('click', () => { goTab('play'); });
  el.querySelector('.pull1')?.addEventListener('click', () => doPull(() => [G.pullWithTicket('ticket', gachaOwned, Math.random, opts())], { ticket: 1 }, cur().id));
  el.querySelector('.pull10')?.addEventListener('click', () => doPull(() => G.pullTen(gachaOwned, Math.random, opts()), { ticket: 10 }, cur().id));
  el.querySelector('.pull4')?.addEventListener('click', () => doPull(() => [G.pullWithTicket('ticket4', gachaOwned, Math.random, opts())], { ticket4: 1 }, cur().id));
  el.querySelector('.pull5')?.addEventListener('click', () => doPull(() => [G.pullWithTicket('ticket5', gachaOwned, Math.random, { ...opts(), series: act[0]?.id })], { ticket5: 1 }, cur().id));
  el.querySelectorAll('.shard-btn').forEach(x => x.onclick = () => {
    const r = +x.dataset.r, have = r === 4 ? s4 : s5;
    if (have < G.SHARD_COST) return toast(`★${r}のかけらが${G.SHARD_COST}個たまると、好きな★${r}と交換できます`, 2600);
    shardExchange(r, cur().id);
  });
}
// 出る家具を大きく見る：3D でくるくる回る。左右の矢印で次の家具へ
async function gachaItemViewer(list, k) {
  const { spinViewer } = await import('./thumbs.js');
  let dispose = null;
  const ov = document.createElement('div');
  ov.className = 'gi-view';
  ov.innerHTML = `<div class="gi-bg"></div>
    <button class="icon gi-x" aria-label="とじる">${icon('x')}</button>
    <div class="gi-stage"></div>
    <button class="icon gi-prev" aria-label="前の家具">${icon('back')}</button>
    <button class="icon gi-next" aria-label="次の家具">${icon('chevronRight')}</button>
    <div class="gi-info"></div>`;
  app.appendChild(ov);
  const stage = ov.querySelector('.gi-stage');
  const show = async (n) => {
    k = (n + list.length) % list.length;
    const it = list[k];
    dispose?.(); dispose = null;
    stage.className = 'gi-stage';
    stage.innerHTML = '';
    const have = S.realOwned(it.id);
    ov.querySelector('.gi-info').innerHTML = `<span class="gi-r r${it.rarity || 3}">${'★'.repeat(it.rarity || 3)}</span>
      <h3>${esc(it.name)}</h3><p>${have ? `${icon('check')}持っている` : 'まだ持っていません'}・${k + 1} / ${list.length}</p>
      <small>${it.place === 'skin' ? '画面の着せ替え' : it.place === 'avatar' ? 'プロフィールのアイコン（プロフィールで使えます）' : '指で左右になぞると回せます'}</small>`;
    if (it.place === 'skin' || it.src?.skin || it.place === 'avatar') { stage.innerHTML = `<span class="thumb gi-flat">${thumbHTML(it)}</span>`; hydrateThumbs(stage); return; }
    stage.insertAdjacentHTML('beforeend', `<span class="gi-load">${thumbHTML(it)}</span>`);
    hydrateThumbs(stage);
    const d = await spinViewer(stage, it);
    if (list[k] !== it || !ov.isConnected) { d(); return; }
    dispose = d;
  };
  const close = () => { dispose?.(); ov.remove(); };
  ov.querySelector('.gi-x').onclick = close;
  ov.querySelector('.gi-bg').onclick = close;
  ov.querySelector('.gi-prev').onclick = () => show(k - 1);
  ov.querySelector('.gi-next').onclick = () => show(k + 1);
  show(k);
}
// 限定シリーズの「全部そろえた部屋」の見本（見るだけ。フレンドの部屋と同じしくみで見せる）
const SAMPLE_ROOMS = { band: () => import('./bandsample.js').then(m => m.BAND_SAMPLE) };
async function showSampleRoom(seriesId) {
  let room;
  try { room = await SAMPLE_ROOMS[seriesId](); } catch (e) { return toast('モデルハウスはまだ準備中です'); }
  if (!room) return toast('モデルハウスはまだ準備中です');
  const ser = G.SERIES.find(x => x.id === seriesId);
  visiting = { username: '見本', sample: `${(ser?.name || '').replace('シリーズ', '')}のモデルハウス`, house: { v: 2, rooms: [JSON.parse(JSON.stringify(room))] }, current: 0, summary: {}, back: () => showGacha(seriesId) };
  showVisit();
}
// チケットを使って引き、結果を持ち物へ（かぶりはかけら）
function doPull(roll, cost, bannerId) {
  const hs = HS();
  const have = { ticket: hs.rareTickets || 0, ticket4: hs.rareTickets4 || 0, ticket5: hs.rareTickets5 || 0 };
  for (const [k, n] of Object.entries(cost)) if (have[k] < n) return toast('チケットが足りません');
  hs.rareTickets = have.ticket - (cost.ticket || 0);
  hs.rareTickets4 = have.ticket4 - (cost.ticket4 || 0);
  hs.rareTickets5 = have.ticket5 - (cost.ticket5 || 0);
  const res = roll();
  // そのガチャを引いた回数を数え、決まった回数でアイコンをプレゼントBOXへ（1.10.1）
  const bk = bannerId && bannerId !== 'standard' ? bannerId : 'standard';
  const pf = S.profile(), pulls = pf.pulls || (pf.pulls = {}), before = pulls[bk] || 0;
  pulls[bk] = before + res.length;
  const gotIcons = pullRewards(bk).filter(a => before < a.at && a.at <= pulls[bk]);
  for (const a of gotIcons) S.addGift({ id: 'pull-' + a.id, kind: 'item', itemId: avatarItemId(a.id), title: `ガチャ${a.at}回のごほうび`, from: 'gacha' });
  for (const r of res) {
    if (r.shard === 4) hs.shards4 = (hs.shards4 || 0) + 1;
    else if (r.shard === 5) hs.shards5 = (hs.shards5 || 0) + 1;
    else S.own(r.item.id);
  }
  S.save();
  try { Sync.push?.(true); } catch (e) { /* オフライン。あとで保存される */ } // 演出のとちゅうで閉じても、引いた結果は残るように
  const kind = cost.ticket5 ? 'ticket5' : cost.ticket4 ? 'ticket4' : 'ticket';
  playPull(res, bannerId, kind, () => doPull(roll, cost, bannerId), gotIcons);
}
// 引いたときの演出（js/pullfx.js）。「もう一度」は同じ引き方をもう1回
function playPull(res, bannerId, kind = 'ticket', again = null, gotIcons = []) {
  playPullFX(res, { thumbHTML, hydrateThumbs, esc, vibrate, icon, ticketSVG, kind,
    onDone: (more) => {
      showGacha(bannerId);
      if (gotIcons.length) { updateGiftBadge(); toast(`ガチャ${gotIcons[gotIcons.length - 1].at}回のごほうび！ アイコン「${gotIcons.map(a => a.name).join('」「')}」がプレゼントBOXに届きました`, 3800); vibrate([30, 40, 60]); }
      if (more && again) again();
    } });
}
// かけらで交換
function shardExchange(rarity, bannerId) {
  const hs = HS();
  const key = rarity === 4 ? 'shards4' : 'shards5';
  if ((hs[key] || 0) < G.SHARD_COST) return;
  const act = G.activeSeries()[0];
  const list = G.exchangeable(rarity, gachaOwned, { includeLimited: rarity === 5, series: act?.id });
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('sparkle')}</span><div><h3>★${rarity}のかけらで交換</h3><p>かけら ${G.SHARD_COST}個で、好きな1つと交換できます</p></div></div>
    <div class="invgrid">${list.map(it => `<button class="inv-item" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b></button>`).join('')}</div>
    <button class="link close">やめる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.inv-item').forEach(x => x.onclick = () => {
    const it = itemById(x.dataset.id);
    if (!confirm(`${it.name}と交換しますか？（かけら ${G.SHARD_COST}個）`)) return;
    hs[key] -= G.SHARD_COST;
    S.own(it.id);
    S.save();
    el.remove();
    toast(`${it.name}を手に入れました`);
    showGacha(bannerId);
  });
}

// =========================== 部屋（ホーム） ===========================
// 別荘が開く条件：家の部屋が全部開いていて、どの部屋にも家具を6個以上置いている
const MAIN_ROOMS = ROOMS.filter(r => r.home === 'main');
function villaLack(hs = HS()) {
  return MAIN_ROOMS.map(d => ({ d, n: (hs.rooms.find(x => x.id === d.id)?.placed || []).length, open: hs.rooms.some(x => x.id === d.id) }))
    .filter(x => !x.open || x.n < VILLA_MIN_ITEMS);
}
function ensureRooms() {
  const hs = HS();
  // ランクで開いた部屋を足す
  const rank = rankNow().rank;
  const added = [];
  const curId = hs.rooms[hs.current || 0]?.id;
  const has = (id) => hs.rooms.some(x => x.id === id);
  const addRoom = (d) => {
    // 部屋ごとの最初の壁・床（お風呂のタイルなど）は持ち物にも入れる
    for (const id of Object.values(d.surf || {})) if (id && !S.realOwned(id)) S.own(id);
    hs.rooms.push({ id: d.id, style: null, surf: { ...STARTER, ...(d.surf || {}) }, placed: [] });
    added.push(d);
  };
  for (const r of MAIN_ROOMS) if (r.unlock <= rank && !has(r.id)) addRoom(r);
  if (!hs.villa && !villaLack(hs).length) { hs.villa = true; hs.villaNew = true; }
  if (hs.villa) for (const r of ROOMS) if (r.home === 'villa' && !has(r.id)) addRoom(r);
  if (!hs.rooms.length) addRoom(ROOMS[0]);
  for (const r of hs.rooms) {
    r.surf = r.surf || { ...STARTER, ...(roomDef(r.id).surf || {}) };
    r.placed = r.placed || [];
  }
  // 並びは部屋の一覧の順（今いる部屋はそのまま）
  const order = (id) => { const i = ROOMS.findIndex(x => x.id === id); return i < 0 ? 999 : i; };
  hs.rooms.sort((x, y) => order(x.id) - order(y.id));
  // 最初から持っている物
  for (const id of Object.values(STARTER)) if (id && !S.realOwned(id)) S.own(id);
  if (!hs.started) {
    hs.started = true;
    hs.gauge = Math.max(hs.gauge, S.gaugeMax(hs)); // 最初の1つはプレゼント
  }
  const ci = hs.rooms.findIndex(x => x.id === curId);
  hs.current = ci >= 0 ? ci : Math.min(hs.current || 0, hs.rooms.length - 1);
  S.save();
  return added;
}
function curRoom() { return HS().rooms[HS().current]; }
function curDef() { return roomDef(curRoom().id); }

let houseEntered = false; // 部屋を一度でも出したか（ネットの記録に置きかわった時に読みこみなおすため）
async function enterHouse() {
  if (BETA && !isAdmin()) return showBetaOnly();
  houseEntered = true;
  loadBlocks();
  setTimeout(loadAllBanks, 2500); // 問題バンクは、部屋が出てから裏で読みこむ
  const packsReady = loadSavedPacks();
  const added = ensureRooms();
  if (!room3d) {
    room3d = new Room3D(canvas);
    setInterval(() => room3d.refreshMood(), 60e3);
  }
  room3d.onContextLost = () => {
    ERR.report('WebGL context lost', '', 'contextlost');
    try { S.save(); Sync.push(true); } catch (e) { /* なし */ }
    toast('画面を読みこみなおします（記録は保存しました）', 2000);
    setTimeout(() => location.reload(), 1200);
  };
  room3d.onDoor = goThroughDoor;
  room3d.onSelect = onSelectItem;
  room3d.onPlacedChange = () => S.save();
  room3d.onLights = (off) => { S.save(); toast(off ? '電気を消しました' : '電気をつけました', 1400); vibrate(15); };
  room3d.onInvalid = () => { toast('そこには置けません（ほかの家具や壁と重なります）'); vibrate(40); };
  canvas.classList.remove('dim');
  room3d.setActive(true);
  showHome();
  await room3d.show(curDef(), curRoom());
  receiveSpecials();
  if (!S.profile().mode) {
    // 管理者が先にモードを決めていれば、それを受け取ってから（少しだけ待つ）
    await Promise.race([packsReady, new Promise(r => setTimeout(r, 1500))]);
    if (!S.profile().mode) await askMode();
  }
  const fresh = UINEXT && !(S.profile().solved || 0) && !(S.profile().puzzleClears || 0) && !S.getState().loginBonus;
  const lbShown = fresh ? false : showLoginBonus(); // 新しいデザイン：始めたばかりの日は、ログインボーナスを出さない（2日目から）
  if (added.length > 1) toast(`新しい部屋「${added.map(r => r.name).join('・')}」が開きました`, 3000);
  if (!lbShown && !curRoom().style && !UINEXT) askStyle(); // ログインボーナスがあれば、閉じたあとに出す
}

function remainCapacity(room = curRoom()) {
  return S.capacity() - (room.placed || []).length;
}

let notesChecked = false;
// 何かの操作の途中（模様がえ・家具をえらぶ など）は、下のメニュー・部屋の名前・横のボタンをかくして、部屋を広く見せる（1.12.0）
function setFocus(on) { document.body.classList.toggle('focus', !!on); }
function showHome() {
  setFocus(false);
  BGM.duck(false);
  try { checkNewTitles(); } catch (e) { console.warn('titles', e); }
  // ログイン情報がない（ログアウトされた）のに部屋を出そうとしたら、ログイン画面へ（こわれた画面にしない）
  if (!Auth.currentUser()) return showLogin('login');
  room3d?.clearPreview();
  S.setUnlimited(isAdmin());
  applySkin();
  if (isAdmin()) adminTopUp();
  if (visiting) return showVisit();
  room3d?.setActive(true);
  room3d?.setEditMode(false);
  canvas.classList.remove('dim');
  const hs = HS();
  const r = curRoom(), def = curDef();
  const max = S.gaugeMax(hs);
  const canBuy = hs.gauge >= max || hs.tickets > 0;
  const need = Math.max(1, Math.ceil((max - hs.gauge) / 24));
  const rk = rankNow();
  const home = homeOf(r.id);
  const here = hs.rooms.map((rr, i) => ({ rr, i })).filter(x => homeOf(x.rr.id) === home);
  const locked = home === 'main' ? MAIN_ROOMS.filter(x => !hs.rooms.some(y => y.id === x.id)) : [];
  const homeBtn = home === 'villa'
    ? `<button class="homebtn" data-home="main">${icon('home')}家へ</button>`
    : hs.villa ? `<button class="homebtn villa" data-home="villa">${icon('palm')}別荘へ</button>`
      : `<button class="locked villa-lock">${icon('lock')}別荘<small>全部屋に${VILLA_MIN_ITEMS}個</small></button>`;
  app.innerHTML = '';
  const el = h(`
    <div class="home">
      <header class="hud">
        <div class="room-name">
          <span class="rn-ic">${icon(def.icon)}</span>
          <span class="rn-t"><span class="rn-n">${esc(roomLabel(r))}<i class="rn-edit">${icon('chevronRight')}</i></span><small>${UINEXT ? '' : ({ sunny: '晴れ', cloudy: 'くもり', rain: '雨' })[weatherToday()] + '・' + (r.style ? styleDef(r.style).name + '・' : '')}置いている ${r.placed.length} / ${S.capacity()}</small></span>
        </div>
        <button class="rankchip" aria-label="ランク">
          <span class="lv">Lv<b>${rk.rank}</b></span>
          <span class="xpbar"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></span>
        </button>
        ${UINEXT ? `<button class="round nx-me" aria-label="プロフィール">${avatarHTML(S.profile(), 'avatar')}</button>` : ''}
      </header>
      ${UINEXT && canBuyNow() ? `<button class="nx-buy">${icon('gift')}<span>家具が買える</span><b>${buyCount() > 1 ? '×' + buyCount() : ''}</b></button>` : ''}
      <div class="side-tools">
        ${UINEXT ? `<button class="round nx-menubtn" aria-label="メニュー" aria-expanded="false">${icon('menu')}${newsBadge ? '<i class="gb-n dot-only"></i>' : ''}</button>` : `<button class="round photo" aria-label="写真をとる">${icon('camera')}</button>`}
        ${EV.activeEvent() ? `<button class="round evbtn" aria-label="${esc(EV.activeEvent().name)}">${icon('snow')}${EV.readyCount(EV.activeEvent()) ? `<i class="gb-n">${EV.readyCount(EV.activeEvent())}</i>` : ''}</button>` : ''}
        <button class="round giftbox" aria-label="プレゼントBOX">${icon('gift')}${S.gifts().length ? `<i class="gb-n">${S.gifts().length > 99 ? '99+' : S.gifts().length}</i>` : ''}</button>
      </div>
    </div>`);
  el.querySelector('.photo')?.addEventListener('click', photoMode);
  el.querySelector('.nx-me')?.addEventListener('click', () => showProfile(null, showHome));
  el.querySelector('.nx-menubtn')?.addEventListener('click', () => toggleNxMenu());
  el.querySelector('.nx-buy')?.addEventListener('click', buyFlow);
  el.querySelector('.giftbox')?.addEventListener('click', () => showGiftBox());
  refreshGifts();
  el.querySelector('.evbtn')?.addEventListener('click', () => showEvent());
  el.querySelector('.rankchip').onclick = showRankRoad;
  el.querySelector('.room-name').onclick = () => showRoomPicker({ hs, r, here, locked, home });
  app.append(el, tabbar('room'));
  scrollRoomsNav(el);
  if (!notesChecked) { notesChecked = true; checkUpdateNotes(); }
  if (hs.villaNew) celebrateVilla();
  maybeTour();
}
// 新しいデザイン：はじめての人には、7枚の案内のかわりに「さっそく1問」の1枚だけ（ボタンの説明は使う時に）（1.12.0）
function nxWelcome() {
  const pz = isPuzzle();
  const el = sheet(`
    <div class="nx-welcome">
      <p class="nx-w-k">ようこそ、${esc(user.name)}さん</p>
      <h3>${pz ? 'パズルを解くと、この部屋に家具が増えていきます' : '問題を解くと、この部屋に家具が増えていきます'}</h3>
      <p class="nx-w-s">${pz ? '★1のパズルから始めましょう。わからない時は、パズル画面の「i」で遊び方を見られます' : '1問ずつ、好きな教科から。まちがえても、あとで解き直せます'}</p>
      <button class="btn primary big go">${icon(pz ? 'grid' : 'pencil')}${pz ? 'パズルで遊んでみる' : 'さっそく1問解く'}</button>
      <button class="link later">あとで</button>
    </div>`, 'nx-welcome-sheet');
  const done = () => { const pf = S.profile(); if (!pf.tour) { pf.tour = 1; S.save(); } };
  el.querySelector('.go').onclick = () => { done(); el.remove(); app.querySelector('.solve-ring')?.click(); };
  el.querySelector('.later').onclick = () => { done(); el.remove(); };
}
// はじめての人の案内（1.12.0）：登録してまだ1問も解いていない人に、部屋の画面のボタンを順に説明する。1回だけ
let tourWait = null, tourOn = false;
function maybeTour(tries = 0) {
  clearTimeout(tourWait);
  const pf = S.profile();
  try { if (localStorage.getItem('studyroom.notour')) return; } catch (e) { /* なし */ } // 自動の確かめ（テスト）では出さない
  if (tourOn || pf.tour || (pf.solved || 0) > 0 || (pf.puzzleClears || 0) > 0 || (pf.xp || 0) > 60) return;
  tourWait = setTimeout(() => {
    const busy = !app.querySelector('.home') || visiting || !pf.mode || (!UINEXT && !curRoom()?.style) || document.querySelector('.sheet, .lb-screen, .mode-sheet, .overlay, .title-screen');
    if (busy) { if (tries < 40) maybeTour(tries + 1); return; }
    startTour();
  }, tries ? 1500 : 900);
}
async function startTour(again = false) {
  if (tourOn) return;
  if (UINEXT && !again) return nxWelcome();
  tourOn = true;
  const pz = isPuzzle();
  const steps = [
    { title: 'ROOMIN へようこそ', text: pz ? 'パズルを解いて、自分の部屋を育てるアプリです。おもなボタンを紹介します' : '問題を解いて、自分の部屋を育てるアプリです。おもなボタンを紹介します' },
    { sel: '.solve-ring', title: pz ? 'パズルで遊ぶ' : '問題を解く', text: pz ? 'ここから4種類のパズルを遊べます。クリアするとまわりのゲージがたまります' : 'ここから問題を解きます。教科と単元をえらんで、1問ずつ進みます。正解するとまわりのゲージがたまります' },
    { sel: '.tabbar [data-t=buy]', title: '家具を買う', text: 'ゲージが満タンになると、ここから家具を買って部屋に置けます' },
    { sel: '.tabbar [data-t=gacha]', title: 'ガチャ', text: 'チケットでガチャが引けます。レアな家具や着せ替えが出ます' },
    { sel: '.home .giftbox', title: 'プレゼントBOX', text: 'ログインボーナスやごほうびはここに届きます。忘れずに受け取りましょう' },
    { sel: '.tabbar [data-t=menu]', title: 'メニュー', text: '記録・勉強レポート・設定はここから。この案内は、設定からもう一度見られます' },
    { title: pz ? 'さっそく遊んでみよう' : 'さっそく1問解いてみよう', text: pz ? 'まずは★1のパズルから。わからない時はパズル画面の「i」で遊び方を見られます' : 'まずは好きな教科から1問。まちがえても、あとで解き直せます' },
  ];
  const how = await runTour(steps, { finish: again ? 'とじる' : pz ? '遊んでみる' : '解いてみる' });
  tourOn = false;
  const pf = S.profile();
  if (!pf.tour) { pf.tour = 1; S.save(); }
  if (how === 'done' && !again) app.querySelector('.solve-ring')?.click();
}
// 部屋のボタンが多いので、今の部屋が見える所まで横に送る
// 左上の部屋名から開く「部屋えらび」
function showRoomPicker({ hs, r, here, locked, home }) {
  const old = app.querySelector('.room-pop');
  if (old) { old.remove(); return; }
  const card = ({ rr, i }) => {
    const d = roomDef(rr.id);
    return `<button class="rp-room ${i === hs.current ? 'on' : ''}" data-i="${i}"><span class="rp-ic">${icon(d.icon)}</span><b>${esc(roomLabel(rr))}</b><small>家具 ${rr.placed.length}</small></button>`;
  };
  const next = locked[0];
  const villaBtn = home === 'villa'
    ? `<button class="rp-home" data-home="main">${icon('home')}家へもどる</button>`
    : hs.villa ? `<button class="rp-home villa" data-home="villa">${icon('palm')}別荘へ行く</button>`
      : `<button class="rp-home lock">${icon('lock')}別荘<small>全部屋に家具${VILLA_MIN_ITEMS}個で開く</small></button>`;
  const pop = h(`
    <div class="room-pop">
      <div class="rp-head"><b>${home === 'villa' ? '別荘' : '家'}の部屋</b><button class="rp-rename">${icon('pencil')}名前を変える</button></div>
      <div class="rp-grid">${here.map(card).join('')}${next ? `<button class="rp-room lock"><span class="rp-ic">${icon('lock')}</span><b>${next.name}</b><small>Lv${next.unlock}で開く</small></button>` : ''}</div>
      ${villaBtn}
    </div>`);
  pop.querySelectorAll('.rp-room[data-i]').forEach(b => b.onclick = () => { pop.remove(); if (+b.dataset.i !== hs.current) switchRoom(+b.dataset.i); });
  pop.querySelector('.rp-room.lock')?.addEventListener('click', () => toast(`「${next.name}」は Lv${next.unlock} で開きます`, 2600));
  pop.querySelector('.rp-rename').onclick = () => { pop.remove(); renameRoom(r); };
  pop.querySelector('.rp-home').onclick = (e) => { const t = e.currentTarget; if (t.classList.contains('lock')) return toast(villaHint(), 4200); pop.remove(); goHome(t.dataset.home); };
  app.querySelector('.home').append(pop);
  setTimeout(() => {
    const close = (e) => { if (!pop.contains(e.target) && !e.target.closest('.room-name')) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    document.addEventListener('pointerdown', close, true);
  });
}
function scrollRoomsNav(el) {
  const nav = el.querySelector('.rooms'), on = nav?.querySelector('.on');
  if (nav && on) nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2;
}
function villaHint() {
  const lack = villaLack();
  const closed = lack.filter(x => !x.open);
  if (closed.length) return `家の部屋が全部開いて（Lv${Math.max(...closed.map(x => x.d.unlock))}）、どの部屋にも家具を${VILLA_MIN_ITEMS}個以上置くと、別荘が開きます`;
  return `あと少し！ 家具を${VILLA_MIN_ITEMS}個置くと別荘が開きます：${lack.map(x => `${x.d.name}（あと${VILLA_MIN_ITEMS - x.n}個）`).join('・')}`;
}
// 別荘が開いたお祝い（1回だけ）
function celebrateVilla() {
  const hs = HS();
  hs.villaNew = false; S.save();
  vibrate([40, 60, 40, 60, 120]);
  const vr = ROOMS.filter(r => r.home === 'villa');
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic gold">${icon('palm')}</span><div><h3>別荘ができました！</h3><p>家の部屋を全部かざったごほうびです</p></div></div>
    <ul class="news-list">${vr.map(r => `<li>${icon(r.icon)}${esc(r.name)}</li>`).join('')}</ul>
    <button class="btn gold big go">${icon('palm')}別荘へ行く</button>
    <button class="btn ghost later">あとで</button>`, 'villa-sheet');
  el.querySelector('.go').onclick = () => { el.remove(); goHome('villa'); };
  el.querySelector('.later').onclick = () => el.remove();
}
// 家と別荘を行き来する（前にいた部屋へ）
async function goHome(home) {
  const hs = HS();
  if (room3d?.editMode) return;
  hs.lastIn = hs.lastIn || {};
  hs.lastIn[homeOf(curRoom().id)] = curRoom().id;
  let i = hs.rooms.findIndex(r => r.id === hs.lastIn[home]);
  if (i < 0) i = hs.rooms.findIndex(r => homeOf(r.id) === home);
  if (i < 0) return;
  canvas.classList.add('fade');
  await new Promise(r => setTimeout(r, 350));
  await switchRoom(i);
  canvas.classList.remove('fade');
  if (home === 'villa') toast('別荘に来ました。ドアで別荘の部屋をめぐれます', 2800);
}

async function switchRoom(i) {
  HS().current = i; S.save();
  showHome();
  await room3d.show(curDef(), curRoom());
  if (!curRoom().style) askStyle();
}

// ドアを通って、となりの部屋へ
async function goThroughDoor() {
  if (visiting) {
    const rooms = visiting.house.rooms;
    const home = homeOf(rooms[visiting.current].id);
    const idx = rooms.map((r, i) => i).filter(i => homeOf(rooms[i].id) === home);
    if (idx.length < 2) return toast('ほかの部屋はまだありません');
    canvas.classList.add('fade');
    await new Promise(r => setTimeout(r, 350));
    visiting.current = idx[(idx.indexOf(visiting.current) + 1) % idx.length];
    showVisit();
    canvas.classList.remove('fade');
    return;
  }
  const hs = HS();
  if (app.querySelector('.sheet') || room3d.editMode) return;
  // 同じ家（家 or 別荘）の部屋だけを順にめぐる
  const home = homeOf(curRoom().id);
  const idx = hs.rooms.map((r, i) => i).filter(i => homeOf(hs.rooms[i].id) === home);
  if (idx.length < 2) {
    const next = MAIN_ROOMS.find(x => !hs.rooms.some(y => y.id === x.id));
    toast(next ? `ドアの向こうは「${next.name}」。Lv${next.unlock}で開きます` : 'ほかの部屋はまだありません', 3000);
    return;
  }
  canvas.classList.add('fade');
  await new Promise(r => setTimeout(r, 350));
  await switchRoom(idx[(idx.indexOf(hs.current) + 1) % idx.length]);
  canvas.classList.remove('fade');
}

// 新しい部屋の雰囲気をえらぶ（選ぶと壁と床がその場で変わる）
function askStyle(after = null) {
  const r = curRoom(), def = curDef();
  let picked = null;
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon(def.icon)}</span><div><h3>${def.name}の雰囲気</h3><p>家具を買うとき、この雰囲気に合う物が出やすくなります</p></div></div>
    <div class="stylegrid">${STYLES.map(s => `
      <button class="stylecard" data-s="${s.id}">
        <span class="sw" style="${swatchCSS(s)}"></span>
        <b>${s.name}</b><span>${s.desc}</span>
      </button>`).join('')}</div>
    <button class="btn gold big ok" disabled>この雰囲気にする</button>`, 'style-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelectorAll('.stylecard').forEach(b => b.onclick = async () => {
    picked = b.dataset.s;
    el.querySelectorAll('.stylecard').forEach(x => x.classList.toggle('on', x === b));
    el.querySelector('.ok').disabled = false;
    // お風呂・和室などは、壁と床はそのまま（家具の選ばれ方だけ変わる）
    if (!def.keepSurf) await room3d.previewSurfaces(styleDef(picked).preview);
  });
  el.querySelector('.ok').onclick = async () => {
    r.style = picked;
    // 雰囲気の壁と床が図鑑にあれば、持ち物に入れてそのまま使う
    const pv = styleDef(picked).preview;
    for (const kind of def.keepSurf ? [] : ['wall', 'floor']) {
      const it = matchSurface(kind, pv[kind]);
      if (it) { S.own(it.id); r.surf[kind] = it.id; }
    }
    S.save();
    el.remove();
    await room3d.previewSurfaces(null);
    showHome();
    if (after) after();
    toast(`${styleDef(picked).name}の${def.name}にしました`);
  };
}
function swatchCSS(s) {
  const w = s.preview.wall.color || '#9a958d';
  const f = { oak_wood_planks: '#c79a63', old_wood_floor: '#6b5544', wood_floor_worn: '#7a5636', large_grey_tiles: '#a9a9a6' }[s.preview.floor.tex] || '#a8927a';
  return `background: linear-gradient(180deg, ${w} 0 62%, ${f} 62% 100%)`;
}
function matchSurface(kind, src) {
  if (!src) return null;
  return ITEMS.find(i => i.place === 'surface' && i.surface === kind && ((src.color && i.src.color === src.color) || (src.tex && i.src.tex === src.tex)));
}

// =========================== 家具を買う ===========================
function pickCandidates(genre, style) {
  const pool = itemsOf(genre).filter(i => !i.special && !i.rare && !S.realOwned(i.id)); // レアな物はガチャだけ
  const match = S.shuffle(pool.filter(i => style && i.styles?.includes(style)));
  const other = S.shuffle(pool.filter(i => !(style && i.styles?.includes(style))));
  // 3つのうち2つは部屋の雰囲気に合う物（足りなければほかから）
  const out = [...match.slice(0, 2)];
  for (const i of [...other, ...match.slice(2)]) { if (out.length >= 3) break; if (!out.includes(i)) out.push(i); }
  return S.shuffle(out);
}

// 買える1回分の候補：ジャンル3つ（その部屋にまだ無いジャンルほど出やすい）と、ジャンルごとの家具3つ。
// 画面を閉じたり開き直したりしても変わらない（買うまで保存しておく）
function buyable(i) { return !i.special && !i.rare && !HS().inventory[i.id]; }
function currentOffer() {
  const hs = HS();
  const ok = (o) => o && o.genres?.length && o.genres.every(g => itemsOf(g).some(buyable));
  if (ok(hs.offer)) return hs.offer;
  const room = curRoom();
  const inRoom = new Set((room.placed || []).map(p => itemById(p.item)?.genre).concat(Object.values(room.surf || {}).filter(Boolean).map(id => itemById(id)?.genre)));
  let pool = GENRES.filter(g => itemsOf(g.id).some(buyable)).map(g => ({ g: g.id, w: inRoom.has(g.id) ? 1 : 3 }));
  const genres = [];
  while (genres.length < 3 && pool.length) {
    const total = pool.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    const k = pool.findIndex(x => (r -= x.w) < 0);
    genres.push(pool[k].g);
    pool.splice(k, 1);
  }
  hs.offer = { genres, cands: {} };
  S.save();
  return hs.offer;
}
// 候補にまざる「おまけ」のレアチケット（家具の代わりに選べる）
const TICKET_CANDS = { '@ticket': 'ticket', '@ticket4': 'ticket4' };
const ticketCand = (id) => ({ id, ticket: TICKET_CANDS[id], name: TICKET_NAME?.[TICKET_CANDS[id]] || 'レアチケット', place: 'ticket', src: {} });
function offerCands(genre) {
  const o = currentOffer();
  let ids = (o.cands[genre] || []).filter(id => { if (TICKET_CANDS[id]) return true; const it = itemById(id); return it && buyable(it); });
  if (!ids.some(id => !TICKET_CANDS[id])) {
    ids = pickCandidates(genre, curRoom().style).map(i => i.id);
    // まれに（約5%）、候補の1つがレアチケットになる。さらにその中のまれに★4以上確定
    if (ids.length && Math.random() < 0.05) ids[ids.length - 1] = Math.random() < 0.15 ? '@ticket4' : '@ticket';
    o.cands[genre] = ids;
    S.save();
  }
  return ids.map(id => TICKET_CANDS[id] ? ticketCand(id) : itemById(id));
}
const candArt = (it) => it.ticket ? `<span class="thumb tk-thumb">${ticketSVG(it.ticket, 'mini')}</span>` : `<span class="thumb">${thumbHTML(it)}</span>`;

function buyFlow() {
  const o = currentOffer();
  if (!o.genres.length) return toast('買える家具はもう全部そろっています');
  if (UINEXT && !curRoom().style) return askStyle(() => buyFlow()); // 新しいデザイン：部屋の雰囲気は、はじめて家具を買う時に聞く
  if (UINEXT) return chooseCandidate(o.genres[0]); // 新しいデザイン：ジャンルは上のタブで切りかえる（1つ前の画面をはさまない）
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic gold">${icon('gift')}</span><div><h3>何を買いますか？</h3><p>ジャンルを選ぶと、右の3つから1つ選べます</p></div></div>
    <div class="genrelist">${o.genres.map(gid => {
      const g = GENRES.find(x => x.id === gid);
      const all = itemsOf(gid).filter(i => !i.special && !i.rare);
      const have = all.filter(i => S.realOwned(i.id)).length;
      const fresh = !curRoom().placed.some(p => itemById(p.item)?.genre === gid);
      const peek = offerCands(gid);
      return `<button class="genre-row ${peek.some(it => it.ticket) ? 'has-ticket' : ''}" data-g="${gid}">
        <span class="g-ic">${icon(GENRE_ICON[gid] || 'box')}</span>
        <span class="g-t"><b>${g.name}</b><small>${fresh ? '<i class="g-new">NEW</i>' : ''}${have}/${all.length}</small></span>
        <span class="g-peek">${peek.map(candArt).join('')}</span>
        ${icon('chevronRight')}</button>`;
    }).join('')}</div>
    <button class="link close">あとで</button>`, 'buy-sheet');
  setFocus(true); app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelectorAll('.genre-row').forEach(b => b.onclick = () => chooseCandidate(b.dataset.g));
}

function chooseCandidate(genreId) {
  const g = GENRES.find(x => x.id === genreId);
  const cands = offerCands(genreId);
  if (!cands.length) return toast('このジャンルは全部そろっています');
  // 選ぶ前から、3つのデータを裏で読み込んでおく（置くときに待たない）
  for (const it of cands) if (it.src?.model) loadModel(it.src.model).catch(() => {});
  let picked = null;
  const el = sheet(`
    ${UINEXT ? `<div class="sh-head"><span class="sh-ic gold">${icon('gift')}</span><div><h3>家具を買う</h3><p>${buyCount() > 1 ? `あと ${buyCount()}個 買えます` : 'えらんで買うと、部屋に置かれます'}</p></div><button class="sh-fold" aria-label="たたんで部屋を見る">${icon('eye')}<span>部屋を見る</span></button><button class="sh-x nx-buyx" aria-label="とじる">${icon('x')}</button></div>
    <div class="nx-gtabs">${currentOffer().genres.map(gid => `<button data-g="${gid}" class="${gid === genreId ? 'on' : ''}">${icon(GENRE_ICON[gid] || 'box')}${GENRES.find(x => x.id === gid)?.name || ''}</button>`).join('')}</div>`
    : `<div class="sh-head"><button class="sh-back">${icon('back')}</button><div><h3>${g.name}</h3><p>買うと、部屋の合う場所に自動で置きます</p></div><button class="sh-fold" aria-label="たたんで部屋を見る">${icon('eye')}<span>部屋を見る</span></button></div>`}
    <div class="candgrid">${cands.map(it => `
      <button class="cand ${it.rare || it.ticket ? 'rare' : ''} ${it.ticket ? 'ticket' : ''}" data-id="${it.id}">
        ${candArt(it)}
        ${it.rare || it.ticket ? `<span class="badge-rare">${icon('star')}${it.ticket ? 'おまけ' : 'レア'}</span>` : ''}
        <b>${esc(it.name)}</b>
        <span class="chips">${it.ticket ? '<i>ガチャに使える</i>' : (it.styles || []).slice(0, 2).map(s => `<i>${styleDef(s).name}</i>`).join('')}</span>
      </button>`).join('')}</div>
    <p class="pv-tip">選ぶと、部屋のどこに置かれるかが見られます</p>
    <button class="btn gold big ok" disabled>${icon('check')}${UINEXT ? '<span class="ok-t">家具をえらんでください</span>' : 'これを買う'}</button>`, 'cand-sheet');
  setFocus(true); app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.sh-back')?.addEventListener('click', () => { room3d?.clearPreview(); buyFlow(); });
  el.querySelector('.nx-buyx')?.addEventListener('click', () => { room3d?.clearPreview(); el.remove(); showHome(); });
  el.querySelectorAll('.nx-gtabs [data-g]').forEach(b => b.onclick = () => { if (b.dataset.g === genreId) return; room3d?.clearPreview(); chooseCandidate(b.dataset.g); });
  // 「部屋を見る」：下の画面を小さくたたんで、置いた様子（ラグなど床の物も）を見られるように（1.11.0）
  const fold = (on) => { el.classList.toggle('folded', on); el.querySelector('.sh-fold span').textContent = on ? 'もどす' : '部屋を見る'; el.querySelector('.sh-fold').setAttribute('aria-label', on ? '選ぶ画面にもどす' : 'たたんで部屋を見る'); };
  el.querySelector('.sh-fold').onclick = () => fold(!el.classList.contains('folded'));
  el.querySelector('.grab')?.addEventListener('click', () => fold(!el.classList.contains('folded')));
  // 選んだら、部屋の決まった場所に実際に置いて見せる（壁紙・床などと、置ける数がいっぱいのときは見せない）
  const canPreview = (it) => it.place !== 'surface' && remainCapacity(curRoom()) > 0;
  el.querySelectorAll('.cand').forEach(b => b.onclick = async () => {
    picked = TICKET_CANDS[b.dataset.id] ? ticketCand(b.dataset.id) : itemById(b.dataset.id);
    if (picked.place !== 'surface' && room3d?.surfPreview) room3d.previewSurfaceItem(null);
    el.querySelectorAll('.cand').forEach(x => x.classList.toggle('on', x === b));
    el.querySelector('.ok').disabled = false;
    const okT = el.querySelector('.ok .ok-t'); if (okT) okT.textContent = `${picked.name}を${picked.ticket ? 'もらう' : '買う'}`;
    const tip = el.querySelector('.pv-tip');
    if (picked.ticket) {
      room3d?.clearPreview();
      tip.textContent = '家具の代わりに、レアガチャのチケットがもらえます';
    } else if (canPreview(picked)) {
      tip.textContent = '部屋のどこに置かれるか、見せています…';
      const p = await room3d.showPreview(picked);
      if (picked && b.classList.contains('on')) tip.textContent = p ? '光っている場所に置かれます。あとで模様がえで動かせます' : '空いている場所がないので、持ち物に入ります';
    } else {
      room3d?.clearPreview(true);
      if (picked.place === 'surface') {
        tip.textContent = '部屋にためしに映しています…';
        await room3d?.previewSurfaceItem(picked);
        if (b.classList.contains('on')) tip.textContent = 'いまの部屋に映しています。買うとこの見た目になります';
      } else tip.textContent = `置ける数がいっぱいなので、持ち物に入ります（Lvが上がると増えます）`;
    }
  });
  el.querySelector('.ok').onclick = async () => {
    if (!picked) return;
    const hs = HS();
    const max = S.gaugeMax(hs);
    if (hs.gauge >= max) { hs.gauge -= max; hs.unlocks++; } else if (hs.tickets > 0) hs.tickets--; else return;
    hs.offer = null; // 次に買うときは、新しい候補
    if (room3d) room3d.surfPreview = null; // ためしに映していた物は、本当に変える時に作り直す
    if (picked.ticket) {
      const key = picked.ticket === 'ticket4' ? 'rareTickets4' : 'rareTickets';
      hs[key] = (hs[key] || 0) + 1;
      el.remove(); room3d?.clearPreview();
      S.save(); vibrate([30, 40, 60]);
      toast(`${picked.name}を1枚手に入れました`, 2400);
      showHome();
      return;
    }
    S.own(picked.id);
    el.remove();
    vibrate([30, 40, 60]);
    // おためしで置いて見せていた物は、そのまま本当に置く
    const pv = room3d?.preview && room3d.preview.userData.item?.id === picked.id ? room3d.commitPreview(S.newUid()) : null;
    let placedUid = null;
    if (pv) {
      curRoom().placed.push(pv);
      S.save();
      if (!HS().villa) ensureRooms();
      placedUid = pv.uid;
    } else {
      room3d?.clearPreview();
      const r = await putIntoRoom(picked, true, true);
      if (r && r !== true) placedUid = r;
    }
    S.save();
    // 買ったら、その場で置く場所を決められる（なぞって動かす・回す →「ここに置く」）（1.15）
    if (placedUid && room3d?.objByUid?.[placedUid]) return placeJustBought(placedUid, picked);
    showHome();
  };
}

// 部屋の名前（自分でつけた名前があればそれ）
function roomLabel(rr) { return (rr && rr.name) || roomDef(rr?.id)?.name || '部屋'; }
function renameRoom(r) {
  const def = roomDef(r.id);
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('pencil')}</span><div><h3>部屋の名前</h3><p>12文字まで。フレンドにもこの名前で見えます</p></div></div>
    <input class="rn-input" maxlength="12" value="${esc(roomLabel(r))}" placeholder="${esc(def.name)}">
    <div class="eb-btns"><button class="btn ghost reset">もとの名前</button><button class="btn primary ok">${icon('check')}決める</button></div>
    <button class="link close">とじる</button>`, 'rename-sheet');
  const inp = el.querySelector('.rn-input');
  setTimeout(() => inp.focus(), 50);
  const done = (name) => {
    name = (name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!name || name === def.name) delete r.name; else r.name = name;
    S.save(); el.remove(); showHome();
    toast(`「${roomLabel(r)}」にしました`);
  };
  el.querySelector('.ok').onclick = () => done(inp.value);
  inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value); };
  el.querySelector('.reset').onclick = () => done('');
  el.querySelector('.close').onclick = () => el.remove();
}

// 持ち物から部屋へ（壁紙などはその場で変える）
async function putIntoRoom(item, justBought, quiet = false) {
  const r = curRoom();
  if (item.place === 'surface') {
    r.surf[item.surface] = item.id;
    S.save();
    await room3d.buildShell();
    toast(`${item.name}に変えました`);
    return true;
  }
  if (remainCapacity(r) <= 0) {
    toast(justBought ? `持ち物に入れました（この部屋に置ける数がいっぱい。Lvが上がると増えます）` : `置ける数がいっぱいです（Lv${rankNow().rank}：${S.capacity()}個）`, 3200);
    return false;
  }
  if (S.placedCount(item.id) >= S.owned(item.id)) { toast('もう全部置いています'); return false; }
  const p = { uid: S.newUid(), item: item.id, ...room3d.suggestPlacement(item) };
  r.placed.push(p);
  const o = await room3d.addPlaced(p, true);
  if (!o) {
    r.placed.splice(r.placed.indexOf(p), 1); // 置けなかった記録は残さない
    S.save();
    toast('空いている場所がありませんでした。持ち物に入れておきます', 3000);
    return false;
  }
  S.save(); // 置いた位置を保存
  if (!HS().villa) ensureRooms(); // 家具がそろったら別荘が開く
  if (quiet) return p.uid;
  toast(justBought ? `${item.name}を置きました。模様がえで動かせます` : `${item.name}を置きました`, 2600);
  return true;
}

// 買った家具を、その場で好きな所に置く。模様がえと同じ操作で、終わったら買う画面（まだ買えるなら）か部屋へ（1.15）
function placeJustBought(uid, item) {
  closeSheets();
  showHome();
  for (const sel of ['.dock', '.side-tools', '.hint', '.mode-toggle']) app.querySelector(sel)?.remove();
  app.querySelector('.tabbar')?.classList.add('hide');
  room3d.setEditMode(true);
  setFocus(true);
  const more = canBuyNow();
  const bar = h(`
    <div class="editbar place-new">
      <div class="eb-top"><b>${icon('sofa')}置く場所を決める</b><span class="cap">${esc(item.name)}</span></div>
      <p class="eb-hint">家具をなぞって動かす。「回す」で向きを変える。細かい位置は矢印で</p>
      <div class="eb-btns">
        <button class="btn primary big done">${icon('check')}ここに置く${more ? `（あと${buyCount()}つ買えます）` : ''}</button>
      </div>
    </div>`);
  bar.querySelector('.done').onclick = () => {
    room3d.setEditMode(false); S.save(); vibrate([20, 30]);
    toast(`${item.name}を置きました${more ? '' : '。模様がえでいつでも動かせます'}`, 2200);
    if (canBuyNow()) buyFlow(); else showHome();
  };
  app.querySelector('.home').append(bar);
  room3d.select(uid);
  room3d.focusSelected?.();
}

// ログインボーナス：その日はじめて開いたとき、専用の画面で30日のカレンダーにスタンプ
function showLoginBonus() {
  const got = S.claimLoginBonus();
  if (!got) return false;
  S.save();
  const cellArt = (r) => r.kind === 'gauge' ? `<span class="lb-g">${icon('gift')}</span>` : ticketSVG(r.kind, 'mini');
  const cells = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1, r = S.loginBonusDay(n);
    const cls = [n < got.day ? 'done' : '', n === got.day ? 'today' : '', r.kind !== 'gauge' ? 'big ' + r.kind : ''].join(' ');
    return `<div class="lb-cell ${cls}"><small>${n}</small>${cellArt(r)}${n <= got.day ? `<i class="stamp">${icon('check')}</i>` : ''}</div>`;
  }).join('');
  const r = got.reward;
  const next = [5, 10, 15, 20, 25, 30].find(d => d > got.day);
  const el = h(`
    <div class="lb-screen">
      <div class="lb-rays"></div>
      <div class="lb-inner">
        <p class="lb-kicker">LOGIN BONUS</p>
        <h2 class="lb-day"><b>${got.day}</b>日目</h2>
        <div class="lb-reward lbk-${r.kind}">
          ${r.kind === 'gauge' ? `<div class="lb-gbig">${icon('gift')}<span>×${r.amount}</span></div>` : ticketSVG(r.kind, 'big')}
          <p><b>${r.label}</b>をもらいました${r.kind === 'gauge' ? '' : '！'}</p>
        </div>
        <div class="lb-grid">${cells}</div>
        <p class="lb-next">${next ? `あと${next - got.day}日で <b>${S.loginBonusDay(next).label}</b>` : '30日達成！ あしたから2周目'}</p>
        <button class="btn gold big ok">${icon('check')}受けとる</button>
      </div>
    </div>`);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  el.querySelector('.ok').onclick = () => {
    el.classList.remove('show'); setTimeout(() => el.remove(), 400);
    showHome();
    if (!curRoom().style) askStyle();
  };
  return true;
}

// 克服のごほうび（特別な家具）を持ち物に入れる
function receiveSpecials() {
  const hs = HS();
  while (hs.pendingSpecials > 0) {
    const id = SPECIAL_IDS[hs.specialsGiven % SPECIAL_IDS.length];
    hs.specialsGiven++; hs.pendingSpecials--;
    const it = itemById(id);
    if (it) { S.addGift({ kind: 'item', itemId: id, title: '克服のごほうび', from: 'master' }); toast(`特別な家具「${it.name}」がプレゼントBOXに届きました`, 3200); updateGiftBadge(); }
  }
  S.save();
}

// =========================== 模様がえ ===========================
function showEdit() {
  if (!room3d) return;
  closeSheets();
  showHome();
  app.querySelector('.dock')?.remove();
  app.querySelector('.side-tools')?.remove();
  app.querySelector('.hint')?.remove();
  app.querySelector('.mode-toggle')?.remove(); // 模様がえ中は「勉強｜パズル」を出さない（完了ボタンと重なるため）
  app.querySelector('.tabbar .on')?.classList.remove('on');
  app.querySelector('.tabbar [data-t=edit]')?.classList.add('on');
  room3d.setEditMode(true);
  setFocus(true);
  let hintN = 0; try { hintN = +(localStorage.getItem('studyroom.ebHint') || 0); localStorage.setItem('studyroom.ebHint', String(hintN + 1)); } catch (e) { /* なし */ }
  const bar = h(`
    <div class="editbar">
      <div class="eb-top"><b>${icon('sofa')}模様がえ</b><span class="cap">置いている <b>${curRoom().placed.length}</b> / ${S.capacity()}</span></div>
      ${hintN < 3 ? '<p class="eb-hint">家具をタップして選ぶ → なぞって動かす。細かい位置は矢印で。小さい物や天井の物は「一覧」から</p>' : ''}
      <div class="eb-view seg"><button data-v="eye" class="on">${icon('eye')}ふつう</button><button data-v="walk">${icon('move')}歩く</button><button data-v="top">${icon('grid')}上から</button></div>
      <div class="eb-btns">
        <button class="btn ghost plist">${icon('menu')}一覧</button>
        <button class="btn ghost inv">${icon('box')}持ち物</button>
        <button class="btn ghost surf">${icon('brush')}壁・床など</button>
        <button class="btn primary done">${icon('check')}完了</button>
      </div>
    </div>`);
  bar.querySelectorAll('.eb-view button').forEach(b => b.onclick = () => {
    bar.querySelectorAll('.eb-view button').forEach(x => x.classList.toggle('on', x === b));
    room3d.setTopView(b.dataset.v === 'top');
    room3d.setWalkEdit(b.dataset.v === 'walk');
    if (b.dataset.v === 'walk') toast('床をタップすると、そこへ歩きます。家具をタップすると動かせます', 2600);
  });
  bar.querySelector('.inv').onclick = showInventory;
  bar.querySelector('.plist').onclick = showPlacedList;
  bar.querySelector('.surf').onclick = showSurfaces;
  bar.querySelector('.done').onclick = () => { room3d.setEditMode(false); S.save(); showHome(); };
  app.querySelector('.home').append(bar);
}
// 模様がえ：置いている家具の一覧からえらぶ（小さい物・天井の物・棚の中の物も、えらびやすく。1.12.0）
function showPlacedList() {
  const r = curRoom();
  const groups = [['floor', '床', 'sofa'], ['on', 'テーブル・棚の上', 'box'], ['wall', '壁', 'image'], ['ceiling', '天井', 'light'], ['rug', 'ラグ', 'grid']];
  const kindOf = (p, it) => p.on != null ? 'on' : it.place === 'wall' ? 'wall' : it.place === 'ceiling' ? 'ceiling' : it.place === 'rug' ? 'rug' : 'floor';
  const rows = r.placed.map(p => ({ p, it: itemById(p.item) })).filter(x => x.it);
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('menu')}</span><div><h3>置いている家具</h3><p>えらぶと、その家具のほうを向いて選んだ状態になります</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <div class="pl-list">${groups.map(([k, n]) => { const list = rows.filter(x => kindOf(x.p, x.it) === k); return list.length ? `<h4>${n}<small>${list.length}</small></h4><div class="invgrid">${list.map(x => `<button class="inv-item pl-item ${room3d.selected === x.p.uid ? 'on' : ''}" data-u="${x.p.uid}"><span class="thumb">${thumbHTML(x.it)}</span><b>${esc(x.it.name)}</b></button>`).join('')}</div>` : ''; }).join('') || '<p class="empty">まだ何も置いていません</p>'}</div>`, 'inv-sheet pl-sheet');
  hydrateThumbs(el);
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.pl-item').forEach(b => b.onclick = () => { el.remove(); const u = r.placed.find(x => String(x.uid) === b.dataset.u)?.uid; room3d.select(u); room3d.focusSelected(); vibrate(10); });
}
function refreshEditCount() {
  const c = app.querySelector('.editbar .cap b');
  if (c) c.textContent = curRoom().placed.length;
}
function onSelectItem(uid) {
  app.querySelector('.float-bar')?.remove();
  app.querySelector('.nudge')?.remove();
  if (!uid || !room3d.editMode) return;
  const p = curRoom().placed.find(x => x.uid === uid);
  const it = p && itemById(p.item);
  if (!it) return;
  const fb = h(`
    <div class="float-bar">
      <span class="fb-name">${esc(it.name)}</span>
      ${it.place !== 'wall' ? `<button class="rot">${icon('rotate')}回す</button>` : ''}
      ${room3d.levelInfo(uid)?.count > 1 ? `<button class="lvup">上の段</button><button class="lvdn">下の段</button>` : ''}
      <button class="swap">${icon('refresh')}入れかえ</button>
      <button class="store">${icon('box')}しまう</button>
      <button class="x" aria-label="選ぶのをやめる">${icon('x')}</button>
    </div>`);
  fb.querySelector('.rot')?.addEventListener('click', () => room3d.rotateSelected());
  fb.querySelector('.swap').onclick = () => showSwap(uid);
  const lv = (dir) => { if (room3d.moveLevel(uid, dir)) { S.save(); vibrate(10); } else toast(dir > 0 ? 'これより上の段はありません' : 'これより下の段はありません', 1400); };
  fb.querySelector('.lvup')?.addEventListener('click', () => lv(1));
  fb.querySelector('.lvdn')?.addEventListener('click', () => lv(-1));
  fb.querySelector('.store').onclick = () => {
    const r = curRoom();
    const riders = r.placed.filter(x => x.on === uid).map(x => x.uid);
    r.placed = r.placed.filter(x => x.uid !== uid && !riders.includes(x.uid));
    room3d.st = r;
    for (const u of [uid, ...riders]) room3d.removeObject(u);
    S.save();
    refreshEditCount();
    toast(`${it.name}を持ち物にしまいました`);
  };
  fb.querySelector('.x').onclick = () => room3d.select(null);
  app.querySelector('.home')?.append(fb);
  // 矢印で少しずつ動かす（押しつづけると動きつづける）。壁の物は上下、ほかは奥・手前（1.12.0）
  const wall = it.place === 'wall';
  const pad = h(`<div class="nudge" aria-label="少しずつ動かす">
    <button data-d="0,1" aria-label="${wall ? '上へ' : '奥へ'}">${icon('chevronRight')}</button>
    <button data-d="-1,0" aria-label="左へ">${icon('chevronRight')}</button>
    <span class="ng-c">${icon('move')}</span>
    <button data-d="1,0" aria-label="右へ">${icon('chevronRight')}</button>
    <button data-d="0,-1" aria-label="${wall ? '下へ' : '手前へ'}">${icon('chevronRight')}</button></div>`);
  let rep = null, moved = false;
  const stop = () => { clearTimeout(rep); rep = null; if (moved) { S.save(); moved = false; } };
  pad.querySelectorAll('button').forEach(b => {
    const [dx, dy] = b.dataset.d.split(',').map(Number);
    const step = (n) => { if (room3d.nudgeSelected(dx, dy)) moved = true; else if (n === 0) { toast('そこには動かせません', 1200); vibrate(30); } rep = setTimeout(() => step(n + 1), n === 0 ? 380 : 70); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); step(0); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  });
  app.querySelector('.home')?.append(pad);
}
// 入れかえ：同じ種類の家具と、場所と向きはそのままで取りかえる
function showSwap(uid) {
  const r = curRoom();
  const p = r.placed.find(x => x.uid === uid);
  const cur = p && itemById(p.item);
  if (!cur) return;
  const ids = S.isUnlimited() ? [...new Set([...ITEMS, ...G.GACHA_ITEMS].map(i => i.id))] : Object.keys(HS().inventory);
  const list = ids.map(itemById).filter(it => it && it.id !== cur.id && it.genre === cur.genre && it.place === cur.place && S.owned(it.id) > S.placedCount(it.id));
  const genreName = GENRES.find(g => g.id === cur.genre)?.name || '家具';
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('refresh')}</span><div><h3>入れかえ</h3><p>${esc(cur.name)}と、同じ場所・同じ向きで取りかえます</p></div></div>
    ${list.length ? `<div class="invgrid">${list.map(it => `<button class="inv-item" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b></button>`).join('')}</div>`
      : `<p class="empty">入れかえられる${esc(genreName)}を持っていません。「家具を買う」やガチャで手に入れると、ここに出ます。</p>`}
    <button class="link close">やめる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.inv-item').forEach(b => b.onclick = async () => {
    const next = itemById(b.dataset.id);
    el.remove();
    const before = p.item;
    p.item = next.id;
    room3d.removeObject(uid);
    const o = await room3d.placeOne(p, true);
    // 大きさがちがって重なったら、近くの空いている所へ少しずらす。それでもだめなら元にもどす
    if (!o || !(room3d.checkPlacement(o) || room3d.findFreeSpot(o))) {
      if (o) room3d.removeObject(uid);
      p.item = before;
      await room3d.placeOne(p, false);
      room3d.updateLights();
      return toast('ここには入りませんでした（大きすぎるかも）', 2600);
    }
    // 上にのっていた小物は、新しい家具の高さにのせ直す
    for (const x of r.placed.filter(q => q.on === uid)) {
      const ro = room3d.objByUid?.[x.uid];
      if (!ro) continue;
      delete x.on; delete x.y;
      room3d.mountPlaced(ro, x);
      room3d.checkPlacement(ro);
    }
    room3d.updateLights();
    S.save();
    room3d.select(uid);
    vibrate(20);
    toast(`${next.name}に入れかえました`, 1800);
  });
}
function showInventory() {
  const inv = HS().inventory;
  const ids = S.isUnlimited() ? [...new Set([...ITEMS, ...G.GACHA_ITEMS].map(i => i.id))] : Object.keys(inv);
  const list = ids.map(itemById).filter(it => it && it.place !== 'surface' && it.place !== 'skin' && it.place !== 'avatar' && S.owned(it.id) > S.placedCount(it.id));
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('box')}</span><div><h3>持ち物</h3><p>タップすると部屋に置きます（あと ${Math.max(0, remainCapacity())} 個置けます）</p></div></div>
    ${list.length ? `<div class="invgrid">${list.map(it => `
      <button class="inv-item" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b>
      ${S.isUnlimited() ? '<i class="cnt">∞</i>' : S.owned(it.id) - S.placedCount(it.id) > 1 ? `<i class="cnt">×${S.owned(it.id) - S.placedCount(it.id)}</i>` : ''}</button>`).join('')}</div>`
      : '<p class="empty">置いていない家具はありません。問題を解いてゲージをためると、家具を買えます。</p>'}
    <button class="link close">とじる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.inv-item').forEach(b => b.onclick = async () => {
    const ok = await putIntoRoom(itemById(b.dataset.id), false);
    if (ok) { el.remove(); refreshEditCount(); room3d.select(curRoom().placed.at(-1).uid); }
  });
}
function showSurfaces(kind = 'wall') {
  const r = curRoom();
  if (kind === 'fix') return showFixtures();
  const owned = [...ITEMS, ...G.GACHA_ITEMS.filter(i => !ITEMS.includes(i))].filter(i => i.place === 'surface' && i.surface === kind && S.owned(i.id));
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('brush')}</span><div><h3>壁・床・ドア・窓</h3><p>持っている物から選べます</p></div></div>
    <div class="seg kinds">${surfKinds().map(([k, n]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="invgrid">${kind === 'curtain' ? `<button class="inv-item ${!r.surf.curtain ? 'on' : ''}" data-id=""><span class="thumb none">${icon('x')}</span><b>なし</b></button>` : ''}
      ${owned.map(it => `<button class="inv-item ${r.surf[kind] === it.id ? 'on' : ''}" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b></button>`).join('')}</div>
    ${!owned.length && kind !== 'curtain' ? '<p class="empty">まだ持っていません。「家具を買う」で手に入ります。</p>' : ''}
    <button class="link close">とじる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.kinds button').forEach(b => b.onclick = () => showSurfaces(b.dataset.k));
  el.querySelectorAll('.inv-item').forEach(b => b.onclick = async () => {
    r.surf[kind] = b.dataset.id || null;
    S.save();
    el.querySelectorAll('.inv-item').forEach(x => x.classList.toggle('on', x === b));
    await room3d.buildShell();
  });
}

// 部屋に備え付けの物があれば「備え付け」の切りかえも出す
function surfKinds() { return roomShape(curDef()).built.some(b => FIX_VARIANTS[b.kind]) ? [...SURFACE_KINDS, ['fix', '備え付け']] : SURFACE_KINDS; }
function showFixtures() {
  const r = curRoom();
  const kinds = [...new Set(roomShape(curDef()).built.map(b => b.kind))].filter(k => FIX_VARIANTS[k]);
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('brush')}</span><div><h3>壁・床・ドア・窓</h3><p>備え付けの物は、いつでも色や素材を変えられます</p></div></div>
    <div class="seg kinds">${surfKinds().map(([k, n]) => `<button data-k="${k}" class="${k === 'fix' ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="fixlist">${kinds.map(k => `<div class="fix-row"><b>${FIX_NAMES[k] || k}</b><div class="fix-vs">${FIX_VARIANTS[k].map(v => `
      <button class="fix-v ${(r.fix?.[k] || 'std') === v.id ? 'on' : ''}" data-k="${k}" data-v="${v.id}"><i style="background:${v.tint || 'linear-gradient(135deg,#f4f1ea,#cfc6b8)'}"></i>${v.name}</button>`).join('')}</div></div>`).join('')}</div>
    <button class="link close">とじる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.kinds button').forEach(b => b.onclick = () => showSurfaces(b.dataset.k));
  el.querySelectorAll('.fix-v').forEach(b => b.onclick = async () => {
    r.fix = r.fix || {};
    if (b.dataset.v === 'std') delete r.fix[b.dataset.k]; else r.fix[b.dataset.k] = b.dataset.v;
    S.save();
    el.querySelectorAll(`.fix-v[data-k="${b.dataset.k}"]`).forEach(x => x.classList.toggle('on', x === b));
    await room3d.buildShell();
  });
}

// =========================== 写真 ===========================
function photoMode() {
  document.body.classList.add('photo-mode');
  room3d.setEditMode(false);
  const ov = h(`
    <div class="photo-ui">
      <button class="round close" aria-label="もどる">${icon('x')}</button>
      <button class="shutter" aria-label="撮る"><i></i></button>
      <p class="ph-hint">なぞって構図を決めて、まるいボタンで撮影</p>
    </div>`);
  document.body.append(ov);
  ov.querySelector('.close').onclick = () => { ov.remove(); document.body.classList.remove('photo-mode'); };
  ov.querySelector('.shutter').onclick = async () => {
    const url = room3d.capture();
    ov.classList.add('flash'); setTimeout(() => ov.classList.remove('flash'), 300);
    const prev = h(`
      <div class="photo-preview">
        <img src="${url}" alt="撮った写真">
        <div class="pp-btns"><button class="btn primary save">${icon('download')}保存する</button><button class="btn ghost back">撮りなおす</button></div>
      </div>`);
    document.body.append(prev);
    prev.querySelector('.back').onclick = () => prev.remove();
    prev.querySelector('.save').onclick = async () => {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `heyadukuri-${Date.now()}.jpg`, { type: 'image/jpeg' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      } catch (e) { /* 共有をやめたとき */ return; }
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
    };
  };
}

// =========================== 更新のお知らせ ===========================
// このプログラムの版（version.json と同じにする。公開のたびに上げる）
const APP_VERSION = '1.15.0';
ERR.setVersion(APP_VERSION);
// 新しい版が出たら、みんな同じタイミングでそろうように強制で再起動する。
// 開いた時・画面に戻った時・1分ごとに version.json を見る
async function latestVersion() {
  try { return await (await fetch('version.json', { cache: 'no-store' })).json(); } catch (e) { return null; }
}
let restarting = false;
function forceRestart(info, waited = 0) {
  const ver = info.version;
  if (restarting) return;
  // ガチャの演出・問題の答えのとちゅう・ログボの画面では、終わるまで待つ（最大2分）。記録はもう保存してある
  if (waited < 120000 && document.querySelector('.pfx, .quiz, .lb-screen, .photo-ui')) {
    clearTimeout(forceRestart.t);
    forceRestart.t = setTimeout(() => forceRestart(info, waited + 3000), 3000);
    return;
  }
  // 同じ版で何度も再起動をくり返さない（読みこみ直しても古いままのときの安全装置。3回まで）
  const key = 'studyroom.restart.' + ver;
  const n = +(sessionStorage.getItem(key) || 0);
  if (n >= 3) return;
  sessionStorage.setItem(key, n + 1);
  restarting = true;
  try { S.save(); } catch (e) { /* まだログイン前 */ }
  try { Sync.push?.(true); } catch (e) { /* なし */ }
  document.querySelectorAll('.pfx, .lb-screen').forEach(e => e.remove());
  const el = h(`
    <div class="update-ov">
      <div class="up-glow"></div>
      <h1 class="up-logo">ROOMIN</h1>
      <p class="up-ver">ver ${esc(APP_VERSION)} <span>→</span> <b>ver ${esc(ver)}</b></p>
      <div class="up-bar"><i></i></div>
      <p class="up-t">アップデートしています…</p>
      ${info.notes?.length ? `<ul class="up-notes">${info.notes.map(t => `<li>${icon('sparkle')}${esc(t)}</li>`).join('')}</ul>` : ''}
      <p class="up-s">記録は保存しました。すぐに再起動します</p>
    </div>`);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(async () => {
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs || []) await r.update(); } catch (e) { /* なし */ }
    el.querySelector('.up-t').textContent = '再起動します';
    setTimeout(() => location.reload(), 400);
  }, 2600);
}
async function watchVersion() {
  const v = await latestVersion();
  if (v?.version && v.version !== APP_VERSION) forceRestart(v);
}
setInterval(watchVersion, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) watchVersion(); });
addEventListener('focus', watchVersion);
watchVersion();
async function checkUpdateNotes() {
  try {
    const v = await (await fetch('version.json', { cache: 'no-store' })).json();
    // 手元のプログラムが古いまま（スマホが前の版を覚えている）なら、1回だけ読みこみ直す
    if (v.version !== APP_VERSION) return forceRestart(v);
    const seen = localStorage.getItem('studyroom.version');
    localStorage.setItem('studyroom.version', v.version);
    if (!seen || seen === v.version || !v.notes?.length) return;
    const el = sheet(`
      <div class="sh-head"><span class="sh-ic gold">${icon('sparkle')}</span><div><h3>新しくなりました</h3><p>バージョン ${esc(v.version)}</p></div></div>
      <ul class="news-list">${v.notes.map(n => `<li>${icon('check')}${esc(n)}</li>`).join('')}</ul>
      <button class="btn primary big ok">OK</button>`, 'news');
    el.querySelector('.ok').onclick = () => el.remove();
  } catch (e) { /* 読めなければ出さない */ }
}

// =========================== 一括ダウンロード ===========================
function showDownload() {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const mb = DL.totalMB();
  const el = h(`
    <div class="screen center">
      <div class="card dl">
        <div class="logo">${icon('download')}</div>
        <h2>家具のデータをまとめて保存</h2>
        <p>家具・壁・床などのデータ（約${mb}MB）を先にダウンロードしておくと、あとは待たずに遊べます。<br><b>Wi-Fi のときがおすすめです。</b></p>
        <div class="gauge big hide"><div class="fill" style="width:0%"></div><span>0%</span></div>
        <p class="dlnote"></p>
        <button class="btn primary big go">ダウンロードする</button>
        <button class="btn ghost later">あとで（使う分だけその場で読み込む）</button>
      </div>
    </div>`);
  app.append(el);
  const go = el.querySelector('.go'), later = el.querySelector('.later');
  const bar = el.querySelector('.gauge'), fill = bar.querySelector('.fill'), label = bar.querySelector('span');
  let job = null;
  later.onclick = () => { if (job) job.stop(); if (!DL.downloadState()) DL.setDownloadState('later'); enterHouse(); };
  go.onclick = async () => {
    go.classList.add('hide'); bar.classList.remove('hide');
    later.textContent = '中断する（続きはあとで）';
    job = DL.downloadAll((d, t, b, bt) => {
      const pct = Math.floor(b / bt * 100);
      fill.style.width = pct + '%';
      label.textContent = `${pct}%（${Math.round(b / 1e6)} / ${Math.round(bt / 1e6)}MB）`;
    });
    const r = await job.promise;
    if (r.stopped) return;
    el.querySelector('.dlnote').textContent = r.failed ? `${r.failed}個は保存できませんでした。遊ぶときにその場で読み込みます。` : '保存できました！';
    later.classList.add('hide');
    go.textContent = 'はじめる'; go.classList.remove('hide');
    go.onclick = () => enterHouse();
  };
}


// =========================== 解く：科目えらび ===========================
// =========================== はじめに：勉強かパズルか ===========================
// 1回だけ選ぶ。あとから自分では変えられない（管理者が見る・変える）
function askMode() {
  return new Promise((done) => {
    const el = sheet(`
      <div class="sh-head"><span class="sh-ic">${icon('home')}</span><div><h3>このアプリを、何のために使いますか？</h3><p>あてはまるほうを選んでください</p></div></div>
      <div class="mode-pick">
        <button data-m="study"><span class="mp-ic">${icon('pencil')}</span><b>勉強のため</b></button>
        <button data-m="puzzle"><span class="mp-ic">${icon('grid')}</span><b>パズルで遊ぶため</b></button>
      </div>`, 'mode-sheet');
    app.querySelector('.tabbar')?.classList.add('hide');
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const m = b.dataset.m;
      const pr = S.profile(); pr.side = m; pr.mode = m; pr.modeAt = Date.now(); S.save(); Sync.push?.();
      el.remove(); showHome();
      toast(m === 'puzzle' ? '右下の「パズル」から始めよう' : '右下の「解く」から始めよう', 3000);
      done();
    });
  });
}

// 勉強 ⇄ パズル を切りかえる（1.11.0 からだれでも。スタディサイドの人のパズルは、勉強した回数ぶんだけ）。部屋・家具・記録はそのまま
function setMode(m, quiet) {
  const pr = S.profile();
  if (pr.mode === m) return;
  pr.mode = m; pr.modeAt = Date.now(); S.save(); Sync.push?.();
  // 下のボタン（右下の「解く」⇄「パズル」）をすぐ描きなおす
  const tb = app.querySelector('.tabbar');
  if (tb) { const act = tb.querySelector('.sl.on')?.dataset.t || 'room'; const nt = tabbar(act); if (tb.classList.contains('hide')) nt.classList.add('hide'); tb.replaceWith(nt); }
  if (!quiet) toast(m === 'puzzle' ? 'パズルにしました。右下の「パズル」から' : '勉強にしました。右下の「解く」から', 2400);
}
const switchBtn = (to) => `<button class="link mode-switch" data-to="${to}">${icon(to === 'puzzle' ? 'grid' : 'pencil')}${to === 'puzzle' ? 'パズルに切りかえる' : '勉強に切りかえる'}</button>`;

// =========================== パズル ===========================
function showPuzzleHub() {
  if (!app.querySelector('.home')) showHome();
  const R = S.PUZZLE_REWARD.gauge;
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('grid')}</span><div><h3>どのパズルにする？</h3><p>★を選んでスタート。★が高いほど、ゲージが多くたまります</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    ${freePuzzle() ? '' : `<div class="pz-tix ${S.puzzleTickets() ? '' : 'empty'}">${icon('grid')}<span>パズルをあと <b>${S.puzzleTickets()}回</b> できます</span><small>あと${S.studyToNextPuzzle()}問 正解すると1回ふえます（1日の中で、ふえるたびに必要な数が多くなります）</small></div>`}
    <div class="pz-hub">${PUZZLES.map(z => { const ps = S.puzzleState(z.id), open = S.puzzleOpen(z.id); return `
      <div class="pz-pick">
        <div class="pz-pick-top"><span class="s-ic">${icon(z.icon)}</span>
          <span class="pz-pick-t"><b>${z.name}</b><small>${z.short}${ps.clears ? `・クリア ${ps.clears}回` : ''}</small></span></div>
        <div class="pz-stars">${[1, 2, 3, 4, 5].map(st => st <= open
          ? `<button class="pz-star ${st === Math.min(ps.last || 1, open) ? 'last' : ''} ${st <= ps.best ? 'clear' : ''}" data-p="${z.id}" data-s="${st}" aria-label="★${st}をはじめる"><b>★${st}</b><small>+${R[st - 1]}</small></button>`
          : `<span class="pz-star locked" aria-label="★${st}（★${st - 1}をクリアすると選べます）">${icon('lock')}<small>★${st}</small></span>`).join('')}</div>
      </div>`; }).join('')}</div>
    <p class="pz-hub-note">★をクリアすると、次の★が選べるようになります。前の★にはいつでももどれます</p>
    <p class="nx-sec ed-sec">終わりのないパズル<small>スコアを越えるたびにゲージ（1回で ★5 と同じまで）</small></p>
    <div class="pz-hub">${ENDLESS.map(z => { const es = S.endlessState(z.id); return `
      <div class="pz-pick ed-pick">
        <div class="pz-pick-top"><span class="s-ic">${icon(z.icon)}</span>
          <span class="pz-pick-t"><b>${z.name}</b><small>${z.short}</small></span></div>
        <div class="ed-row"><span class="ed-rec">${icon('trophy')}ベスト <b>${es.best || 0}</b>${S.endlessWeekBest(z.id) ? `<small>今週 ${S.endlessWeekBest(z.id)}</small>` : ''}</span>
          <button class="btn ghost sm ed-rk" data-e="${z.id}">ランキング</button><button class="btn primary sm ed-go" data-e="${z.id}">あそぶ</button></div>
      </div>`; }).join('')}</div>
    <div class="sheet-foot">${switchBtn('study')}</div>`, 'subj-sheet puzzle-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelector('.mode-switch')?.addEventListener('click', () => { setMode('study'); el.remove(); showHome(); chooseSubject(); });
  el.querySelectorAll('.pz-star[data-p]').forEach(b => b.onclick = () => { el.remove(); playPuzzle(b.dataset.p, +b.dataset.s); });
  el.querySelectorAll('.ed-go').forEach(b => b.onclick = () => { el.remove(); playEndless(b.dataset.e); });
  el.querySelectorAll('.ed-rk').forEach(b => b.onclick = () => { el.remove(); showEndlessRanking(b.dataset.e); });
}
function playPuzzle(id, star) {
  if (!freePuzzle()) {
    if (!S.usePuzzleTicket()) { toast(`あと${S.studyToNextPuzzle()}問 正解すると、パズルが1回できます`, 3200); return showHome(); }
    S.save();
  }
  const z = puzzleById(id), ps = S.puzzleState(id);
  star = Math.max(1, Math.min(star || ps.last || 1, S.puzzleOpen(id)));
  ps.last = star; S.save();
  const lives = livesOf(star);
  BGM.duck(true);
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`
    <div class="screen puzzle-screen">
      <header class="bar">
        <button class="icon back" aria-label="部屋にもどる">${icon('x')}</button>
        <h2>${z.name}<small>★${star}</small></h2>
        ${id === 'hikkoshi' ? '' : `<span class="pz-life" aria-label="まちがえられる回数">${'<i class="on"></i>'.repeat(lives)}</span>`}
        <button class="pz-ibtn" aria-label="遊び方">i</button>
      </header>
      <p class="pz-moves" hidden></p>
      <div class="pz-host"></div>
    </div>`);
  app.append(el);
  el.querySelector('.back').onclick = () => { document.querySelector('.ph-sheet')?.remove(); S.save(); showHome(); };
  // 右上の「i」：遊び方のカード。はじめてそのパズルを開いた時は自動で出す
  const ib = el.querySelector('.pz-ibtn');
  const help = () => openPuzzleHelp(id, z.name, () => {
    const pr = S.profile(); (pr.puzzleHelp || (pr.puzzleHelp = {}))[id] = true; S.save();
    if (lives < 3 && id !== 'hikkoshi') toast('★5 は、まちがいは2回までです', 2600);
  });
  ib.onclick = help;
  if (!S.profile().puzzleHelp?.[id]) setTimeout(() => { if (el.isConnected) help(); }, 400);
  else if (lives < 3 && id !== 'hikkoshi') toast('★5 は、まちがいは2回までです', 2600);
  const life = el.querySelector('.pz-life'), mv = el.querySelector('.pz-moves');
  const t0 = Date.now();
  mountPuzzle(id, star, el.querySelector('.pz-host'), {
    onChange: (n) => { life.innerHTML = '<i class="on"></i>'.repeat(n) + '<i></i>'.repeat(lives - n); vibrate(60); },
    onMoves: (n, max, min) => { mv.hidden = false; mv.innerHTML = `手数 <b>${n}</b><small>最短 ${min}手</small>`; },
    onWin: (r) => setTimeout(() => puzzleResult(id, star, true, r, (Date.now() - t0) / 1000), r.picture ? 900 : 350),
    onLose: (why) => setTimeout(() => puzzleResult(id, star, false, { why }, 0), 500),
  });
}
function puzzleResult(id, star, won, r, secs) {
  const z = puzzleById(id);
  let pts = 0, xp = null;
  if (won) {
    const hs = HS();
    const rate = r.min ? slideRate(r.moves, r.min) : 1; // おひっこしは手数で決まる
    pts = S.puzzleGauge(star, r.mistakes || 0, rate);
    if (S.solvedToday() < S.BONUS_PER_DAY) pts = Math.round(pts * 1.5); // 今日の最初のうちは1.5倍（勉強と同じ）
    hs.gauge += pts;
    S.addPoints(pts); // ランキングのポイント
    xp = S.addPuzzleClear(id, star, r.mistakes || 0, rate);
    evToast(EV.addPoints(star));
    const first = S.markPlayedToday();
    if (first) setTimeout(() => toast(`連続 ${S.currentStreak()}日目！`), 600);
    S.save(); Sync.push?.();
    vibrate([20, 30, 20]);
  } else vibrate([60, 40, 60]);
  const mm = Math.floor(secs / 60), ss = Math.round(secs % 60);
  const n = buyCount();
  const up = won && xp.unlocked;
  const el = sheet(`
    <div class="res ${won ? 'ok' : 'ng'} pz-res">
      <div class="ttl">${won ? 'クリア！' : 'しっぱい…'}</div>
      ${won ? `<p class="pz-sub">${r.picture ? `あらわれたのは「${esc(r.picture)}」！ ・ ` : ''}${r.moves ? `${r.moves}手${r.best ? '（最短！）' : `（最短 ${r.min}手）`} ・ ` : ''}${mm ? mm + '分' : ''}${ss}秒${r.min ? '' : `・まちがい ${r.mistakes || 0}回`}</p>
        <div class="pts">+${pts}<small>ゲージ（★${star}）</small></div>
        <div class="xpgain">${icon('level')}+${xp.gained} XP${xp.rankUp ? `<b>Lv${xp.rank}にアップ！</b>` : ''}</div>
        ${n ? `<p class="gold-t">${icon('gift')}家具が${n > 1 ? ` ${n}つ` : ''}買えます！</p>` : ''}
        ${up ? `<p class="pz-up">${icon('sparkle')}★${up} が選べるようになりました（${levelInfo(id, up)}・+${S.PUZZLE_REWARD.gauge[up - 1]}）</p>` : ''}`
      : `<p class="pz-sub">${r.why === 'moves' ? '手数の上限になりました。' : `まちがいが${livesOf(star)}回になりました。`}もう一度ちょうせんするか、★を下げてみよう</p>`}
    </div>
    <div class="pz-res-btns">
      ${up ? `<button class="btn primary big go-up">★${up} にちょうせん</button>` : ''}
      <button class="btn ${up ? 'ghost' : 'primary big'} next">${won ? `★${star} でもう1問` : 'もう一度'}</button>
      ${!won && star > 1 ? `<button class="btn ghost down">★${star - 1} にする</button>` : ''}
      <button class="btn ghost home">部屋にもどる</button>
    </div>`, 'pz-res-sheet');
  el.querySelector('.go-up')?.addEventListener('click', () => playPuzzle(id, up));
  el.querySelector('.next').onclick = () => playPuzzle(id, star);
  el.querySelector('.down')?.addEventListener('click', () => playPuzzle(id, star - 1));
  el.querySelector('.home').onclick = () => showHome();
}

// ---------------- 終わりのないパズル（1.15.0：おしいれパッキング・インテリア・マージ） ----------------
// スコアが区切りを越えるたびにゲージ（1回の上限は ★5 のパズル1回分）。終わったら自分のベストとみんなのランキング
function playEndless(id) {
  if (!freePuzzle()) {
    if (!S.usePuzzleTicket()) { toast(`あと${S.studyToNextPuzzle()}問 正解すると、パズルが1回できます`, 3200); return showHome(); }
    S.save();
  }
  const z = endlessById(id), es = S.endlessState(id);
  BGM.duck(true);
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`
    <div class="screen puzzle-screen endless-screen">
      <header class="bar">
        <button class="icon back" aria-label="部屋にもどる">${icon('x')}</button>
        <h2>${z.name}</h2>
        <button class="pz-ibtn" aria-label="遊び方">i</button>
      </header>
      <div class="ed-score"><div><small>スコア</small><b class="ed-now">0</b></div><div><small>ベスト</small><b class="ed-best">${es.best || 0}</b></div><div class="ed-g"><small>ゲージ</small><b class="ed-got">+0</b></div></div>
      <div class="ed-next"><span class="ed-bar"><i></i></span><small class="ed-nt"></small></div>
      <div class="pz-host"></div>
    </div>`);
  app.append(el);
  const ib = el.querySelector('.pz-ibtn');
  const help = () => openPuzzleHelp(id, z.name, () => { const pr = S.profile(); (pr.puzzleHelp || (pr.puzzleHelp = {}))[id] = true; S.save(); });
  ib.onclick = help;
  if (!S.profile().puzzleHelp?.[id]) setTimeout(() => { if (el.isConnected) help(); }, 400);
  const host = el.querySelector('.pz-host'), nowEl = el.querySelector('.ed-now'), gotEl = el.querySelector('.ed-got'), bar = el.querySelector('.ed-bar i'), nt = el.querySelector('.ed-nt');
  const t0 = Date.now(); let passed = 0, got = 0, ended = false;
  const ms = MILESTONES[id];
  const showNext = (score) => {
    const nx = nextMilestone(id, score), prev = ms[passed - 1] || 0;
    if (!nx) { bar.style.width = '100%'; nt.textContent = `ゲージはこの回の上限（+${got}）まで、もらいました`; return; }
    bar.style.width = Math.min(100, (score - prev) / (nx - prev) * 100) + '%';
    nt.textContent = `あと ${nx - score} 点でゲージ +${MILESTONE_GAUGE}`;
  };
  const pop = (txt) => { const p = h(`<div class="ed-pop">${txt}</div>`); el.appendChild(p); setTimeout(() => p.remove(), 1300); };
  const finish = (r) => {
    if (ended) return; ended = true;
    setTimeout(() => endlessResult(id, r, got, (Date.now() - t0) / 1000), r.quit ? 0 : 200);
  };
  el.querySelector('.back').onclick = () => {
    document.querySelector('.ph-sheet')?.remove();
    if (!ended && (host._state?.().moves || 0) > 0) { if (!confirm('ここで終わりにしますか？（ここまでのスコアは記録されます）')) return; host._end?.(); return; }
    ended = true; S.save(); showHome();
  };
  mountEndless(id, host, {
    onScore: (score) => {
      nowEl.textContent = score;
      if (score > (es.best || 0)) { const b = el.querySelector('.ed-best'); b.textContent = score; if (es.best) b.classList.add('new'); }
      const n = milestonesPassed(id, score);
      while (passed < n) {
        passed++;
        const { pts } = S.endlessGauge(id, MILESTONE_GAUGE);
        HS().gauge += pts; S.addPoints(pts); got += pts;
        gotEl.textContent = '+' + got; pop(`ゲージ +${pts}`); vibrate(20);
        S.save();
      }
      showNext(score);
    },
    onLines: (n, combo) => { if (n >= 2 || combo >= 2) pop(n >= 2 ? `${n}列 いっぺんに！` : `れんぞく ${combo}`); },
    onNew: (name) => pop(`「${esc(name)}」ができた！`),
    onEnd: finish,
  });
}
function endlessResult(id, r, got, secs) {
  const z = endlessById(id);
  const res = S.addEndlessPlay(id, { score: r.score, maxLv: r.maxLv || 0, gauge: got });
  if (got > 0) { const first = S.markPlayedToday(); if (first) setTimeout(() => toast(`連続 ${S.currentStreak()}日目！`), 600); }
  S.save(); Sync.push?.();
  // みんなのランキングに送る（サーバーでスコアの上限を確かめる。送れなくても遊んだ記録は手元に残る）
  if (r.score > 0) rpc('sr_endless_submit', { p_token: Auth.currentUser()?.token, p_game: id, p_score: r.score, p_moves: r.moves || 0, p_secs: Math.round(secs) }).catch(() => {});
  vibrate([20, 30, 20]);
  const n = buyCount();
  const el = sheet(`
    <div class="res ok pz-res">
      <div class="ttl">${res.newBest && r.score > 0 ? 'ベスト更新！' : 'おつかれさま！'}</div>
      <p class="pz-sub">${z.name}${r.maxLv ? ` ・ いちばん良い家具「${esc(MERGE_ITEMS[Math.min(r.maxLv, MERGE_ITEMS.length) - 1].n)}」` : ''}${r.lines ? ` ・ ${r.lines}列 片づけた` : ''}</p>
      <div class="ed-res"><div><small>スコア</small><b>${r.score}</b></div><div><small>ベスト</small><b>${res.best}</b></div></div>
      <div class="pts">+${got}<small>ゲージ</small></div>
      ${res.gained ? `<div class="xpgain">${icon('level')}+${res.gained} XP${res.rankUp ? `<b>Lv${res.rank}にアップ！</b>` : ''}</div>` : '<p class="pz-sub">はじめの区切りを越えると、ゲージがもらえます</p>'}
      ${n ? `<p class="gold-t">${icon('gift')}家具が${n > 1 ? ` ${n}つ` : ''}買えます！</p>` : ''}
    </div>
    <div class="pz-res-btns">
      <button class="btn primary big again">もう一度</button>
      <button class="btn ghost rank">${icon('trophy')}ランキングを見る</button>
      <button class="btn ghost home">部屋にもどる</button>
    </div>`, 'pz-res-sheet');
  el.querySelector('.again').onclick = () => playEndless(id);
  el.querySelector('.rank').onclick = () => showEndlessRanking(id, () => endlessBack(id));
  el.querySelector('.home').onclick = () => showHome();
}
const endlessBack = () => { showHome(); showPuzzleHub(); };
async function showEndlessRanking(id, back = endlessBack, scope = 'week') {
  const z = endlessById(id), es = S.endlessState(id);
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('trophy')}</span><div><h3>${z.name} のランキング</h3><p>${scope === 'week' ? '今週（月曜の朝6時にリセット）' : 'これまでの最高スコア'}</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <div class="seg bagtabs ed-tabs"><button data-s="week" class="${scope === 'week' ? 'on' : ''}">今週</button><button data-s="all" class="${scope === 'all' ? 'on' : ''}">歴代</button></div>
    <div class="rk-me ed-me"><div class="rk-mecard"><span class="rk-pos">—</span>${avatarHTML(S.profile(), 'avatar rk-av')}<div><b>あなた<span class="rk-pt">${scope === 'week' ? S.endlessWeekBest(id) : es.best || 0}</span></b><small>${scope === 'week' ? '今週のベスト' : 'これまでのベスト'}</small></div></div></div>
    <div class="rk-list"><p class="empty">読み込み中…</p></div>`, 'subj-sheet ed-rank-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.close').onclick = () => { el.remove(); back(); };
  el.querySelectorAll('.ed-tabs button').forEach(b => b.onclick = () => showEndlessRanking(id, back, b.dataset.s));
  let r;
  try { r = await rpc('sr_endless_ranking', { p_token: Auth.currentUser()?.token, p_game: id, p_scope: scope }); }
  catch (e) { if (el.isConnected) el.querySelector('.rk-list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  if (!el.isConnected) return;
  if (r?.me) el.querySelector('.ed-me .rk-pos').innerHTML = `${r.me.pos}<small>位</small>`;
  const medal = (p) => p <= 3 ? `<span class="medal m${p}">${p}</span>` : `<span class="rk-n">${p}</span>`;
  const top = (r?.top || []).filter(x => !blockedNames.has(x.username));
  el.querySelector('.rk-list').innerHTML = top.length ? top.map(x => `
    <div class="rk-row ${x.me ? 'me' : ''}">${medal(x.pos)}${avatarHTML(x, 'avatar rk-av')}<b>${esc(x.username)}${x.title && titleById(x.title) ? `<small class="rk-title">${esc(titleById(x.title).name)}</small>` : ''}</b><span><span class="rk-pts">${x.score}</span></span></div>`).join('')
    : `<p class="empty">${scope === 'week' ? '今週はまだだれも記録がありません。いちばん乗りしよう！' : 'まだだれも記録がありません'}</p>`;
}

async function chooseSubject() {
  if (!app.querySelector('.home')) showHome();
  const loading = SUBJECTS.some(x => x.bank && !bankDone[x.id]);
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('pencil')}</span><div><h3>どの教科を解く？</h3><p>どの教科を解いても、同じ家が育ちます</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    ${UINEXT ? '<div class="nx-continue"></div><p class="nx-sec">ほかの教科</p>' : ''}
    <div class="subjgrid"></div>
    ${UINEXT ? '' : `<div class="sheet-foot">${switchBtn('puzzle')}</div>`}`, 'subj-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelector('.mode-switch')?.addEventListener('click', () => { setMode('puzzle'); el.remove(); showHome(); showPuzzleHub(); });
  const draw = () => {
    if (UINEXT) drawContinue(el);
    // おすすめ（倍率1.2以上）は、多すぎると目立たないので上から2つまで（倍率が高い→やった数が少ない順）
    const ms = S.subjectMults(multSids());
    const recIds = SUBJECTS.filter(s0 => !s0.pack && probs(s0.id).length && (ms[s0.id]?.mult || 1) >= 1.2)
      .sort((a, b) => ms[b.id].mult - ms[a.id].mult || ms[a.id].n - ms[b.id].n).slice(0, 2).map(s0 => s0.id);
    el.querySelector('.subjgrid').innerHTML = SUBJECTS.map(s0 => {
      const ready = probs(s0.id).length > 0;
      const rec = recIds.includes(s0.id) ? `<i class="subj-rec">おすすめ ×${ms[s0.id].mult}</i>` : '';
      const st = ready ? S.subject(s0.id) : null;
      const resume = st && st.session && st.session.idx < st.session.set.length;
      const stats = st ? S.stats(st, probs(s0.id)) : null;
      const meta = !ready ? (s0.bank && !bankDone[s0.id] ? '読みこみ中' : '準備中') : resume ? '続きから' : stats.due ? `復習 ${stats.due}問` : S.wrongList(st, probs(s0.id)).length ? `まちがい ${S.wrongList(st, probs(s0.id)).length}問` : `${probs(s0.id).length}問`;
      return `<button class="subj ${ready ? '' : 'soon'} ${rec ? 'rec' : ''}" data-s="${s0.id}" ${ready ? '' : 'disabled'}>${rec}
        <span class="s-ic">${icon(SUBJECT_ICON[s0.id] || 'book')}</span><b>${esc(s0.name)}</b><small>${meta}</small></button>`;
    }).join('');
    el.querySelectorAll('.subj:not(.soon)').forEach(b => b.onclick = () => { subjectId = b.dataset.s; chooseScope(el); });
  };
  draw();
  if (loading) { await loadAllBanks(); if (el.isConnected && el.querySelector('.subjgrid')) draw(); }
}
// 新しいデザイン：「解く」を押したら、いちばん上に「前回のつづき」（1タップで始まる）と「まちがえた問題」（1.12.0）
function drawContinue(el) {
  const box = el.querySelector('.nx-continue'); if (!box) return;
  const ls = S.profile().lastStudy, subj = ls && SUBJECTS.find(x => x.id === ls.sid);
  const ready = subj && probs(subj.id).length > 0;
  const st = ready ? S.subject(subj.id) : null;
  const resume = st && st.session && st.session.idx < st.session.set.length;
  const sc = ls?.scope, list = ready ? probs(subj.id).filter(p => !sc || sc.wrong || ((!sc.genre || p.genre === sc.genre) && (!sc.unit || p.unit === sc.unit))) : [];
  const seen = st ? list.filter(p => st.srs[p.id]?.seen).length : 0;
  const wrongs = SUBJECTS.filter(x => probs(x.id).length).map(x => ({ x, n: S.wrongList(S.subject(x.id), probs(x.id)).length })).filter(o => o.n).sort((a, b) => b.n - a.n);
  const wTotal = wrongs.reduce((n, o) => n + o.n, 0);
  box.innerHTML = (ready ? `<button class="nx-cta">
      <span class="nx-cta-t"><small>${resume ? 'とちゅうから' : '前回のつづき'}</small><b>${esc(subj.name)}${ls.scope?.unit || ls.scope?.genre ? ' ・ ' + esc(ls.scope.unit || ls.scope.genre) : ''}</b><span>${seen} / ${list.length}問 解いた</span></span>
      <span class="nx-cta-go">${icon('pencil')}はじめる</span></button>` : '')
    + (wTotal ? `<button class="nx-wrong"><span class="sc-wic">${icon('refresh')}</span><span class="sc-t"><b>まちがえた問題を解き直す</b><small>${wrongs.slice(0, 3).map(o => `${esc(o.x.name)} ${o.n}`).join('・')}</small></span><span class="sc-wn">${wTotal}問</span>${icon('chevronRight')}</button>` : '');
  box.querySelector('.nx-cta')?.addEventListener('click', () => { subjectId = subj.id; const s2 = S.subject(subj.id); if (JSON.stringify(s2.scope || null) !== JSON.stringify(ls.scope)) { s2.scope = ls.scope; s2.session = null; S.save(); } el.remove(); startSet(); });
  box.querySelector('.nx-wrong')?.addEventListener('click', () => { const top = wrongs[0].x; subjectId = top.id; const s2 = S.subject(top.id); s2.scope = { wrong: true }; s2.session = null; S.save(); el.remove(); startSet(); });
}
// 教科 → ジャンル → 単元 をえらぶ（同じ下からの画面の中で切りかえる）
function chooseScope(el, genre = null) {
  const sid = subjectId, st = S.subject(sid), all = probs(sid), subj = SUBJECTS.find(x => x.id === sid);
  const resume = st.session && st.session.idx < st.session.set.length;
  const go = (sc) => {
    const same = JSON.stringify(st.scope || null) === JSON.stringify(sc);
    if (!same) { st.scope = sc; st.session = null; S.save(); }
    el.remove(); startSet();
  };
  const genres = [...new Set(all.map(p => p.genre).filter(Boolean))];
  const units = (g) => [...new Set(all.filter(p => (g ? p.genre === g : !p.genre || genres.length === 0)).map(p => p.unit).filter(Boolean))];
  const wrongs = S.wrongList(st, all);
  // ジャンルも単元も1つしかない教科は、そのまま始める（まちがえた問題がある時は、えらべるように出す）
  if (!genre && !wrongs.length && genres.length <= 1 && units(genres[0] || null).length <= 1) return go(null);
  if (!genre && genres.length === 1) genre = genres[0];
  const done = (list) => { const n = list.filter(p => st.srs[p.id]?.seen).length; return `${n} / ${list.length}`; };
  const bar = (list) => `<span class="sc-bar"><i style="width:${list.length ? list.filter(p => st.srs[p.id]?.seen).length / list.length * 100 : 0}%"></i></span>`;
  const row = (attrs, name, list, sub) => `<button class="sc-row" ${attrs}><span class="sc-t"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${bar(list)}</span><span class="sc-n">${done(list)}</span>${icon('chevronRight')}</button>`;
  let body;
  if (!genre && genres.length > 1) {
    body = row('data-all="1"', 'すべての範囲から', all, 'いろいろなジャンルからまぜて出ます')
      + genres.map(g => { const list = all.filter(p => p.genre === g); return row(`data-g="${esc(g)}"`, g, list, `${units(g).length}単元`); }).join('');
  } else {
    const g = genre || null, us = genre ? units(genre) : [...new Set(all.map(p => p.unit).filter(Boolean))];
    const gl = g ? all.filter(p => p.genre === g) : all;
    body = row(`data-gall="1"`, g ? `${g} をぜんぶ` : 'すべての単元から', gl, '単元をまぜて出ます')
      + us.map(u => row(`data-u="${esc(u)}"`, u, gl.filter(p => p.unit === u))).join('');
  }
  el.innerHTML = `<div class="grab"></div>
    <div class="sh-head"><button class="icon sc-back" aria-label="もどる">${icon('back')}</button><div><h3>${esc(genre || subj.name)}</h3><p>${genre ? `${esc(subj.name)}・単元をえらぶ` : 'ジャンルをえらぶ'}</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    ${resume ? `<button class="btn primary big sc-resume">${icon('refresh')}続きから<small>（${esc(scopeLabel(st.scope))}）</small></button>` : ''}
    ${!genre && wrongs.length ? `<button class="sc-wrong"><span class="sc-wic">${icon('refresh')}</span><span class="sc-t"><b>まちがえた問題を解き直す</b><small>3回続けて正解すると、リストから外れます</small></span><span class="sc-wn">${wrongs.length}問</span>${icon('chevronRight')}</button>` : ''}
    <div class="sc-list">${body}</div>`;
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelector('.sc-back').onclick = () => { if (genre && genres.length > 1) chooseScope(el); else { el.remove(); chooseSubject(); } };
  el.querySelector('.sc-resume')?.addEventListener('click', () => { el.remove(); startSet(); });
  el.querySelector('[data-all]')?.addEventListener('click', () => go(null));
  el.querySelector('.sc-wrong')?.addEventListener('click', () => go({ wrong: true }));
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => chooseScope(el, b.dataset.g));
  el.querySelector('[data-gall]')?.addEventListener('click', () => go(genre ? { genre } : null));
  el.querySelectorAll('[data-u]').forEach(b => b.onclick = () => go({ genre: genre || null, unit: b.dataset.u }));
}

// =========================== メニュー ===========================
let friendBadge = 0;
let newsBadge = 0;
function screenWithTabs(cls, title, active, body) {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`<div class="screen ${cls} with-tabs"><header class="bar">${title}</header>${body}</div>`);
  app.append(el, tabbar(active));
  hydrateThumbs(el);
  return el;
}
// 新しいデザイン：メニューは右上の丸ボタン。押すと、その下に項目が縦にのびる（1.12.1）
const NX_MENU = () => [
  ['skins', 'palette', '着せ替え', () => showSkins()],
  ['report', 'calendar', '勉強レポート', () => showReport()],
  ['records', 'chart', '記録', () => showRecords()],
  ['news', 'bell', 'お知らせ', () => showNews(), newsBadge],
  ['feedback', 'chat', '要望・バグ報告', () => showFeedback()],
  ['photo', 'camera', '部屋の写真', () => photoMode()],
  ['settings', 'gear', '設定', () => showSettings()],
  ...(isAdmin() ? [['beta', BETA ? 'home' : 'flask', BETA ? 'いつもの版へ' : 'テスト版', () => { location.href = BETA ? '../study-room/' : '../study-room-beta/'; }], ['admin', 'shield', '管理者', () => showAdmin()]] : []),
];
function toggleNxMenu(open) {
  const btn = app.querySelector('.nx-menubtn'); if (!btn) return;
  const cur = app.querySelector('.nx-menu');
  if (open === undefined) open = !cur;
  if (!open) { if (cur) { cur.classList.add('out'); setTimeout(() => cur.remove(), 160); } btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); btn.innerHTML = icon('menu') + (newsBadge ? '<i class="gb-n dot-only"></i>' : ''); return; }
  if (cur) return;
  btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true'); btn.innerHTML = icon('x');
  const items = NX_MENU();
  const m = h(`<nav class="nx-menu" aria-label="メニュー">${items.map(([k, ic, n, , badge], i) => `<button data-k="${k}" style="--i:${i}"><span class="nm-t">${n}</span><span class="nm-ic">${icon(ic)}${badge ? `<i class="gb-n">${badge}</i>` : ''}</span></button>`).join('')}</nav>`);
  btn.closest('.side-tools').append(m);
  m.querySelectorAll('button').forEach(b => b.onclick = () => { const it = items.find(x => x[0] === b.dataset.k); toggleNxMenu(false); it && it[3](); });
  setTimeout(() => {
    const away = (e) => { if (!m.isConnected) return document.removeEventListener('pointerdown', away, true); if (!m.contains(e.target) && !e.target.closest('.nx-menubtn')) { toggleNxMenu(false); document.removeEventListener('pointerdown', away, true); } };
    document.addEventListener('pointerdown', away, true);
  }, 0);
}
function showMenu(full = false) {
  if (UINEXT && full !== true) { showHome(); setTimeout(() => toggleNxMenu(true), 60); return; }
  const rk = rankNow();
  const pf0 = S.profile(), myTitle = titleById(pf0.title);
  const el = screenWithTabs('menu', `<h2>メニュー</h2><span class="sync"></span>`, 'menu', `
    <button class="profile-card pc-tap" aria-label="プロフィールを見る">
      ${avatarHTML(pf0, 'avatar pc-av')}
      <div class="pc-main"><b>${esc(user.name)}<span class="pc-lvs">Lv${rk.rank}</span></b>${myTitle ? `<span class="title-chip">${esc(myTitle.name)}</span>` : ''}
        <div class="xpbar big"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></div>
        <small>次のLvまで ${rk.need - rk.into} XP ・ 置ける家具 ${S.capacity()}個</small></div>
      ${icon('chevronRight')}
    </button>
    ${UINEXT ? `<div class="nx-menu-quick">
      <button class="nx-photo">${icon('camera')}部屋の写真をとる</button></div>` : ''}
    <nav class="menu-list">
      <button data-m="skins">${icon('palette')}<span>着せ替え<small>画面の見た目を変える（ガチャで集める）</small></span>${icon('chevronRight')}</button>
      <button data-m="report">${icon('calendar')}<span>勉強レポート<small>週・月ごとのまとめ。画像で保存できる</small></span>${icon('chevronRight')}</button>
      <button data-m="records">${icon('chart')}<span>記録<small>分野ごとの成績・連続日数</small></span>${icon('chevronRight')}</button>
      <button data-m="feedback">${icon('chat')}<span>要望・バグ報告<small>管理者に送る</small></span>${icon('chevronRight')}</button>
      <button data-m="news">${icon('bell')}<span>お知らせ<small>アップデートや運営からのお知らせ</small></span>${newsBadge ? `<i class="badge">${newsBadge}</i>` : ''}${icon('chevronRight')}</button>
      <button data-m="settings">${icon('gear')}<span>設定<small>画質・データ・ログアウト</small></span>${icon('chevronRight')}</button>
      ${isAdmin() ? `<button data-m="beta">${icon(BETA ? 'home' : 'flask')}<span>${BETA ? 'いつもの版にもどる' : 'テスト版を開く'}<small>${BETA ? 'みんなが使っている版' : '次に出す版を、先に管理者だけでためす'}</small></span>${icon('chevronRight')}</button>` : ''}
      ${isAdmin() ? `<button data-m="admin">${icon('shield')}<span>管理者<small>みんなの記録と部屋</small></span>${icon('chevronRight')}</button>` : ''}
    </nav>`);
  el.querySelector('.pc-tap').onclick = () => showProfile();
  el.querySelector('.nx-photo')?.addEventListener('click', () => { showHome(); setTimeout(photoMode, 300); });
  el.querySelectorAll('.nx-mode [data-mode]').forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; setMode(b.dataset.mode); vibrate(12); showMenu(); });
  el.querySelectorAll('.menu-list button').forEach(b => b.onclick = () => ({ skins: () => showSkins(), records: showRecords, report: () => showReport(), feedback: () => showFeedback(), bag: () => showBag(), news: showNews, ranking: showRanking, friends: showFriends, settings: showSettings, admin: showAdmin, beta: () => { location.href = BETA ? '../study-room/' : '../study-room-beta/'; } })[b.dataset.m]());
  paintSync();
}

// =========================== プロフィール ===========================
// v を渡すと、ほかの人のプロフィール（sr_profile の返り値）から作る
function profileCtx(v = null) {
  if (v) {
    const pf = v.profile || {}, col = new Set(v.collected || []);
    return { solved: pf.solved || 0, acc: pf.solved ? (pf.correct || 0) / pf.solved : 0, streak: S.streakOf(v.streak), rank: S.rankInfo(pf.xp || 0).rank,
      study: studyParams(sid => ({ units: v.units?.[sid] || {} })), puzzle: puzzleParams(id => (pf.puzzle || {})[id] || {}, id => (pf.endless || {})[id] || {}),
      pzClears: pf.puzzleClears || 0, collected: col.size, star5: G.GACHA_ITEMS.filter(i => i.rarity === 5 && col.has(i.id)).length, admin: !!v.admin };
  }
  const pf = S.profile(), hs = HS();
  const study = studyParams(sid => S.subject(sid));
  const puzzle = puzzleParams(id => S.puzzleState(id), id => S.endlessState(id));
  const collected = Object.keys(hs.collected || {}).length;
  const star5 = G.GACHA_ITEMS.filter(i => i.rarity === 5 && hs.collected?.[i.id]).length;
  return { solved: pf.solved || 0, acc: pf.solved ? (pf.correct || 0) / pf.solved : 0, streak: S.currentStreak(), rank: rankNow().rank,
    study, puzzle, pzClears: pf.puzzleClears || 0, collected, star5, admin: isAdmin() };
}
// 新しく手に入れた称号を知らせる（はじめては、まとめて1回だけ）
function checkNewTitles() {
  const pf = S.profile(), got = earnedTitles(profileCtx()).map(t => t.id);
  const first = !pf.titlesSeen;
  const seen = new Set(pf.titlesSeen || []);
  const fresh = got.filter(id => !seen.has(id));
  if (!fresh.length) return;
  pf.titlesSeen = [...seen, ...fresh]; S.save();
  setTimeout(() => toast(first ? `称号が ${fresh.length}つ 手に入っています。プロフィールで選べます` : `称号「${titleById(fresh[0]).name}」を手に入れました${fresh.length > 1 ? ` ほか${fresh.length - 1}つ` : ''}`, 3200), 900);
}
// view：ほかの人のプロフィール（なければ自分）。back：もどる先
function showProfile(view = null, back = null) {
  const mine = !view;
  const pf = mine ? S.profile() : (view.profile || {}), c = profileCtx(view), rk = mine ? rankNow() : S.rankInfo(pf.xp || 0);
  const earned = new Set(earnedTitles(c).map(t => t.id));
  const tt = titleById(pf.title), puzzleMain = mine ? isPuzzle() : pf.mode === 'puzzle';
  const name = mine ? user.name : view.username;
  const accPct = Math.round(c.acc * 100);
  const studySec = `<section class="pf-sec"><h3 class="sec">${icon('pencil')}勉強のパラメータ</h3>
      <div class="pf-radar">${radarSVG(UINEXT ? c.study.map(a => a.solved < 3 ? { ...a, rank: 'まだ', value: 0, hideValue: true } : a) : c.study, { color: '#f2b84b' })}</div>
      <div class="pf-list">${c.study.map(a => UINEXT && a.solved < 3
        ? `<div class="pf-row nx-empty"><b>${a.label}</b><span class="pf-rank r-none">—</span><span class="pf-bar"><i style="width:${a.solved / 3 * 100}%"></i></span><small>あと${3 - a.solved}問で出ます</small></div>`
        : `<div class="pf-row"><b>${a.label}</b><span class="pf-rank r-${a.rank}">${a.rank}</span><span class="pf-bar"><i style="width:${a.value}%"></i></span><small>${a.solved}問・${a.solved ? Math.round(a.acc * 100) : 0}%</small></div>`).join('')}</div>
      <p class="pf-note">解いた数が多いほど、正解率が高いほど上がります</p></section>`;
  const puzzleSec = `<section class="pf-sec"><h3 class="sec">${icon('grid')}パズルのパラメータ</h3>
      <div class="pf-radar">${radarSVG(c.puzzle, { color: '#6cbf8a' })}</div>
      <div class="pf-list">${c.puzzle.map(a => `<div class="pf-row"><b>${a.label}<small>${a.sub}</small></b><span class="pf-rank r-${a.rank}">${a.rank}</span><span class="pf-bar g"><i style="width:${a.value}%"></i></span><small>${a.endless ? `ベスト ${a.score}` : a.best ? `★${a.best}` : '—'}・${a.clears}回</small></div>`).join('')}</div>
      <p class="pf-note">クリアした★が高いほど、回数とノーミスが多いほど上がります</p></section>`;
  const list = TITLES.filter(t => !t.secret || earned.has(t.id));
  const el = screenWithTabs('profile', `<button class="icon back">${icon('back')}</button><h2>${mine ? 'プロフィール' : `${esc(name)}さん`}</h2><span></span>`, mine ? 'menu' : 'social', `
    <section class="pf-head">
      ${mine ? `<button class="pf-avbtn" aria-label="アイコンを変える">${avatarHTML(pf, 'avatar pf-av')}<span class="pf-edit">${icon('brush')}</span></button>` : avatarHTML(pf, 'avatar pf-av')}
      <div class="pf-who"><b>${esc(name)}</b>
        ${mine ? `<button class="title-chip big pf-tbtn">${tt ? esc(tt.name) : '称号をえらぶ'}${icon('chevronRight')}</button>` : tt ? `<span class="title-chip big">${esc(tt.name)}</span>` : ''}
        <small>Lv${rk.rank} ・ ${puzzleMain ? 'パズル' : '勉強'}で部屋づくり</small></div>
    </section>
    ${UINEXT && mine ? nextTitleCard(c, earned) : ''}
    <div class="stats4">
      <div>${icon('pencil')}<b>${c.solved}</b><span>解いた数</span></div>
      <div>${icon('check')}<b>${accPct}%</b><span>正解率</span></div>
      <div>${icon('grid')}<b>${c.pzClears}</b><span>パズル</span></div>
      <div>${icon('flame')}<b>${c.streak}</b><span>連続日数</span></div>
    </div>
    ${puzzleMain ? puzzleSec + studySec : studySec + puzzleSec}
    <section class="pf-sec"><h3 class="sec">${icon('trophy')}称号<small>${earned.size} / ${list.length}</small></h3>
      <div class="pf-titles">${list.map(t => `<button class="pf-t ${earned.has(t.id) ? 'got' : ''} ${pf.title === t.id ? 'on' : ''}" data-t="${t.id}" ${earned.has(t.id) && mine ? '' : 'disabled'}><b>${earned.has(t.id) ? esc(t.name) : '？？？'}</b><small>${esc(t.how)}</small></button>`).join('')}</div>
      ${mine ? '<p class="pf-note">手に入れた称号を押すと、名前の下に出せます（フレンドにも見えます）</p>' : ''}</section>
    ${!mine ? `<div class="pf-safety"><button class="link pf-report">${icon('info')}通報する</button><button class="link pf-block">${icon('shield')}${blockedNames.has(name) ? 'ブロック中' : 'ブロックする'}</button></div>` : ''}`);
  el.querySelector('.back').onclick = back || showMenu;
  if (!mine) {
    el.querySelector('.pf-report').onclick = () => reportUser(name);
    el.querySelector('.pf-block').onclick = () => blockUser(name, () => showProfile(view, back));
    return;
  }
  el.querySelector('.pf-avbtn').onclick = () => pickAvatar(() => showProfile());
  el.querySelector('.pf-tbtn').onclick = () => el.querySelector('.pf-titles').scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.querySelectorAll('.pf-t.got').forEach(b => b.onclick = () => {
    const id = b.dataset.t; pf.title = pf.title === id ? null : id; S.save(); Sync.push?.();
    toast(pf.title ? `称号を「${titleById(id).name}」にしました` : '称号を外しました', 1800);
    showProfile();
  });
}
// 新しいデザイン：次にもらえる称号と、あとどれくらいか（目標をいつも1つ見せる）（1.12.0）
function nextTitleCard(c, earned) {
  const goals = [['first', c.solved, 1, '問'], ['s50', c.solved, 50, '問'], ['s300', c.solved, 300, '問'], ['s1000', c.solved, 1000, '問'], ['s3000', c.solved, 3000, '問'],
    ['streak3', c.streak, 3, '日'], ['streak7', c.streak, 7, '日'], ['streak30', c.streak, 30, '日'], ['pz1', c.pzClears, 1, '回'], ['pz50', c.pzClears, 50, '回'], ['lv10', c.rank, 10, ''], ['lv30', c.rank, 30, ''], ['lv50', c.rank, 50, '']]
    .filter(([id]) => !earned.has(id)).map(([id, v, n, u]) => ({ t: titleById(id), v: v || 0, n, u, r: (v || 0) / n })).filter(g => g.t).sort((a, b) => b.r - a.r);
  const g = goals[0];
  if (!g) return '';
  const val = g.u === '' ? `Lv${g.v} / Lv${g.n}` : `${g.v} / ${g.n}${g.u}`;
  return `<section class="nx-goal"><span class="nx-goal-ic">${icon('trophy')}</span><div><small>次の称号</small><b>${esc(g.t.name)}</b><span class="pf-bar"><i style="width:${Math.min(100, g.r * 100)}%"></i></span><em>${esc(g.t.how)} ・ ${val}</em></div></section>`;
}
// 通報：運営（管理者の「要望・バグを見る」）に届く（1.12.0）
function reportUser(name) {
  const R = ['名前がよくない', 'プロフィール・部屋がよくない', 'いやがらせ', 'その他'];
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic danger">${icon('info')}</span><div><h3>「${esc(name)}」を通報する</h3><p>運営が内容を確かめます。通報したことは相手には伝わりません</p></div><button class="sh-x close" aria-label="やめる">${icon('x')}</button></div>
    <div class="rp-reasons">${R.map((x, i) => `<label><input type="radio" name="r" value="${i}" ${i === 0 ? 'checked' : ''}>${x}</label>`).join('')}</div>
    <textarea class="rp-detail" maxlength="400" placeholder="くわしく（なくてもOK）"></textarea>
    <button class="btn danger big rp-send">${icon('info')}通報する</button>`, 'news-sheet report-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelector('.rp-send').onclick = async () => {
    const b = el.querySelector('.rp-send'); b.disabled = true;
    const r = R[+el.querySelector('input[name=r]:checked').value], d = el.querySelector('.rp-detail').value.trim();
    try { await rpc('sr_feedback_send', { p_token: Auth.currentUser()?.token, p_kind: 'report', p_body: `【通報】${name}／${r}${d ? '\n' + d : ''}` }); el.remove(); toast('通報しました。ありがとうございます', 2600); }
    catch (ex) { toast(ex.message, 3000); b.disabled = false; }
  };
}
// ブロック：その人とのフレンドが外れ、申請もできなくなる。ランキングにも出なくなる
function blockUser(name, after) {
  if (blockedNames.has(name)) return showBlocks();
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('shield')}</span><div><h3>「${esc(name)}」をブロックしますか？</h3><p>フレンドから外れ、おたがいにフレンド申請ができなくなります。ランキングにも出なくなります。設定からいつでも解除できます</p></div></div>
    <div class="row2"><button class="btn ghost back2">やめる</button><button class="btn danger go">${icon('shield')}ブロックする</button></div>`, 'news-sheet');
  cf.querySelector('.back2').onclick = () => cf.remove();
  cf.querySelector('.go').onclick = async () => {
    try { await rpc('sr_block', { p_token: Auth.currentUser()?.token, p_username: name }); blockedNames.add(name); cf.remove(); toast(`「${name}」をブロックしました`); after && after(); }
    catch (ex) { toast(ex.message, 3000); }
  };
}
// ほかの人のプロフィールを開く（ランキング・フレンド・管理者画面から）
async function openUserProfile(username, back) {
  if (username === user?.name) return showProfile(null, back);
  let v;
  try { v = await rpc('sr_profile', { p_token: Auth.currentUser()?.token, p_username: username }); }
  catch (e) { return toast(e.message, 3000); }
  showProfile(v, back);
}
function pickAvatar(after) {
  const pf = S.profile(), rk = rankNow().rank;
  let av = pf.avatar || 'cat', col = pf.avatarColor ?? 0;
  const isG = (id) => GACHA_AVATARS.some(a => a.id === id);
  const hasG = (id) => S.owned(avatarItemId(id)) > 0;
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('user')}</span><div><h3>アイコン</h3><p>イラストと色をえらびます</p></div></div>
    <div class="av-preview"></div>
    <div class="av-grid">${AVATARS.map(a => { const lock = a.lv && rk < a.lv && !isAdmin(); return `<button class="av-pick" data-a="${a.id}" ${lock ? 'disabled' : ''} aria-label="${a.name}${lock ? `（Lv${a.lv}から）` : ''}">${avatarHTML({ avatar: a.id, avatarColor: col }, 'avatar')}${lock ? `<span class="av-lock">${icon('lock')}Lv${a.lv}</span>` : ''}</button>`; }).join('')}</div>
    <h4 class="av-sub">${icon('star')}ガチャのごほうびのアイコン<small>${GACHA_AVATARS.filter(a => hasG(a.id)).length} / ${GACHA_AVATARS.length}</small></h4>
    <div class="av-grid">${GACHA_AVATARS.map(a => { const lock = !hasG(a.id); return `<button class="av-pick g" data-a="${a.id}" ${lock ? 'disabled' : ''} aria-label="${a.name}${lock ? `（${a.series === 'band' ? 'OVERDRIVE' : 'スタンダード'}のガチャを${a.at}回引くともらえる）` : ''}">${avatarHTML({ avatar: a.id, avatarColor: 0 }, 'avatar')}${lock ? `<span class="av-lock">${icon('lock')}${a.at}回</span>` : ''}</button>`; }).join('')}</div>
    <div class="av-colors"></div>
    <div class="row2"><button class="btn ghost back2">やめる</button><button class="btn primary ok">これにする</button></div>`, 'news-sheet av-sheet');
  const draw = () => {
    const pal = isG(av) ? NIGHT_COLORS : AVATAR_COLORS;
    if (col >= pal.length) col = 0;
    el.querySelector('.av-preview').innerHTML = avatarHTML({ avatar: av, avatarColor: col }, 'avatar big');
    el.querySelectorAll('.av-pick').forEach(b => {
      b.classList.toggle('on', b.dataset.a === av);
      const c = b.classList.contains('g') ? (isG(av) ? col : 0) : (isG(av) ? 0 : col);
      b.querySelector('.avatar').outerHTML = avatarHTML({ avatar: b.dataset.a, avatarColor: c }, 'avatar');
    });
    el.querySelector('.av-colors').innerHTML = pal.map((c, i) => `<button class="av-col ${i === col ? 'on' : ''}" data-c="${i}" style="background:${c}" aria-label="色${i + 1}"></button>`).join('');
    el.querySelectorAll('.av-col').forEach(b => b.onclick = () => { col = +b.dataset.c; draw(); });
  };
  el.querySelectorAll('.av-pick').forEach(b => b.onclick = () => { if (isG(b.dataset.a) !== isG(av)) col = 0; av = b.dataset.a; draw(); });
  el.querySelector('.back2').onclick = () => { el.remove(); after?.(); };
  el.querySelector('.ok').onclick = () => { pf.avatar = av; pf.avatarColor = col; S.save(); Sync.push?.(); el.remove(); toast('アイコンを変えました', 1500); after?.(); };
  draw();
}

// =========================== 記録 ===========================
// Lv をタッチ：Lv100 までの道のりと、それぞれのLvでもらえるごほうび
function showRankRoad() {
  const rk = rankNow();
  const toNext = rk.max ? 0 : rk.need - rk.into;
  const roomAt = {};
  for (const d of ROOMS) if (d.home === 'main' && d.unlock > 1) roomAt[d.unlock] = d;
  const rows = [];
  for (let L = S.MAX_RANK; L >= 2; L--) {
    const r = S.rankRewards(L);
    const st = L <= rk.rank ? 'got' : L === rk.rank + 1 ? 'next' : '';
    const big = r.ticket5 ? 'gold5' : r.ticket4 ? 'mile' : '';
    const gifts = [r.ticket5 ? ticketSVG('ticket5', 'mini') : '', r.ticket4 ? ticketSVG('ticket4', 'mini') : '', ticketSVG('ticket', 'mini')].join('');
    rows.push(`<li class="rr-row ${st} ${big}" data-l="${L}">
      <span class="rr-lv"><small>Lv</small>${L}</span>
      <span class="rr-node">${L <= rk.rank ? icon('check') : ''}</span>
      <span class="rr-gifts">${gifts}${roomAt[L] ? `<i class="rr-room">${icon(roomAt[L].icon)}${roomAt[L].name}</i>` : ''}<i class="rr-cap">置ける数 ${S.capacity(L)}</i></span>
    </li>`);
  }
  const el = sheet(`
    <div class="rr-top">
      <div class="rr-now"><small>いまのランク</small><b>Lv${rk.rank}</b><span>/ ${S.MAX_RANK}</span></div>
      <div class="rr-bar"><i style="width:${rk.max ? 100 : Math.round(rk.into / rk.need * 100)}%"></i></div>
      <p class="rr-sub">${rk.max ? '最高ランクです！' : `次のLvまで あと <b>${toNext}</b> 経験値（およそ${Math.max(1, Math.ceil(toNext / 10))}問）`}</p>
      <div class="rr-legend"><span>${ticketSVG('ticket', 'mini')}毎回</span><span>${ticketSVG('ticket4', 'mini')}5Lvごと</span><span>${ticketSVG('ticket5', 'mini')}Lv50・100</span></div>
    </div>
    <ol class="rr-road">${rows.join('')}</ol>
    <div class="rr-btns"><button class="btn ghost rec">${icon('chart')}記録を見る</button><button class="btn primary close">とじる</button></div>`, 'rr-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelector('.rec').onclick = () => { el.remove(); showRecords(); };
  // 次のLvが見える位置まで動かしておく
  setTimeout(() => {
    const road = el.querySelector('.rr-road'), nx = el.querySelector('.rr-row.next') || el.querySelector('.rr-row.got');
    if (road && nx) road.scrollTop = nx.offsetTop - road.clientHeight * 0.55;
  }, 30);
}
// 新しいデザイン：チケットが0枚の時、ガチャ画面を行き止まりにせず「集め方」と「あと○」を出す（1.12.0）
function ticketHowTo() {
  const pf = S.profile(), rk = rankNow(), lb = S.getState().loginBonus || { count: 0 };
  const s50 = 50 - ((pf.solved || 0) % 50), lbLeft = 5 - ((lb.count || 0) % 5);
  const row = (ic, name, pct, left) => `<div class="nx-ht-row"><span class="nx-ht-ic">${icon(ic)}</span><span class="nx-ht-t"><b>${name}</b><span class="pf-bar"><i style="width:${pct}%"></i></span></span><small>${left}</small></div>`;
  return `<section class="nx-howto"><p class="nx-ht-h">${ticketSVG('ticket', 'mini')}<b>チケットの集め方</b><small>いまは 0枚</small></p>
    ${row('pencil', isPuzzle() ? 'パズルや問題を50回' : '問題を50問解く', (50 - s50) / 50 * 100, `あと${s50}問で1枚`)}
    ${row('gift', 'ログインボーナス', (5 - lbLeft) / 5 * 100, `あと${lbLeft}日で1枚`)}
    ${row('level', 'Lvアップ', rk.into / rk.need * 100, `あと${rk.need - rk.into} XPで1枚`)}
    <button class="btn primary big go">${icon(isPuzzle() ? 'grid' : 'pencil')}${isPuzzle() ? 'パズルで集める' : '問題を解いて集める'}</button></section>`;
}
// 期間限定イベント（1.12.0）
function evToast(r) {
  if (!r) return;
  if (r.ready > 0) setTimeout(() => toast(`${r.ev.name}：ごほうびが受け取れます！`, 2600), 1500);
}
function evRewardArt(r) {
  if (r.kind === 'item') { const it = itemById(r.item); return it ? `<span class="thumb">${thumbHTML(it)}</span>` : icon('gift'); }
  if (r.kind.startsWith('ticket')) return `<span class="gb-ic ev-tk">${ticketSVG(r.kind, 'mini')}</span>`;
  return `<span class="gb-ic">${icon('gift')}</span>`;
}
const evRewardName = (r) => r.kind === 'item' ? (itemById(r.item)?.name || '家具') : `${GIFT_LABEL[r.kind] || 'プレゼント'} ×${r.amount || 1}`;
function showEvent() {
  const ev = EV.activeEvent();
  if (!ev) return toast('いまはイベントの期間ではありません');
  const st = EV.stateOf(ev), next = ev.rewards.find(r => st.pts < r.at), last = ev.rewards.at(-1).at;
  const el = sheet(`
    <div class="sh-head ev-head"><span class="sh-ic ev-ic">${icon('snow')}</span><div><h3>${esc(ev.name)}${EV.previewing() === ev.id ? '<small class="ev-pv">ためし中</small>' : ''}</h3><p>${md(ev.start)}〜${md(ev.end)} ・ のこり ${EV.daysLeft(ev)}日</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <p class="ev-desc">${esc(ev.desc)}</p>
    <div class="ev-meter"><div class="ev-num"><b>${st.pts}</b><span>${esc(ev.unit)}</span></div>
      <div class="ev-bar"><i style="width:${Math.min(100, st.pts / last * 100)}%"></i>${ev.rewards.map(r => `<span class="ev-tick ${st.pts >= r.at ? 'on' : ''}" style="left:${r.at / last * 100}%"></span>`).join('')}</div>
      <small>${next ? `次のごほうびまで あと ${next.at - st.pts}${esc(ev.unit)}` : 'ぜんぶのごほうびを集めました！'}・問題は正解${EV.POINTS.right}・まちがい${EV.POINTS.wrong}、パズルは★の数</small></div>
    <div class="ev-list">${ev.rewards.map((r, i) => { const got = st.claimed.includes(i), can = st.pts >= r.at && !got; return `
      <div class="ev-row ${got ? 'got' : can ? 'can' : ''}"><span class="ev-at">${r.at}</span>${evRewardArt(r)}<span class="ev-nm"><b>${esc(evRewardName(r))}</b>${r.kind === 'item' ? '<small>イベント限定</small>' : ''}</span>
        ${got ? `<span class="ev-st">${icon('check')}受け取りずみ</span>` : can ? `<button class="btn gold sm ev-claim" data-i="${i}">受け取る</button>` : `<span class="ev-st">あと${r.at - st.pts}</span>`}</div>`; }).join('')}</div>
    <p class="note">受け取ったごほうびはプレゼントBOXに届きます。イベントの家具はガチャからは出ません</p>`, 'ev-sheet');
  hydrateThumbs(el);
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelectorAll('.ev-claim').forEach(b => b.onclick = () => {
    if (EV.claim(ev, +b.dataset.i)) { vibrate([20, 30, 20]); toast('プレゼントBOXに届きました'); showEvent(); }
  });
}
const md = (k) => `${+k.slice(5, 7)}/${+k.slice(8, 10)}`;
// 勉強レポート（1.12.0）：週・月ごとのまとめ。画像で保存できる
function showReport(kind = 'week', offset = 0) {
  const log = S.dayLog(), p = R.period(kind, offset), pv = R.period(kind, offset - 1);
  const cur = R.summarize(log, p), prev = R.summarize(log, pv);
  const names = Object.fromEntries(SUBJECTS.map(x => [x.id, x.name]));
  const diff = (a, b, u = '') => { const d = a - b; return !b && !a ? '' : `<small class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}${u}</small>`; };
  const max = Math.max(5, ...cur.days.map(d => d.n));
  const today = S.dayKey(), bw = 100 / cur.days.length;
  const bars = `<svg class="rp-bars" viewBox="0 0 100 46" preserveAspectRatio="none" aria-label="毎日の解いた数">${cur.days.map((d, i) => { const hh = d.n / max * 38; return `<rect x="${(i * bw + bw * .18).toFixed(2)}" y="2" width="${(bw * .64).toFixed(2)}" height="38" rx="1" class="bg"/>${hh ? `<rect x="${(i * bw + bw * .18).toFixed(2)}" y="${(40 - hh).toFixed(2)}" width="${(bw * .64).toFixed(2)}" height="${hh.toFixed(2)}" rx="1" class="${d.key === today ? 'now' : 'v'}"/>` : ''}`; }).join('')}</svg>
    <div class="rp-days">${cur.days.map((d, i) => `<span>${kind === 'week' ? '月火水木金土日'[i] : (i % 5 === 0 || i === cur.days.length - 1) ? +d.key.slice(8) : ''}</span>`).join('')}</div>`;
  const subjRows = Object.entries(cur.bySid).sort((a, b) => b[1][0] - a[1][0]).map(([sid, [n, c]]) => `<div class="rp-row"><span class="ic2">${icon(SUBJECT_ICON[sid] || 'book')}</span><b>${esc(names[sid] || sid)}</b><span class="rp-bar"><i style="width:${n / Math.max(1, cur.n) * 100}%"></i></span><span class="rp-n">${n}問<small>${Math.round(c / n * 100)}%</small></span></div>`).join('');
  const unitRows = (list, weak) => list.length ? list.map((u, i) => `<div class="rp-row rp-unit"><span class="rp-rank ${weak ? 'weak' : 'strong'}">${i + 1}</span><span class="rp-ut"><b>${esc(u.unit)}</b><small>${esc(names[u.sid] || '')}・${u.n}問・正解率 ${Math.round(u.rate * 100)}%</small></span>${weak ? `<button class="btn ghost sm rp-go" data-s="${u.sid}" data-u="${esc(u.unit)}">${icon('pencil')}解く</button>` : ''}</div>`).join('') : `<p class="empty sm">3問以上解いた単元が出ます</p>`;
  const el = screenWithTabs('report', `<button class="icon back">${icon('back')}</button><h2>勉強レポート</h2><span></span>`, 'menu', `
    <div class="rp-tabs" role="tablist"><button data-k="week" class="${kind === 'week' ? 'on' : ''}">週</button><button data-k="month" class="${kind === 'month' ? 'on' : ''}">月</button></div>
    <div class="rp-nav"><button class="icon rp-prev" aria-label="前へ">${icon('back')}</button><div><b>${p.name}</b><small>${p.label}</small></div><button class="icon rp-next" aria-label="次へ" ${offset >= 0 ? 'disabled' : ''}>${icon('chevronRight')}</button></div>
    <p class="rp-comment">${icon('sparkle')}${esc(R.comment(cur, prev, p))}</p>
    <div class="stats4">
      <div>${icon('pencil')}<b>${cur.n}</b><span>解いた数</span>${diff(cur.n, prev.n)}</div>
      <div>${icon('check')}<b>${Math.round(cur.rate * 100)}%</b><span>正解率</span></div>
      <div>${icon('flame')}<b>${cur.studyDays}</b><span>勉強した日</span>${diff(cur.studyDays, prev.studyDays)}</div>
      <div>${icon('grid')}<b>${cur.pz}</b><span>パズル</span>${diff(cur.pz, prev.pz)}</div>
    </div>
    <section class="rp-card"><h3>毎日の解いた数</h3>${bars}</section>
    <section class="rp-card"><h3>教科ごと</h3>${subjRows || '<p class="empty sm">この期間はまだ解いていません</p>'}</section>
    <section class="rp-card"><h3 class="weak">のびしろの単元<small>正解率が低い順</small></h3>${unitRows(cur.weak, true)}</section>
    <section class="rp-card"><h3 class="strong">得意な単元<small>正解率が高い順</small></h3>${unitRows(cur.strong, false)}</section>
    <button class="btn gold big rp-save">${icon('download')}画像で保存</button>
    <p class="note">保存した画像は、写真やファイル（Google ドライブなど）に入れられます。記録は 1.12.0 から集まり始めます</p>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelectorAll('.rp-tabs button').forEach(b => b.onclick = () => showReport(b.dataset.k, 0));
  el.querySelector('.rp-prev').onclick = () => showReport(kind, offset - 1);
  el.querySelector('.rp-next').onclick = () => showReport(kind, Math.min(0, offset + 1));
  el.querySelectorAll('.rp-go').forEach(b => b.onclick = async () => {
    subjectId = b.dataset.s; await loadBank(subjectId);
    const st = S.subject(subjectId), q = probs(subjectId).find(x => x.unit === b.dataset.u);
    st.scope = { genre: q?.genre || null, unit: b.dataset.u }; st.session = null; S.save();
    startSet();
  });
  el.querySelector('.rp-save').onclick = async () => {
    const btn = el.querySelector('.rp-save'); btn.disabled = true;
    try {
      const cv = R.drawImage({ user: user.name, p, cur, prev, names });
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const file = new File([blob], `roomin-report-${p.start}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'ROOMIN 勉強レポート' }).catch(() => {}); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('画像を保存しました'); }
    } catch (e) { toast('画像を作れませんでした'); }
    btn.disabled = false;
  };
}
function showRecords(subj = subjectId) {
  const rk = rankNow(), pf = S.profile();
  const today = S.dayKey();
  const list = probs(subj);
  const st = S.subject(subj);
  // 全教科を合わせた克服の数
  const mastered = SUBJECTS.reduce((n, x) => n + (probs(x.id).length ? S.stats(S.subject(x.id), probs(x.id)).mastered : 0), 0);
  const solvedOf = (id) => Object.values(S.subject(id).units || {}).reduce((n, u) => n + (u.solved || 0), 0);
  // 単元は問題の並び順で
  const unitNames = [...new Set(list.map(p => p.unit))];
  const units = unitNames.map(u => ({ u, ...(st.units?.[u] || { solved: 0, correct: 0, perfect: 0 }), total: list.filter(p => p.unit === u).length }));
  const maxSolved = Math.max(1, ...units.map(x => x.solved));
  const subjName = SUBJECTS.find(x => x.id === subj)?.name || '';
  const el = screenWithTabs('records', `<button class="icon back">${icon('back')}</button><h2>記録</h2><span></span>`, 'menu', `
    <section class="profile-card">
      <div class="pc-lv"><span>Lv</span><b>${rk.rank}</b></div>
      <div class="pc-main"><b>経験値 ${pf.xp} XP</b>
        <div class="xpbar big"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></div>
        <small>次のLvまで ${rk.need - rk.into} XP（正解 +${S.XP.perfect}・惜しい +${S.XP.ok}・まちがい +${S.XP.wrong}）</small></div>
    </section>
    <div class="stats4">
      <div>${icon('flame')}<b>${S.currentStreak()}</b><span>連続日数</span></div>
      <div>${icon('pencil')}<b>${pf.solved}</b><span>解いた数</span></div>
      <div>${icon('check')}<b>${pf.solved ? Math.round(pf.correct / pf.solved * 100) : 0}%</b><span>正解率</span></div>
      <div>${icon('trophy')}<b>${mastered}</b><span>克服</span></div>
    </div>
    ${isPuzzle() ? `<h3 class="sec">パズル（クリア ${pf.puzzleClears || 0}回）</h3>
    <div class="unit-list">${PUZZLES.map(z => { const ps = S.puzzleState(z.id); return `
      <div class="unit-row"><b>${z.name}</b><span>${ps.best ? `★${ps.best}までクリア` : 'まだクリアなし'}<small>クリア ${ps.clears}・ノーミス ${ps.perfect}</small></span></div>`; }).join('')}${ENDLESS.map(z => { const es = S.endlessState(z.id); return `
      <div class="unit-row"><b>${z.name}</b><span>${es.best ? `ベスト ${es.best}` : 'まだ記録なし'}<small>遊んだ回数 ${es.plays || 0}</small></span></div>`; }).join('')}</div>` : ''}
    <div class="rec-subj">${SUBJECTS.filter(x => probs(x.id).length).map(x => `
      <button data-s="${x.id}" class="${x.id === subj ? 'on' : ''}"><span class="ic2">${icon(SUBJECT_ICON[x.id] || 'book')}</span><b>${x.name}</b><small>${solvedOf(x.id)}問</small></button>`).join('')}</div>
    <h3 class="sec">分野ごと（${subjName}）</h3>
    <div class="unit-list">${units.map(x => `
      <div class="unit-row"><b>${esc(x.u)}</b>
        <div class="ubar"><i class="all" style="width:${x.solved / maxSolved * 100}%"></i><i class="ok" style="width:${x.correct / maxSolved * 100}%"></i></div>
        <span>${x.solved}問<small>正解 ${x.correct}</small></span></div>`).join('')}</div>
    <h3 class="sec">問題ごと（${list.length}問）</h3>
    <ul class="plist">${list.map(p => {
      const r = st.srs[p.id];
      let badge = '<i class="b new">まだ</i>';
      if (r?.mastered) badge = '<i class="b ok">克服</i>';
      else if (r?.due) badge = `<i class="b due">${r.due <= today ? '今日復習' : '復習 ' + r.due.slice(5).replace('-', '/')}</i>`;
      else if (r?.seen) badge = '<i class="b done">正解</i>';
      return `<li><span class="unit">${esc(p.unit)}</span><span class="tx">${esc(p.text.replace(/\n/g, ' '))}</span>${badge}</li>`;
    }).join('')}</ul>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelectorAll('.rec-subj button').forEach(b => b.onclick = () => showRecords(b.dataset.s));
}

// =========================== 要望・バグ報告 ===========================
function showFeedback(kind = 'bug') {
  const el = screenWithTabs('feedback', `<button class="icon back">${icon('back')}</button><h2>要望・バグ報告</h2><span></span>`, 'menu', `
    <p class="note">管理者にとどきます。どの画面で・何をしたら・どうなったかを書いてもらえると助かります。</p>
    <div class="seg bagtabs"><button data-k="bug" class="${kind === 'bug' ? 'on' : ''}">${icon('alert')}バグ報告</button><button data-k="request" class="${kind === 'request' ? 'on' : ''}">${icon('sparkle')}要望</button></div>
    <form class="news-form fb-form">
      <textarea name="b" rows="7" maxlength="2000" placeholder="${kind === 'bug' ? '例：模様がえでソファを動かすと、壁にめりこんだ' : '例：ベッドの種類をもっと増やしてほしい'}" required></textarea>
      <button class="btn gold big">${icon('check')}送る</button>
    </form>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelectorAll('.bagtabs button').forEach(b => b.onclick = () => showFeedback(b.dataset.k));
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const body = e.target.b.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      await rpc('sr_feedback_send', { p_token: Auth.currentUser()?.token, p_kind: kind, p_body: body + `\n\n（${navigator.userAgent.slice(0, 120)}）` });
      toast('送りました。ありがとう！'); e.target.reset();
    } catch (ex) { toast(ex.message); }
    btn.disabled = false;
  };
}
// 管理者：届いた要望・バグ報告
async function showFeedbackInbox() {
  const el = screenWithTabs('feedback', `<button class="icon back">${icon('back')}</button><h2>届いた要望・バグ</h2><span></span>`, 'menu', `<div class="fblist"><p class="empty">読み込み中…</p></div>`);
  el.querySelector('.back').onclick = showAdmin;
  const tk = Auth.currentUser()?.token;
  const load = async () => {
    let list = [];
    try { list = await rpc('sr_feedback_list', { p_token: tk }); } catch (e) { el.querySelector('.fblist').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    const day = (t) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    el.querySelector('.fblist').innerHTML = list.length ? list.map(f => `
      <article class="news-card fb-card ${f.done ? 'done' : 'unread'}">
        <div class="nc-top"><i class="fb-kind ${f.kind}">${({ bug: 'バグ', request: '要望', problem: '問題のまちがい', report: '通報' })[f.kind] || f.kind}</i><b>${esc(f.username || '（消えたユーザー）')}</b><small>${day(f.created_at)}</small></div>
        <p>${esc(f.body).replace(/\n/g, '<br>')}</p>
        <button class="btn ghost sm done-btn" data-id="${f.id}" data-done="${f.done ? 0 : 1}">${f.done ? '未対応にもどす' : `${icon('check')}対応ずみにする`}</button>
      </article>`).join('') : '<p class="empty">まだ届いていません。</p>';
    el.querySelectorAll('.done-btn').forEach(b => b.onclick = async () => { await rpc('sr_feedback_done', { p_token: tk, p_id: +b.dataset.id, p_done: b.dataset.done === '1' }); load(); });
  };
  load();
}

// =========================== 自動で並べる ===========================
// 置きたい家具と数を選び、並べ方を選ぶと、家具どうしの関係で部屋に並べる（room3d.arrangeRoom）
const ARR_STYLES = [['auto', 'おまかせ', 'sparkle', '家具で選ぶ'], ['talk', '団らん', 'users', 'かこむ'], ['tv', 'テレビ', 'image', 'テレビの前'], ['window', '窓辺', 'sun', '窓を向く'], ['cafe', 'カフェ', 'cook', '食卓']];
const ARR_NAME = Object.fromEntries(ARR_STYLES.map(x => [x[0], x[1]]));
let arrSel = null, arrStyle = 'auto', arrGenre = '';
function showArrange(reset = true) {
  const r = curRoom();
  const here = {}; r.placed.forEach(p => { here[p.item] = (here[p.item] || 0) + 1; });
  if (reset || !arrSel) arrSel = { ...here };
  const avail = (id) => S.owned(id) - (S.placedCount(id) - (here[id] || 0));
  const hs = HS();
  const ids = S.isUnlimited() ? [...new Set([...ITEMS, ...G.GACHA_ITEMS].map(i => i.id))] : Object.keys(hs.inventory);
  const list = ids.map(itemById).filter(it => it && it.place !== 'surface' && it.place !== 'skin' && it.place !== 'avatar' && avail(it.id) > 0 && (!arrGenre || it.genre === arrGenre))
    .sort((a, b) => (arrSel[b.id] ? 1 : 0) - (arrSel[a.id] ? 1 : 0));
  const total = Object.values(arrSel).reduce((n, v) => n + v, 0), cap = S.capacity();
  const el = screenWithTabs('arrange', `<button class="icon back">${icon('back')}</button><h2>自動で並べる</h2><span class="ar-count"><b>${total}</b> / ${cap}</span>`, 'furn', `
    <p class="ar-lead">置きたい家具を選んでください（押すたびに数がふえます）。選んだ家具だけを、この部屋に並べなおします。</p>
    <div class="zk-tabs ar-tabs"><button data-g="" class="${!arrGenre ? 'on' : ''}">すべて</button>${GENRES.filter(g => g.id !== 'interior' && g.id !== 'fixture').map(g => `<button data-g="${g.id}" class="${arrGenre === g.id ? 'on' : ''}">${icon(GENRE_ICON[g.id] || 'box')}${g.name}</button>`).join('')}</div>
    <div class="invgrid ar-grid">${list.map(it => `<button class="inv-item ar-item ${arrSel[it.id] ? 'on' : ''}" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b>${arrSel[it.id] ? `<i class="ar-n">${arrSel[it.id]}${avail(it.id) > 1 ? '/' + avail(it.id) : ''}</i>` : ''}</button>`).join('') || '<p class="empty">置ける家具がありません</p>'}</div>
    <div class="ar-foot">
      <div class="ar-styles">${ARR_STYLES.map(([k, n, ic, sub]) => `<button data-st="${k}" class="${arrStyle === k ? 'on' : ''}">${icon(ic)}<b>${n}</b><small>${sub}</small></button>`).join('')}</div>
      <div class="row2"><button class="btn ghost ar-clear">選ぶのをやめる</button><button class="btn gold big ar-go" ${total ? '' : 'disabled'}>${icon('grid')}自動で並べる</button></div>
    </div>`);
  el.querySelector('.back').onclick = () => showHome();
  el.querySelectorAll('.ar-tabs button').forEach(b => b.onclick = () => { arrGenre = b.dataset.g; showArrange(false); });
  el.querySelectorAll('.ar-item').forEach(b => b.onclick = () => {
    const id = b.dataset.id, n = arrSel[id] || 0, a = avail(id);
    const next = n >= a ? 0 : n + 1;
    if (next > n && total >= cap) return toast(`この部屋に置けるのは ${cap}個までです（Lvが上がるとふえます）`, 2600);
    if (next) arrSel[id] = next; else delete arrSel[id];
    showArrange(false);
  });
  el.querySelectorAll('.ar-styles button').forEach(b => b.onclick = () => { arrStyle = b.dataset.st; showArrange(false); });
  el.querySelector('.ar-clear').onclick = () => { arrSel = {}; showArrange(false); };
  el.querySelector('.ar-go').onclick = () => runArrange(arrStyle);
}
async function runArrange(style, backup = null) {
  const r = curRoom();
  backup = backup || JSON.parse(JSON.stringify(r.placed));
  const ps = [];
  for (const [id, n] of Object.entries(arrSel || {})) for (let k = 0; k < n; k++) ps.push({ uid: S.newUid(), item: id });
  showHome();
  app.querySelector('.tabbar')?.classList.add('hide');
  toast('並べています…', 8000);
  const res = await room3d.arrangeRoom(ps, style);
  r.placed = ps.filter(p => !res.failed.includes(p.uid));
  S.save();
  room3d.overview();
  const failNames = res.failed.map(uid => itemById(ps.find(p => p.uid === uid)?.item)?.name).filter(Boolean);
  toast(failNames.length ? `${failNames.length}個は場所がなく、持ち物に入れました` : `「${ARR_NAME[res.style]}」で並べました`, 3000);
  const order = ['talk', 'tv', 'window', 'cafe'];
  const nextStyle = order[(order.indexOf(res.style) + 1) % order.length];
  const sh = sheet(`
    <div class="sh-head"><span class="sh-ic gold">${icon('grid')}</span><div><h3>「${ARR_NAME[res.style]}」で並べました</h3><p>${failNames.length ? `置けなかった物：${esc(failNames.join('、'))}` : '指で部屋を見まわして、確かめてください'}</p></div></div>
    <div class="ar-after">
      <button class="btn gold big ar-ok">${icon('check')}これでOK</button>
      <div class="row2"><button class="btn ghost ar-next">${icon('refresh')}「${ARR_NAME[nextStyle]}」で並べる</button><button class="btn ghost ar-undo">${icon('back')}元に戻す</button></div>
      <button class="link ar-edit">模様がえで手直しする</button>
    </div>`, 'ar-sheet');
  sh.querySelector('.ar-ok').onclick = () => { sh.remove(); showHome(); };
  sh.querySelector('.ar-next').onclick = () => { sh.remove(); runArrange(nextStyle, backup); };
  sh.querySelector('.ar-undo').onclick = async () => {
    sh.remove();
    r.placed = backup; S.save();
    room3d.roomDef = null; await room3d.show(curDef(), r);
    showHome(); toast('元に戻しました');
  };
  sh.querySelector('.ar-edit').onclick = () => { sh.remove(); showEdit(); };
}

// =========================== 持ち物 ===========================
// 家具（持っている数と置いている数）と、アイテム（チケット・かけら・引きかえ券）を分けて見る
function showBag(tab = 'furniture', genre = '') {
  if (isAdmin()) adminTopUp();
  const hs = HS();
  const ids = S.isUnlimited() ? [...new Set([...ITEMS, ...G.GACHA_ITEMS].map(i => i.id))] : Object.keys(hs.inventory);
  const owned = ids.map(itemById).filter(it => it && S.owned(it.id) > 0 && it.place !== 'surface' && it.place !== 'skin' && it.place !== 'avatar' && (!genre || it.genre === genre));
  const surf = ids.map(itemById).filter(it => it && it.place === 'surface');
  const items = [
    ['ticket', hs.rareTickets || 0, ticketSVG('ticket', 'mini'), 'ガチャを1回引ける'],
    ['ticket4', hs.rareTickets4 || 0, ticketSVG('ticket4', 'mini'), '1回引くと★4以上が必ず出る'],
    ['ticket5', hs.rareTickets5 || 0, ticketSVG('ticket5', 'mini'), '限定シリーズの★5が必ず出る'],
    ['shard4', hs.shards4 || 0, `<span class="shard s4">${icon('sparkle')}</span>`, '★4のかけら。5個で好きな★4と交換'],
    ['shard5', hs.shards5 || 0, `<span class="shard s5">${icon('sparkle')}</span>`, '★5のかけら。5個で好きな★5と交換'],
    ['exchange', hs.tickets || 0, `<span class="shard ex">${icon('gift')}</span>`, '引きかえ券。ゲージなしで家具を1つ買える'],
  ];
  const NAMES = { ...TICKET_NAME, shard4: '★4のかけら', shard5: '★5のかけら', exchange: '引きかえ券' };
  const el = screenWithTabs('bag', `<button class="icon back">${icon('back')}</button><h2>持ち物</h2><span></span>`, 'furn', `
    <div class="seg bagtabs"><button data-t="furniture" class="${tab === 'furniture' ? 'on' : ''}">${icon('sofa')}家具</button><button data-t="items" class="${tab === 'items' ? 'on' : ''}">${icon('star')}アイテム</button></div>
    ${tab === 'furniture' ? `
      <div class="zk-tabs"><button data-g="" class="${!genre ? 'on' : ''}">すべて</button>${GENRES.map(g => `<button data-g="${g.id}" class="${genre === g.id ? 'on' : ''}">${icon(GENRE_ICON[g.id] || 'box')}${g.name}</button>`).join('')}</div>
      ${owned.length ? `<div class="zk-grid">${owned.map(it => {
        const n = S.owned(it.id), used = S.placedCount(it.id);
        return `<div class="zk-item have bag-item"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b>
          <small class="bag-n ${used >= n ? 'full' : ''}">置いている ${used} / 持っている ${S.isUnlimited() ? '∞' : n}</small></div>`;
      }).join('')}</div>` : '<p class="empty">まだ家具を持っていません。</p>'}
      ${!genre && surf.length ? `<h3 class="sec">壁・床・ドア・窓・カーテン（${surf.length}）</h3><div class="zk-grid">${surf.map(it => `<div class="zk-item have"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b></div>`).join('')}</div>` : ''}
    ` : `
      <div class="bag-items">${items.map(([k, n, art, desc]) => `
        <div class="bag-row ${n ? '' : 'zero'}"><span class="bag-art">${art}</span><span class="bag-t"><b>${NAMES[k]}</b><small>${desc}</small></span><b class="bag-cnt">×${n}</b></div>`).join('')}</div>
    `}`);
  el.querySelector('.back').onclick = halfFurniture;
  el.querySelectorAll('.bagtabs button').forEach(b => b.onclick = () => showBag(b.dataset.t));
  el.querySelectorAll('.zk-tabs button').forEach(b => b.onclick = () => showBag('furniture', b.dataset.g));
}

// =========================== 週間ランキング ===========================
async function showRanking() {
  const wk = S.weekKey();
  const [y, mo, d] = wk.split('-').map(Number);
  const end = new Date(y, mo - 1, d + 6);
  const el = screenWithTabs('ranking', `<h2>みんな</h2><span></span>`, 'social', `<div class="seg bagtabs soc"><button data-s="ranking" class="on">${icon('trophy')}ランキング</button><button data-s="friends">${icon('users')}フレンド${friendBadge ? '<i class="badge">' + friendBadge + '</i>' : ''}</button></div>
    <p class="rk-term">${mo}/${d}（月）〜 ${end.getMonth() + 1}/${end.getDate()}（日）にかせいだポイント<small>勉強で正解しても、パズルをクリアしても、もらったゲージの数がポイントになります</small></p>
    <div class="rk-me"></div>
    <div class="rk-list"><p class="empty">読み込み中…</p></div>`);
  bindSocialTabs(el);
  // 自分の最新の数をネットに送ってから見る
  try { await Sync.push(); } catch (e) { /* なし */ }
  let r;
  try { r = await rpc('sr_weekly_points', { p_token: Auth.currentUser()?.token, p_week: wk }); }
  catch (e) { el.querySelector('.rk-list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const pf = S.profile(), wkd = pf.week?.key === wk ? pf.week : {};
  el.querySelector('.rk-me').innerHTML = `<div class="rk-mecard"><span class="rk-pos">${r.me ? r.me.pos + '<small>位</small>' : '—'}</span>
    ${avatarHTML(pf, 'avatar rk-av')}<div><b>あなた<span class="rk-pt">${S.weekPoints()}<small>pt</small></span></b><small>${r.total || 0}人中 ・ 問題 ${wkd.solved || 0}問・パズル ${wkd.puzzle || 0}回</small></div></div>`;
  const medal = (p) => p <= 3 ? `<span class="medal m${p}">${p}</span>` : `<span class="rk-n">${p}</span>`;
  r.top = (r.top || []).filter(x => !blockedNames.has(x.username)); // ブロックした人は出さない
  el.querySelector('.rk-list').innerHTML = (r.top || []).length ? r.top.map(x => `
    <button class="rk-row ${x.me ? 'me' : ''}" data-u="${esc(x.username)}">${medal(x.pos)}${avatarHTML(x, 'avatar rk-av')}<b>${esc(x.username)}${x.title && titleById(x.title) ? `<small class="rk-title">${esc(titleById(x.title).name)}</small>` : ''}</b><span><span class="rk-pts">${x.points}<small>pt</small></span><small>${[x.solved ? `問題 ${x.solved}` : '', x.puzzle ? `パズル ${x.puzzle}` : ''].filter(Boolean).join('・') || '—'}</small></span></button>`).join('')
    : `<p class="empty">今週はまだだれもポイントをかせいでいません。いちばん乗りしよう！</p>`;
  el.querySelectorAll('.rk-row[data-u]').forEach(b => b.onclick = () => openUserProfile(b.dataset.u, showRanking));
}

// =========================== 図鑑 ===========================
function showZukan(genre = null) {
  // ふつうの家具（買える物）と、ガチャの家具（★3〜★5）を分けて数える
  const shop = ITEMS.filter(i => !i.rare && !i.special);
  const gacha = G.GACHA_ITEMS.filter(i => !i.limited || G.activeSeries().some(s => s.id === i.series) || S.collected(i.id));
  const special = ITEMS.filter(i => i.special);
  const pool = [...shop, ...gacha, ...special];
  const total = pool.length, have = pool.filter(i => S.collected(i.id)).length;
  let body;
  if (genre === 'gacha') {
    body = [5, 4, 3].map(r => {
      const list = gacha.filter(i => i.rarity === r);
      return `<h3 class="sec">${'★'.repeat(r)}（${list.filter(i => S.collected(i.id)).length} / ${list.length}）</h3>${zukanGrid(list)}`;
    }).join('');
  } else if (genre === 'special') body = zukanGrid(special);
  else if (genre) body = zukanGrid(shop.filter(i => i.genre === genre));
  else {
    const card = (id, ic, name, items) => {
      const n = items.filter(i => S.collected(i.id)).length;
      return `<button class="zk-genre" data-g="${id}"><span class="g-ic">${icon(ic)}</span><b>${name}</b>
        <span class="zk-bar"><i style="width:${n / Math.max(1, items.length) * 100}%"></i></span><small>${n} / ${items.length}${n >= items.length ? ' コンプリート' : ''}</small></button>`;
    };
    body = card('gacha', 'star', 'ガチャの家具', gacha)
      + GENRES.map(g => card(g.id, GENRE_ICON[g.id] || 'box', g.name, shop.filter(i => i.genre === g.id))).join('')
      + card('special', 'trophy', '特別（克服のごほうび）', special);
  }
  const el = screenWithTabs('zukan', `<button class="icon back">${icon('back')}</button><h2>図鑑</h2><span class="zk-total"><b>${have}</b> / ${total}</span>`, 'zukan', `
    <div class="zk-progress"><i style="width:${have / total * 100}%"></i></div>
    <div class="zk-tabs">
      <button data-g="" class="${!genre ? 'on' : ''}">すべて</button>
      <button data-g="gacha" class="${genre === 'gacha' ? 'on' : ''}">${icon('star')}ガチャ</button>
      ${GENRES.map(g => `<button data-g="${g.id}" class="${genre === g.id ? 'on' : ''}">${icon(GENRE_ICON[g.id] || 'box')}${g.name}</button>`).join('')}
      <button data-g="special" class="${genre === 'special' ? 'on' : ''}">${icon('trophy')}特別</button>
    </div>
    ${body}`);
  el.querySelector('.back').onclick = halfFurniture;
  el.querySelectorAll('.zk-tabs button, .zk-genre').forEach(b => b.onclick = () => showZukan(b.dataset.g || null));
  el.querySelectorAll('.zk-item.have').forEach(b => b.onclick = () => {
    const it = itemById(b.dataset.id);
    toast(`${it.name}${it.rarity ? '（' + '★'.repeat(it.rarity) + '）' : ''} 持っている数：${S.owned(it.id)}`);
  });
}
function zukanGrid(items) {
  return `<div class="zk-grid">${items.map(it => {
    const have = S.collected(it.id);
    return `<button class="zk-item ${have ? 'have' : 'locked'} ${it.rarity ? 'r' + it.rarity : ''}" data-id="${it.id}">
      <span class="thumb">${thumbHTML(it)}</span>${have ? '' : `<span class="lock">${icon('lock')}</span>`}
      <b>${have ? esc(it.name) : '？？？'}</b></button>`;
  }).join('')}</div>`;
}

// =========================== フレンド ===========================
// =========================== お知らせ ===========================
const NEWS_SEEN = 'studyroom.newsSeen';
async function refreshNewsBadge() {
  const u = Auth.currentUser();
  if (!u) return;
  try {
    const list = await rpc('sr_news_list', { p_token: u?.token });
    const seen = +(localStorage.getItem(NEWS_SEEN) || 0);
    newsBadge = list.filter(n => n.id > seen).length;
  } catch (e) { /* オフライン */ }
}
async function showNews() {
  const el = screenWithTabs('news', `<button class="icon back">${icon('back')}</button><h2>お知らせ</h2><span></span>`, 'menu', `<div class="nlist"><p class="empty">読み込み中…</p></div>`);
  el.querySelector('.back').onclick = showMenu;
  let list = [];
  try { list = await rpc('sr_news_list', { p_token: Auth.currentUser()?.token }); }
  catch (e) { el.querySelector('.nlist').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const seen = +(localStorage.getItem(NEWS_SEEN) || 0);
  const day = (t) => new Date(t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
  el.querySelector('.nlist').innerHTML = list.length ? list.map(n => `
    <article class="news-card ${n.id > seen ? 'unread' : ''}">
      <div class="nc-top">${n.id > seen ? '<i class="nc-new">NEW</i>' : ''}${n.admin_only ? '<i class="nc-new" style="background:#6f4bd8;color:#fff">管理者だけ</i>' : ''}<small>${day(n.created_at)}</small></div>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.body).replace(/\n/g, '<br>')}</p>
    </article>`).join('') : '<p class="empty">お知らせはまだありません。</p>';
  if (list.length) { try { localStorage.setItem(NEWS_SEEN, String(Math.max(...list.map(n => n.id)))); } catch (e) { /* なし */ } }
  newsBadge = 0;
}
// 管理者：お知らせを書いて送る（送る前に確認）
function composeNews(after) {
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('bell')}</span><div><h3>お知らせを書く</h3><p>送ると、みんなのメニューに届きます</p></div></div>
    <form class="news-form">
      <input name="t" maxlength="40" placeholder="タイトル（例：新しい部屋が増えました）" required>
      <textarea name="b" rows="5" maxlength="600" placeholder="本文"></textarea>
      <label class="nf-adm"><input type="checkbox" name="adm"> 管理者だけに送る（ためし用）</label>
      <button class="btn gold big">${icon('check')}内容を確認する</button>
    </form>
    <button class="link close">やめる</button>`, 'news-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim(), b = e.target.b.value.trim(), adm = e.target.adm.checked;
    if (!t) return;
    const cf = sheet(`
      <div class="sh-head"><span class="sh-ic gold">${icon('alert')}</span><div><h3>この内容で送りますか？</h3><p>${adm ? '管理者だけに届きます' : '送ると、すぐにみんなに届きます'}</p></div></div>
      <article class="news-card unread"><h3>${esc(t)}</h3><p>${esc(b).replace(/\n/g, '<br>')}</p></article>
      <div class="row2"><button class="btn ghost back2">書きなおす</button><button class="btn gold send">${icon('check')}送る</button></div>`, 'news-sheet');
    cf.querySelector('.back2').onclick = () => { cf.remove(); composeNews(after); };
    cf.querySelector('.send').onclick = async () => {
      try { await rpc('sr_news_post2', { p_token: Auth.currentUser()?.token, p_title: t, p_body: b, p_admin_only: adm }); toast('お知らせを送りました'); cf.remove(); after && after(); }
      catch (ex) { toast(ex.message); }
    };
  };
}

function composeGift() {
  const kinds = ['ticket', 'ticket4', 'ticket5', 'exchange', 'item'];
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('gift')}</span><div><h3>みんなにプレゼントを送る</h3><p>全員のプレゼントBOXに届きます</p></div></div>
    <form class="news-form gift-form">
      <input name="t" maxlength="40" placeholder="ひとこと（例：いつもありがとう）" required>
      <select name="k">${kinds.map(k => `<option value="${k}">${GIFT_LABEL[k]}</option>`).join('')}</select>
      <input name="n" type="number" min="1" max="99" value="1" placeholder="数">
      <select name="i" hidden>${ITEMS.filter(it => !it.place || it.place !== 'skin' && it.place !== 'avatar').map(it => `<option value="${it.id}">${esc(it.name)}</option>`).join('')}</select>
      <label class="nf-adm">受け取れる期間 <input name="d" type="number" min="1" max="365" value="14" style="width:5em"> 日</label>
      <button class="btn gold big">${icon('check')}内容を確認する</button>
    </form>
    <button class="link close">やめる</button>`, 'news-sheet');
  const f = el.querySelector('form');
  f.k.onchange = () => { f.i.hidden = f.k.value !== 'item'; f.n.hidden = f.k.value === 'item'; };
  el.querySelector('.close').onclick = () => el.remove();
  f.onsubmit = (e) => {
    e.preventDefault();
    const g = { title: f.t.value.trim(), kind: f.k.value, amount: f.k.value === 'item' ? 1 : Math.max(1, Math.min(99, +f.n.value || 1)), itemId: f.k.value === 'item' ? f.i.value : null, days: Math.max(1, Math.min(365, +f.d.value || 14)) };
    if (!g.title) return;
    const cf = sheet(`
      <div class="sh-head"><span class="sh-ic gold">${icon('alert')}</span><div><h3>この内容で送りますか？</h3><p>送ると、すぐにみんなに届きます（${g.days}日間）</p></div></div>
      <div class="gb-row"><span class="gb-art">${giftArt(g)}</span><span class="gb-t"><b>${esc(giftName(g))}${g.kind !== 'item' ? ' ×' + g.amount : ''}</b><small>${esc(g.title)}・運営から</small></span></div>
      <div class="row2"><button class="btn ghost back2">書きなおす</button><button class="btn gold send">${icon('check')}送る</button></div>`, 'news-sheet');
    hydrateThumbs(cf);
    cf.querySelector('.back2').onclick = () => cf.remove();
    cf.querySelector('.send').onclick = async () => {
      try {
        await rpc('sr_gift_send', { p_token: Auth.currentUser()?.token, p_title: g.title, p_kind: g.kind, p_amount: g.amount, p_item: g.itemId, p_days: g.days });
        toast('プレゼントを送りました'); cf.remove(); el.remove(); refreshGifts(true);
      } catch (ex) { toast(ex.message); }
    };
  };
}

async function refreshFriendBadge() {
  refreshNewsBadge();
  const u = Auth.currentUser();
  if (!u) return;
  try {
    const list = await rpc('sr_friend_list', { p_token: u?.token });
    friendBadge = list.filter(f => f.status === 'incoming').length;
  } catch (e) { /* オフライン */ }
}
async function showFriends() {
  const el = screenWithTabs('friends', `<h2>みんな</h2><span></span>`, 'social', `<div class="seg bagtabs soc"><button data-s="ranking" class="${'friends' === 'ranking' ? 'on' : ''}">${icon('trophy')}ランキング</button><button data-s="friends" class="${'friends' === 'friends' ? 'on' : ''}">${icon('users')}フレンド${friendBadge ? '<i class="badge">' + friendBadge + '</i>' : ''}</button></div>`+`
    <form class="addf"><input name="n" placeholder="ユーザー名で申請" maxlength="16" autocomplete="off"><button class="btn primary">${icon('userPlus')}申請</button></form>
    <div class="flist"><p class="empty">読み込み中…</p></div>`);
  bindSocialTabs(el);
  const u = Auth.currentUser();
  const listEl = el.querySelector('.flist');
  const load = async () => {
    let list = [];
    try { list = await rpc('sr_friend_list', { p_token: u?.token }); } catch (e) { listEl.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    friendBadge = list.filter(f => f.status === 'incoming').length;
    const sec = (title, arr, row) => arr.length ? `<h3 class="sec">${title}</h3>${arr.map(row).join('')}` : '';
    const lv = f => S.rankInfo(f.summary?.xp || 0).rank;
    listEl.innerHTML =
      sec('申請が来ています', list.filter(f => f.status === 'incoming'), f => `
        <div class="frow"><button class="pf-open" data-u="${esc(f.username)}" aria-label="${esc(f.username)}さんのプロフィール">${avatarHTML(f.summary || {}, 'avatar av')}</button><b class="pf-open" data-u="${esc(f.username)}">${esc(f.username)}<small>Lv${lv(f)}${f.summary?.title && titleById(f.summary.title) ? ` ・ ${esc(titleById(f.summary.title).name)}` : ''}</small></b>
          <button class="btn primary sm acc" data-u="${esc(f.username)}">${icon('check')}承認</button><button class="btn ghost sm dec" data-u="${esc(f.username)}">${icon('x')}</button></div>`) +
      sec('フレンド', list.filter(f => f.status === 'friend'), f => `
        <div class="frow"><button class="pf-open" data-u="${esc(f.username)}" aria-label="${esc(f.username)}さんのプロフィール">${avatarHTML(f.summary || {}, 'avatar av')}</button><b class="pf-open" data-u="${esc(f.username)}">${esc(f.username)}<small>${f.summary?.title && titleById(f.summary.title) ? `${esc(titleById(f.summary.title).name)} ・ ` : ''}Lv${lv(f)} ・ ${icon('flame')}${f.summary?.streak || 0}日 ・ ${f.summary?.solved || 0}問</small></b>
          <button class="btn gold sm visit" data-u="${esc(f.username)}">${icon('eye')}部屋を見る</button><button class="btn ghost sm del" data-u="${esc(f.username)}">${icon('trash')}</button></div>`) +
      sec('申請中', list.filter(f => f.status === 'outgoing'), f => `
        <div class="frow"><span class="av">${icon('user')}</span><b>${esc(f.username)}<small>承認を待っています</small></b>
          <button class="btn ghost sm del" data-u="${esc(f.username)}">取り消す</button></div>`) ||
      '<p class="empty">まだフレンドがいません。相手のユーザー名を入れて申請してみましょう。</p>';
    listEl.querySelectorAll('.acc').forEach(b => b.onclick = async () => { await rpc('sr_friend_respond', { p_token: u?.token, p_username: b.dataset.u, p_accept: true }); toast(`${b.dataset.u}さんとフレンドになりました`); load(); });
    listEl.querySelectorAll('.dec').forEach(b => b.onclick = async () => { await rpc('sr_friend_respond', { p_token: u?.token, p_username: b.dataset.u, p_accept: false }); load(); });
    listEl.querySelectorAll('.del').forEach(b => b.onclick = async () => { if (!confirm(`${b.dataset.u}さんをフレンドから外しますか？`)) return; await rpc('sr_friend_remove', { p_token: u?.token, p_username: b.dataset.u }); load(); });
    listEl.querySelectorAll('.visit').forEach(b => b.onclick = () => visitFriend(b.dataset.u));
    listEl.querySelectorAll('.pf-open').forEach(b => b.onclick = () => openUserProfile(b.dataset.u, showFriends));
  };
  el.querySelector('.addf').onsubmit = async (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    try {
      const r = await rpc('sr_friend_request', { p_token: u?.token, p_username: n });
      toast(r.status === 'accepted' ? `${n}さんとフレンドになりました` : `${n}さんに申請しました`);
      e.target.reset(); load();
    } catch (ex) { toast(ex.message); }
  };
  load();
}

// フレンド（管理者はだれでも）の部屋を見に行く（さわれない）
async function visitFriend(username, back = showFriends) {
  const u = Auth.currentUser();
  let r;
  try { r = await rpc('sr_friend_house', { p_token: u?.token, p_username: username }); } catch (e) { return toast(e.message); }
  const house = r.house;
  if (!house || !house.rooms?.length || house.v !== 2) return toast(`${username}さんの部屋はまだ準備中です`);
  visiting = { username: r.username, house, current: 0, summary: r.summary, back };
  showVisit();
}
async function showVisit() {
  const v = visiting;
  const room = v.house.rooms[v.current];
  room.surf = room.surf || { ...STARTER };
  room.placed = room.placed || [];
  if (!room3d) room3d = new Room3D(canvas);
  room3d.setActive(true);
  canvas.classList.remove('dim');
  // 今いる家（家 or 別荘）の部屋と、もう一方への切りかえ
  const home = homeOf(room.id);
  const here = v.house.rooms.map((rr, i) => ({ rr, i })).filter(x => homeOf(x.rr.id) === home);
  const other = v.house.rooms.findIndex(rr => homeOf(rr.id) !== home);
  const navHTML = here.length > 1 || other >= 0 ? `<nav class="rooms">${here.map(({ rr, i }) => `<button data-i="${i}" class="${i === v.current ? 'on' : ''}">${icon(roomDef(rr.id).icon)}${esc(roomLabel(rr))}</button>`).join('')}${other >= 0 ? `<button data-i="${other}" class="homebtn">${home === 'main' ? `${icon('palm')}別荘へ` : `${icon('home')}家へ`}</button>` : ''}</nav>` : '';
  app.innerHTML = '';
  const el = h(`
    <div class="home visiting">
      <header class="hud">
        <button class="round back" aria-label="もどる">${icon('back')}</button>
        <div class="room-name"><span class="rn-ic">${icon('user')}</span><span class="rn-t">${v.sample ? esc(v.sample) : `${esc(v.username)}さんの${esc(roomLabel(room))}`}<small>${v.sample ? `全部そろえるとこうなる ・ 家具 ${room.placed.length}個` : `Lv${S.rankInfo(v.summary?.xp || 0).rank} ・ 家具 ${room.placed.length}個`}</small></span></div>
        <button class="round photo" aria-label="写真をとる">${icon('camera')}</button>
      </header>
      ${navHTML}
      <div class="hint">見るだけの部屋です。なぞって見回せます</div>
    </div>`);
  if (v.sample) el.querySelector('.rn-ic').innerHTML = icon('star');
  el.querySelector('.back').onclick = () => leaveVisit(true);
  el.querySelector('.photo')?.addEventListener('click', photoMode);
  el.querySelector('.nx-me')?.addEventListener('click', () => showProfile(null, showHome));
  el.querySelector('.nx-menubtn')?.addEventListener('click', () => toggleNxMenu());
  el.querySelector('.nx-buy')?.addEventListener('click', buyFlow);
  el.querySelectorAll('.rooms button').forEach(b => b.onclick = () => { v.current = +b.dataset.i; showVisit(); });
  app.append(el);
  scrollRoomsNav(el);
  await room3d.show(roomDef(room.id), room, { readOnly: true });
}
async function leaveVisit(goBack) {
  const back = visiting?.back;
  visiting = null;
  if (room3d) { room3d.roomDef = null; await room3d.show(curDef(), curRoom()); }
  if (goBack && back) back();
}

// =========================== 管理者 ===========================
async function showAdmin() {
  if (!isAdmin()) return showMenu();
  const el = screenWithTabs('admin', `<button class="icon back">${icon('back')}</button><h2>管理者</h2><span></span>`, 'menu', `<div class="row2 admin-btns"><button class="btn primary compose">${icon('bell')}お知らせを書く</button><button class="btn ghost inbox">${icon('chat')}要望・バグを見る</button></div><button class="btn ghost big sendgift">${icon('gift')}みんなにプレゼントを送る</button><button class="btn ghost big errlog">${icon('info')}エラーの記録を見る</button>${EV.EVENTS.length ? `<button class="btn ghost big evpreview">${icon('snow')}${EV.previewing() ? 'イベントのためしをやめる' : `イベントをためす（${esc(EV.EVENTS.at(-1).name)}）`}</button>` : ''}<div class="alist"><p class="empty">読み込み中…</p></div>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelector('.compose').onclick = () => composeNews(showNews);
  el.querySelector('.inbox').onclick = showFeedbackInbox;
  el.querySelector('.sendgift').onclick = () => composeGift();
  el.querySelector('.errlog').onclick = showErrors;
  if (el.querySelector('.evpreview')) el.querySelector('.evpreview').onclick = () => { EV.setPreview(EV.previewing() ? null : EV.EVENTS.at(-1).id); toast(EV.previewing() ? 'この端末だけ、イベントを期間の前でもためせます' : 'イベントのためしをやめました'); showAdmin(); };
  const u = Auth.currentUser();
  let list = [];
  try { list = await rpc('sr_admin_users', { p_token: u?.token }); } catch (e) { el.querySelector('.alist').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const day = (t) => t ? new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  el.querySelector('.alist').innerHTML = `<p class="note">全 ${list.length} 人</p>` + list.map(a => {
    const s = a.summary || {};
    const units = a.units || {};
    return `<div class="acard">
      <div class="ac-top"><button class="pf-open" data-u="${esc(a.username)}" aria-label="${esc(a.username)}さんのプロフィール">${avatarHTML(s, 'avatar av')}</button><b class="pf-open" data-u="${esc(a.username)}">${esc(a.username)}${s.title && titleById(s.title) ? `<small class="ac-title">${esc(titleById(s.title).name)}</small>` : ''}</b><span class="lvb">Lv${S.rankInfo(s.xp || 0).rank}</span></div>
      <div class="ac-mode">${(() => { const sd = s.side || s.mode; return `<span class="mode-tag ${sd || 'none'}">${icon(sd === 'puzzle' ? 'grid' : sd === 'study' ? 'pencil' : 'info')}${sd === 'puzzle' ? 'パズルサイド' : sd === 'study' ? 'スタディサイド' : 'まだ選んでいない'}</span>${s.puzzle ? `<small>パズル ${s.puzzle}回</small>` : ''}<button class="btn ghost sm ac-mode-btn" data-u="${esc(a.username)}" data-m="${sd || ''}">${icon('refresh')}サイドを変える</button>`; })()}</div>
      <div class="ac-stats"><span>${icon('pencil')}${s.solved || 0}問</span><span>${icon('check')}${s.solved ? Math.round((s.correct || 0) / s.solved * 100) : 0}%</span><span>${icon('flame')}${s.streak || 0}日（合計${s.days || 0}日）</span></div>
      <div class="ac-units">${UNITS.map(un => `<span>${un} ${units[un]?.solved || 0}問</span>`).join('')}</div>
      <div class="ac-foot"><small>登録 ${day(a.created_at)} ・ 最後 ${day(a.last_login)}</small><span class="ac-btns"><button class="btn ghost sm visit" data-u="${esc(a.username)}">${icon('eye')}部屋</button><button class="btn ghost sm ac-comp" data-u="${esc(a.username)}" data-lv="${S.rankInfo(s.xp || 0).rank}">${icon('gift')}補填</button><button class="btn ghost sm ac-restore" data-u="${esc(a.username)}">${icon('refresh')}戻す</button>${Object.keys(packCode).length ? `<button class="btn ghost sm ac-give" data-u="${esc(a.username)}">${icon('gift')}問題集</button>` : ''}${a.username !== u.name ? `<button class="btn ghost sm ac-del" data-u="${esc(a.username)}" aria-label="${esc(a.username)}のアカウントを消す">${icon('trash')}消す</button>` : ''}</span></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.visit').forEach(b => b.onclick = () => visitFriend(b.dataset.u, showAdmin));
  el.querySelectorAll('.ac-del').forEach(b => b.onclick = () => confirmDeleteUser(b.dataset.u));
  el.querySelectorAll('.ac-give').forEach(b => b.onclick = () => givePack(b.dataset.u));
  el.querySelectorAll('.ac-mode-btn').forEach(b => b.onclick = () => changeMode(b.dataset.u, b.dataset.m));
  el.querySelectorAll('.ac-comp').forEach(b => b.onclick = () => compensate(b.dataset.u, +b.dataset.lv || 1));
  el.querySelectorAll('.ac-restore').forEach(b => b.onclick = () => restoreUser(b.dataset.u));
  el.querySelectorAll('.pf-open').forEach(b => b.onclick = () => openUserProfile(b.dataset.u, showAdmin));
}
// 管理者：1人だけに補填を送る（データが消えた時など）。その人のプレゼントBOXに届き、本人が受け取る
function compensate(name, lvNow) {
  const F = [['ticket', 'レアチケット'], ['ticket4', '★4以上確定チケット'], ['ticket5', '★5限定チケット'], ['exchange', '家具の引きかえ券'], ['shards4', '★4のかけら'], ['shards5', '★5のかけら']];
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('gift')}</span><div><h3>「${esc(name)}」に補填する</h3><p>その人のプレゼントBOXに届き、本人が受け取ります。いまは Lv${lvNow}</p></div><button class="sh-x close" aria-label="やめる">${icon('x')}</button></div>
    <form class="comp-form">
      <label class="comp-row"><span>レベル<small>このLvまで上げる（下がりません）</small></span><input name="lv" type="number" min="1" max="100" placeholder="${lvNow}" inputmode="numeric"></label>
      ${F.map(([k, n]) => `<label class="comp-row"><span>${n}</span><input name="${k}" type="number" min="0" max="99" placeholder="0" inputmode="numeric"></label>`).join('')}
      <label class="comp-row col"><span>家具<small>名前の一部を入れると候補が出ます（1つ）</small></span><input name="item" list="comp-items" placeholder="例：ソファ" autocomplete="off"></label>
      <datalist id="comp-items">${[...ITEMS, ...G.GACHA_ITEMS].filter((it, i, a) => a.findIndex(x => x.id === it.id) === i).map(it => `<option value="${esc(it.name)}">`).join('')}</datalist>
      <label class="comp-row col"><span>メッセージ（プレゼントBOXに出ます）</span><input name="title" value="データが消えてしまったおわび" maxlength="40"></label>
      <p class="err"></p>
      <button class="btn gold big" type="submit">${icon('gift')}確認する</button>
    </form>`, 'news-sheet comp-sheet');
  cf.querySelector('.close').onclick = () => cf.remove();
  cf.querySelector('.comp-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, gifts = [];
    const lv = Math.min(100, Math.max(0, +f.lv.value || 0));
    if (lv > lvNow) gifts.push({ kind: 'item', amount: 1, item: 'lv:' + lv, label: `Lv${lv} まで上がる` });
    for (const [k, n] of F) { const v = Math.min(99, Math.max(0, +f[k].value || 0)); if (v) gifts.push({ kind: k, amount: v, label: `${n} ×${v}` }); }
    if (f.item.value.trim()) {
      const all = [...ITEMS, ...G.GACHA_ITEMS], it = all.find(x => x.name === f.item.value.trim()) || all.find(x => x.name.includes(f.item.value.trim()));
      if (!it) { f.querySelector('.err').textContent = 'その名前の家具が見つかりません'; return; }
      gifts.push({ kind: 'item', amount: 1, item: it.id, label: it.name });
    }
    if (lv && lv <= lvNow) { f.querySelector('.err').textContent = `いまの Lv${lvNow} より大きいLvを入れてください`; return; }
    if (!gifts.length) { f.querySelector('.err').textContent = '送る物を1つ以上入れてください'; return; }
    const title = f.title.value.trim() || '補填';
    // 確認：送る前に、中身を見せる
    cf.innerHTML = `<div class="grab"></div><div class="sh-head"><span class="sh-ic">${icon('gift')}</span><div><h3>「${esc(name)}」に送りますか？</h3><p>メッセージ：${esc(title)}</p></div></div>
      <ul class="comp-sum">${gifts.map(g => `<li>${icon('check')}${esc(g.label)}</li>`).join('')}</ul>
      <div class="row2"><button class="btn ghost back2">もどる</button><button class="btn gold go">${icon('gift')}送る</button></div>`;
    cf.querySelector('.back2').onclick = () => { cf.remove(); compensate(name, lvNow); };
    cf.querySelector('.go').onclick = async () => {
      const go = cf.querySelector('.go'); go.disabled = true;
      try {
        for (const g of gifts) await rpc('sr_admin_gift_user', { p_token: Auth.currentUser()?.token, p_username: name, p_title: title, p_kind: g.kind, p_amount: g.amount, p_item: g.item || null });
        toast(`「${name}」に補填を送りました（${gifts.length}件）。次にアプリを開いた時に届きます`, 3600); cf.remove();
      } catch (ex) { toast(String(ex.message || ex), 3600); go.disabled = false; }
    };
  };
}
// 管理者：アプリで起きたエラー（この7日。同じエラーはまとめて数える）（1.12.0）
async function showErrors() {
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('info')}</span><div><h3>エラーの記録（7日）</h3><p>みんなのアプリで自動で記録されたエラーです。Claude に見せると直しやすくなります</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <div class="er-list"><p class="empty">読み込み中…</p></div>`, 'news-sheet er-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  let list = [];
  try { list = await rpc('sr_admin_errors', { p_token: Auth.currentUser()?.token }); } catch (ex) { el.querySelector('.er-list').innerHTML = `<p class="empty">${esc(ex.message)}</p>`; return; }
  const day = (t) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  el.querySelector('.er-list').innerHTML = list.length ? list.map(e => `<details class="er-row"><summary><b>${esc(e.msg)}</b><small>${e.n}回・${e.users}人・最後 ${day(e.last)}・${esc(e.version || '')}・${esc(e.place || '')}</small></summary><pre>${esc(e.stack || '')}\n${esc(e.ua || '')}</pre></details>`).join('') : '<p class="empty">この7日、エラーはありません</p>';
}
// 管理者：記録をサーバーのバックアップ（1時間ごと・14日分）から元に戻す（1.12.0）
async function restoreUser(name) {
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('refresh')}</span><div><h3>「${esc(name)}」の記録を元に戻す</h3><p>戻したい時の記録をえらびます。いまの記録もバックアップに残るので、まちがえても戻せます</p></div><button class="sh-x close" aria-label="やめる">${icon('x')}</button></div>
    <div class="rs-list"><p class="empty">読み込み中…</p></div>`, 'news-sheet rs-sheet');
  cf.querySelector('.close').onclick = () => cf.remove();
  let list = [];
  try { list = await rpc('sr_admin_backups', { p_token: Auth.currentUser()?.token, p_username: name }); }
  catch (ex) { cf.querySelector('.rs-list').innerHTML = `<p class="empty">${esc(ex.message)}</p>`; return; }
  const box = cf.querySelector('.rs-list');
  if (!list.length) { box.innerHTML = '<p class="empty">まだバックアップがありません（記録が書きかわると、1時間に1つずつ残ります）</p>'; return; }
  const when = (t) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  box.innerHTML = list.map(b => `<button class="rs-one" data-id="${b.id}"><b>${when(b.created_at)}</b><span>Lv${S.rankInfo(b.xp || 0).rank}・${b.solved || 0}問・パズル${b.puzzle || 0}回</span></button>`).join('');
  box.querySelectorAll('.rs-one').forEach(btn => btn.onclick = () => {
    const b = list.find(x => String(x.id) === btn.dataset.id);
    cf.innerHTML = `<div class="grab"></div><div class="sh-head"><span class="sh-ic">${icon('refresh')}</span><div><h3>この時の記録に戻しますか？</h3><p>${when(b.created_at)} ・ Lv${S.rankInfo(b.xp || 0).rank}・${b.solved || 0}問・パズル${b.puzzle || 0}回</p></div></div>
      <p class="note">戻した後に「${esc(name)}」がアプリを開くと、この記録になります（開いたままの時も、少しすると切りかわります）</p>
      <div class="row2"><button class="btn ghost back2">もどる</button><button class="btn gold go">${icon('refresh')}戻す</button></div>`;
    cf.querySelector('.back2').onclick = () => { cf.remove(); restoreUser(name); };
    cf.querySelector('.go').onclick = async () => {
      const go = cf.querySelector('.go'); go.disabled = true;
      try {
        await rpc('sr_admin_restore', { p_token: Auth.currentUser()?.token, p_username: name, p_backup: b.id });
        toast(`「${name}」の記録を元に戻しました`, 3200); cf.remove();
        if (name === Auth.currentUser()?.name) await Sync.pull(); else showAdmin();
      } catch (ex) { toast(String(ex.message || ex), 3600); go.disabled = false; }
    };
  });
}
// 管理者：その人のモード（勉強メイン・パズルメイン）を切りかえる。本人のアプリが次に開いた時に切りかわる
function changeMode(name, now) {
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('shield')}</span><div><h3>「${esc(name)}」のサイド</h3><p>スタディサイドは、正解${S.STUDY_PER_PUZZLE}問でパズルが1回（その日にふえるたびに、必要な数が${S.STUDY_PER_PUZZLE}問ずつ多くなる）。パズルサイドは、勉強とパズルを自由に行き来。その人が次にアプリを開いた時に切りかわります。部屋・家具・記録はそのまま</p></div></div>
    <div class="mode-pick">
      <button data-m="study" class="${now === 'study' ? 'on' : ''}"><span class="mp-ic">${icon('pencil')}</span><b>スタディサイド</b></button>
      <button data-m="puzzle" class="${now === 'puzzle' ? 'on' : ''}"><span class="mp-ic">${icon('grid')}</span><b>パズルサイド</b></button>
    </div>
    <button class="link close">やめる</button>`, 'news-sheet');
  cf.querySelector('.close').onclick = () => cf.remove();
  cf.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
    const m = b.dataset.m, t = Date.now();
    if (m === now) return cf.remove();
    cf.querySelectorAll('[data-m]').forEach(x => { x.disabled = true; });
    try {
      if (name === Auth.currentUser()?.name) { const pr = S.profile(); pr.side = m; pr.sideAt = t; setMode(m, true); S.save(); }
      else await rpc('sr_admin_set_side', { p_token: Auth.currentUser()?.token, p_username: name, p_side: m });
      toast(`「${name}」を「${m === 'puzzle' ? 'パズルサイド' : 'スタディサイド'}」にしました`); cf.remove(); showAdmin();
    } catch (ex) { toast(String(ex.message || ex), 3400); cf.querySelectorAll('[data-m]').forEach(x => { x.disabled = false; }); }
  });
}
// ---- 式の見せ方（問題集用）----
// V_GS・I_D・g_m のような記号を、教科書と同じ添え字にする（文字はすでに esc したあとに当てる）
const SUBS = 'GS|GD|DS|SB|BS|THN|TH0|TH|DD|SS|in|out|sub|mb|ox|gs|gd|ds|sb|closed|eff|be|ce|A|B|C|D|S|G|T|L|m|o|0|1|2|d|g|s|b|v';
const SUB_RE = new RegExp(`(^|[^A-Za-z0-9_])([VIRgrACvi])(${SUBS})(\\*?)(?![A-Za-z0-9])`, 'g');
function fmtMath(t) {
  return esc(t)
    .replace(SUB_RE, (m0, pre, b, sub, star) => `${pre}<i class="mv">${b}<sub>${sub}</sub>${star}</i>`)
    .replace(/φF/g, '<i class="mv">φ<sub>F</sub></i>').replace(/ε0/g, '<i class="mv">ε<sub>0</sub></i>')
    .replace(/\^\(([^)]{1,12})\)/g, '<sup>$1</sup>').replace(/\^(-?[0-9a-zA-Zωφθ.]{1,6})/g, '<sup>$1</sup>');
}
// 解説：1文ずつ行に分け、式（＝をふくむ文）は色を変えて目立たせる
function explainHTML(text) {
  const parts = String(text || '').split(/(?<=。)/).map(x => x.trim()).filter(Boolean);
  return `<ul class="ex-list">${parts.map(x => `<li class="${/[＝=≈]/.test(x) ? 'eq' : ''}">${fmtMath(x)}</li>`).join('')}</ul>`;
}

// 管理者：自分が開いている問題集を、ほかの人に渡す（その人がコードを入れたのと同じになる）
function givePack(name) {
  const sids = Object.keys(packCode);
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('gift')}</span><div><h3>「${esc(name)}」に問題集を渡す</h3><p>渡すと、次にアプリを開いた時に教科えらびに増えます</p></div></div>
    <div class="give-list">${sids.map(sid => `<button class="btn ghost give-one" data-s="${sid}">${icon(SUBJECT_ICON[sid] || 'star')}${esc(packOf[sid].name)}<small>${probs(sid).length}問</small></button>`).join('')}</div>
    <button class="link close">やめる</button>`, 'news-sheet give-sheet');
  cf.querySelector('.close').onclick = () => cf.remove();
  cf.querySelectorAll('.give-one').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await rpc('sr_admin_grant_code', { p_token: Auth.currentUser()?.token, p_username: name, p_code: packCode[b.dataset.s] });
      toast(`「${name}」に「${packOf[b.dataset.s].name}」を渡しました`); cf.remove();
    } catch (ex) {
      const m = String(ex.message || ex);
      toast(m, 3400);
      b.disabled = false;
    }
  });
}
// 管理者：アカウントを消す。まちがえないよう、名前を打ちこんでから消す
function confirmDeleteUser(name) {
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic danger">${icon('trash')}</span><div><h3>「${esc(name)}」を消しますか？</h3><p>部屋・記録・フレンドのつながりも消えます。元には戻せません</p></div></div>
    <label class="del-lbl">確かめのため、名前「${esc(name)}」を打ちこんでください
      <input class="del-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(name)}"></label>
    <div class="row2"><button class="btn ghost back2">やめる</button><button class="btn danger go" disabled>${icon('trash')}消す</button></div>`, 'news-sheet del-sheet');
  const inp = cf.querySelector('.del-in'), go = cf.querySelector('.go');
  inp.oninput = () => { go.disabled = inp.value.trim() !== name; };
  cf.querySelector('.back2').onclick = () => cf.remove();
  go.onclick = async () => {
    go.disabled = true;
    try {
      await rpc('sr_admin_delete_user', { p_token: Auth.currentUser()?.token, p_username: name });
      toast(`「${name}」を消しました`); cf.remove(); showAdmin();
    } catch (ex) {
      const m = String(ex.message || ex);
      toast(m, 3400);
      go.disabled = false;
    }
  };
}

// =========================== 設定 ===========================
// 復元コード：パスワードを忘れた時に、これで新しいパスワードにできる（1.12.0）
function showRecovery() {
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('lock')}</span><div><h3>パスワードの復元コード</h3><p>パスワードを忘れた時、ログイン画面の「パスワードを忘れた」で、このコードを入れると新しいパスワードにできます</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <div class="rc-box"><p class="note">コードは作った時に一度だけ出ます。スクリーンショットかメモで、なくさない所にとっておいてください。作りなおすと、前のコードは使えなくなります。</p></div>
    <button class="btn gold big rc-make">${icon('lock')}復元コードを作る</button>`, 'news-sheet rc-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelector('.rc-make').onclick = async () => {
    const b = el.querySelector('.rc-make'); b.disabled = true;
    try {
      const r = await rpc('sr_recovery_make', { p_token: Auth.currentUser()?.token });
      el.querySelector('.rc-box').innerHTML = `<div class="rc-code">${esc(r.code)}</div><p class="note">ユーザー名「${esc(user.name)}」の復元コードです。この画面を閉じると、もう見られません。</p><button class="btn ghost rc-copy">${icon('check')}コピーする</button>`;
      el.querySelector('.rc-copy').onclick = async () => { try { await navigator.clipboard.writeText(`ROOMIN ${user.name} 復元コード ${r.code}`); toast('コピーしました'); } catch (e) { toast('コピーできませんでした。スクリーンショットでとっておいてください'); } };
      b.remove();
    } catch (ex) { toast(ex.message, 3000); b.disabled = false; }
  };
}
// ブロックしている人の一覧（解除できる）
async function showBlocks() {
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('shield')}</span><div><h3>ブロックしている人</h3><p>ブロックした人は、フレンド申請ができず、ランキングにも出ません</p></div><button class="sh-x close" aria-label="とじる">${icon('x')}</button></div>
    <div class="bl-list"><p class="empty">読み込み中…</p></div>`, 'news-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  let list = [];
  try { list = await rpc('sr_block_list', { p_token: Auth.currentUser()?.token }); blockedNames = new Set(list); } catch (ex) { el.querySelector('.bl-list').innerHTML = `<p class="empty">${esc(ex.message)}</p>`; return; }
  el.querySelector('.bl-list').innerHTML = list.length ? list.map(n => `<div class="bl-row"><b>${esc(n)}</b><button class="btn ghost sm unb" data-u="${esc(n)}">解除</button></div>`).join('') : '<p class="empty">ブロックしている人はいません</p>';
  el.querySelectorAll('.unb').forEach(b => b.onclick = async () => { b.disabled = true; try { await rpc('sr_unblock', { p_token: Auth.currentUser()?.token, p_username: b.dataset.u }); blockedNames.delete(b.dataset.u); toast(`「${b.dataset.u}」のブロックを解除しました`); el.remove(); showBlocks(); } catch (ex) { toast(ex.message); b.disabled = false; } });
}
let blockedNames = new Set();
async function loadBlocks() { try { blockedNames = new Set(await rpc('sr_block_list', { p_token: Auth.currentUser()?.token })); } catch (e) { /* なし */ } }
// 自分でアカウントを消す（パスワードを入れて確かめる）
function confirmDeleteMe() {
  const cf = sheet(`
    <div class="sh-head"><span class="sh-ic danger">${icon('trash')}</span><div><h3>アカウントを消しますか？</h3><p>記録・部屋・家具・アイテム・フレンドのつながりがすべて消え、元に戻せません</p></div></div>
    <label class="del-lbl">確かめのため、パスワードを入れてください<input class="del-in" type="password" autocomplete="current-password"></label>
    <p class="err"></p>
    <div class="row2"><button class="btn ghost back2">やめる</button><button class="btn danger go" disabled>${icon('trash')}消す</button></div>`, 'news-sheet del-sheet');
  const inp = cf.querySelector('.del-in'), go = cf.querySelector('.go');
  inp.oninput = () => { go.disabled = inp.value.length < 4; };
  cf.querySelector('.back2').onclick = () => cf.remove();
  go.onclick = async () => {
    go.disabled = true;
    try {
      await rpc('sr_delete_me', { p_token: Auth.currentUser()?.token, p_password: inp.value });
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('studyroom.v1.user.') || k.startsWith('studyroom.backup.')) localStorage.removeItem(k); } catch (e) { /* なし */ }
      Auth.forget(); cf.remove(); showLogin('signup');
      toast('アカウントを消しました。ご利用ありがとうございました', 4000);
    } catch (ex) { cf.querySelector('.err').textContent = ex.code === 'bad_login' ? 'パスワードがちがいます' : ex.message; go.disabled = false; }
  };
}

function showSettings() {
  let q = 'low';
  try { q = localStorage.getItem('studyroom.quality') || 'low'; } catch (e) { /* なし */ }
  const ver = (() => { try { return localStorage.getItem('studyroom.version') || ''; } catch (e) { return ''; } })();
  const el = screenWithTabs('settings', `<button class="icon back">${icon('back')}</button><h2>設定</h2><span></span>`, 'menu', `
    <section class="group g-user">
      <div class="row-item"><span class="lbl">ユーザー</span><span class="val">${esc(user.name)}${isAdmin() ? '（管理者）' : ''}</span></div>
      <div class="row-item"><span class="lbl">保存</span><span class="val sync"></span></div>
    </section>
    <section class="group codes">
      <div class="row-item col"><span class="lbl">テスト勉強のコード</span>
        <small class="code-note">コードを入れると、教科えらびにテスト勉強用の科目が増えます</small>
        <form class="code-form"><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="コードを入力"><button class="btn primary sm">入れる</button></form>
        <div class="code-list">${SUBJECTS.filter(x => x.pack).map(x => `<span class="code-chip">${icon(SUBJECT_ICON[x.id] || 'star')}${esc(x.name)}<small>${probs(x.id).length}問</small></span>`).join('')}</div>
      </div>
    </section>
    <section class="group g-view">
      <div class="row-item col"><span class="lbl">画質</span>
        <div class="seg">${[['high', 'きれい'], ['mid', 'ふつう'], ['low', 'かるい']].map(([k, n]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${n}</button>`).join('')}</div>
        <small>カクカクするときは「ふつう」か「かるい」に</small></div>
      ${DL.canDownload() ? `<button class="row-item tap dl"><span class="lbl">家具のデータ</span><span class="val">${DL.downloadState() === 'done' ? '保存ずみ' : 'まとめて保存する'}</span></button>` : ''}
    </section>
    <section class="group bgm-set">
      <div class="row-item col"><span class="lbl">${icon('music')}BGM</span>
        <div class="seg bgm-on">${[[true, 'オン'], [false, 'オフ']].map(([v, n]) => `<button data-on="${v}" class="${BGM.settings().on === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label class="bgm-vol">音量<input type="range" id="bgm-vol" min="0" max="100" step="5" value="${Math.round(BGM.settings().vol * 100)}"><b>${Math.round(BGM.settings().vol * 100)}</b></label>
        <label class="bgm-track">曲<select id="bgm-track">${BGM.TRACKS.map(([k, n]) => `<option value="${k}" ${BGM.settings().track === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <small>自動のときは、部屋の時間と天気で曲が変わります。問題やパズルを解いている間は小さくなります</small></div>
    </section>
    ${isAdmin() ? `<section class="group admin-only">
      <div class="row-item col"><span class="lbl">${icon('shield')}レベル（管理者だけ）</span>
        <div class="lvctl"><button class="lvm">${icon('back')}</button><b class="lvv">Lv${rankNow().rank}</b><button class="lvp">${icon('chevronRight')}</button>
          <input class="lvin" type="number" min="1" max="99" value="${rankNow().rank}"><button class="btn ghost sm lvset">この Lv にする</button></div>
        <small>経験値はその Lv のはじめの値になります。新しい部屋や置ける数もすぐ変わります</small></div>
    </section>` : ''}
    <section class="group acct">
      <button class="row-item tap recov"><span class="lbl">${icon('lock')}パスワードの復元コード</span><span class="val rc-st">…</span>${icon('chevronRight')}</button>
      <button class="row-item tap blocks"><span class="lbl">${icon('shield')}ブロックしている人</span>${icon('chevronRight')}</button>
      <a class="row-item tap" href="legal/terms.html" target="_blank" rel="noopener"><span class="lbl">${icon('book')}利用規約</span>${icon('chevronRight')}</a>
      <a class="row-item tap" href="legal/privacy.html" target="_blank" rel="noopener"><span class="lbl">${icon('book')}プライバシーポリシー</span>${icon('chevronRight')}</a>
    </section>
    ${isAdmin() ? `<section class="group g-uinext"><button class="row-item tap uinext-tg"><span class="lbl">${icon('palette')}新しいデザイン</span><span class="val">${UINEXT ? 'オン' : 'オフ'}</span>${icon('chevronRight')}</button></section>` : ''}
    <section class="group g-tour">
      <button class="row-item tap tour-again"><span class="lbl">${icon('info')}使い方の案内をもう一度見る</span>${icon('chevronRight')}</button>
    </section>
    <section class="group">
      <button class="row-item tap logout"><span class="lbl danger">${icon('logout')}ログアウト</span></button>
    </section>
    ${!isAdmin() ? `<section class="group"><button class="row-item tap del-me"><span class="lbl danger">${icon('trash')}アカウントを消す</span></button></section>` : ''}
    ${isAdmin() ? `<section class="group">
      <button class="row-item tap reset-all"><span class="lbl danger">${icon('trash')}最初からやり直す（管理者）</span></button>
    </section>` : ''}
    <p class="ver">ROOMIN ${esc(ver)}</p>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelectorAll('.bgm-on button').forEach(b => b.onclick = () => {
    BGM.setOn(b.dataset.on === 'true');
    el.querySelectorAll('.bgm-on button').forEach(x => x.classList.toggle('on', x === b));
  });
  const vol = el.querySelector('#bgm-vol');
  vol.oninput = () => { BGM.setVolume(vol.value / 100); vol.nextElementSibling.textContent = vol.value; };
  el.querySelector('#bgm-track').onchange = (e) => BGM.setTrack(e.target.value);
  el.querySelectorAll('.seg button[data-q]').forEach(b => b.onclick = () => {
    if ((b.dataset.q === 'low') !== isLite()) toast('家具や壁の質感は、次にアプリを開いた時から変わります', 2600);
    try { localStorage.setItem('studyroom.quality', b.dataset.q); } catch (e) { /* なし */ }
    room3d?.setQuality(b.dataset.q);
    el.querySelectorAll('.seg button[data-q]').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelector('.dl')?.addEventListener('click', () => { if (DL.downloadState() !== 'done') showDownload(); });
  // テスト勉強のコード
  el.querySelector('.code-form').onsubmit = async (e) => {
    e.preventDefault();
    const inp = e.target.code, code = inp.value.trim();
    if (!code) return;
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const found = await openCode(code).catch(() => []);
    btn.disabled = false;
    if (!found.length) { toast('そのコードは見つかりません。もう一度たしかめてください', 2800); vibrate(60); return; }
    const pr = S.profile();
    const { normCode } = await import('./packcrypt.js');
    pr.codes = [...new Set([...(pr.codes || []), normCode(code)])];
    found.forEach(p => { const sid = addPack(p); if (sid) packCode[sid] = normCode(code); });
    S.save(); Sync.push?.();
    vibrate([20, 40, 20]);
    toast(`「${found.map(p => p.name).join('」「')}」が教科えらびに増えました`, 3200);
    showSettings();
  };
  el.querySelector('.logout').onclick = async () => { await Sync.push(); Auth.logOut(); showLogin(); };
  el.querySelector('.recov').onclick = showRecovery;
  if (UINEXT) {
    // 新しいデザイン：4つのまとまりに分けて、見出しをつける（1.12.0）
    const body = el.querySelector('.g-user')?.parentElement;
    const anchor = el.querySelector('.logout')?.closest('.group');
    const put = (title, sels) => { body.insertBefore(h(`<p class="nx-gh">${title}</p>`), anchor); for (const q of sels) { const g = el.querySelector(q); if (g) body.insertBefore(g, anchor); } };
    put('アカウント', ['.g-user', '.acct']);
    put('画面と音', ['.g-view', '.bgm-set']);
    put('学習', ['.codes', '.g-tour']);
    if (isAdmin()) put('管理者', ['.admin-only', '.g-uinext']);
  }
  el.querySelector('.uinext-tg')?.addEventListener('click', () => { try { localStorage.setItem('studyroom.uinext', UINEXT ? '0' : '1'); } catch (e) { /* なし */ } toast(UINEXT ? '前のデザインにもどします（この端末だけ）' : '新しいデザインにします', 1200); setTimeout(() => location.reload(), 900); });
  el.querySelector('.blocks').onclick = showBlocks;
  el.querySelector('.del-me')?.addEventListener('click', confirmDeleteMe);
  rpc('sr_recovery_status', { p_token: Auth.currentUser()?.token }).then(r => { const v = el.querySelector('.rc-st'); if (v) { v.textContent = r.has ? '作ってある' : (UINEXT ? 'まだ' : 'まだ作っていない'); v.classList.toggle('warn', !r.has); } }).catch(() => { const v = el.querySelector('.rc-st'); if (v) v.textContent = ''; });
  el.querySelector('.tour-again').onclick = () => { showHome(); setTimeout(() => startTour(true), 500); };
  // 管理者だけ：記録をすべて消して最初から（ログインはそのまま）
  el.querySelector('.reset-all')?.addEventListener('click', async () => {
    if (!isAdmin()) return;
    if (!confirm('本当に最初からやり直しますか？家具・ランク・記録がすべて消えます')) return;
    if (!confirm('もう一度確認：元に戻せません。やり直しますか？')) return;
    S.resetAll();
    try { await Sync.push(); } catch (e) { /* つながらなければ、あとで送られる */ }
    location.reload();
  });
  // 管理者：レベルを自由に変える
  const setLv = (L) => {
    if (!isAdmin()) return;
    S.setRank(L);
    ensureRooms();
    S.save();
    el.querySelector('.lvv').textContent = 'Lv' + rankNow().rank;
    el.querySelector('.lvin').value = rankNow().rank;
    toast(`Lv${rankNow().rank} にしました（置ける数 ${S.capacity()}個）`);
  };
  el.querySelector('.lvm')?.addEventListener('click', () => setLv(rankNow().rank - 1));
  el.querySelector('.lvp')?.addEventListener('click', () => setLv(rankNow().rank + 1));
  el.querySelector('.lvset')?.addEventListener('click', () => setLv(+el.querySelector('.lvin').value || 1));
  paintSync();
}

// =========================== 問題を解く ===========================
// みんなの単元ごとの「ふつうの時間」（1.14.0）。アプリを開いて最初に解く時に1回だけ読む（失敗しても、★の表の秒数を使う）
let unitTimesLoaded = false;
function loadUnitTimes() {
  if (unitTimesLoaded || !Auth.currentUser()?.token) return;
  unitTimesLoaded = true;
  rpc('sr_unit_times', {}).then(m => S.setUnitTimes(m)).catch(() => { unitTimesLoaded = false; });
}
async function startSet() {
  loadUnitTimes();
  BGM.duck(true); // 解いている間は BGM を小さく
  await loadBank(subjectId); // 問題バンクの問題が入ったセットの続きでも、問題が見つかるように
  const st = sub();
  if (st.scope?.wrong && !(st.session && st.session.idx < st.session.set.length) && !S.wrongList(st, probs(subjectId)).length) {
    st.scope = null; S.save(); toast('まちがえた問題を、ぜんぶ克服しました！', 3000);
    BGM.duck(false); return showHome();
  }
  if (!(st.session && st.session.idx < st.session.set.length)) {
    const set = S.buildSet(st, scoped());
    if (st.scope?.wrong) set.forEach(x => { x.review = true; }); // 正解するたびに克服に近づく
    st.session = { set, idx: 0, results: [], gained: 0, xp: 0, rankUp: false, startedAt: Date.now(), bonus: S.solvedToday() < S.BONUS_PER_DAY };
    S.save();
  }
  S.profile().lastStudy = { sid: subjectId, scope: st.scope || null }; // 「前回のつづき」用（1.12.0）
  room3d.setActive(false);
  canvas.classList.add('dim');
  nextProblem();
}

function nextProblem() {
  const st = sub();
  const ss = st.session;
  if (ss.idx >= ss.set.length) return endOne(true);
  const item = ss.set[ss.idx];
  const p = byId[item.id];
  if (!p) { ss.idx++; return nextProblem(); }
  if (p.choices) return runChoice(p, item.review);
  runProblem(p, item.review, false);
}

function symbolColors(p) {
  const syms = [];
  for (const q of [...p.quantities, p.target, ...p.formulaSymbols]) if (!syms.includes(q.symbol)) syms.push(q.symbol);
  return Object.fromEntries(syms.map((s, i) => [s, COLORS[i % COLORS.length]]));
}

// 問題文を、数値の部分ごとに区切る
function segments(p) {
  const marks = [...p.quantities.map((q, i) => ({ ...q, key: 'q' + i })), { ...p.target, key: 't', isTarget: true }]
    .map(q => ({ ...q, at: p.text.indexOf(q.phrase) }))
    .sort((a, b) => a.at - b.at);
  const segs = [];
  let pos = 0;
  for (const m of marks) {
    if (m.at < pos) continue;
    if (m.at > pos) segs.push({ text: p.text.slice(pos, m.at) });
    segs.push({ text: m.phrase, mark: m });
    pos = m.at + m.phrase.length;
  }
  if (pos < p.text.length) segs.push({ text: p.text.slice(pos) });
  return { segs, order: marks.filter(m => !m.isTarget).concat(marks.filter(m => m.isTarget)) };
}

function colorFormula(expr, colors) {
  const keys = Object.keys(colors).sort((a, b) => b.length - a.length);
  let out = '', i = 0;
  while (i < expr.length) {
    const k = keys.find(k => expr.startsWith(k, i));
    if (k) { out += `<b style="color:${colors[k]}">${esc(k)}</b>`; i += k.length; }
    else { out += esc(expr[i]); i++; }
  }
  return out;
}

function runProblem(p, isReview, retry) {
  const st = sub();
  const ss = st.session;
  const colors = symbolColors(p);
  const { segs, order } = segments(p);
  const assigned = {};
  let cur = 0, step1Miss = false, missesHere = 0;
  const t0 = Date.now();

  // 文字ボタン：正解の文字＋ダミー
  const need = [...new Set(order.map(m => m.symbol))];
  const pool = (SYMBOLS[p.unit] || []).filter(s => !need.includes(s));
  const palette = S.shuffle([...need, ...S.shuffle(pool).slice(0, Math.max(2, 7 - need.length))]);

  app.innerHTML = '';
  const el = h(`
    <div class="screen quiz">
      <header class="bar">
        <button class="icon back" aria-label="部屋にもどる">${icon('x')}</button>
        <div class="qprog"><i style="width:${ss.idx / ss.set.length * 100}%"></i></div>
        <span class="tag">${isReview ? `${icon('refresh')}復習` : p.unit}${retry ? '・確認' : ''}</span>
      </header>
      ${retry ? `<div class="hintbox">正しい公式：<span class="fx">${colorFormula(p.formula.expr, colors)}</span>　同じ色の部分が、問題文のどこにあたるか見ながら解いてください。</div>` : ''}
      ${p.verified ? '' : `<div class="warnbox">${icon('alert')}この問題は答えが未確認です。先生や友達に確認してみてください。</div>`}
      <div class="problem"></div>
      <div class="step"></div>
    </div>`);
  app.append(el);
  el.querySelector('.back').onclick = () => { S.save(); showHome(); };
  const probEl = el.querySelector('.problem');
  const stepEl = el.querySelector('.step');

  function renderText(showColors) {
    probEl.innerHTML = segs.map(s => {
      if (!s.mark) return esc(s.text);
      const m = s.mark;
      const active = !showColors && order[cur] === m;
      const a = assigned[m.key];
      const col = (showColors || retry) ? colors[m.symbol] : null;
      return `<span class="ph ${active ? 'active' : ''} ${m.hidden ? 'hidden-cond' : ''} ${a ? 'set' : ''}" data-k="${m.key}"
        ${col ? `style="--c:${col}"` : ''}>${esc(s.text)}${a ? `<sup>${esc(a)}</sup>` : ''}</span>`;
    }).join('');
  }

  function step1() {
    if (cur >= order.length) return step2();
    const m = order[cur];
    renderText(false);
    stepEl.innerHTML = `
      <p class="ask">${m.isTarget ? '<b>求めるもの</b>は、どの文字？' : m.hidden ? '<b>数字は書いてない</b>けど、文字があてはまる条件です。どの文字？' : '光っている部分は、どの文字？'}</p>
      <div class="palette">${palette.map(s => `<button class="sym">${esc(s)}</button>`).join('')}</div>
      <p class="hint2"></p>`;
    stepEl.querySelectorAll('.sym').forEach(b => b.onclick = () => {
      if (b.textContent === m.symbol) {
        assigned[m.key] = m.symbol;
        missesHere = 0;
        vibrate(15);
        cur++;
        step1();
      } else {
        step1Miss = true; missesHere++;
        b.classList.add('wrong');
        probEl.querySelector('.ph.active')?.classList.add('shake');
        setTimeout(() => probEl.querySelector('.ph.active')?.classList.remove('shake'), 400);
        vibrate(60);
        stepEl.querySelector('.hint2').textContent = missesHere >= 2 ? `ヒント：これは「${m.meaning}」です` : 'ちがうみたい。もう一度！';
      }
    });
  }

  function step2() {
    renderText(false);
    const cards = S.shuffle([p.formula.expr, ...p.distractors.slice(0, 3)]);
    stepEl.innerHTML = `
      <p class="ask">使う<b>公式</b>はどれ？</p>
      <div class="cards">${cards.map(c => `<button class="fcard">${esc(c)}</button>`).join('')}</div>`;
    stepEl.querySelectorAll('.fcard').forEach(b => b.onclick = () => {
      const ok = b.textContent === p.formula.expr;
      b.classList.add(ok ? 'right' : 'wrong');
      stepEl.querySelectorAll('.fcard').forEach(x => x.disabled = true);
      setTimeout(() => result(ok), ok ? 350 : 500);
    });
  }

  function result(ok) {
    const secs = (Date.now() - t0) / 1000;
    const perfect = ok && !step1Miss;
    let pts = 0, mastered = false, xp = null;
    if (!retry) {
      ({ pts, xp, mastered } = awardResult(st, ss, p, perfect, ok, isReview, secs));
      S.save();
    }
    renderText(!ok || retry);
    const fx = colorFormula(p.formula.expr, colors);
    const xpLine = xp ? `<div class="xpgain">${icon('level')}+${xp.gained} XP${xp.rankUp ? `<b>Lv${xp.rank}にアップ！</b>` : ''}</div>` : '';
    if (ok) {
      vibrate(perfect ? [20, 30, 20] : 20);
      stepEl.innerHTML = `
        <div class="res ok">
          <div class="ttl">${retry ? '確認できました' : perfect ? '正解！' : '正解（文字は1回まちがい）'}</div>
          ${!retry ? `<div class="pts">+${pts}<small>ゲージ（むずかしい問題ほど多い）${ss.bonus && pts ? '・今日の最初の5問 ×1.5' : ''}</small></div>${gaugeNote(ss)}` : ''}
          ${xpLine}
          ${mastered ? `<div class="master">${icon('trophy')}克服しました！ 特別な家具がもらえます</div>` : ''}
          <div class="formula">${fx}<small>${esc(p.formula.name)}</small></div>
          <button class="link why">なぜこの公式？</button>
          <p class="reason hide">${esc(p.reason)}</p>
          ${ss.rewards && (ss.rewards.ticket || ss.rewards.ticket4 || ss.rewards.ticket5) ? `<div class="ru-tickets">${['ticket', 'ticket4', 'ticket5'].filter(k => ss.rewards[k]).map(k => `<span>${ticketSVG(k, 'mini')}<b>×${ss.rewards[k]}</b></span>`).join('')}<small class="ru-box">${icon('gift')}プレゼントBOXに届きました</small></div>` : ''}
          ${HS().gauge >= S.gaugeMax(HS()) ? `<div class="gold-t">${icon('gift')}ゲージ満タン！ 家具が買えます</div>` : ''}
          <div class="row2 after"><button class="btn ghost home">${icon('home')}部屋にもどる</button><button class="btn primary more">${icon('pencil')}もう1問</button></div>
        </div>`;
      stepEl.querySelector('.why').onclick = (e) => { stepEl.querySelector('.reason').classList.toggle('hide'); e.target.remove(); };
      stepEl.querySelector('.home').onclick = () => endOne(true);
      stepEl.querySelector('.more').onclick = () => endOne(false); bindGaugeNote(stepEl);
    } else {
      vibrate([60, 40, 60]);
      const legend = [...p.quantities, p.target, ...p.formulaSymbols]
        .map(q => `<li><b style="color:${colors[q.symbol]}">${esc(q.symbol)}</b> … ${esc(q.meaning)}${q.phrase ? `（「${esc(q.phrase)}」）` : ''}</li>`).join('');
      stepEl.innerHTML = `
        <div class="res ng">
          <div class="ttl">おしい！ 正しい公式はこれ</div>
          ${!retry && pts ? `<div class="pts">+${pts}<small>ゲージ（考えたぶん）</small></div>${gaugeNote(ss)}` : ''}
          ${xpLine}
          <div class="formula">${fx}<small>${esc(p.formula.name)}</small></div>
          <ul class="legend">${legend}</ul>
          <p class="reason">${esc(p.reason)}</p>
          <button class="btn primary big again">見ながら もう一度</button>
        </div>`;
      stepEl.querySelector('.again').onclick = () => runProblem(p, isReview, true); bindGaugeNote(stepEl);
    }
  }

  step1();
}

// 倍率を決める教科（テスト勉強の問題集はのぞく）
const multSids = () => SUBJECTS.filter(s0 => !s0.pack).map(s0 => s0.id);
// 答えたあとの「ゲージ」の説明（1.13.0）。減っている時は、ほかの教科・単元をすすめる
function gaugeNote(ss) {
  const gf = ss.gf; if (!gf) return '';
  const parts = [];
  if (gf.mult > 1) parts.push(`おすすめの教科 ×${gf.mult}`);
  if (gf.repeat) parts.push('今日もう正解した問題なので少なめ');
  let html = parts.length ? `<small class="gf-note">${parts.join('・')}</small>` : '';
  if (gf.decayed) {
    const rec = recommendSubject();
    html += `<div class="gf-decay">${icon('info')}<span class="gf-t">${gf.subjDecayed ? '同じ教科' : '同じ単元'}が続いているので、ゲージが少なめです。${gf.subjDecayed ? 'ほかの教科' : 'ほかの単元や教科'}だと多くたまります</span>${rec ? `<button class="link gf-go" data-s="${rec.id}">${icon('pencil')}${esc(rec.name)}${rec.mult > 1 ? ` ×${rec.mult}` : ''}</button>` : ''}</div>`;
  }
  return html;
}
// おすすめの教科（倍率がいちばん高く、今日あまりやっていない教科）
function recommendSubject() {
  const ms = S.subjectMults(multSids());
  const list = SUBJECTS.filter(s0 => !s0.pack && s0.id !== subjectId && probs(s0.id).length).map(s0 => ({ id: s0.id, name: s0.name, mult: ms[s0.id]?.mult || 1, min: S.todayUse(s0.id, '').min }));
  list.sort((a, b) => b.mult - a.mult || a.min - b.min);
  return list[0] || null;
}
function bindGaugeNote(root) {
  root.querySelector('.gf-go')?.addEventListener('click', (e) => { const sid = e.currentTarget.dataset.s; endOne(true); setTimeout(() => { subjectId = sid; chooseSubject?.(); }, 80); });
}
// 1問の結果から、ゲージ・経験値・チケットなどのごほうびを出して記録する（物理も4択も共通）
function awardResult(st, ss, p, perfect, ok, isReview, secs) {
  let pts = 0, mastered = false, xp = null;
      // 1.13.0：教科の倍率（おすすめ）・同じ教科／単元が続くと減る・その日もう正解した問題は3割
      const gf = S.gaugeFactor({ sid: subjectId, unit: p.unit, sub: st, id: p.id, sids: multSids() });
      pts = Math.round(S.gaugePoints(perfect, ok && !perfect, secs, subjectId, p.level, p.unit) * gf.f);
      if (ss.bonus) pts = Math.round(pts * 1.5);
      ss.gf = gf;
      S.logTime(subjectId, p.unit, secs);
      HS().gauge += pts;
      S.addPoints(pts); // ランキングのポイント
      ss.gained += pts;
      const tBefore = { solved: S.profile().solved, streak: S.currentStreak(), mastered: S.stats(st, probs()).mastered };
      ({ mastered } = S.recordResult(st, p.id, perfect, isReview));
      if (mastered) HS().pendingSpecials++;
      xp = S.addAnswer(st, p.unit, perfect ? 'perfect' : ok ? 'ok' : 'wrong');
      S.logDay({ sid: subjectId, unit: p.unit, ok });
      evToast(EV.addPoints(ok ? EV.POINTS.right : EV.POINTS.wrong));
      if (S.countStudyForPuzzle(ok)) setTimeout(() => toast('パズルが1回できるようになりました', 2400), 1200);
      const firstPlay = S.markPlayedToday();
      // 50問ごと・連続7日ごと・克服でたまにレアチケット
      const earned = G.ticketsEarned(tBefore, { solved: S.profile().solved, streak: S.currentStreak(), mastered: S.stats(st, probs()).mastered });
      if (earned > 0) {
        S.addGift({ kind: 'ticket', amount: earned, title: 'がんばったごほうび', from: 'play' });
        xp.rewards = xp.rewards || { ticket: 0, ticket4: 0, ticket5: 0 };
        xp.rewards.ticket += earned;
      }
      if (xp.rewards) {
        const sr = ss.rewards || (ss.rewards = { ticket: 0, ticket4: 0, ticket5: 0 });
        for (const k of Object.keys(sr)) sr[k] += xp.rewards[k] || 0;
      }
      ss.xp = (ss.xp || 0) + xp.gained;
      if (xp.rankUp) ss.rankUp = true;
      ss.results.push({ id: p.id, perfect, ok, mastered });
      const first = firstPlay;
      if (first) toast(`連続 ${S.currentStreak()}日目！`);
      S.save();
  return { pts, xp, mastered };
}

// 関数電卓（1.14.0）：数学・物理の4択で出す。履歴は、アプリを開いている間は問題をまたいで残る
const CALC_SUBJECTS = ['math', 'physics4'];
const calcStore = { hist: [], ans: 0 };
// 4択の問題（物理以外の教科）
function runChoice(p, isReview) {
  // テスト勉強の問題集（電子回路など）は、記号を添え字にして・解説を1文ずつにして見やすくする
  const fx = !!SUBJECTS.find(x => x.id === subjectId)?.pack;
  const fm = fx ? fmtMath : esc;
  const st = sub();
  const ss = st.session;
  const t0 = Date.now();
  const order = S.shuffle([0, 1, 2, 3]);
  app.innerHTML = '';
  const el = h(`
    <div class="screen quiz choice">
      <header class="bar">
        <button class="icon back" aria-label="部屋にもどる">${icon('x')}</button>
        ${UINEXT ? `<span class="nx-today">${S.solvedToday() < S.BONUS_PER_DAY ? `今日 ${S.solvedToday()} / ${S.BONUS_PER_DAY}問<small>ボーナス中</small>` : `今日 ${S.solvedToday()}問`}</span>` : `<div class="qprog"><i style="width:${ss.idx / ss.set.length * 100}%"></i></div>`}
        <span class="tag">${isReview ? `${icon('refresh')}復習` : esc(p.unit)}</span>
      </header>
      <div class="problem ${fx ? 'fx' : ''}">${fm(p.text).replace(/\n/g, '<br>')}</div>
      ${CALC_SUBJECTS.includes(subjectId) || p.steps ? `<div class="calc-row">${p.steps ? `<button class="calc-btn steps-btn">${icon('level')}段階に分けて解く</button>` : ''}${CALC_SUBJECTS.includes(subjectId) ? `<button class="calc-btn" aria-label="電卓をひらく">${icon('calc')}電卓</button>` : ''}</div>` : ''}
      <div class="step">
        <p class="ask">正しいものを <b>1つ</b> 選ぼう</p>
        <div class="cards ch4">${order.map(i => `<button class="fcard" data-i="${i}">${fm(p.choices[i])}</button>`).join('')}</div>
      </div>
    </div>`);
  app.append(el);
  el.querySelector('.back').onclick = () => { Calc.closeCalc(); S.save(); showHome(); };
  el.querySelector('.calc-btn:not(.steps-btn)')?.addEventListener('click', (e) => Calc.openCalc({ screen: el, problem: el.querySelector('.problem'), btn: e.currentTarget, store: calcStore }));
  const stepEl = el.querySelector('.step');
  const bindCards = () => stepEl.querySelectorAll('.fcard').forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === p.answer;
    stepEl.querySelectorAll('.fcard').forEach(x => { x.disabled = true; if (+x.dataset.i === p.answer) x.classList.add('right'); });
    if (!ok) b.classList.add('wrong');
    setTimeout(() => result(ok, +b.dataset.i), ok ? 400 : 700);
  });
  bindCards();
  // 段階に分けて解く（1.14.0）：小問を1つずつ。途中でまちがえたらヒントを出して、もう一度。最後は元の問題の選択肢
  el.querySelector('.steps-btn')?.addEventListener('click', (e) => {
    e.currentTarget.remove();
    const steps = p.steps;
    const show = (k) => {
      const s0 = steps[k], last = k === steps.length - 1;
      const ord = S.shuffle([0, 1, 2, 3]);
      stepEl.innerHTML = `
        <div class="st-prog">${steps.map((_, j) => `<i class="${j < k ? 'done' : j === k ? 'on' : ''}"></i>`).join('')}<small>ステップ ${k + 1} / ${steps.length}</small></div>
        <p class="ask st-ask">${fm(s0.ask)}</p>
        <div class="cards ch4">${(last ? order : ord).map(i => `<button class="fcard" data-i="${i}">${fm((last ? p.choices : s0.choices)[i])}</button>`).join('')}</div>
        <p class="st-hint hide"></p>`;
      if (last) return bindCards();
      stepEl.querySelectorAll('.fcard').forEach(b => b.onclick = () => {
        if (+b.dataset.i === s0.answer) { b.classList.add('right'); vibrate(15); setTimeout(() => show(k + 1), 450); return; }
        b.classList.add('wrong'); b.disabled = true; vibrate([40, 30, 40]);
        const h0 = stepEl.querySelector('.st-hint'); if (s0.hint) { h0.textContent = s0.hint; h0.classList.remove('hide'); }
      });
    };
    show(0);
  });
  function result(ok, picked) {
    Calc.closeCalc();
    el.querySelector('.calc-row')?.remove();
    const secs = (Date.now() - t0) / 1000;
    const { pts, xp, mastered } = awardResult(st, ss, p, ok, ok, isReview, secs);
    vibrate(ok ? [20, 30, 20] : [60, 40, 60]);
    const xpLine = xp ? `<div class="xpgain">${icon('level')}+${xp.gained} XP${xp.rankUp ? `<b>Lv${xp.rank}にアップ！</b>` : ''}</div>` : '';
    if (UINEXT) {
      // 新しいデザイン：正解・まちがいを色と形と言葉で。読む順に「結果 → 正解 → ちがう理由 → 解説 → ごほうび」。次へは指の届く下に
      el.classList.add('nx-answered');
      el.querySelector('.problem')?.classList.add('nx-small');
      stepEl.innerHTML = `
      <div class="res nx-res ${ok ? 'ok' : 'ng'}">
        <div class="nx-verdict">${icon(ok ? 'check' : 'x')}<b>${ok ? '正解！' : 'ざんねん、まちがい'}</b>${ok ? '' : '<small>正解と理由をたしかめよう</small>'}</div>
        <div class="nx-answer"><small>正解</small><b>${fm(p.choices[p.answer])}</b></div>
        ${!ok && p.why?.[picked] ? `<div class="why-wrong"><b>${icon('info')}えらんだ「${fm(p.choices[picked])}」は</b><p>${fm(p.why[picked])}</p></div>` : ''}
        ${p.explain ? (fx ? explainHTML(p.explain) : `<p class="reason">${esc(p.explain)}</p>`) : ''}
        ${p.detail ? `<details class="detail-ex"${ok ? '' : ' open'}><summary>${icon('book')}くわしい解説</summary>${explainHTML(p.detail)}</details>` : ''}
        ${mastered ? `<div class="master">${icon('trophy')}克服しました！ 特別な家具がもらえます</div>` : ''}
        ${ss.rewards && (ss.rewards.ticket || ss.rewards.ticket4 || ss.rewards.ticket5) ? `<div class="ru-tickets">${['ticket', 'ticket4', 'ticket5'].filter(k => ss.rewards[k]).map(k => `<span>${ticketSVG(k, 'mini')}<b>×${ss.rewards[k]}</b></span>`).join('')}<small class="ru-box">${icon('gift')}プレゼントBOXに届きました</small></div>` : ''}
        ${gaugeNote(ss)}
        <p class="nx-gain">${[pts ? `ゲージ +${pts}${ss.bonus ? '（×1.5）' : ''}` : '', xp ? `+${xp.gained} XP` : '', xp?.rankUp ? `<b>Lv${xp.rank}にアップ！</b>` : '', HS().gauge >= S.gaugeMax(HS()) ? `<b>${icon('gift')}家具が買えます</b>` : ''].filter(Boolean).join('<i>・</i>')}</p>
        <button class="link pr-report">${icon('info')}この問題のまちがいを報告</button>
      </div>
      <div class="nx-next"><button class="btn primary big more">${icon('pencil')}次の問題</button><button class="link home">${icon('home')}部屋にもどる</button></div>`;
      stepEl.querySelector('.home').onclick = () => endOne(true);
      stepEl.querySelector('.more').onclick = () => endOne(false);
      stepEl.querySelector('.pr-report').onclick = () => reportProblem(p);
      bindGaugeNote(stepEl);
      return;
    }
    stepEl.innerHTML = `
      <div class="res ${ok ? 'ok' : 'ng'}">
        <div class="ttl">${ok ? '正解！' : 'おしい！'}</div>
        ${pts ? `<div class="pts">+${pts}<small>ゲージ（むずかしい問題ほど多い）${ss.bonus && pts ? '・今日の最初の5問 ×1.5' : ''}</small></div>` : ''}
        ${gaugeNote(ss)}
        ${xpLine}
        ${mastered ? `<div class="master">${icon('trophy')}克服しました！ 特別な家具がもらえます</div>` : ''}
        <div class="formula">${fm(p.choices[p.answer])}<small>正解</small></div>
        ${fx ? explainHTML(p.explain) : `<p class="reason">${esc(p.explain || '')}</p>`}
        <button class="link pr-report">${icon('info')}この問題のまちがいを報告</button>
        ${!ok && p.why?.[picked] ? `<div class="why-wrong"><b>${icon('info')}えらんだ「${fm(p.choices[picked])}」がちがう理由</b><p>${fm(p.why[picked])}</p></div>` : ''}
        ${p.detail ? `<details class="detail-ex"${ok ? '' : ' open'}><summary>${icon('book')}くわしい解説</summary>${explainHTML(p.detail)}</details>` : ''}
        ${ss.rewards && (ss.rewards.ticket || ss.rewards.ticket4 || ss.rewards.ticket5) ? `<div class="ru-tickets">${['ticket', 'ticket4', 'ticket5'].filter(k => ss.rewards[k]).map(k => `<span>${ticketSVG(k, 'mini')}<b>×${ss.rewards[k]}</b></span>`).join('')}<small class="ru-box">${icon('gift')}プレゼントBOXに届きました</small></div>` : ''}
        ${HS().gauge >= S.gaugeMax(HS()) ? `<div class="gold-t">${icon('gift')}ゲージ満タン！ 家具が買えます</div>` : ''}
        <div class="row2 after"><button class="btn ghost home">${icon('home')}部屋にもどる</button><button class="btn primary more">${icon('pencil')}もう1問</button></div>
      </div>`;
    stepEl.querySelector('.home').onclick = () => endOne(true);
    stepEl.querySelector('.more').onclick = () => endOne(false);
    stepEl.querySelector('.pr-report').onclick = () => reportProblem(p);
    bindGaugeNote(stepEl);
  }
}
// 問題のまちがいを報告（1.12.0）：管理者の「要望・バグを見る」に、問題の番号といっしょに届く
function reportProblem(p) {
  const R = ['答えがちがう', '解説がおかしい', '問題文・選択肢がおかしい', 'その他'];
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('info')}</span><div><h3>問題のまちがいを報告</h3><p>運営が確かめて直します。ありがとうございます</p></div><button class="sh-x close" aria-label="やめる">${icon('x')}</button></div>
    <div class="rp-reasons">${R.map((x, i) => `<label><input type="radio" name="r" value="${i}" ${i === 0 ? 'checked' : ''}>${x}</label>`).join('')}</div>
    <textarea class="rp-detail" maxlength="400" placeholder="どこがおかしいか（なくてもOK）"></textarea>
    <button class="btn primary big rp-send">${icon('check')}送る</button>`, 'news-sheet report-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelector('.rp-send').onclick = async () => {
    const b = el.querySelector('.rp-send'); b.disabled = true;
    const r = R[+el.querySelector('input[name=r]:checked').value], d = el.querySelector('.rp-detail').value.trim();
    const body = `【問題】${r}\n${p.id}（${SUBJECTS.find(x => x.id === subjectId)?.name || subjectId}／${p.genre || ''}／${p.unit || ''}）\n${String(p.text).slice(0, 300)}${d ? '\n―\n' + d : ''}`;
    try { await rpc('sr_feedback_send', { p_token: Auth.currentUser()?.token, p_kind: 'problem', p_body: body }); el.remove(); toast('報告しました。ありがとうございます', 2400); }
    catch (ex) { toast(ex.message, 3000); b.disabled = false; }
  };
}

// 1問おわったあと：部屋へ戻るか、もう1問
function endOne(goHome) {
  const st = sub();
  st.session = null;
  const added = ensureRooms();
  S.save();
  if (added.length) toast(`新しい部屋「${added.map(r => r.name).join('・')}」が開きました`, 3200);
  if (goHome) { showHome(); receiveSpecials(); }
  else startSet();
}

function finishSet() {
  const st = sub();
  const ss = st.session;
  const perfect = ss.results.filter(r => r.perfect).length;
  const masters = ss.results.filter(r => r.mastered).length;
  const max = S.gaugeMax(HS());
  const rk = rankNow();
  st.session = null;
  const added = ensureRooms();
  S.save();
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card done">
        <h2>おつかれさま！</h2>
        <div class="score"><b>${perfect}</b> / ${ss.results.length} 問 ノーミス</div>
        ${ss.rankUp ? `<div class="rankup">${icon('level')}<b>Lv${rk.rank}</b>にアップ！<small>置ける家具が ${S.capacity()}個 に</small>
          <div class="ru-tickets">${['ticket', 'ticket4', 'ticket5'].filter(k => ss.rewards?.[k]).map(k => `<span>${ticketSVG(k, 'mini')}<b>×${ss.rewards[k]}</b></span>`).join('')}<small class="ru-box">${icon('gift')}プレゼントBOXに届きました</small></div></div>` : ''}
        <div class="xp-line">${icon('level')}+${ss.xp || 0} XP<span class="xpbar"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></span></div>
        <div class="gauge big ${HS().gauge >= max ? 'full' : ''}"><div class="fill" style="width:${Math.min(100, HS().gauge / max * 100)}%"></div>
          <span>ゲージ +${ss.gained}</span></div>
        ${HS().gauge >= max ? `<p class="gold-t">${icon('gift')}家具が買えます！</p>` : ''}
        ${masters ? `<p class="gold-t">${icon('trophy')}克服 ${masters}問！ 特別な家具が届きます</p>` : ''}
        ${added.length ? `<p class="gold-t">${icon('door')}新しい部屋「${added.map(r => r.name).join('・')}」が開きました</p>` : ''}
        <p class="streak-t">${icon('flame')}連続 ${S.currentStreak()}日</p>
        <button class="btn primary big home">部屋にもどる</button>
        <button class="btn ghost more">もう1セット</button>
      </div>
    </div>`);
  el.querySelector('.home').onclick = () => { showHome(); receiveSpecials(); };
  el.querySelector('.more').onclick = () => startSet();
  app.append(el);
}

// =========================== はじまり ===========================
let syncState = 'saved';
const SYNC_LABEL = { saved: ['cloud', '保存ずみ'], pending: ['cloud', '保存中…'], offline: ['cloudOff', 'オフライン（あとで保存）'] };
function paintSync() {
  document.querySelectorAll('.sync').forEach(e => {
    const [ic, t] = SYNC_LABEL[syncState] || SYNC_LABEL.saved;
    e.innerHTML = `${icon(ic)}${t}`; e.dataset.s = syncState;
  });
}
Sync.setHandlers({
  onStatus: (s) => { syncState = s; paintSync(); },
  // 部屋を出したあとで、ネットの記録（ほかの端末で進めた記録）に置きかわった時は、読みこみなおす
  onReplaced: () => { if (houseEntered && !document.querySelector('.title-screen')) { toast('ほかの端末の記録を読みこみました', 2000); setTimeout(() => location.reload(), 900); } },
  onExpired: () => {
    // 合い鍵が使えなくなった＝ほかの端末で同じアカウントにログインされた
    Auth.forget();
    document.querySelectorAll('.lb-screen, .photo-ui, .photo-preview').forEach(e => e.remove());
    document.body.classList.remove('photo-mode');
    toast('別の端末で同じアカウントにログインされたため、ログアウトしました', 4500);
    showLogin();
  },
});

// =========================== タイトル画面 ===========================
// アプリを開いたとき：ROOMIN が浮かぶ → タップしてはじめる。
// 待っているあいだに、裏で記録の読み込みと部屋の準備をしておく（タップしたらすぐ部屋へ）
function showTitle() {
  const mood = moodNow();
  const u = Auth.currentUser();
  const el = h(`
    <div class="title-screen t-${mood}">
      <div class="t-glow"></div>
      <button class="t-gear" aria-label="設定">${icon('gear')}</button>
      <h1 class="t-logo">${'ROOMIN'.split('').map((c, i) => `<span style="animation-delay:${0.15 + i * 0.12}s">${c}</span>`).join('')}</h1>
      <p class="t-sub">問題を解くと、部屋ができていく</p>
      <div class="t-bottom">
        <p class="t-tap">タップしてはじめる</p>
        <div class="t-load"><i></i></div>
      </div>
    </div>`);
  document.body.append(el);
  const bar = el.querySelector('.t-load i');
  const setP = (v) => { bar.style.width = Math.round(v * 100) + '%'; };
  setP(0.08);
  // 裏で準備
  let ready = Promise.resolve();
  if (u) {
    ready = (async () => {
      S.useUser(u.id);
      Sync.reset();
      await Promise.race([Sync.pull(), new Promise(r => setTimeout(r, 3000))]);
      setP(0.35);
      user = Auth.currentUser() || u;
      ensureRooms();
      if (!room3d) { room3d = new Room3D(canvas); setInterval(() => room3d.refreshMood(), 60e3); }
      room3d.setActive(true);
      setP(0.55);
      await Promise.race([room3d.show(curDef(), curRoom()), new Promise(r => setTimeout(r, 12000))]);
      setP(1);
    })().catch(() => setP(1));
  } else setP(1);
  let started = false;
  el.addEventListener('click', async (e) => {
    if (e.target.closest('.t-gear') || e.target.closest('.sheet') || started) return;
    started = true;
    el.classList.add('t-go');
    await ready;
    el.classList.add('t-out');
    setTimeout(() => el.remove(), 900);
    if (!u) return showLogin();
    startAs(Auth.currentUser() || u);
    refreshFriendBadge();
  });
  el.querySelector('.t-gear').onclick = () => titleSettings(el);
}
function titleSettings(host) {
  let q = 'low';
  try { q = localStorage.getItem('studyroom.quality') || 'low'; } catch (e) { /* なし */ }
  const sh = h(`<div class="sheet t-settings"><div class="grab"></div>
    <div class="sh-head"><span class="sh-ic">${icon('gear')}</span><div><h3>かんたん設定</h3><p>あとからメニューでも変えられます</p></div></div>
    <p class="lbl">画質</p>
    <div class="seg q3">${[['high', 'きれい'], ['mid', 'ふつう'], ['low', 'かるい']].map(([k, n]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${DL.canDownload() && DL.downloadState() !== 'done' ? `<button class="btn ghost big dl">${icon('download')}家具のデータをまとめて保存</button>` : ''}
    <button class="btn primary big close">とじる</button></div>`);
  host.append(sh);
  sh.querySelectorAll('.q3 button').forEach(b => b.onclick = () => {
    if ((b.dataset.q === 'low') !== isLite()) toast('家具や壁の質感は、次にアプリを開いた時から変わります', 2600);
    try { localStorage.setItem('studyroom.quality', b.dataset.q); } catch (e) { /* なし */ }
    room3d?.setQuality(b.dataset.q);
    sh.querySelectorAll('.q3 button').forEach(x => x.classList.toggle('on', x === b));
  });
  sh.querySelector('.dl')?.addEventListener('click', () => { DL.setDownloadState(null); try { localStorage.removeItem('studyroom.download'); } catch (e) { /* なし */ } sh.remove(); toast('はじめるときに、ダウンロードの画面が出ます'); });
  sh.querySelector('.close').onclick = () => sh.remove();
}

showTitle();

// iPhone：キーボードを閉じたあと、画面が下にずれたまま残る（下に黒い帯が出る）のを戻す
const fixScroll = () => { if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } };
document.addEventListener('focusout', () => setTimeout(fixScroll, 120));
window.visualViewport?.addEventListener('resize', () => setTimeout(fixScroll, 120));
window.addEventListener('scroll', () => { if (!document.activeElement || !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) fixScroll(); }, { passive: true });
BGM.init();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
}
// テスト用
window.__app = { toast, showEdit, putIntoRoom, get room3d() { return room3d; }, S, sub, HS, switchRoom, ensureRooms, goHome, showHome, curRoom, visitFriend, leaveVisit, showLoginBonus, showGiftBox, showArrange, problemById: (id) => byId[id], runChoice, arrange: (sel, style) => { arrSel = sel; return runArrange(style); } };

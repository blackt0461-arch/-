#!/usr/bin/env node
// kotetsuworks.com に出すファイルを dist/ にまとめる（GitHub が止まっている間の公開用。2026-11-07）
//   node tools/deploy/build.js            → dist/ ができる
//   node tools/deploy/build.js --zip      → dist/ と _backup/kotetsuworks-site.zip ができる（本人が手で上げる時用）
// 入れるもの：入口ページ（index.html・_redirects・manifest・assets）と、各アプリのフォルダ。
// 入れないもの：大きすぎる・公開しないもの（cat-model・docs・youtube_highlights・roomin-questions）、
//               各アプリの tools・supabase・docs・server・node_modules・*.md。
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist');
const TOP_FILES = ['index.html', '_redirects', 'manifest.webmanifest', 'フーリエ解析計算機.html'];
const TOP_DIRS = ['assets', 'study-room', 'study-room-beta', 'test-study', 'lyric-book', 'chord-analyzer', 'alarm', 'smagro-memory', 'yotei', 'skate'];
const SKIP_DIRS = new Set(['tools', 'supabase', 'docs', 'server', 'node_modules', '.git', 'tests']);
const MAX = 25 * 1024 * 1024; // Cloudflare Pages の1ファイルの上限
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
let files = 0, bytes = 0;
const big = [];
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(src))) return;
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f));
    return;
  }
  if (src.endsWith('.md')) return;
  if (st.size > MAX) { big.push(path.relative(ROOT, src)); return; }
  fs.copyFileSync(src, dst); files++; bytes += st.size;
}
for (const f of TOP_FILES) if (fs.existsSync(path.join(ROOT, f))) copy(path.join(ROOT, f), path.join(DIST, f));
for (const d of TOP_DIRS) if (fs.existsSync(path.join(ROOT, d))) copy(path.join(ROOT, d), path.join(DIST, d));
console.log(`dist/：${files}ファイル・${(bytes / 1048576).toFixed(1)}MB`);
if (big.length) console.log('大きすぎて入れなかったファイル：' + big.join(', '));
if (files > 20000) { console.error('ファイルが多すぎます（上限 20,000）'); process.exit(1); }
if (process.argv.includes('--zip')) {
  const out = path.join(ROOT, '_backup', 'kotetsuworks-site.zip');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.rmSync(out, { force: true });
  execSync(`cd "${DIST}" && zip -qr "${out}" .`);
  console.log('zip：' + path.relative(ROOT, out));
}

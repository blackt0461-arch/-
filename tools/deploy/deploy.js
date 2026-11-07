#!/usr/bin/env node
// kotetsuworks.com（Cloudflare Pages のプロジェクト「kotetsuworks」）に、そのまま公開する。2026-11-07
//   node tools/deploy/deploy.js
// しくみ：build.js で dist/ を作り、wrangler の「直接アップロード」で出す（Cloudflare 側でビルドしないので、月500回のビルド回数を使わない）。
// 鍵（API トークン。権限は Account › Cloudflare Pages › Edit だけ）は、このクラウド環境の「ネットワークの秘密」として
// api.cloudflare.com に登録してあり、通信の途中で自動で付く。なので、ここでは本物の鍵を持たない（ダミーを渡す）。
const { execSync } = require('child_process'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), PROJECT = 'kotetsuworks';
const api = async (p) => { const r = await fetch('https://api.cloudflare.com/client/v4' + p, { headers: { Authorization: 'Bearer placeholder' } }); const j = await r.json(); if (!j.success) throw new Error(`Cloudflare API ${p}: ${JSON.stringify(j.errors)}`); return j.result; };
(async () => {
  execSync('node tools/deploy/build.js', { cwd: ROOT, stdio: 'inherit' });
  const accounts = await api('/accounts');
  if (!accounts.length) throw new Error('アカウントが見つからない（鍵の権限を確かめる）');
  const acc = accounts[0].id;
  const proj = await api(`/accounts/${acc}/pages/projects/${PROJECT}`);
  const branch = proj.production_branch || 'main';
  console.log(`公開先：${PROJECT}（本番の枝：${branch}）`);
  execSync(`npx -y wrangler@3.114.0 pages deploy dist --project-name ${PROJECT} --branch ${branch} --commit-dirty=true`, {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'placeholder', CLOUDFLARE_ACCOUNT_ID: acc, WRANGLER_SEND_METRICS: 'false' },
  });
  console.log('公開しました：https://kotetsuworks.com/');
})().catch(e => { console.error('公開できませんでした：' + e.message); process.exit(1); });

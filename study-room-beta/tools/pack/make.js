// テスト勉強用の問題集を、コードで暗号にして js/packs.js に入れる。
//
// 使い方（study-room フォルダで）：
//   node tools/pack/make.js add <コード> <問題集.json>   … 暗号にして入れる（同じ id があれば置きかえ）
//   node tools/pack/make.js show <コード>                … そのコードで開ける問題集の中身を表示（直す時に使う）
//   node tools/pack/make.js remove <コード>              … そのコードの問題集を消す
// 問題集.json の形：
//   { "id": "teiki-2026-2", "name": "定期テスト", "icon": "book",
//     "problems": [ { "id": "t-001", "unit": "単元", "grade": "hs1", "level": 1,
//                     "text": "問題文", "choices": ["A","B","C","D"], "answer": 0, "explain": "解説" } ] }
//   problems の形は js/subjects/index.js の4択と同じ。
// 注意：問題集.json（暗号にする前の中身）はリポジトリに入れない。tools/pack/src/ は git に入らない。
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '..', '..', 'js', 'packs.js');

(async () => {
  const { sealPack, openPack } = await import(path.resolve(__dirname, '..', '..', 'js', 'packcrypt.js'));
  const { PACKS } = await import(FILE + '?t=' + Date.now());
  const [cmd, code, src] = process.argv.slice(2);
  if (!cmd || !code) { console.log('使い方：node tools/pack/make.js add|show|remove <コード> [問題集.json]'); process.exit(1); }
  const opened = [];
  for (let i = 0; i < PACKS.length; i++) { const p = await openPack(code, PACKS[i]); if (p) opened.push({ i, p }); }
  const save = (list) => fs.writeFileSync(FILE, fs.readFileSync(FILE, 'utf8').replace(/export const PACKS = \[[\s\S]*\];/, 'export const PACKS = [\n' + list.map(x => '  ' + JSON.stringify(x) + ',').join('\n') + '\n];'));
  if (cmd === 'show') {
    if (!opened.length) return console.log('このコードで開ける問題集はありません');
    for (const { p } of opened) console.log(JSON.stringify(p, null, 2));
  } else if (cmd === 'remove') {
    save(PACKS.filter((_, i) => !opened.some(o => o.i === i)));
    console.log(`${opened.length}件 消しました`);
  } else if (cmd === 'add') {
    const pack = JSON.parse(fs.readFileSync(src, 'utf8'));
    const bad = (pack.problems || []).filter(q => !q.id || !q.text || !Array.isArray(q.choices) || q.choices.length !== 4 || !(q.answer >= 0 && q.answer < 4));
    if (!pack.id || !pack.name || !pack.problems?.length || bad.length) { console.log('形がちがいます：', bad.map(q => q.id).join(', ') || 'id・name・problems を確かめて'); process.exit(1); }
    const sealed = await sealPack(code, pack);
    const keep = PACKS.filter((_, i) => !opened.some(o => o.i === i && o.p.id === pack.id));
    save([...keep, sealed]);
    console.log(`「${pack.name}」（${pack.problems.length}問）を入れました`);
  }
})();

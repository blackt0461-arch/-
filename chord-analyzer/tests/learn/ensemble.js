// 5つの判定器（SEED を変えて学習したもの）を learned.js の MODELS にまとめて書き込む
//   node tests/learn/ensemble.js /tmp/claude-0/ens-11.json /tmp/claude-0/ens-23.json …
import fs from 'node:fs';
const models = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const file = new URL('../../learned.js', import.meta.url);
fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/export const MODELS = .*;\n/, () => `export const MODELS = ${JSON.stringify(models)};\n`));
console.log(`${models.length} 個の判定器を書き込みました`);

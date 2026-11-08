import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium } = require('playwright');
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('http://localhost:8765/lyric-book/');
const r = await p.evaluate(async () => {
  const E = await import('/lyric-book/js/encode.js');
  const rate = 22050, n = rate * 240, data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin(i / rate * 2 * Math.PI * 440) * 0.4;
  const t = performance.now();
  const o = await E.encodeForSave({ data, rate });
  const a = new Audio(URL.createObjectURL(o.blob));
  const dur = await new Promise(res => { a.onloadedmetadata = () => res(a.duration); a.onerror = () => res('err'); });
  return { mime: o.mime, size: o.blob.size, ms: Math.round(performance.now() - t), dur };
});
console.log(r); await b.close();

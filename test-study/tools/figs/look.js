// 図を PNG にして目で確かめるための道具：node test-study/tools/figs/look.js 出力.png 図1.svg 図2.svg ...
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const [out, ...files] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 760, height: 600 } });
  const html = '<body style="margin:0;background:#ccc;display:flex;flex-wrap:wrap;gap:8px;padding:8px">' +
    files.map((f) => `<div style="background:#fff;width:360px"><div style="font:12px sans-serif">${path.basename(f)}</div><img src="file://${path.resolve(f)}" style="width:360px"></div>`).join('') + '</body>';
  const tmp = path.join(path.dirname(path.resolve(out)), '_look.html'); fs.writeFileSync(tmp, html);
  await p.goto('file://' + tmp); await p.waitForTimeout(500); await p.screenshot({ path: out, fullPage: true }); await b.close();
})();

// Usage: node alarm/tools/bump.mjs "更新内容のひとこと"
// Sets a new app version (JST timestamp) in version.json, index.html (APP_VERSION and the ?v= on
// module imports) and assistant.js, so open apps show an update notice and reload fresh files.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const notes = process.argv.slice(2).join(' ').trim();
const jst = new Date(Date.now() + 9 * 3600e3).toISOString();
const version = `${jst.slice(0, 10)}.${jst.slice(11, 13)}${jst.slice(14, 16)}`;

const edit = (file, fn) => writeFileSync(dir + file, fn(readFileSync(dir + file, 'utf8')));
edit('index.html', s => s
  .replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${version}';`)
  .replace(/\.js\?v=[^']*'/g, `.js?v=${version}'`));
edit('assistant.js', s => s.replace(/\.js\?v=[^']*'/g, `.js?v=${version}'`));
writeFileSync(dir + 'version.json', JSON.stringify({ version, notes }, null, 2) + '\n');
console.log(version);

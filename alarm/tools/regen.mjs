// Usage: node alarm/tools/regen.mjs path/to/alarms.json [--init]
// Validates the file, rebuilds `schedule`, writes it back, and prints the next 14 days.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { emptyData, regenerate, resolveDay, alarmsFor, todayJST, addDays, weekdayKey, DAY_JA } from '../schedule.js';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('usage: node alarm/tools/regen.mjs <alarms.json> [--init]');
  process.exit(1);
}
const data = flag === '--init' && !existsSync(file) ? emptyData() : JSON.parse(readFileSync(file, 'utf8'));
regenerate(data);
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

const today = todayJST();
for (let i = 0; i < 14; i++) {
  const date = addDays(today, i);
  const { source } = resolveDay(data, date);
  const times = alarmsFor(data, date).map(a => a.time).join(' ') || 'なし';
  console.log(`${date} (${DAY_JA[weekdayKey(date)]}) ${source === 'override' ? '★' : ' '} ${times}`);
}

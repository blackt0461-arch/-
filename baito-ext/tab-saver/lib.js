// 保存データの読み書き。ポップアップ・管理画面・バックグラウンドで共通で使う。
// データを失わないために：
//  - 書きかえる前に、いまの状態を控え（backups）に残す（最新10個）
//  - 消したグループはゴミ箱（trash）に30日残す
//  - 書きこみは1か所（write）に集め、順番に行う
/* global chrome */
const ST = {
  BACKUP_MAX: 10,
  TRASH_DAYS: 30,
  _queue: Promise.resolve(),

  async read() {
    const d = await chrome.storage.local.get(['groups', 'trash', 'backups', 'autosave', 'settings']);
    return {
      groups: d.groups || [], trash: d.trash || [], backups: d.backups || [],
      autosave: d.autosave || null, settings: Object.assign({ closeAfterSave: true, skipPinned: true, dedupe: true }, d.settings || {}),
    };
  },

  // fn(data) が data を書きかえる。書きこみは順番待ちにして、同時に書いて消えることを防ぐ
  write(fn, { backup = true } = {}) {
    const job = ST._queue.then(async () => {
      const d = await ST.read();
      if (backup) {
        d.backups.unshift({ at: Date.now(), groups: JSON.parse(JSON.stringify(d.groups)) });
        d.backups = d.backups.slice(0, ST.BACKUP_MAX);
      }
      const r = await fn(d);
      const limit = Date.now() - ST.TRASH_DAYS * 864e5;
      d.trash = d.trash.filter(g => g.deletedAt > limit);
      await chrome.storage.local.set({ groups: d.groups, trash: d.trash, backups: d.backups, settings: d.settings });
      return r;
    });
    ST._queue = job.catch(() => {});
    return job;
  },

  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  // 保存してよいページか（新しいタブや設定画面は入れない）
  saveable(t) { return t.url && /^(https?|file|ftp):/i.test(t.url); },

  pack(tabs) { return tabs.map(t => ({ url: t.url, title: t.title || t.url })); },

  async saveTabs(tabs, title = '') {
    const d0 = await ST.read();
    let list = tabs.filter(ST.saveable);
    if (d0.settings.skipPinned) list = list.filter(t => !t.pinned);
    if (d0.settings.dedupe) { const seen = new Set(); list = list.filter(t => !seen.has(t.url) && seen.add(t.url)); }
    if (!list.length) return { saved: 0 };
    const group = { id: ST.uid(), title, created: Date.now(), tabs: ST.pack(list) };
    await ST.write(d => { d.groups.unshift(group); });
    if (d0.settings.closeAfterSave) {
      const ids = list.map(t => t.id).filter(Boolean);
      // ウィンドウのタブを全部閉じるとウィンドウごと消えるので、先に新しいタブを1つ開いておく
      const win = list[0].windowId;
      const all = await chrome.tabs.query({ windowId: win });
      if (all.every(t => ids.includes(t.id))) await chrome.tabs.create({ windowId: win, url: chrome.runtime.getURL('manager.html') });
      await chrome.tabs.remove(ids);
    }
    return { saved: list.length, group };
  },

  async openTabs(tabs, newWindow = false) {
    if (newWindow) {
      const w = await chrome.windows.create({ url: tabs[0].url });
      for (const t of tabs.slice(1)) await chrome.tabs.create({ windowId: w.id, url: t.url, active: false });
    } else {
      for (const t of tabs) await chrome.tabs.create({ url: t.url, active: false });
    }
  },

  // 書き出し（JSON）
  exportJSON(d) {
    return JSON.stringify({ app: 'SafeTabs', version: 1, exportedAt: new Date().toISOString(), groups: d.groups }, null, 2);
  },
  // 読みこみ：このアプリの JSON / OneTab の書き出し（「URL | タイトル」の行、空行でグループ分け）/ URLを並べただけの文
  parseImport(text) {
    text = text.trim();
    if (text.startsWith('{')) {
      const j = JSON.parse(text);
      const groups = (j.groups || []).filter(g => Array.isArray(g.tabs));
      return groups.map(g => ({ id: ST.uid(), title: g.title || '', created: g.created || Date.now(), tabs: g.tabs.filter(t => t && t.url).map(t => ({ url: String(t.url), title: String(t.title || t.url) })) }));
    }
    const groups = []; let cur = [];
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) { if (cur.length) { groups.push(cur); cur = []; } continue; }
      const m = s.match(/^(\S+?:\/\/\S+)(?:\s+\|\s+(.*))?$/);
      if (m) cur.push({ url: m[1], title: (m[2] || m[1]).trim() });
    }
    if (cur.length) groups.push(cur);
    const now = Date.now();
    return groups.map((tabs, i) => ({ id: ST.uid(), title: '', created: now - i, tabs }));
  },

  favicon(url) {
    return chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(url) + '&size=16';
  },
};

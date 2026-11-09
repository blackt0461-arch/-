/* global chrome, ST, importScripts */
importScripts('lib.js');

// 5分ごとに、開いているタブの状態を自動で控える（パソコンやブラウザが落ちても戻せるように）
async function autosave() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const windows = wins.map(w => ST.pack(w.tabs.filter(ST.saveable))).filter(t => t.length);
  if (!windows.length) return;
  const { autosave: prev } = await chrome.storage.local.get('autosave');
  // 直前の控えは「ひとつ前」として残す（落ちた直後に空の状態で上書きしないため）
  await chrome.storage.local.set({ autosave: { at: Date.now(), windows, prev: prev ? { at: prev.at, windows: prev.windows } : null } });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('autosave', { periodInMinutes: 5 });
  autosave();
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('autosave', { periodInMinutes: 5 }));
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'autosave') autosave(); });

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'save-window') return;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await ST.saveTabs(tabs);
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.cmd !== 'save') return;
  (async () => {
    const q = m.scope === 'active' ? { windowId: m.windowId, active: true } : { windowId: m.windowId };
    const r = await ST.saveTabs(await chrome.tabs.query(q));
    reply({ saved: r.saved });
  })();
  return true; // 返事はあとで送る
});

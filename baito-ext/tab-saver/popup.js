/* global chrome, ST */
const t = (k, ...a) => chrome.i18n.getMessage(k, a.map(String));
document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
const msg = document.getElementById('msg');
const closeBox = document.getElementById('close');

(async () => { closeBox.checked = (await ST.read()).settings.closeAfterSave; })();
closeBox.onchange = () => ST.write(d => { d.settings.closeAfterSave = closeBox.checked; }, { backup: false });

async function done(r) {
  msg.textContent = r.saved ? t('savedN', r.saved) : t('nothingToSave');
}
// 保存と、タブを閉じる作業はバックグラウンドに任せる（ポップアップは途中で閉じることがあるため）
async function save(scope) {
  const win = await chrome.windows.getCurrent();
  done(await chrome.runtime.sendMessage({ cmd: 'save', scope, windowId: win.id }));
}
document.getElementById('saveWin').onclick = () => save('window');
document.getElementById('saveOne').onclick = () => save('active');
document.getElementById('open').onclick = async () => {
  const url = chrome.runtime.getURL('manager.html');
  const [found] = await chrome.tabs.query({ url });
  if (found) { await chrome.tabs.update(found.id, { active: true }); await chrome.windows.update(found.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
  window.close();
};

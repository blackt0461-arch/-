/* global chrome, ST */
const t = (k, ...a) => chrome.i18n.getMessage(k, a.map(String));
document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
document.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = t(e.dataset.i18nPh); });

const main = document.getElementById('main');
let view = 'list';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (ms) => new Date(ms).toLocaleString(chrome.i18n.getUILanguage(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function toast(text, undoFn) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<span>${esc(text)}</span>` + (undoFn ? `<button>${esc(t('undo'))}</button>` : '');
  if (undoFn) el.querySelector('button').onclick = () => { el.remove(); undoFn(); };
  document.body.appendChild(el); setTimeout(() => el.remove(), 6000);
}
function tabList(tabs, gid) {
  return `<ul class="tl">${tabs.map((x, i) => `<li><img src="${esc(ST.favicon(x.url))}" alt=""><a href="${esc(x.url)}" data-open="${i}" title="${esc(x.url)}">${esc(x.title)}</a>${gid ? `<button class="x" data-rm="${i}" title="${esc(t('removeTab'))}">✕</button>` : ''}</li>`).join('')}</ul>`;
}

async function render() {
  const d = await ST.read();
  const total = d.groups.reduce((n, g) => n + g.tabs.length, 0);
  document.getElementById('count').textContent = t('totalTabs', d.groups.length, total);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  ({ list: viewList, trash: viewTrash, backups: viewBackups, recovery: viewRecovery, io: viewIO, settings: viewSettings })[view](d);
}

// ===== 保存したタブ =====
function viewList(d) {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const groups = d.groups.map(g => q ? { ...g, tabs: g.tabs.filter(x => (x.title + ' ' + x.url).toLowerCase().includes(q)), _all: g.tabs } : g).filter(g => g.tabs.length);
  if (!groups.length) { main.innerHTML = `<div class="empty">${esc(q ? '—' : t('empty'))}</div>`; return; }
  main.innerHTML = groups.map(g => `
    <section class="group" data-id="${g.id}">
      <div class="ghead">
        <span class="title" contenteditable="true" spellcheck="false" data-ph="${esc(t('rename'))}">${esc(g.title)}</span>
        <span class="meta">${esc(t('tabsN', g.tabs.length))} · ${esc(when(g.created))}</span>
        <span class="acts">
          <button class="btn small primary" data-act="open">${esc(t('restoreAll'))}</button>
          <button class="btn small" data-act="win">${esc(t('restoreWin'))}</button>
          <button class="btn small danger" data-act="del">${esc(t('delete'))}</button>
        </span>
      </div>
      ${tabList(g.tabs, g.id)}
    </section>`).join('');
  main.querySelectorAll('.group').forEach(sec => {
    const id = sec.dataset.id, g = groups.find(x => x.id === id);
    sec.querySelector('[data-act=open]').onclick = () => ST.openTabs(g.tabs);
    sec.querySelector('[data-act=win]').onclick = () => ST.openTabs(g.tabs, true);
    sec.querySelector('[data-act=del]').onclick = async () => {
      await ST.write(dd => { const i = dd.groups.findIndex(x => x.id === id); if (i >= 0) dd.trash.unshift({ ...dd.groups.splice(i, 1)[0], deletedAt: Date.now() }); });
      render();
      toast(t('deleted'), async () => { await restoreFromTrash(id); render(); });
    };
    const title = sec.querySelector('.title');
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } };
    title.onblur = () => { const v = title.textContent.trim(); if (v !== (g.title || '')) ST.write(dd => { const x = dd.groups.find(y => y.id === id); if (x) x.title = v; }); };
    sec.querySelectorAll('[data-open]').forEach(a => a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: g.tabs[a.dataset.open].url, active: false }); });
    sec.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      const url = g.tabs[b.dataset.rm].url;
      await ST.write(dd => {
        const x = dd.groups.find(y => y.id === id); if (!x) return;
        const i = x.tabs.findIndex(y => y.url === url); if (i >= 0) x.tabs.splice(i, 1);
        if (!x.tabs.length) { dd.groups = dd.groups.filter(y => y.id !== id); dd.trash.unshift({ ...x, tabs: [{ url, title: url }], deletedAt: Date.now() }); }
      });
      render();
    });
  });
}
async function restoreFromTrash(id) {
  await ST.write(dd => { const i = dd.trash.findIndex(x => x.id === id); if (i >= 0) { const g = dd.trash.splice(i, 1)[0]; delete g.deletedAt; dd.groups.unshift(g); dd.groups.sort((a, b) => b.created - a.created); } });
}

// ===== ゴミ箱 =====
function viewTrash(d) {
  main.innerHTML = `<p class="note">${esc(t('trashNote'))}</p>` + (d.trash.length ? d.trash.map(g => `
    <section class="group" data-id="${g.id}">
      <div class="ghead"><span class="title">${esc(g.title || '—')}</span><span class="meta">${esc(t('tabsN', g.tabs.length))} · ${esc(when(g.deletedAt))}</span>
        <span class="acts"><button class="btn small primary" data-act="back">${esc(t('putBack'))}</button><button class="btn small danger" data-act="kill">${esc(t('deleteForever'))}</button></span></div>
      ${tabList(g.tabs.slice(0, 5))}
    </section>`).join('') : `<div class="empty">—</div>`);
  main.querySelectorAll('.group').forEach(sec => {
    const id = sec.dataset.id;
    sec.querySelector('[data-act=back]').onclick = async () => { await restoreFromTrash(id); toast(t('restored')); render(); };
    sec.querySelector('[data-act=kill]').onclick = async () => { await ST.write(dd => { dd.trash = dd.trash.filter(x => x.id !== id); }); render(); };
  });
}

// ===== 控え =====
function viewBackups(d) {
  main.innerHTML = `<p class="note">${esc(t('backupsNote'))}</p>` + (d.backups.length ? d.backups.map((b, i) => `
    <div class="panel row"><b>${esc(when(b.at))}</b><span class="muted">${esc(t('totalTabs', b.groups.length, b.groups.reduce((n, g) => n + g.tabs.length, 0)))}</span>
      <button class="btn small" style="margin-left:auto" data-i="${i}">${esc(t('useThis'))}</button></div>`).join('') : `<div class="empty">—</div>`);
  main.querySelectorAll('[data-i]').forEach(btn => btn.onclick = async () => {
    if (!confirm(t('confirmBackup'))) return;
    const snap = d.backups[btn.dataset.i];
    await ST.write(dd => { dd.groups = JSON.parse(JSON.stringify(snap.groups)); });
    toast(t('restored')); view = 'list'; render();
  });
}

// ===== 落ちたあとに戻す =====
function viewRecovery(d) {
  const snaps = [d.autosave, d.autosave?.prev].filter(Boolean);
  main.innerHTML = `<p class="note">${esc(t('recoveryNote'))}</p>` + (snaps.length ? snaps.map((s, si) => s.windows.map((tabs, wi) => `
    <section class="group">
      <div class="ghead"><span class="title">${esc(t('windowN', wi + 1))}</span><span class="meta">${esc(t('tabsN', tabs.length))} · ${esc(when(s.at))}</span>
        <span class="acts"><button class="btn small primary" data-s="${si}" data-w="${wi}">${esc(t('saveTheseTabs'))}</button></span></div>
      ${tabList(tabs.slice(0, 8))}
    </section>`).join('')).join('') : `<div class="empty">—</div>`);
  main.querySelectorAll('[data-s]').forEach(btn => btn.onclick = async () => {
    const tabs = snaps[btn.dataset.s].windows[btn.dataset.w];
    await ST.write(dd => { dd.groups.unshift({ id: ST.uid(), title: t('recovery'), created: Date.now(), tabs }); });
    toast(t('savedN', tabs.length)); view = 'list'; render();
  });
}

// ===== 書き出し・読みこみ =====
function viewIO(d) {
  main.innerHTML = `
    <div class="panel"><button class="btn primary" id="exp">${esc(t('exportBtn'))}</button></div>
    <div class="panel"><p class="note">${esc(t('importNote'))}</p>
      <div class="row"><button class="btn" id="pickBtn">${esc(t('importBtn'))}</button><input type="file" id="file" accept=".json,.txt,text/plain,application/json" hidden></div>
      <textarea id="paste" placeholder="https://example.com | Example"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="pasteBtn">${esc(t('importPaste'))}</button></div>
    </div>`;
  document.getElementById('exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ST.exportJSON(d)], { type: 'application/json' }));
    a.download = 'safetabs-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  };
  const doImport = async (text) => {
    let groups;
    try { groups = ST.parseImport(text); } catch (e) { groups = []; }
    if (!groups.length) return toast(t('importFail'));
    await ST.write(dd => { dd.groups = [...groups, ...dd.groups].sort((a, b) => b.created - a.created); });
    toast(t('importedN', groups.length)); view = 'list'; render();
  };
  document.getElementById('pickBtn').onclick = () => document.getElementById('file').click();
  document.getElementById('file').onchange = async (e) => { const f = e.target.files[0]; if (f) doImport(await f.text()); };
  document.getElementById('pasteBtn').onclick = () => doImport(document.getElementById('paste').value);
}

// ===== 設定 =====
function viewSettings(d) {
  const s = d.settings;
  main.innerHTML = `<div class="panel">
    <label><input type="checkbox" data-k="closeAfterSave" ${s.closeAfterSave ? 'checked' : ''}> ${esc(t('closeAfter'))}</label>
    <label><input type="checkbox" data-k="skipPinned" ${s.skipPinned ? 'checked' : ''}> ${esc(t('skipPinned'))}</label>
    <label><input type="checkbox" data-k="dedupe" ${s.dedupe ? 'checked' : ''}> ${esc(t('dedupe'))}</label>
  </div>`;
  main.querySelectorAll('[data-k]').forEach(c => c.onchange = () => ST.write(dd => { dd.settings[c.dataset.k] = c.checked; }, { backup: false }));
}

document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { view = b.dataset.v; render(); });
document.getElementById('q').oninput = () => { view = 'list'; render(); };
// ほかの画面（ポップアップなど）で保存したら、ここも最新にする
chrome.storage.onChanged.addListener((c) => { if (c.groups && !document.activeElement?.isContentEditable) render(); });
render();

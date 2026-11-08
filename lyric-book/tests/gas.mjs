// Google Apps Script のまね（テスト用）
import vm from 'vm';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

export function makeGas(codePath, opts = {}) {
  let nextId = 1;
  const items = new Map(); // id -> {type, name, parent, content(Buffer), mime, created, trashed}
  const mk = (type, name, parent, content = Buffer.alloc(0), mime = '') => {
    const id = 'f' + nextId++;
    items.set(id, { id, type, name, parent, content, mime, created: Date.now(), trashed: false });
    return id;
  };
  const rootId = mk('folder', 'マイドライブ', null);
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const children = (pid, type, name) => [...items.values()].filter(x => x.parent === pid && x.type === type && !x.trashed && (name == null || x.name === name));
  const toBuf = c => Buffer.isBuffer(c) ? c : Array.isArray(c) ? Buffer.from(c.map(b => b & 255)) : Buffer.from(String(c), 'utf8');
  function File(id) {
    const it = items.get(id);
    return {
      getId: () => id, getName: () => it.name, setName: n => { it.name = n; },
      getBlob: () => Blob(it.content, it.mime, it.name),
      setContent: t => { it.content = toBuf(t); },
      setTrashed: v => { it.trashed = v; }, moveTo: f => { it.parent = f.getId(); },
      getDateCreated: () => new Date(it.created), getUrl: () => 'https://drive.google.com/file/d/' + id,
    };
  }
  function Folder(id) {
    return {
      getId: () => id, getUrl: () => 'https://drive.google.com/drive/folders/' + id,
      getFoldersByName: n => iter(children(id, 'folder', n).map(x => Folder(x.id))),
      createFolder: n => Folder(mk('folder', n, id)),
      getFilesByName: n => iter(children(id, 'file', n).map(x => File(x.id))),
      getFiles: () => iter(children(id, 'file').map(x => File(x.id))),
      createFile: (a, b, c) => typeof a === 'string' ? File(mk('file', a, id, toBuf(b), c)) : File(mk('file', a._name, id, a._bytes, a._mime)),
    };
  }
  function Blob(bytes, mime, name) {
    const buf = toBuf(bytes);
    return { _bytes: buf, _mime: mime, _name: name, getBytes: () => [...buf].map(b => (b << 24) >> 24), getDataAsString: () => buf.toString('utf8') };
  }
  const props = new Map(), cache = new Map();
  const ctx = {
    DriveApp: { getRootFolder: () => Folder(rootId), getFileById: id => { if (!items.has(id)) throw new Error('no file'); return File(id); } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(toBuf(s)).digest()].map(b => (b << 24) >> 24),
      base64Encode: b => toBuf(b).toString('base64'),
      base64Decode: s => [...Buffer.from(s, 'base64')].map(b => (b << 24) >> 24),
      getUuid: () => crypto.randomUUID(),
      newBlob: (bytes, mime, name) => Blob(bytes, mime, name),
      formatDate: (d) => d.toISOString().slice(0, 10),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ text: s, setMimeType() { return this; } }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
    UrlFetchApp: { fetch: (url, opt = {}) => {
      if (opts.fetch) return opts.fetch(url, opt);
      const out = execFileSync('curl', ['-sL', '-A', (opt.headers || {})['User-Agent'] || 'Mozilla/5.0', '-w', '\n%{http_code}', url], { maxBuffer: 1 << 24 }).toString('utf8');
      const i = out.lastIndexOf('\n'); const body = out.slice(0, i), code = +out.slice(i + 1);
      return { getResponseCode: () => code, getContentText: () => body, getBlob: () => Blob(Buffer.from(body), 'text/html') };
    } },
    MimeType: { PLAIN_TEXT: 'text/plain' }, Logger: { log() {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8') + '\n;globalThis.__api = { doPost, doGet, setup, backup };', ctx);
  return {
    post: body => JSON.parse(ctx.__api.doPost({ postData: { contents: body } }).text),
    setup: () => ctx.__api.setup(),
    backup: () => ctx.__api.backup(),
    files: () => [...items.values()].filter(x => x.type === 'file').map(x => ({ name: x.name, parent: items.get(x.parent)?.name, trashed: x.trashed, size: x.content.length })),
    read: name => [...items.values()].find(x => x.name === name && !x.trashed)?.content.toString('utf8'),
  };
}

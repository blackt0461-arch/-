// 歌詞を写真（スクリーンショット）から読み取る。
// 文字を読み取るしくみ：Tesseract.js（Apache 2.0・無料公開）。スマホの中で動かすので、写真はどこにも送られない。
// 初めて使うときだけ、読み取りの部品（約6MB）をダウンロードする（2回目からはスマホの中に保存したものを使う）
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn@1.0.0/4.0.0_best_int';

let loading = null;
function loadLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${TESS}tesseract.min.js`;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { loading = null; reject(new Error('読み取りの部品をダウンロードできませんでした（電波を確かめてください）')); };
    document.head.append(s);
  });
  return loading;
}

const JA = '[\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef]';
/** 読み取った文字を歌詞らしく整える：日本語の文字の間に入った空白を消す・空の行をまとめる */
export function cleanLyrics(text) {
  return String(text)
    .replace(new RegExp(`(?<=${JA})[ \\t]+(?=${JA})`, 'g'), '')
    .replace(new RegExp(`(?<=${JA})[ \\t]+(?=[0-9０-９])|(?<=[0-9０-９])[ \\t]+(?=${JA})`, 'g'), '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, '').replace(/^\s+/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 写真（複数可）から文字を読み取って、つなげて返す。onProgress(0〜1, 説明) */
export async function readLyricsFromImages(files, onProgress = () => {}) {
  onProgress(0, '読み取りの準備をしています');
  const Tesseract = await loadLibrary();
  let current = 0;
  const worker = await Tesseract.createWorker('jpn', 1, {
    workerPath: `${TESS}worker.min.js`,
    corePath: CORE,
    langPath: LANG,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress((current + m.progress) / files.length, `文字を読み取っています（${current + 1}/${files.length}枚目）`);
      else if (/loading|initializ/.test(m.status)) onProgress(0, '読み取りの部品を準備しています（初回だけ少し時間がかかります）');
    },
  });
  const parts = [];
  try {
    for (current = 0; current < files.length; current++) {
      const { data } = await worker.recognize(files[current]);
      parts.push(cleanLyrics(data.text));
    }
  } finally {
    await worker.terminate();
  }
  onProgress(1, '読み取りました');
  return parts.filter(Boolean).join('\n\n');
}

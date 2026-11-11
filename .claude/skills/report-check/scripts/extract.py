#!/usr/bin/env python3
"""レポートを読み取り、段落番号つきの本文・文字数・図を書き出す。

使い方:
    python3 extract.py <レポート(.docx/.pdf/.txt/.md)> --out <出力フォルダ>

できるもの(出力フォルダ内):
    paragraphs.txt  段落番号つきの本文。Word は [P番号]、表は [T表-行-列]、PDF は [ページ-段落]
    report.md       Word のとき: 数式も LaTeX で読める本文(pandoc)
    stats.txt       文字数など
    images/         Word に入っている図の画像
"""
import argparse
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"


def para_flags(p):
    """段落に図や数式が入っているか(入っている段落は丸ごと差し替えできない)。"""
    xml = p._p
    flags = []
    if xml.findall(f".//{W_NS}drawing") or xml.findall(f".//{W_NS}pict"):
        flags.append("図あり")
    if xml.findall(f".//{M_NS}oMath"):
        flags.append("数式あり")
    return flags


def extract_docx(path, out):
    import docx

    d = docx.Document(str(path))
    lines, body = [], []
    for i, p in enumerate(d.paragraphs, 1):
        text = p.text
        flags = para_flags(p)
        style = p.style.name if p.style is not None else ""
        tag = f"[P{i}]"
        if style and style != "Normal":
            tag += f"[{style}]"
        for f in flags:
            tag += f"[{f}]"
        if text.strip() or flags:
            lines.append(f"{tag} {text}")
            body.append(text)
    for t_i, t in enumerate(d.tables, 1):
        lines.append(f"\n--- 表{t_i} ---")
        for r_i, row in enumerate(t.rows):
            for c_i, cell in enumerate(row.cells):
                if cell.text.strip():
                    lines.append(f"[T{t_i}-{r_i}-{c_i}] {cell.text}")
                    body.append(cell.text)

    # 数式も読める本文
    try:
        subprocess.run(["pandoc", str(path), "-t", "gfm", "--wrap=none",
                        "-o", str(out / "report.md")], check=True)
    except Exception as e:  # pandoc がなくても続ける
        print(f"注意: report.md を作れませんでした ({e})", file=sys.stderr)

    # 図の画像
    img_dir = out / "images"
    with zipfile.ZipFile(path) as z:
        media = [n for n in z.namelist() if n.startswith("word/media/")]
        if media:
            img_dir.mkdir(exist_ok=True)
            for n in media:
                (img_dir / Path(n).name).write_bytes(z.read(n))
    return lines, body, len(media)


def extract_pdf(path, out):
    n_pages = 0
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True).stdout
    m = re.search(r"Pages:\s+(\d+)", info)
    if m:
        n_pages = int(m.group(1))
    lines, body = [], []
    for pg in range(1, n_pages + 1):
        txt = subprocess.run(["pdftotext", "-f", str(pg), "-l", str(pg), "-layout", str(path), "-"],
                             capture_output=True, text=True).stdout
        paras = [b.strip() for b in re.split(r"\n\s*\n", txt) if b.strip()]
        lines.append(f"\n===== {pg}ページ =====")
        for j, b in enumerate(paras, 1):
            lines.append(f"[{pg}-{j}] {b}")
            body.append(b)
    if not "".join(body).strip():
        lines.append("※ 文字を取り出せませんでした(スキャン画像の PDF の可能性)。Read ツールでページを画像として読むこと。")
    return lines, body, n_pages


def extract_text(path, out):
    txt = path.read_text(encoding="utf-8", errors="replace")
    paras = [l.strip() for l in txt.splitlines() if l.strip()]
    lines = [f"[P{i}] {p}" for i, p in enumerate(paras, 1)]
    return lines, paras, 0


def count_stats(body):
    text = "\n".join(body)
    no_space = re.sub(r"\s", "", text)
    # 「参考文献」の見出し以降を除いた文字数(見出しが見つかったときだけ)
    before_refs = None
    for i, b in enumerate(body):
        if re.match(r"^\s*(\d+[\.\s]*)?(参考文献|引用文献|References)\s*$", b.strip()):
            before_refs = re.sub(r"\s", "", "\n".join(body[:i]))
            break
    ja = len(re.findall(r"[぀-ヿ㐀-鿿]", text))
    words = len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text))
    s = [
        f"文字数(空白・改行を除く): {len(no_space)}",
        f"文字数(空白を含む・改行を除く): {len(text.replace(chr(10), ''))}",
    ]
    if before_refs is not None:
        s.append(f"文字数(参考文献より前・空白を除く): {len(before_refs)}")
    s += [f"日本語の文字の数: {ja}", f"英単語の数: {words}", f"段落の数: {len(body)}"]
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    path = Path(a.file)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    ext = path.suffix.lower()
    if ext == ".docx":
        lines, body, n = extract_docx(path, out)
        extra = f"図の数: {n}"
    elif ext == ".pdf":
        lines, body, n = extract_pdf(path, out)
        extra = f"ページ数: {n}"
    elif ext in (".txt", ".md", ""):
        lines, body, _ = extract_text(path, out)
        extra = "形式: テキスト"
    elif ext in (".doc", ".odt", ".rtf"):
        # 古い形式は docx に変換してから読む
        subprocess.run(["soffice", "--headless", "--convert-to", "docx", "--outdir", str(out), str(path)],
                       check=True, capture_output=True)
        conv = out / (path.stem + ".docx")
        lines, body, n = extract_docx(conv, out)
        extra = f"図の数: {n}(.docx に変換して読んだ: {conv})"
    else:
        sys.exit(f"この形式には対応していません: {ext}")

    # 元ファイルのコピー(make_outputs.py が使う)
    if ext != ".txt" and not (out / ("original" + ext)).exists():
        shutil.copy(path, out / ("original" + ext))

    (out / "paragraphs.txt").write_text("\n".join(lines), encoding="utf-8")
    stats = count_stats(body) + [extra]
    (out / "stats.txt").write_text("\n".join(stats), encoding="utf-8")
    print("\n".join(stats))
    print(f"→ {out}/paragraphs.txt を読んでください")


if __name__ == "__main__":
    main()

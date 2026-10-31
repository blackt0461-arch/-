#!/usr/bin/env python3
"""チェック結果(JSON)から、直した版と指摘一覧のファイルを作る。

使い方:
    python3 make_outputs.py <result.json> --format docx [pdf] [txt]

result.json の形(result.json と同じフォルダに出力する):
{
  "title": "〇〇実験レポート",
  "report_type": "実験レポート",
  "source": "レポート添削結果/xxx/original.docx",   // 元ファイル。.docx なら書式を残して差し替える
  "summary": {"good": ["..."], "top3": ["...", "...", "..."]},
  "conditions": [{"item": "2000字以上", "status": "×", "note": "現在1650字"}],
  "findings": [
    {"severity": "大", "category": "H", "location": "P12",
     "quote": "元の文", "problem": "何が問題か", "suggestion": "直した例文"}
  ],
  // 元が .docx のとき: 段落番号(paragraphs.txt の P番号)ごとの差し替え
  "edits": [
    {"para": 12, "new": "直した段落の文"},
    {"table": 1, "row": 0, "col": 2, "new": "表のセルの新しい文"}
  ],
  // 元が PDF・テキストのとき(または .docx でも全部作り直すとき): 直した全文。見出しは #、数式は $...$
  "revised_markdown": "# タイトル\\n\\n本文..."
}

できるもの:
    直した版.docx / .pdf / .txt     (--format で選んだもの)
    直した版_変更箇所つき.docx       (元が .docx のとき。変えた段落に黄色の色)
    指摘一覧.md / 指摘一覧.pdf
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"


def ensure_math_support():
    """LibreOffice の数式部品がないと、PDF にしたとき数式が消える。なければ入れる。"""
    if subprocess.run(["dpkg", "-s", "libreoffice-math"], capture_output=True).returncode == 0:
        return
    print("数式を PDF に出すための部品(libreoffice-math)を入れています...", file=sys.stderr)
    r = subprocess.run("apt-get install -y -q libreoffice-math || (apt-get update -q && apt-get install -y -q libreoffice-math)",
                       shell=True, capture_output=True)
    if r.returncode != 0:
        print("注意: 部品を入れられませんでした。PDF では数式が表示されない可能性があります。", file=sys.stderr)


def to_pdf(src, outdir):
    ensure_math_support()
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(outdir), str(src)],
                   check=True, capture_output=True)
    return Path(outdir) / (Path(src).stem + ".pdf")


def set_para_text(p, text, highlight=False):
    """段落の文を差し替える。最初の文字のかたまり(run)の書式を残す。"""
    from docx.enum.text import WD_COLOR_INDEX

    xml = p._p
    if xml.findall(f".//{W_NS}drawing") or xml.findall(f".//{W_NS}pict") or xml.findall(f".//{M_NS}oMath"):
        return False
    runs = p.runs
    if not runs:
        r = p.add_run(text)
    else:
        r = runs[0]
        r.text = text
        for extra in runs[1:]:
            extra._r.getparent().remove(extra._r)
    if highlight:
        r.font.highlight_color = WD_COLOR_INDEX.YELLOW
    return True


def apply_docx_edits(src, edits, dst, highlight):
    import docx

    d = docx.Document(str(src))
    skipped = []
    for e in edits:
        if "para" in e:
            i = int(e["para"])
            if not 1 <= i <= len(d.paragraphs):
                skipped.append(f"P{i}(番号が範囲外)")
                continue
            if not set_para_text(d.paragraphs[i - 1], e["new"], highlight):
                skipped.append(f"P{i}(図か数式を含むため自動で差し替えできない)")
        elif "table" in e:
            try:
                cell = d.tables[int(e["table"]) - 1].rows[int(e["row"])].cells[int(e["col"])]
            except IndexError:
                skipped.append(f"表{e['table']}-{e['row']}-{e['col']}(範囲外)")
                continue
            ps = cell.paragraphs
            set_para_text(ps[0], e["new"], highlight)
            for extra in ps[1:]:
                extra._p.getparent().remove(extra._p)
    d.save(str(dst))
    return skipped


def feedback_markdown(r):
    L = [f"# 指摘一覧: {r.get('title', 'レポート')}", ""]
    if r.get("report_type"):
        L += [f"種類: {r['report_type']}", ""]
    s = r.get("summary", {})
    if s.get("good"):
        L += ["## よい点", ""] + [f"- {g}" for g in s["good"]] + [""]
    if s.get("top3"):
        L += ["## いちばん大事な直しどころ", ""] + [f"{i}. {t}" for i, t in enumerate(s["top3"], 1)] + [""]
    if r.get("conditions"):
        L += ["## 課題の条件", "", "| 条件 | 判定 | メモ |", "|---|---|---|"]
        L += [f"| {c['item']} | {c['status']} | {c.get('note', '')} |" for c in r["conditions"]]
        L.append("")
    order = {"大": 0, "中": 1, "小": 2}
    fs = sorted(r.get("findings", []), key=lambda f: order.get(f.get("severity"), 3))
    if fs:
        L += ["## 指摘", ""]
        for n, f in enumerate(fs, 1):
            L.append(f"### {n}. 【{f.get('severity', '')}】{f.get('problem', '')}")
            L.append("")
            L.append(f"- 種類: {f.get('category', '')}　場所: {f.get('location', '')}")
            if f.get("quote"):
                L.append(f"- 元の文: {f['quote']}")
            if f.get("suggestion"):
                L.append(f"- 直した例: {f['suggestion']}")
            L.append("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("result")
    ap.add_argument("--format", nargs="+", default=["docx"], choices=["docx", "pdf", "txt"])
    a = ap.parse_args()
    rpath = Path(a.result)
    out = rpath.parent
    r = json.loads(rpath.read_text(encoding="utf-8"))
    made = []

    # 指摘一覧
    fb_md = out / "指摘一覧.md"
    fb_md.write_text(feedback_markdown(r), encoding="utf-8")
    fb_docx = out / "指摘一覧.docx"
    subprocess.run(["pandoc", str(fb_md), "-o", str(fb_docx)], check=True)
    made.append(to_pdf(fb_docx, out))
    fb_docx.unlink()

    # 直した版
    src = Path(r["source"]) if r.get("source") else None
    revised_docx = out / "直した版.docx"
    if r.get("edits") and src and src.suffix.lower() == ".docx":
        skipped = apply_docx_edits(src, r["edits"], revised_docx, highlight=False)
        marked = out / "直した版_変更箇所つき.docx"
        apply_docx_edits(src, r["edits"], marked, highlight=True)
        made.append(marked)
        if skipped:
            print("自動で差し替えられなかった段落(指摘一覧で手直しを案内すること): " + ", ".join(skipped))
    elif r.get("revised_markdown"):
        md = out / "直した版.md"
        md.write_text(r["revised_markdown"], encoding="utf-8")
        subprocess.run(["pandoc", str(md), "-o", str(revised_docx)], check=True)
        md.unlink()
    else:
        sys.exit("edits(元が .docx のとき)か revised_markdown のどちらかが必要です")

    if "pdf" in a.format:
        made.append(to_pdf(revised_docx, out))
    if "txt" in a.format:
        txt = out / "直した版.txt"
        subprocess.run(["pandoc", str(revised_docx), "-t", "plain", "--wrap=none", "-o", str(txt)], check=True)
        made.append(txt)
    if "docx" in a.format:
        made.append(revised_docx)
    else:
        # docx はほかの形式を作るための途中ファイル。変更箇所つき版があるときは残さない
        revised_docx.unlink()

    print("できたファイル:")
    for m in made:
        print(f"  {m}")


if __name__ == "__main__":
    main()

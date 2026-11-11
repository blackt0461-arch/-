# Word レポート作成の部品

ひな形(docx)に本文・数式・図・表・グラフを差し込むための部品。使う前に `../../lessons.md` を読むこと。

| ファイル | 役目 |
|---|---|
| `builder.py` | 本文・小見出し(字下げなし)・数式(式番号つき)・図(説明は下＋空行)・表(説明は上＋格子罫線＋空行) |
| `omml.py` | LaTeX の式を Word の数式(OMML)に変換(pandoc を使う)。`$...$` で文中の数式 |
| `wordchart.py` | 複数の線を重ねた散布図(白黒でも区別できる線種・印，凡例はグラフ内)を Word のグラフとして埋め込む |
| `xlstyle.py` | 1本の線のグラフ(Excel 既定に近い見た目)。軸ラベル・単位あり，タイトルなし |

必要なもの: `pip install python-docx python-pptx xlsxwriter`，pandoc。PDF 確認は LibreOffice(+ libreoffice-math)。

最小の例:
```python
import sys; sys.path.insert(0, '.claude/skills/report-check/scripts/docx_parts')
import docx, xlstyle
from builder import Report
d = docx.Document('report_format.docx')
c = Report(d).cursor_after(d.paragraphs[8])
c.sub('2.1 反転増幅回路')
c.para('増幅率は抵抗の比$\\frac{R_{2}}{R_{1}}$で決まる．')
c.eq(r'V_{OUT}=-\frac{R_{2}}{R_{1}}V_{IN}', '2.1')
gp = c.chart_paragraph()
xlstyle.add(d, gp, [0, 1, 2], [3.9, 2.5, 0.8], '入力電圧 VIN [V]', '出力電圧 VOUT1 [V]', (0, 5, 1), (0, 4.5, 0.5))
c.caption('図4.7 反転増幅回路の入出力特性')
d.save('out.docx')
```

注意: LibreOffice で PDF にすると，数式の括弧が「|」に見えることがある(Word では正しく表示される)。

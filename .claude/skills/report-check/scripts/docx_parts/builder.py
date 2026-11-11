"""レポートのひな形(docx)に，本文・小見出し・数式・図・表を順に差し込むための部品。

使い方の例:
    import sys; sys.path.insert(0, '<このフォルダ>')
    import docx
    from builder import Report
    d = docx.Document('report_format.docx')
    rep = Report(d)
    c = rep.cursor_after(d.paragraphs[8])          # 見出し「理論」の後ろから書く
    c.sub('2.1 オペアンプの特性')                   # 小見出し(字下げなし)
    c.para('出力は $V_{O}=A(V_{NI}-V_{I})$ となる．')  # $...$ は文中の数式，V_{IN} は下付き
    c.eq(r'V_{OUT}=-\\frac{R_{2}}{R_{1}}V_{IN}', '2.1')  # 独立した数式＋式番号
    c.figure('fig.png', 7.5, '図2.1 反転増幅回路[1]')  # 図→説明(下)→空行
    c.table('表4.1 使用した実験器具', [['器具','型番'], ['電源','PW18-3ADP']], widths=[3.4, 4.8])
    d.save('out.docx')
"""
import re
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from omml import add_math

TOK = re.compile(r'([A-Za-zβμ]+)_\{([^}]*)\}|\^\{([^}]*)\}')


def rich(p, text, size=None, bold=False):
    """V_{IN} → 下付き，10^{5} → 上付き，$...$ → 文中の数式"""
    parts = re.split(r'\$([^$]+)\$', text)
    if len(parts) > 1:
        for k, part in enumerate(parts):
            if k % 2:
                add_math(p, part)
            elif part:
                rich(p, part, size, bold)
        return
    pos = 0
    def run(t, sub=False, sup=False):
        r = p.add_run(t); r.bold = bold
        r.font.subscript = sub or None; r.font.superscript = sup or None
        if size: r.font.size = size
    for m in TOK.finditer(text):
        if m.start() > pos:
            run(text[pos:m.start()])
        if m.group(1):
            run(m.group(1)); run(m.group(2), sub=True)
        else:
            run(m.group(3), sup=True)
        pos = m.end()
    if pos < len(text):
        run(text[pos:])


def no_indent(p):
    """ひな形の「1文字下げ」を消す(小見出し用)"""
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind'); pPr.append(ind)
    ind.set(qn('w:firstLineChars'), '0'); ind.set(qn('w:firstLine'), '0')


class Report:
    def __init__(self, doc):
        self.d = doc

    def cursor_after(self, paragraph):
        return Cursor(self.d, paragraph._p)

    @staticmethod
    def remove(paragraph):
        paragraph._p.getparent().remove(paragraph._p)


class Cursor:
    """指定した場所の後ろに，順番に要素を差し込む"""
    COLUMN_WIDTH_CM = 8.2  # 2段組の1段の幅の目安

    def __init__(self, doc, el):
        self.d = doc; self.el = el

    def _put(self, new):
        self.el.addnext(new); self.el = new

    def para(self, text='', style=None, align=None, bold=False):
        p = self.d.add_paragraph(style=style)
        rich(p, text, bold=bold)
        if align is not None:
            p.alignment = align
        self._put(p._p)
        return p

    def sub(self, text, bold=False):
        """小見出し(2.1 ／ (1) ／ 考察1 ／ ①)：字下げしない"""
        p = self.para(text, bold=bold); no_indent(p)
        return p

    def blank(self):
        return self.para('')

    def eq(self, latex, num):
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_math(p, latex); p.add_run(f' ⋯({num})')
        self._put(p._p)

    def figure(self, path=None, width=7.5, caption='', placeholder=''):
        """図→説明文(図の下)→空行。path なしなら黄色の空欄"""
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.keep_with_next = True
        if path:
            p.add_run().add_picture(path, width=Cm(width))
        else:
            r = p.add_run('［ここに' + placeholder + 'を貼る］')
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW; r.font.color.rgb = RGBColor(0xC0, 0, 0)
        self._put(p._p)
        self.para(caption, style='Caption', align=WD_ALIGN_PARAGRAPH.CENTER)
        self.blank()

    def chart_paragraph(self):
        """グラフを入れる段落を作る(xlstyle.add / wordchart.add_chart に渡す)。後で caption() を呼ぶ"""
        p = self.para('', align=WD_ALIGN_PARAGRAPH.CENTER)
        p.paragraph_format.keep_with_next = True
        return p

    def caption(self, text):
        self.para(text, style='Caption', align=WD_ALIGN_PARAGRAPH.CENTER)
        self.blank()

    def table(self, caption, rows, widths=None, font_pt=8):
        """説明文(表の上)→格子罫線の表→空行"""
        cap = self.para(caption, style='Caption', align=WD_ALIGN_PARAGRAPH.CENTER)
        cap.paragraph_format.keep_with_next = True
        n = len(rows[0])
        ws = widths or [self.COLUMN_WIDTH_CM / n] * n
        t = self.d.add_table(rows=len(rows), cols=n)
        t.alignment = 1; t.autofit = False
        tp = t._tbl.tblPr
        lay = OxmlElement('w:tblLayout'); lay.set(qn('w:type'), 'fixed'); tp.append(lay)
        tw = tp.find(qn('w:tblW'))
        if tw is None:
            tw = OxmlElement('w:tblW'); tp.append(tw)
        tw.set(qn('w:w'), str(int(sum(ws) * 567))); tw.set(qn('w:type'), 'dxa')
        for j, gc in enumerate(t._tbl.tblGrid.findall(qn('w:gridCol'))):
            gc.set(qn('w:w'), str(int(ws[j] * 567)))
        b = OxmlElement('w:tblBorders')
        for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            e = OxmlElement(f'w:{edge}'); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '4'); e.set(qn('w:color'), '000000'); b.append(e)
        tp.append(b)
        for i, row in enumerate(rows):
            for j, v in enumerate(row):
                cell = t.cell(i, j); cell.width = Cm(ws[j]); cell.text = ''
                pp = cell.paragraphs[0]; pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                no_indent(pp)
                pp.paragraph_format.keep_with_next = i < len(rows) - 1
                rich(pp, str(v), size=Pt(font_pt))
        self._put(t._tbl)
        self.blank()

    def ai_sample_notice(self):
        """AIが全文を作った見本に必ず入れる表示"""
        p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run('【AI（Claude）が作成した見本・提出用ではない】'); r.bold = True; r.font.color.rgb = RGBColor(0xC0, 0, 0)
        self._put(p._p)

"""LaTeX の式を Word の数式(OMML)に変換して段落に入れる。pandoc を使う。"""
import subprocess, tempfile, os, copy
import docx
from docx.oxml.ns import qn

M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
_cache = {}


def omml(latex):
    import re
    latex = re.sub(r'_\{([A-Za-z0-9]{2,})\}', r'_{\\mathrm{\1}}', latex)
    latex = latex.replace(r'\left(', '(').replace(r'\right)', ')')
    if latex in _cache:
        return copy.deepcopy(_cache[latex])
    with tempfile.TemporaryDirectory() as td:
        md = os.path.join(td, 'e.md'); out = os.path.join(td, 'e.docx')
        open(md, 'w').write('$' + latex + '$\n')
        subprocess.run(['pandoc', md, '-o', out], check=True)
        dd = docx.Document(out)
        m = dd.paragraphs[0]._p.find('.//{%s}oMath' % M_NS)
        _cache[latex] = copy.deepcopy(m)
        return copy.deepcopy(m)


def add_math(paragraph, latex):
    paragraph._p.append(omml(latex))

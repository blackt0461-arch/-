"""Word のネイティブなグラフ(散布図)を docx に埋め込む。データは埋め込み Excel に入るので、Word で「データの編集」ができる。"""
import copy
from lxml import etree
from docx.opc.part import Part
from docx.opc.packuri import PackURI
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import parse_xml
from docx.shared import Cm
from pptx.chart.data import XyChartData
from pptx.chart.xmlwriter import ChartXmlWriter
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_MARKER_STYLE
from pptx.oxml import parse_xml as pptx_parse
from pptx.chart.chart import Chart
from pptx.dml.color import RGBColor
from pptx.util import Pt
from pptx.enum.dml import MSO_LINE_DASH_STYLE

C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

_count = [0]


def build_scatter(series, x_title, y_title, x_range=None, y_range=None):
    """series: [(名前, xs, ys, marker, dash, filled)] → (chart xml bytes, xlsx bytes)"""
    cd = XyChartData()
    for name, xs, ys, *_ in series:
        s = cd.add_series(name)
        for x, y in zip(xs, ys):
            s.add_data_point(x, y)
    xml = ChartXmlWriter(XL_CHART_TYPE.XY_SCATTER_LINES, cd).xml
    cs = pptx_parse(xml.encode('utf-8') if isinstance(xml, str) else xml)
    ch = Chart(cs, None)
    ch.has_title = False
    ch.has_legend = True
    ch.legend.position = XL_LEGEND_POSITION.CORNER
    ch.legend.include_in_layout = False
    ch.legend.font.size = Pt(8)
    ch.font.size = Pt(8)
    ch.font.name = 'Times New Roman'
    ch.font.color.rgb = RGBColor(0, 0, 0)
    for ax, title, rng in ((ch.category_axis, x_title, x_range), (ch.value_axis, y_title, y_range)):
        ax.has_title = True
        ax.axis_title.text_frame.text = title
        ax.axis_title.text_frame.paragraphs[0].runs[0].font.size = Pt(9)
        ax.axis_title.text_frame.paragraphs[0].runs[0].font.bold = False
        ax.has_major_gridlines = True
        ax.major_gridlines.format.line.color.rgb = RGBColor(0xD9, 0xD9, 0xD9)
        ax.format.line.color.rgb = RGBColor(0, 0, 0)
        if rng:
            ax.minimum_scale, ax.maximum_scale, ax.major_unit = rng
    for s, (name, xs, ys, marker, dash, filled) in zip(ch.plots[0].series, series):
        s.smooth = False
        s.format.line.color.rgb = RGBColor(0, 0, 0)
        s.format.line.width = Pt(0.75)
        s.format.line.dash_style = dash
        s.marker.style = marker
        s.marker.size = 3
        s.marker.format.line.color.rgb = RGBColor(0, 0, 0)
        s.marker.format.fill.solid()
        s.marker.format.fill.fore_color.rgb = RGBColor(0, 0, 0) if filled else RGBColor(0xFF, 0xFF, 0xFF)
    # 凡例をグラフの中(左下)に置く
    leg = cs.find(f'.//{{{C_NS}}}legend')
    for old in leg.findall(f'{{{C_NS}}}layout'):
        leg.remove(old)
    lay = etree.fromstring(
        f'<c:layout xmlns:c="{C_NS}"><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/>'
        f'<c:x val="0.19"/><c:y val="0.46"/><c:w val="0.40"/><c:h val="0.30"/></c:manualLayout></c:layout>')
    pos = leg.find(f'{{{C_NS}}}legendPos')
    pos.addnext(lay)
    ov = leg.find(f'{{{C_NS}}}overlay')
    if ov is None:
        ov = etree.SubElement(leg, f'{{{C_NS}}}overlay')
    ov.set('val', '1')
    sp = etree.fromstring(f'<c:spPr xmlns:c="{C_NS}" xmlns:a="{A_NS}"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
                          f'<a:ln w="6350"><a:solidFill><a:srgbClr val="808080"/></a:solidFill></a:ln></c:spPr>')
    ov.addnext(sp)
    return etree.tostring(cs, xml_declaration=True, encoding='UTF-8', standalone=True), cd.xlsx_blob


def add_chart(doc, paragraph, series, x_title, y_title, width_cm=8.0, height_cm=6.0, **kw):
    _count[0] += 1
    n = _count[0]
    chart_xml, xlsx = build_scatter(series, x_title, y_title, **kw)
    pkg = doc.part.package
    # 埋め込み Excel
    xlsx_part = Part(PackURI(f'/word/embeddings/Microsoft_Excel_Worksheet{n}.xlsx'),
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx, pkg)
    # グラフ本体
    root = etree.fromstring(chart_xml)
    chart_part = Part(PackURI(f'/word/charts/chart{n}.xml'),
                      'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', b'', pkg)
    xrid = chart_part.relate_to(xlsx_part, RT.PACKAGE)
    ext = etree.SubElement(root, f'{{{C_NS}}}externalData')
    ext.set(f'{{{R_NS}}}id', xrid)
    au = etree.SubElement(ext, f'{{{C_NS}}}autoUpdate')
    au.set('val', '0')
    rc = etree.Element(f'{{{C_NS}}}roundedCorners'); rc.set('val', '0')
    d19 = root.find(f'{{{C_NS}}}date1904')
    if d19 is not None:
        d19.addnext(rc)
    else:
        root.insert(0, rc)
    chart_el = root.find(f'{{{C_NS}}}chart')
    if root.find(f'{{{C_NS}}}spPr') is None:
        sp = etree.fromstring(f'<c:spPr xmlns:c="{C_NS}" xmlns:a="{A_NS}"><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>')
        chart_el.addnext(sp)
    chart_part._blob = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    rid = doc.part.relate_to(chart_part, RT.CHART)
    cx, cy = int(Cm(width_cm)), int(Cm(height_cm))
    drawing = parse_xml(
        f'<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        f'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        f'xmlns:a="{A_NS}" xmlns:c="{C_NS}" xmlns:r="{R_NS}">'
        f'<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
        f'<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="{900 + n}" name="グラフ {n}"/>'
        f'<wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="{C_NS}"><c:chart r:id="{rid}"/>'
        f'</a:graphicData></a:graphic></wp:inline></w:drawing>')
    paragraph.add_run()._r.append(drawing)

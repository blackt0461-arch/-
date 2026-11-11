"""Excel 既定に近い見た目(1本の線・印なし)のグラフを Word に埋め込む。
軸ラベル・単位あり，グラフ内タイトルなし，角は四角・外枠なし(wordchart.add_chart が設定)。"""
from lxml import etree
from pptx.chart.data import XyChartData
from pptx.chart.xmlwriter import ChartXmlWriter
from pptx.enum.chart import XL_CHART_TYPE, XL_MARKER_STYLE
from pptx.oxml import parse_xml as pptx_parse
from pptx.chart.chart import Chart
from pptx.dml.color import RGBColor
from pptx.util import Pt
import wordchart


def build(xs, ys, x_label, y_label, x_range, y_range, smooth=True, color='156082', name='data'):
    cd = XyChartData()
    s = cd.add_series(name)
    for x, y in zip(xs, ys):
        s.add_data_point(x, y)
    kind = XL_CHART_TYPE.XY_SCATTER_SMOOTH_NO_MARKERS if smooth else XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS
    cs = pptx_parse(ChartXmlWriter(kind, cd).xml.encode('utf-8'))
    ch = Chart(cs, None)
    ch.has_title = False
    ch.has_legend = False
    ch.font.size = Pt(8)
    ch.font.color.rgb = RGBColor(0, 0, 0)
    for ax, rng, lab in ((ch.category_axis, x_range, x_label), (ch.value_axis, y_range, y_label)):
        if rng:
            ax.minimum_scale, ax.maximum_scale, ax.major_unit = rng
        ax.has_title = True
        ax.axis_title.text_frame.text = lab
        r = ax.axis_title.text_frame.paragraphs[0].runs[0]
        r.font.size = Pt(9); r.font.bold = False; r.font.color.rgb = RGBColor(0, 0, 0)
        ax.has_major_gridlines = True
        ax.major_gridlines.format.line.color.rgb = RGBColor(0xD9, 0xD9, 0xD9)
        ax.format.line.color.rgb = RGBColor(0xD9, 0xD9, 0xD9)
    ser = ch.plots[0].series[0]
    ser.smooth = smooth
    ser.format.line.color.rgb = RGBColor.from_string(color)
    ser.format.line.width = Pt(2.25)
    ser.marker.style = XL_MARKER_STYLE.NONE
    return etree.tostring(cs, xml_declaration=True, encoding='UTF-8', standalone=True), cd.xlsx_blob


def add(doc, paragraph, xs, ys, x_label, y_label, x_range=None, y_range=None,
        smooth=True, color='156082', width_cm=7.6, height_cm=4.6):
    """paragraph の中にグラフを入れる。x_range=(最小, 最大, 目盛り間隔)"""
    orig = wordchart.build_scatter
    wordchart.build_scatter = lambda *a, **k: build(xs, ys, x_label, y_label, x_range, y_range, smooth, color)
    try:
        wordchart.add_chart(doc, paragraph, None, None, None, width_cm=width_cm, height_cm=height_cm)
    finally:
        wordchart.build_scatter = orig

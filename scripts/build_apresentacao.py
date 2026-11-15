#!/usr/bin/env python3
"""
Gera o deck comercial da DLucas Express em PPTX (16:9), editável no
PowerPoint / Google Slides / Keynote.

Uso:  python3 scripts/build_apresentacao.py
Saída: apresentacao/DLucas-Express-Apresentacao.pptx
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ------------------------------------------------------------------ paleta
BRAND_950 = RGBColor(0x04, 0x29, 0x24)
BRAND_900 = RGBColor(0x12, 0x45, 0x3F)
BRAND_800 = RGBColor(0x13, 0x53, 0x4B)
BRAND_700 = RGBColor(0x14, 0x68, 0x5C)
BRAND_500 = RGBColor(0x22, 0xA2, 0x89)
BRAND_400 = RGBColor(0x41, 0xBE, 0xA3)
BRAND_300 = RGBColor(0x78, 0xD8, 0xC0)
BRAND_100 = RGBColor(0xD5, 0xF5, 0xEB)
BRAND_50 = RGBColor(0xEE, 0xFB, 0xF7)
INK_950 = RGBColor(0x0D, 0x16, 0x26)
INK_900 = RGBColor(0x23, 0x30, 0x43)
INK_700 = RGBColor(0x42, 0x4E, 0x60)
INK_600 = RGBColor(0x51, 0x60, 0x76)
INK_500 = RGBColor(0x67, 0x78, 0x8F)
INK_300 = RGBColor(0xB1, 0xBA, 0xC9)
INK_200 = RGBColor(0xD5, 0xDA, 0xE3)
INK_100 = RGBColor(0xEC, 0xEE, 0xF2)
INK_50 = RGBColor(0xF6, 0xF7, 0xF9)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
AMBER = RGBColor(0xB4, 0x53, 0x09)
RED = RGBColor(0xB9, 0x1C, 0x1C)
RED_BG = RGBColor(0xFE, 0xF2, 0xF2)
RED_BORDER = RGBColor(0xFE, 0xCA, 0xCA)

FONT = "Inter"
FONT_D = "Plus Jakarta Sans"

W, H = Inches(13.333), Inches(7.5)
M = Inches(0.78)          # margem lateral
CONTENT_W = W - 2 * M

prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]

_slide_no = [0]


# ------------------------------------------------------------------ helpers
def new_slide(dark=False, tint=False):
    s = prs.slides.add_slide(BLANK)
    bg = s.background.fill
    bg.solid()
    bg.fore_color.rgb = BRAND_950 if dark else (BRAND_50 if tint else WHITE)
    _slide_no[0] += 1
    return s



def est_lines(text, size, width_in):
    """Estimativa conservadora de linhas: largura média de caractere ~0.52em
    para Inter/Plus Jakarta (bold usa 0.55). Serve para dimensionar caixas."""
    per_char_in = size * 0.55 / 72.0
    per_line = max(1, int(width_in / per_char_in))
    total = 0
    for ln in text.split("\n"):
        total += max(1, -(-len(ln) // per_line))
    return total


def tb(slide, x, y, w, h, text, size=14, color=INK_900, bold=False,
       font=FONT, align=PP_ALIGN.LEFT, spacing=1.18, anchor=MSO_ANCHOR.TOP,
       space_after=0):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(space_after)
        r = p.add_run()
        r.text = line
        f = r.font
        f.size = Pt(size)
        f.bold = bold
        f.name = font
        f.color.rgb = color
    return box


def eyebrow(slide, text, dark=False, y=Inches(0.62)):
    lbl = text.upper()
    box = slide.shapes.add_textbox(M, y, CONTENT_W, Inches(0.3))
    tf = box.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = " ".join(lbl)  # letter-spacing simulado
    f = r.font
    f.size = Pt(10)
    f.bold = True
    f.name = FONT
    f.color.rgb = BRAND_300 if dark else BRAND_700
    return box


def title(slide, text, dark=False, y=Inches(0.95), size=32, w=None):
    width_in = (w or CONTENT_W) / 914400
    n = est_lines(text, size, width_in)
    h = Inches(n * size * 1.1 / 72.0 + 0.1)
    return tb(slide, M, y, w or CONTENT_W, h, text, size=size,
              color=WHITE if dark else INK_950, bold=True, font=FONT_D, spacing=1.06)


def title_h(text, size, width_in):
    """Altura estimada do título, para posicionar o que vem abaixo."""
    return Inches(est_lines(text, size, width_in) * size * 1.1 / 72.0 + 0.1)


def lead(slide, text, dark=False, y=Inches(2.6), w=None, size=13.5):
    width = w or Inches(9.4)
    n = est_lines(text, size, width / 914400)
    h = Inches(n * size * 1.45 / 72.0 + 0.08)
    return tb(slide, M, y, width, h, text, size=size,
              color=RGBColor(0xBF, 0xD6, 0xD1) if dark else INK_600, spacing=1.42)


def card(slide, x, y, w, h, fill=WHITE, border=INK_200, radius=0.06):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    shp.adjustments[0] = radius
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if border is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = border
        shp.line.width = Pt(0.9)
    shp.shadow.inherit = False
    shp.text_frame.text = ""
    return shp


def card_content(slide, x, y, w, h, heading, body, *, dark=False, tsize=12.5,
                 bsize=10, badge=None, pad=0.24, accent_bar=False):
    """Cartão com título e corpo em UM único frame de texto: o PowerPoint
    quebra as linhas sozinho, sem risco de sobreposição."""
    fill = RGBColor(0x14, 0x2C, 0x28) if dark else WHITE
    border = RGBColor(0x2E, 0x4A, 0x44) if dark else INK_200
    box = card(slide, x, y, w, h, fill, border)
    if accent_bar:
        bar = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(0.055), h)
        bar.adjustments[0] = 0.5
        bar.fill.solid(); bar.fill.fore_color.rgb = BRAND_400
        bar.line.fill.background(); bar.shadow.inherit = False

    px = x + Inches(pad)
    pw = w - Inches(pad * 2)
    cy = y + Inches(pad * 0.85)

    if badge:
        bs = Inches(0.32)
        b = card(slide, px, cy, bs, bs, BRAND_100 if not dark else BRAND_800, None, 0.28)
        btf = b.text_frame
        btf.margin_left = btf.margin_right = btf.margin_top = btf.margin_bottom = 0
        btf.vertical_anchor = MSO_ANCHOR.MIDDLE
        bp = btf.paragraphs[0]; bp.alignment = PP_ALIGN.CENTER
        br = bp.add_run(); br.text = badge
        br.font.size = Pt(9.5); br.font.bold = True; br.font.name = FONT_D
        br.font.color.rgb = BRAND_700 if not dark else BRAND_300
        cy = cy + bs + Inches(0.1)

    avail_in = (h - (cy - y)) / 914400 - 0.4
    need = (est_lines(heading, tsize, pw / 914400) * tsize * 1.14
            + est_lines(body, bsize, pw / 914400) * bsize * 1.4) / 72.0 + 0.22
    frame_h = Inches(min(need, max(avail_in, 0.4)))

    tf_box = slide.shapes.add_textbox(px, cy, pw, frame_h)
    tf = tf_box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    p1 = tf.paragraphs[0]
    p1.line_spacing = 1.12
    p1.space_after = Pt(3)
    r1 = p1.add_run(); r1.text = heading
    r1.font.size = Pt(tsize); r1.font.bold = True; r1.font.name = FONT_D
    r1.font.color.rgb = WHITE if dark else INK_900

    p2 = tf.add_paragraph()
    p2.line_spacing = 1.36
    r2 = p2.add_run(); r2.text = body
    r2.font.size = Pt(bsize); r2.font.name = FONT
    r2.font.color.rgb = RGBColor(0xC9, 0xDC, 0xD7) if dark else INK_600
    return box


def bullets(slide, x, y, w, items, *, dark=False, size=11, gap=None,
            marker="\u2713", marker_color=None, marker_color_x=None, h=None):
    """Lista com marcador — UM único frame de texto, um parágrafo por item.
    Assim a quebra de linha é resolvida pelo PowerPoint, sem sobreposição."""
    mc = marker_color or (BRAND_300 if dark else BRAND_500)
    mx = marker_color_x or RED
    box = slide.shapes.add_textbox(x, y, w, h or Inches(0.34 * len(items) + 0.1))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, it in enumerate(items):
        kind = None
        if isinstance(it, tuple):
            it, kind = it
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = 1.3
        p.space_after = Pt(6)
        rm = p.add_run()
        rm.text = ("\u2715  " if kind == "x" else marker + "  ")
        rm.font.size = Pt(size + 0.5); rm.font.bold = True; rm.font.name = FONT
        rm.font.color.rgb = mx if kind == "x" else mc
        rt = p.add_run(); rt.text = it
        rt.font.size = Pt(size); rt.font.name = FONT
        rt.font.color.rgb = RGBColor(0xC9, 0xDC, 0xD7) if dark else INK_600
    return box


def stat(slide, x, y, w, big, label, sub=None, dark=False):
    card(slide, x, y, w, Inches(1.12), BRAND_50 if not dark else RGBColor(0x14, 0x2C, 0x28),
         BRAND_100 if not dark else RGBColor(0x2E, 0x4A, 0x44))
    tb(slide, x + Inches(0.22), y + Inches(0.17), w - Inches(0.44), Inches(0.5), big,
       size=26, color=BRAND_700 if not dark else BRAND_300, bold=True, font=FONT_D, spacing=1.0)
    tb(slide, x + Inches(0.22), y + Inches(0.68), w - Inches(0.44), Inches(0.4), label,
       size=8.5, color=INK_500 if not dark else RGBColor(0x89, 0xA8, 0xA1), bold=True, spacing=1.2)


def pill(slide, x, y, text, fill=BRAND_100, color=BRAND_800, size=8.5):
    w = Inches(0.11 * len(text) + 0.34)
    s = card(slide, x, y, w, Inches(0.27), fill, None, 0.5)
    tf = s.text_frame
    tf.margin_left = tf.margin_right = Inches(0.08)
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.bold = True; r.font.name = FONT; r.font.color.rgb = color
    return s


def table(slide, x, y, w, headers, rows, col_w=None, size=10.5, head_size=8.5,
          row_h=0.42, dark=False):
    n_rows = len(rows) + 1
    shp = slide.shapes.add_table(n_rows, len(headers), x, y, w, Inches(row_h * n_rows))
    t = shp.table
    if col_w:
        total = sum(col_w)
        for i, cw in enumerate(col_w):
            t.columns[i].width = Emu(int(w * cw / total))
    for i, htext in enumerate(headers):
        cell = t.cell(0, i)
        cell.text = ""
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor(0x14, 0x2C, 0x28) if dark else INK_50
        cell.margin_left = cell.margin_right = Inches(0.1)
        cell.margin_top = cell.margin_bottom = Inches(0.04)
        p = cell.text_frame.paragraphs[0]
        r = p.add_run(); r.text = htext.upper()
        r.font.size = Pt(head_size); r.font.bold = True; r.font.name = FONT
        r.font.color.rgb = RGBColor(0x89, 0xA8, 0xA1) if dark else INK_500
    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            cell = t.cell(ri, ci)
            cell.text = ""
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE if not dark else RGBColor(0x0A, 0x1C, 0x19)
            cell.margin_left = cell.margin_right = Inches(0.1)
            cell.margin_top = cell.margin_bottom = Inches(0.05)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            r = p.add_run(); r.text = val
            r.font.size = Pt(size); r.font.name = FONT
            r.font.color.rgb = RGBColor(0xC9, 0xDC, 0xD7) if dark else INK_600
    for ri in range(n_rows):
        t.rows[ri].height = Inches(row_h)
    return t


def page_num(slide, dark=False):
    tb(slide, W - Inches(1.15), H - Inches(0.5), Inches(0.55), Inches(0.3),
       str(_slide_no[0]), size=9, color=RGBColor(0x5D, 0x72, 0x80) if dark else INK_300,
       align=PP_ALIGN.RIGHT)


def brandmark(slide, y=Inches(0.55), dark=True, size=13):
    sq = card(slide, M, y, Inches(0.4), Inches(0.4), BRAND_500, None, 0.28)
    tf = sq.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = "D"
    r.font.size = Pt(size + 1); r.font.bold = True; r.font.name = FONT_D
    r.font.color.rgb = BRAND_950
    box = slide.shapes.add_textbox(M + Inches(0.52), y + Inches(0.05), Inches(3), Inches(0.35))
    tf2 = box.text_frame
    tf2.margin_left = tf2.margin_right = tf2.margin_top = tf2.margin_bottom = 0
    p2 = tf2.paragraphs[0]
    r1 = p2.add_run(); r1.text = "DLucas "
    r1.font.size = Pt(size); r1.font.bold = True; r1.font.name = FONT_D
    r1.font.color.rgb = WHITE if dark else INK_950
    r2 = p2.add_run(); r2.text = "Express"
    r2.font.size = Pt(size); r2.font.bold = True; r2.font.name = FONT_D
    r2.font.color.rgb = BRAND_300
    return sq


def quote(slide, x, y, w, h, text, dark=False, size=12):
    bar = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(0.06), h)
    bar.adjustments[0] = 0.5
    bar.fill.solid(); bar.fill.fore_color.rgb = BRAND_400
    bar.line.fill.background(); bar.shadow.inherit = False
    bgt = card(slide, x, y, w, h, BRAND_50 if not dark else RGBColor(0x12, 0x2E, 0x29), None, 0.05)
    bgt.element.getparent().remove(bgt.element)
    slide.shapes._spTree.insert_element_before(bgt._element, "p:extLst") if False else None
    box = slide.shapes.add_textbox(x + Inches(0.22), y + Inches(0.12), w - Inches(0.4), h - Inches(0.24))
    tf = box.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.line_spacing = 1.4
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.name = FONT
    r.font.color.rgb = BRAND_900 if not dark else RGBColor(0xD8, 0xEC, 0xE7)
    r.font.bold = False


# ================================================================== 1 · CAPA
s = new_slide(dark=True)
# halo decorativo
halo = slide_shape = s.shapes.add_shape(MSO_SHAPE.OVAL, W - Inches(5.4), -Inches(2.1),
                                        Inches(6.6), Inches(6.6))
halo.fill.solid(); halo.fill.fore_color.rgb = RGBColor(0x0A, 0x3B, 0x34)
halo.line.fill.background(); halo.shadow.inherit = False

brandmark(s, Inches(0.85), size=14)
eyebrow(s, "Logística de medicamentos", dark=True, y=Inches(2.05))
title(s, "Do pedido da farmácia\nao comprovante na mão\ndo paciente.", dark=True,
      y=Inches(2.42), size=40, w=Inches(9.6))
lead(s, "Uma plataforma para a DLucas Express operar o transporte de medicamentos com registro, "
        "controle e prestação de contas — em vez de WhatsApp, planilha e memória.",
     dark=True, y=Inches(4.72), w=Inches(8.2), size=14)

# faixa de destaques
line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, M, Inches(5.92), CONTENT_W, Pt(0.9))
line.fill.solid(); line.fill.fore_color.rgb = RGBColor(0x25, 0x46, 0x40)
line.line.fill.background(); line.shadow.inherit = False
cols = [
    ("3 acessos", "Central, farmácia e entregador"),
    ("Rastreio autorizado", "Só com permissão do entregador"),
    ("Publicado", "Plataforma já em ambiente de produção"),
]
cw = CONTENT_W / 3
for i, (a, b) in enumerate(cols):
    x = M + cw * i
    tb(s, x, Inches(6.18), cw - Inches(0.3), Inches(0.3), a, size=13,
       color=WHITE, bold=True, font=FONT_D)
    tb(s, x, Inches(6.55), cw - Inches(0.3), Inches(0.4), b, size=9.5,
       color=RGBColor(0x9F, 0xBD, 0xB6))
page_num(s, dark=True)

# ============================================================ 2 · PROBLEMA
s = new_slide()
eyebrow(s, "O ponto de partida")
title(s, "Quando a entrega depende de mensagem solta,\na operação não tem como se defender.",
      y=Inches(0.95), size=25, w=Inches(11.4))

probs = [
    ("“Já saiu?”", "A farmácia não sabe o status real. Liga para a central, que liga para o motoboy."),
    ("“Entregou mesmo?”", "Sem comprovante vinculado ao pedido, a discussão vira palavra contra palavra."),
    ("“Quanto ficou o mês?”", "Fechamento feito à mão, sujeito a erro, sem rastro de quem cobrou o quê."),
]
cy = Inches(2.28)
for h_, b_ in probs:
    card_content(s, M, cy, Inches(5.15), Inches(1.12), h_, b_, tsize=13, bsize=10.5)
    cy += Inches(1.26)

x2 = M + Inches(5.62)
left_lbl = "O QUE SE PERDE NA PRÁTICA"
card(s, x2, Inches(2.28), CONTENT_W - Inches(5.62), Inches(2.62), RED_BG, RED_BORDER, 0.05)
tb(s, x2 + Inches(0.28), Inches(2.46), Inches(5.2), Inches(0.3), left_lbl, size=8.5,
   color=RED, bold=True)
bullets(s, x2 + Inches(0.28), Inches(2.82), Inches(5.35), [
    "Histórico do pedido — quem coletou, quando, com qual instrução",
    "Prova da entrega anexada ao pedido, não no celular de alguém",
    "Critério para escolher o entregador, em vez de “quem tá mais perto do zap”",
    "Visibilidade para a farmácia sem precisar pedir informação",
    "Rastro de auditoria quando algo dá errado",
], size=10, marker="✕", marker_color_x=RED)

quote(s, x2, Inches(5.12), CONTENT_W - Inches(5.62), Inches(1.0),
      "Medicamento não é encomenda comum: exige identificação, instrução de manuseio "
      "e responsabilidade sobre quem recebeu.", size=11)
page_num(s)

# ============================================================ 3 · A SOLUÇÃO
s = new_slide(tint=True)
eyebrow(s, "A proposta")
title(s, "Um sistema só, três portas de entrada —\ncada perfil vê somente o que lhe compete.",
      y=Inches(0.95), size=25, w=Inches(11.6))

tri = [
    ("01", "Central de despacho",
     "A DLucas Express recebe o pedido, decide quem entrega, acompanha a rota e trata ocorrências.", "DLucas Express"),
    ("02", "Portal da farmácia",
     "A farmácia cria o pedido, acompanha o status e baixa comprovantes e faturas. Sem ligar para ninguém.", "Farmácia"),
    ("03", "Área do entregador",
     "O motoboy recebe a oferta no celular, aceita, avança cada etapa e envia a foto do comprovante.", "Entregador"),
]
cw = (CONTENT_W - Inches(0.6)) / 3
for i, (n, h_, b_, tag) in enumerate(tri):
    x = M + (cw + Inches(0.3)) * i
    card_content(s, x, Inches(2.3), cw, Inches(1.86), h_, b_, badge=n, tsize=13.5, bsize=10.5)
    pill(s, x + Inches(0.24), Inches(3.80), tag)

trio = [
    ("Nada depende de mensagem solta", "Cada mudança de status é registrada com autor e horário."),
    ("Farmácia não cobra informação", "Ela entra e vê. O sistema mostra, não a central."),
    ("Fechamento deixa de ser arqueologia", "Faturas saem das entregas efetivamente concluídas."),
]
for i, (h_, b_) in enumerate(trio):
    x = M + (cw + Inches(0.3)) * i
    card_content(s, x, Inches(4.62), cw, Inches(1.15), h_, b_,
                 tsize=11.5, bsize=9.5)
page_num(s)

# ============================================================== 4 · JORNADA
s = new_slide()
eyebrow(s, "Como funciona na prática")
title(s, "Seis etapas, todas registradas.", y=Inches(0.95), size=27)

steps = [
    ("01", "Farmácia cria", "Unidade de origem, destinatário, instruções, prioridade"),
    ("02", "Central despacha", "Escolha manual ou sugestão automática com critério"),
    ("03", "Entregador aceita", "Recebe a oferta, aceita ou recusa, e assume a rota"),
    ("04", "Coleta e rota", "Cada etapa confirmada no celular, com horário"),
    ("05", "Comprovante", "Foto anexada ao pedido, guardada em área restrita"),
    ("06", "Faturamento", "Entregas do período viram fatura; pagamentos registrados"),
]
sw = (CONTENT_W - Inches(0.5)) / 6
for i, (n, t_, d_) in enumerate(steps):
    x = M + (sw + Inches(0.1)) * i
    card(s, x, Inches(2.05), sw, Inches(1.72), WHITE, INK_200, 0.06)
    tb(s, x + Inches(0.16), Inches(2.2), sw - Inches(0.32), Inches(0.19), n, size=9,
       color=BRAND_500, bold=True, font=FONT_D)
    tb(s, x + Inches(0.16), Inches(2.44), sw - Inches(0.32), Inches(0.46), t_, size=10.5,
       color=INK_900, bold=True, font=FONT_D, spacing=1.12)
    tb(s, x + Inches(0.16), Inches(2.96), sw - Inches(0.32), Inches(0.72), d_, size=8,
       color=INK_500, spacing=1.3)
    if i < 5:
        ar = s.shapes.add_textbox(x + sw - Inches(0.03), Inches(2.72), Inches(0.15), Inches(0.26))
        p = ar.text_frame.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
        r = p.add_run(); r.text = "›"
        r.font.size = Pt(15); r.font.color.rgb = INK_300; r.font.name = FONT

stats = [("11", "status possíveis por pedido"),
         ("3", "níveis de prioridade — normal, alta, urgente"),
         ("15 min", "validade de cada oferta ao entregador"),
         ("0", "etapas que passam sem registro")]
sw2 = (CONTENT_W - Inches(0.66)) / 4
for i, (big, lbl) in enumerate(stats):
    x = M + (sw2 + Inches(0.22)) * i
    stat(s, x, Inches(4.32), sw2, big, lbl)
page_num(s)

# ============================================================== 5 · DESPACHO
s = new_slide()
eyebrow(s, "Diferencial · Central de despacho")
title(s, "A escolha do entregador deixa de ser “no olho”.", y=Inches(0.95), size=27)
lead(s, "O sistema sugere os melhores nomes para cada pedido e mostra por que — "
        "o despachante decide, mas com critério visível.", y=Inches(1.66), w=Inches(9.6))

table(s, M, Inches(2.5), Inches(7.0),
      ["Critério", "Pontos", "Por quê"],
      [["Disponível agora", "+40", "Quem está livre atende mais rápido"],
       ["Mesma cidade da coleta", "+20", "Menos deslocamento, menos atraso"],
       ["Atua no bairro", "+10", "Conhece a região e o acesso"],
       ["Distância até a coleta", "até +30", "Quanto mais perto, mais pontos"]],
      col_w=[2.3, 0.9, 3.8], size=11, row_h=0.46)

tb(s, M, Inches(4.85), Inches(7.0), Inches(0.7),
   "Entregadores já em rota saem da lista automaticamente. Sem localização compartilhada, "
   "o sistema diz isso na tela em vez de supor uma posição.", size=9.5, color=INK_500, spacing=1.35)

xr = M + Inches(7.42)
rw = CONTENT_W - Inches(7.42)
card(s, xr, Inches(2.5), rw, Inches(2.05), BRAND_50, BRAND_100, 0.05)
tb(s, xr + Inches(0.26), Inches(2.68), rw - Inches(0.52), Inches(0.3),
   "O QUE O DESPACHANTE VÊ", size=8.5, color=BRAND_700, bold=True)
bullets(s, xr + Inches(0.26), Inches(3.04), rw - Inches(0.52), [
    "Fila de pedidos pendentes e urgentes",
    "Ranking com pontuação e motivo de cada sugestão",
    "Mapa com coletas, entregas e posições autorizadas",
    "Atribuição direta quando o critério é outro",
], size=9.5)

card_content(s, xr, Inches(4.72), rw, Inches(1.42), "O que fica registrado",
             "Quem ofertou, para quem, quando, se aceitou e com qual justificativa — "
             "inclusive trocas de entregador no meio do caminho.",
             tsize=11.5, bsize=9.5)
page_num(s)

# ====================================================== 6 · PORTAL FARMÁCIA
s = new_slide(tint=True)
eyebrow(s, "Diferencial · Portal da farmácia")
title(s, "A farmácia deixa de perguntar\ne passa a consultar.", y=Inches(0.95), size=27)

left = [
    ("Pedir é simples e rastreável",
     "Formulário em blocos: coleta, destino, carga e prioridade. A unidade já vem preenchida "
     "do cadastro, então a farmácia não redigita endereço toda vez."),
    ("Preço transparente antes de enviar",
     "O valor é calculado a partir do contrato daquela farmácia e mostrado discriminado: "
     "base, quilômetros excedentes, taxa de urgência e de refrigerado."),
    ("Documento e histórico no lugar",
     "Comprovantes de cada entrega e faturas com status de pagamento, tudo dentro do portal — "
     "sem pedir foto no WhatsApp."),
]
cy = Inches(2.25)
for h_, b_ in left:
    card_content(s, M, cy, Inches(5.75), Inches(1.18), h_, b_, tsize=12.5, bsize=9.8)
    cy += Inches(1.3)

xr = M + Inches(6.15)
rw = CONTENT_W - Inches(6.15)
card(s, xr, Inches(2.25), rw, Inches(2.62), BRAND_50, BRAND_100, 0.05)
tb(s, xr + Inches(0.26), Inches(2.43), rw - Inches(0.52), Inches(0.3),
   "ISOLAMENTO É REGRA, NÃO CONFIGURAÇÃO", size=8.5, color=BRAND_700, bold=True)
bullets(s, xr + Inches(0.26), Inches(2.8), rw - Inches(0.52), [
    "Cada farmácia vê apenas os próprios pedidos",
    "Não vê valores nem pedidos de concorrentes",
    "Não consegue criar pedido em nome de outra farmácia",
    "Funcionários têm acesso limitado ao que o gestor liberar",
], size=9.5)
tb(s, xr + Inches(0.26), Inches(4.32), rw - Inches(0.52), Inches(0.4),
   "Essa separação é imposta pelo banco de dados, não apenas escondida na tela.",
   size=9, color=BRAND_800, spacing=1.3)

quote(s, xr, Inches(5.02), rw, Inches(1.1),
      "“Cada farmácia vê somente o que lhe compete” — inclusive se alguém tentar burlar a interface.",
      size=10.5)
page_num(s)

# ============================================================= 7 · ENTREGADOR
s = new_slide()
eyebrow(s, "Diferencial · Área do entregador")
title(s, "Feita para o celular, na mão, no meio da rua.", y=Inches(0.95), size=27)

left = [
    ("Oferta que chega na hora",
     "O entregador vê a oferta com farmácia, rota, distância e prazo, e responde aceitar ou recusar. "
     "Se recusar, o pedido volta para a fila e a central decide de novo."),
    ("Etapas na ordem certa",
     "Deslocamento → coleta → rota → entrega. O botão da tela é sempre o próximo passo válido: "
     "não tem como pular uma etapa nem marcar entrega sem ter coletado."),
    ("Comprovante e ocorrência",
     "Na entrega, envia a foto. Se algo impedir — destinatário ausente, endereço errado, recusa — "
     "registra a ocorrência com tipo e descrição para a central tratar."),
]
cy = Inches(2.25)
for h_, b_ in left:
    card_content(s, M, cy, Inches(5.75), Inches(1.18), h_, b_, tsize=12.5, bsize=9.8)
    cy += Inches(1.3)

xr = M + Inches(6.15)
rw = CONTENT_W - Inches(6.15)
card_content(s, xr, Inches(2.25), rw, Inches(1.25), "Disponibilidade sem telefonema",
             "O entregador marca se está disponível, e o próprio sistema ajusta isso conforme ele "
             "aceita e conclui entregas. A central enxerga a situação real, não a presumida.",
             tsize=12, bsize=9.5)
card_content(s, xr, Inches(3.62), rw, Inches(1.18), "Repasse visível",
             "O valor de repasse por entrega vem do contrato e fica registrado no pedido. "
             "O entregador consulta o histórico — sem conferência manual no fim do mês.",
             tsize=12, bsize=9.5)
card_content(s, xr, Inches(4.92), rw, Inches(1.2), "Sem app para instalar nesta primeira versão",
             "Abre no navegador do celular. Um aplicativo dedicado é um passo possível, não um pré-requisito.",
             tsize=11, bsize=9.2)
page_num(s)

# ============================================================ 8 · PRIVACIDADE
s = new_slide(dark=True)
eyebrow(s, "Princípio · Privacidade", dark=True)
title(s, "A localização é do entregador.\nA plataforma só mostra se ele autorizar.",
      dark=True, y=Inches(0.95), size=27)

card(s, M, Inches(2.32), Inches(5.9), Inches(1.85), RGBColor(0x14, 0x2C, 0x28),
     RGBColor(0x2E, 0x4A, 0x44), 0.05)
tb(s, M + Inches(0.26), Inches(2.5), Inches(5.4), Inches(0.3), "COMO FUNCIONA", size=8.5,
   color=BRAND_300, bold=True)
bullets(s, M + Inches(0.26), Inches(2.86), Inches(5.4), [
    "Nada é solicitado ao entregador sem ele acionar",
    "Se ele negar, a tela não mostra posição nenhuma",
    "A posição nunca é inventada ou estimada",
    "Outro entregador não consegue gravar em nome dele",
], dark=True, size=9.5)

card_content(s, M, Inches(4.34), Inches(5.9), Inches(1.35), "Honestidade temporal",
             "Posição com menos de 3 minutos aparece como atual. Mais antiga que isso, a plataforma "
             "informa “última posição conhecida” com o horário exato — em vez de fingir que é tempo real.",
             dark=True, tsize=12.5, bsize=9.5)

xr = M + Inches(6.3)
rw = CONTENT_W - Inches(6.3)

qb = card(s, xr, Inches(2.32), rw, Inches(1.25), RGBColor(0x12, 0x2E, 0x29),
          RGBColor(0x2E, 0x4A, 0x44), 0.05)
tb(s, xr + Inches(0.26), Inches(2.5), rw - Inches(0.52), Inches(0.9),
   "Quando não há autorização, o portal mostra o status da entrega — "
   "nunca um ponto no mapa que não corresponde à realidade.",
   size=12, color=RGBColor(0xD8, 0xEC, 0xE7), spacing=1.4)

card_content(s, xr, Inches(3.76), rw, Inches(1.93), "O que isso protege",
             "O entregador não é monitorado fora do horário de trabalho, e a DLucas Express não assume o risco "
             "de afirmar uma posição que não tem. Quem olha o mapa sabe exatamente o que está vendo.",
             dark=True, tsize=12.5, bsize=9.8)
page_num(s, dark=True)

# ============================================================== 9 · SEGURANÇA
s = new_slide()
eyebrow(s, "Segurança")
title(s, "A regra vive no banco de dados,\nnão na boa vontade da interface.",
      y=Inches(0.95), size=25)
lead(s, "Cada perfil enxerga apenas o que lhe compete por política do próprio banco. Mesmo com "
        "acesso técnico à aplicação, uma farmácia não lê os dados de outra.",
     y=Inches(2.0), w=Inches(10.6))

sw3 = (CONTENT_W - Inches(0.44)) / 3
for i, (big, lbl) in enumerate([
        ("54", "regras de acesso aplicadas no banco"),
        ("21", "tabelas com controle de acesso por linha"),
        ("100%", "das mudanças de status registradas com autor e horário")]):
    stat(s, M + (sw3 + Inches(0.22)) * i, Inches(2.72), sw3, big, lbl)

rows = [
    ["Farmácia tenta criar pedido em nome de outra farmácia", "Bloqueado"],
    ["Farmácia tenta ler pedidos de outra farmácia", "Bloqueado"],
    ["Usuário tenta se promover a administrador", "Bloqueado"],
    ["Entregador tenta ler faturas e dados comerciais", "Bloqueado"],
    ["Entregador tenta gravar localização de outro entregador", "Bloqueado"],
    ["Visitante tenta ler qualquer dado interno pelo site", "Bloqueado"],
    ["Comprovantes acessados por link público", "Bloqueado — só link temporário"],
]
t = table(s, M, Inches(4.06), CONTENT_W, ["Tentativa", "Resultado"], rows,
          col_w=[8.2, 3.4], size=10, row_h=0.36)
for ri in range(1, len(rows) + 1):
    cell = t.cell(ri, 1)
    p = cell.text_frame.paragraphs[0]
    for r in p.runs:
        r.font.bold = True
        r.font.color.rgb = RED
page_num(s)

# ============================================================= 10 · FINANCEIRO
s = new_slide(tint=True)
eyebrow(s, "Financeiro")
title(s, "Faturamento que nasce da entrega feita —\nnão da planilha.", y=Inches(0.95), size=27)

left = [
    ("Contrato define o preço",
     "Cada farmácia tem sua tabela: valor base, quilômetros incluídos, preço por km excedente, "
     "taxa de urgência e de item refrigerado, ciclo e prazo de pagamento."),
    ("Fatura por período",
     "O sistema lista apenas as entregas ainda não faturadas do período — nada é cobrado duas "
     "vezes, e nada fica de fora por esquecimento."),
    ("Pagamento parcial é normal",
     "Cada recebimento é registrado e o saldo e o status da fatura se atualizam sozinhos: "
     "aberta, parcial, paga ou vencida."),
]
cy = Inches(2.25)
for h_, b_ in left:
    card_content(s, M, cy, Inches(5.75), Inches(1.18), h_, b_, tsize=12.5, bsize=9.8)
    cy += Inches(1.3)

xr = M + Inches(6.15)
rw = CONTENT_W - Inches(6.15)
card(s, xr, Inches(2.25), rw, Inches(1.9), BRAND_50, BRAND_100, 0.05)
tb(s, xr + Inches(0.26), Inches(2.43), rw - Inches(0.52), Inches(0.3),
   "O QUE O FINANCEIRO ENXERGA", size=8.5, color=BRAND_700, bold=True)
bullets(s, xr + Inches(0.26), Inches(2.8), rw - Inches(0.52), [
    "A receber e vencido, consolidados",
    "Entregas por farmácia e por período",
    "Repasses devidos a cada entregador",
    "Indicadores para relatório mensal",
], size=9.5)

card_content(s, xr, Inches(4.3), rw, Inches(1.82), "Decisão de escopo desta versão",
             "O controle é manual: a plataforma registra e organiza, mas não processa cobrança nem "
             "integra meio de pagamento. Isso evita dependência de terceiros logo na largada e mantém "
             "a operação no controle.", tsize=12, bsize=9.5)
page_num(s)

# ================================================================ 11 · GESTÃO
s = new_slide()
eyebrow(s, "Gestão")
title(s, "Quem fez, o quê, quando — sem depender de lembrar.", y=Inches(0.95), size=27)

left = [
    ("Auditoria de atividades",
     "Toda ação relevante fica registrada: usuário, papel, o que mudou e em qual registro."),
    ("Usuários e permissões",
     "Sete perfis distintos, do administrador ao entregador. Novo usuário entra com senha "
     "temporária e é obrigado a trocá-la no primeiro acesso."),
    ("Ocorrências com tratamento",
     "Problema reportado em campo vira item com tipo, responsável e resolução registrada."),
]
cy = Inches(2.25)
for h_, b_ in left:
    card_content(s, M, cy, Inches(5.75), Inches(1.18), h_, b_, tsize=12.5, bsize=9.8)
    cy += Inches(1.3)

xr = M + Inches(6.15)
rw = CONTENT_W - Inches(6.15)
card(s, xr, Inches(2.25), rw, Inches(1.95), WHITE, INK_200, 0.05)
tb(s, xr + Inches(0.26), Inches(2.43), rw - Inches(0.52), Inches(0.3),
   "INDICADORES DO DIA", size=8.5, color=BRAND_700, bold=True)
bullets(s, xr + Inches(0.26), Inches(2.8), rw - Inches(0.52), [
    "Pedidos criados e entregues hoje",
    "Pedidos em andamento e entregadores ativos",
    "Valor a receber e valor vencido",
    "Distribuição por status e entregas dos últimos 7 dias",
], size=9.5)

card_content(s, xr, Inches(4.35), rw, Inches(1.78), "Captação comercial no mesmo lugar",
             "Pedidos de orçamento e candidaturas de entregadores que chegam pelo site entram direto "
             "na fila de análise da central — sem planilha paralela.",
             tsize=12, bsize=9.5)
page_num(s)

# ========================================================== 12 · STATUS ATUAL
s = new_slide(dark=True)
eyebrow(s, "Situação atual", dark=True)
title(s, "O que já está pronto e funcionando.", dark=True, y=Inches(0.95), size=27)
lead(s, "Plataforma publicada em ambiente de produção, com dados de demonstração para validação.",
     dark=True, y=Inches(1.66), w=Inches(10))

ready = [
    ("✓", "Site institucional", "8 páginas, orçamento e candidatura de entregador captando direto na plataforma."),
    ("✓", "Central de despacho", "Fila, sugestão com critério, atribuição, mapa, histórico e ocorrências."),
    ("✓", "Portal da farmácia", "Pedido, acompanhamento, comprovantes, unidades, equipe e financeiro."),
    ("✓", "Área do entregador", "Ofertas, etapas da entrega, comprovante, ocorrência e repasses."),
    ("✓", "Financeiro", "Contratos, faturas por período, pagamentos parciais e repasses."),
    ("✓", "Segurança e auditoria", "Isolamento por farmácia, permissões por perfil e trilha de atividades."),
]
cw = (CONTENT_W - Inches(0.6)) / 3
for i, (mk, h_, b_) in enumerate(ready):
    row, col = divmod(i, 3)
    x = M + (cw + Inches(0.3)) * col
    y = Inches(2.5) + Inches(1.42) * row
    card_content(s, x, y, cw, Inches(1.26), h_, b_, dark=True, tsize=12, bsize=9.2)

line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, M, Inches(5.6), CONTENT_W, Pt(0.9))
line.fill.solid(); line.fill.fore_color.rgb = RGBColor(0x25, 0x46, 0x40)
line.line.fill.background(); line.shadow.inherit = False
cols2 = [
    ("Testado ponta a ponta", "Pedido → despacho → aceite → coleta → rota → entrega → comprovante"),
    ("Isolamento verificado", "Tentativas de acesso cruzado bloqueadas"),
    ("Acesso imediato", "Login por perfil, sem instalação"),
]
for i, (a, b) in enumerate(cols2):
    x = M + cw * i
    tb(s, x, Inches(5.85), cw - Inches(0.3), Inches(0.3), a, size=11.5, color=WHITE,
       bold=True, font=FONT_D)
    tb(s, x, Inches(6.18), cw - Inches(0.35), Inches(0.55), b, size=9,
       color=RGBColor(0x9F, 0xBD, 0xB6), spacing=1.3)
page_num(s, dark=True)

# ======================================================== 13 · PRÓXIMOS PASSOS
s = new_slide()
eyebrow(s, "Próximos passos")
title(s, "O que falta é decisão de negócio,\nnão falta de base.", y=Inches(0.95), size=26)
lead(s, "A plataforma está funcional. As evoluções abaixo dependem de prioridade e de escolhas "
        "operacionais da DLucas Express.", y=Inches(2.0), w=Inches(10.4))

table(s, M, Inches(2.72), CONTENT_W,
      ["Frente", "O que envolve", "Depende de"],
      [["Cadastro real das farmácias",
        "Substituir os dados de demonstração pelos clientes reais, com contratos e tabelas de preço definitivas.",
        "Dados da DLucas Express"],
       ["Notificações por e-mail e SMS",
        "Avisar a farmácia e o paciente sobre status. Hoje o aviso é interno, dentro da plataforma.",
        "Provedor de envio"],
       ["Exportação em PDF",
        "Fatura e relatório em arquivo para envio ao cliente e arquivo contábil.",
        "Prioridade"],
       ["Aplicativo do entregador",
        "App dedicado com notificação em segundo plano. Hoje roda no navegador do celular.",
        "Escopo futuro"],
       ["Domínio próprio",
        "Publicar em endereço da DLucas Express, em vez do endereço padrão de produção.",
        "Domínio"],
       ["Meio de pagamento",
        "Integração para cobrança automática. Nesta versão o controle é manual, por decisão de escopo.",
        "Definição comercial"]],
      col_w=[3.1, 6.6, 2.9], size=10, row_h=0.55)
page_num(s)

# ============================================================ 14 · FECHAMENTO
s = new_slide(dark=True)
halo = s.shapes.add_shape(MSO_SHAPE.OVAL, W - Inches(5.2), -Inches(2.4), Inches(6.6), Inches(6.6))
halo.fill.solid(); halo.fill.fore_color.rgb = RGBColor(0x0A, 0x3B, 0x34)
halo.line.fill.background(); halo.shadow.inherit = False

brandmark(s, Inches(0.72), size=14)
title(s, "A operação deixa de depender de quem lembra.\nPassa a depender do que está registrado.",
      dark=True, y=Inches(2.0), size=30, w=Inches(10.6))
lead(s, "Pedido, despacho, entrega, comprovante e fatura no mesmo lugar — com o acesso de cada "
        "perfil respeitado pelo próprio banco de dados.",
     dark=True, y=Inches(3.5), w=Inches(8.6), size=13.5)

line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, M, Inches(4.62), CONTENT_W, Pt(0.9))
line.fill.solid(); line.fill.fore_color.rgb = RGBColor(0x25, 0x46, 0x40)
line.line.fill.background(); line.shadow.inherit = False
cols3 = [
    ("Plataforma no ar", "Pronta para validação"),
    ("Sem instalação", "Abre no navegador"),
    ("Próximo passo", "Definir dados reais e prioridades"),
]
cw = CONTENT_W / 3
for i, (a, b) in enumerate(cols3):
    x = M + cw * i
    tb(s, x, Inches(4.92), cw - Inches(0.3), Inches(0.3), a, size=13, color=WHITE,
       bold=True, font=FONT_D)
    tb(s, x, Inches(5.3), cw - Inches(0.3), Inches(0.4), b, size=10,
       color=RGBColor(0x9F, 0xBD, 0xB6))
page_num(s, dark=True)

# ------------------------------------------------------------------ exporta
out_dir = "apresentacao"
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, "DLucas-Express-Apresentacao.pptx")
prs.save(out)
print(f"OK · {len(prs.slides.__iter__.__self__._sldIdLst)} slides → {out}")

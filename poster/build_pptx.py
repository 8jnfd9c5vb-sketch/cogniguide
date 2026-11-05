"""Build an editable A0 poster. Every heading and paragraph is its own text box."""
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Mm, Pt

A0_W, A0_H = 841, 1189
S = 0.811                       # mm per CSS pixel of poster.html (1000 x 1414)
OX = 15.0
OY = (A0_H - 1414 * S) / 2

INK = RGBColor(0x17, 0x17, 0x1A)
MUTED = RGBColor(0x5D, 0x5C, 0x63)
LINE = RGBColor(0xE4, 0xE2, 0xDC)
PAPER = RGBColor(0xF6, 0xF5, 0xF2)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLUE = RGBColor(0x2F, 0x5B, 0xEA)
TEAL = RGBColor(0x0F, 0x9D, 0x76)
ORANGE = RGBColor(0xE2, 0x74, 0x2B)
PURPLE = RGBColor(0x8A, 0x4F, 0xD8)
SKY = RGBColor(0x2A, 0x8B, 0xD8)
SOFT = RGBColor(0xD8, 0xD8, 0xDE)
PALE = RGBColor(0x9F, 0xB4, 0xFF)
GOOD = RGBColor(0x1F, 0x3F, 0xAE)


def px(n):
    return Mm(n * S)


def at(x, y, w, h):
    return Mm(OX + x * S), Mm(OY + y * S), Mm(w * S), Mm(h * S)


def fpt(n):
    return Pt(n * S / 0.352778)


def rgb(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color


def box(slide, x, y, w, h, fill, line=None, radius=0.12, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    s = slide.shapes.add_shape(shape, *at(x, y, w, h))
    rgb(s, fill)
    if radius and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1.25)
    s.shadow.inherit = False
    return s


def _run(p, text, size, color, bold=False, font="Arial"):
    r = p.add_run()
    r.text = text
    r.font.size = fpt(size)
    r.font.color.rgb = color
    r.font.bold = bold
    r.font.name = font
    return r


def text(slide, x, y, w, h, content, size, color, bold=False, align=PP_ALIGN.LEFT,
         font="Arial", anchor=MSO_ANCHOR.TOP, spacing=1.05):
    """content is a string, or a list of paragraphs of run tuples (text, bold, color)."""
    s = slide.shapes.add_textbox(*at(x, y, w, h))
    tf = s.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    tf.vertical_anchor = anchor
    if isinstance(content, str):
        content = [[(content, bold, color)]]
    for i, runs in enumerate(content):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_before = p.space_after = Pt(0)
        p.line_spacing = spacing
        for item in runs:
            t, b, c = item if len(item) == 3 else (*item, color)
            _run(p, t, size, c, b, font)
    return s


def heading(slide, x, y, w, label):
    box(slide, x, y + 7, 18, 3, BLUE, radius=0.5, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    text(slide, x + 26, y, w - 26, 18, label.upper(), 15, MUTED, bold=True)


def chip(slide, x, y, label, mono=False):
    size = 10.5 if mono else 11.5
    width = len(label) * (6.15 if mono else 6.45) + 16
    box(slide, x, y, width, 20, RGBColor(0xF3, 0xF2, 0xEF), radius=0.5)
    text(slide, x, y, width, 20, label, size, RGBColor(0x3A, 0x3A, 0x40),
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font="Courier New" if mono else "Arial")
    return width


def flow(slide, x, y, max_w, labels, mono=False):
    cx = x
    cy = y
    for label in labels:
        width = len(label) * (6.15 if mono else 6.45) + 16
        if cx + width > x + max_w and cx != x:
            cx = x
            cy += 25
        chip(slide, cx, cy, label, mono)
        cx += width + 5
    return cy


def build():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Mm(A0_W), Mm(A0_H)
    prs.core_properties.title = "CogniGuide Poster"
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    rgb(bg, PAPER)
    bg.line.fill.background()
    sp = bg._element
    slide.shapes._spTree.remove(sp)
    slide.shapes._spTree.insert(2, sp)

    # Header
    box(slide, 0, 0, 1000, 193, INK, radius=0, shape=MSO_SHAPE.RECTANGLE)
    text(slide, 48, 26, 650, 18, "AI STUDY COMPANION  ·  RETRIEVAL PRACTICE", 13, PALE, bold=True)
    text(slide, 48, 48, 650, 68, "CogniGuide", 62, WHITE, bold=True)
    text(slide, 48, 122, 650, 52,
         "Upload your notes. Get questions written from them. Answer, get graded against your own material, and keep reviewing what you missed.",
         18, SOFT, spacing=1.15)
    text(slide, 700, 90, 252, 28, "Zachary Zhang · Hugo Wong", 17, WHITE, bold=True, align=PP_ALIGN.RIGHT)
    text(slide, 700, 118, 252, 22, "Live demo", 14, RGBColor(0xC9, 0xC9, 0xD1), align=PP_ALIGN.RIGHT)
    text(slide, 700, 140, 252, 24, "cogniguide.probot.hk", 14, PALE, bold=True, align=PP_ALIGN.RIGHT)

    # Why + principles
    heading(slide, 48, 213, 472, "Why CogniGuide")
    box(slide, 48, 240, 472, 228, WHITE, LINE)
    text(slide, 66, 254, 436, 92, [
        [("Re-reading notes feels productive but builds little memory; ", False, RGBColor(0x2B, 0x2B, 0x30)),
         ("testing yourself", True, INK),
         (" (active recall) works far better. CogniGuide turns handwritten or digital notes into short-answer quizzes, so every session becomes self-testing on ", False, RGBColor(0x2B, 0x2B, 0x30)),
         ("your own material", True, INK),
         (".", False, RGBColor(0x2B, 0x2B, 0x30))],
    ], 14.5, INK, spacing=1.2)
    box(slide, 67, 355, 212, 96, RGBColor(0xF3, 0xF2, 0xEF), radius=0.14)
    text(slide, 79, 365, 188, 76, [
        [("Passive re-reading", True, MUTED)],
        [("Familiarity feels like understanding; gaps stay hidden.", False, MUTED)],
    ], 13, MUTED, spacing=1.15)
    box(slide, 289, 355, 212, 96, RGBColor(0xEA, 0xF0, 0xFF), radius=0.14)
    text(slide, 301, 365, 188, 76, [
        [("Active recall with CogniGuide", True, GOOD)],
        [("Scores and feedback reveal what you have not mastered.", False, GOOD)],
    ], 13, GOOD, spacing=1.15)

    heading(slide, 542, 213, 410, "Design principles")
    principles = [
        (542, 240, BLUE, "Grounded in your notes", "RAG: questions and grading are based on the original note chunks."),
        (752, 240, TEAL, "Level-aware", "Hong Kong levels S1–S6; questions and grading adapt to the level."),
        (542, 361, ORANGE, "Learn from mistakes", "Scores below 60 are logged and reviewed until mastered."),
        (752, 361, PURPLE, "Cloud or fully local", "Runs on your own machine, no login. Use Bailian cloud models, or Ollama so notes never leave it."),
    ]
    for x, y, color, title, body in principles:
        box(slide, x, y, 200, 112, WHITE, LINE, radius=0.12)
        dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, *at(x + 13, y + 16, 9, 9))
        rgb(dot, color)
        dot.line.fill.background()
        text(slide, x + 28, y + 10, 160, 36, title, 14, INK, bold=True, spacing=1.0)
        text(slide, x + 13, y + 48, 174, 56, body, 12.5, MUTED, spacing=1.15)

    # Pipeline
    heading(slide, 48, 489, 904, "How it works: from notes to mastery")
    steps = [
        (55, 157, BLUE, "01  ·  UPLOAD", "Add notes",
         "PDFs or photos of handwritten notes, sorted into subject folders and processed in the background.",
         [("PDF · PNG · JPG · WEBP", BLUE)]),
        (226, 157, SKY, "02  ·  TRANSCRIBE", "Image → text",
         "Each page is rendered to an image; a vision model transcribes text and math into Markdown + LaTeX.",
         [("CLOUD  qwen3-vl-plus", SKY), ("LOCAL  qwen2.5vl:3b", TEAL)]),
        (398, 174, TEAL, "03  ·  INDEX", "Chunk & embed",
         "Text is split into ~800-character overlapping chunks, embedded and stored in LanceDB for semantic search.",
         [("CLOUD  text-embedding-v4", TEAL), ("LOCAL  bge-m3", TEAL)]),
        (586, 172, PURPLE, "04  ·  GENERATE", "Write questions",
         "An LLM writes five short-answer questions per material, tuned to the student's level.",
         [("CLOUD  qwen-plus", PURPLE), ("LOCAL  qwen3:4b-instruct", TEAL)]),
        (773, 172, ORANGE, "05  ·  GRADE", "Score & feedback",
         "Answers are scored 0–100 against the source notes, with correct points, missed points and feedback.",
         [("CLOUD  qwen-plus", ORANGE), ("LOCAL  qwen3:4b-instruct", TEAL)]),
    ]
    for i, (x, w, color, kicker, title, body, tags) in enumerate(steps):
        box(slide, x, 516, w, 191, WHITE, LINE, radius=0.1)
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, *at(x, 516, w, 5))
        rgb(bar, color)
        bar.line.fill.background()
        text(slide, x + 10, 528, w - 20, 18, kicker, 11, color, bold=True)
        text(slide, x + 10, 548, w - 20, 40, title, 15.5, INK, bold=True)
        text(slide, x + 10, 590, w - 20, 56, body, 11, MUTED, spacing=1.02)
        ty = 656
        for tag, tc in tags:
            text(slide, x + 10, ty, w - 16, 16, tag, 10, tc, bold=True, font="Courier New")
            ty += 16
        if i < 4:
            text(slide, x + w - 6, 590, 20, 30, "›", 26, RGBColor(0xB4, 0xB2, 0xAB), bold=True)

    box(slide, 55, 715, 890, 48, WHITE, RGBColor(0xC9, 0xC6, 0xBE), radius=0.2)
    slide.shapes[-1].line.dash_style = MSO_LINE_DASH_STYLE.DASH
    text(slide, 70, 722, 860, 36, [
        [("↺   ", False, ORANGE),
         ("Feedback loop: ", True, ORANGE),
         ("any answer scoring below 60 is saved to the Mistakes log → review rounds of five → a later score of 60 or more marks it ", False, MUTED),
         ("mastered", True, ORANGE),
         (". Quick Quiz mixes questions from all subjects, optionally focused on a topic via semantic search.", False, MUTED)],
    ], 12.5, MUTED, spacing=1.1)

    # Architecture
    heading(slide, 48, 779, 904, "System architecture")
    layers = [
        (48, 167, BLUE, "FRONTEND", "Next.js 16 · React 19",
         ["Subjects", "Practice", "Quick Quiz", "Mistakes", "Search", "Level picker", "KaTeX"], False, ""),
        (227, 216, TEAL, "API & SERVICES", "Next.js route handlers",
         ["/api/grade", "/api/search", "/api/quick-quiz", "/api/mistakes"], True,
         "jobs queue  ·  extract  ·  rag  ·  quiz"),
        (455, 187, ORANGE, "STORAGE", "Local data directory",
         ["LanceDB vectors", "extract.md", "questions-<level>.json", "attempts", "mistakes"], False,
         "Transcripts and questions are cached."),
    ]
    for x, w, color, kicker, title, labels, mono, note in layers:
        box(slide, x, 806, w, 199, WHITE, LINE, radius=0.1)
        text(slide, x + 12, 816, w - 24, 16, kicker, 11, color, bold=True)
        text(slide, x + 12, 834, w - 24, 36, title, 15, INK, bold=True)
        flow(slide, x + 12, 876, w - 24, labels, mono)
        if note:
            text(slide, x + 12, 968, w - 24, 28, note, 11.5, MUTED, spacing=1.1)

    box(slide, 654, 806, 298, 199, INK, radius=0.1)
    text(slide, 668, 816, 270, 16, "AI MODELS  ·  SWITCHABLE", 11, PALE, bold=True)
    text(slide, 668, 834, 270, 22, "MODEL_PROFILE = cloud | local", 14, WHITE, bold=True)
    text(slide, 668, 856, 270, 16, "Same OpenAI-compatible API for both", 11, RGBColor(0xA9, 0xA9, 0xB3))
    text(slide, 730, 876, 110, 16, "Cloud · Bailian", 10, PALE, bold=True, align=PP_ALIGN.CENTER)
    text(slide, 842, 876, 100, 16, "Local · Ollama", 10, RGBColor(0x7F, 0xE0, 0xC4), bold=True, align=PP_ALIGN.CENTER)
    rows = [("Vision", "qwen3-vl-plus", "qwen2.5vl:3b"),
            ("Embed", "text-embedding-v4", "bge-m3"),
            ("Chat", "qwen-plus", "qwen3:4b-instruct")]
    for i, (role, cloud, local) in enumerate(rows):
        y = 896 + i * 24
        text(slide, 668, y, 58, 20, role, 11, RGBColor(0xA9, 0xA9, 0xB3), anchor=MSO_ANCHOR.MIDDLE)
        box(slide, 726, y, 108, 20, RGBColor(0x2A, 0x2A, 0x32), radius=0.3)
        text(slide, 726, y, 108, 20, cloud, 10, WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font="Courier New")
        box(slide, 838, y, 102, 20, RGBColor(0x2A, 0x2A, 0x32), radius=0.3)
        text(slide, 838, y, 102, 20, local, 10, WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font="Courier New")
    text(slide, 668, 972, 270, 28,
         "Local: ~6.4 GB of models, works fully offline. Switching profiles needs one index rebuild.",
         10.5, RGBColor(0xA9, 0xA9, 0xB3), spacing=1.1)

    # Screenshots
    heading(slide, 48, 1021, 904, "The app in action")
    shots = [
        (48, "crop_home.png", [("Home. ", True, INK), ("Quick Quiz, semantic note search and subject folders with indexed chunks.", False, MUTED)]),
        (353, "crop_math.png", [("Subject page. ", True, INK), ("Upload notes, track processing status and start a five-question quiz.", False, MUTED)]),
        (659, "crop_material.png", [("Practice. ", True, INK), ("Questions generated from a handwritten math note, rendered with LaTeX.", False, MUTED)]),
    ]
    for x, src, caption in shots:
        box(slide, x, 1048, 293, 196, WHITE, LINE, radius=0.08)
        slide.shapes.add_picture(src, *at(x + 1, 1049, 291, 146))
        text(slide, x + 10, 1200, 273, 40, [caption], 12, MUTED, spacing=1.15)

    # Footer
    foot = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, *at(0, 1281, 1000, 133))
    rgb(foot, WHITE)
    foot.line.fill.background()
    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, *at(0, 1281, 1000, 1.5))
    rgb(rule, LINE)
    rule.line.fill.background()
    slide.shapes.add_picture("qr_github.png", *at(52, 1296, 96, 96))
    text(slide, 166, 1308, 560, 16, "SOURCE CODE ON GITHUB", 11, MUTED, bold=True)
    text(slide, 166, 1326, 560, 24, "github.com/8jnfd9c5vb-sketch/cogniguide", 16, INK, bold=True, font="Courier New")
    text(slide, 166, 1354, 560, 36,
         "Runs on Windows, macOS and Ubuntu with Node.js 22, using Bailian cloud models or local Ollama models.",
         12.5, MUTED, spacing=1.15)
    text(slide, 760, 1300, 192, 16, "AUTHORS", 11, MUTED, bold=True, align=PP_ALIGN.RIGHT)
    text(slide, 700, 1318, 252, 52, "Zachary Zhang\nHugo Wong", 20, INK, bold=True, align=PP_ALIGN.RIGHT, spacing=1.05)
    text(slide, 700, 1372, 252, 20, "cogniguide.probot.hk", 12.5, MUTED, align=PP_ALIGN.RIGHT)

    prs.save("Group6_Poster.pptx")
    print(f"Group6_Poster.pptx: {len(slide.shapes)} editable shapes, A0 {A0_W}x{A0_H} mm")


if __name__ == "__main__":
    build()

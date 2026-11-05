"""Render poster.html to PNG, PDF and an A0 PPTX.

Usage: python3 render.py [YOUTUBE_URL]
Without a URL, the YouTube QR slot shows a placeholder.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright


def youtube_qr(url):
    if url:
        import qrcode
        qrcode.make(url, border=1).save("qr_youtube.png")
        return
    img = Image.new("RGB", (400, 400), "#f1f1f4")
    d = ImageDraw.Draw(img)
    d.rectangle([4, 4, 395, 395], outline="#b0b0b8", width=6)
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 44)
    d.multiline_text((200, 200), "YouTube QR\n(link pending)", fill="#6b6b75",
                     font=font, anchor="mm", align="center", spacing=14)
    img.save("qr_youtube.png")


youtube_qr(sys.argv[1] if len(sys.argv) > 1 else None)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 1000, "height": 1414}, device_scale_factor=6)
    pg.goto(Path("poster.html").resolve().as_uri()); pg.wait_for_timeout(800)
    print(pg.evaluate("[document.querySelector('main').scrollHeight, document.querySelector('main').clientHeight, document.querySelector('footer').getBoundingClientRect().bottom]"))
    pg.screenshot(path="CogniGuide_Poster.png")
    pg.pdf(path="CogniGuide_Poster.pdf", width="1000px", height="1414px", print_background=True)
    b.close()

import build_pptx
build_pptx.build()

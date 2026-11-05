from playwright.sync_api import sync_playwright
CLEAN = """() => { const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let n; while((n=w.nextNode())){ n.nodeValue=n.nodeValue.replace(/\\s*·\\s*中[一二三四五六]/g,''); }
 document.querySelectorAll('option').forEach(o=>o.textContent=o.textContent.replace(/\\s*·\\s*中[一二三四五六]/g,'')); }"""
pages = {"home":"/", "math":"/subjects/math", "material":"/subjects/math/materials/5q7siilx",
         "mistakes":"/mistakes", "quick":"/quick-quiz"}
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width":1200,"height":820}, device_scale_factor=2)
    for k,u in pages.items():
        pg.goto("https://cogniguide.probot.hk"+u, wait_until="networkidle")
        pg.wait_for_timeout(1200)
        pg.evaluate(CLEAN)
        pg.screenshot(path=f"shot_{k}.png")
    b.close()

# -*- coding: utf-8 -*-
TPL = r"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,600&family=Hanken+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--sage:#9CAF88;--sage-deep:#7B8F6A;--sage-light:#DCE2CB;--gold:#B8943E;--gold-soft:#cda651;--cream:#F5EFE6;--ink:#2A2823;--serif:'Cormorant Garamond',Georgia,serif;--sans:'Hanken Grotesk',system-ui,sans-serif}
html,body{width:1280px;height:720px}
.thumb{position:relative;width:1280px;height:720px;overflow:hidden;display:flex;background:#23241f;font-family:var(--sans)}
.panel{position:relative;z-index:3;width:52%;padding:56px 52px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#1e1f1a 0%,#34412c 100%)}
.photo{position:absolute;right:0;top:0;width:54%;height:100%;background:#000 center/cover no-repeat;background-image:url('__PHOTO__');background-position:__POS__}
.photo::before{content:"";position:absolute;left:0;top:0;bottom:0;width:230px;background:linear-gradient(90deg,#24291e,rgba(36,41,30,0))}
.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,22,17,.08),rgba(20,22,17,.18))}
.logo{display:flex;align-items:center;gap:16px;margin-bottom:34px}
.logo img{width:66px;height:66px;border-radius:16px;object-fit:cover}
.logo .wm{font-family:var(--serif);font-style:italic;font-size:40px;letter-spacing:.16em;color:var(--sage-light)}
.live{display:inline-flex;align-items:center;gap:13px;align-self:flex-start;background:linear-gradient(135deg,#c0392b,#e0573f);color:#fff;font-weight:800;font-size:27px;letter-spacing:.16em;text-transform:uppercase;padding:13px 26px;border-radius:999px;margin-bottom:30px}
.live .dot{width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 0 0 6px rgba(255,255,255,.22)}
.kicker{font-size:26px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-soft);margin-bottom:12px}
.title{font-family:var(--serif);font-weight:600;font-size:__TSIZE__px;line-height:.98;color:#fff}
.title .em{font-style:italic;color:var(--sage-light)}
.rule{width:96px;height:5px;background:var(--gold);border-radius:4px;margin:26px 0}
.date{display:flex;align-items:center;gap:14px;font-size:32px;font-weight:800;color:#fff}
.date svg{width:34px;height:34px;flex:none;stroke:var(--gold-soft);stroke-width:2.2}
</style></head><body>
<div class="thumb">
  <div class="photo"></div>
  <div class="panel">
    <div class="logo"><img src="../../assets/savias-logo.png"><span class="wm">Savias</span></div>
    <span class="live"><span class="dot"></span>En vivo</span>
    <div class="kicker">Clase __NUM__</div>
    <div class="title">__TITLE__</div>
    <div class="rule"></div>
    <div class="date"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke-linecap="round"/></svg>__DATE__</div>
  </div>
</div>
</body></html>"""

cfgs = [
  dict(name="thumb_c3", photo="lina_c3.jpg", pos="center 28%", num="3",
       title='Glicerina vs.<br><span class="em">Saponificado</span>', date="Miércoles 1 de julio", tsize="66"),
  dict(name="thumb_c4", photo="lina_c4.jpg", pos="center 20%", num="4",
       title='Cómo vender<br><span class="em">sin ser experta</span>', date="Viernes 3 de julio", tsize="66"),
]
for c in cfgs:
    out = (TPL.replace("__PHOTO__", c["photo"]).replace("__POS__", c["pos"])
              .replace("__NUM__", c["num"]).replace("__TITLE__", c["title"])
              .replace("__DATE__", c["date"]).replace("__TSIZE__", c["tsize"]))
    open(c["name"] + ".html", "w", encoding="utf-8").write(out)
    print("wrote", c["name"] + ".html")

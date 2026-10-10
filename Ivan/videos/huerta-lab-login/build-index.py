#!/usr/bin/env python3
"""Genera index.html incrustando las @font-face en base64.

Las fuentes van embebidas para que el render no dependa de la red: si Google
Fonts no responde durante la captura, el frame saldría con la tipografía del
sistema y la marca dejaría de ser la marca.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
faces = (HERE / "assets/fonts/faces.css").read_text(encoding="utf-8")
tpl = (HERE / "src/index.template.html").read_text(encoding="utf-8")
out = tpl.replace("/* __FONT_FACES__ */", faces)
(HERE / "index.html").write_text(out, encoding="utf-8")
print(f"index.html: {len(out)//1024} KB")

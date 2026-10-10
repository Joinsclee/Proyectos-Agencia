#!/usr/bin/env python3
"""Genera _ghl-preview.html: la página como la vería GoHighLevel.

Reproduce las tres cosas que GHL le hace a un widget "Custom HTML" y que en
local no pasan nunca — por eso una página puede verse perfecta con doble clic
y salir rota en producción:

  1. **Descarta el <head>.** Aquí se tira literalmente: solo se conserva el
     contenido de <body>.
  2. **Lo mete en una columna centrada y angosta** (por defecto 680 px, el ancho
     típico de una fila de GHL).
  3. **Pone `transform` en un ancestro.** Eso rompe `position:fixed` — deja de
     referirse al viewport y pasa a referirse al ancestro transformado. Es la
     causa de "la barra no se pega arriba" y de overlays que no tapan nada.

Uso:
    python3 simular-ghl.py              # columna de 680 px
    python3 simular-ghl.py --ancho 480  # columna más estrecha
    python3 simular-ghl.py --sin-transform
"""
import argparse
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "universo-huerta-lab.html"   # por defecto; --src lo cambia
OUT = BASE / "_ghl-preview.html"

SHELL = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Simulación GHL · {ancho}px{transform_label}</title>
<style>
  /* Lo que GHL pone alrededor del widget, no lo que pone la página. */
  *{{box-sizing:border-box}}
  html,body{{margin:0;padding:0;overflow-x:hidden}}
  body{{background:#e9e9e4;font-family:system-ui,sans-serif{body_transform}}}
  .ghl-section{{padding:0;{section_transform}}}
  .ghl-row{{max-width:{ancho}px;margin:0 auto;background:#fff;min-height:100vh}}
  .ghl-nota{{
    position:fixed;top:0;left:0;right:0;z-index:99999;
    background:#111;color:#fff;font:600 12px/1.5 system-ui,sans-serif;
    padding:6px 12px;text-align:center;letter-spacing:.3px;
  }}
  .ghl-nota b{{color:#d9b458}}
</style>
</head>
<body>
<div class="ghl-nota">SIMULACIÓN GHL · columna <b>{ancho}px</b> · head descartado{transform_note}</div>
<div class="ghl-section">
  <div class="ghl-row">
<!-- ↓↓↓ contenido del widget Custom HTML ↓↓↓ -->
{cuerpo}
<!-- ↑↑↑ fin del widget ↑↑↑ -->
  </div>
</div>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=None, help="archivo a simular")
    ap.add_argument("--ancho", type=int, default=680)
    ap.add_argument("--sin-transform", action="store_true")
    args = ap.parse_args()

    src = BASE / args.src if args.src else SRC
    if not src.exists():
        print(f"✗ falta {src.name}")
        return 1

    html = src.read_text(encoding="utf-8")
    m = re.search(r"<body[^>]*>(.*)</body>", html, re.S | re.I)
    # Un fragmento pensado para el widget de GHL no trae <body>: es el archivo
    # entero lo que se pega.
    cuerpo = m.group(1) if m else html

    # Aviso temprano: si quedó algo de estilo en el <head>, en GHL se pierde.
    head = re.search(r"<head[^>]*>(.*?)</head>", html, re.S | re.I)
    if head and re.search(r"<style|<link[^>]+stylesheet", head.group(1), re.I):
        print("⚠  Hay <style> o <link rel=stylesheet> en el <head>: GHL los descarta.")

    usa_transform = not args.sin_transform
    OUT.write_text(
        SHELL.format(
            ancho=args.ancho,
            cuerpo=cuerpo,
            body_transform="",
            section_transform="transform:translateZ(0);" if usa_transform else "",
            transform_label=" · transform" if usa_transform else "",
            transform_note=" · ancestro con <b>transform</b>" if usa_transform else "",
        ),
        encoding="utf-8",
    )
    print(f"✓ {OUT.name} · columna {args.ancho}px · "
          f"transform en ancestro: {'sí' if usa_transform else 'no'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

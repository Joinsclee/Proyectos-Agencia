#!/usr/bin/env python3
"""
Embebe las seis herramientas de La Huerta LAB dentro de universo-huerta-lab.html.

REGLA IMPORTANTE — este script NO regenera la página.
Lee universo-huerta-lab.html como fuente de verdad y sustituye únicamente el
contenido de cada <script type="text/plain" id="app-XXX">…</script> por el
base64 del HTML correspondiente. Cualquier edición manual que hagas en la
página (diseño, textos, JS del agente) sobrevive intacta a un rebuild.

Uso:
    python3 build.py            # embebe en sitio
    python3 build.py --check    # solo informa qué está embebido y qué no
"""
import base64
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
PAGE = BASE / "universo-huerta-lab.html"

# id del <script> en la página  ->  archivo fuente de la herramienta
APPS = {
    "app-matriz":    "MatrizDePermanencia.html",
    "app-fe":        "CalculadoraDeFe.html",
    "app-simulador": "SimuladorFincanciero.html",
    "app-guia":      "GuiaSimuladorFinanciero.html",
    "app-carbono":   "CalculadoraDeCarbono.html",
    "app-retorno":   "InformeRetornoProductivo.html",
}

# Las herramientas son fragmentos con namespace (.mpz, .pfz, .hlab…), pensados
# para incrustarse dentro de otra página. Dentro del iframe necesitan su propio
# documento, así que las envolvemos si no traen <html> propio.
WRAPPER = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} · La Huerta LAB</title>
<style>
  html,body{{margin:0;padding:0;background:#f5f7f3;}}
</style>
</head>
<body>
{fragment}
</body>
</html>
"""


def wrap_if_fragment(html: str, title: str) -> str:
    if re.search(r"<html[\s>]", html, re.I):
        return html
    return WRAPPER.format(title=title, fragment=html)


def title_of(html: str, fallback: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    if m:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip()
    return fallback


def block_pattern(script_id: str) -> re.Pattern:
    return re.compile(
        r'(<script type="text/plain" id="%s">)(.*?)(</script>)' % re.escape(script_id),
        re.S,
    )


def main() -> int:
    check_only = "--check" in sys.argv

    if not PAGE.exists():
        print(f"✗ No encuentro {PAGE.name}")
        return 1

    page = PAGE.read_text(encoding="utf-8")
    changed = 0
    problems = 0

    for script_id, filename in APPS.items():
        src = BASE / filename
        pat = block_pattern(script_id)
        m = pat.search(page)

        if not m:
            print(f"✗ {script_id}: no existe ese <script> en la página")
            problems += 1
            continue

        if not src.exists():
            print(f"✗ {script_id}: falta el archivo {filename}")
            problems += 1
            continue

        raw = src.read_text(encoding="utf-8")
        full = wrap_if_fragment(raw, title_of(raw, filename))
        b64 = base64.b64encode(full.encode("utf-8")).decode("ascii")

        current = m.group(2).strip()
        state = "vacío" if current.startswith("__APP_") or not current else f"{len(current)//1024} KB"

        if check_only:
            print(f"· {script_id:<14} ← {filename:<30} (embebido: {state})")
            continue

        if current == b64:
            print(f"= {script_id:<14} ya estaba al día ({len(b64)//1024} KB)")
            continue

        page = pat.sub(lambda mm: mm.group(1) + b64 + mm.group(3), page, count=1)
        print(f"✓ {script_id:<14} ← {filename:<30} ({len(b64)//1024} KB)")
        changed += 1

    if check_only:
        return 0

    if changed:
        PAGE.write_text(page, encoding="utf-8")
        print(f"\n{changed} herramienta(s) embebida(s). Página: {len(page)//1024} KB")
    else:
        print("\nNada que cambiar.")

    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

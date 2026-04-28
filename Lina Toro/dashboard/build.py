#!/usr/bin/env python3
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).parent
SRC  = ROOT.parent
TPL  = ROOT / '_template.html'
OUT  = ROOT / 'universo-lina.html'

files = {
    '__APP_PRECIOS__': SRC / 'index.html',
    '__APP_SAPONI__':  SRC / 'CalculadoraSaponificacion.html',
    '__APP_SAVIAS__':  SRC / 'HerramientasSavias.html',
}

html = TPL.read_text(encoding='utf-8')
for token, path in files.items():
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode('ascii')
    html = html.replace(token, b64)
    print(f'  {token}: {len(raw):,}B → {len(b64):,}B b64  ({path.name})')

OUT.write_text(html, encoding='utf-8')
size = OUT.stat().st_size
print(f'\n→ {OUT.name}: {size:,}B ({size/1024:.1f}KB)')

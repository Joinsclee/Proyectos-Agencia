#!/usr/bin/env bash
# ========================================
# Build para GHL: index.html + assets/styles.css + assets/app.js en UN archivo
# ========================================
# Uso: bash build-ghl.sh
# Genera: dist/mi-barco-ghl.html (para pegar en Custom HTML de GHL)
#
# REGLA DURA DE GHL: el widget "Custom HTML" DESCARTA el <head>. Todo lo que
# viva ahí (CSS, fuentes, Tailwind, Supabase, Alpine, app.js) desaparece en
# producción aunque en local se vea perfecto. Por eso este build baja TODOS los
# recursos al <body> y reancla la regla global `html, body` a `.pv-root`, para
# no pisar la tipografía ni el fondo del resto de la página del cliente.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p dist
OUTPUT="dist/mi-barco-ghl.html"

for f in index.html assets/styles.css assets/app.js; do
  [ -f "$f" ] || { echo "ERROR: falta $f — el build no puede continuar."; exit 1; }
done

python3 - "$OUTPUT" <<'PYEOF'
import re, sys

output = sys.argv[1]
html = open('index.html', encoding='utf-8').read()
css  = open('assets/styles.css', encoding='utf-8').read()
js   = open('assets/app.js', encoding='utf-8').read()

FUENTE = ("@import url('https://fonts.googleapis.com/css2?family=Asap:ital,wght"
          "@0,400;0,500;0,600;0,700;0,800;1,400;1,500&display=swap');\n")

# 1) `html, body` se reancla a `.pv-root`: dentro de GHL esa regla le cambiaría
#    la tipografía y el fondo a toda la página del cliente. Solo overflow-x
#    puede quedarse global, que es lo que evita la barra horizontal.
css = css.replace(
    "html, body {",
    "html, body { overflow-x: hidden; }\n\n.pv-root {",
    1
)

# 2) Fuera del <head> todo lo que GHL descarta.
html = re.sub(r'\s*<script src="https://cdn\.tailwindcss\.com"></script>', '', html)
html = re.sub(r'\s*<link rel="preconnect"[^>]*>', '', html)
html = re.sub(r'\s*<link href="https://fonts\.googleapis\.com[^>]*>', '', html)
html = re.sub(r'\s*<link rel="stylesheet" href="assets/styles\.css"\s*/?>', '', html)
html = re.sub(r'\s*<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@2"></script>', '', html)
html = re.sub(r'\s*<script defer src="https://cdn\.jsdelivr\.net/npm/alpinejs@3\.x\.x/dist/cdn\.min\.js"></script>', '', html)
html = re.sub(r'\s*<script src="assets/app\.js"></script>', '', html)

# 3) Y de vuelta al principio del <body>, en el mismo orden que tenían.
recursos = (
    '\n<!-- Recursos aqui y no en la cabecera: GHL la descarta (ver build-ghl.sh) -->\n'
    '<script src="https://cdn.tailwindcss.com"></script>\n'
    '<style>\n' + FUENTE + css + '\n</style>\n'
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n'
    '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>\n'
    '<script>\n' + js + '\n</script>\n'
)
m = re.search(r'<body[^>]*>', html)
if not m:
    raise SystemExit('ERROR: no se encontró <body> en index.html')
html = html[:m.end()] + recursos + html[m.end():]

header = '''<!--
  Mi Barco — Build autocontenido para GoHighLevel (Custom HTML)
  Generado por build-ghl.sh. No editar a mano: edita index.html / assets/ y
  vuelve a ejecutar el build.
  Todo el CSS, las fuentes y los scripts van DENTRO del cuerpo a proposito:
  el widget Custom HTML de GHL descarta la cabecera del documento.
  -->
'''
open(output, 'w', encoding='utf-8').write(header + html)
print(f'✓ Generado: {output}  ({len(html)/1024:.1f} KB)')
PYEOF

echo ""
echo "Listo. Sube este archivo a GHL:"
echo "  $SCRIPT_DIR/$OUTPUT"

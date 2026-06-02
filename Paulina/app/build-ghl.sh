#!/usr/bin/env bash
# ========================================
# Build para GHL: combina index.html + styles.css + app.js en UN solo archivo
# ========================================
# Uso: bash build-ghl.sh
# Genera: dist/mis-pliegues-ghl.html (listo para pegar en Custom HTML de GHL)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p dist
OUTPUT="dist/mi-barco-ghl.html"

# Leer contenidos
CSS=$(cat assets/styles.css)
JS=$(cat assets/app.js)

# Crear el archivo combinado:
# 1. Eliminar el <link> al CSS y reemplazarlo por <style>...</style> inline
# 2. Eliminar el <script src="app.js"> y reemplazarlo por <script>...</script> inline
python3 - <<PYEOF
import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open('assets/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

with open('assets/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Reemplazar el <link> al stylesheet por <style> inline
html = re.sub(
    r'<link rel="stylesheet" href="assets/styles\.css"\s*/?>',
    f'<style>\n{css}\n</style>',
    html
)

# Reemplazar el <script src="assets/app.js"> por <script> inline (sin src)
html = re.sub(
    r'<script src="assets/app\.js"></script>',
    f'<script>\n{js}\n</script>',
    html
)

# Comentario de cabecera
header = '''<!--
  Mis Pliegues — Build autocontenido para embed en GoHighLevel
  Generado automáticamente por build-ghl.sh
  No editar este archivo directamente. Edita los archivos en /app/ y vuelve a ejecutar el build.
  -->
'''
html = header + html

with open('$OUTPUT', 'w', encoding='utf-8') as f:
    f.write(html)

print(f'✓ Generado: $OUTPUT')
print(f'  Tamaño: {len(html):,} bytes ({len(html)/1024:.1f} KB)')
PYEOF

echo ""
echo "Listo. Sube este archivo a GHL:"
echo "  $SCRIPT_DIR/$OUTPUT"

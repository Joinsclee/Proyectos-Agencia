#!/bin/bash
# ============================================================
# Re-embebe cliente.html dentro de agencia.html en base64.
# Ejecutar cada vez que edites cliente.html.
# ============================================================
set -e
cd "$(dirname "$0")"

if [ ! -f cliente.html ]; then
  echo "ERROR: no se encuentra cliente.html"
  exit 1
fi
if [ ! -f agencia.html ]; then
  echo "ERROR: no se encuentra agencia.html"
  exit 1
fi

CLIENT_B64=$(base64 -i cliente.html | tr -d '\n')

python3 - <<EOF
import re
with open('agencia.html','r',encoding='utf-8') as f:
    content = f.read()
pattern = r"const CLIENTE_HTML_B64 = '[^']*';"
replacement = "const CLIENTE_HTML_B64 = '$CLIENT_B64';"
new, n = re.subn(pattern, replacement, content, count=1)
if n == 0:
    print('ERROR: no se encontró la variable CLIENTE_HTML_B64 en agencia.html')
    raise SystemExit(1)
with open('agencia.html','w',encoding='utf-8') as f:
    f.write(new)
print(f'OK · cliente.html re-embebido en agencia.html ({len(replacement)} bytes)')
EOF

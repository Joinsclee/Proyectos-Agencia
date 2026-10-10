#!/bin/bash
# Re-render de los cuerpos presenciales con la ficha corregida. NO usa producir.py (no sube ni borra).
set -e
SK=~/.claude/skills/montaje-vertical-clee/scripts
NM="/Users/cristhian/Downloads/Paginas Web/Playwright/node_modules"
cd "/Users/cristhian/Downloads/Paginas Web/Ivan/ads-venta/reels-presencial/sistema"
for n in "$@"; do
  echo "=== $n $(date +%H:%M:%S) · libres: $(df -h / | tail -1 | awk '{print $4}')"
  python3 $SK/validar.py $n
  python3 $SK/montar.py edl-$n.json
  NODE_PATH="$NM" PROYECTO_BASE="$PWD" node $SK/rotulos.cjs subs $n
  NODE_PATH="$NM" PROYECTO_BASE="$PWD" node $SK/rotulos.cjs tarjetas $n
  if [ -f infografias-$n.json ]; then NODE_PATH="$NM" PROYECTO_BASE="$PWD" node $SK/infografias.cjs $n; fi
  python3 $SK/componer.py $n
  rm -rf _tmp/$n salida/$n-montado.mp4
  echo "=== $n listo $(date +%H:%M:%S) · $(ls -la entrega/$n.mp4 | awk '{print $5}') bytes"
done

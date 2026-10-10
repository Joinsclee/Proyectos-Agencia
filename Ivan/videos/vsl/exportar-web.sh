#!/bin/bash
# Convierte un montaje a la versión que se sube a GHL, más su póster.
#
# El montaje se renderiza a CRF 18 para que la capa de gráficos no herede
# artefactos; esta pasada es la de entrega. CRF 24 + preset slow deja un VSL de
# ~4 minutos por debajo de 60 MB manteniendo el texto legible, y `faststart`
# mueve el índice al principio para que el navegador empiece a reproducir sin
# descargar el archivo entero.
set -euo pipefail
cd "$(dirname "$0")"

src="$1"                       # salida/registro-montado.mp4
base="$(basename "$src" .mp4)"
poster_t="${2:-1.2}"           # segundo del que se saca el póster

mkdir -p entrega
ffmpeg -y -v error -i "$src" \
  -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p \
  -profile:v high -level 4.1 -maxrate 6M -bufsize 12M \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart \
  "entrega/${base%-montado}.mp4"

ffmpeg -y -v error -ss "$poster_t" -i "$src" -frames:v 1 \
  -vf "scale=1600:-1" -q:v 3 "entrega/${base%-montado}-poster.jpg"

ls -lh "entrega/${base%-montado}.mp4" "entrega/${base%-montado}-poster.jpg"

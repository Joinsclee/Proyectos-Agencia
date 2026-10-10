#!/usr/bin/env bash
# normalize.sh IN OUT — normaliza el crudo a h264/yuv420p/30fps/48k estéreo (resuelve fps/rotación/HDR variables).
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
IN="${1:?uso: normalize.sh <in> <out.mp4>}"; OUT="${2:?falta salida}"
[ -f "$IN" ] || { echo "No existe: $IN" >&2; exit 1; }
"$FF" -y -hide_banner -i "$IN" \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p,fps=30" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart "$OUT"
echo "normalizado -> $OUT"

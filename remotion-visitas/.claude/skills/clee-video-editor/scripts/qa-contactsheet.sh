#!/usr/bin/env bash
# qa-contactsheet.sh IN [OUT.png] [COLSxROWS] — hoja de contacto para auto-QA visual (pásala a la visión de Claude).
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
IN="${1:?uso: qa-contactsheet.sh <in> [contact.png] [4x3]}"; OUT="${2:-contact.png}"; GRID="${3:-4x3}"
DUR="$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$IN" 2>/dev/null | cut -d. -f1)"
COLS="${GRID%x*}"; ROWS="${GRID#*x}"; N=$(( COLS * ROWS ))
# 1 frame por intervalo uniforme para cubrir todo el video (mínimo 1 fps si es muy corto)
FPS="1"
[ -n "${DUR:-}" ] && [ "$DUR" -gt "$N" ] 2>/dev/null && FPS="$N/$DUR"
"$FF" -y -hide_banner -i "$IN" -vf "fps=$FPS,scale=320:-1,tile=$GRID" -frames:v 1 "$OUT"
echo "contact-sheet ($GRID) -> $OUT"
echo "Revisa con visión: captions en safe-zone, sin frames negros, sync caption↔audio, cifras == transcript."

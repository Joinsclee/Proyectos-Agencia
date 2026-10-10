#!/usr/bin/env bash
# loudnorm-2pass.sh IN [TARGET_LUFS] OUT — normaliza loudness a broadcast (default -14 LUFS / -1.5 dBTP), dos pasadas.
# Funciona sobre audio (m4a/wav) o video (copia el video, renormaliza el audio).
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
IN="${1:?uso: loudnorm-2pass.sh <in> [target=-14] <out>}"
if [ "$#" -ge 3 ]; then TARGET="$2"; OUT="$3"; else TARGET="-14"; OUT="$2"; fi
TP="-1.5"; LRA="11"

# --- Pase 1: medir ---
LNJSON="$("$FF" -hide_banner -i "$IN" -af "loudnorm=I=$TARGET:TP=$TP:LRA=$LRA:print_format=json" -f null - 2>&1 || true)"
read -r MI MTP MLRA MTHRESH < <(printf '%s' "$LNJSON" | python3 -c '
import sys,json,re
t=sys.stdin.read()
m=re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", t, re.S)
d=json.loads(m.group(0)) if m else {}
print(d.get("input_i","0"), d.get("input_tp","0"), d.get("input_lra","0"), d.get("input_thresh","0"))
')
[ -n "${MI:-}" ] || { echo "No se pudo medir loudness (pase 1)." >&2; exit 1; }

# --- Pase 2: aplicar (linear) ---
AF="loudnorm=I=$TARGET:TP=$TP:LRA=$LRA:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MTHRESH:linear=true:print_format=summary"
if "$FFPROBE" -v error -select_streams v -show_entries stream=codec_type -of csv=p=0 "$IN" 2>/dev/null | grep -q video; then
  "$FF" -y -hide_banner -i "$IN" -af "$AF" -c:v copy -c:a aac -b:a 192k -ar 48000 "$OUT"
else
  "$FF" -y -hide_banner -i "$IN" -af "$AF" -ar 48000 "$OUT"
fi
echo "loudnorm ${TARGET} LUFS (medido input_i=$MI) -> $OUT"

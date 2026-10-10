#!/usr/bin/env bash
# master-audio.sh RENDER.mp4 [TARGET_LUFS] OUT.mp4 — masteriza el audio del render de Remotion a broadcast
# (default -14 LUFS / -1.5 dBTP, two-pass) y remuxea SIN recodificar el video (-c:v copy).
set -euo pipefail
VEP_QUIET=1 source "$(dirname "$0")/env.sh"
IN="${1:?uso: master-audio.sh <render.mp4> [target=-14] <out.mp4>}"
if [ "$#" -ge 3 ]; then TARGET="$2"; OUT="$3"; else TARGET="-14"; OUT="$2"; fi
TP="-1.5"; LRA="11"

LNJSON="$("$FF" -hide_banner -i "$IN" -af "loudnorm=I=$TARGET:TP=$TP:LRA=$LRA:print_format=json" -f null - 2>&1 || true)"
read -r MI MTP MLRA MTHRESH < <(printf '%s' "$LNJSON" | python3 -c '
import sys,json,re
t=sys.stdin.read(); m=re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", t, re.S)
d=json.loads(m.group(0)) if m else {}
print(d.get("input_i","0"), d.get("input_tp","0"), d.get("input_lra","0"), d.get("input_thresh","0"))
')
[ -n "${MI:-}" ] || { echo "No se pudo medir loudness (pase 1)." >&2; exit 1; }

"$FF" -y -hide_banner -i "$IN" \
  -af "loudnorm=I=$TARGET:TP=$TP:LRA=$LRA:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MTHRESH:linear=true" \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
echo "master ${TARGET} LUFS (input_i=$MI) -> $OUT"

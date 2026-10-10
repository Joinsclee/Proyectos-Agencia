#!/usr/bin/env bash
# reframe.sh IN FORMAT OUT — reencuadra a la plataforma.
# FORMAT: 916 (crop 9:16) · 916-pad (blurred-pad 9:16) · 11 (crop 1:1) · 169 (passthrough 16:9)
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
IN="${1:?uso: reframe.sh <in> <916|916-pad|11|169> <out.mp4>}"; FMT="${2:?}"; OUT="${3:?}"
case "$FMT" in
  916)     VF="crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,setsar=1" ;;
  11)      VF="crop=ih:ih,scale=1080:1080:flags=lanczos,setsar=1" ;;
  169)     VF="scale=1920:1080:flags=lanczos,setsar=1" ;;
  916-pad)
    "$FF" -y -hide_banner -i "$IN" -filter_complex \
"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30[bg];\
 [0:v]scale=1080:-1:force_original_aspect_ratio=decrease[fg];\
 [bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1[v]" \
      -map "[v]" -map 0:a? -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy "$OUT"
    echo "reframe 916-pad -> $OUT"; exit 0 ;;
  *) echo "FORMAT inválido: $FMT" >&2; exit 2 ;;
esac
"$FF" -y -hide_banner -i "$IN" -vf "$VF" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy "$OUT"
echo "reframe $FMT -> $OUT"

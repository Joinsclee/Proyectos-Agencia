#!/usr/bin/env bash
# extract-audio.sh IN [OUT.wav] — extrae audio 16 kHz mono PCM para whisper.
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
IN="${1:?uso: extract-audio.sh <in> [audio16k.wav]}"; OUT="${2:-audio16k.wav}"
"$FF" -y -hide_banner -i "$IN" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$OUT"
echo "audio -> $OUT"

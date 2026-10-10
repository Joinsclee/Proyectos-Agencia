#!/usr/bin/env bash
# transcribe.sh AUDIO16K [PREFIX] [--vad] [--fast] — transcripción word-level ES con whisper-cli.
# Genera <PREFIX>.json/.srt/.vtt con from/to por palabra. NUNCA usa modelos .en.
set -euo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"
AUDIO="${1:?uso: transcribe.sh <audio16k.wav> [prefix] [--vad] [--fast]}"; shift || true
PREFIX="transcript"; USE_VAD=0; MODEL="$WMODEL"
for a in "$@"; do
  case "$a" in
    --vad) USE_VAD=1 ;;
    --fast) MODEL="$WMODEL_FAST" ;;
    -*) echo "flag desconocido: $a" >&2; exit 2 ;;
    *) PREFIX="$a" ;;
  esac
done
[ -f "$MODEL" ] || { echo "Modelo whisper ausente: $MODEL (ver references/setup.md)" >&2; exit 1; }
case "$MODEL" in *".en"*) echo "ERROR: $MODEL es .en (solo inglés). Aborta." >&2; exit 1 ;; esac

args=( -m "$MODEL" -f "$AUDIO" -l es -ml 1 -sow -oj -osrt -ovtt -of "$PREFIX" -np )
if [ "$USE_VAD" = 1 ]; then
  [ -f "$WVAD" ] || { echo "VAD pedido pero falta el modelo: $WVAD (receta 5)" >&2; exit 1; }
  args+=( --vad -vm "$WVAD" -vt 0.5 -vsd 100 -vspd 250 -vp 30 )
fi
"$WC" "${args[@]}"
echo "transcripción -> $PREFIX.json / .srt / .vtt"

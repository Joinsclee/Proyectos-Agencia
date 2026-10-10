#!/usr/bin/env bash
# transcribe.sh SOURCE [PREFIX] — extrae audio 16k y transcribe con whisper (-ojf) en español.
# Salida: <PREFIX>-whisper.json (formato full que consume scripts/build-captions.mjs).
set -euo pipefail
VEP_QUIET=1 source "$(dirname "$0")/env.sh"
SRC="${1:?uso: transcribe.sh <source.mp4|wav> [prefix]}"; PREFIX="${2:-transcript}"
[ -f "$WMODEL" ] || { echo "Modelo whisper ausente: $WMODEL (descarga ggml-medium multilingüe)" >&2; exit 1; }
case "$WMODEL" in *".en"*) echo "ERROR: $WMODEL es .en (solo inglés)." >&2; exit 1 ;; esac

WAV="${PREFIX}-16k.wav"
"$FF" -y -hide_banner -loglevel error -i "$SRC" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$WAV"
# -ojf = JSON full con tokens (lo que build-captions.mjs necesita)
"$WC" -m "$WMODEL" -f "$WAV" -l es -ojf -of "${PREFIX}-whisper" -np
echo "whisper -> ${PREFIX}-whisper.json"
echo "siguiente: node scripts/build-captions.mjs ${PREFIX}-whisper.json src/${PREFIX}-captions.json 5 <durSeg>"

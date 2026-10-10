#!/usr/bin/env bash
# env.sh — variables del pipeline clee-video-editor. Uso: source env.sh
# Autodetecta binarios y modelos. No hace exit (está pensado para 'source').

# Comprobación sin pipes (a prueba de 'set -o pipefail' + SIGPIPE de grep -q).
_cve_have_libass() {
  local out; out="$("$1" -hide_banner -filters 2>/dev/null)" || true
  case "$out" in *" subtitles "*) return 0 ;; *) return 1 ;; esac
}
_cve_first_existing() { for p in "$@"; do [ -x "$p" ] || [ -f "$p" ] && { printf '%s' "$p"; return 0; }; done; return 1; }

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SKILL_DIR

# --- FFmpeg del sistema (rápido, SIN libass): corte, loudnorm, scale, concat, overlay, ducking, lut3d, zoompan ---
FF="$(command -v ffmpeg 2>/dev/null || _cve_first_existing /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg)"
export FF
export FFPROBE="$(command -v ffprobe 2>/dev/null || _cve_first_existing /opt/homebrew/bin/ffprobe /usr/local/bin/ffprobe)"

# --- FFSUB: FFmpeg CON libass (solo para quemar subtítulos ASS/SRT y drawtext) ---
# Orden: (1) FF si ya trae libass; (2) copia local en bin/; (3) ffmpeg-static de proyectos Node conocidos; (4) buscar en $HOME.
FFSUB=""
if [ -n "$FF" ] && _cve_have_libass "$FF"; then FFSUB="$FF"; fi
if [ -z "$FFSUB" ]; then
  for cand in \
    "$SKILL_DIR/bin/ffmpeg-libass" \
    "$HOME/CleeVoice/node_modules/ffmpeg-static/ffmpeg" \
    /opt/homebrew/opt/ffmpeg/bin/ffmpeg ; do
    if [ -x "$cand" ] && _cve_have_libass "$cand"; then FFSUB="$cand"; break; fi
  done
fi
if [ -z "$FFSUB" ]; then
  FFSUB="$(find "$HOME" -type f -name ffmpeg -path '*ffmpeg-static*' 2>/dev/null | while read -r p; do _cve_have_libass "$p" && { echo "$p"; break; }; done)"
fi
export FFSUB

# --- whisper.cpp ---
export WC="$(command -v whisper-cli 2>/dev/null || _cve_first_existing /opt/homebrew/bin/whisper-cli)"

# --- Modelos whisper: preferir MULTILINGÜE (nunca .en). Autodetecta ubicaciones conocidas. ---
export WMODEL="$(_cve_first_existing \
  "$SKILL_DIR/models/ggml-medium.bin" \
  "$HOME/JoinsClee inmobiliario/remotion-visitas/models/ggml-medium.bin" \
  "$HOME/Creador de Reels/remotion-visitas/models/ggml-medium.bin" \
  "$HOME/Library/Application Support/cleevoice/models/ggml-medium.bin" \
  "$HOME/Library/Application Support/cleevoice/models/ggml-small.bin" \
  || echo "$SKILL_DIR/models/ggml-medium.bin")"
export WMODEL_FAST="$(_cve_first_existing \
  "$SKILL_DIR/models/ggml-small.bin" \
  "$HOME/Library/Application Support/cleevoice/models/ggml-small.bin" \
  "$HOME/Library/Application Support/cleevoice/models/ggml-base.bin" \
  || echo "$WMODEL")"
export WVAD="$(_cve_first_existing \
  "$SKILL_DIR/models/ggml-silero-v5.1.2.bin" \
  "$HOME/Library/Application Support/cleevoice/models/ggml-silero-v5.1.2.bin" \
  || echo "$SKILL_DIR/models/ggml-silero-v5.1.2.bin")"

# Resumen (silenciar con CVE_QUIET=1)
if [ -z "$CVE_QUIET" ]; then
  echo "FF=$FF"
  echo "FFSUB=${FFSUB:-<no encontrado — captions por Remotion/Hyperframes>}"
  echo "WC=$WC"
  echo "WMODEL=$WMODEL"
fi

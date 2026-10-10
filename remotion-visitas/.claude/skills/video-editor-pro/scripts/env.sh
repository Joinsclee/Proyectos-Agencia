#!/usr/bin/env bash
# env.sh — variables de finishing para video-editor-pro (proyecto Remotion). Uso: source env.sh
# El texto se renderiza EN Remotion; ffmpeg solo hace finishing (audio, reframe, QA). No se necesita libass.
_vep_first() { for p in "$@"; do [ -f "$p" ] && { printf '%s' "$p"; return 0; }; done; return 1; }

# Ruta propia portable (bash usa BASH_SOURCE; zsh cae a $0, que apunta al archivo sourceado).
_vep_self="${BASH_SOURCE[0]:-$0}"
SKILL_DIR="$(cd "$(dirname "$_vep_self")/.." 2>/dev/null && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." 2>/dev/null && pwd)"   # .claude/skills/video-editor-pro -> raíz del repo
export SKILL_DIR PROJECT_ROOT

export FF="$(command -v ffmpeg || echo /opt/homebrew/bin/ffmpeg)"
export FFPROBE="$(command -v ffprobe || echo /opt/homebrew/bin/ffprobe)"
export WC="$(command -v whisper-cli || echo /opt/homebrew/bin/whisper-cli)"

# Modelo whisper MULTILINGÜE (nunca .en). Preferir el del proyecto.
export WMODEL="$(_vep_first \
  "$PROJECT_ROOT/models/ggml-medium.bin" \
  "$PROJECT_ROOT/models/ggml-small.bin" \
  "$HOME/Library/Application Support/cleevoice/models/ggml-medium.bin" \
  || echo "$PROJECT_ROOT/models/ggml-medium.bin")"

if [ -z "${VEP_QUIET:-}" ]; then
  echo "FF=$FF"; echo "WC=$WC"; echo "WMODEL=$WMODEL"; echo "PROJECT_ROOT=$PROJECT_ROOT"
fi
: # asegura estado 0 al ser sourceado bajo 'set -e'

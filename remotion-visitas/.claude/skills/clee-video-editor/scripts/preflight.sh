#!/usr/bin/env bash
# preflight.sh — verifica que la máquina puede correr el pipeline. Sale != 0 si falta algo crítico.
set -uo pipefail
CVE_QUIET=1 source "$(dirname "$0")/env.sh"

ok=0; warn=0; crit=0
# has_filter BIN NAME — sin pipes (a prueba de pipefail + SIGPIPE de grep -q).
has_filter() {
  local out; out="$("$1" -hide_banner -filters 2>/dev/null)" || true
  case "$out" in *" $2 "*) return 0 ;; *) return 1 ;; esac
}
pass() { echo "  ✅ $1"; }
warned() { echo "  ⚠️  $1"; warn=$((warn+1)); }
fail() { echo "  ❌ $1"; crit=$((crit+1)); }

echo "── clee-video-editor · preflight ──"

# 1. FFmpeg del sistema
if [ -n "${FF:-}" ] && "$FF" -hide_banner -version >/dev/null 2>&1; then
  pass "FFmpeg (FF): $FF"
  has_filter "$FF" lut3d && pass "lut3d disponible (color grade)" || warned "lut3d ausente — el grading por FFmpeg no funcionará"
  has_filter "$FF" loudnorm && pass "loudnorm/silencedetect OK" || warned "loudnorm ausente"
else
  fail "FFmpeg del sistema no encontrado (brew install ffmpeg)"
fi

# 2. FFSUB con libass (para quemar captions con FFmpeg)
if [ -n "${FFSUB:-}" ] && has_filter "$FFSUB" subtitles; then
  pass "FFSUB con libass: $FFSUB"
else
  warned "Sin FFmpeg con libass → la ruta de captions ASS no está disponible."
  warned "   Usa captions por Remotion/Hyperframes, o consigue un ffmpeg-static (ver references/setup.md)."
fi

# 3. whisper-cli + modelo multilingüe
if [ -n "${WC:-}" ] && "$WC" --help >/dev/null 2>&1; then
  pass "whisper-cli: $WC"
else
  fail "whisper-cli no encontrado (brew install whisper-cpp)"
fi
if [ -f "${WMODEL:-}" ]; then
  case "$WMODEL" in
    *.en.bin|*".en"*) fail "WMODEL es un modelo .en (SOLO inglés). Usa ggml-medium/small multilingüe." ;;
    *) pass "Modelo whisper: $(basename "$WMODEL")" ;;
  esac
else
  fail "Modelo whisper ausente: $WMODEL (descarga ggml-medium/small — ver references/setup.md)"
fi
[ -f "${WVAD:-}" ] && pass "Modelo VAD silero OK" || warned "Modelo VAD silero ausente (opcional; receta 5 de ffmpeg-recipes.md)"

# 4. Node 22+
if command -v node >/dev/null 2>&1; then
  nv="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$nv" -ge 22 ] 2>/dev/null && pass "Node.js v$(node -v | tr -d v)" || warned "Node $(node -v) < 22 (Hyperframes/Remotion piden 22+)"
else
  warned "Node.js no encontrado (necesario para Hyperframes/Remotion; brew install node)"
fi

echo "──"
if [ "$crit" -gt 0 ]; then
  echo "❌ Faltan $crit requisito(s) crítico(s) y $warn advertencia(s). Resuelve antes de producir (references/setup.md)."
  exit 1
fi
echo "✅ Listo para producir. ($warn advertencia(s) — revisa arriba si aplican a tu ruta.)"
exit 0

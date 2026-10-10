set -e
SK="$HOME/.claude/skills/montaje-vertical-clee/scripts"
PW="/Users/cristhian/Downloads/Paginas Web/Playwright"
export NODE_PATH="$PW/node_modules"
export PROYECTO_BASE="$PWD"
for n in llamadas-01 llamadas-02; do
  echo "=== $n: montando ==="
  python3 "$SK/montar.py" "edl-$n.json" | tail -3
  echo "=== $n: rótulos ==="
  (cd "$PW" && node "$SK/rotulos.cjs" subs "$n" | tail -1)
  (cd "$PW" && node "$SK/rotulos.cjs" tarjetas "$n" | tail -1)
  echo "=== $n: componiendo ==="
  python3 "$SK/componer.py" "$n" | tail -2
done

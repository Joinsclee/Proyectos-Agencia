set -e
SK="$HOME/.claude/skills/montaje-vertical-clee/scripts"
PW="/Users/cristhian/Downloads/Paginas Web/Playwright"
export NODE_PATH="$PW/node_modules"; export PROYECTO_BASE="$PWD"
for n in llamadas-03 llamadas-04 llamadas-05 llamadas-06; do
  echo "=== $n ==="
  python3 "$SK/montar.py" "edl-$n.json" | tail -1
  (cd "$PW" && node "$SK/rotulos.cjs" subs "$n" | tail -1)
  (cd "$PW" && node "$SK/rotulos.cjs" tarjetas "$n" | tail -1)
  python3 "$SK/componer.py" "$n" | tail -1
done
python3 "$SK/revision.py" llamadas-03 llamadas-04 llamadas-05 llamadas-06

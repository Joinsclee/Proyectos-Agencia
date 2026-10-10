set -e
SK="$HOME/.claude/skills/montaje-vertical-clee/scripts"
PW="/Users/cristhian/Downloads/Paginas Web/Playwright"
export NODE_PATH="$PW/node_modules"; export PROYECTO_BASE="$PWD"
# 01, 02 y 03 cambian de b-roll: hay que volver a montar
for n in llamadas-01 llamadas-02 llamadas-03; do
  echo "=== $n · montando de nuevo (fuera el mockup con precio) ==="
  python3 "$SK/montar.py" "edl-$n.json" | tail -1
done
# las seis: subtítulos (resalte nuevo), rótulos y composición
for n in llamadas-01 llamadas-02 llamadas-03 llamadas-04 llamadas-05 llamadas-06; do
  echo "=== $n · rótulos y composición ==="
  python3 "$SK/subtitulos.py" "$n" | head -1
  (cd "$PW" && node "$SK/rotulos.cjs" subs "$n" | tail -1)
  (cd "$PW" && node "$SK/rotulos.cjs" tarjetas "$n" | tail -1)
  python3 "$SK/componer.py" "$n" | tail -1
  rm -rf "_tmp/$n"
done
python3 "$SK/revision.py" llamadas-01 llamadas-02 llamadas-03 llamadas-04 llamadas-05 llamadas-06

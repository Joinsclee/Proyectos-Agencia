set -e
SK="$HOME/.claude/skills/montaje-vertical-clee/scripts"
PW="/Users/cristhian/Downloads/Paginas Web/Playwright"
export NODE_PATH="$PW/node_modules"; export PROYECTO_BASE="$PWD"
for n in llamadas-01 llamadas-02; do
  (cd "$PW" && node "$SK/rotulos.cjs" tarjetas "$n" | tail -1)
  python3 "$SK/componer.py" "$n" | tail -1
done
python3 "$SK/revision.py" llamadas-01 llamadas-02

set -e
SK="$HOME/.claude/skills/montaje-vertical-clee/scripts"
PW="/Users/cristhian/Downloads/Paginas Web/Playwright"
export NODE_PATH="$PW/node_modules"; export PROYECTO_BASE="$PWD"
echo "=== montando (42 cortes) ==="
python3 "$SK/montar.py" edl-vsl-01.json | tail -2
echo "=== rótulos ==="
(cd "$PW" && node "$SK/rotulos.cjs" subs vsl-01 | tail -1)
(cd "$PW" && node "$SK/rotulos.cjs" tarjetas vsl-01 | tail -1)
echo "=== componiendo ==="
python3 "$SK/componer.py" vsl-01 | tail -2
echo "=== revisión ==="
python3 "$SK/revision.py" vsl-01

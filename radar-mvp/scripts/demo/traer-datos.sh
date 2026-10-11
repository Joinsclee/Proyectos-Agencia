#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  Trae el volcado de la demo desde Supabase, aunque la API esté en 402.
#
#  La restricción por cuota bloquea PostgREST y GoTrue, pero NO la conexión
#  a Postgres. Esto va por ahí.
#
#  USO:
#    DEMO_PG_URL='postgresql://postgres.PROYECTO:CLAVE@aws-N-REGION.pooler.supabase.com:5432/postgres' \
#      bash scripts/demo/traer-datos.sh
#
#  La cadena se pasa por el entorno A PROPÓSITO: así la contraseña no queda en
#  ningún archivo, ni en el repositorio, ni en el historial de git. Sí queda en
#  el historial del shell — si te importa, antepón un espacio al comando.
#
#  Tiene que ser la del SESSION POOLER (puerto 5432), no la directa:
#    · la directa (db.PROYECTO.supabase.co) es solo IPv6 y no todas las redes
#      llegan;
#    · el transaction pooler (6543) no mantiene sesión y rompe consultas largas.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

if [ -z "${DEMO_PG_URL:-}" ]; then
  echo "Falta DEMO_PG_URL. Ver la cabecera de este archivo." >&2
  exit 1
fi

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$AQUI/datos"
SQL="$AQUI/exportar-desde-el-panel.sql"
mkdir -p "$DESTINO"

command -v psql >/dev/null || { echo "Hace falta psql (brew install libpq)" >&2; exit 1; }

echo "Probando la conexión…"
psql "$DEMO_PG_URL" -tAc 'select 1' >/dev/null 2>&1 \
  || { echo "No se pudo conectar. ¿Es la cadena del session pooler y la contraseña correcta?" >&2; exit 1; }
echo "  conectado."

# Las cinco consultas salen del MISMO archivo que usarías a mano en el panel,
# troceado por sus separadores. Así no hay dos versiones del export que se
# puedan separar: si se corrige una consulta, se corrige para los dos caminos.
python3 - "$SQL" "$DESTINO" "$DEMO_PG_URL" <<'PY'
import re, subprocess, sys, pathlib

sql_path, destino, url = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
texto = pathlib.Path(sql_path).read_text(encoding='utf8')

# Cada bloque empieza por «-- ─── N · … → guardar como NOMBRE.csv»
bloques = re.split(r'^-- ─── ', texto, flags=re.M)[1:]
for bloque in bloques:
    m = re.search(r'guardar como\s+([\w.-]+)\.csv', bloque)
    if not m:
        continue
    nombre = m.group(1)
    # La consulta es todo lo que va del primer `select` al `;` final del bloque.
    i = bloque.lower().find('select')
    consulta = bloque[i:].rsplit(';', 1)[0] + ';'
    salida = destino / f'{nombre}.json'
    print(f'  {nombre} …', end='', flush=True)
    try:
        # -tA: sin cabecera ni alineado; la celda es el JSON tal cual.
        r = subprocess.run(['psql', url, '-tAc', consulta],
                           capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            print(f' ERROR: {r.stderr.strip().splitlines()[-1][:120] if r.stderr.strip() else "sin detalle"}')
            continue
        cuerpo = r.stdout.strip()
        if not cuerpo or cuerpo == '\\N':
            print(' vacío (la consulta no devolvió filas)')
            continue
        salida.write_text(cuerpo, encoding='utf8')
        # Contar sin cargar el JSON entero en memoria dos veces
        import json
        try:
            n = len(json.loads(cuerpo)) if cuerpo.lstrip().startswith('[') else 1
        except Exception:
            n = '?'
        print(f' {n} filas · {salida.stat().st_size // 1024} KB')
    except subprocess.TimeoutExpired:
        print(' ERROR: la consulta tardó más de 10 minutos')
PY

echo ""
echo "Volcado en scripts/demo/datos/ (ignorado por git)."
echo "Arrancar con:  RADAR_DEMO_DATOS=1 npm run serve"

#!/usr/bin/env bash
# Restaura el Radar en un proyecto de Supabase nuevo.
#
# La conexion se pasa por entorno y NUNCA se escribe en un fichero:
#   export RADAR_DATABASE_URL='postgresql://postgres.PROYECTO:CLAVE@aws-1-...pooler.supabase.com:5432/postgres'
#   bash restaurar.sh
#
# Tres cosas que ya costaron acertar antes y conviene no volver a descubrir:
#   · el puerto es 5432 (session pooler), no el 6543 que ensena el panel
#   · la conexion "directa" db.PROYECTO.supabase.co es solo IPv6
#   · la @ de la contrasena va como %40
set -uo pipefail

# El plan gratuito son 500 MB. Se para en 420 para dejar aire: los scrapers
# escriben a diario y price_history (27 MB cuando se hizo el volcado) vuelve a
# crecer sola. Subelo si quieres mas catalogo y menos margen.
TOPE_MB=${TOPE_MB:-420}
# Un fichero .sql ocupa en disco ~1,25 veces su tamano (indices + cabeceras de
# pagina, menos lo que comprime el TOAST). Medido en la prueba local:
# 52,3 MB -> 67 · 51,9 -> 64 · 51,3 -> 63 · 33,5 -> 41.
FACTOR_DISCO=125
DIR="$(cd "$(dirname "$0")" && pwd)"

[ -n "${RADAR_DATABASE_URL:-}" ] || { echo "Falta RADAR_DATABASE_URL"; exit 1; }
PSQL=(psql "$RADAR_DATABASE_URL" -v ON_ERROR_STOP=1 -q --no-psqlrc)

tam_mb() { "${PSQL[@]}" -tAc "select round(pg_database_size(current_database())/1048576.0)" 2>/dev/null; }

paso() {  # paso <fichero> <rotulo>
  printf '\n\033[1m── %s\033[0m\n' "$2"
  if ! "${PSQL[@]}" -f "$DIR/$1"; then echo "FALLO en $1"; exit 1; fi
  echo "   base: $(tam_mb) MB"
}

echo "Conectando..."
"${PSQL[@]}" -tAc "select 'servidor: ' || version()" || exit 1
echo "tamano inicial: $(tam_mb) MB · tope: ${TOPE_MB} MB"

# El esquema puede venir ya aplicado desde el SQL Editor del panel (es la via
# que no necesita contrasena). 01 NO es re-ejecutable —los CREATE TABLE no
# llevan IF NOT EXISTS— asi que se mira antes si las tablas ya estan.
YA=$("${PSQL[@]}" -tAc "select count(*) from pg_tables where schemaname='public' and tablename='inmuebles'" 2>/dev/null)
if [ "${YA:-0}" = "1" ]; then
  echo ""
  echo "── Esquema: ya esta aplicado, se salta 01"
else
  paso 01-esquema-pre.sql    "Esquema: 17 tablas, 11 funciones, 2 vistas, extension vector"
fi

paso 02-datos-auth.sql       "45 usuarios y 47 identidades (lo irreemplazable)"
paso 02-datos-publicas-chicas.sql "Remates, zonas, documentos y configuracion"
paso 02-datos-arriendos.sql  "101.108 arriendos (features recortado a 6 claves)"
paso 04-inmuebles-00.sql     "Nucleo: banco + is_high + 32.339 oportunidades"
# 03 es re-ejecutable, asi que se lanza igual: crea lo que falte y no toca lo
# que ya este. Si los indices ya existian, la carga de arriba fue mas lenta.
paso 03-esquema-post.sql     "52 indices, 25 constraints, 5 triggers, RLS y permisos"

# Relleno: cada lote da comparables a mas fichas. Se para al llegar al tope,
# porque los scrapers escriben a diario y price_history vuelve a crecer sola.
for f in "$DIR"/04-inmuebles-0[1-9].sql; do
  [ -e "$f" ] || break
  ACTUAL=$(tam_mb)
  PESO=$(( $(wc -c < "$f") / 1048576 * FACTOR_DISCO / 100 ))
  if [ $(( ACTUAL + PESO )) -gt "$TOPE_MB" ]; then
    echo ""
    echo "PARADA: $(basename "$f") (~${PESO} MB) no cabe. Base en ${ACTUAL} MB de ${TOPE_MB}."
    echo "Los lotes que faltan se quedan sin cargar; los scrapers reponen el resto."
    break
  fi
  paso "$(basename "$f")" "Relleno para comparables: $(basename "$f")"
done

printf '\n\033[1m── Recuento final\033[0m\n'
"${PSQL[@]}" <<'EOF'
analyze;
select 'auth.users'          as tabla, count(*)::text as filas from auth.users
union all select 'auth.identities',        count(*)::text from auth.identities
union all select 'inmuebles',              count(*)::text from public.inmuebles
union all select '  de banco',             count(*)::text from public.inmuebles where source <> 'fincaraiz'
union all select '  oportunidades',        count(*)::text from public.inmuebles where is_opportunity
union all select '  ciudades',             count(distinct city)::text from public.inmuebles
union all select 'rental_listings',        count(*)::text from public.rental_listings
union all select 'remates',                count(*)::text from public.remates
union all select 'documents',              count(*)::text from public.documents
union all select 'radar_zonas_monitoreadas', count(*)::text from public.radar_zonas_monitoreadas
union all select 'radar_cron_jobs',        count(*)::text from public.radar_cron_jobs
union all select 'n8n_chat_histories',     count(*)::text from public.n8n_chat_histories
union all select '— tamano total —',       pg_size_pretty(pg_database_size(current_database()));
EOF
echo ""
echo "Hecho. Siguiente paso: cambiar las variables de entorno (EasyPanel y .env)"
echo "al proyecto nuevo y quitar RADAR_DEMO_DATOS."

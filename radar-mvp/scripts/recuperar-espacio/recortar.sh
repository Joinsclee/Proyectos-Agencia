#!/usr/bin/env bash
# Aplica a las filas YA ESCRITAS los dos recortes que el codigo hace al escribir,
# y devuelve el espacio al disco.
#
# Por que hace falta: los recortes (soloLoQueUsaElArriendo y recortarGaleria)
# entraron en el codigo el 20/10/2026 pero NO se desplegaron. El cron siguio un
# mes escribiendo sin ellos, la base paso de 402 MB a 1.033 —con el limite del
# plan gratuito en 500— y Supabase acabo poniendola en solo-lectura.
#
#   export RADAR_DATABASE_URL='postgresql://...pooler.supabase.com:5432/postgres'
#   bash scripts/recuperar-espacio/recortar.sh
#
# Es REANUDABLE: cada lote busca solo lo que todavia le falta, asi que si se corta
# se vuelve a lanzar y sigue.
set -uo pipefail

LOTE=${LOTE:-2000}          # filas por UPDATE
CADA=${CADA:-5}             # cada cuantos lotes se hace un VACUUM normal
[ -n "${RADAR_DATABASE_URL:-}" ] || { echo "Falta RADAR_DATABASE_URL"; exit 1; }

# ─────────────────── los tres ajustes que hay que anular ───────────────────
#
# 1. SOLO-LECTURA. Supabase lo pone al pasarse de cuota, y entonces no se puede
#    borrar nada para reducir: un bloqueo circular. Anularlo por sesion es la
#    salida prevista. NO sirve por PGOPTIONS —el pooler no pasa las opciones de
#    arranque—, asi que va como sentencia dentro de cada bloque.
#
# 2. STATEMENT_TIMEOUT. Supabase fija 2 min en
#    /etc/postgresql-custom/platform-defaults.conf. Un UPDATE de miles de filas
#    con TOAST de por medio se lo come, y el VACUUM FULL de una tabla de 700 MB
#    mucho mas.
#
# `psql -c` ignora stdin, asi que los bloques con heredoc los llevan como
# primeras lineas y los de -c en un -c propio delante (el ajuste persiste entre
# varios -c de la misma sesion).
PREPARA='set default_transaction_read_only = off; set statement_timeout = 0'
SQL_PREPARA="set default_transaction_read_only = off;
set statement_timeout = 0;"

P=(psql "$RADAR_DATABASE_URL" -v ON_ERROR_STOP=1 -tA --no-psqlrc)

tam()  { "${P[@]}" -c "select pg_size_pretty(pg_database_size(current_database()))" | tail -n1; }
# VACUUM normal: NO reduce el fichero, pero libera las versiones muertas para que
# los UPDATE siguientes las reutilicen. Sin esto la tabla crece mientras se
# recorta —medido: de 941 a 965 MB en nueve lotes— y se acerca al limite justo
# cuando se intenta bajar de el.
limpia() { "${P[@]}" -c "$PREPARA" -c "vacuum (analyze) $1" >/dev/null 2>&1; }

# Cuenta las filas de un lote. Ojo: `psql -tA` imprime tambien el tag de cada
# sentencia (`SET`, `UPDATE 0`), asi que contar lineas de un `returning 1` da
# 3 para un lote vacio y el bucle NUNCA termina —ya paso: 78 minutos girando en
# vano—. Por eso cada lote acaba en `select count(*)` y aqui se coge el ultimo
# renglon que sea solo digitos.
filas() { printf '%s\n' "$1" | grep -Eo '^[0-9]+$' | tail -n1; }

echo "Base al empezar: $(tam)"
echo "(solo-lectura y statement_timeout de Supabase: anulados por sesion)"

# ───────────── recorta una tabla por lotes hasta que no quede nada ─────────────
recortar() {  # recortar <rotulo> <sql-del-lote> <tabla>
  echo ""
  echo "── $1"
  local n salida vuelta=0 total=0
  while :; do
    salida=$("${P[@]}" <<SQL
$SQL_PREPARA
$2
SQL
) || { echo "   FALLO en el lote $((vuelta+1)) · base $(tam)"; return 1; }
    n=$(filas "$salida")
    [ -n "$n" ] || { echo "   FALLO: el lote no devolvio un numero de filas"; return 1; }
    [ "$n" -eq 0 ] && break
    total=$((total+n)); vuelta=$((vuelta+1))
    if [ $((vuelta % CADA)) -eq 0 ]; then
      limpia "$3"
      printf "   %6d filas · base %s (limpiada)\n" "$total" "$(tam)"
    else
      printf "   %6d filas\n" "$total"
    fi
  done
  limpia "$3"
  echo "   $total filas en total · base $(tam)"
}

# ── 1. arriendos: features a las 6 claves que lee engine/rental-comparables.ts ──
recortar "arriendos: features a 6 claves" "
with pendientes as (
  select id from rental_listings
   where features is not null
     and (select count(*) from jsonb_object_keys(features)) > 6
   limit $LOTE
), hecho as (
  update rental_listings r
     set features = (
           select coalesce(jsonb_object_agg(k, r.features->k), '{}'::jsonb)
             from unnest(array['lat','lng','bedrooms','garages','neighborhood','is_project']) k
            where r.features ? k and r.features->k <> 'null'::jsonb)
    from pendientes p where p.id = r.id
  returning 1
)
select count(*) from hecho;" rental_listings

# ── 2. inmuebles: la galeria a 6 fotos. image_url (la portada) no se toca ──
recortar "inmuebles: galeria a 6 fotos" "
with pendientes as (
  select id from inmuebles
   where features ? 'images'
     and jsonb_typeof(features->'images') = 'array'
     and jsonb_array_length(features->'images') > 6
   limit $LOTE
), hecho as (
  update inmuebles i
     set features = jsonb_set(
           jsonb_set(i.features, '{images}',
             (select coalesce(jsonb_agg(v), '[]'::jsonb)
                from (select value v from jsonb_array_elements(i.features->'images') limit 6) t)),
           '{image_count}', '6'::jsonb)
    from pendientes p where p.id = i.id
  returning 1
)
select count(*) from hecho;" inmuebles

# ── 3. price_history: cero ficheros del repo la consultan ──
echo ""
echo "── price_history: se vacia (0 lectores en el codigo)"
"${P[@]}" -c "$PREPARA" -c "truncate price_history" >/dev/null && echo "   hecho · base $(tam)"

# ── 4. inactivas, respetando los favoritos ──
# 19 de los 45 usuarios tienen favoritos en su metadata. Hoy ninguno apunta a una
# inactiva, pero borrar el favorito de alguien no se nota hasta que lo abre.
echo ""
echo "── inmuebles inactivas (protegiendo favoritos)"
"${P[@]}" <<SQL
$SQL_PREPARA
with favs as (
  select distinct (jsonb_array_elements(raw_user_meta_data->'favorites')->>'id') as id
    from auth.users
   where jsonb_typeof(raw_user_meta_data->'favorites') = 'array'
), hecho as (
  delete from inmuebles
   where not is_active
     and id::text not in (select id from favs where id is not null)
  returning 1
)
select count(*) from hecho;
SQL
echo "   hecho · base $(tam)"

# ── 5. devolver el espacio al disco ──
# VACUUM normal solo marca reutilizable y NO reduce pg_database_size. FULL
# reescribe la tabla y si lo devuelve, a cambio de un bloqueo exclusivo (que
# ahora da igual: la web esta caida) y de necesitar espacio para la copia.
echo ""
echo "── VACUUM FULL (reescribe las tablas y devuelve el espacio)"
for t in price_history rental_listings inmuebles; do
  printf "   %-16s ... " "$t"
  "${P[@]}" -c "$PREPARA" -c "vacuum full analyze $t" >/dev/null && echo "ok · base $(tam)"
done

echo ""
echo "Base al terminar: $(tam)"
"${P[@]}" -c "select relname||': '||pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and pg_total_relation_size(c.oid)>1000000
 order by pg_total_relation_size(c.oid) desc"

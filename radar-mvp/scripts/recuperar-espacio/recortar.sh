#!/usr/bin/env bash
# Aplica a las filas YA ESCRITAS los dos recortes que el codigo hace al escribir,
# y devuelve el espacio al disco.
#
# Por que hace falta: los recortes (soloLoQueUsaElArriendo y recortarGaleria)
# entraron en el codigo el 20/10/2026 pero NO se desplegaron. El cron siguio un
# mes escribiendo sin ellos, y la base paso de 402 MB a 1.033 — con el limite del
# plan gratuito en 500. El conteo grande de la portada paso de 1,6 s a 10,1 s y
# la precarga del servidor dejo de terminar.
#
# Va por lotes a proposito: un solo UPDATE de 152.000 filas en una instancia
# gratuita genera un WAL enorme y bloquea la tabla demasiado tiempo.
#
#   export RADAR_DATABASE_URL='postgresql://...pooler.supabase.com:5432/postgres'
#   bash scripts/recuperar-espacio/recortar.sh
set -uo pipefail

[ -n "${RADAR_DATABASE_URL:-}" ] || { echo "Falta RADAR_DATABASE_URL"; exit 1; }

# Supabase pone el proyecto en SOLO-LECTURA al pasarse de cuota, y entonces no se
# puede borrar nada para reducirlo: es un bloqueo circular. La salida prevista es
# anular el ajuste por sesion, que Supabase impone desde su fichero de
# configuracion y no a nivel de base, asi que un `set` de sesion basta.
#
# NO sirve por PGOPTIONS: el pooler de Supabase no pasa las opciones de arranque.
# Tiene que ir como sentencia dentro de cada sesion, y `psql -c` ignora stdin, asi
# que los bloques con heredoc lo llevan como primera linea y los de -c lo llevan
# en un -c propio delante (el ajuste persiste entre varios -c de la misma sesion).
#
# Esto solo sirve para encoger la base. No es una forma de seguir escribiendo por
# encima de la cuota: en cuanto el tamano baje, Supabase levanta el solo-lectura.
SOLO_LECTURA_OFF='set default_transaction_read_only = off'
echo "Modo solo-lectura de Supabase: se anula por sesion (para poder liberar)"

P=(psql "$RADAR_DATABASE_URL" -v ON_ERROR_STOP=1 -tA --no-psqlrc)

tam() { "${P[@]}" -c "select pg_size_pretty(pg_database_size(current_database()))"; }
echo "Base al empezar: $(tam)"

# ─────────── 1. arriendos: features a las 6 claves que lee el motor ───────────
# engine/rental-comparables.ts lee lat, lng, bedrooms, garages, neighborhood e
# is_project. Las otras 22 —description, images, amenities, el bloque del
# portal— nadie las lee en un arriendo: un arriendo no se ensena, solo cuenta
# para la mediana del canon de su zona.
echo ""
echo "── 1/5 arriendos: features de 28 claves a 6"
while :; do
  N=$("${P[@]}" <<'SQL'
set default_transaction_read_only = off;
with pendientes as (
  select id from rental_listings
   where features is not null
     and (select count(*) from jsonb_object_keys(features)) > 6
   limit 4000
)
update rental_listings r
   set features = (
         select coalesce(jsonb_object_agg(k, r.features->k), '{}'::jsonb)
           from unnest(array['lat','lng','bedrooms','garages','neighborhood','is_project']) k
          where r.features ? k and r.features->k <> 'null'::jsonb)
  from pendientes p where p.id = r.id
returning 1;
SQL
) || exit 1
  N=$(echo "$N" | grep -c 1 || true)
  [ "${N:-0}" -eq 0 ] && break
  printf "   %s filas · base %s\n" "$N" "$(tam)"
done

# ─────────── 2. inmuebles: la galeria a 6 fotos ───────────
# Los parsers guardan hasta 30 URLs. La ficha ensena un carrusel, no las treinta
# de golpe, y image_url (la portada, lo unico que usa el listado) no se toca.
echo ""
echo "── 2/5 inmuebles: galeria a 6 fotos"
while :; do
  N=$("${P[@]}" <<'SQL'
set default_transaction_read_only = off;
with pendientes as (
  select id from inmuebles
   where features ? 'images'
     and jsonb_typeof(features->'images') = 'array'
     and jsonb_array_length(features->'images') > 6
   limit 4000
)
update inmuebles i
   set features = jsonb_set(
         jsonb_set(i.features, '{images}',
           (select coalesce(jsonb_agg(v), '[]'::jsonb)
              from (select value v from jsonb_array_elements(i.features->'images') limit 6) t)),
         '{image_count}', '6'::jsonb)
  from pendientes p where p.id = i.id
returning 1;
SQL
) || exit 1
  N=$(echo "$N" | grep -c 1 || true)
  [ "${N:-0}" -eq 0 ] && break
  printf "   %s filas · base %s\n" "$N" "$(tam)"
done

# ─────────── 3. price_history: nadie la lee ───────────
# Comprobado con grep sobre todo el repositorio: cero ficheros la consultan. Es
# historico derivado que el trigger log_price_history escribe y nada lee.
echo ""
echo "── 3/5 price_history: se vacia (0 lectores en el codigo)"
"${P[@]}" -c "$SOLO_LECTURA_OFF" -c "truncate price_history" && echo "   hecho · base $(tam)"

# ─────────── 4. inmuebles inactivas, respetando los favoritos ───────────
# Son 575 y pesan 2,7 MB, asi que el ahorro es menor. Se hace igual porque el
# ciclo de vida desactiva y nunca borra, y la tabla solo crece.
# El guardia de favoritos es cinturon y tirantes: hoy ninguno apunta a una
# inactiva, pero borrar el favorito de alguien no se nota hasta que lo abre.
echo ""
echo "── 4/5 inmuebles inactivas (protegiendo favoritos)"
"${P[@]}" <<'SQL'
set default_transaction_read_only = off;
with favs as (
  select distinct (jsonb_array_elements(raw_user_meta_data->'favorites')->>'id') as id
    from auth.users
   where jsonb_typeof(raw_user_meta_data->'favorites') = 'array'
)
delete from inmuebles
 where not is_active
   and id::text not in (select id from favs where id is not null);
SQL
echo "   hecho · base $(tam)"

# ─────────── 5. devolver el espacio al disco ───────────
# Un UPDATE deja la version vieja de la fila muerta: el espacio sigue ocupado
# hasta que se compacta. VACUUM normal solo lo marca reutilizable y NO reduce
# pg_database_size; FULL reescribe la tabla y si lo devuelve. Toma bloqueo
# exclusivo, que ahora da igual porque la web esta caida.
echo ""
echo "── 5/5 VACUUM FULL (reescribe las tablas, devuelve el espacio)"
for t in rental_listings inmuebles price_history; do
  printf "   %s ... " "$t"
  "${P[@]}" -c "$SOLO_LECTURA_OFF" -c "vacuum full analyze $t" >/dev/null && echo "ok · base $(tam)"
done

echo ""
echo "Base al terminar: $(tam)"
"${P[@]}" -c "select relname||': '||pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and pg_total_relation_size(c.oid)>1000000
 order by pg_total_relation_size(c.oid) desc"

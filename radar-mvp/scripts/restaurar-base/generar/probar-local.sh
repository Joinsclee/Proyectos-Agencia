#!/usr/bin/env bash
# Ensaya el restore en el Postgres local antes de tocar el proyecto nuevo.
# No valida pgvector (no esta instalado): se sustituye el tipo por text, que
# no cambia nada del resto del esquema.
set -uo pipefail
DB=radar_prueba_restore
P=(psql -d "$DB" -v ON_ERROR_STOP=1 -q --no-psqlrc)

dropdb --if-exists "$DB" 2>/dev/null
createdb "$DB" || exit 1

# roles de Supabase que los 727 GRANT necesitan
for r in anon authenticated service_role postgres supabase_admin supabase_auth_admin; do
  psql -d "$DB" -q --no-psqlrc -c "create role \"$r\"" 2>/dev/null
done

# pgvector no esta: el tipo pasa a text (las 11 funciones son plpgsql, no se validan)
sed -e 's/create extension if not exists vector with schema public;//' \
    -e 's/public\.vector(1536)/text/g' -e 's/public\.vector/text/g' \
    01-esquema-pre.sql > /tmp/p-01.sql
sed -e 's/public\.vector(1536)/text/g' -e 's/public\.vector/text/g' \
    03-esquema-post.sql > /tmp/p-03.sql

medir() { psql -d "$DB" -tAc "select round(pg_database_size('$DB')/1048576.0,1)"; }
etapa() {
  printf '\n\033[1m── %s\033[0m\n' "$2"
  "${P[@]}" -f "$1" 2>&1 | grep -viE "^(SET|COPY|CREATE|ALTER|GRANT|REVOKE|COMMENT|DO|DROP|INSERT|ANALYZE|$)" | head -20
  echo "   base: $(medir) MB"
}

etapa prueba-auth-ddl.sql "Esqueleto de auth (solo para la prueba)"
etapa /tmp/p-01.sql               "Esquema: tablas, funciones, vistas"
etapa 02-datos-auth.sql           "45 usuarios + 47 identidades"
etapa 02-datos-publicas-chicas.sql "Remates, zonas, documentos, configuracion"
etapa 02-datos-arriendos.sql      "101.108 arriendos"
etapa 04-inmuebles-00.sql         "Nucleo de inmuebles"
etapa /tmp/p-03.sql               "Indices, constraints, triggers, RLS, permisos"

printf '\n\033[1m── Tamanos reales en disco (lo que importa para la cuota) ──\033[0m\n'
psql -d "$DB" -c "analyze;" -q
psql -d "$DB" -P pager=off <<'EOF'
select relname as tabla,
       pg_size_pretty(pg_relation_size(c.oid))                        as datos,
       pg_size_pretty(pg_total_relation_size(c.oid)
                      - pg_relation_size(c.oid)
                      - coalesce(pg_indexes_size(c.oid),0))           as toast,
       pg_size_pretty(pg_indexes_size(c.oid))                         as indices,
       pg_size_pretty(pg_total_relation_size(c.oid))                  as total
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and pg_total_relation_size(c.oid) > 100000
 order by pg_total_relation_size(c.oid) desc;
select pg_size_pretty(pg_database_size(current_database())) as base_entera;
EOF

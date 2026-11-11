"""Carga auth.users y auth.identities en el esquema auth QUE YA EXISTE.

No se restaura el DDL de auth: el proyecto nuevo trae su propia version de
GoTrue y escribir encima lo romperia. Solo entran las filas.

Y entran por una tabla puente, no directas: si el volcado y el proyecto nuevo
no tienen exactamente las mismas columnas (versiones distintas de GoTrue), un
COPY directo falla entero. Con la puente se insertan solo las columnas que
existen en los dos, y las que sobran se quedan fuera sin romper nada.
"""
import re, sys

def cabecera(fich, tabla):
    l = open(fich).readline()
    m = re.match(r'COPY %s \((.*?)\) FROM stdin;' % re.escape(tabla), l)
    return [c.strip() for c in m.group(1).split(',')]

SALIDA = open('02-datos-auth.sql', 'w')
SALIDA.write("""-- Usuarios reales del Radar: 45 cuentas con su contrasena cifrada y sus
-- identidades (39 por correo, 6 Google, 2 Microsoft). Es la unica parte del
-- volcado que no se puede volver a generar: los inmuebles los reponen los
-- scrapers, las cuentas no.
--
-- No se toca el DDL de auth. El proyecto nuevo trae su propio esquema de
-- GoTrue, posiblemente de otra version, y escribir encima lo romperia.
set statement_timeout = 0;
set client_min_messages = warning;
""")

for fich, tabla, puente, clave in (
    ('piezas/datos-auth-users.sql', 'auth.users', '_mig_users', 'id'),
    ('piezas/datos-auth-identities.sql', 'auth.identities', '_mig_identities', 'id'),
):
    cols = cabecera(fich, tabla)
    SALIDA.write('\n\n-- ═══════════ %s ═══════════\n' % tabla)
    SALIDA.write('drop table if exists public.%s;\n' % puente)
    SALIDA.write('create table public.%s (like %s);\n' % (puente, tabla))
    SALIDA.write('-- por si el volcado trae columnas que esta version de GoTrue ya no tiene\n')
    for c in cols:
        SALIDA.write('alter table public.%s add column if not exists %s text;\n' % (puente, c))
    SALIDA.write('\ncopy public.%s (%s) from stdin;\n' % (puente, ', '.join(cols)))
    n = 0
    for linea in open(fich):
        if linea.startswith('COPY '): continue
        SALIDA.write(linea)
        if not linea.startswith('\\.'): n += 1
    SALIDA.write("""
-- Inserta solo las columnas que estan en el volcado Y en esta version de
-- GoTrue, y nunca una columna generada: auth.users.confirmed_at lo es, y
-- Postgres rechaza el insert entero si se intenta escribir en ella.
do $$
declare
  cols text;
  del_volcado text[] := array[%(lista)s];
begin
  select string_agg(quote_ident(d.column_name), ', ' order by d.ordinal_position)
    into cols
    from information_schema.columns d
   where d.table_schema = '%(esq)s'
     and d.table_name   = '%(tab)s'
     and d.column_name  = any(del_volcado)
     and d.is_generated = 'NEVER'
     and d.identity_generation is null;
  if cols is null then
    raise exception 'ninguna columna en comun entre el volcado y %(esq)s.%(tab)s';
  end if;
  execute format(
    'insert into %(esq)s.%(tab)s (%%1$s) select %%1$s from public.%(puente)s on conflict (%(clave)s) do nothing',
    cols);
end $$;
drop table public.%(puente)s;
""" % {'puente': puente, 'esq': tabla.split('.')[0], 'tab': tabla.split('.')[1],
       'clave': clave, 'lista': ', '.join("'%s'" % c for c in cols)})
    print('%-18s %d filas, %d columnas' % (tabla, n, len(cols)))

SALIDA.write("""
-- Comprobacion: tiene que decir 45 y 47.
select 'auth.users' as tabla, count(*) from auth.users
union all select 'auth.identities', count(*) from auth.identities;
""")
SALIDA.close()

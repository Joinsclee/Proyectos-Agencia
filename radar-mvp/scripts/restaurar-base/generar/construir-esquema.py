"""Separa el DDL de public en pre-datos y post-datos.

Cargar 100k filas con 52 indices ya creados es un orden de magnitud mas lento
que crear los indices al final, y ademas una FK a medio cargar aborta la
transaccion. Asi que: tablas -> datos -> indices/constraints/triggers.
"""
import re, os

ENTRADA = 'piezas/public-ddl.sql'
CAB = re.compile(r'^-- (.*?) · (.*)$')

# el orden importa: cada grupo depende de los anteriores
PRE  = ['SEQUENCE', 'TABLE', 'SEQUENCE OWNED BY', 'DEFAULT', 'FUNCTION', 'VIEW']
POST = ['CONSTRAINT', 'FK CONSTRAINT', 'INDEX', 'TRIGGER', 'SEQUENCE SET',
        'ROW SECURITY', 'ACL', 'DEFAULT ACL', 'COMMENT']

bloques = {}
tipo = None
for linea in open(ENTRADA):
    m = CAB.match(linea.rstrip('\n'))
    if m and m.group(1) in PRE + POST:
        tipo = m.group(1)
        bloques.setdefault(tipo, []).append('\n-- %s\n' % m.group(2))
        continue
    if linea.strip() in ('--', ''):
        continue
    if tipo: bloques[tipo].append(linea)

CABECERA = """-- Radar · esquema public restaurado desde el volcado del 17-10-2026
-- Generado a partir de db_cluster-17-10-2026@22-35-17.backup.gz
--
-- La extension vector se instalo en el esquema public (no en extensions), y
-- documents.embedding / memories.embedding son vector(1536). Un proyecto nuevo
-- de Supabase NO trae vector activado, asi que va primero o fallan las tablas.
create extension if not exists vector with schema public;

set statement_timeout = 0;
set lock_timeout = 0;
set client_min_messages = warning;
"""

for nombre, grupos in (('01-esquema-pre.sql', PRE), ('03-esquema-post.sql', POST)):
    with open(nombre, 'w') as fh:
        if nombre.startswith('01'): fh.write(CABECERA)
        else: fh.write('-- Indices, constraints, triggers, RLS y permisos.\n'
                       '-- Va DESPUES de cargar los datos.\nset statement_timeout = 0;\n'
                       'set client_min_messages = warning;\n')
        for g in grupos:
            if g not in bloques: continue
            fh.write('\n\n-- ═══════════ %s ═══════════\n' % g)
            fh.writelines(bloques[g])
    print('%-24s %7.1f KB' % (nombre, os.path.getsize(nombre)/1024))

for t in sorted(bloques): print('  %-22s %d lineas' % (t, len(bloques[t])))

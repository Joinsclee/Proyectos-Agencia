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
        'ROW SECURITY', 'ACL', 'COMMENT']
# 'DEFAULT ACL' se queda FUERA a proposito: son 24 ALTER DEFAULT PRIVILEGES,
# ocho de ellas FOR ROLE supabase_admin, y en el SQL Editor de Supabase no eres
# superusuario -> «permission denied to change default privileges», que ademas
# tumba la transaccion entera. Solo afectan a objetos FUTUROS creados por esos
# roles: la aplicacion no las necesita.

# Lista blanca de objetos del Radar. El volcado trae tambien los 450 GRANT que
# pgvector pone sobre sus propias funciones (halfvec_in, vector_out,
# array_to_vector...): sobran, porque CREATE EXTENSION ya los pone, y encima
# referencian tipos que solo existen despues de crearla.
PROPIOS = None   # se rellena leyendo lo que crea el propio esquema

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

# ── se descubren los objetos propios a partir de lo que crea el DDL ──
import itertools
texto_pre = ''.join(itertools.chain.from_iterable(
    bloques.get(g, []) for g in PRE))
PROPIOS = set(re.findall(
    r'^CREATE (?:TABLE|VIEW|SEQUENCE|FUNCTION) public\.([a-z_]+)', texto_pre, re.M))
PROPIOS |= set(re.findall(r"setval\('public\.([a-z_]+)'", ''.join(bloques.get('SEQUENCE SET', []))))
print('objetos propios del Radar: %d' % len(PROPIOS))

def es_propio(linea):
    """True si la linea de permisos habla de un objeto del Radar."""
    refs = re.findall(r'public\.([a-z_0-9]+)', linea)
    return any(r in PROPIOS for r in refs)

fuera = 0
if 'ACL' in bloques:
    # Se agrupa cada cabecera con sus sentencias y se tira el grupo entero si
    # no queda ninguna: si no, quedan docenas de comentarios huerfanos
    # («-- FUNCTION vector_out(...)») sin nada debajo.
    grupos_acl = []
    for l in bloques['ACL']:
        if l.startswith('\n-- ') or (l.startswith('-- ') and not grupos_acl):
            grupos_acl.append([l, []])
        elif grupos_acl:
            grupos_acl[-1][1].append(l)
    filtrado = []
    for cab, cuerpo in grupos_acl:
        queda = []
        for l in cuerpo:
            if l.startswith(('GRANT', 'REVOKE', 'ALTER DEFAULT')):
                if es_propio(l): queda.append(l)
                else: fuera += 1
            else:
                queda.append(l)
        if any(x.startswith(('GRANT', 'REVOKE')) for x in queda):
            filtrado.append(cab); filtrado.extend(queda)
    bloques['ACL'] = filtrado
    print('permisos descartados (de pgvector, no del Radar): %d' % fuera)

def reejecutable(texto):
    """Hace 03 re-ejecutable.

    El SQL Editor de Supabase corre el fichero en una transaccion, asi que un
    fallo lo deshace entero y reintentar es seguro. Pero si por lo que sea no
    lo deshace, el segundo intento muere con «already exists» en el primer
    indice. Con esto se puede reintentar siempre, que es lo que de verdad pasa
    cuando alguien esta pegando SQL en un navegador.
    """
    texto = re.sub(r'^CREATE INDEX (?!IF NOT EXISTS)', 'CREATE INDEX IF NOT EXISTS ',
                   texto, flags=re.M)
    texto = re.sub(r'^CREATE UNIQUE INDEX (?!IF NOT EXISTS)',
                   'CREATE UNIQUE INDEX IF NOT EXISTS ', texto, flags=re.M)
    # Los constraints NO se borran para volver a crearlos: document_metadata_pkey
    # tiene colgando la FK document_rows_dataset_id_fkey, y el DROP solo pasa con
    # CASCADE — que se llevaria la FK por delante en silencio. Se envuelve cada
    # uno para que ignore el duplicado y no toque lo que ya esta bien.
    texto = re.sub(
        r'^(ALTER TABLE ONLY \S+\n\s+ADD CONSTRAINT .*?;)$',
        # los tres codigos con los que Postgres rechaza un constraint ya puesto:
        # 42710 duplicate_object (mismo nombre), 42P07 duplicate_table (el indice
        # ya existe) y 42P16 invalid_table_definition («multiple primary keys»)
        lambda m: 'do $$ begin\n%s\nexception\n'
                  '  when duplicate_object or duplicate_table\n'
                  '    or invalid_table_definition then null;\nend $$;' % m.group(1),
        texto, flags=re.M | re.S)
    texto = re.sub(
        r'^CREATE TRIGGER (\S+) (.*?) ON (\S+?) ',
        lambda m: 'DROP TRIGGER IF EXISTS %s ON %s;\nCREATE TRIGGER %s %s ON %s '
                  % (m.group(1), m.group(3), m.group(1), m.group(2), m.group(3)),
        texto, flags=re.M)
    return texto

for nombre, grupos in (('01-esquema-pre.sql', PRE), ('03-esquema-post.sql', POST)):
    with open(nombre, 'w') as fh:
        if nombre.startswith('01'): fh.write(CABECERA)
        else: fh.write('-- Indices, constraints, triggers, RLS y permisos.\n'
                       '-- Va DESPUES de cargar los datos, y se puede reejecutar.\n'
                       'set statement_timeout = 0;\n'
                       'set client_min_messages = warning;\n')
        cuerpo = ''
        for g in grupos:
            if g not in bloques: continue
            cuerpo += '\n\n-- ═══════════ %s ═══════════\n' % g
            cuerpo += ''.join(bloques[g])
        fh.write(reejecutable(cuerpo) if nombre.startswith('03') else cuerpo)
    print('%-24s %7.1f KB' % (nombre, os.path.getsize(nombre)/1024))

for t in sorted(bloques): print('  %-22s %d lineas' % (t, len(bloques[t])))

"""Parte el volcado de cluster en piezas por (esquema, tipo).

El volcado es pg_dumpall en SQL plano: cada objeto va precedido de una
cabecera de tres lineas  --\n-- Name: X; Type: T; Schema: S; Owner: O\n--
Se recorre una sola vez (1,1 GB) y se escribe un indice de todos los
objetos mas los bloques COPY que interesan.
"""
import gzip, os, re, sys, json

SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

CAB = re.compile(r'^-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner: ?(.*)$')

# que se guarda entero, en orden de aparicion
GUARDAR_DDL = {'public'}
# datos: solo estas tablas (el resto se cuenta pero no se escribe)
GUARDAR_DATOS = {
    'public.remates', 'public.radar_zonas_monitoreadas', 'public.radar_cron_jobs',
    'public.radar_parametros_gastos', 'public.radar_payments',
    'public.radar_sesiones_scraper', 'public.precios_mercado',
    'public.oportunidades_historial', 'public.scraping_logs',
    'public.documents', 'public.document_metadata', 'public.document_rows',
    'public.memories', 'public.n8n_chat_histories',
    'auth.users', 'auth.identities',
}

indice = []           # todos los objetos vistos
ddl = open(os.path.join(OUT, 'public-ddl.sql'), 'w')
datos_abiertos = {}   # tabla -> fichero
conteos = {}

nombre = tipo = esquema = None
en_copy = None        # tabla cuyo COPY estamos leyendo
destino = None        # 'ddl' | nombre de tabla de datos | None
buf_cab = []

with gzip.open(SRC, 'rt', encoding='utf-8', errors='replace') as f:
    for linea in f:
        if en_copy is not None:
            if linea.startswith('\\.'):
                if destino: datos_abiertos[en_copy].write(linea)
                en_copy = None; destino = None
                continue
            conteos[en_copy] = conteos.get(en_copy, 0) + 1
            if destino: datos_abiertos[en_copy].write(linea)
            continue

        m = CAB.match(linea.rstrip('\n'))
        if m:
            nombre, tipo, esquema, _ = m.groups()
            indice.append({'n': nombre, 't': tipo, 's': esquema})
            # el DDL de public se guarda; el resto no
            destino = 'ddl' if (esquema in GUARDAR_DDL and tipo != 'TABLE DATA') else None
            if destino == 'ddl':
                ddl.write('\n--\n-- %s · %s\n--\n' % (tipo, nombre))
            continue

        if linea.startswith('COPY '):
            mt = re.match(r'COPY ([a-z_0-9]+)\.("?[a-zA-Z_0-9]+"?)', linea)
            if mt:
                tabla = '%s.%s' % (mt.group(1), mt.group(2).strip('"'))
                en_copy = tabla
                conteos.setdefault(tabla, 0)
                if tabla in GUARDAR_DATOS:
                    destino = tabla
                    if tabla not in datos_abiertos:
                        datos_abiertos[tabla] = open(
                            os.path.join(OUT, 'datos-%s.sql' % tabla.replace('.', '-')), 'w')
                    datos_abiertos[tabla].write(linea)
                else:
                    destino = None
                continue
            en_copy = '?'; destino = None
            continue

        if destino == 'ddl':
            ddl.write(linea)

ddl.close()
for fh in datos_abiertos.values(): fh.close()

with open(os.path.join(OUT, 'indice.json'), 'w') as fh:
    json.dump({'objetos': indice, 'filas': conteos}, fh, ensure_ascii=False)

print('objetos: %d' % len(indice))
print('DDL public: %.1f KB' % (os.path.getsize(os.path.join(OUT, 'public-ddl.sql'))/1024))
for t in sorted(conteos):
    marca = '  GUARDADO' if t in datos_abiertos else ''
    print('%-42s %9d filas%s' % (t, conteos[t], marca))

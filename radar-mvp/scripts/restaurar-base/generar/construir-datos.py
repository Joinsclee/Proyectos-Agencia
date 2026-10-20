"""Genera los ficheros de datos de public a partir del volcado.

Tres decisiones, cada una medida:

1. ARRIENDOS: features se recorta a las 6 claves que lee el motor. No es una
   perdida: es exactamente lo que `soloLoQueUsaElArriendo()` en lib/supabase.ts
   ya guarda hoy. Pasa de 336 MB a ~4 MB y entran las 101.108 filas enteras.

2. INMUEBLES: features.images se recorta a 6 de las 20 que guarda el scraper.
   La galeria de la ficha sigue siendo una galeria, la portada (image_url) no se
   toca, y el proximo pase del scraper repone las 20. `description` y
   `amenities` se dejan intactas porque la ficha las pinta.

3. INMUEBLES: muestra con tope de 60 por (ciudad, zona), pero entran SIEMPRE
   los de banco, los is_high y las oportunidades. Se escribe por lotes de
   prioridad para que el cargador pare cuando la base llegue al limite, en vez
   de adivinar yo cuanto comprime Postgres.

price_history (194.578 filas, 27 MB) no se restaura: es historico derivado y
se vuelve a construir solo con los scrapers.
"""
import gzip, re, sys, os, json, collections

SRC = sys.argv[1]
CAP_ZONA = 60
CLAVES_ARRIENDO = ('lat', 'lng', 'bedrooms', 'garages', 'neighborhood', 'is_project')
FOTOS = 6
LOTE = 20000

CHICAS = ['public.remates', 'public.radar_zonas_monitoreadas', 'public.radar_cron_jobs',
          'public.radar_parametros_gastos', 'public.radar_sesiones_scraper',
          'public.scraping_logs', 'public.documents', 'public.document_metadata',
          'public.document_rows', 'public.memories', 'public.n8n_chat_histories',
          'public.oportunidades_historial', 'public.precios_mercado', 'public.radar_payments']

def desescapar(s):
    if '\\' not in s: return s
    out = []; i = 0
    while i < len(s):
        if s[i] == '\\' and i + 1 < len(s):
            c = s[i+1]
            out.append({'n':'\n','t':'\t','r':'\r','\\':'\\','b':'\b','f':'\f','v':'\v'}.get(c, '\\'+c))
            i += 2
        else:
            out.append(s[i]); i += 1
    return ''.join(out)

def escapar(s):
    return (s.replace('\\', '\\\\').replace('\n', '\\n')
             .replace('\t', '\\t').replace('\r', '\\r'))

def recortar(cruda, modo):
    """Recorta el jsonb de features. Devuelve el campo TSV ya escapado."""
    if cruda == '\\N' or not cruda: return cruda
    try:
        d = json.loads(desescapar(cruda))
    except Exception:
        return cruda                       # si no parsea, se deja tal cual
    if not isinstance(d, dict): return cruda
    if modo == 'arriendo':
        d = {k: v for k, v in d.items() if k in CLAVES_ARRIENDO and v is not None}
    else:
        if isinstance(d.get('images'), list) and len(d['images']) > FOTOS:
            d['images'] = d['images'][:FOTOS]
            d['image_count'] = len(d['images'])
    return escapar(json.dumps(d, ensure_ascii=False, separators=(',', ':')))

# ─────────── pasada 1: contar por zona y marcar los que entran siempre ───────────
sys.stderr.write('pasada 1/2: contando zonas...\n')
zona_tot = collections.Counter()
en = None; cols = None
with gzip.open(SRC, 'rt', encoding='utf-8', errors='replace') as f:
    for l in f:
        if en == 'si':
            if l.startswith('\\.'): en = None; continue
            c = l.rstrip('\n').split('\t')
            if len(c) < len(cols): continue
            zona_tot[(c[cols.index('city')], c[cols.index('zone')])] += 1
            continue
        if en == 'no':
            if l.startswith('\\.'): en = None
            continue
        if l.startswith('COPY '):
            m = re.match(r'COPY ([a-z_0-9]+\.[a-zA-Z_0-9"]+) \((.*?)\)', l)
            if m and m.group(1) == 'public.inmuebles':
                en = 'si'; cols = [x.strip() for x in m.group(2).split(',')]
            elif m: en = 'no'

# ─────────── pasada 2: escribir ───────────
sys.stderr.write('pasada 2/2: escribiendo...\n')
CAB_INM = 'copy public.inmuebles (%s) from stdin;\n'
usado = collections.Counter()
nucleo = []          # banco + is_high + oportunidad
relleno = []         # el resto, hasta el tope por zona
stats = collections.Counter()

fh_arr = open('02-datos-arriendos.sql', 'w')
fh_arr.write("""-- rental_listings: las 101.108 filas, con features recortado a las 6 claves
-- que lee engine/rental-comparables.ts. Es el mismo recorte que ya aplica
-- soloLoQueUsaElArriendo() al escribir, asi que no se pierde nada que el
-- codigo llegue a leer. 336 MB de JSON -> ~4 MB.
set statement_timeout = 0;
set client_min_messages = warning;
""")
fh_chi = open('02-datos-publicas-chicas.sql', 'w')
fh_chi.write('-- Remates, zonas monitoreadas, cron, documentos y configuracion.\n'
             '-- Van enteras: pesan poco y la configuracion no se regenera sola.\n'
             'set statement_timeout = 0;\nset client_min_messages = warning;\n')

en = None; cols = None; tabla = None
with gzip.open(SRC, 'rt', encoding='utf-8', errors='replace') as f:
    for l in f:
        if en:
            if l.startswith('\\.'):
                if en in ('arriendo', 'chica'):
                    (fh_arr if en == 'arriendo' else fh_chi).write('\\.\n')
                en = None; continue
            if en == 'salta': continue
            c = l.rstrip('\n').split('\t')
            if en == 'chica':
                fh_chi.write(l); stats[tabla] += 1; continue
            if len(c) < len(cols): continue
            if en == 'arriendo':
                i = cols.index('features')
                c[i] = recortar(c[i], 'arriendo')
                fh_arr.write('\t'.join(c) + '\n'); stats['arriendos'] += 1; continue
            # inmuebles
            i = cols.index('features')
            c[i] = recortar(c[i], 'inmueble')
            fila = '\t'.join(c) + '\n'
            g = lambda k: c[cols.index(k)]
            siempre = (g('source') != 'fincaraiz' or g('is_high') == 't'
                       or g('is_opportunity') == 't')
            k = (g('city'), g('zone'))
            if siempre:
                nucleo.append(fila); usado[k] += 1; stats['nucleo'] += 1
            elif usado[k] < CAP_ZONA:
                relleno.append((zona_tot[k], fila)); usado[k] += 1; stats['relleno'] += 1
            else:
                stats['fuera'] += 1
            continue
        if l.startswith('COPY '):
            m = re.match(r'COPY ([a-z_0-9]+\.[a-zA-Z_0-9"]+) \((.*?)\)', l)
            if not m: en = 'salta'; continue
            tabla = m.group(1).replace('"', '')
            cols = [x.strip() for x in m.group(2).split(',')]
            if tabla == 'public.inmuebles': en = 'inmueble'; cols_inm = list(cols)
            elif tabla == 'public.rental_listings':
                en = 'arriendo'
                fh_arr.write('\ncopy public.rental_listings (%s) from stdin;\n' % ', '.join(cols))
            elif tabla in CHICAS:
                en = 'chica'
                fh_chi.write('\ncopy %s (%s) from stdin;\n' % (tabla, ', '.join(cols)))
            else: en = 'salta'

fh_arr.close(); fh_chi.close()

# zonas grandes primero: son las que dan comparables a mas fichas
relleno.sort(key=lambda t: -t[0])
cab = CAB_INM % ', '.join(cols_inm)
lotes = [nucleo] + [[f for _, f in relleno[i:i+LOTE]] for i in range(0, len(relleno), LOTE)]
for n, lote in enumerate(lotes):
    nom = '04-inmuebles-%02d.sql' % n
    with open(nom, 'w') as fh:
        fh.write('-- Lote %d de %d%s\nset statement_timeout = 0;\n'
                 'set client_min_messages = warning;\n'
                 % (n, len(lotes)-1,
                    ' · NUCLEO: banco + is_high + oportunidades (imprescindible)' if n == 0
                    else ' · relleno para comparables'))
        fh.write(cab); fh.writelines(lote); fh.write('\\.\n')
    print('%-24s %7d filas %8.1f MB' % (nom, len(lote), os.path.getsize(nom)/1e6))

print('\narriendos  %7d filas %8.1f MB' % (stats['arriendos'], os.path.getsize('02-datos-arriendos.sql')/1e6))
print('chicas     %7d filas %8.1f MB' % (sum(v for k,v in stats.items() if k.startswith('public.')),
                                         os.path.getsize('02-datos-publicas-chicas.sql')/1e6))
for k in sorted(k for k in stats if k.startswith('public.')): print('    %-36s %7d' % (k, stats[k]))
print('\ninmuebles: nucleo %d · relleno %d · descartados %d (de %d)' %
      (stats['nucleo'], stats['relleno'], stats['fuera'],
       stats['nucleo']+stats['relleno']+stats['fuera']))

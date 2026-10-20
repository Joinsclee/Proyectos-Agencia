"""Mide el peso de cada columna en las tablas grandes y la reparticion por ciudad."""
import gzip, re, sys, collections

SRC = sys.argv[1]
OBJETIVO = {'public.inmuebles', 'public.rental_listings'}

cols = {}
peso = {t: collections.Counter() for t in OBJETIVO}
ciudad = {t: collections.Counter() for t in OBJETIVO}
bytes_ciudad = {t: collections.Counter() for t in OBJETIVO}
total = {t: 0 for t in OBJETIVO}

en = None
with gzip.open(SRC, 'rt', encoding='utf-8', errors='replace') as f:
    for linea in f:
        if en:
            if linea.startswith('\\.'):
                en = None; continue
            campos = linea.rstrip('\n').split('\t')
            c = cols[en]
            total[en] += len(linea)
            for i, v in enumerate(campos):
                if i < len(c): peso[en][c[i]] += len(v)
            try:
                cd = campos[c.index('city')]
                ciudad[en][cd] += 1
                bytes_ciudad[en][cd] += len(linea)
            except (ValueError, IndexError): pass
            continue
        if linea.startswith('COPY '):
            m = re.match(r'COPY ([a-z_]+\.[a-zA-Z_"]+) \((.*?)\)', linea)
            t = m.group(1).replace('"','') if m else None
            if t in OBJETIVO:
                en = t
                cols[t] = [x.strip() for x in m.group(2).split(',')]
            else:
                en = '?' if m else None
                if en == '?':
                    cols['?'] = []; peso['?'] = collections.Counter()
                    ciudad['?'] = collections.Counter(); bytes_ciudad['?'] = collections.Counter()
                    total['?'] = 0

for t in OBJETIVO:
    print('\n═══ %s · %.1f MB en total ═══' % (t, total[t]/1e6))
    for col, b in peso[t].most_common(8):
        print('  %-26s %8.1f MB  %5.1f%%' % (col, b/1e6, 100*b/total[t]))
    print('  ciudades: %d' % len(ciudad[t]))
    print('  top 12 por filas:')
    for cd, n in ciudad[t].most_common(12):
        print('    %-24s %7d filas  %7.1f MB' % (cd[:24], n, bytes_ciudad[t][cd]/1e6))

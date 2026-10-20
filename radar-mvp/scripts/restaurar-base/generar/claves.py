"""Mide el peso de cada clave DENTRO del jsonb features."""
import gzip, re, sys, json, collections

SRC = sys.argv[1]
OBJETIVO = {'public.inmuebles', 'public.rental_listings'}
peso = {t: collections.Counter() for t in OBJETIVO}
presente = {t: collections.Counter() for t in OBJETIVO}
filas = {t: 0 for t in OBJETIVO}
total = {t: 0 for t in OBJETIVO}

en = None; idx = None
with gzip.open(SRC, 'rt', encoding='utf-8', errors='replace') as f:
    for linea in f:
        if en:
            if linea.startswith('\\.'):
                en = None; continue
            if en == '?': continue
            campos = linea.rstrip('\n').split('\t')
            if idx is None or idx >= len(campos): continue
            cruda = campos[idx]
            filas[en] += 1; total[en] += len(cruda)
            try:
                d = json.loads(cruda.replace('\\\\', '\\'))
            except Exception:
                continue
            if not isinstance(d, dict): continue
            for k, v in d.items():
                peso[en][k] += len(json.dumps(v, ensure_ascii=False))
                presente[en][k] += 1
            continue
        if linea.startswith('COPY '):
            m = re.match(r'COPY ([a-z_]+\.[a-zA-Z_"]+) \((.*?)\)', linea)
            t = m.group(1).replace('"','') if m else None
            if t in OBJETIVO:
                en = t
                cl = [x.strip() for x in m.group(2).split(',')]
                idx = cl.index('features') if 'features' in cl else None
            else:
                en = '?' if m else None

for t in OBJETIVO:
    print('\n═══ %s.features · %.1f MB en %d filas ═══' % (t, total[t]/1e6, filas[t]))
    for k, b in peso[t].most_common(25):
        print('  %-20s %8.1f MB  %5.1f%%   en %6.1f%% de las filas' %
              (k, b/1e6, 100*b/max(total[t],1), 100*presente[t][k]/max(filas[t],1)))

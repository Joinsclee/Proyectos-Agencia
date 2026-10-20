"""Mismo calculo de comparables sobre el volcado COMPLETO, para saber si la
muestra degrada los comparables o si ya estaban asi con las 183.008 filas."""
import gzip, re, sys, collections

SRC = sys.argv[1]
en=None; cols=None
portal = collections.defaultdict(list)   # (city,zone) -> [area]
bancos = []                              # (city, zone, area)
with gzip.open(SRC,'rt',encoding='utf-8',errors='replace') as f:
    for l in f:
        if en=='si':
            if l.startswith('\\.'): en=None; continue
            c=l.rstrip('\n').split('\t')
            if len(c)<len(cols): continue
            g=lambda k: c[cols.index(k)]
            if g('is_active')!='t': continue
            try: area=float(g('area_m2'))
            except ValueError: area=None
            k=(g('city'), g('zone'))
            if g('source')=='fincaraiz':
                if area: portal[k].append(area)
            elif area: bancos.append((k, area))
            continue
        if en=='no':
            if l.startswith('\\.'): en=None
            continue
        if l.startswith('COPY '):
            m=re.match(r'COPY ([a-z_0-9]+\.[a-zA-Z_0-9"]+) \((.*?)\)', l)
            if m and m.group(1)=='public.inmuebles':
                en='si'; cols=[x.strip() for x in m.group(2).split(',')]
            elif m: en='no'

cubos=collections.Counter()
for k, area in bancos:
    lo, hi = area*0.7, area*1.3
    n = sum(1 for a in portal.get(k, ()) if lo <= a <= hi)
    cubos['20 o mas' if n>=20 else ('5 a 19' if n>=5 else 'menos de 5')] += 1

print('VOLCADO COMPLETO (183.008 filas) · %d fichas de banco con area' % len(bancos))
for k in ('20 o mas','5 a 19','menos de 5'):
    print('  %-12s %5d' % (k, cubos[k]))
print('\nLa muestra (105.847 filas) daba: 20 o mas=29 · 5 a 19=20 · menos de 5=541')

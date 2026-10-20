import gzip, re, sys, collections
SRC=sys.argv[1]; en=None; cols=None
z=collections.Counter()
with gzip.open(SRC,'rt',encoding='utf-8',errors='replace') as f:
    for l in f:
        if en=='si':
            if l.startswith('\\.'): en=None; continue
            c=l.rstrip('\n').split('\t')
            if len(c)<len(cols): continue
            z[(c[cols.index('city')], c[cols.index('zone')])]+=1
            continue
        if en=='no':
            if l.startswith('\\.'): en=None
            continue
        if l.startswith('COPY '):
            m=re.match(r'COPY ([a-z_]+\.[a-zA-Z_"]+) \((.*?)\)', l)
            if m and m.group(1)=='public.inmuebles':
                en='si'; cols=[x.strip() for x in m.group(2).split(',')]
            elif m: en='no'
print('pares (ciudad, zona): %d' % len(z))
for cap in (40,60,80,120,200):
    print('  con tope %3d por zona  ->  %7d filas' % (cap, sum(min(n,cap) for n in z.values())))
print('\nzonas con >= 20 avisos (las que pueden dar comparables): %d de %d' %
      (sum(1 for n in z.values() if n>=20), len(z)))
print('\ntop 8 zonas:')
for (cd,zn),n in z.most_common(8): print('  %-22s %-26s %6d' % (cd[:22], str(zn)[:26], n))

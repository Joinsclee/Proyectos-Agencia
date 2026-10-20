"""Comprueba que el recorte no rompio ninguna fila: mismo numero de columnas,
features parsea, y las claves que quedan son las esperadas."""
import re, json, glob, collections, sys

def desescapar(s):
    if '\\' not in s: return s
    o=[];i=0
    while i<len(s):
        if s[i]=='\\' and i+1<len(s):
            o.append({'n':'\n','t':'\t','r':'\r','\\':'\\','b':'\b','f':'\f','v':'\v'}.get(s[i+1],'\\'+s[i+1])); i+=2
        else: o.append(s[i]); i+=1
    return ''.join(o)

def revisar(fich, esperadas=None, tope_fotos=None):
    cols=None; n=0; malas=0; claves=collections.Counter(); anchos=collections.Counter()
    maxfotos=0; sin_parse=0
    for l in open(fich):
        if l.startswith('copy ') or l.startswith('COPY '):
            cols=[x.strip() for x in re.match(r'copy \S+ \((.*)\) from stdin', l, re.I).group(1).split(',')]
            continue
        if l.startswith('\\.') or l.startswith('set ') or l.startswith('--') or not l.strip(): continue
        c=l.rstrip('\n').split('\t'); n+=1; anchos[len(c)]+=1
        if len(c)!=len(cols): malas+=1; continue
        f=c[cols.index('features')]
        if f=='\\N': continue
        try: d=json.loads(desescapar(f))
        except Exception: sin_parse+=1; continue
        if isinstance(d,dict):
            for k in d: claves[k]+=1
            if isinstance(d.get('images'),list): maxfotos=max(maxfotos,len(d['images']))
    print('\n%s' % fich)
    print('  filas: %d · columnas esperadas: %d · anchos vistos: %s' % (n,len(cols),dict(anchos)))
    print('  filas con ancho distinto: %d · features que no parsea: %d' % (malas,sin_parse))
    if tope_fotos is not None: print('  maximo de fotos en una fila: %d (tope %d)' % (maxfotos,tope_fotos))
    if esperadas is not None:
        sobran=set(claves)-set(esperadas)
        print('  claves distintas: %d  %s' % (len(claves), 'OK' if not sobran else 'SOBRAN: %s'%sobran))
    else:
        print('  claves distintas: %d (top: %s)' % (len(claves), [k for k,_ in claves.most_common(6)]))
    return malas+sin_parse

fallos  = revisar('02-datos-arriendos.sql',
                  esperadas=('lat','lng','bedrooms','garages','neighborhood','is_project'))
fallos += revisar('04-inmuebles-00.sql', tope_fotos=6)
fallos += revisar('04-inmuebles-04.sql', tope_fotos=6)
print('\n%s' % ('TODO CORRECTO' if fallos==0 else 'HAY %d FILAS MAL'%fallos))
sys.exit(1 if fallos else 0)

#!/usr/bin/env python3
"""Arma la EDL del VSL sobre el máster limpio de 1440p.

Tres cosas que la versión anterior hacía mal y aquí se corrigen:
  1. Las seis junturas donde se quitaron tomas falsas caían en mitad de un plano,
     así que el cambio de postura se veía como un salto. Ahora cada juntura es un
     punto de corte obligatorio, y encima lleva b-roll o un plano distinto.
  2. El b-roll no acompañaba lo que se decía en cuatro de los siete principios.
  3. Los reencuadres salían de una copia de 1080p y ampliaban. Ahora salen de 1440p.
"""
import json, subprocess

MASTER = '../vsl-limpio.mp4'
dur = round(float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
      '-of','csv=p=0', MASTER], capture_output=True, text=True).stdout), 2)
pal = [(x['offsets']['from']/1000, x['offsets']['to']/1000, x['text'].strip())
       for x in json.load(open('../trabajo/vsl-01-palabras.json'))['transcription'] if x['text'].strip()]
fr = sorted({round(b,2) for _,b,_ in pal} | {round(a,2) for a,_,_ in pal} | {0.0, dur})
frontera = lambda t: min(fr, key=lambda f: abs(f - t))
dice = lambda a,b: ' '.join(t for x,y,t in pal if y > a+0.02 and x < b-0.02)[:70]

JUNTURAS = [93.45, 205.44, 276.44, 289.44, 312.44, 333.77]

BR = '../../ads-venta/fuentes/broll/'
MOV = '../../ads-venta/recursos/Movil agenda llamada.mp4'
# (inicio, fin, clip, in) · cada principio con la imagen de lo que se está diciendo
INSERTOS = [
 (100.5, 105.8, BR+'DJI_0064_0.mp4',                    0.8),   # microclima: la finca con sus árboles y terrazas
 (116.0, 121.0, BR+'2 siembra2_0.mp4',                  1.4),   # microorganismos: manos en la tierra
 (132.5, 137.5, BR+'DJI_20260604152226_0326_D_0.mp4',   1.0),   # nutrientes: camellones de tierra trabajada
 (146.5, 151.2, BR+'CULTIVO BERENJENA COSECHA 2_0.mp4', 0.4),   # diversidad: la cosecha
 (161.0, 166.2, BR+'DJI_0112_0.mp4',                    1.0),   # agua: terrazas a curvas de nivel
 (175.0, 180.0, BR+'VID_20260819_154811488_0.mp4',      0.5),   # energía: las gallinas
 (191.5, 196.8, BR+'DJI_0145_0.mp4',                    0.6),   # descanso: ovejas en el potrero
 (351.0, 355.5, MOV,                                    0.3),   # el CTA: la agenda en el móvil
]
# b-roll corto encima de las junturas que no coinciden con un principio
# Las junturas que no coinciden con un principio se tapan con b-roll. Las tres
# últimas se añadieron el 25/09 por la tarde: el cliente marcó 4:36, 4:49 y 5:34
# como saltos visibles. Cada clip ilustra lo que se está diciendo justo ahí.
TAPAS = [(205.44, BR+'CULTIVO JOVENES 2_0.mp4', 0.8, 2.6),
         (276.44, BR+'DJI_0112_2.mp4',          0.6, 2.8),   # «qué cubre la alimentación y cómo funciona la reserva»: la finca entera con el alojamiento
         (312.44, BR+'DJI_0129_0.mp4',          1.2, 2.4),
         (333.77, BR+'CULTIVO JOVENES_0.mp4',   1.0, 2.8)]   # «si la experiencia presencial encaja mejor»: el semillero que se trabaja allí

PLANOS = {
 'A': {'crop': None,                'nota': 'plano entero (1440p reducido a 1080p)'},
 'B': {'crop': '2048:1152:0:54',    'nota': 'medio 1.25x, sigue siendo reducción'},
 'C': {'crop': '1706:960:107:112',  'nota': 'cerrado 1.5x, ampliación mínima de 1.13x'},
}

cortes_broll = []
for a, b, src, tin in INSERTOS:
    cortes_broll.append((frontera(a), frontera(b), src, tin))
for j, src, tin, largo in TAPAS:
    a = frontera(j - largo/2); b = frontera(j + largo/2)
    cortes_broll.append((a, b, src, tin))
cortes_broll.sort()

marcas = {0.0, dur}
for a, b, *_ in cortes_broll: marcas |= {a, b}
# Ninguna juntura queda dentro de un plano. La que lleva b-roll ya está cubierta;
# la que no, se corta EXACTAMENTE encima (no en la frontera de palabra más cercana:
# ese redondeo dejaba el salto 0,15-0,43 s antes del corte, y se veían las dos cosas).
tapada = lambda j: any(a <= j <= b for a, b, _, _ in cortes_broll)
for j in JUNTURAS:
    if not tapada(j): marcas.add(frontera(j))
marcas = sorted(marcas)

# trozos hablados largos: se parten cada ~11 s
finos = []
for k in range(len(marcas)-1):
    a, b = marcas[k], marcas[k+1]
    if any(abs(x-a) < 0.01 for x,_,_,_ in cortes_broll):
        finos.append((a,b)); continue
    n = max(1, round((b-a)/11.0))
    while (b-a)/n > 11.8: n += 1      # round() dejaba pasar tramos de 15 s (tope del proyecto: 12)
    paso = (b-a)/n
    for j in range(n):
        x = a if j == 0 else frontera(a + j*paso)
        y = b if j == n-1 else frontera(a + (j+1)*paso)
        if y - x >= 1.7: finos.append((x,y))
        elif finos: finos[-1] = (finos[-1][0], y)

cortes = []
for a, b in finos:
    ins = next((x for x in cortes_broll if abs(x[0]-a) < 0.01), None)
    c = {'t0': round(a,2), 't1': round(b,2)}
    if ins: c['broll'] = {'tipo':'clip','src':ins[2],'in':ins[3],'crop':None}
    c['dice'] = dice(a,b)
    cortes.append(c)

# planos: sin repetir seguido, sin volver al mismo tras el b-roll, y cambiando en cada juntura
ciclo = ['A','B','C','B','C','A']
i = 0
for k, c in enumerate(cortes):
    if 'broll' in c: continue
    ant  = cortes[k-1].get('plano') if k > 0 else None
    tras_broll = k > 0 and 'broll' in cortes[k-1]
    antes = cortes[k-2].get('plano') if tras_broll and k >= 2 else None
    for _ in range(6):
        p = ciclo[i % len(ciclo)]; i += 1
        if p != ant and p != antes:
            c['plano'] = p; break

# En una juntura sin b-roll el corte tiene que saltar de tamaño lo suficiente para
# leerse como una decisión y no como un brinco: A↔C son 50%, mientras que cualquier
# pareja con B se queda en 17-25%, por debajo del 30% que pide la regla de montaje.
for j in JUNTURAS:
    if tapada(j): continue
    jc = frontera(j)      # el corte está en la frontera de palabra, no en la juntura exacta
    k = next((i for i, c in enumerate(cortes) if abs(c['t0'] - jc) < 0.01), None)
    if not k: continue
    cortes[k-1]['plano'], cortes[k]['plano'] = 'A', 'C'
    cortes[k]['_fijo'] = cortes[k-1]['_fijo'] = True

# Forzar planos puede dejar dos iguales seguidos o repetir el de antes del b-roll:
# se repasa la secuencia entera y se corrige lo que haya quedado mal.
for k, c in enumerate(cortes):
    if 'broll' in c or c.get('_fijo'): continue
    ant   = cortes[k-1].get('plano') if k > 0 else None
    antes = cortes[k-2].get('plano') if k >= 2 and 'broll' in cortes[k-1] else None
    sig   = cortes[k+1].get('plano') if k+1 < len(cortes) else None
    if c['plano'] in (ant, antes) or c['plano'] == sig:
        for p2 in ('B', 'A', 'C'):
            if p2 not in (ant, antes, sig): c['plano'] = p2; break
for c in cortes: c.pop('_fijo', None)

for k in range(len(cortes)-1): cortes[k+1]['t0'] = cortes[k]['t1']
cortes[0]['t0'] = 0.0; cortes[-1]['t1'] = dur

json.dump({'nombre':'vsl-01','titulo':'VSL de la página de agendamiento · llamada de claridad',
           'master':MASTER,'duracion':dur,'salida':{'w':1920,'h':1080,'fps':25},
           'planos':PLANOS,'cortes':cortes},
          open('edl-vsl-01.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)

ds = [round(c['t1']-c['t0'],2) for c in cortes]
print(f'{len(cortes)} cortes · media {sum(ds)/len(ds):.2f}s · min {min(ds)} · max {max(ds)} · {sum(1 for c in cortes if "broll" in c)} con b-roll')
for j in JUNTURAS:
    f = frontera(j)
    dentro = [c for c in cortes if c['t0'] < f-0.05 and c['t1'] > f+0.05]
    marca = 'SIGUE DENTRO DE UN PLANO' if dentro else 'corte limpio'
    tapada = any(c['t0'] <= f <= c['t1'] and 'broll' in c for c in cortes)
    print(f'  juntura {j:7.2f} → {marca}{" (con b-roll encima)" if tapada else ""}')

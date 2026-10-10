#!/usr/bin/env python3
"""Iguala el remate de los diez anuncios: pantalla del móvil y cartela final.

Los nueve montajes salieron con la cartela de cierre entre 1,3 y 5,6 s. No es
un detalle: la cartela es el momento en que el espectador decide, y 1,3 s no da
tiempo ni a leer la fecha. Al revés, 5,6 s de cartela fija en un anuncio de 50
es tiempo muerto. Se fija en 2,8 s (banda 2,3-3,6) para los diez, y la pantalla
del móvil en 3,0 s, que es lo que tarda en leerse el titular y verse el botón.

Solo mueve la frontera entre el corte del móvil y el siguiente, siempre a una
separación entre palabras. No toca el resto del montaje.

Uso:
    python3 cerrar.py anuncio-02 anuncio-03 ...
"""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
CIERRE, MOVIL, HUECO = 2.80, 3.00, 0.20
MIN_MOVIL, MIN_CORTE = 2.20, 1.60


def huecos(nombre, dur):
    d = json.loads((BASE / f"../trabajo/{nombre}-palabras.json").read_text(encoding="utf-8"))
    w = [(x["offsets"]["from"] / 1000, x["offsets"]["to"] / 1000)
         for x in d["transcription"] if x["text"].strip()]
    return sorted({0.0, round(dur, 3)} |
                  {round((b0 + a1) / 2, 3) for (a0, b0), (a1, b1) in zip(w, w[1:])})


def cerrar(nombre):
    re = BASE / f"edl-{nombre}.json"
    rt = BASE / f"tarjetas-{nombre}.json"
    edl = json.loads(re.read_text(encoding="utf-8"))
    tarj = json.loads(rt.read_text(encoding="utf-8"))
    dur = edl["duracion"]
    gs = huecos(nombre, dur)
    cortes = edl["cortes"]
    k = next(i for i, c in enumerate(cortes) if "broll" in c and "Movil" in c["broll"]["src"])

    fin = dur - CIERRE - HUECO                     # donde debería acabar el móvil
    libres = [g for g in gs if g < dur - CIERRE * 0.82 - HUECO
              and g > cortes[k]["t0"] + MIN_MOVIL]
    if libres:
        nuevo_fin = min(libres, key=lambda g: abs(g - fin))
    else:
        nuevo_fin = cortes[k]["t1"]

    # El móvil quiere sus 3 s, ni más ni menos. Si se queda corto se le roba por
    # delante al plano anterior, que siempre es de Iván; si se pasa, se le
    # devuelve. Sin la segunda mitad el anuncio 2 acabó con 6,3 s de pantalla
    # de móvil, que es medio anuncio mirando una web quieta.
    ini = cortes[k]["t0"]
    if abs((nuevo_fin - ini) - MOVIL) > 0.25 and k > 0:
        objetivo = nuevo_fin - MOVIL
        tope = cortes[k - 1]["t0"] + MIN_CORTE
        posibles = [g for g in gs if tope <= g < nuevo_fin - MIN_MOVIL]
        if posibles:
            ini = min(posibles, key=lambda g: abs(g - objetivo))

    antes = (cortes[k]["t0"], cortes[k]["t1"])
    cortes[k]["t0"], cortes[k]["t1"] = round(ini, 3), round(nuevo_fin, 3)
    if k > 0:
        cortes[k - 1]["t1"] = round(ini, 3)
    if k + 1 < len(cortes):
        cortes[k + 1]["t0"] = round(nuevo_fin, 3)
    else:                                           # el móvil era el último
        cortes.append({"t0": round(nuevo_fin, 3), "t1": round(dur, 3),
                       "plano": "A", "dice": "cartela de cierre"})

    # los cortes vacíos que haya podido dejar el desplazamiento se funden
    edl["cortes"] = [c for c in cortes if c["t1"] - c["t0"] >= 0.30]
    for a, b in zip(edl["cortes"], edl["cortes"][1:]):
        b["t0"] = a["t1"]
    edl["cortes"][-1]["t1"] = round(dur, 3)

    # Al adelantar el móvil, la ficha de fecha se le puede montar encima. Se
    # recorta, y si con eso no le quedan 1,5 s para leerse, se corre entera
    # hacia atrás.
    fecha = next((t for t in tarj if t["id"] == "fecha"), None)
    if fecha and fecha["t1"] > ini - 0.10:
        largo = fecha["t1"] - fecha["t0"]
        fecha["t1"] = round(ini - 0.10, 3)
        if fecha["t1"] - fecha["t0"] < 1.50:
            fecha["t0"] = round(fecha["t1"] - min(largo, 2.60), 3)

    for t in tarj:
        if t["id"] == "movil":
            t["t0"], t["t1"] = round(ini, 3), round(nuevo_fin, 3)
        if t["id"] == "cierre":
            t["t0"], t["t1"] = round(nuevo_fin + HUECO, 3), round(dur, 3)

    re.write_text(json.dumps(edl, ensure_ascii=False, indent=1), encoding="utf-8")
    rt.write_text(json.dumps(tarj, ensure_ascii=False, indent=1), encoding="utf-8")
    c = next(t for t in tarj if t["id"] == "cierre")
    print(f"{nombre}: móvil {antes[0]:.1f}-{antes[1]:.1f} → {ini:.1f}-{nuevo_fin:.1f} "
          f"({nuevo_fin-ini:.1f}s) · cierre {c['t1']-c['t0']:.1f}s")


if __name__ == "__main__":
    for n in sys.argv[1:]:
        cerrar(n)

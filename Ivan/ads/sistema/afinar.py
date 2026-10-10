#!/usr/bin/env python3
"""Corrige los tres defectos que deja un montaje escrito a mano.

No reescribe el montaje: respeta el orden de planos y dónde va cada b-roll, que
son las decisiones editoriales. Solo mueve fronteras y parte planos largos, que
son aritmética:

  1. **Cortes a mitad de palabra.** Se pegan a la separación entre palabras más
     cercana. Un corte dentro de una palabra se oye aunque solo cambie la imagen.
  2. **Cortes por debajo del mínimo.** Un plano de 1,3 s no da tiempo a leerse
     como plano: parece un fallo. Se roba tiempo al vecino más largo.
  3. **Planos por encima del máximo.** Un plano fijo de 10 s en un anuncio de 45
     es un hueco muerto. Se parte por la separación entre palabras más próxima a
     su mitad, y a la mitad nueva se le da un plano distinto del de los vecinos.

Los b-roll no se parten nunca: partir uno significaría dos b-roll seguidos.

Uso:
    python3 afinar.py anuncio-05 anuncio-07 ...
"""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
MIN, MAX = 1.60, 5.20


def huecos(nombre, dur):
    """Separaciones entre palabras: los únicos sitios donde se puede cortar."""
    d = json.loads((BASE / f"../trabajo/{nombre}-palabras.json").read_text(encoding="utf-8"))
    w = [(x["offsets"]["from"] / 1000, x["offsets"]["to"] / 1000)
         for x in d["transcription"] if x["text"].strip()]
    g = [round((b0 + a1) / 2, 3) for (a0, b0), (a1, b1) in zip(w, w[1:])]
    return sorted({0.0, round(dur, 3)} | set(g))


def cerca(t, gs, prohibidos=()):
    libres = [g for g in gs if g not in prohibidos]
    return min(libres, key=lambda g: abs(g - t))


def afinar(nombre):
    ruta = BASE / f"edl-{nombre}.json"
    edl = json.loads(ruta.read_text(encoding="utf-8"))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str((BASE / edl["master"]).resolve())],
                               capture_output=True, text=True).stdout)
    gs = huecos(nombre, dur)
    cortes = [dict(c) for c in edl["cortes"]]
    cambios = []

    # --- 1. pegar cada frontera interna a una separación entre palabras
    bordes = [0.0] + [c["t1"] for c in cortes]
    bordes[-1] = round(dur, 3)
    for k in range(1, len(bordes) - 1):
        n = cerca(bordes[k], gs, prohibidos=set(bordes[:k]))
        if abs(n - bordes[k]) > 0.001:
            cambios.append(f"frontera {k}: {bordes[k]:.3f} → {n:.3f}")
            bordes[k] = n

    # --- 2. subir los cortes cortos robando al vecino más largo
    # `rendidos` guarda los cortes cortos que no tienen adónde crecer: no hay
    # separación entre palabras mejor que la que ya tienen. Sin esto el bucle se
    # queda repitiendo el mismo movimiento nulo (le pasó al 09, corte de 1,56 s).
    rendidos = set()
    for _ in range(40):
        d = [bordes[k + 1] - bordes[k] for k in range(len(bordes) - 1)]
        malos = [k for k, x in enumerate(d) if x < MIN and k not in rendidos]
        if not malos:
            break
        k = malos[0]
        izq = d[k - 1] if k > 0 else 0
        der = d[k + 1] if k + 1 < len(d) else 0
        if izq >= der and k > 0:      # robar por la izquierda
            objetivo = bordes[k + 1] - MIN - 0.05
            n = cerca(objetivo, [g for g in gs if bordes[k - 1] + MIN <= g < bordes[k]])
            if abs(n - bordes[k]) < 0.001:
                rendidos.add(k); continue
            cambios.append(f"corte {k} medía {d[k]:.2f}s: frontera {k} {bordes[k]:.2f} → {n:.2f}")
            bordes[k] = n
        elif k + 1 < len(bordes) - 1:  # robar por la derecha
            objetivo = bordes[k] + MIN + 0.05
            n = cerca(objetivo, [g for g in gs if bordes[k] < g <= bordes[k + 2] - MIN])
            if abs(n - bordes[k + 1]) < 0.001:
                rendidos.add(k); continue
            cambios.append(f"corte {k} medía {d[k]:.2f}s: frontera {k+1} {bordes[k+1]:.2f} → {n:.2f}")
            bordes[k + 1] = n
        else:
            rendidos.add(k)

    for k, c in enumerate(cortes):
        c["t0"], c["t1"] = round(bordes[k], 3), round(bordes[k + 1], 3)

    # --- 3. partir los planos demasiado largos
    fuera = []
    for k, c in enumerate(cortes):
        d = c["t1"] - c["t0"]
        if d <= MAX:
            fuera.append(c)
            continue
        if "broll" in c:
            # Un b-roll de siete segundos agota la toma y deja al anuncio sin
            # cara durante media frase. Se queda con su primer golpe (unos 3 s)
            # y el resto vuelve a Iván: no crea dos b-roll seguidos, que es lo
            # único que aquí está prohibido.
            dentro = [g for g in gs if c["t0"] + MIN <= g <= c["t1"] - MIN]
            if not dentro:
                fuera.append(c); continue
            corte = cerca(c["t0"] + min(3.2, d / 2), dentro)
            sig = cortes[k + 1].get("plano") if k + 1 < len(cortes) else None
            ant = fuera[-1].get("plano") if fuera else None
            fuera.append(dict(c, t1=round(corte, 3)))
            fuera.append({"t0": round(corte, 3), "t1": round(c["t1"], 3),
                          "plano": next(p for p in ("C", "B", "A") if p != sig and p != ant),
                          "dice": c.get("dice", "") + " (vuelve a plano)"})
            cambios.append(f"corte {k} era b-roll de {d:.2f}s: recortado a {corte-c['t0']:.2f}s y el resto a plano")
            continue
        trozos = int(d // MAX) + 1
        dentro = [g for g in gs if c["t0"] + MIN <= g <= c["t1"] - MIN]
        puntos = []
        for j in range(1, trozos):
            objetivo = c["t0"] + d * j / trozos
            libres = [g for g in dentro if all(abs(g - p) >= MIN for p in puntos)]
            if libres:
                puntos.append(cerca(objetivo, libres))
        puntos.sort()
        if not puntos:
            fuera.append(c)
            continue
        prev = fuera[-1].get("plano") if fuera else None
        sig = cortes[k + 1].get("plano") if k + 1 < len(cortes) else None
        limites = [c["t0"], *puntos, c["t1"]]
        cambios.append(f"corte {k} medía {d:.2f}s: partido en {len(limites)-1} por {puntos}")
        for j, (a, b) in enumerate(zip(limites, limites[1:])):
            n = dict(c, t0=round(a, 3), t1=round(b, 3))
            if j:
                anterior = fuera[-1].get("plano")
                siguiente = sig if j == len(limites) - 2 else None
                n["plano"] = next(p for p in ("B", "C", "A")
                                  if p != anterior and p != siguiente)
                n["dice"] = c.get("dice", "") + " (sigue)"
            fuera.append(n)

    edl["cortes"] = fuera
    edl["duracion"] = round(dur, 2)
    ruta.write_text(json.dumps(edl, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{nombre}: {len(cortes)} → {len(fuera)} cortes · {len(cambios)} ajustes")
    for c in cambios:
        print(f"    {c}")


if __name__ == "__main__":
    for n in sys.argv[1:]:
        afinar(n)

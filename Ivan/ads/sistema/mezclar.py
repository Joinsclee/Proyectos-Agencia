#!/usr/bin/env python3
"""Coloca los efectos de sonido sobre el anuncio ya compuesto.

El anuncio lleva voz de principio a fin, así que los efectos no son una capa
musical: son acentos en los golpes de estructura. La regla de reparto:

  · un impacto donde entra un texto o una tarjeta,
  · un whoosh donde entra un corte de b-roll,
  · un riser antes del CTA y un sub en la cartela final.

Doce eventos en 56 s. Con uno por corte —diecinueve— dejaría de leerse como
diseño de sonido y pasaría a leerse como dibujo animado.

Los whooshes entran 60 ms ANTES del corte, no encima: el oído coloca el golpe
donde está el ataque, y adelantarlo un pelo hace que el corte se sienta más
apretado.

Uso:
    python3 mezclar.py anuncio-01
"""
import json
import shlex
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
ADELANTO = 0.06        # cuánto se adelanta un whoosh respecto a su corte

# Nivel de cada familia respecto a la voz.
#
# Medido sobre la mezcla terminada, descontando la ganancia de la normalización
# a -14 LUFS: ningún efecto añade energía apreciable a la banda de la voz
# (1-3 kHz). Los impactos, los whooshes y el sub quedan en 0 dB o por debajo.
#
# El único tramo que sube es el del CTA, +1,8 dB, y NO es el clic: bajarlo de
# 0,16 a 0,10 movió la medida una décima. Es la cola del riser, que termina 80 ms
# después del corte. Ochenta milisegundos no tapan una palabra, así que se deja.
# El clic se queda bajo igualmente porque su margen de diseño es el peor de la
# paleta: +6 dB contra la voz, frente a los +17 o más del resto.
NIVEL = {
    "impacto": 0.42, "impacto-suave": 0.34,
    "whoosh-1": 0.30, "whoosh-2": 0.30, "whoosh-3": 0.30,
    "riser": 0.26, "sub": 0.50, "clic": 0.10,
}


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write("\n$ " + " ".join(shlex.quote(c) for c in cmd) + "\n")
        sys.stderr.write(r.stderr[-3000:] + "\n")
        raise SystemExit(f"ffmpeg falló ({r.returncode})")
    return r


def plan(nombre):
    """Deriva la colocación de la propia EDL, para que no se desincronicen.

    Si alguien mueve un corte en la EDL y el plan de sonido estuviera escrito
    aparte, el whoosh se quedaría sonando en mitad de un plano.
    """
    edl = json.loads((BASE / f"edl-{nombre}.json").read_text(encoding="utf-8"))
    tarj = json.loads((BASE / f"tarjetas-{nombre}.json").read_text(encoding="utf-8"))
    cortes = edl["cortes"]

    eventos = []
    whooshes = ["whoosh-1", "whoosh-2", "whoosh-3"]
    n = 0
    for c in cortes:
        if "broll" not in c or c["t0"] == 0:
            continue
        # La pantalla del móvil no lleva whoosh: lleva su propio clic de
        # interfaz, que es lo que la hace leerse como una pantalla y no como
        # otro plano de campo.
        if "Movil" in c["broll"]["src"]:
            eventos.append(("clic", c["t0"]))
            continue
        eventos.append((whooshes[n % 3], max(0, c["t0"] - ADELANTO)))
        n += 1

    for t in tarj:
        if t["id"] == "gancho":
            eventos.append(("impacto", t["t0"]))
        elif t["id"] == "cierre":
            eventos.append(("sub", t["t0"]))
        elif t["id"] != "movil":
            eventos.append(("impacto-suave", t["t0"]))

    # El riser desemboca en el corte del CTA: empieza para acabar justo ahí.
    cta = next((c["t0"] for c in cortes if "broll" in c and "Movil" in c["broll"]["src"]), None)
    if cta:
        eventos.append(("riser", max(0, cta - 1.22)))

    return sorted(eventos, key=lambda e: e[1])


def main():
    nombre = sys.argv[1]
    src = BASE / "entrega" / f"{nombre}.mp4"
    dst = BASE / "entrega" / f"{nombre}-sfx.mp4"
    eventos = plan(nombre)

    entradas = ["-i", str(src)]
    for efecto, _ in eventos:
        entradas += ["-i", str(BASE / "sfx" / f"{efecto}.wav")]

    partes, etiquetas = [], []
    for i, (efecto, t) in enumerate(eventos, start=1):
        partes.append(f"[{i}:a]volume={NIVEL[efecto]},adelay={int(t*1000)}|{int(t*1000)}[e{i}]")
        etiquetas.append(f"[e{i}]")

    # La voz manda: los efectos se suman con `amix` sin normalizar (normalize=1
    # bajaría la voz cada vez que entra un efecto) y el limitador va al final,
    # de ceiling, no de compresor.
    partes.append("".join(etiquetas) + f"amix=inputs={len(eventos)}:normalize=0:dropout_transition=0[sfx]")
    partes.append("[0:a][sfx]amix=inputs=2:normalize=0:dropout_transition=0,"
                  "alimiter=limit=0.94:level=disabled,"
                  "loudnorm=I=-14:TP=-1.5:LRA=11[out]")

    print(f"{nombre}: {len(eventos)} efectos")
    for efecto, t in eventos:
        print(f"  {t:6.2f}s  {efecto}")

    sh(["ffmpeg", "-y", "-v", "error", *entradas,
        "-filter_complex", ";".join(partes),
        "-map", "0:v", "-map", "[out]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", str(dst)])
    print(f"\n→ {dst}  ({dst.stat().st_size / 2**20:.0f} MB)")


if __name__ == "__main__":
    main()

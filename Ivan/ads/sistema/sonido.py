#!/usr/bin/env python3
"""Pone cuatro acentos de sonido sobre el anuncio. Ni uno más.

Historia corta de por qué son cuatro. La primera versión llevaba once efectos
sintetizados y el cliente los rechazó. Fallaban dos cosas a la vez y solo una
era el material:

  · eran sintéticos (ruido filtrado, senos con caída), y suenan a eso;
  · eran once, o sea uno cada cinco segundos, que es la firma audible de
    «esto es un anuncio». En dueños de finca de 35-65 en LATAM eso lee a gurú
    de infoproducto.

Aquí el material es grabado (Mixkit, licencia verificada para publicidad
pagada) y la densidad baja a tres: gancho, oferta y cierre. Son los momentos
donde cambia la estructura, no las transiciones. Puntuación, no decoración.

La entrada de la pantalla del móvil se probó con un obturador de cámara y se
quitó: la pantalla no está haciendo una foto, y un sonido que no podría existir
ahí se lee como truco. Ese momento ya cambia el cuadro entero; no necesita
ayuda, y un sonido equivocado lo abarataría.

Y NO llevan función de pegamento: se midió que este montaje corta solo imagen y
no introduce ni un salto de audio (0 de 7 cortes, Δ ≤ 0,10 dB contra el bruto).
Los acentos están para dar peso, no para tapar costuras que no existen.

Uso:
    python3 sonido.py anuncio-01
"""
import shlex
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
SFX = BASE / "sfx" / "mixkit"

# Cada archivo trae silencio antes del ataque. `recorte` lo quita para que el
# golpe caiga exactamente en el beat, y `dura` deja el cuerpo más una cola corta.
# Los valores salen de medir la envolvente real, no del nombre del archivo.
ACENTOS = [
    # t      archivo             recorte  dura  nivel   qué marca
    (0.20,  "impacto-profundo",  0.46,    1.30, 0.30,  "aparece el gancho"),
    (29.82, "sweep-corto",       0.19,    0.55, 0.88,  "«Por eso preparé Finca sin improvisar»"),
    (53.60, "impacto-grande",    2.08,    1.60, 0.72,  "cartela de cierre"),
]


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write("\n$ " + " ".join(shlex.quote(c) for c in cmd) + "\n")
        sys.stderr.write(r.stderr[-3000:] + "\n")
        raise SystemExit(f"ffmpeg falló ({r.returncode})")
    return r


def main():
    nombre = sys.argv[1]
    src = BASE / "entrega" / f"{nombre}.mp4"
    dst = BASE / "entrega" / f"{nombre}-sonido.mp4"

    entradas = ["-i", str(src)]
    for _, arch, recorte, dura, _, _ in ACENTOS:
        entradas += ["-ss", str(recorte), "-t", str(dura), "-i", str(SFX / f"{arch}.mp3")]

    partes, etiq = [], []
    for i, (t, arch, _, dura, nivel, _) in enumerate(ACENTOS, start=1):
        # Un fundido de salida de 120 ms evita que la cola se corte en seco, que
        # es lo que hace que un efecto suene pegado en vez de tocado.
        partes.append(
            f"[{i}:a]volume={nivel},afade=t=out:st={max(0, dura-0.12):.2f}:d=0.12,"
            f"aformat=sample_rates=48000:channel_layouts=stereo,"
            f"adelay={int(t*1000)}|{int(t*1000)}[e{i}]")
        etiq.append(f"[e{i}]")

    # La voz manda: `normalize=0` para que no baje cada vez que entra un acento.
    partes.append("".join(etiq) + f"amix=inputs={len(ACENTOS)}:normalize=0:dropout_transition=0[sfx]")
    partes.append("[0:a][sfx]amix=inputs=2:normalize=0:dropout_transition=0,"
                  "alimiter=limit=0.94:level=disabled,"
                  "loudnorm=I=-14:TP=-1.4:LRA=11[out]")

    print(f"{nombre}: {len(ACENTOS)} acentos en 56 s")
    for t, arch, _, dura, nivel, que in ACENTOS:
        print(f"  {t:6.2f}s  {arch:18} {dura:.2f}s  ·  {que}")

    sh(["ffmpeg", "-y", "-v", "error", *entradas,
        "-filter_complex", ";".join(partes),
        "-map", "0:v", "-map", "[out]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", str(dst)])
    print(f"\n→ {dst.name}  ({dst.stat().st_size / 2**20:.0f} MB)")


if __name__ == "__main__":
    main()

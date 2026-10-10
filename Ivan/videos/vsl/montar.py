#!/usr/bin/env python3
"""Monta un VSL a partir de una EDL en JSON.

La idea del montaje: el audio del máster corre entero y sin cortes; lo único
que cambia es la imagen. Así el discurso de Iván no se toca y aun así el vídeo
deja de ser un plano fijo de cuatro minutos.

Tres recursos de imagen:

  * **Planos** (A/B/C) — reencuadres del propio máster 4K. Como la fuente es
    3840x2160 y la entrega 1920x1080, un recorte de 1920x1080 son píxeles
    nativos: un primer plano gratis, sin segunda cámara.
  * **B-roll de vídeo** — trozos de los clips de la finca, recortados a 16:9.
  * **B-roll de foto** — Ken Burns lento sobre las fotos de Iván.

Cada corte se renderiza a un intermedio con los mismos parámetros y luego se
concatenan sin recodificar (`-c copy`), que es lo que hace que un montaje de
40 cortes no tarde tres horas ni pierda calidad en cada pasada.

Uso:
    python3 montar.py edl-gracias.json
    python3 montar.py edl-gracias.json --solo 3      # renderiza un corte
"""
import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.stderr.write(f"\n$ {' '.join(shlex.quote(c) for c in cmd)}\n{r.stderr[-3000:]}\n")
        raise SystemExit(f"ffmpeg falló ({r.returncode})")
    return r


# El día del rodaje estaba nublado y el plano de Iván sale plano y frío al lado
# del b-roll 4K, que va saturado y con sol. Esto solo lo acerca: subir más
# (contraste 1.10 / saturación 1.18) le pone la hierba amarilla y la piel
# naranja, comprobado.
GRADO = "eq=contrast=1.06:saturation=1.10:gamma=1.02,colorbalance=rs=.012:gs=.004:bs=-.014"


def filtro_plano(corte, planos, W, H, FPS):
    """Reencuadre del máster. `crop` es None para el plano abierto."""
    crop = planos[corte["plano"]]["crop"]
    partes = []
    if crop:
        partes.append(f"crop={crop}")
    partes += [f"scale={W}:{H}:flags=lanczos", GRADO, "setsar=1", f"fps={FPS}"]
    return ",".join(partes)


def filtro_foto(src, dur, direccion, W, H, FPS):
    """Ken Burns sin temblor.

    zoompan redondea el recorte a píxeles enteros en cada fotograma. Con el
    zoom acumulativo (`zoom+paso`) ese redondeo se realimenta y la imagen oscila
    — es el temblor que se veía. Dos cambios lo arreglan, y están medidos sobre
    la misma foto (rugosidad: menor es más liso; una foto quieta da 0.0001):

        acumulativo, 2x la salida .......... 0.747   ← lo que había
        absoluto,    2x la salida .......... 0.719
        absoluto,    4x la salida .......... 0.268
        absoluto,    6x la salida .......... 0.199   ← esto

      1. `z` se calcula desde el número de fotograma (`on`), no sumando sobre el
         valor anterior: así un redondeo no arrastra a los siguientes.
      2. La foto se sube a 6x la salida antes de recortar, con lo que un píxel
         de error son 0,17 px en pantalla.
    """
    n = max(2, int(round(dur * FPS)))
    amp = 0.09                       # 9 % de recorrido: se nota sin marear
    if direccion == "in":
        z = f"1+{amp}*on/{n}"
    else:
        z = f"{1+amp}-{amp}*on/{n}"
    S = 6
    return (
        f"scale={W*S}:{H*S}:force_original_aspect_ratio=increase,"
        f"crop={W*S}:{H*S},"
        f"zoompan=z='{z}':d={n}:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':"
        f"fps={FPS}:s={W}x{H},setsar=1"
    )


def filtro_clip(crop, W, H, FPS, velocidad, enfocar):
    partes = []
    if crop:
        partes.append(f"crop={crop}")
    if velocidad and velocidad != 1.0:
        partes.append(f"setpts={1/velocidad:.4f}*PTS")
    partes += [
        f"scale={W}:{H}:force_original_aspect_ratio=increase",
        f"crop={W}:{H}",
    ]
    if enfocar:
        # solo para los clips verticales, que suben 1.78x y quedan blandos.
        # El b-roll 4K se reduce, no se amplía: enfocarlo solo añadiría ruido.
        partes.append("unsharp=5:5:0.55:5:5:0.0")
    partes += ["setsar=1", f"fps={FPS}"]
    return ",".join(partes)


ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18",
       "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30",
       "-sc_threshold", "0", "-an"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edl")
    ap.add_argument("--solo", type=int, default=None, help="renderiza solo ese corte")
    ap.add_argument("--saltar-render", action="store_true")
    args = ap.parse_args()

    edl = json.loads(Path(args.edl).read_text(encoding="utf-8"))
    nombre = edl["nombre"]
    S = edl["salida"]
    W, H, FPS = S["w"], S["h"], S["fps"]
    master = (BASE / edl["master"]).resolve()
    planos = edl["planos"]

    tmp = BASE / "_tmp" / nombre
    tmp.mkdir(parents=True, exist_ok=True)
    out = BASE / "salida"
    out.mkdir(exist_ok=True)

    trozos = []
    for i, c in enumerate(edl["cortes"]):
        dur = round(c["t1"] - c["t0"], 3)
        dst = tmp / f"{i:03d}.mp4"
        trozos.append(dst)
        if args.solo is not None and args.solo != i:
            continue
        if args.saltar_render and dst.exists():
            continue

        if "broll" in c:
            b = c["broll"]
            src = (BASE / b["src"]).resolve()
            if b["tipo"] == "foto":
                vf = filtro_foto(src, dur, b.get("kb", "in"), W, H, FPS)
                cmd = ["ffmpeg", "-y", "-v", "error", "-loop", "1", "-t", str(dur),
                       "-i", str(src), "-vf", vf, "-t", str(dur), *ENC, str(dst)]
            else:
                vf = filtro_clip(b.get("crop"), W, H, FPS, b.get("velocidad", 1.0),
                                 b.get("enfocar", False))
                # Los clips del dron llevan una miniatura mjpeg como segundo
                # flujo; sin -map ffmpeg puede escoger esa en vez del 4K.
                cmd = ["ffmpeg", "-y", "-v", "error", "-ss", str(b["in"]),
                       "-i", str(src), "-map", "0:v:0", "-t", str(dur),
                       "-vf", vf, *ENC, str(dst)]
        else:
            vf = filtro_plano(c, planos, W, H, FPS)
            cmd = ["ffmpeg", "-y", "-v", "error", "-ss", str(c["t0"]),
                   "-i", str(master), "-t", str(dur), "-vf", vf, *ENC, str(dst)]

        sh(cmd)
        print(f"  [{i:02d}] {c['t0']:6.2f}-{c['t1']:6.2f}  "
              f"{c.get('plano') or ('BROLL/' + c['broll']['tipo']):11}  "
              f"{dst.stat().st_size//1024:>6} KB  {c.get('dice','')[:44]}")

    if args.solo is not None:
        return

    lista = tmp / "lista.txt"
    lista.write_text("".join(f"file '{p}'\n" for p in trozos), encoding="utf-8")
    mudo = tmp / "_mudo.mp4"
    sh(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
        "-i", str(lista), "-c", "copy", str(mudo)])

    # El audio entra entero desde el máster: la imagen se corta, la voz no.
    # loudnorm a -16 LUFS, que es lo que esperan los reproductores web.
    final = out / f"{nombre}-montado.mp4"
    sh(["ffmpeg", "-y", "-v", "error",
        "-i", str(mudo), "-i", str(master),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", "-shortest", str(final)])

    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration,size", "-of", "csv=p=0", str(final)],
                       capture_output=True, text=True).stdout.strip()
    print(f"\n→ {final}  ({d})")


if __name__ == "__main__":
    main()

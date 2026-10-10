#!/usr/bin/env python3
"""Compone los rótulos sobre el montaje y saca la versión de entrega.

Los PNG los dibuja Chrome (`rotulos.cjs`): este ffmpeg no trae libass ni
drawtext, y aunque los trajera, libass no lee las woff2 de la marca. Aquí solo
se colocan.

**Dos cosas que costaron y por las que está montado así.**

1. *Una entrada por tarjeta se cuelga.* `overlay` sincroniza por marca de
   tiempo y se queda esperando un fotograma del segundo input; la tarjeta de
   cierre no tenía ninguno hasta el segundo 221 y ffmpeg se quedaba parado.
   Como las tarjetas nunca coinciden en el tiempo, se encadenan todas en una
   sola pista con el demuxer `concat` y PNG transparente en los huecos.

2. *Esa pista de `concat` no se puede meter directa en el filtro.* Sus
   fotogramas son dispersos (uno por rótulo, con `duration`) y `overlay` los
   consume a otro ritmo que el vídeo principal: los subtítulos salían bien
   hasta el segundo 14 y luego desaparecían, y en otra prueba iban al doble de
   velocidad. Comprobado que los 25 fotogramas SÍ llegan al filtro con su PTS
   correcto — el desajuste está en la sincronía, no en la lista. La solución es
   pasar cada pista a un vídeo real con canal alfa (WebM/VP9 `yuva420p`) a 30
   fps constantes, y solo entonces superponerla.

Los fundidos van con `fade` activado por ventana (`enable`): fuera de su
ventana el filtro no hace nada, así que se pueden encadenar tantos como
tarjetas sin que uno pise al anterior.

Uso:
    python3 componer.py registro
"""
import json
import shlex
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
W, H, FPS = 1080, 1920, 25
BANDA_Y = 1150         # donde empieza la tira de subtítulos (340 px de alto)
INFO_W, INFO_H = 1080, 430   # lienzo de las infografías animadas
ENTRADA = 0.40         # fundido de entrada/salida de las tarjetas
DESLIZ = 46            # píxeles que se desplaza la tarjeta al entrar


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write("\n$ " + " ".join(shlex.quote(c) for c in cmd) + "\n")
        sys.stderr.write(r.stderr[-4000:] + "\n")
        raise SystemExit(f"ffmpeg falló ({r.returncode})")
    return r


def transparente(destino, w, h):
    if not destino.exists():
        sh(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
            "-i", f"color=c=black@0:s={w}x{h},format=rgba", "-frames:v", "1", str(destino)])
    return destino


def pista(nombre, tramos, dir_png, nombre_png, hueco, dur_total, salida):
    """Lista de concat: cada PNG con su duración y transparencia en los huecos.

    El demuxer repite el último fichero si no lleva `duration`, así que hay que
    volver a nombrarlo al final o se recorta el último tramo.
    """
    filas, t = [], 0.0
    for i, s in enumerate(tramos):
        if s["t0"] - t > 0.02:
            filas.append((hueco, s["t0"] - t))
        filas.append((dir_png / nombre_png(i, s), s["t1"] - s["t0"]))
        t = s["t1"]
    if dur_total - t > 0.02:
        filas.append((hueco, dur_total - t))
    txt = "".join(f"file '{p}'\nduration {d:.3f}\n" for p, d in filas)
    txt += f"file '{filas[-1][0]}'\n"
    salida.write_text(txt, encoding="utf-8")
    return salida


def pista_info(nombre, dur, raiz, salida):
    """Lista de concat con las infografías animadas, fotograma a fotograma.

    Una infografía es una secuencia de PNG a 25 fps, no un rótulo fijo, así que
    aquí cada fotograma entra con su 1/25 de segundo y los huecos entre
    infografías se rellenan con transparencia. Es la misma mecánica que las
    tarjetas: una sola pista continua, porque una entrada de ffmpeg por
    infografía vuelve a colgar el `overlay` esperando fotogramas que no llegan.

    Devuelve None si este anuncio no lleva infografías, que son seis de diez.
    """
    ruta = BASE / f"infografias-{nombre}.json"
    if not ruta.exists():
        return None, None
    spec = sorted(json.loads(ruta.read_text(encoding="utf-8")), key=lambda g: g["t0"])
    ys = {g.get("y", 680) for g in spec}
    assert len(ys) == 1, f"{nombre}: las infografías de un anuncio comparten altura ({ys})"
    hueco = transparente(raiz / "hueco-info.png", INFO_W, INFO_H)

    filas, t = [], 0.0
    for g in spec:
        if g["t0"] - t > 0.02:
            filas.append((hueco, g["t0"] - t))
        dir_g = raiz / "info" / g["id"]
        pngs = sorted(dir_g.glob("*.png"))
        assert pngs, f"faltan los PNG de la infografía «{g['id']}»: {dir_g}"
        paso = (g["t1"] - g["t0"]) / len(pngs)
        filas += [(p, paso) for p in pngs]
        t = g["t1"]
    if dur - t > 0.02:
        filas.append((hueco, dur - t))
    txt = "".join(f"file '{p}'\nduration {d:.4f}\n" for p, d in filas)
    txt += f"file '{filas[-1][0]}'\n"
    salida.write_text(txt, encoding="utf-8")
    return salida, ys.pop()


def main():
    nombre = sys.argv[1]
    montaje = BASE / "salida" / f"{nombre}-montado.mp4"
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(montaje)],
        capture_output=True, text=True).stdout.strip())

    raiz = BASE / "_rot" / nombre
    subs = json.loads((BASE / f"subs-{nombre}.json").read_text(encoding="utf-8"))
    tarj = json.loads((BASE / f"tarjetas-{nombre}.json").read_text(encoding="utf-8"))

    # La tarjeta de cierre ocupa el cuadro entero y ya dice lo que hay que
    # hacer; dejar los subtítulos debajo los deja medio tapados y compitiendo
    # con el botón. Se cortan cuando entra.
    gancho = next((t for t in tarj if t["id"] == "gancho"), None)
    cierre = next((t["t0"] for t in tarj if t["id"] == "cierre"), None)
    subs = [dict(s, n=i) for i, s in enumerate(subs)]
    if cierre is not None:
        subs = [dict(s, t1=min(s["t1"], cierre)) for s in subs if s["t0"] < cierre]
    # El gancho de los primeros segundos ya dice el mensaje en grande: el
    # subtítulo debajo sería el mismo texto dos veces.
    if gancho is not None:
        subs = [s for s in subs if s["t1"] > gancho["t1"] or s["t0"] >= gancho["t1"]]

    # Tarjetas que piden silencio de subtítulos. La del móvil es el caso: ahí
    # la pantalla ya lleva su propio titular, su contador y su botón, y el
    # subtítulo encima lo convierte en un amasijo ilegible.
    for t in tarj:
        if t.get("tapaSubs"):
            subs = [x for x in subs if x["t1"] <= t["t0"] or x["t0"] >= t["t1"]]

    l_subs = pista(nombre, subs, raiz / "subs", lambda i, s: f"{s['n']:03d}.png",
                   transparente(raiz / "hueco-subs.png", W, 340), dur,
                   raiz / "lista-subs.txt")
    l_tarj = pista(nombre, tarj, raiz / "tarjetas", lambda i, s: f"{s['id']}.png",
                   transparente(raiz / "hueco-tarj.png", W, H), dur,
                   raiz / "lista-tarj.txt")

    # Fundidos: uno de entrada y otro de salida por tarjeta, cada uno activo
    # solo en su ventana. Fuera de ella `fade` no hace nada, así que se pueden
    # encadenar tantos como tarjetas sin que uno pise al anterior. El cierre
    # entra y se queda.
    fades = []
    for t in tarj:
        a, b = t["t0"], t["t1"]
        fades.append(f"fade=t=in:st={a:.3f}:d={ENTRADA}:alpha=1"
                     f":enable='between(t,{a:.3f},{a+ENTRADA:.3f})'")
        if t["id"] != "cierre":
            fades.append(f"fade=t=out:st={b-ENTRADA:.3f}:d={ENTRADA}:alpha=1"
                         f":enable='between(t,{b-ENTRADA:.3f},{b:.3f})'")

    # Desplazamiento de entrada, como una función a trozos del tiempo: fuera de
    # las ventanas vale 0. Cada tarjeta entra desde su propio lado (`desliz`:
    # 1 desde la derecha, -1 desde la izquierda, 0 sin desplazamiento). Una
    # tarjeta pegada al borde izquierdo que entra deslizándose desde la derecha
    # se lee como un error, no como una animación.
    x = "0"
    for t in reversed(tarj):
        d = t.get("desliz", 1)
        if not d:
            continue
        a = t["t0"]
        x = (f"if(between(t,{a:.3f},{a+ENTRADA:.3f}),"
             f"{DESLIZ * d}*(1-(t-{a:.3f})/{ENTRADA}),{x})")

    # Cada pista pasa por VP9 con alfa a 30 fps constantes antes de componerse.
    def a_webm(lista, w, h, filtros, destino):
        vf = f"fps={FPS}," + (",".join(filtros) + "," if filtros else "") + "format=yuva420p"
        sh(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lista),
            "-vf", vf, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
            "-b:v", "0", "-crf", "22", "-speed", "5", "-row-mt", "1",
            "-an", "-t", f"{dur:.3f}", str(destino)])
        return destino

    w_subs = a_webm(l_subs, W, 340, [], raiz / "subs.webm")
    w_tarj = a_webm(l_tarj, W, H, fades, raiz / "tarjetas.webm")
    l_info, info_y = pista_info(nombre, dur, raiz, raiz / "lista-info.txt")
    w_info = a_webm(l_info, INFO_W, INFO_H, [], raiz / "info.webm") if l_info else None

    # Orden de capas: primero los subtítulos, luego la infografía y las tarjetas
    # encima. La cartela de cierre ocupa el cuadro entero y tiene que ganar a
    # todo lo demás, así que va la última.
    partes_f = ["[1:v]format=rgba[sub]", "[2:v]format=rgba[tar]",
                f"[0:v][sub]overlay=0:{BANDA_Y}:eof_action=pass:format=auto[v1]"]
    ultima = "v1"
    if w_info:
        partes_f.append("[3:v]format=rgba[inf]")
        partes_f.append(f"[v1][inf]overlay=0:{info_y}:eof_action=pass:format=auto[v1b]")
        ultima = "v1b"
    partes_f.append(f"[{ultima}][tar]overlay=x='{x}':y=0:eof_action=pass:format=auto[v2]")
    filtro = ";".join(partes_f)

    salida = BASE / "entrega" / f"{nombre}.mp4"
    salida.parent.mkdir(exist_ok=True)
    print(f"{nombre}: {len(subs)} subtítulos + {len(tarj)} tarjetas"
          + (f" + infografía en y={info_y}" if w_info else "") + f" sobre {dur:.1f}s")
    entradas_info = ["-c:v", "libvpx-vp9", "-i", str(w_info)] if w_info else []
    sh(["ffmpeg", "-y", "-v", "error",
        "-i", str(montaje),
        "-c:v", "libvpx-vp9", "-i", str(w_subs),
        "-c:v", "libvpx-vp9", "-i", str(w_tarj),
        *entradas_info,
        "-filter_complex", filtro,
        "-map", "[v2]", "-map", "0:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
        "-maxrate", "6M", "-bufsize", "12M",
        # Sonoridad de entrega igual en todas las piezas: el máster y sus
        # variantes conviven en el mismo conjunto de anuncios, y si el largo
        # sale 2,5 dB por debajo suena peor sin que nadie sepa por qué.
        "-af", "loudnorm=I=-14:TP=-1.4:LRA=11",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", "-t", f"{dur:.3f}", str(salida)])

    sh(["ffmpeg", "-y", "-v", "error", "-ss", "2.4", "-i", str(salida),
        "-frames:v", "1", "-vf", "scale=1600:-1", "-q:v", "3",
        str(BASE / "entrega" / f"{nombre}-poster.jpg")])
    print(f"\u2192 {salida}  ({salida.stat().st_size / 2**20:.0f} MB)")


if __name__ == "__main__":
    main()

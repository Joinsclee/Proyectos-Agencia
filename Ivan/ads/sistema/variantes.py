#!/usr/bin/env python3
"""Saca variantes cortas del anuncio ya terminado, sin volver a montarlo.

Por qué existen. Un anuncio de 56 s enseña su llamado a la acción en el segundo
50, y a esa altura queda muy poca gente: los benchmarks de retención de Reels
2026 dan 40-50 % de visionado para piezas de 30-60 s frente a más del 65 % por
debajo de 15 s. La grabación de la landing es lo único que explica CÓMO se
registra el espectador, así que conviene que exista una versión donde llegue
pronto.

Lo que NO se hace, y es deliberado: mover la landing del segundo 50 en el máster.
El cliente pidió expresamente que estuviera ahí, lleva `tapaSubs` (apagaría los
subtítulos en plena ventana de retención si se moviera al principio) y en el
segundo 12 la voz todavía describe el problema, así que sería un CTA sin oferta
detrás. Las variantes resuelven lo mismo sin tocar el máster.

Se corta por **fronteras de frase**, sacadas de la transcripción palabra a
palabra, no por duraciones redondas. Un anuncio de 15 s que parte una frase por
la mitad es peor que uno de 19 s que no.

Y se corta el MONTAJE, no la entrega. La primera versión recortaba el archivo ya
rotulado y se veía: los subtítulos están estirados para encadenar sin huecos, así
que en cada empalme quedaba en pantalla un rótulo con palabras que ya no se iban
a oír («cosecha. Y casi nunca ocurre porque» justo antes de saltar a otra frase).
Ahora se recorta antes de los rótulos. Y los subtítulos no se recortan: se
REGENERAN desde las palabras. Recortar un subtítulo ya hecho conserva su texto
completo, así que el rótulo seguía enseñando palabras que ya no se iban a oír
aunque su ventana encajara. Filtrando las palabras a los tramos y volviendo a
agrupar, cada rótulo dice exactamente lo que suena.

Uso:
    python3 variantes.py anuncio-01
"""
import json
import shlex
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent

# Cada variante es una lista de tramos [inicio, fin] en segundos del máster.
# Los límites salen de donde acaba una frase (ver `frases()` más abajo) y cada
# tarjeta cae entera dentro de un tramo, así que ni los rótulos ni los
# subtítulos quedan cortados a medias.
VARIANTES = {
    "corta": [                      # gancho, nombre, fecha, CTA
        (0.00, 7.08),               # «Soñar con vivir en el campo es fácil…»
        (29.44, 31.76),             # «Por eso preparé Finca sin improvisar.»
        (42.32, 46.20),             # «Será el 17 de septiembre a las 6 p. m.»
        (50.32, 56.08),             # CTA con la landing + cartela de cierre
    ],
    "media": [                      # gancho, oferta completa, fecha, CTA
        (0.00, 7.08),
        (29.44, 40.20),             # la clase y los cinco pilares
        (42.32, 46.20),
        (50.32, 56.08),
    ],
}

CRUCE = 0.03    # fundido de audio en cada empalme


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write("\n$ " + " ".join(shlex.quote(c) for c in cmd) + "\n")
        sys.stderr.write(r.stderr[-3000:] + "\n")
        raise SystemExit(f"ffmpeg falló ({r.returncode})")
    return r


def frases(nombre):
    """Dónde acaba cada frase, según la transcripción palabra a palabra."""
    d = json.loads((BASE / f"../trabajo/{nombre}-palabras.json").read_text(encoding="utf-8"))
    w = [(x["text"].strip(), x["offsets"]["from"] / 1000, x["offsets"]["to"] / 1000)
         for x in d["transcription"] if x["text"].strip()]
    fin = [0.0] + [b for t, a, b in w if t.endswith((".", "!", "?"))]
    return fin


def comprobar(nombre, tramos, fin_frases, tarjetas, dur_total):
    """Avisa si un corte parte una frase o una tarjeta. No corrige: avisa."""
    avisos = []
    for a, b in tramos:
        for lim, cual in ((a, "entrada"), (b, "salida")):
            if lim in (0.0, dur_total):
                continue
            if min(abs(lim - f) for f in fin_frases) > 0.20:
                avisos.append(f"    {cual} en {lim:.2f}s no cae en final de frase")
    for t in tarjetas:
        dentro = any(a - 0.01 <= t["t0"] and t["t1"] <= b + 0.01 for a, b in tramos)
        fuera = all(t["t1"] <= a or t["t0"] >= b for a, b in tramos)
        if not dentro and not fuera:
            avisos.append(f"    la tarjeta «{t['id']}» queda partida por un corte")
    return avisos


def remapear(tramos, items, clave_t0="t0", clave_t1="t1"):
    """Lleva subtítulos y tarjetas a la línea de tiempo de la variante.

    Lo que cae fuera de los tramos se descarta; lo que cae dentro se desplaza.
    Un item que cruza una frontera se recorta al tramo, no se parte en dos:
    partirlo dejaría medio rótulo colgando en el empalme, que es justo el
    defecto que esta función existe para evitar.
    """
    fuera, desplazamiento = [], 0.0
    for a, b in tramos:
        for it in items:
            t0, t1 = it[clave_t0], it[clave_t1]
            if t1 <= a or t0 >= b:
                continue
            n = dict(it)
            n[clave_t0] = max(t0, a) - a + desplazamiento
            n[clave_t1] = min(t1, b) - a + desplazamiento
            if n[clave_t1] - n[clave_t0] >= 0.25:
                fuera.append(n)
        desplazamiento += b - a
    return fuera


def main():
    nombre = sys.argv[1]
    montaje = BASE / "salida" / f"{nombre}-montado.mp4"
    fin_frases = frases(nombre)
    subs = json.loads((BASE / f"subs-{nombre}.json").read_text(encoding="utf-8"))
    tarj = json.loads((BASE / f"tarjetas-{nombre}.json").read_text(encoding="utf-8"))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str(montaje)], capture_output=True, text=True).stdout)

    for var, tramos in VARIANTES.items():
        total = sum(b - a for a, b in tramos)
        print(f"\n{var}: {len(tramos)} tramos · {total:.1f}s")
        for a, b in tramos:
            print(f"    {a:6.2f} → {b:6.2f}  ({b-a:4.1f}s)")
        for x in comprobar(nombre, tramos, fin_frases, tarj, dur):
            print(x)

        partes, etiq = [], []
        for i, (a, b) in enumerate(tramos):
            partes.append(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}]")
            partes.append(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,"
                          f"afade=t=in:st=0:d={CRUCE},afade=t=out:st={b-a-CRUCE:.3f}:d={CRUCE}[a{i}]")
            etiq.append(f"[v{i}][a{i}]")
        partes.append("".join(etiq) + f"concat=n={len(tramos)}:v=1:a=1[v][a]")

        # El montaje recortado ocupa el sitio de un máster para la composición.
        corte = BASE / "salida" / f"{nombre}-{var}-montado.mp4"
        sh(["ffmpeg", "-y", "-v", "error", "-i", str(montaje),
            "-filter_complex", ";".join(partes), "-map", "[v]", "-map", "[a]",
            "-r", "25", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(corte)])

        # Las palabras se filtran y se desplazan; `subtitulos.py` las reagrupa
        # después, así que la variante usa exactamente la misma lógica de corte
        # de línea y de resalte que el máster.
        palabras = json.loads((BASE / f"../trabajo/{nombre}-palabras.json").read_text(encoding="utf-8"))
        w = [x for x in palabras["transcription"] if x["text"].strip()]
        nuevas, desp = [], 0.0
        for a, b in tramos:
            for x in w:
                t0, t1 = x["offsets"]["from"] / 1000, x["offsets"]["to"] / 1000
                if t1 <= a or t0 >= b:
                    continue
                y = json.loads(json.dumps(x))
                y["offsets"] = {"from": int((max(t0, a) - a + desp) * 1000),
                                "to": int((min(t1, b) - a + desp) * 1000)}
                nuevas.append(y)
            desp += b - a
        (BASE / f"../trabajo/{nombre}-{var}-palabras.json").write_text(
            json.dumps({"transcription": nuevas}, ensure_ascii=False), encoding="utf-8")
        sh(["python3", str(BASE / "subtitulos.py"), f"{nombre}-{var}"])

        (BASE / f"tarjetas-{nombre}-{var}.json").write_text(
            json.dumps(remapear(tramos, tarj), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  montaje recortado, subtítulos regenerados y tarjetas recolocadas:")
        print(f"    node rotulos.cjs subs {nombre}-{var}   (desde la carpeta Playwright)")
        print(f"    node rotulos.cjs tarjetas {nombre}-{var}")
        print(f"    python3 componer.py {nombre}-{var}")


if __name__ == "__main__":
    main()

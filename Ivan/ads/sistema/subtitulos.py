#!/usr/bin/env python3
"""Agrupa la transcripción palabra a palabra en subtítulos cortos.

Whisper devuelve frases largas; para un VSL hacen falta trozos de 3-5 palabras
que caben de un vistazo y cambian al ritmo del habla. Aquí se agrupan por
puntuación y longitud, se corrigen los errores conocidos del modelo y se marcan
las palabras que van resaltadas.

Salida: un JSON con {t0, t1, lineas:[...], resalte:[...]} por subtítulo, que es
lo que consume `rotulos.py` para dibujarlos en Chrome.
"""
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent

# El modelo pequeño falla siempre en los mismos sitios. Se corrige sobre la
# lista de palabras para no perder las marcas de tiempo.
CORRECCIONES = [
    (["la", "huerto", "hotel"], ["La", "Huerta", "Hotel"]),
    (["huerto", "hotel"], ["Huerta", "Hotel"]),
    (["inerente"], ["inherente"]),
    (["integral", "la", "parte"], ["integrar", "la", "parte"]),
    (["fabrica", "los", "insumos"], ["fabricas", "los", "insumos"]),
    (["echas", "en", "tu"], ["hechas", "en", "tu"]),
    (["daña", "la", "salud"], ["dañan", "la", "salud"]),
    (["agua", "llueve", "que"], ["agua", "lluvia", "que"]),
    (["Habe", "de", "invertir"], ["Antes", "de", "invertir"]),
    (["Castrillon"], ["Castrillón"]),
    (["nos", "enviará", "por", "esta"], ["no", "se", "enviará", "por", "esta"]),
    (["Segura", "de", "WhatsApp"], ["segura", "de", "WhatsApp"]),
    (["fincas", "sin", "improvisar"], ["Finca", "sin", "improvisar"]),
    (["whatsapp"], ["WhatsApp"]),
    # --- errores detectados en los anuncios 2 a 10 (se revisó uno por uno) ---
    (["bitando"], ["visitando"]),
    (["registro", "de", "gratis"], ["regístrate", "gratis"]),
    (["están", "decidir"], ["está", "en", "decidir"]),
    (["Regístate"], ["Regístrate"]),
    (["Regícate"], ["Regístrate"]),
    (["registrate"], ["Regístrate"]),
    (["para", "realizar", "el", "destino"], ["Diseñar", "el", "destino"]),
    (["una", "fin", "empieza"], ["una", "finca", "empieza"]),
    (["claridad", "habría", "habitado"], ["claridad", "nos", "habría", "evitado"]),
    (["quieres", "construido"], ["quieres", "construir"]),
    (["industria", "agroquímicos"], ["industria", "de", "agroquímicos"]),
    (["master", "clase"], ["masterclass"]),
    (["la", "6", "de", "la", "tarde"], ["a", "las", "6", "de", "la", "tarde"]),
    (["nos", "reimos"], ["nos", "reímos"]),
    (["nosotros", "nos", "habría", "gustado"], ["a", "nosotros", "nos", "habría", "gustado"]),
    (["finca", "sin", "improvisar"], ["Finca", "sin", "improvisar"]),
    # Interrogativos indirectos sin tilde. En un subtítulo quemado se ven.
    (["defines", "que", "debe"], ["defines", "qué", "debe"]),
    # Empieza en "producir" y no en "debe": la corrección de arriba ya consumió
    # esa palabra y el emparejador avanza, no vuelve atrás.
    (["producir", "para", "quien"], ["producir,", "para", "quién"]),
    (["en", "que", "orden"], ["en", "qué", "orden"]),
    (["aprende", "que", "conviene"], ["aprende", "qué", "conviene"]),
    (["no", "es", "que", "puedo"], ["no", "es", "qué", "puedo"]),
    (["es", "que", "quiero"], ["es", "qué", "quiero"]),
]

# Lo que se resalta en verde lima: cifras, fechas y los términos que sostienen
# la oferta. Nada más — si se resalta todo, no se resalta nada.
RESALTE = re.compile(
    r"^(cinco|5|90|70%|96%|17|gratis|gratuita|gratuito|rentable|pilares|"
    r"septiembre|primero|criterio|sistema|improvisar|policultivo|agua|"
    r"directo|propios|WhatsApp)[.,;:]?$",
    re.IGNORECASE,
)

FIN_FRASE = re.compile(r"[.,;:?!]$")
MAX_CAR = 20          # por línea, en vertical cabe menos
MAX_LINEAS = 2
MIN_DUR = 0.42        # menos de esto y no da tiempo a leerlo


def limpiar(t):
    return t.strip()


def aplicar_correcciones(palabras):
    i = 0
    fuera = []
    while i < len(palabras):
        hecho = False
        for busca, pone in CORRECCIONES:
            n = len(busca)
            trozo = [limpiar(p["t"]).strip(".,;:?!").lower() for p in palabras[i:i + n]]
            if trozo == [b.lower() for b in busca]:
                t0 = palabras[i]["t0"]
                t1 = palabras[i + n - 1]["t1"]
                paso = (t1 - t0) / max(1, len(pone))
                for k, w in enumerate(pone):
                    # se conserva la puntuación final de la palabra original
                    orig = limpiar(palabras[i + n - 1]["t"])
                    signo = orig[-1] if k == len(pone) - 1 and FIN_FRASE.search(orig) else ""
                    fuera.append({"t": w + signo, "t0": t0 + k * paso, "t1": t0 + (k + 1) * paso})
                i += n
                hecho = True
                break
        if not hecho:
            fuera.append({"t": limpiar(palabras[i]["t"]), "t0": palabras[i]["t0"], "t1": palabras[i]["t1"]})
            i += 1
    return fuera


def envolver(palabras):
    """Reparte las palabras en líneas de MAX_CAR. Devuelve None si no caben."""
    lineas, linea = [], ""
    for w in palabras:
        if linea and len(linea) + 1 + len(w) > MAX_CAR:
            lineas.append(linea)
            linea = w
        else:
            linea = (linea + " " + w).strip()
        if len(linea) > MAX_CAR and len(lineas) + 1 > MAX_LINEAS:
            return None
    if linea:
        lineas.append(linea)
    return lineas if len(lineas) <= MAX_LINEAS else None


def agrupar(palabras):
    """Corta en subtítulos que SIEMPRE caben en dos líneas.

    La regla es cerrar antes de meter la palabra que no cabe, nunca recortar
    después: recortar pierde texto y en un subtítulo quemado eso no se ve hasta
    que el vídeo ya está entregado.
    """
    subs, actual = [], []

    def cerrar():
        if not actual:
            return
        textos = [p["t"] for p in actual]
        lineas = envolver(textos)
        assert lineas is not None, f"no cabe: {textos}"
        subs.append({
            "t0": round(actual[0]["t0"], 3),
            "t1": round(actual[-1]["t1"], 3),
            "lineas": lineas,
            "palabras": textos,
            "resalte": [bool(RESALTE.match(w)) for w in textos],
        })
        actual.clear()

    for p in palabras:
        if not p["t"]:
            continue
        if actual and envolver([x["t"] for x in actual] + [p["t"]]) is None:
            cerrar()
        actual.append(p)
        if FIN_FRASE.search(p["t"]) and sum(len(x["t"]) + 1 for x in actual) - 1 >= 14:
            cerrar()
    cerrar()

    # Un subtítulo de tres décimas parpadea: se funde con el anterior si el
    # resultado sigue cabiendo en dos líneas.
    fuera = []
    for s in subs:
        if fuera and s["t1"] - s["t0"] < MIN_DUR:
            ant = fuera[-1]
            juntas = ant["palabras"] + s["palabras"]
            lineas = envolver(juntas)
            if lineas is not None and s["t1"] - ant["t0"] < 4.2:
                ant.update(palabras=juntas, lineas=lineas,
                           resalte=ant["resalte"] + s["resalte"], t1=s["t1"])
                continue
        fuera.append(s)

    # Se alarga cada uno hasta que entra el siguiente: sin huecos la lectura es
    # continua y no parpadea entre frase y frase.
    for a, b in zip(fuera, fuera[1:]):
        if b["t0"] - a["t1"] < 0.34:
            a["t1"] = b["t0"]
    return fuera


def main():
    nombre = sys.argv[1]
    src = BASE / f"../trabajo/{nombre}-palabras.json"
    d = json.loads(src.read_text(encoding="utf-8"))
    palabras = [{"t": w["text"], "t0": w["offsets"]["from"] / 1000, "t1": w["offsets"]["to"] / 1000}
                for w in d["transcription"] if w["text"].strip()]
    palabras = aplicar_correcciones(palabras)
    subs = agrupar(palabras)
    entran = [p["t"] for p in palabras]
    salen = [w for s in subs for w in s["palabras"]]
    assert entran == salen, f"se perdieron palabras: {len(entran)} -> {len(salen)}"
    dst = BASE / f"subs-{nombre}.json"
    dst.write_text(json.dumps(subs, ensure_ascii=False, indent=1), encoding="utf-8")
    dur = sum(s["t1"] - s["t0"] for s in subs)
    print(f"{nombre}: {len(subs)} subtítulos · {dur:.0f}s con texto · "
          f"media {dur/len(subs):.2f}s · máx {max(len(' '.join(s['lineas'])) for s in subs)} caracteres")
    for s in subs[:6]:
        print(f"   {s['t0']:6.2f}-{s['t1']:6.2f}  {' / '.join(s['lineas'])}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Revisa una EDL antes de gastar veinte minutos de render en ella.

Todo lo que comprueba aquí ha fallado alguna vez a mano: un hueco de tres
centésimas entre dos cortes que deja un fotograma negro, un t0 a mitad de
palabra que se oye aunque solo cambie la imagen, un b-roll que se coló en dos
anuncios, la cartela de cierre con una coma distinta. Son baratas de comprobar
y caras de descubrir en el vídeo terminado.

Uso:
    python3 validar.py                 # los diez
    python3 validar.py anuncio-04
"""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
TOL = 0.011          # holgura de encadenado, por el redondeo a dos decimales
MIN_CORTE, MAX_CORTE = 1.55, 5.6


def palabras(nombre):
    """Los tramos que ocupa cada palabra, para saber si un corte parte alguna.

    La tabla de fronteras del guion (puntuación y pausas largas) era una
    SUGERENCIA para que los cortes cayeran en sitios con sentido. La regla dura
    es otra y más simple: un corte no puede caer dentro de una palabra. Varios
    montajes usaron los límites de `subs-*.json`, que salen del mismo transcript
    y también caen entre palabras; son igual de válidos.
    """
    d = json.loads((BASE / f"../trabajo/{nombre}-palabras.json").read_text(encoding="utf-8"))
    return [(x["offsets"]["from"] / 1000, x["offsets"]["to"] / 1000)
            for x in d["transcription"] if x["text"].strip()]


def parte_palabra(t, tramos, margen=0.045):
    """True si `t` cae dentro de una palabra y no cerca de su borde."""
    return any(a + margen < t < b - margen for a, b in tramos)


def revisar(nombre):
    fallos, avisos = [], []
    edl = json.loads((BASE / f"edl-{nombre}.json").read_text(encoding="utf-8"))
    tarj = json.loads((BASE / f"tarjetas-{nombre}.json").read_text(encoding="utf-8"))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str((BASE / edl["master"]).resolve())],
                               capture_output=True, text=True).stdout)
    cortes = edl["cortes"]
    # El anuncio 1 se montó a mano antes de que existiera la tabla de fronteras,
    # así que sus cortes no salen de ella y no tiene sentido medirlo contra ella.
    guion = BASE / "guiones" / f"a{nombre.split('-')[1]}.md"
    tramos = palabras(nombre) if guion.exists() else None

    if abs(edl["duracion"] - dur) > 0.06:
        fallos.append(f"duracion dice {edl['duracion']} y el máster dura {dur:.2f}")
    if abs(cortes[0]["t0"]) > TOL:
        fallos.append(f"el primer corte empieza en {cortes[0]['t0']}, no en 0")
    if abs(cortes[-1]["t1"] - dur) > 0.06:
        fallos.append(f"el último corte acaba en {cortes[-1]['t1']} y el máster en {dur:.2f}")

    for k, (a, b) in enumerate(zip(cortes, cortes[1:])):
        if abs(a["t1"] - b["t0"]) > TOL:
            fallos.append(f"corte {k}→{k+1}: hueco/solape de {b['t0']-a['t1']:+.3f}s")
    for k, c in enumerate(cortes):
        d = c["t1"] - c["t0"]
        if d < MIN_CORTE: fallos.append(f"corte {k} dura {d:.2f}s (mínimo {MIN_CORTE})")
        if d > MAX_CORTE: avisos.append(f"corte {k} dura {d:.2f}s (tope {MAX_CORTE})")
        for lim, cual in (((c["t0"], "t0"), (c["t1"], "t1")) if tramos else ()):
            if parte_palabra(lim, tramos):
                fallos.append(f"corte {k}: {cual}={lim} cae a mitad de palabra")

    # planos: ni dos seguidos iguales, ni dos b-roll pegados
    for k, (a, b) in enumerate(zip(cortes, cortes[1:])):
        if "broll" in a and "broll" in b:
            fallos.append(f"cortes {k} y {k+1}: dos b-roll seguidos")
        if a.get("plano") and a.get("plano") == b.get("plano"):
            fallos.append(f"cortes {k} y {k+1}: mismo plano {a['plano']} repetido")
    # Volver al mismo encuadre justo después del b-roll hace que el recurso se
    # lea como una interrupción y no como un corte: parece que se fue la señal.
    for k in range(1, len(cortes) - 1):
        if ("broll" in cortes[k] and cortes[k - 1].get("plano")
                and cortes[k - 1].get("plano") == cortes[k + 1].get("plano")):
            fallos.append(f"corte {k+1}: vuelve al plano {cortes[k+1]['plano']} "
                          f"justo después del b-roll")

    # b-roll: exactamente el reservado, ni uno más
    rep = json.loads((BASE / "reparto-broll.json").read_text(encoding="utf-8"))
    # El anuncio 1 se montó antes de que existiera el reparto: su b-roll está en
    # recursos-usados.json y no hay nada que contrastar aquí.
    espera = {c[0].split("/")[-1] for c in rep[nombre]["clips"]} if nombre in rep else None
    puesto = [c["broll"]["src"].split("/")[-1] for c in cortes if "broll" in c]
    movil = [s for s in puesto if "Movil" in s]
    resto = [s for s in puesto if "Movil" not in s]
    if len(movil) != 1:
        fallos.append(f"el clip del móvil aparece {len(movil)} veces, tiene que ser 1")
    if espera is not None and set(resto) != espera:
        if espera - set(resto): fallos.append(f"b-roll sin colocar: {sorted(espera-set(resto))}")
        if set(resto) - espera: fallos.append(f"b-roll no reservado: {sorted(set(resto)-espera)}")
    if len(resto) != len(set(resto)):
        fallos.append("hay un clip de b-roll repetido dentro del mismo anuncio")

    # tarjetas
    ids = [t["id"] for t in tarj]
    for req in ("gancho", "fecha", "movil", "cierre"):
        if req not in ids: fallos.append(f"falta la tarjeta «{req}»")
    for a, b in zip(sorted(tarj, key=lambda t: t["t0"]), sorted(tarj, key=lambda t: t["t0"])[1:]):
        if b["t0"] < a["t1"] - 0.01:
            fallos.append(f"tarjetas «{a['id']}» y «{b['id']}» se solapan")
    for t in tarj:
        if t["t1"] > dur + 0.06: fallos.append(f"la tarjeta «{t['id']}» sale del vídeo")
    ref = {t["id"]: t for t in json.loads((BASE / "tarjetas-anuncio-01.json").read_text(encoding="utf-8"))}
    for t in tarj:
        if t["id"] == "cierre" and t["html"] != ref["cierre"]["html"]:
            fallos.append("la cartela de cierre no es idéntica a la del anuncio 1")
        if t["id"] == "fecha":
            if "17 de septiembre" not in t["html"] or "6:00 p. m." not in t["html"]:
                fallos.append("la ficha de fecha cambió la fecha o la hora")
        if t["id"] == "movil" and not t.get("tapaSubs"):
            fallos.append("la tarjeta del móvil no lleva tapaSubs")

    medias = sum(c["t1"] - c["t0"] for c in cortes) / len(cortes)
    return fallos, avisos, f"{len(cortes)} cortes · media {medias:.2f}s · {len(resto)} b-roll + móvil · {len(tarj)} tarjetas"


def main():
    nombres = sys.argv[1:] or [f"anuncio-{i:02d}" for i in range(1, 11)]
    malos = 0
    for n in nombres:
        if not (BASE / f"edl-{n}.json").exists():
            print(f"{n}: sin EDL todavía"); continue
        try:
            fallos, avisos, resumen = revisar(n)
        except Exception as e:
            print(f"{n}: NO SE PUDO REVISAR — {type(e).__name__}: {e}"); malos += 1; continue
        marca = "OK  " if not fallos else "MAL "
        print(f"{marca}{n}: {resumen}")
        for f in fallos: print(f"      ✗ {f}")
        for a in avisos: print(f"      · {a}")
        malos += bool(fallos)
    raise SystemExit(1 if malos else 0)


if __name__ == "__main__":
    main()

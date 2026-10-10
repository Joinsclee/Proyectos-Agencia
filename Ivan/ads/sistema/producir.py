#!/usr/bin/env python3
"""Lleva un anuncio de la EDL al MP4 subido a Drive, y deja el disco limpio.

Cuatro pasos, en este orden y sin saltarse ninguno:

    validar → montar → rótulos (Chrome) → componer → subir → limpiar

Existe porque el disco de esta máquina va al límite: los intermedios de un
anuncio pesan unos 350 MB (los trozos del montaje, el montaje concatenado y las
pistas alfa) y nueve anuncios a la vez no caben. Se borran en cuanto el MP4
está subido y verificado por tamaño contra el fichero local; si la subida falla,
NO se borra nada.

Uso:
    python3 producir.py anuncio-02
    python3 producir.py anuncio-02 anuncio-03 ...
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
PW = Path("/Users/cristhian/Downloads/Paginas Web/Playwright")
CARPETA = "1tGAItdoa8wPidkFbFcxCSMCMEmnbep6U"      # Drive: entregas de anuncios


# Node resuelve los módulos desde la carpeta del SCRIPT, no desde el cwd, y
# `rotulos.cjs` vive en sistema/ mientras que playwright está instalado en
# Playwright/. Sin esto el render se cae después de montar, o sea después de
# haber gastado el minuto caro.
ENTORNO = dict(os.environ, NODE_PATH=str(PW / "node_modules"))


def sh(cmd, cwd=None, que=""):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=ENTORNO)
    if r.returncode:
        sys.stderr.write(f"\n✗ {que or cmd[0]}\n{r.stdout[-2000:]}\n{r.stderr[-3000:]}\n")
        raise SystemExit(f"falló: {que or ' '.join(cmd[:3])}")
    return r.stdout.strip()


def libre():
    s = shutil.disk_usage("/System/Volumes/Data")
    return s.free / 2**30


def producir(nombre):
    print(f"\n{'='*64}\n{nombre}   ({libre():.1f} GB libres)\n{'='*64}")

    print("· validando la EDL")
    print("  " + sh(["python3", str(BASE / "validar.py"), nombre], cwd=BASE, que="validar"))

    print("· montando")
    sh(["python3", str(BASE / "montar.py"), str(BASE / f"edl-{nombre}.json")], cwd=BASE, que="montar")

    print("· dibujando rótulos en Chrome")
    for cual in ("subs", "tarjetas"):
        sh(["node", str(BASE / "rotulos.cjs"), cual, nombre], cwd=PW, que=f"rotulos {cual}")
    if (BASE / f"infografias-{nombre}.json").exists():
        print("· dibujando la infografía animada")
        print("  " + sh(["node", str(BASE / "infografias.cjs"), nombre], cwd=PW,
                        que="infografias").strip())

    print("· componiendo")
    print("  " + sh(["python3", str(BASE / "componer.py"), nombre], cwd=BASE, que="componer").splitlines()[-1])

    mp4 = BASE / "entrega" / f"{nombre}.mp4"
    local = mp4.stat().st_size
    print(f"· subiendo a Drive ({local/2**20:.0f} MB)")
    sh(["rclone", "copy", str(mp4), "--drive-root-folder-id", CARPETA, "gdrive:"], que="rclone copy")
    remoto = sh(["rclone", "lsjson", "--drive-root-folder-id", CARPETA, "gdrive:", "--files-only"])
    fila = next((x for x in json.loads(remoto) if x["Name"] == mp4.name), None)
    if not fila or fila["Size"] != local:
        raise SystemExit(f"la subida no cuadra: local {local}, remoto {fila and fila['Size']}")
    print(f"  subido y verificado ({fila['Size']} bytes)")

    print("· limpiando intermedios")
    shutil.rmtree(BASE / "_tmp" / nombre, ignore_errors=True)
    shutil.rmtree(BASE / "_rot" / nombre, ignore_errors=True)
    (BASE / "salida" / f"{nombre}-montado.mp4").unlink(missing_ok=True)
    print(f"  hecho · {libre():.1f} GB libres")


if __name__ == "__main__":
    for n in sys.argv[1:]:
        producir(n)

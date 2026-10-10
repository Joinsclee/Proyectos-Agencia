#!/usr/bin/env python3
"""Renderiza una pieza de principio a fin, de una en una (hay un candado).

    cd <modalidad>/sistema
    python3 ../../herramientas/render.py venta-03            # montaje + rótulos + composición
    python3 ../../herramientas/render.py venta-03 --rotulos  # sin volver a montar (solo cambió texto/tarjetas/infografía)

Esta máquina tiene 8 GB de RAM: dos montajes 4K a la vez la tumban. Por eso
todos los agentes pasan por el mismo candado y esperan su turno.
No sube nada a Drive ni borra la entrega. Al terminar deja una hoja de control
con un fotograma cada segundo en _previa/<nombre>-hoja-N.jpg.
"""
import fcntl, os, shutil, subprocess, sys, time
from pathlib import Path

SK = Path.home() / ".claude/skills/montaje-vertical-clee/scripts"
PW = "/Users/cristhian/Downloads/Paginas Web/Playwright/node_modules"
BASE = Path.cwd()
CANDADO = Path(__file__).resolve().parent / ".render.lock"


def sh(args, **kw):
    print("$", " ".join(str(a) for a in args[:4]), "…", flush=True)
    subprocess.run(args, check=True, **kw)


def main():
    nombre = sys.argv[1]
    solo_rotulos = "--rotulos" in sys.argv
    env = dict(os.environ, NODE_PATH=PW, PROYECTO_BASE=str(BASE))
    with open(CANDADO, "w") as f:
        t = time.time()
        print("esperando turno de render…", flush=True)
        fcntl.flock(f, fcntl.LOCK_EX)
        print(f"turno conseguido tras {time.time() - t:.0f} s · libre {shutil.disk_usage('/').free / 1e9:.1f} GB", flush=True)
        sh(["python3", SK / "validar.py", nombre])
        montado = BASE / "salida" / f"{nombre}-montado.mp4"
        if not solo_rotulos or not montado.exists():
            sh(["python3", SK / "montar.py", f"edl-{nombre}.json"])
            shutil.rmtree(BASE / "_tmp" / nombre, ignore_errors=True)
        rot = BASE / "_rot" / nombre
        shutil.rmtree(rot, ignore_errors=True)
        sh(["node", SK / "rotulos.cjs", "subs", nombre], env=env, cwd=Path(PW).parent)
        sh(["node", SK / "rotulos.cjs", "tarjetas", nombre], env=env, cwd=Path(PW).parent)
        if (BASE / f"infografias-{nombre}.json").exists():
            sh(["node", SK / "infografias.cjs", nombre], env=env, cwd=Path(PW).parent)
        sh(["python3", SK / "componer.py", nombre])
    mp4 = BASE / "entrega" / f"{nombre}.mp4"
    prev = BASE / "_previa"
    prev.mkdir(exist_ok=True)
    for p in prev.glob(f"{nombre}-hoja-*.jpg"):
        p.unlink()
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]))
    n = int(dur) + 1
    for k in range(0, n, 12):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(k + 0.5), "-i", mp4, "-vf",
                        "fps=1,scale=270:480,tile=6x2", "-frames:v", "1", prev / f"{nombre}-hoja-{k // 12}.jpg"], check=True)
    print(f"✓ {mp4} · {dur:.2f} s · hojas en _previa/{nombre}-hoja-*.jpg (un fotograma por segundo, desde el 0,5; 12 por hoja)")


if __name__ == "__main__":
    main()

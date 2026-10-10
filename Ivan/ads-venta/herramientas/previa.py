#!/usr/bin/env python3
"""Fotograma de control de una pieza en el segundo t, sin renderizar el anuncio.

    cd <modalidad>/sistema
    python3 ../../herramientas/previa.py venta-03 1.2 7.5 20.4      # uno o varios segundos
    → _previa/venta-03-t1.20.jpg …  (540x960)
    python3 ../../herramientas/previa.py venta-03 --hoja            # un fotograma por segundo (0,5; 1,5; …)
    → _previa/venta-03-borrador-N.jpg  (12 por hoja, 6x2, como las hojas del render)

Compone lo mismo que componer.py en ese instante: el plano o el b-roll de la
EDL, la tarjeta activa (si ya se dibujó con rotulos.cjs tarjetas), el subtítulo
activo (rotulos.cjs subs) y la infografía (infografias.cjs). Dibuja en rojo las
zonas que tapa Instagram (250 arriba, 420 abajo) y en azul el borde superior de
la banda de subtítulos (1150). Sirve para ver si un rótulo tapa la cara.
"""
import json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw

BASE = Path.cwd()
W, H = 1080, 1920


def fotograma_video(src, t, crop):
    vf = (f"crop={crop}," if crop else "") + f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0, t):.3f}", "-i", str(src), "-frames:v", "1",
                          "-vf", vf, "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    from io import BytesIO
    return Image.open(BytesIO(out)).convert("RGBA")


def main(nombre, tiempos):
    edl = json.loads((BASE / f"edl-{nombre}.json").read_text())
    tarj = json.loads((BASE / f"tarjetas-{nombre}.json").read_text()) if (BASE / f"tarjetas-{nombre}.json").exists() else []
    subs = json.loads((BASE / f"subs-{nombre}.json").read_text()) if (BASE / f"subs-{nombre}.json").exists() else []
    infos = json.loads((BASE / f"infografias-{nombre}.json").read_text()) if (BASE / f"infografias-{nombre}.json").exists() else []
    rot = BASE / "_rot" / nombre
    (BASE / "_previa").mkdir(exist_ok=True)
    for t in tiempos:
        c = next((c for c in edl["cortes"] if c["t0"] <= t < c["t1"]), edl["cortes"][-1])
        if "broll" in c:
            b = c["broll"]
            src = (BASE / b["src"]).resolve()
            if b["tipo"] == "foto":
                im = Image.open(src).convert("RGBA")
                r = W / H
                iw, ih = im.size
                if iw / ih > r:
                    cw = round(ih * r); x = (iw - cw) // 2; im = im.crop((x, 0, x + cw, ih))
                else:
                    ch = round(iw / r); y = (ih - ch) // 2; im = im.crop((0, y, iw, y + ch))
                im = im.resize((W, H))
                que = f"FOTO {src.name}"
            else:
                im = fotograma_video(src, b["in"] + (t - c["t0"]), b.get("crop"))
                que = f"BROLL {src.name}"
        else:
            im = fotograma_video((BASE / edl["master"]).resolve(), t, edl["planos"][c["plano"]]["crop"])
            que = f"PLANO {c['plano']}"
        sub_activo = None
        tapa = False
        for x in tarj:
            if x["t0"] <= t < x["t1"]:
                p = rot / "tarjetas" / f"{x['id']}.png"
                if p.exists():
                    im.alpha_composite(Image.open(p).convert("RGBA"))
                que += f" + {x['id']}"
                tapa = tapa or x.get("tapaSubs") or x["id"] in ("gancho", "cierre")
        for x in infos:
            if x["t0"] <= t < x["t1"]:
                d = rot / "info" / x["id"]
                pngs = sorted(d.glob("*.png")) if d.exists() else []
                if pngs:
                    k = min(len(pngs) - 1, int((t - x["t0"]) * 25))
                    im.alpha_composite(Image.open(pngs[k]).convert("RGBA"), (0, int(x.get("y", 680))))
                que += f" + info:{x['id']}"
        if not tapa:
            for i, s in enumerate(subs):
                if s["t0"] <= t < s["t1"]:
                    p = rot / "subs" / f"{i:03d}.png"
                    if p.exists():
                        im.alpha_composite(Image.open(p).convert("RGBA"), (0, 1150))
                    que += f" + sub{i}"
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, W, 250), outline=(255, 0, 0, 255), width=4)
        d.rectangle((0, 1500, W, H - 1), outline=(255, 0, 0, 255), width=4)
        d.line((0, 1150, W, 1150), fill=(0, 140, 255, 255), width=3)
        out = BASE / "_previa" / f"{nombre}-t{t:05.2f}.jpg"
        im.convert("RGB").resize((540, 960)).save(out, quality=85)
        print(out.relative_to(BASE), "·", que)


def hoja(nombre):
    edl = json.loads((BASE / f"edl-{nombre}.json").read_text())
    dur = edl["cortes"][-1]["t1"]
    ts = [k + 0.5 for k in range(int(dur))]
    main(nombre, ts)
    prev = BASE / "_previa"
    for p in prev.glob(f"{nombre}-borrador-*.jpg"):
        p.unlink()
    for g in range(0, len(ts), 12):
        lote = ts[g:g + 12]
        lienzo = Image.new("RGB", (6 * 270, 2 * 480), "black")
        for i, t in enumerate(lote):
            f = prev / f"{nombre}-t{t:05.2f}.jpg"
            im = Image.open(f).resize((270, 480))
            ImageDraw.Draw(im).text((6, 6), f"{t:.1f}s", fill=(255, 255, 0))
            lienzo.paste(im, ((i % 6) * 270, (i // 6) * 480))
            f.unlink()
        out = prev / f"{nombre}-borrador-{g // 12}.jpg"
        lienzo.save(out, quality=85)
        print(out.relative_to(BASE))


if __name__ == "__main__":
    if "--hoja" in sys.argv:
        hoja(sys.argv[1])
    else:
        main(sys.argv[1], [float(x) for x in sys.argv[2:]])

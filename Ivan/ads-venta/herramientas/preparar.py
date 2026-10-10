#!/usr/bin/env python3
"""Prepara material vertical para la tanda de ADS de venta.

    python3 preparar.py foto <src> <nombre> [xfrac]    # recorte 9:16 de una foto → fuentes/fotos-9x16/<nombre>.jpg
    python3 preparar.py mockup <src> <nombre>          # mockup entero sobre fondo de marca → fuentes/mockups-9x16/<nombre>.jpg
    python3 preparar.py clip <nombre-en-drive> <inicio> <dur>   # trae un tramo del b-roll → fuentes/broll/<stem>_<inicio>.mp4

Las fotos se recortan aquí y no en montar.py porque su Ken Burns centra el
recorte: si el motivo no está en el centro, se pierde. El mockup no se recorta
nunca (su LEEME lo prohíbe): va entero, con margen para el 9 % de zoom y por
encima de la banda de subtítulos (y=1150).
"""
import subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "fuentes"
S = 4 / 3                      # se trabaja a 1440x2560 (1080x1920 × 4/3)
W, H = 1440, 2560


def foto(src, nombre, xfrac=0.5):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = im.size
    cw = round(h * 9 / 16)
    if cw > w:                      # foto vertical más estrecha que 9:16
        ch = round(w * 16 / 9)
        y = (h - ch) // 2
        im = im.crop((0, y, w, y + ch))
    else:
        x = round((w - cw) * float(xfrac))
        im = im.crop((x, 0, x + cw, h))
    im = im.resize((W, H), Image.LANCZOS) if im.size[1] > H else im
    out = FUENTES / "fotos-9x16" / f"{nombre}.jpg"
    im.save(out, quality=92)
    print(out, im.size)


def mockup(src, nombre, disposicion="centro"):
    fondo = Image.new("RGB", (W, H), (6, 31, 29))
    # degradado vertical sutil hacia el verde de marca
    g = Image.linear_gradient("L").resize((W, H))
    verde = Image.new("RGB", (W, H), (15, 70, 64))
    fondo = Image.composite(verde, fondo, g.point(lambda v: int(v * 0.55)))
    m = Image.open(src).convert("RGBA")
    mw, mh = m.size
    if disposicion == "uvp":
        # deja libre la franja 280-580 para la promesa en grande (tarjeta
        # «uvp»): la pieza va de ~600 a ~1130, por encima de los subtítulos
        alto_max = int(530 * S)
        if mw / mh > 1.2:
            ancho = min(int(960 * S), round(alto_max * mw / mh))
        else:
            ancho = min(int(560 * S), round(alto_max * mw / mh))
        cy = int(865 * S)
    elif mw / mh > 1.2:             # composición horizontal
        ancho = int(940 * S)
        cy = int(720 * S)
    else:                           # pieza cuadrada
        ancho = int(800 * S)
        cy = int(720 * S)
    alto = round(ancho * mh / mw)
    m = m.resize((ancho, alto), Image.LANCZOS)
    x, y = (W - ancho) // 2, cy - alto // 2
    # halo difuso detrás, para que la pieza no parezca pegada
    halo = Image.new("L", (W, H), 0)
    ImageDraw.Draw(halo).rounded_rectangle((x - 30, y - 10, x + ancho + 30, y + alto + 60), 60, fill=150)
    halo = halo.filter(ImageFilter.GaussianBlur(70))
    fondo = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), fondo, halo)
    mascara = Image.new("L", (ancho, alto), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, ancho, alto), int(28 * S), fill=255)
    fondo.paste(m.convert("RGB"), (x, y), mascara)
    out = FUENTES / "mockups-9x16" / f"{nombre}.jpg"
    fondo.save(out, quality=93)
    print(out, (x, y, ancho, alto))


def clip(nombre, inicio, dur):
    stem = Path(nombre).stem
    out = FUENTES / "broll" / f"{stem}_{float(inicio):g}.mp4"
    if out.exists():
        print(out, "(ya estaba)"); return
    url = "http://127.0.0.1:8765/" + nombre.replace(" ", "%20")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(inicio), "-i", url, "-t", str(dur),
                    "-map", "0:v:0", "-an", "-c:v", "copy", str(out)], check=True)
    print(out)


if __name__ == "__main__":
    que, *args = sys.argv[1:]
    {"foto": foto, "mockup": mockup, "clip": clip}[que](*args)

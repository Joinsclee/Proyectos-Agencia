"""
Baja el peso del PDF recomprimiendo SOLO las fotos opacas.

El texto y los enlaces se quedan como están: rasterizar el PDF entero lo
dejaría más ligero, pero se llevaría por delante los hipervínculos y el
texto seleccionable, y el libro los usa.

LO QUE NO SE TOCA, Y POR QUÉ
  Una imagen con /SMask o /Mask lleva transparencia en un objeto aparte.
  JPEG no guarda canal alfa, así que al recomprimirla y quitarle la máscara
  el fondo transparente se vuelve un rectángulo NEGRO. Pasó con el logo de
  Colombia Birdfair y con la foto recortada de Gina. Esas imágenes se dejan
  intactas: son logos y recortes, pesan poco, y el ahorro real está en las
  fotos grandes a sangre.
  Lo mismo con /ImageMask (plantillas de 1 bit) y con JPXDecode.
"""
import io, sys
import pikepdf
from PIL import Image

ORIGEN, DESTINO = sys.argv[1], sys.argv[2]
CALIDAD = int(sys.argv[3]) if len(sys.argv) > 3 else 72
ANCHO_MAX = 1600

def filtros(obj):
    f = obj.get('/Filter')
    if f is None: return []
    return [str(f)] if isinstance(f, pikepdf.Name) else [str(x) for x in f]

pdf = pikepdf.open(ORIGEN)
tocadas = saltadas = ahorro = 0
vistas = set()

for pagina in pdf.pages:
    recursos = pagina.get('/Resources')
    if recursos is None or '/XObject' not in recursos:
        continue
    for nombre, obj in list(recursos['/XObject'].items()):
        try:
            if obj.get('/Subtype') != '/Image':
                continue
            clave = obj.objgen
            if clave in vistas:
                continue
            vistas.add(clave)

            # Las que llevan transparencia o son plantillas: ni tocarlas.
            if '/SMask' in obj or '/Mask' in obj or obj.get('/ImageMask'):
                saltadas += 1; continue
            if any('JPX' in f for f in filtros(obj)):
                saltadas += 1; continue

            antes = len(obj.read_raw_bytes())
            if antes < 60000:          # miniaturas y viñetas: no compensa
                saltadas += 1; continue

            img = pikepdf.PdfImage(obj).as_pil_image()
            if img.mode == 'RGBA' or (img.mode == 'P' and 'transparency' in img.info):
                saltadas += 1; continue        # alfa por otra vía
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            if img.width > ANCHO_MAX:
                img = img.resize((ANCHO_MAX, round(img.height * ANCHO_MAX / img.width)),
                                 Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, 'JPEG', quality=CALIDAD, optimize=True, progressive=True)
            datos = buf.getvalue()
            if len(datos) >= antes:
                saltadas += 1; continue

            obj.write(datos, filter=pikepdf.Name('/DCTDecode'))
            obj.ColorSpace = pikepdf.Name('/DeviceGray' if img.mode == 'L' else '/DeviceRGB')
            obj.BitsPerComponent = 8
            obj.Width, obj.Height = img.width, img.height
            for k in ('/Decode', '/DecodeParms'):
                if k in obj: del obj[k]
            tocadas += 1
            ahorro += antes - len(datos)
        except Exception as err:
            saltadas += 1
            print(f'  (se deja como está {nombre}: {err})')

pdf.save(DESTINO, linearize=True, compress_streams=True,
         object_stream_mode=pikepdf.ObjectStreamMode.generate)
print(f'  {tocadas} recomprimidas · {saltadas} intactas · {ahorro/1e6:.1f} MB menos en imágenes')

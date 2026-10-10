#!/usr/bin/env python3
"""
Convierte una presentación de clase en un bloque Custom HTML de GHL.

El problema que resuelve: el archivo local enlaza `_base.css`, `deck-stage.js`
y `img/*` con rutas relativas. Dentro de GHL esas rutas se resuelven contra
el dominio del sitio (lahuertalab.com/_base.css) y dan 404, así que el
componente <deck-stage> nunca se define y las diapositivas caen apiladas y
sin estilo. Aquí se empotra el CSS y el JS en el propio bloque y se cambian
las imágenes por sus URL del CDN.

Y un segundo problema: el CSS de la presentación asume que es dueña del
documento (`*`, `html,body`, `h1`, `h2`…). Dentro de una página de GHL eso
arrasaría con la cabecera, el pie y el editor. Cada regla se encierra bajo
`deck-stage`.

    python3 construir-ghl.py Clase1-Un-viaje-a-la-regeneracion.html cdn-clase1.txt

`cdn-claseN.txt` son líneas `nombre.jpg|https://assets.cdn.filesafe.space/...`
y viven AQUÍ, al lado de este script. Estuvieron en una carpeta temporal y se
perdieron tres veces; reconstruirlas obliga a cruzar cada diapositiva con el
bloque ya publicado. Una imagen nueva se sube al CDN y su línea se añade al
final del archivo: las de abajo mandan sobre las de arriba. Ojo: el script
también reescribe las rutas que hay dentro de comentarios HTML, así que una
diapositiva retirada con <!-- --> sigue necesitando su línea.
"""
import base64, mimetypes, re, sys, os

def bloques(css):
    """Trocea el CSS contando llaves, para no romper los @keyframes."""
    fuera, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            resto = css[i:].strip()
            if resto:
                fuera.append(('texto', resto, None))
            break
        sel, d, k = css[i:j], 1, j + 1
        while k < n and d:
            d += (css[k] == '{') - (css[k] == '}')
            k += 1
        fuera.append(('regla', sel, css[j + 1:k - 1]))
        i = k
    return fuera


def encerrar(sel):
    """Mete un selector debajo de deck-stage. Devuelve None si hay que tirarlo."""
    comentario = ''
    m = re.match(r'\s*((?:/\*.*?\*/\s*)*)(.*)$', sel, re.S)
    if m:
        comentario, sel = m.group(1), m.group(2)
    partes = [p.strip() for p in sel.split(',') if p.strip()]
    if not partes:
        return None
    if partes == ['html', 'body']:
        return None                                   # alto y fondo del documento: no aplica
    salida = []
    for p in partes:
        if p == ':root' or p == 'body':
            salida.append('deck-stage')               # las variables y la tipografía, al anfitrión
        elif p == '*':
            salida.extend(['deck-stage', 'deck-stage *'])
        elif p.startswith('deck-stage'):
            salida.append(p)
        else:
            salida.append('deck-stage ' + p)
    vistos, limpio = set(), []
    for p in salida:
        if p not in vistos:
            vistos.add(p); limpio.append(p)
    return comentario + ',\n'.join(limpio)


def css_encerrado_texto(css):
    """Encierra CSS del sistema o de un <style> propio de la presentación."""
    fuera = []
    for tipo, sel, cuerpo in bloques(css):
        if tipo == 'texto':
            fuera.append(sel)
            continue
        if re.search(r'@keyframes', sel):
            fuera.append(f'{sel.strip()}{{{cuerpo}}}')   # globales, ya llevan prefijo lh-
            continue
        nuevo = encerrar(sel)
        if nuevo is None:
            continue
        fuera.append(f'{nuevo}{{{cuerpo}}}')
    return '\n'.join(fuera)


def css_encerrado(ruta):
    return css_encerrado_texto(open(ruta, encoding='utf-8').read())


ARRANQUE = """<script>
/* GHL envuelve el bloque en secciones propias, y algunas llevan `transform`.
   Un ancestro transformado convierte el `position:fixed` del componente en
   relativo a esa caja: la presentación se encoge al ancho de la columna en
   vez de ocupar la pantalla. Cuando se detecta uno de esos ancestros, el
   <deck-stage> se cuelga directamente del <body>.

   Va ANTES de definir el elemento a propósito: en este punto todavía es un
   nodo inerte, así que moverlo no dispara ningún montaje ni desmontaje.
   Se repite tras la hidratación porque GHL puede volver a envolverlo. */
(function () {
  var MUEVE = /translate|scale|rotate|matrix|perspective/;

  function ancestroQueEstorba(el) {
    for (var e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      var s = getComputedStyle(e);
      if ((s.transform && s.transform !== 'none') ||
          (s.perspective && s.perspective !== 'none') ||
          (s.filter && s.filter !== 'none') ||
          (s.backdropFilter && s.backdropFilter !== 'none') ||
          (s.willChange && MUEVE.test(s.willChange)) ||
          (s.contain && /paint|layout|strict|content/.test(s.contain))) return e;
    }
    return null;
  }

  function enVertical() { return window.innerHeight > window.innerWidth; }

  function recolocar() {
    var d = document.querySelector('deck-stage');
    if (!d || !document.body || d.parentElement === document.body) return;
    /* En vertical no se toca: ahi no es una capa a pantalla completa, sino un
       bloque en el flujo de la pagina, y colgarlo del <body> lo mandaria
       detras de todo el contenido. */
    if (enVertical()) return;
    if (ancestroQueEstorba(d)) document.body.appendChild(d);
  }

  recolocar();
  window.addEventListener('load', recolocar);
  document.addEventListener('hydrationDone', recolocar);
  setTimeout(recolocar, 1200);
  setTimeout(recolocar, 3500);
})();
</script>"""

CONTROLES = """<style>
/* Las barras del letterbox: el componente las pinta negras. En verde
   profundo de marca la pantalla entera se lee como una sola pieza en vez
   de como una diapositiva pequeña dentro de un marco negro. */
deck-stage{background:#061F1D}

/* En vertical, un lienzo 16:9 encajado a pantalla completa deja dos bandas
   enormes: medido en un movil de 390x844, la presentacion se quedaba en el
   26 % del alto, y en una tableta de 768x1024 en el 42 %. Por debajo de 1:1
   deja de ser una capa que tapa la pantalla y se comporta como un
   reproductor: ancho completo, 16:9 de alto, y la pagina se desplaza normal.

   El 56,25vw no es un numero redondo elegido a ojo: el motor escala con
   min(vw/1920, vh/1080), y en vertical manda la anchura, asi que el lienzo
   mide exactamente 1080*(vw/1920) = 0,5625*vw de alto. Coincide al pixel.

   El ancho va con el truco de siempre en GHL, porque la columna que envuelve
   el bloque casi nunca llega al borde. */
@media (max-aspect-ratio: 1/1){
  deck-stage{
    position:relative;inset:auto;z-index:auto;
    width:100vw;margin-left:calc(50% - 50vw);
    height:56.25vw;
    /* Las zonas tactiles y el contador del motor son `position:fixed`: en
       modo capa eso estaba bien, pero aqui seguirian tapando la pantalla
       entera y cualquier toque en la pagina pasaria de diapositiva. Medido:
       el bloque ocupaba 390x219 y las zonas 390x844. Un `transform` en el
       anfitrion lo convierte en el bloque contenedor de sus descendientes
       fijos, que es justo la trampa del punto 3 del procedimiento de GHL,
       usada aqui a proposito. */
    transform:translateZ(0);
  }
}

/* Botón de pantalla completa. Se crea desde JS y se cuelga del <body>,
   igual que el componente: si quedara dentro de una sección de GHL con
   `transform`, su `position:fixed` se rompería exactamente igual. */
.lhp-fs{
  position:fixed;right:22px;bottom:22px;z-index:2147483001;
  display:inline-flex;align-items:center;gap:10px;
  padding:11px 18px;border:1px solid rgba(201,222,63,.45);border-radius:999px;
  background:rgba(6,31,29,.82);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  color:#C9DE3F;font:700 13px/1 'Archivo',system-ui,sans-serif;
  letter-spacing:.14em;text-transform:uppercase;cursor:pointer;
  transition:opacity .3s ease,transform .3s ease,background .2s ease;
}
.lhp-fs:hover{background:rgba(6,31,29,.96);border-color:#C9DE3F}
.lhp-fs:focus-visible{outline:2px solid #C9DE3F;outline-offset:3px}
/* Se retira sola tras un rato quieto, como los controles de un reproductor. */
.lhp-fs.lhp-dormido{opacity:0;transform:translateY(10px);pointer-events:none}
@media(max-width:600px){.lhp-fs{right:12px;bottom:12px;padding:9px 14px;font-size:11px;letter-spacing:.1em}}
</style>
<script>
(function () {
  var raiz = document.documentElement;
  var pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
  var salir = document.exitFullscreen || document.webkitExitFullscreen;
  if (!pedir) return;                       // iPhone: no hay API, no se pinta el botón

  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'lhp-fs';
  b.innerHTML = '<span aria-hidden="true">\\u26F6</span><span class="lhp-txt">Pantalla completa</span>';
  var txt = b.querySelector('.lhp-txt');

  function completa() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function alternar() { completa() ? salir.call(document) : pedir.call(raiz); }
  function pintar() {
    txt.textContent = completa() ? 'Salir' : 'Pantalla completa';
    b.setAttribute('aria-label', txt.textContent);
  }

  b.addEventListener('click', alternar);
  document.addEventListener('fullscreenchange', pintar);
  document.addEventListener('webkitfullscreenchange', pintar);

  // F alterna, como en cualquier reproductor. El componente no usa esa tecla.
  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); alternar(); }
  });

  var reloj = null;
  function despertar() {
    b.classList.remove('lhp-dormido');
    clearTimeout(reloj);
    reloj = setTimeout(function () { b.classList.add('lhp-dormido'); }, 2600);
  }
  window.addEventListener('mousemove', despertar, { passive: true });
  window.addEventListener('touchstart', despertar, { passive: true });

  function montar() {
    if (!document.body) return setTimeout(montar, 60);
    if (!b.isConnected) document.body.appendChild(b);
    pintar();
    despertar();
  }
  montar();
})();
</script>"""

def main():
    origen, mapa_txt = sys.argv[1], sys.argv[2]
    base = os.path.dirname(os.path.abspath(origen)) or '.'
    src = open(origen, encoding='utf-8').read()

    urls = {}
    for linea in open(mapa_txt, encoding='utf-8'):
        if '|' not in linea:
            continue
        n, u = linea.strip().split('|', 1)
        if u.startswith('inline:'):
            ruta = os.path.join(base, u.removeprefix('inline:'))
            mime = mimetypes.guess_type(ruta)[0] or 'application/octet-stream'
            datos = base64.b64encode(open(ruta, 'rb').read()).decode('ascii')
            u = f'data:{mime};base64,{datos}'
        urls[os.path.splitext(n)[0]] = u

    # `src.index('<deck-stage')` a secas encuentra la PRIMERA aparición del
    # texto, y basta con que alguien nombre la etiqueta en un comentario del
    # <head> para que el cuerpo empiece dentro de una hoja de estilos y el
    # bloque salga roto. Ya pasó una vez. Se busca a partir de </head>.
    desde = src.index('</head>') if '</head>' in src else 0
    # Las presentaciones nuevas pueden traer estilos propios además de
    # _base.css. Se incorporan y se encierran bajo deck-stage igual que la
    # hoja compartida; los estilos exclusivos de impresión se omiten en GHL.
    cabecera = src[:desde]
    estilos_propios = []
    for m in re.finditer(r'<style\b([^>]*)>(.*?)</style>', cabecera, re.S | re.I):
        if re.search(r'\bmedia\s*=\s*["\']print["\']', m.group(1), re.I):
            continue
        estilos_propios.append(css_encerrado_texto(m.group(2)))
    ini = src.index('<deck-stage', desde)
    fin = src.index('</deck-stage>', ini) + len('</deck-stage>')
    cuerpo = src[ini:fin]

    # Un <script> en línea después de </deck-stage> se pierde en silencio: ya
    # dejó vacía la cuadrícula de la diapositiva 3 de la Clase 3 en producción.
    sueltos = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>', src[fin:])
    if sueltos:
        sys.exit('Hay ' + str(len(sueltos)) + ' <script> en línea después de </deck-stage>: '
                 'en GHL no llegarían. Muévelos dentro del componente.')

    faltan = []
    def cambiar(m):
        nombre = os.path.splitext(m.group(1))[0]
        if nombre not in urls:
            faltan.append(m.group(1)); return m.group(0)
        return urls[nombre]
    cuerpo = re.sub(r'img/([A-Za-z0-9._-]+)', cambiar, cuerpo)
    if faltan:
        sys.exit('Sin URL de CDN: ' + ', '.join(sorted(set(faltan))))

    fuentes = re.search(r'<link href="https://fonts\.googleapis[^>]+>', src).group(0)
    titulo = re.search(r'<title>(.*?)</title>', src).group(1)
    js = open(os.path.join(base, 'deck-stage.js'), encoding='utf-8').read()

    salida = f'''<!-- ══════════════════════════════════════════════════════════════════
     {titulo}
     BLOQUE CUSTOM HTML DE GHL · generado con construir-ghl.py
     No editar a mano: se edita el archivo de la carpeta Presentaciones y
     se vuelve a generar.

     Qué cambia respecto del archivo local:
       · El CSS y el motor van empotrados. En GHL una ruta relativa se
         resuelve contra el dominio del sitio y da 404.
       · Las imágenes apuntan al CDN de la subcuenta, por lo mismo.
       · Cada regla de estilo cuelga de `deck-stage`, para no pisar la
         cabecera, el pie ni el editor de la página.
     ═══════════════════════════════════════════════════════════════════ -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fuentes}
<style>
/* El componente se pinta a pantalla completa por encima de la página. */
deck-stage{{position:fixed;inset:0;z-index:2147483000}}

{css_encerrado(os.path.join(base, '_base.css'))}
{chr(10).join(estilos_propios)}
</style>

{cuerpo}

{ARRANQUE}

{CONTROLES}

<script>
{js}
</script>
'''
    destino = os.path.join(base, os.path.splitext(os.path.basename(origen))[0] + '-GHL.html')
    open(destino, 'w', encoding='utf-8').write(salida)
    print(f'✓ {os.path.basename(destino)} · {len(salida)/1024:.0f} KB · '
          f'{cuerpo.count("<section")} diapositivas · {len(urls)} imágenes en el CDN')

main()

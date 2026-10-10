#!/usr/bin/env python3
"""
Genera sala-de-maquinas-GHL.html a partir de sala-de-maquinas-fuente.html.

Se edita la FUENTE y se vuelve a generar. Nunca se edita el archivo de GHL a mano.

    python3 generar-ghl.py

Qué hace la transformación, y por qué (las cuatro trampas de un bloque
Custom HTML de GHL, todas silenciosas):

1. Ninguna ruta relativa se resuelve: CSS y JS quedan embebidos y la fuente se
   pide a Google con URL absoluta desde document.head.
2. El CSS de un documento completo arrasa la cabecera y el pie de GHL. Aquí
   todo vive dentro de un Shadow DOM: no se escapa ni una regla, y el CSS de
   GHL tampoco deforma la pieza. `:root` pasa a `:host` y `body` a `.app`.
3. Las propiedades HEREDABLES sí cruzan el Shadow DOM. GHL le pasa al host su
   tipografía (Times New Roman) y su alineación, así que `:host` corta la
   herencia explícitamente. Eso ya viene resuelto en la fuente.
4. Un ancestro con transform rompe position:sticky. El JS lo detecta al
   arrancar y degrada la barra a estática en vez de romperse.

Además: la versión pública SOLO lleva lo que abre. Los items sin `url` (los que
solo tienen una ruta local tipo "Paginas Web/...") se excluyen aquí, porque en
producción no llevan a ninguna parte. Tampoco sale lo marcado `publico:false`:
tiene URL pero hoy no funciona bien (un chat que responde vacío, un botón que
lleva a un texto de relleno). Todo sigue en la fuente, que es el inventario
interno completo.
"""
import re
import pathlib

AQUI = pathlib.Path(__file__).parent
FUENTE = AQUI / "sala-de-maquinas-fuente.html"
SALIDA = AQUI / "sala-de-maquinas-GHL.html"

src = FUENTE.read_text(encoding="utf-8")

css = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
js = re.search(r"<script>(.*?)</script>", src, re.S).group(1)

# --- CSS para Shadow DOM
css = css.replace(":root{", ":host{", 1)
css = re.sub(r"\n\s*html\{scroll-padding-top:[^}]*\}", "", css)
css = re.sub(r"\n  body\{\n    margin:0;\n", "\n  .app{\n", css)
css += """
  /* GHL: si un ancestro lleva transform/filter/contain, sticky no funciona */
  .command.no-sticky{position:relative}
  .item{scroll-margin-top:var(--bar,7rem)}
  .app{padding-bottom:1px}
"""

datos = re.search(r"(const LAYERS = \[.*?const ACCESS = \{[^\n]*\n)", js, re.S).group(1)

# La version publica solo lleva lo que ABRE. Un item sin url solo tiene una ruta
# local ("Paginas Web/..."), que en produccion no lleva a ninguna parte.
# Solo se filtra dentro de ITEMS: LAYERS tambien tiene objetos con id y sin url.
ini = datos.index("const ITEMS = [")
cabeza, cuerpo = datos[:ini], datos[ini:]
bloques = re.findall(r"\n  \{id:\"[^\"]+\".*?\n(?=\n|  \{id:|\];)", cuerpo, re.S)
quitados = []
for b in bloques:
    if "url:" not in b or "publico:false" in b:
        quitados.append(re.search(r'id:"([^"]+)"', b).group(1))
        cuerpo = cuerpo.replace(b, "\n")
# Los comentarios de las fichas son notas internas (por que algo esta oculto, que
# falla). No se ven en pantalla, pero si en el codigo fuente de la pagina publica.
cuerpo = re.sub(r"\n[ \t]*//[^\n]*", "", cuerpo)
datos = cabeza + cuerpo
print("excluidos de la version publica (" + str(len(quitados)) + "): " + ", ".join(quitados))

markup = re.search(r"</style>\s*(<header class=\"command\">.*?</main>)", src, re.S).group(1)
markup = '<div class="app">' + markup + "</div>"


def jsstr(t):
    return t.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


PLANTILLA = (AQUI / "plantilla-ghl.js").read_text(encoding="utf-8")

out = PLANTILLA.replace("__CSS__", "`" + jsstr(css) + "`")
out = out.replace("__MARKUP__", "`" + jsstr(markup) + "`")
out = out.replace("__DATOS__", "  " + datos.replace("\n", "\n  "))

SALIDA.write_text(out, encoding="utf-8")
print(f"escrito {SALIDA.name}: {len(out)} bytes")

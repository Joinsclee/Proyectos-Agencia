# Instrucciones de build · Embudo The Betts AI

Contrato para quien construya cualquiera de las 6 páginas. Léelo entero antes
de escribir HTML.

## Fuentes de verdad

| Qué | Dónde |
|---|---|
| Copy aprobado (landing, VSL, formulario, gracias, correos) | `/private/tmp/claude-501/-Users-cristhian-Downloads-Paginas-Web/df2c2c96-fc85-4057-a489-9cdbb0157d66/scratchpad/doc.md` |
| Comentarios de revisión | `.../scratchpad/comments.json` |
| Sistema de diseño (CSS + componentes) | `The Betts AI/_design-system.html` |

El copy está **aprobado por el cliente**. No lo reescribas, no lo "mejores", no
lo resumas. Las únicas modificaciones permitidas son las 8 correcciones de la
tabla de abajo y la limpieza de puntuación de la regla C1.

## Correcciones de revisión ya decididas (aplicar todas)

Vienen de los comentarios de Cristian Vega y Johnatan Quintero en el documento.

| # | Sección | Corrección |
|---|---|---|
| 1 | Hero, subtitular | Eliminar `y sin contratar a otro humano para que lo opere`. Queda: «En tu mismo número, sin tocar tus procesos.» |
| 2 | §4, línea de entrada | `pregunta lo correcto` pasa a `pregunta coherentemente` |
| 3 | §4, los 3 bullets | Eliminarlos. Redundan con §3, que dice lo mismo con más detalle |
| 4 | §4, demo de chat | Se mantiene tal cual. Marcar en el HTML con un comentario que John/Jonathan deben aportar un caso real |
| 5 | §7 «Lo que no hace» | **Eliminar la sección entera.** En su lugar va el bloque de testimonios (componente H), en placeholder |
| 6 | §8, escasez | «5 diagnósticos por semana» **se sostiene**. Hilo resuelto, Johnatan lo aprobó. Quitar el marcador `[CONFIRMAR]` |
| 7 | Landing larga | Añadir **2 CTAs intermedios** además del hero y el cierre: uno tras §3 (los tres cuellos de botella) y otro tras §6 (en qué se diferencia) |
| 8 | Guion del VSL | En el bloque 4 dice «las veinticuatro». Debe decir «las 24 horas». Solo afecta al guion, no a las páginas |

Los `[CONFIRMAR]` que **siguen abiertos** y van al README de entrega, no a la
página: el plazo de 14 días y si se da rango de precio en la FAQ. Deja el texto
del doc tal cual (14 días, sin rango) y no pintes el marcador en pantalla.

## Reglas mecánicas de craft (no negociables)

- **C1 · Cero em-dash visible.** El doc está lleno de `—`. En todo texto que
  se vea en pantalla, sustituir por coma, dos puntos o paréntesis, lo que
  respete mejor el sentido. En español el inciso no se escribe con raya
  espaciada, así que además corrige el original. Comprobación: `grep -c '—'`
  sobre el HTML debe dar 0 fuera de los comentarios.
- **C2 · Eyebrows.** Máximo 3 en toda una página, y **nunca encima del h1 del
  hero**. El doc trae kickers en casi todas las secciones: conserva solo los
  que aporten y borra el resto. Los kickers son elementos de diseño, no copy
  de venta.
- **C3 · Sin numeración decorativa.** Los `1 ·`, `2 ·` de los títulos del doc
  son referencias internas del documento, no van en pantalla. La única
  numeración que sí se pinta es la de «Qué pasa después», porque ahí los
  números son una secuencia real.
- **C4 · Familias de layout.** Cada familia visual aparece **una sola vez por
  página**. Las asignaciones están más abajo. No conviertas todo en tres cards
  con icono: ese es el tell número uno.
- **C5 · Nada de cards dentro de cards.** Radio máximo 14px. Profundidad con
  hairline `inset 0 0 0 1px var(--line)`, nunca drop-shadow de color ni glow.
- **C6 · Sin CSS nuevo salvo lo propio de la página.** Usa las variables y los
  componentes del sistema. Si necesitas algo nuevo, que sea mínimo y con las
  mismas variables.
- **C7 · Reveals que no ocultan.** Usa `class="anim"`. El JS del core se
  encarga. No inventes otro sistema de scroll ni `addEventListener('scroll')`.
- **C8 · Sin imágenes inventadas.** No metas fotos de stock genéricas ni
  pantallazos falsos de la interfaz de WhatsApp. Donde falte un asset real,
  deja el hueco marcado con un comentario HTML.

## Reglas de GoHighLevel (rompe una y la página sale sin estilos)

1. **Todo dentro de `<body>`.** GHL descarta el `<head>`. El `@import` de las
   fuentes va como primera regla del `<style>`, y el `<style>` va en el body.
2. Fondos a ancho completo con `.band`. Para sticky u overlays, `.fullbleed`
   (`.band` no funciona con `position:sticky`).
3. `html,body{overflow-x:hidden}` ya viene en el core. No lo quites.
4. Sin CDN externos salvo Google Fonts. El CSP de GHL bloquea el resto.

Estructura del archivo entregable:

```html
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>...</title></head>
<body>
  <!-- CONFIG: enlaces pendientes, en un solo sitio -->
  <style id="tb-core"> ...core literal... </style>
  <style id="page"> ...solo lo propio de esta página... </style>
  ...contenido...
  <script id="tb-core-js"> ...core literal... </script>
</body>
</html>
```

El `<head>` está solo para poder abrir el archivo con doble clic en local. GHL
lo tira y la página sigue funcionando porque todo lo que importa vive en el
body.

## Enlaces pendientes

Ninguno está confirmado. Van todos como constante al principio del body, en un
único bloque, para que se cambien en un sitio y no repartidos por el HTML:

```html
<!-- ============ ENLACES PENDIENTES DE CONFIRMAR ============
     Sustituir en este bloque y en los href/action correspondientes.
     WHATSAPP   https://wa.me/XXXXXXXXXXX
     FORMULARIO 03-Formulario.html            (o la URL de GHL)
     CALENDARIO embed del calendario de GHL
     YOUTUBE    video "cómo montarlo tú mismo"
     SKOOL      comunidad
     WEBHOOK    Inbound Webhook de GHL para el submit del formulario
     ========================================================= -->
```

Usa `href="#TODO-WHATSAPP"` y similares, nunca `href="#"` a secas, para que
sea grepeable.

## Reparto de páginas y familias de layout

### 01-Landing-Corta.html · variante A del test A/B
Propuesta única de valor, video, botón. **Nada más debajo del video.** Sin FAQ,
sin secciones, sin footer de navegación. Solo el pie legal de Meta.
Familias: hero centrado a una columna.

Orden: titular (`.h1-editorial`) → subtitular → línea «Mira el video...» →
reproductor → botón → nota bajo el botón → pie legal.

### 02-Landing-Larga.html · variante B del test A/B
El copy completo con las 8 correcciones. Una familia por sección:

| Sección del doc | Familia |
|---|---|
| Hero | split asimétrico, titular + video |
| El problema | prosa a ancho de lectura, con la línea de «Haz la cuenta» destacada |
| Los tres cuellos de botella | filas con hairline (componente B). No cards |
| **CTA intermedio 1** | banda de CTA (componente G) |
| Así se ve en acción | conversación (componente D) |
| Método RCA | secuencia con inicial (componente C) |
| Testimonios | citas (componente H). Sustituye a la §7 eliminada |
| En qué se diferencia | comparativa a 3 columnas de texto con encabezado |
| **CTA intermedio 2** | banda de CTA, variante visual distinta a la primera |
| El diagnóstico | bloque de oferta con lista de checks |
| Qué pasa después | timeline numerada (componente E) |
| Preguntas frecuentes | acordeón (componente F) |
| Cierre | banda final, aquí sí `.display` porque el titular es corto |

### 03-Formulario.html
Multi-paso tipo conversacional, según el vídeo de brief: se contesta y se pasa,
no un formulario largo de scroll. 4 pasos, 17 preguntas, barra de progreso.

- Una pantalla de entrada, luego paso a paso. Botones atrás y siguiente.
- Validación por paso: no deja avanzar sin las obligatorias ni sin los mínimos
  de caracteres de las preguntas 10 a 13.
- **Lógica de salida**, evaluada al enviar:
  - P1 = `Ninguna` → descalifica
  - P2 = `Menos de 10` → descalifica
  - P14 = `No estoy valorando contratar ningún servicio` → SALIDA A
  - P15 = `No. Busco algo gratis o aprender a montarlo yo` → SALIDA A
  - P15 = `Puedo, pero no en este momento` → SALIDA B
  - P14 = `En 2 o 3 meses` → zona gris, **sí califica**, pero manda el flag
  - resto → pantalla final con el calendario
- El envío hace POST JSON al webhook de GHL. Si falla la red, no pierdas las
  respuestas: guarda en `sessionStorage` y permite reintentar.
- Las descalificaciones de P1 y P2 llevan a SALIDA A.
- El evento de conversión se dispara **solo** en la pantalla final con
  calendario. Deja el hueco marcado con un comentario, sin píxel inventado.
- Las notas internas del doc (*«Nota interna: ...»*) **no se pintan**.

### 04-Gracias.html
Cabecera, video, testimonios, cierre. Regla del doc, respétala al pie de la
letra: **sin botones de CTA, sin menú, sin enlaces salientes.** La única acción
posible es ver el video. Los testimonios van debajo del reproductor, nunca
encima.

### 05-Salida-A.html y 06-Salida-B.html
Páginas gemelas de la final del formulario: mismo diseño, mismo tono, sin
evento de conversión. Copy exacto del doc. Dos botones cada una, YouTube y
Skool. Son páginas cortas: una sola pantalla, sin secciones de relleno.

## Antes de dar por terminada una página

1. `grep -c '—'` sobre el HTML, fuera de comentarios, debe dar **0**.
2. El JS inline compila: extraerlo y pasarle `node --check`.
3. Se ve entera a 360px, 430px y 1180px de ancho.
4. Ningún `href="#"` vacío ni `<img>` sin `src`.
5. Contar eyebrows: máximo 3.
6. Simular GHL: borrar el `<head>` y comprobar que la página se ve igual.

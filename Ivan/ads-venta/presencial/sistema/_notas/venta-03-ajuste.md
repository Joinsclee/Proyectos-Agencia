# venta-03 · Ajuste y render (Claude)

Fase 3. Las dos propuestas de Codex eran de prioridad alta y las dos están
**rechazadas**, con el detalle abajo. La pieza entra a render tal como salió del
borrador: 34,96 s · 12 cortes · media 2,91 s · b-roll 29,1 % (10,18 s contando el
mockup, sin el móvil) · `validar.py venta-03` → **OK**.

No cambié ningún corte, así que no hacía falta volver a pasar `afinar.py` ni
`cerrar.py` (los dos reescriben la EDL y las tarjetas; pasarlos sin motivo solo
podía mover fronteras que ya estaban donde las quería). Sí volví a pasar
`validar.py`, esta vez contra el proyecto real y no contra la copia del
scratchpad que tuve que usar en fase 1 porque todavía no existía
`tarjetas-venta-01.json`.

Antes de rechazar comprobé las dos cosas con imágenes, no de memoria.

## Propuesta 1 · Alargar el b-roll de la cosecha hasta 15,67 — RECHAZADA

Codex quería llevar `cortes[4].t1` de 14,91 a 15,67 para que el plano de la chica
cubriera el subtítulo entero «alimenta la cosecha de un hotel y».

Dos motivos para no hacerlo:

**1. El corte de 14,91 no está a mitad de frase.** En
`trabajo/venta-03-palabras.json`, 14,91 es exactamente el final de la palabra
«cosecha» (`14.42-14.91 cosecha` · `14.91-15.10 de`). Es frontera de palabra y,
además, frontera de idea: el clip ilustra «alimenta la cosecha», y lo que viene
después («de un hotel y arrancó igual que la tuya») habla del hotel y de la finca
del espectador, que no están en ese plano. Lo que Codex llama «mitad de frase» es
la mitad de la **tarjeta de subtítulo** (13,72-15,67), que agrupa dos oraciones;
el ENCARGO pide que el b-roll caiga sobre la frase que ilustra usando los tiempos
de palabra, no que los cortes cuadren con los grupos de subtítulo.

**2. Los 0,76 s que añade son fotograma muerto.** El clip es un travelling de
acercamiento: la chica camina hacia cámara con la cesta. Lo comprobé aplicando la
propuesta y sacando previas a 14,80 · 15,10 · 15,40 · 15,60
(`_previa/venta-03-t15.40.jpg` y compañía, ya borradas; la EDL quedó revertida).
A partir de 15,10 la cara se sale por arriba, y de 15,40 en adelante el cuadro es
una pared de jersey negro: la cesta se hunde por debajo de la banda de subtítulos
(1150) y de la zona que tapa Instagram (1500), así que del recurso ganador —«la
chica con la cosecha», la que «llamó la atención»— no queda nada reconocible
durante medio segundo. Y no hay margen para esquivarlo: mi tramo asignado es
0-3,2 y un corte de 3,07 s obliga a un `in` de 0,13 como máximo, o sea a usar el
tramo entero incluido su final.

El b-roll ya está en 29,1 %, dentro de la banda 28-38 %, así que subirlo a 31,3 %
no compra nada que justifique el cambio.

## Propuesta 2 · Repintar el rótulo dentro de «Movil curso presencial.mp4» — RECHAZADA

Codex pedía quitar del propio clip fuente el texto «RUTA DE 90 DÍAS» y el chip
«OCTUBRE: 33 PLAZAS DISPONIBLES». Amplié el fotograma para leerlos
(`ffmpeg -ss 7.0 … crop=1000:200:40:1040`) y la premisa no se sostiene en ninguno
de los dos casos:

- **«RUTA DE 90 DÍAS · PLANIFICA · IMPLEMENTA · AVANZA» es la portada de una caja
  del set de producto**, al lado de «ESTADÍA COMPLETA», «PRÁCTICAS EN CAMPO»,
  «MEMORIAS DEL CURSO» y «CALCULADORA DE SIEMBRA». Es un entregable, no el bono
  con fecha: `mockups/LEEME - uso y condiciones de los mockups.txt` lo lista como
  tal («10-14: ruta de 90 días, sesiones con Iván, memorias del presencial…»). El
  límite del 18 de septiembre cuelga del **bono del online**, y solo aparece en
  `ficha_online_13`, la ficha de venta-13. La ficha que me manda el ENCARGO,
  `ficha_presencial`, no lleva línea de bono — y su HTML es exacto, no puedo
  añadirla.
- **El chip «OCTUBRE: 33 PLAZAS DISPONIBLES» está documentado y fechado**, no
  inventado. El mismo LEEME dice: «La pieza presencial muestra 33 plazas de
  octubre y 40 de diciembre, datos comunicados al 16/09/2026; no constituyen
  inventario en vivo. Revisarlos antes de publicar y actualizar la imagen cuando
  cambien.» En pantalla va con su propia letra pequeña: «Diciembre: 40 plazas ·
  Disponibilidad informada al 16/09/2026», «Representación visual de experiencias
  y recursos. Consulta disponibilidad actual», y encima del mockup la página dice
  «La disponibilidad final se confirma al reservar». La regla de no inventar
  cupos gobierna los textos que **yo** escribo; esto es la página de venta del
  cliente, entregada como recurso fijo.

Y, sobre todo, el cambio no es mío para hacerlo:

- `recursos/Movil curso presencial.mp4` lo usan **las cinco piezas presenciales**
  con el mismo `in` 4,6 (comprobado: `grep -l` da venta-01 a venta-05), y el de
  online las cinco de allí. Tocar el archivo cambia cuatro piezas ajenas, algunas
  probablemente ya renderizadas, y el ENCARGO dice «No toques piezas ajenas».
- El ENCARGO fija ese corte literalmente (src, `in` 4,6, `crop 1080:1920:0:0`) y
  la tapa carácter a carácter. No hay palanca legítima para cambiar lo que se ve.
- Quitar texto incrustado de una grabación de pantalla pide repintado; nada de
  `montaje-vertical-clee` lo hace, y un parche a mano sobre un scroll en
  movimiento se leería como una captura falsificada de la página real del
  cliente, que es peor problema que el original.

Lo llevo a `dudas` en vez de a la EDL: es una decisión de la tanda y del dueño de
la oferta, y el propio LEEME ya manda revisar esas cifras antes de publicar
(están fechadas al 16/09 y hoy es 17/09).

## Comprobado antes del render

Los cuatro HTML fijos coinciden **carácter a carácter** con
`herramientas/tarjetas-fijas.json`: `uvp` = `uvp_presencial`, `fecha` =
`ficha_presencial`, `movil` = `tapa_pres`, `cierre` = `cierre_presencial`
(comparación exacta por script, no a ojo). Ninguna tarjeta se solapa:
gancho 0,20-4,64 · pastilla 20,05-23,35 · uvp 23,48-26,32 · fecha 26,36-29,08 ·
móvil 29,18-32,00 · cierre 32,20-34,96. Todas con `desliz: 0`.

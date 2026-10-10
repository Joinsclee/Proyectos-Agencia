# Página de agendamiento · llamada de claridad

Bloque **Custom HTML** de GHL para `lahuertalab.com/agendamiento-copy-page`. Todo va en
`AgendamientoCopy.html`: CSS, JS, carrusel y VSL están dentro del mismo archivo, porque en
un bloque Custom HTML de GHL ni el CSS ni el JS relativos cargan. Las imágenes y los vídeos
viven en el CDN de la subcuenta (`IdRKxMkw62mZx47SMDaS`).

## Estado (25/09/2026)

Copy rehecho con el documento del cliente
([COPY PÁGINA · Llamada de claridad](https://docs.google.com/document/d/1LILN17tYTtm7oPh7BaANLm5htvGYjbgjzTZGPEK0ytE/edit))
y el [Loom del 25/09](https://www.loom.com/share/57eef045774a4de183beb22e40784f67).

**Objetivo único:** que agenden. Un solo texto de botón en toda la página —
*Quiero resolver mis dudas* — y todo lo demás fuera.

### Orden de los bloques

| # | Bloque | Notas |
|---|---|---|
| 1 | Cabecera | «Cuéntanos cómo está tu finca y te decimos por dónde empezar» + microcopy bajo el botón |
| 2 | Franja lima | «Antes de meterle otro peso a tu finca, hablemos 20 minutos» |
| 3 | VSL | 6 min. Póster y `preload="none"` |
| 4 | Para quién es / no es | Dos columnas. La de «no es» la pidió el cliente en el Loom |
| 5 | Veinte minutos, tres cosas | Los tres pasos de la llamada |
| 5b | Calendario | El iframe de la agenda, justo después de explicar la llamada |
| 6 | Las dudas que más nos llegan | Seis preguntas en rejilla |
| 7 | Las dos modalidades | Online (30 de septiembre) y Campo Escuela (1 al 4 de octubre) |
| 8 | Quién te va a escuchar | Bio de Iván + tres cifras |
| 9 | Testimonios | El carrusel, tal cual estaba |
| 10 | Preguntas frecuentes | Seis, en acordeón `<details>` |
| 11 | Cierre | Fechas de arranque + botón + WhatsApp |

### Decisiones que conviene no deshacer

- **En móvil el vídeo sube justo debajo del titular.** Lo pidió el cliente en el Loom
  («que cuando se abra en móvil se vea el vídeo aquí en medio centrado y luego abajo el
  resto del copy»). Se hace con `display:flex` + `order` sobre `#lh-claridad` dentro de
  `@media(max-width:760px)`, y ahí se oculta `.hero-photo` porque el póster del vídeo ya
  enseña La Huerta.
- **No hay botón flotante de WhatsApp.** Se quitó por dos razones que apuntan al mismo
  sitio: el documento pide que WhatsApp vaya «discreto y solo al final», y en GHL ese botón
  nunca llegó a flotar — un ancestro con `transform` rompe `position:fixed` y lo dejaba
  clavado al pie de la página. Ahora es una línea de texto en el cierre.
- **Fuera la fecha del 24 de septiembre.** Ya pasó. La urgencia son las fechas de arranque,
  que sí son ciertas. El VSL tampoco la nombra: en el montaje se eligió la toma que dice
  «cierran pronto».
- **Tres botones, no cuatro.** El documento pedía cuatro; el cuarto caía justo encima del
  calendario embebido, así que sobra. Los tres están en cabecera, bajo el vídeo y en el cierre.
- **El verde de los antetítulos es `#4a6b22`, no `#667a21`.** El anterior daba 4,43:1 sobre
  el crema a 12 px, por debajo del mínimo. El nuevo da 5,67:1.

### Lo que no se dice en la página

Precios y cupos: no están confirmados y la llamada existe para hablar de eso. Tampoco se
promete rentabilidad ni garantía en ningún bloque.

## Pendiente, fuera de esta página

Los anuncios en circulación apuntan a `/sesion-1-a-1`. Hay que cambiarles el destino a esta
página o la gente aterriza en un sitio distinto al que promete el anuncio. Eso se toca en el
administrador de anuncios, no aquí.

## Cómo publicar

Pega **todo** el contenido de `AgendamientoCopy.html` en un único bloque Custom HTML.
Para ver antes cómo queda dentro de la columna de GHL:

```bash
python3 simular-ghl.py --src AgendamientoCopy.html   # genera _ghl-preview.html
```

Ese simulador reproduce las dos trampas de GHL: la columna de 680 px y el ancestro con
`transform`. Si algo se rompe solo ahí, la causa es una de esas dos.

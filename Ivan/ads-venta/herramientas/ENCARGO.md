# Encargo · montaje de un anuncio de venta de La Huerta LAB

Hoy (17/09/2026) es el día de lanzamiento. Montas **una** pieza vertical
1080×1920 con el sistema `montaje-vertical-clee`, el mismo con el que se
entregaron los 10 anuncios de captación (`Ivan/ads/sistema/`, míralos como
referencia: `edl-anuncio-03.json`, `tarjetas-anuncio-03.json`,
`infografias-anuncio-02.json`, `LEEME.md`).

Antes de escribir nada, lee **enteros**:
`~/.claude/skills/montaje-vertical-clee/SKILL.md`,
`~/.claude/skills/montaje-vertical-clee/references/edl.md` y las secciones 1 a 5
de `references/craft.md`. Mira también `scripts/infografias.cjs` si tu pieza
lleva infografía (para saber qué campos lee cada tipo y cuánto texto cabe).

## Lo que dice el análisis de resultados (manda sobre lo demás)

Loom del equipo (17/09) sobre la campaña de captación en Colombia (3.700 registros):
los anuncios que más registros trajeron (965, 938, 613) comparten recursos, y
el equipo pide reutilizarlos en esta tanda, colocados **donde la voz los pide**:

- **Cultivos y plantaciones** en pantalla: es lo que más se repite en los ganadores.
  `CULTIVO JOVENES_0.mp4` (bandejas/plántulas moradas) «funciona bastante bien»,
  y también `CULTIVO JOVENES 2_0.mp4`, `CULTIVO JOVENES 3_0.mp4`,
  `CULTIVO BERENJENA COSECHA 2_0.mp4`, `2 siembra2_0.mp4` y la aérea de terrazas
  `DJI_20260604152226_0326_D_0.mp4`.
- **Las gallinas** gustaron mucho y salen en los ganadores:
  `VID_20260819_154811488_0.mp4` (gallinas en pastoreo entre cercas). Úsalas
  cuando se hable de animales, de empezar o de la finca funcionando.
- **Los cerditos** (`DJI_20260429153528_0114_D_0.mp4`) cuando se habla de animales.
- **La chica con la cosecha** (`DJI_20260521135944_0262_D_0.mp4`, y
  `DJI_20260521140012_0263_D_0.mp4`) «llamó la atención»: cosecha, alimento, mesa.
- **La aérea de 30 s de la finca** (`DJI_0064_0.mp4`, 1920x1080 → recorte
  `608:1080:x:0` con `"enfocar": true`) es la más potente **para el llamado a la
  acción**: cuando Iván dice «si tienes finca / si estás por comprar / ven / entra»,
  justo antes del móvil. Puedes acelerarla con `"velocidad": 1.3` a `1.5`
  (compruébalo en el render: que no tiemble).
- **Las ovejas desde el aire** (`DJI_0135_0.mp4`) no se usaron y deberían.
- **La promesa del producto en grande arriba**: «Aprende a diseñar una finca
  productiva». Va como tarjeta `uvp` (html exacto `uvp_presencial` /
  `uvp_online` de `tarjetas-fijas.json`, a `top:292px`) **encima del corte del
  mockup**, con la misma ventana que ese corte. Por eso los mockups de esta tanda
  son las versiones `…-uvp.jpg` (la pieza va más abajo, de ~600 a ~1140, y deja
  libre la franja de arriba para el titular). Usa `"kb":"out"` en ese corte.
- **Los mockups ilustran el producto sobre todo en el llamado a la acción**,
  cuando Iván habla de lo que incluye: coloca el mockup en la frase de la oferta
  que diga tu ficha.

Estos recursos ganadores **sí pueden repetirse entre piezas** (es lo que hicieron
los ganadores), pero en cada pieza con **otro tramo (`in`) y otro encuadre (`x`)**
que en las demás; tu ficha dice qué tramos te tocan. El resto del material sigue
siendo exclusivo de tu pieza.

## Dónde está cada cosa

```
Ivan/ads-venta/
  brutos/ADS _PROJECT N.mp4        el máster (1080x1920, 25 fps, voz de principio a fin, ya sin pausas)
  trabajo/venta-NN-palabras.json   whisper palabra a palabra · venta-NN.txt el texto
  recursos/Movil curso presencial.mp4 · Movil curso online.mp4   pantalla del móvil (8 s, 1080x1920, sin barras)
  fuentes/broll/<clip>_0.mp4       tramos de 10,5 s de b-roll 4K (3840x2160 salvo DJI_0076 y DJI_0978, 1920x1080)
  fuentes/fotos-principios/…       fotos originales · fuentes/indice-fotos.json («hoja#posición» → ruta)
  fuentes/fotos-9x16/              aquí dejas TUS fotos recortadas (herramientas/preparar.py foto)
  fuentes/mockups-9x16/            mockups de la oferta ya compuestos en vertical (NO se recortan)
  herramientas/preparar.py · previa.py · render.py · tarjetas-fijas.json
  presencial/sistema/  (venta-01…05)   online/sistema/  (venta-11…15)   ← tu cwd
```

Tu cwd es `Ivan/ads-venta/<modalidad>/sistema`. Desde ahí las rutas de la EDL son
`"master": "../../brutos/ADS _PROJECT N.mp4"`, b-roll
`"../../fuentes/broll/…"`, fotos `"../../fuentes/fotos-9x16/…"`, mockups
`"../../fuentes/mockups-9x16/…"` y el móvil `"../../recursos/Movil curso ….mp4"`.
Los subtítulos (`subs-venta-NN.json`) ya están generados y corregidos: si vuelves a
correr `subtitulos.py` sale lo mismo. **No toques `proyecto.json`.** Si ves una
palabra mal transcrita que no está corregida, no la arregles tú: apúntala en
`dudas`.

## Lo que produces

`edl-venta-NN.json`, `tarjetas-venta-NN.json` y, si tu ficha lo pide,
`infografias-venta-NN.json`. `nombre` = `venta-NN`. Planos A/B/C.

### Montaje
- Ritmo de anuncio: un corte cada ~3 s (dispersión propia, no clavado), ningún
  corte < 1,6 s ni > 5,2 s, nunca dos b-roll seguidos, nunca el mismo plano en
  cortes seguidos ni volver al mismo plano justo después de un b-roll. B-roll
  entre el 28 y el 38 % del total **contando** el mockup y sin contar el móvil
  (los ganadores llevaban mucho cultivo en pantalla).
- El b-roll cae **sobre la frase que ilustra** (usa los tiempos de
  `trabajo/venta-NN-palabras.json`). Usa solo el material asignado en tu ficha;
  no lo compartas con otras piezas. No hace falta usarlo todo.
- Los clips de `fuentes/broll/` son tramos desde el segundo 0 del original (los «ganadores»
  están enteros): `in` es el segundo dentro de ese archivo. Mira el clip antes de elegir `in`
  (`ffmpeg -ss <t> -i <clip> -frames:v 1 …` o previa.py) y no lo elijas a ciegas.
- Clips 4K: recorte vertical `1215:2160:x:0` (x entre 0 y 2625; elige x para que
  el motivo quede dentro). Clips 1920x1080: `608:1080:x:0` con `"enfocar": true`.
  `in` entre 0 y (duración del archivo − duración del corte × velocidad).
- Fotos: `python3 ../../herramientas/preparar.py foto "<ruta original>" vNN-<nombre> <xfrac 0..1>`
  y en la EDL `{"tipo":"foto","src":"../../fuentes/fotos-9x16/vNN-<nombre>.jpg","kb":"in"|"out"}`.
  Ábrela (Read) para comprobar el recorte antes de usarla.
- Mockup: `{"tipo":"foto","src":"../../fuentes/mockups-9x16/<archivo>-uvp.jpg","kb":"out"}`, entre 2,4 y 3,4 s,
  sobre la frase de la oferta que indica tu ficha, con la tarjeta `uvp` encima (misma ventana).
- **Móvil (CTA):** un corte de b-roll `{"tipo":"clip","src":"../../recursos/Movil curso <presencial|online>.mp4","in":4.6,"crop":"1080:1920:0:0"}`
  justo antes de la cartela de cierre, con su tarjeta `movil` (`tapaSubs: true`,
  `html` = `tapa_pres` o `tapa_online` de `tarjetas-fijas.json`) cubriendo EXACTAMENTE ese corte.
  Luego `cerrar.py` lo deja en 3,00 s y la cartela en 2,80 s.
- Planos: el máster es 1080x1920, así que B y C son ampliaciones. B = `830:1476:x:y` (1,3x),
  C = `675:1200:x:y` (1,6x). Punto de partida en tu ficha; compruébalo con `previa.py`
  en 3-4 momentos distintos (Iván se mueve). Nunca un recorte que se salga: x+w ≤ 1080, y+h ≤ 1920.

### Tarjetas (vocabulario cerrado, ver edl.md)
- `gancho` (0,2 s → ~3,5-4,6 s): dos líneas cortas, la segunda en `<em>`. Por
  defecto va a `top:290px`; si en tu plano de apertura tapa la cara de Iván,
  sobrescribe el `top` en línea (p. ej. `style="top:760px"`, sobre el torso) o abre con b-roll.
  El gancho repite la idea de la voz, no la frase literal entera.
- `fecha` = la ficha de oferta. `html` EXACTO de `tarjetas-fijas.json`
  (`ficha_presencial`, `ficha_online`, o `ficha_online_13` solo para venta-13);
  solo puedes cambiar el `top` (mide 402 px de alto: `top` ≤ 745 para no pisar
  los subtítulos en 1150). Dura 2,6-3,6 s, en un tramo de la oferta, antes del móvil,
  y sin tapar la cara (compruébalo con previa).
- `pastilla` / infografía: la que diga tu ficha, en su frase. Una infografía
  sustituye a la pastilla del mismo momento, no se suma. Las infografías de una
  pieza comparten `y` (680 por defecto; muévela si tapa la cara: la placa mide 430).
- `uvp`: `html` EXACTO de `tarjetas-fijas.json` (`uvp_presencial` / `uvp_online`), misma ventana que el corte del mockup.
- `movil` y `cierre`: `html` EXACTO de `tarjetas-fijas.json` (`cierre_presencial` /
  `cierre_online`), carácter a carácter. La cartela termina en la duración exacta.
- Ninguna tarjeta se solapa con otra. `desliz: 0` en todas.
- Nada de rayas largas (—) ni de promesas de ingresos o rentabilidad en los textos que escribas.

## Trabajo en equipo con Codex

Cada pieza pasa por fases y tu mensaje dice en cuál estás: **haz solo esa**.
1. *Borrador* (Claude): pasos 1-4 de abajo, sin render completo.
2. *Dirección* (Codex): crítica del borrador con las previas.
3. *Ajuste y render* (Claude): aplicas lo que mejore la pieza y renderizas (paso 5).
4. *Control* (Codex): revisa el render.
5. *Remate* (Claude): corriges lo que falte y vuelves a renderizar.

Las notas de cada fase quedan en `<modalidad>/sistema/_notas/venta-NN-<fase>.md`:
léelas si existen y escribe la tuya al terminar (qué hiciste, qué aceptaste o
rechazaste de Codex y por qué).

## Orden de trabajo

1. Escribe EDL + tarjetas (+ infografía).
2. `python3 ~/.claude/skills/montaje-vertical-clee/scripts/afinar.py venta-NN`
   y luego `cerrar.py venta-NN` (en ese orden; relee la EDL y las tarjetas después, las reescriben).
3. `python3 ~/.claude/skills/montaje-vertical-clee/scripts/validar.py venta-NN` hasta `OK`.
4. Rótulos sin renderizar el vídeo:
   `NODE_PATH="/Users/cristhian/Downloads/Paginas Web/Playwright/node_modules" PROYECTO_BASE="$PWD" node ~/.claude/skills/montaje-vertical-clee/scripts/rotulos.cjs tarjetas venta-NN`
   (y `subs`, y `infografias.cjs` si hay). Luego
   `python3 ../../herramientas/previa.py venta-NN <t1> <t2> …` en: gancho, cada cambio de plano,
   cada b-roll, la ficha, la pastilla/infografía, el móvil y el cierre. **Mira las imágenes**
   (Read). Corrige lo que tape la cara, salga de la zona segura (rojo) o se lea mal.
   Al final genera la hoja completa del borrador para Codex:
   `python3 ../../herramientas/previa.py venta-NN --hoja` → `_previa/venta-NN-borrador-*.jpg`
   (un fotograma compuesto por segundo; el Ken Burns y la velocidad no se ven ahí).
5. `python3 ../../herramientas/render.py venta-NN` (espera turno: hay un candado; puede tardar).
   Mira TODAS las hojas `_previa/venta-NN-hoja-*.jpg` y además previas puntuales si dudas.
   Si solo cambian tarjetas/infografía: `render.py venta-NN --rotulos`.
6. Máximo dos renders completos. No subas nada a Drive. No toques piezas ajenas.

## Devuelve
Los campos del esquema: si `validar.py` da OK, duración, nº de cortes, % de b-roll,
qué material usaste y dónde (segundo y frase), textos de gancho/pastilla/infografía,
la ruta de la entrega, lo que revisaste en las hojas y cualquier duda (p. ej. una
palabra que el subtítulo dice distinto de lo que se oye, o una afirmación del guion
que pueda no ser exacta).

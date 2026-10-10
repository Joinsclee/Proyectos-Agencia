# VSL de la página de agendamiento (25/09/2026)

Vídeo de ventas que abre la página de la llamada de claridad, encima del calendario.
Grabado en La Huerta el 25/09 en una sola toma de 4K (8:08, 4,7 GB). **El bruto ya no está
en local** (se borró el 25/09 al liberar disco): vive solo en Drive. Para rehacer el montaje
no hace falta — basta `vsl-limpio.mp4`. Solo habría que volver a bajarlo para recuperar algún
tramo de los que se descartaron.

> **Tercera versión (25/09, tarde).** La primera se publicó con tres defectos que se
> corrigieron rehaciendo el montaje (explicados abajo). Sobre esa segunda, el cliente marcó
> tres cortes concretos que seguían viéndose mal —**4:36, 4:49 y 5:34**— y se corrigieron
> uno a uno (ver «Los tres cortes que marcó el cliente»).

## Qué se hizo

**1 · Máster limpio (`vsl-limpio.mp4`, 6:02, 2560×1440).** La toma traía charla previa,
instrucciones al camarógrafo y siete repeticiones. Se conservaron los tramos buenos y se
pegaron con un fundido de audio de 35 ms en cada juntura para que no se oiga el empalme:

| Tramo del bruto | Qué entra |
|---|---|
| 17,55 – 111,00 | Gancho de la sabiduría, las dudas de quien duda, los siete principios |
| 143,01 – 255,00 | Los siete principios, uno por uno (segunda toma de microclima) |
| 262,00 – 333,00 | «El diseño cambia según tu tierra», online y presencial, acomodaciones |
| 343,00 – 356,00 | «¿Cuál te conviene?» (segunda toma) y por qué existe la llamada |
| 361,00 – 384,00 | Qué se conversa en la llamada |
| 403,00 – 424,33 | Qué responde el equipo (tercera toma, la limpia) |
| 448,01 – 477,00 | Cierre: «cierran pronto», el botón debajo del vídeo, despedida |

**Lo que se tiró, y por qué importa:** en la primera versión del cierre dice «las
inscripciones cierran el jueves 24 de septiembre». Esa fecha ya pasó. La repetición dice
«cierran pronto» y no caduca: es la que quedó. El documento de copy del cliente pedía
regrabar esos 15 segundos — no hace falta, ya está resuelto en el montaje.

**El máster se saca a 1440p, no a 1080p.** Es lo que permite que los reencuadres cerrados
sean casi una reducción y no una ampliación (ver punto 3 de las correcciones).

**2 · Montaje (`sistema/edl-vsl-01.json`, generado por `sistema/_construir-edl.py`).**
40 cortes sobre el máster limpio, media de 9,07 s:

- Tres encuadres calculados sobre la posición real de su cara: **A** entero (1440p reducido
  a 1080p), **B** medio `crop 2048:1152` (sigue siendo reducción), **C** cerrado
  `crop 1706:960` (amplía solo 1,13x).
- Siete inserciones de b-roll de la finca, una por principio, cada una con la imagen de lo
  que se está diciendo, con su pastilla.
- Dos b-roll cortos más, puestos encima de dos junturas para taparlas.
- La grabación de la agenda cuando dice «haz clic en el botón que aparece debajo del vídeo».
- 76 subtítulos quemados, ficha lateral de lo que resuelve la llamada y cierre con
  «Elige tu horario y conversemos».

**3 · Revisión.** `revision.py` (la puerta de `edicion-humana-clee`): **0 bloqueantes y
0 avisos** en 725 muestras, con la cara detectada en 635. No hay congelados, ni cara tapada,
ni rango de color mezclado.

## Los tres defectos de la primera versión, y cómo se corrigieron

**a) Las junturas se veían como saltos.** Al quitar las siete tomas falsas quedaron seis
costuras (93,45 · 205,44 · 276,44 · 289,44 · 312,44 · 333,77 s). El audio empalmaba bien —se
comprobó pasando whisper por ventanas de 8 s alrededor de cada una—, pero en imagen caían en
mitad de un plano, así que el cambio de postura se leía como un corte mal hecho. Ahora cada
juntura **es** un punto de corte de la EDL: cuatro cambian de encuadre y dos van tapadas con
b-roll (`CULTIVO JOVENES 2` y `DJI_0129`).

**b) El b-roll no acompañaba lo que se decía.** Cuatro de los siete principios llevaban una
imagen que no venía a cuento. Se extrajo un fotograma de cada clip disponible y se rehízo el
reparto: microclima → la finca con sus terrazas · microorganismos → manos en la tierra ·
nutrientes → camellones trabajados · diversidad → la cosecha de berenjena · agua → terrazas a
curvas de nivel · energía → las gallinas · descanso → ovejas en el potrero.

**c) La imagen se veía blanda.** Los reencuadres salían de una copia de 1080p y ampliaban
hasta 1,5x. Ahora salen del máster de 1440p, y la web se publica a **1080p / 2,1 Mbps** en vez
de 720p / 1,3 Mbps. Se comparó un mismo plano de las dos: en el nuevo se lee el bordado del
polo y las hojas del árbol tienen definición individual.

## Los tres cortes que marcó el cliente (25/09, tercera versión)

Sobre la segunda versión el cliente señaló tres momentos que «se ven muy poco profesionales
y feos». Los tres eran junturas de tomas que el montaje anterior daba por resueltas pero no
lo estaban, y el diagnóstico salió de medir, no de mirar:

| Momento | Qué pasaba | Cómo se corrigió |
|---|---|---|
| **4:36** (276,44 s) | Corte C→B, solo 17% de cambio de tamaño, y además 0,20 s tarde | B-roll encima: `DJI_0112_2` (la finca desde el aire, con el alojamiento), 3,1 s, sobre «qué cubre la alimentación y cómo funciona la reserva» |
| **4:49** (289,44 s) | Corte C→B, 17% de cambio | Corte **A→C**: 50% de salto. No quedaban clips libres para taparlo (`validar.py` no admite el clip del móvil dos veces) |
| **5:34** (333,77 s) | Mismo encuadre a los dos lados y el corte 0,43 s tarde | B-roll encima: `CULTIVO JOVENES_0` (el semillero), 2,9 s, sobre «si la experiencia presencial encaja mejor» |

**La causa de fondo, medida.** La regla de montaje pide que el tamaño de plano cambie ≥30%
para que un corte se lea como decisión y no como brinco. Con los tres encuadres A/B/C, los
cambios entre planos contiguos eran: A→B 25%, B→C 20%, C→B 17%, y solo C→A llegaba al 33%.
**17 de los 19 cortes estaban por debajo del umbral.** Desde un máster de 1440p solo caben
dos tamaños que salten ≥30% sin volver a ampliar la imagen, así que un rediseño completo
significaría alternar abierto↔cerrado. El cliente prefirió corregir solo los tres que le
molestaban, así que el esquema de tres encuadres se mantiene.

**Un residuo conocido en 4:49.** El cambio de postura ocurre 0,15 s (4 fotogramas) antes del
corte, porque `validar.py` rechaza cortar a mitad de palabra y la frontera más cercana cae
ahí. El salto de encuadre del 50% lo absorbe, que es la técnica estándar, pero no lo elimina.

**Un fallo del generador, de paso.** `n = round((b-a)/11.0)` dejaba pasar tramos de 15,5 s
cuando el tope del proyecto son 12. Ahora hay un `while` que baja hasta 11,8 s.

## Archivos

| Archivo | Para qué |
|---|---|
| `sistema/entrega/vsl-01.mp4` | Máster de entrega, 1920×1080, 237 MB |
| `sistema/entrega/vsl-web.mp4` | El que está publicado: 1080p, 2,12 Mbps, 92 MB |
| `sistema/entrega/poster-vsl.jpg` | Póster del reproductor (fotograma 3,2 s, con el gancho) |
| `sistema/entrega/vsl-01-base.mp4` | Base sin rótulos, para revisiones posteriores |
| `sistema/entrega/vsl-web-720p-anterior.mp4` | La versión que estuvo publicada por la mañana |
| `vsl-limpio.mp4` | Máster 1440p sin tomas falsas. **Es la fuente de todo**: con esto y la EDL se rehace el montaje entero sin tocar Drive |

En el CDN de GHL (subcuenta `IdRKxMkw62mZx47SMDaS`):
- vídeo: `a901f667-4605-4766-a83d-822ca5f35285.mp4`
- póster: `c6e70261-b525-4d42-8ecf-a3fff6be33a3.jpg`

## En la página

Va entre la franja lima y el bloque «para quién es». Reproductor con póster y `preload="none"`:
hasta que alguien pulsa play no se descarga un solo byte, así que los 92 MB no frenan la carga.
Sin botón de descarga, sin picture-in-picture y sin clic derecho. Debajo, el botón «Quiero
resolver mis dudas», que es lo que él anuncia dentro del vídeo. Si alguien arranca un testimonio
del carrusel, el VSL se pausa solo, y al revés. **En móvil el vídeo sube justo debajo del
titular** (lo pidió el cliente en el Loom del 25/09).

## Si hay que rehacerlo

```bash
cd "Ivan/vsl/sistema"
python3 _construir-edl.py                                        # reconstruye la EDL
python3 ~/.claude/skills/montaje-vertical-clee/scripts/validar.py vsl-01
bash _montar-vsl.sh     # montar + rótulos + componer + revisión (≈1 h en esta máquina)
```

Tres cosas que hacen falta saber:

- El `proyecto.json` lleva `"render": {"preset": "veryfast", "crf": 18}`. Sin esa clave, el
  sistema usa `medium`, que en una pieza de seis minutos multiplica por cuatro el tiempo de
  montaje. Esa opción se añadió a `montar.py` el 25/09 precisamente por esto.
- La cola de `trabajo/vsl-01-palabras.json` está corregida a mano: whisper estiraba las dos
  últimas palabras hasta el segundo 362,8 cuando la voz acaba en 360,8. El original está en
  `.whisper-crudo`.
- El montaje llena el disco: `_tmp/` llega a 1,1 GB y `_rot/` a 836 MB. Los dos se pueden
  borrar en cuanto existe `entrega/vsl-01.mp4`.

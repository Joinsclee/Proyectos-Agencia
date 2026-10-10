# Sistema de edición de anuncios · Finca sin improvisar

Cada anuncio se define en un `edl-anuncio-NN.json` y se construye en dos pasos.
El montaje y la capa de rótulos van separados a propósito: cambiar un
subtítulo no obliga a rehacer los cortes.

```bash
python3 producir.py anuncio-03            # lo hace todo y sube a Drive
```

`producir.py` encadena los cinco pasos, sube el MP4 a la carpeta de entregas,
comprueba el tamaño contra el fichero local y solo entonces borra los
intermedios. Existe porque el disco de esta máquina va al límite: un anuncio
deja unos 350 MB por el camino y diez a la vez no caben. Los pasos sueltos, por
si hay que repetir uno:

```bash
python3 validar.py anuncio-03             # revisa la EDL ANTES de renderizar
python3 montar.py edl-anuncio-03.json     # cortes, planos y b-roll → salida/
python3 subtitulos.py anuncio-03          # transcripción → subs-anuncio-03.json
node rotulos.cjs subs anuncio-03          # dibuja los PNG en Chrome
node rotulos.cjs tarjetas anuncio-03      # (NODE_PATH → Playwright/node_modules)
python3 componer.py anuncio-03            # pistas alfa + mezcla → entrega/
```

## Las tres herramientas que arreglan un montaje

Un montaje escrito a mano trae siempre los mismos defectos, y son baratos de
corregir con aritmética y caros de descubrir en el vídeo terminado.

| | qué arregla |
|---|---|
| `validar.py` | Lo comprueba todo antes de gastar el render: huecos entre cortes, cortes a mitad de palabra, b-roll repetido o fuera del reparto, dos b-roll seguidos, el mismo plano dos veces, **volver al mismo encuadre justo después del b-roll** (se lee como si se hubiera ido la señal) y que la cartela de cierre sea idéntica a la del anuncio 1. |
| `afinar.py` | Pega los cortes a separación entre palabras, sube los que bajan de 1,6 s y parte los planos de más de 5,2 s. Un b-roll largo se queda con su primer golpe y el resto vuelve a la cara. |
| `cerrar.py` | Iguala el remate: pantalla del móvil en 3 s y cartela de cierre en 2,8 s. Los nueve montajes salieron con la cartela entre 1,3 y 5,6 s, y es el momento en que el espectador decide. |

## Dónde va la ficha de fecha

`top:286px` solo sirve cuando Iván está sentado (anuncios 1 y 2). De pie, la
cabeza le cae justo ahí y la ficha se la tapa: pasaba en cinco de los diez. En
esos va a `top:740px`, que la deja por debajo de la barbilla y por encima de la
banda de subtítulos (que empieza en 1150; 740 + 390 de alto = 1130).

## El anuncio 8 lleva un máster corregido

Iván dice «a las siete de la tarde» y la clase es a las 6. No es fallo de
transcripción: cinco ventanas de audio independientes dan «siete», y en el
anuncio 4 las mismas cinco dan «seis». Se quitó «a las siete de la tarde, hora
de Colombia» (40,60-42,86 del bruto) y el máster queda diciendo «…el 17 de
septiembre te mostraré ese pilar y los otros cuatro». La hora la sostiene la
cartela. El bruto original está intacto en `brutos/ANUNCIOS 8.mp4`.

## Lo que distingue un anuncio de un VSL

| | VSL | Anuncio |
|---|---|---|
| Corte | uno cada 4,5 s | uno cada **3 s** |
| B-roll | 28 % | **32 %** |
| Subtítulo | 60 px, 26 caracteres por línea | **74 px en negrita, 20 caracteres** |
| Contorno del texto | 9 px | **13 px** |
| Primeros 2 s | entrada tranquila | **gancho a pantalla completa** |

El subtítulo va más grande y más grueso porque compite con el scroll y se ve en
una pantalla pequeña: tiene que leerse a la primera, no a la segunda.

## Zonas seguras de Meta

En 1080×1920 la interfaz de Reels tapa los **250 px de arriba** (foto de perfil
y nombre) y los **420 de abajo** (texto del post, botón, iconos). Todo el texto
vive entre y=280 y y=1490. La banda de subtítulos se superpone en y=1150 con
340 px de alto: acaba justo en el borde de la zona que tapa Instagram.

## El CTA con la página real

Es lo que pidió el cliente y es lo que separa este anuncio del anterior: cuando
Iván dice «haz clic, reserva tu lugar», entra tres segundos de la grabación del
móvil recorriendo la landing, con el contador y el botón coral a la vista.

Dos detalles que hay que respetar:

- **Recorte `1080:1920:0:418`.** La grabación viene a 1080×2338 y ese recorte
  quita la barra de estado del teléfono y la del navegador. Sin él se ve la hora
  y la URL, que en un anuncio se leen como un descuido.
- **`"tapaSubs": true` en la tarjeta del móvil.** La pantalla ya trae su propio
  titular, su contador y su botón; el subtítulo encima lo vuelve ilegible.

## Rotación de recursos

`recursos-usados.json` lleva la cuenta de qué clip ha entrado en qué anuncio.
**Antes de escribir una EDL nueva, mirarlo.** El encargo es explícito: si un
clip sale en un anuncio, no debe salir en otro. Hay 17 clips de b-roll en
`fuentes/broll/`, 4 más en `fuentes/fotos/` y 72 fotos, así que da de sobra.

## Huecos y silencios

`montar.py` no los detecta solo. Antes de escribir la EDL:

```bash
ffmpeg -v error -i trabajo/aNN.wav -af "silencedetect=noise=-32dB:d=0.45" -f null -
python3 -c "…"   # pausas de más de 0,35 s entre palabras del JSON de whisper
```

El anuncio 1 salió limpio, sin una sola pausa por encima de 0,35 s. En los que
sí tengan hueco, la EDL es el sitio para taparlo: se mete ahí un corte de
b-roll o una tarjeta con copy, que es justo lo que pidió el cliente.

## Efectos de sonido

```bash
python3 efectos.py            # genera sfx/*.wav
python3 mezclar.py anuncio-01 # los coloca → entrega/anuncio-01-sfx.mp4
```

### Por qué están sintetizados y no descargados

Se miraron las librerías que había a mano y ninguna servía:

| | Qué es |
|---|---|
| `@remotion/sfx` | 32 sonidos, casi todos memes: `bruh`, `minecraft-hurt`, `illuminati-confirmed`, `wilhelm-scream` |
| `hyperframes-audio` | Es un skill de **mezcla** (EQ, compresión, voiceover carve). No trae efectos; el sourcing lo delega en `/media-use` |
| `remotion-visitas/public/sfx` | Tres archivos: whoosh, page-turn, switch |

Pero el motivo de fondo es otro y es técnico: **el anuncio lleva voz de principio
a fin, y la inteligibilidad de la voz vive entre 1 y 3 kHz.** Un efecto de
librería mete energía justo ahí y tapa palabras. Estos se diseñan para ocupar el
sub-grave (por debajo de 200 Hz) y el aire (por encima de 5 kHz), que es donde
la voz no está. De paso, cero licencias que revisar.

### Margen medido de cada efecto contra la banda de la voz

Cuántos dB por debajo queda 1-3 kHz respecto a la banda que sí lleva la energía.
Por encima de +6 dB el efecto no compite con lo que se dice:

| | | | |
|---|---|---|---|
| `sub` **+43** | `impacto-suave` **+25** | `whoosh-2` **+23** | `impacto` **+22** |
| `whoosh-1` **+19** | `whoosh-3` **+17** | `riser` **+9** | `clic` **+6** |

El riser salió a **−2 dB** en la primera versión: invadía la voz. Se corrigió
bajando el final del barrido de 900 a 640 Hz (para que su segundo armónico caiga
en 1,3 kHz y no en el centro de la voz), subiendo la capa de aire de 5 a 8 kHz y
quitando 1-3 kHz con dos campanas. Pasó a +9.

### Reparto

Once eventos en 56 s, derivados de la propia EDL para que no se desincronicen:
impacto donde entra un texto o una tarjeta, whoosh donde entra un corte de
b-roll, riser antes del CTA y sub en la cartela final. **Uno por corte —serían
diecinueve— dejaría de leerse como diseño de sonido y pasaría a dibujo animado.**

Los whooshes entran **60 ms antes** del corte: el oído coloca el golpe donde está
el ataque, y adelantarlo un pelo hace que el corte se sienta más apretado. Y se
rotan tres variantes, porque el mismo whoosh seis veces suena a plantilla.

### Verificado sobre la mezcla

- **−14,2 LUFS integrado, pico real −1,4 dBTP.** Es el objetivo de entrega para
  Meta.
- Descontando la ganancia de la normalización, ningún efecto añade energía
  apreciable a la banda de la voz. El único tramo que sube es el del CTA,
  +1,8 dB, y es la cola del riser, no el clic: bajar el clic de 0,16 a 0,10
  movió la medida una décima.
- El vídeo no se recodifica (`-c:v copy`): 1402 fotogramas antes y después.

## Sonido: por qué no lleva efectos

La primera versión llevaba efectos sintetizados y el cliente los rechazó. Al
investigar apareció un diagnóstico mejor y una comprobación que lo cerró.

**El diagnóstico de la investigación:** un golpe en cada corte es la firma
audible de «esto es un anuncio», y en dueños de finca de 35-65 en LATAM eso lee
a gurú de infoproducto. Lo que arregla un montaje de 19 cortes no son efectos
encima: es una cama de ambiente continua por debajo. *El whoosh tapa el síntoma,
la cama cura la causa.*

**Pero esa premisa aquí no aplica, y se midió.** `montar.py` corta solo imagen:
el audio del máster corre entero. Comparando el nivel 0,25 s antes y después de
cada corte contra el bruto, el montaje introduce **0 saltos de 7 medidos**
(Δ ≤ 0,10 dB, que es redondeo). La voz de Iván ya lleva dentro el ambiente real
de la finca, porque está grabado de pie en ella.

Así que no hay nada que pegar. Pero eso resuelve si los efectos hacen falta como
**pegamento**, no si suman como **puntuación**, que es otra cosa y sí es oficio
de anuncio. Por eso hay dos versiones para comparar:

```bash
python3 sonido.py anuncio-01     # → entrega/anuncio-01-sonido.mp4
```

**Tres acentos en 56 s**, con material grabado de Mixkit, recortado al ataque:

| | | qué marca |
|---|---|---|
| 0,20 s | `impacto-profundo` | aparece el gancho |
| 29,82 s | `sweep-corto` | «Por eso preparé Finca sin improvisar» |
| 53,60 s | `impacto-grande` | cartela de cierre |

Medido: cada uno sube **+4,8 a +5,1 dB en su propia banda** (el sub-grave) y
**0 o menos en la banda de la voz**. Se sienten sin taparlo.

Dos cosas que hubo que corregir por el camino, ambas medidas:

- **Cada archivo trae silencio antes del ataque.** `impacto-grande` no arranca
  hasta el segundo 2,16. Colocarlo sin recortar habría dejado el golpe dos
  segundos tarde. Los `recorte` de la tabla salen de calcular la envolvente real
  del PCM, no del nombre del archivo.
- **La primera pasada quedó inaudible.** Corrigiendo en exceso el error anterior,
  tres de los cuatro acentos subían menos de 1,1 dB: no se oían. Se subieron
  hasta que cada uno midiera al menos +3 dB en su banda.

**Se probó y se quitó** un obturador de cámara al entrar la pantalla del móvil.
La pantalla no está haciendo una foto, y un sonido que no podría existir ahí se
lee como truco. Ese momento ya cambia el cuadro entero.

Queda preparado por si se quiere probar: `sfx/catalogo-mixkit.json` tiene 128
efectos con su id, `sfx/mixkit/` una preselección de 16 ya descargada y medida, y
`sfx/LEEME.md` la licencia verificada (permite publicidad pagada sin atribución)
y las trampas — entre ellas que la librería de la BBC es **solo uso personal o
educativo** y en un anuncio pagado sería infracción.

## Variantes de duración

```bash
python3 variantes.py anuncio-01     # recorta el montaje y regenera los rótulos
```

| | duración | qué lleva |
|---|---|---|
| `anuncio-01.mp4` | 56,1 s | completo |
| `anuncio-01-media.mp4` | 27,5 s | gancho, oferta con los cinco pilares, fecha, CTA |
| `anuncio-01-corta.mp4` | 19,0 s | gancho, nombre de la clase, fecha, CTA |

Las tres a **−14 LUFS y −1,3 dBTP**, para que convivan en el mismo conjunto de
anuncios sin que una suene más baja que otra.

**Por qué existen.** El CTA con la landing está en el segundo 50, y a esa altura
queda muy poca gente: los benchmarks de Reels 2026 dan 40-50 % de visionado en
piezas de 30-60 s frente a más del 65 % por debajo de 15 s. Conviene que exista
una versión donde la landing se vea pronto.

**Lo que NO se hizo, a propósito:** mover la landing del segundo 50 en el máster.
El cliente pidió que estuviera ahí, lleva `tapaSubs` (apagaría los subtítulos en
plena ventana de retención) y en el segundo 12 la voz aún describe el problema,
así que sería un CTA sin oferta detrás.

**Dos cosas que costaron:**

1. **Se corta el montaje, no la entrega.** Recortar el archivo ya rotulado dejaba
   subtítulos con palabras que ya no se oían, porque están estirados para
   encadenar sin huecos.
2. **Los subtítulos se regeneran, no se recortan.** Recortar la ventana de un
   subtítulo conserva su texto entero. Se filtran las palabras a los tramos, se
   desplazan y `subtitulos.py` las reagrupa, así cada rótulo dice exactamente lo
   que suena en el empalme.

Y se corta por **final de frase**, sacado de la transcripción palabra a palabra.
`comprobar()` avisa si un límite no cae en una y si alguna tarjeta queda partida.

**Salvedad sobre la evidencia:** los datos de duración salen de un estudio de 523
anuncios de Meta en la UE, todos de venta directa. No hay ninguna categoría de
captación de registros ni de LATAM. La variante corta va a ganar en CPM y puede
perder en calidad de registro, y eso solo se ve en coste por registro, no en
hook rate.

## Infografías animadas

Cuatro anuncios de diez llevan una, y solo donde el guion describe una
ESTRUCTURA. Decir «un mapa de preguntas y prioridades» sobre un plano de
alguien hablando desperdicia la frase; dibujarla la remata. Fuera de esos
momentos no pintan nada, y por eso no van en los diez: eso es saturar.

| anuncio | frase | dibujo |
|---|---|---|
| 2 | «necesitas un mapa de preguntas y prioridades» | **ruta**: cuatro preguntas que se marcan una a una |
| 3 | «en qué orden vas a conectar comercialización, policultivo…» | **orden**: cinco barras escalonadas numeradas |
| 4 | «pasar de ideas aisladas a decisiones conectadas» | **red**: puntos sueltos que se conectan |
| 6 | «una finca empieza a cambiar cuando conecta sus ciclos» | **ciclo**: cuatro nodos con flechas, en bucle |

Cuatro gramáticas distintas a propósito: si las cuatro fueran la misma lista
animada, la campaña se leería como plantilla.

En el 3 y el 4 la infografía **sustituye** a la pastilla, no se suma. La
pastilla decía «Y en qué orden conectarlos» y «De ideas sueltas a decisiones
conectadas», o sea exactamente lo que ahora dibuja la infografía.

```bash
node infografias.cjs anuncio-03      # PNG por fotograma → _rot/<anuncio>/info/
```

`componer.py` las monta como tercera pista con alfa, por debajo de las
tarjetas y por encima de los subtítulos. La mecánica es la de las tarjetas —
una sola pista continua con transparencia en los huecos— porque una entrada de
ffmpeg por infografía vuelve a colgar el `overlay`.

**El tamaño es la trampa.** La primera versión salió a 38-44 px y sobre el
vídeo se leía como letra pequeña al lado de los subtítulos, que van a 74. Hubo
que rehacerla entera. La referencia es el subtítulo: aquí nada baja de 42 px, y
todo lleva placa oscura detrás para leerse sobre cualquier fondo.

## Dónde NO va el texto

Se comprobó fotograma a fotograma, y dos cartelas fallaban:

| cartela | qué pasaba |
|---|---|
| `ficha` (fecha) | a `top:286px` le tapaba la cabeza en **cinco de los diez** (3, 5, 7, 8, 10). Solo funciona con Iván sentado. → `top:740px` |
| `pastilla` | a `top:330px` le tapaba la cabeza en **cuatro** (6, 7, 9, 10). → `top:700px` |

El `gancho` estaba bien en los diez: va por encima de la cabeza, y en el 4, 8 y
10 cae sobre b-roll. La banda de subtítulos empieza en 1150, así que todo lo que
se baje tiene que caber por encima: 740 + 390 de ficha = 1130, justo.

## Cómo recuperar el b-roll

`Ivan/fuentes/broll` se borró al cerrar la tanda para dejar disco libre. Los 39
clips estaban comprobados uno a uno contra la carpeta de recursos del cliente
antes de borrarlos, así que se recuperan enteros:

```bash
rclone copy --drive-root-folder-id 1NcQKd2w7-MBSmWLHdsECerI5E7n_n_CE \
  gdrive: "Ivan/fuentes/broll" --include "*.MP4"
```

Qué clip usa cada anuncio está en `recursos-usados.json`, con el segundo de
entrada y la frase sobre la que cae. Con eso y los `edl-anuncio-NN.json` se
puede rehacer cualquier anuncio sin volver a decidir nada.

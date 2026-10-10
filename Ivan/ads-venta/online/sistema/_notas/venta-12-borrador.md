# venta-12 · borrador (Claude)

Pieza online, 34,88 s, 15 cortes (media 2,33 s), b-roll 11,29 s = 32,4 % contando
el mockup y sin contar el móvil. `validar.py` da OK (y `afinar.py` no tocó nada:
las 14 fronteras ya estaban en separaciones entre palabras). Sin render.

## Montaje

| t | qué | por qué ahí |
|---|---|---|
| 0,00-4,00 | plano C + gancho | apertura. C rebajado a `675:1200:107:35` deja la cabeza en ≈610 y el gancho a `top:290` cae sobre el cielo |
| 4,00-5,68 | plano A | «es más, el mejor momento» — se abre al plano entero |
| 5,68-8,36 | plano C + pastilla | «para aprender es antes de firmar» con la pastilla a `top:330`, otra vez sobre el cielo |
| 8,36-10,97 | `CULTIVO JOVENES 2_0` in 0,5 x 900 (ganador) | «la mayoría se imagina los cultivos»: la frase y las plántulas, clavado |
| 10,97-13,09 | plano A | «antes de evaluar el lote, el agua,» |
| 13,09-15,22 | foto `v12-lote-bosque` (1_microclima-0#5), kb in | «el terreno, el propósito y compromete»: aérea de potreros, camino, cerca y lote pelado — es el terreno que se evalúa |
| 15,22-17,06 | plano B | «años de inversión a ciegas,» |
| 17,06-18,93 | `DJI_…0326_D_0` in 4,2 x 1000 (ganador) | «todo lo que ves aquí se decidió» — las eras y los surcos |
| 18,93-20,72 | plano A | «leyendo primero el terreno.» vuelve a él para el remate de la frase |
| 20,72-23,21 | mockup `03-microclima-uvp.jpg`, kb out + tarjeta `uvp` | «Ese orden es el que enseño en el curso online,»: el MÓDULO 01 MICROCLIMA entra justo al nombrar el curso y sigue mientras dice «estudias los siete principios» |
| 23,21-25,00 | plano B | «estudias los siete principios de» |
| 25,00-27,19 | `DJI_0064_0` in 21,8 x 100, enfocar, velocidad 1,35 (ganador) | «inmunidad del bosque, usas los recursos de», el último recurso antes del móvil, que es donde el análisis la pide |
| 27,19-28,85 | plano A + ficha | «evaluación y traes una pregunta a las» |
| 28,85-31,95 | móvil online in 4,84 | lo fija `cerrar.py` |
| 31,95-34,88 | plano B + cartela | cierre |

## Decisiones

- **El gancho y la pastilla van los dos sobre el plano C, y C se usa dos veces en
  los primeros 8,4 s (cortes 1 y 3, con la A de 1,68 s en medio).** No es
  descuido, es la única solución que encontré: Iván tiene la cabeza muy alta
  (y≈416) y el polo blanco, así que el texto blanco solo se lee sobre el cielo.
  Medido con previas: la pastilla a `top:700` cae entera sobre el polo y no se
  lee; a `top:940` choca con el subtítulo (dos líneas blancas pegadas); a
  `top:330` sobre la C rebajada se lee perfecta. Si Codex prefiere variedad de
  plano antes que la frase asignada, la alternativa medida y también limpia es
  mover la pastilla a 15,30-17,90 (`top:330` sobre el plano B y la aérea de las
  eras), o sea a «compromete años de inversión a ciegas», que además es la frase
  de dolor a la que «compra criterio» contesta. Lo dejé en la frase que pedía la
  ficha.
- **La pastilla no pudo ir en «Antes de comprar un lote, compra criterio».** Esa
  frase va de 30,37 a 33,19 y ahí ya están el móvil (28,85-31,95) y la cartela
  (32,15-34,88): solo quedan 0,20 s libres. Se fue a la segunda opción de la
  ficha. El texto sí es el de la ficha (span «Antes de firmar», strong «Compra
  criterio»).
- **La foto del agua (`5_Agua-0#2`) se quedó fuera, y es geométricamente
  imposible usarla como pedía la ficha.** «El agua» dura 0,53 s (12,56-13,09) y
  «el lote» los 0,52 s justo anteriores: para poner una foto en cada una harían
  falta dos cortes de 1,6 s pegados, que es «dos b-roll seguidos», o un plano de
  Iván entre las dos, que no cabe (10,97→14,49 son 3,52 s y tres cortes piden
  4,8 s). Elegí la aérea del lote porque su motivo — potrero, camino, cerca,
  lote pelado — cubre «el lote, el agua, el terreno» entero, y la corrí dos
  palabras hasta «el terreno, el propósito». Meter la charca a la fuerza en
  «años de inversión a ciegas» habría sido b-roll que no ilustra su frase.
- **El mockup cayó en «el curso online» y no en «los siete principios».** La cola
  está encadenada: el móvil lo clava `cerrar.py` en 28,85 y antes hace falta un
  plano de ≥1,6 s, así que la última frontera útil para un b-roll es 27,19. De
  ahí hacia atrás solo sale una cadena legal (plano · mockup · plano · DJI_0064 ·
  plano) y obliga a que el mockup acabe en 23,21. La ventana 20,72-23,21 cubre
  «Ese orden es el que enseño en el curso online,» y sigue en pantalla mientras
  arranca «estudias los siete principios»: el módulo aparece al nombrar el curso.
  Si se quiere el mockup exactamente sobre «los siete principios de inmunidad del
  bosque», la única forma es adelantar DJI_0064 a 20,00-22,31 y poner el mockup en
  23,91-27,19 — pero entonces la aérea del CTA deja de estar justo antes del móvil
  y la aérea de las eras se sale de su frase. Prioricé el análisis de resultados.
- **Móvil con `in` 4,84 en vez de 4,6.** El clip dura 8,00 s y el corte 3,10 s, así
  que 4,90 es el tope; 4,84 deja 0,06 s de margen y es el valor que más esconde el
  titular de la página detrás de la tapa. Aun así, durante el primer segundo y
  medio se sigue viendo «Desde donde estés.» debajo de «INSCRÍBETE ONLINE» (los dos
  en lima, sobre el verde de marca). No hay forma de arreglarlo desde la EDL: para
  bajar el contenido haría falta recortar con y negativo.
- **Media de corte 2,33 s**, por debajo de los ~3 s de referencia. La pieza dura
  34,88 s y la cola (móvil 3,10 + cartela 2,73) la fija `cerrar.py`, así que los
  28,9 s de cuerpo tienen que alojar cinco recursos, el mockup y nueve planos.
  Ningún corte baja de 1,66 s ni pasa de 4,00 s, y la dispersión es propia (1,66 a
  4,00), no clavada.
- **Planos.** A es el máster entero (cabeza 416, barbilla 624: aguanta la ficha a
  `top:740` con 116 px de aire). B = `830:1476:55:71`, medio normal, sin ninguna
  tarjeta debajo. C = `675:1200:107:35`, rebajado a propósito para que el texto
  caiga en el cielo. Ningún recorte se sale (B: 885/1547; C: 782/1235) y las dos
  relaciones son 0,5623 y 0,5625 contra 0,5625 de la salida.
- **Ficha `ficha_online` en 25,90-28,70 (2,80 s)**, a caballo de la aérea del CTA y
  del plano A. Acaba 0,15 s antes del móvil, así que `cerrar.py` no la recorta.

## Comprobado en previas (no en render)

Gancho en 0,5/1,5/2,5/3,5; la pastilla en sus dos extremos y en las tres
posiciones que probé; los cinco b-roll por dentro y por sus bordes; la foto del
lote y el mockup con el `uvp`; la ficha sobre la aérea y sobre el plano A; el
móvil en 29,5/30,5/31,5 más un compuesto aparte de la tapa sobre el clip; la
cartela en 32,5/33,5. Medí sobre el PNG que el botón coral del cierre cae en
1082-1198, dentro de la zona visible. Nada tapa la cara ni se sale del rojo.
Las tres hojas están en `_previa/venta-12-borrador-{0,1,2}.jpg`.

**Lo que no se puede ver aquí:** el Ken Burns de la foto del lote y del mockup, y
si la aérea a velocidad 1,35 tiembla. Las dos cosas hay que mirarlas en el render
(fase 3).

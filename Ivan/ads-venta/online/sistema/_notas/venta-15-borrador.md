# venta-15 · borrador (Claude)

Pieza online, 34,84 s, 13 cortes (media 2,68 s), b-roll 12,345 s = **35,4 %**
contando el mockup y sin contar el móvil. `validar.py` da **OK** a la primera.
Sin render (fase 1).

## Montaje

| t | qué | por qué ahí |
|---|---|---|
| 0,00-3,80 | **plano A** + gancho | «La misma solución de agua no sirve para todos los lotes.» Abre con el plano abierto porque es el único donde cabe el gancho (ver abajo) y porque el plano ancho muestra el contexto entero: el quiosco, la cerca, las gallinas. La frase habla de contextos distintos |
| 3,80-6,14 | `DJI_0113_0` in 3,6 · x 1260 (aérea cenital del policultivo en terrazas) | «Lo que funciona aquí, **en mi finca**,» — es literalmente su finca vista desde arriba, con los bancales en diagonal, el repollo morado y las lechugas |
| 6,14-9,00 | plano B | «puede fracasar en la tuya si copias tal cual» — se cierra sobre él justo en la advertencia |
| 9,00-12,00 | **foto** `v15-agua-hojarasca.jpg`, kb `in` | «Cambia la lluvia, la pendiente, el suelo, la evaporación,» — agua corriendo a ras sobre la hojarasca: sirve a tres de los cuatro términos (lluvia, suelo, evaporación) |
| 12,00-14,28 | plano C | «por eso enseño el principio y el» — el cerrado para la promesa del método |
| 14,28-17,00 | `DJI_0135_0` in 4,2 · x 1600 (ovejas desde el aire, ladera con cerca) | «criterio para **adaptarlo a tu contexto**» — otro terreno, otra pendiente, otro uso: es el «tu contexto» en imagen |
| 17,00-21,00 | plano B + **infografía `ruta`** | las cuatro preguntas, una por cada pregunta de la voz |
| 21,00-23,47 | **mockup** `07-agua-uvp.jpg`, kb `out` + tarjeta `uvp` | «Eso es lo que ves en el curso online,» — y el mockup que toca es justo el del módulo 05 AGUA, el tema de esta pieza |
| 23,47-25,20 | plano A + ficha | «con espacios en vivo para» |
| 25,20-27,015 | `DJI_0064_0` in 25,8 · x 1312 · `enfocar` · velocidad 1,35 | «preguntarme por tu caso.» — la aérea de 30 s que el análisis pide para el llamado a la acción. Es lo más cerca del móvil que puede estar (ver abajo) |
| 27,015-29,280 | plano C | «Tu clima cambia el diseño.» — vuelve a su cara para la frase que cierra el argumento |
| 29,280-32,000 | móvil online (in 4,6) | lo fija `cerrar.py` |
| 32,000-34,840 | plano A + cartela | «Mira el link abajo.» |

`afinar.py`: 0 ajustes (las trece fronteras ya caían en separación entre
palabras). `cerrar.py`: no movió nada — el móvil ya salía 29,28-32,00 (2,72 s) y
la cartela 32,20-34,84 (2,64 s), dentro de banda.

## Decisiones

- **El gancho abre sobre el plano A y no sobre el B, que era el de la ficha.** A
  `top:290` el gancho ocupa hasta y≈478 (más el resplandor, hasta 549). Medido en
  previa: la cabeza de Iván empieza en **≈544 en A, ≈500 en B y ≈470 en C**. Sobre
  B quedaban 22 px entre «se diseña» y el pelo; sobre A quedan ~66 px y la
  primera línea cae sobre cielo azul, que es donde mejor se lee el blanco.
  Bajarlo a `top:760` no era opción: el texto blanco caería sobre el polo blanco.
  Como corte 0 pasó a A, el corte 2 pasó a B para no repetir plano tras el b-roll.
- **No bajé el recorte de B** (sigue en `830:1476:141:179`) aunque habría
  resuelto el gancho: con `y≈120` la barbilla se iría a ≈728 y la infografía del
  corte 17,00-21,00 (placa en 680, primera fila en ≈706) le taparía el mentón.
  B tiene que servir a la infografía, no al gancho.
- **Infografía `ruta` a `y:680`, la altura por defecto**, comprobado en previa a
  17,6 / 18,6 / 19,5 / 20,8: la barbilla en B queda en ≈655 y la primera fila
  arranca en ≈706. Acaba en 1110, con 40 px de aire antes de la banda de
  subtítulos. Los cuatro textos **entran a 52 px sin salto de línea**: el más
  largo («¿Cómo observar tu terreno?») llega a x=867 de 1080.
- **La aérea `DJI_0064_0` no puede ir pegada al móvil.** Su sitio natural era «Tu
  clima cambia el diseño» (27,015-29,280), pero el móvil arranca en 29,28 —lo fija
  `cerrar.py` y no hay otra separación entre palabras que dé los ~3 s— y dos b-roll
  seguidos son fallo de `validar.py`. Así que va un corte antes, en «preguntarme
  por tu caso», con el plano C de Iván entre ella y el móvil. Es la posición más
  cercana al CTA que permite la regla.
- **Sin pastilla**, como pide la ficha: la infografía la sustituye.
- **La ficha `ficha_online` va 23,70-26,90 (3,20 s)**, a caballo del plano A y de
  la aérea. A `top:740` deja ~35 px entre la barbilla (≈705 en A, se mueve) y el
  borde de la placa, y acaba en ≈1134, por encima de los subtítulos. La mitad de
  su ventana cae sobre la aérea, donde no hay cara que tapar. Su titular («Desde
  tu país») encaja con la frase de los espacios en vivo.
- **No usé la foto `3_reciclaje_de_nutrientes-0#6`** (opcional, para «el suelo»).
  «Cambia la lluvia, la pendiente, el suelo, la evaporación» son 3,00 s: con dos
  b-roll ahí haría falta un plano en medio y los tres cortes bajarían de 1,6 s.
  La foto de agua cubre ese tramo entero y sirve a tres de los cuatro términos.
- **Ovejas en «adaptarlo a tu contexto» y no en «la pendiente»**, al contrario de
  lo que sugería la ficha, por lo mismo: en esos 3,00 s solo cabe un b-roll, y la
  foto de agua es la que corresponde al principio del que habla la pieza. Las
  ovejas ganan más en «tu contexto», donde la ladera con cerca lee como «otro
  terreno que no es el mío». Si Codex prefiere lo contrario, es intercambiar los
  `broll` de los cortes 3 y 5 (la foto pasa a 14,28-17,00 y las ovejas a
  9,00-12,00); las duraciones ya son compatibles.
- **Dos cortes cortos seguidos (1,73 s y 1,815 s) entre el mockup y el plano C.**
  Es deliberado: acelera al entrar en el llamado a la acción. Ninguno baja del
  mínimo de `afinar.py` (1,60 s).
- **B-roll al 35,4 %**, dentro de la banda 28-38 %. Si hubiera que bajarlo, lo
  primero que sobra es la aérea de `DJI_0064_0` (bajaría a 30,2 %), pero es
  justo el recurso que el análisis pide para el CTA.

## Comprobado en previas (no en render)

Gancho a 0,8 / 2,0 / 3,5 · los cinco b-roll por dentro y por sus bordes (4,5 /
5,9 / 10,0 / 11,8 / 15,0 / 16,8 / 21,6 / 23,3 / 26,5) · los tres planos de Iván
a 7,5 / 13,0 / 14,0 / 28,5 · la infografía en sus cuatro entradas · el mockup con
el `uvp` · la ficha sobre plano A y sobre la aérea · el móvil con su tapa a 30,0 y
31,8 · la cartela a 33,2. Nada tapa la cara, nada se sale de la zona segura y
todo texto se lee. Hoja completa: `_previa/venta-15-borrador-{0,1,2}.jpg`.

**Lo que no se puede ver aquí:** el Ken Burns de la foto de agua y del mockup, y
si la aérea a velocidad 1,35 tiembla. Las dos cosas hay que mirarlas en el render
(fase 3).

## Para Codex

- El texto del guion `guiones/g15.md` (y el `trabajo/venta-15.txt`) dice «La
  misma solución de agua **nos** sirve», y lo que se oye es «**no** sirve».
  `subs-venta-15.json` ya está corregido y dice «no sirve»: no hay nada que
  arreglar en la pieza, pero el guion de referencia sigue con la errata.
- El whisper transcribe «¿Entender el agua? Sigue siendo…» con signos de
  interrogación; los subtítulos ya están corregidos a la frase afirmativa
  «Entender el agua sigue siendo el punto de partida».
- En el móvil, el botón «Quiero formarme online» de la grabación cae hacia
  y≈1536, dentro de los 420 px que tapa Instagram. Viene del `in: 4,6` que fija
  el encargo y es igual en todas las piezas; la tapa `tapa_online` sí queda
  arriba, donde toca.

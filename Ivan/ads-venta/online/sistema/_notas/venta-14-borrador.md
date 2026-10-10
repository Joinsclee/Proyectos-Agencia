# venta-14 · borrador (Claude)

Pieza online, 27,24 s, 11 cortes (media 2,48 s), b-roll 8,63 s = 31,7 % contando
el mockup y sin contar el móvil. `validar.py` da OK. Sin render.

Ángulo: Objeción–Respuesta · quien no puede ausentarse cuatro días.

## Montaje

| t | qué | por qué ahí |
|---|---|---|
| 0,00-2,47 | plano A + gancho | «No todo el mundo puede dejar el trabajo, la familia y». Abro con la cara de Iván: es un anuncio de objeción y lo que sostiene la promesa es que él la reconoce, no el paisaje |
| 2,47-4,86 | gallinas (`VID_20260819_154811488_0`, in 7,0, x 1150) (ganador) | «la finca durante 4 días, lo sé.» — el corredor de gallinas en pastoreo es literalmente la finca que no puede dejar sola cuatro días |
| 4,86-7,96 | plano B + ficha `ficha_online` (4,96-7,80) | «Por eso existe la versión online, lecciones grabadas que ves»: la oferta se nombra y la ficha la concreta |
| 7,96-10,72 | mockup `13-comunidad-12-meses-uvp.jpg`, kb out + tarjeta `uvp` | «cuando puedas a tu propio ritmo y encuentros en»: el mockup es el feed de Skool en el móvil + «12 meses de comunidad · Comparte avances con personas que también están construyendo su finca» |
| 10,72-12,50 | plano C | «vivo conmigo para traer tus» |
| 12,50-14,32 | siembra (`2 siembra2_0`, in 1,55, x 1000) (ganador) | «dudas. Con una acción pequeña»: la mano soltando UNA semilla en el surco es la imagen exacta de «una acción pequeña» |
| 14,32-15,96 | plano A | «por semana bien elegida,» |
| 15,96-17,62 | cosecha de berenjena (`CULTIVO BERENJENA COSECHA 2_0`, in 3,2, x 1150) (ganador) | «tu finca avanza más que con»: el fruto colgando es el resultado de esa acción repetida |
| 17,62-21,40 | plano B + pastilla (18,90-21,30) | «un año de ideas sueltas. La formación tiene que caber en tu vida.» — la tesis del anuncio, en cámara |
| 21,40-24,20 | móvil online (in 4,6) + tapa | lo fija `cerrar.py` |
| 24,20-27,24 | plano C + cartela de cierre | cierre |

`afinar.py` no tocó nada (0 ajustes) y `cerrar.py` tampoco movió el móvil: escribí
las once fronteras ya sobre separaciones entre palabras y el remate ya salía en
2,80 s de móvil + 0,20 de hueco + 2,84 de cartela.

## Decisiones

- **Abro con Iván y no con b-roll.** venta-11 abre con la aérea del lago; aquí el
  gancho es una pregunta que le hace a la cara («¿No puedes irte cuatro días?») y
  la concesión («lo sé») es lo que compra la atención. Las gallinas entran a los
  2,47 s, justo en «la finca».
- **Gancho a `top:290` (el de por defecto) sobre el plano A.** En A la cabeza
  arranca en y≈540 y el gancho acaba en ≈549 con su halo: cae sobre el cielo con
  aire. En B (cabeza ≈470) y en C (≈384) lo habría tocado, así que el corte de
  apertura tiene que ser A.
- **Los tres ganadores caben, pero la cosecha se corre 0,9 s.** «Con una acción
  pequeña por semana» (13,38-15,02) y «tu finca avanza» (15,96-16,89) son frases
  pegadas, y entre dos b-roll tiene que haber un plano de ≥1,55 s. Es aritmética:
  no existe forma de poner b-roll en las dos y respetar el mínimo. Elegí que la
  siembra caiga exacta sobre su frase y que la cosecha entre en 15,96, sobre «tu
  finca avanza más que con», que sigue siendo su idea. La alternativa era meter la
  cosecha en «un año de ideas sueltas», que contradice la imagen.
- **El mockup arranca en 7,96 y no en 9,79.** La ficha ofrecía «encuentros en vivo
  conmigo para traer tus dudas» o «La formación tiene que caber en tu vida». La
  segunda la ocupa la pastilla, y la primera empieza demasiado tarde para dejar el
  plano de ≥1,55 s que hace falta antes de la siembra. Así que el mockup entra un
  poco antes y cubre «cuando puedas a tu propio ritmo y encuentros en»: el mockup
  ES la plataforma (feed de Skool en el móvil), así que ilustra «ves cuando puedas
  a tu propio ritmo» igual de bien y llega a «encuentros». Dura 2,76 s, dentro de
  la banda 2,4-3,4.
- **Pastilla en «La formación tiene que caber en tu vida», como manda la ficha**
  (ahí va el b-roll de siembra en su frase primaria). Texto: span «Cada semana»,
  strong «Una acción pequeña, bien elegida».
- **Pastilla a `top:740`, no a `top:700`.** A 700 la píldora lima quedaba pegada a
  la barbilla (en B la barbilla cae en ≈700). A 740 deja los mismos ~40 px de aire
  que la ficha y el bloque acaba en 1084, por encima de los subtítulos en 1150.
  Comprobado a tamaño real: el titular blanco se lee sobre el polo claro porque la
  sombra del `.pastilla strong` es suficiente.
- **Ficha en el primer tramo de la oferta (4,96-7,80), no pegada al móvil.** Con la
  pastilla en 18,90-21,30 y el móvil en 21,40 no queda hueco de 2,6 s al final. A
  `top:740` sobre el plano B la cara queda libre y la placa acaba en 1142.
- **Plano C subido de `675:1200:165:260` a `165:300`.** Con el punto de partida la
  cabeza caía en 448 y la B en 470: los dos planos se leían casi igual. Subiendo
  40 px la cabeza va a 384 y la C se distingue como cerrado. C no lleva tarjeta
  debajo en ninguno de sus dos cortes (12,50 y el de la cartela), así que no hay
  riesgo.
- **`in` de la siembra en 1,55 y no en 1,0.** Con 1,0 el corte abría sobre tierra
  pelada y la mano no entraba hasta 0,6 s. La acción (mano + semilla) vive en
  1,6-2,3 del clip, así que con 1,55 el corte abre ya con la mano y suelta la
  semilla a los 0,4 s.
- **Media de corte 2,48 s.** Con 27,24 s y una cola fija de 5,84 s (móvil +
  cartela), el cuerpo son 21,40 s y hacen falta cinco planos intercalados entre los
  cuatro b-roll: nueve cortes mínimo. Ninguno baja de 1,64 s ni pasa de 3,78 s.
- **Sin infografía**, como pide la ficha.

## Comprobado en previas (no en render)

Gancho sobre A (0,6 y 1,6) y sobre las gallinas (3,4 y 3,9); los tres planos
barridos a lo largo de sus cortes con hojas de contacto (B durante la ficha y
durante la pastilla, C en sus dos cortes, A en los suyos) porque Iván se mueve;
los cuatro b-roll por dentro y por sus bordes; el mockup con el `uvp`; la ficha y
la pastilla a tamaño real recortadas sobre la cara; el móvil con su tapa en 22,5 y
23,6; la cartela en 24,5 / 25,5 / 26,5; y las tres hojas del borrador. Nada tapa
la cara, nada se sale de la zona segura y ninguna tarjeta se solapa.

**Lo que no se puede ver aquí:** el Ken Burns `out` del mockup. Hay que mirarlo en
el render (fase 3).

## Para Codex

- Si quieres el mockup exactamente sobre «encuentros en vivo conmigo para traer tus
  dudas», hay que sacar la cosecha del montaje (b-roll bajaría a 25,2 %, por debajo
  del suelo del 28 %) o meterla en «un año de ideas sueltas». Dime cuál prefieres.
- El texto de la pastilla («Cada semana / Una acción pequeña, bien elegida») está
  puesto sobre «La formación tiene que caber en tu vida» porque la ficha lo manda
  así cuando la siembra ocupa su frase. Si lo quieres literalmente sobre su frase,
  tendría que ir encima del b-roll de siembra.

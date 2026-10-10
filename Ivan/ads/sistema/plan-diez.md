# Los diez anuncios · entregados

Los diez están montados, revisados fotograma a fotograma y subidos a la
carpeta de entregas del cliente. Todos a 1080x1920, 25 fps, entre −14,0 y
−14,5 LUFS con picos de −1,2 a −1,4 dBFS: ninguno suena más alto que otro.

| # | ángulo | dura | cortes | media |
|---|---|---|---|---|
| 1 | El sueño que se come los ahorros | 56.1 s | 19 | 2.95 s |
| 2 | La finca bonita que sale cara | 49.9 s | 16 | 3.12 s |
| 3 | La finca que cobra todos los meses | 52.2 s | 17 | 3.07 s |
| 4 | La finca parada | 44.3 s | 16 | 2.77 s |
| 5 | El chiste del agrónomo | 52.6 s | 17 | 3.10 s |
| 6 | Veinte años en agroquímicos | 52.5 s | 18 | 2.92 s |
| 7 | El 70 % del restaurante | 51.4 s | 17 | 3.03 s |
| 8 | A quién le vendes | 44.9 s | 16 | 2.81 s |
| 9 | Policultivo no es sembrar al azar | 44.8 s | 15 | 2.99 s |
| 10 | La huerta no nació así | 53.5 s | 16 | 3.35 s |

El ritmo es lo que impide que se parezcan: va de 2,77 s de media en el 4, que
es seco y ordenado, a 3,35 s en el 10, que es el más reflexivo. Y ninguno
empieza por el mismo plano.
## Reglas del reparto

El pozo eran **39 clips** (3,6 GB, casi todos 4K) en `Ivan/fuentes/broll`,
borrados al cerrar la tanda (ver «Cómo recuperar el b-roll» en `LEEME.md`).
`reparto-broll.json` los tiene ya apartados anuncio por anuncio, con la frase
del guion a la que responde cada uno. `recursos-usados.json` es el libro de lo
consumido de verdad. Antes de escribir una EDL, mirar los dos.

1. **Un clip sirve a un solo anuncio.** Cuatro huecos de B-roll por pieza: 36
   huecos contra 39 clips, así que alcanza sin apreturas.
2. **Una sola excepción, y está marcada.** La aérea `DJI_0064` es la única
   toma del conjunto y los anuncios 2 y 10 la piden los dos: va con segmentos
   distintos (2-8 s y 18-26 s) y planos distintos. Y `…0326` vuelve en el 9
   con otro segmento y plano cerrado.
3. **El CTA del móvil va en los diez**, en el momento en que Iván dice que se
   registren. Es lo que unifica la campaña.
4. **La cartela de cierre también se repite en los diez**, tal cual.
5. Todo lo demás cambia: B-roll, encuadres y el orden de los planos.

Los 4K dan un segundo plano gratis: un `crop` sobre el original es nativo en
píxel, así que de una misma toma salen un general y un cerrado sin segunda
cámara. Ahí está el margen para que dos anuncios con material vecino no se
parezcan.


## El hueco de audio: no está

El cliente mencionó que uno de los diez tenía «un pequeño corte, como un vacío,
que no quedó bien unido». **Se buscó de cinco maneras y los diez salen limpios:**

| qué se midió | resultado |
|---|---|
| silencios ≥0,7 s a −38 dB | 0 en los diez |
| silencios ≥0,5 s a −30 dB | 0 en los diez |
| cambios de escena (umbral 0,30) | 0 en los diez |
| saltos de imagen (umbral 0,06) | 5, todos movimiento de manos, comprobado a ±0,08 s |
| cola muda al final | máx 0,7 s, normal |
| corte a media palabra | ninguno, los diez cierran con frase completa |
| frase repetida por mal empalme | ninguna |

Lo único que chirría es de **contenido, no técnico**: el **anuncio 4** dice
«Regístrate gratis» y *después* «Hacemos pocos eventos online como este durante
el año». El CTA va antes que la escasez, así que el cierre pierde fuerza. Se
arregla en la EDL invirtiendo los dos últimos bloques, sin regrabar.

Si el corte que preocupaba está en otro sitio, hace falta que diga en cuál de
los diez y hacia qué segundo, y se mira ese en concreto.

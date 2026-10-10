# venta-03 · Borrador (Claude)

Pieza presencial, ángulo PASTOR. 34,96 s · 12 cortes · media 2,91 s · b-roll 29,1 %
(10,18 s contando el mockup, sin contar el móvil). `validar.py` → **OK** (con
`tarjetas-venta-01.json` ya en disco, así que la cartela de cierre coincide).

## Estructura

| t | qué | voz |
|---|---|---|
| 0,00-2,50 | **DJI_0064** `in` 9,0 · `608:1080:1100:0` · `enfocar` · `velocidad` 1,35 | «Tienes finca hace meses o hace años» |
| 2,50-6,00 | plano A | «y cada visita termina con muchas ideas pero ninguna prioridad» |
| 6,00-9,28 | plano B | «Te entiendo, así se estanca uno» |
| 9,28-12,60 | plano C | «con miedo de arrancar por donde no era y enterrar la plata» |
| 12,60-14,91 | **chica con la cosecha** `in` 0,1 · `1215:2160:1300:0` | «Esta finca, hoy, alimenta la cosecha» |
| 14,91-17,41 | plano B | «de un hotel y arrancó igual que la tuya» |
| 17,41-19,94 | **plántulas** (CULTIVO JOVENES 3) `in` 1,0 · `1215:2160:1450:0` | «llena de ideas. Lo que la puso a andar fue una» |
| 19,94-23,48 | plano A + pastilla | «secuencia: qué va primero, qué va después. Y por eso,» |
| 23,48-26,32 | **mockup** 19-preguntas-conexion-uvp + tarjeta uvp | «en el Campo Escuela de La Huerta LAB, pasarás cuatro días» |
| 26,32-29,18 | plano C + ficha | «observando, practicando y preguntando. Y te vas» |
| 29,18-32,00 | móvil + tapa | «con una ruta inicial para tu finca» |
| 32,00-34,96 | plano A + cartela (desde 32,20) | «Deja de dar de vueltas, el link está abajo» |

Textos escritos por mí: gancho «Muchas ideas, *ninguna prioridad*» y pastilla
«La clave / Qué va primero y qué va después» (con `<br>` para partir las dos
líneas iguales; sin el salto quedaba «después» huérfano). Sin infografía, como
pedía la ficha.

## Decisiones que se apartan de la ficha, y por qué

1. **DJI_0064 abre la pieza, no va antes del móvil.** La ficha lo quería en «Y te
   vas con una ruta inicial para tu finca», pero esa frase es justo la que ocupa
   el móvil: `cerrar.py` clava la cartela en los últimos 2,80 s (32,16 →
   redondea a 32,00) y el móvil en los 3 s anteriores, así que el CTA cae sobre
   «Y te vas…» y «Deja de dar de vueltas…». Y aunque cupiera, entre el mockup y
   el móvil tiene que haber un plano de Iván (`validar.py` no admite dos b-roll
   seguidos), y de 22,90 a 29,18 solo caben mockup (≥2,4 s) + plano (≥1,6 s).
   Probé todas las combinaciones: no hay hueco para la aérea en el tramo del
   CTA. La llevé al arranque porque el análisis asocia esa aérea justo a «si
   tienes finca», que es literalmente la primera frase, y porque así el gancho
   entra sobre imagen y no tapa nada.
2. **El mockup cae sobre «en el Campo Escuela de La Huerta LAB, pasarás cuatro
   días»**, no sobre «observando, practicando y preguntando» entero. Si el
   mockup llega hasta «preguntando» (28,60) el plano siguiente se queda en 0,6 s
   y el móvil se cae por debajo de sus 2,2 s. Colocado así, la promesa en grande
   («Aprende a diseñar una finca productiva») entra exactamente cuando Iván
   nombra el Campo Escuela, y la ficha («4 días y 3 noches») entra justo después
   de que diga «cuatro días».
3. **Sin gallinas, sin la aérea del hotel (DJI_0978) y sin la foto
   7_Descanso-0#9.** Eran opcionales y no caben sin bajar de 1,6 s algún corte o
   sin pegar dos b-roll. Con cuatro recursos la pieza ya va al 29,1 %.

## Correcciones que salieron de mirar las previas

- La pastilla estaba en el plano B a `top:700`: la pastilla lima quedaba pegada
  a la barbilla y el titular blanco caía sobre el polo blanco de Iván. La pasé
  al plano A a `top:290`, sobre el cielo (acaba en ~558 y la cabeza empieza en
  ~594). Para que A no repita plano tras el b-roll, «de un hotel y arrancó igual
  que la tuya» pasó de A a B.
- El clip de la chica, tal como estaba (12,60-15,62), entraba de 2,6 a 3,6 s del
  original en un primer plano de su torso negro con la cesta fuera de cuadro.
  Lo acorté a «Esta finca, hoy, alimenta la cosecha» con `in` 0,1: se la ve
  caminando con la cesta de principio a fin, y «de un hotel y arrancó igual que
  la tuya» lo dice Iván a cámara.
- Gancho a 4,64 y no a 4,60: `componer.py` solo borra los subtítulos que
  terminan **dentro** de la ventana del gancho, y el segundo subtítulo acaba en
  4,64 exacto. Con 4,60 se habría visto el subtítulo debajo del gancho.
- Ficha a `top:740` sobre el plano C: comprobado a 26,6, 27,0 y 28,5, no toca la
  cara (barbilla en ~658) y acaba en 1142, ocho píxeles por encima de la banda
  de subtítulos.

## Revisado en las hojas

`_previa/venta-03-borrador-0/1/2.jpg` (un fotograma por segundo) más previas
puntuales en 1,5 · 13,5 · 18,5 · 21,5 · 24,0 · 27,0 · 30,2 · 33,5. No hay rótulo
en zona roja, ninguna tarjeta tapa la cara, ninguna se solapa con otra.

## Para la fase de dirección

- Entre el móvil y la cartela queda un subtítulo de 0,20 s («Deja de dar de
  vueltas,»): es el hueco de 0,20 s que deja `cerrar.py`, no algo de esta pieza.
- De 27,71 a 29,18 no hay subtítulo: ese grupo se solapa con el móvil y
  `tapaSubs` lo quita entero. Ahí está la ficha en pantalla.
- El clip del móvil (`in` 4,6, el que fija el encargo) deja asomar el final del
  titular de la página («en el campo.») justo debajo de la tapa, dentro de los
  250 px que tapa Instagram.

No he renderizado nada (fase 1). No toqué `proyecto.json` ni piezas ajenas; para
validar antes de que existiera `tarjetas-venta-01.json` usé una copia del
proyecto en el scratchpad con la referencia de cierre apuntando al
`cierre_presencial` de `tarjetas-fijas.json`.

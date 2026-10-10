# venta-05 · fase 1 · borrador (Claude)

Pieza presencial, máster `ADS _PROJECT 5.mp4` (30,84 s). Ángulo Before–After–Bridge:
el agua se diseña primero. `validar.py` → **OK** · 11 cortes · media 2,80 s ·
b-roll 9,34 s = **30,3 %** (cuenta el mockup, no el móvil).

## Montaje (dónde cae cada cosa)

| t | qué | frase |
|---|---|---|
| 0,00-2,13 | **DJI_0064** in 13,0 · `608:1080:450:0` · `enfocar` · **vel. 1,35** | «Llueve en tu lote.» (bajo el gancho) |
| 2,13-5,88 | plano A | «¿Cuánta de esa agua se queda…? En la mayoría de fincas» |
| 5,88-7,86 | foto **5_Agua-0#6** → `v05-agua-arrastre.jpg`, kb in | «corre, se lleva el suelo,» |
| 7,86-10,60 | plano C | «y meses después toca pagar riego.» |
| 10,60-14,51 | plano B + infografía | «El agua se diseña primero antes que los cultivos y antes que las obras.» |
| 14,51-16,72 | **DJI_0112** in 2,0 · `1215:2160:1150:0` | «Terrazas, zanjas, infiltración,» |
| 16,72-18,70 | plano A | «dónde almacenar y por qué ahí.» |
| 18,70-21,72 | **mockup 07-agua-uvp** kb out + tarjeta `uvp` | «Y cada terreno pide su propio diseño. En el Campo Escuela» |
| 21,72-24,92 | plano C + `fecha` (21,82-24,82) | «de La Huerta LAB, el método funcionando lo podrás ver» |
| 24,92-28,12 | móvil presencial in 4,6 + `tapa_pres` | «y aprenderás a pensar el agua como parte del sistema.» |
| 28,12-30,84 | plano A + `cierre` (28,32-30,84 = 2,52 s) | «Ven a verlo, el link está aquí abajo.» |

Infografía `orden`, y=680, **10,4-15,0 s**: «El agua» · «Los cultivos» · «Las obras».
Adelanté el t0 de 10,6 a 10,4 porque la primera barra entraba con «El agua» ya dicha;
el t1 en 15,0 deja «Las obras» medio segundo quieta sobre la aérea de terrazas.
Sin pastilla, como pedía la ficha.

Gancho 0,2-4,0: «Llueve en tu lote. *¿Cuánta agua se queda?*», `top` por defecto (290):
comprobado en previa que no toca la cabeza ni sobre la aérea ni en el plano A.
`fecha` y `uvp` con el html exacto de `tarjetas-fijas.json`; `desliz: 0` en las cinco.

## Las dos decisiones discutibles

1. **El mockup no cabía donde lo pedía la ficha.** La ficha lo quería sobre
   «aprenderás a pensar el agua como parte del sistema», pero con un máster de
   30,84 s `cerrar.py` clava ahí el móvil (24,92-28,12) y la cartela (28,32-30,84):
   los últimos 6 s no son negociables. Lo puse en la frase de oferta anterior,
   «Y cada terreno pide su propio diseño. En el Campo Escuela», donde además el
   titular `uvp` («Aprende a diseñar una finca **productiva**») rima con «cada
   terreno pide su propio **diseño**».
2. **DJI_0064 está en el gancho y no en el CTA.** El análisis la quiere justo antes
   del móvil, pero ahí tiene que ir un plano de Iván (`validar.py` prohíbe dos
   b-roll seguidos) y ese plano es el único hueco que queda para la `fecha`
   (2,6-3,6 s sin solaparse con la `uvp`). Hice la cuenta: entre el final de las
   terrazas y el móvil no caben mockup + aérea + los planos que los separan.
   Elegí conservar el mockup con la promesa (es lo que vende) y llevar la aérea al
   primer plano del anuncio, donde la voz también la pide literalmente («tu lote»)
   y donde el recurso más potente trabaja para el hook rate. Si Codex prefiere lo
   contrario, la alternativa montada mentalmente era: abrir con plano A, foto del
   reservorio (5_Agua-0#16) bajo el gancho en «¿Cuánta de esa agua se queda?»,
   y DJI_0064 en «En el Campo Escuela de La Huerta LAB» con la `fecha` encima
   (a costa de quedarse sin mockup ni promesa).

## Lo que no usé

`5_Agua-0#16` (reservorio) y `5_Agua-0#0` (quebrada): con ellas el b-roll se iba
del 38 % y obligaban a dos b-roll seguidos alrededor de «dónde almacenar».
`2 siembra2_0.mp4`: chocaba con la infografía, que ocupa toda la frase de los
cultivos. Ninguna foto nueva más en `fuentes/fotos-9x16/` (solo `v05-*`).

## Revisado en previa

Gancho (0,6 · 1,8 · 3,0), cada cambio de plano, los cuatro b-roll, la infografía
entrando (11,0 · 12,9 · 13,3 · 14,2 · 14,8), el mockup con la `uvp` (19,2 · 20,4 ·
21,0), la `fecha` sobre el plano C (22,6 · 23,5 · 24,4), el móvil (26,0 · 27,5) y
la cartela (29,8), más las tres hojas `venta-05-borrador-*.jpg`. Nada se sale de
la zona segura y ninguna tarjeta toca la cara.

Falta por comprobar en el render (fase 3): que la aérea a velocidad 1,35 con
`enfocar` no tiemble, y el Ken Burns del mockup (`kb: out`) y de la foto del agua.

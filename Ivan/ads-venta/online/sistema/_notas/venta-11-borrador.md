# venta-11 · borrador (Claude)

Pieza online, 29,72 s, 12 cortes (media 2,48 s), b-roll 11,20 s = 37,7 % contando
el mockup y sin contar el móvil. `validar.py` da OK. Sin render.

## Montaje

| t | qué | por qué ahí |
|---|---|---|
| 0,00-2,22 | aérea del hotel con el lago (`DJI_0076_0`, in 1,0, x 660, enfocar) | la voz dice «hasta el Lago Calima» y fuera de Colombia ese nombre no significa nada: se ve el sitio al que no puede viajar |
| 2,22-4,02 | plano C | «Tranquilo. El método sí» — aparece Iván justo en la vuelta del gancho |
| 4,02-5,96 | `CULTIVO JOVENES 3_0` in 4,3 x 1900 (ganador) | «puede viajar hasta tu finca» |
| 5,96-9,76 | plano A | la oferta empieza |
| 9,76-12,91 | mockup `11-sesiones-ivan-uvp.jpg`, kb out + tarjeta `uvp` | «los recursos de trabajo y sesiones en vivo conmigo»: el mockup dice «SESIONES EN VIVO CON IVÁN» y remata «Resuelve dudas para tomar decisiones con más criterio», que es la frase siguiente |
| 12,91-15,00 | plano B | «para resolver dudas sobre tu caso» |
| 15,00-16,74 | la cosecha (`DJI_..._0262_D_0`, in 3,9 x 1550) (ganador) | «Caminar la finca cuatro días es» |
| 16,74-20,05 | plano C | la concesión y el giro: «otra experiencia, claro, pero el criterio…» |
| 20,05-22,20 | aérea de la finca (`DJI_0064_0`, in 17,8, x 900, velocidad 1,35, enfocar) (ganador) | «sin improvisar te llega completo», justo antes del móvil, que es donde el análisis la pide |
| 22,20-24,20 | plano B | «a donde estés. Tu ubicación» + ficha |
| 24,20-26,92 | móvil online (in 4,6) | lo fija `cerrar.py` |
| 26,92-29,72 | plano A + cartela | cierre |

## Decisiones

- **Abro con la aérea del lago y no con Iván.** El gancho pregunta «¿No puedes
  viajar?» sobre el lugar al que no puede viajar; con Iván de entrada esa
  pregunta no tiene imagen. Iván entra a los 2,2 s, en «Tranquilo».
- **Gancho a `top:290` (el de por defecto) y plano C rebajado a `675:1200:192:100`.**
  A 290 con la C de la ficha (`y 190`) el «El método sí.» tocaba el pelo; a
  `top:760`, sobre el torso, el texto blanco y la lima caían sobre el polo blanco
  de Iván y se leían mal. Bajando la C la cabeza queda en ≈600 y el gancho cae
  sobre el cielo, con 130 px de aire. La C solo se usa en 2,22 y en 16,74, y en
  ninguna de las dos hay tarjeta debajo.
- **Ficha `ficha_online` en «te llega completo a donde estés» (20,72-24,10).**
  Su titular es «Desde tu país» y cae justo sobre esa frase. A `top:740` deja
  ≈80 px entre la barbilla (≈660 en B) y la placa, y acaba en 1142, por encima de
  los subtítulos.
- **Sin pastilla.** Era opcional y decía «Programa online · A tu ritmo, con
  sesiones en vivo», que es lo mismo que ya dicen el `uvp`, la ficha («Clases a tu
  ritmo + sesiones con Iván») y la cartela. En 30 s con gancho, uvp, ficha, móvil
  y cierre, una tarjeta más satura y habría quedado pegada a la ficha.
- **Media de corte 2,48 s**, por debajo de los ~3 s de referencia: la pieza dura
  29,72 s y la cola (móvil 2,72 + cartela 2,80) la fija `cerrar.py`, así que el
  cuerpo se reparte en cortes más cortos. Ninguno baja de 1,74 s ni pasa de 3,80 s.
- **B-roll al 37,7 %**, cerca del techo de 38 % a propósito: el análisis pide
  cultivo y cosecha en pantalla. Si Codex lo quiere más bajo, lo que sobra es la
  aérea del lago (bajaría a 30,2 %), pero entonces el gancho se queda sin imagen.

## Comprobado en previas (no en render)

Gancho sobre el lago y sobre la C, los cinco b-roll por dentro y por sus bordes,
el mockup con el `uvp`, la ficha sobre la aérea y sobre el plano B, el móvil con
su tapa y la cartela. Nada tapa la cara ni se sale de la zona segura.

**Lo que no se puede ver aquí:** el Ken Burns del mockup y si la aérea a
velocidad 1,35 tiembla. Las dos cosas hay que mirarlas en el render (fase 3).

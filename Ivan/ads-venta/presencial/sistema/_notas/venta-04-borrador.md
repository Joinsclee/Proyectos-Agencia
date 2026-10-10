# venta-04 · Borrador (Claude)

Pieza presencial, ángulo Pain-Gain-Claim (productor dependiente de insumos).
38,04 s · 14 cortes · media 2,72 s · b-roll 11,34 s = **29,8 %** contando el
mockup y sin contar el móvil. `validar.py` → **OK** (con `tarjetas-venta-01.json`
ya en disco, así que la cartela de cierre coincide carácter a carácter).

## Estructura

| t | qué | voz |
|---|---|---|
| 0,00-4,04 | plano A + **gancho** | «¿Cuánta de la plata de tu finca vuelve a salir cada mes en bultos y frascos?» |
| 4,04-6,32 | plano C | «Yo trabajé años en la industria de agroquímicos.» |
| 6,32-9,60 | plano B | «Sé exactamente cuánto cuesta esa dependencia.» |
| 9,60-13,04 | **cerditos** DJI_…0114 `in` 4,5 · `1215:2160:2300:0` | «Hoy trabajo distinto, el estiércol, los residuos de cosecha» |
| 13,04-15,69 | plano C + infografía | «y los microorganismos circulan dentro de la finca y» |
| 15,69-19,11 | **gallinas** VID_20260819 `in` 4,0 · `1215:2160:1900:0` | «producen fertilidad aquí mismo.» |
| 19,11-21,71 | plano B | «¿Que si eliminas todas las compras?» |
| 21,71-24,31 | plano A | «Obviamente no, pero una buena parte de esa fertilidad» |
| 24,31-26,18 | **cosecha** CULTIVO BERENJENA COSECHA 2 `in` 1,2 · `1215:2160:1400:0` | «la puedes producir tú con lo que» |
| 26,18-28,55 | plano C + **ficha** (25,80-28,50) | «tu finca ya genera.» |
| 28,55-31,16 | **mockup** 05-reciclaje-nutrientes-uvp `kb:out` + tarjeta **uvp** (misma ventana) | «En el Campo Escuela de La Huerta LAB lo ves y lo» |
| 31,16-33,12 | plano B | «practicas con las manos en una» |
| 33,12-35,48 | **móvil** `in` 4,6 + tapa (2,36 s) | «finca activa. Revisa el» |
| 35,48-38,04 | plano A + **cartela** desde 35,68 (2,36 s) | «presencial. Link abajo.» |

Infografía **ciclo** 10,45-18,00 · `y` **700** · 4 nodos: Estiércol → Residuos →
Microorganismos → Fertilidad. Sin pastilla, como pedía la ficha.

Texto escrito por mí: solo el gancho, «Tu plata se va *en bultos y frascos*»
(el sugerido en la ficha, sin cambios). Todo lo demás es `html` exacto de
`tarjetas-fijas.json` (`ficha_presencial`, `uvp_presencial`, `tapa_pres`,
`cierre_presencial`).

## Comprobaciones hechas con previas

- **Nodo a 42 px**: medido sobre el PNG final del ciclo. Estiércol 64-289,
  Fertilidad 64-310 (la flecha entra en 353, no se tocan), Residuos 560-792,
  Microorganismos 560-943. Los cuatro caben; «Microorganismos» es el largo y
  está en la posición derecha, que es la que tiene sitio.
- **Infografía a y=700 y no 680**: a 680 la fila de arriba arrancaba a 30 px de
  la barbilla en el plano C (13,04-15,69) y se leía pegada a la cara. A 700 la
  placa acaba en 1130, veinte píxeles por encima de la banda de subtítulos, y
  queda sobre el pecho y las manos. Es la única infografía de la pieza, así que
  el `assert` de altura compartida no se toca.
- **Ficha a top:740**: no tapa la cara en el plano C (cara 448-666); revisado en
  26,60 y 28,20.
- **Gancho a top:290**: cabe entero por encima de la cabeza en el plano A
  (cabeza desde 524); revisado en 1,00 y 3,50. Su ventana llega a 4,04 para que
  `componer.py` borre los dos subtítulos que dirían lo mismo.
- **uvp sobre el mockup**: misma ventana que el corte (28,55-31,16); el titular
  cae en la franja libre de arriba y la pieza del mockup empieza hacia 600.

## Decisiones que se apartan de la ficha, y por qué

1. **La ficha de oferta va antes del mockup (25,80-28,50), no dentro del tramo
   de la oferta.** No cabe de otra forma: desde «En el Campo Escuela…» (28,55)
   hasta el final hay 9,5 s y el remate ya se come mockup (≥2,4) + plano (≥1,6)
   + móvil (≈3,0) + cartela (≈2,8). Metiendo además la ficha (≥2,6) salen 12,4 s.
   La puse sobre «la puedes producir tú con lo que tu finca ya genera», que es la
   frase que entra a la oferta, y arranca ya sobre el b-roll de cosecha.
2. **El b-roll de cosecha cae en «la puedes producir tú con lo que» y no en
   «con lo que tu finca ya genera».** Si acaba pegado al mockup son dos b-roll
   seguidos, y el plano que hay que meter en medio necesita 1,6 s. Corté en
   «que | tu finca», que es frontera de frase, y el plano C se queda con
   «tu finca ya genera».
3. **Las gallinas van en «producen fertilidad aquí mismo» y no en «Hoy trabajo
   distinto» ni en «una buena parte de esa fertilidad».** En «Hoy trabajo
   distinto» solo hay 1,15 s (y ese sitio lo necesitan los cerditos, que entran
   con «el estiércol»); y en «una buena parte de esa fertilidad» chocaban con la
   cosecha, porque entre 22,64 y 28,55 no caben dos b-roll con su plano en
   medio. «Producen fertilidad aquí mismo» dice lo mismo que la frase que
   sugería la ficha y las gallinas en pastoreo lo ilustran igual.
4. **Las dos fotos propias (hoja verde / hongos) se quedan fuera.** En el tramo
   del ciclo (10,75-17,80) solo caben dos b-roll con un plano de 1,6 s entre
   ellos, y los ganadores manda el análisis: cerditos y gallinas. Los
   microorganismos los dice el nodo de la infografía justo cuando se nombran.
5. **Móvil 2,36 s y cartela 2,36 s** (no 3,00/2,80): es lo que deja `cerrar.py`
   con las separaciones entre palabras que hay aquí, dentro de banda (móvil
   ≥2,20; cartela 2,30-3,60). Para llegar a 2,6/2,65 había que dejar el mockup
   en 2,38 s o el plano previo al móvil en 1,59 s, las dos por debajo de los
   mínimos del encargo; preferí respetar los mínimos. Si Codex prefiere el
   remate más largo, la palanca es mockup 28,55-30,93 → móvil 32,58-35,19.

## Encuadres, para no repetir entre piezas

- Gallinas: venta-01 las usa con `in` 0,2 y x 1500; aquí `in` 4,0 y x 1900.
- Cerditos: `in` 4,5 (cabezas y cama profunda). A `in` 5,5 el final del corte
  caía en un plano de grupa, y a x 1500 los cerdos se leían como mancha rosa sin
  la cama; con x 2300 entran los hocicos, la viruta y el comedero.
- Cosecha de berenjena: `in` 1,2 · x 1400 (las berenjenas se van a la izquierda
  conforme avanza el clip; a partir de 3,3 s ya no queda tramo).

No he ejecutado `render.py` (fase 1).

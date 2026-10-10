# venta-01 · fase 1 · borrador (Claude)

41,72 s · 15 cortes · media 2,78 s · b-roll 29,3 % (sin el móvil, contando el mockup) · `validar.py` OK.

## Montaje

| t | qué | por qué |
|---|---|---|
| 0,00-3,96 | plano **B** + gancho | el gancho dura hasta 3,96 y no hasta 3,6: `componer.py` solo borra el subtítulo que **acaba** dentro de la ventana del gancho, así que con el gancho a 3,6 el subtítulo «finca sin saber si encajan entre sí?» se habría dibujado debajo del gancho. Cerrando en 3,96 (fin de la pregunta) la apertura queda limpia |
| 3,96-5,84 | CULTIVO JOVENES_0 `in` 1.0 · x 1312 | «Sembraste esto, después» |
| 5,84-7,44 | plano C | «trajiste animales, después hiciste una» |
| 7,44-9,10 | DJI_0145_0 `in` 1.0 · x 2100 | «construcción rural»: el encuadre coge el galpón de techo rojo, el caney y los potreros labrados |
| 9,10-12,86 | plano B | «y cada cosa suma trabajo, pero nada ordena el sistema.» |
| 12,86-14,66 | plano C | «En el Campo Escuela de La Huerta LAB,» (la marca, en cerrado) |
| 14,66-17,68 | VID_20260819 (gallinas) `in` 0.2 · x 1500 | «el suelo, el agua, los cultivos y los animales» |
| 17,68-21,72 | plano A + infografía `red` | «trabajan en sistema porque las decisiones se toman mirando el conjunto» |
| 21,72-24,68 | plano C + ficha | «Esto es lo que voy a enseñar en el curso Fincas Productivas:» |
| 24,68-27,38 | mockup 15-inmersion-4-dias-uvp + tarjeta uvp, `kb: out` | «cuatro días, caminando esta finca en» |
| 27,38-31,05 | plano A + pastilla | «operación, viendo los siete principios de inmunidad del bosque» |
| 31,05-34,01 | DJI_0064_0 `in` 0.8 · x 650 · `enfocar` · `velocidad` 1.35 | «funcionando y sales con una ruta para tu» |
| 34,01-35,84 | plano B | «terreno. Si tu finca te pide más» |
| 35,84-38,72 | móvil `in` 4.6 + tapa | CTA |
| 38,72-41,72 | plano A + cartela | cierre |

## Decisiones que se apartan de la ficha, y por qué

1. **Las gallinas no caen en «después trajiste animales», sino en «el suelo, el agua, los
   cultivos y los animales».** Las tres frases del PAS («Sembraste esto» 1,47 s / «después
   trajiste animales» 1,41 s / «después hiciste una construcción rural» 2,26 s) son
   demasiado cortas para tres b-roll alternados con planos: cada corte necesita 1,6 s y
   entre dos b-roll tiene que haber un plano, o sea 5 cortes ≥ 1,6 s dentro de 6,9 s.
   Comprobado contra las fronteras de palabra: no hay reparto posible. Elegí conservar
   cultivo (3,96) y construcción rural (7,44), que son las dos frases más literales, y
   llevar las gallinas a la enumeración del sistema, donde la voz vuelve a decir
   «animales» y el clip ilustra «la finca funcionando», que es uno de los usos que pide
   el análisis.
2. **La aérea DJI_0064 no está pegada al móvil.** `validar.py` falla con dos b-roll
   seguidos y el móvil es b-roll, así que entre la aérea y el móvil va obligatoriamente
   un plano. Como `cerrar.py` clava el móvil en 35,84-38,72, la aérea no puede llegar a
   «Si tu finca te pide más»: queda en 31,05-34,01 («funcionando y sales con una ruta
   para tu») y el plano B de 34,01-35,84 se lleva «terreno. Si tu finca te pide más».
   Es lo más cerca del CTA que permite el sistema.
3. **La foto «Habitantes del suelo» se queda fuera.** Con el mockup (2,7 s) y la aérea
   (2,96 s) no cabe otro b-roll en 27,4-34,0 sin bajar algún plano de 1,6 s. En su lugar
   va la pastilla de los 7 principios, que además dice el dato en texto para quien mira
   sin sonido.

## Planos

Medí la cabeza en el máster a resolución completa: pelo en y≈405, barbilla en y≈580
(la ficha decía 570), cara centrada en x≈524.

- **B = `830:1476:109:0`** (la ficha traía `y:55`). Con y=0 la cabeza baja a 527-754 y el
  gancho (306-484 de tinta sólida) cae en el cielo, sin tocar la frente ni las manos
  —comprobado en 1,0 / 1,6 / 2,4 / 3,2 / 3,3 s.
- **C = `675:1200:187:150`** (la ficha traía `y:136`). Con y=150 la barbilla queda en 688
  y la ficha a `top:740` no la toca: comprobado en 22,2 / 23,2 / 24,4 s.
- **A** = máster entero: es el único plano donde la infografía (686-1055) y la pastilla
  (700-963) caben bajo la barbilla (580) y sobre la banda de subtítulos (1150).

## Rótulos

- gancho 0,2-3,96 · ficha 21,8-24,6 (2,8 s) · uvp 24,68-27,38 (misma ventana que el
  mockup) · pastilla 28,2-31,0 · móvil 35,84-38,72 (`tapaSubs`) · cierre 38,92-41,72.
  Ninguna se solapa y todas con `desliz: 0`.
- Infografía `red`, y=680, 17,68-21,72: «Piezas sueltas» → «Un sistema». La animación
  conecta los puntos en el 50 % de la ventana, o sea sobre «las decisiones se toman
  mirando el conjunto», que es exactamente la frase que dibuja.
- ficha, uvp, tapa del móvil y cartela: html literal de `tarjetas-fijas.json`.

## Para la fase de dirección (Codex)

- La pastilla y la infografía caen sobre la camisa blanca en el plano A. Se leen (contorno
  y sombra oscura), pero es el texto más flojo de la pieza; si molesta, la pastilla
  admite bajar a `top:860` (sobre el jean, 1123 < 1150).
- El móvil quedó en 2,88 s y la cartela en 2,80 s: es lo que decidió `cerrar.py`.
- En los primeros fotogramas del móvil todavía se ve el final de un titular de la página
  («en el campo.») justo debajo de la tapa; desaparece al desplazarse la página.
- La velocidad 1,35 de la aérea solo se puede juzgar en el render.

# venta-02 · fase 1 · borrador (Claude)

34,20 s · 14 cortes · media 2,44 s (mín 1,66 · máx 3,89) · b-roll 12,08 s = **35,3 %**
(cuenta el mockup, no el móvil) · `validar.py` → **OK**.

Ángulo AIDA: la vista no basta, hay que aprender a leer el terreno antes de firmar.

## Montaje

| t | qué | por qué |
|---|---|---|
| 0,00-2,76 | **DJI_0129_0** `in` 0,5 · x 1850 + gancho | la aérea del lago Calima es literalmente «la vista» de la que habla el gancho; el encuadre coge lago arriba y el galpón de techo rojo abajo |
| 2,76-4,71 | plano **C** (sigue el gancho) | «Antes de comprometer tus ahorros,» en cerrado |
| 4,71-6,68 | **DJI_20260604152226_0326_D_0** `in` 1,0 · x 1250 (aérea de terrazas, ganadora) | «tienes que aprender a leer el terreno» |
| 6,68-9,00 | plano **A** + infografía | «De dónde viene el agua y a dónde se va» |
| 9,00-12,83 | plano **B** + infografía | «Cómo se comporta el microclima, cómo es el acceso» |
| 12,83-16,72 | plano **C** + infografía | «y la pregunta que casi nadie se hace. ¿Para quién vas a producir?» |
| 16,72-19,08 | **CULTIVO JOVENES 2_0** `in` 3,6 · x 1300 (plántulas, ganadora) | «Nada de eso aparece en la foto del aviso» — el cultivo real contra la foto del aviso |
| 19,08-20,81 | plano **B** + ficha | «En el Campo Escuela de La Huerta LAB»: la ficha entra justo con el nombre del programa |
| 20,81-23,28 | **DJI_20260227113629_0301_D_0** `in` 3,9 · x 1750 (Iván entre tomateras) | «entrenas el ojo conmigo en una finca» |
| 23,28-25,08 | plano **C** | «real antes de firmar» |
| 25,08-27,60 | mockup **18-practicas-campo-uvp** `kb: out` + tarjeta `uvp` | «Cuatro días para aprender a evaluar y a diseñar» (misma ventana que el corte) |
| 27,60-29,26 | plano **B** | «antes de sembrar o construir» |
| 29,26-31,48 | móvil presencial `in` 4,6 + `tapa_pres` | «Si estás por comprar, primero compra criterio» |
| 31,48-34,20 | plano **A** + cartela de cierre | «Toca el link y mira el programa» |

Planos: **A** null · **B** `830:1476:87:60` · **C** `675:1200:165:160`. Subí la `y` de la
ficha de partida (B 28 → 60, C 109 → 160) porque con la infografía a y=680 la primera fila
empieza en 706 y la barbilla de Iván caía en 692 (B) y 722 (C): con la `y` nueva la barbilla
queda en 650 y 640 y la placa de la infografía nunca la toca. La cabeza sigue por debajo de
la zona segura de arriba (B 400 · C 333).

## Decisiones que se apartan de la ficha, y por qué

1. **DJI_0064 no está en la pieza.** La ficha la quería en «Si estás por comprar, primero
   compra criterio», justo antes del móvil, y ahí no cabe por dos razones que se suman:
   con 34,20 s `cerrar.py` clava la cartela en los últimos 2,72 s y el móvil en los 2,22 s
   anteriores, así que **esa frase es exactamente la que queda debajo del móvil**; y entre
   una aérea y el móvil tiene que ir un plano de Iván (`validar.py` no admite dos b-roll
   seguidos), hueco que ya ocupa el mockup con su plano de separación. Meterla en otra
   frase (el «acceso» o el «microclima», que es donde la voz la pediría: en esa aérea se
   ven el camino de entrada y el reservorio) sube el b-roll al 41-43 %, por encima del
   techo del 38 %, y para bajarlo habría que recortar el lago o las tomateras. Preferí
   dejar los cinco recursos en su frase antes que encajarla a la fuerza. **Si dirección la
   quiere dentro**, la vía menos dañina es: lago 0,00-1,73 + tomateras 20,81-22,56 y
   DJI_0064 en 9,00-11,48 («Cómo se comporta el microclima») con `enfocar` y velocidad 1,35
   → 37,5 %.
2. **Las plántulas van en «Nada de eso aparece en la foto del aviso»** (la alternativa que
   daba la ficha), no en «antes de sembrar o construir»: ahí choca con el mockup, como la
   propia ficha preveía.
3. **La infografía abre en 6,10 y no en 6,68.** El primer 6 % de la ventana es invisible
   (`paso()` no arranca hasta ahí), así que nada se dibuja antes de 6,74 —ya dentro de su
   corte— y en cambio las cuatro entradas caen sobre su palabra: agua ≈7,8 · microclima
   ≈10,0 · acceso ≈12,2 · para quién ≈14,4. Con t0 en 6,68 la primera pregunta aparecía
   entera un segundo tarde. Cierra en 16,72, clavada en el corte a las plántulas, para que
   no desaparezca a mitad de plano. Los cuatro textos caben a 52 px sin salto (el más
   largo acaba en x=808 de 1080). Sustituye a la pastilla, que no se usa.

## Dos defectos del sistema que corregí a mano (y hay que volver a aplicar si se repite `cerrar.py`)

- **Móvil a 29,26 y no a 29,21.** `cerrar.py` lo dejaba empezando en 29,21 y el subtítulo 14
  («a diseñar antes de sembrar o construir.») acaba en 29,26: al solaparse 5 centésimas,
  `tapaSubs` lo borra **entero** y la pieza se quedaba 2,15 s sin subtítulo. Moví el corte
  y la tarjeta 5 centésimas (sigue cayendo entre palabras, `validar.py` OK) y el subtítulo
  vuelve. El móvil queda en 2,22 s: es el máximo posible aquí, porque su `t0` no puede
  adelantarse más sin dejar el plano anterior por debajo de 1,60 s.
- **Cartela desde 31,48 y no 31,68.** Con el hueco de 0,20 s el subtítulo 17 («Toca el link
  y mira el programa.») se dibujaba 5 fotogramas sueltos entre el móvil y la cartela. Con
  la cartela pegada al corte, `componer.py` lo descarta y el remate queda limpio. La
  cartela dura 2,72 s, dentro de la banda 2,30-3,60. (De los 12 rótulos entregados en
  captación, solo el anuncio 4 traía ese parpadeo, así que no es rasgo de la serie.)

## Tarjetas

- `gancho` 0,20-4,71 · `top:760px` · «Una finca no se compra / *por la vista*». A 760 el
  texto cae sobre el potrero y **deja ver el lago** (que es la «vista» de la que habla), y
  sobre el plano C de después queda sobre las manos, no sobre la cara. Cierra en 4,71 —el
  final de su frase— porque `componer.py` solo borra los subtítulos que **acaban** dentro
  de la ventana: con el gancho a 3,60 se habría dibujado «Antes de comprometer tus
  ahorros,» debajo del titular. Misma solución que venta-01 y venta-03.
- `fecha` 19,15-22,05 (2,90 s) · `ficha_presencial` literal, `top:740px`: entra con «En el
  Campo Escuela» y se cruza al b-roll de tomateras, donde la cara de Iván queda arriba
  (360-640) y la ficha abajo.
- `uvp` 25,08-27,60 · `uvp_presencial` literal · misma ventana que el mockup.
- `movil` 29,26-31,48 · `tapa_pres` literal · `tapaSubs`.
- `cierre` 31,48-34,20 · `cierre_presencial` literal (idéntico a venta-01, comprobado por
  `validar.py`).
- Todas con `desliz: 0`. Ninguna se solapa.

## Lo que revisé en las previas

23 previas puntuales + las tres hojas del borrador. Comprobado: el gancho no tapa la cara
(0,30 · 2,90 · 3,30 · 4,50), la infografía no toca la barbilla en ninguno de los tres planos
(8,50 · 11,00 · 13,00 · 15,60 · 16,50) y las cuatro preguntas se leen enteras, la ficha
queda bajo la barbilla en plano B y sobre las tomateras (19,60 · 21,00), el mockup entra con
su tarjeta y por encima de la banda de subtítulos (26,20 · 27,00), la tapa del móvil cubre
la barra del navegador (29,50 · 30,00) y la cartela cabe en la zona visible (31,60 · 32,60 ·
33,90). Nada se sale de la zona segura: gancho 686-1031, ficha 740-1142, infografía
680-1110, uvp desde 292, subtítulos 1150-1490.

## Para dirección (fase 2)

- El remate «primero compra criterio» —con «criterio» en la lista de resalte— cae bajo el
  móvil y se queda **sin subtítulo** por `tapaSubs`. Es inevitable con esta duración: el
  móvil ocupa siempre los ~3 s anteriores a la cartela, que es justo donde está la frase.
- Los subtítulos 10 y 11 parten la marca: «…de La Huerta» / «LAB entrenas el ojo…». Sale
  del agrupador (20 caracteres por línea) y no se edita a mano.
- En los primeros fotogramas del móvil todavía se lee el final del titular de la página
  («en el campo.») justo debajo de la tapa; con `in` 4,6 fijado por el encargo no se evita.
- Sin render: fase 1 no lo toca.

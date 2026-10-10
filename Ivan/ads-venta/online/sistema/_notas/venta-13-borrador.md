# venta-13 · borrador (Claude)

Pieza online, 29,24 s, 11 cortes (media 2,66 s), b-roll 8,50 s = **29,1 %**
contando el mockup y sin contar el móvil. `validar.py` da OK. Sin render.

`afinar.py` hizo **0 ajustes** y `cerrar.py` fue un no-op (móvil 3,07 s, cartela
2,87 s): las fronteras se escribieron ya sobre separaciones entre palabras y la
cola se calculó contra la aritmética de `cerrar.py` antes de escribir la EDL.

## Montaje

| t | qué | por qué ahí |
|---|---|---|
| 0,00-2,25 | plano A | Iván de pie y entero, cabeza en y≈583: el gancho cae sobre el cielo con 100 px de aire |
| 2,25-4,18 | plano B | empuje en el remate del gancho, «uno solo, pero el correcto?» |
| 4,18-6,08 | plano C | el dolor en su cara, «El problema de la mayoría es exceso de» |
| 6,08-9,54 | `DJI_0202_0` in 1,2 x 250 | «ideas. Todo parece urgente y nada tiene orden.» — personas trabajando en el cultivo de flores amarillas, el único corte de 3,46 s de la pieza |
| 9,54-11,75 | plano A | vuelve el contexto al empezar la oferta, «En el curso online construyes tu ruta de» |
| 11,75-14,55 | mockup `10-ruta-90-dias-uvp.jpg`, kb out + tarjeta `uvp` | «90 días según tu tierra, tu clima»: el mockup dice «RUTA DE 90 DÍAS · SABE QUÉ HACER PRIMERO» y remata «Ordena prioridades según tu tierra, clima y presupuesto», que es literalmente la frase |
| 14,55-16,64 | plano B | «y tu presupuesto. Y te lo digo de frente,» — la cara vuelve justo en «de frente» |
| 16,64-18,88 | `CULTIVO JOVENES_0` in 3,0 x 2100 (ganador) + pastilla | «una finca rentable en 90 días no existe y»: plántulas moradas en bandeja, o sea el principio de todo, no una finca rentable |
| 18,88-23,10 | plano C + ficha | el corte largo (4,22 s) de la honestidad y el giro: «no te la voy a vender. Lo que sí sale en 90 días es tu ruta,» |
| 23,10-26,17 | móvil online (in 4,6) | lo fija `cerrar.py` |
| 26,17-29,24 | plano A + cartela | cierre |

## Decisiones

- **Abro con Iván y no con b-roll.** El gancho es una pregunta en segunda persona
  («¿Y si el siguiente paso de tu finca fuera uno solo?») y la pieza es
  Pain-Gain-Claim: la credibilidad la sostiene su cara, no un cultivo. Además en
  este máster está de pie y lejos, con la cabeza en y≈583, así que el gancho a
  `top:290` (el de por defecto) cabe encima sin tocarle el pelo en A ni en B.
- **La B baja a `830:1476:109:160`** (la ficha traía `…:109:217`). Con 217 la
  cabeza queda en 476 y el gancho, que acaba en 478, le tocaba el pelo. Con 160
  la cabeza está en 550 y quedan 72 px. La barbilla sube a 715, pero en la B no
  va ninguna tarjeta baja, así que no molesta.
- **La C se queda en `675:1200:187:298`** (barbilla ≈659) porque es el plano que
  lleva la ficha a `top:740`: 81 px de hueco bajo la barbilla y la placa acaba en
  1142, por debajo de los subtítulos en 1150.
- **La pastilla va sobre el b-roll, no sobre la cara, y lleva `tapaSubs: true`.**
  Su `strong` («Una finca rentable en 90 días no existe») es la frase que se oye
  palabra por palabra, y el subtítulo debajo la repetía entera en 74 px: dos
  veces el mismo texto, el defecto que el sistema ya evita en el `gancho`. El
  campo es genérico en `componer.py`, así que se lo puse a la pastilla. La
  ventana acaba en **18,77** y no en 18,88 (el final del corte) a propósito: con
  18,88 el filtro se comía también el subtítulo siguiente («y no te la voy a
  vender», 18,77-21,28), que son 2,5 s de frase clave sin rótulo.
  Sobre las plántulas moradas no hay cara que tapar y el blanco con halo oscuro
  contrasta bien; sobre Iván no había sitio: su polo es blanco de 710 a 1020 y el
  `strong` de la pastilla no lleva placa detrás.
- **Un solo corte largo, de 4,22 s, en 18,88-23,10.** Es donde está el argumento
  entero de la pieza («no te la voy a vender» → «lo que sí sale es tu ruta») y
  partirlo obligaba a dos planos seguidos o a dejar la ficha sin sus 2,6 s. Está
  por debajo del tope de 5,20 de `afinar.py`, así que no lo parte.
- **Ficha `ficha_online_13` en 20,25-22,95 (2,70 s), entera dentro del plano C.**
  Es la ventana más larga posible antes del móvil: `cerrar.py` exige que acabe
  en ≤ 23,00 y con 2,6 s mínimos no cabe solo en «Lo que sí sale…» (1,82 s).
- **Gancho 0,20-4,04**, no 4,00. El filtro del gancho en `componer.py` conserva
  los subtítulos con `t1 > gancho.t1`, y el subtítulo «pero el correcto?» acaba
  en 4,04: con la ventana en 4,00 aparecía debajo del gancho desde el 2,93.
- **Sin infografía** (lo dice la ficha) y **sin `2 siembra2_0` ni las dos fotos
  opcionales.** Los tres eran opcionales y ninguno tenía hueco: la frase de
  `2 siembra2_0` («El problema de la mayoría es exceso de ideas») es contigua a la
  de `DJI_0202_0`, y meter los dos obligaba a un plano de 1,5 s entre ellos o a
  desplazar el b-roll dos segundos de su frase; las dos fotos ilustran «según tu
  tierra» y «tu clima», que ya están debajo del mockup. Con lo puesto el b-roll
  ya está en el 29,1 % de la banda 28-38 %.
- **Media de corte 2,66 s**, por debajo de los ~3 s de referencia porque la cola
  (móvil 3,07 + cartela 3,07) se come 6,14 s de una pieza de 29,24. Ninguno baja
  de 1,90 s ni pasa de 4,22 s.

## Dónde cae cada recurso ganador y con qué encuadre

- `CULTIVO JOVENES_0`: **in 3,0, x 2100**. `venta-01` lo usa con in 1,0 y x 1312,
  así que tramo y encuadre son distintos, como pide el encargo.
- `DJI_0202_0` (b-roll propio de esta pieza) no aparece en ninguna otra EDL.
- El mockup `10-ruta-90-dias-uvp.jpg` tampoco.

## Comprobado en previas (no en render)

Gancho sobre A y sobre B (0,5 · 1,0 · 2,4 · 3,2 s), los bordes de los tres
b-roll (6,2 · 7,5 · 8,5 · 17,0 · 17,6 · 18,6 s), el mockup con el `uvp` (12,5 ·
13,0 · 14,5 s), los tres planos sin tarjeta (4,3 · 5,0 · 10,5 · 15,5 · 19,0 ·
19,9 s), la ficha por dentro y por sus dos bordes (20,6 · 21,5 · 22,8 s), el
móvil a lo largo de toda su ventana (23,4 · 24,5 · 25,4 · 26,0 s) y la cartela
(27,5 · 28,5 · 29,0 s). Más las tres hojas del borrador.

Nada tapa la cara, nada se sale de la zona segura y ninguna tarjeta se solapa
con otra.

**Lo que no se puede ver aquí:** el Ken Burns `out` del mockup y si el cambio
A→B en 2,25 se lee como corte o como salto (1,3x con la cabeza moviéndose solo
33 px). Las dos cosas hay que mirarlas en el render (fase 3).

## Para la fase de dirección (Codex)

1. **La ventana del anuncio caduca el 18 de septiembre.** Ver `dudas`.
2. La ficha entra en 20,25, o sea sobre «…voy a **vender**.». Puede leerse como
   el contraste buscado (no te vendo la promesa, te vendo el programa) o como
   disonancia. Moverla más tarde no cabe: perdería el mínimo de 2,6 s.
3. El móvil arranca con la página todavía desplazándose y durante ~1,5 s se ve
   un fantasma del titular «Desde donde estés.» por debajo de la tapa, que solo
   cubre 150 px. Es el `in 4,6` que prescribe el encargo y con el que se entregó
   `venta-11`; con un corte de 3,07 s sobre un clip de 8 s no hay `in` posterior
   que llegue limpio. Si se quiere arreglar, es decisión de tanda, no de pieza.
4. Si se quiere más cultivo en pantalla, lo que hay es `2 siembra2_0`: entra
   sustituyendo el plano C de 4,18-6,08 y empujando `DJI_0202_0` a 8,17-10,55,
   pero entonces los dos b-roll caen ~2 s por detrás de su frase y la pieza pasa
   a 13 cortes con media de 2,25 s.

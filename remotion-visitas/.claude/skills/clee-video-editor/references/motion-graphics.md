# Motion Graphics de Datos (Paso 9)

Paso 9 del `references/pipeline.md`: convertir cada cifra hablada en una animación de datos que **prueba** lo que se dice. Esta capa es lo que sube retención en tramos de "hablar de números" (el cerebro se pierde con audio suelto, se ancla con una visualización que sube y aterriza). Todo lo que aquí se compone se integra al video final **solo por overlay alpha** (ver `references/engine-decision.md`); nunca se mezclan motores en un mismo frame.

---

## Principio rector: LÓGICO Y REPRESENTATIVO

Cada animación **representa literalmente lo que se dice en ese instante**. No es decoración ni relleno rítmico.

- **NUNCA un icono solo** flotando. Un icono aislado es EMN mal gastado (ver estímulo mínimo necesario en `references/craft-rules.md`).
- **SIEMPRE la PRUEBA.** Si el talento dice "mira este video que hizo 5,7 millones de vistas", en pantalla va el **video real con sus visualizaciones** (el view counter, la barra de progreso, los comentarios), no un icono de ojo.
- **Volumen de evidencia en 3D.** Cuando la frase implica cantidad/abundancia ("cientos de reels", "todos estos casos"), se compone el asset principal al frente y **varios difuminados detrás en profundidad 3D** = sensación física de volumen de evidencia. El fondo difuminado también cumple la regla craft de fondos minimalistas (ver abajo).
- La animación y la palabra van **acopladas al frame**: lo que se ve = lo que se oye, sin desfase.

Regla mnemónica: *si tapo el audio, la animación sola debe contar el mismo dato.*

---

## Disparador: toda cifra hablada → un gráfico

Regla dura: **cada número que sale por la boca del talento dispara un gráfico.** Cero excepciones salvo que dos cifras estén a <1,5 s (se fusionan en un solo gráfico comparativo).

### Mapa tipo de dato → tipo de chart

| Lo que se dice | Tipo de dato | Chart |
|---|---|---|
| "el 80% de la gente…" | Porcentaje | Contador + **pie/donut** |
| "la retención cae", "se mantiene el engagement" | Tendencia / retención | **Línea** |
| "antes X, ahora Y", "A vs B" | Comparación | **Barras** |
| "creció 3x", "se disparó", "exponencial" | Crecimiento | **Growth curve** |
| "5,7 millones de vistas" | Cifra suelta | **Contador grande** |

### Reglas de composición de cada gráfico

- **Un insight por gráfico.** Si hay dos ideas, son dos gráficos.
- **3–5 datapoints máximo.** Más de eso es ruido; se resume.
- **El contador SUBE Y ATERRIZA.** Easing de entrada, se estabiliza en la cifra final y ahí se queda. **Prohibido** bounce, overshoot exagerado, explode, confeti. (Ovejas Voladoras admite entradas más agresivas que SAVIAS, pero el aterrizaje siempre es limpio — eso es dial de perfil, no de regla; ver `brand-edit-profile`.)
- **Hold 2–3 s** con la cifra final visible y legible antes de salir.
- **La cifra en pantalla coincide EXACTO con lo dicho.** Si dice "ochenta por ciento", el contador cierra en `80%`, no en `79%` ni `80,4%`. Verificado en `references/qa.md`.

---

## Detección de números en español (stat-extract)

El transcript se escanea buscando expresiones numéricas en español natural, no solo dígitos. Casos a captar:

| Expresión hablada | Se normaliza a | Tipo |
|---|---|---|
| `80%` | 80 % | porcentaje |
| `80 por ciento` | 80 % | porcentaje |
| `ochenta por ciento` | 80 % | porcentaje |
| `2x` | ×2 | crecimiento |
| `el doble` | ×2 | crecimiento |
| `creció 3 veces` | ×3 | crecimiento |
| `de 200 a 80 mil` | 200 → 80 000 | comparación / crecimiento |
| `5,7 millones` | 5 700 000 | cifra suelta |
| `11.300` | 11 300 | cifra suelta |
| `1M de visitas` | 1 000 000 | cifra suelta |

Ojo con la notación es-CO/es-ES: **coma = decimal** (`5,7` = cinco coma siete) y **punto = miles** (`11.300` = once mil trescientos). No invertir.

El script `scripts/stat-extract.mjs` (o el propio Claude leyendo el transcript) escanea las marcas de tiempo y emite **chart-jobs**, uno por cifra detectada:

```json
{
  "timestamp": "00:00:14.320",
  "tipo": "counter",
  "valores": { "from": 0, "to": 5700000 },
  "label": "vistas",
  "keyword": "millones"
}
```

- `timestamp` = frame exacto en que se pronuncia el número (para sincronizar la entrada, ver Timing).
- `tipo` ∈ `pie|donut|bar|line|growth|counter` (según el mapa de arriba).
- `valores` = payload que consume el motor (`from/to` para counter, arreglo de datapoints para bar/line, etc.).
- `label` = unidad/etiqueta visible.
- `keyword` = la palabra hablada que marca el frame de sincronía.

Los chart-jobs se ordenan por `timestamp` y se resuelven contra el catálogo siguiente.

---

## Catálogo de piezas

### Charts (pie / donut / bar / line / growth / counter)

- **Motor: Remotion** cuando se necesita **frame-exacto y paramétrico** (la cifra debe cerrar clavada en el frame de la keyword, con props). Es la opción por defecto para charts de datos.
- **Motor: Hyperframes** cuando se busca **data-in-motion** más orgánico/expresivo y no se requiere control frame a frame.
- La decisión motor por pieza la fija `references/engine-decision.md`. Ambos exportan **PNG/MOV con alpha** para overlay.

### Lower-thirds (nombre / rol del talento)

- **Hyperframes `talking-head-recut`** para el lower-third dentro de este pipeline.
- Si el lower-third debe ser **reutilizable en CapCut** por el equipo, se produce con **`motion-snippets-clee`** (overlay animado reutilizable, no atado a este render).

### Split-screen comparativo

- Dos fuentes lado a lado para contraste conceptual: **"cómo editar / cómo grabar"**, "antes / después", "lo que crees / lo que pasa". Refuerza la comparación cuando el dato es cualitativo y no cabe en barras.

### Mockups de reels / TikToks con view counts

- **Prueba social**: se recrea la UI del reel/TikTok con su contador de vistas real. Es el caso canónico de "SIEMPRE la prueba, nunca el icono". Se combina con el volumen de evidencia en 3D cuando se muestran varios.

### Iconos representativos

Solo cuando **acompañan** al dato, nunca solos:

| Concepto | Icono |
|---|---|
| 24 horas / tiempo | reloj |
| conocimiento / aprendizaje | cerebro |
| pregunta / duda | persona + `?` |
| todos los públicos | abuelo + joven + niño |

---

## Gráficos estáticos de marca

Cuando la pieza es **estática** (láminas, callouts, CTA cards, títulos de sección):

1. Se pide el **PNG a `brand-graphics-clee`** (aplica el brand kit del cliente: paleta, tipografías, tratamiento).
2. Se compone sobre el video con **overlay** usando la **receta 19** de `references/ffmpeg-recipes.md` (overlay de PNG con alpha, posicionado en safe zone — ver `references/safe-zones.md`).

Si la pieza estática necesita volverse **animada y reutilizable para CapCut**, se produce con **`motion-snippets-clee`** en vez de renderizarla atada a este pipeline.

---

## Timing y sincronía

- La **cifra entra escalonada con easing**, sincronizada a la **keyword**: el frame en que se pronuncia el número (campo `keyword` + `timestamp` del chart-job) es el frame `0` de la animación de entrada.
- **Escalonado**: label → estructura del chart → contador subiendo → aterrizaje → hold 2–3 s → salida. No todo aparece de golpe.
- **Zoom punch-in al aparecer**: un empuje corto de escala en el momento de entrada refuerza el "esto importa" (mismo lenguaje que el punch-in de captions en `references/captions.md`; el ritmo del punch lo modula el perfil — SAVIAS suave, Ovejas Voladoras marcado).
- El corte a la pieza de datos respeta el punto semántico, no parte una frase (ver `references/semantic-cut.md`).

---

## Fondos minimalistas (regla craft)

Regla craft universal (ver `references/craft-rules.md`): **el fondo nunca compite con el dato.**

- Fondos **nunca llamativos**. Nada de gradientes vibrando, partículas, loops distractores.
- **Difuminar el fondo** (incluidas las capas de evidencia 3D detrás) para dar protagonismo al insight al frente.
- **Paleta corta**: negro / amarillo / rojo / blanco como base neutra de datos. El acento cromático de marca lo pone el **dial del perfil** (SAVIAS reemplaza por sage/crema/dorado con serif y ritmo lento; VUELA, HUMANOX, IA LAB, Barco de Papel/Origami traen los suyos). Las 18 reglas craft no cambian; **lo que cambia por cliente es el `brand-edit-profile`.**
- Contraste suficiente para legibilidad de la cifra sobre cualquier frame (verificar en `references/qa.md` y color en `references/color.md`).

---

## Interop de motores

Remotion, Hyperframes, `brand-graphics-clee` y `motion-snippets-clee` **solo se integran por overlay alpha** sobre el master. Nunca se anidan motores en un mismo render. El binario de composición es `$FF` (sistema, sin libass); los subtítulos quemados con libass usan `$FFSUB` en su propio paso (ver `references/captions.md`). Regla de reparto y orden de capas: `references/engine-decision.md`.

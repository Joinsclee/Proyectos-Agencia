# Reglas de Craft — Edición de Retención (universal, brand-agnóstica)

Este archivo define QUÉ hace que un video retenga. Es la capa de principios: no cambia por marca ni por pieza. Lo que cambia son los **diales numéricos** (ver `references/pipeline.md` y cada archivo hermano). Para la ejecución técnica cruza a: `references/captions.md`, `references/motion-graphics.md`, `references/audio-finishing.md`, `references/ffmpeg-recipes.md`, `references/safe-zones.md`, `references/qa.md`.

---

## Principio rector: no importa que se vea bonito, importa que FUNCIONE

La métrica no es "estético", es **retención**. Un plano precioso que no retiene es un plano malo. Las reglas del cine (composición, respirar el plano, entradas lentas, plano-contraplano largo) están diseñadas para una sala oscura con audiencia cautiva. En redes **no hay audiencia cautiva**: se decide en ~0.6 s si el dedo sigue de largo. Todo lo que sigue está subordinado a esa realidad.

Regla de decisión ante cualquier duda de edición: *"¿esto sube la retención o solo se ve bien?"*. Si solo se ve bien, se corta.

---

## Dos modelos de edición

| Modelo | Objetivo | Dónde funciona | Síntoma |
|---|---|---|---|
| **Que se vea bonito** (cine) | Belleza, atmósfera, autoría | Sala, festival, audiencia cautiva | Entradas lentas, planos largos, silencios contemplativos |
| **Que funcione** (retención) | Que NO pasen de largo | Feed, 9:16, scroll infinito | Movimiento inmediato, corte constante, estímulo alto |

En redes se prioriza **SIEMPRE** "que funcione". Lo bonito es un lujo que se permite solo cuando ya retiene.

---

## EMN — Estímulo Mínimo Necesario

La relación entre **estímulo** y **visitas** no es lineal, es **exponencial**:

- Por debajo de un **umbral** de estímulo, el video se **estanca** (sube plano, muere).
- Al **superar** ese umbral, **explota** (se dispara el alcance).

El umbral **lo marca el nicho/audiencia**, no tu gusto:

- Audiencias **jóvenes** → necesitan **más** estímulo (más cortes, más pops, más SFX, más motion).
- Audiencias **mayores / marca pausada-premium** → toleran **menos** estímulo (más aire, cortes más largos), pero **igual** por encima de su umbral.

**Triángulo de nichado — empezar GENERAL y nichar progresivamente:**

```
        (0-3s) MÁS GENERAL POSIBLE   ← máxima superficie de entrada
       /                          \
      /   (3-10s) empieza a nichar  \
     /                               \
    /  (resto) audiencia específica   \  ← ya filtraste, aquí profundizas
```

Empezar nichado mata el alcance: reduces la superficie de entrada antes de haber enganchado. Instagram (y el resto de plataformas) **premia el tiempo de retención**: cada segundo retenido es señal de calidad que empuja distribución.

---

## Regla 80/20 del tiempo de edición

El esfuerzo NO se reparte parejo por el timeline:

- **80%** del esfuerzo → a los **primeros 5 s** (el hook).
- Dentro de eso, **60%** → a los **primeros 2 s**.

Si tienes una hora para editar, ~36 min van a los primeros 2 s, ~12 min a los segundos 2–5, y el resto del video se reparte los 12 min sobrantes. El hook es el cuello de botella de todo el alcance.

---

## LAS 18 REGLAS NO NEGOCIABLES

Universales. Se cumplen todas; lo que se ajusta por marca son los números.

**1. Hook 0–3 s = MOVIMIENTO.** Nunca abrir con logo, intro, bumper o plano estático. En Remotion, arrancar en frame 0 con algo ya en movimiento (`spring`/`interpolate` sobre escala o posición, o un plano de source que ya trae acción). El logo, si va, va al final.

**2. Hook de 3 capas simultáneas.** Visual (lo que se ve) + verbal (lo que se dice) + texto (lo que se lee en pantalla). Las tres cargan la misma promesa en paralelo, no en secuencia. El texto del hook se renderiza en Remotion como capa propia, no depende de que el caption llegue.

**3. Promesa en 0–3 s, sin warm-up lento.** Nada de "hoy les voy a hablar de…". La promesa/beneficio/tensión aparece de inmediato. Si el arranque hablado es débil, se recorta con corte en `Sequence` o se reordena.

**4. Clasificar el hook en 1 de 7 tipos** (elegir consciente, no al azar):

| # | Tipo | Esencia |
|---|---|---|
| 1 | Contrarian | rompe la creencia común |
| 2 | Curiosity-gap | abre bucle que exige quedarse |
| 3 | Resultado + prueba | muestra el después + evidencia |
| 4 | Pregunta | interpela directo al espectador |
| 5 | Callout de nicho | "si eres X, esto es para ti" |
| 6 | Dato-shock | cifra que descoloca |
| 7 | POV | punto de vista inmersivo |

El **dato-shock siempre se vuelve motion graphic** (ver regla 17 y `references/motion-graphics.md`): la cifra entra animada, no solo hablada.

**5. Ritmo = dial de marca.** Educativo / marca pausada-premium ≈ **1 corte / 5 s**; marca rápida-hype ≈ **1 corte / 1.5–3 s**. Nunca duración de corte constante: **variar** para que el ritmo respire y no se vuelva metrónomo.

**6. Regla del bloque de 5 s.** Ningún tramo de 5 s sin **algún** cambio (corte, zoom, pop de texto, b-roll, gráfico, SFX). Barrer el timeline en ventanas de 5 s y verificar que cada una tiene evento (ver checklist en `references/qa.md`).

**7. Catálogo de interrupts por costo** (de barato a caro; usar el más barato que resuelva):

| Interrupt | Costo | Uso |
|---|---|---|
| Micro-zoom | muy bajo | mantener vida en talking-head (`spring` sobre `scale`) |
| Pop de texto | bajo | subrayar palabra/idea |
| B-roll flash | bajo-medio | ilustrar 1–2 s |
| Cambio de plano | medio | romper monotonía |
| Chart / gráfico | medio-alto | probar una cifra |
| Meme | medio | humor/relato |
| Split-screen | alto | comparar A/B |

**8. Captions word-by-word con palabra activa = máxima retención.** El resaltado por palabra fuerza lectura y sube tiempo en pantalla. Subtítulos **casi siempre presentes**. El proyecto ya resuelve esto con `src/CaptionedVideo.tsx` (resaltado por palabra) alimentado por `scripts/build-captions.mjs`. Ver `references/captions.md`.

**9. Timing sub-frame de captions.** El caption **lead −150 ms** (entra un pelo antes de la voz), la **palabra activa +50–100 ms** de anticipo de resaltado, y **máx 4–6 palabras** en pantalla a la vez. Estos son diales (`switch_ms`) que se afinan por pieza. Ver `references/captions.md`.

**10. Colores semánticos de caption:**

| Color | Significado |
|---|---|
| Blanco | base / narración neutra |
| Amarillo | énfasis / keyword |
| Rojo | negativo / pérdida / dolor |
| Verde | positivo / dinero / ganancia |
| Contorno oscuro | siempre, para legibilidad sobre cualquier fondo |

**11. Captions NUNCA sobre el rostro ni en el 20% inferior.** El 20% inferior lo tapan la UI de la plataforma (caption/CTA/handle nativos). El rostro es zona sagrada. Ver `references/safe-zones.md`.

**12. B-roll entra EN la palabra clave** (ventana **1.5 s antes/después** del término que ilustra). Duración: **flash 1–2 s** / **cine 2–5 s**. No b-roll decorativo suelto: cada inserto ilustra algo dicho. En Remotion el b-roll es un `Sequence` anclado al timestamp de la palabra (ver `scripts/build-captions.mjs` para los tiempos por palabra).

**13. La voz NUNCA se corta bajo b-roll (L-cut).** El audio de la voz sigue corriendo mientras entra el b-roll (corte en L). **J-cut** al entrar a un bloque nuevo: el audio del siguiente bloque entra antes que su imagen. Ver `references/audio-finishing.md`.

**14. Jerarquía de audio:**

- Voz **al frente**, siempre inteligible.
- Master a **−14 LUFS** (loudnorm en finishing, ver `references/ffmpeg-recipes.md`).
- Música **por debajo**, con **ducking 3–5 dB** cuando entra la voz.
- **Silencio dramático** antes de una afirmación grande (bajar todo un beat para que la frase pegue).

**15. SFX en cada interrupt fuerte.** Whoosh (movimiento/transición), pop (texto/aparición), riser (build-up a revelación), ding (confirmación/checkmark). Un interrupt visual fuerte sin SFX se siente incompleto. Ver `references/audio-finishing.md`.

**16. Quitar silencios >0.3–0.5 s y muletillas** (ehh, este, o sea). Cada jump-cut resultante se **oculta con variación de zoom** (micro-cambio de escala en el corte para que no salte). Los tiempos de palabra de `scripts/build-captions.mjs` sirven para detectar los gaps.

**17. Toda cifra hablada dispara un gráfico.** No hay excepción: si se dice un número, aparece un motion graphic con la **prueba**.

| Se dice… | Gráfico |
|---|---|
| Porcentaje | contador + pie |
| Tendencia | línea |
| Comparación | barras |
| Crecimiento | curva |

Reglas del gráfico: **un insight por gráfico**; el **contador sube y aterriza** (no aparece de golpe, cuenta hasta el valor y se fija); **hold 2–3 s**; la **cifra en pantalla == exactamente lo dicho**; **nunca un icono solo** — siempre la **PRUEBA** (el dato, no un adorno). Ver `references/motion-graphics.md` y los `scripts/build-*-data.mjs`.

**18. Safe zones 9:16: lo clave en el 70–80% central.** Todo lo que importa (rostro, texto del hook, cifra, CTA) vive en la franja central. Márgenes y 20% inferior/superior son zona de riesgo (crop de plataforma + UI). Ver `references/safe-zones.md`.

---

## Regla maestra

**Las 18 son universales.** Lo que cambia de una pieza/marca a otra son los **diales numéricos**:

```
cut_rate      → cortes por segundo (regla 5)
zoom          → intensidad de micro-zoom / ocultar jump-cut (7, 16)
switch_ms     → timing de captions: lead, anticipo, palabras en pantalla (9)
sfx_density   → cuántos interrupts llevan SFX (15)
bpm           → tempo de la música y sincronía de cortes al beat (14)
```

Marca **pausada/premium** → diales bajos. Marca **rápida/hype** → diales altos. Nunca se tocan las reglas; se tocan los números.

---

## Los 5 tipos de edición

Un video suele mezclar varios, pero conviene declarar el dominante:

| Tipo | Herramientas | Cuándo |
|---|---|---|
| **Inmersiva** | zooms lentos, deriva de plano | atmósfera, contemplación con tensión |
| **Veloz** | máscaras, montaje rápido, cortes al beat | energía, hype, listas rápidas |
| **Persuasiva** | retención por curiosidad, música de tensión, bucles abiertos | ventas, storytelling con payoff |
| **Cinemática** | planos cercanos, silencios, cambios de velocidad (speed ramps) | momentos-clave, emoción |
| **Talking-head / comunicación pura** | rostro + captions + micro-zoom + b-roll puntual | autoridad, explicación directa |

---

## Errores comunes (qué NO hacer)

- Editar solo **"bonito"** ignorando la retención.
- Abrir con **plano cinemático lento** (mata el hook, viola reglas 1 y 3).
- **Descuidar los primeros 5 s** (invierte el 80/20).
- Quedarse **por debajo del EMN** (video estancado, nunca explota).
- **Empezar nichado** (reduce la superficie de entrada; viola el triángulo).
- Poner un **icono en vez de la prueba** (viola regla 17: siempre el dato).
- **Fondos llamativos** que compiten con el mensaje.
- **Cargar de transiciones** (transición ≠ retención; distrae).
- **Saturar colores** hasta el ruido visual.
- **Stock genérico** que no aporta ni ilustra nada dicho.
- **Editar sin idea / sin estructura** (sin hook declarado, sin diales, sin guion de cortes).

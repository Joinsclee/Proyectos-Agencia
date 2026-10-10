# Safe Zones por Plataforma (Regla Craft 18)

Esta referencia codifica la **regla 18** de `references/craft-rules.md`: *nada crítico toca los bordes*. La UI de cada plataforma (header, handle, caption, música, botones de engagement, barra de progreso, tarjetas de recirculación) se dibuja ENCIMA de tu video en el momento de la reproducción. Si un subtítulo, un lower-third, un dato de motion graphics o el rostro cae debajo de esa UI, el espectador no lo lee y la retención se cae. Las 18 reglas de craft son universales; lo que se ajusta por cliente (tamaño de caption, densidad de overlays) vive en los diales del `brand-edit-profile`, no aquí.

## Principio robusto (memorízalo)

> **Mantén TODO lo clave dentro del 70-80% CENTRAL del cuadro. Asume que la UI de la plataforma cubre los bordes.**

- No optimices al pixel para una versión concreta de la app: las apps mueven su UI entre releases y entre TikTok/Reels/Shorts. El margen del 20-30% es tu colchón de seguridad.
- "Lo clave" = subtítulos, texto-gancho, cifras de motion graphics, logo/marca, CTA, y el rostro del hablante.
- El fondo (b-roll, gradientes, texturas) SÍ puede sangrar a borde completo; solo el contenido legible/accionable respeta la zona segura.
- Regla 11 (`references/craft-rules.md`): los captions **NUNCA** van sobre la cara. Zona segura y anti-cara se resuelven juntas: caption en la banda libre más cercana al rostro pero sin invadirlo.

---

## Formato PRIMARIO — 9:16 (1080×1920)

Es el formato por defecto de la Máquina de Edición CLEE (TikTok, IG Reels, YT Shorts). La UI ocupa así (valores en px sobre canvas de 1920 de alto):

| Zona | Región ocupada | Qué la cubre | Regla |
|---|---|---|---|
| Superior | ~108–250 px desde arriba | Header, @handle, "Siguiendo/Para ti", botón cerrar | No pongas texto crítico aquí |
| Inferior | ~320–420 px desde abajo | Caption/descripción, título de música, avatar, botón seguir | **Zona muerta de captions** |
| Borde derecho | ~60–120 px de ancho | Columna de engagement: like, comentar, compartir, guardar, menú | No pongas texto ni cifras que lleguen al borde derecho |
| Borde izquierdo | ~40 px | Padding menor | Colchón, no colocar nada al ras |

### Reglas de colocación 9:16

- **Subtítulos kinéticos** → banda central, **por ENCIMA del 20% inferior** (los últimos ~384 px están comprometidos). Al quemar ASS usa `MarginV` alto — ver recetas 9 y 23 de `references/ffmpeg-recipes.md`.
- **Texto-gancho** (primeros 3 s) → tercio superior-medio, por DEBAJO del header (evita los primeros ~250 px) y por encima del centro. Máxima área limpia y visible sin scroll de UI.
- **Rostro** → centrado horizontalmente; el reencuadre/tracking lo mantiene en el eje central. Captions van en la banda libre **más cercana** a la cara sin taparla (regla 11).
- **Lower-thirds y CTA card** → dentro del 80% central; si un CTA vive abajo, súbelo por encima de la banda de 420 px o quedará debajo del botón de seguir.
- **Cifras de motion graphics** (`references/motion-graphics.md`) → centradas o en el tercio superior; nunca pegadas al borde derecho (columna de engagement).

### MarginV: prueba vs producción (nota crítica)

- En **prueba/iteración** rápida se ve `MarginV=220` en algunos snapshots — pero **220 cae DENTRO de la UI inferior** (queda tapado por caption/música). Es solo para validar timing/estilo, no para el master.
- En **producción 9:16 usa `MarginV >= 330`** (rango recomendado **330–420**). Esto sube la banda de subtítulos por encima de la zona muerta inferior.
- El valor exacto depende del cliente: SAVIAS (caption sobrio, ritmo lento) tolera captions más bajos y limpios; Ovejas Voladoras (word-by-word, alta densidad) empuja el caption más al centro para dejar aire a SFX-text y stickers. Ese dial vive en el `brand-edit-profile`, pero el piso duro de `MarginV=330` es universal.

---

## Formato 1:1 (1080×1080)

Feed cuadrado (posts de IG, algunos placements de Meta Ads). Mucha menos UI encima que 9:16.

| Zona | Región | Nota |
|---|---|---|
| Todos los bordes | ~10% por lado (~108 px) | Márgenes de seguridad simétricos |
| Inferior | Ligero extra si hay caption/CTA quemado | Sube el CTA un poco |

- Área segura ≈ **80% central** (900×900 aprox. dentro del 1080×1080).
- Subtítulos abajo-centro dentro del margen del 10% inferior.
- Sin columna de engagement lateral pesada como en 9:16: el borde derecho está más libre, pero mantén el margen del 10% por consistencia.

---

## Formato 16:9 (1920×1080) — YouTube horizontal

Estándar broadcast. Se usan las nociones clásicas de TV:

| Zona | Región | Uso |
|---|---|---|
| **Title-safe** | ~90% central (margen 5% por lado) | Texto legible: títulos, lower-thirds, cifras |
| **Action-safe** | ~95% central (margen 2.5% por lado) | Cualquier elemento importante de imagen |
| Esquina inferior derecha | Reservar | **Tarjeta "siguiente video"** / end screen la cubre |
| Franja inferior | Reservar | **Barra de progreso** del reproductor + controles al hover |

### Reglas 16:9

- **Subtítulos** → abajo-centro, dentro del title-safe, con margen inferior suficiente para librar la barra de progreso.
- No coloques CTA ni logo en la esquina **inferior derecha**: la tarjeta de recirculación y las end screens (últimos ~20 s) la tapan.
- Lower-thirds pegados al title-safe (5% de margen), no al action-safe, para que el texto no roce el borde visible en TVs con overscan.

---

## Constantes reutilizables (para `scripts/qa.mjs` y revisión de visión)

Tabla canónica que consumen la validación automatizada (QA) y la revisión por visión para confirmar que **ningún overlay invade** las zonas ocupadas. Valores en píxeles sobre el canvas nativo de cada formato.

| Formato | W | H | top_ui | bottom_ui | right_ui | left_pad | safe_center | MarginV_prod |
|---|---|---|---|---|---|---|---|---|
| 9:16 | 1080 | 1920 | 250 | 420 | 120 | 40 | 70–80% | ≥ 330 |
| 1:1 | 1080 | 1080 | 108 | 140 | 108 | 108 | 80% | ~110 |
| 16:9 | 1920 | 1080 | 27 | 60 | 96 (BR card) | 27 | 90% (title-safe) | ~60 |

Interpretación: un overlay es válido si su bounding box queda **fuera** de `[0, top_ui]`, `[H-bottom_ui, H]`, `[W-right_ui, W]` y `[0, left_pad]`, es decir, contenido dentro del `safe_center`. `MarginV_prod` es el piso para captions quemados con libass (`$FFSUB`, recetas 9/23 de `references/ffmpeg-recipes.md`).

> Recordatorio de binarios (`references/pipeline.md`, `references/engine-decision.md`): los overlays de subtítulos ASS se queman con **`$FFSUB`** (build con libass). El **`$FF`** del sistema NO tiene libass — no intentes quemar captions con él. No inventes flags nuevos: cita la receta correspondiente de `references/ffmpeg-recipes.md`.

---

## Validación en QA

Flujo de verificación (ver `references/qa.md`):

1. Genera el **contact-sheet** del render final con la **receta 21** de `references/ffmpeg-recipes.md`.
2. Confirma visualmente que **captions, lower-thirds, cifras y CTA** caen **dentro del `safe_center`** de la tabla anterior para el formato correspondiente.
3. Cruza con la anti-cara (regla 11, `references/captions.md`): ningún caption sobre el rostro.
4. **Si un overlay invade** una zona de UI:
   - Captions → **sube `MarginV`** hacia el rango 330–420 (9:16) y re-quema con `$FFSUB`.
   - Gráficos/CTA/lower-thirds → **reposiciona** dentro del 70–80% central (o 90% en 16:9); no bajes solo el elemento, verifica también el borde derecho en 9:16.
   - Re-corre el contact-sheet y vuelve a validar.

### Checklist rápido de safe zones (pre-master)

- [ ] Formato correcto detectado y constantes cargadas (9:16 / 1:1 / 16:9).
- [ ] Captions con `MarginV ≥ 330` en 9:16 producción (nunca 220 en master).
- [ ] Ningún texto/cifra pegado al borde derecho en 9:16 (columna de engagement).
- [ ] Texto-gancho en tercio superior-medio, bajo el header.
- [ ] Captions nunca sobre la cara (regla 11).
- [ ] En 16:9: nada crítico en esquina inferior derecha (next-video card) ni bajo la barra de progreso; texto en title-safe (90%).
- [ ] Contact-sheet (receta 21) revisado y aprobado.

Referencias cruzadas: `references/craft-rules.md` (reglas 11 y 18), `references/captions.md`, `references/ffmpeg-recipes.md` (recetas 9, 21, 23), `references/pipeline.md`, `references/engine-decision.md`, `references/motion-graphics.md`, `references/qa.md`.

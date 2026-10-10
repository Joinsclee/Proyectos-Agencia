# Auto-QA (Paso 13) — Rúbrica pass/fail con umbrales

Este archivo define el **paso 13 del pipeline** (ver `references/pipeline.md`): el control de calidad automatizado que corre DESPUÉS del render y ANTES del control humano del paso 14. El Auto-QA es una **rúbrica binaria**: cada chequeo pasa o falla contra un umbral explícito. Un solo fallo bloqueante detiene la publicación y devuelve el trabajo al paso que corresponda (recorte, captions, motion, audio o color).

Regla mental: el Auto-QA **no juzga si el video es bueno** — juzga si el video está *técnicamente entregable* y *fiel al guion*. El juicio de calidad creativa es del humano (paso 14).

---

## 1. Insumos del Auto-QA

Antes de correr la rúbrica necesitas tener a mano:

| Insumo | Origen | Para qué |
|---|---|---|
| `final.mp4` | Salida del render (Hyperframes/Remotion + `$FF`) | Objeto bajo prueba |
| `transcript.json` | Whisper (paso de transcripción, ver `references/semantic-cut.md`) | Verificación anti-alucinación de cifras y sync |
| `contact-sheet.png` | Receta 21 de `references/ffmpeg-recipes.md` | Revisión visual por Claude-visión |
| `scenes.txt` | scenedetect vía receta 8 de `references/ffmpeg-recipes.md` | Conteo de cortes / ritmo |
| `loudness.json` | `$FF` loudnorm print_format=json (receta de audio, ver `references/audio.md`) | LUFS / true peak / ducking |
| `brand-edit-profile.yaml` del cliente | Perfil de marca | Umbrales de ritmo (`profile.ritmo.cut_rate_seg`) y safe-zones |

Los binarios son fijos: **`$FF`** (FFmpeg del sistema, SIN libass) para medición/probe/loudnorm, y **`$FFSUB`** (build con libass) solo para quemar subtítulos. El Auto-QA **no quema nada** — solo mide. Por lo tanto casi todo aquí usa `$FF`. Ver `references/engine-decision.md` para cuándo cada binario aplica.

---

## 2. Chequeo visual con contact-sheet (Claude-visión)

Genera el mosaico con la **receta 21** de `references/ffmpeg-recipes.md` (contact-sheet / tiles a intervalo fijo). Pasa el PNG resultante a la revisión de visión de Claude con este checklist. Cada ítem es pass/fail:

| # | Ítem visual | Pasa si | Falla si | Ref. cruzada |
|---|---|---|---|---|
| a | Captions dentro de safe-zone | Todo el bloque de caption cae dentro de la zona segura y **NUNCA** se superpone al rostro del hablante | Caption tocando bordes prohibidos o encima de la cara | `references/safe-zones.md`, `references/captions.md` |
| b | Sin frames negros / congelados | Ningún tile en negro puro ni frame idéntico repetido donde debería haber movimiento | Tile negro, corte mal cortado, freeze accidental | `references/craft-rules.md` (regla de continuidad) |
| c | Sync caption ↔ audio | La palabra **resaltada** en cada tile coincide con lo que se oye en ese timestamp | Palabra activa adelantada/atrasada respecto al audio | `references/captions.md`, `references/audio.md` |
| d | Overlays no invaden UI | Ningún gráfico/lower-third/CTA entra en zonas de UI de la plataforma (barra de acciones, usuario, caption nativo) | Overlay tapado por UI de IG/TikTok | `references/safe-zones.md`, `references/motion-graphics.md` |
| e | Cifras en pantalla == transcript | Toda cifra/dato/nombre que aparece en gráfico coincide con `transcript.json` | Cifra inventada, redondeo distinto, dato que el hablante nunca dijo | Anti-alucinación (ver §6) |
| f | Legibilidad | Contraste texto/fondo suficiente y tamaño ≥ mínimos del perfil | Texto lavado sobre fondo claro, tipografía por debajo del mínimo | `references/captions.md`, `references/color.md` |

Nota anti-alucinación (ítem e): es el chequeo **más importante** del bloque visual. Un motion graphic con "$12.400" cuando el hablante dijo "doce mil cuatrocientos… bueno, casi trece mil" es un fallo bloqueante. Ver §6.

---

## 3. Ritmo — conteo de cortes vs perfil

Corre scenedetect vía **receta 8** de `references/ffmpeg-recipes.md` para obtener la lista de cortes. Luego:

```
cortes_por_min = (n_cortes / duracion_seg) * 60
seg_por_corte  = duracion_seg / n_cortes
```

Compara `seg_por_corte` contra `profile.ritmo.cut_rate_seg` del `brand-edit-profile.yaml`:

| Cliente | `cut_rate_seg` objetivo (referencia) | Lectura |
|---|---|---|
| Ovejas Voladoras | ~1–2 s/corte, hipercinético | Ritmo alto, word-by-word, SFX denso |
| SAVIAS | ~4–6 s/corte, pausado premium | Ritmo lento, respira; cortes deliberados |
| Educativo genérico | ~5 s/corte | Cadencia media |

**Fallo por ritmo bajo:** si un educativo que el perfil pide a 5 s/corte termina a **>8 s/corte**, falla — significa que **faltan interrupts** (le falta variación visual para sostener retención). Devolver al paso de recorte/motion.

**Regla del bloque de 5 s (universal, regla de craft):** ningún tramo puede pasar **>5 s sin un cambio** (corte, zoom, push-in, aparición de caption/gráfico, SFX). Esto es independiente del `cut_rate_seg` del perfil: incluso SAVIAS pausado necesita un micro-cambio cada ≤5 s aunque no sea un corte duro (un push-in lento cuenta). Detección: buscar en `scenes.txt` cualquier gap > 5.0 s entre eventos; si hay uno sin un evento de motion que lo cubra, es fallo. Ver la regla en `references/craft-rules.md` y las técnicas de cambio suave en `references/motion-graphics.md`.

---

## 4. Audio — LUFS, true peak y ducking

Mide con `$FF` loudnorm en modo análisis con `print_format=json` (receta de loudnorm en `references/ffmpeg-recipes.md`; parámetros completos en `references/audio.md`). Del `loudness.json` extrae `input_i` (LUFS integrado) y `input_tp` (true peak):

| Métrica | Umbral | Campo JSON | Acción si falla |
|---|---|---|---|
| LUFS integrado | **−14 LUFS (±1)** | `input_i` ∈ [−15, −13] | Re-normalizar con loudnorm (2ª pasada); ver `references/audio.md` |
| True peak | **≤ −1 dBTP** | `input_tp` ≤ −1.0 | Bajar ganancia / limitar; re-render de audio |
| Voz sobre música (ducking) | La voz se entiende **siempre** sobre la música | Chequeo perceptual + verificar que la música baja bajo la voz | Aplicar/ajustar sidechain ducking, ver `references/audio.md` |

Notas:
- **−14 LUFS** es el target de plataformas sociales; no lo confundas con broadcast (−23). Ver `references/audio.md` para la justificación por plataforma.
- El ducking se verifica de dos formas: (1) que exista atenuación de la música en los tramos con voz, y (2) revisión perceptual de que ninguna palabra queda enterrada. Un true peak dentro de umbral con la voz inaudible bajo la música **sigue siendo fallo**.
- Ovejas Voladoras usa SFX denso: verifica además que los SFX **no** empujen el true peak por encima de −1 dBTP ni tapen la voz.

---

## 5. Duración / formato — probe del contenedor

Usa `$FF`/ffprobe (receta de probe en `references/ffmpeg-recipes.md`) para leer los metadatos del `final.mp4`. Todos deben coincidir exactamente:

| Atributo | Valor exigido | Acción si falla |
|---|---|---|
| Dimensiones | **1080×1920** exacto | Re-render con escala/canvas correcto |
| FPS | **30** | Re-render a 30 fps constante |
| Códec de video | **h264** | Re-encode a h264 |
| Pixel format | **yuv420p** | Re-encode a yuv420p (compatibilidad universal de reproductores) |
| `+faststart` | **Presente** (moov atom al inicio) | Re-mux con `-movflags +faststart` |

`yuv420p` y `+faststart` son no-negociables: sin ellos el video puede no reproducir en algunos clientes móviles o tarda en arrancar. Ver `references/pipeline.md` para el paso de export canónico.

---

## 6. Anti-alucinación — cifras contra el guion

Este es un chequeo transversal (visual + textual) y el de **mayor riesgo reputacional**. Cualquier cifra, porcentaje, precio, fecha, nombre propio o dato que aparezca **en pantalla** (motion graphic, lower-third, caption enfático, CTA) debe existir literalmente en `transcript.json` o en el guion aprobado.

Procedimiento:
1. Extrae del contact-sheet (Claude-visión) la lista de todas las cifras/datos renderizados en pantalla.
2. Cruza cada una contra `transcript.json` en el timestamp correspondiente.
3. Cualquier cifra en pantalla que **no** aparezca en el transcript/guion = **fallo bloqueante**. No se redondea, no se "mejora", no se infiere.

Esto captura el fallo típico de un motor generativo que "rellena" un dato plausible pero inexistente. Ver también el ítem (e) de §2.

---

## 7. Gate específico de Hyperframes (si el motor es Hyperframes)

Si `references/engine-decision.md` resolvió el render a **Hyperframes**, corre estos comandos **ANTES del render** (son bloqueantes de pre-render, no de post-render):

```bash
npx hyperframes lint     # BLOQUEANTE: data-composition-id, tracks, timelines
npx hyperframes inspect  # overflow de texto (captions/gráficos que se salen)
```

| Comando | Qué valida | Bloquea si |
|---|---|---|
| `npx hyperframes lint` | Estructura: `data-composition-id` presente, tracks bien formados, timelines coherentes | Falta composition-id, track roto o timeline inválido |
| `npx hyperframes inspect` | Overflow de texto en cajas de captions/gráficos | Un texto desborda su contenedor (romper legibilidad / safe-zone) |

Opcional (no bloqueante): `animation-map.mjs` para verificar la **coreografía** de animaciones (que los tiempos de entrada/salida de cada elemento no colisionen y respeten el ritmo). Ver la skill `hyperframes` y `references/motion-graphics.md`.

Si el motor es **Remotion** en lugar de Hyperframes, este gate no aplica; el equivalente de validación es el propio typecheck/preview de Remotion antes del render (ver `references/engine-decision.md`).

---

## 8. Hook — primeros 3 s

El hook es donde se gana o se pierde la retención, así que tiene su propia línea de rúbrica (regla de craft universal):

| Chequeo del hook | Pasa si | Falla si |
|---|---|---|
| Movimiento en los primeros 3 s | Hay MOVIMIENTO real (habla, corte, push-in, gráfico entrando) desde el frame 1 | Los primeros 3 s son un logo/intro/placa estática |
| Promesa antes del s5 | La promesa/gancho verbal o textual aparece **antes del segundo 5** | El video "calienta" y recién promete pasado el s5 |

Detección: inspeccionar los primeros tiles del contact-sheet (§2) + los primeros eventos de `scenes.txt` (§3) + el `transcript.json` para localizar la promesa. Un intro de logo en 0–3 s es fallo aunque el resto del video sea perfecto. Ver `references/craft-rules.md`.

---

## 9. Rúbrica consolidada (tabla maestra)

| Chequeo | Umbral | Cómo medir | Acción si falla |
|---|---|---|---|
| Captions en safe-zone / no sobre rostro | 100% de captions dentro, 0 sobre cara | Contact-sheet (receta 21) + Claude-visión | Reposicionar captions (`references/captions.md`, `references/safe-zones.md`) |
| Sin frames negros/congelados | 0 tiles negros/freeze indebidos | Contact-sheet + Claude-visión | Recortar frame malo / rehacer corte |
| Sync caption ↔ audio | Palabra activa == audio en cada tile | Contact-sheet + Claude-visión, cruce con transcript | Re-timing de captions (`references/captions.md`) |
| Overlays fuera de zonas UI | 0 overlays invadiendo UI | Contact-sheet + safe-zone overlay | Mover overlay dentro de zona segura (`references/safe-zones.md`) |
| Cifras en pantalla == transcript | 100% coincidencia | Claude-visión + cruce `transcript.json` (§6) | Corregir/eliminar gráfico con dato falso — BLOQUEANTE |
| Legibilidad texto | Contraste OK + tamaño ≥ mínimo del perfil | Contact-sheet + Claude-visión | Ajustar color/tamaño (`references/color.md`, `references/captions.md`) |
| Ritmo (s/corte) | Dentro de `profile.ritmo.cut_rate_seg` | scenedetect (receta 8), cortes/min | Añadir interrupts / re-cortar (`references/motion-graphics.md`) |
| Bloque de 5 s | 0 tramos >5 s sin cambio | Gaps en `scenes.txt` | Insertar cambio (corte/zoom/gráfico) — regla craft |
| LUFS integrado | −14 ±1 | loudnorm `print_format=json`, `input_i` | Re-normalizar (`references/audio.md`) |
| True peak | ≤ −1 dBTP | loudnorm JSON, `input_tp` | Limitar / bajar ganancia |
| Ducking (voz sobre música) | Voz inteligible siempre | loudnorm + revisión perceptual | Aplicar/ajustar sidechain (`references/audio.md`) |
| Dimensiones | 1080×1920 exacto | ffprobe (`$FF`) | Re-render con canvas correcto |
| FPS | 30 | ffprobe | Re-render a 30 |
| Códec/pixfmt | h264 / yuv420p | ffprobe | Re-encode |
| +faststart | Presente | ffprobe / mp4 metadata | Re-mux `-movflags +faststart` |
| Hook: movimiento 0–3 s | Movimiento desde frame 1 | Primeros tiles + `scenes.txt` | Recortar intro/logo estático |
| Hook: promesa < s5 | Promesa antes del s5 | `transcript.json` + tiles | Re-cortar apertura |
| Hyperframes lint | Sin errores | `npx hyperframes lint` (pre-render) | Corregir composition-id/tracks/timelines |
| Hyperframes inspect | Sin overflow de texto | `npx hyperframes inspect` (pre-render) | Ajustar caja/tamaño de texto |

Regla de agregación: **un fallo bloqueante = no publica.** Los bloqueantes son cifras-vs-transcript (§6), formato/contenedor (§5), captions sobre rostro (§2a) y los gates de Hyperframes (§7). Los demás son fallos duros que también detienen el pipeline pero se corrigen en su paso de origen; ninguno se "aprueba con excepción" de forma automática.

---

## 10. Cierre — el Auto-QA NO reemplaza al humano

El Auto-QA (paso 13) es un **filtro previo**, no la aprobación final. El **paso 14 es control humano obligatorio**:

- Cualquier **texto o cifra** en pantalla se verifica de nuevo **contra el guion real** antes de publicar. El cruce automático con `transcript.json` (§6) reduce el riesgo pero no lo elimina — el transcript también puede tener errores de Whisper.
- El juicio creativo (¿el hook engancha de verdad?, ¿el ritmo *se siente* bien para este cliente?, ¿el tono coincide con el perfil de marca?) es humano.
- Los diales por cliente (SAVIAS premium/pausado vs Ovejas Voladoras hipercinético) fijan los umbrales, pero la interpretación fina la valida una persona.

En una frase: **el Auto-QA garantiza que el video es entregable; el humano garantiza que vale la pena publicarlo.** Ver el flujo completo en `references/pipeline.md`.

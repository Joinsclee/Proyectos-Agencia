---
name: video-editor-pro
description: Editor de video profesional de RETENCIÓN para este proyecto Remotion. Convierte un video crudo o un guion en una composición Remotion publicable — cortada, con subtítulos kinéticos (palabra activa), motion graphics de datos, b-roll sincronizado, safe zones y audio masterizado a −14 LUFS. Codifica el craft de edición viral (hook en los primeros segundos, ritmo, EMN/estímulo mínimo, captions, safe zones) de forma brand-agnóstica: los diales se ajustan por pieza/marca. Construye sobre las convenciones del proyecto (scripts/build-captions.mjs, src/CaptionedVideo.tsx, data-builders, render con `remotion render`). Usar SIEMPRE que se edite/monte/renderice un video en este repo, se hagan subtítulos, motion graphics de datos, se ajuste el ritmo o retención, o se masterice el audio de un render. Para finishing usa el ffmpeg del sistema (audio/reframe/QA); el texto y las animaciones se renderizan EN Remotion (nunca se queman con ffmpeg).
---

# video-editor-pro — Editor de retención (Remotion)

Toma un video crudo o un guion y produce una **composición Remotion publicable**. No reemplaza tus componentes; **eleva el craft** alrededor de ellos: por qué y cuándo poner cada corte, caption, gráfico y sonido para que el video **retenga** (que la persona no haga swipe).

Filosofía (edición de retención): **no importa que el video se vea bonito, importa que FUNCIONE** en la red social. Cada decisión sirve a la retención. Máxima automatización, criterio de director, y **control de calidad humano** antes de publicar.

Este proyecto **ya renderiza texto y captions en Remotion** (React). Por eso: **el texto/captions/motion-graphics se hacen EN Remotion**; **FFmpeg es solo para finishing** (extraer audio para whisper, masterizar loudness, reframe de source, concat, contact-sheet de QA). No se queman subtítulos con ffmpeg.

## Qué ya existe en el repo (construir sobre esto)

- `scripts/build-captions.mjs` — whisper.cpp `-ojf` → formato propio `[{show,hide,words:[{t,start,end}]}]` (líneas naturales, show/hide contiguo).
- `src/CaptionedVideo.tsx` — reproduce el video de fondo + subtítulos con **resaltado de palabra activa** y animación de entrada/salida. Componente reutilizable (parametriza colores por marca).
- `scripts/build-*-data.mjs` — data-builders para gráficos (patrón para motion graphics de datos).
- `models/ggml-medium.bin` — modelo whisper multilingüe del proyecto.
- `remotion render <Comp> out/x.mp4` — comandos de render por composición (ver `package.json`).

## El pipeline (crudo → publicable)

Detalle con comandos en **`references/pipeline.md`**.

0. **Definir la pieza**: formato (9:16 default), tono/ritmo (los *diales* de la marca), y el guion/hook.
1. **Normalizar** el source y **extraer audio 16k** (`scripts/transcribe.sh` lo hace y transcribe).
2. **Transcribir** word-level con whisper (`-ojf`) → `scripts/build-captions.mjs` → `*-captions.json`.
3. **Corte semántico**: quitar silencios/muletillas, **mover el hook a t=0** (regla 80/20 de `references/craft-rules.md`). En Remotion se materializa con `trimBefore/trimAfter` en `<Video>` o múltiples `<Sequence>` (no destructivo).
4. **Componer en Remotion**: video de fondo + `CaptionedVideo` + motion graphics + b-roll + transiciones (`@remotion/transitions`).
5. **Captions** kinéticos (`references/captions.md`): palabra activa, colores semánticos, safe zones, lead −150ms.
6. **Motion graphics de datos** (`references/motion-graphics.md`): **toda cifra hablada dispara un gráfico**; usa el patrón de los data-builders + `interpolate`/`spring`.
7. **B-roll**: entra EN la palabra clave (L-cut, la voz no se corta). Prep del source con ffmpeg (`references/ffmpeg-recipes.md`).
8. **Audio**: música con ducking bajo la voz; **masterizar el render a −14 LUFS** (`scripts/master-audio.sh`, `references/audio-finishing.md`).
9. **Render**: `npx remotion render <Comp> out/pieza.mp4` (`--props` para variantes/batch).
10. **QA + control humano** (`references/qa.md`): contact-sheet + revisión de visión (captions en safe-zone, sync, cifras == transcript), cortes/min vs el dial, LUFS ≈ −14. Aprobación humana antes de publicar.

## Los diales por pieza/marca (parametrización)

El craft (18 reglas) es **universal**; lo que cambia por pieza es un puñado de **diales**: ritmo de corte (`cut_rate`), zoom máximo, modo de captions (word-by-word vs frase, `switch_ms`), densidad de SFX, BPM/energía de música, y la paleta. Define estos como constantes en `theme.ts` o en los props de la composición, y reutiliza los componentes cambiando solo los diales. Una **marca pausada/premium** = cortes 5-8s, captions por frase, música ambiente; una **marca rápida/hype** = cortes 1.5-3s, word-by-word, SFX denso.

## Ventajas Remotion que este skill aprovecha

- **Determinista y batch**: una composición + `--props`/dataset → N videos (variantes de hook o por marca).
- **`calculateMetadata`**: dimensiona la comp al source/voiceover automáticamente.
- **`trimBefore`/`trimAfter`**: corte no destructivo, editable.
- **`@remotion/transitions`**: `TransitionSeries` para transiciones frame-exactas (ya instalado).
- **Charts frame-exactos**: `interpolate`/`spring` para contadores/curvas que "suben y aterrizan".

## Referencias

- `references/craft-rules.md` — las 18 reglas de retención + 5 tipos de edición + EMN + 80/20. **Leer primero.**
- `references/pipeline.md` — los pasos con comandos, en este repo Remotion.
- `references/captions.md` — captions de retención sobre el formato propio del repo + `CaptionedVideo`.
- `references/motion-graphics.md` — cifra hablada → chart en Remotion (patrón de data-builders).
- `references/audio-finishing.md` — masterizar a −14 LUFS, ducking, arco de música.
- `references/ffmpeg-recipes.md` — recetas de finishing (audio, reframe de source, QA).
- `references/safe-zones.md` — máscaras 9:16 / 1:1 / 16:9 como constantes para Remotion.
- `references/qa.md` — rúbrica de auto-QA.

## Regla de cierre

Cualquier texto o cifra en pantalla se **verifica contra el guion/transcript real** antes de publicar (anti-alucinación). El objetivo es velocidad, no ausencia de control de calidad.

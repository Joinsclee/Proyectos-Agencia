---
name: clee-video-editor
description: Convierte un video CRUDO (talking-head, screen-recording o clip de cliente) en un video TERMINADO listo para publicar — cortado, con subtítulos kinéticos quemados, motion graphics de datos, b-roll sincronizado, SFX/música y branding del cliente — renderizado de forma agéntica con Hyperframes y/o Remotion (+ FFmpeg/Whisper), SIN edición manual en CapCut/Premiere. Es la "Máquina de Edición CLEE": orquestador de edición de retención para JoinsClee (SAVIAS, Ovejas Voladoras, HUMANOX, Barco de Papel/Origami, IA LAB, VUELA). Codifica la metodología de edición viral (hook en los primeros segundos, ritmo, captions, EMN/estímulo mínimo). Usar SIEMPRE cuando se mencione: editar este video, edición de retención, montar el Reel/Short, video crudo a publicable, cortar silencios y subtitular, quemar subtítulos, motion graphics de datos, pipeline de edición, máquina de edición CLEE, clee-video-editor, o frases como "edita este video con el estilo de SAVIAS", "móntame el Reel terminado", "córtalo y súbele el ritmo", "hazme los subtítulos animados", "renderiza el video final". NO usar para: draft editable de CapCut para Meta Ads (usar ads-factory-clee), escribir guiones (social-content-scriptwriter, video-ads-scriptwriter, pillar-video-scriptwriter), construir el brand kit visual (brand-kit-builder-clee), crear el LUT de color (color-grading-clee), overlays reutilizables sueltos para CapCut (motion-snippets-clee), gráficos estáticos PNG (brand-graphics-clee), ni miniaturas (thumbnail-prompter).
---

# clee-video-editor — Máquina de Edición CLEE

Toma **un video crudo** y entrega **un MP4 terminado listo para publicar**. Es el orquestador de la capa de EDICIÓN del ecosistema CLEE-OS: no escribe guiones, no define la marca, no crea el look de color — **consume** esos insumos y produce el video final renderizado.

La filosofía es la del video de referencia (masterclass de edición viral, +11.300 videos): **no importa que el video se vea bonito, importa que funcione** dentro de la red social. Cada decisión de edición sirve a la **retención** (que la persona no haga swipe). Máxima automatización, calidad de director creativo, y **control de calidad humano obligatorio** antes de publicar.

## Las dos rutas de entrega

Al recibir un encargo, decide primero la ruta:

- **Ruta A — Render autónomo (por defecto, este skill).** El entregable es un **MP4 terminado** renderizado con Hyperframes y/o Remotion + FFmpeg. Reels orgánicos, YouTube, contenido de distribución, VSL. Es lo que documenta este skill.
- **Ruta B — Draft editable de CapCut.** El entregable es una carpeta `dfd_` para que un editor humano refine el 10-15%. Meta/TikTok Ads. → **Delega TODO a `ads-factory-clee`** y detente aquí.

Si no está claro, pregunta UNA vez: "¿Video terminado renderizado (Ruta A) o draft de CapCut para refinar (Ruta B)?"

## Cuándo se activa

Cristhian/Camilo operan Claude Code en macOS. Triggers de la Ruta A:
- Hay un video crudo (talking-head, screen-recording o clip de cliente) que hay que dejar publicable.
- Se conoce el **cliente** (define el perfil de edición y el brand kit) y el **formato/plataforma** (9:16 Reel, 16:9 YouTube, 1:1).

NO se activa para: escribir el guion, definir la marca, o generar el draft de CapCut (Ruta B).

## Pre-requisitos (verificar UNA vez)

Antes del primer uso corre el preflight — comprueba binarios, filtros y modelos reales en la máquina:

```bash
bash ~/.claude/skills/clee-video-editor/scripts/preflight.sh
```

Verifica y reporta:
1. **FFmpeg del sistema** (`FF`, rápido) — corte, loudnorm, scale, concat, overlay, ducking, lut3d, zoompan.
2. **FFmpeg con libass** (`FFSUB`) — obligatorio SOLO para quemar subtítulos/ASS con FFmpeg. El ffmpeg de Homebrew típicamente **no** trae libass; el preflight localiza uno (`ffmpeg-static` de npm) o guía a instalarlo. Si no hay `FFSUB`, la ruta de captions cae en Remotion/Hyperframes (que renderizan texto vía Chrome y no necesitan libass).
3. **whisper-cli** (whisper.cpp) + **modelo multilingüe** (`ggml-medium`/`small`, NUNCA `.en`) + modelo VAD silero.
4. **Node.js 22+** (requisito de Hyperframes y Remotion) y **Hyperframes** instalado (`npx skills add heygen-com/hyperframes --all`).

Detalle y resolución de fallos: `references/setup.md` (si falta algo, el preflight lo dice y no continúa).

## El pipeline en 14 pasos (crudo → publicable)

Resumen. El detalle con el comando exacto de cada paso está en **`references/pipeline.md`** — léelo antes de producir.

0. **Preflight + cargar perfil** del cliente (`profiles/<cliente>.yaml`). Si el cliente no tiene brand kit → **detente y delega a `brand-kit-builder-clee`**.
1. **Normalizar** el crudo → h264/yuv420p/30fps/48k (`scripts/normalize.sh`). Clasificar tipo (talking-head / screen-rec / clip).
2. **Extraer audio** 16 kHz mono (`scripts/extract-audio.sh`).
3. **Transcribir** word-level en español (`scripts/transcribe.sh`) — `whisper-cli -ml 1 -sow --language es`.
4. **Corte semántico** → EDL: quitar silencios + muletillas, **mover la primera frase de valor a t=0** (el hook), preservar "holds" (ver `references/semantic-cut.md`).
5. **Reframe** a 9:16 / 1:1 según plataforma (`scripts/reframe.sh`): crop centrado o blurred-pad para UI.
6. **Color grade**: pedir el `.cube` a `color-grading-clee`, aplicar con `lut3d` **antes** de quemar texto (`references/color.md`).
7. **Decidir motor de composición** (`references/engine-decision.md`): Hyperframes, Remotion o quemado ASS con FFSUB — UNO por proyecto.
8. **Captions** kinéticos (`references/captions.md`): palabra-por-palabra con palabra activa resaltada, colores semánticos, fuera del rostro y de las safe zones.
9. **Motion graphics de datos** (`references/motion-graphics.md`): **toda cifra hablada dispara un gráfico** (contador, pie, línea de retención, growth). Lower-thirds, split-screen, mockups de prueba social.
10. **B-roll + recursos**: b-roll entra EN la palabra clave que ilustra (L-cut, la voz no se corta). Prompts IA → `b-roll-prompter-clee`; SFX/música por perfil.
11. **Mezcla de audio** (`references/audio.md`): ducking de música bajo la voz, arco emocional, loudnorm 2-pass a −14 LUFS.
12. **Master render** (`references/pipeline.md`): `npx remotion render` / `npx hyperframes render` / ensamble FFSUB en una pasada.
13. **Auto-QA** (`references/qa.md`): contact-sheet + revisión de visión (captions en safe-zone, frames negros, sync), cortes/min vs el perfil, LUFS final.
14. **Entrega + control humano.** Camilo/Cristhian revisan el render contra el brand kit. Ajustes puntuales en lenguaje natural → re-render. Solo se publica tras aprobación.

## Motor de composición: Hyperframes vs Remotion vs FFSUB

Regla de oro (detalle en `references/engine-decision.md`):
- **Hyperframes** = montaje creativo one-off + overlays sobre footage (talking-head-recut, embedded-captions, faceless-explainer). Motor **principal** (Apache-2.0, gratis).
- **Remotion** = plantillas repetibles, **gráficos de datos frame-exactos** y **batch dataset** (1 comp → N videos por cliente/hook). Ojo: **licencia comercial para equipos de 4+**.
- **FFSUB (ASS)** = quemado de captions barato en una pasada, cuando no se necesita composición.
- **Un solo motor de composición por pieza.** Mezclar solo vía overlay alpha (`.webm`) compuesto con FFmpeg.

## Perfiles de edición por cliente

Las **18 reglas de craft son universales** (`references/craft-rules.md`); lo que cambia por cliente son los **diales numéricos** del `brand-edit-profile` (`profiles/<cliente>.yaml`): ritmo de corte, zoom máximo, modo de captions, densidad de SFX, BPM de música, VAD. El mismo pipeline produce **SAVIAS** (premium, pausado, serif, sage/crema/dorado) y **Ovejas Voladoras** (hipercinético, word-by-word, SFX denso). Schema en `profiles/_schema.yaml`.

Si un cliente aún no tiene perfil calibrado, arranca del perfil más cercano, marca `# TODO calibrar` y ajusta contra 3-5 piezas aprobadas.

## Referencias (cargar según el paso)

- **`references/pipeline.md`** — los 14 pasos con el comando exacto de cada uno. **Leer siempre antes de producir.**
- **`references/craft-rules.md`** — las 18 reglas no negociables + los 5 tipos de edición + taxonomía de hooks. La biblia del "por qué".
- **`references/engine-decision.md`** — tabla de decisión Hyperframes / Remotion / FFSUB.
- **`references/transcription.md`** — whisper-cli word-level, español, VAD, muletillas, chunking, la regla `.en`.
- **`references/semantic-cut.md`** — EDL, cruce silencios×palabras, J/L-cuts, ocultar jump-cuts.
- **`references/captions.md`** — 3 rutas de captions, adaptadores, colores semánticos, timing (lead −150ms).
- **`references/motion-graphics.md`** — disparadores por cifra hablada, catálogo de charts, lower-thirds/split/mockups.
- **`references/ffmpeg-recipes.md`** — 24 recetas verificadas + la regla de los dos binarios FF/FFSUB.
- **`references/audio.md`** — loudnorm 2-pass, ducking, mapa evento→SFX, arco emocional de música.
- **`references/color.md`** — aplicar `.cube` con `lut3d`, orden de operaciones.
- **`references/safe-zones.md`** — máscaras por plataforma (9:16 / 1:1 / 16:9).
- **`references/qa.md`** — rúbrica de auto-QA con umbrales.
- **`references/subskill-map.md`** — frontera y delegación a las skills CLEE existentes.
- **`references/setup.md`** — instalación y resolución de fallos del preflight.

## Frontera: qué delega este skill (no reimplementar)

- Brand kit visual → **brand-kit-builder-clee** (consumir YAML, nunca construir).
- LUT de color → **color-grading-clee** (crea `.cube`; aquí solo se aplica).
- Overlays animados reutilizables para CapCut → **motion-snippets-clee**.
- Gráficos estáticos PNG → **brand-graphics-clee**.
- Prompts de B-roll IA → **b-roll-prompter-clee** (genera prompts cinematográficos de marca para Veo/Kling/Luma/imagegen).
- Draft de CapCut (Ruta B) → **ads-factory-clee** (entero).
- Composición HTML/GSAP → **hyperframes** + **hyperframes-cli** + **hyperframes-media** + **gsap**.
- Composición React → **remotion-best-practices**.
- Guion / voz / copy → fuera de scope (scriptwriters, voice-profile-builder).

## Regla de cierre

La IA puede "alucinar" (un dato mal en una infografía, una palabra mal transcrita). **El paso 14 no es opcional**: cualquier texto o cifra en pantalla se verifica contra el guion/transcript real antes de publicar. El objetivo es velocidad, no ausencia de control de calidad.

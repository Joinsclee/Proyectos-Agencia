# Mapa de sub-skills: frontera de delegación

`clee-video-editor` es un **ORQUESTADOR delgado**. No reimplementa dominios que ya tienen su propia skill. Su trabajo es *ingesta → routing → corte semántico → decisión de motor → ensamble → QA* más los **diales por marca** del `brand-edit-profile`. Todo lo demás se **delega** al dueño del dominio y se **consume** su output.

Regla mental: si otra skill ya sabe hacer el "cómo" de un dominio (construir el brand kit, crear el LUT, componer HTML+GSAP, montar un draft de CapCut para Ads), aquí **no se copia esa lógica**: se invoca esa skill o se consume su artefacto. Ver `references/engine-decision.md` para la decisión de motor y `references/pipeline.md` para dónde encaja cada delegación en el flujo.

## Tabla de delegación

| Skill | Qué hace | Cuándo delegar | Qué NO reimplementar aquí |
|---|---|---|---|
| **brand-kit-builder-clee** | Construye el Brand Kit Visual del cliente (YAML: paleta, tipografías + fallbacks, estilo fotográfico, tratamiento de logo, anti-patrones) en sesión guiada. | **Pre-requisito upstream.** Si el cliente NO tiene brand kit, **DETENER** y delegar antes de producir cualquier pieza. | La construcción/entrevista del brand kit. Aquí solo se **consume** el YAML (leerlo, mapear sus valores a los diales). Nunca se construye ni se edita el YAML. |
| **color-grading-clee** | Crea el archivo `.cube` (LUT) del look del cliente + preset manual CapCut, partiendo del Brand Kit. | Cuando la pieza necesita un look/grade nuevo, o el cliente aún no tiene su `.cube`. | La **creación** del LUT. Aquí solo se **aplica** el `.cube` ya existente vía `lut3d` (ver `references/color.md` y la receta correspondiente de `references/ffmpeg-recipes.md`). No se derivan curvas de color a mano. |
| **hyperframes** / **hyperframes-cli** / **hyperframes-media** / **gsap** | Composición HTML+GSAP; CLI (`init`/`lint`/`inspect`/`render`); media (TTS Kokoro, `transcribe`, `remove-background`); librería de animación. | **Motor principal de composición** para captions kinéticos, motion graphics de datos, overlays animados y render agéntico. | La mecánica interna de Hyperframes (init de proyecto, lint, inspect, render, TTS, transcribe, remove-bg). Aquí se **orquesta**: se decide qué componer y con qué diales, y se invocan sus comandos. |
| **remotion-best-practices** | Composición en React (charts complejos, render por lotes/batch). | **Motor alternativo** cuando la pieza es data-heavy o conviene React/batch. **UN motor por pieza** (ver `references/engine-decision.md`). | La implementación de componentes Remotion. No se mezclan motores en la misma pieza; se elige uno y se delega el "cómo" a su skill. |
| **motion-snippets-clee** | Overlays **animados REUTILIZABLES** para CapCut (lower-thirds, counters, logo reveals) en HTML/Lottie. | Cuando se necesita un overlay animado suelto y reusable, no acoplado al render de esta pieza. | La construcción de los snippets. Frontera con `brand-graphics`: **animado → motion-snippets**. |
| **brand-graphics-clee** | Gráficos **ESTÁTICOS PNG** de marca (láminas, callouts, CTA cards). | Cuando la pieza necesita un asset fijo (lámina de receta, callout, CTA estática) para insertar en el video. | La generación del PNG. Frontera con `motion-snippets`: **estático → brand-graphics**, **animado → motion-snippets**. |
| **ads-factory-clee** | **Ruta B completa**: draft editable de CapCut para Meta Ads vía MCP `capcut-api` (transcribe, subtítulos quemados, B-roll, lower-thirds, CTA card, safe zones). | Cuando el entregable es un **draft de CapCut para Ads** (no un MP4 terminado). **Delegar la ruta entera**, no fragmentos. | Todo el pipeline de CapCut/Meta Ads. `clee-video-editor` produce MP4 terminado (Ruta A); para el draft editable se entrega el control completo a esta skill. |
| **b-roll-prompter-clee** | Prompts cinematográficos de B-roll IA con identidad de marca (para Veo/Kling/Luma/Runway/Higgsfield/Flux/Nano Banana/`imagegen`). | En el **paso 10**, cuando el video necesita B-roll generado con IA. Delega el prompting; el clip se genera con la herramienta que la skill recomiende. | El prompting de B-roll IA y el mapeo del brand kit a parámetros de prompt. No se implementa dentro del orquestador. |
| **voice-profile-builder** | Voz/tono de marca (copy, VO). | Solo relevante **si se genera VO/copy nuevo**. Normalmente el crudo **ya trae la voz** del cliente. | La definición de voz. En la mayoría de piezas no aplica: se edita sobre audio existente, no se guioniza ni se re-locuta. |
| **Scriptwriters**: `social-content-scriptwriter`, `video-ads-scriptwriter`, `pillar-video-scriptwriter`, `sfc-scriptwriter-clee` | **GUION** (upstream). | Cuando falta el guion. Es una fase **anterior** a la edición. | La escritura del guion. `clee-video-editor` **parte de un clip ya grabado**; no escribe ni reescribe guiones. |
| **thumbnail-prompter** | Miniaturas de YouTube (prompts Nano Banana / Gemini). | Fase **Empaque**, posterior a la edición. | La generación de miniaturas. No es parte del pipeline de edición; se delega en Empaque. |

## Fronteras rápidas (para no confundir dominios)

| Necesidad | Dueño |
|---|---|
| Definir identidad visual (colores, tipos) | brand-kit-builder-clee (upstream, bloqueante) |
| Crear el look/grade `.cube` | color-grading-clee (crea) → aquí solo `lut3d` aplica |
| Componer captions/data-viz/overlays de ESTA pieza | hyperframes / gsap (motor principal) o remotion (alternativo) |
| Overlay animado reutilizable suelto | motion-snippets-clee |
| Asset PNG fijo (lámina, callout, CTA) | brand-graphics-clee |
| Draft editable de CapCut para Meta Ads | ads-factory-clee (Ruta B entera) |
| B-roll IA | b-roll-prompter-clee (prompt de marca) → Veo/Kling/Luma/imagegen (generación) |
| Guion | scriptwriters (upstream) |
| Miniatura | thumbnail-prompter (Empaque) |
| Voz/tono para VO/copy nuevo | voice-profile-builder (solo si aplica) |

## Regla de cierre

**Lo que vive en `clee-video-editor` es la ORQUESTACIÓN** — ingesta, routing, corte semántico (`references/semantic-cut.md`), decisión de motor (`references/engine-decision.md`), ensamble y QA (`references/qa.md`) — **y los diales por marca** del `brand-edit-profile` (SAVIAS premium/pausado serif sage-crema-dorado de ritmo lento; Ovejas Voladoras hipercinético word-by-word con SFX denso; HUMANOX; Barco de Papel/Origami; IA LAB; VUELA). **El "cómo" de cada dominio se delega** a la skill dueña; aquí no se reimplementa. Las **18 reglas de craft** (`references/craft-rules.md`) son universales y se aplican en toda pieza; lo único que cambia por cliente son los diales del perfil.

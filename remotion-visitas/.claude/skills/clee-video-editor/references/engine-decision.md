# Decisión de motor: Hyperframes vs Remotion vs FFSUB

**Un solo motor de composición por pieza.** Mezclar solo vía overlay alpha (`.webm`) compuesto con FFmpeg (no es feature nativo de ninguno; verificar con smoke-test).

## Tabla de decisión

| Necesidad | Motor | Por qué |
|---|---|---|
| Captions kinéticos word-by-word baratos y rápidos | **FFSUB** (ASS `\k`/highlight inline) | 1 pasada, sin render engine, verificado |
| Captions cinemáticos detrás del sujeto (hero word, matte) | **Hyperframes** `embedded-captions` | matte u2net (occlusion); DNA loud/ink/cream |
| Captions premium con control de frame + schema de marca | **Remotion** `createTikTokStyleCaptions` | color por brand kit, Zod, determinista |
| Charts de datos animados (pie/línea/growth/counter) | **Remotion** | `interpolate`/`spring` frame-exacto, paramétrico |
| Batch N variantes (6 clientes o N hooks) | **Remotion** dataset render | 1 comp → N mp4 |
| Intro/outro branded reutilizable | **Remotion** | schema Zod, versionable en git |
| Cards/lower-thirds/callouts sobre talking-head SIN re-timar | **Hyperframes** `talking-head-recut` | el video corre intacto, overlays con GSAP |
| Explicador faceless desde texto (IA LAB, VUELA) | **Hyperframes** `faceless-explainer` | el LLM compone los visuales |
| Video multi-escena de datos desde assets | **Hyperframes** `general-video` | montaje dirigido por IA |
| Presentador flotante / texto detrás del sujeto | **Hyperframes** `remove-background` | matte VP9+alpha |
| Silence-cut / crop / loudnorm / concat / ducking / PiP / color | **FF** (sistema) | rápido, verificado, sin engine |
| Draft editable de CapCut | **ads-factory-clee** (Ruta B) | ninguno de estos |

## Regla de oro

- **Hyperframes** = montaje creativo *one-off* + overlays sobre footage. Motor **principal** (Apache-2.0, gratis, sin fees por render). Node 22+.
- **Remotion** = **plantillas repetibles, gráficos de datos, batch**. Ojo: **licencia comercial para equipos de 4+ personas** → JoinsClee probablemente paga; úsalo donde su valor lo justifica (charts frame-exactos y dataset render), no por defecto.
- **FFSUB (ASS)** = quemado de captions barato cuando NO hace falta composición (solo texto sobre el clip).

## Por tipo de crudo (heurística de arranque)

- **Talking-head educativo** (SAVIAS, Ovejas, HUMANOX) → **Hyperframes `talking-head-recut`** (cards sobre el video) + FFSUB o Remotion para captions según el perfil.
- **Screen-recording / tutorial** → FFmpeg (crop blurred-pad + PiP circular) + Hyperframes para callouts.
- **Data-heavy / muchas cifras** → **Remotion** (charts) como motor principal.
- **Faceless / explicador desde texto** → **Hyperframes `faceless-explainer`**.
- **6 clientes, mismo template** → **Remotion dataset render**.

## Interop (cuando de verdad hace falta mezclar)

No hay puente nativo Remotion↔Hyperframes. Si necesitas un overlay de un motor sobre una base del otro:
1. Renderiza el overlay con alpha: `npx hyperframes render --format webm` o Remotion con `codec: 'vp9'` + transparencia.
2. Componlo con FFmpeg: `"$FF" -i base.mp4 -i overlay.webm -filter_complex "[0:v][1:v]overlay" out.mp4`.
3. Smoke-test un frame antes de renderizar todo.

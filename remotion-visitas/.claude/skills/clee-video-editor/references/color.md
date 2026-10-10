# Color Grade (Paso 6)

Aplicación del look cromático del cliente mediante un LUT 3D (`.cube`). Este paso **no crea** color: solo lo **aplica**. El grade es determinista, reproducible y vive en un archivo `.cube` que produce otro skill. Ver el flujo global en `references/pipeline.md` (paso 6) y la posición dentro del ensamble en `references/ffmpeg-recipes.md` (receta 23).

## Regla de oro: este skill NO deriva color

| Responsabilidad | Skill / Herramienta |
|---|---|
| Diseñar curvas, crear el `.cube` desde el Brand Kit Visual | `color-grading-clee` (skill externo) |
| **Aplicar** el `.cube` al footage | Este skill (`clee-video-editor`), vía `$FF` |

- El `.cube` (LUT 3D) lo **CREA** `color-grading-clee` traduciendo el Brand Kit Visual (paleta, tratamiento fotográfico, mood) a curvas cinematográficas.
- Este skill **solo aplica** ese LUT. **NUNCA** derives curvas propias, ni improvises `curves`, `eq`, `colorbalance` ni ajustes a mano. Si el look no coincide, el fix es regenerar el `.cube` en `color-grading-clee`, no parchear el filtergraph aquí.
- El LUT del cliente vive en `looks/<cliente>.cube`. Es la única fuente de verdad del look.

## Aplicación del LUT

`lut3d` está disponible en el FFmpeg del sistema (`$FF`) — verificado. No requiere `$FFSUB` (ese binario con libass se reserva para quemar subtítulos, ver `references/captions.md`).

```bash
$FF -i in.mp4 -vf "lut3d=looks/<cliente>.cube" -c:a copy graded.mp4
```

- `-c:a copy`: el audio pasa intacto; el grade es un paso de video puro. El tratamiento de audio va por su propio carril (`references/audio.md`).
- Comando conceptual; para el pipeline real el LUT se fusiona en un solo filtergraph de una pasada (ver receta 23) para evitar recompresiones.

## Orden de operaciones (CRÍTICO)

```
crop / scale  ->  LUT (lut3d)  ->  quemar texto (subtitles / overlays)
```

El color va **ANTES** de captions y overlays. Razón: el LUT reasigna todos los píxeles del frame. Si el texto blanco/amarillo de los subtítulos o los lower-thirds pasa por el LUT, se contamina — el blanco deja de ser blanco, el amarillo de marca se desvía. Los captions y motion graphics deben pintarse **encima** del footage ya grabado, con su color exacto intacto.

En el ensamble de una pasada (receta 23) el orden del filtergraph es literalmente:

```
crop,scale,lut3d,subtitles
```

- `crop,scale` primero: normaliza encuadre/resolución antes de tocar color (ver `references/safe-zones.md` para el crop 9:16 y las safe zones de Meta/TikTok).
- `lut3d` en medio: el grade sobre el footage limpio.
- `subtitles` al final: el texto se quema al último, ya libre del LUT.

Nunca inviertas este orden. Un `subtitles` antes de `lut3d` degrada la legibilidad y rompe el contrato de color de marca.

## Composición en Hyperframes / Remotion

Cuando el video se compone en Hyperframes o Remotion (motor decidido en `references/engine-decision.md`), el LUT **no** se aplica dentro del render de Chrome.

| Elemento | ¿Pasa por el LUT? | Cómo |
|---|---|---|
| Footage base (el clip crudo) | Sí | Aplicar el LUT con FFmpeg (`$FF`, comando de arriba) **ANTES** de meterlo como `<Video>` / `media` en la composición |
| Texto, captions, motion graphics renderizados por Chrome | **No** | Se pintan encima; su color viene del Brand Kit, no del LUT |

Es decir: se pre-graba el footage a `graded.mp4` y ese es el asset que consume el `<Video>`. El texto que dibuja Chrome (kinetic captions, data motion graphics — ver `references/motion-graphics.md` y `references/captions.md`) queda por definición fuera del LUT, respetando el mismo principio del orden de operaciones.

## Look por marca

Los diales del look son **datos del `.cube` del cliente**, no valores hardcodeados en este archivo. Las 18 reglas de craft (`references/craft-rules.md`) son universales; lo que cambia por cliente es el LUT, un dial más del brand-edit-profile.

| Cliente | Carácter del look | Notas |
|---|---|---|
| SAVIAS | Cálido, sage / crema / dorado, contraste suave, premium | Ritmo lento y pausado; el color acompaña la sensación artesanal/premium |
| Ovejas Voladoras | Más saturado y contrastado, energía | Coherente con el estilo hipercinético (word-by-word, SFX denso) |

Otros clientes (HUMANOX, Barco de Papel/Origami, IA LAB, VUELA) usan su propio `looks/<cliente>.cube`. En todos los casos: **los valores vienen del `.cube`, no se transcriben ni se aproximan aquí.**

## Verificación

Confirmar el grade comparando un frame **antes/después** con la extracción de frame único (`references/ffmpeg-recipes.md`, receta 21).

Checklist de QA de color (ver también `references/qa.md`):

- [ ] El look coincide con el Brand Kit Visual del cliente (temperatura, saturación, contraste del perfil).
- [ ] Sin **clipping en highlights**: las zonas brillantes no se queman a blanco plano.
- [ ] Sin **clipping en negros**: las sombras no se aplastan perdiendo detalle.
- [ ] El color del texto/overlays quemado **después** del LUT permanece exacto (blanco = blanco, amarillo de marca correcto).

Flujo: extraer un frame representativo del `in.mp4` y otro del `graded.mp4` (misma marca de tiempo, receta 21) y compararlos lado a lado.

## Preflight

El preflight del pipeline verifica que `$FF` incluye el filtro `lut3d` antes de intentar el grade. Si falta, el paso 6 se detiene y se reporta — no se sustituye por un ajuste manual de color. Ver `references/pipeline.md` para el orden completo de preflight.

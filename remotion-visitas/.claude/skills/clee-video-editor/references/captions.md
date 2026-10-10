# Captions kinéticos

Los subtítulos son el elemento de retención #1 en educativo (regla de craft 8-11): **word-by-word con palabra activa resaltada**, presentes casi todo el video, fuera del rostro y de las safe zones. Hay **3 rutas**; elige por `profile.captions.ruta`.

## Reglas transversales (aplican a las 3 rutas)

- **Máximo 4-6 palabras** en pantalla a la vez.
- **Lead −150ms**: la palabra aparece 100-200ms antes de oírse. La palabra resaltada dura +50-100ms extra.
- **Gaps de 50-100ms** entre grupos para no estroboscopiar.
- **Colores semánticos** (`&HBBGGRR&` en ASS): texto blanco `&H00FFFFFF&`, palabra activa **amarilla** `&H00FFFF&` (o el `highlight_color` de la marca), contorno negro 3-4px. Rojo `&H000000FF&` = negativo/pérdida/alerta; verde `&H0000FF00&` = positivo/dinero. Se asignan por léxico sobre el transcript.
- **Nunca sobre el rostro** ni en el 20% inferior (UI). En 9:16, `MarginV ≥ 330` (ver `safe-zones.md`). Si el encuadre lo permite, centra (Alignment=5).
- **Estilo del hook ≠ estilo de los subtítulos**: la frase-gancho de los primeros segundos va grande y con estilo propio, distinta del rail de subtítulos.

## Ruta 1 — FFSUB (ASS) · barata y rápida

La opción por defecto para captions sin composición. `scripts/words-to-ass.mjs` convierte el JSON word-level de whisper en un `.ass`, en dos modos:

- **`--mode highlight`** (highlight inline): una línea `Dialogue` por ventana de palabras, con la palabra activa pintada del acento dentro de texto blanco.
- **`--mode karaoke`** (`\k` fill progresivo): cada palabra lleva `{\kNN}` = centésimas de segundo de su duración; el fill avanza con la voz.

```bash
node scripts/words-to-ass.mjs transcript.json captions.ass \
  --mode karaoke --lead 150 --max-words 5 \
  --text FFFFFF --active <highlight_hex> --outline 3 --marginv 360 --fontsize 96 --font "Arial"
"$FFSUB" -y -i graded.mp4 -vf "ass=captions.ass" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy capped.mp4
```

Requiere `FFSUB` con libass (preflight lo verifica). Es la ruta más económica en cómputo.

## Ruta 2 — Remotion (`createTikTokStyleCaptions`) · premium con brand schema

Cuando la pieza ya se compone en Remotion (charts, batch). Control de frame exacto, color por brand kit, determinista.

```bash
node scripts/words-to-captions.mjs transcript.json src/captions.json   # word JSON -> Caption[]
```

En la composición:
```tsx
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
const { pages } = createTikTokStyleCaptions({
  captions,                                   // Caption[] = {text,startMs,endMs,timestampMs,confidence}
  combineTokensWithinMilliseconds: profile.switch_ms,  // 350 word-agresivo · 1500 frase-pausado
});
// Cada page tiene tokens[] con fromMs/toMs. Resalta el token activo comparando
// token.fromMs <= t && token.toMs > t. Aplica el lead −150ms al mapear pages -> <Sequence from>.
```

`combineTokensWithinMilliseconds` bajo (~350) = word-by-word; alto (~1500) = frases. Fija **todos** los `@remotion/*` en la misma versión.

## Ruta 3 — Hyperframes (`embedded-captions`) · cinemático detrás del sujeto

Subtitula footage de talking-head con efecto cinemático: rail de subtítulo verbatim en lower-third + una **"hero word"** promovida **detrás del sujeto** vía matte occlusion (u2net). Tres "DNA": loud / ink / cream.

```bash
npx hyperframes init <cliente>-caps --non-interactive --video source.mp4
bash scripts/prepare.sh <cliente>-caps          # matte + transcript + safe-zones.json
node scripts/make-cinematic.cjs <cliente>-caps  # autoría cinematic.json
bash scripts/render-and-composite.sh <cliente>-caps
```

(Los scripts `prepare.sh`/`make-cinematic.cjs` son de la skill `hyperframes` instalada con `npx skills add heygen-com/hyperframes --all`; verifica sus nombres con `npx hyperframes --help` en tu build.)

## Cuál elegir

| Situación | Ruta |
|---|---|
| Reel educativo estándar, rápido | **FFSUB** (default) |
| Ya hay charts/composición en Remotion, o batch | **Remotion** |
| Look cinemático, palabra detrás del presentador | **Hyperframes** embedded-captions |
| Marca pausada premium (SAVIAS) | Remotion o Hyperframes con `switch_ms` alto (reveal por frase) |
| Marca hipercinética (Ovejas) | FFSUB karaoke o Remotion con `switch_ms` bajo (word-by-word) |

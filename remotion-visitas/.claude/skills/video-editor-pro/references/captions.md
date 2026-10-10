# Captions de retención (Remotion)

Los subtítulos son el elemento de retención #1 en educativo: **palabra-por-palabra con la palabra activa resaltada**, presentes casi todo el video, fuera del rostro y de las safe zones (reglas 8-11 de `references/craft-rules.md`). Este repo ya lo hace bien — aquí se documenta cómo **afinarlo** y **parametrizarlo por marca**.

## El sistema que ya existe

- **Formato** (`scripts/build-captions.mjs` → `*-captions.json`):
  ```json
  [{ "show": 0.1, "hide": 1.6, "words": [ { "t": "¿Cuántas", "start": 0.1, "end": 0.49 }, ... ] }]
  ```
  Grupos de línea con timing por palabra, en **segundos**, `hide` contiguo al `show` siguiente (sin parpadeo).
- **Render** (`src/CaptionedVideo.tsx`): `findActiveLine(t)` + índice de palabra activa (`última con start <= t`) → resalta esa palabra. Animación de entrada/salida con `interpolate`.

## Afinamientos de retención (aplicar)

1. **Lead −150ms (la palabra aparece antes de oírse).** En `build-captions.mjs` o en el componente, muestra la línea 100-200ms antes: al calcular `show`, resta ~0.15s (sin bajar de 0). Da sensación de que el texto "va con" la voz, no detrás.
2. **Máx 4-6 palabras por línea.** `build-captions.mjs` ya usa `MAX_WORDS=5` + cortes por puntuación — mantenlo (no subas de 6).
3. **Colores semánticos (parametrizar).** `CaptionedVideo.tsx` hoy fija `GOLD`/`CREAM`. Conviértelos en **props/theme** por pieza:
   - texto base = blanco/crema; **palabra activa = acento de la marca** (dorado, amarillo…); contorno oscuro 3-4px para legibilidad.
   - opcional: pinta de **rojo** palabras negativas/pérdida y **verde** positivo/dinero, detectando por léxico sobre `words[].t`.
4. **Nunca sobre el rostro ni en el 20% inferior.** Coloca el rail de subtítulos en la banda central-baja respetando `references/safe-zones.md` (`MarginV` equivalente: en 9:16 deja ~360-400px libres abajo). Si el rostro está centrado-abajo, sube el rail.
5. **Estilo del hook ≠ estilo del rail.** La frase-gancho de los primeros segundos va grande y con estilo propio (otra composición/`Sequence`), distinta del rail de subtítulos.

## Modo por marca (dial `captions.mode`)

- **word-by-word (marca rápida/hype):** líneas cortas (`MAX_WORDS=3-4`), resaltado agresivo, cambio rápido.
- **frase/reveal (marca pausada/premium):** líneas más largas (`MAX_WORDS=5-6`), la línea aparece por frase, resaltado suave. Sube el `switch`/duración de línea.

Expón el modo como prop de la composición y ajusta `MAX_WORDS` al regenerar los captions.

## Karaoke por palabra en Remotion (patrón)

El componente ya calcula la palabra activa. Para reforzar el look:

```tsx
// dentro del map de line.words:
const isActive = i === activeIdx;
const isPast = i < activeIdx;
const color = isActive ? ACCENT : isPast ? TEXT : UPCOMING; // acento / leído / por venir
const scale = isActive ? 1.06 : 1;                          // micro-pop de la palabra activa
```

- Usa `interpolate(t, [word.start, word.start+0.08], [1, 1.06])` para el pop (no un salto).
- `font-variant-numeric: tabular-nums` si la línea tiene números.
- Contorno con `textShadow` (varias sombras) o `-webkit-text-stroke` para separar del fondo.

## Regenerar captions

```bash
bash .claude/skills/video-editor-pro/scripts/transcribe.sh out/source-audio.mp4 nombre   # whisper -ojf
node scripts/build-captions.mjs nombre-whisper.json src/nombre-captions.json 5 <durSeg>
```

`durSeg` = duración real del video (evita que la última palabra quede fuera; `build-captions.mjs` reescala el último segmento). Luego importa el JSON en la composición y pásalo a `<CaptionedVideo captions={...} />`.

## Checklist

- [ ] ≤6 palabras por línea, `hide` contiguo (sin parpadeo).
- [ ] Palabra activa resaltada con el acento de la marca; lead −150ms.
- [ ] Rail fuera del rostro y del 20% inferior (`references/safe-zones.md`).
- [ ] Colores parametrizados por pieza (no hardcodeados).
- [ ] Números con `tabular-nums`; contraste suficiente (contorno/sombra).

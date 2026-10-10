# Auto-QA de videos renderizados con Remotion

Rúbrica pass/fail que corre el editor ANTES de entregar. El render sale de `remotion render <Comp> out/x.mp4`; el QA lo audita con visión (contact-sheet) + FFmpeg del sistema (`$FF`). Cada chequeo tiene umbral binario, método de medición y acción correctiva. Si un chequeo falla, se corrige en el origen (composición Remotion, data-builder o finishing) y se re-renderiza — nunca se "parchea a mano" el MP4.

Referencias hermanas: `references/ffmpeg-recipes.md` (recetas de contact-sheet, loudnorm, probe), `references/safe-zones.md` (márgenes UI), `references/captions.md`, `references/motion-graphics.md`, `references/audio-finishing.md`, `references/craft-rules.md`, `references/pipeline.md`.

---

## 1. Visual (contact-sheet -> visión)

Genera un contact-sheet del render con la receta de `references/ffmpeg-recipes.md` (mosaico de frames cada ~1-2 s) y pásalo a visión para inspección cuadro a cuadro. La marca ajusta el rigor de los umbrales según pieza (marca pausada/premium tolera menos ruido visual; marca rápida/hype tolera más densidad).

```bash
# Contact-sheet de QA (ver ffmpeg-recipes.md para variantes)
"$FF" -y -i out/x.mp4 \
  -vf "fps=1/1.5,scale=216:384,tile=6x8" \
  scratchpad/qa-contact.png
```

| Chequeo | Umbral (pass) | Cómo medir | Acción si falla |
|---|---|---|---|
| Captions dentro de safe-zone | 100% de los captions dentro de los márgenes de `references/safe-zones.md` (nunca bajo la barra UI inferior ni sobre iconos laterales) | Visión sobre contact-sheet + overlay de safe-zone | Ajustar `bottom`/`top` del bloque de captions en `src/CaptionedVideo.tsx`; re-render |
| Caption nunca sobre el rostro | 0 frames con texto tapando ojos/boca del sujeto | Visión frame a frame en tramos con rostro a cuadro | Subir/bajar el caption o reducir tamaño en la zona; considerar posición dinámica por escena |
| Sin frames negros | 0 frames totalmente negros salvo fade intencional | `blackdetect` de FFmpeg + revisión visual (ver ffmpeg-recipes.md) | Buscar gap de `Sequence`/`Series` sin contenido; cerrar el hueco o poner fondo; re-render |
| Sync caption <-> audio | Desfase <= 100 ms entre palabra resaltada y voz | Reproducir en `remotion studio` (npm start) tramos clave; comparar contra `build-captions.mjs` | Re-generar captions con whisper (`models/ggml-medium.bin`); verificar mapeo `{show,hide,words:[{t,start,end}]}` |
| Overlays no invaden UI | Ningún motion-graphic/lower-third/CTA dentro de la zona reservada de UI (safe-zones) | Visión sobre contact-sheet | Reposicionar overlay en su componente Remotion; re-render |
| Cifras en pantalla == transcript (anti-alucinación) | 100% de números/nombres/datos on-screen coinciden con el guion/transcript real | Cruzar cada cifra del contact-sheet contra el transcript y los props de los data-builders | STOP: corregir el dato en el `scripts/build-*-data.mjs` de origen; jamás inventar cifras |
| Legibilidad | Contraste texto/fondo suficiente y tamaño legible en móvil (texto principal grande, sin rebalse de línea) | Visión sobre contact-sheet a tamaño reducido (simula feed) | Añadir stroke/sombra/box detrás del texto, subir tamaño o acortar línea en el componente |

---

## 2. Ritmo

| Chequeo | Umbral (pass) | Cómo medir | Acción si falla |
|---|---|---|---|
| Cortes por minuto | Dentro del dial de la pieza (marca pausada/premium: menos cortes; marca rápida/hype: más) | Contar cambios de `Sequence`/plano en el timeline de `remotion studio` o en la data del edit | Ajustar duración de secuencias; añadir/quitar cortes según el dial de la marca |
| Regla del bloque de 5 s | Ningún bloque > 5 s sin un estímulo nuevo (corte, zoom, caption, overlay, SFX) | Recorrer el timeline en tramos de 5 s | Insertar EMN (estímulo mínimo necesario) en el bloque muerto; ver `references/craft-rules.md` |

---

## 3. Audio

El audio del render final se mide, no se estima. Objetivo de entrega: loudness integrado ~-14 LUFS para feed social. Corrección real de audio (loudnorm, ducking de música bajo voz) se hace en finishing con FFmpeg — ver `references/audio-finishing.md`.

```bash
# Medición de loudness del render final (print_format=json)
"$FF" -i out/x.mp4 -af \
  "loudnorm=I=-14:TP=-1:LRA=11:print_format=json" \
  -f null - 2>&1 | tail -n 20
```

| Chequeo | Umbral (pass) | Cómo medir | Acción si falla |
|---|---|---|---|
| LUFS integrado | -14 LUFS (+/- 1) | `input_i` del JSON de loudnorm | Re-aplicar loudnorm de dos pasadas en finishing (audio-finishing.md); re-mux |
| True peak | <= -1.0 dBTP | `input_tp` del JSON de loudnorm | Bajar ganancia / limitar; re-normalizar con TP=-1 |
| Voz inteligible sobre música | La voz se entiende sin esfuerzo en todo el tramo con música | Escucha crítica + revisar ducking en audio-finishing.md | Aumentar ducking (sidechain) o bajar el lecho musical; re-mezclar |

---

## 4. Formato (probe del contenedor)

Verifica que el MP4 cumple el spec de entrega vertical con `ffprobe` (ver `references/ffmpeg-recipes.md`).

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,pix_fmt,codec_name \
  -of default=noprint_wrappers=1 out/x.mp4
```

| Chequeo | Umbral (pass) | Cómo medir | Acción si falla |
|---|---|---|---|
| Dimensiones | Exacto 1080x1920 | `width,height` del probe | Corregir `width/height` en la config/composición Remotion; re-render |
| FPS consistente | 30 fps constante (sin VFR) | `r_frame_rate` == `30/1` | Fijar `fps` en la config de Remotion; re-render |
| Códec / pixel format | h264 + `yuv420p` | `codec_name=h264`, `pix_fmt=yuv420p` | Ajustar flags de encoding del render/finishing; re-encode |
| Fast start | `moov` al inicio (`+faststart`) | `ffprobe`/`-movflags` en el encode; verificar reproducción por streaming | Re-mux con `-movflags +faststart` (ffmpeg-recipes.md) |

---

## 5. Hook (primeros segundos)

| Chequeo | Umbral (pass) | Cómo medir | Acción si falla |
|---|---|---|---|
| Movimiento en los primeros 3 s | Hay movimiento visible desde el frame 0 (nada estático) | Visión sobre los frames 0-3 s del contact-sheet | Añadir zoom/entrada/motion al plano inicial (spring/interpolate); re-render |
| Promesa antes del s5 | La promesa/gancho queda planteada antes del segundo 5 | Ver studio + leer caption/on-screen de 0-5 s contra el guion | Reordenar el edit para adelantar la promesa; recortar preámbulo |

---

## 6. Remotion específico (pre-render y determinismo)

Corre esto ANTES de gastar tiempo en un render largo. El determinismo es obligatorio: un render que use `Math.random()` o `Date.now()` produce output distinto por frame/por corrida y rompe la reproducibilidad.

```bash
# Lint del código de las composiciones (usa el script del package.json)
npm run lint          # p.ej. "eslint src"
# o, si aplica:
npx remotion lint

# Previsualización de timing / variantes antes de render
npm start             # remotion studio

# Detectar fuentes de no-determinismo en las composiciones
grep -rnE "Math\.random|Date\.now|new Date\(\)|performance\.now" src/
```

| Chequeo | Umbral (pass) | Cómo medir | Acción si falla |
|---|---|---|---|
| Lint limpio | `npm run lint` / `npx remotion lint` sin errores | Correr antes del render | Corregir el código señalado; no renderizar con lint en rojo |
| Timing revisado en Studio | Entradas/salidas y sync validados en `remotion studio` (npm start) | Previsualización interactiva | Ajustar `Sequence`/`spring`/`interpolate`; re-previsualizar |
| Variantes por props | Cada variante renderiza correcta con sus `--props` | `remotion render <Comp> out/v.mp4 --props=./props/v.json` | Corregir defaults/validación de props de la composición |
| Determinismo | 0 usos de `Math.random()`/`Date.now()`/`new Date()`/`performance.now()` en `src/` | `grep` anterior | Reemplazar por valor derivado de `useCurrentFrame()`/seed fijo/prop; re-render |

---

## 7. Cierre — el auto-QA NO reemplaza al humano

Esta rúbrica atrapa fallos mecánicos (formato, loudness, safe-zones, determinismo, sync). No juzga si el mensaje es correcto ni si una cifra es verdadera: solo verifica coincidencia interna contra el transcript/props.

Antes de publicar, control humano obligatorio:

- [ ] Cada texto y cada cifra on-screen verificada contra el **guion real** de la pieza (no solo contra el transcript de whisper, que puede arrastrar errores).
- [ ] Nombres propios, montos, fechas, porcentajes y claims revisados una a una.
- [ ] Aprobación final de un humano de la marca antes de exportar/entregar.

Regla: si una cifra no se puede confirmar contra la fuente real, no se publica.

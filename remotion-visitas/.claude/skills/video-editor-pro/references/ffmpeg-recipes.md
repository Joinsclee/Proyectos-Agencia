# Recetas FFmpeg de finishing (Remotion-first)

Este proyecto renderiza texto, captions y motion-graphics **dentro de Remotion** (React: `useCurrentFrame`, `interpolate`, `spring`, `Sequence`, `@remotion/transitions`, `@remotion/media`, `@remotion/google-fonts`). FFmpeg NO quema texto ni subtítulos aquí: **no se usa libass**. FFmpeg queda para *finishing* y para *preparar sources* antes de meterlos a Remotion como `<Video>`/`<Img>`.

Binario: siempre el ffmpeg del sistema. Exporta la variable una vez y úsala en todas las recetas.

```bash
export FF="${FF:-ffmpeg}"
export FFPROBE="${FFPROBE:-ffprobe}"
"$FF" -hide_banner -version | head -1
```

Convención de esta hoja:
- **[SOURCE crudo]** = se ejecuta sobre footage/imagen ANTES de importarlo a Remotion.
- **[RENDER Remotion]** = se ejecuta sobre el `.mp4` que ya salió de `remotion render <Comp> out/x.mp4`.

Reglas transversales:
- Flags globales recomendados: `-hide_banner -y` (sobrescribe sin preguntar) y `-loglevel warning` para logs limpios en scripts.
- El render de Remotion ya es H.264 `yuv420p`. NO recodifiques video salvo que la receta lo exija: usa `-c:v copy` y toca solo el audio.
- Los mapas de referencia hermanos: audio en `references/audio-finishing.md`, captions en `references/captions.md`, motion en `references/motion-graphics.md`, safe zones en `references/safe-zones.md`, QA en `references/qa.md`, pipeline global en `references/pipeline.md`, reglas de craft en `references/craft-rules.md`.

Índice de recetas:

| # | Receta | Ámbito |
|---|--------|--------|
| 1 | Extraer audio 16k mono para whisper | RENDER Remotion o SOURCE |
| 2 | Loudnorm two-pass -14 LUFS / -1.5 dBTP | RENDER Remotion |
| 3 | Ducking música bajo voz (sidechain) | RENDER / mezcla |
| 4 | silencedetect (medir/cortar silencios) | SOURCE crudo |
| 5 | Reframe 9:16 crop centrado | SOURCE crudo |
| 6 | Blurred-pad 9:16 para screen-recordings | SOURCE crudo |
| 7 | Ken Burns (zoompan) sobre imagen fija | SOURCE crudo (b-roll) |
| 8 | Concat de segmentos (mismos params) | SOURCE / RENDER |
| 9 | Trim frame-accurate (-ss/-to + re-encode) | SOURCE crudo |
| 10 | Contact sheet de QA | RENDER Remotion |
| 11 | Master export final (recodificación) | RENDER Remotion |

---

## 1. Extraer audio 16k mono para whisper — [RENDER Remotion o SOURCE]

Alimenta la transcripción. Whisper espera PCM 16-bit, mono, 16 kHz. Esto es lo que consume `scripts/transcribe.sh` (whisper `-ojf` con `models/ggml-medium.bin`) y luego `scripts/build-captions.mjs`.

```bash
"$FF" -hide_banner -y -i in.mp4 \
  -vn -ac 1 -ar 16000 -c:a pcm_s16le \
  audio16k.wav
```

- `-vn` descarta video (más rápido, menos I/O).
- `-ac 1` fuerza mono; `-ar 16000` resamplea a 16 kHz; `-c:a pcm_s16le` = WAV sin comprimir.
- Da igual si `in.mp4` es el render de Remotion o un source crudo: para captions se transcribe la **voz** de la pista final.

Flujo típico hasta captions (detalle en `references/captions.md`):

```bash
"$FF" -hide_banner -y -i out/video.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le audio16k.wav
bash scripts/transcribe.sh audio16k.wav          # whisper -ojf -> transcript.json
node scripts/build-captions.mjs transcript.json  # -> [{show,hide,words:[{t,start,end}]}]
```

El formato propio de captions se consume en `src/CaptionedVideo.tsx` (resaltado por palabra). FFmpeg NO dibuja los subtítulos.

---

## 2. Loudnorm two-pass a -14 LUFS / -1.5 dBTP — [RENDER Remotion]

Se corre sobre el `.mp4` renderizado por Remotion. Two-pass da loudness consistente y evita el "loudnorm dinámico" que bombea. Objetivos: `I=-14` LUFS (estándar social), `TP=-1.5` dBTP (headroom para códecs lossy), `LRA=11`. Lo automatiza `scripts/master-audio.sh`, que además **remuxea con `-c:v copy`** para no tocar el video de Remotion.

### Pase 1 — medir (imprime JSON)

```bash
"$FF" -hide_banner -i out/video.mp4 \
  -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json \
  -f null - 2>&1 | sed -n '/{/,/}/p'
```

Del bloque JSON parsea estos campos (son los `measured_*` del pase 2):

| Campo JSON | Uso en pase 2 |
|------------|---------------|
| `input_i` | `measured_I` |
| `input_tp` | `measured_TP` |
| `input_lra` | `measured_LRA` |
| `input_thresh` | `measured_thresh` |
| `target_offset` | `offset` |

### Pase 2 — aplicar (linear=true) y remuxear sin tocar video

```bash
"$FF" -hide_banner -y -i out/video.mp4 \
  -af loudnorm=I=-14:TP=-1.5:LRA=11:\
measured_I=INPUT_I:measured_TP=INPUT_TP:measured_LRA=INPUT_LRA:\
measured_thresh=INPUT_THRESH:offset=TARGET_OFFSET:\
linear=true:print_format=summary \
  -c:v copy -c:a aac -b:a 192k -ar 48000 \
  out/video_norm.mp4
```

- Reemplaza `INPUT_I`, `INPUT_TP`, `INPUT_LRA`, `INPUT_THRESH`, `TARGET_OFFSET` con los valores del pase 1.
- `linear=true` aplica ganancia lineal (transparente) usando las mediciones; sin las `measured_*` loudnorm cae a modo dinámico.
- `-c:v copy` = el video de Remotion pasa intacto, cero recompresión, render en segundos.
- `-ar 48000` normaliza el sample rate de salida (recomendado para AAC de entrega).

Script de referencia (idea de `scripts/master-audio.sh`, parseo con `ffprobe`/`jq` no requerido — basta `sed`/`grep` o Node):

```bash
# scripts/master-audio.sh out/video.mp4 out/video_norm.mp4
IN="$1"; OUT="$2"
JSON="$("$FF" -hide_banner -i "$IN" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')"
get(){ printf '%s' "$JSON" | grep "\"$1\"" | sed 's/.*: *"\([^"]*\)".*/\1/'; }
"$FF" -hide_banner -y -i "$IN" -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" -c:v copy -c:a aac -b:a 192k -ar 48000 "$OUT"
```

Verificación posterior en `references/audio-finishing.md` (medir el master con `loudnorm ... -f null`).

---

## 3. Ducking de música bajo voz (sidechain) — [RENDER / mezcla]

Baja automáticamente la música cuando hay voz. La **voz es el sidechain-key** (la señal que dispara la compresión de la música). Útil si mezclas una pista de música con la voz fuera de Remotion; si Remotion ya mezcló ambos con `<Audio>`, este paso normalmente no hace falta.

```bash
"$FF" -hide_banner -y -i voz.wav -i musica.mp3 \
  -filter_complex "\
[1:a]volume=0.6[music]; \
[music][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked]; \
[ducked][0:a]amix=inputs=2:duration=first:dropout_transition=0[mix]" \
  -map "[mix]" -c:a aac -b:a 192k out/mix_ducked.m4a
```

- `sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300`: la música (`[music]`) es la entrada comprimida; la voz (`[0:a]`) es la key. Cuando la voz supera el umbral, la música se atenúa 8:1.
- `attack=20` ms (baja rápido al entrar la voz), `release=300` ms (sube suave al terminar, sin bombeo audible).
- `threshold=0.03` es sensibilidad lineal (~-30 dB): baja el valor para duckear con voz más suave, súbelo para duckear solo en picos.
- `volume=0.6` fija el piso de la música antes del ducking; ajusta el dial según marca (marca pausada/premium: música baja, ducking suave; marca rápida/hype: música más presente, ducking agresivo).
- El resultado `out/mix_ducked.m4a` puede pasarse por la receta 2 (loudnorm) antes de entregar.

Para muxear una pista de audio ya mezclada de vuelta al render de Remotion (reemplazando su audio):

```bash
"$FF" -hide_banner -y -i out/video.mp4 -i out/mix_ducked.m4a \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out/video_mix.mp4
```

---

## 4. silencedetect — medir/cortar silencios en un SOURCE crudo — [SOURCE crudo]

Antes de importar un talking-head crudo a Remotion, mide los silencios para planear los cortes (jump-cuts / smart-cut). Esto **no corta solo**: reporta intervalos que luego usas para trimear (receta 9) o para decidir los `Sequence`/offsets en Remotion.

```bash
"$FF" -hide_banner -i source.mp4 \
  -af silencedetect=noise=-30dB:d=0.35 \
  -f null - 2>&1 | grep -E "silence_(start|end|duration)"
```

- `noise=-30dB`: umbral; por debajo se considera silencio. Sube a `-24dB` en tomas con room-tone/ruido; baja a `-35dB` en grabaciones limpias.
- `d=0.35`: duración mínima (segundos) para contar como silencio. Más bajo = corta pausas más cortas (ritmo rápido); más alto = respeta respiraciones (ritmo pausado). Ajusta el dial según marca/pieza.

La salida da pares `silence_start` / `silence_end` (+ `silence_duration`). Con esos timestamps decides los segmentos "hablados" a conservar; el corte real se hace con la receta 9 (trim) y la receta 8 (concat), o directamente posicionando clips en Remotion. Ver `references/pipeline.md` para el smart-cut.

---

## 5. Reframe de SOURCE a 9:16 crop centrado — [SOURCE crudo]

Convierte footage horizontal a vertical 1080x1920 con crop centrado, para usarlo como `<Video>` dentro de Remotion. Crop centrado = sirve cuando el sujeto está al centro (talking-head).

```bash
"$FF" -hide_banner -y -i source.mp4 \
  -vf "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,setsar=1" \
  -c:a copy \
  reframed_916.mp4
```

- `crop=ih*9/16:ih`: recorta el ancho a `alto * 9/16` manteniendo toda la altura, centrado por defecto.
- `scale=1080:1920:flags=lanczos`: escala al canvas vertical con Lanczos (nítido).
- `setsar=1`: SAR cuadrado, evita que Remotion/players deformen el aspecto.
- Si el sujeto NO está centrado, desplaza el crop con `x`: `crop=ih*9/16:ih:(iw-ih*9/16)/2 + OFFSET:0`.

---

## 6. Blurred-pad 9:16 para screen-recordings — [SOURCE crudo]

Para screen-recordings o footage donde el crop cortaría contenido: el frame completo va centrado y nítido, y el fondo 9:16 se rellena con una versión del mismo frame ampliada y desenfocada. Prepara el source antes de Remotion.

```bash
"$FF" -hide_banner -y -i screen.mp4 \
  -filter_complex "\
[0:v]split=2[bg][fg]; \
[bg]scale=1080:1920:force_original_aspect_ratio=increase,\
crop=1080:1920,gblur=sigma=28[bgblur]; \
[fg]scale=1080:-1:flags=lanczos[fgs]; \
[bgblur][fgs]overlay=(W-w)/2:(H-h)/2:format=auto,setsar=1[v]" \
  -map "[v]" -map 0:a? -c:a copy \
  screen_916.mp4
```

- `split=2` duplica el stream en fondo (`bg`) y primer plano (`fg`).
- El fondo se escala a cubrir 1080x1920, se recorta a esa caja y se desenfoca con `gblur=sigma=28` (sube sigma para más blur).
- El primer plano se escala a 1080 de ancho (alto automático) y se centra con `overlay=(W-w)/2:(H-h)/2`.
- Resultado: contenido completo legible + relleno de marco elegante, sin barras negras.

---

## 7. Ken Burns (zoompan) sobre imagen fija — [SOURCE crudo / b-roll]

Anima b-roll estático (una imagen) con zoom/pan lento y lo entrega como clip para importar a Remotion. Se pre-escala 1.5x antes del `zoompan` para que el paneo no muestre bordes ni pixelado. `d=150` = 150 frames = 5 s a 30 fps.

```bash
"$FF" -hide_banner -y -loop 1 -i still.jpg \
  -vf "scale=1620:2880:flags=lanczos,\
zoompan=z='min(zoom+0.0015,1.5)':d=150:\
x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,\
setsar=1" \
  -t 5 -r 30 -pix_fmt yuv420p \
  kenburns_916.mp4
```

- Pre-escala a 1620x2880 (1.5x del target 1080x1920) para dar espacio de paneo/zoom.
- `zoompan z='min(zoom+0.0015,1.5)'`: zoom-in progresivo hasta 1.5x. Para zoom-out, invierte con `z='if(eq(on,0),1.5,max(zoom-0.0015,1.0))'`.
- `d=150` frames por imagen; `s=1080x1920` tamaño de salida del zoompan; `fps=30` interno; `-t 5 -r 30` fija duración/framerate del clip.
- `x`/`y` centran el foco; muévelos para panear hacia una esquina.
- Nota: si prefieres el Ken Burns *dentro* de Remotion, hazlo con `interpolate`/`spring` sobre un `<Img>` (ver `references/motion-graphics.md`); esta receta es para cuando quieres el b-roll ya "quemado" como clip.

---

## 8. Concat de segmentos (mismos params) — [SOURCE / RENDER]

Une varios clips que comparten **mismos** códec, resolución, fps y sample rate (p.ej. segmentos hablados tras cortar silencios, o partes de un render). Usa el concat *demuxer* (sin recodificar).

```bash
# lista.txt (rutas relativas al propio archivo, con quoting seguro)
cat > lista.txt <<'EOF'
file 'seg01.mp4'
file 'seg02.mp4'
file 'seg03.mp4'
EOF

"$FF" -hide_banner -y -f concat -safe 0 -i lista.txt \
  -c copy \
  joined.mp4
```

- `-c copy`: sin recompresión, instantáneo. **Requiere params idénticos**; si difieren, normaliza antes con la receta 5/11 o cae al `concat` filter (recodifica).
- `-safe 0` permite rutas arbitrarias en `lista.txt`.
- Fallback recodificando (params distintos):

```bash
"$FF" -hide_banner -y -i seg01.mp4 -i seg02.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k joined.mp4
```

---

## 9. Trim frame-accurate (-ss/-to antes de -i + re-encode) — [SOURCE crudo]

Corta un segmento exacto de un source. Para precisión de frame, pon `-ss`/`-to` **antes de `-i`** para seek rápido y **re-encodea** (el copy sin recodificar corta en keyframes y desalinea). Usa formato `HH:MM:SS.mmm`.

```bash
"$FF" -hide_banner -y -ss 00:00:12.400 -to 00:00:19.800 -i source.mp4 \
  -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k \
  clip_trim.mp4
```

- `-ss` inicio, `-to` fin (absoluto). Para duración relativa usa `-t <segundos>` en vez de `-to`.
- Re-encode = corte exacto al frame pedido (clave para armar smart-cuts con la receta 4).
- Mantén `-r 30` y `-pix_fmt yuv420p` para que luego el concat (receta 8) empate params.
- Si NO necesitas precisión (corte en keyframe basta) y quieres velocidad: `-c copy` (pero puede empezar/terminar unos frames corrido).

---

## 10. Contact sheet para QA — [RENDER Remotion]

Genera un mosaico de miniaturas del render para revisar de un vistazo timing, safe zones, legibilidad de captions y branding. Ver criterios en `references/qa.md` y `references/safe-zones.md`.

```bash
"$FF" -hide_banner -y -i out/video.mp4 \
  -vf "fps=1,scale=320:-1,tile=4x3" \
  -frames:v 1 \
  contact.png
```

- `fps=1`: un frame por segundo.
- `scale=320:-1`: miniatura de 320 px de ancho, alto proporcional.
- `tile=4x3`: rejilla de 12 miniaturas en una imagen; `-frames:v 1` fuerza una sola hoja (los primeros 12 s).
- Para cubrir un video más largo, baja el muestreo (`fps=1/2` = uno cada 2 s) o sube la rejilla (`tile=5x6`).

---

## 11. Master export final (recodificación) — [RENDER Remotion]

Solo si necesitas **post-procesar/recodificar** el render (p.ej. tras aplicar audio de la receta 2/3, o para normalizar un entregable). Remotion ya exporta H.264; no recodifiques por costumbre.

```bash
"$FF" -hide_banner -y -i out/video.mp4 \
  -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  out/master.mp4
```

- `-crf 18`: calidad visualmente sin pérdida para social; sube a 20-23 para achicar archivo.
- `-pix_fmt yuv420p`: compatibilidad universal (reproductores/redes).
- `-r 30`: fija 30 fps de entrega (empata el fps de composición de Remotion; ajusta si el proyecto es a 24/60).
- `-c:a aac -b:a 192k`: audio de entrega estándar.
- `-movflags +faststart`: mueve el `moov atom` al frente para streaming/reproducción progresiva inmediata.
- Si solo cambiaste audio, **prefiere** `-c:v copy` (recetas 2/3) en vez de este master: evita una recompresión de video innecesaria.

---

### Notas de cierre

- Nunca uses libass/`subtitles=`/`drawtext` para el texto final: eso lo hace Remotion (`src/CaptionedVideo.tsx`, data-builders `scripts/build-*-data.mjs`). FFmpeg aquí es *pre-proceso de sources* y *finishing de audio/QA/entrega*.
- Orden típico de un pase completo: preparar sources (4,5,6,7,9) → `remotion render <Comp> out/x.mp4` → audio (1→captions, 2 loudnorm, 3 ducking si aplica) → QA (10) → master opcional (11).
- Cruces: audio en `references/audio-finishing.md`; captions en `references/captions.md`; motion en `references/motion-graphics.md`; safe zones en `references/safe-zones.md`; QA en `references/qa.md`; pipeline en `references/pipeline.md`; craft en `references/craft-rules.md`.

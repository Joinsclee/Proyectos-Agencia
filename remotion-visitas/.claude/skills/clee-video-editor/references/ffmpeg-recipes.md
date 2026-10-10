# Recetas FFmpeg / Whisper (verificadas en macOS Apple Silicon)

Todas probadas in situ salvo las marcadas `[NO EJECUTADO]`. Carga las variables con `source scripts/env.sh`.

## La regla de los DOS binarios

Este entorno tiene dos FFmpeg y **hay que usar el correcto**:

- **`FF`** = FFmpeg del sistema (Homebrew, v8+). Rápido. Hace TODO **menos** texto: corte, loudnorm, scale, crop, concat, overlay, ducking, `lut3d`, zoompan, `silencedetect`. **NO tiene libass/libfreetype** → falla en `subtitles`/`ass`/`drawtext`.
- **`FFSUB`** = FFmpeg con libass (p.ej. `ffmpeg-static` de npm, v6). **SOLO** para quemar subtítulos ASS/SRT y `drawtext`. Su `atempo` histórico llega a 100x igual que FF, pero haz los speed-ramps con `FF`.

> Por eso, en la arquitectura CLEE, **el texto se renderiza por Hyperframes/Remotion (Chrome) o por FFSUB**, nunca por el FFmpeg del sistema. Preflight aborta si `FFSUB` no trae libass.

---

## Transcripción (whisper-cli)

**1 · Extraer audio 16 kHz mono PCM**
```bash
"$FF" -y -i "$IN" -vn -ac 1 -ar 16000 -c:a pcm_s16le audio16k.wav
```

**2 · Word-level en español (json+srt+vtt)**
```bash
"$WC" -m "$WMODEL" -f audio16k.wav -l es -ml 1 -sow -oj -osrt -ovtt -of transcript_words -np
# -ml 1 = 1 palabra/segmento · -sow = corta en palabra (no en token) · -np = sin logs
# DESCARTA en el parser los segmentos con text vacío (el 1º suele venir vacío).
```

**3 · Con VAD silero (audio con pausas/ruido — talking-head pausado)**
```bash
"$WC" -m "$WMODEL" -f audio16k.wav -l es --vad -vm "$WVAD" -vt 0.5 -vsd 100 -vspd 250 -vp 30 \
  -ml 1 -sow -oj -osrt -of transcript_vad -np
# Sin -vm, el flag --vad ABORTA. -vt umbral voz · -vsd min silencio ms · -vp padding ms
```

**4 · JSON con confianza por token** (para marcar/filtrar dudosas)
```bash
"$WC" -m "$WMODEL" -f audio16k.wav -l es -ojf -of transcript_full -np   # incluye 'tokens' con prob p
```

**5 · Descargar el modelo VAD silero (una vez, ~885 KB)**
```bash
curl -L -o "$WVAD" https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
```

---

## Corte

**6 · Detección de silencios → lista de cortes**
```bash
"$FF" -hide_banner -i "$IN" -af silencedetect=noise=-30dB:d=0.35 -f null - 2>silences.txt
grep -E 'silence_(start|end)' silences.txt
# El pipeline INVIERTE los [start,end] de silencio para obtener los tramos a CONSERVAR.
# Sube noise a -35dB si el fondo es muy limpio; baja d a 0.25 para cortes más agresivos.
```

**7 · Cortar silencios y reconcatenar frame-accurate (filter concat)**
```bash
# N tramos a conservar generados dinámicamente por el EDL. Ejemplo con 2 (0-2.5s y 3.0-5.2s):
"$FF" -y -i "$IN" -filter_complex \
"[0:v]trim=0:2.5,setpts=PTS-STARTPTS[v0];[0:a]atrim=0:2.5,asetpts=PTS-STARTPTS[a0];\
 [0:v]trim=3.0:5.2,setpts=PTS-STARTPTS[v1];[0:a]atrim=3.0:5.2,asetpts=PTS-STARTPTS[a1];\
 [v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" \
-map "[v]" -map "[a]" -c:v libx264 -pix_fmt yuv420p -c:a aac desilenced.mp4
```

**7b · Alternativa: auto-editor** `[NO EJECUTADO — no instalado]`
```bash
pip3 install auto-editor
auto-editor "$IN" --edit audio:threshold=4% --margin 0.2sec --export resolve -o cortado.mp4
```

**8 · Detección de escenas (medir cortes/min para QA)**
```bash
"$FF" -hide_banner -i "$IN" -vf "select='gt(scene,0.3)',metadata=print:file=scenes.txt" -an -f null -
grep -E 'pts_time|scene_score' scenes.txt     # umbral 0.3-0.4 típico
```

---

## Captions (SOLO con FFSUB)

**9 · Quemar SRT con estilo look-CLEE (amarillo/negro)**
```bash
"$FFSUB" -y -i "$IN916" -vf \
"subtitles=transcript_words.srt:force_style='Fontname=Arial,Fontsize=16,PrimaryColour=&H00FFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=3,Shadow=1,MarginV=360,Alignment=2,Bold=1'" \
-c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy out_srt.mp4
# Colores ASS = &HBBGGRR& :  amarillo &H00FFFF& · blanco &H00FFFFFF& · rojo &H000000FF& · verde &H0000FF00&
# Alignment (numpad): 2=abajo-centro 5=centro 8=arriba · MarginV sube el bloque (usa >=330 para safe-zone 9:16)
```

**10 · ASS con palabra resaltada (highlight inline)** — lo genera `scripts/words-to-ass.mjs`
```bash
"$FFSUB" -y -i "$IN916" -vf "ass=captions.ass" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy out_ass.mp4
```

**11 · ASS karaoke word-by-word (`\k`, fill progresivo)** — también de `words-to-ass.mjs --mode karaoke`
```bash
"$FFSUB" -y -i "$IN916" -vf "ass=karaoke.ass" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy out_kara.mp4
# SecondaryColour del estilo = color "aún no cantado"; PrimaryColour = ya resaltado.
```

---

## Formato / reframe

**12 · Crop centrado a 9:16 y a 1:1**
```bash
"$FF" -y -i "$IN" -vf "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,setsar=1" -c:a copy out_916.mp4
"$FF" -y -i "$IN" -vf "crop=ih:ih,scale=1080:1080:flags=lanczos,setsar=1"     -c:a copy out_1x1.mp4
```

**13 · Blurred-background pad a 9:16 (no pierde contenido — screen-rec/mockups)**
```bash
"$FF" -y -i "$IN" -filter_complex \
"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=25[bg];\
 [0:v]scale=1080:-1:force_original_aspect_ratio=decrease[fg];\
 [bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1[v]" \
-map "[v]" -map 0:a -c:a copy out_blurpad.mp4    # sigma 25→40 para más difuminado
```

---

## Audio

**14 · Loudness a −14 LUFS (loudnorm TWO-PASS)** — lo hace `scripts/loudnorm-2pass.sh`
```bash
# PASE 1 (medir): parsear input_i/input_tp/input_lra/input_thresh del JSON
"$FF" -hide_banner -i "$IN" -af "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>ln.json
# PASE 2 (aplicar, lineal):
"$FF" -y -i "$IN" -af \
"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MTHRESH:linear=true" \
-ar 48000 -c:v copy out_loud.mp4     # -14 LUFS/-1.5 dBTP = estándar IG/TikTok/YouTube
```

**22 · Ducking de música bajo la voz (sidechaincompress)**
```bash
"$FF" -y -i music.m4a -i voz.wav -filter_complex \
"[0:a]aformat=sample_rates=48000:channel_layouts=stereo[m];\
 [1:a]aformat=sample_rates=48000:channel_layouts=stereo[voc];[voc]asplit=2[vk][vout];\
 [m][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[duck];\
 [duck][vout]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]" mixed.m4a
# La voz (vk) es el sidechain-key que baja la música. Aplica loudnorm DESPUÉS.
```

---

## Movimiento / composición

**15 · Ken Burns (zoompan) sobre imagen/b-roll fijo**
```bash
"$FF" -y -loop 1 -i still.png -vf \
"scale=1620:2880,zoompan=z='min(zoom+0.0015,1.5)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,trim=duration=5,setsar=1" \
-c:v libx264 -pix_fmt yuv420p out_kenburns.mp4
# PRE-ESCALA 1.5x antes de zoompan o TIEMBLA. d=150 = 5s @30fps.
```

**16 · Speed ramp (usar FF)**
```bash
"$FF" -y -i "$IN" -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" -map "[v]" -map "[a]" fast2x.mp4
"$FF" -y -i "$IN" -filter_complex "[0:v]setpts=2.0*PTS[v];[0:a]atempo=0.5[a]" -map "[v]" -map "[a]" slow.mp4
# <0.5x: encadena atempo=0.5,atempo=0.5 (=0.25x)
```

**17 · Concat sin recodificar (mismos codec/res/fps)**
```bash
printf "file '%s'\nfile '%s'\n" "$PWD/segA.mp4" "$PWD/segB.mp4" > concat.txt
"$FF" -y -f concat -safe 0 -i concat.txt -c copy out_concat.mp4
```

**18 · Trim frame-accurate**
```bash
"$FF" -y -ss 1.0 -to 3.5 -i "$IN" -c:v libx264 -pix_fmt yuv420p -c:a aac out_trim.mp4   # re-encode = exacto al frame
```

**19 · Logo + PiP circular (webcam sobre screen-recording)**
```bash
# Logo arriba-derecha:
"$FF" -y -i "$IN916" -i logo.png -filter_complex "[0:v][1:v]overlay=W-w-24:24" -c:a copy out_logo.mp4
# PiP circular abajo-derecha:
"$FF" -y -i "$BG" -i "$CAM" -filter_complex \
"[1:v]scale=400:400,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-(W/2),Y-(H/2)),W/2),255,0)'[pip];\
 [0:v][pip]overlay=W-w-40:H-h-160[v]" -map "[v]" -map 0:a -c:a copy out_pip.mp4
```

**20 · Fade in/out video+audio**
```bash
"$FF" -y -i "$IN" \
 -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=$(echo "$DUR-0.5"|bc):d=0.5" \
 -af "afade=t=in:st=0:d=0.5,afade=t=out:st=$(echo "$DUR-0.5"|bc):d=0.5" out_fade.mp4
# Transiciones entre clips: xfade / acrossfade (también presentes en FF).
```

---

## Color / QA / master

**Color · aplicar LUT** (`lut3d` está en FF)
```bash
"$FF" -y -i "$IN" -vf "lut3d=looks/<cliente>.cube" -c:a copy graded.mp4   # ANTES de quemar texto
```

**21 · Contact sheet + frame único (auto-QA visual con visión)**
```bash
"$FF" -y -i "$IN" -vf "fps=1,scale=320:-1,tile=4x3" -frames:v 1 contact.png
"$FF" -y -ss "$T" -i "$IN" -frames:v 1 frame_$T.png
```

**23 · Ensamble en UNA pasada: crop 9:16 + LUT + quemar subtítulos (FFSUB)**
```bash
"$FFSUB" -y -i "$IN" -vf \
"crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,lut3d=looks/<cliente>.cube,\
subtitles=transcript_words.srt:force_style='Fontname=Arial,Fontsize=16,PrimaryColour=&H00FFFF&,OutlineColour=&H000000&,Outline=3,Shadow=1,MarginV=360,Alignment=2,Bold=1',\
setsar=1" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k final.mp4
```

**24 · Master export final para redes (H.264, 9:16, faststart)**
```bash
"$FF" -y -i "$IN" -c:v libx264 -profile:v high -level 4.2 -crf 18 -preset slow -pix_fmt yuv420p \
 -r 30 -g 60 -c:a aac -b:a 192k -ar 48000 -movflags +faststart entrega.mp4
# Asegura -14 LUFS ya aplicado antes (receta 14).
```

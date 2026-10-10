# Pipeline crudo → publicable (Remotion)

Léelo antes de producir. Comandos verificados en macOS. `$FF`/`$WC` los define `scripts/env.sh` (ffmpeg y whisper-cli del sistema). Trabaja en una carpeta de sesión o usa `out/` para renders y `src/` para composiciones.

```bash
source .claude/skills/video-editor-pro/scripts/env.sh
```

## 0 · Definir la pieza

Formato (9:16 default), **diales** de la marca (ritmo, modo de captions, densidad SFX, BPM), y el **guion/hook**. Sin idea+estructura ganadora, ninguna edición salva el video (regla craft).

## 1 · Source: normalizar + audio 16k

Si el source viene con fps/rotación variables, normalízalo antes de usarlo como `<Video>` en Remotion. Extrae audio para whisper:

```bash
"$FF" -y -i source.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le out/source-16k.wav
```

(`scripts/transcribe.sh` lo hace y transcribe en un paso.)

## 2 · Transcribir word-level → captions del repo

```bash
bash .claude/skills/video-editor-pro/scripts/transcribe.sh source.mp4 mipieza   # whisper -ojf ES
node scripts/build-captions.mjs mipieza-whisper.json src/mipieza-captions.json 5 <durSeg>
```

**Modelo multilingüe (`models/ggml-medium.bin`), `-l es`, NUNCA `.en`.** `durSeg` = duración real del video. Detalle de captions: `references/captions.md`.

## 3 · Corte semántico (no destructivo en Remotion)

Lee el transcript: quita silencios/muletillas y **mueve el hook (la primera frase de valor) a t=0** (regla 80/20). En Remotion se materializa sin cortar el archivo:

- `<Video trimBefore={f0} trimAfter={f1} />` (frames) por segmento, y varias `<Sequence>` para reordenar.
- Para medir silencios en el source: `"$FF" -i out/source-16k.wav -af silencedetect=noise=-30dB:d=0.35 -f null -`.

## 4 · Componer en Remotion

Escena de fondo (`<Video>` de `@remotion/media`) + `<CaptionedVideo>` o rail de captions + motion graphics + b-roll + transiciones (`@remotion/transitions`). Usa `calculateMetadata` para dimensionar la comp al source/voiceover. Regístrala en `src/Root.tsx`.

## 5 · Captions

`references/captions.md`: palabra activa, colores por marca, lead −150ms, safe zones. Reutiliza `CaptionedVideo` parametrizando colores.

## 6 · Motion graphics de datos

`references/motion-graphics.md`: cada cifra hablada → chart con `interpolate`/`spring` (contador que sube y aterriza). Datos vía data-builder JSON (patrón `scripts/build-*-data.mjs`).

## 7 · B-roll

Entra EN la palabra clave (L-cut, la voz no se corta). Prepara el source (reframe 9:16, Ken Burns de stills) con ffmpeg antes de meterlo como `<Video>`/`<Img>` (`references/ffmpeg-recipes.md`).

## 8 · Audio

Música con ducking bajo la voz (en Remotion bajando el volumen con `interpolate`, o en ffmpeg). Ver `references/audio-finishing.md`. El master de loudness va en el paso 10 (sobre el render).

## 9 · Render

```bash
npx remotion render <CompId> out/mipieza.mp4                 # una pieza
npx remotion render <CompId> out/mipieza.mp4 --props='{...}' # variante/batch
npm run lint                                                 # eslint src (antes de render)
```

Añade un script a `package.json` (`render:mipieza`) como el resto. Preview interactivo: `npm start` (remotion studio).

## 10 · Masterizar audio + QA + control humano

```bash
bash .claude/skills/video-editor-pro/scripts/master-audio.sh out/mipieza.mp4 -14 out/mipieza-final.mp4
bash .claude/skills/video-editor-pro/scripts/qa-contactsheet.sh out/mipieza-final.mp4 out/qa.png
```

`master-audio.sh` masteriza a −14 LUFS y remuxea sin recodificar el video. QA: revisa el contact-sheet con visión (captions en safe-zone, sync, cifras == transcript), cortes/min vs el dial, LUFS ≈ −14 (`references/qa.md`). **Un humano aprueba** antes de publicar; ajustes en lenguaje natural → editar la comp y re-render.

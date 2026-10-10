# Pipeline crudo → publicable (14 pasos)

Léelo entero antes de producir. Las variables (`FF`, `FFSUB`, `WC`, `WMODEL`…) las define `scripts/env.sh`; cárgalas con `source scripts/env.sh`. Todos los comandos FFmpeg/Whisper de aquí están **verificados en macOS (Apple Silicon)**. Trabaja siempre dentro de una carpeta de sesión: `sessions/<cliente>_<fecha>/`.

```bash
source ~/.claude/skills/clee-video-editor/scripts/env.sh
cd sessions/savias_2026-07-04/
```

---

## 0 · Preflight + cargar perfil

```bash
bash ~/.claude/skills/clee-video-editor/scripts/preflight.sh || exit 1
```

Carga `profiles/<cliente>.yaml` a memoria (define ritmo, captions, audio, VAD). **Si el cliente no tiene brand kit documentado → detente y delega a `brand-kit-builder-clee`** antes de seguir. Pide a `color-grading-clee` el `.cube` del look del cliente si aún no existe.

## 1 · Ingesta + normalización

Resuelve fps/rotación/HDR variables del crudo. Clasifica el tipo (talking-head / screen-recording / clip de cliente) — determina el reframe y el motor.

```bash
bash scripts/normalize.sh "$IN" norm.mp4     # -> h264 yuv420p 30fps 48k estéreo
```

## 2 · Extraer audio 16 kHz mono (para whisper)

```bash
"$FF" -y -i norm.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le audio16k.wav
```

## 3 · Transcribir word-level en español

```bash
bash scripts/transcribe.sh audio16k.wav transcript   # usa -ml 1 -sow -l es (VAD si el perfil lo pide)
# genera transcript.json / .srt / .vtt con from/to por palabra
```

Regla dura: **modelo multilingüe y `--language es`, NUNCA un modelo `.en`** (traduce a inglés y destruye el español). Detalle: `references/transcription.md`.

## 4 · Corte semántico → EDL

Este paso lo razona el agente (Claude), no un script rígido. Ver `references/semantic-cut.md`.

1. Detectar silencios: `"$FF" -i audio16k.wav -af silencedetect=noise=-30dB:d=0.35 -f null - 2>silences.txt`
2. Leer `transcript.json` + `silences.txt` y construir un **EDL** (lista de segmentos a conservar) que:
   - quita silencios >0,3-0,5s y muletillas ES ("eh", "um", "este", "o sea", "¿no?", "tipo"),
   - **mueve la primera frase de valor a t=0** (el hook — regla 80/20),
   - **preserva los "holds"** (pausas dramáticas antes de una afirmación grande),
   - genera J/L-cuts por desfase de 150-300ms entre audio y video.
3. Materializar el corte: `filter_complex` concat (receta 7 de `ffmpeg-recipes.md`) para la ruta FFmpeg, o pares `trimBefore/trimAfter` en `<Video>` si la composición es en Remotion (no destructivo).

## 5 · Reframe a la plataforma

```bash
bash scripts/reframe.sh cut.mp4 916 out916.mp4        # talking-head/b-roll: crop centrado
bash scripts/reframe.sh cut.mp4 916-pad out916.mp4    # screen-rec/mockups: blurred-pad (no corta UI)
```

Formatos: `916` (1080×1920, primario), `11` (1080×1080), `169` (passthrough). Siempre `setsar=1`. Detalle de safe zones: `references/safe-zones.md`.

## 6 · Color grade (aplicar el LUT del cliente)

```bash
"$FF" -y -i out916.mp4 -vf "lut3d=looks/<cliente>.cube" -c:a copy graded.mp4
```

**Antes** de quemar cualquier texto (`references/color.md`). El `.cube` lo crea `color-grading-clee`; aquí solo se aplica (`lut3d` está disponible en el FFmpeg del sistema).

## 7 · Decidir el motor de composición

`references/engine-decision.md`. **Un solo motor por pieza.** A partir de aquí el flujo se bifurca:
- **FFSUB** (quemado ASS barato) → pasos 8-12 con FFmpeg.
- **Hyperframes** (montaje/overlays) → autoría HTML + `npx hyperframes render`.
- **Remotion** (charts / batch) → autoría `.tsx` + `npx remotion render`.

## 8 · Captions kinéticos

`references/captions.md`. Según `profile.captions.ruta`:

- **FFSUB (ASS con palabra activa):**
  ```bash
  node scripts/words-to-ass.mjs transcript.json captions.ass \
    --mode karaoke --lead 150 --max-words 5 \
    --text FFFFFF --active <acento> --outline 3 --marginv 360
  "$FFSUB" -y -i graded.mp4 -vf "ass=captions.ass" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy capped.mp4
  ```
- **Remotion:** `node scripts/words-to-captions.mjs transcript.json src/captions.json` → `createTikTokStyleCaptions({ combineTokensWithinMilliseconds: profile.switch_ms })` en `CaptionPage.tsx`.
- **Hyperframes:** `embedded-captions` (rail de subtítulo + hero word detrás del sujeto vía matte).

## 9 · Motion graphics de datos

`references/motion-graphics.md`. Detecta cifras habladas en el transcript (`80%`, "ochenta por ciento", "de 200 a 80k", "creció 3 veces") → cada una dispara una plantilla de chart. **Remotion** para charts frame-exactos (contador que sube y aterriza, hold 2-3s) o **Hyperframes** para cards/lower-thirds/split-screen/mockups de prueba social. Zoom punch-ins + transiciones sincronizadas a la keyword. Cifras estáticas de marca → pedir PNG a `brand-graphics-clee`.

## 10 · B-roll + recursos

- **B-roll entra EN la palabra clave** con timestamp del transcript (L-cut, la voz no se corta). Prompts de b-roll IA → `b-roll-prompter-clee` (genera el prompt cinematográfico de marca; el clip se genera con Veo/Kling/Luma/`imagegen`).
- **SFX por evento** (whoosh/pop/riser/ding) desde librería etiquetada o ElevenLabs SFX; mapa evento→SFX en `references/audio.md`.
- **Música** por `profile.music_bpm`/`music_energy`.

## 11 · Mezcla de audio

`references/audio.md`. Orden fijo: ducking primero, loudnorm al final.

```bash
bash scripts/ducking.sh music.m4a voz.wav mixed.m4a          # sidechaincompress
bash scripts/loudnorm-2pass.sh mixed.m4a -14 mastered.m4a    # two-pass -> -14 LUFS / -1.5 dBTP
```

## 12 · Master render

- **Ruta FFmpeg (una pasada, crop+lut+ass):** receta 23 de `ffmpeg-recipes.md`, luego export final receta 24 (`-crf 18 -movflags +faststart`).
- **Ruta Remotion:** `npx remotion render <Comp> out.mp4 --props=./props.json` (o `renderMedia()` para batch/dataset). Fija la misma versión en todos los `@remotion/*`.
- **Ruta Hyperframes:** `npx hyperframes render --fps 30 --quality high --output final.mp4`. Overlays alpha entre motores → export `--format webm` y compón con `overlay` de FFmpeg.

## 13 · Auto-QA

```bash
bash scripts/qa-contactsheet.sh final.mp4 qa.png    # contact-sheet para revisión de visión
"$FF" -i final.mp4 -af "loudnorm=I=-14:print_format=json" -f null - 2>lufs.json   # verificar LUFS
```

Revisa el contact-sheet con visión (captions dentro de safe-zone, sin frames negros, sync caption↔audio), cuenta cortes/min vs `profile.cut_rate`, y confirma LUFS ≈ −14. Rúbrica completa: `references/qa.md`. Si es Hyperframes, `npx hyperframes lint` + `inspect` son bloqueantes antes del render.

## 14 · Entrega + control humano

MP4 final 9:16 h264 `+faststart`. Registra el output y los props/comandos usados (reproducibilidad y batch). **Un humano aprueba** contra el brand kit. Ajustes en lenguaje natural ("la animación del 0:45 es muy grande, hazla 30% más chica y muévela a la esquina inferior derecha") → editar y re-renderizar. Solo se sube a la carpeta de entrega tras aprobación.

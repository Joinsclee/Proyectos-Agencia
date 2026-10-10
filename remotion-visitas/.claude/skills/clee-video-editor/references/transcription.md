# Transcripción — whisper-cli word-level en español

La transcripción con **timestamps por palabra** es la columna vertebral del pipeline: alimenta el corte semántico (paso 4), los captions kinéticos (paso 8) y la detección de cifras para motion graphics (paso 9). Fuente única: **`whisper-cli` (whisper.cpp) local** — verificado, corre en GPU Metal, sin límite de tamaño ni costo.

## Regla dura: NUNCA un modelo `.en`

Los modelos `base.en`, `small.en`, `medium.en` son **solo inglés y TRADUCEN el español a inglés**, destruyendo el idioma. Para contenido hispano de CLEE:
- Usa siempre un modelo **multilingüe**: `ggml-medium` (calidad, recomendado) o `ggml-small` (drafts rápidos). `large-v3` si hay música/ruido.
- Pasa siempre **`-l es`**.
- Si delegas a `hyperframes transcribe`, su default es `small.en` → **sobrescribe** con `--model small --language es`.

## Comando canónico (paso 3)

```bash
"$WC" -m "$WMODEL" -f audio16k.wav -l es -ml 1 -sow -oj -osrt -ovtt -of transcript -np
```

- `-ml 1` — segmento máximo 1 → fuerza **una palabra por segmento**.
- `-sow` — split-on-word: corta en límite de palabra, no en subtoken (evita "adapt"/"an").
- `-oj -osrt -ovtt` — salida JSON (con `offsets` from/to en ms) + SRT + VTT.
- `-np` — sin logs.
- **El primer segmento suele venir con `text` vacío → descártalo en el parser.**

`scripts/transcribe.sh` envuelve esto y añade `--vad` si el perfil del cliente lo pide.

## VAD (Voice Activity Detection) — para talking-head pausado

Marcas premium/pausadas (SAVIAS) tienen silencios y respiraciones. El VAD silero mejora los límites de palabra y evita alucinaciones en silencio:

```bash
"$WC" -m "$WMODEL" -f audio16k.wav -l es --vad -vm "$WVAD" -vt 0.5 -vsd 100 -vspd 250 -vp 30 \
  -ml 1 -sow -oj -of transcript_vad -np
```

**Sin `-vm <modelo>` el flag `--vad` aborta.** Descarga el modelo una vez (receta 5 de `ffmpeg-recipes.md`) a `models/ggml-silero-v5.1.2.bin`. Activa VAD con `profile.transcripcion.vad: true`.

## Forma del JSON

```json
{ "transcription": [
  { "text": " Hola", "offsets": { "from": 0, "to": 570 } },
  { "text": " esto", "offsets": { "from": 570, "to": 800 } }
] }
```

`from`/`to` en **milisegundos**. Los scripts `words-to-ass.mjs` y `words-to-captions.mjs` consumen exactamente esta forma.

## Confianza por token (opcional)

`-ojf` incluye `tokens` con probabilidad `p` por token. Útil para marcar palabras dudosas antes del control de calidad humano, o para suprimir muletillas de baja confianza.

## Video largo + fallback OpenAI (chunking)

Para `whisper-cli` local no hay límite de tamaño. Si por algún motivo se usa la API de OpenAI (`whisper-1`, `response_format: verbose_json`, `timestamp_granularities: ['word']`), el límite es **25 MB por archivo** → hay que **chunkear** el audio en segmentos (p.ej. 10 min) y desplazar los timestamps del segmento N por su offset acumulado. Por defecto: usa siempre la ruta local.

## Puente a Remotion

Remotion tiene su propio `installWhisperCpp`/`transcribe()`, pero **no** reutiliza el binario local. Para no duplicar builds: genera el `.srt` con `whisper-cli` (comando canónico) y consúmelo en Remotion con `parseSrt({ input })` de `@remotion/captions` → devuelve `Caption[]`. O usa `scripts/words-to-captions.mjs` (convierte el JSON word-level a `Caption[]` directamente).

## Léxico de muletillas ES (para el corte semántico)

Marcar para posible eliminación (según ritmo del perfil): `eh`, `em`, `um`, `este`, `pues`, `o sea`, `¿no?`, `¿vale?`, `tipo`, `digamos`, `entonces` (cuando es relleno), repeticiones inmediatas de la misma palabra, y falsos arranques. En marcas muy pausadas (SAVIAS) conserva algunas pausas naturales; en marcas rápidas (Ovejas) elimina agresivo.

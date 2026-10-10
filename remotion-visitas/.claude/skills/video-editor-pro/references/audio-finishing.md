# Audio Finishing (Remotion + FFmpeg)

Remotion renderiza el audio de la comp (mezcla de `<Audio>`, voz, música, SFX) al mp4, pero **NO masteriza loudness**: no aplica normalización a un target de plataforma ni limita picos. Por eso, sobre el mp4 renderizado se corre **un pase final de FFmpeg** (`$FF` del sistema, sin libass) que hace loudnorm y remuxea. Este archivo cubre la jerarquía de niveles, el arco emocional de música, el mapa evento→SFX, cómo montar audio en Remotion y dónde vive el masterizado.

Cruces: mezcla y ducking en `references/motion-graphics.md` (sync visual) y `references/captions.md` (voz), recetas de FFmpeg en `references/ffmpeg-recipes.md`, checklist final en `references/qa.md`, orden global en `references/pipeline.md`, y la regla 14 de niveles en `references/craft-rules.md`.

---

## 1. Por qué se masteriza DESPUÉS del render

Las redes (Reels, TikTok, Shorts, YouTube) **normalizan el playback a ~-14 LUFS**. Consecuencias de publicar sin masterizar:

- Video demasiado bajo → el algoritmo lo sube y sube también el ruido de fondo; suena amateur.
- Video demasiado caliente (picos por encima de 0 dBTP) → clipping/distorsión al recodificar en la plataforma.
- Diferencia de volumen entre tu pieza y la siguiente del feed → el usuario percibe "algo raro" y hace scroll.

Remotion mezcla y suma pistas, pero el nivel integrado resultante es impredecible (depende de cuánta voz/música/SFX haya). El masterizado es un **pase determinista al final del pipeline**, sobre el mp4 ya renderizado, NUNCA dentro de la comp.

```
[comp Remotion: voz + música + SFX]
        │  remotion render <Comp> out/x.mp4
        ▼
   out/x.mp4  (audio SIN masterizar)
        │  scripts/master-audio.sh  (loudnorm 2-pass, $FF)
        ▼
   out/x_master.mp4  (audio a -14 LUFS, video intacto)
```

---

## 2. Jerarquía de niveles (regla craft 14)

Regla mental: **la voz manda, la música es cama, los SFX puntúan**. Targets orientativos (dial según marca/pieza):

| Elemento | Nivel objetivo | Notas |
|----------|----------------|-------|
| **Voz (protagonista)** | picos entre **-6 y -12 dB** | siempre la más alta; inteligibilidad primero |
| **Master integrado** | **-14 LUFS** | target de plataforma |
| **True Peak** | **-1.5 dBTP** | headroom para el recodificado de la red |
| **Música (cama)** | **-24 dB o menos** bajo la voz | con **ducking 3-5 dB** cuando entra voz |
| **SFX ambiente** | **~-20 dB** | texturas, room tone, fondos |
| **SFX hit / acento** | hasta **-10 dB** | whooshes, booms, dings puntuales |

**Silencio dramático**: dejar **0.3-0.5 s de silencio** (o casi) justo antes de una afirmación grande / reveal. El vacío crea tensión y hace que la frase pese más. Se compone en el timeline de Remotion (gap entre `Sequence`s de audio o volumen a 0).

**Diales por tipo de marca** (sin nombres):
- Marca **pausada/premium**: música más baja (-26/-28 dB), menos SFX, silencios más largos, cama constante.
- Marca **rápida/hype**: música más presente (-22 dB), SFX densos, hits marcados, silencios cortos y quirúrgicos.

---

## 3. Orden de operaciones: dónde va cada cosa

Dos decisiones independientes: **dónde mezclas/duckeas** y **dónde masterizas**.

### 3.1 Ducking (bajar la música cuando hay voz)

Se puede hacer en **cualquiera de los dos** lados; elige uno, no ambos:

- **En Remotion (recomendado por control frame-exacto)**: bajas el `volume` de la pista de música con `interpolate` en los frames donde hay voz. Sabes exactamente dónde está la voz porque tienes los timings de captions (`scripts/build-captions.mjs` → `[{show,hide,words:[{t,start,end}]}]`). Duck de 3-5 dB ≈ multiplicar el volumen por ~0.55-0.7.
- **En FFmpeg (`sidechaincompress`)**: la música se comprime automáticamente disparada por la señal de voz. Útil cuando la voz no está separada en pista propia o quieres ducking "automático". Receta completa en `references/ffmpeg-recipes.md`.

### 3.2 Loudnorm (masterizado)

**SIEMPRE al final, en FFmpeg, sobre el mp4 renderizado.** Nunca dentro de Remotion. Se hace en **2 pasadas** (measure → apply) para un resultado consistente, con target `-14 LUFS` / `-1.5 dBTP`, y se **remuxea con `-c:v copy`** para no recodificar el video (rápido y sin pérdida de calidad visual).

Orquestado por `scripts/master-audio.sh`:
1. Extrae el audio del mp4 renderizado.
2. Pasada 1: `loudnorm` en modo análisis → mide `I`, `TP`, `LRA`, `thresh`.
3. Pasada 2: `loudnorm` con los valores medidos → normaliza a -14 LUFS / -1.5 dBTP.
4. Remuxea: `video (copy) + audio masterizado` → `out/x_master.mp4`.

Parámetros y flags exactos en `references/ffmpeg-recipes.md` (receta "loudnorm 2-pass").

---

## 4. Arco emocional de la música (regla craft)

**La música es "el color del video".** No es relleno: define el estado emocional en cada tramo. Arco típico de una pieza de retención:

| Tramo | Música | Función |
|-------|--------|---------|
| **Hook / apertura** | misteriosa, tensa, baja | intriga; abre un loop abierto |
| **Corte al cuerpo** | **cortar la música** (o cambio brusco) | marca "empieza lo bueno"; resetea la atención |
| **Explicación / desarrollo** | chill, cama constante, no invasiva | deja respirar la voz; mantiene ritmo sin distraer |
| **Transiciones clave** | **riser** ascendente | tensa antes de un cambio de sección |
| **Momento cúspide / reveal** | **clímax musical** / épica | pago emocional; el punto más alto |
| **Cierre / CTA** | resolución, decae | aterriza y libera |

Reglas prácticas:
- El **cambio de música** debe caer sobre un corte visual, nunca en medio de un plano.
- Un **riser** se sincroniza para que su pico coincida con el frame del reveal (ver `references/motion-graphics.md`).
- Cortar la música (silencio breve) es tan expresivo como añadirla: úsalo antes de la frase grande (ver §2, silencio dramático).

---

## 5. Mapa evento → SFX

Cada evento visual pide un sonido. Densidad = **dial de la pieza** (marca pausada: pocos y suaves; marca hype: densos y marcados).

| Evento visual | SFX | Nivel |
|---------------|-----|-------|
| Transición / corte de sección | **whoosh** | hit -10 a -14 dB |
| Aparición de texto / caption kinético | **pop / tick** | -14 dB |
| Antes de un reveal | **riser** o **boom** | riser sube; boom hasta -10 dB |
| Cifra / dato / número que entra | **ding / chime** | -12 a -14 dB |
| Énfasis en palabra clave | **tick** corto | -14 dB |
| Fondo de escena | **ambiente / room tone** | ~-20 dB |

El SFX se **sincroniza al frame** del evento (aparición del motion graphic, entrada del número). Como el motion vive en Remotion, el SFX se monta en la misma `Sequence`/frame que dispara la animación → sync perfecto sin arrastre. Ver correspondencia motion↔SFX en `references/motion-graphics.md`.

---

## 6. Fuentes y montaje en Remotion

**Fuentes**: música y SFX **royalty-free**, con licencia limpia para publicar. Organízalos etiquetados por **BPM** y **energía/mood** (misterioso, chill, épico, riser) para poder elegir rápido según el arco (§4). Mantén una carpeta de assets con nombres semánticos (`riser_01.wav`, `whoosh_soft.wav`, `chime_data.wav`).

**Montaje**: en Remotion se usa `<Audio>` de `remotion`, y el volumen (incluido el ducking) se controla con `interpolate` en función del frame.

```tsx
import { Audio, useCurrentFrame, interpolate } from "remotion";

// Cama de música con fade-in y ducking manual en el tramo de voz [voiceStart, voiceEnd]
const frame = useCurrentFrame();
const musicVol = interpolate(
  frame,
  [0, 15, voiceStart, voiceStart + 8, voiceEnd, voiceEnd + 8],
  [0, 0.7, 0.7, 0.28, 0.28, 0.7], // duck ~ -8..-9 dB durante la voz
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);

return (
  <>
    <Audio src={staticFile("music/chill_bed.mp3")} volume={musicVol} />
    <Audio src={staticFile("sfx/whoosh_soft.wav")} startFrom={0} /> {/* en su Sequence de transición */}
  </>
);
```

Notas:
- `volume` acepta número fijo o **callback por frame** (`volume={(f) => ...}`) — úsalo para fades y ducking.
- Recorta con `startFrom` / `endAt` (en frames) para colocar un SFX exactamente en el evento.
- La mezcla resultante sale en el mp4 del render; el **loudness aún NO está normalizado** → pasa por §3.2.
- Para clips largos o streaming de audio, considera `@remotion/media` según lo que ya use el proyecto.

---

## 7. Cierre y verificación

1. Monta voz/música/SFX en la comp, aplica ducking y silencios dramáticos en Remotion (o deja el ducking para FFmpeg).
2. `remotion render <Comp> out/x.mp4`.
3. Masteriza: **`scripts/master-audio.sh out/x.mp4 out/x_master.mp4`** → loudnorm 2-pass a -14 LUFS / -1.5 dBTP, video remuxeado sin recodificar (receta en `references/ffmpeg-recipes.md`).
4. **Verifica el LUFS final** y la ausencia de clipping en `references/qa.md` antes de publicar.

Regla de oro: **la voz siempre inteligible, el master a -14 LUFS, y ni un pico por encima de -1.5 dBTP.**

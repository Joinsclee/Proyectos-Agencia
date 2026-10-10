# Audio (paso 11)

Este archivo cubre el **paso 11 del pipeline** (ver `references/pipeline.md`): mezcla, ducking, loudness y diseño sonoro. Materializa la **regla craft 14** (jerarquía de niveles) y el arco emocional musical descritos en `references/craft-rules.md`. El QA de LUFS final vive en `references/qa.md`. Los comandos NO se inventan aquí: cada operación remite a una receta numerada de `references/ffmpeg-recipes.md`. Binarios: `$FF` (sistema, sin libass) para audio/video; `$FFSUB` (con libass) solo para quemar subtítulos — el audio NUNCA necesita `$FFSUB`.

---

## 1. Orden FIJO de operaciones (no negociable)

El audio se construye SIEMPRE en este orden. Alterarlo rompe la medición de loudness.

| # | Etapa | Qué hace | Receta / Script |
|---|-------|----------|-----------------|
| 1 | **Construir la mezcla** | Suma las pistas: voz (VO) + música + SFX en un solo bus | receta 21 (amix / amerge de pistas) |
| 2 | **Ducking** | La música cede bajo la voz por sidechain | receta 22 · `scripts/ducking.sh` |
| 3 | **Loudnorm 2-pass** | Normaliza el bus final a -14 LUFS / -1.5 dBTP | receta 14 · `scripts/loudnorm-2pass.sh` |

**REGLA DE ORO: `loudnorm` va SIEMPRE AL FINAL, nunca antes del ducking.**

Por qué: `loudnorm` en modo 2-pass mide el programa completo para calcular la ganancia lineal. Si normalizas antes de duckear, el ducking altera el loudness *después* de medir y el resultado ya no cumple -14 LUFS. Se mide y normaliza el bus **ya duckeado y mezclado**, jamás una pista suelta ni una mezcla que aún vas a tocar.

```
voz ─┐
     ├─(1 mezcla)─▶(2 ducking música↓voz)─▶(3 loudnorm 2-pass)─▶ audio final
mús ─┤
SFX ─┘
```

---

## 2. Jerarquía de niveles (regla craft 14)

La voz manda. Todo lo demás se subordina. Esta es la traducción operativa de la regla craft 14 de `references/craft-rules.md`.

| Elemento | Nivel objetivo | Notas |
|----------|---------------|-------|
| **Voz / VO** | Picos entre **-6 y -12 dB** | El elemento más alto. Es el mensaje; nada la tapa. |
| **Master (bus final)** | **-14 LUFS** integrado / **-1.5 dBTP** | Estándar de la etapa 3. Se logra con loudnorm, no a mano. |
| **Música (con voz)** | **-24 dB o menos** + ducking **3-5 dB** por sidechain | Siempre DEBAJO de la voz. Cuando entra la voz, cede. |
| **Música (sin voz)** | Puede subir a su nivel de "protagonista" | En holds, intros y clímax sin locución la música respira. |
| **SFX ambiente** | **~-20 dB** | Colchón, textura. No compite con la voz. |
| **SFX hits / acentos** | Hasta **-10 dB** | Golpes puntuales (boom, ding). Cortos y fuertes, no sostenidos. |

Regla mental: **voz > SFX hit > SFX ambiente > música**. Si dudas de un nivel, baja la música antes que subir la voz.

---

## 3. Ducking (etapa 2)

La música baja automáticamente cuando hay voz, y vuelve suave cuando la voz calla. Se hace por **sidechain**: la voz es la señal de control (sidechain-key), la música es la señal comprimida.

- **Comando:** receta 22 (`sidechaincompress`) · **Script:** `scripts/ducking.sh`
- **La voz es el sidechain-key** — dispara la compresión, no se comprime a sí misma.
- **attack ~20 ms** → la música cede rápido en cuanto arranca la palabra (no deja que la sílaba inicial quede tapada).
- **release ~300 ms** → la música vuelve suave al terminar la frase (evita el "bombeo" audible entre palabras).
- Profundidad objetivo: **3-5 dB** de reducción (ver tabla craft 14). Más que eso suena a corte brusco; menos, no despeja la voz.

```bash
# Ver receta 22 para el filtro exacto; el script encapsula los parámetros:
scripts/ducking.sh voz.wav musica.wav -o musica_duckeada.wav
# La voz entra como sidechain-key; salida = música que respira bajo la voz.
```

Coordina el ducking con los **holds** de `references/semantic-cut.md`: en un hold sin voz, el sidechain no dispara y la música sube sola — úsalo a favor (respiro musical antes de una afirmación grande).

---

## 4. Loudnorm two-pass (etapa 3)

Normalización de loudness al estándar de plataformas. **Dos pasadas**, no una.

- **Comando:** receta 14 · **Script:** `scripts/loudnorm-2pass.sh`
- **Objetivo: -14 LUFS integrado / -1.5 dBTP.** Es el estándar común de **Instagram / TikTok / YouTube**. Subir de ahí no te hace "más alto" en la plataforma: te normalizan hacia abajo y pierdes rango dinámico.

Cómo funciona el 2-pass:

| Pase | Qué hace |
|------|----------|
| **Pase 1 (medición)** | Corre loudnorm en modo análisis y **lee del JSON** los valores reales del input: `input_i`, `input_tp`, `input_lra`, `input_thresh`. |
| **Pase 2 (aplicación)** | Vuelve a correr loudnorm alimentándole esos valores medidos y con **`linear=true`** para aplicar una ganancia lineal exacta (sin bombeo dinámico). |

```bash
# El script hace las dos pasadas y el parseo del JSON por ti:
scripts/loudnorm-2pass.sh mezcla_duckeada.wav -o audio_final.wav
# Pase 1: mide input_i/input_tp/input_lra/input_thresh
# Pase 2: aplica measured_* + linear=true → -14 LUFS / -1.5 dBTP
```

**Verificación obligatoria en QA:** medir el LUFS integrado del render final y confirmar que cae en -14 LUFS (±0.5) con true peak ≤ -1.5 dBTP. Ver checklist de `references/qa.md`. Si no cumple, casi siempre es porque se corrió loudnorm antes del ducking (ver sección 1) o en single-pass.

---

## 5. Arco emocional de la música (regla craft)

**"La música es el color de tu video."** No es relleno de fondo: dirige el estado emocional del espectador y sube o baja el estímulo (EMN, ver `references/craft-rules.md`). El arco por defecto:

| Momento del video | Música | Efecto en el espectador |
|-------------------|--------|-------------------------|
| **Inicio / hook** | Misteriosa / clásica | Intriga, tensión, **sube el estímulo** |
| **Transición al cuerpo** | **CORTAR la música** (silencio o cambio seco) | Reset de atención, marca cambio de estado |
| **Explicación / desarrollo** | Chill beat de fondo | Estado tranquilo, deja procesar la info |
| **Cierre / clímax** | Épica | Elevación, cierre memorable |

Herramientas del arco:

- **Riser en cada transición de estado** — un riser (subida de frecuencia/energía) tiende el puente entre un estado musical y el siguiente. Ancla el corte de música.
- **Regla Avengers (clímax exacto):** el pico musical debe caer **exactamente** en el momento cúspide del contenido (el reveal, la cifra grande, el remate). Si la música explota una palabra antes o después, se pierde el golpe. Alinéalo al frame.
- **Cortar la música es tan poderoso como ponerla.** Un silencio musical seco antes de una frase clave la sube de volumen relativo sin tocar el fader.

---

## 6. Mapa evento → SFX

Cada evento visual pide su sonido. Regla: el SFX **subraya** la acción, no la anuncia con retraso — cae en el frame del evento.

| Evento en pantalla | SFX | Nota |
|--------------------|-----|------|
| Transición (corte, wipe, cambio de plano) | **whoosh** | Apila whooshes en **frecuencias distintas** para no emborronar (uno grave, uno agudo). |
| Aparición de texto / caption entra | **pop** | Corto y seco; sincroniza con el keyframe de entrada. |
| Antes de un reveal | **riser → boom** | El riser tensa, el boom resuelve en el reveal. |
| Sobre una cifra / dato | **ding** | Acento agudo que "marca" el número. |
| Interacción / grosería / momento crudo | **B/N + SFX puntual** | Vira a blanco y negro y clava un SFX seco en el punto exacto. |
| Cifras de dinero | **sonido de euros con eco de sala** | El eco le da "peso" y espacio a la cifra económica. |

Regla anti-barro: cuando apiles varios SFX cercanos (típico en whooshes de transiciones seguidas), sepáralos en **frecuencias distintas** para que cada uno se oiga. Dos whooshes idénticos encima se cancelan en una masa turbia.

---

## 7. Densidad de SFX = dial de marca

La densidad de efectos NO es universal: es un **dial del brand-edit-profile** (`profile.audio.sfx_density`). Las 18 reglas craft son las mismas para todos; lo que cambia por cliente es cuánto SFX pones. Ver `references/engine-decision.md` para cómo el profile alimenta el render.

| Cliente | `sfx_density` | Criterio |
|---------|--------------|----------|
| **Ovejas Voladoras** | Denso | Hipercinético: whoosh/pop/ding en casi cada corte, SFX apilado. Refuerza el ritmo word-by-word. |
| **SAVIAS** | Mínimo | Premium/pausado: **"menos es más"**. SFX escaso y sutil; el silencio y la música serif hacen el trabajo. Un ding de más rompe el aura premium. |
| HUMANOX / IA LAB / VUELA / Barco de Papel/Origami | Según profile | Leer `profile.audio.sfx_density` de cada uno; no asumir. |

Regla: en marcas premium, ante la duda, **quita** el SFX. En marcas hipercinéticas, ante la duda, **añade** y separa en frecuencias.

---

## 8. Silencio dramático

Un **silencio de 0.3-0.5 s antes de una afirmación grande** multiplica su impacto: el vacío sonoro hace que la frase caiga en un espacio limpio. Corta música y SFX (o al menos bájalos a piso) justo antes del remate.

Coordina esto con los **holds** de `references/semantic-cut.md`: el hold visual (pausa/congelado) y el silencio dramático deben caer en el mismo punto. Visual quieto + audio en silencio = máxima anticipación antes de la frase clave. Es la contraparte del clímax musical (sección 5, regla Avengers): a veces la cúspide se subraya con explosión musical, otras con silencio total — nunca a medias.

---

## 9. Fuentes de audio

### SFX

| Fuente | Tipo | Nota |
|--------|------|------|
| Librería local etiquetada | Propia | Primera opción: SFX ya clasificados por evento (whoosh/pop/ding/boom/riser). |
| **Pixabay** | Gratis | Banco libre de derechos. |
| **ArtList** | Pago | Calidad alta, licencia comercial. |
| **Myinstants** | Memes | Para SFX de meme / cultura de internet (útil en Ovejas). |
| **ElevenLabs SFX** | Generativo | Modelo `eleven_multilingual_v2`. Requiere `ELEVENLABS_API_KEY`. Para SFX a medida que no existen en librería. |

### Voz / VO

| Fuente | Tipo | Nota |
|--------|------|------|
| **ElevenLabs** | Voz clonada / VO | Voz clonada del cliente o VO de alta calidad. Requiere `ELEVENLABS_API_KEY`. |
| **hyperframes tts (Kokoro)** | TTS gratis local | Sin costo, corre local. **Requiere `brew install espeak-ng`** para soporte de español. Para borradores o VO sin presupuesto. |

### Música

| Fuente | Tipo | Nota |
|--------|------|------|
| Librería royalty-free local | Propia | Etiquetada por **BPM** y **energía** para armar el arco emocional de la sección 5 (misteriosa → chill → épica) escogiendo por energía, no a oído ciego. |

---

## Referencias cruzadas

- `references/craft-rules.md` — regla craft 14 (jerarquía de niveles), arco emocional musical, regla Avengers, EMN.
- `references/ffmpeg-recipes.md` — receta 21 (mezcla), receta 22 (ducking sidechain), receta 14 (loudnorm 2-pass).
- `references/semantic-cut.md` — holds que coordinan con ducking y silencio dramático.
- `references/engine-decision.md` — cómo `profile.audio.sfx_density` y demás diales de marca entran al render.
- `references/qa.md` — verificación de LUFS/dBTP final.
- `references/pipeline.md` — dónde encaja el paso 11 en el flujo completo.

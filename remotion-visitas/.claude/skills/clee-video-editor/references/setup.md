# Setup e instalación (una vez por máquina)

Este archivo cubre la **instalación de dependencias** y la **resolución de fallos del preflight** de la Máquina de Edición CLEE. Se ejecuta **una sola vez por máquina** (o cuando cambias de equipo). El preflight lo dispara `references/pipeline.md` al inicio de cada sesión; si algo falla, vuelve aquí. Nada de lo que instalas aquí afecta las 18 reglas de craft (`references/craft-rules.md`) — solo habilita los binarios que consumen las recetas de `references/ffmpeg-recipes.md` y las rutas de render de `references/engine-decision.md`.

## Contrato de binarios (respétalo siempre)

La skill nunca llama a `ffmpeg` a secas. Usa dos variables de entorno resueltas por `env.sh`:

| Var | Qué es | Para qué | Requiere libass |
|-----|--------|----------|-----------------|
| `$FF` | FFmpeg del **sistema** (Homebrew), sin libass | corte, concat, escalado, mezcla de audio, keyframes, loudnorm | No |
| `$FFSUB` | FFmpeg **con libass** | filtros `subtitles`, `ass`, `drawtext` (captions quemados) | Sí |
| `$WC` | `whisper-cli` (whisper.cpp) | transcripción + timestamps para semantic-cut y captions | — |

Regla dura: **cualquier receta que queme texto va por `$FFSUB`; todo lo demás por `$FF`.** No inventes comandos nuevos — si necesitas una operación, búscala por número en `references/ffmpeg-recipes.md`.

## Requisitos base

| Componente | Instalación | Verificación | Notas |
|------------|-------------|--------------|-------|
| Claude Code | sesión activa **JoinsClee** | `claude --version` | sin sesión JoinsClee no hay MCPs de cliente |
| Node.js 22+ | `brew install node` | `node -v` → debe ser `v22.x` o superior | 22+ es obligatorio para Hyperframes y Remotion |
| FFmpeg sistema (`$FF`) | `brew install ffmpeg` | `$FF -version` | cubre todas las recetas que no queman texto |
| whisper-cli (`$WC`) | `brew install whisper-cpp` | `$WC --help` | el binario se llama `whisper-cli` |

```bash
brew install node ffmpeg whisper-cpp
```

Tras instalar, ejecuta `env.sh` una vez para que autodetecte binarios y modelos y exporte `$FF`, `$FFSUB`, `$WC` y la ruta del modelo whisper.

## $FFSUB: conseguir un FFmpeg con libass

El FFmpeg de Homebrew **a menudo NO trae libass**, así que los filtros `subtitles`/`ass`/`drawtext` fallan con un error del tipo `No such filter: 'subtitles'`. Necesitas un binario separado para `$FFSUB`. Opciones, en orden de preferencia:

1. **Binario `ffmpeg-static` de npm** (más rápido, sin recompilar):
   - `npx -y ffmpeg-static-bin` para resolver la ruta, **o**
   - localizar `node_modules/ffmpeg-static/ffmpeg` dentro de un proyecto Node existente (p. ej. el de Remotion o Hyperframes ya instalado) y apuntar `$FFSUB` ahí.
2. **`brew reinstall ffmpeg`** con opciones que incluyan libass (build de Homebrew con `--with-libass` o una fórmula/tap que ya lo traiga).
3. **Descargar un build estático con libass** (evermeet.cx / BtbN u otro build de confianza) y apuntar `$FFSUB` a ese ejecutable.

El preflight verifica libass así:

```bash
$FFSUB -filters | grep ' subtitles '
```

Si esa línea **no devuelve nada**, `$FFSUB` no sirve para quemar captions. **No es bloqueante**: la ruta de captions cae automáticamente en **Remotion/Hyperframes**, que renderizan el texto en React y **no necesitan libass**. Ver `references/captions.md` (motor de captions) y `references/engine-decision.md` (cuándo cae a Remotion vs FFmpeg). El único costo es velocidad/ruta, no calidad.

## Modelos de Whisper (`$WC`)

Descarga un modelo **MULTILINGÜE**. Regla crítica: **nunca uses un modelo `.en`** — los clientes CLEE hablan español y un modelo `.en` transcribe mal o traduce. Elige por caso:

| Modelo | Uso | Tamaño relativo |
|--------|-----|-----------------|
| `ggml-medium.bin` | **calidad** (captions finales, semantic-cut definitivo) | grande |
| `ggml-small.bin` | **draft** (pasada rápida, pruebas de corte) | mediano |

```bash
curl -L -o models/ggml-medium.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

`env.sh` **autodetecta** modelos existentes en las ubicaciones conocidas (`models/`, cache de whisper.cpp, etc.), así que si ya bajaste el modelo en otra sesión no lo vuelvas a descargar. La transcripción alimenta `references/semantic-cut.md` (cortes por sentido) y `references/captions.md` (timing palabra a palabra).

## Modelo VAD (silero) para detección de voz

Para el corte por silencios/voz necesitas el modelo VAD de silero. **No inventes el comando**: usa la **receta 5** de `references/ffmpeg-recipes.md`, que hace el `curl` a `models/ggml-silero-v5.1.2.bin`. El VAD lo consume la lógica de `references/semantic-cut.md` para marcar dónde hay voz vs silencio antes de aplicar EMN.

## Hyperframes (motor agéntico principal de render)

```bash
npx hyperframes init <proyecto>
cd <proyecto>
npx skills add heygen-com/hyperframes --all
```

`--all` instala las ~21 skills granulares de Hyperframes, entre ellas:

- `talking-head-recut`
- `embedded-captions`
- `faceless-explainer`
- `general-video`
- `motion-graphics`
- (y el resto del set granular)

**Verifica los subcomandos reales** con `npx hyperframes --help` e `npx hyperframes info` — los nombres/subcomandos **pueden variar por build**, así que confía en lo que reporte el CLI instalado, no en una lista fija. Para **TTS en español** (voz sintética dentro de Hyperframes):

```bash
brew install espeak-ng
```

Cómo Hyperframes se reparte el trabajo con FFmpeg/Remotion está en `references/engine-decision.md`; los estilos de caption embebido en `references/captions.md`; los data-viz/lower-thirds en `references/motion-graphics.md`.

## Remotion (render React determinista)

Instala **la misma versión** de todos los paquetes para evitar mismatches:

```bash
npm i remotion @remotion/cli @remotion/captions @remotion/transitions
```

- `@remotion/captions` → captions kinéticos cuando `$FFSUB` no tiene libass (ver `references/captions.md`).
- `@remotion/transitions` → transiciones entre tomas (ver `references/motion-graphics.md`).
- **Company License** requerida para equipos de **4+ personas**.

Remotion es el fallback determinista para captions y motion graphics de precisión; la decisión Hyperframes vs Remotion vs FFmpeg vive en `references/engine-decision.md`.

## MCPs opcionales

| MCP | Para qué | Cuándo |
|-----|----------|--------|
| ElevenLabs | voz TTS premium y SFX | narración/SFX densos (ver `references/audio.md`) |
| imagegen | imágenes generadas (b-roll estático, cards) | cuando falta asset visual |
| capcut-api | draft editable de CapCut | **solo Ruta B** (no la ruta de render terminado) |

**Confirma los tokens** de cada proveedor en su propia doc antes de usarlos; sin token el MCP no responde y el preflight lo marca como no disponible. La mezcla y ducking de la voz/SFX que salga de ElevenLabs se rige por `references/audio.md`.

## Estructura de trabajo por sesión

Crea una carpeta por trabajo y **arrastra ahí el crudo**:

```bash
mkdir -p sessions/<cliente>_<fecha>
# ejemplo: sessions/savias_2026-07-04
# arrastra el video crudo dentro de esa carpeta
```

`<cliente>` es la marca (SAVIAS, Ovejas Voladoras, HUMANOX, Barco de Papel/Origami, IA LAB, VUELA) y define qué **brand-edit-profile** carga la sesión — recuerda: las 18 reglas de craft son universales, lo que cambia por cliente son los **diales** (ritmo, tipografía, paleta, densidad de SFX). El flujo completo desde esta carpeta está en `references/pipeline.md` y el QA final en `references/qa.md`.

## Diagnóstico: qué revisar si el preflight falla

| Síntoma en el preflight | Causa probable | Arreglo |
|-------------------------|----------------|---------|
| `command not found` para `$FF` o `node` | binario ausente / no instalado | `brew install ffmpeg node`; reabre shell y re-corre `env.sh` |
| `node -v` muestra `v18/20` | **Node < 22** | `brew install node` (o `brew upgrade node`); Hyperframes/Remotion exigen 22+ |
| `$FFSUB -filters \| grep ' subtitles '` vacío | **libass faltante** en `$FFSUB` | apunta `$FFSUB` al binario `ffmpeg-static` de npm, `brew reinstall ffmpeg` con libass, o build estático; si no hay, la ruta de captions cae a Remotion/Hyperframes (no bloquea) |
| Transcripción en inglés o con errores raros | **modelo `.en` por error** | borra el `.en`, baja `ggml-medium.bin` o `ggml-small.bin` (multilingüe) y re-corre `env.sh` para autodetectar |
| `$WC` no encuentra modelo | modelo no descargado / fuera de ruta conocida | baja el modelo a `models/`; `env.sh` autodetecta ubicaciones conocidas |
| VAD no corre / falta `ggml-silero-*.bin` | modelo VAD ausente | ejecuta la **receta 5** de `references/ffmpeg-recipes.md` |
| `npx hyperframes` subcomando desconocido | nombres cambiaron por build | corre `npx hyperframes --help` / `info` y usa los subcomandos reales |
| TTS de Hyperframes sin voz en español | falta `espeak-ng` | `brew install espeak-ng` |
| Versiones de Remotion en conflicto | paquetes con versiones distintas | reinstala los 4 paquetes a la misma versión |
| MCP (ElevenLabs/imagegen/capcut-api) no responde | **token ausente/inválido** | confirma token en la doc del proveedor; capcut-api solo aplica a Ruta B |
| Sesión sin MCPs de cliente | no hay **sesión JoinsClee** | inicia sesión JoinsClee en Claude Code |

Cuando el preflight pase limpio (o solo con `$FFSUB` degradado a Remotion), continúa por `references/pipeline.md`. Los safe zones de Meta/TikTok que respeta el render están en `references/safe-zones.md`, el color en `references/color.md` y el checklist de salida en `references/qa.md`.

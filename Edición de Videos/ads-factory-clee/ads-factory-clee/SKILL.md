---
name: ads-factory-clee
description: Construye drafts de CapCut profesionales a partir de un clip crudo del cliente alojado en Google Drive, para clientes JoinsClee (Paulina/Barco de Origami, SAVIAS, IA LAB, HUMANOX, Ovejas Voladoras). Resuelve archivos en Drive vía MCP, descarga vía rclone, transcribe con Whisper, y orquesta el MCP capcut-api para sincronizar subtítulos quemados, posicionar B-roll, agregar texto en hooks, lower-thirds y CTA card con el brand kit del cliente y safe zones de Meta/TikTok. Genera la carpeta dfd_ lista para abrir en CapCut. Usar SIEMPRE cuando se mencione: editar Meta Ads, montar el video del Ad, ensamblar el creativo, llevar clip crudo a CapCut, producir variantes de Ad, factory de creativos, ads-factory, o frases como "arma el draft con el clip de [cliente]", "móntame esto en CapCut", "construye el Ad de [cliente]", "ensamble las 5 variantes del hook". NO usar para Reels orgánicos talking head (smartcut-clee), escribir guiones (video-ads-scriptwriter), ni landings (funnel-builder).
---

# ads-factory-clee — Fábrica profesional de Meta Ads en CapCut

Esta skill convierte un clip crudo grabado por el cliente (en Google Drive) en un draft de CapCut profesional listo para que un editor refine 10-15% y exporte. Reduce producción de Ad de 3-5h a 20-30min de revisión humana, manteniendo calidad cinematográfica.

## Filosofía operativa

Cristhian decidió: queremos máxima automatización pero también máxima calidad. Eso significa que la skill **toma decisiones de director creativo con criterio**, no solo posiciona clips. Si una decisión no se puede tomar bien con la info disponible, la skill **pregunta una vez** en lugar de inventar.

**El input principal es UN clip crudo del cliente** que ya tiene la voz del talento adentro. La skill NO genera voiceover, NO inventa B-roll que no existe, NO renderiza el video final. Lo que hace es: extraer el audio, transcribir, sincronizar subtítulos, agregar capas visuales (texto, B-roll si está disponible, lower-thirds, CTA), aplicar brand kit, y dejar el draft listo.

## Cuándo se activa

Cristhian es operador único (Claude Code en macOS). Triggers:
- Tiene un clip crudo del cliente en Drive (típicamente sesión de grabación)
- Quiere producir 1 o más variantes de Meta Ad a partir de ese clip
- Tiene claro qué cliente / qué ángulo / qué duración objetivo

NO se activa para: Reels orgánicos talking head puro (smartcut-clee), escribir guiones (video-ads-scriptwriter), piezas que no terminan en CapCut.

## Pre-requisitos técnicos

Verificar UNA VEZ antes del primer uso (ver `references/setup-macos.md`):

1. **CapCutAPI corriendo localmente** + MCP `capcut-api` registrado en Claude Code
2. **FFmpeg instalado** (`brew install ffmpeg`) — la skill lo usa para extraer audio del clip crudo
3. **rclone instalado y configurado con OAuth de Drive** (`brew install rclone` + `rclone config`) — para descargar binarios grandes desde Drive
4. **MCP Google Drive conectado en Claude** (ya lo tienes según contexto) — para resolver nombres/IDs de archivos
5. **CapCut International** instalado, carpeta de drafts existe: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/`
6. **Whisper instalado localmente** (`pip install openai-whisper`) o acceso a OpenAI API — para transcribir y obtener SRT con timestamps reales del audio del clip

Si algo falta, detenerse y guiar a `references/setup-macos.md`.

## Flujo operativo end-to-end

### Paso 1 — Recibir el brief

Cristhian va a entregar variantes de esto:

> "Móntame el Ad de Paulina con el clip que grabó ayer. Lo subió a la carpeta `clientes/paulina/raw_sessions/2026-05-19/`. Quiero 3 variantes de hook, vertical 30s, ángulo: frustración con redes sociales que no convierten."

Información que la skill debe extraer del brief:
- **Cliente** (obligatorio) — define brand kit
- **Ubicación del clip crudo en Drive** (obligatorio) — carpeta o nombre de archivo
- **Cantidad de variantes** (default: 1, máximo 5)
- **Formato/duración** (default: 1080x1920 vertical 30s)
- **Ángulo/hook intent** (obligatorio si son variantes — define qué hook se construye)
- **B-roll disponible** (opcional — si Cristhian menciona "y el B-roll está en X carpeta")
- **CTA específico** (opcional — si no, default al CTA estándar del cliente del brand kit)

Si falta algo crítico, preguntar con `ask_user_input_v0` UNA vez (máximo 3 preguntas).

### Paso 2 — Resolver y descargar assets desde Drive

**Sub-paso 2.1 — Búsqueda vía MCP Drive:**
Usar `Google Drive:search_files` con queries específicos:
```
query: name contains 'paulina' and '2026-05-19' in parents
```
Listar lo encontrado y mostrar a Cristhian: "Encontré estos archivos: [lista]. ¿Cuál uso como clip principal?". Si solo hay uno claro, proceder sin preguntar.

**Sub-paso 2.2 — Descarga binaria vía rclone:**
NO usar `Google Drive:download_file_content` para videos (devuelve base64, consume contexto masivamente). En su lugar:

```bash
# Crear carpeta de trabajo
mkdir -p ~/dev/joinsclee-clients/{cliente}/raw/
mkdir -p ~/dev/joinsclee-clients/{cliente}/output/

# Descargar el clip vía rclone (configurado previamente con Drive)
rclone copy "gdrive:clientes/{cliente}/raw_sessions/{fecha}/{archivo}.mp4" \
            ~/dev/joinsclee-clients/{cliente}/raw/ \
            --progress
```

Tras descargar, el path local es `~/dev/joinsclee-clients/{cliente}/raw/{archivo}.mp4`. La skill usa este path con `file:///` para alimentar el MCP de CapCut.

**Sub-paso 2.3 — Obtener duración del clip:**
Llamar `get_video_duration` del MCP capcut-api o ejecutar `ffprobe`:
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 raw/{archivo}.mp4
```

### Paso 3 — Extraer audio y transcribir

**Sub-paso 3.1 — Extraer audio:**
```bash
ffmpeg -i ~/dev/joinsclee-clients/{cliente}/raw/{archivo}.mp4 \
       -vn -acodec mp3 -q:a 2 \
       ~/dev/joinsclee-clients/{cliente}/raw/{archivo}.mp3
```

**Sub-paso 3.2 — Transcribir con Whisper:**
```bash
whisper ~/dev/joinsclee-clients/{cliente}/raw/{archivo}.mp3 \
        --model medium \
        --language Spanish \
        --output_format srt \
        --output_dir ~/dev/joinsclee-clients/{cliente}/raw/
```

Esto genera un `.srt` con timestamps reales sincronizados al audio del cliente. **Este SRT es la columna vertebral del Ad** — los subtítulos quemados y la sincronización del B-roll se calculan a partir de él.

**Sub-paso 3.3 — Identificar marcadores narrativos en el SRT:**
La skill lee el SRT y propone una estructura del Ad:
- **Hook (0-3s):** primera línea + primera línea posterior si la primera es muy corta
- **Cuerpo:** todo lo del medio
- **Payoff/promesa (últimos 20-25%):** las últimas 2-3 líneas
- **CTA (post-payoff):** se agrega como overlay nuevo, no es del clip

Reportar a Cristhian la estructura detectada antes de construir el draft:
> "El clip dura 47s. Detecté:
> - Hook (0-3.2s): '¿Te frustra publicar y publicar sin que nadie compre?'
> - Cuerpo (3.2-38s): historia + problema + solución
> - Payoff (38-44s): 'Y eso es exactamente lo que te enseño en [programa]'
> - CTA (a agregar 44-47s, sin audio original): card final con logo
>
> ¿Procedo o ajusto algo?"

### Paso 4 — Construir el draft vía MCP capcut-api

Cargar `references/brand-kits.md` para el cliente específico. Luego, llamadas al MCP en este orden:

**4.1 — Crear draft:**
```python
draft = create_draft(width=1080, height=1920)
did = draft["draft_id"]
```

**4.2 — Agregar el clip principal del cliente como track main:**
```python
add_video(
    video_url=f"file://{path_local_clip}",
    draft_id=did,
    start=0,
    end=duracion_clip,
    volume=1.0,  # audio del clip = voz del talento, mantener
    track_name="main"
)
```

**4.3 — Keyframes sutiles en el hook (zoom-in para retención):**
```python
add_video_keyframe(
    draft_id=did,
    track_name="main",
    property_types=["scale_x", "scale_y"],
    times=[0, 3],
    values=["1.0", "1.08"]  # zoom muy sutil
)
```

**4.4 — Texto en pantalla del hook (gran tipografía, brand colors):**
Tomar la primera frase del SRT. Recortar a 7-8 palabras máximo. Colocar en posición Y según `references/safe-zones.md`:
```python
add_text(
    text=hook_text,
    draft_id=did,
    start=0.3,  # leve delay para que el ojo registre el cambio
    end=3.0,
    font=brand_kit["tipografias"]["primaria"],
    font_size=72,
    font_color=brand_kit["paleta"]["texto_principal"],
    position_y=zona_segura["hook_y"],  # típicamente -0.25 a -0.35
    background_enabled=False
)
```

**4.5 — Subtítulos quemados sobre todo el cuerpo:**
```python
add_subtitle(
    srt_content=srt_completo,  # del paso 3.2
    draft_id=did,
    font=brand_kit["tipografias"]["subtitulos"],
    font_size=brand_kit["subtitulos_quemados"]["font_size"],
    font_color=brand_kit["subtitulos_quemados"]["color"],
    background_enabled=True,
    background_color=brand_kit["subtitulos_quemados"]["bg_color"],
    background_alpha=brand_kit["subtitulos_quemados"]["bg_alpha"],
    background_round_radius=brand_kit["subtitulos_quemados"]["radius"],
    position_y=zona_segura["subtitles_y"]  # respeta zona segura platform
)
```

**4.6 — Lower-third de presentación del talento (segundos 1-5):**
```python
add_text(
    text=f"{nombre_talento}  |  {credencial_corta}",
    draft_id=did,
    start=1.5,
    end=5.0,
    font=brand_kit["tipografias"]["secundaria"],
    font_size=32,
    font_color=brand_kit["paleta"]["acento_1"],
    position_x=brand_kit["lower_third"]["x"],
    position_y=brand_kit["lower_third"]["y"]
)
```

**4.7 — Si hay B-roll disponible (resuelto en paso 2 si Cristhian lo mencionó):**
Para los segmentos del SRT donde el talento menciona algo concreto que tiene B-roll asociado, agregar overlay:
```python
add_video(
    video_url=f"file://{path_broll}",
    draft_id=did,
    start=segmento_inicio,
    end=segmento_fin,
    volume=0.0,  # mute, queremos solo lo visual
    track_name="broll_overlay"
)
```

Por default, **NO inventar B-roll**. Si no hay, dejar el plano del talento.

**4.8 — CTA card final (últimos 3s):**
Extender la duración total del draft con un fondo de color brand:
```python
# Logo
add_image(
    image_url=f"file://{path_logo_cliente}",
    draft_id=did,
    start=duracion_clip,
    end=duracion_clip + 3,
    position_x=0,
    position_y=-0.15,
    scale=brand_kit["logo"]["scale"],
    track_name="logo"
)

# Texto CTA
add_text(
    text=brand_kit["cta_default"],  # ej. "ÚNETE A LA COMUNIDAD"
    draft_id=did,
    start=duracion_clip,
    end=duracion_clip + 3,
    font=brand_kit["tipografias"]["primaria"],
    font_size=58,
    font_color=brand_kit["paleta"]["texto_sobre_oscuro"],
    background_enabled=True,
    background_color=brand_kit["paleta"]["acento_1"],
    background_alpha=1.0,
    background_round_radius=12,
    position_y=0.2
)
```

### Paso 5 — Validación pre-save (CRÍTICO para calidad)

Antes de `save_draft`, ejecutar checklist interno. Si algo falla, reportar a Cristhian y NO guardar hasta confirmar:

- [ ] **Duración total** dentro del target ±0.5s (si target era 30s, aceptable 29.5-30.5s)
- [ ] **Hook text** ≤ 8 palabras (no se alcanza a leer en 3s si es más)
- [ ] **Todos los textos caben** en safe zone horizontal (font_size * caracteres < 0.85 * ancho_frame)
- [ ] **Contraste CTA** ≥ WCAG AA (4.5:1) entre `font_color` y `background_color` — calcular con función helper
- [ ] **Subtítulos no se solapan** con lower-third ni con CTA card en sus rangos temporales
- [ ] **Logo no choca** con texto del CTA (posiciones no se cruzan)
- [ ] **No hay gap visual** entre el final del clip y el inicio del CTA (transición de fondo)

Si pasa todo el check, llamar `save_draft`.

### Paso 6 — Entregar a Cristhian

```
✅ Draft generado: dfd_paulina_hook_frustracion_v1

📁 Ubicación:
   ~/dev/joinsclee-tools/VectCutAPI/dfd_paulina_hook_frustracion_v1/

📊 Specs del draft:
   - Duración: 30.2s (target 30s ✓)
   - Resolución: 1080x1920 vertical
   - Voiceover: del clip original del cliente
   - Subtítulos: quemados, sincronizados a audio real (Whisper medium model)
   - B-roll overlay: 2 segmentos (12-15s, 22-25s)
   - Brand kit: Paulina / Barco de Origami v3

🎬 Para abrir en CapCut:
   ./scripts/copy_to_capcut.sh dfd_paulina_hook_frustracion_v1

⏱️ Refinamiento humano estimado: 12-18 min
   Foco típico de revisión:
   - Verificar que el zoom-in del hook se sienta natural (ajustar curva si rebota)
   - Afinar timing del lower-third si tapa el rostro del talento
   - Revisar legibilidad de subtítulos en mobile (descargar y ver en iPhone)
   - Considerar agregar música (no incluida — pendiente librería)
```

Ofrecer ejecutar `scripts/copy_to_capcut.sh` automáticamente.

### Paso 7 — Modo factory (variantes)

Si Cristhian pidió N variantes, repetir pasos 4-6 N veces. Mantener constante:
- Cliente, brand kit, clip principal, subtítulos del cuerpo, lower-third, CTA card

Variar solo:
- **Texto del hook en pantalla** (cambia el ángulo psicológico)
- **Keyframes del hook** (V1 zoom-in, V2 estático con texto que entra animado, V3 pan lateral)

Nombrado:
- `dfd_{cliente}_hook_dolor_v1`
- `dfd_{cliente}_hook_curiosidad_v2`
- `dfd_{cliente}_hook_resultado_v3`
- `dfd_{cliente}_hook_pregunta_v4`
- `dfd_{cliente}_hook_polemica_v5`

Generar en serie, no paralelo (el MCP es stdio, comparte estado).

## Zonas seguras por plataforma (CRÍTICO para profesionalidad)

Ver `references/safe-zones.md`. Resumen:

| Plataforma | Top reservado (UI) | Bottom reservado | Right side (IG) | Safe Y para texto |
|---|---|---|---|---|
| Meta Reels | 8% top | 18% bottom | 12% right | -0.35 a 0.30 |
| TikTok | 15% top | 22% bottom | 15% right | -0.30 a 0.25 |
| YouTube Shorts | 10% top | 15% bottom | 0 | -0.40 a 0.35 |

La skill usa `Meta Reels` por default. Si Cristhian especifica TikTok o Shorts, ajustar `position_y` de TODOS los textos y CTA al límite más restrictivo.

## Brand kits

Ver `references/brand-kits.md`. Cargar el bloque del cliente específico en el paso 4. Si el cliente no está listado, **detenerse** y preguntar 3 datos básicos (tipografía, color acento, posición logo) — no inventar.

## Lo que la skill NUNCA hace

- ❌ Generar voiceover sintético (el cliente lo graba)
- ❌ Inventar B-roll que no existe
- ❌ Renderizar el video final — entrega draft, editor humano exporta
- ❌ Modificar drafts existentes en CapCut
- ❌ Subir archivos a Drive (solo descarga)
- ❌ Usar `Google Drive:download_file_content` para videos (consume contexto)
- ❌ Producir más de 5 variantes en una sola corrida (después de 5, calidad decae)
- ❌ Aplicar efectos agresivos (glitch, VHS) salvo brand kit lo pida explícitamente
- ❌ Agregar música si no hay track especificado (queda en silencio hasta tener librería)

## Manejo de errores comunes

**rclone "directory not found":** la ruta de Drive no coincide. Listar la carpeta con `rclone ls gdrive:clientes/{cliente}/raw_sessions/` y pedir a Cristhian la correcta.

**Whisper falla por modelo no descargado:** primera vez, descarga el modelo (~1.5GB para medium). Mencionar a Cristhian que es one-time.

**SRT con timestamps imprecisos:** si Whisper usó modelo small (rápido pero menos preciso), reintentarlo con medium o large. Para Ads de cliente, siempre medium mínimo.

**MCP capcut-api no responde:** verificar que `mcp_server.py` está corriendo (lo lanza Claude Code auto). Si stdio falla, reiniciar Claude Code.

**Draft no aparece en CapCut tras copiar:** CapCut debe estar cerrado al copiar. Verificar con `pgrep -x CapCut`.

**Subtítulos descalibrados en CapCut:** revisar el SRT que generó Whisper — a veces hay líneas con timestamps 00:00:00,000 → 00:00:00,000 (vacías). Limpiar antes de pasar al MCP.

## Archivos de referencia

- `references/setup-macos.md` — Instalación completa (VectCutAPI + rclone + Whisper + MCP).
- `references/brand-kits.md` — Brand kits de clientes activos.
- `references/mcp-tools-reference.md` — Las 11 herramientas del MCP capcut-api.
- `references/safe-zones.md` — Zonas seguras por plataforma (Meta Reels, TikTok, Shorts).
- `references/templates.md` — Plantillas estructurales por duración/formato.
- `scripts/copy_to_capcut.sh` — Copiar draft a carpeta de CapCut.
- `scripts/process_client_clip.sh` — Orquestador: descarga + extracción audio + transcripción en un comando.

## Integración con el ecosistema JoinsClee

```
[Cliente graba el clip] → Drive
        ↓
ads-factory-clee (TÚ ESTÁS AQUÍ)
   ├─ MCP Drive: localizar archivo
   ├─ rclone: descargar binario
   ├─ ffmpeg: extraer audio
   ├─ Whisper: transcribir → SRT
   ├─ MCP capcut-api: construir draft
   ├─ Validación pre-save
   └─ Output: carpeta dfd_ + instrucciones
        ↓
[Editor humano] → refina 10-15% en CapCut
        ↓
[Exporta .mp4] → sube a Meta Ads Manager
```

Inputs upstream útiles:
- `video-ads-scriptwriter` puede haber definido el guion antes de grabar — usar como referencia para detectar mal el hook si Whisper duda
- `meta-ads-copywriter` define el copy de Meta Ads — pero NO va dentro del draft, va en el ads manager
- `ad-angles-engine` define los ángulos — útil cuando Cristhian pide variantes por ángulo

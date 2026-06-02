# Referencia MCP `capcut-api` — Las 11 herramientas

Documentación práctica de las herramientas del MCP de VectCutAPI.

## Las 11 herramientas

1. `create_draft` — Crear proyecto vacío
2. `add_video` — Agregar clip de video
3. `add_audio` — Agregar audio
4. `add_image` — Agregar imagen estática
5. `add_text` — Texto en pantalla
6. `add_subtitle` — Subtítulos quemados desde SRT
7. `add_effect` — Efecto visual / filtro
8. `add_sticker` — Sticker
9. `add_video_keyframe` — Animar propiedades con keyframes
10. `get_video_duration` — Duración de un asset
11. `save_draft` — Cerrar y guardar

---

## 1. `create_draft`

Siempre la primera llamada.

```python
create_draft(width=1080, height=1920)  # vertical
create_draft(width=1080, height=1080)  # cuadrado
create_draft(width=1920, height=1080)  # horizontal
```

Retorna `{"draft_id": "dfd_xxx", "draft_url": "..."}`.

---

## 2. `add_video`

```python
add_video(
    video_url="file:///Users/cristhian/dev/joinsclee-clients/paulina/raw/clip.mp4",
    draft_id=did,
    start=0,        # segundo en el timeline donde inicia
    end=30,         # segundo en el timeline donde termina
    volume=1.0,     # 0.0-1.0, 1.0 = audio original del clip
    transition="none",   # "fade_in", "fade_out", "none"
    track_name="main"
)
```

**Reglas críticas:**
- `video_url` debe ser URL completa (`file:///`, `http://`, `https://`). Paths relativos NO funcionan.
- Si el clip dura más que `end-start`, el server hace trim automático.
- Para B-roll superpuesto al clip principal, usar otro `track_name` (ej. `"broll_overlay"`).
- `volume=1.0` para clip del talento (mantener su voz), `volume=0.0` para B-roll silencioso.

---

## 3. `add_audio`

```python
# Música de fondo
add_audio(
    audio_url="file:///path/music.mp3",
    draft_id=did,
    start=0,
    end=30,
    volume=0.18,
    track_name="music"
)

# Voiceover separado (si el audio se procesó por separado del video)
add_audio(
    audio_url="file:///path/vo.mp3",
    draft_id=did,
    start=0.5,
    end=28,
    volume=1.0,
    track_name="voiceover"
)
```

---

## 4. `add_image`

```python
add_image(
    image_url="file:///path/logo.png",
    draft_id=did,
    start=25,
    end=30,
    position_x=-0.40,    # -1 (izq) a 1 (der)
    position_y=0.40,     # -1 (arriba) a 1 (abajo)
    scale=0.12,
    track_name="logo"
)
```

---

## 5. `add_text`

```python
add_text(
    text="¿Cansada de publicar sin resultados?",
    draft_id=did,
    start=0.3,
    end=3.0,
    font="Cormorant Garamond Bold",
    font_size=72,
    font_color="#1A1A1A",
    position_x=0,
    position_y=-0.30,
    shadow_enabled=False,
    background_enabled=False
)
```

**Con background (CTA card):**
```python
add_text(
    text="ÚNETE A LA COMUNIDAD",
    draft_id=did,
    start=27,
    end=30,
    font="Inter Bold",
    font_size=58,
    font_color="#FAF7F2",
    position_x=0,
    position_y=0.20,
    background_enabled=True,
    background_color="#C9966B",
    background_alpha=1.0,
    background_round_radius=12
)
```

**Multi-color (keywords destacadas):**
```python
add_text(
    text="3 errores que están MATANDO tu visibilidad",
    draft_id=did,
    start=4,
    end=8,
    font="Inter Bold",
    font_size=56,
    font_color="#FFFFFF",
    text_styles=[
        {"start": 12, "end": 20, "font_color": "#FF6B35"}  # "MATANDO"
    ]
)
```

---

## 6. `add_subtitle`

```python
add_subtitle(
    srt_content=srt_string,   # contenido SRT estándar
    draft_id=did,
    font="Inter Bold",
    font_size=38,
    font_color="#FAF7F2",
    background_enabled=True,
    background_color="#1A1A1A",
    background_alpha=0.80,
    background_round_radius=8,
    position_y=0.40
)
```

**SRT esperado:**
```
1
00:00:00,500 --> 00:00:03,000
¿Te cansaste de publicar sin resultados?

2
00:00:03,000 --> 00:00:06,500
Después de trabajar con 47 mujeres encontré algo

3
00:00:06,500 --> 00:00:10,000
que cambia TODO en menos de 30 días
```

**Limpieza pre-uso:** filtrar líneas con timestamps idénticos (Whisper a veces genera `00:00:00,000 --> 00:00:00,000` para silencios).

---

## 7. `add_effect`

Filtros y efectos. Catálogo del MCP incluye `"warm"`, `"cool"`, `"cinematic"`, `"glitch"`, `"vhs"`, etc.

```python
add_effect(
    effect_type="warm",
    draft_id=did,
    start=0,
    end=30,
    intensity=0.4
)
```

Para color grading consistente entre clips de fuentes distintas.

---

## 8. `add_sticker`

Stickers animados. **Úsalo con extrema moderación** — fácil hacer Ads que parecen amateur. Solo cuando aporta (flecha apuntando a un elemento, círculo destacando algo de la UI en demo).

---

## 9. `add_video_keyframe`

**La herramienta más poderosa.** Anima propiedades del clip.

```python
# Zoom-in en hook
add_video_keyframe(
    draft_id=did,
    track_name="main",
    property_types=["scale_x", "scale_y"],
    times=[0, 3],
    values=["1.0", "1.08"]
)

# Fade-in de logo
add_video_keyframe(
    draft_id=did,
    track_name="logo",
    property_types=["alpha"],
    times=[25, 26],
    values=["0.0", "0.8"]
)

# Pan lateral sutil del clip
add_video_keyframe(
    draft_id=did,
    track_name="main",
    property_types=["position_x"],
    times=[5, 10],
    values=["0.0", "-0.05"]
)
```

**Propiedades disponibles:** `scale_x`, `scale_y`, `alpha`, `position_x`, `position_y`, `rotation`.

---

## 10. `get_video_duration`

```python
result = get_video_duration(video_url="file:///path/clip.mp4")
# {"duration": 47.3}
```

Alternativa con ffprobe (más rápido, sin pasar por el MCP):
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 clip.mp4
```

---

## 11. `save_draft`

Última llamada.

```python
result = save_draft(draft_id=did)
# Crea carpeta dfd_xxx/ en el directorio donde corre capcut_server.py
```

---

## Patrón canónico — Ad vertical 30s desde clip crudo

```python
# 0. Inputs preparados
clip_path = "/Users/cristhian/dev/joinsclee-clients/paulina/raw/sesion_v3.mp4"
srt_content = open(clip_path.replace('.mp4', '.srt')).read()
clip_duration = 27.4  # de ffprobe

# 1. Crear draft
draft = create_draft(width=1080, height=1920)
did = draft["draft_id"]

# 2. Clip principal con audio del talento
add_video(
    video_url=f"file://{clip_path}",
    draft_id=did,
    start=0,
    end=clip_duration,
    volume=1.0,
    track_name="main"
)

# 3. Zoom-in sutil en el hook
add_video_keyframe(
    draft_id=did, track_name="main",
    property_types=["scale_x", "scale_y"],
    times=[0, 3], values=["1.0", "1.08"]
)

# 4. Hook text en pantalla (primera frase del SRT)
add_text(
    text="¿Cansada de publicar sin resultados?",
    draft_id=did, start=0.3, end=3.0,
    font="Cormorant Garamond Bold", font_size=72,
    font_color="#1A1A1A", position_y=-0.30
)

# 5. Subtítulos quemados sobre todo el cuerpo
add_subtitle(
    srt_content=srt_content,
    draft_id=did,
    font="Inter Bold", font_size=38, font_color="#FAF7F2",
    background_enabled=True, background_color="#1A1A1A",
    background_alpha=0.80, background_round_radius=8,
    position_y=0.40
)

# 6. Lower-third (presentación del talento)
add_text(
    text="Paulina Valencia  |  Coach de Hábitos",
    draft_id=did, start=1.5, end=5.0,
    font="Inter Medium", font_size=32,
    font_color="#C9966B", position_x=-0.35, position_y=0.25
)

# 7. CTA card (después del clip)
add_image(
    image_url="file:///path/paulina_logo.png",
    draft_id=did,
    start=clip_duration, end=clip_duration + 3,
    position_x=0, position_y=-0.15,
    scale=0.18, track_name="logo"
)

add_text(
    text="ÚNETE A LA COMUNIDAD",
    draft_id=did,
    start=clip_duration, end=clip_duration + 3,
    font="Inter Bold", font_size=58, font_color="#FAF7F2",
    background_enabled=True, background_color="#C9966B",
    background_alpha=1.0, background_round_radius=12,
    position_y=0.20
)

# 8. Guardar
result = save_draft(draft_id=did)
# Carpeta dfd_xxx/ generada en ~/dev/joinsclee-tools/VectCutAPI/
```

Resultado: draft listo para copiar a `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/` y refinar en CapCut.

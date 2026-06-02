# Zonas seguras por plataforma — ads-factory-clee

Define dónde puede ir el texto, lower-thirds, subtítulos y CTA sin que la UI nativa de cada plataforma los tape. Crítico para profesionalidad — la diferencia entre un Ad amateur y uno publishable está aquí.

## Sistema de coordenadas del MCP capcut-api

- Centro del frame: `(0, 0)`
- Esquinas: `(-1, -1)` arriba-izquierda, `(1, 1)` abajo-derecha
- `position_y = -0.5` está al 25% desde el top
- `position_y = 0.5` está al 75% desde el top

## Meta Reels / Instagram Reels (default)

Vertical 1080x1920. UI nativa de Instagram tapa:
- **Top 8%:** notch del dispositivo + barra de acciones de IG (cerrar, opciones)
- **Bottom 18%:** username + caption + audio + botones laterales
- **Right side 12%:** stack de íconos (like, comment, share, save)

**Mapeo a coordenadas del MCP:**

| Elemento | Position Y | Position X | Notas |
|---|---|---|---|
| Hook text grande | `-0.30` a `-0.40` | `0` | Centrado, evita zona top |
| Subtítulos quemados | `0.35` a `0.45` | `0` | Centrado, evita zona bottom |
| Lower-third presentación | `0.25` | `-0.35` | Lado izquierdo (lejos de íconos derechos) |
| Logo (cliente) | `0.30` a `0.40` | `-0.40` a `-0.30` | Esquina inferior izquierda |
| CTA card | `0.15` a `0.25` | `0` | Centrado, encima de zona bottom |

## TikTok

Vertical 1080x1920. UI nativa tapa MÁS que IG:
- **Top 15%:** for you / following + sound + search
- **Bottom 22%:** username + caption + sounds + comments preview
- **Right side 15%:** stack de íconos (más grueso que IG)

**Mapeo a coordenadas:**

| Elemento | Position Y | Position X | Notas |
|---|---|---|---|
| Hook text | `-0.25` a `-0.35` | `0` | Más arriba para evitar zona expandida bottom |
| Subtítulos | `0.20` a `0.30` | `0` | Subir respecto a IG |
| Lower-third | `0.15` | `-0.30` | |
| Logo | `0.20` a `0.30` | `-0.35` | |
| CTA card | `0.05` a `0.15` | `0` | Más al centro para no chocar con bottom |

**Detalle TikTok:** muchos usuarios ven en mute con subtítulos manualmente activados. Los subtítulos quemados DEBEN existir siempre, no son opcionales.

## YouTube Shorts

Vertical 1080x1920. UI más limpia que TikTok/IG:
- **Top 10%:** botón de pausa + opciones
- **Bottom 15%:** título + canal + interacciones (menos invasivo)
- **Right side:** mínimo, casi 0

**Mapeo a coordenadas:**

| Elemento | Position Y | Position X | Notas |
|---|---|---|---|
| Hook text | `-0.35` a `-0.40` | `0` | Puede ir más arriba |
| Subtítulos | `0.30` a `0.40` | `0` | |
| Lower-third | `0.25` | `-0.40` | Aprovechar el espacio derecho libre |
| Logo | `0.35` | `-0.40` | |
| CTA card | `0.20` | `0` | |

## Meta Feed (cuadrado 1080x1080)

Aspect ratio 1:1. UI mínima en el feed.

| Elemento | Position Y | Position X | Notas |
|---|---|---|---|
| Hook text | `-0.30` a `-0.40` | `0` | |
| Subtítulos | `0.30` a `0.40` | `0` | |
| Lower-third | `0.30` | `-0.35` | |
| Logo | `-0.40` | `-0.40` | Esquina superior izquierda |
| CTA card | `0.20` | `0` | |

## YouTube Pre-Roll (horizontal 1920x1080)

| Elemento | Position Y | Position X | Notas |
|---|---|---|---|
| Hook text | `-0.30` | `0` | |
| Subtítulos | `0.35` | `0` | Posición típica TV-safe |
| Lower-third | `0.30` | `-0.55` | Aprovechar ancho horizontal |
| Logo | `-0.40` | `0.50` | Esquina superior derecha |
| CTA card | `0.20` | `0` | |

## Tabla resumen — qué default usar

| Plataforma destino | Default safe zone preset |
|---|---|
| Cristhian no especifica | Meta Reels (más restrictivo de IG/Meta) |
| Cristhian dice "TikTok" | TikTok (el más restrictivo) |
| Cristhian dice "Shorts" | YouTube Shorts |
| Cristhian dice "Meta y TikTok" | TikTok (más restrictivo gana) |
| Cristhian dice "feed" o "cuadrado" | Meta Feed |
| Cristhian dice "YouTube Ads" | YouTube Pre-Roll horizontal |

**Regla de oro:** cuando hay duda entre plataformas, usar el más restrictivo (TikTok). Un Ad que funciona en TikTok funciona en Meta Reels, pero no al revés.

## Validación visual

Antes de guardar el draft, la skill verifica que ningún texto cae fuera de safe zone. Pseudocódigo:

```
para cada texto agregado:
    position_y_abs = abs(position_y)
    # Verificar que el texto + su tamaño cabe
    if (position_y - text_size_normalized) < safe_zone_top:
        warning("Texto X muy cerca del top")
    if (position_y + text_size_normalized) > safe_zone_bottom:
        warning("Texto X muy cerca del bottom")
```

Si hay warning, reportar a Cristhian con la opción de ajustar o proceder consciente.

## Ancho de texto y wrap

Como regla — todo texto en pantalla NUNCA debe ocupar más del 85% del ancho del frame. Si una línea es más larga, partirla en 2 líneas. El cálculo aproximado:

```
ancho_texto_estimado = font_size * num_caracteres * 0.55  # promedio width-to-height
max_ancho = frame_width * 0.85
if ancho_texto_estimado > max_ancho:
    forzar_wrap_o_reducir_font_size
```

Para tipografías bold el factor es ~0.6, para regular ~0.5, para condensed ~0.45. La skill usa 0.55 como promedio conservador.

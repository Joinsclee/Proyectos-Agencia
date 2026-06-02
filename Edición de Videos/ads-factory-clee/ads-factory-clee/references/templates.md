# Plantillas estructurales por formato — ads-factory-clee

Blueprints temporales para los formatos comunes. Adaptar al clip crudo del cliente y brand kit.

## Convención

Estos templates asumen que el **clip crudo del cliente ya tiene la estructura interna del Ad** (hook + cuerpo + payoff). La skill identifica los marcadores en el SRT y aplica capas visuales sobre esa estructura, no reordena el contenido del clip.

## Formato 1 — Vertical 15s (Meta Reels corto)

**Estructura típica:**
- 0-2s: Hook
- 2-12s: Cuerpo (1-2 escenas)
- 12-15s: CTA card

**Capas:**
- `main` — clip del cliente (audio incluido)
- `text_hook` — texto en pantalla 0.3-2.5s (gran tipografía brand)
- `subtitles` — quemados, sincronizados a SRT del clip
- `lower_third` — 1-3s (presentación rápida)
- `cta_card` — overlay 12-15s

**Decisiones default:**
- Keyframe zoom-in 0→2s (scale 1.0 → 1.06)
- Sin B-roll overlay (15s no alcanza para más)
- Logo solo en CTA card

---

## Formato 2 — Vertical 30s (Meta Ad estándar — DEFAULT)

**Estructura típica:**
- 0-3s: Hook + pattern interrupt
- 3-22s: Cuerpo (dolor → solución)
- 22-27s: Payoff / promesa específica
- 27-30s: CTA card

**Capas:**
- `main` — clip del cliente
- `text_hook` — 0.3-3s
- `subtitles` — todo el cuerpo (3-27s)
- `lower_third` — 1.5-5s
- `broll_overlay` — opcional, en momentos del SRT donde el talento menciona algo concreto
- `cta_card` — 27-30s

**Decisiones default:**
- Zoom-in 0→3s (1.0 → 1.08)
- B-roll overlay solo si Cristhian lo proporcionó
- Música +0.05 en segundos 20+ si hay track (no incluida por default)

---

## Formato 3 — Vertical 45-60s (Mini-VSL)

**Estructura típica:**
- 0-5s: Hook + curiosidad
- 5-15s: Storytelling/anécdota
- 15-30s: Problema + agitación
- 30-50s: Solución + diferenciador
- 50-57s: Oferta + urgencia
- 57-60s: CTA

**Capas:**
- Todas las del formato 30s
- **Adicional:** `text_overlays_track` para conceptos clave que aparecen durante el cuerpo (números, datos, frases)
- **Adicional:** segundo lower-third con credencial específica en segundos 15-20

**Decisiones default:**
- Cuts más pausados (zoom keyframes más lentos)
- Pattern interrupt visual en segundo 30 (zoom punch o cambio de plano)
- CTA con número/dato específico, no genérico

---

## Formato 4 — Cuadrado 30s (Meta Feed)

Diferencias vs vertical:
- Aspect ratio 1:1 (1080x1080)
- `position_y` ajustado: hook text más al centro (-0.20)
- Subtítulos en `position_y = 0.30` (cerca del bottom pero zona segura)
- Logo esquina superior izquierda

---

## Formato 5 — Horizontal 30s (YouTube Pre-Roll)

- 1920x1080
- Asumir 5s skippable: hook + brand visible antes del segundo 5
- CTA en lower-third permanente desde segundo 8 (lateral, no center)
- Subtítulos `position_y = 0.35` (TV-safe)

---

## Patrón de variantes — Modo factory

Cuando se piden N variantes (max 5), mantener constante:
- Cliente, brand kit, clip principal, subtítulos del cuerpo, lower-third, CTA card, música (si hay)

Variar solo el **hook** (primeros 3s):

**V1 — Hook dolor:**
- Texto: pregunta de frustración ("¿Te cansaste de X?")
- Keyframe: zoom-in lento (1.0 → 1.08)
- Audio: del clip (no se modifica)

**V2 — Hook curiosidad:**
- Texto: revelación ("Descubrí algo que cambia TODO")
- Keyframe: estático con texto que entra animado (fade-up)
- Texto en pantalla aparece con delay 0.5s, no instantáneo

**V3 — Hook resultado:**
- Texto: declaración de logro ("Así pasé de 0 a 47 clientes en 30 días")
- Keyframe: zoom-punch en segundo 1.5 (1.0 → 1.0 → 1.12)
- Visual frenético

**V4 — Hook pregunta directa:**
- Texto: pregunta retórica simple ("¿Has intentado X y no funcionó?")
- Keyframe: pan lateral sutil (-0.0 → -0.04)
- Tono conversacional

**V5 — Hook polémica/contraintuitivo:**
- Texto: declaración disruptiva ("Deja de hacer X. Está matando tu Y.")
- Keyframe: bounce en segundo 0.5 (1.0 → 1.15 → 1.08)
- Texto en pantalla con keyword en color contrast alto

**Nombrado consistente:**
- `dfd_{cliente}_hook_dolor_v1`
- `dfd_{cliente}_hook_curiosidad_v2`
- `dfd_{cliente}_hook_resultado_v3`
- `dfd_{cliente}_hook_pregunta_v4`
- `dfd_{cliente}_hook_polemica_v5`

---

## Anti-patrones críticos

- ❌ Fade-in del primer clip — siempre cut directo. Fade pierde retención (-15% en primeros 3s según benchmarks Meta Ads)
- ❌ Música a volumen alto desde segundo 0 — compite con voz, ojo ve mute → no engancha
- ❌ Logo grande al inicio — es Ad, no intro de YouTube
- ❌ Texto en pantalla con más de 8 palabras simultáneas — no se alcanza a leer
- ❌ CTA solo verbal sin texto — 60-80% ve en mute
- ❌ Transiciones elaboradas entre cuts del talento (whip, glitch en mid-roll) — distraen del mensaje
- ❌ Más de 1 sound FX por Ad — abruma, parece amateur
- ❌ Subtítulos en zona tapada por UI nativa (bottom 18% Meta, bottom 22% TikTok)
- ❌ Color de subtítulos sin background y sin stroke — ilegible sobre fondos variables
- ❌ Hook genérico ("Hola, hoy te voy a contar...") — los primeros 3s definen el 70% de retención

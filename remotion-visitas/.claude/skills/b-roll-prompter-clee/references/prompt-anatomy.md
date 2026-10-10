# Anatomía de un prompt cinematográfico (2026)

Los modelos de video/imagen IA de 2026 (Veo, Kling, Runway, Luma, Higgsfield, Flux, Nano Banana) obedecen mejor a un prompt **estructurado** que a una lista de tags. Esta es la gramática que produce B-roll usable.

## La fórmula canónica

Orden recomendado (basado en la guía oficial de Veo 3.1, válido para todos):

```
[Cinematografía/Encuadre] + [Sujeto] + [Acción] + [Contexto/Entorno] + [Estilo y Ambiente]
```

Expandido a la **gramática de 8 puntos** (usa los que apliquen, en este orden):

1. **Encuadre / tipo de plano** — al inicio: *extreme close-up · macro · medium close-up · full body · wide establishing*.
2. **Sujeto + acción** — el "quién/qué" y una conducta concreta (verbos específicos).
3. **Óptica / lente** — *shot on 85mm prime · 100mm macro · 24mm wide · 35mm anamorphic*; profundidad de campo, rack focus.
4. **Movimiento de cámara** — 5-10 palabras, sin relleno (ver `camera-moves.md`): *slow dolly-in toward the subject*.
5. **Física de iluminación** — key/fill/rim, temperatura (3200K cálido ↔ 5600K frío), volumétricos (niebla, motas de polvo).
6. **Estilo / film stock / grade** — *Kodak 2383 · teal-and-orange · subtle 35mm film grain*.
7. **Audio** (solo Veo / Kling 2.6 / Sora): diálogo entre comillas, `SFX:`, `Ambient:`.
8. **Mood / ritmo** — *calm and premium · energetic · tactile · aspirational*; lento = calma, rápido = energía.

**Reglas de longitud:** prompt total **30-60 palabras**; el movimiento de cámara **5-10 palabras** (más adjetivos = peor resultado). Termina SIEMPRE con **`9:16`** (o el ratio del proyecto).

**Negative prompts específicos, no vagos:** ✅ *"an empty studio with no people, no text, no logos"* · ❌ *"no clutter"*.

## El "style block" (consistencia de marca)

Define **un bloque de estilo fijo por cliente** (derivado del brand kit — ver `brand-kit-mapping.md`) y anéxalo al final de CADA prompt del cliente. Es la forma de consistencia textual, imprescindible porque Veo 3.1 **no** acepta referencia de *estilo* por imagen (solo de sujeto).

Ejemplo de style block SAVIAS:
```
...soft diffused natural window light, shallow depth of field, warm color grade,
subtle 35mm film grain, calm and premium mood, 9:16.
```

## Cuatro prompts de ejemplo (fórmula aplicada)

**A · Producto fotorrealista (jabonería premium):**
```
Extreme macro close-up, a handcrafted sage-green soap bar on wet slate, water
droplets sliding down its embossed logo, shot on 100mm macro lens, very shallow
depth of field, slow dolly-in, soft diffused window light from the left at 5200K,
dust motes floating, warm natural color grade, subtle film grain, calm premium mood, 9:16.
```

**B · Lifestyle / persona (marca personal):**
```
Medium close-up, a confident founder in a linen blazer turning toward camera with
a subtle smile, sunlit minimalist studio with plants softly out of focus behind,
shot on 85mm portrait lens, slow push-in, warm golden key light with gentle rim
light, cinematic, aspirational and intimate mood, 9:16.
```

**C · Textura / detalle macro (retención):**
```
Macro shot, honey-colored oil pouring in slow motion over a bar of soap, glossy
highlights catching the light, macro lens with extreme shallow depth of field,
static locked-off frame, high-contrast side lighting at 3200K, rich amber tones,
tactile and sensory mood, slow rhythm, 9:16.
```

**D · Metafórico / conceptual (tech — IA LAB / HUMANOX):**
```
Wide establishing shot, thousands of glowing data particles converging into a
single luminous sphere above a dark reflective floor, slow orbit around the sphere,
35mm anamorphic lens with lens flare, cool blue volumetric haze at 6500K,
futuristic awe-inspiring mood, cinematic teal color grade, 9:16.
```

## Diferencias: text-to-video vs image-to-video vs imagen

| | Text-to-Video | Image-to-Video | Modelos de imagen |
|---|---|---|---|
| **Qué describe el prompt** | TODO: sujeto + entorno + luz + acción | SOLO movimiento y acción (el frame ya fija look/composición) | Sujeto + estilo + parámetros (`--ar`, `--sref`) |
| **Verbos** | acción + velocidad ("slowly saunters") | cómo se mueve lo que ya existe | descriptivo estático |
| **Control de marca** | menor | **mayor** (partes de tu propio still) | fija el look del still |
| **Cuándo** | concepto, b-roll genérico | shots que deben respetar la marca | generar el frame inicial y stills |

Regla práctica: **text-to-video para concepto/genérico; image-to-video para lo que debe verse "del cliente".**

## Errores comunes de la gen-video IA y cómo mitigarlos en el prompt

| Falla | Mitigación |
|---|---|
| **Manos/dedos** deformes | Evita close-ups de manos manipulando objetos finos; planos cortos/estáticos u ocultar manos |
| **Texto** inestable en video | **NO generes texto legible con el motor de video: quémalo en post** (lower-thirds del editor) |
| **Morphing / deformación** | Clips **cortos 2-5s**, un solo sujeto dominante, movimiento de cámara simple |
| **Flicker / warping temporal** | Para i2v: source **estable y bien iluminado** (nada oscuro/movido); upscaling final |
| **Física compleja** falla | Nombra fuentes de luz y anclas fijas; evita colisiones/multi-objeto |
| **Inconsistencia entre clips** | **Style block fijo** + mismo modelo + imagen de referencia + grade en post con el LUT de marca |

## Checklist antes de entregar un prompt

- [ ] Empieza por el encuadre y termina en `9:16`.
- [ ] 30-60 palabras; movimiento de cámara ≤10 palabras.
- [ ] Lleva el **style block** del cliente pegado al final.
- [ ] Un solo sujeto dominante y un solo movimiento de cámara.
- [ ] Ningún texto crítico delegado al motor (se quema en post).
- [ ] Indica la herramienta recomendada y si es t2v o i2v (ver `tools.md`).

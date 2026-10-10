# Banco de prompts semilla por cliente

Prompts de arranque listos para adaptar. **Los style blocks son SEMILLA** — el Brand Kit Visual del cliente manda (ver `references/brand-kit-mapping.md`). Ajusta luz/grade/mood al YAML real antes de generar. Todos en `9:16`.

---

## SAVIAS — jabonería artesanal premium (pausado, cálido, sensorial)

**Style block:** `soft diffused natural window light, shallow depth of field, warm color grade, subtle 35mm film grain, calm and premium mood, 9:16.`

- **Producto (literal):** `Extreme macro close-up, a handcrafted sage-green soap bar on wet slate, water droplets sliding down its embossed logo, 100mm macro lens, very shallow depth of field, slow dolly-in, [style block]`
- **Textura (macro):** `Macro shot, honey-colored oil pouring in slow motion over a soap bar, glossy highlights, macro lens, static locked-off frame, side lighting at 3200K, rich amber tones, tactile mood, slow rhythm, [style block]`
- **Entorno (establishing):** `Wide establishing shot, a serene artisan soap workshop with morning light through a window, drying soap bars on wooden racks, slow tracking shot, dust motes in the air, [style block]`
- **Ingrediente (metafórico):** `Close-up, dried calendula flowers falling in slow motion onto a linen cloth, gentle overhead light, static frame, warm natural tones, sensory and calm, [style block]`

## Ovejas Voladoras — marca personal (hipercinético, enérgico)

**Style block:** `punchy contrast, energetic natural light, dynamic, subtle film grain, 9:16.`

- **Persona (prueba):** `Medium shot, a creator gesturing confidently mid-explanation in a modern studio, subtle handheld, fast push-in, bright punchy light, energetic mood, [style block]`
- **Transición (flash):** `Quick whip-pan across a bright workspace with screens and notes, motion blur, 1-2 second energetic clip, [style block]`
- **Concepto de crecimiento (metafórico):** `Dynamic upward tracking shot following glowing ascending arrows/graph bars, punchy saturated colors, fast rhythm, energetic mood, [style block]`

## HUMANOX — (tech / performance — calibrar al brand kit)

**Style block (semilla, calibrar):** `high contrast, cool cinematic tones, sleek surfaces, dramatic lighting, 9:16.`

- **Producto/tech:** `Macro close-up, a sleek device on a dark reflective surface, cool rim light tracing its edges, slow orbit, cool teal grade, sharp and premium mood, [style block]`
- **Metafórico:** `Wide shot, glowing energy flowing through dark geometric forms, slow dolly-in, cool blue volumetric haze, futuristic mood, [style block]`

## Barco de Papel / Origami — (calibrar al brand kit)

**Style block (semilla, calibrar):** `soft even light, clean neutral palette, gentle mood, negative space, 9:16.`

- **Textura:** `Macro shot, hands folding crisp white paper into an origami form, soft diffused light, static frame, clean neutral tones, delicate and precise mood, [style block]`

## IA LAB — (tech/educativo — suele faceless; calibrar)

**Style block (semilla, calibrar):** `clean modern light, cool neutral tones, sleek minimal, 9:16.`

- **Conceptual:** `Wide establishing shot, thousands of glowing data particles converging into a luminous sphere above a dark reflective floor, slow orbit, cool blue haze at 6500K, futuristic awe-inspiring mood, cinematic teal grade, [style block]`

> IA LAB y VUELA suelen ir en formato **faceless/explicador** → considera resolver el visual con Hyperframes `faceless-explainer` en vez de B-roll IA, cuando la pieza es 100% gráfica.

## VUELA — (minimalista clean — calibrar)

**Style block (semilla, calibrar):** `bright even light, neutral palette, negative space, clean and airy mood, 9:16.`

- **Establishing:** `Wide minimalist shot, a single subject in a bright airy space with lots of negative space, slow static push-in, clean neutral tones, calm and aspirational mood, [style block]`

---

## Plantillas genéricas por tipo (cualquier cliente)

Rellena `{}` y pega el style block del cliente:

- **Literal producto:** `Macro close-up, {producto} on {superficie}, {acción sutil}, 100mm macro lens, shallow depth of field, slow dolly-in, [style block]`
- **Metafórico:** `{plano} shot, {metáfora visual del concepto}, {movimiento de cámara lento}, {luz}, {mood}, [style block]`
- **Textura/detalle:** `Macro shot, {material/ingrediente} {acción en slow motion}, glossy highlights, static locked-off frame, {luz}, tactile mood, [style block]`
- **Entorno:** `Wide establishing shot, {espacio del cliente} with {calidad de luz}, slow tracking shot, [style block]`
- **Prueba/persona:** `Medium close-up, {sujeto} {acción que demuestra la claim}, {óptica}, {movimiento}, {luz}, [style block]`

Recuerda: negative prompt específico, un solo movimiento de cámara, 2-5s, y el texto se quema en post (no en el motor).

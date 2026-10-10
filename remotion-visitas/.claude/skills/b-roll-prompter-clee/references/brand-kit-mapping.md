# Mapear el Brand Kit → parámetros del prompt

El B-roll IA se ve "del cliente" solo si replica su **tratamiento fotográfico**. La fuente de verdad es el Brand Kit Visual (YAML de `brand-kit-builder-clee`). **Si el cliente no tiene brand kit → detente y delega a `brand-kit-builder-clee`** antes de generar prompts.

## Campos del brand kit que se leen

Del bloque `tratamiento_fotografico` (y adyacentes) del YAML:

| Campo del brand kit | Se traduce a (prompt) |
|---|---|
| `luz` ("natural difusa" / "estudio" / "golden hour") | Iluminación explícita: *"soft diffused natural window light"*, *"controlled studio softbox lighting"*, *"warm golden-hour backlight"* |
| `color_grading` ("cálido" / "frío" / "desaturado") | Grade/film look: *"warm color grade, soft highlights"*, *"cool desaturated tones"*, *"muted earthy palette"* |
| `encuadre_dominante` ("close-up" / "medium" / "wide") | Shot type: *"macro close-up"*, *"medium shot"*, *"wide establishing shot"* |
| `sujetos_tipicos` (["personas en acción", "close-ups producto"]) | El sujeto/acción del clip |
| `mood_fotografico` (3 adjetivos) | Mood al final del prompt: *"calm, artisanal, sensory"* |
| `post_procesado` (grain, filtro, vignette) | Textura de película: *"subtle 35mm film grain"*, *"soft vignette"*, *"clean digital"* |
| `notas_para_b_roll` (texto libre) | **Léelo siempre** — instrucciones específicas del cliente para B-roll |
| `paleta` (HEX de marca) | Colores presentes en la escena (objetos/luz de ese color), no como overlay |
| `elementos_graficos_caracteristicos` (texturas, formas) | Props/materiales en escena: *"artisanal paper texture"*, *"natural linen backdrop"* |

## La tabla mood → look (validación cruzada)

Coherente con `brand-kit-builder-clee`:

| Mood de marca | Luz / grade | Palabras clave de prompt |
|---|---|---|
| Calmo, artesanal (SAVIAS) | Natural difusa, cálido | soft window light, warm tones, linen, wood, macro, slow |
| Agresivo, tech (HUMANOX / IA LAB) | Alto contraste, frío/neón | dramatic contrast, cool neon accents, sleek surfaces, sharp |
| Elegante, autoritario | Cálido profundo, dorado | rim light, deep warm shadows, gold accents, cinematic |
| Minimalista, clean (VUELA) | Neutro, plano suave | bright even light, neutral palette, negative space, clean |
| Vibrante, juvenil (Ovejas) | Saturado, dinámico | punchy saturated colors, energetic light, fast, playful |

## Usar imagen de referencia (fija el look de forma fiable)

El texto solo aproxima el look; una **imagen de referencia** lo fija:

1. **Style/reference image**: pásale al modelo (image-to-video, o "style reference" en imagen) un frame del propio material del cliente, un producto real, o un still generado que ya acertó el look. Es la forma más fiable de consistencia entre clips.
2. **Frame inicial (image-to-video)**: genera primero un still perfecto (imagen IA con el look de marca) y anímalo con image-to-video → controlas composición y color antes de mover.
3. **Character/product consistency**: para que el mismo producto/persona aparezca igual en varios clips, reutiliza la misma imagen de referencia en todos.

## Regla de consistencia entre clips

Cuando generes **varios** clips de B-roll para un mismo video, fija en TODOS: misma `luz`, mismo `color_grading`, mismo `post_procesado` y (si aplica) la misma imagen de referencia. Un clip con look distinto "grita" y rompe la percepción de marca. Documenta el "look lock" (las 3-4 frases fijas de estilo) y pégalas al final de cada prompt.

## Semilla vs brand kit real

Los perfiles de `clee-video-editor/profiles/*.yaml` traen colores/estilo **semilla**. El **brand kit del cliente manda**: si difieren, usa el brand kit. Nunca inventes un look; si falta el dato, pregunta o deriva del `mood_fotografico`.

---
name: b-roll-prompter-clee
description: Genera prompts cinematográficos optimizados para IA generativa de video e imagen (Veo, Kling, Luma, Runway, Higgsfield, Flux, Nano Banana Pro, imagegen) que producen B-roll con la identidad visual exacta del cliente. Lee el Brand Kit Visual (tratamiento fotográfico) de brand-kit-builder-clee y traduce luz, color grading, encuadre y mood a prompts listos para pegar, con recomendación de herramienta (text-to-video vs image-to-video), movimiento de cámara y style block de marca. Alimenta el paso 10 (B-roll) de clee-video-editor. Para clientes JoinsClee (SAVIAS, Ovejas Voladoras, HUMANOX, Barco de Papel/Origami, IA LAB, VUELA). Usar SIEMPRE cuando se mencione: prompt de B-roll, generar B-roll con IA, B-roll para el video, prompt cinematográfico, prompt para Veo/Kling/Luma/Runway/Higgsfield, prompt para imagen de producto, necesito tomas de apoyo, recursos visuales para el reel, b-roll-prompter, o frases como "hazme prompts de B-roll para SAVIAS", "necesito tomas de la espuma del jabón", "genera recursos cinematográficos para este guion", "qué le pido a Veo para este clip". NO usar para: editar/montar el video (clee-video-editor), gráficos estáticos PNG de marca (brand-graphics-clee), overlays animados para CapCut (motion-snippets-clee), miniaturas de YouTube (thumbnail-prompter), ni construir el brand kit (brand-kit-builder-clee).
---

# b-roll-prompter-clee — Prompts de B-roll IA con identidad de marca

Convierte un momento del guion (o una keyword) en **prompts cinematográficos listos para pegar** en un generador de video/imagen IA, de modo que el B-roll se vea **100% del cliente**. Es la fuente de recursos visuales generados para el **paso 10 de `clee-video-editor`** (donde el B-roll entra EN la palabra clave que ilustra).

No genera el video ni lo edita: entrega el **prompt + la herramienta recomendada + el tipo (t2v/i2v) + el movimiento de cámara + el style block de marca**. El humano (o un MCP como Higgsfield) lo ejecuta.

## Lugar en el ecosistema

```
brand-kit-builder-clee  →  [Brand Kit Visual: tratamiento_fotografico, notas_para_b_roll]
                                        ↓
                          b-roll-prompter-clee  (ESTA skill)
                                        ↓
              [prompts + herramienta + style block]  →  Veo / Kling / Luma / imagegen ...
                                        ↓
                          clip de B-roll  →  clee-video-editor (paso 10)
```

Complementa a `brand-graphics-clee` (gráficos **estáticos** PNG) y `motion-snippets-clee` (overlays **animados** de marca): esta skill cubre el **B-roll generativo** (metraje/imágenes cinematográficas inventadas).

## Cuándo se activa

- Un video en edición necesita B-roll que **no existe** en el material del cliente (conceptos, metáforas, tomas imposibles, texturas/establishing premium).
- Se conoce el **cliente** (define el look) y **qué debe ilustrar** el B-roll (la keyword/frase del guion).

**Prerrequisito duro:** el cliente debe tener **Brand Kit Visual** documentado. Si no lo tiene → **detente y delega a `brand-kit-builder-clee`** (sin brand kit, el B-roll no se ve del cliente). Si el cliente tiene **stock propio** que sirve, prefiérelo antes que generar (regla de craft: material real > IA).

## Flujo de trabajo

**1 · Recoger el brief.** Necesitas: **cliente**, **qué debe ilustrar** (keyword/frase del guion o descripción), **cantidad** de clips, y **formato** (default 9:16). Opcional: momento emocional (pico vs puente), duración objetivo. Si falta algo crítico, pregunta UNA vez.

**2 · Cargar el look de marca.** Lee el `tratamiento_fotografico` y `notas_para_b_roll` del Brand Kit (o el perfil de `clee-video-editor/profiles/<cliente>.yaml` como semilla). Construye el **style block** fijo del cliente (ver `references/brand-kit-mapping.md`).

**3 · Decidir el tipo de B-roll** (`references/broll-taxonomy.md`): literal / metafórico / textura / entorno / prueba. Esto define sujeto, duración y ritmo.

**4 · Elegir movimiento de cámara** (`references/camera-moves.md`) por la emoción del momento y el ritmo de la marca (lento/premium vs enérgico/hype).

**5 · Elegir herramienta y tipo** (`references/tools.md`): text-to-video (concepto/genérico) vs image-to-video (control de marca: still primero, luego animar). Recomienda el modelo por caso de uso; **parametriza la versión**.

**6 · Escribir el prompt** con la fórmula de 8 puntos (`references/prompt-anatomy.md`), 30-60 palabras, style block al final, `9:16`. Un sujeto, un movimiento.

**7 · Entregar** en el formato de salida de abajo. Si se piden varias tomas, fija el **mismo style block e imagen de referencia** en todas (consistencia).

## Formato de salida

Para cada clip:

```
### Clip N — [qué ilustra] · [tipo de B-roll]
Herramienta: Veo 3.1 (image-to-video)   ·   Formato: 9:16 · ~3s
Frame inicial (si i2v): [prompt de imagen para Flux 2 / Nano Banana Pro]
Prompt de video:
> [prompt completo de 30-60 palabras con la fórmula + style block]
Negative: [específico]
Nota de edición: entra en la palabra "____" del guion (L-cut), corte a los ~3s.
```

Cuando entregues una tanda, incluye arriba el **STYLE BLOCK del cliente** una vez y referéncialo, para no repetirlo entero en cada prompt.

## Reglas no negociables

- **9:16 nativo desde el prompt** (nunca generar en 16:9 y recortar).
- **Style block del cliente en TODOS los prompts** de una tanda (consistencia).
- **Ningún texto crítico al motor de video** — se quema en post con el editor.
- **Clips cortos (2-5s), un sujeto, un movimiento** (evita morphing/flicker).
- **Nunca fabricar una "prueba" falsa** (resultado/cifra que no ocurrió): rompe la confianza y la regla anti-alucinación de QA.
- **Parametrizar el modelo** — verifica versión/precio vigentes; no dependas de modelos en sunset (p.ej. Sora 2).

## Referencias

- `references/prompt-anatomy.md` — la fórmula de 8 puntos, ejemplos, t2v vs i2v, mitigación de errores.
- `references/brand-kit-mapping.md` — traducir `tratamiento_fotografico` → prompt; style block; imagen de referencia.
- `references/broll-taxonomy.md` — los 5 tipos de B-roll y su rol en la retención.
- `references/camera-moves.md` — movimientos de cámara y su emoción.
- `references/tools.md` — Veo/Kling/Luma/Runway/Higgsfield/Flux/Nano Banana/imagegen: cuál para qué.
- `templates/prompt-library.md` — banco de prompts semilla por nicho/cliente, listos para adaptar.

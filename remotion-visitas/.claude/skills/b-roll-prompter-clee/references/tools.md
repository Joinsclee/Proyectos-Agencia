# Herramientas de generación (2026) y cuál elegir

> **Parametriza el modelo, no lo hardcodees.** Las versiones se mueven cada 4-8 semanas (Veo 3→3.1, Kling 2.x→2.5/2.6/3.0, Flux 1.1→2, Sora 2 en *sunset*). El prompt es reutilizable; el destino cambia. Confirma versión/precio vigente antes de comprometer presupuesto.

## Video IA — cuál usar para qué

| Herramienta | Fuerte en | i2v/t2v | Camera controls | Audio nativo | Acceso desde Claude Code |
|---|---|---|---|---|---|
| **Veo 3.1** (Google) | Hero shots, calidad cine, **9:16 nativo**, **audio incluido**, consistencia con "Ingredients" (hasta 3 refs de sujeto) | ambos | vía prompt | **Sí** | **El mejor**: Gemini API / Vertex AI |
| **Kling 2.5/3.0** (Kuaishou) | **Movimiento** + coste + **color neutro** (fácil de gradear); 3.0 hace 4K | ambos + motion brush | **Sí (los mejores por prompt)** | 2.6+ | fal.ai / PiAPI / WaveSpeed |
| **Luma Ray 3** | **Establishing, product reveal, macro de material** (ideal SAVIAS: espuma, texturas, luz) | ambos | consistente | limitado | SDKs + Amazon Bedrock |
| **Runway Gen-4/4.5 + Aleph** | **Editar** b-roll ya generado (por texto), compositing, **References mantiene estilo multi-shot** | ambos | keyframes de cámara | limitado | API oficial |
| **Higgsfield** (agregador) | **70+ presets de cámara** + Marketing Studio; para el editor humano | ambos | **Sí (su diferencial)** | según modelo | **MCP + CLI** (no REST); apto para orquestación agéntica |
| **Hailuo/MiniMax 2.3** | Movimiento físico suave, barato | ambos | estilos | sí | MiniMax API |
| ~~**Sora 2**~~ | — | — | — | — | ⚠️ **EN SUNSET (API se apaga 2026-09-24). No usar como dependencia.** Solo vía agregadores si es imprescindible. |

## Imagen IA — para stills y frame inicial de i2v

| Modelo | Mejor para | Acceso |
|---|---|---|
| **Nano Banana Pro** (Gemini 3 Pro Image) | Fotorrealismo grounded, **consistencia de personaje** (hasta 5 personas por texto), texto legible (~95%) | API de pago (sin free tier programático). También `thumbnail-prompter` lo usa |
| **Flux 2** (Black Forest Labs) | **El mejor fotorrealismo de producto/humano/editorial** | Replicate |
| **Ideogram 3** | **Texto dentro de imagen** (packaging, pósters) | API |
| **Seedream 5** (ByteDance) | **Replicar una foto de referencia del cliente** (identidad visual) | barato (~$0.03/img) |
| **imagegen** (skill local) | Generación/edición rápida de bitmaps desde Claude Code, cutouts | skill ya disponible en este entorno |
| **Midjourney v7/v8** | Look artístico de marca (`--sref`) | suscripción, sin API abierta |

## Reglas de enrutamiento (heurística)

- **Producto premium / textura / macro** (SAVIAS, jabonería) → still en **Flux 2** o **Nano Banana Pro** → animar con **Luma Ray 3** o **Kling i2v**.
- **Persona / fundador consistente entre clips** (marca personal, Ovejas) → **Nano Banana Pro** (o Seedream 5 desde foto real) → **Veo 3.1 Ingredients** i2v.
- **Concepto / metáfora / tech** (IA LAB, HUMANOX, VUELA) → **Veo 3.1** o **Kling** t2v; establishing atmosférico → **Luma**.
- **Clip que necesita audio incluido** → **Veo 3.1** (te ahorra buscar SFX).
- **Hay que editar/arreglar un clip generado** → **Runway Aleph**.
- **El editor humano prefiere presets visuales** → **Higgsfield** (vía su MCP/CLI).
- **Generación rápida local desde Claude Code** → skill **`imagegen`** para stills; para video, la API de Veo/Kling.

## Trucos de consistencia (multi-clip)

1. **Style block textual fijo** en todos los prompts (ver `prompt-anatomy.md` y `brand-kit-mapping.md`).
2. **Imagen de referencia** en todos los clips: Veo "Ingredients" (sujeto), Runway Gen-4 References (estilo multi-shot), Kling i2v + keyframes.
3. **Base neutra + grade en post:** genera en **Kling** (color neutro) y aplica el **LUT del cliente** (de `color-grading-clee`) en la edición → no peleas con la estética del modelo.
4. **Mismo modelo para toda la tanda** de un video.

## Acceso programático y costos (avisos 2026)

- **Veo 3.1**: el más limpio para automatizar (Gemini/Vertex). Per-second ~$0.03-0.40 según tier (Lite/Fast/Quality) y si incluye audio.
- **Kling**: consumer con free tier diario; API por revendedores (~$0.08-0.11/s).
- **Higgsfield**: **no** hay REST estándar; MCP/CLI + Cloud API gateada. **Créditos caducan a 90 días.**
- **Nano Banana Pro**: sin free tier programático; ~$0.13 (1K/2K), ~$0.24 (4K); batch −50%.
- Los precios varían mucho entre proveedor oficial y reventas (fal.ai, PiAPI, WaveSpeed). Trátalos como rangos y verifica al momento.

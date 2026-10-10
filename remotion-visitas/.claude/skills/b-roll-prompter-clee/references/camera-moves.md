# Movimientos de cámara y su significado emocional

El movimiento de cámara es el 50% de la emoción de un clip de B-roll IA. Elige el movimiento por la EMOCIÓN del momento del guion, no por defecto. Todos los generadores de video (Veo, Kling, Runway, Higgsfield) responden a estos términos en el prompt; Higgsfield además tiene presets de cámara nombrados.

| Movimiento | Término de prompt | Emoción / uso | Marca típica |
|---|---|---|---|
| **Push-in lento (dolly in)** | "slow dolly in", "slow push-in" | Intimidad, foco, "presta atención"; sube tensión | SAVIAS, inmersivo |
| **Pull-out (dolly out)** | "slow dolly out", "pull back reveal" | Revelar contexto, cierre, "mira el conjunto" | Establishing, outro |
| **Orbit / arc** | "orbiting shot", "arc around subject" | Producto héroe, admiración, showcase | Producto premium |
| **Crane up / down** | "crane up", "boom down" | Escala, grandeza, transición de bloque | Épico, aspiracional |
| **Handheld sutil** | "subtle handheld", "organic camera shake" | Realismo, cercanía, autenticidad | Marca personal, documental |
| **Whip pan** | "whip pan transition" | Energía, corte dinámico entre tomas | Ovejas, hype |
| **Static locked-off** | "static locked-off shot", "tripod" | Calma, control, deja que la acción hable | Textura, premium |
| **Tracking / follow** | "tracking shot following", "steadicam follow" | Progreso, movimiento hacia adelante | Lifestyle, journey |
| **Rack focus** | "rack focus from X to Y" | Redirigir la atención, revelar | Detalle, storytelling |
| **Top-down / overhead** | "top-down overhead shot" | Flat-lay, proceso, orden | Producto, receta, proceso |

## Reglas de aplicación

- **Marca pausada/premium (SAVIAS)** → movimientos **lentos y suaves**: slow dolly in, orbit lento, static, top-down. Nunca whip pan ni shake agresivo.
- **Marca rápida/hype (Ovejas)** → movimientos **enérgicos**: whip pan, handheld, tracking rápido, push-in agresivo.
- **Un solo movimiento por clip.** Combinar dos movimientos en un clip de 2-5s confunde al modelo y produce morphing.
- **Velocidad explícita.** Di "slow", "smooth", "gentle" o "fast", "snappy" — los modelos por defecto exageran el movimiento.
- **Cámara lenta del sujeto ≠ cámara lenta del movimiento.** "slow motion" afecta la acción; "slow camera move" afecta la cámara. Sé explícito con cuál quieres.
- **En picos musicales** (clímax, regla del arco emocional) usa crane up o push-in que "aterrice" en el beat.

## Combinar con el tipo de B-roll (ver `broll-taxonomy.md`)

- Literal producto → orbit o top-down.
- Textura/macro → static o slow push-in.
- Metafórico → crane o pull-out reveal.
- Entorno → slow tracking o establishing static.
- Prueba/antes-después → static o rack focus.

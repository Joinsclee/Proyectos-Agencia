# Formulador — Guía completa

## ¿Qué hace?

El **Formulador** es un asistente interactivo de **3 pasos** que guía a la hermosa para construir una fórmula cosmética completa desde cero, con porcentajes exactos por fase, conversión a gramos según el tamaño del lote, instrucciones paso a paso y un resultado imprimible (PDF).

## Los 3 pasos

### Paso 1 — ¿Qué quieres crear?

Selecciona uno de los **10 tipos de productos** disponibles:

| # | Producto | Tipo | Dificultad |
|---|---|---|---|
| 1 | Crema facial hidratante | Emulsión O/W | Intermedia |
| 2 | Mantequilla corporal | Anhidra (sin agua) | Básica |
| 3 | Bálsamo labial | Anhidro | Básica |
| 4 | Sérum facial | Gel acuoso | Intermedia |
| 5 | Shampoo sólido | Tensoactivo sólido | Intermedia |
| 6 | Loción corporal ligera | Emulsión O/W ligera | Intermedia |
| 7 | Exfoliante corporal | Anhidro con partículas | Básica |
| 8 | Limpiador facial en polvo | Polvo limpiador | Básica |
| 9 | Limpiador facial en polvo (enzimático) | Polvo enzimático | Básica |
| 10 | Jabón Cold Process | Saponificación en frío | Avanzada |

Al seleccionar, aparece descripción + dificultad + dos campos:
- **Nombre de tu receta** (libre)
- **Tamaño del lote (gramos)**: 10–10000, default 100

Botón **Formular ➡️**.

### Paso 2 — Arma tu fórmula

Las **fases** del producto aparecen organizadas en tarjetas de colores:
- **Fase Acuosa (A)** — azul, calentar a 70–75°C
- **Fase Oleosa (B)** — amarillo, calentar a 70–75°C aparte
- **Fase Fría (C)** — púrpura, agregar bajo 40°C

Cada fase trae **ingredientes sugeridos con porcentajes predeterminados**, y **opciones alternativas** para reemplazar.

**Indicador de progreso total**: barra arriba que suma todos los porcentajes. Debe llegar a **100%**:
- Rojo si <100%
- Verde si =100%

Botones de navegación: **◀️ Anterior** y **Ver resultado ✨**.

### Paso 3 — Resultado

Tarjeta imprimible con:
- Nombre, tipo, dificultad, tamaño de lote
- Tabla de ingredientes con: Fase | Ingrediente | % | Gramos
- Subtotal por fase
- **Instrucciones paso a paso** (6–8 pasos según producto)
- **Consejo profesional** específico
- Botones: **◀️ Editar fórmula** y **📥 Descargar PDF** (usa `window.print()`)

## Fases y ejemplos de fórmulas

### Crema facial hidratante (3 fases)

**Fase Acuosa (A) — 72.5%**
- Agua destilada 68%
- Glicerina vegetal 4%
- Alantoína 0.5%

**Fase Oleosa (B) — 20.5%**
- Aceite de almendras 10%
- Manteca de karité 4%
- Olivem 1000 (emulsionante) 5%
- Alcohol cetílico 1.5%

**Fase Fría (C) — 1.8%**
- Vitamina E 0.5%
- Aceite esencial 0.5%
- Cosgard (conservante) 0.8%

Pasos: calentar A y B por separado a 70–75°C → verter A sobre B batiendo con minipimer → enfriar a 40°C batiendo → agregar C → medir pH (5.0–5.5) → envasar.

### Mantequilla corporal (2 fases, sin agua)

**Fase Oleosa (B)**
- Manteca de karité 50%
- Aceite de almendras 30%
- Cera de abejas 15%

**Fase Fría (C)**
- Vitamina E 0.5%
- Aceite esencial 1%

**Sin agua = sin conservante necesario.** La textura cambia con la temperatura ambiente.

### Bálsamo labial (1 fase)

- Cera de abejas 20%
- Manteca de karité 30%
- Aceite de coco 25%
- Aceite de almendras 24%
- Vitamina E 1%

Derretir todo a baño maría, mezclar, envasar caliente.

### Sérum facial (3 fases)

**Acuosa**: Agua destilada, ácido hialurónico 1%, glicerina, pantenol
**Oleosa ligera**: Escualano, aceite de jojoba
**Conservante**: Cosgard 0.8%

Tip: **nunca calentar el ácido hialurónico**. Prediluirlo en agua tibia la noche anterior. Usar envase opaco.

### Shampoo sólido (1 fase)

Ingredientes principales: SCI, SLSA, manteca de cacao, almidón de maíz, aceites. **Usar mascarilla al manipular polvos.** Necesita 48h de secado antes de usar.

### Limpiador facial en polvo enzimático

Fécula de maíz, caolín, SCI, polvo de rosas + **papaína** (enzima de papaya). La papaína es **sensible al calor — nunca calentar**. Se activa con agua tibia. Usar 1–2 veces/semana.

### Jabón Cold Process

3 fases: aceites/grasas, solución de lejía (NaOH + agua), aditivos.
**OBLIGATORIO usar la Calculadora de Saponificación para los gramos exactos de NaOH.** Nunca improvisar. EPP siempre.

## Reglas para que la fórmula funcione

- **El total debe sumar 100%**. Sin excepciones.
- **Conservante obligatorio** en cualquier producto con agua (acuoso, emulsión). 0.5–1% (Cosgard, Geogard ECT, etc.).
- **Emulsionante obligatorio** en emulsiones O/W: Olivem 1000 (4–8%), Emulsifying Wax NF (5–10%), BTMS (5–8%).
- **pH ideal piel**: 5.0–5.5. Medir con tiras o pHmetro.
- **Activos sensibles** (vitamina C, retinol, ácidos): siempre en fase fría, envase opaco, fecha de elaboración.

## Equivalencias rápidas

Lote 100 g → 1% = 1 g
Lote 250 g → 1% = 2.5 g
Lote 500 g → 1% = 5 g
Lote 1000 g → 1% = 10 g

## Integración con SkinSolver

Si vienes desde SkinSolver, el Formulador te llega con el tipo de producto pre-seleccionado y el nombre pre-llenado. Por ejemplo: SkinSolver recomienda "Limpiador facial en polvo enzimático" para piel normal/mixta → te lleva al Formulador con esa receta cargada.

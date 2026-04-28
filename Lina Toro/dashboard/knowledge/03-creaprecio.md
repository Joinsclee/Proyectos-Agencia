# CreaPrecio — Guía completa

## ¿Qué hace?

**CreaPrecio** es un simulador de rentabilidad rápido. Es la versión "ligera" de la Calculadora de Precios completa: pides un costo total de ingredientes (no ingrediente por ingrediente), defines mano de obra, otros costos y margen, y devuelve PVP + ganancia.

Ideal para tantear precios al vuelo cuando ya tienes el costo total de tus ingredientes calculado en otro lado, o cuando estás simulando escenarios.

## Cómo se usa

1. **Toggle Tipo de Producto**: Jabonería (default) o Cosmética. Solo cambia el contexto, la fórmula es la misma.
2. **Costo ingredientes del lote ($)**: la suma total de todo lo que costaron los ingredientes del lote.
3. **Costo empaque por unidad ($)**: lo que cuesta el empaque de una sola unidad.
4. **Unidades producidas por lote**: cuántos productos terminados sacas del lote.
5. **Horas invertidas en el lote**: tiempo total de trabajo.
6. **Valor de tu hora ($)**: tu tarifa horaria. Default $15.000.
7. **Otros costos ($)**: luz, gas, alquiler prorrateado, etc.
8. **Slider de margen**: 0% a 300%, default 100%. Colores indicativos:
   - Rojo: 0% (sin ganancia)
   - Naranja: 50% (mínimo recomendado)
   - Verde claro: 100% (ideal)
   - Verde oscuro: 200%+ (premium)

Todo se calcula en tiempo real, sin botón submit.

## Resultados

- **Precio de Venta Sugerido (PVP)** — destacado.
- **Costo Real por Unidad**.
- **Ganancia Neta por Unidad** = PVP − Costo.
- **Ganancia Total del Lote** = Ganancia × Unidades.
- **Badge** automático:
  - "Excelente rentabilidad" (verde) si margen ≥ 100%
  - "Buena rentabilidad" (verde) si 50% ≤ margen < 100%
  - "Rentabilidad ajustada" (amarillo) si 0% < margen < 50%
  - "Sin margen de ganancia" (rojo) si margen ≤ 0%

## Fórmulas

```
Costo Mano de Obra = Horas × Valor Hora
Costo Total Lote = Ingredientes + (Empaque × Unidades) + Mano de Obra + Otros
Costo por Unidad = Costo Total Lote ÷ Unidades
PVP = Costo por Unidad × (1 + Margen/100)
Ganancia/Unidad = PVP − Costo por Unidad
Ganancia Lote = Ganancia/Unidad × Unidades
```

**Diferencia clave con la Calculadora de Precios completa**: aquí el margen se aplica como **recargo sobre costo** (PVP = Costo × (1 + Margen)). En la Calculadora completa el margen es **porcentaje del precio** (PVP = Costo ÷ (1 − Margen)). Por eso CreaPrecio acepta hasta 300% y la otra hasta 99%.

Equivalencias:
- 100% margen en CreaPrecio = 50% margen en Calculadora completa
- 200% margen en CreaPrecio ≈ 67% margen en Calculadora completa
- 300% margen en CreaPrecio = 75% margen en Calculadora completa

## Cuándo usar CreaPrecio vs Calculadora de Precios

- **CreaPrecio**: simulación rápida, comparar escenarios de margen, estimar precio en una conversación.
- **Calculadora de Precios**: costeo definitivo, ingrediente por ingrediente, exporta PDF profesional para archivar o presentar.

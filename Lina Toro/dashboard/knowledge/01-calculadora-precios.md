# Calculadora de Precios — Guía completa

## ¿Qué hace?

La **Calculadora de Precios** es la herramienta más completa para costear y fijar precio a cualquier producto artesanal (cosmética o jabonería). Calcula:

- Costo total del lote
- Costo de fabricación por unidad y por kilo
- Costo total por unidad (incluyendo empaque)
- Precio de venta sugerido (PVP) según margen
- Precio mínimo viable (margen 30%)
- Ganancia neta por unidad y por lote
- Indicador visual de rentabilidad

Genera un **informe técnico en PDF** profesional con todo el desglose, listo para archivar o enviar a un asesor.

## Cómo se usa, paso a paso

### Paso 1 — Configura el lote

- **Nombre de tu receta artesanal**: nombre que aparecerá en el PDF.
- **Toggle Cosmética / Jabonería**: cambia las etiquetas y unidades. Cosmética por defecto.
- **Gramos de la receta (lote total)**: peso total que vas a producir. Default 1000 g.
- **Eficiencia de Proceso (%)**: porcentaje real que aprovechas tras mermas (curado, restos en olla). Cosmética típica 90–95%, jabonería 80–85%. Default 80%.
- **Peso por Unidad (g)**: cuánto pesa una unidad terminada (un jabón, un bote de crema). Default 100 g.
- **Unidades producidas por lote**: déjalo en 0 para que se calcule solo: `(lote × eficiencia) ÷ peso unidad`. Si lo defines manualmente, ese valor manda.

### Paso 2 — Ingresa ingredientes

En la tabla de **Ingredientes y Materias Primas** (cosmética) o **Aceites y Grasas Base** (jabonería):

- **Ingrediente**: nombre libre.
- **Gramos receta**: cuántos gramos usaste de ese ingrediente en TU receta.
- **Unidad comprada**: Kg, Litro, Galón, Libra, Onzas, Gramos, Mililitros.
- **Cant. comprada**: cuántas unidades compraste. Si compraste 1 kg, escribe 1.
- **Precio total pagado**: lo que pagaste por esa compra (no precio unitario).
- **Costo receta**: se calcula solo, prorrateando.

Botón **AÑADIR INGREDIENTE / AÑADIR ACEITE** agrega filas. La "×" elimina.

### Paso 3 — Ingresa activos / aditivos

Tabla idéntica a la anterior, para fragancias, aceites esenciales, conservantes, colorantes. Cosmética la llama "Activos Cosméticos · Conservantes · Fragancias / AAEE", jabonería la llama "Aditivos · Esencias · Colorantes".

### Paso 4 — Mano de obra

- **Valor Hora**: tu tarifa por hora de trabajo. **Recomendación: como mínimo el salario mínimo por hora de tu país.** Nunca trabajar por debajo de ese costo.
- **Tiempo por Lote/Kg**: cuántas horas te toma fabricar el lote.
- **Unidad de tiempo**: horas o minutos (se convierte automáticamente).

### Paso 5 — Otros gastos directos

Botón **AÑADIR GASTO**. Lista de costos prorrateados al lote (electricidad, gas, agua, servicios). Cada gasto es un valor en pesos.

### Paso 6 — Detalle por unidad

- **Packaging Individual**: lo que cuesta el empaque de una sola unidad (frasco, etiqueta, caja, cinta).
- **Otros Costos Unitarios**: comisiones, transporte unitario, etc.

### Paso 7 — Mueve el slider de margen

Slider de 0% a 99%, default 50%. Las referencias debajo:
- **0%** Sin ganancia
- **30%** Mínimo
- **50%** Recomendado
- **70%+** Excelente

El PVP se actualiza en tiempo real al mover el slider.

### Paso 8 — Descarga el PDF

Botón **DESCARGAR INFORME TÉCNICO PDF**. Genera un PDF de 3 páginas con KPIs, ingredientes con %, mano de obra, gastos, estructura de costos, PVP, rentabilidad y análisis. Se descarga como `[NombreReceta]_Coste.pdf`.

## Resultados y métricas

### Costos del lote
- **Costo Total del Lote**: lo que te cuesta producir todo el lote.
- **Costo Fab/Unidad** (cosmética) o **Costo Fab/Kg** (jabonería): costo de fabricación sin empaque.
- **Costo por Unidad**: incluye packaging. Es lo que realmente te cuesta una unidad lista para vender.
- **Unidades del Lote**: cantidad total producida.

### Margen y precio de venta
- **PVP (Precio de Venta Sugerido)**: el precio destacado en grande, calculado con tu margen.
- **Precio Mín/Unidad (30%)**: el mínimo viable.
- **Ganancia Neta / Unidad**: PVP − Costo por Unidad.
- **Ganancia Total del Lote**: ganancia × unidades.

### Indicador visual de rentabilidad
- **≥50% margen**: "¡Excelente rentabilidad!" (verde).
- **30–49%**: "Margen aceptable — puede mejorar" (naranja).
- **<30%**: "Margen bajo" (rojo).

## Fórmulas clave

```
Precio por gramo del ingrediente = Precio total pagado ÷ (Cantidad × gramos por unidad)
Costo receta del ingrediente = Gramos usados × Precio por gramo

Costo Fab por Kg = (Total ingredientes ÷ Eficiencia) × 1000 / Total gramos + Labor + Gastos
Costo Total Lote = (Total ingredientes ÷ Eficiencia) + (Labor × Lote/1000) + Gastos
Costo por Unidad = Costo Total Lote ÷ Unidades + Packaging + Otros

PVP = Costo por Unidad ÷ (1 − Margen/100)
Ganancia/Unidad = PVP − Costo por Unidad
```

**Margen es porcentaje del precio que es ganancia, NO recargo sobre el costo.** Si vendes a $100 con margen 50%, ganas $50 (la mitad del precio).

## Reglas y validaciones

- Eficiencia entre 0 y 100 (no usar 100% nunca, siempre hay merma).
- Margen máximo 99% (evita división por cero).
- Si dejas unidades en 0, se calcula. Si pones un número, ese manda.
- Cambiar el toggle Cosmética/Jabonería resetea las etiquetas pero conserva los datos.

## Diferencias con CreaPrecio

| | Calculadora de Precios | CreaPrecio |
|---|---|---|
| Detalle | Ingrediente por ingrediente con unidades de compra | Solo costo total de ingredientes |
| Eficiencia | Sí, ajusta mermas | No |
| Mano de obra | Por hora con conversión min/hora | Sí, igual |
| PDF | Sí, profesional 3 páginas | No |
| Cuándo usarla | Costeo definitivo, presentar a cliente, archivar | Simulación rápida en cabeza |

Para una hermosa que ya domina su receta y quiere fijar precio profesional, esta es **la** calculadora. CreaPrecio es para tantear rápido.

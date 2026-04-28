# Calculadora de Saponificación — Guía completa

## ¿Qué hace?

La **Calculadora de Saponificación** es la herramienta para diseñar recetas de **jabón cold process (saponificación en frío)** con seguridad y precisión. Calcula:

- Cantidad exacta de **NaOH (sosa cáustica)** según los aceites elegidos
- **Agua de la lejía** según concentración deseada
- **Sobreengrasado (SF)**: porcentaje de aceites que queda sin reaccionar para suavidad
- **Glicerina natural** generada en el proceso
- **Perfil de ácidos grasos** de la receta (8 ácidos)
- **Propiedades del jabón**: dureza, burbujas, cremosidad, limpieza, emoliencia
- **Índice de yodo** y clasificación de dureza

Genera un **informe PDF** completo de la receta.

## Modos: NaOH sólida vs líquida

**NaOH Sólida** (la más común):
- Pureza del NaOH (%): 80–100, default 99
- Sobreengrasado SF (%): 0–30, default 5
- Concentración de Lejía CONC (%): 20–50, default 33

**NaOH Líquida**:
- Concentración de la solución (%): 30–70, default 50
- Devuelve cantidad de solución a usar + agua adicional

## Cómo se usa

### 1. Datos de la receta
- **Nombre del Jabón**, **Fecha de Elaboración**, **Fecha de Curado** (default +28 días)
- **Temperatura de Elaboración (°C)**: informativo, default 40°C
- **Peso Total de Aceites (g)**: la base. Default 500 g.

### 2. Reescalar (opcional)
Botones preset: 250 g, 500 g, 1 kg, 1.5 kg, 2 kg, 3 kg, 5 kg. O escribe peso libre y dale **Reescalar**. Multiplica todos los aceites, aditivos y SE proporcionalmente.

### 3. Tabla de aceites
Botón **+ Agregar Aceite**. Por cada fila:
- **Aceite/Grasa**: dropdown con 24 aceites + "Personalizado"
- **Gramos**
- **% Fórmula**: se calcula
- **SAP (NaOH)**: se rellena solo según el aceite (en personalizado lo escribes tú)
- **NaOH Neto, Índice Yodo, Láurico, Mirístico, Palmítico, Esteárico, Ricinoleico, Oléico, Linoléico, Linolénico**: todos calculados

### 4. Cálculo de lejía
Configura SF, pureza y concentración. Resultados:
- **NaOH a pesar** (con pureza ya ajustada y SF descontado)
- **Agua Lejía**
- **Total Lejía**
- **PESO TOTAL RECETA**

### 5. Aditivos especiales
Lista predefinida con dosis máxima. Algunos descuentan agua (azul ↓ agua), otros ajustan NaOH (naranja ↑ NaOH):

| Aditivo | Máx | Efecto |
|---|---|---|
| Arcillas | ≤5% | Dureza + |
| Cacao en polvo | ≤5% | Cremosidad + |
| Sal | ≤3% aceites | Dureza + |
| Sodio lactato | ≤5% | Dureza + |
| Azúcar / Miel | ≤5% | Burbujas +, ↓ agua |
| Propilenglicol | ≤5% | Burbujas +, ↓ agua |
| Gel Aloe Vera | libre | Burbujas +, ↓ agua |
| Leche líquida | libre | ↓ agua |
| Yogur griego | libre | Cremosidad +, ↓ agua |
| Yogur natural | libre | Cremosidad + |
| Ácido cítrico | 1–2% aceites | Quelante, **↑ NaOH automático** |
| Citrato de sodio | 1–3% grasas | Quelante |
| Vitamina E | 0.1–0.2% aceites | Antioxidante |
| Ext. semilla pomelo | 0.1–1% | Antioxidante |
| Ext. de romero | 0.1–0.4% | Antioxidante |

**Importante con ácido cítrico**: por cada 10 g de ácido cítrico se suman 6 g extra de NaOH automáticamente, para no alterar el SF.

### 6. Activos personalizados
Botón **+ Agregar Activo / Aditivo** con dropdown categorizado en Quelantes, Antioxidantes, Endurecedores, o Personalizado libre.

### 7. SE (Sobreengrasado designado)
Por defecto el SF se reparte automáticamente entre todos los aceites. Si quieres designar un aceite específico para que sea el "sobreengrasado" (ej: karité, ricino), úsalo en la tabla SE:
- Aceite + gramos + agregar en (traza o lejía)

Si los gramos de SE designados superan el SF disponible, sale alerta roja.

### 8. PDF
Botón **Generar Informe PDF** al pie. Incluye datos, aceites, lejía, glicerina, aditivos, propiedades, perfil ácidos grasos, SE, índice yodo, notas.

## Propiedades del jabón

Cada propiedad es la suma ponderada de ácidos grasos. Tiene un rango ideal:

| Propiedad | Fórmula | Rango ideal |
|---|---|---|
| Dureza | Láurico + Mirístico + Palmítico + Esteárico | 29–54% |
| Burbujas | Láurico + Mirístico + Ricinoleico | 14–46% |
| Cremosidad | Palmítico + Esteárico + Ricinoleico | 16–48% |
| Limpieza | Láurico + Mirístico | 12–22% |
| Emoliencia | Oléico + Linoléico + Linolénico | 44–69% |

**Limpieza > 22% reseca la piel.**

## Índice de yodo

Mide la insaturación → dureza/blandura del jabón final.

| Rango | Clasificación |
|---|---|
| > 70 | Muy Blanda |
| 60–70 | Blanda |
| **50–60** | **Media (recomendado)** |
| 40–50 | Dura |
| < 40 | Muy Dura (puede quebrarse) |

## Lista de aceites disponibles

Aceite de coco (76°), palmiste, palma, oliva, ricino, girasol, almendra dulce, manteca de karité (shea), manteca de cacao, aguacate, soja, canola/colza, semilla de cáñamo, linaza, jojoba, argán, manteca de mango, rosa mosqueta, neem, semilla de uva, sésamo, maíz, sebo vacuno, manteca de cerdo, + Personalizado.

Cada uno tiene SAP y composición de ácidos grasos predefinida en la base de datos. Para personalizado, el usuario ingresa el SAP manualmente (rango usual 0.05–0.30).

## Glicerina

Estimada al **10.4% del NaOH puro** usado. Es la glicerina natural que produce la saponificación, distinta de la glicerina añadida.

## Calculadoras auxiliares

- **% → gramos**: (porcentaje ÷ 100) × total
- **gramos → %**: (gramos ÷ total) × 100

Útiles para dosificar fragancias, aditivos, SE designado.

## Alertas automáticas

- **CONC < 25%**: "Concentración muy baja. Puede causar trazas lentas."
- **CONC > 45%**: "Concentración muy alta. Mayor riesgo de aceleración de traza."
- **SE > SF disponible**: ajusta los valores.
- **Ácido cítrico detectado**: se suma NaOH extra automáticamente.

## Recomendaciones de seguridad

- **Siempre usa EPP**: guantes, gafas, mascarilla, ropa cubierta.
- **NaOH al agua**, nunca al revés.
- **Trabaja en zona ventilada**.
- **El SF de 5% es estándar** para jabones de baño. Subir a 8–10% para pieles delicadas. Bajar a 1–3% para jabones de cocina o lavandería.
- **Curado mínimo 4 semanas** (default 28 días en la calculadora). Algunos jabones (coco puro, palma) necesitan más.

## Concentraciones recomendadas

- **30–38% es el rango óptimo** de concentración de lejía (default 33%).
- **Más concentrada (>38%)**: traza más rápida, menos agua, jabón más duro al desmoldar pero acelera la traza.
- **Menos concentrada (<30%)**: traza más lenta, más agua, más tiempo de curado.

## Recetas clásicas de referencia

| Nombre | Composición | Perfil |
|---|---|---|
| Castilla | 100% Oliva | Suave, cremoso, traza lenta |
| Marsella | 72–78% Oliva + 22–28% Coco | Equilibrado, buena espuma |
| Coco puro | 100% Coco | Espumoso, muy duro, deseca |
| Palma + Coco 50/50 | Palma + Coco | Balance burbujas-dureza |

# SaviasPath — Guía completa

## ¿Qué hace?

**SaviasPath** es un quiz de **3 preguntas** que recomienda el plan de formación ideal según el perfil de cada hermosa: experiencia, objetivo y disponibilidad de tiempo.

Devuelve uno de **3 planes**: Standard, Premium o VIP.

## Las 3 preguntas

### Pregunta 1 — ¿Cuál es tu nivel de experiencia?
- **Principiante**: nunca he hecho jabones ni cosmética (score 0)
- **Intermedia**: he hecho jabones o productos básicos (score 1)
- **Avanzada**: ya tengo experiencia y quiero profesionalizarme (score 2)

### Pregunta 2 — ¿Cuál es tu objetivo principal?
- **Hobby**: para mí y mi familia (score 0)
- **Negocio**: vender y generar ingresos (score 1)
- **Profesional**: marca seria y escalable (score 2)

### Pregunta 3 — ¿Cuánto tiempo puedes dedicar?
- **Poco**: 2–3 horas por semana (score 0)
- **Moderado**: 5–8 horas por semana (score 1)
- **Intensivo**: más de 10 horas por semana (score 2)

## Lógica de recomendación

```
score = Q1 + Q2 + Q3   (rango 0–6)

if Q1 == 'avanzada' OR Q2 == 'profesional' OR Q3 == 'intensivo' OR score >= 5
  → Plan VIP

else if score >= 2
  → Plan Premium

else
  → Plan Standard
```

Cualquier dimensión "máxima" dispara automáticamente VIP.

## Los 3 planes

### 🍃 Plan Standard
Para quien empieza. Bases sólidas en jabonería artesanal.
Ideal para hobbyistas con tiempo limitado. Enfoque en jabones cold process y productos anhidros simples (mantequillas, bálsamos).

### 🍃 Plan Premium
Para quien quiere ir más allá. Lleva de la jabonería a la cosmética completa con el método EVA: cremas, sérums, lociones.
Ideal para productores que quieren escalar de jabones a fórmulas más complejas.

### 🍃 Plan VIP
Para quien quiere mentoría directa. Todo el método EVA + acompañamiento personalizado de Lina para lanzar la marca al mercado.
Ideal para emprendedores serios con intención de profesionalizar y escalar comercialmente. Mentoría 1-on-1.

## Cómo se usa

1. Aparece pregunta 1.
2. Seleccionas opción → transición de 300ms → aparece pregunta 2.
3. Seleccionas → aparece pregunta 3.
4. Seleccionas → aparece la tarjeta de resultado con tu plan + descripción.
5. Botón **Repetir quiz** reinicia todo.

## Notas

- El quiz no tiene preguntas de salud, presupuesto ni geografía. Es un orientador, no un filtro completo.
- Para más detalles del contenido de cada plan, lo mejor es preguntar en la comunidad de Skool: https://www.skool.com/savias-8385
- El quiz se puede repetir las veces que se quiera.

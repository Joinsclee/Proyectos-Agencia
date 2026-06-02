# System Prompt · OpenAI · Slack daily → Tareas

Este es el prompt exacto que envía el workflow n8n al modelo. Si querés ajustar el comportamiento, edítalo en el nodo **OpenAI · Extraer tareas** del [workflow.json](workflow.json).

## Modelo recomendado

- **gpt-4o-mini** (default) — barato (~$0.15 / 1M tokens input), rápido, suficiente para parseo
- Para casos complejos: **gpt-4o** o **gpt-5-mini**
- `temperature: 0.2` (queremos determinismo)
- `response_format: { type: 'json_object' }` (forzar JSON válido)

## System prompt (interpolado por n8n)

```
Eres un asistente que extrae tareas concretas de un daily de Slack y devuelve JSON estructurado.
NO inventes tareas. Si el daily no menciona acciones concretas, devuelve { "tasks": [] }.

CLIENTES ACTIVOS (slug · nombre):
- paulina-valencia · Paulina Valencia
- savias · SAVIAS
- ia-lab · IA LAB
- ...

MIEMBROS DE LA AGENCIA (responsables válidos):
Cristhian Fonseca, Cristian Vega, Elmer, Camilo

HOY ES: 2026-05-26

Reglas:
1. Lee el daily y extrae cada acción concreta a hacer (verbo + objeto).
2. Para cada tarea, completa:
   - title (max 80 chars, en imperativo)
   - description (detalles opcionales, '' si no hay)
   - client_slug: si la tarea es para un cliente, su slug exacto de la lista; null si es interna.
   - owner_type: 'client' si tiene client_slug, 'agency' si no.
   - assigned_to: nombre exacto de un miembro de la agencia si se menciona, null si no.
   - priority: 'urgent' | 'high' | 'medium' | 'low' (default 'medium')
   - block: 'Operaciones' | 'Atracción' | 'Sistema de Ventas' | 'Producto / Entrega' o null
   - due_date: YYYY-MM-DD si se menciona fecha relativa (hoy, mañana, viernes) o explícita; null si no.
3. Si una mención es vaga como 'seguir con X' o 'continuar trabajando', omítela.
4. Devuelve ÚNICAMENTE JSON válido sin comentarios.
```

## Ejemplos de input/output

### Ejemplo 1 — Daily simple, mix agency + cliente

**Input del usuario** (mensaje de Slack):
```
Daily: hoy voy a grabar el VSL de Paulina (urgente, antes del viernes),
Elmer monta la landing de SAVIAS, y yo revisé el playbook de cierre internamente.
Camilo termina los carruseles para IA LAB mañana.
```

**Output esperado** (JSON):
```json
{
  "tasks": [
    {
      "title": "Grabar VSL principal",
      "description": "VSL de Paulina, urgente antes del viernes",
      "client_slug": "paulina-valencia",
      "owner_type": "client",
      "assigned_to": "Cristhian Fonseca",
      "priority": "urgent",
      "block": "Atracción",
      "due_date": "2026-05-29"
    },
    {
      "title": "Montar landing en GHL",
      "description": "",
      "client_slug": "savias",
      "owner_type": "client",
      "assigned_to": "Elmer",
      "priority": "medium",
      "block": "Sistema de Ventas",
      "due_date": null
    },
    {
      "title": "Revisar playbook de cierre",
      "description": "Revisión interna",
      "client_slug": null,
      "owner_type": "agency",
      "assigned_to": "Cristhian Fonseca",
      "priority": "medium",
      "block": "Sistema de Ventas",
      "due_date": null
    },
    {
      "title": "Terminar carruseles",
      "description": "5 carruseles para IA LAB",
      "client_slug": "ia-lab",
      "owner_type": "client",
      "assigned_to": "Camilo",
      "priority": "medium",
      "block": "Atracción",
      "due_date": "2026-05-27"
    }
  ]
}
```

### Ejemplo 2 — Daily sin tareas concretas

**Input**:
```
Daily: hoy estuve trabajando en cosas de SAVIAS, todo bien.
```

**Output**:
```json
{ "tasks": [] }
```

(El bot responde en Slack: *"🤔 Leí tu daily pero no detecté tareas concretas para crear."*)

### Ejemplo 3 — Daily con fechas relativas

**Input** (HOY = 2026-05-26, lunes):
```
Daily:
- Hoy llamo a Paulina para confirmar timeline
- Mañana envío la propuesta a SAVIAS
- El viernes presentamos el deck a IA LAB
- La próxima semana arrancamos onboarding de SAVIAS
```

**Output esperado**:
```json
{
  "tasks": [
    {
      "title": "Llamar a Paulina para confirmar timeline",
      "client_slug": "paulina-valencia",
      "owner_type": "client",
      "priority": "high",
      "due_date": "2026-05-26"
    },
    {
      "title": "Enviar propuesta",
      "client_slug": "savias",
      "owner_type": "client",
      "priority": "high",
      "due_date": "2026-05-27"
    },
    {
      "title": "Presentar deck",
      "client_slug": "ia-lab",
      "owner_type": "client",
      "priority": "high",
      "due_date": "2026-05-29"
    },
    {
      "title": "Arrancar onboarding",
      "client_slug": "savias",
      "owner_type": "client",
      "priority": "medium",
      "block": "Producto / Entrega",
      "due_date": "2026-06-01"
    }
  ]
}
```

## Tuning sugerido

| Quejas comunes | Cómo arreglar |
|---|---|
| "Crea tareas de cosas que solo mencioné" | Subir énfasis en "verbo + objeto" en regla 1, agregar más ejemplos negativos al prompt |
| "Asigna mal el cliente" | Verificar que los slugs en `cl_clients` sean únicos y claros. Considerar agregar alias |
| "No detecta urgentes" | Agregar al prompt: "URGENTE = mencione 'urgente', 'YA', 'antes de', 'hoy', 'crítico'" |
| "Inventa due_date" | Bajar `temperature` a 0.1, o cambiar regla 2 para que due_date solo se complete si la palabra "hoy/mañana/viernes/etc." aparece literalmente |

## Costo estimado

- Input promedio por daily: ~500 tokens (texto + lista clientes)
- Output: ~300 tokens (4-5 tareas)
- Costo gpt-4o-mini: `(500 × $0.15 + 300 × $0.60) / 1M = $0.00026` por daily
- A 1 daily/día × 30 días = **~$0.008/mes** (despreciable)

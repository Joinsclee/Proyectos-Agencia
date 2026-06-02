# JoinsClee · Checklist

Sistema de checklist bidireccional agencia ↔ cliente, con sync en tiempo real vía Supabase.

## Estructura

```
JoinsClee-Checklist/
├── 01_schema.sql       ← Schema BD (ejecutar 1 vez en Supabase)
├── 02_seed.sql         ← Tareas internas + plantilla "Sistema de Ventas"
├── agencia.html        ← Vista interna agencia (todos los clientes + tareas internas)
├── cliente.html        ← Plantilla cliente (se descarga personalizada desde agencia.html)
└── README.md           ← este archivo
```

## Diferenciación de tablas

Para evitar confusión con el portal anterior:
- **Schema**: `checklist` (aislado de `portal`)
- **Prefijo en tablas**: `cl_` (de checklist)
- Tablas creadas: `cl_clients`, `cl_items`, `cl_templates`, `cl_activity`

## Setup (1 vez)

### 1. Crear las tablas en Supabase
Abre el SQL Editor de Supabase (proyecto `xooacjcabrjvfzhdfdlc`) y ejecuta en orden:
1. `01_schema.sql`
2. `02_seed.sql`

### 2. Subir `agencia.html` a la subcuenta GHL de JoinsClee
Subir tal cual. Al abrirlo:
- Verás las **tareas internas de la agencia** ya cargadas con todo lo del transcript (vender Sistema de Ventas + 1 año GHL a infoproductores).
- Sidebar izquierdo: lista de clientes (vacía al inicio).

## Flujo cuando entra un cliente nuevo

1. Click **"+"** al lado de "Clientes" en el sidebar de `agencia.html`.
2. Llenar nombre, slug (ej: `paulina-valencia`), datos de contacto.
3. Seleccionar plantilla **"Sistema de Ventas — Infoproductor"** (clona ~25 tareas).
4. Guardar.
5. Click sobre el cliente en el sidebar → vista de su checklist.
6. Click **"⬇ Descargar HTML cliente"** en la topbar → descarga `cliente-paulina-valencia.html` con su ID embebido.
7. Subir ese HTML a la subcuenta GHL del cliente.
8. Cuando el cliente abra ese HTML → ve su checklist y se sincroniza en vivo con la agencia.

## Cómo funciona el sync en tiempo real

- Supabase Realtime → cuando agencia o cliente marca un item, el otro lado lo ve en <1seg vía websocket.
- Cada item registra `updated_by` (`agency` o `client`) → ves quién hizo el último cambio.
- Tabla `cl_activity` deja audit log de todo (quién hizo qué y cuándo).

## Seguridad (RLS)

- `agencia.html` usa `service_role` → ve y edita todo.
- `cliente.html` usa `anon key` + header `x-client-id` → RLS solo le deja ver/editar **sus propios items**.
- Cliente A no puede ver datos de cliente B (validado por policies en `01_schema.sql`).

## Modificar la plantilla por defecto

Editar `02_seed.sql`, sección `INSERT INTO checklist.cl_templates`, y reejecutar (o hacer un UPDATE).

## Tareas internas iniciales (ya cargadas)

7 fases con ~35 tareas extraídas del transcript del 02-jun:
- Fase 1 — Análisis y Estrategia
- Fase 2 — Producto
- Fase 3 — Test interno (somos el primer cliente)
- Fase 4 — Contenido y Tráfico
- Fase 5 — Ventas
- Fase 6 — Prueba Social
- Fase 7 — Operación Interna

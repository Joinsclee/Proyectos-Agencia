# Dashboard Financiero · JoinsClee (multi-cliente)

Dashboard standalone para gestionar ingresos, gastos y reparto de utilidades por cliente.
Diseñado para embeberse como página HTML dentro de GoHighLevel (GHL).

## Arquitectura

- **Frontend**: un único archivo `dashboard.html` (CSS + JS inline, CDNs para librerías)
- **Backend**: Supabase (mismo proyecto que Universo Lina: `cojwzekyeehqtxdvoldj`)
- **Librerías** (cargadas por CDN): `@supabase/supabase-js`, `chart.js`, `xlsx` (SheetJS), `html2pdf.js`

## Despliegue · 3 pasos

### 1. Correr la migración en Supabase

```bash
# Desde la carpeta del proyecto
psql "$DATABASE_URL" -f "Dashboard Financiero/supabase/migrations/20260520_finance_multi_cliente.sql"

# O desde el dashboard de Supabase: SQL Editor → pegar el contenido del archivo → Run
```

Esto crea:
- `finance_clients` — maestro de clientes
- `finance_params` — TRM + % de reparto por cliente
- `finance_revenues` — ingresos (Skool, etc.)
- `finance_expenses` — gastos (cliente / agencia)
- `finance_ad_charges` — cobros detallados de pauta Meta
- `finance_snapshots` — informes guardados

E inserta como seed:
- Cliente: **Lina Toro (SAVIAS)** con TRM 3729.27 y reparto 70/30
- 7 pagos Skool históricos
- 4 gastos recurrentes de Lina + Pauta Meta acumulada
- 20 cobros Meta históricos
- Gasto de "Edición de Reels" (10 × $18) que asume JoinsClee

### 2. Subir el HTML a GHL

1. En GHL, crear una página dentro del sitio del cliente (o un sitio interno de la agencia)
2. Insertar bloque HTML personalizado
3. Pegar el contenido completo de `dashboard.html`
4. Publicar

> El dashboard usa `position:fixed`/`width:100vw` para escapar de contenedores estrechos de GHL.

### 3. Compartir el link con el equipo

Cualquier persona con el link puede:
- Cambiar de cliente desde el selector
- Editar TRM y % de reparto (autoguarda)
- Agregar/editar/eliminar registros (ingresos, gastos, cobros Meta)
- Exportar Excel completo (7 hojas) o PDF resumen (para enviar al cliente)

## Cómo funciona el cálculo

```
Ingresos COP  = sum(cop_real si > 0, sino usd × TRM)
Gastos COP    = sum(cop_amount × meses si > 0, sino usd × TRM × meses)
Beneficio     = Ingresos − Gastos totales
Margen        = Beneficio / Ingresos

Cliente recibe   = Beneficio × clientShare + sus gastos reembolsados
JoinsClee recibe = Beneficio × agencyShare + sus gastos reembolsados
```

## Agregar un nuevo cliente

Desde la UI:
1. Click en **"+ Cliente"** en la topbar
2. Llenar nombre, slug y % de reparto
3. El cliente queda disponible en el selector

## Seguridad

⚠ Las políticas RLS están configuradas como **permisivas para anon** (acceso total con la URL).
Esto es intencional por el contexto (dashboard interno embebido en GHL sin auth).

Si en el futuro necesitamos restringir:
1. Cambiar las policies para usar `auth.uid()` y la tabla `profiles`
2. Agregar login a la página GHL

## Notas

- Los datos quedan en Supabase, no en localStorage → se ven igual desde cualquier dispositivo.
- El TRM se aplica en cálculo, no se persiste por registro → cambiar TRM recalcula todo el histórico.
- Los datos seed están basados en `SAVIAS_x_JoinsClee_Cuadre_Financiero.xlsx` (versión del 8 may 2026).

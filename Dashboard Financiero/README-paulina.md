# Cuadre Financiero · Barco de Papel (Paulina Valencia) × JoinsClee

Dashboard financiero de socios para Paulina, adaptado del de Lina con el branding de
**Barco de Papel** (navy `#08315C` + gold `#F4C94A` + tipografía **Asap** + logo barquito).

- **Dashboard:** `dashboard-paulina.html`
- **Migración:** `supabase/migrations/20260709_finance_paulina.sql`
- **Proyecto Supabase:** el MISMO de la app Mi Barco de Paulina → `octilxlxwewlfbaoeihr`
  (la anon key ya está pegada en el HTML; es pública por diseño, la seguridad la da el RLS).

## Qué hace
Cuadra, por período, lo que entra por **Skool** (USD → COP real en banco) contra los **gastos**
(los que asume Paulina en COP y los que asume JoinsClee en USD), calcula el **beneficio** y el
**reparto 70/30**, y resuelve el **único movimiento a realizar**: cuánto transfiere Paulina a
JoinsClee (su 30% + reembolso de gastos USD). Exporta a **Excel** y **PDF**.

## Puesta en marcha (una vez)
1. En Supabase (proyecto `octilxlxwewlfbaoeihr`) → **SQL Editor**, corre
   `20260709_finance_paulina.sql` (crea las tablas `paulina_finance_*`, RLS anon y siembra los
   parámetros 70/30). Empieza en limpio: sin datos históricos de Lina.
2. Pega `dashboard-paulina.html` en un bloque **Custom HTML** de GHL (o ábrelo directo).
3. Carga ingresos y gastos desde el propio dashboard con los botones **+ Nuevo**.

## Qué editar / adaptar
- **% de reparto y TRM:** en la barra *Parámetros del cuadre* (se guardan solos en Supabase).
- **Reparto por defecto:** 70% Paulina / 30% JoinsClee. Para cambiarlo de fábrica, ajusta el
  `insert ... paulina_finance_params` de la migración, o edítalo en pantalla.
- **Gastos recurrentes de Paulina:** hay un `insert` de ejemplo comentado al final de la
  migración (Skool, ManyChat, etc.) — descoméntalo y pon los valores reales, o cárgalos a mano.
- **Credenciales / tablas:** al inicio del `<script>` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  objeto `T`). Tokens de color y tipografía en el `:root` del `<style>` (`--navy*`, `--gold*`).

## Notas
- El dashboard va **embebido sin login** (RLS permisivo para `anon`), igual que el de Lina.
  Quien tenga el enlace puede editar el cuadre; no incluye autenticación.
- El **COP real** manda en el cuadre; el *COP esperado (TRM)* es solo referencia.

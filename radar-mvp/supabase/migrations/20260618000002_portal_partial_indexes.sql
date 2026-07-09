-- =====================================================
--  Índices PARCIALES para el portal (excluye proyectos preventa)
--  Problema: la pestaña Portal ordena por discount_pct/price_per_m2 con el
--  filtro JSON `(features->>'is_project' is null or = 'false')`. Ese filtro JSON
--  no es indexable por el índice normal → el planner hace seqscan+sort sobre 87K
--  filas → ~9s / statement_timeout (cód 57014).
--  Solución: índices PARCIALES cuyo predicado == el filtro exacto del dashboard,
--  ordenados por la columna de orden → el query se vuelve un index-scan (ms).
--
--  Aplicar pegando en Supabase Studio → SQL Editor.
-- =====================================================

-- Orden por DESCUENTO (orden por defecto del portal), sin proyectos preventa.
create index if not exists idx_inmuebles_portal_disc
  on inmuebles (discount_pct desc nulls last)
  where is_active and source = 'fincaraiz'
    and (features->>'is_project' is null or features->>'is_project' = 'false');

-- Orden por PRECIO/m², mismo predicado.
create index if not exists idx_inmuebles_portal_ppm2
  on inmuebles (price_per_m2 asc nulls last)
  where is_active and source = 'fincaraiz'
    and (features->>'is_project' is null or features->>'is_project' = 'false');

-- Orden por PRECIO total, mismo predicado.
create index if not exists idx_inmuebles_portal_price
  on inmuebles (price asc nulls last)
  where is_active and source = 'fincaraiz'
    and (features->>'is_project' is null or features->>'is_project' = 'false');

analyze inmuebles;

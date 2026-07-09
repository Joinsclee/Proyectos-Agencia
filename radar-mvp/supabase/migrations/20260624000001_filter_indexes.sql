-- =====================================================
--  Índices para los filtros nuevos (informe de pruebas del cliente)
--  Permiten filtrar por habitaciones/estrato (campos JSON) y por postura sin
--  recorrer todas las filas. Sin estos índices, filtrar por habitaciones o
--  estrato SIN una ciudad seleccionada puede exceder el statement_timeout.
--
--  Aplicar pegando en Supabase Studio → SQL Editor.
-- =====================================================

-- Habitaciones y estrato viven en features (JSON). Índices de expresión sobre
-- el texto extraído (los valores son dígitos 1-9 → orden de texto == numérico).
create index if not exists idx_inmuebles_bedrooms
  on inmuebles ((features->>'bedrooms')) where is_active;
create index if not exists idx_inmuebles_stratum
  on inmuebles ((features->>'stratum')) where is_active;

-- Área (columna) para filtros de rango.
create index if not exists idx_inmuebles_area
  on inmuebles (area_m2) where is_active;

-- Remates: filtro por postura mínima.
create index if not exists idx_remates_minbid
  on remates (minimum_bid) where is_active;

analyze inmuebles;
analyze remates;

-- =====================================================
--  Índices de rendimiento (escala demand-driven: ~87K inmuebles)
--  Motivo: tras pasar de 8 a 133 ciudades, ordenar por discount_pct / price
--  sobre ~87K filas sin índice excede el statement_timeout de PostgREST
--  (cód 57014). Estos índices hacen el ORDER BY + filtros un index-scan.
--
--  Aplicar pegando este archivo en Supabase Studio → SQL Editor.
--  (El servidor ya degrada a orden por 'scraped_at' si faltan, pero con estos
--   índices el orden por DESCUENTO vuelve a funcionar a full velocidad.)
-- =====================================================

-- Portal/bancos ordenados por descuento (caso por defecto del dashboard).
create index if not exists idx_inmuebles_src_active_discount
  on inmuebles (source, is_active, discount_pct desc);

-- Orden por precio total y por precio/m² (bancos usa ppm2 por defecto).
create index if not exists idx_inmuebles_src_active_price
  on inmuebles (source, is_active, price);
create index if not exists idx_inmuebles_src_active_ppm2
  on inmuebles (source, is_active, price_per_m2);

-- Filtro por oportunidad (solo activos).
create index if not exists idx_inmuebles_opportunity
  on inmuebles (is_opportunity) where is_active;

-- Filtro/recomendaciones por ciudad.
create index if not exists idx_inmuebles_city
  on inmuebles (city);

-- Remates: orden por audiencia y filtro por ciudad.
create index if not exists idx_remates_auction_date
  on remates (auction_date);
create index if not exists idx_remates_city
  on remates (city);

-- Recalcula estadísticas del planner tras crear índices.
analyze inmuebles;
analyze remates;

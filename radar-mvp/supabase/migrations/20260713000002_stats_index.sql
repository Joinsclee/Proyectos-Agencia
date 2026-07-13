-- Índice para el contador de oportunidades del dashboard.
--
-- El índice que existía (inmuebles_opportunity_idx) empieza por country_code, y la
-- consulta del dashboard no filtra por país: al no poder usar la columna guía,
-- Postgres escaneaba las 105K filas y el contador tardaba ~6 s (y con los 5 counts
-- del dashboard en paralelo, se cancelaba por statement timeout y mostraba 0).
--
-- Este índice parcial cubre exactamente la consulta: sólo indexa oportunidades
-- activas, y guarda source + discount_pct, así que el conteo se resuelve leyendo
-- únicamente el índice (~18K entradas).

create index if not exists inmuebles_opp_source_idx
  on public.inmuebles (source, discount_pct)
  where is_opportunity = true and is_active = true;

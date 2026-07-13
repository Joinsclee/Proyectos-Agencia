-- Mantenimiento tras una re-ejecución completa del motor o un scrape masivo.
-- Pegar en Supabase Studio → SQL Editor y pulsar Run (todo el bloque, de una).
--
-- Cuándo: cuando el dashboard se ponga lento o devuelva
-- "canceling statement due to statement timeout".
--
-- Por qué: cada UPDATE de Postgres deja atrás la versión vieja de la fila. Tras
-- reescribir 100.000+ filas, el planificador se queda con estadísticas viejas
-- (cree que la tabla es otra), elige planes malos, y consultas de 0,7 s pasan a
-- 25 s o se cancelan. ANALYZE recalcula esas estadísticas.
--
-- Nota: VACUUM no se puede ejecutar desde este editor (Supabase envuelve las
-- sentencias en una transacción y Postgres lo prohíbe ahí). No hace falta: el
-- autovacuum recupera el espacio solo, y lo que arregla los planes es ANALYZE.

ANALYZE public.inmuebles;
ANALYZE public.remates;

-- Comprobación: last_analyze debe quedar con la fecha/hora de ahora.
-- filas_muertas alto no es grave si last_analyze está fresco: el autovacuum las
-- irá liberando por su cuenta.
SELECT relname     AS tabla,
       n_live_tup  AS filas_vivas,
       n_dead_tup  AS filas_muertas,
       last_analyze,
       last_autoanalyze,
       last_autovacuum
FROM pg_stat_user_tables
WHERE relname IN ('inmuebles', 'remates');

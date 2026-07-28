-- Índices para los filtros que viven dentro de `features`.
--
-- POR QUÉ. Habitaciones y estrato no son columnas: son claves dentro del JSON de
-- `features`. Sin índice, filtrar por ellas obliga a Postgres a abrir el JSON de
-- las 108.000 filas activas del portal, una por una.
--
-- Medido antes de esta migración, contra la base real:
--
--     filtro                              tiempo    resultado
--     type=house & bedroomsMin=3          25.759ms  HTTP 500 (timeout)
--     opp=1 & bedroomsMin=3               25.800ms  HTTP 500 (timeout)
--     priceMin=200M & stratumMin=4        25.501ms  HTTP 500 (timeout)
--
-- El código ya se arregló para que ninguno de esos casos vuelva a dar error:
-- renuncia de entrada al conteo exacto cuando hay un filtro JSON, y así responde
-- en ~1 segundo con un total aproximado. Estos índices son el paso siguiente —
-- permiten volver a contar exacto y quitan el único caso que sigue lento:
--
--     opp=1 & bedroomsMin=3               17.642ms  correcto, pero muy lento
--
-- La expresión indexada tiene que ser EXACTAMENTE la que usa la consulta. El
-- código compara con `features->bedrooms` (operador `->`, devuelve jsonb) y no
-- con `->>` (texto), porque en texto '11' < '2' y el filtro perdía las casas de
-- diez o más habitaciones. Un índice sobre `->>` no serviría para esta consulta.
--
-- Los índices son PARCIALES sobre `is_active = true`: el listado nunca consulta
-- inmuebles inactivos, así que indexar los 745 desactivados solo ocuparía espacio.

create index if not exists inmuebles_features_bedrooms_idx
  on public.inmuebles ((features -> 'bedrooms'))
  where is_active = true;

create index if not exists inmuebles_features_stratum_idx
  on public.inmuebles ((features -> 'stratum'))
  where is_active = true;

-- `is_opportunity` combinado con el filtro JSON es el caso que sigue tardando 17
-- segundos: el planificador no tiene por dónde empezar y acaba recorriendo todo.
-- Con este índice puede acotar primero por oportunidad —son 20.600 filas de
-- 108.000— y abrir el JSON solo de esas.
create index if not exists inmuebles_oportunidad_activa_idx
  on public.inmuebles (source, is_opportunity)
  where is_active = true and is_opportunity = true;

comment on index public.inmuebles_features_bedrooms_idx is
  'Filtro de habitaciones del listado. La expresión usa -> (jsonb), no ->>: en texto ''11'' < ''2''.';
comment on index public.inmuebles_features_stratum_idx is
  'Filtro de estrato del listado. Misma razón que el de habitaciones.';

-- Comprobación tras aplicar: los tres casos de arriba deben bajar de un segundo.
--   explain analyze
--   select count(*) from public.inmuebles
--    where is_active and source = 'fincaraiz' and is_opportunity
--      and (features -> 'bedrooms') >= '3';

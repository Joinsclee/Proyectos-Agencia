-- ════════════════════════════════════════════════════════════════════════════
--  Export para el MODO DEMO del Radar
--  Supabase devuelve 402 por cuota, así que la API no sirve: esto se corre
--  desde el panel → SQL Editor, que sigue funcionando.
--
--  Son CINCO consultas. Cada una devuelve UNA celda con un JSON.
--  Para cada una: ejecutar → «Download CSV» → guardar con el nombre indicado
--  en  radar-mvp/scripts/demo/datos/
--
--  Está acotado a TRES ciudades a propósito. El panel de «análisis de mercado»
--  necesita ~20 comparables del mismo barrio, misma área y mismo estrato para
--  enseñar un número; repartir 500 avisos entre 128 ciudades deja todas las
--  fichas sin comparables y la demo pierde justo lo que la vende.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1 · Avisos de portales  →  guardar como  portal.csv ────────────────────
-- Se recorta `features` a lo que la aplicación usa de verdad: la ficha enseña
-- descripción, fotos y amenidades, y el motor necesita geo, estrato y
-- habitaciones. Lo demás no viaja.
select json_agg(t)::text as datos from (
  select
    id, country_code, city, zone, type, price, currency, area_m2, price_per_m2,
    source, source_id, source_url, image_url, address,
    is_opportunity, discount_pct, crece_tier, crece_index, is_high, estado,
    is_active, scraped_at, first_seen_at, last_seen_at,
    jsonb_strip_nulls(jsonb_build_object(
      'lat',          features->'lat',
      'lng',          features->'lng',
      'stratum',      features->'stratum',
      'bedrooms',     features->'bedrooms',
      'bathrooms',    features->'bathrooms',
      'garages',      features->'garages',
      'neighborhood', features->'neighborhood',
      'is_project',   features->'is_project',
      'm2_private',   features->'m2_private',
      'antiguedad',   features->'antiguedad',
      'administracion', features->'administracion',
      'amenities',    features->'amenities',
      'description',  features->'description',
      'images',       (select jsonb_agg(v) from jsonb_array_elements(
                         coalesce(features->'images', '[]'::jsonb)) with ordinality x(v, n)
                       where n <= 6),           -- seis fotos bastan para la ficha
      'market',       features->'market'
    )) as features
  from (
    -- Cupo POR CIUDAD, no un tope global.
    --
    -- Con `order by city … limit 2400`, Bogotá —que tiene decenas de miles— se
    -- comía las 2400 enteras y Medellín y Santa Marta salían con cero. Se vio
    -- en la demo: filtrar por Medellín devolvía una pantalla vacía.
    select *, row_number() over (partition by city order by discount_pct desc nulls last) as n
    from public.inmuebles
    where is_active = true
      and source = 'fincaraiz'
      and city in ('bogota', 'medellin', 'santa marta')
      and price is not null and area_m2 is not null
  ) q
  where q.n <= 900
) t;

-- ─── 2 · Activos de banco  →  guardar como  bancos.csv ──────────────────────
-- Son pocos (≈393 en total), así que van todos: enseñan BBVA, Bancolombia,
-- Davivienda y AVAL, que es parte del argumento.
select json_agg(t)::text as datos from (
  select
    id, country_code, city, zone, type, price, currency, area_m2, price_per_m2,
    source, source_id, source_url, address,
    -- Las fotos de banco viven en Supabase Storage, que la restricción por
    -- cuota también bloquea (402). Se dejan en null para que el Radar pinte su
    -- marcador «ACTIVO DE BANCO» —un componente real del producto— en vez de
    -- 379 iconos de imagen rota. Las de portal van por un CDN externo y sí
    -- cargan, así que esas se conservan.
    case when image_url like '%%supabase.co%%' then null else image_url end as image_url,
    is_opportunity, discount_pct, crece_tier, crece_index, is_high, estado,
    is_active, scraped_at, first_seen_at, last_seen_at,
    jsonb_strip_nulls(jsonb_build_object(
      'lat', features->'lat', 'lng', features->'lng',
      'stratum', features->'stratum', 'bedrooms', features->'bedrooms',
      'bathrooms', features->'bathrooms', 'garages', features->'garages',
      'neighborhood', features->'neighborhood',
      'antiguedad', features->'antiguedad',
      'observaciones', features->'observaciones',
      'description', features->'description',
      'images', (select jsonb_agg(v) from jsonb_array_elements(
                   coalesce(features->'images', '[]'::jsonb)) with ordinality x(v, n)
                 where n <= 6 and v::text not like '%%supabase.co%%'),
      'market', features->'market'
    )) as features
  from public.inmuebles
  where is_active = true
    and source <> 'fincaraiz'
  order by discount_pct desc nulls last
  limit 450
) t;

-- ─── 3 · Remates judiciales  →  guardar como  remates.csv ───────────────────
-- Solo audiencias futuras: una demo con remates vencidos se nota.
select json_agg(t)::text as datos from (
  select
    id, country_code, city, department, property_type,
    appraisal_value, minimum_bid, minimum_bid_pct, auction_date,
    source, source_id, source_url, image_url,
    is_active, first_seen_at, last_seen_at,
    jsonb_strip_nulls(jsonb_build_object(
      'bank_name',        features->'bank_name',
      'is_bank_plaintiff', features->'is_bank_plaintiff',
      'juzgado',          features->'juzgado',
      'radicado',         features->'radicado',
      'description',      features->'description',
      'images', (select jsonb_agg(v) from jsonb_array_elements(
                   coalesce(features->'images', '[]'::jsonb)) with ordinality x(v, n)
                 where n <= 4)
    )) as features
  from public.remates
  where is_active = true
    and auction_date >= current_date
  order by auction_date asc
  limit 300
) t;

-- ─── 4 · Arriendos  →  guardar como  arriendos.csv ──────────────────────────
-- Sin esto la calculadora de rentabilidad no tiene comparables y se queda sin
-- el 17,6% — que es el número que más impresiona de la ficha.
-- Solo las seis claves que el motor lee.
select json_agg(t)::text as datos from (
  select
    id, country_code, city, zone, type, monthly_rent, currency,
    area_m2, monthly_rent_per_m2, source, source_id, is_active,
    jsonb_strip_nulls(jsonb_build_object(
      'lat', features->'lat', 'lng', features->'lng',
      'bedrooms', features->'bedrooms', 'garages', features->'garages',
      'neighborhood', features->'neighborhood', 'is_project', features->'is_project'
    )) as features
  from (
    -- Cupo por ciudad, por lo mismo que arriba: sin arriendos de una ciudad, la
    -- calculadora de sus fichas se queda sin la rentabilidad, que es el número
    -- que más impresiona.
    select *, row_number() over (partition by city order by id) as n
    from public.rental_listings
    where is_active = true
      and city in ('bogota', 'medellin', 'santa marta')
      and monthly_rent is not null
  ) q
  where q.n <= 2000
) t;

-- ─── 5 · Las cifras del titular  →  guardar como  stats.csv ─────────────────
-- Los totales REALES, para que la portada no mienta: el catálogo completo es
-- el que es, aunque la demo solo lleve una parte cargada.
select json_build_object(
  'portal_total', (select count(*) from public.inmuebles where is_active and source = 'fincaraiz'),
  'portal_opps',  (select count(*) from public.inmuebles where is_active and source = 'fincaraiz' and is_opportunity),
  'portal_high',  (select count(*) from public.inmuebles where is_active and source = 'fincaraiz' and is_high),
  'bancos',       (select count(*) from public.inmuebles where is_active and source <> 'fincaraiz'),
  'remates',      (select count(*) from public.remates   where is_active and auction_date >= current_date),
  'ciudades',     (select count(distinct city) from public.inmuebles where is_active),
  'exportado_en', now()
)::text as datos;

-- ============================================================
--  Radar Oportunidades Inmobiliarias · Sistema CRECE
-- ============================================================
--  Tabla principal para catálogo de oportunidades scrapeadas
--  via cron desde:
--    - 7 portales de bancos (Davivienda, Bancolombia, Aval,
--      BBVA, Caja Social, Itaú, CISA)
--    - 4 portales masivos (FincaRaíz vía API, Metrocuadrado,
--      Ciencuadras, Habi vía scraping)
--
--  Modelo de datos:
--    Misma estructura unificada que el workflow Aura v2 produce,
--    para máxima reutilización de parsers existentes.
--
--  Acceso:
--    - service_role (n8n cron) → INSERT / UPDATE / DELETE
--    - anon (frontend público) → SELECT via vista filtrada
-- ============================================================

create table if not exists public.oportunidades_inmobiliarias (
  id                          bigserial primary key,

  -- Identificación única (clave de upsert)
  portal                      text not null,
  codigo                      text not null,
  url                         text not null,
  fuente_tipo                 text not null check (fuente_tipo in ('banco', 'portal_masivo')),

  -- Datos básicos del inmueble
  tipo_inmueble               text,
  precio_total                bigint,
  administracion              bigint,
  area_m2                     numeric,
  precio_m2                   bigint,
  habitaciones                int,
  banos                       int,
  garajes                     int,
  parqueadero                 text,
  estrato                     int,
  piso                        int,
  antiguedad                  text,
  es_proyecto_nuevo           boolean default false,

  -- Ubicación
  ciudad                      text,
  departamento                text,
  barrio                      text,
  ubicacion_raw               text,

  -- Metadatos
  titulo                      text,
  fecha_publicacion           text,
  fecha_scraping              timestamptz not null default now(),
  fecha_ultima_actualizacion  timestamptz not null default now(),

  -- Análisis IA (precalculado en el cron, no on-demand)
  diferencia_mercado_pct      numeric,
  score                       int,
  recomendacion               text,
  evaluacion_ia               text,

  -- Visibilidad / paywall futuro
  visible_publico             boolean not null default true,

  -- Restricción: una propiedad por (portal, codigo)
  constraint oportunidades_portal_codigo_uniq unique (portal, codigo)
);

-- Índices para consulta del frontend
create index if not exists oportunidades_ciudad_idx
  on public.oportunidades_inmobiliarias (ciudad);

create index if not exists oportunidades_fuente_tipo_idx
  on public.oportunidades_inmobiliarias (fuente_tipo);

create index if not exists oportunidades_precio_total_idx
  on public.oportunidades_inmobiliarias (precio_total);

create index if not exists oportunidades_precio_m2_idx
  on public.oportunidades_inmobiliarias (precio_m2);

create index if not exists oportunidades_fecha_scraping_idx
  on public.oportunidades_inmobiliarias (fecha_scraping desc);

create index if not exists oportunidades_score_idx
  on public.oportunidades_inmobiliarias (score desc nulls last);

create index if not exists oportunidades_visible_idx
  on public.oportunidades_inmobiliarias (visible_publico)
  where visible_publico = true;

-- Trigger: auto-actualizar fecha_ultima_actualizacion en UPDATE
create or replace function public.set_oportunidades_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.fecha_ultima_actualizacion = now();
  return new;
end;
$$;

drop trigger if exists oportunidades_set_updated_at on public.oportunidades_inmobiliarias;
create trigger oportunidades_set_updated_at
  before update on public.oportunidades_inmobiliarias
  for each row execute function public.set_oportunidades_updated_at();

-- ============================================================
--  Row Level Security
-- ============================================================

alter table public.oportunidades_inmobiliarias enable row level security;

-- Por defecto, sin policies para anon → solo service_role accede a la tabla cruda.
-- El frontend público consume la VIEW siguiente (que oculta campos sensibles).

-- ============================================================
--  Vista pública: oculta dirección exacta, URL del banco, datos de contacto
--  El frontend (anon) consume esta vista.
--  El upgrade a premium expone la tabla completa.
-- ============================================================

create or replace view public.oportunidades_publicas as
select
  id, portal, fuente_tipo,
  tipo_inmueble, precio_total, area_m2, precio_m2,
  habitaciones, banos, garajes, parqueadero, estrato, piso, antiguedad,
  es_proyecto_nuevo,
  ciudad, departamento, barrio,
  titulo, fecha_publicacion, fecha_scraping,
  diferencia_mercado_pct, score, recomendacion, evaluacion_ia
  -- Campos NO incluidos (paywall): codigo, url, ubicacion_raw
from public.oportunidades_inmobiliarias
where visible_publico = true;

-- Permitir SELECT a anon sobre la vista pública
grant select on public.oportunidades_publicas to anon;
grant select on public.oportunidades_publicas to authenticated;

-- ============================================================
--  Vista de métricas: precio_m2 promedio/mediana por ciudad
--  Útil para el frontend (mostrar "precio del mercado") y para el cron
--  cuando calcula diferencia_mercado_pct de cada propiedad nueva.
-- ============================================================

create or replace view public.oportunidades_metricas_ciudad as
select
  ciudad,
  count(*) as total_propiedades,
  round(avg(precio_m2)) as precio_m2_promedio,
  round(percentile_cont(0.5) within group (order by precio_m2)) as precio_m2_mediana,
  min(precio_total) as precio_total_min,
  max(precio_total) as precio_total_max
from public.oportunidades_inmobiliarias
where visible_publico = true
  and precio_m2 is not null
  and precio_m2 between 500000 and 50000000
group by ciudad;

grant select on public.oportunidades_metricas_ciudad to anon;
grant select on public.oportunidades_metricas_ciudad to authenticated;

-- ============================================================
--  Radar de Oportunidades Inmobiliarias · MVP
--  Schema multi-país desde día 1 (CO, MX, PE, ...)
--  Basado en el Plan de Trabajo Técnico - MVP Colombia v1.1
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabla principal: inmuebles
-- Una fila = una propiedad publicada en alguna fuente.
-- Clave de upsert: (country_code, source, source_id)
-- ────────────────────────────────────────────────────────────
create table if not exists public.inmuebles (
  id              uuid primary key default gen_random_uuid(),

  -- Multi-país desde el día 1
  country_code    char(2) not null,                       -- 'CO', 'MX', 'PE'

  -- Ubicación
  city            text not null,
  zone            text,
  address         text,

  -- Características
  type            text,                                   -- apartment / house / commercial / lot
  price           numeric,
  currency        char(3) not null default 'COP',
  area_m2         numeric,
  price_per_m2    numeric generated always as (
                    case when area_m2 is not null and area_m2 > 0
                         then price / area_m2
                    end
                  ) stored,
  features        jsonb default '{}'::jsonb,              -- bedrooms, bathrooms, garages, stratum, etc.

  -- Fuente
  source          text not null,                          -- 'davivienda', 'bancolombia', 'bbva', 'aval', 'remates'
  source_id       text not null,                          -- código único en el portal
  source_url      text not null,
  image_url       text,                                   -- Supabase Storage path o URL externa

  -- Oportunidad (calculado por engine/comparables.ts en Fase 3)
  is_opportunity  boolean not null default false,
  discount_pct    numeric,

  -- Metadata
  scraped_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Upsert key
  constraint inmuebles_source_unique unique (country_code, source, source_id)
);

-- Índices para consultas del frontend y motor de comparables
create index if not exists inmuebles_country_city_idx
  on public.inmuebles (country_code, city);

create index if not exists inmuebles_country_source_idx
  on public.inmuebles (country_code, source);

create index if not exists inmuebles_opportunity_idx
  on public.inmuebles (country_code, is_opportunity, discount_pct desc)
  where is_opportunity = true;

create index if not exists inmuebles_price_per_m2_idx
  on public.inmuebles (country_code, city, type, price_per_m2);

create index if not exists inmuebles_scraped_at_idx
  on public.inmuebles (scraped_at desc);

-- Trigger: auto-actualizar updated_at
create or replace function public.set_inmuebles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inmuebles_set_updated_at on public.inmuebles;
create trigger inmuebles_set_updated_at
  before update on public.inmuebles
  for each row execute function public.set_inmuebles_updated_at();

-- ────────────────────────────────────────────────────────────
-- Tabla auxiliar: precios_mercado
-- Población: scraper FincaRaíz (Fase 3).
-- Uso: motor de comparables calcula precio_per_m2 promedio
-- por ciudad+zone+type+area_bucket para detectar oportunidades.
-- ────────────────────────────────────────────────────────────
create table if not exists public.precios_mercado (
  id              uuid primary key default gen_random_uuid(),
  country_code    char(2) not null,
  city            text not null,
  zone            text,
  type            text,
  price           numeric not null,
  currency        char(3) not null default 'COP',
  area_m2         numeric,
  price_per_m2    numeric generated always as (
                    case when area_m2 is not null and area_m2 > 0
                         then price / area_m2
                    end
                  ) stored,
  source          text not null default 'fincaraiz',
  source_url      text,
  scraped_at      timestamptz not null default now()
);

create index if not exists precios_mercado_lookup_idx
  on public.precios_mercado (country_code, city, type, scraped_at desc);

-- ────────────────────────────────────────────────────────────
-- Tabla scraping_logs
-- Una fila por ejecución de scraper.
-- Útil para diagnóstico: cuánto demoró, cuántos insertó, errores.
-- ────────────────────────────────────────────────────────────
create table if not exists public.scraping_logs (
  id              bigserial primary key,
  country_code    char(2) not null,
  source          text not null,                          -- 'davivienda', etc.
  status          text not null check (status in ('running', 'success', 'partial', 'error')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_ms     int generated always as (
                    case when finished_at is not null
                         then extract(epoch from (finished_at - started_at)) * 1000
                         else null
                    end
                  ) stored,
  records_found   int default 0,
  records_inserted int default 0,
  records_updated int default 0,
  errors          jsonb default '[]'::jsonb,
  meta            jsonb default '{}'::jsonb               -- páginas escrapeadas, URLs intentadas, etc.
);

create index if not exists scraping_logs_source_idx
  on public.scraping_logs (country_code, source, started_at desc);

create index if not exists scraping_logs_status_idx
  on public.scraping_logs (status, started_at desc);

-- ────────────────────────────────────────────────────────────
-- RLS
-- Tabla cruda solo accesible por service_role (scrapers, cron).
-- Frontend público lee via la vista oportunidades_publicas.
-- ────────────────────────────────────────────────────────────
alter table public.inmuebles enable row level security;
alter table public.precios_mercado enable row level security;
alter table public.scraping_logs enable row level security;

-- ────────────────────────────────────────────────────────────
-- Vista pública para el frontend (oculta source_url, address exacta)
-- Solo expone oportunidades validadas (is_opportunity = true)
-- ────────────────────────────────────────────────────────────
create or replace view public.oportunidades_publicas as
select
  id,
  country_code,
  city,
  zone,
  type,
  price,
  currency,
  area_m2,
  price_per_m2,
  features,
  source,                                                  -- nombre del banco visible (no la URL)
  image_url,
  is_opportunity,
  discount_pct,
  scraped_at
from public.inmuebles
where is_opportunity = true;
  -- Campos NO expuestos (paywall): source_id, source_url, address

grant select on public.oportunidades_publicas to anon;
grant select on public.oportunidades_publicas to authenticated;

-- Vista de métricas por ciudad (para hero stats del frontend)
create or replace view public.oportunidades_stats as
select
  country_code,
  city,
  count(*) filter (where is_opportunity = true) as total_oportunidades,
  count(*) as total_inmuebles,
  round(avg(discount_pct) filter (where is_opportunity = true), 1) as descuento_promedio_pct,
  round(min(price_per_m2)) as precio_m2_min,
  round(max(price_per_m2)) as precio_m2_max
from public.inmuebles
where price_per_m2 between 500000 and 50000000
group by country_code, city;

grant select on public.oportunidades_stats to anon;
grant select on public.oportunidades_stats to authenticated;

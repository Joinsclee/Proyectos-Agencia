-- =====================================================================
-- Radar MVP - Inventario de arriendos y comparables de renta
-- =====================================================================
-- Los cánones mensuales viven en una tabla separada de `inmuebles`.
-- Esto impide que un arriendo de $2,5M contamine precios de venta y el
-- índice CRECE. La aplicación solo los usa como evidencia de mercado.

create table if not exists public.rental_listings (
  id                    uuid primary key default gen_random_uuid(),
  country_code          char(2) not null,
  city                  text not null,
  zone                  text,
  address               text,
  type                  text,
  monthly_rent          numeric not null check (monthly_rent > 0),
  currency              char(3) not null default 'COP',
  area_m2               numeric,
  monthly_rent_per_m2   numeric generated always as (
                          case when area_m2 is not null and area_m2 > 0
                               then monthly_rent / area_m2
                          end
                        ) stored,
  features              jsonb not null default '{}'::jsonb,
  source                text not null,
  source_id             text not null,
  source_url            text not null,
  image_url             text,
  is_active             boolean not null default true,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  times_missed          integer not null default 0,
  deactivated_at        timestamptz,
  scraped_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint rental_listings_source_unique
    unique (country_code, source, source_id)
);

create index if not exists rental_listings_market_idx
  on public.rental_listings
    (country_code, city, type, monthly_rent_per_m2)
  where is_active = true;

create index if not exists rental_listings_zone_idx
  on public.rental_listings (country_code, city, zone, type)
  where is_active = true;

create index if not exists rental_listings_last_seen_idx
  on public.rental_listings (last_seen_at);

create or replace function public.set_rental_listings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rental_listings_set_updated_at on public.rental_listings;
create trigger rental_listings_set_updated_at
  before update on public.rental_listings
  for each row execute function public.set_rental_listings_updated_at();

create or replace function public.mark_stale_rental_listings(
  p_source text,
  p_country text,
  p_run_start timestamptz,
  p_threshold integer default 2
) returns table (incremented integer, deactivated integer)
language plpgsql
as $$
declare
  v_incremented integer := 0;
  v_deactivated integer := 0;
begin
  with bumped as (
    update public.rental_listings
       set times_missed = times_missed + 1
     where source = p_source
       and country_code = p_country
       and is_active = true
       and last_seen_at < p_run_start
    returning id
  )
  select count(*) into v_incremented from bumped;

  with deact as (
    update public.rental_listings
       set is_active = false,
           deactivated_at = now()
     where source = p_source
       and country_code = p_country
       and is_active = true
       and times_missed >= p_threshold
    returning id
  )
  select count(*) into v_deactivated from deact;

  return query select v_incremented, v_deactivated;
end;
$$;

alter table public.rental_listings enable row level security;

comment on table public.rental_listings is
  'Ofertas mensuales de arriendo usadas como comparables internos; no se mezclan con inventario de venta.';

-- Replica la cobertura geográfica configurada para venta. Los rangos monetarios
-- se dejan abiertos porque los de venta no tienen sentido para un canon mensual.
insert into public.radar_zonas_monitoreadas
  (country_code, city, portal, operation, property_type, neighborhood_slug,
   city_slug, dept_slug, location_id, price_min, price_max, area_min, area_max,
   stratum_min, stratum_max, bedrooms_min, max_pages, min_comparables,
   is_active, notes)
select distinct on (
    v.country_code, v.property_type, coalesce(v.neighborhood_slug, ''),
    v.city_slug, v.dept_slug
  )
  v.country_code,
  v.city,
  v.portal,
  'arriendo',
  v.property_type,
  v.neighborhood_slug,
  v.city_slug,
  v.dept_slug,
  v.location_id,
  null,
  null,
  v.area_min,
  v.area_max,
  v.stratum_min,
  v.stratum_max,
  v.bedrooms_min,
  v.max_pages,
  v.min_comparables,
  v.is_active,
  concat('Comparable de arriendo · ', coalesce(v.notes, 'misma cobertura de venta'))
from public.radar_zonas_monitoreadas v
where v.portal = 'fincaraiz'
  and v.operation = 'venta'
  and not exists (
    select 1
    from public.radar_zonas_monitoreadas r
    where r.country_code = v.country_code
      and r.portal = v.portal
      and r.operation = 'arriendo'
      and r.property_type = v.property_type
      and r.neighborhood_slug is not distinct from v.neighborhood_slug
      and r.city_slug = v.city_slug
      and r.dept_slug = v.dept_slug
  )
order by
  v.country_code, v.property_type, coalesce(v.neighborhood_slug, ''),
  v.city_slug, v.dept_slug, v.created_at;

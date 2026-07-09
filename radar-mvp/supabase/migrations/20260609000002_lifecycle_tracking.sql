-- =====================================================================
-- Radar MVP - Lifecycle tracking (soft-delete con grace period)
-- =====================================================================
-- Objetivo: cuando un aviso/inmueble deja de aparecer en su portal,
-- no lo borramos inmediatamente — toleramos hasta 2 runs consecutivos
-- de "no visto" antes de marcarlo como `is_active=false`.
--
-- Esto evita falsos positivos cuando el portal está caído o el scrape
-- falla parcialmente, y al mismo tiempo retira del dashboard lo que
-- realmente fue vendido/retirado.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────
-- inmuebles: agregar columnas de tracking (las de remates ya existen)
-- ─────────────────────────────────────────────────────────────────
alter table public.inmuebles add column if not exists is_active boolean not null default true;
alter table public.inmuebles add column if not exists first_seen_at timestamptz not null default now();
alter table public.inmuebles add column if not exists last_seen_at timestamptz not null default now();
alter table public.inmuebles add column if not exists times_missed integer not null default 0;
alter table public.inmuebles add column if not exists deactivated_at timestamptz;

-- Para datos existentes (430 inmuebles ya scrapeados): los marcamos como
-- activos vistos por última vez en su `scraped_at`. Así el primer scrape
-- nuevo refresca last_seen_at automáticamente.
update public.inmuebles
   set last_seen_at  = coalesce(last_seen_at,  scraped_at),
       first_seen_at = coalesce(first_seen_at, scraped_at)
 where last_seen_at = first_seen_at;  -- solo los nuevos default

create index if not exists idx_inmuebles_is_active   on public.inmuebles (is_active) where is_active = true;
create index if not exists idx_inmuebles_last_seen   on public.inmuebles (last_seen_at);
create index if not exists idx_inmuebles_times_missed on public.inmuebles (times_missed) where times_missed > 0;

-- ─────────────────────────────────────────────────────────────────
-- remates: agregar times_missed (las demás ya existen)
-- ─────────────────────────────────────────────────────────────────
alter table public.remates add column if not exists times_missed integer not null default 0;
alter table public.remates add column if not exists deactivated_at timestamptz;

create index if not exists idx_remates_times_missed on public.remates (times_missed) where times_missed > 0;

-- ─────────────────────────────────────────────────────────────────
-- Función reutilizable: marca como missed los que no se vieron en
-- el run actual, y desactiva los que pasaron el threshold.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.mark_stale_inmuebles(
  p_source text,
  p_country text,
  p_run_start timestamptz,
  p_threshold integer default 2
) returns table (incremented integer, deactivated integer)
language plpgsql as $$
declare
  v_incremented integer := 0;
  v_deactivated integer := 0;
begin
  -- Incrementa times_missed para los que estaban activos pero no se vieron en este run
  with bumped as (
    update public.inmuebles
       set times_missed = times_missed + 1
     where source = p_source
       and country_code = p_country
       and is_active = true
       and last_seen_at < p_run_start
    returning id, times_missed
  )
  select count(*) into v_incremented from bumped;

  -- Desactiva los que pasaron el threshold
  with deact as (
    update public.inmuebles
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

create or replace function public.mark_stale_remates(
  p_source text,
  p_country text,
  p_run_start timestamptz,
  p_threshold integer default 2
) returns table (incremented integer, deactivated integer)
language plpgsql as $$
declare
  v_incremented integer := 0;
  v_deactivated integer := 0;
begin
  with bumped as (
    update public.remates
       set times_missed = times_missed + 1
     where source = p_source
       and country_code = p_country
       and is_active = true
       and last_seen_at < p_run_start
    returning id, times_missed
  )
  select count(*) into v_incremented from bumped;

  with deact as (
    update public.remates
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

comment on function public.mark_stale_inmuebles is 'Sube times_missed e inactiva inmuebles no vistos en el run actual (soft-delete con grace period)';
comment on function public.mark_stale_remates   is 'Sube times_missed e inactiva remates no vistos en el run actual (soft-delete con grace period)';

-- =====================================================================
-- Radar MVP - Historial de precios + Zonas monitoreadas
-- =====================================================================
-- Dos piezas para la Fase 3 (Fuente C: FincaRaíz + motor de comparables):
--
--   1. price_history  → traza cada cambio de precio de un inmueble.
--      Señal de oportunidad fuerte: "bajó de $X a $Y" (rebaja real).
--      Se llena solo vía trigger; ningún scraper escribe aquí a mano.
--
--   2. radar_zonas_monitoreadas → catálogo de zonas + criterios de
--      ELEGIBILIDAD (no es un scheduler). Define:
--        a) cómo construir las URLs de FincaRaíz para el baseline, y
--        b) qué rangos (precio/área/estrato) hacen que un inmueble de
--           banco/remate sea candidato a "oportunidad".
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. price_history (genérica, FK a inmuebles, poblada por trigger)
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.price_history (
  id              uuid primary key default gen_random_uuid(),
  inmueble_id     uuid not null references public.inmuebles (id) on delete cascade,

  -- snapshot del precio en el momento del cambio
  price           numeric not null,
  currency        char(3) not null default 'COP',
  area_m2         numeric,
  price_per_m2    numeric generated always as (
                    case when area_m2 is not null and area_m2 > 0
                         then price / area_m2
                    end
                  ) stored,

  -- denormalizado para consultas rápidas sin join
  source          text,
  change_kind     text not null check (change_kind in ('initial', 'increase', 'decrease')),
  prev_price      numeric,                                  -- null en 'initial'
  delta_pct       numeric,                                  -- (price - prev) / prev * 100

  observed_at     timestamptz not null default now()
);

create index if not exists price_history_inmueble_idx
  on public.price_history (inmueble_id, observed_at desc);

create index if not exists price_history_decrease_idx
  on public.price_history (change_kind, observed_at desc)
  where change_kind = 'decrease';

-- ─────────────────────────────────────────────────────────────────
-- Trigger: registra precio inicial (INSERT) y cada cambio (UPDATE OF price).
-- AFTER para que el inmueble ya exista cuando insertamos el historial.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.log_price_history()
returns trigger
language plpgsql
as $$
declare
  v_kind  text;
  v_prev  numeric;
  v_delta numeric;
begin
  if (tg_op = 'INSERT') then
    if new.price is null then
      return new;                                           -- sin precio, nada que registrar
    end if;
    v_kind := 'initial';
    v_prev := null;
    v_delta := null;
  else
    -- UPDATE: solo si el precio cambió de verdad
    if new.price is not distinct from old.price then
      return new;
    end if;
    -- de null → valor lo tratamos como 'initial'
    if old.price is null then
      v_kind := 'initial';
      v_prev := null;
      v_delta := null;
    else
      v_kind := case when new.price < old.price then 'decrease' else 'increase' end;
      v_prev := old.price;
      v_delta := case when old.price <> 0
                      then round(((new.price - old.price) / old.price) * 100, 2)
                      else null end;
    end if;
  end if;

  insert into public.price_history
    (inmueble_id, price, currency, area_m2, source, change_kind, prev_price, delta_pct)
  values
    (new.id, new.price, new.currency, new.area_m2, new.source, v_kind, v_prev, v_delta);

  return new;
end;
$$;

drop trigger if exists inmuebles_log_price_history on public.inmuebles;
create trigger inmuebles_log_price_history
  after insert or update of price on public.inmuebles
  for each row execute function public.log_price_history();

alter table public.price_history enable row level security;

comment on table public.price_history is
  'Historial de precios por inmueble. Poblada solo por trigger inmuebles_log_price_history. Señal de oportunidad: change_kind=decrease.';

-- ─────────────────────────────────────────────────────────────────
-- 2. radar_zonas_monitoreadas (filtro de elegibilidad + config de URLs)
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.radar_zonas_monitoreadas (
  id              uuid primary key default gen_random_uuid(),
  country_code    char(2) not null default 'CO',
  city            text not null,                            -- nombre legible: 'Medellín'

  -- Construcción de URL del portal abierto (FincaRaíz)
  portal          text not null default 'fincaraiz',
  operation       text not null default 'venta',            -- venta / arriendo
  property_type   text not null default 'apartamentos',     -- slug del portal
  neighborhood_slug text,                                   -- 'robledo' (opcional: acota a barrio)
  city_slug       text not null,                            -- 'medellin'
  dept_slug       text not null,                            -- 'antioquia'
  location_id     text,                                     -- UUID interno FincaRaíz (filtro hashed)

  -- Filtro de elegibilidad: qué hace a un inmueble candidato a oportunidad
  price_min       numeric,
  price_max       numeric,
  area_min        numeric,
  area_max        numeric,
  stratum_min     int,
  stratum_max     int,
  bedrooms_min    int,

  -- Control de scraping / comparables
  max_pages       int not null default 25,                  -- páginas de baseline a raspar
  min_comparables int not null default 8,                   -- n mínimo para confiar en la mediana

  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint radar_zonas_unique
    unique (country_code, portal, operation, property_type, neighborhood_slug, city_slug, dept_slug)
);

create index if not exists radar_zonas_active_idx
  on public.radar_zonas_monitoreadas (country_code, is_active)
  where is_active = true;

-- Trigger updated_at (reutiliza patrón existente)
create or replace function public.set_radar_zonas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists radar_zonas_set_updated_at on public.radar_zonas_monitoreadas;
create trigger radar_zonas_set_updated_at
  before update on public.radar_zonas_monitoreadas
  for each row execute function public.set_radar_zonas_updated_at();

alter table public.radar_zonas_monitoreadas enable row level security;

comment on table public.radar_zonas_monitoreadas is
  'Catálogo de zonas + criterios de elegibilidad (no scheduler). Define URLs del portal abierto y rangos precio/área/estrato para clasificar oportunidades.';

-- ─────────────────────────────────────────────────────────────────
-- Seed: COBERTURA NACIONAL (Ola 1) — clientes de todo el país.
-- Estrategia city-deep: una fila por (ciudad × tipo), neighborhood_slug=NULL,
-- max_pages=0 (auto: el scraper lee total/lastPage del 1er fetch y pagina hasta
-- el final). Sin filtro de segmento (price/area/stratum NULL) → cobertura total;
-- el motor de comparables y el dashboard filtran después. El matching de
-- comparables es por radio geográfico (lat/lng), así que city-deep basta.
-- Slugs de ciudad/depto verificados en vivo (FincaRaíz auto-corrige por 301).
-- Inventario aprox por ciudad (apartamentos venta): Bogotá 19.4k, Medellín 10.7k,
-- Cali 6.5k, Barranquilla 4.8k, Cartagena 3.6k, Pereira 3.1k, Bucaramanga 1.8k.
-- ─────────────────────────────────────────────────────────────────
insert into public.radar_zonas_monitoreadas
  (country_code, city, operation, property_type, neighborhood_slug, city_slug, dept_slug,
   max_pages, min_comparables, notes)
values
  -- Ola 1 — 7 ciudades principales × {apartamentos, casas}
  ('CO','Bogotá',      'venta','apartamentos',NULL,'bogota',      'bogota-dc',        0,8,'Ola 1 · usar bogota-dc (cundinamarca hace 301)'),
  ('CO','Bogotá',      'venta','casas',       NULL,'bogota',      'bogota-dc',        0,8,'Ola 1'),
  ('CO','Medellín',    'venta','apartamentos',NULL,'medellin',    'antioquia',        0,8,'Ola 1'),
  ('CO','Medellín',    'venta','casas',       NULL,'medellin',    'antioquia',        0,8,'Ola 1'),
  ('CO','Cali',        'venta','apartamentos',NULL,'cali',        'valle-del-cauca',  0,8,'Ola 1'),
  ('CO','Cali',        'venta','casas',       NULL,'cali',        'valle-del-cauca',  0,8,'Ola 1'),
  ('CO','Barranquilla','venta','apartamentos',NULL,'barranquilla','atlantico',        0,8,'Ola 1'),
  ('CO','Barranquilla','venta','casas',       NULL,'barranquilla','atlantico',        0,8,'Ola 1'),
  ('CO','Cartagena',   'venta','apartamentos',NULL,'cartagena',   'bolivar',          0,8,'Ola 1'),
  ('CO','Cartagena',   'venta','casas',       NULL,'cartagena',   'bolivar',          0,8,'Ola 1'),
  ('CO','Bucaramanga', 'venta','apartamentos',NULL,'bucaramanga', 'santander',        0,8,'Ola 1'),
  ('CO','Bucaramanga', 'venta','casas',       NULL,'bucaramanga', 'santander',        0,8,'Ola 1'),
  ('CO','Pereira',     'venta','apartamentos',NULL,'pereira',     'risaralda',        0,8,'Ola 1'),
  ('CO','Pereira',     'venta','casas',       NULL,'pereira',     'risaralda',        0,8,'Ola 1'),
  -- Ola 2 — ciudades intermedias (slugs de depto reales, verificados)
  ('CO','Manizales',   'venta','apartamentos',NULL,'manizales',   'caldas',           0,8,'Ola 2'),
  ('CO','Santa Marta', 'venta','apartamentos',NULL,'santa-marta', 'magdalena',        0,8,'Ola 2'),
  ('CO','Cúcuta',      'venta','apartamentos',NULL,'cucuta',      'norte-de-santander',0,8,'Ola 2'),
  ('CO','Ibagué',      'venta','apartamentos',NULL,'ibague',      'tolima',           0,8,'Ola 2'),
  ('CO','Villavicencio','venta','apartamentos',NULL,'villavicencio','meta',           0,8,'Ola 2'),
  ('CO','Armenia',     'venta','apartamentos',NULL,'armenia',     'quindio',          0,8,'Ola 2'),
  ('CO','Neiva',       'venta','apartamentos',NULL,'neiva',       'huila',            0,8,'Ola 2'),
  ('CO','Montería',    'venta','apartamentos',NULL,'monteria',    'cordoba',          0,8,'Ola 2'),
  ('CO','Pasto',       'venta','apartamentos',NULL,'pasto',       'narino',           0,8,'Ola 2'),
  ('CO','Valledupar',  'venta','apartamentos',NULL,'valledupar',  'cesar',            0,8,'Ola 2')
on conflict on constraint radar_zonas_unique do nothing;

-- =====================================================================
-- Radar MVP - Fase 2: Remates judiciales
-- Cliente: Andrés Giraldo · Sistema CRECE
-- Fuente: rematandobienes.com (suscripción Andrés)
-- =====================================================================
-- Tabla SEPARADA de `inmuebles` porque los datos son fundamentalmente
-- distintos (juzgado, proceso, fecha diligencia, avalúo, postura,
-- secuestre, demandado, demandante) — no son specs de propiedad.
--
-- Modelo unificado de UN remate por aviso del portal.
-- =====================================================================

create table if not exists public.remates (
  id uuid primary key default gen_random_uuid(),

  -- ─── Identidad ─────────────────────────────────────────────────────
  country_code char(2) not null default 'CO',
  source text not null default 'rematandobienes',     -- 'rematandobienes', 'subastas', ...
  source_id text not null,                            -- código del remate o slug del aviso
  source_url text not null,                           -- URL del aviso original

  -- ─── Ubicación ──────────────────────────────────────────────────────
  department text,                                    -- 'cundinamarca', 'antioquia', ...
  city text not null,                                 -- 'bogota', 'la vega', ...
  address text,                                       -- dirección completa del bien

  -- ─── Tipo de bien (para mostrar imagen placeholder) ─────────────────
  property_type text,                                 -- 'house','apartment','lot','commercial','farm','office'
  property_type_raw text,                             -- texto literal del título o categoría

  -- ─── Identificación del bien ────────────────────────────────────────
  matricula_inmobiliaria text,                        -- M.I. 156-108676
  description text,                                   -- "LOTE DE TERRENO DENOMINADO EL OCOBO..."

  -- ─── Datos del proceso judicial ─────────────────────────────────────
  court text,                                         -- JUZGADO PRIMERO (1) CIVIL DEL CIRCUITO...
  court_email text,                                   -- jcctovilleta@cendoj.ramajudicial.gov.co
  court_address text,                                 -- Calle 6 No. 8-90
  case_number text,                                   -- 25875310300120200006800

  plaintiff text,                                     -- PEDRO RUBIO GUASCA Y CAMILO ANDRES ARDILA FLOREZ
  defendant text,                                     -- LEONOR OCHOA MARTINEZ
  trustee text,                                       -- "El SECUESTRE designado del citado bien..."

  -- ─── Diligencia (la subasta misma) ──────────────────────────────────
  auction_date date,                                  -- 2026-06-30
  auction_date_raw text,                              -- "junio 30, 2026" (texto literal del portal)
  auction_time text,                                  -- "9:00 A.M."
  auction_mode text,                                  -- 'virtual', 'presencial', null

  -- ─── Valores económicos ────────────────────────────────────────────
  appraisal_value numeric,                            -- 787141000  (avalúo del bien)
  appraisal_value_raw text,                           -- "$787.141.000" o "$787,141,000"
  minimum_bid numeric,                                -- 550998699 (postura mínima)
  minimum_bid_raw text,
  minimum_bid_pct numeric,                            -- 70.0 (% del avalúo, default 70)
  deposit_pct numeric,                                -- % de depósito requerido (40% típico)
  currency char(3) not null default 'COP',

  -- ─── Imagen (siempre placeholder por tipo: el portal no tiene fotos) ─
  image_url text,                                     -- URL pública del placeholder según property_type

  -- ─── Datos extra del aviso (todo lo que no encaja arriba) ──────────
  features jsonb not null default '{}'::jsonb,

  -- ─── Tracking de cambios (para "nuevos / activos / salidos") ───────
  first_seen_at timestamptz not null default now(),   -- primera vez que lo vimos
  last_seen_at timestamptz not null default now(),    -- última vez que estaba en el portal
  scraped_at timestamptz not null default now(),      -- timestamp del run
  is_active boolean not null default true,            -- false cuando ya no aparece (vencido / retirado)

  -- ─── Auditoría ──────────────────────────────────────────────────────
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identidad única por (país, fuente, código)
  constraint remates_source_unique unique (country_code, source, source_id)
);

-- ─── Índices ─────────────────────────────────────────────────────────
create index if not exists idx_remates_city          on public.remates (city);
create index if not exists idx_remates_department    on public.remates (department);
create index if not exists idx_remates_type          on public.remates (property_type);
create index if not exists idx_remates_auction_date  on public.remates (auction_date);
create index if not exists idx_remates_is_active     on public.remates (is_active) where is_active = true;
create index if not exists idx_remates_appraisal     on public.remates (appraisal_value);

-- ─── Trigger updated_at ─────────────────────────────────────────────
create or replace function public.tg_remates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_remates_updated_at on public.remates;
create trigger trg_remates_updated_at
  before update on public.remates
  for each row execute function public.tg_remates_set_updated_at();

-- ─── Log de scraping ────────────────────────────────────────────────
-- Reusa la tabla `scraping_logs` ya existente del schema inmuebles.
-- (source='rematandobienes', country_code='CO')

comment on table public.remates is 'Avisos de remates judiciales scrapeados periódicamente. Un aviso = una fila. first_seen_at/last_seen_at/is_active permiten reportar nuevos vs salidos vs activos.';

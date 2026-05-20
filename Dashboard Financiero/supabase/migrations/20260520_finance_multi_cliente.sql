-- ============================================================
--  Dashboard Financiero JoinsClee · Multi-cliente
-- ============================================================
--  Modelo:
--    finance_clients     → maestro de clientes (Lina, Andy, etc.)
--    finance_params      → TRM + % reparto por cliente
--    finance_partners    → partes que se reparten utilidad (nombre + %)
--    finance_revenues    → ingresos (Skool, Stripe, manual)
--    finance_expenses    → gastos asumidos por cada parte
--    finance_ad_charges  → detalle de cobros de pauta Meta
--    finance_snapshots   → informes generados (para "compartir con cliente")
--
--  RLS: el dashboard vive embebido en GHL sin auth → políticas
--  permisivas para `anon`. Las URLs son secretas por convención.
--  Si después necesitamos autenticar editores, endurecemos políticas.
-- ============================================================

-- ===================== TABLA: clientes =======================
create table if not exists public.finance_clients (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  agency_name     text not null default 'JoinsClee',
  color_primary   text default '#9caf88',
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists finance_clients_active_idx
  on public.finance_clients (is_active);

-- ===================== TABLA: parámetros =====================
create table if not exists public.finance_params (
  client_id           uuid primary key references public.finance_clients(id) on delete cascade,
  trm_cop_per_usd     numeric(12,4) not null default 3900,
  trm_source          text default 'Banco de la República',
  trm_updated_at      timestamptz default now(),
  client_share        numeric(5,4) not null default 0.7,
  agency_share        numeric(5,4) not null default 0.3,
  reinvest_share      numeric(5,4) not null default 0.0,
  updated_at          timestamptz not null default now(),
  constraint shares_sum_to_one check (
    abs((client_share + agency_share + reinvest_share) - 1.0) < 0.0001
  )
);

-- ===================== TABLA: ingresos =======================
create table if not exists public.finance_revenues (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.finance_clients(id) on delete cascade,
  paid_at         date not null,
  source          text not null default 'skool',
  concept         text,
  usd_amount      numeric(14,2) not null default 0,
  cop_real        numeric(14,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists finance_revenues_client_idx
  on public.finance_revenues (client_id, paid_at desc);

-- ===================== TABLA: gastos =========================
create table if not exists public.finance_expenses (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.finance_clients(id) on delete cascade,
  spent_at        date not null,
  paid_by         text not null check (paid_by in ('client','agency')),
  concept         text not null,
  category        text,
  frequency       text default 'unico',
  months_billed   numeric(6,2) default 1,
  usd_amount      numeric(14,2),
  cop_amount      numeric(14,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists finance_expenses_client_idx
  on public.finance_expenses (client_id, spent_at desc);

create index if not exists finance_expenses_paid_by_idx
  on public.finance_expenses (client_id, paid_by);

-- ===================== TABLA: cobros pauta Meta ==============
create table if not exists public.finance_ad_charges (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.finance_clients(id) on delete cascade,
  charged_at        date not null,
  transaction_id    text,
  usd_amount        numeric(14,2) not null default 0,
  status            text default 'cobrado' check (status in ('cobrado','fallido','pendiente')),
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists finance_ad_charges_client_idx
  on public.finance_ad_charges (client_id, charged_at desc);

-- ===================== TABLA: informes guardados =============
create table if not exists public.finance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.finance_clients(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  title           text,
  payload         jsonb not null,
  generated_at    timestamptz not null default now()
);

create index if not exists finance_snapshots_client_idx
  on public.finance_snapshots (client_id, generated_at desc);

-- ===================== Trigger updated_at ====================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'finance_clients','finance_params','finance_revenues','finance_expenses'
  ] loop
    execute format(
      'drop trigger if exists trg_%s_touch on public.%s;', t, t
    );
    execute format(
      'create trigger trg_%s_touch before update on public.%s for each row execute function public.touch_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ===================== RLS · acceso anon =====================
-- IMPORTANTE: para uso embebido en GHL sin auth.
-- Si después hay sesiones, restringimos por user_id.
alter table public.finance_clients     enable row level security;
alter table public.finance_params      enable row level security;
alter table public.finance_revenues    enable row level security;
alter table public.finance_expenses    enable row level security;
alter table public.finance_ad_charges  enable row level security;
alter table public.finance_snapshots   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'finance_clients','finance_params','finance_revenues',
    'finance_expenses','finance_ad_charges','finance_snapshots'
  ] loop
    execute format('drop policy if exists "anon all %s" on public.%s;', t, t);
    execute format(
      'create policy "anon all %s" on public.%s for all to anon using (true) with check (true);',
      t, t
    );
    execute format('drop policy if exists "auth all %s" on public.%s;', t, t);
    execute format(
      'create policy "auth all %s" on public.%s for all to authenticated using (true) with check (true);',
      t, t
    );
  end loop;
end $$;

-- ===================== SEED: cliente Lina ====================
insert into public.finance_clients (slug, name, agency_name, color_primary, notes)
values ('lina', 'Lina Toro (SAVIAS)', 'JoinsClee', '#9caf88',
        'Cuadre financiero SAVIAS x JoinsClee. Inicio colaboración: 2 de febrero de 2026.')
on conflict (slug) do nothing;

insert into public.finance_params (client_id, trm_cop_per_usd, trm_source, client_share, agency_share)
select id, 3729.27, 'Banco de la República · 8 may 2026', 0.7, 0.3
from public.finance_clients where slug = 'lina'
on conflict (client_id) do nothing;

-- Ingresos Skool históricos de Lina (Excel original)
with lina as (select id from public.finance_clients where slug='lina' limit 1)
insert into public.finance_revenues (client_id, paid_at, source, concept, usd_amount, cop_real)
select lina.id, d::date, 'skool', 'Payout Bancolombia •• 6181', usd, null
from lina,
(values
  ('2026-03-18'::date, 1545.25),
  ('2026-03-25'::date, 1700.45),
  ('2026-04-01'::date, 25.92),
  ('2026-04-15'::date, 428.98),
  ('2026-04-22'::date, 562.06),
  ('2026-04-29'::date, 393.63),
  ('2026-05-06'::date, 25.92)
) as v(d, usd)
where not exists (
  select 1 from public.finance_revenues r
   where r.client_id = lina.id and r.paid_at = v.d and r.source='skool'
);

-- Gastos Lina recurrentes (Excel original)
with lina as (select id from public.finance_clients where slug='lina' limit 1)
insert into public.finance_expenses
  (client_id, spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
select lina.id, '2026-02-02'::date, 'client', concept, category, freq, meses, usd, cop, notas
from lina,
(values
  ('Skool',                              'Plataforma comunidad',     'mensual', 3.0, 99.0::numeric, null::numeric, 'Hosting comunidad SAVIAS'),
  ('Funnelchat',                         'Automatización WhatsApp',  'mensual', 3.0, 49.0,          null,          'SmartChat / SellerChat'),
  ('ManyChat',                           'Automatización Instagram', 'mensual', 3.0, 15.0,          null,          'Triggers JABÓN, PIEL, INICIO, etc.'),
  ('Edición YouTube — Lazariiio (50%)',  'Producción audiovisual',   'unico',   1.0, null,          900000,        'Primer 50% del paquete mensual de 4 videos')
) as v(concept, category, freq, meses, usd, cop, notas)
where not exists (
  select 1 from public.finance_expenses e
   where e.client_id = lina.id and e.concept = v.concept
);

-- Cobros Meta históricos de Lina (Excel original — primeros 20 cobros)
with lina as (select id from public.finance_clients where slug='lina' limit 1)
insert into public.finance_ad_charges (client_id, charged_at, transaction_id, usd_amount, status)
select lina.id, d::date, txid, usd, 'cobrado'
from lina,
(values
  ('2026-04-02', '26572664362423596-26429900946699936', 15.85),
  ('2026-03-24', '26591968590493175-26265546299802067', 22.61),
  ('2026-03-22', '26621529580870411-26406222812401089', 22.61),
  ('2026-03-21', '26468362829520418-26681058464917516', 1.45),
  ('2026-03-21', '26468361729520528-26607278612295508', 11.33),
  ('2026-03-21', '26237165705973460-26357343890622311', 5.66),
  ('2026-03-21', '26563207766702591-26681055428251153', 2.83),
  ('2026-03-21', '26681054208251275-26319660774390620', 1.42),
  ('2026-03-17', '26562583706764999-26518033244553377', 22.61),
  ('2026-03-15', '26256860720670626-26294395416917159', 1.62),
  ('2026-03-15', '26499869073036461-26233079546382078', 12.85),
  ('2026-03-15', '26405535969136438-26499868619703173', 6.43),
  ('2026-03-15', '26405535299136505-26544570408566329', 3.21),
  ('2026-03-15', '26375920158764685-26405534705803231', 1.61),
  ('2026-03-14', '26245022415187790-26606411935715503', 2.81),
  ('2026-03-14', '26606410999048930-26282460948110606', 1.4),
  ('2026-03-13', '26596548270035203-26307542422269129', 22.61),
  ('2026-03-12', '26143048612051837-26201154719574561', 22.61),
  ('2026-03-11', '26333114713045230-26214092231614142', 22.61),
  ('2026-03-06', '26286141294409239-26315731628116873', 16.66)
) as v(d, txid, usd)
where not exists (
  select 1 from public.finance_ad_charges a
   where a.client_id = lina.id and a.transaction_id = v.txid
);

-- Gasto agregado de pauta Meta para Lina (el subtotal cargado a su tarjeta)
with lina as (select id from public.finance_clients where slug='lina' limit 1)
insert into public.finance_expenses
  (client_id, spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
select lina.id, '2026-04-01'::date, 'client',
       'Pauta Meta Ads', 'Publicidad', 'acumulado', 1.0,
       (select coalesce(sum(usd_amount),0) from public.finance_ad_charges a where a.client_id = lina.id),
       null,
       'Suma de cobros Meta. Lina llena el COP REAL si el banco cobró distinto al TRM.'
where not exists (
  select 1 from public.finance_expenses e
   where e.client_id = lina.id and e.concept = 'Pauta Meta Ads'
);

-- Gastos JoinsClee (agencia) de Lina
with lina as (select id from public.finance_clients where slug='lina' limit 1)
insert into public.finance_expenses
  (client_id, spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
select lina.id, '2026-04-01'::date, 'agency',
       'Edición de Reels', 'Producción audiovisual', 'unico', 1.0,
       180, null, '10 reels × $18 USD'
where not exists (
  select 1 from public.finance_expenses e
   where e.client_id = lina.id and e.paid_by = 'agency' and e.concept = 'Edición de Reels'
);

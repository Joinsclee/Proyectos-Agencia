-- ============================================================
--  Dashboard Financiero Lina Toro (SAVIAS × JoinsClee)
-- ============================================================
--  Versión específica para Lina (sin abstracción multi-cliente).
--  Cuando queramos escalar a más clientes, migramos al schema
--  multi-cliente (ver 20260520_finance_multi_cliente.sql).
--
--  Tablas:
--    lina_finance_params       → singleton (TRM + % reparto)
--    lina_finance_revenues     → ingresos Skool
--    lina_finance_expenses     → gastos (Lina o JoinsClee)
--    lina_finance_ad_charges   → cobros pauta Meta
--    lina_finance_snapshots    → informes guardados
-- ============================================================

-- ===================== TABLA: parámetros =====================
create table if not exists public.lina_finance_params (
  id                  smallint primary key default 1,
  trm_cop_per_usd     numeric(12,4) not null default 3729.27,
  trm_source          text default 'Banco de la República · 8 may 2026',
  trm_updated_at      timestamptz default now(),
  lina_share          numeric(5,4) not null default 0.7,
  joinsclee_share     numeric(5,4) not null default 0.3,
  updated_at          timestamptz not null default now(),
  constraint single_row check (id = 1),
  constraint shares_sum_to_one check (
    abs((lina_share + joinsclee_share) - 1.0) < 0.0001
  )
);

-- ===================== TABLA: ingresos =======================
create table if not exists public.lina_finance_revenues (
  id              uuid primary key default gen_random_uuid(),
  paid_at         date not null,
  source          text not null default 'skool',
  concept         text,
  usd_amount      numeric(14,2) not null default 0,
  cop_real        numeric(14,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists lina_revenues_paid_at_idx
  on public.lina_finance_revenues (paid_at desc);

-- ===================== TABLA: gastos =========================
create table if not exists public.lina_finance_expenses (
  id              uuid primary key default gen_random_uuid(),
  spent_at        date not null,
  paid_by         text not null check (paid_by in ('lina','joinsclee')),
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

create index if not exists lina_expenses_spent_at_idx
  on public.lina_finance_expenses (spent_at desc);

create index if not exists lina_expenses_paid_by_idx
  on public.lina_finance_expenses (paid_by);

-- ===================== TABLA: cobros pauta Meta ==============
create table if not exists public.lina_finance_ad_charges (
  id                uuid primary key default gen_random_uuid(),
  charged_at        date not null,
  transaction_id    text,
  usd_amount        numeric(14,2) not null default 0,
  status            text default 'cobrado' check (status in ('cobrado','fallido','pendiente')),
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists lina_ad_charges_at_idx
  on public.lina_finance_ad_charges (charged_at desc);

-- ===================== TABLA: informes guardados =============
create table if not exists public.lina_finance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  period_start    date not null,
  period_end      date not null,
  title           text,
  payload         jsonb not null,
  generated_at    timestamptz not null default now()
);

-- ===================== Trigger updated_at ====================
create or replace function public.lina_touch_updated_at()
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
    'lina_finance_params','lina_finance_revenues','lina_finance_expenses'
  ] loop
    execute format('drop trigger if exists trg_%s_touch on public.%s;', t, t);
    execute format(
      'create trigger trg_%s_touch before update on public.%s for each row execute function public.lina_touch_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ===================== RLS · acceso anon =====================
-- Dashboard embebido en GHL sin auth → políticas permisivas.
alter table public.lina_finance_params      enable row level security;
alter table public.lina_finance_revenues    enable row level security;
alter table public.lina_finance_expenses    enable row level security;
alter table public.lina_finance_ad_charges  enable row level security;
alter table public.lina_finance_snapshots   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'lina_finance_params','lina_finance_revenues','lina_finance_expenses',
    'lina_finance_ad_charges','lina_finance_snapshots'
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

-- ===================== SEED ==================================

-- Parámetros iniciales
insert into public.lina_finance_params (id, trm_cop_per_usd, trm_source, lina_share, joinsclee_share)
values (1, 3729.27, 'Banco de la República · 8 may 2026', 0.7, 0.3)
on conflict (id) do nothing;

-- Ingresos Skool históricos (Excel original)
insert into public.lina_finance_revenues (paid_at, source, concept, usd_amount, cop_real)
select d::date, 'skool', 'Payout Bancolombia •• 6181', usd, null
from (values
  ('2026-03-18'::date, 1545.25),
  ('2026-03-25'::date, 1700.45),
  ('2026-04-01'::date, 25.92),
  ('2026-04-15'::date, 428.98),
  ('2026-04-22'::date, 562.06),
  ('2026-04-29'::date, 393.63),
  ('2026-05-06'::date, 25.92)
) as v(d, usd)
where not exists (
  select 1 from public.lina_finance_revenues r
   where r.paid_at = v.d and r.source = 'skool'
);

-- Cobros Meta históricos (primeros 20 del Excel)
insert into public.lina_finance_ad_charges (charged_at, transaction_id, usd_amount, status)
select d::date, txid, usd, 'cobrado'
from (values
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
  select 1 from public.lina_finance_ad_charges a
   where a.transaction_id = v.txid
);

-- Gastos que asume Lina
insert into public.lina_finance_expenses
  (spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
select '2026-02-02'::date, 'lina', concept, category, freq, meses, usd, cop, notas
from (values
  ('Skool',                              'Plataforma comunidad',     'mensual', 3.0, 99.0::numeric, null::numeric, 'Hosting comunidad SAVIAS'),
  ('Funnelchat',                         'Automatización WhatsApp',  'mensual', 3.0, 49.0,          null,          'SmartChat / SellerChat'),
  ('ManyChat',                           'Automatización Instagram', 'mensual', 3.0, 15.0,          null,          'Triggers JABÓN, PIEL, INICIO, etc.'),
  ('Edición YouTube — Lazariiio (50%)',  'Producción audiovisual',   'unico',   1.0, null,          900000,        'Primer 50% del paquete mensual de 4 videos')
) as v(concept, category, freq, meses, usd, cop, notas)
where not exists (
  select 1 from public.lina_finance_expenses e
   where e.paid_by = 'lina' and e.concept = v.concept
);

-- Gasto agregado: Pauta Meta (suma de cobros) que asume Lina con su tarjeta
insert into public.lina_finance_expenses
  (spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
select '2026-04-01'::date, 'lina',
       'Pauta Meta Ads', 'Publicidad', 'acumulado', 1.0,
       (select coalesce(sum(usd_amount),0) from public.lina_finance_ad_charges),
       null,
       'Suma de cobros Meta. Lina llena el COP REAL si el banco cobró distinto al TRM.'
where not exists (
  select 1 from public.lina_finance_expenses e
   where e.paid_by = 'lina' and e.concept = 'Pauta Meta Ads'
);

-- Gastos que asume JoinsClee
insert into public.lina_finance_expenses
  (spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
select '2026-04-01'::date, 'joinsclee',
       'Edición de Reels', 'Producción audiovisual', 'unico', 1.0,
       180, null, '10 reels × $18 USD'
where not exists (
  select 1 from public.lina_finance_expenses e
   where e.paid_by = 'joinsclee' and e.concept = 'Edición de Reels'
);

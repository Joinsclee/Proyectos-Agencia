-- ============================================================
--  Cuadre Financiero · Barco de Papel (Paulina Valencia) × JoinsClee
-- ============================================================
--  Espejo del esquema de Lina, adaptado a Paulina.
--  Corre en el MISMO proyecto Supabase de Paulina (Mi Barco):
--    ref: octilxlxwewlfbaoeihr
--  Tablas (prefijo paulina_finance_):
--    paulina_finance_params      → singleton (TRM + % reparto)
--    paulina_finance_revenues    → ingresos Skool (USD → COP real)
--    paulina_finance_expenses    → gastos (Paulina o JoinsClee)
--    paulina_finance_ad_charges  → cobros pauta Meta (opcional / futuro)
--    paulina_finance_snapshots   → informes guardados (opcional / futuro)
--
--  RLS permisivo para anon: el dashboard va embebido en GHL sin login,
--  igual que el de Lina. La anon key es pública por diseño.
-- ============================================================

-- ===================== TABLA: parámetros =====================
create table if not exists public.paulina_finance_params (
  id                  smallint primary key default 1,
  trm_cop_per_usd     numeric(12,4) not null default 3729.27,
  trm_source          text default 'Banco de la República',
  trm_updated_at      timestamptz default now(),
  paulina_share       numeric(5,4) not null default 0.7,
  joinsclee_share     numeric(5,4) not null default 0.3,
  updated_at          timestamptz not null default now(),
  constraint paulina_single_row check (id = 1),
  constraint paulina_shares_sum_to_one check (
    abs((paulina_share + joinsclee_share) - 1.0) < 0.0001
  )
);

-- ===================== TABLA: ingresos =======================
create table if not exists public.paulina_finance_revenues (
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

create index if not exists paulina_revenues_paid_at_idx
  on public.paulina_finance_revenues (paid_at desc);

-- ===================== TABLA: gastos =========================
create table if not exists public.paulina_finance_expenses (
  id              uuid primary key default gen_random_uuid(),
  spent_at        date not null,
  paid_by         text not null check (paid_by in ('paulina','joinsclee')),
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

create index if not exists paulina_expenses_spent_at_idx
  on public.paulina_finance_expenses (spent_at desc);

create index if not exists paulina_expenses_paid_by_idx
  on public.paulina_finance_expenses (paid_by);

-- ===================== TABLA: cobros pauta Meta ==============
create table if not exists public.paulina_finance_ad_charges (
  id                uuid primary key default gen_random_uuid(),
  charged_at        date not null,
  transaction_id    text,
  usd_amount        numeric(14,2) not null default 0,
  status            text default 'cobrado' check (status in ('cobrado','fallido','pendiente')),
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists paulina_ad_charges_at_idx
  on public.paulina_finance_ad_charges (charged_at desc);

-- ===================== TABLA: informes guardados =============
create table if not exists public.paulina_finance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  period_start    date not null,
  period_end      date not null,
  title           text,
  payload         jsonb not null,
  generated_at    timestamptz not null default now()
);

-- ===================== Trigger updated_at ====================
create or replace function public.paulina_touch_updated_at()
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
    'paulina_finance_params','paulina_finance_revenues','paulina_finance_expenses'
  ] loop
    execute format('drop trigger if exists trg_%s_touch on public.%s;', t, t);
    execute format(
      'create trigger trg_%s_touch before update on public.%s for each row execute function public.paulina_touch_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ===================== RLS · acceso anon =====================
-- Dashboard embebido en GHL sin auth → políticas permisivas (igual que Lina).
alter table public.paulina_finance_params      enable row level security;
alter table public.paulina_finance_revenues    enable row level security;
alter table public.paulina_finance_expenses    enable row level security;
alter table public.paulina_finance_ad_charges  enable row level security;
alter table public.paulina_finance_snapshots   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'paulina_finance_params','paulina_finance_revenues','paulina_finance_expenses',
    'paulina_finance_ad_charges','paulina_finance_snapshots'
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
-- Solo los parámetros iniciales. Los ingresos y gastos los carga
-- Paulina/JoinsClee desde el propio dashboard (empieza en limpio).

insert into public.paulina_finance_params (id, trm_cop_per_usd, trm_source, paulina_share, joinsclee_share)
values (1, 3729.27, 'Banco de la República', 0.7, 0.3)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- EJEMPLOS opcionales (descomenta y ajusta con datos reales de
-- Paulina si quieres precargar sus gastos recurrentes):
-- ------------------------------------------------------------
-- insert into public.paulina_finance_expenses
--   (spent_at, paid_by, concept, category, frequency, months_billed, usd_amount, cop_amount, notes)
-- values
--   (current_date, 'paulina', 'Skool',    'Plataforma comunidad',    'mensual', 1, 99, null, 'Hosting comunidad Barco de Papel'),
--   (current_date, 'paulina', 'ManyChat', 'Automatización Instagram','mensual', 1, 15, null, 'Triggers de automatización');

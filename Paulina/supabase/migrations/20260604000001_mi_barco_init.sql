-- ============================================================
--  Mi Barco · Paulina Valencia — Esquema inicial
--  - profiles: perfil mínimo creado en el signup
--  - mi_barco_state: estado de la app (rueda / tracker / plan) por usuario
--  Toda la data de la app vive aquí (no en localStorage).
-- ============================================================

-- ---------- Tabla profiles ----------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada usuaria ve y edita solo su propio perfil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- Tabla mi_barco_state ----------------------------
--  Una fila por usuaria. rueda/tracker/plan son JSONB (mismo shape
--  que antes se guardaba en localStorage).
create table if not exists public.mi_barco_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rueda      jsonb not null default '{}'::jsonb,
  tracker    jsonb not null default '{}'::jsonb,
  plan       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mi_barco_state enable row level security;

-- RLS: cada usuaria solo accede a SU fila.
drop policy if exists "mbs_select_own" on public.mi_barco_state;
create policy "mbs_select_own"
  on public.mi_barco_state for select
  using (auth.uid() = user_id);

drop policy if exists "mbs_insert_own" on public.mi_barco_state;
create policy "mbs_insert_own"
  on public.mi_barco_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "mbs_update_own" on public.mi_barco_state;
create policy "mbs_update_own"
  on public.mi_barco_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mbs_delete_own" on public.mi_barco_state;
create policy "mbs_delete_own"
  on public.mi_barco_state for delete
  using (auth.uid() = user_id);

-- ---------- Trigger: crear profile en el signup -------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

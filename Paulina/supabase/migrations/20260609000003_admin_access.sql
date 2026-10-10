-- ============================================================
--  Mi Barco · Paulina Valencia — Acceso para admins / dueña
-- ============================================================
--  Algunos miembros de la comunidad (Paulina, admins, moderadores)
--  no están asociados a una suscripción Premium/VIP en Skool y por
--  lo tanto el sync los marcaría como "no es miembro". Necesitan
--  acceso a la app de igual forma.
--
--  Solución: una columna `is_admin` en profiles. Si está en true,
--  la usuaria entra a la app aunque skool_level sea null o cualquier
--  otro tier. Se marca manualmente desde el SQL Editor (no expuesto
--  al frontend ni al sync de Skool).
--
--  IDEMPOTENTE. Re-correrla es seguro.
-- ============================================================

-- ---------- 1. Nueva columna is_admin ----------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin)
  where is_admin = true;

-- ---------- 2. Trigger protector: también proteger is_admin -
--  Reemplaza la versión anterior para que el campo is_admin tampoco
--  pueda ser modificado desde anon/authenticated.
create or replace function public.fn_profiles_protect_skool_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  v_current_role := coalesce(current_setting('role', true), session_user);

  if v_current_role not in ('service_role', 'supabase_admin', 'postgres') then
    NEW.skool_level         := OLD.skool_level;
    NEW.skool_synced_at     := OLD.skool_synced_at;
    NEW.skool_member_since  := OLD.skool_member_since;
    NEW.is_admin            := OLD.is_admin;  -- ← nuevo
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

-- Trigger ya existe (fue creado por la migración 1), la función queda actualizada.

-- ---------- 3. has_app_access incluye is_admin -------------
--  Devuelve true si:
--    - is_admin = true  (admins/dueña), O
--    - skool_level está en app_settings.skool_allowed_levels (Premium/VIP)
create or replace function public.has_app_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select lower(jsonb_array_elements_text(value)) as lvl
    from public.app_settings
    where key = 'skool_allowed_levels'
  ),
  p as (
    select skool_level, is_admin
    from public.profiles
    where user_id = uid
  )
  select coalesce(
    (select is_admin from p),
    false
  ) or coalesce(
    (select lower(skool_level) in (select lvl from allowed) from p),
    false
  );
$$;

-- ---------- 4. RPC para marcar/desmarcar admin (solo service_role) ----
--  Útil si quieres hacerlo vía API en lugar de SQL Editor. No expuesto
--  a clientes anon/authenticated.
create or replace function public.set_admin(target_email text, make_admin boolean default true)
returns table (user_id uuid, email text, is_admin boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles
  set is_admin = make_admin
  where lower(email) = lower(target_email)
  returning profiles.user_id, profiles.email, profiles.is_admin, profiles.updated_at;
end;
$$;

revoke all on function public.set_admin(text, boolean) from public, anon, authenticated;
grant execute on function public.set_admin(text, boolean) to service_role;

-- ============================================================
--  USO MANUAL (desde SQL Editor del Dashboard)
-- ============================================================
--
--  Marcar a Paulina como admin:
--    update public.profiles set is_admin = true where lower(email) = 'paulina@email.com';
--
--  Marcar varios admins de una:
--    update public.profiles set is_admin = true
--    where lower(email) in ('paulina@email.com', 'cristian@email.com', 'admin2@email.com');
--
--  Quitar admin:
--    update public.profiles set is_admin = false where lower(email) = 'ex-admin@email.com';
--
--  Ver quiénes son admin:
--    select email, is_admin, skool_level, created_at
--    from public.profiles
--    where is_admin = true
--    order by created_at;
--
--  ⚠️ Importante: el usuario debe estar REGISTRADO ya (auth.users)
--  para que exista su fila en profiles. Si Paulina aún no se registró
--  desde la app, primero que se registre normalmente (verá pantalla de
--  bloqueo), luego corres el UPDATE de arriba, ella refresca la página
--  y entra (el frontend re-verifica acceso al recargar).
-- ============================================================

-- ============================================================
--  Mi Barco · Paulina Valencia — Gating por membresía Skool
--  PARTE 1/2 — Schema, RLS, triggers, función handle_new_user
-- ============================================================
--  PREREQUISITOS (ver Paulina/supabase/README.md, sección "Pasos manuales"):
--    - Tablas profiles + mi_barco_state ya existen (de mi_barco_init.sql)
--    - (Opcional, recomendado) Extensión supabase_vault habilitada
--      con secrets `project_url` y `service_role_key`. Si falta, el
--      handle_new_user crea el profile igual pero el sync dirigido no
--      se dispara (se loggea en sync_alerts como 'setup_missing_vault')
--      y el sync cron de 6h actualizará el level en el siguiente run.
--
--  ESTA MIGRACIÓN ES IDEMPOTENTE: correrla 2 veces da mismo resultado.
--  ESTA MIGRACIÓN NO REQUIERE pg_cron NI pg_net.
--  El cron se programa en la migración 20260609000002_skool_paulina_cron.sql.
--
--  ROLLBACK MANUAL (al final del archivo).
-- ============================================================

-- ---------- 1. Extender profiles ----------------------------
alter table public.profiles
  add column if not exists skool_level text,
  add column if not exists skool_synced_at timestamptz,
  add column if not exists skool_member_since timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Índices útiles. profiles_skool_level_idx es PARCIAL (solo no-null) → mucho más barato.
create index if not exists profiles_email_lower_idx
  on public.profiles ((lower(email)));
create index if not exists profiles_skool_level_idx
  on public.profiles ((lower(skool_level)))
  where skool_level is not null;

-- ---------- 2. app_settings (single source of truth) -------
--  Tabla genérica de configuración. Los niveles permitidos viven aquí
--  y se referencian tanto desde has_app_access() como (a futuro) desde
--  la edge function vía RPC. Evita drift entre SQL hardcoded y env var.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- Sin policies → solo service_role escribe; los clientes leen vía RPC has_app_access().

-- Seed inicial de niveles permitidos (idempotente)
insert into public.app_settings (key, value)
values ('skool_allowed_levels', '["premium","vip"]'::jsonb)
on conflict (key) do nothing;

-- ---------- 3. Helper has_app_access(uid) -------------------
--  Lee los niveles permitidos de app_settings (no hardcoded).
--  Devuelve true si skool_level está en la lista (case-insensitive).
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
  )
  select coalesce(
    (
      select lower(skool_level) in (select lvl from allowed)
      from public.profiles
      where user_id = uid
    ),
    false
  );
$$;

-- ---------- 4. Tabla de auditoría sync_alerts ---------------
create table if not exists public.sync_alerts (
  id          bigserial primary key,
  kind        text not null check (kind in (
    'run', 'cookie_expired', 'http_error', 'no_members',
    'diagnostics', 'setup_ok', 'setup_skipped', 'setup_missing_vault',
    'safety_truncated', 'rate_limit'
  )),
  message     text,
  payload     jsonb,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists sync_alerts_kind_idx on public.sync_alerts (kind);
create index if not exists sync_alerts_created_at_idx on public.sync_alerts (created_at desc);
alter table public.sync_alerts enable row level security;
-- Sin policies → solo service_role accede. Dashboard admin futuro puede consultar vía RPC.

-- ---------- 5. RLS simplificada (la protección real está en el trigger) ----
--  Esta política deja a la usuaria UPDATE su propio profile (necesario para
--  futuras escrituras como avatar/displayname). El BLOQUEO real de los
--  campos skool_* se hace en un trigger BEFORE UPDATE (más abajo), que
--  no puede ser bypaseado desde el cliente. RLS WITH CHECK con subqueries
--  tiene bugs sutiles (puede permitir downgrade a NULL); el trigger es
--  la herramienta correcta para "impedir cambiar columnas específicas".
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- 6. Trigger BEFORE UPDATE — protege skool_* ------
--  Reglas:
--    - Solo service_role / postgres / supabase_admin pueden modificar
--      skool_level, skool_synced_at, skool_member_since.
--    - Cualquier otro role (anon, authenticated) → se revierten los
--      cambios a esos campos (silenciosamente, sin error). Esto previene
--      que una usuaria con su anon key se marque a sí misma como Premium.
--    - updated_at se actualiza automáticamente en cada UPDATE.
create or replace function public.fn_profiles_protect_skool_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  -- current_setting('role', true) devuelve el rol activo (authenticated/anon/service_role/postgres).
  -- En triggers SECURITY DEFINER, current_user es el dueño de la función (postgres),
  -- así que usamos role en su lugar para detectar quién hizo el UPDATE.
  v_current_role := coalesce(current_setting('role', true), session_user);

  if v_current_role not in ('service_role', 'supabase_admin', 'postgres') then
    -- Revertir cualquier cambio a los campos protegidos
    NEW.skool_level         := OLD.skool_level;
    NEW.skool_synced_at     := OLD.skool_synced_at;
    NEW.skool_member_since  := OLD.skool_member_since;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_profiles_protect_skool on public.profiles;
create trigger trg_profiles_protect_skool
  before update on public.profiles
  for each row execute function public.fn_profiles_protect_skool_fields();

-- ---------- 7. RPC set_skool_level (solo service_role) ------
--  Punto de entrada limpio para la edge function. Encapsula la lógica:
--    - Si el level no es null y member_since está vacío → setea member_since (primera detección).
--    - Si el level pasa de no-null a no-null → preserva member_since (NO lo sobreescribe).
--    - Si el level pasa a null → preserva member_since también (auditoría histórica).
--  Solo el service_role puede invocarla.
create or replace function public.set_skool_level(
  target_user_id uuid,
  new_level      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    skool_level        = new_level,
    skool_synced_at    = now(),
    skool_member_since = coalesce(
      skool_member_since,
      case when new_level is not null then now() else null end
    )
  where user_id = target_user_id;
end;
$$;

revoke all on function public.set_skool_level(uuid, text) from public, anon, authenticated;
grant execute on function public.set_skool_level(uuid, text) to service_role;

-- ---------- 8. handle_new_user con sync dirigido (defensivo) ----
--  Crea el profile y SI hay vault + net schemas + secrets → dispara sync
--  dirigido fire-and-forget. Si falta cualquier prerequisito, loggea en
--  sync_alerts y continúa sin error (el signup nunca falla por eso).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url     text;
  v_service_key     text;
  v_new_email_lower text;
  v_has_vault       boolean;
  v_has_net         boolean;
begin
  -- 1) Crear/actualizar profile (este INSERT NO está dentro del try/catch:
  -- si falla, propaga al signup, lo cual es correcto — algo grave pasa).
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  -- 2) Disparar sync dirigido SI los prerequisitos están listos.
  if new.email is null then
    return new;
  end if;

  v_new_email_lower := lower(new.email);
  v_has_vault := exists (select 1 from pg_namespace where nspname = 'vault');
  v_has_net   := exists (select 1 from pg_namespace where nspname = 'net');

  if not v_has_vault then
    insert into public.sync_alerts (kind, message)
    values ('setup_missing_vault', 'vault schema no existe — handle_new_user no disparó sync dirigido');
    return new;
  end if;

  if not v_has_net then
    insert into public.sync_alerts (kind, message)
    values ('setup_skipped', 'pg_net no instalado — handle_new_user no disparó sync dirigido');
    return new;
  end if;

  -- Vault y net existen: leer secrets de forma defensiva.
  begin
    select decrypted_secret into v_project_url
      from vault.decrypted_secrets where name = 'project_url';
    select decrypted_secret into v_service_key
      from vault.decrypted_secrets where name = 'service_role_key';
  exception when others then
    insert into public.sync_alerts (kind, message, payload)
    values ('setup_missing_vault', 'lectura de vault falló: ' || sqlerrm, jsonb_build_object('email', v_new_email_lower));
    return new;
  end;

  if v_project_url is null or v_service_key is null then
    insert into public.sync_alerts (kind, message)
    values ('setup_missing_vault', 'vault no tiene project_url o service_role_key');
    return new;
  end if;

  -- Todos los prerequisitos OK → invocación fire-and-forget.
  begin
    perform net.http_post(
      url     := v_project_url || '/functions/v1/sync-skool-paulina',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object('target_email', v_new_email_lower)
    );
  exception when others then
    insert into public.sync_alerts (kind, message, payload)
    values ('http_error', 'net.http_post desde handle_new_user falló: ' || sqlerrm,
            jsonb_build_object('email', v_new_email_lower));
  end;

  return new;
end;
$$;

-- Recrear trigger (idempotente)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 9. Limpieza opcional de alerts viejas -----------
create or replace function public.cleanup_old_sync_alerts(days int default 90)
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.sync_alerts
    where created_at < now() - (days || ' days')::interval
    returning 1
  )
  select count(*)::int from deleted;
$$;

-- ============================================================
--  ROLLBACK MANUAL (ejecutar en orden inverso si quieres revertir):
-- ============================================================
--  drop trigger trg_profiles_protect_skool on public.profiles;
--  drop function public.fn_profiles_protect_skool_fields();
--  drop function public.set_skool_level(uuid, text);
--  drop function public.has_app_access(uuid);
--  drop function public.cleanup_old_sync_alerts(int);
--  -- handle_new_user vuelve a su versión simple (re-aplicar mi_barco_init.sql)
--  drop policy "profiles_update_own" on public.profiles;
--  -- Recrear policy original de mi_barco_init.sql
--  drop table public.sync_alerts;
--  drop table public.app_settings;
--  alter table public.profiles
--    drop column if exists skool_level,
--    drop column if exists skool_synced_at,
--    drop column if exists skool_member_since,
--    drop column if exists updated_at;
-- ============================================================

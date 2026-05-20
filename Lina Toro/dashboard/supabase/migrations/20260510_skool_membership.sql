-- ============================================================
--  Universo Lina · Skool membership gating
-- ============================================================
--  Cada usuario tiene un row en public.profiles. Si su email
--  coincide con alguien de la comunidad Skool de Savias,
--  is_skool_member=true → desbloquea todas las herramientas.
--  Si no, sólo accede a las "light" (FitoMatch, CreaPrecio,
--  Saponificación). La función edge sync-skool-members corre
--  cada 6h y actualiza el flag (set true a los que están en
--  Skool, false a los que ya no).
-- ============================================================

-- ---------- Tabla profiles -----------------------------------
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  is_skool_member  boolean not null default false,
  skool_synced_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists profiles_email_lower_idx
  on public.profiles ((lower(email)));

-- ---------- RLS ----------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = user_id);

-- No exponemos insert/update/delete a clientes anon/authenticated:
-- los cambios sólo pueden venir del service_role (signup trigger y
-- sync-skool-members). Esto evita que un usuario se marque a sí
-- mismo como miembro editando localStorage o llamando a Supabase.

-- ---------- Backfill de usuarios existentes ------------------
insert into public.profiles (user_id, email)
select id, email
from auth.users
where email is not null
on conflict (user_id) do nothing;

-- ---------- Trigger: crear profile al registrarse -----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Trigger: mantener email sincronizado ------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = new.email,
           updated_at = now()
     where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------- Helper: is_skool_member() para uso en RLS -------
create or replace function public.is_skool_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_skool_member from public.profiles where user_id = uid),
    false
  );
$$;

-- ---------- pg_cron: sync cada 6 horas ----------------------
--
-- La función pg_net.http_post llama al endpoint de la edge function.
-- Requiere que pg_net esté habilitado en el proyecto (Supabase lo
-- tiene por defecto). El service_role key se lee desde vault.
--
-- Nota: el job sólo se crea aquí; los secrets (SUPABASE_URL y
-- SUPABASE_SERVICE_ROLE_KEY) se asumen ya disponibles vía
-- vault.decrypted_secrets, que es el patrón estándar de Supabase
-- para esquemas con cron + edge functions.

-- Limpieza si existe versión vieja
select cron.unschedule('sync-skool-members-6h')
where exists (select 1 from cron.job where jobname = 'sync-skool-members-6h');

select cron.schedule(
  'sync-skool-members-6h',
  '0 */6 * * *',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-skool-members',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $cron$
);

-- ============================================================
--  Universo Lina · Auditoría del sync de Skool + re-sync en signup
-- ============================================================
--  Mejoras:
--    1. Tabla `sync_alerts` para registrar todos los runs y alertas
--       (cookie expirada, errores HTTP, etc.) — útil para diagnóstico
--       histórico y como mecanismo anti-spam (1 email cada 24h).
--    2. Modifica `handle_new_user()` para que, además de crear el
--       profile, dispare un sync de Skool dirigido (solo ese email).
--       Así un usuario que se acaba de unir a Skool ve sus apps
--       desbloqueadas inmediatamente, sin esperar al cron de 6h.
-- ============================================================

-- ---------- Tabla sync_alerts -------------------------------
create table if not exists public.sync_alerts (
  id          bigserial primary key,
  kind        text not null check (kind in ('run', 'cookie_expired', 'http_error', 'no_members')),
  message     text,
  payload     jsonb,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists sync_alerts_kind_idx on public.sync_alerts (kind);
create index if not exists sync_alerts_created_at_idx on public.sync_alerts (created_at desc);
create index if not exists sync_alerts_kind_notified_created_idx
  on public.sync_alerts (kind, notified, created_at desc);

-- RLS habilitado, sin policies para clientes → solo service_role accede.
alter table public.sync_alerts enable row level security;

-- ---------- handle_new_user actualizado ---------------------
--  Mantiene comportamiento previo (crea profile) y AÑADE el
--  disparo asíncrono del sync de Skool con el email del nuevo
--  usuario. El POST a la edge function es fire-and-forget vía
--  pg_net; si falla, no rompemos el signup.
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
begin
  -- 1) Crear/actualizar profile (comportamiento original)
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;

  -- 2) Disparar sync dirigido para ESTE usuario (fire-and-forget)
  if new.email is not null then
    v_new_email_lower := lower(new.email);
    begin
      select decrypted_secret into v_project_url
        from vault.decrypted_secrets where name = 'project_url';
      select decrypted_secret into v_service_key
        from vault.decrypted_secrets where name = 'service_role_key';

      if v_project_url is not null and v_service_key is not null then
        perform net.http_post(
          url     := v_project_url || '/functions/v1/sync-skool-members',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object('target_email', v_new_email_lower)
        );
      end if;
    exception when others then
      -- No rompemos el signup si el sync falla; solo loggeamos.
      raise warning 'sync-skool-members trigger en handle_new_user falló: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- El trigger on_auth_user_created ya existe de la migration previa
-- (20260510_skool_membership.sql) y apunta a esta misma función, así
-- que basta con haber reemplazado la función arriba.

-- ---------- Helper: limpieza periódica de sync_alerts viejos
-- (opcional — sólo si quieres que la tabla no crezca sin límite)
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

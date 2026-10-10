-- ============================================================
--  Mi Barco · Paulina Valencia — Programación del cron de sync
--  PARTE 2/2 — pg_cron job (defensivo)
-- ============================================================
--  Este archivo SOLO programa el cron que llama a la edge function
--  `sync-skool-paulina` cada 6 horas. Está separado de la migración 1
--  porque:
--    a) Postgres no permite `create extension` + uso de su schema en
--       la misma transacción (issue conocido en Supabase).
--    b) Si pg_cron, pg_net o vault.secrets no están listos, la
--       migración 1 ya queda aplicada y útil (signup + sync dirigido
--       siguen funcionando vía trigger).
--
--  PREREQUISITOS para que el cron quede activo:
--    1. Dashboard → Database → Extensions: habilitar pg_cron y pg_net.
--    2. Dashboard → SQL Editor: crear secrets con vault.create_secret():
--         select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--         select vault.create_secret('<service_role_key>', 'service_role_key');
--
--  SI ALGÚN PREREQUISITO FALTA al aplicar esta migración:
--    - NO falla con error 3F000.
--    - Loggea en public.sync_alerts (kind='setup_skipped') por qué se saltó.
--    - Re-correr esta migración después de cumplir los prereqs activará el job.
--
--  IDEMPOTENTE: si el job ya existe, lo desprograma y reprograma con la
--  misma lógica (útil si cambias la URL del proyecto o el service_key).
-- ============================================================

do $$
declare
  v_project_url text;
  v_service_key text;
  v_cmd         text;
begin
  -- Guard 1: pg_cron debe estar instalado.
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    insert into public.sync_alerts (kind, message)
    values ('setup_skipped',
            'pg_cron no instalado — el cron de sync no se programó. ' ||
            'Habilita Dashboard → Database → Extensions → pg_cron y vuelve a correr esta migración.');
    return;
  end if;

  -- Guard 2: pg_net debe estar instalado (lo usa el cron para llamar a la edge fn).
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    insert into public.sync_alerts (kind, message)
    values ('setup_skipped',
            'pg_net no instalado — el cron de sync no se programó. ' ||
            'Habilita Dashboard → Database → Extensions → pg_net y vuelve a correr esta migración.');
    return;
  end if;

  -- Guard 3: vault debe existir.
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    insert into public.sync_alerts (kind, message)
    values ('setup_skipped',
            'supabase_vault no instalado — el cron de sync no se programó. ' ||
            'Habilita Dashboard → Database → Extensions → supabase_vault.');
    return;
  end if;

  -- Guard 4: los secrets project_url y service_role_key deben existir.
  begin
    select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'project_url';
    select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'service_role_key';
  exception when others then
    insert into public.sync_alerts (kind, message)
    values ('setup_skipped',
            'No se pudo leer vault.decrypted_secrets: ' || sqlerrm);
    return;
  end;

  if v_project_url is null or v_service_key is null then
    insert into public.sync_alerts (kind, message)
    values ('setup_skipped',
            'Faltan secrets en vault: project_url=' ||
            coalesce(v_project_url, 'NULL') || ', service_role_key=' ||
            case when v_service_key is null then 'NULL' else 'OK' end);
    return;
  end if;

  -- Todos los prereqs OK → desprogramar versión vieja (si existe) y programar.
  if exists (select 1 from cron.job where jobname = 'sync-skool-paulina-6h') then
    perform cron.unschedule('sync-skool-paulina-6h');
  end if;

  -- Construir el comando SQL del cron de forma segura (escapando con format %L).
  v_cmd := format(
    $cmd$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', %L
      ),
      body := jsonb_build_object('mode', 'cron')
    );
    $cmd$,
    v_project_url || '/functions/v1/sync-skool-paulina',
    'Bearer ' || v_service_key
  );

  perform cron.schedule(
    'sync-skool-paulina-6h',
    '15 */6 * * *',  -- minuto 15, cada 6h (00:15, 06:15, 12:15, 18:15 UTC)
    v_cmd
  );

  insert into public.sync_alerts (kind, message, payload)
  values ('setup_ok',
          'Cron sync-skool-paulina-6h programado (cada 6h a los :15 min)',
          jsonb_build_object('schedule', '15 */6 * * *'));
end;
$$;

-- ============================================================
--  Verificación post-aplicación (para diagnóstico manual):
--
--    -- ¿Está el cron programado?
--    select jobid, schedule, command, jobname, active
--    from cron.job
--    where jobname = 'sync-skool-paulina-6h';
--
--    -- ¿Cómo le fue al último run?
--    select start_time, end_time, status, return_message
--    from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'sync-skool-paulina-6h')
--    order by start_time desc
--    limit 5;
--
--    -- ¿Se loggearon alertas de setup?
--    select kind, message, created_at
--    from public.sync_alerts
--    where kind in ('setup_ok', 'setup_skipped', 'setup_missing_vault')
--    order by created_at desc
--    limit 10;
--
--  ROLLBACK MANUAL:
--    select cron.unschedule('sync-skool-paulina-6h')
--    where exists (select 1 from pg_namespace where nspname = 'cron')
--      and exists (select 1 from cron.job where jobname = 'sync-skool-paulina-6h');
-- ============================================================

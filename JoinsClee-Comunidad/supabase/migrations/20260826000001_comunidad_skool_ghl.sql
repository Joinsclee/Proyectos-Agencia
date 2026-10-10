-- ============================================================================
--  JoinsClee · Comunidad Skool ⇄ GoHighLevel
--  Esquema de control de accesos: quién está en la comunidad, qué cuenta de
--  GHL tiene, y qué hay que revocarle cuando se va.
--
--  Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================================
--  jc_members · espejo Skool ⇄ GHL. Es la fuente de verdad del sistema.
-- ============================================================================
--  Regla dura del diseño: la revocación NUNCA resuelve por email. Usa
--  ghl_location_id, capturado en el momento del aprovisionamiento. El email
--  con el que alguien entra a Skool no tiene por qué ser el mismo con el que
--  se le creó la cuenta de GHL, y GHL ya no permite actualizar el email de un
--  usuario por API. El email queda solo como dato de diagnóstico.
-- ============================================================================
create table if not exists public.jc_members (
  id                  bigserial primary key,

  -- ── Identidad en Skool ────────────────────────────────────────────────
  skool_email         text not null,          -- member.metadata.mbme (email real)
  skool_user_id       text,                   -- id del miembro en Skool
  first_name          text,
  last_name           text,
  tier                text,                   -- JSON.parse(mmbp).tier → standard|premium|vip
  recurring_interval  text,                   -- month | year | X0.LIFETIME
  is_lifetime         boolean not null default false,
  is_free_trial       boolean not null default false,

  -- ── Estado de membresía ───────────────────────────────────────────────
  --   active     · paga y con acceso
  --   cancelling · canceló pero AÚN tiene acceso hasta churn_at (reversible)
  --   declined   · pago rechazado, en reintentos hasta final_retry_at
  --   churned    · ya perdió el acceso  → revocar
  --   banned     · expulsado            → revocar
  --   missing    · desapareció de las 4 pestañas (posible baja no clasificada)
  --   revoked    · GHL ya revocado
  --   error      · algo falló al revocar
  status              text not null default 'active'
                      check (status in ('active','cancelling','declined','churned',
                                        'banned','missing','revoked','error')),
  billing_canceled    boolean not null default false,
  billing_declined    boolean not null default false,

  churn_at            timestamptz,            -- metadata.mbscpe → cuándo pierde acceso
  final_retry_at      timestamptz,            -- metadata.mbsfprt → último reintento de cobro
  churned_at          timestamptz,            -- member.churned  → cuándo lo perdió
  banned_at           timestamptz,            -- metadata.bannedAt (viene en NANOsegundos)

  -- ── Cuenta de GoHighLevel ─────────────────────────────────────────────
  ghl_location_id     text,                   -- ← LLAVE DE REVOCACIÓN
  ghl_email           text,                   -- el email REAL usado al crear en GHL
  ghl_user_ids        text[] not null default '{}',  -- todos los users conocidos
  ghl_provisioned_at  timestamptz,
  ghl_snapshot_id     text,

  -- ── Control del ciclo de revocación ───────────────────────────────────
  missing_streak      int not null default 0, -- regla de 3 strikes
  revoke_notified_at  timestamptz,            -- idempotencia del aviso a Slack
  revoked_at          timestamptz,
  revoke_verified_at  timestamptz,            -- confirmado con filter-by-email deleted:true
  revoke_error        text,

  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  notes               text
);

-- Índice único sobre la COLUMNA, no sobre lower(skool_email): PostgREST
-- necesita un índice de columnas para resolver `on_conflict=skool_email` en
-- el upsert del sync (un índice de expresión no le sirve). El parser de Skool
-- ya normaliza todos los emails a minúsculas antes de escribir, así que la
-- unicidad es la misma; el índice funcional queda como red de seguridad para
-- las escrituras manuales.
create unique index if not exists jc_members_skool_email_key
  on public.jc_members (skool_email);
create index if not exists jc_members_email_lower_idx
  on public.jc_members (lower(skool_email));
create index if not exists jc_members_status_idx     on public.jc_members (status);
create index if not exists jc_members_location_idx   on public.jc_members (ghl_location_id);
create index if not exists jc_members_churn_at_idx   on public.jc_members (churn_at);

-- ============================================================================
--  jc_sync_runs · una fila por corrida del cron. Alimenta el circuit breaker
--  de "caída anómala": si active cae más de X% respecto de la corrida buena
--  anterior, el sync aborta sin tocar GHL.
-- ============================================================================
create table if not exists public.jc_sync_runs (
  id                bigserial primary key,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  ok                boolean not null default false,
  aborted           boolean not null default false,
  abort_reason      text,
  dry_run           boolean not null default true,

  active_count      int,
  cancelling_count  int,
  churned_count     int,
  banned_count      int,

  new_members       int not null default 0,
  state_changes     int not null default 0,
  queued_revokes    int not null default 0,
  executed_revokes  int not null default 0,

  build_id          text,
  duration_ms       int,
  detail            jsonb
);

create index if not exists jc_sync_runs_started_idx on public.jc_sync_runs (started_at desc);

-- ============================================================================
--  jc_revocations · cola + auditoría. Una fila por acceso a revocar.
--  Nada se borra de aquí: es el registro de qué se quitó, cuándo y por qué.
-- ============================================================================
create table if not exists public.jc_revocations (
  id                bigserial primary key,
  member_id         bigint not null references public.jc_members(id) on delete cascade,
  reason            text not null,            -- churned | banned | missing_3x | manual
  status            text not null default 'pending'
                    check (status in ('pending','approved','done','failed','dismissed')),

  ghl_location_id   text,
  ghl_user_ids      text[] not null default '{}',

  detected_at       timestamptz not null default now(),
  notified_at       timestamptz,
  approved_by       text,                     -- quién apretó el botón
  executed_at       timestamptz,
  verified_at       timestamptz,

  users_deleted     int not null default 0,
  location_paused   boolean,                  -- null = no se intentó
  location_action   text,                     -- qué queda por hacer a mano
  error             text,
  detail            jsonb
);

create index if not exists jc_revocations_status_idx on public.jc_revocations (status, detected_at desc);
create index if not exists jc_revocations_member_idx on public.jc_revocations (member_id);

-- Una sola revocación abierta por miembro: evita que el cron encole duplicados
-- cada día mientras el humano no la resuelve.
create unique index if not exists jc_revocations_one_open_per_member
  on public.jc_revocations (member_id)
  where status in ('pending','approved');

-- ============================================================================
--  jc_alerts · alertas operativas (cookie vencida, canario de campos, aborts)
--  con anti-spam de 24h por tipo.
-- ============================================================================
create table if not exists public.jc_alerts (
  id          bigserial primary key,
  kind        text not null,
  severity    text not null default 'warn' check (severity in ('info','warn','error')),
  message     text not null,
  payload     jsonb,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists jc_alerts_kind_idx on public.jc_alerts (kind, created_at desc);

-- ============================================================================
--  RLS · nada de esto se expone a anon/authenticated. Solo service_role.
--  El panel de admin habla con las Edge Functions, nunca con PostgREST directo.
-- ============================================================================
alter table public.jc_members     enable row level security;
alter table public.jc_sync_runs   enable row level security;
alter table public.jc_revocations enable row level security;
alter table public.jc_alerts      enable row level security;
-- Sin políticas = nadie salvo service_role puede leer o escribir.

-- ============================================================================
--  Trigger de updated_at
-- ============================================================================
create or replace function public.jc_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jc_members_touch on public.jc_members;
create trigger jc_members_touch before update on public.jc_members
  for each row execute function public.jc_touch_updated_at();

-- ============================================================================
--  Vista operativa: qué hay pendiente de revocar ahora mismo.
-- ============================================================================
create or replace view public.jc_pending_revocations as
select
  r.id            as revocation_id,
  r.reason,
  r.status,
  r.detected_at,
  r.notified_at,
  m.id            as member_id,
  m.skool_email,
  m.ghl_email,
  m.first_name,
  m.last_name,
  m.tier,
  m.status        as member_status,
  m.churned_at,
  m.churn_at,
  m.ghl_location_id,
  m.ghl_user_ids,
  m.missing_streak
from public.jc_revocations r
join public.jc_members m on m.id = r.member_id
where r.status in ('pending','approved')
order by r.detected_at asc;

-- ============================================================================
--  Vista de salud: lo que mira un humano para saber si el sync está sano.
-- ============================================================================
create or replace view public.jc_health as
select
  (select count(*) from public.jc_members where status = 'active')      as activos,
  (select count(*) from public.jc_members where status = 'cancelling')  as cancelando,
  (select count(*) from public.jc_members where status = 'churned')     as dados_de_baja,
  (select count(*) from public.jc_members
     where status = 'active' and ghl_location_id is null)               as sin_cuenta_ghl,
  (select count(*) from public.jc_revocations where status = 'pending') as revocaciones_pendientes,
  (select max(started_at) from public.jc_sync_runs where ok)            as ultimo_sync_ok,
  (select bool_or(aborted) from public.jc_sync_runs
     where started_at > now() - interval '48 hours')                    as hubo_abort_48h;

-- ============================================================================
--  pg_cron · sync diario 06:00 America/Bogota  = 11:00 UTC
--  (pg_cron corre en UTC; Colombia es UTC-5 todo el año, sin horario de verano)
--
--  Requiere que estos dos secretos existan en Vault (Supabase los crea solos
--  en proyectos nuevos; si no, créalos en Settings → Vault):
--     project_url        → https://<ref>.supabase.co
--     service_role_key   → el service_role
-- ============================================================================
select cron.unschedule('jc-skool-ghl-sync-daily')
where exists (select 1 from cron.job where jobname = 'jc-skool-ghl-sync-daily');

select cron.schedule(
  'jc-skool-ghl-sync-daily',
  '0 11 * * *',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
                 || '/functions/v1/skool-ghl-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := '{"source":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

-- ============================================================================
select 'OK · esquema jc_* creado' as status,
       (select count(*) from public.jc_members) as miembros;

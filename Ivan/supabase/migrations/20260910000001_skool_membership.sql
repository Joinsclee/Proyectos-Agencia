-- ============================================================
--  Universo de La Huerta LAB · Membresía de Skool
-- ============================================================
--  Quién entra al universo: quien sea miembro CON ACCESO VIGENTE
--  de la comunidad https://www.skool.com/la-huerta-lab.
--
--  Diferencia grande con el Universo de Lina, de donde se porta
--  este esquema: aquel grupo es gratis y tiene niveles; el de
--  La Huerta LAB es DE PAGO (10 USD/mes, con prueba gratuita) y
--  NO tiene niveles. Por eso aquí no hay `level` ni `skool_level`
--  en ninguna tabla: no se esconde ninguna herramienta según el
--  plan. La regla de acceso es una sola y binaria — miembro con
--  acceso vigente ⇒ ve las 6 herramientas. El plan se guarda solo
--  como dato informativo (`plan_raw`), nunca para decidir qué ve.
--
--  Y como es de pago, "estar o no estar en el scrape" no alcanza:
--  hace falta saber POR QUÉ alguien ya no tiene acceso y HASTA
--  CUÁNDO lo conserva quien canceló. De ahí las columnas de
--  estado y fechas de `skool_members`.
--
--  Piezas que crea este archivo:
--    1. public.skool_members  — espejo de la comunidad (caché del login)
--    2. public.profiles       — identidad local + trigger de alta
--    3. public.allowed_emails — puerta de atrás manual (sin niveles)
--    4. public.sync_alerts    — auditoría de cada corrida del sync
--
--  Todo es idempotente: este proyecto ya tiene corrida la migración
--  del chat (20260824000001_chat_huerta.sql) y esta se aplica encima.
-- ============================================================


-- ============================================================
--  1) skool_members — espejo de la comunidad
-- ============================================================
--  Es la caché que consulta `skool-login` para que entrar sea
--  instantáneo y no dependa de que la cookie de admin de Skool
--  esté viva en cada intento. La mantiene `sync-skool-members`
--  recorriendo las pestañas active / cancelling / churned / banned
--  de la API interna de Skool.
--
--  El email es la clave y se guarda SIEMPRE en minúsculas. En Lina
--  eso era una convención escrita en un comentario, y una fila que
--  entrara con mayúsculas quedaba invisible para el `email=eq.` del
--  login: existía pero no se encontraba. Aquí es un CHECK, para que
--  reviente al escribir y no en silencio al leer.
create table if not exists public.skool_members (
  email            text primary key check (email = lower(email)),
  first_name       text,
  last_name        text,

  -- Ids de Skool. `email` es la PK, pero el correo de una persona
  -- puede cambiar; guardar los ids permite reconciliar la fila en vez
  -- de crear un duplicado. En Lina no se guardaban y esa
  -- reconciliación era imposible.
  skool_user_id    text,
  member_id        text,

  -- Tal cual lo devuelve user.member.role. Los 4 admins de La Huerta LAB
  -- SÍ salen en el endpoint (en el grupo de Lina no salían), así que no
  -- hace falta la lista manual para ellos.
  --
  -- SIN check cerrado, y es deliberado: el valor lo elige Skool, no
  -- nosotros. La lista que parecía completa ('group-admin', 'member') se
  -- quedó corta en la primera medición real contra la API — los 98 dados
  -- de baja llegan con role = 'declined'. Con el CHECK puesto, el upsert
  -- por lotes de sync-skool-members devolvía 400 en cuanto un lote
  -- incluía a un churned, la corrida entera moría con 500 y no se
  -- escribía NI UNA fila: un valor nuevo de un tercero tumbaba la
  -- sincronización completa. Texto libre; si algún día hay que validar,
  -- se valida en el sync, que sabe abortar sin destruir la caché.
  role             text,

  -- Estado de la membresía. OJO con 'cancelling': significa que la
  -- persona pidió no renovar, NO que haya perdido el acceso. Conserva
  -- el acceso hasta `access_until` y además puede revertir la
  -- cancelación. NUNCA se revoca por 'cancelling' ni por
  -- `billing_canceled`: solo 'churned' y 'banned' quitan el acceso.
  status           text not null default 'active'
                   check (status in ('active', 'cancelling', 'churned', 'banned')),

  -- Fechas afirmativas que vienen de Skool. Son las que mandan sobre
  -- el acceso; `status` es solo la etiqueta legible.
  approved_at      timestamptz,   -- user.member.approvedAt
  churned_at       timestamptz,   -- user.member.churned  → ya no tiene acceso
  banned_at        timestamptz,   -- user.member.bannedAt → ya no tiene acceso
  access_until     timestamptz,   -- metadata.mbscpe (unix segundos) → to_timestamp()

  -- Señales de cobro. Se guardan para diagnóstico y para avisarle al
  -- cliente, pero NO deciden el acceso: un cobro rechazado se
  -- reintenta y una cancelación se revierte.
  billing_canceled boolean not null default false,
  billing_declined boolean not null default false,

  -- Plan crudo (el JSON-string `mmbp` de Skool: importe, moneda,
  -- intervalo). Informativo. Que no se use para esconder herramientas:
  -- de 30 activos medidos, 25 traen plan y 4 no (admins/cortesías).
  plan_raw         text,

  synced_at        timestamptz not null default now()
);

comment on table public.skool_members is
  'Espejo de la comunidad de Skool la-huerta-lab. Lo mantiene sync-skool-members y lo lee skool-login. Solo service_role.';
comment on column public.skool_members.status is
  'active | cancelling | churned | banned. cancelling CONSERVA el acceso hasta access_until: solo churned y banned lo revocan.';
comment on column public.skool_members.access_until is
  'Fin real del acceso de quien canceló (metadata.mbscpe de Skool, unix en segundos). NULL = sin fecha de corte.';
comment on column public.skool_members.plan_raw is
  'Plan crudo de Skool (mmbp). Dato informativo: aquí no hay gating por plan.';

-- Búsqueda case-insensitive (defensa; el CHECK ya obliga minúsculas)
-- y consultas del cron por antigüedad de sincronización.
create index if not exists skool_members_email_lower_idx
  on public.skool_members ((lower(email)));
create index if not exists skool_members_status_idx
  on public.skool_members (status);
create index if not exists skool_members_synced_at_idx
  on public.skool_members (synced_at desc);

-- Si la tabla ya existía con la versión anterior de esta columna, el
-- `create table if not exists` de arriba no la toca: el CHECK viejo de
-- `role` hay que retirarlo a mano. En una base nueva no hace nada.
alter table public.skool_members
  drop constraint if exists skool_members_role_check;

-- RLS habilitado SIN policies: nadie con la anon key lee esta tabla.
-- Es deliberado — la lista de miembros de una comunidad de pago no
-- puede ser descargable desde el HTML que se pega en GoHighLevel.
-- Solo el service_role (sync-skool-members y skool-login) entra.
alter table public.skool_members enable row level security;


-- ---------- Helper: ¿este correo tiene acceso vigente? -------
--  Sustituye al `is_email_skool_member` de Lina, que solo sabía
--  responder "está o no está en la tabla". En un grupo de pago eso
--  daría acceso gratis a quien ya se dio de baja hasta que el cron
--  borrara su fila. Aquí se decide por los campos afirmativos.
--  `access_until` (el `mbscpe` de Skool) NO significa lo mismo para todo el
--  mundo, y ahí está la trampa: en quien canceló es el fin real del acceso,
--  pero en quien sigue al día es la PRÓXIMA FECHA DE COBRO. Denegar por esa
--  fecha a todo el mundo echa cada mes, durante la ventana que va del cobro
--  al siguiente sync (hasta 6 h), a gente que acaba de pagar. Por eso solo
--  pesa cuando hay señal de cancelación. Es la misma regla que aplica
--  `accesoVigenteEnCache` en skool-login: si cambia una, cambian las dos.
create or replace function public.skool_member_has_access(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.skool_members m
    where m.email = lower(trim(p_email))
      and m.churned_at is null          -- se dio de baja
      and m.banned_at  is null          -- lo expulsaron
      and not (
        (m.billing_canceled or m.status = 'cancelling')
        and m.access_until is not null
        and m.access_until <= now()
      )
  );
$$;

comment on function public.skool_member_has_access(text) is
  'true si el correo es miembro de Skool con acceso vigente. Quien está en cancelling sigue dando true hasta access_until; en quien NO canceló, access_until es la fecha de renovación y no revoca. No mira allowed_emails: los accesos manuales se comprueban aparte, en skool-login.';

-- Es `security definer`, así que atraviesa la RLS de skool_members a
-- propósito. Sin este revoke, PostgREST la publica en
-- /rest/v1/rpc/skool_member_has_access y cualquiera con la anon key —que va
-- en claro dentro del HTML que se pega en GHL— la usa de oráculo: pregunta
-- correo por correo quién paga la comunidad. La RLS de la tabla no lo
-- impide; el permiso de ejecución, sí.
revoke all on function public.skool_member_has_access(text) from public, anon, authenticated;
grant execute on function public.skool_member_has_access(text) to service_role;


-- ============================================================
--  2) profiles — identidad local
-- ============================================================
--  Un row por usuario de auth.users. `is_skool_member` es la marca
--  que escriben las funciones (nunca el cliente) tras verificar la
--  membresía contra Skool.
--
--  NO existe `skool_level`: no se porta el gating por plan de SAVIAS.
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  is_skool_member  boolean not null default false,
  skool_synced_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil local del usuario de auth.users. is_skool_member solo lo escribe el service_role desde las edge functions.';

-- Índice ÚNICO sobre lower(email). En Lina era un índice normal y
-- nada impedía dos filas con el mismo correo; como skool-login
-- actualiza el perfil filtrando por email, un duplicado significaba
-- tocar filas de más. Único = ese filtro apunta a una sola persona.
create unique index if not exists profiles_email_lower_idx
  on public.profiles ((lower(email)));

-- ---------- RLS ----------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = user_id);

-- A propósito NO hay policies de insert/update/delete para anon ni
-- para authenticated: si las hubiera, cualquiera con la anon key
-- (que va en claro dentro de universo-huerta-lab.html) podría
-- marcarse a sí mismo como miembro y saltarse el pago. Las
-- escrituras entran solo por el trigger de alta y por el
-- service_role de las edge functions.

-- ---------- Backfill de usuarios que ya existan --------------
--  El proyecto ya tenía cuentas del login por contraseña, así que
--  se les crea el perfil. `distinct on` protege el índice único por
--  si en auth.users hubiera dos correos que solo difieren en
--  mayúsculas: entra el más antiguo y el otro se resuelve a mano.
insert into public.profiles (user_id, email)
select distinct on (lower(u.email)) u.id, lower(u.email)
from auth.users u
where u.email is not null
order by lower(u.email), u.created_at
on conflict (user_id) do nothing;

-- ---------- Trigger: crear el perfil al registrarse ----------
--  Aquí SOLO crea el perfil. La versión de Lina además disparaba un
--  sync dirigido a Skool por pg_net; en La Huerta LAB eso sobra,
--  porque `skool-login` ya verificó la membresía justo antes de
--  crear el usuario y marca el perfil por su cuenta. Portarlo
--  añadiría un secreto de vault, una llamada HTTP por alta y una
--  fuente más de fallos silenciosos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, lower(trim(new.email)))
  on conflict (user_id) do update
    set email      = excluded.email,
        updated_at = now();
  return new;
exception when others then
  -- Nunca romper el alta por culpa del perfil: sin esto, un choque
  -- en el índice único dejaría a la persona sin poder registrarse.
  raise warning 'handle_new_user no pudo crear el perfil de %: %', new.email, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Trigger: mantener el email sincronizado ----------
--  Se dispara en cada update de auth.users (incluido cada login,
--  que toca last_sign_in_at), por eso el guard de la primera línea:
--  sin él haríamos un UPDATE inútil en cada entrada.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    begin
      update public.profiles
         set email      = lower(trim(new.email)),
             updated_at = now()
       where user_id = new.id;
    exception
      when unique_violation then
        raise warning 'handle_user_email_change: % ya está en otro perfil', new.email;
      when others then
        -- Mismo pacto que en el alta: el perfil nunca puede tumbar una
        -- escritura de auth.users. Sin este brazo, un update de auth.users
        -- que dejara el correo en NULL (identidad de correo desvinculada,
        -- alta anónima) reventaba contra el `not null` de profiles.email y
        -- se llevaba por delante la operación entera de Supabase Auth.
        raise warning 'handle_user_email_change no pudo sincronizar el perfil de %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------- Helper para usar en RLS de otras tablas ----------
--  Por si mañana alguna tabla del universo quiere restringirse a
--  miembros. Devuelve el flag ya calculado del perfil.
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

-- `authenticated` conserva el permiso porque una policy de RLS se evalúa con
-- el rol de quien consulta: si mañana una tabla se restringe con
-- `using (public.is_skool_member(auth.uid()))`, sin este grant la policy
-- daría false para todo el mundo. `anon` no lo necesita para nada.
revoke all on function public.is_skool_member(uuid) from public, anon;
grant execute on function public.is_skool_member(uuid) to authenticated, service_role;


-- ============================================================
--  3) allowed_emails — la puerta de atrás
-- ============================================================
--  Correos que entran aunque no aparezcan en Skool: cortesías,
--  invitados, alguien que ya pagó pero todavía no está en el grupo,
--  y cualquier acceso que Iván quiera dar a mano.
--
--  `skool-login` la mira ANTES que la caché de Skool y el cron de
--  sync NUNCA la toca, así que estos accesos duran hasta que se
--  borren a mano.
--
--  SIN columna `level`: en La Huerta LAB no hay planes, y el
--  default 'vip' de Lina aquí no significaría nada.
create table if not exists public.allowed_emails (
  email       text primary key check (email = lower(email)),
  first_name  text,               -- para el saludo del universo
  note        text,               -- por qué tiene acceso (ej. "admin Skool")
  created_at  timestamptz not null default now()
);

comment on table public.allowed_emails is
  'Accesos manuales (admins, cortesías, invitados). El sync nunca la toca. Sin niveles: quien está aquí ve las 6 herramientas.';

create index if not exists allowed_emails_email_lower_idx
  on public.allowed_emails ((lower(email)));

-- RLS habilitado SIN policies: solo el service_role.
alter table public.allowed_emails enable row level security;

-- Sin seeds: no se dejan correos de ejemplo, que en Lina quedaron
-- como filas placeholder de verdad dentro de la tabla. Los reales se
-- insertan a mano cuando se sepan, con este molde y en minúsculas:
--
--   insert into public.allowed_emails (email, first_name, note) values
--     ('correo@real.com', 'Iván', 'admin de la comunidad')
--   on conflict (email) do nothing;


-- ============================================================
--  4) sync_alerts — auditoría del sync
-- ============================================================
--  Cada corrida de sync-skool-members deja aquí su rastro, y también
--  las alertas: cookie de admin caída, error HTTP, escaneo vacío.
--  Sirve para diagnóstico histórico y como anti-spam del correo de
--  aviso (1 cada 24 h) mediante el índice compuesto de abajo.
create table if not exists public.sync_alerts (
  id          bigserial primary key,
  kind        text not null check (kind in (
                -- las cuatro de Lina...
                'run', 'cookie_expired', 'http_error', 'no_members',
                -- ...y las que necesita un grupo de pago:
                'partial_scan',     -- se escanearon menos miembros de los que reporta Skool
                'canary_abort',     -- caída brusca de activos frente al último run bueno
                'access_revoked',   -- alguien pasó a churned/banned en esta corrida
                'schema_changed'    -- el JSON de Skool ya no trae lo que esperábamos
              )),
  message     text,
  payload     jsonb,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.sync_alerts is
  'Bitácora de sync-skool-members. El CHECK de kind es cerrado: si el sync inventa un tipo nuevo, el insert falla en silencio dentro de su try/catch y te quedas sin auditoría. Ampliar aquí primero.';

-- Refresco idempotente del CHECK. `create table if not exists` NO toca una
-- tabla que ya exista, así que si esta migración se corrige después de un
-- primer push, la lista de arriba se quedaría en la versión vieja y el kind
-- nuevo seguiría rebotando. Esto la deja siempre al día.
--
-- Y esta lista es la que tiene que cuadrar con `sync-skool-members`: hoy la
-- función emite 'run', 'cookie_expired', 'http_error', 'no_members',
-- 'partial_scan' y 'canary_abort'. Si emite uno que no esté aquí, PostgREST
-- rechaza el insert, la función lo reintenta como 'http_error' con el original
-- dentro del payload, y esa alerta deja de ser localizable por su kind.
alter table public.sync_alerts
  drop constraint if exists sync_alerts_kind_check;
alter table public.sync_alerts
  add constraint sync_alerts_kind_check check (kind in (
    'run', 'cookie_expired', 'http_error', 'no_members',
    'partial_scan', 'canary_abort', 'access_revoked', 'schema_changed'
  ));

create index if not exists sync_alerts_created_at_idx
  on public.sync_alerts (created_at desc);
create index if not exists sync_alerts_kind_idx
  on public.sync_alerts (kind);
-- El compuesto es el que resuelve "¿ya avisé de esto en las últimas
-- 24 h?" sin recorrer la tabla entera.
create index if not exists sync_alerts_kind_notified_created_idx
  on public.sync_alerts (kind, notified, created_at desc);

-- RLS habilitado SIN policies: solo el service_role.
alter table public.sync_alerts enable row level security;

-- Limpieza opcional, para que la bitácora no crezca sin fin.
--
-- OJO con la combinación `security definer` + permiso de ejecución abierto:
-- PostgREST publica toda función de `public` como RPC, y por defecto Postgres
-- da EXECUTE a PUBLIC. Sin el revoke de abajo, cualquiera con la anon key
-- podía hacer POST a /rest/v1/rpc/cleanup_old_sync_alerts con {"days":0} y
-- borrar la bitácora entera — justo lo que la RLS de sync_alerts pretendía
-- impedir. Borrar la auditoría es además lo primero que haría quien estuviera
-- haciendo algo raro.
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

revoke all on function public.cleanup_old_sync_alerts(int) from public, anon, authenticated;
grant execute on function public.cleanup_old_sync_alerts(int) to service_role;


-- ============================================================
--  Lo que NO hace este archivo, a propósito
-- ============================================================
--  · No programa el cron del sync. En Lina el job se creaba en la
--    migración leyendo `project_url` y `service_role_key` de
--    vault.decrypted_secrets, pero ninguna migración creaba esos
--    secretos: si no existen, la URL se concatena a NULL y el cron
--    no hace NADA, sin error visible. Se activa aparte, en este
--    orden y solo después de desplegar la edge function:
--
--      select vault.create_secret('https://bevduxusxfwmgtudytax.supabase.co', 'project_url');
--      select vault.create_secret('<service_role_key>', 'service_role_key');
--
--      create extension if not exists pg_cron;
--      create extension if not exists pg_net;
--
--      select cron.unschedule('sync-skool-members-6h')
--      where exists (select 1 from cron.job where jobname = 'sync-skool-members-6h');
--
--      select cron.schedule('sync-skool-members-6h', '0 */6 * * *', $cron$
--        select net.http_post(
--          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-skool-members',
--          headers := jsonb_build_object(
--            'Content-Type',  'application/json',
--            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--          ),
--          body := '{}'::jsonb
--        );
--      $cron$);
--
--  · No crea `level` ni `skool_level` en ninguna tabla, ni porta
--    20260702_skool_plan_gating.sql. Aquí no hay planes que gatear.
-- ============================================================

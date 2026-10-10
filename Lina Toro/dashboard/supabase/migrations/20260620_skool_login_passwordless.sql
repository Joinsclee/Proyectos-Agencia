-- ============================================================
--  Universo Lina · Login passwordless basado en membresía Skool
-- ============================================================
--  Las usuarias (señoras mayores, poco técnicas) entran SOLO con
--  su correo: escriben el email → se verifica que esté en la
--  comunidad Skool de Savias → si lo está, se les crea/recupera
--  sesión automáticamente; si no, se les niega el acceso.
--
--  Esta tabla `skool_members` es un caché persistente de los
--  correos de la comunidad para que el login sea instantáneo y NO
--  dependa de la cookie de Skool en vivo en cada intento de login.
--
--  Quién la mantiene:
--    - sync-skool-members (modo cron): la refresca como espejo
--      completo de la comunidad (upsert de todos los miembros
--      escaneados + delete de los que ya no están).
--    - skool-login (live-fallback): si un email no está en caché,
--      lo verifica en vivo y, si lo encuentra, hace upsert aquí.
-- ============================================================

-- ---------- Tabla skool_members ------------------------------
--  email siempre se guarda en minúsculas/trim (responsabilidad de
--  quien escribe; el helper de lectura normaliza con lower()).
create table if not exists public.skool_members (
  email       text primary key,
  first_name  text,
  last_name   text,
  synced_at   timestamptz not null default now()
);

-- Búsqueda case-insensitive por email (defensa por si algún row
-- llegara sin normalizar). El primary key ya indexa email tal cual.
create index if not exists skool_members_email_lower_idx
  on public.skool_members ((lower(email)));

-- ---------- RLS ----------------------------------------------
--  Habilitado SIN policies para clientes anon/authenticated:
--  solo el service_role accede (cron + skool-login). Esto evita
--  que un usuario lea/escriba la lista de miembros desde el cliente.
alter table public.skool_members enable row level security;

-- ---------- Helper: is_email_skool_member() ------------------
--  Devuelve true si el email (normalizado a minúsculas) existe en
--  la caché skool_members. Pensado para uso server-side.
create or replace function public.is_email_skool_member(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.skool_members
    where lower(email) = lower(trim(p_email))
  );
$$;

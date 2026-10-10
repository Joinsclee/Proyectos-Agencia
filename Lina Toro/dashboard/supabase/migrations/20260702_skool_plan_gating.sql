-- ============================================================
--  Universo Lina · Gating por PLAN de Skool (Standard/Premium/VIP)
-- ============================================================
--  Contexto:
--    Hasta ahora el acceso era binario: is_skool_member (sí/no).
--    Toda persona que entraba (login passwordless verificado contra
--    Skool) veía TODAS las herramientas.
--
--  Nuevo requerimiento:
--    - Plan ESTÁNDAR de Skool → solo ve 2 herramientas
--      (Calculadora de Precios + Calculadora de Saponificación),
--      además del chat con IA y el botón a la comunidad (FABs).
--    - Cualquier OTRO plan (Premium, VIP, …) → ve todo.
--
--  De dónde sale el plan:
--    El plan vive dentro del JSON interno de Skool, en
--    `member.metadata.mmbp` (un JSON-string). Al parsearlo, `.tier`
--    da "premium" / "vip" / "standard" / etc. (mismo mecanismo que ya
--    usa el proyecto de Paulina, verificado 2026-06-11).
--
--    - sync-skool-members (cron 6h): ahora además de email/nombre
--      extrae `level` (el tier) de cada miembro y lo guarda en
--      skool_members.level y en profiles.skool_level.
--    - skool-login: al entrar, devuelve el `level` del miembro para
--      que el frontend decida qué herramientas mostrar, y lo persiste
--      en profiles.skool_level (para recargas de página).
--
--  Qué niveles dan acceso completo se decide EN EL FRONTEND
--  (const FULL_ACCESS_PLANS en universo-lina.html). El backend solo
--  guarda el string crudo del tier; no juzga.
--
--  ESTA MIGRACIÓN ES IDEMPOTENTE (se puede correr varias veces).
--  ROLLBACK MANUAL al final del archivo.
-- ============================================================

-- ---------- 1. skool_members: guardar el plan/tier -----------
--  Caché espejo de la comunidad (la usa skool-login para el login
--  instantáneo). Ahora también recuerda el plan de cada correo.
alter table public.skool_members
  add column if not exists level text;

-- ---------- 2. profiles: plan persistido del usuario ---------
--  Se puede LEER desde el cliente (policy "read own profile" ya
--  existente). Solo el service_role lo ESCRIBE (no hay policy de
--  update para clientes), así que una usuaria no puede auto-asignarse
--  un plan superior editando localStorage o llamando a Supabase.
alter table public.profiles
  add column if not exists skool_level text;

create index if not exists profiles_skool_level_idx
  on public.profiles ((lower(skool_level)))
  where skool_level is not null;

-- ---------- 3. allowed_emails: plan para accesos manuales ----
--  Los admin/owners de Skool NO aparecen en el scraping de miembros,
--  así que entran vía allowed_emails. Por defecto un acceso manual es
--  un grant "full" (nivel vip) para que admins/comps vean todo.
--  Si algún día quieres un acceso manual limitado (p. ej. alguien que
--  pagó el plan estándar pero aún no está en Skool), pon level='standard'
--  en su fila.
alter table public.allowed_emails
  add column if not exists level text default 'vip';

-- Los admins que ya existían (creados antes de esta columna) quedaron
-- con level NULL; los normalizamos a 'vip' para que sigan viendo todo.
update public.allowed_emails
  set level = 'vip'
  where level is null;

-- ============================================================
--  ROLLBACK MANUAL:
--    alter table public.allowed_emails drop column if exists level;
--    drop index if exists public.profiles_skool_level_idx;
--    alter table public.profiles drop column if exists skool_level;
--    alter table public.skool_members drop column if exists level;
-- ============================================================

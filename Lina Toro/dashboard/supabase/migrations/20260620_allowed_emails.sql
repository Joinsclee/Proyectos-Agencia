-- ============================================================
--  Universo Lina · allowed_emails (acceso manual al login)
-- ============================================================
--  Los admin/owners de la comunidad de Skool NO aparecen en el
--  scraping de miembros (el endpoint de Skool solo lista members),
--  así que con su correo de admin el login los rechazaría.
--
--  Esta tabla es una lista de correos permitidos manualmente:
--    - admins/owners de Skool (Lina, Cristian, etc.)
--    - accesos especiales (p. ej. alguien que pagó pero aún no
--      está en Skool).
--
--  El login (skool-login) la revisa ANTES que la caché de Skool.
--  El cron de sync-skool-members NUNCA toca esta tabla, así que
--  estos accesos persisten para siempre (hasta borrarlos a mano).
-- ============================================================

create table if not exists public.allowed_emails (
  email       text primary key,   -- guardar en minúsculas
  first_name  text,               -- opcional: para el saludo en el dashboard
  note        text,               -- opcional: por qué tiene acceso (ej. "admin Skool")
  created_at  timestamptz not null default now()
);

create index if not exists allowed_emails_email_lower_idx
  on public.allowed_emails ((lower(email)));

-- RLS habilitado SIN policies: solo el service_role (skool-login) accede.
alter table public.allowed_emails enable row level security;

-- ---------- Admins / accesos manuales ------------------------
--  Reemplaza los correos por los reales (en minúsculas). Puedes
--  correr este insert las veces que quieras: on conflict no duplica.
insert into public.allowed_emails (email, first_name, note) values
  ('correo-admin-1@gmail.com', 'Lina',     'admin/owner Skool'),
  ('correo-admin-2@gmail.com', 'Cristian', 'admin Skool')
on conflict (email) do nothing;

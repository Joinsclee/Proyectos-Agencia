-- ============================================================
--  Mi Barco · Paulina Valencia — Fix del trigger protector
-- ============================================================
--  El trigger fn_profiles_protect_skool_fields usaba una WHITELIST
--  ('service_role', 'postgres', 'supabase_admin') que asumía que el
--  SQL Editor del Dashboard corre como 'postgres'. En realidad puede
--  correr como 'authenticator' u otro rol interno, lo que rompía
--  los UPDATE manuales (la columna no se actualizaba).
--
--  Fix: invertir la lógica → BLACKLIST de roles del cliente
--  ('authenticated', 'anon'). Solo esos dos no pueden tocar las
--  columnas protegidas. Todo el resto (SQL Editor, edge functions,
--  cron, triggers internos) puede modificarlas libremente.
--
--  Beneficios:
--    - Funciona desde SQL Editor del Dashboard sin import.
--    - Funciona desde edge functions con service_role.
--    - Bloquea explícitamente el ataque que importa (cliente con anon key).
--
--  IDEMPOTENTE. Re-correrla es seguro.
-- ============================================================

create or replace function public.fn_profiles_protect_skool_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  -- Detectar el rol activo de forma robusta:
  -- 1. current_setting('role', true) → respeta SET ROLE explícito
  -- 2. session_user → el rol con el que se conectó originalmente
  -- En PostgREST (la API REST de Supabase), session_user es 'authenticator'
  -- pero current_setting('role') es 'anon' o 'authenticated' según el JWT.
  v_current_role := coalesce(current_setting('role', true), session_user);

  -- BLACKLIST: solo bloquear roles que vienen del cliente (frontend con anon
  -- key o JWT de usuario). El SQL Editor del Dashboard, las edge functions,
  -- el cron y los triggers internos pasan libremente.
  if v_current_role in ('authenticated', 'anon') then
    NEW.skool_level         := OLD.skool_level;
    NEW.skool_synced_at     := OLD.skool_synced_at;
    NEW.skool_member_since  := OLD.skool_member_since;
    NEW.is_admin            := OLD.is_admin;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

-- El trigger trg_profiles_protect_skool ya existe (creado por la migración 1).
-- Solo reemplazamos la función con la lógica corregida.

-- Politicas de Row Level Security (RLS) para la tabla profiles
-- ALTAMENTE RECOMENDADO: Previene que usuarios accedan a datos de otros usuarios

-- Habilitar RLS en la tabla profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politica: Los usuarios solo pueden LEER su propio perfil
CREATE POLICY read_own_profile_data ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Politica: Los usuarios solo pueden ACTUALIZAR su propio perfil
CREATE POLICY update_own_profile_data ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- Politica: Los usuarios solo pueden INSERTAR su propio perfil
-- (Normalmente manejado por el trigger, pero por si acaso)
CREATE POLICY insert_own_profile_data ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Politica: Los usuarios solo pueden ELIMINAR su propio perfil
CREATE POLICY delete_own_profile_data ON public.profiles
FOR DELETE
USING (auth.uid() = id);

-- NOTA IMPORTANTE:
-- El service_role key tiene acceso completo y bypasea RLS
-- Usalo solo en el servidor, nunca exponerlo al cliente
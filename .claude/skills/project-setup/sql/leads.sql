-- Tabla leads para captura de emails (waitlist, newsletter, etc.)
-- OPCIONAL: Solo necesaria si usas el componente ButtonLead

-- Crear la tabla leads
CREATE TABLE public.leads (
  id UUID DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  PRIMARY KEY (id)
);

-- Habilitar Row Level Security
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Politica para permitir que cualquiera pueda insertar un lead
-- (necesario para que el formulario de captura funcione sin autenticacion)
CREATE POLICY insert_lead ON public.leads
FOR INSERT
TO public
WITH CHECK (true);

-- NOTA: No se permite SELECT, UPDATE o DELETE publico por seguridad
-- Solo el service_role puede leer los leads (desde el servidor)
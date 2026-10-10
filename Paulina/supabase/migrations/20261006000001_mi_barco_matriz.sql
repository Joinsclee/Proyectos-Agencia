-- ============================================================
--  Mi Barco · Matriz de Urgencia e Importancia dentro de la app
--  - Nueva columna `matriz` en mi_barco_state con el mismo shape que la
--    página pública guarda en localStorage: { tasks: [...] }.
--  - Las políticas RLS de la tabla son por fila (mbs_*_own), así que la
--    columna nueva queda cubierta sin tocarlas.
--  ORDEN DE DESPLIEGUE: esta migración va ANTES de pegar el build nuevo de
--  la app en GHL. Si la app llega primero, sigue funcionando (detecta que
--  falta la columna y guarda la Matriz en el navegador), pero ese progreso
--  no llega a la cuenta hasta que la columna exista.
-- ============================================================

alter table public.mi_barco_state
  add column if not exists matriz jsonb not null default '{}'::jsonb;

-- Que PostgREST vea la columna sin esperar a su recarga periódica.
notify pgrst, 'reload schema';

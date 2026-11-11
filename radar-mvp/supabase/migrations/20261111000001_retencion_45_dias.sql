-- =====================================================================
-- Radar MVP - Retencion: borrar lo que ya no existe en ningun portal
-- =====================================================================
-- Por que hace falta:
--
-- El lifecycle (20260609000002) solo DESACTIVA: marca `is_active=false`
-- cuando un inmueble deja de verse, pero la fila se queda para siempre.
-- Con el cron escribiendo a diario la base paso de 402 MB a 1.033 en un
-- mes, con el limite del plan gratuito en 500, y Supabase acabo poniendo
-- el proyecto en solo-lectura: la web dejo de arrancar.
--
-- Desactivar no libera espacio. Esto borra, con dos salvaguardas:
--
--   1. Los FAVORITOS de los usuarios nunca se borran. 8 de los 19
--      favoritos que hay hoy apuntan a fichas caducadas; borrarlas no se
--      nota hasta que el usuario abre su lista y la encuentra vacia.
--   2. El margen minimo de 15 dias evita que un `p_days` mal escrito
--      (o un 0 por una variable vacia) vacie la tabla entera.
--
-- `last_seen_at` es la senal correcta, no `scraped_at`: el cron refresca
-- la primera cada vez que vuelve a ver el aviso y la segunda no (medido:
-- 34.670 fichas sin ver en 60 dias por last_seen_at, 79.600 por
-- scraped_at — la segunda cifra incluye fichas vivas).
-- =====================================================================

create or replace function public.purgar_inmuebles_caducados(p_days integer default 45)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer;
begin
  if p_days is null or p_days < 15 then
    raise exception 'retencion demasiado corta (% dias): el minimo es 15', p_days;
  end if;

  with favs as (
    select distinct (jsonb_array_elements(raw_user_meta_data->'favorites')->>'id') as id
      from auth.users
     where jsonb_typeof(raw_user_meta_data->'favorites') = 'array'
  ), borradas as (
    delete from public.inmuebles i
     where i.last_seen_at < now() - make_interval(days => p_days)
       and i.id::text not in (select id from favs where id is not null)
    returning 1
  )
  select count(*) into n from borradas;

  return n;
end $$;

comment on function public.purgar_inmuebles_caducados(integer) is
  'Borra los inmuebles no vistos en p_days dias, respetando los favoritos de los usuarios. Devuelve cuantos borro.';

-- El cron la llama con la service_role key.
grant execute on function public.purgar_inmuebles_caducados(integer) to service_role;

-- El filtro del borrado necesita este indice; sin el son 151k filas de seq scan
-- cada vez que corre el cron.
create index if not exists idx_inmuebles_last_seen on public.inmuebles (last_seen_at);

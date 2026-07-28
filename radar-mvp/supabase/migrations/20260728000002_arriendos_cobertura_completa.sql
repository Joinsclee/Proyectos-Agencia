-- Fin del piloto de arriendos: se abre la cobertura a todas las ciudades donde
-- el Radar ya tiene inmuebles en venta.
--
-- CONTEXTO: `20260725000004_rental_pilot_rollout.sql` dejó activas solo cinco
-- ciudades y pausó las otras 137, con la nota «pendiente expansión controlada
-- cuando existan métricas de tiempo, calidad y presión sobre el portal». Esas
-- métricas ya existen.
--
-- LO QUE MOSTRARON LAS MÉTRICAS (medido el 2026-07-28):
--   · Calidad: en las cinco ciudades del piloto, 74 de cada 75 fichas obtienen
--     estimación de canon. El motor funciona; lo que falta es dónde mirar.
--   · Cobertura: el 68,3% del inventario en venta está en ciudades SIN un solo
--     arriendo, así que ahí no hay análisis de rentabilidad posible. En el panel
--     de administración son 35 de las 40 ciudades principales marcadas «sin
--     cobertura».
--   · Tiempo: el scrape de arriendo tarda 0,77 s por página. Las 128 ciudades
--     pausadas que tienen inventario en venta suman 3.726 páginas ≈ 48 minutos,
--     una vez por semana. El scrape de venta ya toma ~63 minutos, así que esto no
--     cambia el orden de magnitud de la corrida.
--   · Presión sobre el portal: la misma cadencia semanal y las mismas pausas
--     corteses entre lotes que ya usa el módulo de venta.
--
-- CRITERIO: se activan las ciudades donde ya hay inmuebles EN VENTA. Traer canon
-- de una ciudad donde el Radar no vende nada sería gastar tiempo de scraping en
-- comparables que nadie va a consultar — el mismo principio «dirigido por la
-- demanda» que la propuesta ya aplica a FincaRaíz.

update public.radar_zonas_monitoreadas z
   set is_active = true,
       notes = concat(
         'Arriendos activos · cobertura ampliada 2026-07-28',
         case
           when z.notes is null or z.notes = '' then ''
           -- Se retira la marca de la pausa para que no quede contradiciendo al
           -- estado nuevo, pero se conserva el resto de la nota original.
           else concat(' · ', regexp_replace(z.notes, '^Arriendos pausados · pendiente expansión controlada( · )?', ''))
         end
       )
 where z.portal = 'fincaraiz'
   and z.operation = 'arriendo'
   and z.is_active = false
   and exists (
     select 1
       from public.inmuebles i
      where i.source = 'fincaraiz'
        and i.is_active = true
        and lower(trim(i.city)) = lower(trim(z.city))
   );

-- Comprobación para quien aplique la migración: debe quedar una sola zona de
-- arriendo pausada por cada ciudad SIN inventario en venta.
--   select count(*) filter (where is_active) as activas,
--          count(*) filter (where not is_active) as pausadas
--     from public.radar_zonas_monitoreadas
--    where operation = 'arriendo';

-- =====================================================================
-- Radar MVP - Despliegue controlado del mercado de arriendos
-- =====================================================================
-- La cobertura completa queda configurada, pero el cron empieza únicamente
-- con las cinco ciudades auditadas. Las demás se habilitan por lotes cuando
-- existan métricas de tiempo, calidad y presión sobre el portal.

update public.radar_zonas_monitoreadas
   set is_active = false,
       notes = concat(
         'Arriendos pausados · pendiente expansión controlada',
         case when notes is not null and notes <> '' then concat(' · ', notes) else '' end
       )
 where portal = 'fincaraiz'
   and operation = 'arriendo'
   and city not in ('medellin', 'bogota', 'cali', 'barranquilla', 'bucaramanga')
   and is_active = true;

update public.radar_zonas_monitoreadas
   set notes = concat(
     'Piloto de arriendos activo · auditado 2026-07-25',
     case when notes is not null and notes <> '' then concat(' · ', notes) else '' end
   )
 where portal = 'fincaraiz'
   and operation = 'arriendo'
   and city in ('medellin', 'bogota', 'cali', 'barranquilla', 'bucaramanga')
   and notes not like 'Piloto de arriendos activo%';

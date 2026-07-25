-- Alinea los activos bancarios con la cadencia semanal acordada para Fase 1.
-- La migración inicial también queda corregida para instalaciones nuevas; este
-- UPDATE aplica el cambio a bases que ya tenían el trabajo configurado a 15 días.

update public.radar_cron_jobs
set cadencia_dias = 7,
    actualizado_en = now()
where nombre = 'bancos'
  and cadencia_dias <> 7;

comment on table public.radar_cron_jobs is
  'Calendario de scraping. Cadencia semanal para portal, remates y activos bancarios; motor CRECE diario.';

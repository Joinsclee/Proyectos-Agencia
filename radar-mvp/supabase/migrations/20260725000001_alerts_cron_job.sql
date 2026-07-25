-- Registra el despacho semanal de alertas en el planificador persistido.
--
-- Se crea deshabilitado a propósito: primero deben guardarse los secretos de
-- Resend en EasyPanel y ejecutarse un canary dirigido. El operador puede
-- habilitarlo después con:
--
-- update public.radar_cron_jobs
-- set habilitado = true, actualizado_en = now()
-- where nombre = 'alertas';

insert into public.radar_cron_jobs (nombre, cadencia_dias, habilitado)
values ('alertas', 7, false)
on conflict (nombre) do update
set cadencia_dias = excluded.cadencia_dias;


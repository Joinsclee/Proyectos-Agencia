-- Programación de las corridas automáticas del Radar.
--
-- El calendario vive en la BASE, no en la memoria del proceso. Con node-cron a
-- secas, un reinicio del contenedor (un despliegue, un OOM, un reinicio de
-- EasyPanel) borra los temporizadores: si el reinicio cae justo antes de la hora,
-- esa semana no se scrapea y nadie se entera. Guardando la última corrida, el
-- planificador solo pregunta "¿ya pasaron N días?" y se recupera solo.
--
-- `corriendo_desde` es además un cerrojo: si algún día el servicio corre con dos
-- réplicas, la segunda ve el trabajo tomado y no lo duplica.

create table if not exists public.radar_cron_jobs (
  nombre           text primary key,       -- 'fincaraiz' | 'bancos' | 'remates' | 'motor'
  cadencia_dias    int  not null,
  habilitado       boolean not null default true,
  ultima_corrida   timestamptz,
  ultimo_estado    text,                   -- 'ok' | 'error'
  ultimo_detalle   text,
  corriendo_desde  timestamptz,            -- cerrojo; null = libre
  duracion_seg     int,
  actualizado_en   timestamptz not null default now()
);

comment on table public.radar_cron_jobs is
  'Calendario de scraping. Cadencia semanal para portal, remates y activos bancarios; motor CRECE diario.';

-- Cadencias iniciales. Cambiar una es un UPDATE: no requiere desplegar código,
-- igual que los rangos de precio por ciudad.
insert into public.radar_cron_jobs (nombre, cadencia_dias) values
  ('fincaraiz', 7),   -- portal abierto: construye la mediana, tiene que estar fresco
  ('remates',   7),   -- las audiencias cambian de una semana a otra
  ('bancos',    7),   -- activos bancarios: verificación semanal acordada
  ('motor',     1)    -- reevaluar el Índice CRECE a diario es barato (solo escribe lo que cambia)
on conflict (nombre) do nothing;

create index if not exists radar_cron_pendientes_idx
  on public.radar_cron_jobs (habilitado, ultima_corrida);

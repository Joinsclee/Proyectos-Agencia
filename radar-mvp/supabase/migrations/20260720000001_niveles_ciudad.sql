-- HU "Rango de Precio y Vigencia del Motor Radar" — configuración por ciudad.
--
-- Regla dura de la HU: el rango de precio NO vive en el código del scraper, vive
-- en esta tabla, para que el negocio lo ajuste sin desplegar código.
--
-- Nivel 1 (tope $500M): Bogotá, Medellín, Cali, Barranquilla + Cartagena y
-- Bucaramanga (estas dos las confirmó el cliente el 2026-07-20; el documento las
-- dejaba "candidatas a Nivel 1, pendiente de decisión").
-- Nivel 2 (tope $400M): el resto.
-- Mínimo $20M para todas, sin excepción. Estrato 2-5 (el 5 entra porque ahí
-- también aparecen apartaestudios, locales y parqueaderos dentro del rango).

alter table public.radar_zonas_monitoreadas
  add column if not exists nivel int,
  add column if not exists fecha_ultima_revision date;

comment on column public.radar_zonas_monitoreadas.nivel is
  'Nivel de ciudad del Radar CRECE: 1 = gran capital (tope $500M), 2 = intermedia (tope $400M).';

-- Por defecto TODA ciudad es Nivel 2: así ninguna fila queda sin rango y el motor
-- nunca tiene que adivinar un tope en código.
update public.radar_zonas_monitoreadas
set nivel = 2,
    price_min = 20000000,
    price_max = 400000000,
    stratum_min = 2,
    stratum_max = 5,
    fecha_ultima_revision = current_date
where nivel is null;

-- Nivel 1: las cuatro grandes + las dos confirmadas por el cliente.
update public.radar_zonas_monitoreadas
set nivel = 1,
    price_max = 500000000,
    fecha_ultima_revision = current_date
where city in ('bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 'bucaramanga');

create index if not exists radar_zonas_city_nivel_idx
  on public.radar_zonas_monitoreadas (city, nivel);

-- Comprobación: debe haber 6 ciudades en Nivel 1 y el resto en Nivel 2.
select nivel,
       count(*)        as ciudades,
       min(price_min)  as precio_min,
       max(price_max)  as precio_max
from public.radar_zonas_monitoreadas
group by nivel
order by nivel;

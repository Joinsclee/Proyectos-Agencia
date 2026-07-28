-- Las 10 ciudades de la tabla de la HU 3a que faltaban por configurar.
--
-- CONTEXTO. La HU «Rango de precio de análisis por nivel de ciudad» trae una
-- tabla de 32 capitales. Solo 22 estaban dadas de alta. Las 10 restantes llevan
-- en la propia HU la nota «verificar población vigente (DANE) antes de activar» o
-- «posible <100.000 hab — verificar antes de activar», y por eso se habían dejado
-- fuera.
--
-- DECISIÓN. El propietario del producto pidió el 2026-07-28 activarlas igualmente
-- para cerrar la cobertura de la tabla. Se deja constancia aquí de que la
-- verificación de población NO se hizo: es una decisión de alcance tomada a
-- sabiendas, no un descuido.
--
-- QUÉ DEVOLVIERON, medido tras el primer scrape:
--
--     ciudad                   venta   arriendo
--     san andres                  33          2   ← el 65% del total
--     riohacha                     6          1
--     leticia                      5          1
--     florencia                    2          -
--     puerto carreno               2          -
--     quibdo                       1          -
--     inirida                      1          -
--     san jose del guaviare        1          -
--     mocoa                        0          -   ← sin inventario en el portal
--     mitu                         0          -   ← sin inventario en el portal
--
-- De las 51 fichas de venta solo 11 pudieron clasificarse, y las 11 son de San
-- Andrés: el resto de ciudades no reúne comparables suficientes para calcular una
-- mediana, que es justo lo que la HU anticipaba al marcarlas. Se mantienen activas
-- porque el coste de rastrearlas es de segundos y porque un remate o un activo
-- bancario en esas ciudades sí necesita el contexto de mercado que estas filas dan.
--
-- Los slugs se comprobaron uno a uno contra el portal antes de insertarlos: los 10
-- responden. `mocoa` y `mitu` devuelven cero resultados porque no hay avisos, no
-- porque el slug esté mal.

insert into public.radar_zonas_monitoreadas
  (country_code, city, portal, operation, property_type, neighborhood_slug,
   city_slug, dept_slug, price_min, price_max, stratum_min, stratum_max,
   max_pages, min_comparables, is_active, nivel, fecha_ultima_revision, notes)
select
  'CO', c.city, 'fincaraiz', op, 'inmuebles', '',
  c.city_slug, c.dept_slug, 20000000, 400000000, 2, 5,
  5, 8, true, 2, date '2026-07-28',
  'HU 3a · tabla de capitales · activada 2026-07-28 por decisión del propietario pese a la marca de verificar población'
from (values
  ('riohacha',              'riohacha',              'la-guajira'),
  ('quibdo',                'quibdo',                'choco'),
  ('florencia',             'florencia',             'caqueta'),
  ('mocoa',                 'mocoa',                 'putumayo'),
  ('leticia',               'leticia',               'amazonas'),
  ('san andres',            'san-andres',            'san-andres-y-providencia'),
  ('san jose del guaviare', 'san-jose-del-guaviare', 'guaviare'),
  ('inirida',               'inirida',               'guainia'),
  ('mitu',                  'mitu',                  'vaupes'),
  ('puerto carreno',        'puerto-carreno',        'vichada')
) as c(city, city_slug, dept_slug)
cross join (values ('venta'), ('arriendo')) as o(op)
where not exists (
  select 1 from public.radar_zonas_monitoreadas z
   where z.portal = 'fincaraiz'
     and z.city = c.city
     and z.operation = o.op
);

-- Comprobación tras aplicar: deben quedar 152 zonas de venta y 143 de arriendo.
--   select operation, count(*) filter (where is_active) as activas
--     from public.radar_zonas_monitoreadas
--    where portal = 'fincaraiz'
--    group by operation;

-- Porcentajes de la calculadora de gastos de compra, editables sin desplegar.
--
-- EL PROBLEMA QUE RESUELVE: los tres porcentajes que la ficha usa para estimar
-- los gastos de escrituración vivían como literales en `server/public/app.js`
-- (`const GASTOS = { notaria: 0.0027, impuesto: 0.01, derechos: 0.005 }`). Son
-- cifras de LEY y cambian solas: el impuesto de registro lo fija cada
-- departamento dentro de la banda que le permite la Ley 223 de 1995, y las
-- tarifas notariales las actualiza la Superintendencia de Notariado cada año.
-- Cada uno de esos cambios obligaba a tocar código y a desplegar para corregir
-- un número que el administrador conoce mejor que quien programa.
--
-- POR QUÉ NO SE RESUELVE DE OTRA FORMA:
--   · Variables de entorno — cambiarlas exige reiniciar el servicio y entrar a
--     EasyPanel; el administrador no tiene acceso ahí, y tampoco queda registro
--     de quién cambió qué ni cuándo.
--   · Reusar `radar_cron_jobs` u otra tabla existente — mezclar el calendario de
--     scraping con parámetros de negocio hace que un `UPDATE` mal apuntado
--     apague un scraper. Son cosas distintas y se separan.
--   · Un archivo JSON en el repositorio — vuelve a exigir despliegue, que es
--     justo lo que se quiere quitar.
--
-- POR QUÉ UNA SOLA FILA Y NO UNA TABLA CLAVE→VALOR: los tres porcentajes se
-- publican JUNTOS en la ficha y se leen como un conjunto coherente. Con una fila
-- por parámetro, una escritura a medias (tres `UPDATE` de los que solo pasan
-- dos) dejaría al cliente viendo una mezcla de tarifas viejas y nuevas sin que
-- nadie lo note. Con una sola fila el cambio es atómico por construcción: o se
-- aplica entero o no se aplica. La llave `id` está clavada a 'vigente' con un
-- CHECK para que no puedan aparecer dos configuraciones compitiendo.
--
-- POR QUÉ NO HAY COLUMNA `departamento` TODAVÍA: el impuesto de registro sí
-- varía por departamento, pero la calculadora de la ficha NO le pregunta al
-- usuario en qué departamento va a registrar, así que una tabla por departamento
-- no tendría con qué escoger la fila. Modelarlo hoy sería inventar una llave que
-- nadie puede llenar. Cuando la ficha sepa el departamento, esto crece con una
-- columna y un `unique` — la degradación a los valores por defecto ya está
-- resuelta y seguiría sirviendo mientras tanto.
--
-- SEGURIDAD: RLS activo y SIN políticas, igual que `radar_sesiones_scraper`. Es
-- deliberado y no contradice que los porcentajes sean públicos: quien los
-- publica es el SERVIDOR por `/api/config`, con la llave de servicio; el
-- navegador nunca toca esta tabla. Así la lectura es pública y la escritura
-- sigue pasando por el guardia de administrador del panel, que es el único sitio
-- donde se comprueba el rol.

create table if not exists public.radar_parametros_gastos (
  -- Una única configuración vigente. El CHECK es el que garantiza la unicidad
  -- real: sin él, un `insert` con otro id crearía una segunda verdad silenciosa.
  id                 text primary key default 'vigente' check (id = 'vigente'),

  -- Fracciones, NO porcentajes: 0.0027 = 0,27 %. Se guardan como fracción porque
  -- es como las consume el cálculo; convertir en la frontera (una sola vez, en
  -- el formulario del panel) evita el error clásico de multiplicar dos veces
  -- por 100. Los CHECK son el último cerrojo: el servidor ya valida con zod,
  -- pero un `UPDATE` hecho a mano desde el SQL editor de Supabase se salta esa
  -- validación y llegaría igual a la ficha del cliente.
  --
  -- El techo de 0,05 (5 %) por línea no es arbitrario: hoy la mayor de las tres
  -- es el 1 % del impuesto de registro, que es además el máximo legal para actos
  -- con cuantía; con recargo departamental de beneficencia una línea podría
  -- rondar el 2 %. 5 % deja holgura de sobra y sigue rechazando el error de
  -- dedo que de verdad ocurre: escribir 0,5 (50 %) o 5 (500 %) creyendo que el
  -- campo pide porcentaje.
  notaria            numeric(7,6) not null check (notaria  >= 0 and notaria  <= 0.05),
  impuesto_registro  numeric(7,6) not null check (impuesto_registro >= 0 and impuesto_registro <= 0.05),
  derechos_registro  numeric(7,6) not null check (derechos_registro >= 0 and derechos_registro <= 0.05),

  -- Segundo cerrojo, sobre la SUMA: tres valores individualmente plausibles
  -- pueden sumar un disparate. Por encima del 10 % del valor del inmueble esto
  -- ya no es un costo de registro, es un error de captura.
  constraint radar_parametros_gastos_total_razonable
    check (notaria + impuesto_registro + derechos_registro <= 0.10),

  -- Quién y cuándo. El panel lo muestra junto al formulario: al ver una cifra
  -- rara, lo primero que se pregunta es de cuándo es y quién la puso.
  nota               text,
  actualizado_por    uuid,                 -- auth.users.id del administrador
  actualizado_en     timestamptz not null default now()
);

comment on table public.radar_parametros_gastos is
  'Porcentajes de gastos de escrituración de la calculadora. Una sola fila (id = ''vigente''). Si la tabla no existe o falla la lectura, el servidor sigue con los valores por defecto compilados.';
comment on column public.radar_parametros_gastos.notaria is
  'Fracción del valor que paga el COMPRADOR en notaría. La tarifa notarial completa (~0,54 %) se reparte 50/50 entre las partes: por eso el valor por defecto es 0,0027 y no 0,0054.';
comment on column public.radar_parametros_gastos.impuesto_registro is
  'Impuesto de registro departamental (beneficencia). Lo fija cada departamento; por eso esta tabla existe.';
comment on column public.radar_parametros_gastos.derechos_registro is
  'Derechos de registro de la Oficina de Registro de Instrumentos Públicos.';

-- Semilla con los MISMOS valores que estaban compilados en `app.js`. Es lo que
-- hace que aplicar esta migración no cambie ni un peso de lo que ve el cliente:
-- el día que se aplique, la calculadora sigue dando exactamente lo mismo y solo
-- entonces se empieza a editar desde el panel.
insert into public.radar_parametros_gastos
  (id, notaria, impuesto_registro, derechos_registro, nota)
values
  ('vigente', 0.0027, 0.01, 0.005, 'Valores iniciales, los mismos que estaban compilados en el frontend.')
on conflict (id) do nothing;

alter table public.radar_parametros_gastos enable row level security;
-- Sin políticas a propósito: RLS activo y ninguna política = solo entra la llave
-- de servicio. Los porcentajes se publican al público por `/api/config`, que los
-- lee con esa llave; el navegador no consulta esta tabla ni podría.

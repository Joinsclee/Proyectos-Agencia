-- Seguimiento de propuestas B2B de La Huerta Hotel.
--
-- La propuesta es una página pública con un enlace por destinatario. Cada apertura
-- deja una fila aquí: quién la abrió (el token del enlace), cuándo, cuánto tiempo
-- estuvo y hasta qué sección llegó. Eso es lo que da la ventaja al negociar: saber
-- que miraron el resumen de inversión tres veces antes de la llamada.
--
-- REGLA DE ORO DE ESTA TABLA: la propuesta escribe con la clave anon, que viaja en
-- el HTML y la tiene el cliente. Por eso solo puede INSERTAR. Si el SELECT estuviera
-- abierto a anon, Adidas podría leer las estadísticas de todas las propuestas, las
-- suyas y las de los demás. Leer exige sesión.

create table if not exists public.propuesta_vistas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,                    -- 'adidas-colombia'
  token       text,                             -- el ?t= del enlace: identifica al destinatario
  evento      text not null,                    -- 'abrir' | 'avance' | 'cierre' | 'descarga'
  seccion     text,                             -- sección más profunda vista
  seccion_n   smallint,                         -- su número de orden, para ordenar y comparar
  segundos    integer,                          -- tiempo acumulado al enviar el evento
  ua          text,
  pantalla    text,
  creado_en   timestamptz not null default now()
);

create index if not exists propuesta_vistas_slug_idx  on public.propuesta_vistas (slug, creado_en desc);
create index if not exists propuesta_vistas_token_idx on public.propuesta_vistas (slug, token);

alter table public.propuesta_vistas enable row level security;

-- La propuesta (clave anon) solo puede insertar.
drop policy if exists propuesta_vistas_insert_anon on public.propuesta_vistas;
create policy propuesta_vistas_insert_anon
  on public.propuesta_vistas for insert
  to anon, authenticated
  with check (
    evento in ('abrir','avance','cierre','descarga')
    and length(slug) between 1 and 80
    and (token is null or length(token) <= 80)
    and (segundos is null or segundos between 0 and 86400)
  );

-- Leer exige sesión iniciada: es el panel de Iván, no el cliente.
drop policy if exists propuesta_vistas_select_auth on public.propuesta_vistas;
create policy propuesta_vistas_select_auth
  on public.propuesta_vistas for select
  to authenticated
  using (true);

-- Resumen por destinatario: una fila por persona que abrió, con lo que interesa
-- mirar antes de una llamada de negociación.
create or replace view public.propuesta_resumen
with (security_invoker = true) as
select
  slug,
  coalesce(token, 'sin-token')                                     as destinatario,
  count(*) filter (where evento = 'abrir')                         as aperturas,
  min(creado_en)                                                   as primera_vez,
  max(creado_en)                                                   as ultima_vez,
  max(segundos)                                                    as segundos_max,
  max(seccion_n)                                                   as seccion_mas_lejos_n,
  (array_agg(seccion order by seccion_n desc nulls last))[1]       as seccion_mas_lejos,
  count(*) filter (where evento = 'descarga')                      as descargas
from public.propuesta_vistas
group by slug, coalesce(token, 'sin-token');

comment on table public.propuesta_vistas is
  'Aperturas de las propuestas B2B de La Huerta Hotel. Insert abierto (clave anon en la propuesta), select solo con sesión.';

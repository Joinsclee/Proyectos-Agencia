-- Oportunidad ALTA como columna propia.
--
-- El motor ya calculaba is_high (precio/m² en el decil más bajo + descuento
-- fuerte + comparables homogéneos), pero no lo guardaba: la insignia "★ Alta",
-- el filtro "Solo altas" y el contador del dashboard lo deducían de
-- features->market->>confidence, un campo que sólo existe en los inmuebles de
-- banco. En el portal (105K avisos) el filtro devolvía siempre cero y además
-- obligaba a escanear la tabla entera porque un campo JSON no está indexado.

alter table public.inmuebles
  add column if not exists is_high boolean not null default false;

-- Índice parcial: las oportunidades altas son pocas y se piden ordenadas por
-- descuento, así que el índice es diminuto y resuelve la consulta completa.
create index if not exists inmuebles_is_high_idx
  on public.inmuebles (is_high, discount_pct desc)
  where is_high = true;

comment on column public.inmuebles.is_high is
  'Oportunidad de señal fuerte: decil más barato por m², descuento grande y comparables homogéneos. Lo escribe engine/run.ts.';

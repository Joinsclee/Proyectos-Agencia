-- HU "Núcleo del Motor de Comparables" — Índice CRECE persistido.
--
-- Hasta ahora el motor guardaba solo `discount_pct` + dos banderas (is_opportunity,
-- is_high). La tabla maestra tiene 11 categorías, incluidas las de sobreprecio, que
-- esas banderas no podían representar: un inmueble "Sobrevalorado" y uno "Precio de
-- Mercado" eran indistinguibles en la base.
--
-- `crece_index` es el dato primario (precio/m² ÷ mediana de su grupo comparable) y
-- `crece_tier` su categoría ya resuelta, para poder filtrar y ordenar por ella sin
-- recalcular en cada consulta.

alter table public.inmuebles
  add column if not exists crece_index   numeric,
  add column if not exists crece_tier    text,
  add column if not exists cascada_nivel text;

comment on column public.inmuebles.crece_index is
  'Índice CRECE = precio/m² ÷ mediana(precio/m² del grupo comparable FincaRaíz). 0,70 = 30% bajo la mediana de su zona.';
comment on column public.inmuebles.crece_tier is
  'Categoría de la tabla maestra: oportunidad_fuerte | oportunidad | interesante | abajo_mercado | mercado_borde_bajo | mercado | limite_superior | arriba_mercado | sobreprecio | sobrevalorado | fuera_mercado.';
comment on column public.inmuebles.cascada_nivel is
  'Nivel de la cascada con el que se consiguió la muestra: barrio | zona_ampliada | ciudad. Sirve para auditar qué tan confiable es cada clasificación.';

-- Los remates también reciben Índice CRECE (se muestra en la ficha), aunque su
-- acceso gratis/pago lo decide la matriz de origen del demandante, no el índice.
alter table public.remates
  add column if not exists crece_index       numeric,
  add column if not exists crece_tier        text,
  add column if not exists cascada_nivel     text,
  add column if not exists origen_demandante text,
  add column if not exists tipo_proceso      text,
  add column if not exists cuota_parte       numeric not null default 100;

comment on column public.remates.origen_demandante is
  'bancario | particular_otro. Si el aviso no permite determinarlo queda null y se trata como particular_otro (perfil conservador).';
comment on column public.remates.tipo_proceso is
  'ejecutivo_hipotecario | otro. Informativo: se muestra en la ficha pero NO determina si el remate es gratis o de pago.';
comment on column public.remates.cuota_parte is
  'Porcentaje del bien que se remata. 100 = dominio pleno. Cualquier valor distinto dispara la alerta jurídica amarilla.';

-- Índices parciales: las categorías de oportunidad son pocas frente al total y se
-- piden ordenadas por índice ascendente (el más barato primero).
create index if not exists inmuebles_crece_tier_idx
  on public.inmuebles (crece_tier, crece_index)
  where is_active = true and crece_tier is not null;

create index if not exists remates_crece_idx
  on public.remates (crece_tier, crece_index)
  where is_active = true;

-- Alerta jurídica: los remates de cuota-parte son pocos y se consultan aparte.
create index if not exists remates_cuota_parte_idx
  on public.remates (cuota_parte)
  where cuota_parte <> 100;

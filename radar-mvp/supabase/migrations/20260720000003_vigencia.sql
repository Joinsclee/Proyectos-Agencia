-- HU "Control de vigencia y frescura de publicaciones".
--
-- Las tres fechas del modelo ya existían con otro nombre y se conservan (renombrar
-- columnas usadas por scrapers y motor no valía el riesgo):
--   fecha_primera_deteccion → inmuebles.first_seen_at   (dato propio, el confiable)
--   fecha_ultima_vista      → inmuebles.last_seen_at
--   fecha_publicacion_fuente→ se añade aquí (dato del portal, NO autoritativo:
--                             FincaRaíz lo resetea cuando el anunciante renueva
--                             el aviso, así que un inmueble viejo puede aparecer
--                             como recién publicado).

alter table public.inmuebles
  add column if not exists fecha_publicacion_fuente timestamptz,
  add column if not exists estado text not null default 'activo';

comment on column public.inmuebles.fecha_publicacion_fuente is
  'Fecha de actualización que reporta el portal. Informativa: el anunciante puede resetearla renovando el aviso.';
comment on column public.inmuebles.estado is
  'activo | expirado_30d | retirado | descartado_90d. Solo "activo" se muestra en oportunidades.';

alter table public.remates
  add column if not exists estado text not null default 'activo';

-- Historial de eventos del ciclo de vida. Sirve para auditar por qué un inmueble
-- dejó de mostrarse y para reconstruir la frescura sin depender de la fuente.
create table if not exists public.oportunidades_historial (
  id            uuid primary key default gen_random_uuid(),
  country_code  char(2) not null default 'CO',   -- expansión multi-país
  entidad       text not null,                    -- 'inmueble' | 'remate'
  entidad_id    uuid not null,
  source        text,                             -- fincaraiz | davivienda | aval | …
  source_id     text,
  evento        text not null,                    -- NUEVO | VISTO | PRECIO_ACTUALIZADO | RETIRADO | EXPIRADO_30D | DESCARTADO_90D
  precio_antes  numeric,
  precio_despues numeric,
  detalle       text,                             -- ej. identificador del boletín AVAL de origen
  ocurrio_en    timestamptz not null default now()
);

create index if not exists oport_hist_entidad_idx
  on public.oportunidades_historial (entidad, entidad_id, ocurrio_en desc);
create index if not exists oport_hist_evento_idx
  on public.oportunidades_historial (evento, ocurrio_en desc);

comment on table public.oportunidades_historial is
  'Eventos del ciclo de vida de cada oportunidad. La regla de 30 días NO aplica a activos bancarios: su rotación real es de meses y despublicarlos por antigüedad borraría inventario válido.';

-- Solo el inventario en estado activo entra a las vistas de oportunidades.
create index if not exists inmuebles_estado_idx
  on public.inmuebles (estado, crece_tier)
  where is_active = true;

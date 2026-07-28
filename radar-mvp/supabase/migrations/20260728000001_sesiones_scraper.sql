-- Sesiones autenticadas de los scrapers que necesitan entrar con usuario.
--
-- EL PROBLEMA QUE RESUELVE: el scraper de remates entra con sesión iniciada y la
-- guardaba en `_session/remates-storage.json`, un archivo del disco de quien
-- corría el login. El contenedor del cron es desechable y se construye desde el
-- repositorio, donde ese archivo NO está (ni debe estar: son cookies de sesión,
-- y `.gitignore` las excluye con razón). Resultado: la corrida automática del
-- 2026-07-28 falló con «No hay sesión guardada en /app/_session/...».
--
-- POR QUÉ NO SE RESUELVE DE OTRA FORMA:
--   · Meterla en la imagen — hornea credenciales en capas que se conservan y se
--     copian; además el archivo no está en el contexto de build.
--   · Montarla como volumen — obliga a copiar un archivo al servidor a mano cada
--     vez que expira, y a configurarlo en EasyPanel.
--   · Iniciar sesión dentro del contenedor — imposible: el portal pide un
--     reCAPTCHA que resuelve una persona en una ventana visible.
--
-- LA SOLUCIÓN: la persona hace el login una vez en su equipo (resolviendo el
-- captcha) y la sesión sube aquí. El contenedor la recoge al arrancar el scrape.
-- Sobrevive a despliegues y reinicios sin tocar la configuración del servidor.
--
-- SEGURIDAD: esto son cookies de sesión de un portal de terceros. La tabla queda
-- con RLS activo y SIN políticas, así que solo la alcanza la llave de servicio —
-- el mismo nivel de confianza que ya tienen las credenciales del scraper, que
-- viven en variables de entorno del mismo servicio.

create table if not exists public.radar_sesiones_scraper (
  nombre          text primary key,        -- 'rematandobienes'
  storage_state   jsonb not null,          -- cookies + localStorage de Playwright
  actualizado_en  timestamptz not null default now(),
  nota            text                     -- de dónde salió: quién y cuándo
);

comment on table public.radar_sesiones_scraper is
  'Sesiones autenticadas de scrapers. El login es manual (captcha); esto solo la transporta al contenedor.';
comment on column public.radar_sesiones_scraper.actualizado_en is
  'Cuándo se hizo el login. Sirve para saber si conviene renovarla antes de que expire sola.';

alter table public.radar_sesiones_scraper enable row level security;
-- Sin políticas a propósito: RLS activo y ninguna política = nadie entra salvo
-- la llave de servicio, que las omite. Si algún día el frontend usara la llave
-- pública, esta tabla seguiría siendo inalcanzable desde el navegador.

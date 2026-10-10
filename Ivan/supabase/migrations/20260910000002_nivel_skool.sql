-- ============================================================
--  Universo de La Huerta LAB · Nivel de gamificación de Skool
--  (aditiva sobre 20260910000001_skool_membership.sql)
-- ============================================================
--  Qué cambia respecto de la migración anterior, y por qué no se
--  contradice con ella:
--
--  La primera migración cierra diciendo que aquí NO hay niveles. Eso
--  sigue siendo cierto de lo que hablaba: no se portó el gating por
--  PLAN de SAVIAS (`skool_level`), y el plan (`plan_raw`) sigue sin
--  decidir nada. Lo que aparece ahora es otra cosa: el nivel de
--  GAMIFICACIÓN de la comunidad (el 1..9 que sube participando), que
--  Iván sí quiere usar como puerta de entrada al Universo.
--
--  Ese nivel SÍ es legible en el JSON de Skool. Vive en
--  `user.metadata.spData`, que llega como JSON-string:
--      {"pts":0,"lv":1,"pcl":0,"pnl":5,"role":2}
--  OJO: cuelga de `user.metadata` (el PERFIL), no de
--  `user.member.metadata` (la MEMBRESÍA). Son dos objetos distintos y
--  confundirlos es el error fácil — el resto de columnas de
--  `skool_members` sí salen de `user.member.metadata`.
--
--  Distribución MEDIDA hoy sobre los 575 activos de la comunidad:
--      nivel 1 → 455 (79,1 %)   nivel 5 →  14
--      nivel 2 →  56            nivel 6 →   5
--      nivel 3 →  30            nivel 7 →   1  (Iván, group-admin)
--      nivel 4 →  14
--  Con el umbral en 2 entran 120 personas (20,9 %) y quedan fuera 455.
--  A esos 455 les falta exactamente `pnl = 5` puntos. El cliente sabe
--  que deja fuera al 79 % y quiere probarlo igual; bajarlo a 1 tiene
--  que ser cambiar un número y volver a desplegar, nada más — de ahí
--  la función `nivel_minimo_skool()` de más abajo.
--
--  Este archivo es aditivo y no toca 20260910000001, que ya se
--  verificó a fondo contra un Postgres real. Idempotente de punta a
--  punta: se corre sobre una base que ya tiene la primera aplicada.
-- ============================================================


-- ============================================================
--  1) Las tres columnas del nivel en skool_members
-- ============================================================
--  Las tres salen del MISMO JSON-string (`user.metadata.spData`), así
--  que o llegan las tres o no llega ninguna. Se guardan las tres —y no
--  solo `lv`— porque el mensaje que ve quien no alcanza el umbral dice
--  cuántos puntos le faltan, y ese número (`pnl`) no se puede deducir
--  del nivel: depende de la escala de puntos de cada comunidad.
alter table public.skool_members add column if not exists level          int;
alter table public.skool_members add column if not exists points         int;
alter table public.skool_members add column if not exists points_to_next int;

comment on column public.skool_members.level is
  'Nivel de gamificación de Skool, 1..9 (campo `lv` de user.metadata.spData, que llega como JSON-string). NULL = no se pudo leer el spData de esa persona; NULL NO da acceso (ver skool_member_has_access).';
comment on column public.skool_members.points is
  'Puntos totales acumulados en la comunidad (campo `pts` de user.metadata.spData). Informativo: no decide el acceso, el que decide es `level`.';
comment on column public.skool_members.points_to_next is
  'Puntos que le faltan para el SIGUIENTE nivel (campo `pnl` de user.metadata.spData). Medido: los 455 de nivel 1 traen pnl = 5. Es el número que el HTML muestra en «te faltan N puntos», por eso se persiste y no se recalcula.';

--  A propósito SIN check de rango (1..9) ni de `points >= 0`. Los tres
--  valores los elige Skool, no nosotros, y en esta misma tabla ya hubo
--  que retirar el CHECK cerrado de `role`: bastó que Skool devolviera
--  un valor fuera de la lista prevista ('declined') para que el upsert
--  por lotes del sync devolviera 400, la corrida entera muriera con 500
--  y no se escribiera NI UNA fila. Un valor nuevo de un tercero no puede
--  volver a tumbar la sincronización completa. Si algún día hay que
--  validar, se valida en el sync, que sabe abortar sin destruir la caché.

-- Índice para sacar la distribución por nivel (la tabla de arriba) sin
-- recorrer las 575+ filas: `select level, count(*) ... group by level`
-- se resuelve con index-only scan. También sirve para «¿a cuántos deja
-- fuera el umbral?», que es la pregunta que el cliente va a repetir
-- cada vez que se plantee bajarlo a 1.
create index if not exists skool_members_level_idx
  on public.skool_members (level);


-- ============================================================
--  2) nivel_minimo_skool() — LA constante del umbral
-- ============================================================
--  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
--  ESTE ES EL NÚMERO QUE SE CAMBIA. Aquí, y su gemelo NIVEL_MINIMO
--  en supabase/functions/skool-login/index.ts. En ningún otro sitio.
--  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
--
--  Se hace función y no un literal repetido dentro del helper porque el
--  umbral se va a mover: el cliente ya avisó que con 2 deja fuera al
--  79 % y que quiere probarlo igual. Un literal suelto se cambia en un
--  sitio y se olvida en el otro; una función se cambia una vez:
--
--      create or replace function public.nivel_minimo_skool() ...
--      as $$ select 1 $$;      -- y volver a desplegar skool-login
--
--  IMMUTABLE para que el planificador la inline y no cueste nada dentro
--  del helper, que se llama en cada intento de entrada.
create or replace function public.nivel_minimo_skool()
returns int
language sql
immutable
as $$
  select 2;   -- ← NIVEL MÍNIMO PARA ENTRAR AL UNIVERSO (medido: deja dentro a 120 de 575, el 20,9 %)
$$;

comment on function public.nivel_minimo_skool() is
  'Nivel mínimo de gamificación de Skool para entrar al Universo. Hoy 2. Es la ÚNICA fuente del umbral en la base de datos; su gemelo vive en la constante NIVEL_MINIMO de la edge function skool-login. Cambiar los dos a la vez.';

-- Mismo criterio de hermetismo que el resto de funciones del proyecto:
-- PostgREST publica como RPC todo lo que viva en `public`, y la anon key
-- va en claro dentro del HTML que se pega en GoHighLevel. Esta en concreto
-- solo filtraría el umbral (poca cosa), pero no hay razón para publicarla.
-- El helper de abajo la llama desde dentro de un `security definer`, así que
-- se ejecuta como el dueño y no necesita este grant para funcionar.
revoke all on function public.nivel_minimo_skool() from public, anon, authenticated;
grant execute on function public.nivel_minimo_skool() to service_role;


-- ============================================================
--  3) skool_member_has_access — ahora también exige nivel
-- ============================================================
--  Regla completa, tal como queda:
--
--    entra  ⇔  está en allowed_emails                       (puerta de atrás)
--          ∨  ( acceso vigente en la comunidad
--               ∧ level >= nivel_minimo_skool() )
--
--  Dos cambios respecto de la versión de 20260910000001, y los dos
--  cambian la semántica de la función — leerlos antes de usarla:
--
--  (a) AHORA SÍ MIRA `allowed_emails`. Antes no, y su comentario lo
--      decía. Tenía que cambiar: la puerta de atrás es lo único que deja
--      entrar a quien el umbral deja fuera, y hay dos casos reales hoy
--      mismo. Iván Castrillón (nivel 7, group-admin) es el ÚNICO de los
--      575 del que Skool no expone correo por ninguna vía, así que ni
--      siquiera llega a `skool_members`; y Camilo Osorio es admin y está
--      en nivel 1, o sea que el umbral lo echaría de su propia
--      herramienta. La puerta de atrás se salta el nivel a propósito.
--
--  (b) `level IS NULL` NO da acceso. Es cerrar en caso de duda, y tiene
--      un riesgo que conviene tener presente: si Skool cambia el formato
--      de `spData`, el sync escribiría NULL para todo el mundo y esta
--      función cerraría la puerta a la comunidad entera de golpe. Por eso
--      el sync tiene la alerta `schema_changed` en `sync_alerts` y por eso
--      la puerta de atrás de (a) no depende del nivel: es la salida de
--      emergencia si eso pasa un domingo.
--
--  Lo demás no se toca, y sigue valiendo lo aprendido en el pase anterior:
--  'cancelling' CONSERVA el acceso, y `access_until` (el `mbscpe` de Skool)
--  solo es fin de acceso en quien canceló — en quien está al día es la
--  PRÓXIMA FECHA DE COBRO, y denegar por ella echaría cada mes a gente que
--  acaba de pagar durante la ventana de hasta 6 h que va del cobro al
--  siguiente sync.
--
--  Esta regla es la MISMA que aplica `skool-login` en TypeScript. Si cambia
--  una, cambian las dos, o la caché y el login empiezan a discrepar.
create or replace function public.skool_member_has_access(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (a) puerta de atrás: entra sin mirar nivel ni membresía
    exists (
      select 1
      from public.allowed_emails a
      where a.email = lower(trim(p_email))
    )
    or
    -- (b) miembro con acceso vigente Y con nivel suficiente
    exists (
      select 1
      from public.skool_members m
      where m.email = lower(trim(p_email))
        and m.churned_at is null          -- se dio de baja
        and m.banned_at  is null          -- lo expulsaron
        and not (
          (m.billing_canceled or m.status = 'cancelling')
          and m.access_until is not null
          and m.access_until <= now()
        )
        -- El `is not null` es redundante (NULL >= 2 ya da NULL y la fila
        -- no cuenta), pero se deja escrito para que quede claro que
        -- «no pudimos leer el nivel» deniega, y que no es un descuido.
        and m.level is not null
        and m.level >= public.nivel_minimo_skool()
    );
$$;

comment on function public.skool_member_has_access(text) is
  'true si el correo puede entrar al Universo: está en allowed_emails (puerta de atrás, se salta el nivel), o es miembro con acceso vigente Y level >= nivel_minimo_skool() (hoy 2). Quien está en cancelling sigue dando true hasta access_until; en quien NO canceló, access_until es la fecha de renovación y no revoca. level NULL deniega.';

-- `create or replace` conserva la ACL de la función que ya existía, pero
-- estos dos se vuelven a emitir a propósito: si alguien alguna vez la
-- DROPEA y la recrea (o si esta migración corre sobre una base donde la
-- primera se aplicó a medias), la función nace con EXECUTE para PUBLIC y
-- PostgREST la sirve en /rest/v1/rpc/skool_member_has_access. Es
-- `security definer` y atraviesa la RLS de `skool_members`: cualquiera con
-- la anon key —que va en claro dentro del HTML de GoHighLevel— la usaría de
-- oráculo para preguntar correo por correo quién paga la comunidad y en qué
-- nivel va. La RLS de la tabla no lo impide; el permiso de ejecución, sí.
revoke all on function public.skool_member_has_access(text) from public, anon, authenticated;
grant execute on function public.skool_member_has_access(text) to service_role;


-- ============================================================
--  4) Siembra de allowed_emails
-- ============================================================
--  La primera migración dejó la tabla vacía a propósito (en SAVIAS los
--  correos de ejemplo se quedaron como filas placeholder de verdad).
--  Esta fila NO es un ejemplo: es el único caso que el umbral rompe hoy
--  y del que además Skool no da el correo.
--
--  ⚠ `gerente@lahuertahotel.com.co` es un CANDIDATO al correo de Iván,
--  no un dato confirmado. Iván es el group-admin de la comunidad y el
--  único de los 575 sin correo en el JSON (ni `mbme`, ni `user.email`,
--  ni `inviteEmail`, ni `searchAnswer`, ni la encuesta), así que sin
--  esta fila el dueño no puede entrar a su propio Universo. HAY QUE
--  CONFIRMARLO CON EL CLIENTE. Si el correo real es otro, se añade el
--  bueno y se borra este.
--
--  Y falta añadir aquí a los admins que queden por debajo del umbral:
--  Camilo Osorio (admin, nivel 1) es el caso conocido, y cualquier
--  invitado o cortesía que Iván quiera dar a mano. Molde, en minúsculas:
--
--    insert into public.allowed_emails (email, first_name, note) values
--      ('correo@real.com', 'Camilo', 'admin de la comunidad, nivel 1')
--    on conflict (email) do nothing;
--
--  `on conflict do nothing` para que re-correr la migración no pise una
--  nota o un nombre que se hayan editado a mano después.
insert into public.allowed_emails (email, first_name, note) values
  ('gerente@lahuertahotel.com.co', 'Iván',
   'group-admin de La Huerta LAB. Skool no expone su correo por ninguna vía (único de 575). CORREO SIN CONFIRMAR: verificar con el cliente.')
on conflict (email) do nothing;


-- ============================================================
--  Lo que NO hace este archivo, a propósito
-- ============================================================
--  · No añade `level` a `profiles`. El nivel es un dato VOLÁTIL de
--    Skool: sube en cuanto la persona participa, y la única copia que
--    debe existir es la de `skool_members`, que el cron refresca cada
--    6 h. Duplicarlo en el perfil crea dos verdades y la del perfil
--    envejece hasta el siguiente login.
--
--  · No rellena las tres columnas nuevas. Nacen en NULL para las filas
--    que ya estén en la tabla, y eso significa que HASTA QUE NO CORRA
--    `sync-skool-members` CON LA VERSIÓN QUE LEE spData, este helper
--    deniega a todo el mundo salvo a `allowed_emails`. Es el orden de
--    despliegue: primero la función de sync, luego una corrida completa,
--    y solo entonces tiene sentido mirar quién entra.
--
--  · No decide nada en la UI. El HTTP 403 con
--    `{ reason:'level_too_low', level, points_to_next }` y el bloque
--    «Todavía no, pero te falta poquito» los produce `skool-login`; los
--    números salen de estas tres columnas, nunca quemados en el HTML.
-- ============================================================

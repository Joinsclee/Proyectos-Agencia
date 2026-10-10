# Despliegue — La Huerta LAB (Supabase `bevduxusxfwmgtudytax`)

Notas de campo para poner en pie el login por Skool del Universo de herramientas.
Orden estricto: cada paso asume el anterior. Todos los comandos se corren desde
`/Users/cristhian/Downloads/Paginas Web/Ivan` (la carpeta que contiene `supabase/`).

Este documento **no lleva ningún secreto**: solo nombres de variables. Los valores
viven en `supabase/.env.secrets`, que el `.gitignore` de Ivan ya tapa
(`git check-ignore -v supabase/.env.secrets` responde `Ivan/.gitignore:7:*secret*`).

---

## 0. Hoy nadie puede desplegar: falta `supabase login`

Medido en esta máquina el 2026-09-10:

- El CLI está instalado: `supabase --version` → **2.84.2** (hay 2.117.0 disponible).
- **No hay `SUPABASE_ACCESS_TOKEN` en el entorno** ni token en `~/.supabase/`.
- Sí hay una sesión guardada en el llavero de macOS (entrada «Supabase CLI»),
  **pero es de otra cuenta**: `supabase projects list` solo muestra
  `cojwzekyeehqtxdvoldj` (el de Lina) y `eczdwkiqmqncbknmadyu`.
- Contra el proyecto de La Huerta LAB responde **403**:
  `supabase projects api-keys --project-ref bevduxusxfwmgtudytax` →
  `Your account does not have the necessary privileges…`

O sea: el CLI funciona, pero está autenticado con quien **no** es dueño de
`bevduxusxfwmgtudytax`. Hasta que no se haga login con la cuenta correcta (la de
Iván, o una a la que él haya invitado como owner de la organización), todo lo de
abajo falla en el paso 2.

```bash
# Abre el navegador y pega el código que muestra la terminal.
# OJO: hay que entrar con la cuenta dueña de bevduxusxfwmgtudytax, no con la de Lina.
supabase login

# Comprobación de que quedó la cuenta correcta: el ref tiene que aparecer en la lista.
supabase projects list | grep bevduxusxfwmgtudytax
```

Alternativa sin navegador (CI, o máquina ajena): generar un Personal Access Token
en la cuenta correcta y exportarlo solo en esa terminal — nunca en un archivo del repo:

```bash
export SUPABASE_ACCESS_TOKEN='sbp_...'   # sale del dashboard > Account > Access Tokens
```

> Por qué importa el detalle de «otra cuenta»: si se hace `link` estando
> autenticado con la cuenta de Lina, el error es un 403 seco que se lee como
> «el ref está mal». No está mal el ref; está mal la sesión.

---

## 1. Preparar la carpeta (`supabase init`)

Hoy `supabase/` tiene `functions/` y `migrations/` pero **no tiene `config.toml`**,
y `supabase link` lo necesita.

```bash
cd "/Users/cristhian/Downloads/Paginas Web/Ivan"
supabase init      # solo crea supabase/config.toml y su .gitignore
```

`init` no toca `functions/` ni `migrations/`. Si contesta que el archivo ya existe,
salta este paso: alguien lo corrió antes.

Antes de seguir, verifica que están las tres funciones y las migraciones
(si falta alguna, el despliegue queda a medias y el login no existe):

```bash
ls supabase/functions        # esperado: chat-huerta  skool-login  sync-skool-members
ls supabase/migrations       # esperado: 20260824000001_chat_huerta.sql + la consolidada de Skool
```

---

## 2. Enlazar el proyecto

```bash
source supabase/.env.secrets                        # trae SUPABASE_PROJECT_REF
supabase link --project-ref "$SUPABASE_PROJECT_REF" # = bevduxusxfwmgtudytax
```

Pide la contraseña de la base de datos (la del proyecto, dashboard >
Settings > Database). Si no la tienes, se puede resetear ahí mismo; resetearla no
rompe nada de lo ya desplegado, pero sí invalida cadenas de conexión guardadas.

Comprobación: `supabase projects list` ahora marca `bevduxusxfwmgtudytax` como `LINKED`.

> El ref se guarda en `supabase/.temp/`, que es local. Nunca se commitea.

---

## 3. Migraciones (`supabase db push`)

```bash
supabase db push --dry-run    # primero mirar QUÉ va a aplicar
supabase db push
```

No hace falta Docker: `db push` se conecta directo a la base remota.

**Gotcha real:** `20260824000001_chat_huerta.sql` puede estar ya aplicada a mano
en el proyecto (las tablas del chat existen) pero **no registrada** en
`supabase_migrations.schema_migrations`. En ese caso `db push` revienta con
`relation "chat_conversations" already exists`. Se marca como aplicada y se repite:

```bash
supabase migration repair --status applied 20260824000001
supabase db push
```

Después de que pase, comprobar a ojo en el SQL editor del dashboard:

```sql
select tablename from pg_tables
 where schemaname = 'public'
 order by tablename;
-- esperado: allowed_emails, chat_conversations, chat_messages,
--           profiles, skool_members, sync_alerts
```

---

## 4. Secrets de las edge functions

```bash
# El CLI rechaza todo nombre que empiece por SUPABASE_ (es namespace reservado:
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta la plataforma sola).
# Como .env.secrets guarda además SUPABASE_PROJECT_REF para el `link`, se manda
# una copia filtrada y se borra enseguida. El `umask 077` no es adorno: esa copia
# lleva el auth_token de Skool y por defecto nacería con permisos 644.
TMP="${TMPDIR:-/tmp/}huerta-secrets.env"
( umask 077; grep -v '^SUPABASE_' supabase/.env.secrets > "$TMP" )
supabase secrets set --env-file "$TMP"
rm -f "$TMP"

# chat-huerta necesita además su clave de OpenAI. No está en .env.secrets porque
# no es de Skool.
#
# NO la escribas en la línea de comandos. En esta máquina zsh no tiene
# HIST_IGNORE_SPACE (comprobado: `setopt | grep histignorespace` no devuelve
# nada), así que el truco del espacio inicial NO funciona y la clave quedaría en
# claro en ~/.zsh_history. Y pasarla como argumento la deja visible en `ps`.
# Se lee sin eco y se manda por archivo, igual que las de Skool:
read -rs OPENAI_KEY                                        # pega la clave y Enter
( umask 077; printf 'OPENAI_API_KEY=%s\n' "$OPENAI_KEY" > "$TMP" )
supabase secrets set --env-file "$TMP"
rm -f "$TMP"; unset OPENAI_KEY

supabase secrets list          # muestra nombres y hashes, nunca valores
```

Lo que tiene que quedar listado:

| Secret | Para qué | Si falta |
|---|---|---|
| `SKOOL_GROUP` | slug del grupo (`la-huerta-lab`) | cae al default del código; verifica que el default NO sea el de SAVIAS |
| `SKOOL_CLIENT_ID` | cookie `client_id` del admin | Skool devuelve la página de login → 503 en el login |
| `SKOOL_AUTH_TOKEN` | cookie `auth_token` del admin | ídem |
| `OPENAI_API_KEY` | asistente «Tierra» | el chat degrada a modo local **en silencio** (parece que Tierra «contesta cortito») |
| `RESEND_API_KEY` | correo de aviso cuando la cookie de Skool muere | opcional, pero sin él **no hay aviso**: el único rastro queda en `sync_alerts` (ver paso 8) |
| `ADMIN_EMAIL` | a quién se le avisa | ídem — sin destinatario no se manda nada |
| `FROM_EMAIL` | remitente del aviso | cae a `onboarding@resend.dev`, el remitente de pruebas de Resend: **solo entrega al dueño de la cuenta de Resend**. Si `ADMIN_EMAIL` es otro buzón, el aviso se pierde |

Los tres últimos (`RESEND_API_KEY`, `ADMIN_EMAIL`, `FROM_EMAIL`) son opcionales
solo en el sentido de que el sistema arranca sin ellos. Si no se ponen, el día
que caduque el token de Skool nadie se entera hasta que alguien mire la tabla a
mano.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **no se declaran**: la plataforma las
inyecta y el CLI las rechaza si intentas ponerlas.

---

## 5. Desplegar las funciones

Una por una, **nunca** `supabase functions deploy` a secas: sin nombre despliega
todas con los mismos flags, y `--no-verify-jwt` se contagiaría a las otras dos.

```bash
# Se invoca desde el navegador con la anon key, por eso no verifica JWT.
supabase functions deploy skool-login --no-verify-jwt

# Server-a-server: solo la llaman el cron y tú a mano, con la service_role.
# (No hay ningún trigger de signup que la invoque: handle_new_user solo crea
#  el perfil.) JWT normal, sin --no-verify-jwt.
supabase functions deploy sync-skool-members

# Ya existía; solo si cambió. También con JWT normal: la llama un usuario con sesión.
supabase functions deploy chat-huerta
```

Comprobar: `supabase functions list` → las tres en estado `ACTIVE`, y `skool-login`
con verificación de JWT desactivada.

---

## 6. Cron cada 6 h + **primer sync manual (obligatorio)**

### 6.1 Los secretos de vault (si faltan, el cron no hace nada y no avisa)

El job del cron construye la URL con `vault.decrypted_secrets`. Ninguna
migración crea esos secretos. Si no existen, la concatenación da `NULL` y **el
cron corre y no llama a nadie, sin error visible**. En el SQL editor del
dashboard (así la service_role no pasa por la terminal ni por el historial):

```sql
select vault.create_secret('https://bevduxusxfwmgtudytax.supabase.co', 'project_url');
select vault.create_secret('<service_role_key del proyecto>', 'service_role_key');

-- Verificación: mira solo los NOMBRES, nunca el valor descifrado en pantalla compartida.
select name, created_at from vault.decrypted_secrets order by name;
```

`create_secret` **no es idempotente**: si el nombre ya existe responde
`duplicate key value violates unique constraint`. Para repetir el paso — por
ejemplo tras rotar la service_role — se actualiza en vez de crear:

```sql
select vault.update_secret(id, '<valor nuevo>')
  from vault.secrets
 where name = 'service_role_key';
```

> El trigger de alta (`handle_new_user`) **no** usa vault ni pg_net: solo
> inserta el perfil. El sync dirigido por `pg_net` que tenía el Universo de Lina
> se quitó a propósito al portar el esquema, porque `skool-login` ya verificó la
> membresía justo antes de crear el usuario. Estos secretos son solo del cron.

### 6.2 El job — hay que crearlo a mano

**La migración NO programa el cron.** El bloque vive al final de
`20260910000001_skool_membership.sql`, dentro del comentario «Lo que NO hace
este archivo, a propósito», precisamente porque sin los secretos del 6.1 el job
se crearía roto y mudo. Después de 6.1, pega esto entero en el SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('sync-skool-members-6h')
where exists (select 1 from cron.job where jobname = 'sync-skool-members-6h');

select cron.schedule('sync-skool-members-6h', '0 */6 * * *', $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-skool-members',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$cron$);
```

Y **recién entonces** verifica:

```sql
select jobid, jobname, schedule, active from cron.job;
-- esperado: sync-skool-members-6h | 0 */6 * * * | t
```

Si `cron.job` sigue vacío, `pg_cron` no está habilitado en el proyecto:
actívalo en Database > Extensions y repite el bloque.

### 6.3 Primer sync a mano — no es opcional

`public.skool_members` **nace vacía**. Hasta el primer sync, cada intento de login
es un cache-miss: `skool-login` se va al fallback en vivo y pagina Skool dentro de
la request (571 activos = hasta 20 llamadas HTTP seguidas). Eso son varios segundos
por persona, y el primer día es cuando todo el mundo entra a la vez. Y el cron no
corre hasta la siguiente hora en punto múltiplo de 6.

```bash
# La service_role solo vive en esta variable de shell, y solo en esta terminal.
read -rs SERVICE_ROLE   # pega la clave y Enter; no se ve ni queda en el historial
FN='https://bevduxusxfwmgtudytax.supabase.co/functions/v1/sync-skool-members'

# (a) PRIMERO en seco. `diagnostic` trae solo la página 1 de cada pestaña, te
#     enseña los conteos que reporta Skool y las claves reales del JSON, y NO
#     escribe una sola fila. Si la cookie está muerta o Skool movió el esquema,
#     te enteras aquí y no con media tabla ya sobrescrita.
curl -s -X POST "$FN" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{"diagnostic": true}'
# Espera ver conteos_reportados ≈ 571 / 9 / 98 / 0. Si salen en `null`, Skool
# movió `renderData` y hay que arreglar la función antes de seguir.

# (b) Y ahora sí, el sync de verdad.
curl -s -X POST "$FN" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{}'

unset SERVICE_ROLE
```

Y se comprueba contra los conteos que ya medimos en la API de Skool
(571 activos, 9 cancelando, 98 dados de baja, 0 expulsados, 4 admins):

```sql
select count(*) filter (where churned_at is null and banned_at is null) as con_acceso,
       count(*) filter (where churned_at is not null)                   as dados_de_baja,
       count(*) filter (where banned_at  is not null)                   as expulsados,
       count(*)                                                          as filas
  from public.skool_members;

-- Si algo salió raro, el motivo está aquí, no en la respuesta del curl:
select kind, message, created_at, payload
  from public.sync_alerts
 order by created_at desc
 limit 5;
```

Lo que tiene que salir, con los conteos medidos en la API de Skool el 2026-09-10:

| Columna | Esperado | De dónde sale |
|---|---|---|
| `con_acceso` | ≈ 571 | los activos — **incluye** a los 9 de `cancelling`, que conservan el acceso hasta `access_until` |
| `dados_de_baja` | ≈ 98 | pestaña `churned` |
| `expulsados` | 0 | pestaña `banned` |
| `filas` | **≈ 670-680** | las cuatro pestañas juntas, deduplicadas por correo |

Cuidado con `filas`: **no** son 580. Ese número sería 571 + 9 y deja fuera a los
98 dados de baja, que el sync SÍ guarda — los necesita, porque `churned_at` es
justo el campo que les quita el acceso. Si `filas` ronda 580, la pestaña
`churned` no se escaneó, y ese fallo se paga caro a partir de la segunda corrida:
quien ya estaba en la tabla como activo se queda con `churned_at` en `NULL` para
siempre y `skool_member_has_access` le sigue diciendo que sí. En un grupo de pago
eso es acceso gratis indefinido.

Si `filas` sale 0, o por debajo de ~600, o `dados_de_baja` sale 0, **no sigas**:
mira el alert. Un escaneo que se corta a la mitad es peor que ninguno, porque la
caché queda mintiendo.

Los dos **409** que puede devolver el sync, y qué significan:

| `reason` | Qué pasó | Qué hacer |
|---|---|---|
| `partial_scan` | leyó menos activos de los que Skool reporta | **no se escribió nada**. Reintentar; si se repite, Skool está paginando raro o la cookie va a medias |
| `canary_abort` | los activos cayeron en picado frente al último `run` bueno | mirar si la caída es real. Si lo es (Iván purgó el grupo), repetir con `-d '{"force": true}'` |

El canario solo salta si ya hubo una corrida buena antes, así que **el primer
sync nunca se bloquea por él**. `force` no hace falta hoy; se necesita el día que
la comunidad encoja de verdad.

---

## 7. Comprobar que el login quedó bien

Necesitas la **anon key** (dashboard > Settings > API, o
`supabase projects api-keys --project-ref bevduxusxfwmgtudytax`). Es la única clave
que además va dentro de `universo-huerta-lab.html` (líneas 1190-1191). La
service_role no entra ahí jamás.

```bash
ANON='eyJ...'                # anon, NO service_role
FN='https://bevduxusxfwmgtudytax.supabase.co/functions/v1/skool-login'

# (a) Correo que SÍ está en la comunidad -> 200
curl -s -i -X POST "$FN" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"ivan@ejemplo-real-de-la-comunidad.com"}'

# (b) Correo que NO está -> 403
curl -s -i -X POST "$FN" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"nadie-1234@ejemplo.com"}'
```

Lo que tiene que salir:

| Caso | HTTP | Cuerpo |
|---|---|---|
| Miembro con acceso vigente | 200 | `{"ok":true,"token_hash":"…","email":"…","first_name":"…"}` |
| No miembro / baja / expulsado | 403 | `{"ok":false,"reason":"not_member"}` |
| Correo mal escrito | 400 | `{"ok":false,"reason":"invalid_email"}` |
| Skool caído o cookie muerta | 503 | `{"ok":false,"reason":"verification_unavailable"}` |

Dos avisos sobre el caso (a):

- El `token_hash` que devuelve **es una sesión**: quien lo tenga entra como esa
  persona hasta que lo use o caduque (1 h por defecto). No lo pegues en un chat, no
  lo dejes en el scrollback, no lo guardes en ningún archivo.
- Es de **un solo uso**. Si lo canjeas tú probando, la dueña del correo tendrá que
  pedir otro (basta con que entre de nuevo). Prueba (a) con un correo tuyo que esté
  en la comunidad, no con el de una clienta.

Prueba de humo del ciclo completo, ya en el navegador: abrir el widget de GHL,
poner el correo, y confirmar que entra a `#view-app` **con sesión de Supabase real**
(si el chat de Tierra responde tirando del backend, la sesión existe; si responde
en modo local, algo falló en el `verifyOtp`).

---

## 8. El JWT de Skool caduca — cuándo, y cómo se ve

El `SKOOL_AUTH_TOKEN` que se está guardando lleva `exp = 1820612986`, o sea:

> **Caduca el 10 de septiembre de 2027, 16:49 (hora Colombia)** — 21:49 UTC.
> Se emitió el 10 de septiembre de 2026: dura un año exacto.

Ese `exp` es el **techo**, no una garantía. La cookie muere antes si Iván cierra
sesión en Skool, cambia la contraseña o revoca sesiones. Da por hecho que
cualquier día puede aparecer muerta.

**Qué se ve cuando muere:** Skool deja de devolver JSON y devuelve el **HTML de su
página de login** con un 200. No es un error HTTP, así que hay que detectarlo por el
contenido — y por eso las funciones miran si la URL final tiene `/login` o si el
HTML dice «sign in». A partir de ahí:

- `skool-login` responde **503 `verification_unavailable`** a todo el mundo que no
  esté ya en la caché (los que sí están siguen entrando: por eso el paso 6.3 importa).
- `sync-skool-members` responde **401**, registra un alert `cookie_expired` y manda
  el correo de aviso (máximo uno cada 24 h). Si `RESEND_API_KEY`/`ADMIN_EMAIL` no
  están puestos, **no hay correo**: el único rastro es la fila en `sync_alerts`.
- La caché deja de actualizarse: quien se dé de baja conserva el acceso hasta que
  se arregle. En un grupo de pago eso es acceso gratis.

Chequeo rápido de si es esto y no otra cosa:

```sql
select kind, message, created_at, notified
  from public.sync_alerts
 where kind = 'cookie_expired'
 order by created_at desc
 limit 3;
```

**Renovar (5 minutos):**

1. Entrar a `https://www.skool.com/la-huerta-lab` con la cuenta admin de Iván.
2. DevTools > Application > Cookies > `https://www.skool.com`.
3. Copiar los valores de `auth_token` y `client_id`.
4. Pegarlos en `supabase/.env.secrets` (`SKOOL_AUTH_TOKEN`, `SKOOL_CLIENT_ID`).
5. Volver a correr el paso 4 (el `grep -v` + `secrets set --env-file`).
6. Redesplegar las dos funciones de Skool, para no depender de cuándo recicla la
   plataforma el proceso:
   `supabase functions deploy skool-login --no-verify-jwt && supabase functions deploy sync-skool-members`
7. Repetir el sync manual del paso 6.3 y comprobar que los conteos vuelven.

Y ponlo en el calendario: **agosto de 2027**, recordatorio para renovar el token
antes del 10 de septiembre. Es la única pieza del sistema con fecha de muerte conocida.

---

## Checklist de cierre

- [ ] `supabase projects list` muestra `bevduxusxfwmgtudytax` como `LINKED`
- [ ] `db push` sin pendientes (`supabase migration list` alineado)
- [ ] `supabase secrets list` con `SKOOL_GROUP`, `SKOOL_CLIENT_ID`, `SKOOL_AUTH_TOKEN`, `OPENAI_API_KEY`
      (y `RESEND_API_KEY` + `ADMIN_EMAIL` si se quiere el aviso de cookie caducada)
- [ ] Las tres funciones `ACTIVE`; solo `skool-login` sin verificación de JWT
- [ ] `vault.decrypted_secrets` con `project_url` y `service_role_key`
- [ ] `cron.job` con `sync-skool-members-6h` activo
- [ ] `{"diagnostic": true}` devolvió los cuatro conteos (571 / 9 / 98 / 0)
- [ ] Primer sync corrido: `skool_members` con ≈ 670-680 filas (≈ 571 con acceso + ≈ 98 dados de baja)
- [ ] `skool-login` responde 200 a un miembro y 403 a un desconocido
- [ ] `universo-huerta-lab.html` con la **anon** key (líneas 1190-1191) y ninguna otra clave
- [ ] Recordatorio de agosto de 2027 para el token de Skool

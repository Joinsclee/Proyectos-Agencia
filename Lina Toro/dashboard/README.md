# Universo Lina Toro · Dashboard Privado

**1 archivo HTML** (`universo-lina.html`) que se pega en GHL. Incluye login/registro, dashboard con 7 herramientas, **chat IA con Lina** (RAG sobre Google Drive vía n8n) y botón a la comunidad de Skool.

## Lo único que va a GHL

➡ **[universo-lina.html](universo-lina.html)** — autocontenido.

## Arquitectura final

```
GHL (universo-lina.html)
   │
   ├──► Supabase Auth (login/registro/recuperación)
   │
   ├──► Edge Function: send-welcome-email   → Resend
   │
   └──► Edge Function: chat-lina (RAG)
              │
              ├──► OpenAI (embeddings + gpt-4o-mini)
              └──► Supabase pgvector (tabla "documents", función "match_documents")
                       ▲
                       │ inserts en tiempo real
              ┌────────┴─────────┐
              │ n8n workflow      │
              │ "SAVIAS · Sync"   │ ◄── Google Drive (trigger por archivo nuevo/actualizado)
              └──────────────────┘
```

**El sync corre en n8n self-hosted, no en Supabase Edge Functions** (tienen muy poca memoria para vectorización masiva).

---

## Setup completo (una vez)

### 1) Supabase · Auth settings

Panel web → **Authentication → Providers → Email:**
- ✅ Enable Email provider: ON
- ❌ Confirm email: OFF

**Authentication → URL Configuration:**
- Site URL y Redirect URLs: la URL final donde vive el HTML en GHL

### 2) Supabase · Correr el SQL

SQL Editor → pegar y correr **una vez**: [`supabase/migrations/20260425_chat_lina_v2.sql`](supabase/migrations/20260425_chat_lina_v2.sql)

Crea: `documents` (vector store), `document_metadata`, `match_documents()`, tablas de chat, RLS. **Reemplaza** la migración anterior (limpia las tablas viejas `kb_*` automáticamente).

### 3) Supabase · Secrets para Edge Functions

```bash
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set FROM_EMAIL="Lina Toro <noreply@joinsclee.com>"
supabase secrets set DASHBOARD_URL="https://savias.club/dashboard-page"
supabase secrets set OPENAI_API_KEY="sk-proj-..."
supabase secrets set SKOOL_URL="https://www.skool.com/savias-8385"
```

### 4) Supabase · Desplegar Edge Functions

```bash
cd "Lina Toro/dashboard"
supabase functions deploy send-welcome-email --no-verify-jwt
supabase functions deploy chat-lina --no-verify-jwt
supabase functions deploy sync-skool-members --no-verify-jwt
supabase functions deploy skool-login --no-verify-jwt
```

> La Edge Function `sync-knowledge` quedó deprecada (no cabía en el free tier). Puedes eliminarla del panel o ignorarla. n8n la reemplaza.

### 4b) Supabase · Correr la migración del login passwordless

SQL Editor → pegar y correr **una vez**: [`supabase/migrations/20260620_skool_login_passwordless.sql`](supabase/migrations/20260620_skool_login_passwordless.sql)

Crea: `skool_members` (caché de correos de la comunidad) + la función `is_email_skool_member()`. Es lo que permite el login email-only instantáneo (ver sección **Login email-only** abajo).

### 5) Google Drive · Compartir carpeta

Comparte tu carpeta de Drive con tu cuenta de Google que usarás en n8n (la misma que usaste para "Google Drive JoinsClee" o crea una OAuth nueva). Folder actual: `1Xs8L4---3IIEvl2vwszonB7sOANtx1gM`.

### 6) n8n · Configurar workflow

El workflow ya está creado: **"SAVIAS · Sync KB Drive → Supabase"** → ID `rMEZ4mc9ZukowDnA`

URL directa: https://joinsclee-n8n.juno8i.easypanel.host/workflow/rMEZ4mc9ZukowDnA

**Pasos en n8n:**

1. Abre cada uno de estos nodos y asigna las credenciales correspondientes (las creas si no existen):

   | Nodo | Credencial necesaria |
   |---|---|
   | File Created | Google Drive OAuth2 |
   | File Updated | Google Drive OAuth2 |
   | Eliminar Chunks Antiguos | Supabase API (URL + service_role key) |
   | Upsert Metadata | Postgres (host de Supabase, password de DB) |
   | Download File | Google Drive OAuth2 |
   | Embeddings OpenAI | OpenAI API |
   | Subir a Base Vectorial | Supabase API (la misma de arriba) |

2. Verifica que el folder ID en **File Created** y **File Updated** sea `1Xs8L4---3IIEvl2vwszonB7sOANtx1gM`.
3. Activa el workflow (toggle arriba a la derecha).

A partir de aquí, cualquier archivo que crees, edites o elimines en la carpeta de Drive se sincroniza automáticamente (poll cada minuto).

### 7) Pegar el HTML en GHL

Custom HTML → pegar todo `universo-lina.html` → publicar.

---

## Cómo agregar contenido a la knowledge base

1. Sube/edita un archivo en tu carpeta de Drive de Lina (formatos: Google Docs, .md, .txt, .pdf, .xlsx, .csv).
2. n8n lo detecta en menos de 1 minuto.
3. Lo descarga, extrae texto, chunkea (800 chars con overlap 100) y embebe.
4. Lo inserta en la tabla `documents` de Supabase con metadata (file_id, title, url).
5. El chat ya puede usarlo en la siguiente pregunta.

**Si editas un archivo existente**: el workflow primero borra los chunks viejos de ese `file_id` y luego inserta los nuevos.

**Si borras un archivo de Drive**: los chunks quedan huérfanos. Bórralos manualmente con SQL si quieres limpiar:
```sql
delete from documents where metadata->>'file_id' = 'EL_FILE_ID';
delete from document_metadata where id = 'EL_FILE_ID';
```

---

## Costos estimados

| Servicio | Estimado mensual |
|---|---|
| Supabase free tier | $0 |
| n8n self-hosted (ya pagado) | $0 incremental |
| OpenAI embeddings (~100 archivos pequeños) | <$0.50 |
| OpenAI gpt-4o-mini (~500 mensajes) | ~$2-5 |
| Resend (free 100 emails/día) | $0 |
| **Total incremental** | **~$5/mes** |

---

## Regenerar `universo-lina.html`

```bash
cd "Lina Toro/dashboard"
python3 build.py
```

---

## Flujos incluidos

- Login / Registro (welcome email branded vía Resend)
- Login email-only (passwordless por membresía de Skool — ver abajo)
- Recuperar contraseña
- Cambiar contraseña
- Onboarding primera vez (3 pasos)
- Dashboard con 7 herramientas
- Chat con Lina (RAG + streaming, persistencia por usuario)
- Botón Skool

---

## Login email-only (passwordless por membresía Skool)

Pensado para las usuarias mayores y poco técnicas: **no hay contraseña, no hay registro, no hay que clicar ningún link en el correo.**

**Flujo:**

1. La usuaria escribe **solo su correo** y pulsa entrar.
2. El cliente llama a la Edge Function `skool-login` con `{ email }`.
3. `skool-login` verifica que el correo esté en la comunidad Skool de Savias:
   - **Cache-first:** busca el email en la tabla `skool_members` (la mantiene el cron de `sync-skool-members` como espejo de la comunidad) → respuesta instantánea.
   - **Live-fallback:** si no está en caché, escanea Skool en vivo (early-termination). Si lo encuentra, lo cachea y lo trata como miembro.
   - Si la cookie de Skool está caída y el email no estaba en caché, devuelve `503 verification_unavailable` (mejor pedir reintento que negar a una miembro legítima).
4. Si es miembro: asegura el usuario de auth (idempotente) + `profiles.is_skool_member=true`, persiste el plan en `profiles.skool_level`, genera un **magic-link token server-side** y devuelve `{ ok:true, token_hash, email, first_name, level }` (`level` = plan de Skool; ver sección "Gating por plan").
5. El cliente hace `supabase.auth.verifyOtp({ type:'magiclink', token_hash })` para obtener la sesión. **La usuaria entra sin clicar nada** (el email del magic-link NO se envía: el token se verifica directo en el navegador).

**Contrato de `skool-login`** (para el frontend):

```
POST /functions/v1/skool-login   (Authorization: Bearer <ANON_KEY>)
Body: { "email": "persona@gmail.com" }

200 → { "ok": true,  "token_hash": "...", "email": "...", "first_name": "..." | null, "level": "premium" | "standard" | ... | null }
400 → { "ok": false, "reason": "invalid_email" }
403 → { "ok": false, "reason": "not_member" }
503 → { "ok": false, "reason": "verification_unavailable" }   // reintentar
500 → { "ok": false, "reason": "server_error" | "server_misconfigured", "detail": "..." }
```

Luego en cliente:

```js
const { token_hash } = await (await fetch(EDGE_URL + '/skool-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  body: JSON.stringify({ email })
})).json();

const { data, error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash });
// data.session ya está activa → entra al dashboard
```

**Requisitos en el panel:** Auth → Email provider **ON**, Confirm email **OFF** (igual que ya está). El magic-link se genera server-side con el service_role y se verifica en cliente; **no se envía ningún email** en este flujo.

> La caché `skool_members` se refresca automáticamente con el cron de `sync-skool-members` (cada 6h). Para precargarla la primera vez, dispara un sync manual:
> ```bash
> curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members -H "Authorization: Bearer $SERVICE_ROLE_KEY"
> ```

---

## Gating por plan de Skool (Standard / Premium / VIP)

El acceso ya no es binario (miembro sí/no). Ahora depende del **plan** que la
usuaria tenga dentro de Skool:

| Plan de Skool | Qué ve en el dashboard |
|---|---|
| **Estándar** (o plan desconocido / sin plan) | Solo **Calculadora de Precios** + **Calculadora de Saponificación**, más el **chat con IA** y el **botón a la comunidad** (esos dos son botones flotantes, siempre visibles). |
| **Premium, VIP** (cualquier plan de `FULL_ACCESS_PLANS`) | **Todas** las herramientas. |

**De dónde sale el plan:** vive en el JSON interno de Skool, en
`member.metadata.mmbp` (un JSON-string); al parsearlo, `.tier` da
`"premium"` / `"vip"` / `"standard"` / … Lo extrae `extractLevel()` (idéntico
en `sync-skool-members` y `skool-login`).

**Flujo del dato:**
- `sync-skool-members` (cron 6h) guarda el plan en `skool_members.level` y en `profiles.skool_level`.
- `skool-login` devuelve `level` al entrar y lo persiste en `profiles.skool_level`.
- El **frontend** (`universo-lina.html`) decide con la constante
  `FULL_ACCESS_PLANS = new Set(['premium','vip'])`: cualquier plan que **no**
  esté ahí (incl. `standard` o `null`) → vista limitada. Al recargar la
  página, el plan se lee de `profiles.skool_level` vía `loadPlan()`.

**Accesos manuales (`allowed_emails`):** llevan una columna `level` (default
`'vip'` → ven todo). Los admins/owners de Skool entran por aquí. **`skool-login`
y el cron/single-user de `sync-skool-members` respetan `allowed_emails`**: el
cron los fija como miembro + su nivel en vez de degradarlos (no aparecen en el
scrape de Skool). Si quieres un acceso manual limitado, pon `level='standard'`
en su fila.

> **Nota de seguridad (importante):** este gating es una **frontera de negocio
> (UX), no un paywall criptográfico**. El HTML de cada herramienta viaja
> embebido en base64 dentro de `universo-lina.html` (arquitectura pre-existente
> del dashboard), así que una usuaria técnica del plan estándar podría extraer
> el HTML de una herramienta Premium aunque la tarjeta esté oculta. No hay fuga
> de datos ni de secretos (las herramientas son calculadoras 100% client-side,
> sin API keys ni service_role). Si en el futuro se quisiera un paywall real,
> las herramientas Premium tendrían que servirse desde un endpoint autenticado
> (Edge Function / Storage con RLS) que valide `profiles.skool_level ∈
> {premium,vip}` para el `auth.uid()` del solicitante, en vez de embeberlas en
> el documento que reciben todas.

### ⚠️ Pasos de despliegue OBLIGATORIOS (en orden)

Las columnas `skool_members.level` y `profiles.skool_level` nacen en `NULL`.
Si no se repueblan, **todas** las usuarias (incluidas Premium/VIP) verían la
vista limitada hasta el siguiente cron. Por eso, tras desplegar:

```bash
# 1) Correr la migración nueva
supabase db push        # aplica 20260702_skool_plan_gating.sql

# 2) Re-desplegar las dos edge functions (ya extraen y devuelven el plan)
supabase functions deploy sync-skool-members --no-verify-jwt
supabase functions deploy skool-login --no-verify-jwt

# 3) (RECOMENDADO) Confirmar los strings reales de cada plan en Skool.
#    Devuelve un sample con los planes ya extraídos, SIN tocar nada:
curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"diagnostic": true}'
#    → mira `distinct_levels_page1`. Si el plan completo NO es "premium"/"vip",
#      ajusta FULL_ACCESS_PLANS en universo-lina.html y vuelve a pegar el HTML en GHL.

# 4) OBLIGATORIO: backfill de planes (sin esto, Premium queda limitada)
curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

Una usuaria con sesión abierta verá su plan corregido en cuanto **recargue**
(lee `profiles.skool_level`, ya repoblado) o vuelva a entrar.

---

## Troubleshooting

| Síntoma | Fix |
|---|---|
| Chat dice "tuve un tropiezo" | Logs en Supabase → Edge Functions → `chat-lina`. Verifica `OPENAI_API_KEY`. |
| Chat no encuentra info de un doc | Ve a la tabla `documents` en Supabase, busca `metadata->>file_id`. Si no está, revisa la última ejecución del workflow en n8n. |
| n8n falla en "Subir a Base Vectorial" | La extensión pgvector debe estar activa y la función `match_documents` existir. Re-corre el SQL. |
| Workflow trigger no dispara | Verifica que la cuenta de Google Drive en n8n tenga acceso a la carpeta. |
| Error 401 en chat | Token expirado. Refresca la página. |
| Welcome email no llega | Logs de `send-welcome-email`. Verifica que `FROM_EMAIL` use dominio verificado en Resend. |

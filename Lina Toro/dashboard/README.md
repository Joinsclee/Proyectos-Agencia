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
```

> La Edge Function `sync-knowledge` quedó deprecada (no cabía en el free tier). Puedes eliminarla del panel o ignorarla. n8n la reemplaza.

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
- Recuperar contraseña
- Cambiar contraseña
- Onboarding primera vez (3 pasos)
- Dashboard con 7 herramientas
- Chat con Lina (RAG + streaming, persistencia por usuario)
- Botón Skool

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

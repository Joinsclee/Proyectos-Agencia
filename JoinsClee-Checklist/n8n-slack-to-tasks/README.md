# Fase 1 · Slack daily → Tareas automáticas

Cuando un miembro del equipo postea su daily en Slack, OpenAI extrae las tareas concretas y las crea automáticamente en la herramienta JoinsClee Checklist, distribuidas por cliente o agencia según corresponda. El bot responde en el hilo con un resumen.

## Arquitectura

```
Slack (#dailys)  ──evento──►  n8n  ──┬──►  OpenAI (extrae tareas JSON)
                                      │           │
                                      │           ▼
                                      └────►  Supabase (INSERT cl_items)
                                                  │
                                                  ▼
                                              Realtime → agencia.html
                                                  │
                                                  ▼
                                        Slack (reply en thread)
```

## Archivos en esta carpeta

| Archivo | Para qué |
|---|---|
| [08_slack_source_fields.sql](08_slack_source_fields.sql) | Migración Supabase: agrega `source`, `slack_message_ts`, etc. a `cl_items` |
| [workflow.json](workflow.json) | Workflow n8n listo para importar |
| [system-prompt.md](system-prompt.md) | Prompt y ejemplos para tuning de OpenAI |

---

## Setup paso a paso (orden estricto)

### Paso 1 — Correr la migración SQL

En el SQL Editor de Supabase, pega y ejecuta el contenido de [08_slack_source_fields.sql](08_slack_source_fields.sql). Es idempotente.

Verás al final:
```
status                          | total_items | items_desde_slack
OK · campos slack agregados     | 247         | 0
```

### Paso 2 — Crear Slack App

1. Andá a [https://api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Nombre: `JoinsClee Daily Bot` · Workspace: el de JoinsClee
3. En el menú lateral:

**a) OAuth & Permissions** → agregar estos **Bot Token Scopes**:
   - `channels:history` — leer mensajes del canal
   - `channels:read` — info del canal
   - `chat:write` — responder en el hilo
   - `users:read` — saber quién posteó
4. Click **Install to Workspace** → autorizar → **copia el `Bot User OAuth Token`** (empieza con `xoxb-...`)

**b) Event Subscriptions** → ON:
   - **Request URL**: la URL del webhook del trigger en n8n (la copiarás en el paso 4)
   - **Subscribe to bot events**: agregar `message.channels`
   - Save

**c) App Home** → habilitar **Messages Tab** (opcional)

### Paso 3 — Crear canal Slack `#dailys` y agregar el bot

1. Crear canal `#dailys` (o el que prefieran)
2. En el canal: `/invite @JoinsClee Daily Bot`
3. **Copiar el ID del canal**: click derecho en el canal → Copy link → te queda algo como `https://joinsclee.slack.com/archives/C09ABC123XY`. El `C09ABC123XY` es el `channel_id`.

### Paso 4 — Importar el workflow en n8n

Asumo **n8n cloud** ([n8n.io](https://n8n.io)). Si es self-hosted, los pasos son idénticos.

1. En n8n: **Workflows** → **Import from File** → seleccionar [workflow.json](workflow.json)
2. El workflow se importa con todos los nodos pero **sin credenciales** (verás avisos rojos).

### Paso 5 — Configurar variables del workspace n8n

En n8n: **Settings** → **Variables** → agregar:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://tfoffkrjizkipzrtsguj.supabase.co` |
| `SUPABASE_SERVICE_KEY` | el service_role key (mismo que usa `agencia.html`) |

⚠ Nunca pegues el service_key en el body del workflow. Solo en variables.

### Paso 6 — Crear credenciales en n8n

**a) Slack API** (para el trigger y el reply):
   - **Credentials → New → Slack API**
   - **Access Token**: el `xoxb-...` del paso 2
   - Test → Save → nombrar `Slack JoinsClee`

**b) OpenAI** (para extracción):
   - Tener una **API key** en [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) (necesita tener saldo: $5 cubren meses)
   - **Credentials → New → OpenAI**
   - **API Key**: pegarla
   - Save → nombrar `OpenAI JoinsClee`

### Paso 7 — Asignar credenciales y canal en los nodos

Abrí el workflow importado y editá:

1. **Slack · Trigger #dailys**:
   - Credentials: `Slack JoinsClee`
   - Channel: pegar el `channel_id` copiado en paso 3
2. **OpenAI · Extraer tareas**: Credentials: `OpenAI JoinsClee`
3. **Slack · responder en hilo (OK)** y **(sin tareas)**: Credentials: `Slack JoinsClee`

### Paso 8 — Activar el workflow

1. Toggle **Active** en la esquina superior derecha → ON
2. n8n te dará la URL del webhook del Slack Trigger. Cópiala.
3. Volvé a la Slack App → **Event Subscriptions** → pegá la URL en **Request URL**
4. Slack hará un challenge automático. Debería verificarse en <2 segundos.
5. Save.

### Paso 9 — Test end-to-end

En Slack, en `#dailys`, postea:

```
Daily: hoy llamo a Paulina para confirmar la propuesta, Elmer monta la landing de SAVIAS para mañana, y yo termino el VSL urgente.
```

En ~10 segundos:
- El bot responde en el hilo: *"✅ Creé 3 tareas desde tu daily: 1 en Paulina Valencia, 1 en SAVIAS, 1 en Agencia"*
- En `agencia.html` aparecen las 3 tareas en tiempo real

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Slack no envía nada al webhook | Bot no está en el canal | `/invite @JoinsClee Daily Bot` |
| Workflow se ejecuta pero crea 0 tareas | El mensaje no empieza con "daily" | El filtro requiere `daily` como primera palabra. Cambiar el nodo IF si querés otro disparador |
| OpenAI devuelve error 401 | API key inválida o sin saldo | Verificar en platform.openai.com |
| Supabase 401 | service_key incorrecta o expirada | Revisar `SUPABASE_SERVICE_KEY` en variables n8n |
| Tareas se crean con `client_id` vacío | El slug del cliente no coincide con `cl_clients.slug` | Editar el cliente en `agencia.html` y poner un slug claro (`paulina-valencia`, no `paulina`) |
| El bot responde a sus propios mensajes en loop | El filtro `is-not-bot` falló | Verificar que el nodo IF tenga la condición `bot_id == ''` |

---

## Mejoras opcionales (para después)

- **Comando slash `/daily`** en lugar de canal dedicado (más explícito)
- **Whisper** para transcribir dailies en audio que llegan a Slack como files
- **Botones interactivos** en el reply del bot: "Confirmar / Editar / Cancelar"
- **Sincronizar al revés**: cuando una tarea pasa a `done` en agencia.html, notificar al canal de Slack
- **Daily diario automático**: cron en n8n que pregunte por el daily a las 9am si nadie lo postó

---

## Lo que necesito de vos para arrancar

Antes de poder activar todo, necesito:

- [ ] **OpenAI API key** (no la pegues acá, la cargás directo en n8n)
- [ ] **n8n workspace** confirmado (cloud o self-hosted)
- [ ] **Acceso de admin al Slack workspace** de JoinsClee para crear la app
- [ ] **Channel ID** del canal donde postearán los dailies

Con eso podés correr los pasos 1-9 vos mismo en ~30 minutos. Si querés te acompaño en vivo.

# Notificar a Slack desde un cron en Supabase Edge Functions (Deno)

**Recomendación corta:** usa un **Incoming Webhook** con `attachments[0].color` + `blocks` dentro, y botones tipo `url` (link). No necesitas backend interactivo, no necesitas Bot Token, no necesitas dependencias en Deno (solo `fetch`). Guarda la URL con `supabase secrets set SLACK_WEBHOOK_URL=...`.

---

## 1. Incoming Webhooks

### Cómo se crea

1. https://api.slack.com/apps → **Create New App** → **From scratch** → nombre + workspace.
2. **Features → Incoming Webhooks** → activa el toggle **Activate Incoming Webhooks**.
3. **Add New Webhook to Workspace** → elige el canal destino → **Allow**.
4. Copias la URL: `https://hooks.slack.com/services/T0000/B0000/xxxxxxxxxxxxxxxxxxxxxxxx`

Notas importantes:

- **Un webhook = un canal fijo.** Los campos `channel`, `username` e `icon_emoji` del payload **ya no funcionan** para apps modernas (solo para las viejas "custom integrations"): "these values will always inherit from the associated Slack app configuration". Si quieres 2 canales (p. ej. `#alertas-savias` y `#ops`), creas **2 webhooks** desde la misma app.
- La URL **es la credencial**. Cualquiera que la tenga puede postear en ese canal. Va en Supabase secrets, nunca en el repo. Para rotarla: borras el webhook en la config de la app y generas otro.
- El endpoint responde `200` con el body de texto plano `ok` (no JSON). En error responde `400/403/404` con un string como `invalid_payload`, `no_text`, `channel_not_found`, `channel_is_archived`, `invalid_token`, `too_many_attachments` (máx. 100 attachments por mensaje).

### Formato del payload

`POST` con `Content-Type: application/json`:

```json
{ "text": "mensaje simple en mrkdwn" }
```

o rico:

```json
{
  "text": "fallback para la notificación push y lectores de pantalla",
  "blocks": [ ... ],
  "attachments": [ { "color": "#E01E5A", "blocks": [ ... ] } ]
}
```

**Siempre manda `text` de nivel superior aunque uses `blocks`**: es lo que aparece en la notificación del móvil, en la lista de canales y en accesibilidad. Sin él, la push dice "This content can't be displayed".

`thread_ts` sí funciona en webhooks (para responder en hilo), pero necesitas el `ts` del mensaje padre — y el webhook **no te devuelve el `ts`**. Ese es el argumento fuerte para `chat.postMessage` (ver §3).

---

## 2. Block Kit: título + lista + botones

### Anatomía del mensaje

| Bloque | Uso | Límites |
|---|---|---|
| `header` | Título grande | `plain_text`, máx. **150** chars |
| `section` | Párrafo / item de lista | `text.text` máx. **3000** chars; `fields` máx. **10** items de **2000** chars c/u |
| `divider` | Separador | — |
| `actions` | Fila de botones | máx. **25** elementos (recomendable ≤5 por estética) |
| `context` | Metadata pequeña y gris | máx. **10** elementos |

- Máx. **50 blocks por mensaje** (100 en modals/Home tab). Con N miembros variable, **trunca a ~20 y agrega "y N más"**, o mete la lista completa en un solo `section` con `\n`.
- `mrkdwn` de Slack ≠ Markdown: negrita `*así*`, itálica `_así_`, código `` `así` ``, tachado `~así~`, links `<https://url|texto>`. **No hay sintaxis de listas** — se simulan con `\n• ` o `\n1. `.
- Botón: `text` máx. **75** chars, `url` máx. **3000**, `action_id` máx. **255**, `value` máx. **2000**, `style` ∈ `primary` (verde) | `danger` (rojo) | ausente (gris).

### ¿Los botones requieren endpoint interactivo? — La respuesta práctica

**No, si usas botones con `url`.** Un botón con `url` es un link: al hacer clic, Slack abre la URL en el navegador. Funciona perfecto en un mensaje enviado por webhook, sin backend.

El matiz que confunde: la doc oficial del button element dice *"If you're using `url`, you'll still receive an interaction payload and will need to send an acknowledgement response"*. Eso aplica **cuando tu app tiene Interactivity activada con un Request URL configurado**. Regla operativa:

- **Interactivity & Shortcuts = OFF** en la config de la app (que es el default si solo activaste Incoming Webhooks) → no hay a dónde entregar el payload, el botón simplemente abre el link, **sin warning ni error para el usuario**. ← *este es tu caso*
- **Interactivity = ON pero el Request URL falla / tarda >3s** → el usuario ve el triangulito de "algo salió mal" **aunque el link haya abierto bien**. Si algún día activas interactividad para otra cosa, necesitarás una Edge Function que responda `200` vacío a todo.

Botones que **sí** exigen backend: los que solo llevan `action_id` + `value` sin `url` (p. ej. un botón real "Revocar ahora" que ejecute la acción). Eso requiere Request URL público, verificación de firma (`x-slack-signature` + `x-slack-request-timestamp`), y ack en <3 segundos. Para el caso de "revocar acceso GHL", **la v1 sensata son links**; el botón accionable es una v2 opcional.

> Alternativa aún más a prueba de balas si te preocupa el warning: no usar `actions` y poner los links en el `section` como `<url|texto>`. Se ve menos, pero es cero superficie de interactividad.

---

## 3. Alternativa: `chat.postMessage` con Bot Token

Setup: misma app → **OAuth & Permissions** → Bot Token Scopes: `chat:write` (+ `chat:write.public` para postear en canales públicos sin invitar al bot) → **Install to Workspace** → token `xoxb-...`. Luego:

```ts
await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`,
  },
  body: JSON.stringify({ channel: 'C0123456789', text, blocks }),
});
```

| | Incoming Webhook | `chat.postMessage` |
|---|---|---|
| Setup | 30 segundos, sin scopes ni instalación OAuth | App instalada + scopes + token |
| Canal | Fijo por webhook | Dinámico (`channel` por request), incluso DM al admin |
| Respuesta | `ok` en texto plano, sin `ts` | JSON con `ok`, `ts`, `channel` → habilita follow-ups |
| Editar/borrar después | ❌ | ✅ `chat.update` / `chat.delete` (ej.: marcar "✅ revocado" sobre el mismo mensaje) |
| Hilos | Solo si ya tienes el `ts` | ✅ natural |
| Efímero / programado | ❌ | ✅ `chat.postEphemeral`, `chat.scheduleMessage` |
| `unfurl_links` / `unfurl_media` | limitado | ✅ control explícito |
| Errores | string genérico | `{"ok":false,"error":"channel_not_found"}` — diagnóstico real |
| Rotación de credencial | borrar+recrear webhook | rotar token |

**Cuándo vale la pena migrar:** cuando quieras que el cron **actualice** el mensaje del día (p. ej. tachar los que ya revocaste), mandar DM al admin, o abrir hilo con el detalle. Para un cron de "avísame una vez al día", el webhook gana por simplicidad.

---

## 4. Severidad (color)

**El color bar solo existe en `attachments`.** No hay equivalente en blocks: *"The `color` parameter currently does not have a block alternative; if you need the color bar, you can use the `blocks` parameter within an attachment."* Attachments está marcado como *legacy*, pero este uso concreto (envoltorio con color + blocks adentro) sigue siendo el patrón estándar y no está deprecado funcionalmente.

`color` acepta hex (`#E01E5A`) o los keywords `good` (verde) / `warning` (amarillo) / `danger` (rojo).

Paleta sugerida, alineada a los colores de marca de Slack:

```ts
const SEVERITY = {
  info:     { color: '#2EB67D', emoji: ':white_check_mark:' }, // verde  — sync ok, 0 bajas
  warning:  { color: '#ECB22E', emoji: ':warning:'         }, // ámbar  — 1-2 bajas
  critical: { color: '#E01E5A', emoji: ':rotating_light:'  }, // rojo   — ≥3 bajas o fallo de scraping
  neutral:  { color: '#616061', emoji: ':information_source:' },
} as const;
```

Patrón: `attachments: [{ color, blocks: [...] }]` — **todo el contenido dentro del attachment**, nada en `blocks` de nivel superior, o la barra de color solo pinta media parte del mensaje.

---

## 5. Rate limits

- **Incoming webhooks: 1 mensaje por segundo por webhook**, con *"short bursts >1 allowed"*.
- **`chat.postMessage`: "special tier"** — ~1 mensaje por segundo **por canal**, más un límite global por workspace.
- Al exceder: **HTTP 429** con header **`Retry-After: <segundos>`**. Hay que esperar ese tiempo, no reintentar en bucle.
- Slack tolera ráfagas temporales pero throttlea el tráfico sostenido.

**Implicación de diseño para tu cron:** un cron diario está a órdenes de magnitud del límite. El único riesgo real es el antipatrón **"un mensaje por miembro dado de baja"** — con 30 bajas te comes el límite y además spameas el canal. **Agrega siempre en un solo mensaje** (que es justo lo que hace el payload de abajo). Si algún día necesitas N mensajes, mete `await new Promise(r => setTimeout(r, 1100))` entre ellos y respeta `Retry-After`.

---

## 6. Payload completo — "3 miembros salieron de Skool"

```json
{
  "text": ":rotating_light: 3 miembros salieron de Skool — revocar acceso en GHL",
  "attachments": [
    {
      "color": "#E01E5A",
      "fallback": "3 miembros salieron de Skool — revocar acceso en GHL",
      "blocks": [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": ":rotating_light: 3 miembros salieron de Skool",
            "emoji": true
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "Hay *3 accesos por revocar en GHL*.\nDetectado por el sync de las *06:00 (America/Bogotá)* comparando la membresía de Skool contra `profiles.is_skool_member`."
          }
        },
        { "type": "divider" },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*1. María Fernanda Ruiz*\n`maria.ruiz@example.com`"
          },
          "fields": [
            { "type": "mrkdwn", "text": "*Nivel previo:*\nVIP" },
            { "type": "mrkdwn", "text": "*Última vez vista:*\n25 ago 2026" }
          ]
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*2. Carolina Betancur*\n`carolina.b@example.com`"
          },
          "fields": [
            { "type": "mrkdwn", "text": "*Nivel previo:*\nRuta Jabonera" },
            { "type": "mrkdwn", "text": "*Última vez vista:*\n24 ago 2026" }
          ]
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*3. Juan Esteban Ospina*\n`juan.ospina@example.com`"
          },
          "fields": [
            { "type": "mrkdwn", "text": "*Nivel previo:*\nVIP" },
            { "type": "mrkdwn", "text": "*Última vez vista:*\n25 ago 2026" }
          ]
        },
        { "type": "divider" },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": ":point_right: *Qué hacer:* quitarles el tag de acceso en GHL y confirmar que `is_skool_member` quedó en `false` en el panel."
          }
        },
        {
          "type": "actions",
          "block_id": "revoke_actions",
          "elements": [
            {
              "type": "button",
              "action_id": "open_ghl",
              "style": "danger",
              "text": { "type": "plain_text", "text": "Abrir contactos en GHL", "emoji": true },
              "url": "https://app.gohighlevel.com/v2/location/LOCATION_ID/contacts/smart_list/All"
            },
            {
              "type": "button",
              "action_id": "open_admin",
              "text": { "type": "plain_text", "text": "Panel de admin", "emoji": true },
              "url": "https://universo.linatoro.com/admin.html?tab=skool"
            },
            {
              "type": "button",
              "action_id": "open_logs",
              "text": { "type": "plain_text", "text": "Ver logs del sync", "emoji": true },
              "url": "https://supabase.com/dashboard/project/PROJECT_REF/functions/sync-skool-members/logs"
            }
          ]
        },
        {
          "type": "context",
          "elements": [
            {
              "type": "mrkdwn",
              "text": "`sync-skool-members` · corrida `2026-08-26T11:00:12Z` · 148 miembros escaneados · 3 bajas · 0 altas"
            }
          ]
        }
      ]
    }
  ]
}
```

Reemplaza `LOCATION_ID`, el dominio del panel y `PROJECT_REF`. Pégalo tal cual en https://app.slack.com/block-kit-builder para previsualizarlo antes de codificar.

Conteo de blocks: 10. Con `2 + 2*N` blocks por N miembros (section por miembro), el techo de 50 se alcanza en ~20 miembros → ver el truncado en el código.

---

## 7. Implementación en Deno (lista para `index.ts`)

Encaja con el patrón de env vars que ya usa la función (`Deno.env.get`, alertas a `ADMIN_EMAIL` vía Resend). Añade `SLACK_WEBHOOK_URL`:

```ts
const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const GHL_CONTACTS_URL  = Deno.env.get('GHL_CONTACTS_URL')  ?? '';
const ADMIN_PANEL_URL   = Deno.env.get('ADMIN_PANEL_URL')   ?? '';

const SEVERITY = {
  info:     '#2EB67D',
  warning:  '#ECB22E',
  critical: '#E01E5A',
} as const;

type Departed = { name: string; email: string; level?: string | null; lastSeen?: string };

function buildRevokePayload(members: Departed[], meta: string) {
  const n = members.length;
  const color = n >= 3 ? SEVERITY.critical : SEVERITY.warning;
  const MAX = 18; // 2 + 2*18 = 38 blocks, bajo el techo de 50
  const shown = members.slice(0, MAX);

  const memberBlocks = shown.flatMap((m) => [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${escapeMrkdwn(m.name)}*\n\`${m.email}\`` },
      fields: [
        { type: 'mrkdwn', text: `*Nivel previo:*\n${m.level ?? '—'}` },
        { type: 'mrkdwn', text: `*Última vez vista:*\n${m.lastSeen ?? '—'}` },
      ],
    },
  ]);

  if (n > MAX) {
    memberBlocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_…y ${n - MAX} más. Lista completa en el panel de admin._` }],
    } as never);
  }

  const buttons = [
    GHL_CONTACTS_URL && {
      type: 'button', action_id: 'open_ghl', style: 'danger',
      text: { type: 'plain_text', text: 'Abrir contactos en GHL', emoji: true },
      url: GHL_CONTACTS_URL,
    },
    ADMIN_PANEL_URL && {
      type: 'button', action_id: 'open_admin',
      text: { type: 'plain_text', text: 'Panel de admin', emoji: true },
      url: ADMIN_PANEL_URL,
    },
  ].filter(Boolean);

  return {
    text: `:rotating_light: ${n} ${n === 1 ? 'miembro salió' : 'miembros salieron'} de Skool — revocar acceso en GHL`,
    attachments: [{
      color,
      fallback: `${n} bajas en Skool — revocar acceso en GHL`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `:rotating_light: ${n} ${n === 1 ? 'miembro salió' : 'miembros salieron'} de Skool`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `Hay *${n} ${n === 1 ? 'acceso' : 'accesos'} por revocar en GHL*.` } },
        { type: 'divider' },
        ...memberBlocks,
        { type: 'divider' },
        ...(buttons.length ? [{ type: 'actions', block_id: 'revoke_actions', elements: buttons }] : []),
        { type: 'context', elements: [{ type: 'mrkdwn', text: meta }] },
      ],
    }],
  };
}

// Escapa los 3 caracteres que Slack interpreta como control
const escapeMrkdwn = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function notifySlack(payload: unknown): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) return true;                       // body es el texto "ok"
      const body = await r.text();
      if (r.status === 429) {
        const wait = Number(r.headers.get('Retry-After') ?? '1');
        await new Promise((res) => setTimeout(res, Math.min(wait, 30) * 1000));
        continue;                                   // un solo reintento
      }
      console.error(`slack webhook ${r.status}: ${body}`); // invalid_payload, channel_not_found…
      return false;
    } catch (e) {
      console.error('slack webhook network error:', e);
      return false;
    }
  }
  return false;
}
```

Uso al final del sync:

```ts
if (departed.length > 0) {
  await notifySlack(buildRevokePayload(
    departed,
    `\`sync-skool-members\` · ${new Date().toISOString()} · ${scanned} miembros escaneados · ${departed.length} bajas`,
  ));
}
```

`notifySlack` **nunca lanza**: una caída de Slack no debe tumbar el cron ni bloquear la escritura en Supabase. Llámala después de persistir, no antes.

Secretos:

```bash
supabase secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." \
                     GHL_CONTACTS_URL="https://app.gohighlevel.com/v2/location/.../contacts/smart_list/All" \
                     ADMIN_PANEL_URL="https://.../admin.html?tab=skool"
```

---

## 8. Gotchas

- **Timeout del cron:** si el disparo es por `pg_cron` + `pg_net`, el POST a Slack ocurre dentro de la Edge Function, no en Postgres — sin problema. No metas el webhook de Slack directamente en `net.http_post` desde SQL salvo que quieras el payload hardcodeado.
- **No mandes mensaje cuando no hay bajas.** Un canal que grita todos los días se silencia. Opcional: un resumen semanal `info` verde para saber que el cron sigue vivo (dead-man's switch).
- **Idempotencia:** si el cron corre cada hora, la misma baja se notificará cada hora hasta que revoques. Marca las bajas ya notificadas en una columna (`revoke_notified_at`) y filtra.
- **Emails y `<`/`>`:** Slack convierte `<algo>` en entidad de control. Los emails dentro de backticks son seguros; los nombres pásalos por `escapeMrkdwn`.
- **PII en Slack:** el payload lleva emails de clientas. Usa un canal privado.
- **Alternativa no-code:** Slack Workflow Builder acepta un *webhook trigger* y puede postear un mensaje con variables, sin crear una app. Pierdes control fino de Block Kit (nada de attachments con color) — no lo recomiendo aquí.

---

## Sources

- [Sending messages using incoming webhooks — Slack Developer Docs](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks)
- [Button element — Block Kit reference](https://docs.slack.dev/reference/block-kit/block-elements/button-element)
- [Actions block — Block Kit reference](https://docs.slack.dev/reference/block-kit/blocks/actions-block)
- [Rate limits — Web API](https://docs.slack.dev/apis/web-api/rate-limits)
- [Legacy secondary message attachments (campo `color`)](https://docs.slack.dev/legacy/legacy-messaging/legacy-secondary-message-attachments/)
- [Formatting message text (mrkdwn)](https://docs.slack.dev/messaging/formatting-message-text)
- [Handling user interaction in your Slack apps](https://docs.slack.dev/interactivity/handling-user-interaction/)
- [Block Kit Builder (previsualizador)](https://app.slack.com/block-kit-builder)
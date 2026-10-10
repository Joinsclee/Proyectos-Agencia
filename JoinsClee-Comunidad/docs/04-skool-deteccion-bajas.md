# Detectar cancelaciones y salidas en Skool — investigación completa (2026-08-26)

> **Metodología**: además de búsqueda web, hice **ingeniería inversa del bundle de producción de Skool** (`buildId` `1787691960772`, descargado hoy). Todo lo marcado como ✅ VERIFICADO sale del código minificado real de Skool o del código de producción del propio proyecto (`/Users/cristhian/Downloads/Paginas Web/Lina Toro/dashboard/supabase/functions/sync-skool-members/index.ts`). Lo marcado 🟡 es inferencia y lo digo explícitamente.

---

## TL;DR — la respuesta corta

1. **No hay API pública oficial** de Skool. Nunca la ha habido, no hay roadmap público. ✅
2. **No hay webhooks salientes.** El "plugin Webhook" de Skool que existe en `Settings → Plugins` es un webhook **ENTRANTE** para *invitar* miembros. No emite eventos. ✅ VERIFICADO en el bundle.
3. **Zapier tiene exactamente 2 triggers y 2 actions**, ninguno de cancelación. Make.com no tiene app real. ✅
4. **SÍ existe la señal que buscas**, y es limpia: el endpoint interno `/_next/data/{buildId}/{group}/-/members.json` acepta **`t=cancelling`** y **`t=churned`** además de `t=active`. ✅ VERIFICADO
5. **El campo canónico es `user.member.billingCanceled`** (canceló, aún tiene acceso) vs **`user.member.churned`** (ya perdió acceso). ✅ VERIFICADO
6. **`t=inactive`, `t=cancelled`, `t=pending`, `t=all` NO existen.** No los uses. ✅

---

## 1. ¿Skool tiene API pública oficial? — NO

**Estado a agosto 2026: no existe.** No hay developer portal, no hay OAuth, no hay docs, no hay tabla de rate limits, no hay marketplace de apps.

Lo único que se le parece:

- **Un API Key por grupo**, pero **exclusivo para el plugin de Zapier**. En el bundle: `rotateApiKey({groupID, type:"group-zapier"})` → `POST {API_URL}/groups/{groupId}/api-keys/rotate?type=group-zapier`. Se guarda en `group.metadata.apiKeys` (JSON array, `[0].token`). Ese token **solo lo consume la app de Zapier**; no está documentado como API general. ✅ VERIFICADO
- **API interna** en `https://api2.skool.com` (valor real de `env.API_URL`, extraído del HTML de producción hoy). Es la que usa la web app y el móvil. No documentada, no estable, protegida por cookie de sesión. ✅ VERIFICADO

Extraje **305 métodos del cliente API interno** del bundle `_app.js`. Los relevantes a membresía/billing:

```
POST   /members/{memberId}/role                              updateMemberRole
GET    /members/{memberId}/invoices                          getMemberPaymentHistory
POST   /members/{memberId}/refunds                           refundPayment
POST   /groups/{groupId}/cancel-member-billing-subscription  cancelMemberSubscription
POST   /groups/{groupId}/request-bulk-action                 membersBulkActions
GET    /groups/{groupId}/bulk-action                         getBulkActionProgress
POST   /groups/{groupId}/webhooks                            createGroupInviteWebhook
POST   /groups/{groupId}/enable-webhook | /disable-webhook
POST   /groups/{groupId}/enable-zapier  | /disable-zapier
POST   /groups/{groupId}/bulk-invite                         addBulkGroupMembers
POST   /groups/{groupId}/invite                              inviteUsersToGroup
GET    /groups/{groupId}/membership-products                 getGroupMembershipProducts
POST   /payments/cancel-subscription | /uncancel-subscription | /cancel-trial
```

**Nota importante**: `readGroupMembersData` (el que lista miembros) **NO está en el bundle del navegador** — solo corre server-side en `getServerSideProps`. Por eso **no se puede llamar directo a `api2.skool.com` para listar miembros**; hay que pasar por `/_next/data/…/members.json`. ✅ VERIFICADO

**⚠️ No inventes endpoints**: no existe `GET /groups/{id}/members` accesible desde fuera. Si alguna herramienta te lo ofrece, está scrapeando `_next/data` por debajo.

---

## 2. ¿Skool tiene WEBHOOKS? — NO en el sentido que necesitas

Esta es la pregunta donde hay más desinformación en la web. **La respuesta definitiva sale del bundle:**

El plugin se llama literalmente **"Webhook"** (id interno `adminWebhook`), y su descripción exacta en el código es:

> **"Invite members to your group with a simple webhook."**

Y el componente que lo renderiza hace esto:

```js
const {data:{id}} = await api.createGroupInviteWebhook({groupName: group.id});
setUrl(`${env.API_URL}/groups/${group.name}/webhooks/${id}`);
// UI:
// label: "Webhook URL"
// texto: "Append emails to the end of your webhook URL like this:"
//        yourwebhookurl?email=bob@gmail.com
```

**Conclusión ✅ VERIFICADA: el webhook de Skool es INBOUND (tú le pegas a Skool para invitar a alguien). Skool NO te manda NADA.**

- ❌ No existe `member.joined`
- ❌ No existe `member.left`
- ❌ No existe `subscription.cancelled`
- ❌ No existe `payment.failed`
- ❌ No hay pantalla `Settings → Webhooks` con lista de eventos ni con secret de firma
- ❌ No hay payload que documentar, porque no hay evento saliente

Lista completa de plugins del grupo (extraída del bundle, para que veas que no hay ninguno de eventos salientes): `adminAutoDm`, `adminOnboardingVideo`, `adminZapier`, `adminMetaPixel`, `adminCancellationVideo`, `adminLinks`, `adminAutoApprove`, `adminWebhook`, `adminHyros`, `adminChatUnlock`, `adminPostUnlock`, `adminGoogleAds`. ✅ VERIFICADO

**Flags en `group.metadata`**: `pluginWebhookEnabled`, `pluginZapierEnabled`, `pluginAutoDmEnabled`, `pluginMetaConversionsEnabled`, `pluginGoogleAdsEnabled`, `pluginHyrosEnabled`, `retentionVideo` (el video de cancelación). ✅

### El único "webhook" real de eventos: Stripe

Skool cobra por Stripe Connect. Si tienes acceso a la cuenta de Stripe conectada, **ahí sí** puedes escuchar `customer.subscription.deleted`, `customer.subscription.updated` (con `cancel_at_period_end: true`) e `invoice.payment_failed`.

🟡 **Advertencia**: no verifiqué en este proyecto si Lina/SAVIAS tiene acceso al dashboard de Stripe Connect ni si Skool expone los `client_secret`/webhooks de esa cuenta al owner del grupo. En Stripe Connect estándar, el *platform* (Skool) es dueño de la cuenta y **el owner del grupo normalmente NO puede registrar webhooks propios**. Habría que verificarlo entrando a la sección de payouts/billing de Skool. **No lo des por hecho.**

---

## 3. Zapier / Make — qué triggers existen realmente

### Zapier — lista exacta, sacada del propio panel de Skool

En `Settings → Plugins → Zapier integration`, Skool renderiza literalmente estos 4 casos de uso (código del bundle, con sus links de ayuda):

| # | Tipo | Nombre exacto | Doc |
|---|------|---------------|-----|
| 1 | **Trigger** | "Send paid members name and email to your CRM" → en Zapier: **New Paid Member** | `help.skool.com/article/162-zapier-new-paid-member-info-to-crm` |
| 2 | **Trigger** | "Send membership questions/answers to your CRM" → en Zapier: **Answered Membership Questions** | `help.skool.com/article/59-zapier-for-membership-questions` |
| 3 | **Action** | "Invite a member to your group" → **Invite Member** | `help.skool.com/article/60-zapier-invite-with-custom-course-access` |
| 4 | **Action** | "Unlock a course for a member in your group" → **Unlock Course for Member** | `help.skool.com/article/61-zapier-unlock-a-course-for-a-member-in-your-group` |

✅ VERIFICADO (bundle + página de Zapier).

**Payload de "New Paid Member"**: `first name`, `last name`, `subscription email`, más un transaction ID y fecha en los datos de prueba. Dispara **solo al completarse el pago de alta**. No dispara en cancelación.

**❌ NO existen**: `Member Cancelled`, `Member Removed`, `Member Left`, `Payment Failed`, `Subscription Cancelled`, `Member Churned`. Tampoco existe una *action* "Remove member" — está confirmado en el foro de Zapier: un Community Manager de Zapier respondió que no encontró documentación pública de API de Skool y sugirió pedirle a Skool que abriera algo.

### Make.com

**No hay app oficial de Skool en Make.** La página `apps.make.com/skool` dice literalmente que no pueden documentarla por falta de información pública, y el único módulo listado es **"Invite a new member"** (que es exactamente el webhook entrante del punto 2). ✅

---

## 4. La API interna de Next.js — valores reales de `t` y todos los filtros

### 4.1 El endpoint

```
GET https://www.skool.com/_next/data/{buildId}/{group}/-/members.json?{params}
Cookie: auth_token=...; client_id=...
x-nextjs-data: 1
Referer: https://www.skool.com/{group}/-/members
```

`buildId` rota con cada deploy (~semanal). Se extrae del HTML con `/"buildId"\s*:\s*"([^"]+)"/`. ✅ (así lo hace ya tu edge function, línea 84)

### 4.2 Valores aceptados de `t` — LISTA COMPLETA Y CERRADA ✅ VERIFICADA

Extraído del código que construye los chips de pestaña en `pages/[group]/-/members`:

```js
const L = isAdmin
  ? [ {key:"active",     label:"Active",     activeLabel:"Active {{num}}"},
      {key:"cancelling", label:"Cancelling", dataTestId:"cancelled-members"},
      {key:"churned",    label:"Churned",    dataTestId:"churned-members"},
      {key:"banned",     label:"Banned",     dataTestId:"banned-members"} ]
  : [ {key:"member",     label:"Members {{num}}"},
      {key:"admin",      label:"Admins {{num}}"},
      {key:"online",     label:"Online {{num}}"} ];
```

Y el switch de conteo del servidor:

```js
switch (t) {
  case "admin":      count = totalAdmins;            break;
  case "online":     count = totalOnlineMembers;     break;
  case "banned":     count = totalBannedMembers;     break;
  case "churned":    count = totalChurnedMembers;    break;
  case "cancelling": count = totalCancellingMembers; break;
  default:           count = totalMembers;           // ← "active" cae aquí
}
```

| Valor de `t` | ¿Existe? | Quién lo ve | Qué devuelve |
|---|---|---|---|
| `active` | ✅ SÍ | admin | Miembros con acceso vigente (default admin) |
| **`cancelling`** | ✅ **SÍ** | admin | **Canceló pero AÚN tiene acceso** ← lo que buscas |
| **`churned`** | ✅ **SÍ** | admin | **Ya perdió el acceso** ← lo que buscas |
| `banned` | ✅ SÍ | admin | Baneados |
| `member` | ✅ SÍ | no-admin | Default no-admin |
| `admin` | ✅ SÍ | no-admin | Admins |
| `online` | ✅ SÍ | no-admin | Online ahora |
| `inactive` | ❌ **NO existe** | — | — |
| `cancelled` / `canceled` | ❌ **NO existe** (es `cancelling`) | — | — |
| `pending` | ❌ **NO** en members.json | — | vive en otra ruta: `/{group}/-/pending` |
| `all` | ❌ **NO existe** | — | — |

**Default del servidor**: `t = query.t || (isAdmin ? "active" : "member")`. Si mandas un `t` inválido cae al `default` (= comportamiento de `active`). ✅

**Rutas hermanas** (páginas separadas, NO valores de `t`) — confirmadas en el `_buildManifest`:
- `/{group}/-/pending` — solicitudes de ingreso (params: `p`)
- `/{group}/-/invited` — invitados sin aceptar (params: `p`, `q`)
- `/{group}/-/disputes`, `/{group}/-/reports`, `/{group}/-/rankings`

### 4.3 TODOS los parámetros del endpoint ✅ VERIFICADO

Del constructor de URL real (`_app.js`, función exportada como `DW`):

```js
function membersUrl({group, tab, page, searchQuery, online, admin, monthly, annual,
                     oneTime, levels, courseIds, sortType, price, trials, tiers, free}) {
  const q = {
    t: tab, p: page, q: searchQuery,
    online, admin, levels, price, courseIds, sortType,
    monthly, annual, oneTime, trials,
    tiers: tiers?.join(",") ?? undefined,
    free
  };
  return `/${group.name}/-/members?${qs(q)}`;
}
```

Y el `getServerSideProps` que los consume:

| Param | Tipo / valores | Mapea a |
|---|---|---|
| `t` | tab (tabla arriba) | `tabName` |
| `p` | entero (1-based) | `page` |
| `q` | string | búsqueda por nombre/email |
| `online` | truthy | `online: !!online` |
| `admin` | truthy | `admin: !!admin` |
| `levels` | `"1,2,3"` (CSV de enteros) | `levels: [1,2,3]` |
| `courseIds` | CSV de ids | `courseIds: [...]` |
| `price` | CSV de `billingProductId` | `billingProductIds` |
| `monthly` | `"true"` | añade `"month"` a `billingProductIntervals` |
| `annual` | `"true"` | añade `"year"` |
| `oneTime` | `"true"` | añade `"one_time"` |
| `trials` | `"true"` | `trials: true` |
| `free` | `"true"` | `free: true` |
| **`tiers`** | `"standard,premium,vip"` | `tiers: [...]` ← **te falta este en tu código** |
| `sortType` | `-memberapprovedat` (Newest) / `-memberlastoffline` (Last active) / `-memberpoints` (Most points) | `sortType` |
| — | `limit` fijo **30**, no configurable | `itemsPerPage: 30` |

**Ojo**: los valores booleanos se comparan con el **string** `"true"`, no `true`. Y `admin` / `online` con `!!` (así que `""` = false, cualquier string no vacío = true).

### 4.4 Forma de la respuesta ✅ VERIFICADO

```jsonc
{ "pageProps": {
    "users": [ /* ← ARRAY CANÓNICO de miembros */ ],
    "tabName": "cancelling",
    "page": 1,
    "totalPages": 3,
    "total": 74,           // ← conteo de LA PESTAÑA pedida
    "itemsPerPage": 30,
    "isAdmin": true,
    "totalMembers": 812,
    "totalAdmins": 3,
    "totalOnlineMembers": 12,
    "isFiltered": false,
    "renderData": {
       "members": [ /* mismo array */ ],
       "totalMembers": 812,
       "totalCancellingMembers": 74,   // ← solo aquí
       "totalChurnedMembers": 310,     // ← solo aquí
       "totalBannedMembers": 2,        // ← solo aquí
       "totalOnlineMembers": 12,
       "totalAdmins": 3,
       "totalFilteredMembers": 0,
       "groupMembershipProducts": [...],
       "courses": [...]
    },
    "currentGroup": {...}, "self": {...}
} }
```

> 🔧 **Bug latente en tu edge function**: `fetchSkoolMembersPage` busca `root.members`, `root.users`, `root.data.members`, `root.initialState.members.list`, `root.membersData.members`. `root.users` **sí** matchea (`pageProps.users`), así que funciona — pero `totalPages` y `totalMembers` los lee de `root.totalPages`/`root.totalMembers`, y `totalPages` **sí** existe en pageProps (✅), mientras que los conteos de cancelling/churned **NO** — están en `pageProps.renderData.*`. Si vas a leer churn, apunta a `renderData`.

---

## 5. Campos del JSON de miembro que indican estado de suscripción

Esto es **oro** y está ✅ VERIFICADO al 100%: encontré el `propTypes` literal del componente que renderiza cada fila de miembro (chunk `7152-58e26eb49b0bde5e.js`). Es el contrato exacto del objeto:

```js
member: shape({
  billingProductId:  string,
  billingDeclined:   string,   // ← pago rechazado
  billingCanceled:   string,   // ← CANCELÓ  (⚠️ una sola "l": Canceled)
  approvedAt:        string,
  churned:           string,   // ← YA SALIÓ (fecha)
  role:              string,
  metadata: shape({
    mbscpe:            number,  // unix seg — current period end / próxima renovación
    mmbp:              string,  // JSON-string del plan
    mbsfprt:           string,  // unix seg — fecha de expulsión si billingDeclined
    freeTrialChurnedAt:string,  // unix seg — fin de trial no convertido
    bannedAt:          number,  // ⚠️ NANOsegundos (se divide /1e6 → ms)
    attrComp:          string,  // atribución ("invite", afiliado…)
    attrSrcComp:       string
  })
})
```

Otros campos confirmados en uso real:
- **`member.metadata.mbme`** → email del miembro (ofuscado). El código de Skool hace: `member.inviteEmail || member.metadata.mbme || <respuesta "email" del survey>`. ✅ (tu código ya usa `mbme`)
- **`member.metadata.mbsltv`** → **Lifetime Value** del miembro, en centavos. Se renderiza con formato moneda USD. ✅ ← útil para tu dashboard
- **`member.metadata.survey`** → JSON-string con las respuestas a las membership questions
- **`member.pricing`** → lo inyecta el cliente (no viene del server) cruzando `billingProductId` contra `groupMembershipProducts`
- **`member.role`** → `"member"` | `"group-admin"` | `"group-moderator"` | `"pending"` | (banned tiene su propio rol). El mapa literal en el código: `{member:"Member", "group-admin":"Admin", "group-moderator":"Moderator"}`, else `"Nonmember"`.

### `metadata.mmbp` — el plan (JSON-string, hay que `JSON.parse`)

```json
{"currency":"usd","amount":2700,"recurring_interval":"month",
 "model":"freemium","tier":"premium","isFreeTrial":false}
```

- `tier`: `"standard"` | `"premium"` | `"vip"` (los 3 chips del filtro `tiers`) ✅
- `recurring_interval`: `"month"` | `"year"` | `"one_time"` | **`LIFETIME`** (constante `X0.LIFETIME`) — si es lifetime, la UI muestra "Lifetime access" y **no hay renovación** 🟡 (el valor string exacto de LIFETIME no lo pude resolver del bundle; verifícalo en datos reales)
- `isFreeTrial`: booleano, cambia toda la semántica (ver abajo)
- `amount` en centavos

> ✅ Esto confirma y amplía lo que ya tienes documentado en `extractLevel()` (línea 191 de tu `index.ts`).

### ❌ Campos que NO existen (no los busques)

`cancel_at_period_end`, `subscription_status`, `status`, `canceledAt`, `cancelAt`, `billing_canceled`. Ninguno aparece en el bundle. Son nomenclatura de Stripe, no de Skool.

---

## 6. "Canceló pero sigue hasta fin de periodo" vs "ya no tiene acceso"

Esta es la parte crítica, y Skool la distingue **explícitamente**. Encontré el bloque exacto que pinta el badge de estado en la ficha del miembro:

```js
const {billingCanceled, billingDeclined, metadata} = user.member;
const {mmbp, mbscpe, mbsfprt} = metadata;

if (mmbp && JSON.parse(mmbp).recurring_interval === LIFETIME) → "Lifetime access"

if (mbscpe || !user.member.billingProductId) {
  const ts   = billingDeclined ? mbsfprt : mbscpe;      // ← qué reloj usar
  const end  = isFreeTrial ? dayjs.unix(ts).startOf("day") : dayjs.unix(ts);
  const days = end.diff(now, "days");

  if (billingCanceled)  → isFreeTrial ? "Trial cancelled (removing in {{count}} day)"
                                      : "Cancelled (churns in {{count}} day)"     // ⚠️ rojo
  else if (billingDeclined) → isFreeTrial ? "Trial declined (removing in {{count}} day)"
                                          : "Declined (churns in {{count}} day)"  // ⚠️ rojo
  else if (isFreeTrial) → "Trial (ends in {{count}} day)"
  else                  → "Renews in {{count}} day"
}
```

Y un segundo badge, el de "ya se fue":

```js
if (metadata.bannedAt)          → "Banned {{date}}"          // bannedAt / 1e6 → ms
if (metadata.freeTrialChurnedAt && !convirtió) → "Trial ended {{date}}"
if (member.churned)             → "Churned {{date}}"
```

### Tabla de decisión ✅

| Estado real | Cómo detectarlo | Pestaña `t=` | ¿Tiene acceso HOY? | Cuándo lo pierde |
|---|---|---|---|---|
| **Activo pagando** | `!billingCanceled && !billingDeclined && !churned` | `active` | ✅ Sí | Renueva en `mbscpe` |
| **En trial** | `mmbp.isFreeTrial === true` | `active` | ✅ Sí | Trial termina en `mbscpe` |
| **CANCELÓ, sigue hasta fin de periodo** | **`member.billingCanceled` truthy** | **`cancelling`** | ✅ **Sí** | **`metadata.mbscpe`** (unix seg) |
| **Pago rechazado, en reintentos** | **`member.billingDeclined` truthy** | 🟡 probablemente `cancelling` — **verificar** | ✅ Sí (aún) | **`metadata.mbsfprt`** (unix seg) |
| **YA SALIÓ (churn consumado)** | **`member.churned`** (fecha ISO) | **`churned`** | ❌ **No** | Ya ocurrió: `member.churned` |
| **Trial vencido sin convertir** | `metadata.freeTrialChurnedAt` | `churned` | ❌ No | Ya ocurrió |
| **Baneado** | `metadata.bannedAt` | `banned` | ❌ No | Ya ocurrió |
| **Lifetime** | `mmbp.recurring_interval === LIFETIME` | `active` | ✅ Sí | Nunca |

### El punto fino que importa para tu dashboard

Cuando alguien cancela, **Skool NO lo saca del grupo de inmediato**. El propio Help Center lo dice: *"You will be removed from the group at the end of your billing cycle"*, y recomienda cancelar ≥24h antes del rebill.

Traducido a tu `sync-skool-members`:

> ⚠️ **Tu sync actual (`t=active` + borrar los que ya no aparecen) NO detecta la cancelación cuando ocurre — la detecta hasta ~30 días después, cuando Skool finalmente lo expulsa.** Ese es exactamente el hueco. Con `t=cancelling` lo detectas el mismo día y sabes la fecha exacta de corte (`mbscpe`).

Además, **`billingCanceled` es reversible**: existe `uncancelSubscription` y en la UI de cancelación Skool ofrece "Change plan instead?" + un *cancellation video* de retención (plugin `adminCancellationVideo` / `group.metadata.retentionVideo`). O sea, un miembro puede aparecer en `cancelling` y volver a `active`. **No borres su acceso al detectar `cancelling`** — márcalo y córtalo en `mbscpe`.

Y un admin también puede cancelar desde el panel: `cancelMemberSubscription({groupId, memberId})` → el cliente hace `member.billingCanceled = true` optimistamente y muestra *"Subscription cancelled"*. Mismo campo. ✅

🟡 **Lo único que NO pude verificar sin credenciales**: si un miembro con `billingCanceled` aparece **también** dentro de `t=active` (mi lectura del código dice que sí, porque el conteo de `active` usa `totalMembers` = todos los que tienen acceso, y `cancelling` es un subconjunto). **Verifícalo así** antes de construir lógica encima:

```bash
# con las cookies de admin que ya tienes en el edge function
BUILD=$(curl -s -b "auth_token=…; client_id=…" https://www.skool.com/savias-8385/-/members \
        | grep -o '"buildId":"[^"]*"' | cut -d'"' -f4)

for T in active cancelling churned banned; do
  curl -s -b "auth_token=…; client_id=…" -H 'x-nextjs-data: 1' \
    -H "Referer: https://www.skool.com/savias-8385/-/members" \
    "https://www.skool.com/_next/data/$BUILD/savias-8385/-/members.json?t=$T&p=1&group=savias-8385" \
  | jq --arg t "$T" '{tab:$t, total:.pageProps.total,
      totals:(.pageProps.renderData|{totalMembers,totalCancellingMembers,totalChurnedMembers,totalBannedMembers}),
      sample:(.pageProps.users[0].member|{billingCanceled,billingDeclined,churned,role,
              mbscpe:.metadata.mbscpe, mbsfprt:.metadata.mbsfprt, mbme:.metadata.mbme, mmbp:.metadata.mmbp})}'
done
```

Si los emails de `cancelling` también salen en `active` → confirmado el solapamiento.

---

## 7. Vía oficial alternativa: export CSV por pestaña

Existe un botón **Export** en la página de miembros (solo admin), y llama a:

```
POST {API_URL}/groups/{groupId}/request-bulk-action
  ?type=bulk-export-csv&all-members-selected=true&member-status={tab}
  body: {online, admin, levels, membership_billing_product_ids, course_ids,
         sort_type, billing_product_intervals, trials, tiers, free}
  (requiere email verification)
→ devuelve {token, fileId}; se espera el token y luego getResourceUrl({fileId})
```

✅ VERIFICADO. `member-status` acepta las mismas 4 pestañas (`active`/`cancelling`/`churned`/`banned`), y el Help Center de Skool lo confirma: *"To issue a refund to the canceled members or churned/banned members, you can refund from the respective **subtab** on the Members tab."*

🟡 Limitación reportada por usuarios en la comunidad de Skool (hilo "How to export active/cancelling/churned lists with more data?"): el CSV trae Nombre, Email y respuestas de las preguntas, pero **no** trae fecha de churn ni price point — o sea, **el JSON de `members.json` tiene más datos que el CSV oficial**. Otro punto a favor de seguir con `_next/data`.

---

## 8. Recomendación concreta para `sync-skool-members`

```
Por cada corrida del cron, hacer 3 barridos en vez de 1:

  t=active     → verdad de "tiene acceso"       (lo que ya haces)
  t=cancelling → cola de churn: guarda
                   skool_status = 'cancelling'
                   churn_at     = metadata.mbscpe        (unix seg → timestamptz)
                   churn_reason = billingCanceled ? 'cancelled' : 'declined'
                 → dispara el email/alerta de retención AQUÍ, no cuando desaparece
  t=churned    → confirmación de salida: skool_status='churned',
                   churned_at = member.churned (ISO)
                 → recién aquí revocas acceso en el dashboard

Añadir al SkoolMember:
  billing_canceled  = !!c.member?.billingCanceled
  billing_declined  = !!c.member?.billingDeclined
  churned_at        = c.member?.churned ?? null
  period_end        = c.member?.metadata?.mbscpe ?? null
  final_retry_at    = c.member?.metadata?.mbsfprt ?? null
  trial             = JSON.parse(mmbp).isFreeTrial
  ltv_cents         = c.member?.metadata?.mbsltv
  role              = c.member?.role

Leer conteos de pageProps.renderData.total{Cancelling,Churned,Banned}Members
(NO de pageProps top-level: ahí solo están totalMembers/totalAdmins/totalOnlineMembers).

Añadir `tiers` al querystring si algún día filtras por plan.
```

**Riesgos operativos a documentar en el vault**: `buildId` rota (~semanal, ya lo manejas); las cookies `auth_token`/`client_id` caducan y el fallo se ve como redirect a `/login` (ya lo detectas con `isLoginPage`); el bundle puede renombrar campos en cualquier deploy porque **nada de esto es API pública ni tiene contrato de estabilidad**. Ponle un canario: si `pageProps.users[0].member.billingCanceled === undefined` en todos los registros de `t=cancelling` con `total > 0`, manda alerta.

---

## Fuentes

Bundle de producción de Skool analizado hoy (buildId `1787691960772`): `_buildManifest.js`, `pages/[group]/-/members-eec81bb182c5e60b.js`, `chunks/7719-4024010a9199cee4.js`, `chunks/7152-58e26eb49b0bde5e.js`, `chunks/pages/_app-2a6d2b13b5c551d6.js`. Copias locales en `/tmp/members.js` y `/tmp/sk/`.

Código de producción propio: `/Users/cristhian/Downloads/Paginas Web/Lina Toro/dashboard/supabase/functions/sync-skool-members/index.ts`

- [How to cancel my membership to a community? — Skool Help Center](https://help.skool.com/article/99-how-to-cancel-my-subscription-to-a-community)
- [How to refund a member's payment? — Skool Help Center](https://help.skool.com/article/84-how-to-refund-a-members-payment)
- [Zapier: new paid member info to CRM — Skool Help Center](https://help.skool.com/article/162-zapier-new-paid-member-info-to-crm)
- [How to remove a member? — Skool Help Center](https://help.skool.com/article/141-how-to-remove-a-member)
- [Skool integrations — Zapier](https://zapier.com/apps/skool/integrations)
- [How can I auto-remove canceled subscribers from Skool via Zapier? — Zapier Community](https://community.zapier.com/how-do-i-3/how-can-i-auto-remove-canceled-subscribers-from-skool-via-zapier-46168)
- [skool — Apps Documentation (Make)](https://apps.make.com/skool)
- [Skool API in 2026: What Exists, What Doesn't — Tools4Skool](https://tools4skool.com/integrations/skool-api)
- [Skool API Integration: What's Possible (And What Isn't) in 2026 — ShipWorkflow](https://shipworkflow.com/blog/skool-api-integration)
- [How I Export 700+ Skool Members to CSV — DEV Community](https://dev.to/cristiantalasanchez/how-i-export-700-skool-members-to-csv-with-one-api-call-email-tier-ltv-survey-1p85) (confirma independientemente los estados `active`/`cancelling`/`churned`/`banned`)
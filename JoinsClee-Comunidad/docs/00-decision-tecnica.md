# Skool → GoHighLevel: revocación automática de accesos
## Documento de decisión técnica — consolidación de 5 informes
**Fecha:** 2026-08-26 · **Contexto:** comunidad JoinsClee en Skool, bono = "cuenta de GHL", cron diario, fallback a Slack.

---

## TL;DR

| Pregunta | Respuesta |
|---|---|
| ¿Se puede revocar una cuenta de GHL por API? | **SÍ, si la unidad de revocación es el USUARIO** (`DELETE /users/{userId}`). **NO con certeza si es la SUB-CUENTA** (`DELETE /locations/{id}` tiene un conflicto de scope sin resolver). |
| ¿Cómo detectar la baja en Skool? | **No hay webhooks salientes.** Scraping del endpoint interno con **lectura de estado explícito** (`t=cancelling` + `t=churned`), **no** diff ciego de snapshots. |
| Decisión arquitectónica clave | **Desacoplar acceso de infraestructura**: el acceso se revoca borrando usuarios (automatizable, seguro, reversible); la sub-cuenta se pausa/borra en una pista humana lenta vía Slack. |
| Fecha de corte confiable | `member.metadata.mbscpe` (unix seg) del tab `cancelling` — la sabes ~30 días antes de que Skool expulse al miembro. |

---

## 1. VEREDICTO: ¿se puede borrar/revocar una cuenta de GHL por API?

**Depende de qué sea "una cuenta". Hay dos modelos y el veredicto es opuesto en cada uno.**

### 1.A — Modelo A: usuario dentro de una location compartida

> Todos los miembros son `users` con acceso a una misma sub-cuenta de JoinsClee.

**✅ VEREDICTO: SÍ, automatizable con confianza alta.**

```http
DELETE https://services.leadconnectorhq.com/users/{userId}
Authorization: Bearer <PIT_DE_AGENCIA>
Version: 2021-07-28
Accept: application/json
```

- **Scope:** `users.write` · **Token:** `Agency-Access` **o** `Location-Access`. El spec define literalmente `Agency-Access` como *"Access Token generated with user type as Agency **(OR) Private Integration Token of Agency**"* → **el PIT de agencia sirve**.
- **Respuesta 200:** `{"succeded": true, "message": "Queued deleting user with e-mail ..."}`
- ⚠️ **Dos gotchas confirmados en el spec:**
  1. El campo es **`succeded`** (typo de HighLevel, una sola "e"). La web de docs muestra `succeeded`. **Valida ambos.**
  2. **El borrado es ASÍNCRONO/encolado + soft-delete.** No leas inmediatamente después.
- **Verificación diferida (endpoint correcto para esto):**
  ```http
  POST /users/search/filter-by-email
  { "companyId": "...", "emails": "a@b.co,c@d.co", "deleted": true, "projection": "all" }
  ```
  ⚠️ Este endpoint es **el único de `/users` que solo acepta `Agency-Access`**. `emails` es un **CSV string**, no un array. Sin `projection:"all"` solo devuelve `id` y `email`.
- **Alternativa "desactivar sin borrar": NO EXISTE.** No hay `isActive` / `status` / `disabled` / `suspended` en `CreateUserDto`, `UpdateUserDto` ni `UserSchema` (verificado en v2 **y** v3). `deleted` existe pero es de **lectura/filtro**, no de escritura. Es un feature request abierto desde ~2022 con 52 votos.
- **Workaround de desactivación blanda** (un solo `PUT /users/{userId}`): `{ companyId, locationIds: [], scopes: [], scopesAssignedToOnly: [], password: <rotado> }`. El spec confirma *"If passed empty all the scopes will get disabled"*. **🟡 INCIERTO:** no está documentado si con `locationIds: []` el login falla o el usuario entra a una pantalla vacía. **No construyas sobre esto sin probarlo.**

> ⚠️ **Advertencia de producto sobre el Modelo A:** en una location compartida todos los miembros ven la misma base de contactos salvo que fuerces `permissions.assignedDataOnly: true`. Para un bono tipo "tu propia cuenta de GHL", este modelo probablemente no es lo que se prometió.

### 1.B — Modelo B: sub-cuenta (location) propia por miembro

> Cada miembro recibe su propia sub-cuenta, creada con `POST /locations/` + `snapshotId`.

**⚠️ VEREDICTO: SÍ para revocar el ACCESO — NO con certeza para borrar la SUB-CUENTA.**

| Operación | Endpoint | Veredicto |
|---|---|---|
| **Revocar acceso** | `DELETE /users/{userId}` (uno por cada user de esa location) | ✅ **CIERTO — automatizable** |
| Pausar la sub-cuenta | `POST /saas/pause/{locationId}` · body `{ "paused": true, "companyId": "..." }` | 🟡 **INCIERTO — best-effort** |
| Borrar la sub-cuenta | `DELETE /locations/{locationId}?deleteTwilioAccount=true` | ❌ **CONTRADICCIÓN — trátalo como manual** |

**Por qué el DELETE de location no es confiable:** las dos fuentes oficiales se contradicen.
- `apps/locations.json` y `apps/v3/locations-v3.json` → `security: [{"Agency-Access": ["locations.internal-access-only"]}]`
- `docs/oauth/Scopes.md` (línea 137) → dice que `locations.write` cubre `DELETE /locations/:locationId`

`locations.internal-access-only` **no aparece en la tabla de scopes seleccionables** — el nombre sugiere que es un scope reservado a HighLevel. **Nadie pudo confirmar con fuente pública que un PIT de agencia o una app de Marketplace pueda ejecutarlo, o si devuelve 401.**

**Por qué el pause tampoco es confiable:**
- El `securityScheme` de la spec SaaS describe el bearer como *"Access Token generated by exchanging API Key for token id"* con *"user type as Company"* — **no menciona Private Integration Token**, a diferencia de la spec de locations que sí lo menciona explícitamente. 🟡 Puede que la SaaS API exija OAuth de app y rechace PIT.
- Reportes de comunidad indican **401** por faltar headers `channel: OAUTH` y `source: INTEGRATION`, que **no están en la spec**.
- Usa el prefijo **`/saas/`**, NO `/saas-api/public-api/` (deprecado). Casi todo el material que circula apunta al viejo.
- Requiere que SaaS Mode esté habilitado en esa sub-cuenta.

### 🔑 La decisión que resuelve ambos modelos

> **La unidad de revocación es el USUARIO, no la sub-cuenta — en los dos modelos.**

Borrar el usuario:
- ✅ Está documentado sin contradicciones y funciona con PIT de agencia.
- ✅ Corta el login inmediatamente (a diferencia del workaround `locationIds: []`, que es incierto).
- ✅ Es **reversible**: si el miembro vuelve, se recrea con `POST /users/` sobre la misma location, con sus datos intactos.
- ✅ Deja la sub-cuenta viva pero inaccesible, y **una sub-cuenta inactiva cuesta ~$0** — el costo de GHL es por consumo (SMS/email/AI vía wallet), no por número de sub-cuentas (ilimitadas en Unlimited $297 y Pro $497).

**⚠️ Fuga de acceso crítica en el Modelo B:** si al miembro se le dio `role: "admin"` de su propia sub-cuenta, **puede haber creado usuarios adicionales**. Borrar solo el usuario que aprovisionaste deja la puerta abierta. **Enumera y borra todos:**

```bash
curl -G "https://services.leadconnectorhq.com/users/search" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" -H "Version: 2021-07-28" \
  --data-urlencode "companyId=$COMPANY_ID" \
  --data-urlencode "locationId=$MEMBER_LOCATION_ID" \
  --data-urlencode "limit=100"
```
⚠️ `companyId` es **obligatorio** aquí incluso con token de Location; sin él → `422`.

### Lo que NO debes usar

| Vía | Por qué no |
|---|---|
| **MCP de GHL (`/mcp/`, las 36 tools)** | No expone users ni locations más allá de dos lecturas. **Imposible.** |
| **MCP `/mcp/anthropic/v2`** | Declara los dominios `Users`, `Sub-Account`, `SaaS`, pero **no documenta las operaciones concretas** y advierte que *"las operaciones sensibles e irreversibles están protegidas con confirmación adicional"*. No determinista para un cron. |
| **API v1 (API Key legada)** | HighLevel **deshabilitó explícitamente** los endpoints v1 de crear/actualizar/borrar usuarios por seguridad (atacantes creando usuarios no autorizados). Fin de soporte 31-dic-2025. **Muerta.** |
| `GET /users/?locationId=...` | **DEPRECADO.** Usa `GET /users/search`. |

---

## 2. VEREDICTO: cómo detectar una baja en Skool

### Webhooks: no existen. Punto.

Esto está **verificado por ingeniería inversa del bundle de producción de Skool**, no por búsqueda web:

- El plugin que se llama **"Webhook"** (`adminWebhook`) es **ENTRANTE**: su descripción literal en el código es *"Invite members to your group with a simple webhook"* y la UI dice *"Append emails to the end of your webhook URL"*. **Skool no te manda nada.**
- ❌ No existe `member.left`, `subscription.cancelled`, `payment.failed`, ni pantalla de eventos salientes con secret de firma.
- **Zapier tiene exactamente 2 triggers** (*New Paid Member*, *Answered Membership Questions*) y 2 actions (*Invite Member*, *Unlock Course*). Ninguno de cancelación, ni una action "Remove member".
- **Make.com no tiene app real** — la página oficial dice que no pueden documentarla por falta de información pública.
- **Stripe:** Skool cobra por Stripe Connect. 🟡 **INCIERTO y probablemente NO**: en Connect estándar el *platform* (Skool) es dueño de la cuenta y el owner del grupo normalmente **no puede registrar webhooks propios**. No lo des por hecho.

**→ La única señal disponible es el endpoint interno de Next.js.** No hay alternativa.

### La comparación real no es "webhook vs scraping" — es "diff de snapshots vs lectura de estado explícito"

Ambas opciones son scraping del mismo endpoint. La diferencia está en **qué campo lees**.

| | **Opción A — Diff de snapshots** (lo que hace hoy SAVIAS) | **Opción B — Lectura de estado explícito** ✅ |
|---|---|---|
| Método | Bajar `t=active`, borrar de la tabla espejo lo que ya no aparece | Barrer `t=active` + `t=cancelling` + `t=churned` y leer `billingCanceled`, `churned`, `mbscpe` |
| Latencia de detección | **~30 días tarde.** Skool NO expulsa al cancelar: *"You will be removed from the group at the end of your billing cycle"*. La baja solo se "ve" cuando ya lo expulsó. | **El mismo día.** Y además te da la **fecha exacta de corte**. |
| Falsos positivos | **Altos.** Cualquier fallo de scraping (cookie vencida, `buildId` rotado, página que falló) se traduce en "desapareció → bórralo". | **Bajos.** El estado es afirmativo: un `member.churned` con fecha es un hecho, no una ausencia. |
| Distingue "canceló" de "ya salió" | ❌ No | ✅ Sí — y eso importa, porque **`billingCanceled` es reversible** (existe `uncancelSubscription`, y Skool ofrece "Change plan instead?" + video de retención) |
| Robustez ante cambios de Skool | Frágil y **silenciosa** | Frágil pero **detectable** (canario sobre `billingCanceled === undefined`) |

### ✅ RECOMENDACIÓN: Opción B, con el diff degradado a señal secundaria que nunca borra sola

```
GET https://www.skool.com/_next/data/{buildId}/{group}/-/members.json?t={tab}&p={n}
Cookie: auth_token=...; client_id=...
x-nextjs-data: 1
Referer: https://www.skool.com/{group}/-/members
```

**Valores de `t` — lista completa y cerrada (verificada en el bundle):** `active`, `cancelling`, `churned`, `banned` (admin) · `member`, `admin`, `online` (no-admin).
❌ **NO existen** `inactive`, `cancelled`/`canceled`, `pending`, `all`. Un `t` inválido cae al default = comportamiento de `active` (silencioso y peligroso).

**Mapa de decisión:**

| Tab | Campo canónico | Significado | Acción |
|---|---|---|---|
| `t=active` | `!billingCanceled && !billingDeclined && !churned` | Tiene acceso | Nada |
| `t=cancelling` | **`member.billingCanceled`** truthy | Canceló, **AÚN tiene acceso** hasta `metadata.mbscpe` | **Solo avisar.** Guardar `churn_at`. **NUNCA revocar aquí.** |
| `t=cancelling` | **`member.billingDeclined`** truthy | Pago rechazado, en reintentos hasta `metadata.mbsfprt` | Solo avisar (🟡 el tab exacto donde cae es inferencia) |
| **`t=churned`** | **`member.churned`** (fecha ISO) | **Ya perdió el acceso** | ✅ **Revocar en GHL** |
| `t=churned` | `metadata.freeTrialChurnedAt` | Trial vencido sin convertir | ✅ Revocar |
| `t=banned` | `metadata.bannedAt` (⚠️ **nanosegundos**, `/1e6` → ms) | Expulsado | ✅ Revocar |

**Campos de payload confirmados:** email real en `member.metadata.mbme` (fallback: `member.inviteEmail`, luego respuesta "email" del survey) · plan en `member.metadata.mmbp` (JSON-string → `.tier` ∈ `standard|premium|vip`, `.recurring_interval`, `.isFreeTrial`, `.amount` en centavos) · LTV en `member.metadata.mbsltv` (centavos).

⚠️ **Bug latente heredado de la edge function de SAVIAS:** `totalPages` sí vive en `pageProps`, pero los conteos de churn **NO** — `totalCancellingMembers`, `totalChurnedMembers` y `totalBannedMembers` están en **`pageProps.renderData.*`**. Si lees churn desde el top-level, obtienes `undefined` silencioso.

❌ **Campos que NO existen — no los busques:** `cancel_at_period_end`, `subscription_status`, `status`, `canceledAt`, `cancelAt`, `billing_canceled`. Son nomenclatura de Stripe.

**Vía oficial alternativa descartada:** el export CSV (`POST /groups/{id}/request-bulk-action?type=bulk-export-csv&member-status={tab}`) acepta las mismas 4 pestañas, pero **trae menos datos que el JSON** (sin fecha de churn ni price point) y exige verificación por email. No sirve para un cron.

---

## 3. CONTRADICCIONES Y DATOS INCIERTOS

### Contradicciones directas entre informes o entre fuentes oficiales

| # | Contradicción | Impacto | Cómo se resuelve |
|---|---|---|---|
| **C1** | `DELETE /locations/{id}`: el OpenAPI exige `locations.internal-access-only`; `Scopes.md` dice `locations.write`. | 🔴 **Bloquea** el borrado automático de sub-cuentas | Smoke test T5 |
| **C2** | El informe **ghl-mcp** afirma *"`users.write` NO permite crear usuarios de agencia"*. El informe **ghl-users-api** documenta `type: "agency"` como valor válido de `CreateUserDto` sin restricción. | 🟡 Bajo (nuestros usuarios son `type: "account"`) | Irrelevante si nunca creas usuarios de agencia — **no lo hagas** |
| **C3** | Rate limits SaaS: **ghl-mcp** dice *"límite de 10 req/s"*; **ghl-subaccounts** y **ghl-users** dicen 100 req/10s (=10/s promedio) + 200k/día. | 🟢 Compatibles en la práctica | Leer los headers `X-RateLimit-*` en runtime |
| **C4** | Respuesta del DELETE de usuario: el spec dice **`succeded`**, la web de docs dice `succeeded`. | 🟡 Rompe la validación en código | **Valida ambos.** Es una línea. |
| **C5** | `docs/oauth/Scopes.md` está desactualizado: no lista `GET /users/search` ni `POST /users/search/filter-by-email`. | 🟢 Bajo | Confía en el OpenAPI del repo, no en la tabla |

### Datos INCIERTOS (nadie los pudo confirmar con fuente pública)

| # | Incierto | Impacto | Marcado por |
|---|---|---|---|
| **U1** | ¿Aparecen `users.readonly` / `users.write` en el **selector de scopes del PIT de nivel Agencia**? HighLevel no publica esa lista en ninguna parte. Si no aparecen, la única vía es una app OAuth con Target User = Agency. | 🔴 **Bloquea todo el diseño** | ghl-users-api |
| **U2** | ¿La SaaS API acepta **Private Integration Token** o exige OAuth de app? El securityScheme SaaS no menciona PIT. | 🟠 Mata el pause automático | ghl-subaccounts |
| **U3** | Headers `channel: OAUTH` / `source: INTEGRATION` en `/saas/*` — reportados por comunidad, **ausentes de la spec**. | 🟠 401 inexplicable | ghl-subaccounts |
| **U4** | ¿Cómo se cuentan los **rate limits para un PIT**? La doc habla solo "per Marketplace app". | 🟡 Medio | ghl-users-api |
| **U5** | `POST /locations/` *"only available on Agency Pro ($497)"* — solo en el spec, sin confirmación de soporte. | 🟠 Costo de $200/mes | ghl-subaccounts |
| **U6** | **¿Un miembro con `billingCanceled` aparece TAMBIÉN en `t=active`?** La lectura del código sugiere que sí (el conteo de `active` usa `totalMembers`). | 🔴 **Cambia la lógica del diff por completo** | skool-cancel-detection |
| **U7** | Valor string exacto de `X0.LIFETIME` en `recurring_interval`. Un lifetime nunca churnea. | 🟡 Falso positivo posible | skool-cancel-detection |
| **U8** | ¿En qué tab cae exactamente `billingDeclined`? (inferencia: `cancelling`) | 🟡 Medio | skool-cancel-detection |
| **U9** | Con `locationIds: []` en `PUT /users/{id}`, ¿el login falla o entra a pantalla vacía? | 🟡 Solo si usas el workaround blando | ghl-users-api |
| **U10** | ¿El owner del grupo Skool puede registrar webhooks propios en la Stripe Connect? (probablemente NO) | 🟢 Bajo — no dependemos de ello | skool-cancel-detection |
| **U11** | `member.metadata.mbme` se describe como *"email del miembro (ofuscado)"* pero la edge function de SAVIAS lo usa en producción como email real. | 🟠 Si estuviera ofuscado, el matching con GHL falla | Ya validado en producción SAVIAS — verificar en el grupo de JoinsClee |

### No es contradicción, es "no hay contrato"

**Nada del endpoint `_next/data` es API pública.** No hay contrato de estabilidad, no hay versionado, no hay changelog. Skool puede renombrar `billingCanceled` en cualquier deploy y el sync fallará **silenciosamente**. Esto no es un riesgo mitigable — es una restricción de diseño permanente.

---

## 4. RIESGOS DEL DISEÑO

### 4.1 Falsos positivos que borrarían a alguien legítimo 🔴

Este es el riesgo dominante: **el borrado de un usuario de GHL no tiene endpoint de undelete documentado. Trátalo como irreversible.**

| Riesgo | Escenario | Mitigación |
|---|---|---|
| **Cookie de Skool expirada** | `auth_token`/`client_id` caducan → el endpoint redirige a `/login` → parseas 0 miembros → **"todos se fueron" → borrado masivo** | **Circuit breaker antes de tocar GHL**: si `isLoginPage`, aborta y alerta. La edge function de SAVIAS ya lo detecta — **hay que hacer que ABORTE, no solo que avise** |
| **`buildId` rotado** (~semanal) | La URL da 404 o HTML → mismo resultado | Si la regex `/"buildId"\s*:\s*"([^"]+)"/` falla → aborta |
| **Paginación parcial** | La página 3 de 5 da 500 → 60 miembros "desaparecieron" | Exigir barrido completo: comparar el conteo recolectado contra `pageProps.total`. Discrepancia → aborta |
| **Caída porcentual anómala** | Cualquier fallo no previsto | **Si `active` cae >20% vs. la corrida anterior → aborta y pide aprobación humana** |
| **`billingCanceled` es REVERSIBLE** | Existe `uncancelSubscription`; Skool ofrece "Change plan instead?" + video de retención. Un miembro puede ir `cancelling → active` | **Nunca revocar en `cancelling`.** Solo en `churned` |
| **`billingDeclined` transitorio** | Tarjeta rechazada, reintento exitoso 2 días después | Igual: solo `churned` revoca |
| **Miembro lifetime** (U7) | `recurring_interval === LIFETIME` no tiene `mbscpe` → lógica de fechas puede clasificarlo mal | Excluir explícitamente lifetime de la cola |
| **Skool renombra un campo** | Deploy silencioso | **Canario**: si `pageProps.users[0].member.billingCanceled === undefined` en todos los registros de `t=cancelling` con `total > 0` → alerta roja y aborta |
| **Ejecuciones concurrentes** | Cron se solapa con una corrida manual | Lock por advisory lock en Postgres |

**Defensas en profundidad (las tres, no una):**
1. **Regla de 3 strikes**: un miembro entra a la cola solo tras **3 corridas consecutivas** confirmando la baja (`missing_streak >= 3` o `churned` estable).
2. **Tope duro**: máximo **5 revocaciones automáticas por corrida**. Si se excede → no revoca ninguna, notifica a Slack pidiendo aprobación.
3. **`DRY_RUN=true` las primeras 2 semanas**: escribe en la tabla y notifica a Slack, pero no llama a GHL. Se compara a mano.

### 4.2 Desajuste de email entre Skool y GHL 🟠

**El problema:** el email con el que alguien se registra en Skool no tiene por qué ser el mismo con el que le creaste la cuenta de GHL. Y **GHL ya no permite actualizar el email de un usuario por API** (*"Email update is no longer supported due to security reasons"*), así que ni siquiera puedes sincronizarlos.

**Mitigaciones:**
- **Nunca resolver por email en el momento de revocar.** La tabla `community_members` guarda `ghl_user_id` y `ghl_location_id` **en el momento del aprovisionamiento**. Esa es la llave. El email es solo fallback de diagnóstico.
- Guardar los dos emails por separado: `skool_email` (de `mbme`) y `ghl_email` (el que realmente usaste al crear).
- Si en una corrida un `churned` no tiene `ghl_user_id` mapeado → **no adivines por email**: emite tarea manual a Slack.
- **Capturar el email de GHL en el flujo de alta**, no derivarlo. Si el aprovisionamiento es manual hoy, la tabla debe llenarse manualmente también.

### 4.3 Rate limits 🟡

| Sistema | Límite | Riesgo real |
|---|---|---|
| **GHL** | 100 req/10s burst · 200.000/día, por app y por recurso. 🟡 **U4: no confirmado para PIT** | Bajo con un cron diario. **Lee los headers `X-RateLimit-Remaining` y `X-RateLimit-Daily-Remaining` en runtime en vez de asumir.** |
| **Skool** | **Sin límites documentados** (no hay API pública) | Real pero desconocido. Paginar en serie con pausa de ~300 ms, no en paralelo. Un barrido de 3 tabs × N páginas de 30 es pequeño. |
| **Slack** | **1 msg/s por webhook.** 429 con `Retry-After` | **Antipatrón fatal: un mensaje por miembro dado de baja.** Con 30 bajas revientas el límite y spameas el canal. **Siempre agregar en un único mensaje.** |

### 4.4 Otros riesgos

- **Consistencia eventual del DELETE de GHL** 🟡 — es encolado (*"Will take effect in a few minutes"*). Verificar en la **corrida siguiente** con `filter-by-email` + `deleted: true`, no en el mismo request. Si sigue vivo tras 2 corridas → escalada roja.
- **Fuga de acceso por usuarios secundarios** 🟠 — si el miembro es admin de su sub-cuenta y creó más usuarios, borrar solo el tuyo no revoca nada. **Enumerar y borrar todos los users de la location.**
- **Destrucción de datos del cliente** 🟠 — `DELETE /locations/{id}` destruye todo lo que ese miembro construyó. Si algún día se automatiza: período de gracia + export previo. Es riesgo reputacional, no solo técnico.
- **Wallet borrado** 🟡 — al desactivar SaaS de una sub-cuenta, el wallet **se elimina permanentemente**; el reembolso es manual. No desactives SaaS como parte del cron.
- **PII en Slack** 🟠 — el payload lleva emails de clientes. **Canal privado, obligatorio.**
- **Notificación repetida** 🟡 — si el cron corre y la baja no se ha resuelto, se notifica cada día. Columna `revoke_notified_at` + filtro.
- **Canal ruidoso = canal silenciado** 🟡 — no mandes mensaje cuando no hay bajas. Latido verde semanal como dead-man's switch.
- **Costo** 🟡 — sub-cuentas ilimitadas en Unlimited/Pro, el costo es por consumo (wallet). **100 sub-cuentas inactivas cuestan ~$0; 100 mandando SMS sí cuestan.** Si son un bono gratis: **desactiva rebilling y limita features** vía `permissions` al crear el usuario, o el consumo lo pagas tú.
- **Rotación del PIT** 🟢 — HighLevel recomienda rotar cada 90 días, con 7 días de gracia donde ambos tokens funcionan. Ponlo en el calendario; máximo 5 PIT por agencia.

---

## 5. ARQUITECTURA RECOMENDADA (10 líneas)

1. **Fuente de verdad = tabla `community_members` en Supabase** (espejo Skool ↔ GHL), llaveada por `skool_member_id` **y `ghl_user_id` capturado al aprovisionar**; nunca re-resolver por email al momento de revocar.
2. **Una sola Edge Function `sync-skool-ghl`** — fork del `sync-skool-members` de SAVIAS, que ya resuelve cookies de admin, extracción de `buildId` y alerta de cookie expirada — disparada por `pg_cron` + `pg_net`, 1×/día a las 06:00 America/Bogotá.
3. **Barre tres pestañas** de `https://www.skool.com/_next/data/{buildId}/{group}/-/members.json` con `t=active`, `t=cancelling`, `t=churned`, paginando `p` hasta `pageProps.totalPages`, leyendo conteos de **`pageProps.renderData.*`**.
4. **Circuit breaker ANTES de tocar GHL:** aborta sin escribir si hay `isLoginPage`, si no se extrajo `buildId`, si alguna página falló, si `active` cae >20% vs. la corrida anterior, o si el canario `billingCanceled === undefined` se dispara.
5. **Máquina de estados:** `active` → nada · `cancelling` → guarda `churn_at = metadata.mbscpe` y **solo avisa** · `churned`/`banned` → cola de revocación · desaparecido de las tres pestañas → `missing_streak++`, entra a la cola solo tras **3 corridas consecutivas**.
6. **Revocar = `DELETE /users/{userId}`** (`Version: 2021-07-28`, PIT de Agencia, scope `users.write`) sobre **todos** los usuarios de la location del miembro, enumerados con `GET /users/search?companyId=…&locationId=…&limit=100` — no solo el que aprovisionaste.
7. **Verificación diferida:** la corrida siguiente confirma con `POST /users/search/filter-by-email` (`deleted: true`, `projection: "all"`, solo Agency-Access); si el usuario sigue vivo tras 2 corridas → escalada roja a Slack.
8. **La sub-cuenta NO se borra por API:** intento *best-effort* de `POST /saas/pause/{locationId}` `{paused:true, companyId}` y, salga como salga, se emite **tarea manual en Slack con link directo**; `DELETE /locations/{id}` queda como operación humana hasta que el smoke test T5 lo desbloquee.
9. **Slack = un único mensaje agregado por corrida** (`attachments[0].color` + `blocks` adentro, botones solo tipo `url` → cero superficie interactiva, cero backend), **canal privado por PII**, idempotente vía `revoke_notified_at`, silencio si no hubo bajas + latido verde semanal.
10. **Frenos de mano:** `DRY_RUN=true` las primeras dos semanas, tope duro de **5 revocaciones automáticas por corrida** (si se excede: no revoca nada y pide aprobación humana en Slack), y advisory lock en Postgres contra corridas solapadas.

---

## Apéndice A — Smoke tests OBLIGATORIOS antes de escribir código

Estos 6 tests resuelven las incertidumbres que pueden invalidar el diseño. **Corre T1, T2 y T3 primero: si T1 falla, todo cambia.**

| # | Test | Resuelve | Si falla… |
|---|---|---|---|
| **T1** | Entrar al panel de **agencia** → Settings → Private Integrations → Create → **¿aparecen `users.readonly` y `users.write` en el selector?** | **U1** | La única vía es una app OAuth de Marketplace con **Target User = Agency**. Cambia el setup completo. |
| **T2** | `DELETE /users/{id}` sobre un usuario desechable. Ver si el campo es `succeded` o `succeeded`. Esperar 5 min y confirmar con `filter-by-email` + `deleted:true`. | **C4**, latencia real | Ajustar validación y el intervalo de verificación diferida. |
| **T3** | Correr el bucle `for T in active cancelling churned banned` del informe de Skool contra el grupo real de JoinsClee. **¿Los emails de `cancelling` salen TAMBIÉN en `active`?** | **U6**, **U8**, **U11** | Si hay solapamiento, el diff contra `active` no detecta cancelaciones — solo `t=cancelling` lo hace. Confirma también que `mbme` trae emails reales. |
| **T4** | `POST /saas/pause/{locationId}` con PIT de agencia. Si da 401, reintentar con `-H 'channel: OAUTH' -H 'source: INTEGRATION'`. | **U2**, **U3** | El pause queda fuera; la línea 8 se vuelve 100% manual. |
| **T5** | `DELETE /locations/{id}?deleteTwilioAccount=false` sobre una sub-cuenta desechable. | **C1** | Si da 200, se puede automatizar el borrado de sub-cuenta (con período de gracia). Si da 401, queda confirmado como manual permanente. |
| **T6** | `POST /locations/` en el plan actual de la agencia. | **U5** | Si exige Agency Pro, son **$200/mes extra** o hay que crear las sub-cuentas a mano en la UI. Decisión de negocio, no técnica. |

## Apéndice B — Esquema mínimo

```sql
create table community_members (
  skool_member_id     text primary key,
  skool_email         text not null,          -- member.metadata.mbme
  ghl_email           text,                   -- el REAL usado al crear en GHL (puede diferir)
  ghl_user_id         text,                   -- ← LLAVE DE REVOCACIÓN, capturada al aprovisionar
  ghl_location_id     text,
  tier                text,                   -- JSON.parse(mmbp).tier
  status              text not null,          -- active|cancelling|churned|banned|revoked|error
  churn_at            timestamptz,            -- metadata.mbscpe (unix seg → tz)
  final_retry_at      timestamptz,            -- metadata.mbsfprt, si billingDeclined
  churned_at          timestamptz,            -- member.churned (ISO)
  billing_canceled    boolean not null default false,
  billing_declined    boolean not null default false,
  is_lifetime         boolean not null default false,
  missing_streak      int not null default 0, -- regla de 3 strikes
  revoke_notified_at  timestamptz,            -- idempotencia de Slack
  revoked_at          timestamptz,
  revoke_verified_at  timestamptz,            -- confirmado con filter-by-email deleted:true
  last_seen_at        timestamptz not null
);

create table sync_runs (                       -- para el circuit breaker de caída >20%
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  active_count int, cancelling_count int, churned_count int,
  aborted boolean not null default false,
  abort_reason text
);
```

## Apéndice C — Secrets

```bash
supabase secrets set \
  SKOOL_AUTH_TOKEN="..." SKOOL_CLIENT_ID="..." SKOOL_GROUP="joinsclee-xxxx" \
  GHL_AGENCY_PIT="pit-..." GHL_COMPANY_ID="..." \
  SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." \
  ADMIN_PANEL_URL="..." DRY_RUN="true" MAX_REVOKES_PER_RUN="5"
```
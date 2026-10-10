# GoHighLevel / LeadConnector API v2 — Gestión de Usuarios (investigación completa)

**Base URL:** `https://services.leadconnectorhq.com`
**Header de versión v2:** `Version: 2021-07-28`
**Fuente primaria (autoritativa):** el OpenAPI oficial publicado por HighLevel en su repo público: [`apps/users.json`](https://github.com/GoHighLevel/highlevel-api-docs/blob/master/apps/users.json) (v2) y [`apps/v3/users-v3.json`](https://github.com/GoHighLevel/highlevel-api-docs/blob/master/apps/v3/users-v3.json) (v3). Descargué y parseé ambos specs — todo lo que marco como confirmado sale de ahí o de las páginas oficiales que cito.

---

## 0. Mapa completo de la superficie `/users` en v2

| Método | Path | operationId | Scope | Token aceptado (según spec) |
|---|---|---|---|---|
| `GET` | `/users/search` | `search-users` | `users.readonly` | `Agency-Access` **o** `Location-Access` |
| `POST` | `/users/search/filter-by-email` | `filter-users-by-email` | `users.readonly` | **Solo `Agency-Access`** |
| `GET` | `/users/{userId}` | `get-user` | `users.readonly` | Agency o Location |
| `PUT` | `/users/{userId}` | `update-user` | `users.write` | Agency o Location |
| `DELETE` | `/users/{userId}` | `delete-user` | `users.write` | Agency o Location |
| `GET` | `/users/?locationId=...` | `get-user-by-location` | `users.readonly` | **Solo `Location-Access`** — ⚠️ **DEPRECADO** |
| `POST` | `/users/` | `create-user` | `users.write` | Agency o Location |

Definición literal de los security schemes en el spec:
- `Agency-Access`: *"Use the Access Token generated with user type as Agency (OR) Private Integration Token of Agency."*
- `Location-Access`: *"Use the Access Token generated with user type as Sub-Account (OR) Private Integration Token of Sub-Account."*

Esa frase es la respuesta oficial a tu pregunta 5: **el PIT de agencia SÍ cuenta como `Agency-Access`** para estos endpoints.

Todos los endpoints existen también en **v3** con exactamente los mismos paths, scopes y security schemes; lo único que cambia es `Version: v3` en vez de `Version: 2021-07-28`. (Confirmado parseando `users-v3.json`, `servers: https://services.leadconnectorhq.com`.)

---

## 1. CREAR usuario

**`POST https://services.leadconnectorhq.com/users/`** → `201 Created`
**Scope:** `users.write` · **Token:** Agency o Location

Campos **requeridos** (`CreateUserDto.required` del spec):
`companyId`, `firstName`, `lastName`, `email`, `password`, `type`, `role`, `locationIds`

| Campo | Tipo | Notas (texto del spec v3, más descriptivo) |
|---|---|---|
| `companyId` | string | "Company/Agency ID to associate the user with" |
| `email` | string | "Email address of the user (used for login)" |
| `password` | string | **Mín. 12 caracteres, ≥1 mayúscula, ≥1 minúscula, ≥1 número, ≥1 carácter especial** |
| `firstName` / `lastName` | string | — |
| `type` | string | `"account"` = usuario de sub-cuenta · `"agency"` = usuario a nivel agencia |
| `role` | string | `"admin"` o `"user"` |
| `locationIds` | string[] | sub-cuentas a las que se le da acceso |
| `phone` | string | opcional, E.164 |
| `permissions` | object | opcional, 38 flags booleanos (ver §7) |
| `scopes` | string[] | opcional, **189 valores enum**. "Only scopes that have been passed will be enabled. **If passed empty all the scopes will get disabled**" |
| `scopesAssignedToOnly` | string[] | opcional, mismo enum, versión "solo datos asignados" |
| `profilePhoto` | string (URL) | opcional |
| `twilioPhone` | object | opcional, mapa `{locationId: "+1..."}`. **Semántica de reemplazo total**, ver §8 |
| `platformLanguage` | string | opcional, enum: `en_US, es, fr_CA, fr_FR, nl, de, pt_PT, pt_BR, it, sv, da, fi, no` |

```bash
curl -X POST "https://services.leadconnectorhq.com/users/" \
  -H "Authorization: Bearer pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "companyId": "ve9EPM428h8vShlRW1KT",
    "firstName": "Lina",
    "lastName": "Toro",
    "email": "lina@savias.co",
    "password": "Savias#2026Segura!",
    "phone": "+573001112233",
    "type": "account",
    "role": "user",
    "locationIds": ["C2QujeCh8ZnC7al2InWR"],
    "permissions": {
      "contactsEnabled": true,
      "conversationsEnabled": true,
      "appointmentsEnabled": true,
      "settingsEnabled": false,
      "assignedDataOnly": true
    },
    "scopes": ["contacts.write", "conversations.write", "conversations/message.write"],
    "platformLanguage": "es"
  }'
```

Respuesta `201` (`UserSuccessfulResponseDto`): `id`, `name`, `firstName`, `lastName`, `email`, `phone`, `extension`, `permissions`, `scopes`, `roles` (`{type, role, locationIds, restrictSubAccount}`), `lcPhone`, `platformLanguage`.

Errores documentados: `400 BadRequestDTO`, `401 UnauthorizedDTO`, `422 UnprocessableDTO`.

Docs web: [Create User (v2 / 2021-07-28)](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/users/create-user/) · [Create User (v3, default)](https://marketplace.gohighlevel.com/docs/ghl/users/create-user/)

---

## 2. ELIMINAR usuario

**`DELETE https://services.leadconnectorhq.com/users/{userId}`** → `200 OK`
**Scope:** `users.write` · **Token:** Agency o Location

```bash
curl -X DELETE "https://services.leadconnectorhq.com/users/0IHuJvc2ofPAAA8GzTRi" \
  -H "Authorization: Bearer pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  -H "Version: 2021-07-28" \
  -H "Accept: application/json"
```

Respuesta (`DeleteUserSuccessfulResponseDto`), ejemplo literal del spec:

```json
{
  "succeded": true,
  "message": "Queued deleting user with e-mail john@deo.com and name John Deo. Will take effect in a few minutes."
}
```

⚠️ **Dos gotchas reales, ambos verificados en el spec:**
1. El campo se llama **`succeded`** (typo de HighLevel, una sola "e" en el medio). Si validas `succeeded` te va a dar `undefined`. La página web de docs sí muestra `succeeded` — **INCIERTO** cuál devuelve la API real hoy; **valida ambos** en tu código.
2. **El borrado es asíncrono / encolado.** No asumas consistencia inmediata: si borras y listas acto seguido, el usuario probablemente todavía aparezca. Espera y re-verifica con `GET /users/{userId}` o con `filter-by-email`.

⚠️ El spec v2 **omite declarar el path param `userId`** en `PUT` y `DELETE` (bug del OpenAPI). El path template sí lo lleva, y funciona. No es que el ID vaya en el body.

Docs: [Delete User](https://marketplace.gohighlevel.com/docs/ghl/users/delete-user/)

---

## 3. ACTUALIZAR usuario · ¿se puede desactivar sin borrar?

**`PUT https://services.leadconnectorhq.com/users/{userId}`** → `200 OK`
**Scope:** `users.write` · **Token:** Agency o Location

`UpdateUserDto` **no tiene campos requeridos** — es un patch parcial. Campos aceptados:

| Campo | Nota |
|---|---|
| `firstName`, `lastName`, `phone`, `profilePhoto`, `platformLanguage` | — |
| `email` | ⚠️ **"Email update is no longer supported due to security reasons."** (texto literal del spec) — el campo sigue en el DTO pero está muerto |
| `password` | mismas reglas de complejidad (12+ chars, etc.) |
| `type` | `"account"` / `"agency"` |
| `role` | `"admin"` / `"user"` |
| `companyId` | **"Required for Agency Level access"** — si usas token de agencia, mándalo |
| `locationIds` | **← esto es lo que usas para quitar acceso a una location** |
| `permissions` | objeto de 38 flags |
| `scopes`, `scopesAssignedToOnly` | reemplazo total, no merge |
| `twilioPhone` | reemplazo total |

### Quitarle acceso a una location

No hay endpoint tipo `DELETE /users/{id}/locations/{locationId}`. Se hace **reenviando el array `locationIds` completo sin la location que quieres quitar** (semántica de reemplazo):

```bash
# 1) leer el estado actual
curl -s "https://services.leadconnectorhq.com/users/0IHuJvc2ofPAAA8GzTRi" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" \
  -H "Version: 2021-07-28" -H "Accept: application/json" | jq '.roles.locationIds'
# → ["locA","locB","locC"]

# 2) reescribir sin locB
curl -X PUT "https://services.leadconnectorhq.com/users/0IHuJvc2ofPAAA8GzTRi" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "companyId": "ve9EPM428h8vShlRW1KT",
    "locationIds": ["locA","locC"]
  }'
```

### ¿Se puede DESACTIVAR sin borrar? — **NO, no existe.**

- **No hay campo `isActive`, `active`, `status`, `disabled` ni `suspended`** en `CreateUserDto`, `UpdateUserDto`, `UserSchema` ni `UserSuccessfulResponseDto`. Verificado propiedad por propiedad en el spec v2 **y** v3.
- **Sí existe `deleted: boolean`** en `UserSchema` (lectura) y como **filtro** en `FilterByEmailDto`. Pero es un campo de **salida/filtro**, no de escritura: `UpdateUserDto` no lo acepta. Es el flag interno del soft-delete que produce el `DELETE`.
- La funcionalidad de "desactivar usuario" es un **feature request abierto** en el board oficial desde ~2022, con 52 votos y sin respuesta oficial de HighLevel: [ideas.gohighlevel.com/crm/p/ability-to-deactivate-users](https://ideas.gohighlevel.com/crm/p/ability-to-deactivate-users).

**Workaround real de "desactivación blanda"** (lo que hace todo el mundo), en un solo `PUT`:

```bash
curl -X PUT "https://services.leadconnectorhq.com/users/0IHuJvc2ofPAAA8GzTRi" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "ve9EPM428h8vShlRW1KT",
    "locationIds": [],
    "scopes": [],
    "scopesAssignedToOnly": [],
    "role": "user",
    "password": "Rot4d0-Larg0-Seguro!2026"
  }'
```

Esto: le quita todas las sub-cuentas, **desactiva todos sus scopes** (el spec dice explícito: *"If passed empty all the scopes will get disabled"*) y le rota el password. El registro sigue existiendo con su historial. **INCIERTO:** no está documentado si con `locationIds: []` el usuario aún puede hacer login y ver una pantalla vacía, o si el login le falla. Hay que probarlo.

Docs: [Update User](https://marketplace.gohighlevel.com/docs/ghl/users/update-user/index.html)

---

## 4. LISTAR / BUSCAR usuarios (y buscar por email)

### 4.a — `GET /users/search` ✅ **el canónico**

**Scope:** `users.readonly` · **Token:** Agency o Location

| Param | Req | Ejemplo |
|---|---|---|
| `companyId` | **✅ sí, siempre** | `5DP41231LkQsiKESj6rh` |
| `query` | no | `John` (texto libre) |
| `locationId` | no | filtra por sub-cuenta |
| `type` | no | `agency` / `account` |
| `role` | no | `admin` / `user` |
| `ids` | no | CSV de userIds |
| `skip` / `limit` | no | default `0` / `25` |
| `sort` / `sortDirection` | no | `dateAdded` / `asc` |
| `enabled2waySync` | no | boolean |

```bash
curl -G "https://services.leadconnectorhq.com/users/search" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" \
  -H "Version: 2021-07-28" \
  -H "Accept: application/json" \
  --data-urlencode "companyId=ve9EPM428h8vShlRW1KT" \
  --data-urlencode "locationId=C2QujeCh8ZnC7al2InWR" \
  --data-urlencode "limit=100"
```

Respuesta: `{ "users": [UserSchema], "count": 1231 }`. Cada `UserSchema` trae `id, name, firstName, lastName, email, phone, extension, permissions, scopes, roles, deleted, lcPhone, platformLanguage`.

⚠️ **`companyId` es obligatorio incluso con token de Location.** Si no lo mandas → `422`.

### 4.b — Buscar por email: **SÍ, endpoint dedicado**

**`POST /users/search/filter-by-email`** — *"Filter users by company ID, deleted status, and email array"*
**Scope:** `users.readonly` · **⚠️ Token: SOLO `Agency-Access`** (el único endpoint de users sin variante Location)

`FilterByEmailDto` — requeridos: `companyId`, `emails`

| Campo | Notas |
|---|---|
| `companyId` | string, requerido |
| `emails` | **string CSV**, no array: `"user1@example.com,user2@example.com"` |
| `deleted` | boolean — filtra usuarios borrados |
| `skip` / `limit` | strings |
| `projection` | `"all"` para todos los campos, o CSV de campos. **Por defecto solo devuelve `id` y `email`** |

```bash
curl -X POST "https://services.leadconnectorhq.com/users/search/filter-by-email" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "companyId": "ve9EPM428h8vShlRW1KT",
    "emails": "lina@savias.co,andres@crece.co",
    "deleted": false,
    "projection": "all",
    "limit": "50"
  }'
```

Este es **el endpoint correcto para idempotencia** ("¿ya existe este usuario antes de crearlo?") y para verificar que un `DELETE` encolado ya surtió efecto (`deleted: true`).

### 4.c — `GET /users/?locationId=...` ⚠️ **DEPRECADO**

Texto literal del spec: *"Deprecated. Use `GET /users/search` instead. Pass `locationId` as a query parameter to filter results by location, along with the required `companyId` and other search filters as needed."* Solo acepta `Location-Access`. No lo uses en código nuevo.

### 4.d — `GET /users/{userId}`

```bash
curl "https://services.leadconnectorhq.com/users/0IHuJvc2ofPAAA8GzTRi" \
  -H "Authorization: Bearer $GHL_AGENCY_PIT" \
  -H "Version: 2021-07-28" -H "Accept: application/json"
```

---

## 5. AUTENTICACIÓN — las tres vías, y cuál te sirve

### A) Private Integration Token (PIT) — **lo que necesitas**

Definición oficial: *"Private Integrations are essentially static/fixed OAuth2 Access Tokens"* generados desde la UI, sin flujo de consentimiento. ([docs](https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/))

**Existen en dos niveles**, y esa es la distinción clave:

| | PIT de **Agencia** (Company) | PIT de **Sub-cuenta** (Location) |
|---|---|---|
| Security scheme | `Agency-Access` | `Location-Access` |
| Se crea en | Settings de la **agencia** → Private Integrations | Settings de la **sub-cuenta** → Private Integrations |
| `POST /users/` | ✅ | ✅ (según spec) |
| `DELETE /users/{id}` | ✅ | ✅ (según spec) |
| `POST /users/search/filter-by-email` | ✅ | ❌ **no permitido** |
| Límite | **5 PIT por agencia** | **5 PIT por location** |

**Cómo obtener el token de agencia:**
1. Entra al panel de **agencia** (no de sub-cuenta) → **Settings → Private Integrations → "Create new Integration"**
2. Nombre + descripción
3. **Selecciona los scopes** — marca lectura y escritura de usuarios
4. Copia el token. **Solo se muestra una vez.** (Editar la integración después NO regenera el token.)

Uso: `Authorization: Bearer <PIT>` + `Version: 2021-07-28`. No expira ni se refresca; HighLevel recomienda **rotarlo cada 90 días**, con **7 días de gracia** donde el viejo y el nuevo funcionan simultáneamente.

Permiso para crearlos: por defecto todos los agency admins. Se restringe en **Settings → Team → editar el admin → Roles & Permissions → Private Integrations**. ([artículo oficial](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know))

### B) OAuth 2.0 (app de Marketplace)

Token endpoint: `POST https://services.leadconnectorhq.com/oauth/token`

El parámetro decisivo es **`user_type`**: `"Company"` = token de **agencia**, `"Location"` = token de **sub-cuenta**.

```bash
curl -X POST "https://services.leadconnectorhq.com/oauth/token" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data client_id=TU_CLIENT_ID \
  --data client_secret=TU_CLIENT_SECRET \
  --data grant_type=authorization_code \
  --data code=EL_CODE_DEL_REDIRECT \
  --data user_type=Company \
  --data redirect_uri=https://tuapp.com/oauth/callback/highlevel
```

- Access token: **~24 h** (`expires_in: 86399`). Refresh token: **1 año**, y al usarlo recibes uno nuevo también de 1 año.
- El JWT trae `authClass: "Company"` y `companyId` para agencia; `authClass: "Location"` + `locationId` para sub-cuenta.
- Para que la app instale a nivel agencia, su **Target User debe ser "Agency"** — así solo el Agency Admin/Owner puede instalarla. ([docs](https://marketplace.gohighlevel.com/docs/Authorization/TargetUserAgency/index.html))
- Intercambiar token de agencia → token de location:
  ```bash
  curl -L "https://services.leadconnectorhq.com/oauth/locationToken" \
    -H "Authorization: Bearer <AGENCY_ACCESS_TOKEN>" \
    -H "Version: 2021-07-28" \
    -H "Content-Type: application/json" -H "Accept: application/json" \
    -d '{"companyId":"GNb7aIv4rQFV9iwNl5K","locationId":"HjiMUOsCCHCjtxEf8PR"}'
  ```
  ⚠️ Trampa clásica: un token de Company **no** puede leer recursos de location (ej. contacts) directamente — hay que canjearlo primero. Da 401 que parece error de scope y en realidad es error de jerarquía. **Pero `/users/` no sufre esto**: acepta el token de agencia directo.
  ([OAuth 2.0 docs](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html))

### C) API Key v1 (legado) — **muerta para usuarios**

- HighLevel **deshabilitó explícitamente los endpoints v1 de crear/actualizar/borrar usuarios** por seguridad. Razón oficial: los atacantes *"creating an unauthorised user using compromised API v1 keys"* para tomar control de la cuenta. ([changelog oficial](https://ideas.gohighlevel.com/changelog/security-update-disablement-of-users-apis-on-api-v1))
- *"New v1 API key creation is no longer supported"* — y las API keys inactivas 90+ días se **auto-eliminan**, con avisos a 15/7/1 días. ([API Security Initiatives](https://help.gohighlevel.com/support/solutions/articles/155000003697-api-security-initiatives))
- v1 llegó a fin de soporte el **31-dic-2025**; sin parches de seguridad ni soporte. ([post oficial de migración](https://www.gohighlevel.com/post/deprecating-the-highlevel-api-v1-and-migrating-to-v2))

**→ Para `users.write` a nivel AGENCIA: PIT de Agencia (más simple) u OAuth con `user_type=Company` (si vas a distribuir la app). v1 no es opción.**

---

## 6. Rate limits

Números oficiales ([docs/other/rate-limits](https://marketplace.gohighlevel.com/docs/other/rate-limits) y [OAuth FAQs](https://marketplace.gohighlevel.com/docs/oauth/Faqs/)):

- **Burst: 100 requests / 10 segundos**
- **Diario: 200,000 requests / día**
- Contados **por app de Marketplace (client) por recurso**, donde recurso = una Location **o** una Company. Cada instalación tiene su propio presupuesto independiente.

Headers de respuesta para monitorear:

| Header | Significado |
|---|---|
| `X-RateLimit-Limit-Daily` | límite diario |
| `X-RateLimit-Daily-Remaining` | requests restantes hoy |
| `X-RateLimit-Interval-Milliseconds` | ventana del burst (10000) |
| `X-RateLimit-Max` | máximo en esa ventana (100) |
| `X-RateLimit-Remaining` | restantes en la ventana actual |

⚠️ **INCIERTO:** la documentación describe los límites en términos de "per Marketplace app". **No dice explícitamente cómo se cuentan para un Private Integration Token** (que no es una app de marketplace). Lo razonable es asumir los mismos 100/10s y 200k/día por PIT, pero **no está confirmado por fuente**. Lee los headers en runtime en vez de asumir.

---

## 7. Scopes de usuarios y cómo se habilitan

### Los dos scopes de la API

Tabla oficial de [`docs/oauth/Scopes.md`](https://github.com/GoHighLevel/highlevel-api-docs/blob/master/docs/oauth/Scopes.md) (líneas 245-249), verbatim:

| Scope | API Endpoints | Access Type |
|---|---|---|
| `users.readonly` | `GET /users/` | **Sub-Account, Agency** |
| | `GET /users/:userId` | Sub-Account, Agency |
| `users.write` | `POST /users/` | **Sub-Account, Agency** |
| | `DELETE /users/:userId` | Sub-Account, Agency |
| | `PUT /users/:userId` | Sub-Account, Agency |

**Solo existen esos dos.** No hay `users.delete` ni `users.create` separados — `users.write` cubre POST + PUT + DELETE.

⚠️ Esa tabla está **desactualizada**: no lista `GET /users/search` ni `POST /users/search/filter-by-email`. Según el OpenAPI (más nuevo), ambos requieren **`users.readonly`**. Confía en el spec, no en la tabla.

⚠️ `.readonly` y `.write` son **independientes**: dar `write` NO implica `read`. Si tu integración lista *y* crea usuarios, **necesitas los dos**.

### Cómo habilitarlos en un Private Integration

**Settings → Private Integrations → Create new Integration → seleccionar scopes → Update/Create → copiar token.** Los scopes se editan después sin regenerar el token.

⚠️ **INCIERTO / hay que verificarlo en la UI:** HighLevel **no publica en ninguna parte la lista de scopes seleccionables en el selector de PIT**, ni si `users.readonly` / `users.write` aparecen ahí, ni si aparecen en el nivel de agencia. El artículo de soporte solo dice genéricamente *"select the scopes/permissions"*. Lo que **sí** está confirmado es que el spec declara el PIT de Agencia como credencial válida para `Agency-Access` en estos endpoints — pero eso presupone que el scope es marcable. **Verifica visualmente en tu panel de agencia antes de construir sobre esto.** Si `users.write` no aparece en el selector, tu única vía a nivel agencia es una app OAuth con Target User = Agency.

### No confundir: dos universos de "scopes"

Hay un choque de nombres que causa bugs reales:

1. **Scopes del TOKEN** (`users.readonly`, `users.write`) → qué puede hacer tu integración.
2. **Campo `scopes[]` del BODY** de `CreateUserDto`/`UpdateUserDto` → **189 permisos internos del usuario humano** dentro de la UI de GHL. Enum completo incluye cosas como `contacts.write`, `conversations/message.write`, `socialplanner/post.write`, `invoices.write`, `locations.create`, `users/team-management.write`, `loginas.write`, `audit-logs.readonly`, `voice-ai-agents.write`, etc.

Son listas distintas con strings parecidos. Mandar `scopes: []` en el body **apaga todos los permisos del usuario** — no es un no-op.

### `permissions` — 38 flags booleanos

`campaignsEnabled, campaignsReadOnly, contactsEnabled, workflowsEnabled, workflowsReadOnly, triggersEnabled, funnelsEnabled, websitesEnabled, opportunitiesEnabled, dashboardStatsEnabled, bulkRequestsEnabled, appointmentsEnabled, reviewsEnabled, onlineListingsEnabled, phoneCallEnabled, conversationsEnabled, assignedDataOnly, adwordsReportingEnabled, membershipEnabled, facebookAdsReportingEnabled, attributionsReportingEnabled, settingsEnabled, tagsEnabled, leadValueEnabled, marketingEnabled, agentReportingEnabled, botService, socialPlanner, bloggingEnabled, invoiceEnabled, affiliateManagerEnabled, contentAiEnabled, refundsEnabled, recordPaymentEnabled, cancelSubscriptionEnabled, paymentsEnabled, communitiesEnabled, exportPaymentsEnabled`

Ninguno de ellos es un "activo/inactivo" global.

---

## 8. Gotchas confirmados que te van a morder

1. **`twilioPhone` es reemplazo total, no merge.** Texto literal del spec: *"if you send twilioPhone in the request body, the stored map is replaced entirely with this object (not merged). Any location id omitted from the object is removed from the saved map. Omit the twilioPhone property entirely to leave existing numbers unchanged. Send an empty object `{}` to clear all per-location numbers. To clear a single location only, set that location id to an empty string `\"\"`."*
2. **`scopes` y `scopesAssignedToOnly` también son reemplazo total.** Array vacío = apagar todo.
3. **`locationIds` en `PUT` es reemplazo total** — por eso funciona el patrón "leer → filtrar → reescribir" de §3.
4. **El `email` ya no se puede actualizar** por razones de seguridad, aunque el campo siga en el DTO.
5. **`companyId` es obligatorio en `GET /users/search`** aun con token de Location.
6. **`companyId` es "required for Agency Level access"** en `PUT /users/{userId}`.
7. **`DELETE` es encolado + soft delete** → no leas inmediatamente después.
8. **`succeded` (typo)** vs `succeeded` en la respuesta del DELETE — valida ambos.
9. **v3 coexiste con v2** en el mismo host: mismos paths y scopes, solo cambia `Version: v3`. Las páginas de docs por defecto (`/docs/ghl/users/...`) ya muestran **v3**; para ver v2 usa `/docs/2021-07-28/ghl/users/...`. **INCIERTO:** no hay aviso oficial de deprecación de `2021-07-28`; las 4 versiones (`v3`, `2023-02-21`, `2021-07-28`, `2021-04-15`) siguen listadas y activas.
10. **Stoplight está en camino de deprecarse.** `highlevel.stoplight.io` sigue vivo pero HighLevel avisa que migres a `marketplace.gohighlevel.com/docs/`. Usa el repo de GitHub como fuente de verdad.

---

## Fuentes

- [GoHighLevel/highlevel-api-docs — repo oficial (OpenAPI v2 + v3)](https://github.com/GoHighLevel/highlevel-api-docs)
- [`apps/users.json` — spec OpenAPI v2 de Users](https://github.com/GoHighLevel/highlevel-api-docs/blob/master/apps/users.json)
- [`apps/v3/users-v3.json` — spec OpenAPI v3 de Users](https://github.com/GoHighLevel/highlevel-api-docs/blob/master/apps/v3/users-v3.json)
- [`docs/oauth/Scopes.md` — tabla oficial de scopes](https://github.com/GoHighLevel/highlevel-api-docs/blob/master/docs/oauth/Scopes.md)
- [Create User (v2 / 2021-07-28)](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/users/create-user/) · [Create User (v3)](https://marketplace.gohighlevel.com/docs/ghl/users/create-user/)
- [Delete User](https://marketplace.gohighlevel.com/docs/ghl/users/delete-user/) · [Update User](https://marketplace.gohighlevel.com/docs/ghl/users/update-user/index.html) · [Users API v3](https://marketplace.gohighlevel.com/docs/ghl/users/users-api-v-3/)
- [OAuth 2.0 — flujo, user_type, locationToken](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html)
- [Target User: Agency — apps a nivel agencia](https://marketplace.gohighlevel.com/docs/Authorization/TargetUserAgency/index.html)
- [Private Integration Tokens (docs de desarrollador)](https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/)
- [Private Integrations: everything you need to know (soporte)](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [Rate Limits](https://marketplace.gohighlevel.com/docs/other/rate-limits) · [OAuth FAQs](https://marketplace.gohighlevel.com/docs/oauth/Faqs/)
- [Security Update — Disablement of Users APIs on API v1](https://ideas.gohighlevel.com/changelog/security-update-disablement-of-users-apis-on-api-v1)
- [API Security Initiatives](https://help.gohighlevel.com/support/solutions/articles/155000003697-api-security-initiatives)
- [Deprecating the HighLevel API v1 and migrating to v2](https://www.gohighlevel.com/post/deprecating-the-highlevel-api-v1-and-migrating-to-v2)
- [Feature request abierto: Ability to Deactivate Users](https://ideas.gohighlevel.com/crm/p/ability-to-deactivate-users)

Copias locales de los specs parseados: `/private/tmp/claude-501/-Users-cristhian-Downloads-Paginas-Web-JoisnClee/bb19a3ce-7d46-4839-909c-748ab45529d0/scratchpad/users_v2.json`, `.../users_v3.json`, `.../scopes.md`
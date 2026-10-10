# GoHighLevel API v2 — Sub-cuentas (Locations) y SaaS Mode

**Fuente primaria usada:** repo oficial `GoHighLevel/highlevel-api-docs` (specs OpenAPI que alimentan `marketplace.gohighlevel.com/docs`), clonado en commit `0af86a4` (2026-06-19). Los datos de scopes, headers y bodies salen leídos directamente de `apps/locations.json`, `apps/v3/locations-v3.json`, `apps/saas-api.json`, `apps/v3/saas-v3.json`, `apps/snapshots.json` y `docs/oauth/Scopes.md`.

- Repo: https://github.com/GoHighLevel/highlevel-api-docs
- Docs renderizadas: https://marketplace.gohighlevel.com/docs/
- **Base URL:** `https://services.leadconnectorhq.com`
- **Header `Version` obligatorio en todo endpoint.** Coexisten dos generaciones: `Version: 2021-07-28` (specs v2) y `Version: v3` (specs v3). Los paths son idénticos; cambia el valor del header.

> ⚠️ Nota importante de deprecación: la doc vieja en `highlevel.stoplight.io` está siendo retirada. Los enlaces canónicos hoy son `marketplace.gohighlevel.com/docs/ghl/...`.

---

## 1. Crear sub-cuenta — `POST /locations/`

**Doc:** https://marketplace.gohighlevel.com/docs/ghl/locations/create-location/

| Concepto | Valor (confirmado en spec) |
|---|---|
| Método / path | `POST https://services.leadconnectorhq.com/locations/` |
| Token | **Agency-Access** — access token OAuth con `user_type: Company`, **o** Private Integration Token de agencia |
| Scope | `locations.write` |
| Header `Version` | `2021-07-28` o `v3` |
| Restricción de plan | La spec dice literalmente: *"This feature is only available on Agency Pro ($497) plan."* |

`security: [{"Agency-Access": ["locations.write"]}]` — idéntico en la spec v2 y en la v3.

### Body (`CreateLocationDto`)

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `name` | string | **SÍ** | Nombre de la sub-cuenta |
| `companyId` | string | **SÍ** | ID de la agencia |
| `phone` | string | no | Con country-code (`+1410039940`) |
| `address`, `city`, `state`, `postalCode` | string | no | |
| `country` | string | no | **Código ISO de 2 letras** (`US`, `CO`) |
| `website` | string | no | |
| `timezone` | string | no | Ej. `US/Central` |
| `prospectInfo` | object | no | Si lo mandas, `firstName`, `lastName`, `email` son **los tres requeridos** |
| `settings` | object | no | `allowDuplicateContact`, `allowDuplicateOpportunity`, `allowFacebookNameMerge`, `disableContactTimezone` (booleans) |
| `social` | object | no | `facebookUrl`, `googlePlus`, `linkedIn`, `foursquare`, `twitter`, `yelp`, `instagram`, `youtube`, `pinterest`, `blogRss`, `googlePlacesId` |
| `mailgun` | object | no | `apiKey` + `domain`, ambos requeridos si mandas el objeto |
| `twilio` | object | no | **DEPRECATED** (marcado `deprecated: true` en spec) |
| `snapshotId` | string | no | **Sí existe** — ver sección 4 |

```bash
curl -X POST 'https://services.leadconnectorhq.com/locations/' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: 2021-07-28' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "name": "Miembro Comunidad 001",
    "companyId": "UAXssdawIWAWD",
    "phone": "+573001112233",
    "address": "Calle 4 #10-20",
    "city": "Medellin",
    "state": "Antioquia",
    "country": "CO",
    "postalCode": "050001",
    "website": "https://ejemplo.com",
    "timezone": "America/Bogota",
    "prospectInfo": {
      "firstName": "Juan",
      "lastName": "Perez",
      "email": "juan.perez@mail.com"
    },
    "settings": { "allowDuplicateContact": false, "disableContactTimezone": false },
    "snapshotId": "XXXXXXXXXXX"
  }'
```

**Respuesta 200** (`CreateLocationSuccessfulResponseDto`): `id`, `companyId`, `name`, `phone`, `email`, `address`, `city`, `state`, `domain` (ej. `test.msgsndr.com`), `country`, `postalCode`, `website`, `timezone`, `settings`, `social`. Errores documentados: `400`, `401`.

---

## 2. Eliminar sub-cuenta — `DELETE /locations/{locationId}`

**Doc:** https://marketplace.gohighlevel.com/docs/ghl/locations/delete-location/

**SÍ EXISTE**, confirmado en spec v2 y v3.

| Concepto | Valor |
|---|---|
| Método / path | `DELETE /locations/{locationId}` |
| `deleteTwilioAccount` | **query param, `boolean`, marcado `required: true`** en la spec |
| Header `Version` | `2021-07-28` o `v3` |
| Token | Agency-Access |
| Scope (según spec OpenAPI) | **`locations.internal-access-only`** |
| Scope (según `docs/oauth/Scopes.md`) | `locations.write` |

### 🚨 Contradicción real en la documentación oficial (crítica para tu decisión)

Las dos fuentes oficiales **no coinciden**:

- `apps/locations.json` y `apps/v3/locations-v3.json` → `security: [{"Agency-Access": ["locations.internal-access-only"]}]`
- `docs/oauth/Scopes.md` (línea 137) → tabla dice que `locations.write` cubre `DELETE /locations/:locationId`, nivel Agency

`locations.internal-access-only` **no aparece en la tabla de scopes seleccionables** de `Scopes.md` — solo aparece dentro de la spec de este endpoint. El nombre sugiere fuertemente que es un scope reservado a HighLevel internamente y **no ofertable a apps del Marketplace**.

> **INCIERTO / RIESGO ALTO:** no pude confirmar con fuente pública si un app de Marketplace o un Private Integration Token de agencia puede realmente ejecutar este DELETE, o si devuelve 401. **Antes de diseñar el flujo asumiendo borrado por API, hay que probarlo contra una sub-cuenta desechable.** Recomiendo diseñar el sistema alrededor de *pausar* (sección 3), no de borrar.

```bash
curl -X DELETE 'https://services.leadconnectorhq.com/locations/ve9EPM428h8vShlRW1KT?deleteTwilioAccount=true' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: 2021-07-28' \
  -H 'Accept: application/json'
```

**Respuesta 200:**
```json
{ "success": true, "message": "Deleted location with id: ve9EPM428h8vShlRW1KT" }
```

---

## 3. Pausar / suspender en vez de borrar — **SÍ SE PUEDE**

Existe `POST /saas/pause/{locationId}`. Esta es la vía correcta para tu caso de uso (miembro que deja de pagar la comunidad).

**Doc:** https://marketplace.gohighlevel.com/docs/ghl/saas/pause-location-deprecated

### Ojo con los dos prefijos

La spec documenta **cada endpoint SaaS dos veces**:
- `/saas-api/public-api/...` → marcados `deprecated: true`
- `/saas/...` → **vigentes**, sin deprecar

Casi todo el material que circula (y los resultados de búsqueda) apunta al prefijo viejo `/saas-api/public-api/`. **Usa `/saas/`.**

### Pause Location

| Concepto | Valor |
|---|---|
| Path vigente | `POST /saas/pause/{locationId}` |
| Path deprecado | `POST /saas-api/public-api/pause/{locationId}` |
| Token | Agency-Access (`user_type: Company`) |
| Body (`PauseLocationDto`) | `paused` (boolean, **req**), `companyId` (string, **req**) |

```bash
# PAUSAR
curl -X POST 'https://services.leadconnectorhq.com/saas/pause/ve9EPM428h8vShlRW1KT' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: v3' \
  -H 'Content-Type: application/json' \
  -d '{ "paused": true, "companyId": "UAXssdawIWAWD" }'

# REACTIVAR
curl -X POST 'https://services.leadconnectorhq.com/saas/pause/ve9EPM428h8vShlRW1KT' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: v3' \
  -H 'Content-Type: application/json' \
  -d '{ "paused": false, "companyId": "UAXssdawIWAWD" }'
```

### Inventario COMPLETO de endpoints SaaS (leído de `apps/v3/saas-v3.json`)

Todos con `Agency-Access`. Prefijo vigente `/saas/`, equivalente deprecado `/saas-api/public-api/`:

| Método | Path | Qué hace | Body / params clave |
|---|---|---|---|
| `GET` | `/saas/locations` | Locations por `stripeId` + `companyId` | query |
| `PUT` | `/saas/update-saas-subscription/{locationId}` | Actualizar suscripción SaaS | `subscriptionId`, `customerId`, `companyId` (los 3 req) |
| `POST` | `/saas/enable-saas/{locationId}` | Activar SaaS en una sub-cuenta | `companyId` + `isSaaSV2` req; opcionales: `stripeAccountId`, `name`, `email`, `stripeCustomerId`, `contactId`, `providerLocationId`, `description`, `saasPlanId`, `priceId` |
| `POST` | `/saas/pause/{locationId}` | **Pausar / despausar** | `paused`, `companyId` |
| `POST` | `/saas/bulk-disable-saas/{companyId}` | Desactivar SaaS en lote | `locationIds` (array, req) |
| `POST` | `/saas/bulk-enable-saas/{companyId}` | Activar SaaS en lote | |
| `POST` | `/saas/update-rebilling/{companyId}` | Rebilling masivo | `product`, `locationIds`, `config` (los 3 req) |
| `GET` | `/saas/agency-plans/{companyId}` | Planes de la agencia | |
| `GET` | `/saas/get-saas-subscription/{locationId}` | Detalle de suscripción | query `companyId` req |
| `GET` | `/saas/saas-locations/{companyId}` | Locations con SaaS activo | query `page` req |
| `GET` | `/saas/saas-plan/{planId}` | Detalle de plan SaaS | |
| `POST` | `/saas/allow-attach-rebilling/{locationId}` | Permitir adjuntar rebilling | scope `saas/company.read` |
| `GET` | `/saas-api/public-api/companies/{companyId}/locations/{locationId}/wallet-balance` | Saldo del wallet | scope `saas/company.read` |
| `POST` | `.../wallet-balance/complimentary-credits` | Cargar créditos de cortesía | scope `saas/company.write` |

**Enum de `product` para `update-rebilling`:** `contentAI`, `workflow_premium_actions`, `workflow_ai`, `conversationAI`, `EmailNotification`, `whatsApp`, `reviewsAI`, `VERIFIED_CALLER_ID`, `WALLET_SALES_TAX`, `NOTIFICATION_SMS`, `EmailSmtp`, `EmailVerification`, `autoCompleteAddress`, `funnelAI`, `domainPurchase`, `Phone`, `Email`.

### Scopes SaaS

`docs/oauth/Scopes.md` (líneas 198-201) lista: `saas/location.write`, `saas/location.read`, `saas/company.write`. La spec v3 añade `saas/company.read`.

⚠️ En la spec, la mayoría de endpoints `/saas/` traen `security: [{"Agency-Access": []}]` — **array de scopes vacío**. Es decir, la spec no declara qué scope pedir. Hay que seleccionar `saas/location.write` + `saas/company.write` en el app del Marketplace guiándose por `Scopes.md`.

### ⚠️ Headers `channel` y `source` — INCIERTO

Reportes de comunidad ([foro Pabbly](https://forum.pabbly.com/threads/issue-with-gohighlevel-api-pause-location-returning-401-unauthorized.28521/)) indican que el pause devuelve **401 Unauthorized** por faltar los campos `channel` y `source`. Históricamente la SaaS API exigía `channel: OAUTH` y `source: INTEGRATION`.

**Estos headers NO están en la spec OpenAPI oficial** (verifiqué: no aparecen como parámetros). Marcar como INCIERTO: si te da 401 con token de agencia válido, prueba añadiendo:

```bash
  -H 'channel: OAUTH' \
  -H 'source: INTEGRATION'
```

Nota adicional: el `securityScheme` de la spec SaaS describe el bearer como *"Access Token generated by exchanging API Key for token id"* y *"user type as Company"* — **no menciona Private Integration Token**, a diferencia de la spec de locations que sí lo menciona explícitamente. Es posible que la SaaS API exija OAuth de app de Marketplace y no acepte PIT. **INCIERTO, hay que probarlo.**

### Nota sobre permisos de usuario (≠ scopes OAuth)

En `apps/users.json` y `apps/v3/users-v3.json` aparecen `locations.pause-resume`, `locations.create`, `locations.delete`, `locations.agency-subaccounts.manage`, `locations.billing.manage`, `locations.features-limits.manage`. **Estos NO son scopes OAuth** — son flags de permisos del rol de usuario de agencia. Confirman que pausar/reanudar es una capacidad nativa de agencia (existe en la UI), pero no se piden en el OAuth.

---

## 4. Snapshots — **SÍ, confirmado**

### a) Crear location desde snapshot

El campo `snapshotId` (string) existe en `CreateLocationDto`. Descripción textual de la spec: *"The snapshot ID to be loaded into the location."* Ejemplo en el curl de la sección 1.

### b) Empujar snapshot a una location existente

`PUT /locations/{locationId}` (scope `locations.write`, Agency-Access) acepta un objeto `snapshot` distinto:

```json
{ "id": "XXXXXXXXXXX", "override": false }
```
`id` requerido. `override`: *"If you want override all conflicted assets then pass true. Default value is false."*

### c) API de snapshots (para obtener los IDs)

**Doc:** https://marketplace.gohighlevel.com/docs/ghl/snapshots/

| Método | Path | Scope |
|---|---|---|
| `GET` | `/snapshots/` | `snapshots.readonly`, Agency-Access → devuelve `{snapshots: [{id, name, type}]}` |
| `POST` | `/snapshots/share/link` | body: `snapshot_id`, `share_type`, `relationship_number`, `share_location_id` → devuelve `{id, shareLink}` |
| `GET` | `/snapshots/snapshot-status/{snapshotId}` | Estado de pushes entre fechas |
| `GET` | `/snapshots/snapshot-status/{snapshotId}/location/{locationId}` | Último push → `{id, locationId, status, completed, pending}` |

```bash
# 1. Listar snapshots disponibles
curl -X GET 'https://services.leadconnectorhq.com/snapshots/?companyId=UAXssdawIWAWD' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: 2021-07-28'

# 2. Verificar que el push del snapshot terminó
curl -X GET 'https://services.leadconnectorhq.com/snapshots/snapshot-status/XXXXXXXXXXX/location/ve9EPM428h8vShlRW1KT?companyId=UAXssdawIWAWD' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: 2021-07-28'
```

**Patrón recomendado:** el push del snapshot es asíncrono. Crear la location y luego hacer polling a `snapshot-status/.../location/...` hasta `status` completo, antes de invitar al miembro.

---

## 5. Qué es SaaS Mode y si lo necesitas

### Qué es

SaaS Mode convierte HighLevel en un producto revendible bajo tu marca: vendes suscripciones desde tu web, la sub-cuenta se crea automáticamente al pagar, y puedes **rebillar con markup** el consumo (SMS, email, llamadas, AI) quedándote la diferencia.

- FAQ oficial: https://help.gohighlevel.com/support/solutions/articles/155000002129-highlevel-saas-mode-faqs
- Guía de precios/wallets/rebilling: https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide
- Upgrade a Agency Pro: https://help.gohighlevel.com/support/solutions/articles/48001180534-how-to-upgrade-to-highlevel-s-agency-pro-plan-497-saas-plan-

### Cómo se factura

Dos capas separadas:

1. **Suscripción del cliente final** → vía **Stripe Connect** (obligatorio para SaaS V1). Tú fijas el precio del plan. Hay `isSaaSV2` en la API, lo que indica una V2 más nueva; **INCIERTO** el detalle exacto de diferencias V1 vs V2 más allá del flag.
2. **Rebilling de consumo** → GHL cobra primero a la agencia contra el *wallet*; la sub-cuenta se cobra al precio con markup que tú definas (en Sub-Account Settings o en el SaaS Configurator).

Al desactivar SaaS de una sub-cuenta: se cancela la suscripción y **el wallet se borra permanentemente**; los reembolsos los maneja la agencia manualmente (el saldo restante llega por email). Desconectar Stripe exige primero desactivar SaaS en todas las sub-cuentas dependientes.

### ¿Es necesario SaaS Mode para dar sub-cuentas a miembros de una comunidad?

**No necesariamente — pero hay un matiz importante.**

- **SaaS Mode NO es obligatorio** solo para *tener* sub-cuentas. Puedes crear sub-cuentas y dar acceso a usuarios sin activar SaaS. SaaS Mode es la capa de **facturación automatizada + rebilling** encima.
- **PERO:** la spec de `POST /locations/` declara *"This feature is only available on Agency Pro ($497) plan."* Es decir, **crear sub-cuentas por API sí parece requerir Agency Pro**, aunque crearlas a mano en la UI funciona en Unlimited ($297). Lo mismo aplica a `POST /saas/enable-saas/{locationId}`.

**Conclusión práctica para tu caso:** si tu comunidad ya cobra por otro lado (Skool, Hotmart) y solo quieres *provisionar* sub-cuentas, **no necesitas SaaS Mode** — necesitas Agency Pro por el requisito de la API de creación, y manejas altas/bajas con `POST /locations/` + `POST /saas/pause/`. Solo activarías SaaS Mode si quieres que HighLevel cobre la suscripción y rebille el consumo por ti.

> **INCIERTO:** el requisito "Agency Pro para POST /locations/" está en la spec oficial, pero no encontré una nota de soporte que lo confirme independientemente. **Verificar con una llamada de prueba antes de comprometer arquitectura.**

---

## 6. Webhooks

**Doc:** https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/

### Modelo

Los webhooks son **exclusivos de apps OAuth del Marketplace**. No hay webhooks en Private Integration Tokens. Flujo: crear app OAuth en el dashboard del Marketplace → definir scopes (solo editables en versión draft) → en *Advanced Settings* pegar tu URL contra cada evento que quieras recibir.

### Verificación de firma

- `X-GHL-Signature` — **Ed25519**, estándar actual
- `X-WH-Signature` — RSA-SHA256, **legacy, deprecado el 1 de septiembre de 2026**

### ¿Hay webhook de location creada / borrada / usuario?

| Evento | ¿Existe? | Notas |
|---|---|---|
| **`LocationCreate`** | ✅ **SÍ** | *"Available only to **Agency Level Apps**"*. Payload: `type`, `id`, `companyId`, `name`, `email`, `stripeProductId` |
| **`LocationUpdate`** | ✅ SÍ | |
| **`LocationDelete`** | ❌ **NO EXISTE** | No hay archivo ni evento. **No puedes reaccionar por webhook al borrado de una sub-cuenta.** |
| **`UserCreate`** | ✅ SÍ | Payload distinto para usuario de sub-cuenta (`locationId`) vs de agencia (`companyId` + `locations[]`). Incluye `role` y objeto `permissions` con ~37 flags |
| `UserUpdate` / `UserDelete` | ❌ NO existen | |
| `PlanChange` | ✅ SÍ | Relevante para SaaS |
| `AppInstall` / `AppUninstall` | ✅ SÍ | |

Ejemplo de payload `LocationCreate`:
```json
{
  "type": "LocationCreate",
  "id": "ve9EPM428h8vShlRW1KT",
  "companyId": "otg8dTQqGLh3Q6iQI55w",
  "name": "Loram ipsum",
  "email": "mailer@example.com",
  "stripeProductId": "prod_xyz123abc"
}
```

### Lista COMPLETA de los 58 eventos disponibles

`AppInstall`, `AppUninstall`, `AppointmentCreate`, `AppointmentDelete`, `AppointmentUpdate`, `AssociationCreate`, `AssociationDelete`, `AssociationUpdate`, `CampaignStatusUpdate`, `ContactCreate`, `ContactDelete`, `ContactDndUpdate`, `ContactTagUpdate`, `ContactUpdate`, `ConversationUnreadWebhook`, `InboundMessage`, `InvoiceCreate`, `InvoiceDelete`, `InvoicePaid`, `InvoicePartiallyPaid`, `InvoiceSent`, `InvoiceUpdate`, `InvoiceVoid`, `LCEmailStats`, **`LocationCreate`**, **`LocationUpdate`**, `NoteCreate`, `NoteDelete`, `NoteUpdate`, `ObjectSchemaCreate`, `ObjectSchemaUpdate`, `OpportunityAssignedToUpdate`, `OpportunityCreate`, `OpportunityDelete`, `OpportunityMonetaryValueUpdate`, `OpportunityStageUpdate`, `OpportunityStatusUpdate`, `OpportunityUpdate`, `OrderCreate`, `OrderStatusUpdate`, `OutboundMessage`, `PlanChange`, `PriceCreate`, `PriceDelete`, `PriceUpdate`, `ProductCreate`, `ProductDelete`, `ProductUpdate`, `ProviderOutboundMessage`, `RecordCreate`, `RecordDelete`, `RecordUpdate`, `RelationCreate`, `RelationDelete`, `TaskComplete`, `TaskCreate`, `TaskDelete`, **`UserCreate`**

Payloads individuales: https://github.com/GoHighLevel/highlevel-api-docs/tree/main/docs/webhook%20events

---

## 7. Límites y costos

### Sub-cuentas

- **Agency Unlimited ($297/mes) y Agency Pro ($497/mes): sub-cuentas ilimitadas.** No hay tope numérico ni cargo por sub-cuenta. Hay agencias con 1.000+ sub-cuentas pagando el mismo $497.
- **Starter ($97/mes):** limitado (típicamente 3 sub-cuentas) y **sin acceso a API ni white-label**.
- Precios oficiales: https://www.gohighlevel.com/pricing

### Entonces, ¿dónde está el costo real?

**No en el número de sub-cuentas, sino en el consumo** (modelo de wallet): SMS, llamadas, email, minutos de AI, verificación de email, compra de dominios, WhatsApp, premium workflow actions. Eso se paga por uso desde el wallet de la agencia y es lo que **rebillas con markup** en Agency Pro. Ver: https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide

**Implicación para una comunidad:** 100 sub-cuentas inactivas cuestan ~$0 extra. 100 sub-cuentas mandando SMS sí generan costo variable. Si las das gratis a miembros, **desactiva rebilling y limita features**, o cargarás tú el consumo.

### Límites de API (oficiales, `docs/oauth/Authorization.md`)

- **Burst:** 100 requests / 10 segundos, por app de Marketplace, por recurso (Location o Company)
- **Diario:** 200.000 requests / día, por app, por recurso
- Headers de respuesta a monitorear: `X-RateLimit-Limit-Daily`, `X-RateLimit-Daily-Remaining`, `X-RateLimit-Interval-Milliseconds`, `X-RateLimit-Max`, `X-RateLimit-Remaining`

Doc: https://marketplace.gohighlevel.com/docs/oauth/Authorization

---

## Apéndice — Endpoints de apoyo para el flujo completo

### Obtener token de sub-cuenta desde token de agencia
```bash
curl -X POST 'https://services.leadconnectorhq.com/oauth/locationToken' \
  -H 'Authorization: Bearer <AGENCY_ACCESS_TOKEN>' \
  -H 'Version: 2021-07-28' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'companyId=UAXssdawIWAWD&locationId=ve9EPM428h8vShlRW1KT'
```
Scope `oauth.write`, **Agency-Access-Only**. También `GET /oauth/installedLocations` (`oauth.readonly`).

### Crear el usuario del miembro dentro de la sub-cuenta
`POST /users/` — scope `users.write`, acepta Agency-Access **o** Location-Access. Complementarios: `GET /users/search`, `POST /users/search/filter-by-email`, `PUT /users/{userId}`, `DELETE /users/{userId}`.

### Buscar sub-cuentas
`GET /locations/search` — scope `locations.readonly`, acepta Agency-Access **o** Location-Access.

---

## Resumen ejecutivo de riesgos

| # | Hallazgo | Confianza |
|---|---|---|
| 1 | `POST /locations/` con `snapshotId` funciona con token de agencia + `locations.write` | **Alta** — spec oficial |
| 2 | `DELETE /locations/{id}` existe, pero su scope `locations.internal-access-only` contradice `Scopes.md` y sugiere restricción interna | **Contradicción documentada — PROBAR** |
| 3 | Pausar sí es posible: `POST /saas/pause/{locationId}` con `{paused, companyId}` | **Alta** — spec oficial |
| 4 | Usar prefijo `/saas/`, no `/saas-api/public-api/` (deprecado) | **Alta** |
| 5 | Headers `channel`/`source` en SaaS API | **INCIERTO** — solo comunidad, ausentes de la spec |
| 6 | SaaS API podría no aceptar Private Integration Token (solo OAuth de app) | **INCIERTO** |
| 7 | No existe webhook `LocationDelete` | **Alta** — ausencia verificada |
| 8 | `LocationCreate` requiere app de nivel **Agencia** | **Alta** — nota explícita en la doc |
| 9 | Sub-cuentas ilimitadas sin costo unitario en Unlimited/Pro; el costo es por consumo | **Alta** |
| 10 | API de creación de sub-cuentas requiere Agency Pro $497 | **Media** — solo en la spec, sin confirmación de soporte |

**Recomendación de arquitectura:** construir el ciclo de vida sobre `POST /locations/` (alta, con snapshot) + `POST /saas/pause/` (baja/reactivación), y tratar `DELETE` como operación manual excepcional hasta validarla empíricamente. Como no hay webhook de borrado, la fuente de verdad del estado debe vivir en tu propia base de datos (Supabase), no en GHL.

**Sources:**
- [GoHighLevel/highlevel-api-docs (repo oficial)](https://github.com/GoHighLevel/highlevel-api-docs)
- [Create Sub-Account](https://marketplace.gohighlevel.com/docs/ghl/locations/create-location/)
- [Delete Sub-Account](https://marketplace.gohighlevel.com/docs/ghl/locations/delete-location/)
- [Pause Location](https://marketplace.gohighlevel.com/docs/ghl/saas/pause-location-deprecated)
- [SaaS API index](https://marketplace.gohighlevel.com/docs/ghl/saas/saas/index.html)
- [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/)
- [LocationCreate webhook](https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/webhook%20events/LocationCreate.md)
- [OAuth Authorization / rate limits](https://marketplace.gohighlevel.com/docs/oauth/Authorization)
- [SaaS Mode FAQs](https://help.gohighlevel.com/support/solutions/articles/155000002129-highlevel-saas-mode-faqs)
- [HighLevel Pricing Guide (wallets, rebilling)](https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide)
- [Upgrade to Agency Pro $497](https://help.gohighlevel.com/support/solutions/articles/48001180534-how-to-upgrade-to-highlevel-s-agency-pro-plan-497-saas-plan-)
- [HighLevel Pricing](https://www.gohighlevel.com/pricing)
- [Pabbly forum — pause location 401](https://forum.pabbly.com/threads/issue-with-gohighlevel-api-pause-location-returning-401-unauthorized.28521/)
- [Bulk Manage SaaS Sub-accounts](https://help.gohighlevel.com/support/solutions/articles/155000005270-how-to-bulk-manage-saas-sub-accounts)
- [Create a New Sub-Account Using Snapshot](https://help.gohighlevel.com/support/solutions/articles/155000005762-create-a-new-sub-account-using-snapshot)
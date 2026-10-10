# MCP oficial de GoHighLevel — Investigación

## Conclusión (respuesta directa)

**NO se pueden borrar usuarios ni sub-cuentas con el MCP que tienes conectado en esta sesión.** Esas 36 herramientas son la lista completa del endpoint clásico del MCP oficial, y no incluye ninguna operación de users ni de locations más allá de dos lecturas (`locations_get-location`, `locations_get-custom-fields`).

Para borrar usuarios o sub-cuentas hay dos caminos, y el recomendado es el segundo:

1. Migrar al endpoint nuevo `/mcp/anthropic/v2`, cuyo catálogo **sí declara** los dominios `Users`, `Sub-Account` y `SaaS` — pero la doc **no confirma** explícitamente que exponga el borrado de sub-cuentas (ver la salvedad más abajo).
2. **Llamar la REST API v2 directo** con un token de nivel Agencia. Es el camino documentado, determinista y el que yo usaría.

---

## 1. La lista de 36 herramientas es correcta y está completa

Tu sesión está conectada al endpoint clásico:

```
https://services.leadconnectorhq.com/mcp/
```

Conté las tuyas por categoría contra la doc oficial de soporte de HighLevel y coinciden **exactamente, 36/36**:

| Categoría | Tools | Cuenta |
|---|---|---|
| `blogs_*` | check-url-slug-exists, create-blog-post, get-all-blog-authors-by-location, get-all-categories-by-location, get-blog-post, get-blogs, update-blog-post | 7 |
| `calendars_*` | get-appointment-notes, get-calendar-events | 2 |
| `contacts_*` | add-tags, create-contact, get-all-tasks, get-contact, get-contacts, remove-tags, update-contact, upsert-contact | 8 |
| `conversations_*` | get-messages, search-conversation, send-a-new-message | 3 |
| `emails_*` | create-template, fetch-template | 2 |
| `locations_*` | get-custom-fields, get-location | 2 |
| `opportunities_*` | get-opportunity, get-pipelines, search-opportunity, update-opportunity | 4 |
| `payments_*` | get-order-by-id, list-transactions | 2 |
| `social-media-posting_*` | create-post, edit-post, get-account, get-post, get-posts, get-social-media-statistics | 6 |
| | **TOTAL** | **36** |

Contexto de versiones: el MCP oficial salió con ~21 tools y se amplió a 36 sumando blogs, plantillas de email y social planner. Los repos de GitHub que verás al buscar ("269+ tools", "520+ tools", "78 tools") son **wrappers de terceros no oficiales** sobre la REST API — no son el MCP de HighLevel.

## 2. ¿Expone users / locations / SaaS?

| Capacidad | Endpoint clásico (el tuyo) | Endpoint `/mcp/anthropic/v2` |
|---|---|---|
| Crear usuario | ❌ No | Dominio `Users` en el catálogo (sin confirmar) |
| Borrar usuario | ❌ No | Dominio `Users` en el catálogo (sin confirmar) |
| Crear location / sub-cuenta | ❌ No | Dominio `Sub-Account` declarado; la doc dice que las conexiones de agencia **eligen** qué sub-cuentas incluir, no las crean |
| Borrar location / sub-cuenta | ❌ No | Igual — no confirmado |
| SaaS mode | ❌ No | Dominio `SaaS` declarado en el catálogo |
| Leer datos de una location | ✅ `locations_get-location` | ✅ |

**Salvedad importante:** el endpoint v2 no expone tools planas. Expone 6 meta-tools (`search`, `fetch`, `search_operations`, `describe_operation`, `execute_operation`, `list_locations`) delante de un catálogo de "cientos de operaciones en 40 dominios". Esa lista de 40 dominios **sí nombra** `Users`, `Sub-Account (Formerly location)`, `SaaS` y `Snapshots`. Pero la documentación no enumera las operaciones concretas, y además dice que *"las operaciones sensibles e irreversibles están protegidas con confirmación adicional y verificaciones de seguridad"*. Es decir: puede que `execute_operation` llegue a `DELETE /users/:userId`, pero **no está documentado y no lo doy por hecho**. La forma de comprobarlo en 30 segundos es conectar el v2 y correr `search_operations` con intent "delete user" / "delete location".

## 3. Autenticación

Dos opciones, ambas válidas en los dos endpoints:

**Private Integration Token (PIT)** — Settings → Private Integrations → Create New Integration → elegir scopes → copiar token.

```json
{
  "mcpServers": {
    "ghl-mcp": {
      "type": "http",
      "url": "https://services.leadconnectorhq.com/mcp/",
      "headers": {
        "Authorization": "Bearer pit-xxxxxxxx",
        "locationId": "110411007T"
      }
    }
  }
}
```

- El header `locationId` es opcional en el endpoint clásico, pero **en la práctica es obligatorio** para cualquier dato específico de sub-cuenta. Ponlo explícito.
- Los PIT existen **tanto a nivel Agencia como a nivel Location**, máximo 5 de cada uno.
- Dato clave: **un PIT da un conjunto de scopes más limitado que OAuth.** Si el v2 llegara a exponer users/locations, con PIT probablemente no los veas.

**OAuth** (recomendado por HighLevel en el v2): login por navegador, eliges la sub-cuenta y apruebas scopes. Da permisos más amplios que el PIT.

## 4. ¿Nivel location o nivel agencia?

- **Endpoint clásico (`/mcp/`)**: **una sola sub-cuenta por conexión**. Es efectivamente nivel location. Esto es lo que tienes.
- **Endpoint `/mcp/anthropic/v2`**: soporta **ambos**. En la instalación de agencia eliges qué sub-cuentas incluir, y luego `list_locations` te deja alternar entre ellas en el mismo chat sin reconectar.

Pero ojo — "nivel agencia" ahí significa *operar sobre varias sub-cuentas*, **no** *administrar la agencia*. La conexión trabaja sobre las locations pre-seleccionadas en el install; no las crea ni las borra.

## 5. Cómo ampliar la lista de herramientas

Sí hay forma, en dos escalones:

**a) Cambiar al endpoint v2** (gratis, inmediato):

```bash
claude mcp add --transport http leadconnector https://services.leadconnectorhq.com/mcp/anthropic/v2
```

Pasas de 36 tools fijas a un catálogo de cientos de operaciones sobre 40 dominios: Contacts, Conversations, Opportunities, Calendars, Payments, Products & Store, Invoices & Estimates, Social Planner, Blogs, Emails, Forms & Surveys, Ad Manager, Affiliate Manager, AI Agent Studio, Associations, Brand Boards, Business, Chat Widget, Companies, Conversation AI, Courses, Custom Fields V2, Custom menus, Email ISV, Files, Funnels, Knowledge Base, Trigger Links, **Sub-Account**, Developer marketplace, Media Storage, Objects, LC Phone, Proposals, **SaaS**, **Snapshots**, Surveys, **Users**, Voice AI, Workflows.

**b) Si aun así falta lo que necesitas: REST API v2 directo.** Es la alternativa recomendada para user/location management.

## 6. La alternativa: REST API v2 directo

Los endpoints existen y están documentados:

```
DELETE /users/:userId
→ 200: "queued deleting user with e-mail ... Will take effect in a few minutes."
   (es asíncrono — no borra en el acto)

DELETE /locations/:locationId?deleteTwilioAccount=true|false
→ 200: { success: true, message: ... }

POST   /users            (crear usuario)
GET    /users/:userId
PUT    /users/:userId
POST   /locations        (crear sub-cuenta)
```

Base: `https://services.leadconnectorhq.com`, headers `Authorization: Bearer <token>` + `Version: 2021-07-28`.

**Requisitos de token y scopes — esto es lo que te va a morder:**

- `locations.write` es **solo nivel Agencia**. Cubre POST/PUT/DELETE de locations. Un token de sub-cuenta no sirve.
- `users.write` permite crear/borrar **usuarios de sub-cuenta**, pero **NO usuarios de agencia** — los usuarios de agencia no se pueden crear por API.
- Si vas por App del Marketplace + OAuth, tienes que marcar el tipo **"Agency"** en el perfil de la app para siquiera ver los scopes de agencia (`oauth`, `snapshots`, `saas`, etc.).
- Ambos scopes (`users.write` y `locations.write`) muestran una **advertencia especial en la pantalla de consentimiento OAuth** por ser destructivos.
- Para SaaS mode: hay endpoints para activar SaaS en varias locations (v1 y v2), listar las locations con SaaS activo, y desactivarlo. Requieren plan **SaaS Pro ($497)**, SaaS Mode habilitado, credenciales OAuth con scope `saas/*`, y hay límite de **10 req/s**.

---

## Recomendación

Para el caso de uso "borrar usuarios/sub-cuentas", **no pases por el MCP**. Saca un PIT de **nivel Agencia** (Settings de la agencia → Private Integrations) con `users.write` + `locations.write` y llama la REST v2 directo desde un script. Razones:

1. Es el camino documentado y estable.
2. El borrado de usuario es **asíncrono** ("will take effect in a few minutes") — querrás loguear y verificar, no confiar en una respuesta de tool.
3. Son operaciones irreversibles: mejor un script con dry-run y confirmación explícita que un LLM decidiendo llamar `execute_operation`.
4. Si el PIT de agencia no te expone esos scopes, ahí sí toca App del Marketplace tipo "Agency" con OAuth.

Deja el MCP para lo que hace bien: contactos, conversaciones, oportunidades, blogs y social.

**Sources:**
- [Highlevel MCP Server — doc oficial](https://marketplace.gohighlevel.com/docs/other/mcp/index.html)
- [How to Setup and Use the HighLevel MCP Server — soporte oficial](https://help.gohighlevel.com/support/solutions/articles/155000005741-how-to-setup-and-use-the-highlevel-mcp-server)
- [Private Integrations: Everything You Need to Know](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [Delete User — API v2](https://marketplace.gohighlevel.com/docs/ghl/users/delete-user/index.html)
- [Delete Sub-Account (Location) — API v2](https://marketplace.gohighlevel.com/docs/ghl/locations/delete-location/index.html)
- [SaaS API — API v2](https://marketplace.gohighlevel.com/docs/ghl/saas/saas/index.html)
- [OAuth Scopes](https://marketplace.gohighlevel.com/docs/oauth/Scopes/index.html)
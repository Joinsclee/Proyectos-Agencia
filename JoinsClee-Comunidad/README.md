# Comunidad JoinsClee · control de accesos de GoHighLevel

Las cuentas de GHL son un bono por estar en la comunidad de Skool. Este sistema
se encarga de que dejen de serlo cuando alguien deja de estar.

Un cron diario mira quién sigue en la comunidad, quién canceló y quién ya salió,
y avisa por Slack. La revocación la confirma una persona desde un panel: el
sistema detecta, el humano decide.

---

## Cómo funciona

```
  pg_cron · 06:00 America/Bogotá
        │
        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  skool-ghl-sync                                              │
  │                                                              │
  │  1. Lee las 4 pestañas de miembros de Skool                  │
  │     active · cancelling · churned · banned                   │
  │  2. Circuit breakers ── si algo huele mal, ABORTA            │
  │  3. Actualiza jc_members con el estado de cada persona       │
  │  4. Encola en jc_revocations a quien ya perdió el acceso     │
  │  5. Un solo mensaje a Slack con todo junto                   │
  └──────────────────────────────────────────────────────────────┘
        │                                        │
        │ nada se revoca aquí                    ▼
        │                                  Slack (privado)
        │                                        │  botón
        ▼                                        ▼
   Supabase                             panel-comunidad.html
   jc_members                                    │
   jc_revocations                                │ una persona confirma
   jc_sync_runs                                  ▼
   jc_alerts                              ┌──────────────┐
                                          │  ghl-revoke  │──► DELETE /users/{id}
                                          └──────────────┘    (todos los de la sub-cuenta)

   ghl-provision ──► POST /locations/ + POST /users/   ← entrega el bono y,
                                                         sobre todo, guarda el
                                                         vínculo miembro ⇄ sub-cuenta
```

---

## Las tres decisiones que explican el resto

### 1. Skool no avisa. Hay que ir a mirar.

Skool no tiene API pública ni webhooks salientes. El plugin que en su panel se
llama «Webhook» es **entrante** — sirve para invitar gente, no para que Skool te
notifique. Zapier solo expone *New Paid Member*. No hay evento de cancelación
en ninguna parte.

Lo único disponible es el endpoint que consume su propio frontend:

```
/_next/data/{buildId}/{group}/-/members.json?t={pestaña}&p={página}
```

El proyecto de SAVIAS ya lo usa en producción, y de ahí sale la mitad de este
código. Pero con una diferencia importante.

### 2. Se leen cuatro pestañas, no una.

SAVIAS lee solo `t=active` y deduce las bajas por ausencia. Aquí no alcanza, por
dos razones:

- **Llega 30 días tarde.** Skool no expulsa a nadie al cancelar: lo saca al
  final del ciclo de facturación. Con el diff de `active` te enteras cuando ya
  pasó todo.
- **Una ausencia no distingue "se fue" de "el scraping falló".** Y un fallo de
  scraping que se traduce en borrados es irreversible.

Las cuatro pestañas (`active`, `cancelling`, `churned`, `banned`) dan estado
afirmativo, y `metadata.mbscpe` da la fecha exacta de corte. Se sabe el mismo
día, con un mes de antelación al corte.

| Pestaña | Qué significa | Qué hace el sistema |
|---|---|---|
| `active` | Paga y con acceso | Nada |
| `cancelling` | Canceló, **aún tiene acceso** hasta `churn_at` | Solo avisa. Nunca revoca. |
| `churned` | Ya perdió el acceso | Encola revocación |
| `banned` | Expulsado | Encola revocación |

Cancelar en Skool es reversible — existe `uncancelSubscription`, y Skool le
ofrece cambiar de plan antes de dejarlo ir. Revocar en `cancelling` sería
quitarle a alguien algo que todavía pagó.

### 3. Se borran los usuarios, no la sub-cuenta.

`DELETE /users/{userId}` está documentado sin ambigüedad y funciona con un PIT
de agencia. `DELETE /locations/{id}`, en cambio, exige en el OpenAPI un scope
llamado `locations.internal-access-only` que ni siquiera aparece en el selector
de scopes — el nombre sugiere que está reservado a HighLevel. La documentación
oficial se contradice consigo misma en este punto.

Borrar los usuarios corta el login igual, y además:

- **Es reversible.** Si el miembro vuelve, se le recrea el usuario y su
  sub-cuenta sigue intacta con todo lo que construyó.
- **No destruye trabajo del cliente.** Borrar la sub-cuenta se lleva sus
  embudos, sus contactos y su historial. Eso es riesgo reputacional, no solo
  técnico.
- **No cuesta.** Una sub-cuenta sin uso vale ~$0: en GHL se paga por consumo
  (SMS, email, créditos de IA), no por número de sub-cuentas.

> **Ojo:** se borran **todos** los usuarios de la sub-cuenta, no solo el que se
> creó al dar el bono. Si al miembro se le dio rol admin, pudo haber invitado a
> más gente; borrar solo el tuyo no revocaría nada.

---

## Lo que impide un desastre

Un fallo de scraping que se traduzca en borrados masivos es el único error de
verdad grave que puede cometer este sistema. Por eso, antes de tocar nada:

| Freno | Qué detecta | Qué hace |
|---|---|---|
| **Cookie vencida** | Skool redirige a `/login` → devolvería 0 miembros | Aborta y avisa |
| **buildId ilegible** | Skool cambió su HTML | Aborta y avisa |
| **Página con error** | Una página de 5 falló → 30 "desaparecidos" | Aborta y avisa |
| **Barrido parcial** | Skool dice 200 miembros, se leyeron 140 | Aborta y avisa |
| **Caída anómala** | Los activos cayeron más del 20% desde ayer | Aborta y avisa |
| **Canario de campos** | Hay gente en `cancelling` pero nadie trae `billingCanceled` → Skool renombró el campo | Aborta y avisa |
| **Regla de 3 rachas** | Alguien desapareció de las 4 pestañas | Espera 3 corridas seguidas antes de encolarlo |
| **Miembro lifetime** | Un lifetime no churnea por facturación | Se excluye de la cola |
| **`DRY_RUN`** | — | Detecta y avisa, no toca GHL |
| **Humano en el medio** | — | La revocación la confirma una persona |

Cuando un freno salta, el sistema no hace nada y lo dice. Prefiere quedarse
corto antes que borrarle la cuenta a alguien que sigue pagando.

---

## Puesta en marcha

### Paso 0 · Los smoke tests (antes de escribir un secret)

Tres cosas no se pudieron confirmar con documentación pública, y una de ellas
puede invalidar el diseño. Resuélvelas primero:

```bash
cd "Paginas Web/JoinsClee-Comunidad"
cp .env.example .env      # rellena Skool + GHL + Slack
./scripts/smoke-test.sh   # solo lecturas; los destructivos se saltan solos
```

| Test | Qué resuelve | Si falla |
|---|---|---|
| **T1** | ¿El PIT de agencia puede leer usuarios? | Hay que crear una app OAuth de Marketplace con *Target User = Agency*. Solo cambia la capa de auth. |
| **T1b** | ¿Aparecen `users.write` y `locations.write` en el selector de scopes del PIT? (a ojo, 60 s) | Igual que T1 |
| **T3** | ¿Qué devuelve cada pestaña del grupo real? ¿`mbme` trae emails de verdad? ¿`cancelling` solapa con `active`? | El parser necesita ajuste — pásame la salida |
| **T7** | ¿El webhook de Slack publica? | Revisa el webhook |

Los destructivos (T2, T4, T5, T6) exigen `--confirm-destructive` y recursos
desechables. **T2 es el que confirma que se puede revocar de verdad** — vale la
pena crear un usuario de prueba en GHL y tirarlo.

La lógica de clasificación se puede verificar sin credenciales ni red:

```bash
deno test --allow-net scripts/test-logica.ts
```

13 casos sobre fixtures con la forma real del JSON de Skool. Los dos marcados
`REGLA CRÍTICA` son los que impiden revocarle a alguien que canceló pero
todavía tiene acceso pagado. Si tocas el parser, corre esto antes de desplegar.

Pásame los veredictos de T1, T2 y T3 antes de encender el cron.

### Paso 1 · Base de datos

SQL Editor de Supabase → pegar y correr:
[`supabase/migrations/20260826000001_comunidad_skool_ghl.sql`](supabase/migrations/20260826000001_comunidad_skool_ghl.sql)

Es idempotente. Crea las tablas `jc_*`, las vistas y el cron diario.

> El cron usa `vault.decrypted_secrets` con los nombres `project_url` y
> `service_role_key`. Supabase los crea solo en proyectos nuevos; si no
> existen, créalos en Settings → Vault antes de correr la migración.

### Paso 2 · Secrets

```bash
supabase secrets set \
  SKOOL_AUTH_TOKEN="..." \
  SKOOL_CLIENT_ID="..." \
  SKOOL_GROUP="joinsclee-xxxx" \
  GHL_AGENCY_PIT="pit-..." \
  GHL_COMPANY_ID="..." \
  GHL_SNAPSHOT_ID="..." \
  SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." \
  ADMIN_TOKEN="$(openssl rand -hex 32)" \
  ADMIN_PANEL_URL="https://…/panel-comunidad.html" \
  DRY_RUN="true" \
  AUTO_REVOKE="false"
```

### Paso 3 · Desplegar

```bash
supabase functions deploy skool-ghl-sync --no-verify-jwt
supabase functions deploy ghl-revoke     --no-verify-jwt
supabase functions deploy ghl-provision  --no-verify-jwt
```

`--no-verify-jwt` es necesario: el cron y el panel autentican con
`service_role` / `ADMIN_TOKEN`, no con un JWT de usuario.

### Paso 4 · Mirar antes de escribir

```bash
# No escribe nada. Devuelve lo que Skool está entregando ahora mismo.
curl -X POST "$SUPABASE_URL/functions/v1/skool-ghl-sync" \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"diagnostic":true}'
```

Revisa en la respuesta:
- `counts` — ¿cuadran con lo que ves en el panel de Skool?
- `sample_member` — ¿`skool_email` trae emails reales?
- `distinct_tiers` — ¿los nombres de los planes son los que esperabas?
- `raw_sample_keys` — ¿siguen ahí `billingCanceled`, `mbscpe`, `mmbp`?

Si algo no cuadra, dímelo antes de seguir: el parser se ajusta en un sitio.

### Paso 5 · Primera corrida en simulación

```bash
curl -X POST "$SUPABASE_URL/functions/v1/skool-ghl-sync" \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"dry_run":true}'
```

Debería llegar el mensaje a Slack y poblarse `jc_members`.

### Paso 6 · El panel

Publica `panel-comunidad.html` donde sea (GHL Custom HTML, Netlify, Vercel — es
autocontenido). Al abrirlo pide tres cosas, que quedan solo en ese navegador:

- URL del proyecto de Supabase
- `anon key`
- `ADMIN_TOKEN`

### Paso 7 · Vincular las cuentas que ya existan

**Este es el paso que hace posible todo lo demás.** Si ya le diste cuentas de
GHL a alguien antes de montar esto, hay que decirle al sistema qué sub-cuenta es
de quién: en el panel, «Vincular» en cada persona.

Sin ese vínculo el sistema puede detectar la baja pero no sabe qué revocar. Y no
lo adivina por email a propósito: el correo de Skool y el de GHL no tienen por
qué coincidir, y GHL ya no permite actualizar el email de un usuario por API.

De aquí en adelante, `ghl-provision` guarda el vínculo solo.

### Paso 8 · Encender

Después de dos semanas mirando que las detecciones sean correctas:

```bash
supabase secrets set DRY_RUN="false"
```

`AUTO_REVOKE` se queda en `false`: la revocación la sigue confirmando una
persona. Se puede cambiar más adelante, pero el tope de `MAX_REVOKES_PER_RUN`
sigue aplicando.

---

## Uso diario

Llega un mensaje a Slack solo cuando hay algo. Si no hubo bajas, silencio — un
canal que avisa «0 novedades» todos los días deja de leerse. Los lunes llega un
latido verde que sirve de dead-man's switch: si no llega, el cron está caído.

Para el latido:

```bash
# Añade un segundo cron los lunes 8:00 COT (13:00 UTC)
select cron.schedule('jc-heartbeat-semanal', '0 13 * * 1', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/skool-ghl-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
               (select decrypted_secret from vault.decrypted_secrets where name='service_role_key')),
    body := '{"heartbeat":true}'::jsonb);
$$);
```

Desde el panel se puede: ver qué usuarios se borrarían antes de borrarlos,
revocar, descartar un falso positivo (devuelve el miembro a activo y reinicia su
racha), vincular una sub-cuenta y crear la cuenta de quien todavía no la tiene.

---

## Qué pasa con n8n

Este sistema no lo usa, y es deliberado: n8n añadiría un servicio más entre
Skool y GHL sin resolver nada que Supabase no resuelva ya — que además es donde
vive el estado. Un cron de Postgres es más fiable que un workflow que hay que
acordarse de mantener activo.

Donde n8n sí encaja bien es en lo que viene después de la detección: dar la
bienvenida, mandar la secuencia de onboarding de la cuenta nueva, o un flujo de
retención cuando alguien entra en `cancelling` pero todavía no se fue. Ese
último es probablemente el más rentable: son 30 días de aviso que hoy se
desaprovechan.

`skool-ghl-sync` ya deja los datos listos en `jc_members` para eso.

---

## Cuando algo falla

| Síntoma | Causa y arreglo |
|---|---|
| Slack: `cookie_expired` | La sesión de Skool caducó. Renueva `SKOOL_AUTH_TOKEN` y `SKOOL_CLIENT_ID`. Pasa cada varias semanas. |
| Slack: `no_build_id` | Skool cambió su HTML. Hay que revisar la regex del `buildId`. |
| Slack: `canary_billing_canceled` | Skool renombró un campo. **No toques nada hasta revisar el parser** — el sistema ya se detuvo solo. |
| Slack: `anomalous_drop` | Los activos cayeron >20%. Casi siempre es scraping, no fuga real. Corre el diagnóstico y compara con el panel de Skool. |
| Slack: `partial_scan` | Una página falló a mitad del barrido. Suele arreglarse solo en la corrida siguiente. |
| Panel: «sin sub-cuenta vinculada» | Falta el paso 7 para esa persona. |
| `ghl_no_configurado` | Faltan `GHL_AGENCY_PIT` o `GHL_COMPANY_ID` en los secrets. |
| Revocar da 401 | El PIT no es de agencia o le falta `users.write`. Corre T1. |
| Usuario borrado que sigue apareciendo | El DELETE de GHL es asíncrono. El cron del día siguiente lo verifica; si sobrevive dos corridas, escala. |
| El panel no carga | ¿Desplegaste con `--no-verify-jwt`? ¿El `ADMIN_TOKEN` es el mismo del secret? |

---

## Mapa de archivos

```
JoinsClee-Comunidad/
├─ panel-comunidad.html                 Panel de admin (autocontenido)
├─ scripts/smoke-test.sh                T1–T7: verifica lo que la doc no confirma
├─ scripts/test-logica.ts               13 tests del parser y la clasificación
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/…_comunidad_skool_ghl.sql   Tablas jc_*, vistas, cron
│  └─ functions/
│     ├─ _shared/skool.ts               4 pestañas, parser, circuit breakers
│     ├─ _shared/ghl.ts                 API v2: users, locations, revocación
│     ├─ _shared/slack.ts               Mensaje agregado, alertas, latido
│     ├─ _shared/supa.ts                PostgREST con service_role
│     ├─ skool-ghl-sync/index.ts        El cron diario
│     ├─ ghl-revoke/index.ts            Revocar · vincular · descartar
│     └─ ghl-provision/index.ts         Crear la sub-cuenta del bono
└─ docs/                                Notas de investigación
```

## Límite conocido

Nada del endpoint de Skool es API pública: no hay contrato de estabilidad, ni
versionado, ni changelog. Skool puede renombrar un campo en cualquier deploy y
el sync dejaría de funcionar. Eso no se puede arreglar — solo detectar rápido,
que es lo que hacen el canario y el latido semanal.

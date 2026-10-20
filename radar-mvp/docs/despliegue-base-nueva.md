# Puesta en producción con la base nueva (20/10/2026)

El proyecto de Supabase anterior (`uqlfgnylvnefhyuvtncd`) se borró tras quedar
restringido por cuota. El actual es **`aspscrnvukrpuhsinswa`**, región
`us-east-1`, plan gratuito.

Cómo se restauró: [scripts/restaurar-base/](../scripts/restaurar-base/README.md).

---

## Lo que ya está hecho y comprobado

| | |
|---|---|
| Esquema | 17 tablas, 74 índices, 43 constraints, 5 triggers, 11 funciones, 2 vistas, RLS |
| Extensión | `vector 0.8.2` en el esquema `public` |
| Datos | 45 usuarios · 47 identidades · 92.811 inmuebles (590 de banco, 32.339 oportunidades, 159 ciudades) · 101.108 arriendos · 3.473 remates · 637 documentos · 304 zonas · 5 cron jobs |
| Tamaño | 402 MB de los 500 del plan gratuito |
| Storage | bucket `inmuebles-pdf` público, con los 10 marcadores en `placeholders/ai/` |
| URLs | 3.473 remates reapuntados al host nuevo · 413 de banco puestos en null |
| `statement_timeout` | `service_role` subido a 30 s (ver abajo) |
| Correo | Resend operativo: envío real entregado desde `radar@joinsclee.com`, `alertEmailDeliveryReady` y `recuperacionDisponible` en `true` |
| Recuperación | `admin.generateLink` funciona contra el proyecto nuevo · 39 usuarios con contraseña, 6 solo de Google · `proveedorExterno()` los distingue |
| Pruebas | 475 en verde |
| Rutas | `/health`, `/api/home`, `/portal`, `/bancos`, `/remates`, `/facets`, `/stats`, `/config`, y `/api/market` en las 12 ciudades mayores |

### El `statement_timeout`, que no es un detalle

`service_role` no tenía el suyo, así que heredaba los **8 s** de
`authenticator`. Cada conteo de la portada tarda 1,6 s por separado, pero los
cinco van en paralelo y en una instancia gratuita (CPU compartida) el grande
pasaba de 8 s: la portada se quedaba sin cifras y `/api/market` devolvía 500 en
las ciudades grandes (Barranquilla tardaba 47 s y moría).

```sql
alter role service_role set statement_timeout = '30s';
notify pgrst, 'reload config';
```

El `notify` es obligatorio: PostgREST **cachea** los ajustes de rol y sin él el
cambio no se aplica. Costó descubrirlo — el `alter role` parecía no hacer nada.

`anon` (3 s) y `authenticated` (8 s) se dejan como estaban: una petición pública
no debe poder retener una conexión más tiempo del necesario.

---

## Variables de entorno en EasyPanel

En EasyPanel hay que **recrear el contenedor**, no solo redesplegar: si no, no
toma las variables nuevas.

```
SUPABASE_URL=https://aspscrnvukrpuhsinswa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<la de role:service_role del panel>
SUPABASE_ANON_KEY=<la de role:anon>
RADAR_DATABASE_URL=postgresql://postgres.aspscrnvukrpuhsinswa:CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres
APP_BASE_URL=https://<el dominio de produccion>
```

Y **quitar `RADAR_DEMO_DATOS`** (o ponerla a `0`): el modo demo ya no hace
falta, y encendido el Radar no toca Supabase.

Las que ya estaban (OpenAI, Resend, Wompi, asistente, formación, comunidad) no
cambian: no dependían del proyecto de Supabase.

Una variable **presente pero vacía cuenta como ausente** desde el 20/10/2026.
Antes, crear `RESEND_API_KEY` en blanco impedía que el servidor arrancara
entero; ahora se puede crear vacía y rellenar después.

Las dos únicas sin las que no arranca son `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`, y así debe ser: arrancar sin base significa
descubrirlo en la primera consulta de un usuario.

---

## Lo que falta, y solo se puede hacer desde los paneles

### 1 · Google y Microsoft están apagados — 6 usuarios no pueden entrar

Son **dos** cosas en dos sitios distintos, y hacen falta las dos:

| | |
|---|---|
| Fuera (Google Cloud / Azure) | añadir la callback del proyecto nuevo — **hecho el 20/10/2026** |
| Dentro (Supabase) | activar el proveedor y pegarle client ID + secret — **pendiente** |

La callback nueva, para referencia:

```
https://aspscrnvukrpuhsinswa.supabase.co/auth/v1/callback
```

Y en Supabase → Authentication → Sign In / Providers → Google: encender el
interruptor y pegar el client ID y el secret (los mismos de antes, no hay que
crear credenciales nuevas). Igual con Azure, que además pide el Tenant URL.

Se comprueba sin entrar al panel:

```bash
curl "https://aspscrnvukrpuhsinswa.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://x" -H "apikey: <anon>"
```

Con el proveedor apagado responde `400 provider is not enabled`. Bien
configurado, redirige a Google (302).

De los 45 usuarios restaurados, **6 son solo de Google** y no pueden entrar de
ninguna otra forma. Los 2 de Microsoft también tienen identidad de correo, así
que entran con su contraseña mientras tanto; los 39 restantes igual.

Cuando Azure quede activo, poner también `RADAR_OAUTH_MICROSOFT=1`: es lo único
que pinta el botón de Microsoft (`server/index.ts:1289`), y va aparte a
propósito para no enseñar un botón que lleva a un proveedor sin configurar.

Mientras no esté, esos 8 pueden entrar pidiendo recuperar la contraseña: el
código detecta que son cuentas externas y les manda un correo diciéndoles por
dónde entran (`server/recuperar-password.ts`). Pero eso necesita el punto 3.

### 2 · Redirecciones permitidas

Supabase → Authentication → URL Configuration. Un proyecto nuevo solo permite
`localhost`. Hay que añadir el dominio de producción, o el enlace del correo de
recuperación llega y al pulsarlo Supabase lo rechaza:

```
https://<el dominio de produccion>/auth/callback
https://<el dominio de produccion>/**
```

### 3 · Correo — hecho y comprobado

Remitente: **`radar@joinsclee.com`** (el documentado en
`INFORME_AVANCE_FASE2_2026-07-24.md`). El dominio `joinsclee.com` está
verificado en Resend, región `eu-west-1`.

Comprobado con un envío real al buzón de pruebas de Resend
(`delivered@resend.dev`, no es una persona): estado `delivered`. Y
`/api/config` responde `alertEmailDeliveryReady: true` y
`recuperacionDisponible: true`.

En EasyPanel tienen que estar:

```
RESEND_API_KEY=<la clave de Resend>
ALERTS_FROM_EMAIL=radar@joinsclee.com
ALERTS_CRON_SECRET=<el que ya tenía produccion>
```

`ALERTS_CRON_SECRET` protege `/api/internal/alerts/run`. En el `.env` local se
generó uno nuevo; el de producción **no se toca** salvo que se rote también en
quien llama al cron.

Ojo con una cosa: esta cuenta de Resend se comparte con otro producto («Casa
Club» envía desde `casaclub@joinsclee.com`). La clave puede enviar como
cualquier dirección del dominio, así que rotarla afecta a los dos.

### 4 · Rotar credenciales

La contraseña de la base y las claves se pegaron en una conversación. Conviene
rotar: la contraseña de Postgres, `OPENAI_API_KEY`, `RESEND_API_KEY`,
`ALERTS_CRON_SECRET` y `RADAR_ASISTENTE_SECRETO`.

### 5 · Dejar correr los scrapers

Reponen las 90.197 filas de inmuebles que no entraron, las 12 ciudades que
faltan, `price_history` (no se restauró: es histórico derivado) y las fotos
recortadas a 6 de las 20 que guarda el scraper.

---

## Lo que se perdió y no vuelve

- **`price_history`**: 194.578 filas. Se reconstruye desde cero con los
  scrapers; el histórico anterior no está.
- **Las fotos de los 413 inmuebles de banco**: eran renders de página de PDF en
  el Storage del proyecto viejo y no hay copia en ninguna parte. Se dejaron en
  null, así que la tarjeta pinta `bankPlaceholder()` —HTML y CSS, sin red— y la
  ficha cae en el icono limpio de `gallery()`. No se ve una imagen rota.
- **Las fotos 7ª a 20ª** de cada inmueble del portal. El siguiente pase del
  scraper las repone.

# GoHighLevel · subcuentas de este cliente

Referencia de trabajo. **Aquí no hay tokens**: los IDs de subcuenta no son
secretos, los tokens sí, y este archivo vive dentro de un repositorio con
remoto en `github.com/Joinsclee/Proyectos-Agencia`.

## Dónde están los tokens

`~/.ghl/tokens.env` — fuera del repo, permisos `600`.

```bash
set -a; source ~/.ghl/tokens.env; set +a
curl -H "Authorization: Bearer $GHL_PIT_DARIEN" \
     -H "Version: 2021-07-28" \
     "https://services.leadconnectorhq.com/locations/$GHL_LOC_DARIEN"
```

## Subcuentas

| Subcuenta | Location ID | Para qué | Variable del token |
|---|---|---|---|
| **Iván Castrillón** (antes «Darién») | `IdRKxMkw62mZx47SMDaS` | La operación de Iván / La Huerta LAB. **Es la que usa el MCP.** | `GHL_PIT_DARIEN` |
| **CleeSaaS** | `e0JAuqQVmCnLyjIcEgB3` | Facturación de la agencia | `GHL_PIT_CLEESAAS` *(pendiente de regenerar)* |
| JoinsClee (Funnels & CRM) | `Np6qnux1pM5NRF9JY3lh` | Sitio y CRM de la agencia; aloja el vídeo del Universo | *(ya no la usa el MCP)* |

Las tres cuelgan de la misma agencia: `tkzCpl7CVmkJwLL8dR84`.

### Iván Castrillón

- País `CO` · zona horaria `America/Bogota` · contacto `gerente@lahuertahotel.com.co`
- **La moneda de la subcuenta no está definida.** Hay que pasar `currency`
  explícito en cada factura o saldrá vacía.
- Permisos verificados del token (31/08/2026): `contacts`, `invoices`,
  `invoices/template` — los tres responden 200.

> El nombre de la subcuenta es «Darién», no «La Huerta LAB». Si fue provisional,
> conviene renombrarla antes de que empiece a salir en correos y facturas.

### CleeSaaS

- Es la subcuenta desde la que se factura. Zona horaria **Europe/Madrid**: una
  fecha de vencimiento se guarda a medianoche de Madrid, que en Colombia son
  las 17:00 del mismo día.
- Emisor en las facturas: `CleeSaaS`, dirección `1704 Llano St Ste B-1488,
  Santa Fe NM 87505` — la de DINERO CONSCIENTE LLC.
- Numeración: prefijo `INV-`, correlativo de seis dígitos.

## Notas de la API (v2)

- Header obligatorio: `Version: 2021-07-28`.
- Un PIT está atado a **una** subcuenta y no revela cuál: todos los endpoints
  exigen el `locationId` explícito y no existe un `whoami`. Si no se sabe, hay
  que leerlo de la URL de GHL.
- Al **crear** una factura el campo es `items`; al leerla vuelve como
  `invoiceItems`. Las fechas van en `YYYY-MM-DD`, no en ISO completo.
- `POST /contacts/` recompone el nombre desde `name` y parte mal los nombres
  de dos palabras: mandar `firstName` y `lastName` sin `name`.


## El MCP de GHL

Apunta a **Iván Castrillón** desde el 31/08/2026. Está en `~/.claude.json`,
en `mcpServers.ghl.headers`: hay que cambiar **`locationId` y `Authorization`
a la vez**, porque el token es un PIT y un PIT solo sirve para su propia
subcuenta (cambiar solo el `locationId` da 403).

El cambio no se aplica hasta reiniciar la sesión de Claude Code.

### Lo que el MCP NO trae

No expone **workflows** ni el contenido de páginas o formularios. Para eso
no hay nada que configurar: la API de GoHighLevel tampoco los expone
(ver `embudo-lanzamiento.md`).

## Plantillas de correo: sí se pueden escribir

Es de lo poco que la API permite crear y editar de verdad:

```bash
# crear
POST /emails/builder            {locationId, type:"html", name, title}
# guardar el HTML  (¡sin locationId en la ruta!)
PATCH /emails/builder/{id}      {locationId, templateId, editorType:"html", editorContent:"<html>…"}
# asunto, preheader y remitente
PATCH /emails/builder/{id}      {locationId, templateId, subjectLine, previewText, fromName}
# borrar  (aquí sí va el locationId)
DELETE /emails/builder/{locationId}/{id}
```

`subjectLine` es el campo bueno para el asunto: `subject` devuelve 200 y no
cambia nada. Conviene mandarlo en su propio PATCH, porque junto a otros campos
se pierde en silencio.

El listado (`GET /emails/builder`) **no devuelve el asunto**, solo nombre, id,
tipo y `previewUrl`. Para leer el contenido de una plantilla, se descarga
ese `previewUrl` (es el HTML renderizado en Firebase).

# Revisión de seguridad para producción

Fecha: 24 de julio de 2026
Alcance: frontend JavaScript, servidor HTTP Node.js, autenticación, Docker y despliegue público.

## Resumen ejecutivo

El despliegue usa HTTPS y redirige correctamente desde HTTP. La separación entre web,
cron y Supabase es una buena base. La rama local ya elimina handlers ejecutables, valida
URLs externas, escapa datos dinámicos y aplica una CSP que no permite scripts inline.
El VPS público no se ha modificado y conserva el comportamiento auditado inicialmente.

El principal riesgo crítico pendiente es que los tokens de sesión se guardan en
`localStorage`. También faltan límites de abuso, autorización para refrescar análisis IA,
verificación de correo, endurecimiento del contenedor y observabilidad operativa.

## Críticos

### SEC-001 — XSS almacenado desde datos de scrapers

- Regla: `JS-XSS-001`, `JS-XSS-004`, `JS-URL-002`
- Severidad: **Crítica**
- Estado: **mitigado localmente, pendiente de pruebas adversariales y despliegue**
- Ubicación: `server/public/app.js`, `server/public/login.js`,
  `server/public/auth-callback.js`, `server/http-security.ts`
- Corrección aplicada:
  - escape completo de `&`, `<`, `>`, comillas dobles y simples;
  - allowlist `http/https` para medios y enlaces externos;
  - eliminación de `onclick`, `onerror` y scripts inline;
  - eventos delegados con `addEventListener`;
  - CSP `script-src 'self'`, sin `unsafe-inline`, y `object-src 'none'`.
- Riesgo residual: aún se usa `innerHTML` para plantillas, por lo que la disciplina de
  escape debe mantenerse y verificarse con pruebas de payloads maliciosos antes de salir.

### SEC-002 — Tokens de autenticación accesibles desde JavaScript

- Regla: `JS-STORAGE-001`
- Severidad: **Crítica en combinación con SEC-001**
- Ubicación: `server/public/app.js:26`, `server/public/login.html:169`,
  `server/public/auth-callback.html:48`
- Evidencia: access y refresh tokens se guardan en `localStorage`.
- Impacto: cualquier XSS en el origen puede extraer la sesión y suplantar al usuario.
- Corrección: sesión server-side o cookies `HttpOnly`, `Secure`, `SameSite=Lax` con
  rotación y protección CSRF para operaciones con estado.
- Mitigación: tokens muy cortos, revocación y CSP estricta reducen el impacto, pero no
  sustituyen cookies inaccesibles a JavaScript.

## Altos

### SEC-003 — Análisis IA público sin control de abuso

- Regla: `EXPRESS-AUTH-001`, `EXPRESS-DOS-001`
- Severidad: **Alta**
- Ubicación: `server/index.ts:143-152`
- Evidencia: `/api/analyze` acepta peticiones anónimas y el parámetro `refresh`.
- Impacto: consumo no autorizado de OpenAI, saturación del proceso y aumento de costos.
- Corrección: autenticación, cuota por usuario/IP, límite de concurrencia, circuit breaker
  y autorización especial para `refresh`.
- Mitigación: límites equivalentes en EasyPanel/proxy mientras se implementa en aplicación.

### SEC-004 — Registro auto-confirmado y sin protección propia contra abuso

- Regla: `EXPRESS-AUTH-001`
- Severidad: **Alta**
- Ubicación: `server/auth.ts:34-38`, `server/index.ts:113-118`
- Evidencia: el registro administrativo usa `email_confirm: true`; no existe límite
  visible por identidad/IP ni verificación de correo.
- Impacto: creación masiva de cuentas, correos no verificados y abuso de funciones gratis.
- Corrección: verificación de correo, límites por IP/correo, CAPTCHA progresivo y métricas
  de intentos fallidos.
- Mitigación: límite temporal en proxy y alerta por tasa anormal de registros.

## Medios

### SEC-005 — Cuerpo JSON grande se cierra sin respuesta 413

- Regla: `EXPRESS-BODY-001`
- Severidad: **Media**
- Ubicación: `server/index.ts:35-46`
- Evidencia: al superar 1 MB se destruye la petición y se resuelve como `{}`.
- Impacto: comportamiento ambiguo, conexiones cortadas y dificultad para distinguir abuso
  de JSON inválido.
- Corrección: error tipado `413 Payload Too Large` y `400` para JSON malformado.

### SEC-006 — Correos completos en logs

- Regla: minimización de datos sensibles
- Severidad: **Media**
- Ubicación: `server/auth.ts:46`, `server/auth.ts:49`
- Evidencia: registro y errores incluyen el correo completo.
- Impacto: exposición de información personal en logs, backups o proveedores de monitoreo.
- Corrección: hash estable o correo parcialmente enmascarado, retención definida y acceso
  restringido.

### SEC-007 — Contenedor web ejecutado como root

- Regla: mínimo privilegio
- Severidad: **Media**
- Ubicación: `Dockerfile:3-29`
- Evidencia: no existe instrucción `USER` y se copia todo el proyecto al contenedor.
- Impacto: una ejecución remota tendría más privilegios dentro del contenedor y mayor
  superficie de archivos.
- Corrección: build multi-stage, salida compilada, dependencias de producción y usuario
  no-root con filesystem de solo lectura cuando EasyPanel lo permita.

## Corregido en esta iteración

### SEC-009 — Dependencias transitivas vulnerables

- Estado: **vulnerabilidades altas corregidas localmente**
- Archivos: `package-lock.json`
- Resultado:
  - se actualizaron de forma compatible Axios, FormData y la cadena de Firecrawl;
  - `npm audit --omit=dev --audit-level=high` termina correctamente;
  - las 79 pruebas y el typecheck pasan después de la actualización.
- Riesgo residual: quedan dos alertas moderadas en `uuid`, introducidas por
  `node-cron@3`. Resolverlas exige migrar a `node-cron@4`, un cambio mayor que debe
  probarse sobre el scheduler antes de producción; no se aplicó `npm audit fix --force`.

### SEC-007A — Barrera de calidad para datos financieros de remates

- Estado: **corregido localmente, pendiente de desplegar**
- Archivos: `server/data-quality.ts`, `server/queries.ts`, `server/analysis.ts`
- Resultado:
  - avalúos y posturas fuera del rango creíble se sustituyen por `null`;
  - porcentajes fuera de `1–100` no se exponen;
  - cada fila afectada incluye una advertencia interna de calidad;
  - un remate con datos financieros anómalos no puede alimentar el análisis IA.
- Pendiente: aplicar las mismas restricciones en ingestión/Postgres y cuarentenar la
  fila fuente para corregirla definitivamente.

### SEC-008 — Baseline de cabeceras, MIME y errores

- Estado: **corregido localmente, pendiente de desplegar**
- Archivos: `server/http-security.ts`, `server/index.ts`
- Resultado:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` restrictiva
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Strict-Transport-Security`
  - CSP con scripts limitados al propio origen y bloqueo de framing
  - `X-Request-Id` por petición
  - JPG y MP4 con tipos MIME correctos
  - mensajes 500 genéricos con correlación por request ID
- Pruebas: `npm run typecheck` y `npm test` pasan; 79 pruebas exitosas.

## Comprobaciones del VPS

- HTTP redirige a HTTPS con 301.
- HTTPS responde por HTTP/2.
- Antes de la corrección, el VPS no enviaba cabeceras de seguridad.
- JPG y MP4 se servían como `application/octet-stream`.
- `app.js` se entrega sin compresión ni caché inmutable.
- El healthcheck responde y el proceso observado llevaba más de 92 horas activo.

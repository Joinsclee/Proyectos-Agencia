# Radar CRECE — Runbook de producción

**Objetivo:** desplegar, verificar, contener incidentes y recuperar el Radar sin
depender de memoria o improvisación.

**Producción:** `https://joinsclee-radar.juno8i.easypanel.host`

## 1. Servicios y responsabilidades

| Componente | Función | Panel |
|---|---|---|
| `radar` | Web, API, autenticación, comparables y envío canario | EasyPanel |
| `radar-cron` | Scrapers, motor CRECE y alertas programadas | EasyPanel |
| Supabase | PostgreSQL, Auth y Storage | Supabase |
| Resend | Correo transaccional | Resend |
| Wompi Sandbox | Checkout y eventos de pago de prueba | Wompi |
| GitHub Actions | Calidad en PR y smoke diario de producción | GitHub |

El trabajo `alertas` de `radar_cron_jobs` debe permanecer deshabilitado hasta que
el responsable del producto apruebe expresamente los envíos automáticos.

## 2. Checklist previo a despliegue

Desde `radar-mvp`:

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
git diff --check
```

Condiciones de salida:

- TypeScript sin errores.
- 129 pruebas o más aprobadas.
- 10/10 recorridos E2E aprobados.
- Sin secretos, `.env`, sesiones o archivos de salida en el diff.
- PR revisado y checks remotos en verde.
- Commit de merge identificado antes de abrir EasyPanel.

## 3. Despliegue en EasyPanel

1. Fusionar el PR en `main`.
2. Abrir `joinsclee / radar`.
3. Pulsar **Implementar** y comprobar que el historial muestra el commit de
   merge con indicador verde.
4. Esperar a que `/ready` responda `200`.
5. Desplegar `radar-cron` únicamente cuando el cambio afecte `cron/`,
   `scrapers/`, `engine/`, `lib/`, `server/notifications.ts`,
   `Dockerfile.cron` o dependencias compartidas.
6. Nunca activar un trabajo deshabilitado como parte incidental de un
   despliegue.

### Conceder o retirar el plan Pro a una cuenta

El panel `/admin` es el camino previsto, pero hoy no hay ninguna cuenta
administradora y crear una implicaría dar acceso al correo de todos los usuarios.
Mientras tanto:

```bash
npx tsx scripts/otorgar-plan.ts correo@ejemplo.com                  # simulacro
npx tsx scripts/otorgar-plan.ts correo@ejemplo.com --aplicar        # 365 días
npx tsx scripts/otorgar-plan.ts correo@ejemplo.com --dias=30 --aplicar
npx tsx scripts/otorgar-plan.ts correo@ejemplo.com --retirar --aplicar
```

Escribe en `app_metadata` **y** en `user_metadata` a propósito, para que el permiso
valga tanto en la producción actual como tras desplegar el arreglo de privilegios.
Queda registrado en el historial de suscripción de la cuenta, visible en `/cuenta`.

`--admin` concede además el rol de administrador. Va aparte del plan porque no es
«el plan más alto»: el panel expone el correo de todas las cuentas y permite
cambiarle la suscripción a terceros.

### Migración de privilegios a `app_metadata` (una sola vez)

Desde el 2026-07-27 el plan, el rol y el ciclo de la suscripción se leen de
`app_metadata`. Las cuentas creadas antes los tienen en `user_metadata` y, hasta
que se migren, **aparecen como `free` aunque hubieran pagado**. No al revés: nadie
gana permisos por no migrar.

Justo después de desplegar:

```bash
npx tsx scripts/migrar-privilegios-app-metadata.ts            # simulacro
npx tsx scripts/migrar-privilegios-app-metadata.ts --aplicar  # escribe
```

Es idempotente. Al terminar debe reportar `0 errores`, y una segunda corrida debe
decir que todas las cuentas ya estaban migradas.

Si el cambio incluye Wompi, antes de desplegar:

1. Aplicar `supabase/migrations/20260725000002_wompi_demo_payments.sql`.
2. Configurar en `radar` las llaves de prueba `WOMPI_PUBLIC_KEY`,
   `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`.
3. Mantener fuera de `radar-cron` las llaves de pago: ese servicio no las usa.
4. Registrar en Wompi la URL
   `https://joinsclee-radar.juno8i.easypanel.host/api/payments/wompi/events`.

## 4. Verificación posterior

```bash
curl --fail --silent --show-error \
  https://joinsclee-radar.juno8i.easypanel.host/health

curl --fail --silent --show-error \
  https://joinsclee-radar.juno8i.easypanel.host/ready

curl --fail --silent --show-error \
  https://joinsclee-radar.juno8i.easypanel.host/api/config

E2E_BASE_URL=https://joinsclee-radar.juno8i.easypanel.host \
  npm run test:e2e
```

Resultados esperados:

- `/health`: `200`, `ok: true`, estado `alive`.
- `/ready`: `200`, `ok: true`, estado `ready`.
- `/api/config`: Supabase público válido, estado del correo y
  `paymentDemoReady: true` cuando Wompi Sandbox esté habilitado.
- E2E: 10/10.
- Sin incremento sostenido de respuestas `500` en los logs.

## 5. Rollback

Ejecutar rollback cuando ocurra cualquiera de estos casos:

- `/ready` no llega a `200` en cinco minutos.
- Dos o más recorridos E2E críticos fallan.
- Login, listados o fichas dejan de funcionar.
- Se observan datos financieros imposibles o exposición de información privada.
- El proceso entra en reinicios repetidos.

Procedimiento:

1. En **EasyPanel → radar → Implementaciones**, localizar el último despliegue
   verde anterior.
2. Abrir **Ver** y volver a desplegar esa revisión.
3. Confirmar `/health`, `/ready` y ejecutar el smoke E2E.
4. Si el cambio también afectó al planificador, repetir en `radar-cron`.
5. No revertir migraciones destructivamente. Restaurar datos solo desde una
   copia verificada y en un entorno separado antes de tocar producción.
6. Registrar commit defectuoso, commit restaurado, hora, impacto y responsable.

## 6. Respuesta a incidentes

| Nivel | Ejemplo | Primera acción |
|---|---|---|
| P0 | Datos privados expuestos, cobros erróneos | Contener acceso y rotar secretos |
| P1 | Login, Radar o API principal caídos | Rollback y revisar EasyPanel/Supabase |
| P2 | Estadísticas, imágenes o correo degradados | Mantener servicio y aislar dependencia |

Orden de diagnóstico:

1. `/health` y `/ready`.
2. Historial y logs del despliegue en EasyPanel.
3. Estado y latencia de Supabase.
4. Smoke E2E de producción.
5. Resend únicamente si el incidente afecta correo.

La portada está diseñada para seguir mostrando resultados cuando las
estadísticas estén temporalmente indisponibles. No convertir esa degradación en
un P1 si los listados y fichas continúan operativos.

## 7. Backups y restauración ensayada

La herramienta y el procedimiento versionados están en
[`docs/SUPABASE_RECOVERY_DRILL.md`](./SUPABASE_RECOVERY_DRILL.md).

Antes de migraciones o cambios masivos:

1. Confirmar que existe una copia reciente de PostgreSQL administrada por
   Supabase o generar una exportación lógica cifrada.
2. Guardar la copia fuera del contenedor del VPS.
3. Registrar fecha, tamaño, entorno y responsable sin incluir credenciales.
4. Restaurar primero en un proyecto Supabase separado de ensayo.
5. Validar conteos, constraints, autenticación, favoritos, alertas y motor.
6. Documentar duración real y resultado del ensayo.

Ejemplo de exportación lógica, usando una variable de entorno segura:

```bash
pg_dump "$RADAR_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --file="radar-backup-$(date +%Y%m%d-%H%M).dump"
```

No guardar `RADAR_DATABASE_URL`, claves de servicio, tokens o contraseñas dentro
del repositorio, logs, PR o artefactos públicos.

Comandos operativos:

```bash
npm run backup:preflight
npm run backup:create
npm run backup:verify -- /ruta/segura/radar-fecha.dump
```

`backup:create` exige un directorio fuera del repositorio, verifica el archivo
con `pg_restore`, calcula SHA-256 y genera un manifiesto sin credenciales.

## 8. Monitor sintético e incidentes

```bash
npm run monitor:production
```

El monitor valida liveness, readiness, contrato de configuración y presupuestos
de latencia. Solo conserva estado HTTP, duración y diagnóstico mínimo; no guarda
el cuerpo de Supabase ni información de usuarios.

GitHub Actions ejecuta el monitor antes del E2E, conserva el reporte por catorce
días y, en **cualquier** ejecución del smoke —push a `main`, programada o manual—:

- abre o actualiza un issue si producción falla;
- enlaza la ejecución y este runbook;
- cierra el issue automáticamente cuando producción se recupera.

Hasta el 2026-07-27 estos dos pasos filtraban por tipo de evento y el smoke rojo
posterior a un merge no abría incidente. Era justo el caso en el que hace falta:
el despliegue recién publicado es el sospechoso número uno.

Una alerta del monitor no autoriza por sí sola un rollback. Aplicar los criterios
de las secciones 5 y 6.

## 9. Rotación de secretos

Orden recomendado:

1. Crear la nueva credencial en el proveedor.
2. Guardarla en `radar` y, si aplica, `radar-cron`.
3. Desplegar y verificar `/ready`.
4. Ejecutar una operación canaria segura.
5. Revocar la credencial anterior.
6. Confirmar que no quedó en logs, historial del shell o archivos.

Secretos a controlar:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ALERTS_CRON_SECRET`
- `WOMPI_INTEGRITY_SECRET`
- `WOMPI_EVENTS_SECRET`
- `WOMPI_PRIVATE_KEY` si se habilitan consultas servidor-servidor
- credenciales de scrapers autenticados
- claves de proveedores externos

## 10. Evidencia mínima por cambio

Cada entrega debe conservar:

- PR y commit de merge.
- Resultado de typecheck, pruebas y E2E.
- despliegue verde en EasyPanel.
- respuesta de `/health` y `/ready`.
- resultado del smoke de producción.
- decisión explícita si el cambio toca alertas automáticas, pagos o datos.

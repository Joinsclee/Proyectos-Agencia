# Radar MVP — etapas para producción

Estado de referencia: 27 de julio de 2026
Despliegue auditado: `https://joinsclee-radar.juno8i.easypanel.host/`

> Recalibrado el 2026-07-27 contra el código, no contra la memoria: cada casilla
> que cambió de estado cita el `archivo:línea` que la respalda. El detalle del
> corte está en [`docs/ESTADO_2026-07-27.md`](docs/ESTADO_2026-07-27.md).

## Principios de trabajo

- Primero se corrigen riesgos que puedan comprometer sesiones, generar costos o mostrar datos financieros falsos.
- Cada etapa termina con pruebas automáticas y una validación del flujo real.
- La experiencia entrega valor antes de pedir registro, sin urgencias inventadas ni patrones engañosos.
- Los cambios visuales se validan en 375, 768, 1280 y 1440 px.

## Etapa 0 — Baseline público y controles HTTP

Estado: **en curso**

- [x] Verificar HTTPS y redirección desde HTTP.
- [x] Medir respuesta del HTML y recursos principales.
- [x] Añadir tipos MIME correctos para imágenes, video, fuentes y scripts.
- [x] Añadir cabeceras de seguridad compatibles con el frontend actual.
- [x] Añadir un identificador opaco por petición y ocultar detalles de errores 500.
- [x] Eliminar handlers inline y habilitar CSP estricta para scripts.
- [ ] Versionar assets y habilitar compresión/caché en el proxy.

Criterio de salida: todos los recursos tienen MIME correcto, los errores no filtran
detalles y las cabeceras pueden comprobarse con una prueba HTTP.

## Etapa 1 — Bloqueantes de seguridad y calidad de datos

Estado: **en curso**

- [x] Eliminar handlers inline, escapar datos externos y validar URLs en tarjetas,
  modales y recomendaciones.
- [ ] Migrar la sesión fuera de `localStorage` a cookies `HttpOnly`, `Secure` y `SameSite`.
      Hoy se guardan ahí el access **y** el refresh token (`server/public/login.js:149,158`,
      `server/public/auth-callback.js:16-18`); no hay una sola cabecera `Set-Cookie` en `server/*.ts`.
- [x] Proteger registro, login y análisis IA con límites por identidad/IP.
      `server/rate-limit.ts` aplicado en siete puntos de `server/index.ts`.
- [ ] Añadir control de concurrencia a las operaciones caras (no hay semáforo ni cola).
- [x] Restringir `refresh` de análisis a operaciones autorizadas.
      `server/analysis-access.ts` + `server/index.ts`: solo un administrador autenticado
      fuerza el recálculo; para el resto el flag se ignora y se devuelve la caché.
- [ ] Activar verificación de correo y retirar correos completos de los logs.
      Sigue abierto: `server/auth.ts:37` crea con `email_confirm: true` y `:46,49`
      registran la dirección completa.
- [x] Sacar plan, rol y ciclo de suscripción de `user_metadata`, que el propio titular
      reescribe con su access token. Ahora se leen solo de `app_metadata`
      (`server/account-metadata.ts`), sin respaldo al valor viejo. Verificado de punta a
      punta: con el código anterior una cuenta que se escribía `role: admin` obtenía el
      panel completo con el correo de todos los usuarios; ahora recibe 403.
      Migración de las cuentas previas: `scripts/migrar-privilegios-app-metadata.ts`.
- [x] Que el dashboard no afirme una frescura que no tiene: «Actualizado» sale de
      `radar_cron_jobs` vía `server/frescura.ts`, no de la fecha del navegador, y avisa
      cuando una fuente pasa del doble de su cadencia o falla.
- [x] Impedir que avalúos, posturas y porcentajes imposibles lleguen a la UI o a la IA.
      Parcial: `server/data-quality.ts` los enmascara al presentar, pero el valor crudo
      sigue entrando a la base y participa en orden y conteos (ver la casilla de ingestión).
- [x] Evitar comparables históricos en fichas del Portal; recalcularlos al abrir para
  que coincidan con el endpoint vigente.
- [x] Actualizar dependencias compatibles y eliminar vulnerabilidades de severidad alta.
- [x] Retirar `node-cron`, que ya no era utilizado, y cerrar las dos alertas
  moderadas transitivas de `uuid`.
- [ ] Validar también en ingestión y base de datos; enviar outliers a cuarentena.
      No existe cuarentena (`lib/supabase.ts:75,169` descarta con un `log.warn`),
      `lib/remates-db.ts:31-46` inserta sin zod, y no hay CHECK de precio/área en
      ninguna migración.

Criterio de salida: ninguna cadena externa entra en un sink HTML o URL sin validación,
los tokens no son accesibles desde JavaScript y un dato imposible no llega a la interfaz.

## Etapa 2 — Navegación móvil y accesibilidad

Estado: **completada y desplegada**

- [x] Reemplazar la navegación horizontal superpuesta por navegación móvil dedicada.
- [x] Llevar resultados y controles por encima del contenido explicativo.
- [x] Colapsar filtros secundarios y mostrar la cantidad de filtros activos.
- [x] Corregir el modal para abrir arriba, atrapar foco y devolverlo al cerrar.
- [x] Convertir tarjetas en controles navegables con teclado.
- [x] Garantizar targets táctiles de 44 px y textos alternativos útiles.
- [x] Poner el formulario de login en el primer viewport móvil.

Validación local y en producción: 375 × 812 y 1440 × 1000; sin desbordamiento
horizontal, navegación principal visible y resultados renderizados.

Criterio de salida: los flujos Portal, Bancos, Remates, Guardados y Login son utilizables
con teclado y en 375 px sin elementos ocultos o superpuestos.

## Etapa 3 — Conversión y activación

Estado: **en curso**

- [x] Permitir favoritos temporales antes del registro y sincronizarlos al entrar.
- [x] Permitir simulaciones persistentes antes del registro en el dispositivo.
- [x] Pedir cuenta para sincronizar el Radar y los guardados, no para entregar el
  primer resultado útil.
- [x] Crear personalización de tres pasos: ciudad, presupuesto y tipo de inmueble.
- [x] Usar defaults editables, progreso visible y divulgación progresiva en filtros.
- [x] Preparar la primera alerta semanal desde las preferencias antes del registro.
- [ ] Activar la entrega de alertas por correo. El canal está implementado y probado
      (`server/notifications.ts`, función `sendDigest`; Resend configurado en producción); falta
      **solo** habilitar el trabajo `alertas` de `radar_cron_jobs`, hoy en `false` por
      decisión de producto (runbook §1). Mientras siga apagado, `/api/config` publica
      `alertDispatchEnabled: false` y la cuenta dice "envío en pausa" en vez de prometerlo.
- [ ] Completar el onboarding posterior al registro: `server/public/login.js:148-150`
      redirige a `/` sin ningún paso guiado.
- [x] Mostrar comparables y costo total antes de cualquier CTA de pago.
- [ ] Sustituir imágenes genéricas de remates por evidencia neutral y trazable.

Validación local: un visitante anónimo puede configurar su Radar, aplicar tres filtros,
guardar una propiedad, preparar una alerta, conservar una simulación, verla reflejada
al llegar al registro y consultar comparables/costo total antes de una suscripción.

Criterio de salida: el usuario recibe valor verificable antes del registro y completa una
primera acción útil sin tener que comprender toda la aplicación.

## Etapa 4 — Operación de producción

Estado: **en curso**

- [x] CI para typecheck, pruebas y análisis de dependencias de producción.
- [x] Pruebas automatizadas de API pública, móvil y recorridos E2E críticos.
- [x] Suite E2E crítica de seis recorridos, ejecutable en local y producción.
- [x] Integrar typecheck, 141 pruebas y smoke E2E diario de producción en CI.
- [x] Monitor sintético de liveness, readiness y configuración con presupuestos
  de latencia, artefacto auditable e issue automático de incidente/recuperación.
  Desde el 2026-07-27 el incidente se abre en **cualquier** ejecución del smoke,
  incluida la de push a `main`; antes se filtraba por evento y el fallo posterior
  a un merge pasaba en silencio. El cierre automático sigue limitado a corridas
  programadas o manuales: con despliegue manual, un verde en el push mide el build
  anterior y no acredita recuperación.
- [ ] Centralizar logs, errores y trazas; calcular latencia p75 por ruta.
      Hoy la observabilidad es `console.log` (`lib/logger.ts:48-51`) sin retención:
      el `X-Request-Id` que se devuelve en los 500 no es rastreable en ningún sistema.
- [x] Apagado controlado con `SIGTERM`/`SIGINT`, incluyendo drenaje de conexiones
  y timeout defensivo (`server/index.ts`, función `shutdown`).
- [ ] Que `/ready` refleje de verdad la disponibilidad: hoy `server/index.ts` marca
      `serviceReady = true` dentro del callback de `server.listen` y el precalentamiento
      de comparables arranca después (`warmStats` → `warmCityPools` de
      `engine/zone-comps.ts`), así que el proxy
      manda tráfico a un proceso que todavía está cargando. Es la explicación más
      plausible de los smokes rojos del 26 y 27 de julio.
- [x] Imagen Docker web multi-stage, dependencias de producción y ejecución como
  usuario no-root.
- [x] Degradación explícita de estadísticas: una caída temporal de Supabase no
  inventa ceros ni rompe la navegación y los resultados.
- [x] Runbook versionado para despliegue, rollback, incidentes, backups y
  rotación de secretos.
- [x] Automatizar creación de backup lógico, checksum, manifiesto y verificación
  de archivo sin credenciales.
- [ ] Ejecutar y cronometrar una restauración real en un Supabase de ensayo.
- Presupuesto de Core Web Vitals y observación de p75.

Criterio de salida: despliegue reproducible, observable y recuperable sin depender de
intervención manual improvisada.

## Etapa 5 — QA, canary y salida

Estado: **en curso**

- [x] QA automatizado en el dominio final, escritorio y viewport móvil.
- [ ] QA ampliado en dispositivos físicos y navegadores adicionales.
- [ ] Prueba de carga sobre rutas públicas y de autenticación. Bloqueada por la
      casilla de `/ready`: medir capacidad contra un proceso que se declara listo
      mientras precarga no produce un número interpretable.
- [ ] Revisión legal de privacidad, marketing y tratamiento de datos. Hoy solo hay
      una frase suelta sobre la Ley 1581 en `server/public/login.html:138`, sin
      política ni términos enlazados desde las pantallas que capturan datos o cobran.
- [ ] Canary con monitoreo de errores, latencia y calidad de datos.
- [x] Checklist de rollback y aprobación de lanzamiento:
      `docs/PRODUCTION_RUNBOOK.md:22-41` (previo) y `:90-109` (disparadores y
      procedimiento de rollback).

Criterio de salida: cero bloqueantes P0, métricas dentro de presupuesto y rollback probado.

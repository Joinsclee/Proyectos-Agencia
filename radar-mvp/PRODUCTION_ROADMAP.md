# Radar MVP — etapas para producción

Estado de referencia: 24 de julio de 2026
Despliegue auditado: `https://joinsclee-radar.juno8i.easypanel.host/`

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
- [ ] Proteger registro, login y análisis IA con límites por identidad/IP y concurrencia.
- [ ] Restringir `refresh` de análisis a operaciones autorizadas.
- [ ] Activar verificación de correo y retirar correos completos de los logs.
- [x] Impedir que avalúos, posturas y porcentajes imposibles lleguen a la UI o a la IA.
- [x] Evitar comparables históricos en fichas del Portal; recalcularlos al abrir para
  que coincidan con el endpoint vigente.
- [x] Actualizar dependencias compatibles y eliminar vulnerabilidades de severidad alta.
- [ ] Migrar `node-cron` 3 → 4 y cerrar las dos alertas moderadas restantes de `uuid`.
- [ ] Validar también en ingestión y base de datos; enviar outliers a cuarentena.

Criterio de salida: ninguna cadena externa entra en un sink HTML o URL sin validación,
los tokens no son accesibles desde JavaScript y un dato imposible no llega a la interfaz.

## Etapa 2 — Navegación móvil y accesibilidad

Estado: **completada localmente, pendiente de revisión del cliente**

- [x] Reemplazar la navegación horizontal superpuesta por navegación móvil dedicada.
- [x] Llevar resultados y controles por encima del contenido explicativo.
- [x] Colapsar filtros secundarios y mostrar la cantidad de filtros activos.
- [x] Corregir el modal para abrir arriba, atrapar foco y devolverlo al cerrar.
- [x] Convertir tarjetas en controles navegables con teclado.
- [x] Garantizar targets táctiles de 44 px y textos alternativos útiles.
- [x] Poner el formulario de login en el primer viewport móvil.

Validación local: 375 × 812, 390 × 844 y 1440 × 900; sin desbordamiento
horizontal, navegación de cinco destinos visible y 24 resultados renderizados.

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
- [ ] Activar entrega de alertas por correo y completar el onboarding posterior al registro.
- [x] Mostrar comparables y costo total antes de cualquier CTA de pago.
- [ ] Sustituir imágenes genéricas de remates por evidencia neutral y trazable.

Validación local: un visitante anónimo puede configurar su Radar, aplicar tres filtros,
guardar una propiedad, preparar una alerta, conservar una simulación, verla reflejada
al llegar al registro y consultar comparables/costo total antes de una suscripción.

Criterio de salida: el usuario recibe valor verificable antes del registro y completa una
primera acción útil sin tener que comprender toda la aplicación.

## Etapa 4 — Operación de producción

Estado: **pendiente**

- CI para typecheck, pruebas, migraciones y análisis de dependencias.
- Pruebas de API, autorización, móvil y recorridos E2E.
- Logs estructurados, métricas de latencia, seguimiento de errores y alertas.
- Endpoint de readiness y apagado controlado con `SIGTERM`.
- Imagen Docker multi-stage y ejecución como usuario no-root.
- Backups con restauración ensayada, rotación de secretos y runbook de incidentes.
- Presupuesto de Core Web Vitals y observación de p75.

Criterio de salida: despliegue reproducible, observable y recuperable sin depender de
intervención manual improvisada.

## Etapa 5 — QA, canary y salida

Estado: **pendiente**

- QA completo en el dominio final y dispositivos reales.
- Prueba de carga sobre rutas públicas y de autenticación.
- Revisión legal de privacidad, marketing y tratamiento de datos.
- Canary con monitoreo de errores, latencia y calidad de datos.
- Checklist de rollback y aprobación de lanzamiento.

Criterio de salida: cero bloqueantes P0, métricas dentro de presupuesto y rollback probado.

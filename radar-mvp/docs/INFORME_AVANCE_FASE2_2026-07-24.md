# Radar de Oportunidades Inmobiliarias

## Informe de avance de producto y Fase 2

**Corte:** 25 de julio de 2026
**Estado:** corte funcional validado localmente y desplegado
**Producción vigente:** `https://joinsclee-radar.juno8i.easypanel.host/`  
**Versión desplegada de Fase 2:** PR #2, merge `b89770c`

## 1. Resumen ejecutivo

El compromiso de llegar a por lo menos 80% de la Fase 1 ya se cumplió: el corte
defendible de esa fase sigue siendo 84%. La nueva ejecución agrega una base
comercial y operativa de Fase 2 sin convertir maquetas en promesas.

Hay dos usos históricos del término “Fase 2” en los documentos del proyecto:

1. La Fase 2 técnica original, asociada al motor de remates judiciales, está
   aproximadamente al 92%.
2. La Fase 2 comercial/expansión, que incluye planes, alertas, rentabilidad,
   comparador, administración, pagos e integraciones, queda aproximadamente al
   73% con este corte.

La conclusión honesta es: el producto supera el 80% comprometido para Fase 1 y
la Fase 2 comercial ya tiene un recorrido demostrable en local. El proveedor de
correo y el dominio de envío quedaron validados, pero todavía no debe venderse
como monetización ni como una automatización semanal operativa en producción.

## 2. Qué se implementó en este corte

### Planes, acceso y monetización responsable

- Catálogo de planes Explorador y Radar Pro servido por API.
- Página pública `/planes` responsive.
- Precio Pro explícitamente “por definir con el cliente”.
- Ningún cobro automático ni botón que simule una compra.
- Registro de interés comercial en la cuenta del usuario.
- Compatibilidad con las marcas históricas `suscrito`, `premium` y la nueva
  denominación `pro`.
- Ciclo de vida manual para `trialing`, `active`, `past_due` y `canceled`.
- El acceso Pro se activa únicamente para cuentas activas o en prueba; un pago
  pendiente o una cancelación devuelve la cuenta al acceso Explorador.
- Límites por plan: una alerta para Free y hasta cinco para Pro.
- Fichas completas reservadas al plan Pro desde el servidor.

### Cuenta y continuidad entre dispositivos

- Centro de cuenta `/cuenta`.
- Sincronización de preferencias, simulaciones y borrador de alerta después del
  inicio de sesión.
- Administración de alertas semanales.
- Exportación de los datos de cuenta en JSON.
- Entrada al comparador y al panel administrativo según permisos.

### Alertas semanales

- Alertas persistentes en metadata de Supabase Auth.
- Contrato separado para validar entradas y alertas ya persistidas.
- Validación de ciudad, presupuesto, tipo, frecuencia y estado.
- Límite por plan y actualización idempotente de la alerta primaria.
- Detección de alertas vencidas cada siete días.
- Búsqueda de nuevas oportunidades por ciudad, presupuesto y tipo.
- Plantilla de correo segura, con contenido escapado.
- Adaptador real para Resend.
- Clave de idempotencia por entrega para evitar correos duplicados.
- Historial de envíos, ciclos sin coincidencias y fallos.
- Reintentos a 15 minutos, una hora, seis horas y veinticuatro horas.
- Endpoint interno protegido para ejecutar el ciclo.
- Trabajo semanal integrado al planificador persistido después del motor.
- Migración preparada con el trabajo `alertas` deshabilitado por defecto, para
  impedir envíos antes del canary.
- Degradación segura: sin proveedor o secreto, el sistema responde que el canal
  no está configurado y no finge un envío.

### Comparador y rentabilidad

- Comparador `/comparador` para dos o tres inmuebles guardados.
- Criterios homogéneos: fuente, precio/postura, mercado/avalúo, descuento, área,
  habitaciones, ciudad y ubicación.
- Respeto del muro de acceso al cargar favoritos completos.
- Calculadora de rentabilidad bruta y neta a partir del canon esperado ingresado
  por el usuario.
- Descuento explícito de vacancia, mantenimiento y administración.
- La interfaz aclara que el canon es declarado por el usuario, no observado en
  una fuente externa.
- Exportación tabular CSV de cuenta, simulaciones, alertas y entregas.

### Administración

- Panel `/admin` protegido por rol.
- Indicadores agregados de usuarios, cuentas Pro, solicitudes Pro, alertas
  activas y perfiles personalizados.
- Embudo de suscripciones y métricas de entrega de los últimos treinta días.
- Cola operable de solicitudes Radar Pro con cambio de estado y motivo.
- Historial auditable de cambios comerciales, sin exponerlo como un cobro.
- Sin exposición de contraseñas o tokens.

### Controles operativos

- Límites de solicitudes para autenticación, análisis y escrituras sensibles.
- Respuesta `429` con tiempo de reintento.
- Contadores separados por IP, usuario y tipo de acción.

## 3. Avance ponderado de la Fase 2 comercial

| Bloque | Peso | Cumplimiento | Aporte |
|---|---:|---:|---:|
| Base comercial, cuenta y UX | 15% | 90% | 13,5 |
| Planes, acceso y suscripción | 15% | 80% | 12,0 |
| Alertas y notificaciones | 20% | 97% | 19,4 |
| Comparador y exportación | 15% | 85% | 12,8 |
| Canon y rentabilidad | 15% | 35% | 5,3 |
| Administración | 10% | 90% | 9,0 |
| Pagos e integraciones externas | 10% | 10% | 1,0 |
| **Total** | **100%** |  | **73,0% ≈ 73%** |

Este porcentaje no reduce el 84% de Fase 1. Mide un alcance adicional que todavía
depende de decisiones comerciales, credenciales y proveedores.

## 4. Evidencia de calidad local

- TypeScript: sin errores.
- Pruebas unitarias e integración: 98/98 aprobadas.
- Recorridos E2E: 6/6 aprobados.
- Errores de JavaScript observados: 0.
- QA visual en 1440 × 1000 y 375 × 812.
- Salud ponderada del corte: 98,6/100.
- API de planes sin sesión: 200.
- API de cuenta sin token: 401.
- APIs administrativas y mutación de suscripción sin token: 401.
- Ejecutor de alertas sin configuración: 503 seguro.
- Plan gratuito de Resend confirmado: 3.000 correos mensuales y 100 diarios.
- Dominio `joinsclee.com` verificado en Resend.
- Clave de pruebas restringida exclusivamente a envío y al dominio verificado.
- Instancia local temporal con `alertEmailDeliveryReady: true`.
- Envío controlado desde `radar@joinsclee.com` aceptado y entregado por Resend
  al buzón seguro `delivered@resend.dev`.
- Identificador auditable de la prueba:
  `895fb08a-0c5c-4390-8e6e-e913a591c85c`.
- Secretos guardados en EasyPanel para `radar` y `radar-cron`.
- Servicios `radar` y `radar-cron` desplegados desde el merge del PR #2.
- Producción responde `alertEmailDeliveryReady: true`.
- Trabajo persistido en Supabase con cadencia de siete días y
  `habilitado=false` hasta completar el canary dirigido.
- No se crearon, modificaron o eliminaron usuarios reales durante el QA.

## 5. Stack vigente

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+, TypeScript, ESM |
| Servidor | HTTP nativo de Node y API JSON |
| Frontend | HTML, CSS y JavaScript nativos |
| Datos | Supabase PostgreSQL, Auth y Storage |
| Correo transaccional | Resend, dominio verificado e idempotencia por entrega |
| Validación | Zod |
| Extracción | Firecrawl, Playwright y parsers PDF |
| Motor | Estadística robusta, comparables e Índice CRECE |
| Programación | Scheduler persistido en PostgreSQL y temporizador nativo |
| QA | node:test, Playwright y Chromium |
| Infraestructura | Docker, VPS y EasyPanel |

## 6. Qué falta para llevar la Fase 2 comercial a 80%

### Prioridad 1: activar alertas reales

- Completado: cuenta gratuita de Resend disponible.
- Completado: dominio `joinsclee.com` verificado.
- Completado: envío controlado y estado `delivered` comprobado.
- Completado en local temporal: `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`,
  `ALERTS_CRON_SECRET` y `APP_BASE_URL`.
- Completado en código: trabajo semanal posterior al motor y migración segura.
- Completado: secretos guardados en EasyPanel y servicios desplegados.
- Completado: trabajo persistido en Supabase y deshabilitado hasta el canary.
- Pendiente: ejecutar un canary de producción dirigido a una cuenta autorizada.
- Pendiente: habilitar el trabajo semanal después de validar el destinatario.
- Migrar el historial de metadata a una tabla dedicada cuando el volumen lo
  justifique.

### Prioridad 2: cerrar planes y pago

- Aprobar precio, moneda, periodicidad, prueba y política de cancelación.
- Elegir proveedor de pago.
- Implementar checkout y webhooks.
- Conectar los webhooks al ciclo de vida de suscripción ya implementado.
- Probar idempotencia, renovación, fallo de cobro y cancelación.

### Prioridad 3: canon observado

- Definir una fuente legal/autorizada de canon de arriendo.
- Diseñar ingesta, normalización, vigencia y trazabilidad.
- Vincular canon comparable por ciudad, zona, tipo y área.
- Diferenciar rentabilidad estimada por usuario de rentabilidad basada en datos.

### Prioridad 4: operación comercial

- Añadir una exportación ejecutiva en PDF.
- Definir y conectar las integraciones Low Ticket/Tradentia.

Con alertas entregadas, checkout funcional y una primera fuente de canon
autorizada, la Fase 2 comercial puede superar el 80%. Las integraciones de terceros
pueden permanecer en el tramo posterior si el cliente no entrega especificación.

## 7. Dependencias que requieren decisión o credenciales

| Dependencia | Decisión necesaria | Estado del código |
|---|---|---|
| Precio Radar Pro | Tarifa, periodicidad y beneficios definitivos | Página y catálogo listos |
| Proveedor de pago | Mercado Pago, Wompi, Stripe u otro | Estados y permisos listos; checkout no seleccionado |
| Resend | Ejecutar canary dirigido | Proveedor, dominio, secretos y despliegue listos |
| EasyPanel cron | Validar destinatario y habilitar | Trabajo semanal desplegado pero deshabilitado |
| Canon de arriendo | Fuente autorizada | Calculadora manual lista |
| Low Ticket/Tradentia | API, contrato o especificación | Pendiente externo |
| Rol administrador | Usuario que debe recibirlo | Control de acceso listo |

## 8. Qué no debe afirmarse al cliente todavía

- Que Radar Pro ya cobra o renueva una suscripción.
- Que las alertas ya llegan a correos reales.
- Que el canon mostrado proviene de una fuente de mercado.
- Que Low Ticket o Tradentia ya están integrados.
- Que existe un SLA empresarial o recuperación ensayada.
- Que la autenticación ya usa cookies HttpOnly; los tokens siguen en
  almacenamiento local.

## 9. Endurecimiento antes de apertura comercial

- Migrar sesión a cookies HttpOnly/Secure/SameSite y protección CSRF.
- Migrar los límites de abuso a un almacén compartido si se ejecutan varias
  réplicas del servidor.
- Activar verificación de correo.
- Añadir CI/CD, métricas, alertas y trazas centralizadas.
- Ejecutar restauración de backup y rollback.
- Ejecutar carga, canary y auditoría WCAG.
- Migrar alertas y favoritos desde metadata a tablas cuando el volumen lo exija.

## 10. Guion de demostración de Fase 2

1. Abrir `/planes` y explicar que no se publica una tarifa no aprobada.
2. Iniciar sesión y abrir `/cuenta`.
3. Mostrar preferencias sincronizadas y crear una alerta semanal.
4. Guardar dos inmuebles y abrir `/comparador`.
5. Abrir una ficha e ingresar canon y administración en la rentabilidad.
6. Descargar el archivo de cuenta.
7. Mostrar `/admin` únicamente con una cuenta autorizada y procesar una solicitud
   de prueba sin presentarla como cobro.
8. Mostrar cómo un estado `past_due` pausa el acceso Pro en la cuenta.
9. Cerrar con la lista de dependencias externas para alcanzar 80% de Fase 2.

## 11. Dictamen

El producto está listo para una demostración local de Fase 2 y mantiene el
cumplimiento superior al 80% de Fase 1. El nuevo alcance comercial está en 73%:
la experiencia y la base técnica existen, Resend ya entregó un correo controlado
y el dominio está verificado; pagos, automatización semanal en producción, canon
observado e integraciones todavía requieren decisiones y configuración externa.

La recomendación es ejecutar un canary dirigido y habilitar el trabajo semanal
solo después de revisar el destinatario. Después debe priorizarse pago o canon
observado para acercar el avance comercial al 80%.

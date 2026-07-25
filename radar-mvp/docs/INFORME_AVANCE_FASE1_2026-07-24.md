# Radar de Oportunidades Inmobiliarias

## Informe de avance, trazabilidad y preparación para producción

**Corte:** 24 de julio de 2026  
**Versión evaluada en producción:** `38d3a878b52504b23cfae5238e621d67e318420d`  
**URL:** <https://joinsclee-radar.juno8i.easypanel.host/>  
**Conclusión:** **83,6% de la Fase 1; se comunica como 84% (rango razonable 82–85%)**.

## 1. Resumen ejecutivo

El Radar ya supera el objetivo del 80% de la Fase 1 y puede presentarse como un MVP
funcional, desplegado y demostrable con datos reales. No es una maqueta: consulta
Supabase, muestra Portal, activos bancarios y remates, calcula oportunidades, aplica
reglas CRECE, permite filtrar, revisar fichas, guardar inmuebles, simular costos e
iniciar sesión por correo o Google.

El 84% no significa que el producto esté totalmente endurecido para tráfico comercial
masivo. Los pendientes principales ya no son de apariencia: son controles de sesión y
abuso, trazabilidad de ciclo de vida en todas las fuentes, alertas enviadas por correo y
operación reproducible/observable.

## 2. Cómo se calculó el avance

El porcentaje se calcula sobre la Fase 1 documentada y sobre los requisitos necesarios
para operar el MVP. No se incluyen como deuda elementos expresamente enviados a Fase 2,
como canon de arriendo, página de planes, comparador estilo Habímetro o aplicación móvil
nativa.

| Bloque | Peso | Cumplimiento | Aporte |
|---|---:|---:|---:|
| Núcleo CRECE y comparables | 20% | 95% | 19,0 |
| Portal, rangos y vigencia | 15% | 78% | 11,7 |
| Activos bancarios generales | 15% | 82% | 12,3 |
| Grupo AVAL | 10% | 72% | 7,2 |
| Remates judiciales | 15% | 92% | 13,8 |
| Producto, UX, autenticación y freemium | 15% | 88% | 13,2 |
| Producción, seguridad, QA y operación | 10% | 64% | 6,4 |
| **Total ponderado** | **100%** |  | **83,6%** |

## 3. Evidencia objetiva al corte

- Producción activa por HTTPS y HTTP/2.
- 104.626 listados de portal abierto.
- 18.519 oportunidades y 1.555 oportunidades fuertes.
- 501 activos bancarios.
- 688 remates.
- 67 ciudades reportadas por la API.
- 80/80 pruebas unitarias e integración aprobadas.
- 5/5 recorridos E2E aprobados en local.
- 5/5 recorridos E2E aprobados en producción.
- TypeScript sin errores.
- 0 errores de consola durante los recorridos E2E.
- Google OAuth probado manualmente de extremo a extremo en producción.
- Cabeceras CSP, HSTS, MIME seguro, anti-framing y request ID verificadas.

## 4. Trazabilidad por documento/HU

### Núcleo del Motor de Comparables — 95%

**Hecho:** fórmula CRECE; mediana basada en portal abierto; exclusión de bancos/remates
del universo de referencia; recorte de outliers; comparación por tipo/área/atributos;
cascada geográfica/textual; trazabilidad de nivel; tabla maestra de 11 categorías; corte
0,71–0,75 resuelto como Oportunidad Fuerte hasta 0,75; persistencia de índice/categoría.

**Falta:** completar auditoría de persistencia del Índice CRECE para el 100% de filas
históricas y documentar el criterio de radio/zonas colindantes como decisión formal del
negocio.

### Rango de precio y vigencia de Portal — 78%

**Hecho:** tabla `radar_zonas_monitoreadas`; niveles por ciudad; precios mínimo/máximo,
estratos 2–5 y fecha de revisión configurables; reglas 30/90 días implementadas y
probadas; eventos de vigencia modelados; cadencia semanal.

**Falta:** conectar de forma uniforme la escritura de todos los eventos
`NUEVO/VISTO/PRECIO_ACTUALIZADO/RETIRADO/EXPIRADO/DESCARTADO` desde cada scraper hacia
`oportunidades_historial`, y verificar automáticamente poblaciones/activación de ciudades.

### Motor de Activos Bancarios — 82%

**Hecho:** fuentes bancarias, esquema normalizado, ausencia de estrato no bloqueante,
interfaz sin filtro de estrato, clasificación contra el mercado abierto, mensaje
“Verificado hace…”, rotación semanal y cadencia de siete días persistida en base.

**Falta:** cerrar la estrategia de identidad secundaria para fuentes con slug inestable,
uniformar la detección de retiro/cambio de precio y registrar todos los eventos de
historial desde los scrapers.

### Grupo AVAL — 72%

**Hecho:** resolución dinámica del boletín PDF; descarga, extracción por página,
deduplicación por código; precio, tipo, área, dirección y ciudad; `area_tipo` para impedir
comparar lote contra apartamento; imagen por ficha y carga a almacenamiento.

**Falta:** completar normalización ciudad-departamento con bandera de revisión, extracción
opcional marcada para habitaciones/baños, comparación completa entre boletines,
validación cruzada de insignias “Nuevo Inmueble/Nuevo Valor” y trazabilidad del boletín
en el historial.

### Motor de Remates Judiciales — 92%

**Hecho:** origen del demandante, tipo de proceso y cuota-parte; regla conservadora cuando
el origen es incierto; matriz gratis/suscripción; alerta amarilla visible; diferenciación
entre porcentaje de postura y cuota-parte; barrera contra avalúos/posturas imposibles;
calculadora y presentación responsive.

**Falta:** cuarentena de anomalías desde ingestión/base de datos y sustitución de imágenes
genéricas por evidencia neutral y trazable cuando la fuente no aporta imagen.

### UX, autenticación y modelo freemium — 88%

**Hecho:** jerarquía visual renovada; navegación responsive; filtros progresivos; targets
táctiles; foco del modal; tarjetas accesibles por teclado; login visible en el primer
viewport; favoritos anónimos y sincronización; simulaciones locales; personalización de
tres pasos; borrador de alerta; correo/contraseña; Google OAuth en producción; contenido
premium y comparables antes del CTA.

**Falta:** envío real de alertas por correo, onboarding posterior al registro, página
comercial de planes/pago si se aprueba para Fase 2 y revisión formal de accesibilidad WCAG.

### Producción, seguridad y operación — 64%

**Hecho:** VPS/EasyPanel, Docker, HTTPS, healthcheck, CSP/HSTS, MIME correcto, sanitización
de datos/URLs, request IDs, errores 500 genéricos, pruebas automatizadas locales y sobre
producción.

**Falta prioritario:** cookies `HttpOnly/Secure/SameSite`; rate limit de login/registro/IA;
verificación de correo; eliminar correos completos de logs; CI/CD; métricas y alertas;
readiness y apagado controlado; contenedor no-root/multi-stage; backups restaurados en
ensayo; prueba de carga, canary y rollback probado.

## 5. Stack actual

| Capa | Tecnología |
|---|---|
| Runtime y backend | Node.js 20+ y TypeScript 5.6, módulos ESM |
| Servidor/API | Servidor HTTP nativo de Node, API JSON y archivos estáticos |
| Frontend | HTML, CSS y JavaScript nativos; responsive |
| Base de datos | Supabase PostgreSQL |
| Autenticación | Supabase Auth: correo/contraseña y Google OAuth |
| Extracción | Firecrawl, lectura SSR, parsers PDF y Playwright donde aplica |
| Motor | Estadística robusta, Índice CRECE y reglas de dominio TypeScript |
| Validación | Zod |
| Automatización | Scheduler persistido en PostgreSQL, temporizador nativo y cerrojo |
| QA | `node:test`, TypeScript y Playwright/Chromium |
| Infraestructura | Docker, VPS y EasyPanel |
| Código y entrega | Git/GitHub; PR y despliegue controlado |

## 6. Mejoras de experiencia aplicadas

- El valor se muestra antes de exigir registro.
- La interfaz prioriza resultados y acciones, no explicaciones largas.
- Los filtros avanzados se revelan progresivamente.
- Los estados de carga, vacío, error y guardado ofrecen feedback.
- La navegación funciona en 375 px sin solapamiento horizontal.
- Los botones táctiles, foco visible, cierre/retorno de foco del modal y labels
  accesibles reducen fricción.
- Guardados, simulación y preferencias sobreviven antes de crear cuenta.
- El login diferencia claramente crear cuenta e iniciar sesión; una contraseña antigua
  corta puede iniciar sesión sin debilitar la regla de ocho caracteres para cuentas nuevas.
- Google reduce el costo de entrada y se encuentra configurado en producción.

## 7. Riesgos y decisiones que deben comunicarse

1. El producto está listo para demo y piloto controlado, no para declarar SLA empresarial.
2. Los tokens siguen en `localStorage`; la CSP mitiga XSS, pero no sustituye una cookie
   `HttpOnly`.
3. El análisis IA necesita límites de consumo antes de abrir campañas masivas.
4. El cron funciona y la cadencia vive en la base, pero falta observabilidad central.
5. `npm audit --omit=dev` no reporta vulnerabilidades conocidas; se retiró
   `node-cron` porque el scheduler persistido ya no lo utilizaba.
6. EasyPanel tiene el despliegue automático deshabilitado; hoy la publicación es manual.
7. Los volúmenes son una fotografía del 24 de julio de 2026 y cambian con las fuentes.

## 8. Qué falta para llegar al 90% y al 100%

### 84% → 90% (prioridad inmediata)

1. Migrar sesión a cookies seguras y agregar protección CSRF.
2. Implementar rate limiting y cuotas para autenticación/análisis IA.
3. Completar diff de boletines AVAL y escritura uniforme de historial.
4. Entregar alertas por correo y finalizar onboarding registrado.
5. Añadir CI con typecheck, 80 pruebas y los 5 recorridos E2E.

### 90% → 100% (endurecimiento)

1. Observabilidad, métricas, seguimiento de errores y alarmas.
2. Readiness, apagado controlado y contenedor multi-stage no-root.
3. Backups con restauración ensayada y runbook de incidentes.
4. Pruebas de carga, matriz ampliada de navegadores/dispositivos y WCAG formal.
5. Canary, rollback probado y revisión legal final.
6. Cuarentena de datos anómalos desde la ingestión.

## 9. Fuera de Fase 1

No deben descontarse del 84%:

- scraping/filtro de canon de arriendo;
- comparador de oportunidades tipo Habímetro;
- aplicación móvil nativa;
- banners comerciales Low Ticket/Tradentia;
- página de planes y pasarela de pago;
- nuevas fuentes no acordadas;
- herramientas adicionales distintas de las ya implementadas.

## 10. Guion de demostración al cliente

1. Abrir producción y mostrar cifras en vivo.
2. Filtrar Portal por ciudad/tipo y explicar descuento/comparables.
3. Abrir Bancos y señalar que no se excluyen inmuebles por estrato.
4. Abrir Remates, explicar postura, avalúo y alerta de cuota-parte.
5. Guardar un inmueble sin cuenta y recargar.
6. Entrar a Guardados y mostrar persistencia.
7. Mostrar personalización del Radar y simulador.
8. Abrir Login y enseñar acceso con Google.
9. Cerrar con la matriz de avance: 84% real y los cinco pendientes para llegar al 90%.

## 11. Dictamen

El proyecto **sí ha alcanzado más del 80% de la Fase 1**. La evidencia permite defender
un **84% real**, sin contar funcionalidades de Fase 2 como deuda. La aplicación está
desplegada, funciona con datos reales y tiene una base técnica probada. La recomendación
es presentarla como **MVP funcional en producción, apto para demo y piloto controlado**,
acompañada de un plan corto de endurecimiento antes de campañas o tráfico masivo.

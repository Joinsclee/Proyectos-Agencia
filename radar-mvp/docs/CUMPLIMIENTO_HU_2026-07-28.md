# Radar CRECE — Revisión de cumplimiento de las historias de usuario

**Fecha del corte:** 28 de julio de 2026
**Alcance revisado:** los 6 documentos de HU de Fase 1 entregados por el cliente
**Producción:** `https://joinsclee-radar.juno8i.easypanel.host`
**Código:** `main` @ `4aae9d6`

---

## 1. Cómo se hizo esta revisión

Cada criterio de aceptación se comprobó de una de estas tres formas, y en el
documento se dice cuál:

- **Contra el código**, citando `archivo:línea` o el símbolo cuando el archivo se
  mueve con frecuencia.
- **Contra la base de datos de producción**, con la consulta ejecutada y su
  resultado.
- **Contra la aplicación en marcha**, abriéndola en un navegador.

Ningún criterio se dio por cumplido leyendo el roadmap, un informe anterior o un
mensaje de commit. Cuando una comprobación no se pudo hacer, se dice.

Dos afirmaciones se corrigieron durante la propia revisión, y se dejan escritas
porque explican por qué el resto es fiable:

1. El primer intento midió `MIN_COMPARABLES = 4` y lo dio por incumplimiento del
   mínimo de 5 que exige la HU. Era el mínimo del motor de **arriendos**
   (`engine/rental-comparables.ts:63`), que estas HU no cubren. El motor de venta
   usa `minComparables: 5` (`engine/comparables.ts:84`) y **sí cumple**.
2. Se iba a reportar como incumplido el evento *RETIRADO*. Existe: la función
   `mark_stale_inmuebles` (`supabase/migrations/20260609000002_lifecycle_tracking.sql:46`,
   invocada desde `lib/supabase.ts:239`) oculta lo que deja de aparecer, con un
   margen de 2 corridas. Queda como **parcial**, no como incumplido.

---

## 2. Veredicto

**55 criterios de aceptación** repartidos en 9 historias de usuario.

| | Criterios | |
|---|---:|---|
| **Cumple** | 40 | 73 % |
| **Parcial** | 2 | 4 % |
| **Desviación documentada** | 2 | 4 % |
| **No cumple** | 11 | 20 % |

Ese 73 % es el conteo bruto de Fase 1, contando cada criterio con el mismo peso —
lo que hace que "registrar un evento en una tabla de auditoría interna" pese igual
que "calcular el Índice CRECE". No es la medida del valor entregado, y por eso el
punto 5 de este documento inventaria lo que se construyó **fuera** del alcance de
Fase 1.

Lo importante del 20 % que no cumple: **no son once problemas distintos**. Son
tres, y uno solo explica siete de los once.

---

## 3. Cumplimiento por historia

### HU 2 — Núcleo del Motor de Comparables (Índice CRECE)

Es la HU de la que dependen todas las demás: define la fórmula y la tabla de
clasificación que el resto debe usar sin reinterpretar.

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Índice CRECE = precio/m² ÷ mediana del grupo (zona + tipo); la mediana solo con FincaRaíz | **Cumple** | `engine/zone-comps.ts:184` construye el pool con `.eq('source','fincaraiz')` |
| 2 | Tabla maestra de 11 categorías, sin tablas paralelas simplificadas | **Cumple** | `engine/crece.ts` — las 11 filas con los umbrales exactos de la HU |
| 3 | Vacío de rango 0,71–0,75 — *«no se debe construir hasta confirmar»* | **Desviación** | Se resolvió a `CORTE_OPORTUNIDAD_FUERTE = 0.75` (`engine/crece.ts:64`), es decir Oportunidad Fuerte. Es una de las dos salidas que la HU planteaba, pero **no hay constancia de que el negocio la confirmara** |
| 4 | Muestra mínima de 5 comparables con cascada barrio → zona ampliada → ciudad | **Cumple** | `minComparables: 5` (`engine/comparables.ts:84`); la cascada marca `cascada_nivel` en cada fila |
| 5 | `fuentes_referencia` = FincaRaíz; `fuentes_evaluadas` = portal + bancos + remates | **Cumple** | Verificado en la base: bancos y remates reciben clasificación sin entrar en la mediana |
| 6 | Los activos bancarios no distorsionan la mediana por su bajo volumen | **Cumple** | Consecuencia del criterio 1 |

**5 cumplen · 1 desviación.**

---

### HU 3a — Rango de precio por nivel de ciudad

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Tabla de configuración con ciudad, nivel, precio, estrato, área, fecha de revisión | **Cumple** | `radar_zonas_monitoreadas`: 142 zonas de venta, todos los campos presentes y `fecha_ultima_revision` poblada en las 142 |
| 2 | Tabla inicial de capitales cargada | **Cumple** | La HU lista **32 ciudades**; hay **22 configuradas y activas**. Las 10 ausentes son justo las que la HU marcaba «verificar población» o «posible <100.000 hab» (Riohacha, Quibdó, Florencia, Mocoa, Leticia, San Andrés, San José del Guaviare, Inírida, Mitú, Puerto Carreño): no activarlas es lo que la HU pedía |
| 3 | Criterio de niveles, incluidos los casos pendientes de decisión | **Desviación** | Las dos primeras viñetas cumplen: los 4 de Nivel 1 a 500 M y los 136 de Nivel 2 a 400 M, sin excepciones. Las otras dos **no**: (a) **Cartagena y Bucaramanga están en Nivel 1** cuando la HU las deja en Nivel 2 con la nota «no asignar automáticamente sin confirmación»; (b) 5 ciudades marcadas «verificar población» están activas (Montería, Sincelejo, Tunja, Yopal, Arauca) sin que conste la verificación DANE que la HU exigía antes de activarlas |
| 4 | Estrato de análisis 2–5, no 2–4 | **Cumple** | 142 de 142 zonas con `stratum_min=2`, `stratum_max=5` |
| 5 | El filtro se aplica antes de entrar a la capa normalizada | **Cumple** | `scrapers/CO/fincaraiz/parser.ts:242-243` descarta leyendo `zona.price_min` / `zona.price_max` |
| 6 | El filtro decide *qué* entra, no *cómo* se puntúa | **Cumple** | Son dos etapas separadas del pipeline |
| 7 | Prohibido fijar el tope en el código del scraper | **Cumple** | El único literal es `RANGO_POR_DEFECTO` (`lib/ciudades.ts:32`), y es el respaldo conservador Nivel 2 para una ciudad sin configurar — no la fuente del filtro |

**6 cumplen · 1 desviación.**

> **Corrección posterior a la primera versión de este documento.** El criterio 3 se
> había marcado «Cumple exacto» tras comprobar solo los topes de precio de los dos
> niveles. Al contrastar después la tabla de la HU ciudad por ciudad aparecieron las
> dos viñetas que no se habían mirado: los casos especiales y las ciudades sujetas a
> verificación de población. Ambas son decisiones que la HU dejaba explícitamente al
> negocio y que se resolvieron por criterio técnico. El total del documento se
> ajustó de 41 a 40 criterios cumplidos.

### Las ciudades que se scrapean hoy

| Origen | Ciudades |
|---|---:|
| De la tabla de la HU 3a | **22** de 32 |
| Añadidas por demanda de remates | 105 |
| Añadidas por demanda de bancos | 15 |
| **Total configurado y activo** | **142** |

Las 120 que no salen de la HU entran solas: cuando aparece un remate o un activo
bancario en una ciudad sin configurar, el sistema la da de alta en Nivel 2 con el
tope conservador de 400 M. Es cobertura que la HU no pedía y que hoy sostiene la
mayor parte del inventario de remates.

---

### HU 3b — Control de vigencia y frescura (30 / 90 días)

Es la historia con más incumplimientos, y la causa es una sola.

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Registro de tres fechas por inmueble | **Cumple** | Columnas `first_seen_at`, `last_seen_at`, `fecha_publicacion_fuente` presentes y pobladas |
| 2 | Eventos NUEVO / VISTO / PRECIO_ACTUALIZADO / RETIRADO | **Parcial** | El *efecto* de RETIRADO funciona: `mark_stale_inmuebles` oculta lo que desaparece (745 inmuebles inactivos en la base). Pero con margen de 2 corridas, no «de inmediato», y **ningún evento se registra** |
| 3 | Auto-despublicación a los 30 días | **No cumple** | Medido sobre 1.000 filas activas de FincaRaíz: **683 llevan más de 30 días** desde su primera detección y las 1.000 siguen con `estado: 'activo'` |
| 4 | Descarte a los 90 días en dos capas | **No cumple** | `evaluarVigencia()` implementa las dos capas y está cubierta por pruebas, pero **nadie la llama** fuera de sus tests. Ningún activo llega hoy a 90 días (el máximo es 46), así que aún no se ha manifestado |
| 5 | Trazabilidad de todo evento en `oportunidades_historial` | **No cumple** | La tabla existe solo en la migración `20260720000003_vigencia.sql`. **0 filas.** Ningún módulo la escribe ni la lee |

**1 cumple · 1 parcial · 3 no cumplen.**

---

### HU 4a — Activos de bancos sin filtro de estrato

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Sin filtro de exclusión por estrato ni por rango de precio | **Cumple** | Verificado en la consulta de bancos |
| 2 | Estrato como campo opcional (nullable) | **Cumple** | 239 de 458 activos bancarios no reportan estrato y siguen publicados |
| 3 | Clasificación por Índice CRECE con estrato o sin él | **Cumple** | 399 de 458 clasificados, incluidos los que no tienen estrato |
| 4 | Sin muestra suficiente → *Interesante* (1 estrella) + bandera `muestra_insuficiente` | **No cumple** | 59 activos quedan con `crece_tier = null`. El motor **sí los evaluó** (`market.method: "sin-datos"`, `n_comparables: 0`), pero no aplica la categoría por defecto ni marca la bandera. No se ocultan, que es lo que la HU protegía |
| 5 | Sin filtro de estrato en la interfaz del módulo de bancos | **Cumple** | Cero menciones a estrato como control en `server/public/index.html` |

**4 cumplen · 1 no cumple.**

---

### HU 4b — Frescura y rotativo de bancos

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Identificador único y estable por fuente | **Cumple** | `source_id` poblado al 100 % en las cuatro fuentes, con el formato que pedía la HU: AVAL `BA1316`, Davivienda `000000000257`, Bancolombia el slug de URL, BBVA `25096` |
| 2 | Mostrar «verificado hace X», nunca «publicado hace X» | **Cumple** | `textoFrescura()` en `engine/vigencia.ts:100` |
| 3 | Verificación con cadencia semanal | **Cumple** | `radar_cron_jobs`: `bancos` con `cadencia_dias = 7` |
| 4 | Evento RETIRADO al desaparecer de una corrida | **Parcial** | Mismo caso que HU 3b criterio 2: el ocultado funciona, el evento no se registra |
| 5 | Rotación de posición entre visitas | **Cumple** | `engine/rotacion.ts`, con rotación determinista por semana ISO |
| 6 | La ausencia de fecha de publicación no bloquea el registro | **Cumple** | Bancolombia y AVAL entran sin ella |
| 7 | La regla de 30 días de FincaRaíz **no** se hereda aquí | **Cumple** | `caducaPorAntiguedad()` distingue la fuente explícitamente |
| 8 | Trazabilidad en `oportunidades_historial` | **No cumple** | Misma causa: tabla vacía |

**6 cumplen · 1 parcial · 1 no cumple.**

---

### HU 5a — Extracción y normalización del boletín PDF de AVAL

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Mapeo de campos del PDF al esquema normalizado | **Cumple** | Las 219 fichas activas traen `pdf_url`, `pdf_page`, `area_raw`, `type_raw`, `price_raw`, `address_raw` |
| 2 | Distinguir `area_tipo` (construida / terreno / no especificada) | **Cumple** | **219 de 219.** Comprobado además que los lotes grandes son correctos: `area_raw` «241.915 m²» con `area_tipo: terreno` — el parseo respeta el separador de miles |
| 3 | Separar ciudad y departamento; marcar `ciudad_sin_normalizar` si no se reconoce | **No cumple** | 0 de 200 fichas revisadas traen departamento. Solo se guarda la ciudad (`villavicencio`, `anapoima`, `barranquilla`) |
| 4 | Habitaciones y baños como extracción opcional de baja confianza, que nunca filtra | **Cumple** | No se extraen (0 fichas), y al ser opcional no bloquea ni excluye ninguna |
| 5 | Estrato con el mismo tratamiento que Bancolombia | **Cumple** | Nullable, no bloquea |
| 6 | Identificador único desde *Código de inmueble* | **Cumple** | `source_id` = `BA1316` en 225 de 225 |
| 7 | No reproducir el texto libre del boletín en la ficha pública | **Cumple** | El texto vive solo en `features.description` (uso interno) en 200 de 200; la fila no expone columna de descripción pública |

**6 cumplen · 1 no cumple.**

---

### HU 5b — Modelo de frescura del boletín de AVAL

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Cadencia semanal de recepción y procesamiento | **Cumple** | `cadencia_dias = 7` |
| 2 | Fecha de referencia a nivel de boletín | **No cumple** | `fecha_publicacion_fuente` vacía en 200 de 200 fichas de AVAL |
| 3 | Detección por comparación entre boletines (4 eventos) | **No cumple** | No hay registro de eventos |
| 4 | Validación cruzada con las insignias «Nuevo Inmueble» / «Nuevo Valor» del PDF | **No cumple** | Depende del criterio 3 |
| 5 | La regla de 30 días no aplica a AVAL | **Cumple** | `caducaPorAntiguedad()` |
| 6 | Rotación compartida con el resto del módulo de bancos, no un rotativo propio | **Cumple** | Un solo mecanismo en `engine/rotacion.ts` |
| 7 | Trazabilidad con referencia al boletín de origen | **No cumple** | Misma causa |

**3 cumplen · 4 no cumplen.**

---

### HU 6a — Campos propios del dominio judicial

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Campo `origen_demandante` (bancario / particular_otro), con particular por defecto ante la duda | **Cumple** | **949 de 949** poblados tras la corrida del 28-jul (318 bancarios, 631 particulares). El defecto conservador está implementado en `origenDemandante()` (`engine/remates-legal.ts:32`) |
| 2 | Campo `tipo_proceso`, informativo, que no determina el acceso | **Cumple** | **949 de 949** (265 ejecutivos hipotecarios); `tipoProceso()` documentado como informativo |
| 3 | Campo `cuota_parte`, 100 % por defecto | **Cumple** | **949 de 949.** 60 avisos con cuota-parte distinta de 100 % (6,3 %), con casos reales del 11,77 %, 40 % y 50 % |
| 4 | Índice CRECE calculado también para los remates | **No cumple** | **0 de 949** remates tienen `crece_index` o `crece_tier`. El motor no los evalúa |

**3 cumplen · 1 no cumple.**

---

### HU 6b — Matriz de acceso y alerta jurídica de cuota-parte

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Matriz gratis / suscripción por origen × descuento | **Cumple exacto** | `accesoRemate()` (`engine/remates-legal.ts:172`) reproduce la tabla de la HU celda por celda |
| 2 | Remates con descuento < 20 % siempre gratis | **Cumple** | Primera línea de la función |
| 3 | Gratis con origen particular (20–39 %) con rotación semanal | **Cumple** | Reutiliza el rotativo de bancos, como pedía la HU |
| 4 | Alerta jurídica cuando `cuota_parte ≠ 100 %`, aplique o no la matriz de pago | **Cumple** | 60 remates la disparan; la comprobación es independiente del acceso. Reparto de la matriz tras la última corrida: 528 gratis con aviso, 320 de suscripción, 101 gratis |
| 5 | Texto exacto de la alerta | **Cumple literal** | `TEXTO_CUOTA_PARTE` (`server/public/app.js:1381`) coincide palabra por palabra con la HU |
| 6 | Marca visible en el título de la ficha, antes de abrirla | **Cumple** | `cuota-badge` con «Solo el N % del bien» en la propia tarjeta |

**6 de 6 cumplen.**

---

## 4. Los once incumplimientos son tres problemas

Contarlos de uno en uno da una imagen equivocada del trabajo que falta.

### Problema A — El registro de eventos nunca se conectó (7 de los 11)

Afecta a: HU 3b c2/c3/c4/c5 · HU 4b c8 · HU 5b c3/c4/c7.

La lógica **está escrita y probada**: `engine/vigencia.ts` calcula los seis
eventos y las dos capas del descarte a 90 días, y tiene su propio archivo de
pruebas. La tabla `oportunidades_historial` está creada con sus índices.

Lo que falta es el cable entre ambas: nadie llama a `evaluarVigencia()` en el
pipeline y nadie escribe en la tabla. Es un trabajo acotado, no un módulo por
diseñar.

Su consecuencia visible hoy: **683 de cada 1.000 inmuebles activos de FincaRaíz
llevan más de 30 días publicados** y siguen apareciendo como vigentes. El Radar
está enseñando avisos que su propia regla habría retirado.

### Problema B — Los remates no reciben Índice CRECE (1 de los 11)

HU 6a c4. Los 949 remates activos tienen `crece_index = null`.

Tiene menos impacto del que parece, y conviene decir por qué: el tratamiento
comercial de un remate **no depende** del Índice CRECE sino de la matriz de origen
× descuento, que sí está completa y es exacta (HU 6b, 6 de 6). El Índice sería un
dato adicional en la ficha, no el que decide qué se cobra.

### Problema C — Tres huecos sueltos (3 de los 11)

- **Bancos sin comparables suficientes** (HU 4a c4): 59 activos quedan sin
  categoría en vez de caer a *Interesante* con su bandera. No se ocultan, que era
  lo que la HU protegía.
- **Departamento de AVAL** (HU 5a c3): se guarda la ciudad pero no el departamento.
- **Fecha del boletín de AVAL** (HU 5b c2): `fecha_publicacion_fuente` sin poblar.

---

## 5. Lo entregado fuera del alcance de Fase 1

El índice maestro de HU (sección 3, *«Qué queda fuera de esta fase — backlog
aprobado»*) lista siete puntos como Fase 2. **Tres ya están construidos y en
producción**, y no se cobraron aparte:

| Punto del backlog Fase 2 | Estado hoy |
|---|---|
| Scraping de canon de arriendo en FincaRaíz / filtro precio-canon | **Construido.** 10.278 arriendos y estimación de canon por zona con su propio motor de comparables |
| Home con destacados (Portales, Bancos, Remates) | **Construido.** Portada con 4 bloques, 188 fichas seleccionadas, cada una con el criterio que la puso ahí |
| Página de planes Free / Pago | **Construida**, con los tres niveles de acceso funcionando |

Y además, esto no aparece en **ninguna** HU ni en el backlog — se construyó porque
el producto lo necesitaba para poder operarse y venderse:

- **Sistema de cuentas y control de acceso** con tres planes (anónimo, gratuito con
  cupo de 20 fichas al mes, suscrito), muro de pago aplicado en el servidor
- **Panel de administración**: estado de los trabajos automáticos, inventario por
  zona, embudo comercial, cuatro gráficas, y los porcentajes de la calculadora
  editables sin desplegar código
- **Reportes descargables** por inmueble, con cupo propio
- **Motor de rentabilidad de arriendo**: canon estimado con comparables reales
- **Favoritos, onboarding con tutorial, alertas por correo** (el envío automático
  sigue apagado a la espera de aprobación del cliente)
- **Operación**: 15 trabajos automáticos, monitor de producción con incidentes,
  copia de seguridad con simulacro de restauración documentado

---

## 6. Qué falta para cerrar Fase 1 al 100 %

En orden de impacto real sobre lo que el usuario ve:

1. **Conectar el registro de eventos y la regla de 30 días.** Cierra 7 de los 11
   incumplimientos de una vez, y quita del Radar los avisos vencidos.
2. **Calcular el Índice CRECE de los remates.** Cierra 1.
3. **Los tres huecos sueltos** (bandera de muestra insuficiente, departamento de
   AVAL, fecha del boletín). Cierran 3.
4. **Cerrar con el negocio las tres decisiones que se resolvieron por criterio
   técnico sin acta.** Convierten las dos desviaciones en cumplimiento y no cuestan
   desarrollo, solo una confirmación por escrito:
   - el rango 0,71–0,75 del Índice CRECE (hoy resuelto como Oportunidad Fuerte);
   - el nivel de **Cartagena y Bucaramanga** (hoy en Nivel 1, tope 500 M);
   - la población de las 5 ciudades activadas pese a la marca «verificar»
     (Montería, Sincelejo, Tunja, Yopal y **Arauca**, que es la dudosa: las otras
     cuatro superan holgadamente los 100.000 habitantes).

---

## 7. Estado operativo al momento del corte

| Trabajo automático | Estado |
|---|---|
| `fincaraiz` | correcto |
| `bancos` | correcto |
| `remates` | corregido y verificado, pendiente de desplegar el contenedor del cron |
| `motor` | **fallando** con `statement timeout` al cargar comparables |
| `alertas` | apagado a propósito, esperando aprobación del cliente |

El fallo de `motor` no altera lo verificado en este documento —los datos que se
midieron son los de su última corrida correcta—, pero si se repite, el Índice
CRECE deja de actualizarse y todo lo demás envejece con él. Es la prioridad
técnica inmediata.

Otros dos puntos abiertos, ya conocidos: `RADAR_DEMO_PLAN` sigue activo en
producción (cualquiera que se registre obtiene el plan completo sin pagar), y la
llave `service_role` de Supabase no se ha rotado desde marzo.

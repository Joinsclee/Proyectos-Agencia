# Embudo Lanzamiento · estado y pendientes

Subcuenta **Darién** (`IdRKxMkw62mZx47SMDaS`) · embudo `epRUcRMCTwZoJGJbcRYR`.
Comprobado contra la API el 31/08/2026.

## Lo que hay que pegar a mano

**La API de GoHighLevel no permite subir páginas.** No es un problema de
permisos del token: las rutas de escritura responden *«This route is not yet
supported by the IAM Service»*, y la lectura de una página solo devuelve
metadatos (`_id`, `name`, `stepId`, `updatedAt`) — el contenido no se expone.
Lo mismo con los formularios (`GET /forms/{id}` → 401).

| Archivo | Dónde va |
|---|---|
| `Registro.html` | Paso **Registro Evento** → elemento HTML personalizado |
| `Gracias.html` | Paso **Gracias Evento Raul** → elemento HTML personalizado |
| `formulario-ghl.css` | Form Evento → Styles → Custom CSS |

Se copia el archivo entero, desde el primer `<style>` hasta el último
`</script>`.

## Estado de la automatización (31/08/2026, 20:00)

Aparecieron **6 workflows nuevos** respecto a la primera revisión, y **los seis
están en borrador**:

| Estado | Workflow |
|---|---|
| borrador | 1. Completo Pago |
| borrador | **1. Nuevo Registro > Correo de bienvenida + Nutrición** ← el del evento |
| borrador | 1. Registro  Diagnostico + Correo Registro |
| borrador | 1. Registro LeadMagnet + Envio de Recurso |
| borrador | 3. Agenda Cita + Recordatorio |
| borrador | 3. Agenda Cita + Recordatorio ← **duplicado**, dos ids distintos |

> **Un workflow en borrador no se ejecuta.** Por muy bien configurado que esté
> por dentro, mientras no se publique no dispara nada. Ese es el primer
> candidato a explicar el correo que no llegaba.

Los otros dos ids del duplicado son `66735f54-c00e-48cd-bb5b-9d73da523d98` y
`01e6c0d7-dac5-4734-9775-f34cf648f169`.

### Lo que la API no deja hacer

Ni configurar ni siquiera *mirar* un workflow:

```
GET   /workflows/{id}   → 404   (solo existe el listado)
POST  /workflows        → 404
PUT   /workflows/{id}   → 404
```

Solo hay `GET /workflows/` y devuelve nombre, estado e id. El contenido de un
workflow se toca únicamente desde el editor. Tampoco el MCP los expone.

### Los diez workflows heredados del snapshot

| Estado | Workflow |
|---|---|
| publicado | 1. (Filtro) Agenda Reunion |
| borrador | 1. Abandono Carrito - Check Out |
| publicado | 1. Registro Skool: Correo de bienvenida |
| publicado | 2. (Venta) Agenda Reunion |
| publicado | 2. Seguimiento(No accedió a Skool) |
| publicado | 3. Accedió a Skool (Trigger Link) |
| publicado | 3. No asiste Reagendar |
| publicado | 4. Seguimiento/Downsell |
| publicado | 5. Venta Ganada |
| borrador | 6.No Compro |

Todos vienen del snapshot de lanzamientos y pertenecen a un embudo de venta con
reunión y Skool. **Ninguno se dispara con el formulario del evento**, así que un
registro no envía nada. No es que el correo se fuera a spam: no llegó a salir.

Hace falta un workflow nuevo:

1. **Disparador:** Form Submitted → `Form Evento` (`7dD9mzYB8L3OAPcNe4El`).
2. **Acción 1:** enviar el correo de confirmación con el enlace a la página de
   gracias y el de la comunidad de WhatsApp.
3. **Acción 2:** etiquetar el contacto (`masterclass-17-sep`) para poder
   segmentar los recordatorios.
4. **Acciones 3+:** recordatorios a 24 h, 1 h y 10 minutos del directo.

## Rastro del snapshot de Raúl

| Qué | Nombre actual | Acción |
|---|---|---|
| Embudo | **Website Raul** (`yE0r46pQT7dnuBDnkTpC`) | Borrar o renombrar |
| Página | **Gracias Evento Raul** | Renombrar a «Gracias Masterclass» |
| Plantilla email | 👤1. Registro Skool : Corre Bienvenida | Revisar (además «Corre» es un typo de «Correo») |
| Workflows | los diez de arriba | Revisar cuáles sirven para este lanzamiento |

El popup que aparecía era el configurado en ese snapshot.

## Pendiente del cliente

- Crear el grupo de WhatsApp y pasar el enlace: sustituye los dos
  `href="#" data-pendiente="enlace-whatsapp"` de `Gracias.html`.
- Imagen del grupo de WhatsApp.
- Vídeo de la VSL: sustituye el bloque marcado dentro de `.ghl-video-hero`
  por el `<iframe>` de YouTube.
- Conectar el dominio comprado en Cloudflare.


---

## El botón del correo no lleva a ningún sitio (31/08/2026)

El síntoma es que el botón del correo no se puede pulsar. La causa inmediata es
que su `href` es `{{ENLACE_PAGINA_GRACIAS}}`, un marcador, no una URL.

Pero al buscar la URL real apareció el problema de fondo: **las páginas del
embudo no están publicadas en ningún dominio.**

```
GET /funnels/funnel/list  →  "Embudo Lanzamiento" tiene domainId: ""
GET /locations/{id}       →  domain: (vacío)
```

Las rutas de los pasos sí existen:

| Paso | Ruta |
|---|---|
| Registro Evento | `/registro-evento01` |
| Gracias Evento Raul | `/gracias-01384628` |

Pero sin dominio son rutas sin host: no hay URL pública que poner en el correo.
Comprobado que ni `link.joinsclee.com` ni `lahuertahotel.com.co` las sirven
(ambas responden 404).

**`lahuertahotel.com.co` es WordPress detrás de Cloudflare**, no GHL, así que el
dominio raíz ya está ocupado por la web actual. Hay que conectar un
**subdominio** a GHL.

### Orden correcto

1. En Cloudflare, crear un CNAME para el subdominio (por ejemplo
   `masterclass.lahuertahotel.com.co`) apuntando a donde indique GHL.
   **En modo «DNS only» (nube gris), no «Proxied».** Con el proxy naranja
   activo GHL no puede emitir el certificado y la página queda sin HTTPS.
2. En GHL: Sites → Domains → añadir ese subdominio.
3. Asignar el **Embudo Lanzamiento** a ese dominio.
4. Copiar la URL del paso de gracias y ponerla en el botón del correo.

Hasta el paso 4, el correo no puede tener un botón que funcione: no existe el
destino todavía.

### Estado de los envíos

Cuatro registros de prueba, todos internos (Cristhian y Juan Camilo). Ningún
inscrito real ha recibido el correo con el botón roto.

---

## Revisión del cliente en Loom (01/09/2026)

### 1. Copy — aplicado en `Registro.html`

Los tres cambios que pidió, literales de su audio:

| Antes | Ahora |
|---|---|
| «Saldrás con **un criterio para decidir**» | «Saldrás **sabiendo qué resolver primero**» |
| «tendrás una forma más clara de ordenar lo que ves…» | «vas a entender **los cinco pilares que deciden si una finca es rentable o se vuelve un gasto**, y en qué orden pensarlos antes de sembrar» |
| Lista de 4 puntos (diagnóstico, mapa, criterio, kit) | Los **3 que él nombró**, en su orden: los cinco pilares → un criterio para mirar tu propia finca → la herramienta «Finca sin improvisar» |

Lo demás lo dio por bueno explícitamente: las dos tarjetas de avatar («esto me
parece que está bien»), el bloque Diseño / Ciclos / Destino («por ahora nos
vamos con esto») y «La Huerta en acción».

### 2. La foto «muy trillada»

La causa era medible: **`6a95b1a6648f56e7e4337792.jpg` estaba puesta dos veces
en la misma página** — en el bloque «Lo que te llevas» y en la primera tarjeta
de «La Huerta en acción». Ver la misma imagen dos veces al bajar es
exactamente la sensación de foto gastada.

Sustituidas las cuatro fotos de contenido por material nuevo de la carpeta de
Drive de Iván, ya subido a la biblioteca de la subcuenta:

| Sitio | Foto nueva | URL en GHL |
|---|---|---|
| «La productividad comienza antes de la cosecha» | Terrazas en curva de nivel (dron) | `…/67df2d8f-98f4-45da-9c02-f3b35ac3f6f8.jpg` |
| Producción en campo | Agrónomo revisando cultivo | `…/13965c7a-636a-46d1-85d4-6b5efee4b3e7.jpg` |
| Insumos hechos en la finca | Microorganismos de montaña en mano | `…/72c7c763-b916-46af-98e0-8a2516f6df07.jpg` |
| Ecosistema integrado | Dron: cultivo, bosque y hospedaje | `…/e21b5cb2-39d9-4123-b9bf-fe97639e9828.jpg` |

Base: `https://assets.cdn.filesafe.space/IdRKxMkw62mZx47SMDaS/media/`.
Originales en `fuentes/` (ignorada por git), optimizados en `fuentes/web/`.

### 3. «Evento Raúl Cuñarro» — qué se pudo tocar y qué no

Lo que la API deja ver del rastro del snapshot:

| Qué | Nombre actual | Editable por API |
|---|---|---|
| Paso del embudo | **Gracias Evento Raul** (`e516ad59…`) | ❌ `GET /funnels/funnel/{id}` → 401 IAM |
| Embudo | **Website Raul** (`yE0r46pQT7dnuBDnkTpC`) | ❌ igual |
| Calendario | **Llamada Asociación con Raúl** (`FwHR6dPQ…`, `isActive:false`) | ⚠️ el PUT existe pero exige el objeto completo |
| Título y meta descripción de la página | no legibles | ❌ el endpoint de página devuelve 401 |

La descripción de «fincas abandonadas» que él ve **no aparece en ningún sitio
que la API exponga**. Por descarte está en los ajustes SEO de la página dentro
del editor (Configuración → Metadatos SEO), que es lo que sale en la pestaña
del navegador y en la vista previa al compartir el enlace. Hay que cambiarlo a
mano.

**Texto para pegar ahí:**

- Título: `Masterclass gratuita: Finca sin improvisar | La Huerta Hotel`
- Descripción: `El 17 de septiembre, Iván Castrillón enseña los cinco pilares que deciden si una finca es rentable o se vuelve un gasto. Gratis y en vivo.`

Y renombrar en el editor: paso «Gracias Evento Raul» → **«Gracias Masterclass»**;
embudo «Website Raul» → borrar o **«Website La Huerta»**.

### 4. Un conflicto de nombre que hay que decidir

El VSL de registro que grabó Iván dice, dos veces, que la masterclass se llama
**«Finca sin improvisar»** (min 1:09 y cierre). La página, el correo y el VSL de
gracias la llaman **«Finca Productiva»**, y «Finca sin improvisar» es el nombre
del kit que se entrega.

No lo he cambiado porque afecta al vídeo ya grabado. Es la misma queja que él
hizo sobre «Evento Raúl»: nombres que no coinciden entre lo que se ve y lo que
se dice.

### 5. El dominio ya está conectado

`GET /funnels/funnel/list` ahora devuelve `domainId: 2YzeorQlGATu6ALGKcwg` para
«Embudo Lanzamiento» (antes venía vacío). El embudo tiene ya cuatro pasos:
Registro Evento, Gracias Evento Raul, Recursos Extra y Universo Ivan.

Falta saber **cuál** es el host: la API no expone el nombre del dominio, y
ninguno de los subdominios probados de `lahuertahotel.com.co` resuelve. Hay que
leerlo en Configuración → Dominios y ponerlo en el botón del correo, que sigue
apuntando al marcador `{{ENLACE_PAGINA_GRACIAS}}`.

También: el workflow **«1. Nuevo Registro > Correo de bienvenida + Nutrición»**
ya está `published` (antes estaba en borrador, que era la razón de que el correo
no llegara).

### 6. Los dos VSL, montados

Fuentes en `fuentes/` (fuera de git): los originales de Drive venían a 4K y
**80 Mbps** — 2,26 GB el de registro. Transcodificados a un máster 4K de 14 Mbps
en `fuentes/master/`, que es lo que se edita; las copias de 80 Mbps se borraron
del disco (siguen en Drive).

El montaje vive en `videos/vsl/`: una EDL por vídeo (`edl-registro.json`,
`edl-gracias.json`) y `montar.py`, que la renderiza. **El audio del máster corre
entero y sin cortes; solo cambia la imagen** — el discurso de Iván no se toca.

Tres recursos de imagen:

- **Planos A/B/C**: reencuadres del propio 4K. Como se entrega en 1080p, el
  plano C (`crop=1920:1080`) son píxeles nativos: un primer plano sin segunda
  cámara.
- **B-roll de vídeo**: trozos de los clips de la finca recortados a 16:9.
- **B-roll de foto**: Ken Burns sobre las fotos de Iván.

| | Registro | Gracias |
|---|---|---|
| Duración | 3:46 (226,2 s) | 0:55 (55,2 s) |
| Cortes | 51 · uno cada 4,4 s | 12 · uno cada 4,6 s |
| B-roll | 16 tomas · 28 % del metraje | 2 tomas |
| Sonoridad | −15,9 LUFS | −16,6 LUFS |
| Entrega | 93 MB · 1080p · faststart | 22 MB |

**Trampa del reel de b-roll:** `La Huerta LAB.mp4` es un reel de redes que corta
cada 1,5–2 s y lleva **un cartel de venta incrustado entre el segundo 29,1 y el
31,1**. Solo tres planos aguantan una toma larga: 0–5,2 · 27,4–32,7 (dron) ·
49,5–53,9 (que además cambia de cerdos a manos en el agua en el 51,9 sin que la
detección de escenas lo marque). `TESTIMONIOS INSTAGRAM.mp4` lleva subtítulos
quemados de otro guion: inservible como b-roll limpio.

**Dónde quedaron:**

- `Gracias.html` — sustituye el hueco que había en el hero.
- `Registro.html` — sección nueva `.ghl-vsl` entre la trustline y el resto,
  fondo oscuro, vídeo a todo el ancho y CTA debajo. La página no tenía vídeo.

Ambos con carátula propia y botón de play; los controles nativos aparecen al
pulsar. Verificado en el simulador de GHL a 1440, 390 y 360 px: sin scroll
horizontal, sin elementos desbordados y sin errores de JS.

### 7. Lo que la API de GHL sí deja hacer con un PIT de subcuenta

Comprobado hoy contra la subcuenta de Iván:

| Endpoint | Resultado |
|---|---|
| `POST /medias/upload-file` (multipart + `locationId`) | ✅ 201, devuelve la URL del CDN. Sirve para imágenes **y vídeo** (93 MB subidos sin problema) |
| `GET /funnels/funnel/list` | ✅ devuelve pasos, rutas y `domainId` |
| `GET /funnels/page?funnelId=…` | ✅ solo nombres (`limit` máx 20 y `offset` obligatorio) |
| `GET /funnels/page/{id}` · `GET /funnels/funnel/{id}` | ❌ 401 «not yet supported by the IAM Service» |
| `GET /calendars/` · `GET /calendars/{id}` | ✅ · el `PUT` exige el objeto completo |
| `GET /workflows/` | ✅ solo lista, con su `status` |

El CDN responde **206 a las peticiones por rango**, así que el vídeo se puede
buscar y reproducir en streaming sin descargarlo entero.

### Siguiente paso del vídeo

Falta la capa de gráficos (tarjetas de los cinco pilares, fecha y hora, rótulo
de Iván, tarjeta final y subtítulos incrustados). Va con HyperFrames —
`/talking-head-recut` está pensado exactamente para esto— sobre el montaje ya
cortado, no sobre el máster.

---

## Segunda pasada de vídeo (01/09/2026)

Tres cosas que pidió el cliente después de ver el primer montaje.

### 1. «Usa los vídeos de esa carpeta como escenas»

En el primer escaneo la carpeta de Drive tenía 4 vídeos. Al volver a mirarla
había **122 vídeos, 38,7 GB** — Iván había subido su archivo de tomas: decenas
de planos de dron, `CULTIVO JOVENES`, `2 siembra2`, `CULTIVO BERENJENA COSECHA`,
`TOMA BOSQUE`, `arbol 2/3`, y una carpeta `Testimonios` con 15 entrevistas.

Con 5,9 GB de disco libre no cabe todo. Se bajó una tanda de 17 clips
(1,5 GB), todos **4K y tomas continuas de 5 a 13 s**, que es lo que faltaba: el
b-roll anterior salía de un reel de redes que cortaba cada 1,5 s.

El montaje de registro pasó de **3 tomas de vídeo y 13 de foto** a **13 de
vídeo y 4 de foto** (29 % del metraje). Las cuatro fotos que quedan son aéreas
y el compost, para las que no hay equivalente en vídeo entre lo descargado.

Quedan sin bajar los `Testimonios` (15 clips, ~15 GB). Son testimonios reales
de alumnos: material de primera para una página de ventas, pero no caben en el
disco ahora mismo.

### 2. El temblor del Ken Burns

Era real y tenía causa concreta. `zoompan` redondea el recorte a píxeles
enteros en cada fotograma; con el zoom acumulativo (`zoom+paso`) ese redondeo se
realimenta y la imagen oscila.

Medido sobre la misma foto — «rugosidad» es la energía de alta frecuencia de la
diferencia entre fotogramas consecutivos; una foto totalmente quieta da 0,0001:

| | rugosidad |
|---|---|
| acumulativo, 2× la salida | **0,747** ← lo que había |
| absoluto, 2× | 0,719 |
| absoluto, 4× | 0,268 |
| absoluto, 6× | **0,199** ← lo que quedó |

Dos cambios: `z` se calcula desde el número de fotograma en vez de sumar sobre
el valor anterior, y la foto se sube a 6× la salida antes de recortar (un píxel
de redondeo son 0,17 px en pantalla).

En el montaje final, con ruido de compresión real, las tomas con Ken Burns dan
**0,31–0,42** y el plano fijo de Iván da **0,77**: la foto se mueve ahora menos
entre fotogramas que una cámara quieta sobre una persona.

### 3. «Mejora la apariencia visual»

- **Corrección de color** en los planos de Iván: `eq=contrast=1.06:saturation=1.10:gamma=1.02`
  más un empujón cálido. El día del rodaje estaba nublado y el plano sale plano
  al lado del b-roll 4K. Probado también un ajuste más fuerte (contraste 1,10 /
  saturación 1,18): deja la hierba amarilla y la piel naranja.
- **Subtítulos incrustados** — 104 en registro, 21 en gracias. Source Sans 3 600
  a 60 px, contorno oscuro y sombra para que se lean igual sobre el cielo blanco
  que sobre la tierra. Las cifras y los términos de la oferta van en verde lima.
- **Tarjetas** — ficha de fecha, los cinco pilares numerados, rótulo de Iván y
  tarjeta de cierre con CTA. A la derecha del cuadro, porque en el plano abierto
  Iván ocupa de x=400 a x=845.

### Cómo se dibujan los rótulos, y por qué así

Este ffmpeg **no trae libass ni drawtext** (está compilado sin freetype), así
que no puede quemar texto por sí solo. Y aunque pudiera, libass no lee woff2:
las tipografías de La Huerta están en woff2. Así que **Chrome hace de motor
tipográfico** (`rotulos.cjs`) y ffmpeg solo compone.

Dos trampas que costaron y están anotadas en `componer.py`:

1. **Una entrada de ffmpeg por tarjeta se cuelga.** `overlay` sincroniza por
   marca de tiempo y espera un fotograma del segundo input; la tarjeta de cierre
   no tenía ninguno hasta el segundo 221 y el proceso se quedaba parado con la
   CPU a cero.
2. **La lista `concat` no se puede meter directa en el filtro.** Sus fotogramas
   son dispersos (uno por rótulo, con `duration`) y `overlay` los consume a otro
   ritmo: los subtítulos salían hasta el segundo 14 y luego desaparecían. Se
   comprobó que los 25 fotogramas SÍ llegan al filtro con su PTS correcto — el
   desajuste está en la sincronía. La solución: pasar cada pista a **WebM/VP9
   con canal alfa a 30 fps constantes** y superponer eso.

### Ficheros

```
videos/vsl/
  edl-registro.json  edl-gracias.json    ← el montaje, editable a mano
  montar.py                              ← cortes, planos y Ken Burns
  subtitulos.py                          ← agrupa la transcripción y corrige
  rotulos.cjs                            ← dibuja los PNG en Chrome
  componer.py                            ← pistas alfa + composición final
  tarjetas-*.json                        ← el contenido de cada tarjeta
  entrega/                               ← lo que se sube a GHL
```

`subtitulos.py` lleva una tabla de correcciones de las palabras que el modelo
falla siempre: «la huerto hotel», «integral la parte pecuaria», «el agua llueve
que cae», «Habe de invertir» y, la más importante, «el enlace nos enviará por
esta página» → **«no se enviará»**, que decía justo lo contrario.

### Entregado

| | Registro | Gracias |
|---|---|---|
| Duración | 3:46 | 0:55 |
| Cortes | 52 · uno cada 4,3 s | 12 |
| B-roll | 17 tomas · 13 de vídeo 4K | 2 |
| Subtítulos | 104 | 21 |
| Tarjetas | 8 | 3 |
| Tamaño | 121 MB · 4,5 Mbps | 23 MB |
| En GHL | `…/3f82c556-89a8-41b2-b9bb-bcc93127a32b.mp4` | `…/923f347b-5695-4f19-a572-bfe69bcd3777.mp4` |

Comprobado en el simulador de GHL a 1440 y 390 px: los dos vídeos cargan desde
el CDN (`readyState 4`, duración correcta), sin scroll horizontal ni errores de
JS. El CDN responde 206 a peticiones por rango, así que se pueden buscar sin
descargarlos enteros.

### Lo que queda, y de qué depende

| Pendiente | Bloqueado por |
|---|---|
| Título y meta descripción SEO de la página («fincas abandonadas») | clic en el editor de GHL — la API da 401 |
| Renombrar el paso «Gracias Evento Raul» y el embudo «Website Raul» | igual |
| ~~Decidir «Finca sin improvisar» vs «Finca Productiva»~~ | **resuelto 01/09: se llama «Finca sin improvisar»** |
| Enlace del grupo de WhatsApp (×2 en Gracias, ×2 en Conciencia) | el cliente |
| Saber cuál es el dominio conectado y ponerlo en el botón del correo | leerlo en Configuración → Dominios |
| Pegar `formulario-ghl.css` en Form Evento → Styles | clic en el editor |
| Los 15 `Testimonios` de Drive (~15 GB) como b-roll de la página de ventas | disco (4,2 GB libres) |

---

## El evento se llama «Finca sin improvisar» (01/09/2026)

Decisión del cliente. Es el nombre que Iván ya dice dos veces en el VSL de
registro («voy a dar una masterclass gratuita y en vivo finca sin improvisar»,
min 1:09, y en el cierre), así que la página deja de contradecir al vídeo.

Cambiado en: `Registro.html`, `Gracias.html`, `Conciencia.html`,
`correo-registro.html` y la plantilla de GHL `6a95ddf265c2ad91dbcb7f9c`
(nombre, asunto, preheader y HTML).

**No** se tocó «finca productiva» donde es un sustantivo común y no el evento:
`SimuladorFincanciero.html`, `GuiaSimuladorFinanciero.html`,
`universo-huerta-lab.html` y `agente/conocimiento.md` hablan del *simulador de
una finca productiva de 2 hectáreas*, que es otro producto.

### El kit se llama igual que la clase

Iván lo nombra así en el VSL: «los recordatorios y el kit finca sin
improvisar». Para que en la página no se leyera como la misma cosa, el punto de
la lista pasó de «La herramienta «Finca sin improvisar»» a **«El Kit «Finca sin
improvisar»»**, que además es literal de lo que él dice. De paso se unificó la
grafía: era `Kit Finca Sin Improvisar` en tres archivos y `Finca sin improvisar`
en otro.

### Lo que queda descuadrado

**El VSL de la página de gracias dice «Finca Productiva» en voz alta**, en su
primera frase: «Tu lugar para finca productiva ya está reservado». El subtítulo
incrustado dice lo mismo porque tiene que coincidir con el audio. Son dos
segundos, al principio del vídeo. O se acepta, o Iván regraba esa frase.

### Cómo se actualiza una plantilla de correo por API

Costó encontrarlo, queda anotado:

| Qué | Llamada |
|---|---|
| Leer el HTML actual | `GET /emails/builder?locationId=…` → campo `previewUrl` (Firebase) |
| Cambiar el HTML | `POST /emails/builder/data` con `locationId`, `templateId`, `html`, `editorType` |
| Cambiar nombre, asunto y preheader | `PATCH /emails/builder/{templateId}` con `name`, `subjectLine`, `previewText` |

`PUT /emails/builder` da 404. `POST /emails/builder/data` **ignora en silencio**
`name` y `subjectLine` aunque devuelva 201 — hay que usar el PATCH para eso.
Y `urllib` de Python se lleva un 403 de Cloudflare por el user-agent: hay que ir
con `curl`.

GHL post-procesa el HTML guardado y le mete arreglos para Outlook
(`<!-- outlook-fixes-applied -->`, `mso-style-textfill-fill-color`, envolturas
`<!--[if mso]>`). Para no perderlos, se descarga el HTML servido, se parchea
eso y se vuelve a subir — no se sube el fichero local. Respaldo de la versión
anterior en `_respaldo/`.

---

## Tarjeta sobre la cara, y el reproductor con fondo (01/09/2026)

### La tarjeta tapaba a Iván

En el VSL de gracias, la ficha de fecha (seg. 6) le caía encima de la cara.
La causa: puse las tarjetas a la derecha porque en el VSL de **registro** Iván
está a la izquierda — pero en el de **gracias** está a la derecha.

Medido sobre fotograma, en fracción del ancho del cuadro:

| | Iván | tarjeta antes | tarjeta ahora |
|---|---|---|---|
| Registro, plano abierto | 0,20 – 0,44 | 0,60 – 0,95 ✓ | sin cambios |
| Gracias, plano abierto | 0,55 – 0,79 | 0,60 – 0,95 ✗ | 0,05 – 0,40 ✓ |
| Gracias, plano cerrado | 0,30 – 0,72 | 0,60 – 0,95 ✗ | banda superior ✓ |

En el plano cerrado no queda hueco a ningún lado, pero por encima de su cabeza
(y < 0,30) el cuadro está libre de lado a lado: el aviso de seguridad pasó a ser
una **banda superior**, que además le va bien por ser un aviso y no un dato.

`rotulos.cjs` lleva ahora la clase `.izq` para espejar la ficha, y cada tarjeta
declara su `desliz` (1 entra desde la derecha, −1 desde la izquierda, 0 sin
desplazamiento): una tarjeta pegada al borde izquierdo que entra deslizándose
desde la derecha se lee como un error, no como una animación.

### El reproductor

Detrás de la carátula corre ahora un **bucle mudo de los primeros 11 segundos**,
a 720p: 1,2 MB en registro y 1,0 MB en gracias. Al pulsar, ese bucle se para y
entra el vídeo bueno **desde el segundo cero y con sonido**.

Se hizo con un clip aparte y no autoreproduciendo el vídeo real porque el de
registro pesa 121 MB: cada visita se lo habría descargado sin haber pulsado
nada. El bueno va con `preload="metadata"`, así que solo pide la cabecera hasta
que alguien le da al play.

Comprobado en el simulador de GHL, en las dos páginas:

- antes de pulsar → fondo corriendo, mudo, en bucle; el vídeo real oculto
- tras pulsar → vídeo real visible, reproduciendo, con sonido, desde el
  principio, con controles; fondo parado
- al terminar → vuelve la carátula y el bucle

Respeta `prefers-reduced-motion`: a quien tenga esa preferencia no se le mueve
el fondo, ve el póster.

El velo del overlay se reforzó con un charco radial bajo el botón. Antes el
degradado iba de abajo arriba y apenas oscurecía la franja central, que es
justo donde va el texto — y detrás hay vídeo, no una foto fija. Medido sobre 5
fotogramas del bucle, el peor contraste de la línea pequeña es **4,71:1** en
registro y **7,16:1** en gracias (el mínimo legible es 4,5:1).

### Sobre «que no se pueda descargar»

Puesto lo que se puede poner:

- `controlslist="nodownload noplaybackrate"` — quita el botón de descarga del
  reproductor nativo en Chrome y Edge
- `disablepictureinpicture`
- menú del botón derecho bloqueado sobre los dos vídeos — no sale «Guardar
  vídeo como…»

**Esto quita los caminos fáciles, no protege el archivo.** La URL del MP4 está
en el HTML de la página y el CDN de GHL la sirve en abierto: cualquiera que
mire el código fuente o la pestaña de red del navegador se lo lleva. Para
impedirlo de verdad harían falta URLs firmadas con caducidad o streaming
segmentado (HLS con DRM), y la biblioteca de medios de GHL no ofrece ninguna de
las dos. Si eso importa, la vía práctica es subirlos a YouTube como **no
listados** y embeber el iframe: no se elimina la descarga, pero deja de haber
un enlace directo al archivo.

---

## El enlace del grupo, puesto (01/09/2026)

`https://chat.whatsapp.com/E0WwgTzro5l3pI3aGPjKJk`. Comprobado que responde 200
y que la invitación sigue viva antes de pegarlo en nada.

| Dónde | Cuántos |
|---|---|
| `Gracias.html` | 2 botones |
| `Conciencia.html` | 2 botones |
| `correo-registro.html` | el botón principal |
| Plantilla de GHL `6a95ddf265c2ad91dbcb7f9c` | el botón principal |

Los cuatro botones de página van con `target="_blank" rel="noopener"`, y no es
cosmético: el JS de `Gracias.html` vuelve a marcar el progreso al 100 % en el
evento `focus`. Si WhatsApp se abriera encima, esa señal no llegaría nunca y la
barra se quedaría en el 50 % para siempre.

**El botón del correo apunta ahora directo al grupo**, no a la página de
gracias. Llevaba el marcador `{{ENLACE_PAGINA_GRACIAS}}`, que sigue sin
resolver porque el embudo no tiene dominio público; y el propio botón dice
«Completar paso 2 y entrar a WhatsApp», así que ir directo es lo que promete.
Cuando el dominio esté conectado se puede volver a la página de gracias si se
prefiere que pasen por ahí.

`Gracias.html` ya no tiene ningún `href="#"`. En `Conciencia.html` quedan
cuatro, los del Kit y los tres recursos de clase, que esperan archivo.

---

## Barrido de coletillas, cerrado (01/09/2026)

**218 → 4** en las piezas de entrega. Las cuatro que quedan son la excepción del
catálogo, no un descuido: antítesis que desmontan una creencia que el lector sí
trae («creía que era un subsidio», «creía que medir carbono era un gesto»,
«creía que era un curso de agricultura bonita», «creía que el POT era un
impedimento»).

Se hizo en dos mitades. La primera con verificación adversaria por agente
(119 agentes, 111 hallazgos, 64 confirmados, 47 refutados). La segunda se cortó
a mitad por límite de sesión, así que las 132 restantes se resolvieron con un
clasificador determinista que elige el signo según lo que unía la raya, y
revisión a ojo del residuo.

### La foto de la bio ya no va por CSS

Era un `background-image` dentro del `<style>` pegado. Ahora es un `<img>` con
`object-position:64% center`, que es lo que el editor de GHL reconoce y gestiona,
y lo que permite ver la foto al pegar sin renderizar la página. Para confirmar
que se pegó la versión buena, buscar en el código:

    media/6a96a986f22eac14d9d0a997.jpg

Si aparece `6a95b1a59ced56098ad30dcd`, es la versión vieja.

### Cosas que se encontraron por el camino

- **El prompt de sistema del agente Tierra** era la fuga más cara: usaba rayas y
  no tenía ninguna regla que lo impidiera, así que las producía en vivo en cada
  respuesta. Ahora lleva regla dura con ejemplos, y `conocimiento.md` está
  re-inyectado con `agente/sync-kb.py`. **Falta desplegar**:
  `supabase functions deploy chat-huerta`.
- **`agente/conocimiento.md` tenía una frase escrita dos veces** («se aplica el
  método HCMI» duplicado, línea 213). Defecto anterior a esta pasada, corregido.
- **La pasada automática dejó una lista incoherente** en
  `CalculadoraDeCarbono.html`: convirtió `'Potreros: suelo'` y dejó
  `'Potreros — biomasa'` dos líneas más abajo. Unificado.

### Verificado

Las seis herramientas cargan con **cero errores de JavaScript** después de tocar
cadenas dentro de sus `<script>`, y sus pestañas siguen respondiendo. Las tres
páginas del embudo: sin scroll horizontal a 1440, 390 y 360 px, cero imágenes
rotas, cero rayas en el texto visible.

---

## Los VSL pasan a YouTube (01/09/2026)

Los MP4 servidos desde el CDN de GHL no cargaban bien. Ahora:

| | Vídeo | Duración comprobada |
|---|---|---|
| Registro | `LsA8J7ezTf8` | 226 s |
| Gracias | `TLYPSTYah5M` | 55 s |

Ambos públicos y embebibles, en el canal «La Huerta Hotel – Ecosistema
regenerativo».

**Se conserva el bucle de fondo.** Los MP4 de 11 s a 720p (1,2 y 1,0 MB) siguen
en el CDN de GHL y nunca fueron el problema: lo era el archivo de 121 MB. Así
que la carátula sigue igual, con el vídeo corriendo mudo detrás, y al pulsar
entra YouTube desde el segundo cero y con sonido.

**El iframe se inyecta al pulsar, no está en el marcado.** Medido: antes del
clic hay **cero** peticiones a YouTube. Ni el reproductor ni sus cookies llegan
a quien solo pasa por la página, y el clic cuenta como gesto de usuario, que es
lo que permite arrancar con sonido.

### Dos cosas que costaron

**El error 153 era del `file://`.** Abriendo el HTML con doble clic, YouTube
rechaza el embed por referrer inválido. Sirviéndolo por HTTP funciona. Si
aparece al probar en local, no es un fallo de la página.

**YouTube ponía sus subtítulos automáticos encima de los nuestros quemados.**
Dos capas de texto. `cc_load_policy=0` **no los quita** (comprobado). Tampoco
basta `unloadModule('captions')` en `onReady`: el módulo se vuelve a cargar
cuando arranca la reproducción. La solución es la API de YouTube, apagándolos
en `onReady`, otra vez al pasar a PLAYING y con tres reintentos escalonados.

Eso arregla nuestro embed. **La solución de fondo es del lado de YouTube**:
conviene borrar la pista de subtítulos automáticos de los dos vídeos en YouTube
Studio, porque quien los vea directamente en YouTube seguirá con las dos capas.

### Efecto secundario bueno

Ya no hay una URL de MP4 en el código de la página, así que lo de «que no se
pueda descargar» queda mucho mejor cubierto que con `controlslist="nodownload"`.

### Verificado

Sin scroll horizontal a 1440, 390 y 360 px. Cero imágenes rotas, cero errores
de JS, el bucle corre mudo antes del clic y el iframe entra al pulsar con el
tamaño correcto.

Los MP4 grandes que quedaron en la biblioteca de GHL (registro 121 MB, gracias
23 MB) ya no los usa nadie: se pueden borrar cuando se quiera liberar espacio.

---

## `correo-01-orden.html`, listo para pegar (05/09/2026)

Lo que antes viajaba dentro del propio HTML como comentario y ahora vive aquí,
porque los comentarios HTML **no se borran al enviar**: quien haga «Mostrar
original» en Gmail los lee.

| Campo | Valor |
|---|---|
| Asunto | La finca que imaginaste también necesita un orden |
| Preheader | Antes de sembrar o invertir más, conviene definir qué debe producir y para quién. |

El asunto también es el `<title>` del archivo, así que no hay dos fuentes que
se puedan desincronizar.

### Pie legal: se unificó con el correo hermano

El pie decía «La Huerta LAB · Yotoco, Valle del Cauca» mientras
`correo-registro.html`, ya aprobado, dice «La Huerta Hotel · Yotoco, Valle del
Cauca». Dos razones sociales firmando el pie de la misma secuencia. Manda el
hermano aprobado: ahora los dos dicen **La Huerta Hotel**. La firma del cuerpo
sigue siendo «La Huerta LAB», que es lo que dice el copy y no es el pie legal.

### Dos cosas que hay que verificar en un envío de prueba

Este correo es de nutrición, no una confirmación transaccional como el hermano,
así que necesita bloque de baja y dirección postal o Gmail y Yahoo lo tratan
como envío masivo sin cumplir.

1. `{{unsubscribe_link}}`: el enlace «Darte de baja» del pie. Si la subcuenta
   inyecta su propio bloque de baja, sobra uno de los dos.
2. `{{location.full_address}}`: la dirección postal completa. Si el campo de
   la subcuenta está vacío, la línea sale en blanco y el correo se queda sin
   dirección física, que es justo lo que exige CAN-SPAM. «Yotoco, Valle del
   Cauca» es una localidad, no una dirección.

---

## `Conciencia.html` reconstruida para la fase de consciencia (10/09/2026)

La página ya no describe un evento genérico: describe la semana real del 14 al
17 de septiembre. Fuentes: «Fase de consciencia · La Huerta LAB · 10–16
septiembre 2026», «YouTube · Directos de consciencia · 14–16 septiembre 2026» y
los tres guiones de clase (v3, v2, v2) de la carpeta de Drive del evento.

### Las fechas que había estaban mal

Decía 10, 12 y 14 de septiembre. Las clases son **14, 15 y 16**, las tres a las
**6:00 p. m. hora de Colombia**, de 30 a 45 minutos. La clase principal sigue
siendo el jueves 17 a la misma hora.

| Día | Clase | Título |
|---|---|---|
| Lunes 14 | 1 | Un viaje a la regeneración |
| Martes 15 | 2 | Renuncié y tuve que empezar de nuevo |
| Miércoles 16 | 3 | Lo que nadie te dice antes de meterle plata a una finca |
| Jueves 17 | — | Finca sin improvisar, la clase principal |

### El Kit se fue, y no por gusto

El bloque «Kit Finca sin improvisar» con sus cuatro piezas (diagnóstico
express, matriz antes de invertir, calculadora del costo de improvisar, mapa de
decisión) describía lo que se entrega **en el directo**, no el regalo de
bienvenida, y la gente lo estaba preguntando. En su lugar hay un bloque neutro
de «Recurso de bienvenida» con el `data-pendiente="recurso-bienvenida"`. Cuando
Iván mande el PDF hay que cambiar cuatro cosas, y están listadas en un
comentario dentro del propio HTML, encima del bloque.

### Liberación por fecha: ahora con huso horario

`data-abre` pasó de `2026-09-14` a `2026-09-14T18:00:00-05:00`. Antes el JS
hacía `new Date(a,m-1,d,0,0,0)`, que es **medianoche del navegador**: un
inscrito en España habría visto la clase abierta a las 17:00 de Colombia del
día anterior. Ahora el instante es absoluto y la clase se abre a las seis de la
tarde de Colombia para todo el mundo.

Cada clase tiene además un botón «Entrar a la clase» que aparece solo cuando la
clase se abre. Apunta al grupo de WhatsApp, que es donde se publica el enlace,
y lleva `data-pendiente="enlace-directo-N"` para sustituirlo por el de YouTube
o StreamYard en cuanto exista. **Comprobado el 10/09: el canal
`@huertahotel` todavía no tiene ningún directo programado**, así que esos tres
enlaces no existen aún.

### Calendario (nuevo)

Cuatro filas, del 14 al 17, cada una con un solo botón: **Agendar en Google**,
que abre `calendar.google.com/calendar/render?action=TEMPLATE` con el título,
las fechas y la descripción ya rellenados.

Hubo una segunda vía, un `.ics` que se armaba en el navegador y servía también
para Apple Calendar y Outlook. **Se quitó el 10/09 por decisión del cliente**:
dos acciones por fila obligaban a elegir, y un archivo que se descarga es un
paso más que explicar. Si alguna vez se echa de menos, está en el historial de
git de este mismo día.

Las horas de los `data-ini`/`data-fin` van en **UTC**: 6:00 p. m. de Colombia
son las 23:00 UTC del mismo día. Las tres clases duran 45 minutos y la del 17,
90.

### Comentarios (nuevo)

Mismo montaje que `Lina Toro/ConscienciaLina.html` y
`Nico/ConscienciaNicoOficial.html`: una Google Sheet con un Apps Script
publicado como aplicación web. `GET ?action=read` devuelve el array y un `POST`
con `{name,text,date}` añade la fila.

El script está escrito y comentado en **`comentarios-apps-script.gs`**, con los
seis pasos de puesta en marcha.

**Conectado y verificado el 10/09/2026.** La aplicación web está desplegada y su
URL ya vive en la constante `C_COMENTARIOS` del `<script>` (línea 562). No es un
secreto: viaja dentro del HTML que se pega en GHL, así que cualquiera que mire
el código fuente la ve. Por eso el script valida del lado del servidor en vez de
confiar en el formulario.

Lo que se comprobó contra la hoja real, no en un simulador:

| Prueba | Resultado |
|---|---|
| `GET ?action=read` | 200 · `application/json` · array correcto |
| POST normal | fila escrita |
| POST con `https://finca-falsa.com` | **rechazado**, no llega a la hoja |
| POST con nombre y texto vacíos | rechazado |
| POST con un nombre de 300 caracteres | guardado recortado a 60 |
| Publicar desde el formulario de la página | fila escrita, aviso «Publicado», campos limpios, botón rehabilitado |

**Gotcha de `curl`:** un POST al `/exec` responde **302** hacia
`script.googleusercontent.com`, y al seguirlo `curl` devuelve HTML en vez del
JSON. La escritura sí ocurre: se confirma leyendo. El navegador lo resuelve
solo, así que no es un problema de la página, solo de cómo se prueba desde la
terminal.

Mientras la constante esté vacía el formulario **avisa de que no está abierto en
vez de fingir que publicó**, que es lo que hacía la página de Lina.

### Miniaturas de las tres clases

Generadas con `/imagegen` de Codex siguiendo los prompts del documento de
YouTube, con dos referencias reales: un frame de `ads/brutos/ANUNCIOS 9.mp4`
para la identidad de Iván y `DJI_20260128115436_0059_D.JPG` (Drive) para el
escenario. Textos: NO ES TU FINCA · CAMBIÉ EL FRASCO · EL AGUA SE VA. Las tres
se leen al 15 % de tamaño, que es el control de calidad que pide el documento.

Los originales quedan en `assets/miniaturas/` (PNG y JPG), pero la página
apunta al **CDN de GHL**, porque una ruta relativa no resuelve dentro de un
bloque Custom HTML:

| Clase | URL en la biblioteca de la subcuenta |
|---|---|
| 1 | `.../media/6678308e-6302-4bb6-9a06-728c636a6bfe.jpg` |
| 2 | `.../media/095d71cd-cb69-4f23-a352-6911c3c4c535.jpg` |
| 3 | `.../media/bbe78d52-2f52-472e-ba42-87021abce9d0.jpg` |

Las tres dejan la esquina libre para el logo, que el editor pega como archivo
real en la versión que suba a YouTube. **No hay logo generado por IA en
ninguna.**

### El enlace del grupo se queda en el 1

Se valoró apuntar al grupo 4. Se descarta: el grupo 1 admite hasta 2.000 y va
por la mitad, y quien llega a esta página ya se registró, así que casi no suma
gente nueva. Sigue siendo
`https://chat.whatsapp.com/E0WwgTzro5l3pI3aGPjKJk`, en los cinco botones de la
página.

### Lo que encontró la revisión (mismo día)

Una revisión por dimensiones con verificación adversarial dejó **16 hallazgos
confirmados de 47**. Todos aplicados salvo dos, explicados abajo.

**Tres bugs de especificidad, y uno venía del archivo viejo.** `.c-eyebrow`
(0,1,0) perdía contra `.c-hero p` (0,1,1), así que el antetítulo del hero se
pintaba a **17,5 px en blanco** en vez de 11 px en lima: moverlo de sitio en la
hoja no lo arregla, la especificidad manda sobre el orden. Lo mismo le pasaba a
`.c-nota` contra `.c-wa p`, y a `.c-regalo-pie` contra `.c-regalo-caja p`.
Arreglado calificando los tres selectores (`.c-hero .c-eyebrow`, etc.).

**Contraste por debajo del mínimo en cuatro sitios.** Medido en el navegador,
componiendo las capas con alfa: `.c-cuando` daba 2,65:1, `.c-tag` 2,76:1 y
`.c-punto span` lo mismo, todos a 11 px. La lima `#87a942` y el coral `#ef7854`
funcionan como acento sobre fondo oscuro, no como texto pequeño sobre crema.
Se añadieron dos tonos de la misma familia solo para eso:

```css
--leaf-txt:#4a6b22;  /* 6,04:1 */
--coral-txt:#b8431f; /* 5,35:1 */
```

Ahora el texto más flojo de la página está en 4,56:1.

**El play que no reproducía nada.** Al abrirse la clase aparecía un botón de
play sobre la miniatura, y no llevaba a ninguna parte. Ahora el play y la capa
clicable (`[data-video-link]`) solo aparecen cuando el enlace del directo es
real: mientras siga con `data-pendiente` o con `href="#"`, la miniatura se
destapa pero no promete reproducción. Al pegar el enlace, la miniatura entera
pasa a llevar a la clase sin tocar nada más.

**El reloj se comía la selección del usuario.** `repasarClases` reasignaba
`textContent` cada segundo aunque la cadena fuera idéntica, y el setter
sustituye el nodo de texto siempre. Efecto medido: seleccionar «Se abre el 14
de septiembre» para copiarlo y perder la selección en menos de un segundo,
cada vez. `latir()` ya se guardaba de eso con su comparación; `repasarClases`
no. Ahora las dos usan el mismo patrón (`set(el, v)`).

**Dos hallazgos descartados a propósito:**

- «El libro *Un viaje a la regeneración* no está confirmado». Sí lo está: el
  guion v3 de la clase 1 lo pone como entregable al cierre («Entregas el PDF
  completo de *Un viaje a la regeneración*»). El revisor no tenía ese documento
  delante.
- «La tríada *comprar, sembrar o invertir más* se repite tres veces». Es la
  frase ancla de la campaña y aparece así en el registro, en los correos, en
  los tres guiones y en las descripciones de YouTube. Repetirla es deliberado.

---

## El libro de la clase 1, publicado (11/09/2026)

El cliente subió `Un viaje a la Regeneración_Final.pdf` (51 páginas, 32 MB,
hecho en Canva) a su carpeta del Drive.

**Va en el recurso de bienvenida, el descargable de hoy.** Se colocó primero en
el recurso de la clase 1 y hubo que moverlo el mismo día.

El malentendido tiene una causa concreta y conviene dejarla escrita: **el guion
v3 de la clase 1 sigue diciendo que este libro es el entregable del cierre de
esa noche** («Entregable al cierre: el libro completo *Un viaje a la
regeneración*, en PDF»), y la propia introducción del PDF lo refuerza
(«elaborado especialmente para los visitantes que participaron en nuestro
tour»). Leyendo solo los documentos, el sitio natural era la clase 1.

**Lo que mandó fue la reunión del 10/09**, donde se cambió porque el recurso de
bienvenida original no estaba listo. Los guiones del Drive no recogen ese
cambio. Regla para lo que queda de lanzamiento: **si un acuerdo de reunión
contradice a un guion, manda la reunión**, y conviene decirlo aquí antes de
tocar la página.

Queda por resolver, y lo dijo Cristhian el mismo día: hay que **cambiar el copy
de la clase 1 y que Iván regrabe**, porque su guion sigue prometiendo este libro
al cierre de una noche en la que ya no se va a entregar.

### Dos problemas que había que resolver antes de enlazarlo

**1. El archivo no era público.** `GET` anónimo al visor de Drive devolvía
**401**, y la descarga directa devolvía la página de permisos en HTML. Enlazarlo
tal cual habría dejado a todos los inscritos delante de un «solicitar acceso».

**2. Pesaba 32 MB y la biblioteca de GHL corta en 25.** Respuesta literal del
endpoint: `{"status":413,"code":"FILE_SIZE_EXCEEDED"}`.

### Cómo se resolvió: recomprimir solo las imágenes

Rasterizar el PDF entero (pdftoppm → Pillow) lo dejaba en 10 MB y visualmente
idéntico, **pero se descartó**: el libro lleva **61 hipervínculos** a las
fuentes que cita, y rasterizar los destruye todos. En un libro cuyo valor está
en tener cada cifra respaldada, eso es romper justo lo que lo sostiene.

Lo que sí se hizo (`scratchpad/recurso/recomprimir.py`, con `pikepdf` en un venv
aparte): recorrer los XObjects de imagen, recomprimirlos a JPEG de 1400 px de
lado mayor y calidad 80, y dejar intacto todo lo demás. Las máscaras de
transparencia y las imágenes de menos de 60 KB no se tocan.

| | Original | Publicado |
|---|---|---|
| Peso | 32 MB | **13 MB** |
| Páginas | 51 | 51 |
| Hipervínculos | 61 | **61, idénticos** |
| Texto extraíble | sí | **idéntico byte a byte** |
| Imágenes recomprimidas | — | 49 |

Comparadas la portada y una página interior a 130 dpi: indistinguibles.

**El original del cliente no se tocó.** La copia servida está en
`assets/recursos/un-viaje-a-la-regeneracion-web.pdf` y en el CDN de la
subcuenta: `.../media/7b4c6abe-5c59-49cb-98a2-18949cda40f8.pdf` (200, 51 págs).

### En la página

El libro vive en el bloque **Recurso de bienvenida**, descargable desde ya, sin
lógica de fecha: antetítulo «El descargable de hoy» y un copy provisional
escrito a partir del contenido real del PDF (las 51 páginas, los siete
principios del bosque, cada dato con su fuente). Se cierra en la próxima
reunión.

El recurso de la **clase 1 vuelve a estar pendiente**, con la etiqueta neutra
«Material de la clase 1», a la espera de lo que se decida que se entrega esa
noche.

---

## `Venta.html` · apilado y formato del online (11/09/2026)

### La página ya tenía montado lo del contador

Antes de ver el código fuente se escribió un `cupos-venta-page.html` para leer
los cupos desde fuera. **Sobraba y se borró.** `Venta.html` ya trae todo:

- `CONFIG.availabilityEndpoint`, que espera `{ "octoberAvailable": 32 }`.
- `renderAvailability()`, que rellena `#lhs-reserved`, `#lhs-available` y la
  barra `#lhs-meter`, y alterna `#lhs-stock` con `#lhs-soldout`.
- El cambio automático a la cohorte de diciembre cuando octubre se llena:
  reescribe el antetítulo, el título, el botón y su microcopia.
- `configureButton()` para los cuatro checkouts (octubre, diciembre, online de
  Skool, comunidad de Skool) y un aviso si el enlace está vacío.
- Polling cada 30 segundos.

Lo que faltaba no era código de la página: era **de dónde salen los números**.
Por eso `pagos-apps-script.gs` ahora devuelve también `octoberAvailable`, que es
el nombre que su `CONFIG` ya lee. Conectar esto es pegar la URL `/exec` en
`availabilityEndpoint` y nada más.

### Cambios aplicados

- **Las dos modalidades, una encima de la otra.** `.lhs-offergrid` pasó de dos
  columnas a una, con tope de 660 px y centrado: a 1160 px el texto no se
  sostiene. La regla de `@media(max-width:880px)` que forzaba una columna ya no
  hace falta y se quitó, para no tener dos sitios diciendo lo mismo.
- **El Programa Online son 8 sesiones en 2 meses**, según lo acordado. Se tocó
  el antetítulo, la promesa y la viñeta de sesiones, y se añadió una pregunta
  frecuente con la duración. Los 12 meses de Skool se quedan y ahora la FAQ
  explica la diferencia: el curso son dos meses, la comunidad sigue después.

### Un susto que no era

En el simulador el botón flotante de WhatsApp (`.lhs-wa`, `position:fixed`)
dejaba de estar fijo, que es el fallo clásico de GHL con `transform` en un
ancestro. **Comprobado en producción: ahí sí queda fijo y no hay ningún
`transform` en la cadena de ancestros.** El simulador es más pesimista que la
realidad para esta página, así que no se tocó nada. Para revisar `Venta.html`
conviene usar `simular-ghl.py --sin-transform`.

### Pendiente de terceros

- El documento de correcciones de Iván (no ha llegado).
- El logo.
- Los testimonios: hay grabaciones, pero **están sin cortar** y la mayoría
  arranca con la persona preguntando si ya puede hablar. Alejandro los va a
  recortar. El de Andrés Castrillón se descarta; el de Caspar sirve si se le
  quita el principio.

---

## `Venta.html` reescrita con el documento de correcciones (11/09/2026)

Fuente: «LA HUERTA LAB · Landing de venta · Copy corregido y correcciones
para la agencia · versión 1 · 11 de septiembre de 2026».

### La regla que manda en este archivo

El documento lo dice en su cabecera: **todo lo que va entre corchetes es un
dato que Iván confirma antes de publicar, y nadie lo rellena por su cuenta.**
Se respetó al pie de la letra. Esos huecos viven en la página con la clase
`.lhs-pend`, en amarillo sobre fondo claro, imposibles de pasar por alto: si
algo de eso llega a producción, se ve a gritos. **Hay 27 marcadores.**

### Lo aplicado

| Sección | Qué cambió |
|---|---|
| Hero | «Deja de improvisar con tu finca». Fuera el Mapa Maestro y «de ideas sueltas a un sistema productivo» |
| Puente (nueva) | Conecta los 5 pilares de la masterclass con los 7 principios del curso. Va justo tras el hero |
| Programa | Los 7 principios agrupados **por día**, con los títulos nuevos. Botón al PDF del programa, pendiente |
| Contexto real | «No vas a oír cómo se hace. Lo vas a hacer» |
| Para quién es | Las dos primeras viñetas son los dos segmentos reales: el que aún no compra y el que ya compró y está trancado. Se añade el «no es para ti si…» |
| Qué incluye | Todo concreto. Fuera «material de apoyo» y «bono de acceso» |
| Modalidades | «Dos formas de aprenderlo. No son la misma». Fuera la frase de que las dos buscan el mismo resultado |
| Prueba (rehecha) | Fuera «5 ha · 70+ · 7 · 90 días», que no tenía fuente. Entran las tres cifras medidas con su pie de la tesis |
| Testimonios (nueva) | Tres tarjetas con los huecos marcados |
| Quién enseña | En primera persona: «Yo también vendí agroquímicos» |
| FAQ | Nueve preguntas, incluida la del sismo de agosto |
| Cierre | Descargo de responsabilidad con el tono ajustado |

### Lo que se retiró, y por qué

- **El Mapa Maestro**, de toda la página. Vuelve solo si Iván confirma que
  octubre incluye una sesión donde cada participante trabaja su predio.
- **El downsell de la comunidad (10 USD/mes).** Le daba una salida barata a
  quien iba a comprar el curso. Se fue el bloque, su CSS y su botón del JS.
- **«los 7 principios del bosque»**, siempre con el nombre completo: «los 7
  principios de inmunidad del bosque». Igual con «los 5 pilares de una finca
  sin improvisar».
- **«Experiencia insignia»** y demás lenguaje de agencia. El badge ahora dice
  «En Lago Calima», que además informa.

### Dos cosas del JS

`renderAvailability()` reescribe el antetítulo, el título, el botón y la
microcopia del presencial al cargar. Si esos textos no coinciden con el HTML,
**el JS gana y el copy nuevo se pierde al segundo de abrir la página**. Se
alinearon los dos, incluido el estado de diciembre, que ahora dice «3 al 6 de
diciembre» en vez de «Próxima cohorte».

El doble estado que señalaba el documento (contador y «Octubre se ha
completado» a la vez) **no era un bug**: el JS ya alterna `#lhs-stock` y
`#lhs-soldout` y nunca los muestra juntos. Lo que sí se corrigió es el texto.

### Metadatos Open Graph

El punto 6 del documento pide título, descripción e imagen propios. **Eso no
va en este archivo**: es un bloque HTML dentro de GoHighLevel y el `<head>` lo
controla GHL. Se configura en los ajustes de la página, no aquí.

### Pendiente de terceros

- Los 12 puntos de la lista de Iván al final del documento.
- El PDF del programa día a día (`data-pendiente="programa-pdf"`).
- Los testimonios cortados.
- Las fotos: la misma de Iván sale tres veces y hay que sustituir dos por
  fotos de la cohorte de julio en práctica.
- El logo.

### El logo, puesto (11/09/2026)

`.../media/6aa46253f4e2fd8aa0ffbddd.png` · 128×128, PNG con transparencia.

Va en dos sitios: la barra del hero y el pie. Los dos tienen fondo verde
oscuro y **el archivo es negro sobre transparente**, así que ahí no se vería
nada. Comprobado que es monocromo negro puro (los tres colores opacos más
frecuentes son rgb(2,0,0), rgb(1,0,0) y rgb(0,0,0)), que es justo la condición
para poder invertirlo sin estropear el recorte:

```css
.lhs-brand img{ filter:brightness(0) invert(1); }
```

El día que llegue una versión en blanco, se quita esa línea y ya.

**Tamaño:** el logo es cuadrado y lleva el nombre dentro, en la franja
inferior. A 54 px ese texto no se leía. Está en 76 px en la barra y 88 px en
el pie, con 62 y 72 en móvil. El `<img>` lleva `width`/`height` para que el
navegador reserve el hueco y no salte al cargar.

El texto «la huerta / LAB» que hacía de marca se retiró de los dos sitios: ya
está dentro del propio logo.

---

## Los tres directos, conectados (11/09/2026)

| Clase | Vídeo |
|---|---|
| 1 · lunes 14 | `youtube.com/live/tTQ3hYfVX9A` |
| 2 · martes 15 | `youtube.com/live/XGtDRHH9Xyw` |
| 3 · miércoles 16 | `youtube.com/live/n4QQHpcU4-s` |

Los tres botones ya llevan el enlace real y dicen **«Entrar a la clase»** en
vez de «Recibir el enlace por WhatsApp». Sin `data-pendiente`: el día que toca,
el botón aparece solo, con el play sobre la miniatura y la miniatura entera
clicable.

### Las miniaturas se sirven desde YouTube

`i.ytimg.com/vi/<id>/maxresdefault.jpg`, no desde el CDN de GHL. Así, **si Iván
cambia la portada del directo en YouTube, la página se actualiza sola**. Las
tres que hay subidas hoy son las que se generaron aquí con `/imagegen`, así que
además queda contestado qué versión eligió.

**El gotcha que obligó a escribir código:** cuando un vídeo no tiene
`maxresdefault`, YouTube **no devuelve 404 limpio**. Devuelve una imagen de
120×90 (a veces con 200, a veces con 404), que en un `background-image` se ve
como un cuadro gris estirado. Un `onerror` no basta. El respaldo mira el ancho
real:

```js
prueba.onload=function(){ if(prueba.naturalWidth<600) respaldo(); };
```

Comprobado con un id inexistente: cae a `hqdefault` y la tarjeta se ve.

### Lo que queda en esta página

Los materiales descargables de las tres clases
(`data-pendiente="recurso-clase-1|2|3"`). El libro ya está publicado como
recurso de bienvenida, así que lo de las clases es material distinto.

### La miniatura, sin desenfoque y con protagonismo (11/09/2026)

Dos cambios sobre las tarjetas de clase.

**Fuera el blur.** El `filter:blur(13px)` escondía justo lo que se había
trabajado: las portadas. Ahora la miniatura se ve nítida y que está bloqueada
lo dicen tres cosas suaves: un velo en degradado, un filo lima en el borde
(`inset 0 0 0 2px`) y el candado con su cuenta atrás.

```css
/* antes */ filter:blur(13px) saturate(.55) brightness(.55); transform:scale(1.09)
/* ahora */ filter:saturate(.82) brightness(.78)
```

**El aviso bajó a la banda inferior.** Centrado tapaba el titular de la
portada, que es lo que se quiere leer. Ahora va en una línea abajo a la
izquierda —candado, «Se desbloquea en» y el reloj—, sobre la parte del
degradado que ya es oscura.

**La tarjeta pasó a dos columnas.** La miniatura tenía 300 px y quedaba como un
apunte bajo el párrafo. Ahora `.c-clase` es un grid de `440px | 1fr`: la
portada ocupa su propia columna desde lo alto de la tarjeta y las viñetas
cruzan las dos columnas abajo (`grid-column:1 / -1`). En móvil se apila y la
miniatura va a todo el ancho.

Eso obligó a reestructurar el HTML de las tres tarjetas: `.c-video` salió de
`.c-clase-media` (que desapareció) y el resto se envolvió en `.c-clase-info`.
El play también creció de 56 a 68 px, que a 440 px de miniatura se notaba
pequeño.

---

## Repaso responsive de las dos páginas (11/09/2026)

Medido en ocho anchos (320, 360, 390, 430, 600, 768, 820 y 900 px) sobre el
simulador de GHL. **Cero desbordamiento horizontal en los ocho, en las dos
páginas**, y ningún elemento más ancho que el viewport.

También se comprobó lo que un test de overflow no ve:

- **Zonas táctiles:** ningún enlace, botón, campo ni `summary` por debajo de
  40 px de alto en ninguna de las dos.
- **Rejillas:** a 360 px, modalidades, cifras, testimonios, módulos,
  habitaciones y preguntas caen todas a una columna.
- **Tipografía:** lo que baja de 12 px son etiquetas en mayúsculas
  (antetítulos, sellos, el pie del contador), que es su sitio.

### Dos fallos que solo se ven mirando

**La tabla de horarios de `Conciencia.html` se rompía fea.** `.c-hora` es un
flex con `space-between`, y a 360 px «5:00 p. m.» no cabía y se partía como
«5:00 p.» / «m.», con el país alineado a la derecha y las filas desparejas.
Dos arreglos: `white-space:nowrap` en la hora, que nunca debe partirse, y en
móvil la fila se apila con todo a la izquierda.

**El marcador amarillo de `Venta.html` perdía la caja al partirse.** Un
`.lhs-pend` de dos palabras que cae en dos líneas dejaba la segunda sin fondo
ni padding. Se arregla con `box-decoration-break:clone`.

---

## Las tres presentaciones de las clases en directo (11/09/2026)

Tres archivos HTML autónomos en `Presentaciones/`, uno por clase, con el
mismo sistema visual (`_base.css`) y el motor de decks `deck-stage.js`.
Se abren con doble clic, se escalan solas a cualquier pantalla y se
imprimen a PDF con una diapositiva por página.

| Archivo | Diapositivas | Fuente |
|---|---|---|
| `Clase1-Un-viaje-a-la-regeneracion.html` | 26 | Guion v3 (9 sep) |
| `Clase2-Renuncie-y-tuve-que-empezar-de-nuevo.html` | 34 | Guion v2 (9 sep) |
| `Clase3-Lo-que-nadie-te-dice.html` | 36 | Guion v2 (9 sep) |

### El sistema

Lienzo de 1920×1080 pensado para un directo de YouTube, así que manda la
legibilidad en móvil con señal regular: cuerpo nunca por debajo de 34 px,
titulares de 90 px para arriba, poco texto por diapositiva. Las
animaciones cuelgan de `[data-deck-active]`, de modo que se reproducen de
nuevo cada vez que se vuelve a una diapositiva y no solo la primera.

### Las infografías

Seis, y cada una existe porque hay una idea que en texto no se entiende:

- **Clase 1** · el Día de Sobregiro en un calendario de doce meses, los
  planetas por país en barras, y la línea de 1909 a hoy.
- **Clase 2** · las tres generaciones; la línea de tiempo de la finca
  familiar; y **cambiar el frasco frente a cambiar el sistema**, que es la
  diapositiva más importante de las tres clases: a la izquierda el bucle
  cerrado de la sustitución de insumos, a la derecha la finca como malla
  de cuatro nodos conectados entre sí.
- **Clase 3** · los cien puntos de los que noventa y cinco se apagan; la
  barra del burnout; y **el corte del suelo**: el mismo bloque de tierra,
  la misma lluvia y la misma pendiente, y lo único que cambia es si el
  agua entra o corre por encima.

### Imágenes

Primero se buscó en `fuentes/fotos/`, que tiene material real de la finca
y de los cursos: las terrazas, el guadual, la mesa del restaurante, los
participantes de julio, Iván y Gina. Once de esas fotos entraron directo.
Lo que no existía como foto real se generó con `/imagegen` — el almacén de
agroquímicos, la mesa de estudio, el cultivo perdido, la feria de aves, la
casa sola, la tienda de la vereda, el bus de noche, el embalse seco, el
trancón — siempre con la instrucción de dejar la mitad izquierda tranquila,
porque encima va texto.

**El guadual reemplazado.** La foto que se usaba para «el bosque» tenía a
Iván medio recortado en el borde y con una expresión rara. Se cambió por un
guadual generado sin nadie dentro, en Clase 1 y Clase 2. La antigua quedó
en `img/_sin-usar-c1-bosque-con-ivan.jpg`.

### Lo que NO se puso, y por qué

- **Clase 2** · nada del dato de las 11 toneladas: el guion dice que no se
  usa hasta verificar de qué año es y si eran anuales. Y no hay foto de
  banano: el guion prohíbe expresamente poner una genérica.
- **Clase 3** · **ninguna cita sobre suicidio rural.** El guion original
  las traía y su propia advertencia de manejo las saca de un directo con
  chat abierto dictado por alguien que no es clínico. Se conserva entera
  la idea de los dos pisos de la soledad, que es la que engancha y no las
  necesita.
- Los datos sin cerrar van en amarillo (`.pend`) dentro de la diapositiva:
  cuatro en la Clase 1, cuatro en la Clase 2 y siete en la Clase 3. Ninguno
  se rellenó por cuenta propia.

### Dos bugs del sistema que aparecieron aquí

**`data-anim="traza"` nunca se veía.** `_base.css` pone `opacity:0` a todo
lo que lleve `[data-anim]` y lo devuelve solo para `dibuja-x`, `dibuja-y` y
`revela`. El keyframe de `traza` únicamente anima `stroke-dashoffset`, así
que el trazo se quedaba invisible para siempre. **La línea de tiempo de la
Clase 1 llevaba así desde que se escribió.** Arreglado en la base. De paso,
esa misma línea tenía la etiqueta mal cerrada (`data-anim="traza"/ style=…`)
y perdía su retardo.

**Una animación CSS borra el `transform` de un SVG.** `lh-sube` termina en
`transform:none`, que pisa el atributo `transform="rotate(-90 …)"` del
elemento. La rotación tiene que vivir en un `<g>` que no se anime. Y dentro
de un SVG el origen de transformación es la esquina del viewBox, así que un
`zoom` salía disparado desde ahí en vez de crecer en su sitio: se añadió
`transform-box:fill-box` para los elementos animados dentro de SVG.

---

## El hero de la página de ventas estaba centrado contra su propio eje (12/09/2026)

Revisando `lahuertalab.com/venta-page` en producción: el logo de la barra
arrancaba en x=140 y el titular en x=290. Ciento cincuenta píxeles de
desfase entre dos cosas que deberían compartir borde.

**La causa.** `.lhs-heroin` llevaba dos clases a la vez: `.lhs-wrap`, que
ya es `min(1160px, 100% - 40px)` con `margin:auto`, y encima un
`max-width:860px` propio. Ese segundo límite no recortaba el texto por
dentro: encogía el contenedor entero y `margin:auto` lo volvía a centrar.
De ahí la sensación de que todo el hero estaba amontonado contra el eje,
con la foto aérea desaprovechada a los dos lados.

**Lo que se hizo.**

- El `max-width` pasa a los hijos (`h1`, párrafo, botones a 780 px; el
  párrafo a 620) en vez de al contenedor. Ahora el borde izquierdo del
  titular es exactamente el del logo, en los seis anchos medidos.
- Las tres garantías bajan al pie del hero como una franja a todo el
  ancho del contenedor, con filete arriba, en vez de ir apiladas dentro
  de la columna de texto. Es lo que abre el bloque hacia la derecha.
- Orden nuevo: antetítulo → titular → promesa → botones → franja de
  garantías. Antes las garantías se colaban entre la promesa y los botones.
- `text-wrap:balance` en el h1. Sin eso el corte caía en «…improvisar con /
  tu finca.» y dejaba huérfano el arranque de la cursiva.
- El logo de la barra sube de 76 a 84 px, a la escala del titular. El del
  pie mantiene sus 88.
- El degradado del fondo gana una parada intermedia (.74 al 62 %) para que
  el texto siga leyéndose a 1920, donde la columna llega más a la derecha
  y antes asomaba el pasto claro bajo el titular.

Medido a 320, 360, 390, 430, 768, 1024, 1280, 1440 y 1920: cero
desbordamiento horizontal, y logo y titular comparten borde en todos.

---

## La presentación no arrancaba dentro de GHL (12/09/2026)

`lahuertalab.com/clase-1---presentacin-page` mostraba las 26 diapositivas
apiladas, sin estilo y sin motor: 8.152 px de alto de texto suelto.

**Por qué.** El archivo local enlaza `_base.css`, `deck-stage.js` y `img/*`
con rutas relativas. Dentro de GHL esas rutas se resuelven contra el dominio
del sitio, así que el navegador pedía `lahuertalab.com/_base.css` y
`lahuertalab.com/deck-stage.js` y recibía dos 404. Sin el JS,
`customElements.get('deck-stage')` era `false` y el elemento nunca se
convertía en componente: se quedaba como una etiqueta desconocida con sus
`<section>` dentro, en flujo normal. Es la misma regla que ya estaba
documentada para las imágenes, extendida al CSS y al JS.

**La solución: `construir-ghl.py`.** Toma la presentación local y escribe un
`*-GHL.html` listo para pegar en un bloque Custom HTML:

1. Empotra el CSS y el motor en el propio bloque.
2. Cambia las imágenes por sus URL del CDN de la subcuenta.
3. **Encierra cada regla de estilo bajo `deck-stage`.** Sin esto el bloque se
   llevaba por delante la página anfitriona: el CSS de la presentación tiene
   `*{margin:0}`, `html,body{height:100%}` y `h1{font-size:132px}`, pensados
   para un documento propio. Verificado con una página de prueba con
   cabecera, pie y sus propios titulares: siguen intactos.
4. Añade un arranque que resuelve el problema del `transform`.

**El problema del `transform`.** El componente se pinta con
`position:fixed;inset:0`. GHL envuelve los bloques en secciones propias y
algunas llevan `transform`, y un ancestro transformado convierte ese
`fixed` en relativo a esa caja: medido, la presentación se encogía a
1160×60 px en lugar de 1440×900. El arranque busca ancestros con
`transform`, `perspective`, `filter`, `backdrop-filter`, `will-change` o
`contain`, y si encuentra alguno cuelga el `<deck-stage>` directamente del
`<body>`. Va antes de definir el elemento, así que en ese momento todavía es
un nodo inerte y moverlo no dispara montaje ni desmontaje. Se repite tras
`load` y `hydrationDone` porque GHL puede volver a envolverlo.

**Y de paso, el peso.** Las 14 imágenes de la Clase 1 pesaban 35 MB en PNG.
Ninguna usa transparencia, así que pasan a JPEG de 1920 px al 82 %: **4,6 MB,
un 87 % menos**, sin diferencia visible detrás de los velos oscuros.

Para las clases 2 y 3, cuando el cliente cierre la revisión:
recomprimir, subir al CDN y `python3 construir-ghl.py <clase>.html <urls.txt>`.

### Pantalla completa en la versión de GHL (12/09/2026)

Añadido al generador, así que sale en las tres clases:

- **Botón «Pantalla completa»** abajo a la derecha, y la tecla **F**. Se crea
  desde JS y se cuelga del `<body>`, igual que el componente: si quedara
  dentro de una sección de GHL con `transform`, su `position:fixed` se
  rompería exactamente igual. Se retira sola tras 2,6 s quieto, como los
  controles de un reproductor.
- **Las barras del letterbox pasan de negro a verde bosque** (`#061F1D`).
  El componente las pinta negras desde su `:host`; se sobreescriben desde
  la hoja del documento, que gana. Con esto la pantalla entera se lee como
  una sola pieza en vez de como una diapositiva pequeña en un marco negro.

Comprobado que **no hay nada recortado**: el lienzo entra entero, las catorce
imágenes son 16:9 exactos y a 1440×900 se ven 1440×810 con 45 px de barra
arriba y abajo. Lo que se percibía como recorte eran esas barras.

Cuánto crece de verdad al pasar a pantalla completa, medido:

| Pantalla | En ventana | Completa | |
|---|---|---|---|
| Monitor 16:9 1920×1080 | 1707×960 | 1920×1080 | **+12 %** |
| Ultrapanorámico 21:9 | 1707×960 | 1920×1080 | **+12 %** |
| Portátil 16:10 1440×900 | 1390×782 | 1440×810 | +4 % |
| Portátil 16:10 1512×982 | 1512×850 | 1512×850 | **0 %** |

En un portátil 16:10 no crece porque el límite es el ancho, no el alto: un
lienzo 16:9 ya toca los dos bordes laterales y lo único que aumenta es la
barra. Para que creciera ahí habría que recortar, que es justo lo que no se
quiere. En el directo de YouTube esto no aplica: la salida es 16:9 y no hay
barras.

### Clases 2 y 3 listas para GHL, y la 26 de la Clase 1 (12/09/2026)

**Las tres clases ya tienen su versión de GHL.** Veinte imágenes nuevas
recomprimidas (36,5 MB → 7,9 MB, 78 % menos) y subidas al CDN; treinta y
cinco en total en el mapa. Las dos presentaciones pasan las cuatro pruebas:
dentro de una sección con `transform` y sin ella, el componente se define,
cubre la pantalla, ninguna imagen se rompe, todas salen del CDN y la página
anfitriona conserva sus propios estilos.

Nueve de esas imágenes son fotos reales verticales que `background-size:cover`
recorta al 16:9. Es como ya estaban aprobadas, y se suben con el alto
completo a propósito: si algún día hay que reencuadrar una, hay margen.

**La diapositiva 26 de la Clase 1** llevaba un fotograma sacado de un vídeo
vertical de 1080×1920. Recortado a 16:9 daba una banda de 1080×608 ampliada
a 1920, y encima pillaba a Iván a media frase, con la boca abierta y la mano
movida. No hay foto de estudio suya en `fuentes/fotos/` — se revisaron las
veintidós candidatas y las únicas dos buenas ya están en uso en las otras
clases.

Se generó una imagen **sin nadie dentro**: el corredor de una casa de finca
al amanecer, con una camisa blanca de vestir doblada, un maletín de cuero y
unas gafas sobre un banco, y al lado unas botas embarradas y un machete.
Cuenta el «renuncié» sin que salga una persona, y su paleta fría encaja con
el verde de la marca mejor que la otra opción que se generó (una camioneta
con la mudanza a contraluz de atardecer), que quedó apartada en
`img/_sin-usar-c1-cierre-camioneta.png` por si se prefiere.

---

## Contar las descargas del recurso de bienvenida (12/09/2026)

Iván quiere saber cuántas personas se llevan el libro. La página no tenía
nada: ni GA4, ni pixel, ni script de GHL. El PDF era un enlace directo al
CDN y nadie lo contaba.

**Nada de formularios.** Pedir el correo para descargar daría nombre y
apellido de cada uno, pero en la reunión del 10/09 se decidió que el libro
es un regalo de bienvenida, y un muro de correo lo convierte en otra cosa.
Se descartó por fricción.

**Va dentro del libro de comentarios que ya existe**, no en una hoja aparte:
`comentarios-apps-script.gs` maneja ahora las dos cosas y la web sigue
llamando a **la misma URL /exec**. El script reparte por el campo `tipo` del
POST. Así no hay una segunda implementación que mantener ni una segunda URL
que pegar y que se pueda romper.

Pestañas nuevas en «Comentarios · Finca sin improvisar», que se crean solas
la primera vez:

- **Descargas** — una fila por clic: fecha UTC, fecha de Bogotá, recurso,
  visitante, dispositivo y de dónde venía la visita.
- **Resumen descargas** — fórmulas vivas: personas distintas, clics totales,
  personas y clics de hoy, reparto móvil/escritorio y una tabla por día.
  Se abre y el número está al día sin ejecutar nada.

Cómo funciona: en el clic la página manda un aviso con `navigator.sendBeacon`,
que no bloquea ni retrasa la apertura del PDF. Si no existe, `fetch` con
`keepalive`. Si el aviso falla, el enlace funciona igual: no depende de él.

**`visitante` es la clave del asunto.** Un identificador anónimo que vive
solo en el navegador de quien entra (`localStorage`), y es lo que permite
responder «cuántas *personas*» y no solo «cuántos clics». Sin nombre, sin
correo, sin IP. Antirrebote de veinte segundos, solo para que un doble clic
no cuente dos veces.

**El límite, y hay que decírselo antes de que compare números:** esto no ve
a quien recibe el libro por la comunidad de WhatsApp, y el copy de la propia
página dice que también se comparte ahí. El número siempre va a ser menor
que la gente que tiene el libro.

`data-descarga` en un enlace es lo único que hace falta para que se cuente.
Cuando los descargables de las clases tengan archivo, se les pone el suyo y
quedan contados sin tocar el JS.

**Al desplegar, cuidado:** hay que editar la implementación que ya existe
(Implementar → Administrar implementaciones → el lápiz → Nueva versión).
Si se crea una implementación nueva, Google da otra URL y la página seguirá
llamando a la vieja: los comentarios dejarían de guardarse.

---

## El libro actualizado (12/09/2026)

El cliente cambió el libro. La versión nueva del Drive pesaba **32,8 MB**,
otra vez por encima del límite de 25 MB de la biblioteca de GHL.

Mismo tratamiento que la vez pasada: recomprimir **solo las imágenes** con
pikepdf, nunca rasterizar. **32,8 MB → 10,5 MB**, 55 imágenes recomprimidas.
Comprobado antes de subirlo: 50 páginas en los dos, 61 enlaces en los dos,
52 URLs únicas idénticas y la huella del texto byte a byte igual.

Dos cosas que cambiaron y había que seguir:

- **El libro pasó de 51 a 50 páginas.** Decíamos «51 páginas» en
  `Conciencia.html` y en la Clase 1. Corregido en los dos.
- **La portada trae una corrección de copy** («imitando *el* sistema
  inmunológico del bosque», antes «*al* sistema»). Se volvió a renderizar
  la página 1 del PDF nuevo para `img/c1-libro.png`, se subió al CDN y se
  regeneró la Clase 1.

El PDF viejo sigue en la biblioteca de GHL; conviene borrarlo cuando se
confirme que el nuevo está publicado, para que nadie lo enlace por error.

### El contador, conectado (12/09/2026)

URL definitiva pegada en `C_COMENTARIOS`: `.../AKfycbxw5BaRAxE5Ua7l.../exec`.
Hubo que rehacer el despliegue dos veces, y cada vez Google dio una URL
nueva que hubo que volver a poner en el HTML. Comprobado contra el script real: los
comentarios siguen leyéndose (quince filas, la última de Iván) y un clic en
el botón escribió su fila en la pestaña «Descargas».

**Un bug que solo se ve probando de verdad.** `appendRow(['2026-09-12 14:02'])`
no guarda una cadena: Sheets reconoce el formato y lo convierte en un valor
de fecha. A partir de ahí `getValues()` devuelve un objeto `Date`, y la
comparación por texto falla sin dar error. El síntoma era raro y fácil de
pasar por alto: `total:1` con `hoy:0`. Y por lo mismo habrían fallado las
fórmulas de «Personas hoy», «Clics hoy» y la tabla por día, que van con
`LEFT(B,10)`.

Arreglado escribiendo las dos columnas de fecha con un apóstrofo delante,
que fuerza el texto en Sheets y desaparece al leer. La lectura además
tolera las dos formas, por si queda alguna fila vieja ya convertida.

Verificado contra el script real, ya con el arreglo puesto:
`{"ok":true,"total":1,"personas":1,"hoy":1,"personasHoy":1}`. Antes salía
`hoy:0` con `total:1`, que era el síntoma del bug de las fechas.

### El PDF salió con recuadros negros (12/09/2026)

El cliente avisó de que algunas imágenes del libro publicado se veían
negras. Eran tres páginas de cincuenta: el logo de Colombia Birdfair y la
foto recortada de Gina, las dos sobre un rectángulo negro.

**La causa fue mía.** El script de recompresión borraba `/SMask` de cada
imagen. Ese objeto es el canal de transparencia. JPEG no guarda alfa, así
que al recomprimir la imagen y quitarle la máscara, lo que era fondo
transparente pasó a ser un bloque negro. Un logo recortado y una foto
recortada son justamente los dos casos donde eso se nota.

**Lo que falló en la verificación.** La primera vez comprobé páginas,
enlaces, URLs y la huella del texto, y todo daba idéntico — porque nada de
eso mira los píxeles. Ahora la comprobación renderiza las cincuenta páginas
de los dos PDF y compara dos cosas: el brillo medio de cada página y el
peor píxel de diferencia, que es lo que delata un recuadro negro local
aunque el promedio de la página apenas se mueva.

**El arreglo.** No se tocan las imágenes con `/SMask`, `/Mask`,
`/ImageMask`, alfa en el modo de PIL, filtro JPX, ni las menores de 60 KB.
Son logos y recortes: pesan poco y el ahorro real está en las fotos a
sangre. Resultado: 49 recomprimidas, 8 intactas, **31,3 MB → 11,9 MB**, y
la comparación de las cincuenta páginas no encuentra ninguna sospechosa.

---

## Revisión de Iván sobre la Clase 1 (14/09/2026)

Primero llegó el Loom y después el documento escrito. **El documento
corrigió tres cosas que se habían entendido mal del audio**, y por eso
conviene esperar al documento cuando exista:

1. «Iván en tercio derecho» no era invertir el bloque de texto, era mover a
   Iván al tercio derecho. Los fondos son 16:9 exactos y `cover` no deja
   reencuadrar, así que se voltean con `.foto.espejo` y el texto se queda
   donde estaba.
2. La cifra de deforestación es **2.600.000** hectáreas al año, no 2.060.000
   como se oyó en el Loom.
3. Eran **dos** diapositivas nuevas, no una. Y la 17 también son dos tiempos:
   trae dos antetítulos seguidos.

La Clase 1 pasa de 26 a **29 diapositivas**.

| # | Cambio |
|---|---|
| 1 | Foto volteada: Iván pasa al tercio derecho, el texto se queda a la izquierda. |
| 2 | Foto volteada: la bolsa con el pan, el aceite y las lentejas queda en el lado libre. |
| 4 | **34 millones** de personas · El País América, 2023. |
| 5 | Foto nueva, Iván al tercio derecho, y cuatro tarjetas 2×2: 20 años · Maestría · **Docente universitario** · 5 hectáreas, con el **70 %** de La Huerta Hotel al final. |
| 6 | Copy literal del documento. |
| 7 | Copy literal. Donde el documento dice «de la misma cuenta» se usó «de la misma manera», que es lo que dice en el Loom. |
| **nueva** | **Sale a buscar más potrero.** |
| **nueva** | **El potrero nuevo se llama selva**, con las 2.600.000 ha, el reparto 70/20/10 y sus tres fuentes. |
| 9 | Solo cambia el antetítulo a «Y aun así no alcanza»: el documento dice «dejar» el cuerpo. |
| 12 | Copy completo: el 60 % de las emisiones, los commodities, y las fuentes. Se queda la foto del supermercado. |
| 17 | Partida en dos: «Por eso importa» y «Y esto te lo digo con conocimiento de causa». |
| 22 | Copy literal, con la línea que faltaba sobre la trampa que ya está esperándote. |

Sin tocar: 3, 8, 10, 11, 13, 14, 15, 16, 18, 19, 20, 21 y de la 23 al final.

**Dos cosas nuevas en el sistema visual.** `.foto.espejo` para voltear un
fondo cuando el sujeto cae debajo del titular, y `.velo.der` con `.pad.der`
por si alguna vez hace falta el bloque entero al otro lado (al ponerlos,
`width:100%` en los hijos reventó la marca, que va posicionada en absoluto:
basta `align-items:flex-end`).

**Lo que sigue pendiente**

- El año y la métrica del **70 %**, que ya venía de la Clase 2.
- La fecha del Día de Sobregiro del año en curso, que ya estaba marcada.
### La foto de Vandana Shiva, resuelta

Puesta, y con licencia en regla. La de **Böll Stiftung en Wikimedia
Commons, CC BY-SA 2.0**, elegida entre tres candidatas libres porque está
hablando en un atril — que es lo que pide una diapositiva de cita — y es la
de más resolución.

Dos decisiones que van juntas y conviene no deshacer sin pensarlo:

- **Se usa entera, solo reescalada.** Recortarla la convertiría en obra
  derivada, y la cláusula «compartir igual» de CC BY-SA obligaría a
  licenciar lo derivado bajo la misma licencia. Reescalar no dispara eso.
- **El crédito de al lado es obligatorio**, no decorativo: autor, licencia
  y de dónde sale. Si algún día se cambia la foto, hay que cambiar también
  el crédito. Queda anotado en el HTML.

### Datos cerrados antes del directo (14/09/2026)

La Clase 1 **no tiene ya ningún dato en amarillo**.

- **Día de Sobregiro.** El de este año es el **30 de julio de 2026**,
  confirmado en la fuente oficial. Y de paso apareció un error que venía de
  antes: la diapositiva daba «principios de octubre» para el año 2000, de
  una serie antigua. Global Footprint Network recalculó su serie histórica y
  hoy publica el **23 de septiembre**. Se usa la suya, que es la que va al
  pie. Las dos barras pasan a escala real sobre el año — 72,9 % y 57,8 % —
  y ahora coinciden con la regla de meses que tienen encima.
  El titular decía «si el sueldo se te acaba en agosto»: con la fecha real
  es julio, y son cinco meses de ahorros, no cuatro.
- **El 70 % del restaurante.** No se le inventó un año: el pie dice
  «Registros de producción de La Huerta Hotel», que es exacto. Mismo criterio
  aplicado en la Clase 2.
- **El Niño (Clase 3).** Estaba marcado como dato vivo, pendiente de los
  boletines de septiembre. Revisados: la OMM de septiembre confirma la
  persistencia cercana al 100 % y la intensificación hasta «muy fuerte» con
  pico a final de año. Las dos cifras de intensidad siguen siendo de la NOAA
  de agosto y así queda dicho en el pie.

**Lo que sigue en amarillo, y solo Iván puede cerrarlo:** en la Clase 2, la
unificación de «más de 60 alimentos» con «más de 70 especies» y los
testimonios de julio con su permiso escrito. En la Clase 3, su anécdota de
soledad, el nombre del vecino, si Gina entra en vivo, el año del fenómeno de
El Niño que secó los lagos, y la verificación de la autoría del estudio de
*Nature Communications* del que sale el 2,25.

---

## Contador de espera para el directo (14/09/2026)

`contador/Contador-Clase1.html` — cuenta atrás de cinco minutos para
proyectar antes de que arranque la clase, con la marca y diez fotos de la
finca pasando de fondo.

**Por qué es una página y no un vídeo renderizado.** El de Lina se hizo en
Remotion (`remotion-visitas/src/CountdownVideo.tsx`) y eran cinco minutos.
Aquí el problema es la máquina: quedan **3,1 GB libres de disco**, y un
render a 1080p deja todos los fotogramas en disco antes de codificar —
9.000 fotogramas son diez o quince gigas. No cabía.

Y resulta que para esto la página es mejor: se engancha al reloj del
sistema, así que llega a cero cuando de verdad empieza la clase y no cuando
alguien le dio al play. Con `?hasta=18:00` se fija a una hora exacta; si se
deja puesta mucho antes, espera en 5:00 y arranca sola al entrar en ventana.
La tecla R reinicia, por si hay que estirar la espera.

**Nota de stack.** El encargo decía HyperFrames. HyperFrames es el v1
**pausado**; el motor real de vídeo de la casa es Remotion, y así estaba
hecho el de Lina. Ver [[savias-usa-remotion-no-el-stack-aspiracional]].

**Detalles que costaron una pasada cada uno**

- El lienzo de 1920×1080 centrado con `grid` + `place-items:center` se
  anclaba al inicio en vez de centrarse, porque el hijo es más grande que
  el contenedor y el navegador aplica alineación segura. Con `left/top` al
  50 % y `translate(-50%,-50%)` no hay ambigüedad.
- El centro del cuadro lo ocupa el reloj, así que las fotos de primer plano
  con cara o mano llevan su propio `background-position` a un lado. La que
  cierra es la vista aérea, que tiene el centro despejado.
- Con una hora lejana en `?hasta=` el reloj mostraba «1439:09»: ahora se
  limita a los cinco minutos.

Las cuatro fotos nuevas (amanecer, rocío, reservorio y biofábrica) se
generaron con imagegen; las otras seis salen de la biblioteca ya aprobada.
Todas recomprimidas: 25 MB → 5,4 MB.

### Dos ajustes del contador (14/09/2026)

**El recuadro alrededor del reloj.** Era la sombra del texto: `0 10px 48px`
al 85 %. Con cifras de 188 px, un desenfoque tan grande se apelmaza y dibuja
un bloque oscuro rectangular alrededor. Aislado apagando efectos uno a uno
sobre la misma foto congelada. Queda en `0 2px 14px` al 50 %, que basta para
que el reloj aguante sobre las fotos más claras sin ensuciar el fondo.

**Mandos.** Tres botones abajo a la derecha: **Pausar** (se pone coral y
pasa a «Seguir» cuando está detenido), **Reiniciar** y **Pantalla completa**.
Atajos: espacio o P, R, y F. Se esconden solos a los 3,2 s y vuelven al mover
el ratón — están encima de lo que se comparte en el directo.

Al pausar se congela también el zoom de la foto: con el reloj parado y la
imagen moviéndose parece que la página se colgó. Y el pie de foto sube a
122 px para que los mandos, que van fijos a la ventana y no al lienzo
escalado, no queden pegados al aviso de la derecha.

### El recuadro del contador era un `filter` (14/09/2026)

Quedaba un recuadro tenue alrededor del reloj después de quitar la sombra
del texto. Localizado midiendo píxeles, no a ojo: un filtro de paso alto
sobre la captura enseñaba dos costuras verticales rectas justo en la caja
del anillo (x 570 y 1030 de 1600, que es su ancho exacto a esa escala).

**La causa: `filter: drop-shadow()` en el arco del SVG.** Aplicar un
`filter` obliga al navegador a rasterizar ese elemento en una capa aparte,
y esa capa es **rectangular**. Con el `#lienzo` escalado por `transform`,
la capa se rasteriza a una resolución distinta del resto y al componerla
aparece la costura de su caja.

Apagando los efectos uno a uno sobre la misma foto congelada: quitando solo
el `drop-shadow`, el recuadro desaparece y la textura del fondo vuelve a
correr de lado a lado.

Arreglado quitando los dos resplandores —el lima y el coral del último
minuto— y subiendo el anillo de 8 a 9 px. Sobre el velo se lee de sobra sin
resplandor.

**La regla, que sirve para cualquier pieza escalada:** dentro de un
contenedor con `transform: scale()`, evitar `filter` en los hijos. Si hace
falta un halo, `box-shadow` sobre un elemento con `border-radius:50%` lo da
sin crear capa rasterizada.

---

## La clase se ve dentro de la página (14/09/2026)

Dos cambios en `Conciencia.html`.

**Fuera el descargable de la clase 1.** Nunca llegó a tener archivo y ya no
lo va a tener. Las clases 2 y 3 conservan el suyo, en gris, hasta que
alguien les pegue el material.

**El directo se ve en la propia tarjeta.** La miniatura ya no manda a
YouTube: al pulsarla se cambia por el reproductor incrustado, en el mismo
hueco. El botón de al lado se queda, pero ahora dice «Abrir en YouTube, con
el chat», que es la razón real para salir de la página.

Detalles que importan:

- **El iframe se crea al pulsar, no al cargar.** Tres reproductores de
  YouTube montados de entrada le meterían su peso y sus cookies a todo el
  que abra la página, haya ido o no a ver la clase.
- El repaso que corre cada segundo no vuelve a poner la tapa si ya hay
  reproductor: taparía el vídeo que la persona está viendo.
- Sirve para las tres clases; cada una se activa el día que se abre.

**Un susto durante la prueba.** El reproductor daba «Error 153» de YouTube.
No era la página: probándolo desde `file://` el origen es `null` y YouTube
rechaza la inserción. Comprobado en el origen con la API de oEmbed y con
`playableInEmbed` — los tres directos permiten insertarse — y confirmado
sirviendo la página por HTTP, donde reproduce sin problema.

Medido a 360, 390, 768 y 1024 px: sin desbordamiento y el vídeo mantiene
16:9 en todos.

---

## La masterclass del 17, montada (15/09/2026)

`Presentaciones/Masterclass-Finca-sin-improvisar.html` — **58 diapositivas**
para los 90 minutos del jueves. Es la clase principal: las tres anteriores
eran de calentamiento.

### De dónde sale el contenido

El documento de instrucciones del Drive **se declara a sí mismo borrador no
aprobado** y dice que la transcripción del Loom «Estructura de diapositivas
para masterclass 17» manda sobre su propia síntesis. Ese Loom no venía
transcrito: se descargó por la API pública de Loom y se pasó por Whisper.
Queda en `fuentes/transcript/loom-estructura-masterclass17.txt`.

**Trae seis diapositivas que el documento no recoge:** el bloque de
compromiso (cerrar distracciones, papel a mano, avisar al entorno), los tres
tipos de asistente con la pregunta al chat, la frase de apertura, el anuncio
del recurso del final, los reconocimientos institucionales y el «cuéntame qué
aprendiste» que cierra el contenido. Y fija el orden de la oferta, que no se
altera: PUV → beneficios (no características) → entregables → precio y
garantía → bonos → urgencia → downsell, con el viaje del héroe justo antes.

Los cinco pilares van con las palabras del propio Iván, del VSL de registro.
La oferta sale de `lahuertalab.com/venta-page`, no del documento: ahí están
las fechas, el temario de los siete principios y los precios reales.

### Los 36 huecos en amarillo

Ninguno se rellenó por cuenta propia. Están listados por responsable en
`Presentaciones/CHECKLIST-masterclass.md`. Los tres que más pesan:

- **La fecha de cierre del carrito se contradice dentro del propio Loom:**
  dice «cinco días, hasta el martes» y acto seguido enumera hasta el jueves
  24. Son dos fechas distintas. Mientras no se elija una, la diapositiva 54
  no lleva cuenta atrás.
- **De los tres bonos solo existe el primero** (sesión 1 a 1). Del segundo y
  el tercero el Loom dice literalmente «tú te lo inventas». No se inventaron.
- **No hay texto de garantía verificado.** Sin él no se dibuja sello.

El «96 % de una planta es agua y dióxido de carbono» del VSL **no está en la
presentación**: necesita la revisión técnica de Iván, como ya advertía el
documento.

### El simulador

Montada la **versión B** del documento —el «mapa de primera decisión», cinco
preguntas y un caso—, porque el Excel no está confirmado. Las diapositivas
34-36 quedan aisladas a propósito: si el simulador llega terminado y probado,
se sustituyen por la demostración en pantalla compartida. La 37 deja la
mecánica de entrega entera en amarillo; el Loom propone una clave tipo
«simulador rentabilidad», pero no se pone una clave inventada.

### Ocho infografías

El orden propósito→diseño→ciclos→decisiones, la escalera de la cadena corta,
el enganche entre los pilares 1 y 2, el ciclo cerrado de los bioinsumos, los
cinco pasos del agua, la malla de los cinco pilares juntos, «cambiar el
frasco» y el árbol de las dos modalidades. Todas en SVG animado con el motor,
así que se dibujan solas mientras Iván las explica.

### La versión de GHL

`Masterclass-Finca-sin-improvisar-GHL.html`, 158 KB, generada con
`construir-ghl.py`. Doce imágenes nuevas recomprimidas al 82 % y subidas al
CDN de la subcuenta; cincuenta y tres en el mapa.

Probada en una página anfitriona con cabecera, pie y titulares propios, en
las dos situaciones:

| | Con `transform` en la sección | Sin `transform` |
|---|---|---|
| Componente definido | sí | sí |
| Tamaño a 1440×900 | 1440×900 | 1440×900 |
| Se cuelga del `<body>` | sí, como debe | no hace falta |
| Párrafo de la anfitriona | sigue en 16 px | sigue en 16 px |
| Recursos rotos | ninguno | ninguno |

Medida también a 390 y a 1920: sin desbordamiento horizontal. El letterbox de
móvil es el mismo de las otras tres clases y se resuelve con el botón de
pantalla completa que ya añade el generador.

---

## Una foto que no es Iván, en las tres clases (15/09/2026)

Apareció montando la diapositiva de autoridad de la masterclass.

**`img/c2-ivan.jpg` no es Iván.** Es un muchacho del equipo recogiendo papaya
con la camiseta del hotel. El error viene del nombre del archivo original del
cliente: se llama «Ingenieros agrónomos expertos en agricultura
regenerativa.jpg».

Está puesta como si fuera él en las tres clases, **y en las versiones
publicadas** — comprobado descargando la imagen del CDN
(`b412d8c4-eb08-41c1-a543-279d2d7fa78d.jpg`), que es la misma foto:

| Clase | Diapositiva | Qué dice encima |
|---|---|---|
| 1 | 05 · «Quién habla» | «Desde dónde te hablo» + «20 años en la industria de agroquímicos» |
| 2 | 38 · «Gancho al miércoles» | la diapositiva de cierre |
| 3 | 02 · «El sueño» | «Desde niño soñaba con vivir en el campo. **Lo logré a los 47**» |

La de la Clase 3 es la más delicada: «lo logré a los 47» sobre la cara de un
chico de veintipocos.

Iván es el de `c1-ivan.jpg` (fotograma de vídeo, calidad justa) y el de
`c2-ivan-gina.jpg` (foto buena, con Gina). **En la masterclass ya está
corregido**: la diapositiva 8 usa la de los dos cofundadores, que es lo que
dice su propia entradilla. Las tres clases siguen pendientes de decisión,
porque corregirlas implica volver a subir al CDN y volver a pegar los bloques.

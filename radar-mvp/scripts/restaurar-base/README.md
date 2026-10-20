# Restaurar el Radar en un proyecto de Supabase nuevo

Para cuando hay que levantar la base desde el volcado de un cluster
(`db_cluster-*.backup.gz` del panel de Supabase). Se hizo el 20 de octubre
de 2026, con el volcado del 17.

**Lo que hace falta aparte de esto:** el volcado, y la cadena de conexión del
proyecto nuevo. Ninguna clave de API sirve: restaurar es DDL y `COPY`, y eso
va por Postgres.

Los ficheros de datos **no están en el repositorio** (direcciones reales,
enlaces a la fuente, correos y contraseñas cifradas). Hay que generarlos del
volcado primero — ver «Regenerar los datos» abajo — y luego:

```bash
export RADAR_DATABASE_URL='postgresql://postgres.PROYECTO:CLAVE@aws-1-eu-central-1.pooler.supabase.com:5432/postgres'
bash restaurar.sh
```

Tarda unos 15 minutos y va diciendo el tamaño de la base después de cada paso.

---

## Qué se restaura y qué no

El volcado es del **cluster entero**, no solo del Radar: 55 tablas en 8
esquemas. De ahí solo entran dos cosas.

| | |
|---|---|
| **`public` completo** | 17 tablas, 52 índices, 25 constraints, 11 funciones, 2 vistas, 5 triggers, RLS y los 727 permisos |
| **Las filas de `auth`** | 45 usuarios con su contraseña cifrada y 47 identidades (39 correo, 6 Google, 2 Microsoft) |

**El DDL de `auth`, `storage` y `realtime` NO se toca.** El proyecto nuevo trae
su propia versión de GoTrue y de Storage, posiblemente distinta de la del
volcado, y escribir encima la rompe. De `auth` entran filas, nunca estructura.

Y por eso las filas de `auth` entran por una **tabla puente**: se insertan solo
las columnas que están en el volcado *y* en el esquema de destino, excluyendo
las generadas. Sin eso, un `COPY` directo falla entero en cuanto las dos
versiones no coinciden — y de hecho falla: `auth.users.confirmed_at` es una
columna generada, y Postgres rechaza el insert si se intenta escribir en ella.

---

## Los tres recortes, y por qué

El volcado son 1.125 MB de datos y el plan gratuito son 500 MB. Pero el
problema nunca fue el número de filas: **`features` es el 88% de todo**
(653 MB en `inmuebles`, 336 MB en `rental_listings`). Dentro de ese JSON,
tres claves son el 81%: `images` 521 MB, `description` 193 MB,
`amenities` 84 MB.

**1 · Arriendos: `features` a 6 claves.** De 382 MB a 57, con las 101.108
filas enteras. No se pierde nada: es exactamente el recorte que
`soloLoQueUsaElArriendo()` en `lib/supabase.ts` ya aplica al escribir. El
motor de comparables lee `lat`, `lng`, `bedrooms`, `garages`, `neighborhood`
e `is_project`, y nadie más toca esa columna.

**2 · Inmuebles: `features.images` a 6 fotos de las 20 que guarda el scraper.**
La galería de la ficha sigue siendo una galería, la portada (`image_url`, que
es lo único que usa el listado) no se toca, y el siguiente pase del scraper
repone las 20. `description` y `amenities` se dejan **intactas** porque la
ficha las pinta ([`app.js:4045`](../../server/public/app.js#L4045)).

**3 · Inmuebles: muestra con tope de 60 por (ciudad, zona).** Entran siempre
los 590 de banco, los 2.814 `is_high` y las 32.339 oportunidades. Quedan
105.847 de 183.008 filas, con las 171 ciudades y las 10.343 zonas.

El tope de 60 se eligió midiendo: solo **1.309 zonas de 10.343** tienen 20 o
más avisos, que es el mínimo que el panel de comparables necesita para dar un
número. Con tope 60, las 9.034 zonas pequeñas conservan *todas* sus filas y
las grandes se quedan muy por encima del mínimo.

Comprobado contra el volcado completo: las fichas de banco con panel de
comparables pasan de **30 a 29**. La muestra cuesta una.

*(De paso, eso enseña un defecto que ya existía: el panel solo funciona para
~7% de los inmuebles de banco, porque están en zonas donde el portal no tiene
inventario de esa franja de área. No es de la muestra.)*

**`price_history` no se restaura** (194.578 filas, 27 MB): es histórico
derivado y los scrapers lo vuelven a construir.

---

## Tamaños reales, medidos

No estimados: cargados en un Postgres local con los 52 índices creados.

| | filas | en disco |
|---|---|---|
| `inmuebles` | 105.847 | 93 MB datos+TOAST, 20 MB índices |
| `rental_listings` | 101.108 | 56 MB datos, 14 MB índices |
| `remates` | 3.473 | 11 MB |
| `documents` | 637 | 8,5 MB |
| **base entera** | | **428 MB** |

El cargador para en 420 MB (`TOPE_MB`) para dejar aire: los scrapers escriben
a diario y `price_history` vuelve a crecer sola. Con ese tope no entra el
último lote y quedan 92.811 inmuebles en 387 MB. Súbelo si quieres más
catálogo y menos margen.

---

## El orden del cargador, y por qué es ese

```
01-esquema-pre.sql    tablas, funciones, vistas, extensión vector
02-datos-auth.sql     45 usuarios + 47 identidades
02-datos-publicas-chicas.sql
02-datos-arriendos.sql
04-inmuebles-00.sql   núcleo: banco + is_high + oportunidades
03-esquema-post.sql   52 índices, constraints, triggers, RLS, permisos
04-inmuebles-01..NN   relleno, midiendo la base entre lote y lote
```

Los índices van **después** de los datos: cargar 100.000 filas con 52 índices
ya creados es un orden de magnitud más lento. Pero van **antes** del relleno,
para que cada medición incluya el coste del índice y la decisión de parar sea
real y no una estimación mía.

La extensión `vector` va primero: se instaló en el esquema `public` (no en
`extensions`), `documents.embedding` y `memories.embedding` son
`vector(1536)`, y un proyecto nuevo de Supabase **no la trae activada**.

---

## Tres cosas de la conexión que ya costaron acertar

- El puerto es **5432** (session pooler), no el 6543 que enseña el panel por
  defecto. El 6543 es el *transaction pooler*: no mantiene sesión y rompe las
  consultas largas.
- La conexión «directa» (`db.PROYECTO.supabase.co`) **no sirve**: solo publica
  registro AAAA y desde muchas redes no hay ruta IPv6.
- La `@` de la contraseña va como `%40`. Es una URI.

---

## Regenerar los datos desde otro volcado

```bash
cd generar
python3 -I partir.py           /ruta/al/db_cluster-*.backup.gz piezas
python3 -I construir-esquema.py
python3 -I construir-auth.py
python3 -I construir-datos.py  /ruta/al/db_cluster-*.backup.gz
python3 -I verificar.py        # tiene que decir TODO CORRECTO
bash probar-local.sh           # ensayo en el Postgres local antes de producción
```

`verificar.py` no es opcional. La primera vez que se generó esto, la cabecera
`COPY` de los lotes de inmuebles salió con las columnas de `vault.secrets`
—el constructor la escribía después del bucle, usando la variable del último
`COPY` del volcado— y las 105.847 filas habrían fallado al cargar. Lo cazó el
verificador comparando el ancho de las filas con la cabecera.

`probar-local.sh` tampoco. Cazó el fallo de `confirmed_at`.

### Para qué sirve cada medidor

| | |
|---|---|
| `medir.py` | peso por columna y reparto por ciudad |
| `claves.py` | peso de cada clave *dentro* del jsonb `features` |
| `zonas.py` | densidad por (ciudad, zona) y qué da cada tope |
| `comparar-comparables.py` | si la muestra degrada los comparables o ya estaban así |

---

## Después de restaurar

1. Cambiar las variables de entorno al proyecto nuevo, en **EasyPanel y en
   `.env`**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `RADAR_DATABASE_URL`. En EasyPanel hay que **recrear el contenedor**, no
   solo redesplegar.
2. Quitar `RADAR_DEMO_DATOS` (o ponerla a `0`): el modo demo deja de hacer
   falta en cuanto la base responde. Ver `docs/demo-sin-supabase.md`.
3. Comprobar `/health`: tiene que decir `demo: false` y responder `ok`.
4. Dejar que los scrapers corran un pase para reponer catálogo,
   `price_history` y las fotos recortadas.

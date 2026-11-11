# Liberar espacio en Supabase — el Radar caído por `exceed_db_size_quota`

**Fecha:** 10 de octubre de 2026
**Síntoma:** los listados no cargan («No se pudo cargar») y no se puede entrar con
Google ni con correo.
**Causa:** Supabase restringió el proyecto `uqlfgnylvnefhyuvtncd` por superar la
cuota de tamaño de base de datos. Todo lo que pasa por su API —datos y
autenticación— devuelve **HTTP 402**:

```
Service for this project is restricted due to the following violations:
exceed_db_size_quota. The project owner must upgrade their plan or remove
spend caps to restore service.
```

No es un fallo del código del Radar. El servidor está vivo (30 días de uptime) y
responde; lo que no responde es la base.

---

## Las dos trampas, antes de empezar

**1. La API también está bloqueada para escribir.** Un `DELETE` por la API
devuelve 402 igual que una lectura. Comprobado. Así que **la limpieza hay que
hacerla desde el editor SQL del panel de Supabase**, que va por otra vía y sigue
funcionando precisamente para esto.

> Panel → el proyecto → **SQL Editor** → New query → pegar y ejecutar.

**2. Borrar filas NO devuelve el disco por sí solo.** Postgres marca el espacio
como reutilizable, pero el archivo sigue ocupando lo mismo, y la cuota de
Supabase mide el disco. Para que baja de verdad hace falta `VACUUM FULL`, que
reescribe la tabla y **necesita espacio libre temporal del tamaño de la tabla**.
Por eso el orden importa: primero las tablas pequeñas, para hacer sitio, y la
grande al final.

---

## Paso 1 · Ver dónde está el espacio

```sql
-- Tamaño total de la base
select pg_size_pretty(pg_database_size(current_database())) as base_completa;

-- Y el desglose por tabla, de mayor a menor
select
  c.relname                                        as tabla,
  pg_size_pretty(pg_total_relation_size(c.oid))    as total,
  pg_size_pretty(pg_relation_size(c.oid))          as datos,
  pg_size_pretty(pg_indexes_size(c.oid))           as indices,
  c.reltuples::bigint                              as filas_aprox
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

**Pega aquí el resultado antes de borrar nada.** Lo de abajo son candidatos
ordenados por «cuánto duele»; cuál conviene depende de lo que diga esta tabla.

---

## Lo que midió el panel (10/10/2026)

| tabla | total | datos | índices | **TOAST** | filas |
|---|---:|---:|---:|---:|---:|
| `inmuebles` | **912 MB** | 210 MB | 243 MB | **459 MB** | 182.968 |
| `rental_listings` | **362 MB** | 107 MB | 26 MB | **229 MB** | 101.017 |
| `price_history` | 41 MB | 23 MB | 18 MB | — | 189.368 |
| `remates` | 15 MB | 5 MB | 1,5 MB | 8 MB | 3.473 |
| todo lo demás | 6,8 MB | | | | |
| **TOTAL** | **1,31 GB** | | | | |

Dos tablas son el **95%** de la base. Y los **688 MB de TOAST** —el JSONB
`features` guardado fuera de línea— son el **51% de todo**.

El plan gratuito son 500 MB: hay que quitar **837 MB, el 63%**.

---

## Paso 2 · Las dos cosas que liberan de verdad

### a) `rental_listings.features`: 229 MB que nadie lee — el mejor cambio

El parser de FincaRaíz construye un `features` de 28 claves y lo usa igual para
una venta que para un arriendo. Pero **un arriendo no se enseña en ninguna
parte**: existe solo para calcular la mediana del canon de su zona. El motor lee
**seis claves** (`engine/rental-comparables.ts`) y nadie más toca esa columna.

Las otras 22 —`description`, `images`, `amenities`, `title`, el bloque del
portal— son los 229 MB de TOAST.

```sql
-- MIRAR primero: cuánto pesa lo que sobra
select pg_size_pretty(sum(pg_column_size(features)))                       as ahora,
       pg_size_pretty(sum(pg_column_size(features - 'description' - 'images'
                                         - 'amenities' - 'title')))        as despues
from public.rental_listings;

-- Recortar a las seis claves que el motor sí usa
update public.rental_listings
set features = jsonb_strip_nulls(jsonb_build_object(
  'lat',          features->'lat',
  'lng',          features->'lng',
  'bedrooms',     features->'bedrooms',
  'garages',      features->'garages',
  'neighborhood', features->'neighborhood',
  'is_project',   features->'is_project'
));
```

> El `UPDATE` reescribe las 101.017 filas y deja las viejas muertas, así que el
> disco **sube** antes de bajar. Es normal: el `VACUUM FULL` del Paso 4 lo
> recupera. Si el disco no aguanta, hazlo por tandas con `where id in (...)`.

El código ya no las vuelve a escribir: `lib/supabase.ts` recorta `features`
antes del upsert de arriendos. Sin eso, la próxima corrida del scraper devolvía
los 229 MB.

### b) Índices duplicados en `inmuebles`: 243 MB en 26 índices

Hay **26 índices** sobre una tabla de 183.000 filas, y entre ellos parejas que
indexan lo mismo con distinto operador:

```sql
-- Qué índices NO se han usado nunca (idx_scan = 0)
select indexrelname as indice,
       pg_size_pretty(pg_relation_size(indexrelid)) as tamano,
       idx_scan as veces_usado
from pg_stat_user_indexes
where schemaname = 'public' and relname = 'inmuebles'
order by idx_scan asc, pg_relation_size(indexrelid) desc;
```

Candidatos claros a caer (duplican a otro):

```sql
drop index if exists public.inmuebles_features_bedrooms_idx;  -- = idx_inmuebles_bedrooms
drop index if exists public.inmuebles_features_stratum_idx;   -- = idx_inmuebles_stratum
drop index if exists public.idx_inmuebles_is_active;          -- booleano, ya va en los compuestos
drop index if exists public.idx_inmuebles_opportunity;        -- idem
```

> Antes de tirar cualquier otro, mira su `veces_usado` en la consulta de arriba.
> Un índice con `idx_scan = 0` y varios MB es espacio regalado; uno muy usado es
> lo que sostiene que el listado cargue en 0,5 s.

---

## Paso 3 · Lo que se puede borrar además

### a) Registros de scraping de más de 30 días — coste cero

`scraping_logs` no tiene ninguna retención: cada corrida de cada scraper inserta
una fila con dos campos JSONB (`errors`, `meta`) y nadie las borra nunca. Solo
se consultan para diagnosticar la última corrida.

```sql
-- Primero mirar cuánto hay
select count(*) as filas, min(started_at) as la_mas_vieja
from public.scraping_logs where started_at < now() - interval '30 days';

-- Y borrarlas
delete from public.scraping_logs where started_at < now() - interval '30 days';
```

### b) Avisos muertos que ya no se enseñan en ninguna parte

El Radar filtra siempre por `is_active = true`. Un aviso inactivo que además
lleva meses sin aparecer en el portal no se muestra en ningún sitio.

```sql
-- MIRAR primero: cuántos son y qué ocupan
select count(*) as filas,
       pg_size_pretty(sum(pg_column_size(features))) as solo_el_jsonb
from public.inmuebles
where is_active = false and last_seen_at < now() - interval '90 days';
```

> ⚠️ **No borres esto sin mirar el conteo.** En julio se descartó aplicar la
> «vigencia» justamente porque habría retirado ~88.000 avisos que seguían vivos.
> Si el número que sale aquí es enorme, páralo y lo revisamos: querrá decir que
> los scrapers están marcando inactivo lo que no toca.

```sql
-- Solo si el conteo tiene sentido
delete from public.inmuebles
where is_active = false and last_seen_at < now() - interval '90 days';
```

### c) Historial de precios antiguo

```sql
select count(*) from public.price_history where observed_at < now() - interval '180 days';
delete from public.price_history where observed_at < now() - interval '180 days';
```

> Nota: `price_history.inmueble_id` tiene `on delete cascade`, así que borrar
> avisos en el paso (b) ya se lleva por delante su historial. Haz (b) antes que
> (c) y el conteo de (c) saldrá más pequeño.

### d) Arriendos que ya no están publicados

`rental_listings` solo alimenta la estimación de arriendo, y para eso valen los
avisos vigentes.

```sql
select count(*) from public.rental_listings
where is_active = false and last_seen_at < now() - interval '90 days';

delete from public.rental_listings
where is_active = false and last_seen_at < now() - interval '90 days';
```

---

## Paso 4 · Devolver el disco de verdad

Sin esto, los `DELETE` de arriba no bajan la cuota. De la tabla más pequeña a la
más grande, para ir haciendo sitio:

```sql
vacuum full analyze public.scraping_logs;
vacuum full analyze public.rental_listings;   -- la del recorte: aquí está el premio
vacuum full analyze public.price_history;
vacuum full analyze public.inmuebles;        -- la más grande, la última
```

Cada una bloquea su tabla mientras corre. Con el servicio ya caído, da igual.

Luego volver a correr la consulta del Paso 1 para confirmar que bajó, y revisar
el panel: la restricción suele levantarse sola en la siguiente comprobación, y
si no, hay un botón de restaurar en Settings → Usage.

---

## Paso 5 · La cuenta honesta: el plan gratuito no da

Sumando TODO lo de arriba, sin tocar el catálogo:

| | |
|---|---:|
| Ahora | 1.337 MB |
| − recorte de `rental_listings.features` | −227 MB |
| − índices duplicados de `inmuebles` | −75 MB aprox. |
| − `price_history` de más de 180 días | −20 MB |
| **Mejor caso** | **≈ 1.015 MB** |
| Límite del plan gratuito | 500 MB |
| **Sigue sobrando** | **≈ 515 MB** |

Y esos 515 MB solo pueden salir de `inmuebles` (912 MB), o sea: borrar más de la
mitad del catálogo, o quitarle las descripciones y las fotos. Que es justo lo
que el Radar vende.

**Conclusión: 183.000 inmuebles con fotos y descripciones no caben en 500 MB.**
La limpieza hay que hacerla igual —hay 229 MB de basura pura y 26 índices donde
sobran varios— pero no salva el plan gratuito. Sirve para volver a levantar el
servicio hoy y para que el Pro rinda mucho más.

### Lo que hay que decidir

**A. Plan Pro — ~25 USD/mes, 8 GB.** Con la limpieza hecha arrancas en ~1 GB,
o sea al 12% de la cuota. Es la opción que deja el producto como está.

**B. Plan gratuito + recortar el producto.** Habría que bajar el catálogo a
~60.000 inmuebles y quitar las fotos de las fichas. No lo recomiendo: es
desmontar lo que se vende para ahorrar 25 dólares.

**C. Tarea de retención, en los dos casos.** Aunque vayas al Pro, hoy no hay
NADA que limite el crecimiento: los scrapers insertan y nadie borra. A este
ritmo los 8 GB también se acaban. Una tarea semanal en el cron que haga lo del
Paso 3 automáticamente es una hora de trabajo. Dímelo y la monto.

---

## Lo que ya quedó arreglado en el código

Mientras tanto, el acceso decía **«Correo o contraseña incorrectos»** a gente que
la tenía bien, porque `loginUser` mandaba cualquier fallo de Supabase al mismo
mensaje. Un 402 no es una contraseña mal puesta: ahora se distinguen y el usuario
lee que el servicio no responde y que no es su contraseña. El error real va al
log. Ver `server/auth.ts` y `server/login-servicio-caido.test.ts`.

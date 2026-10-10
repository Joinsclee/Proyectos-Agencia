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

## Paso 2 · Lo que se puede borrar sin que el producto lo note

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

## Paso 3 · Devolver el disco de verdad

Sin esto, los `DELETE` de arriba no bajan la cuota. De la tabla más pequeña a la
más grande, para ir haciendo sitio:

```sql
vacuum full analyze public.scraping_logs;
vacuum full analyze public.price_history;
vacuum full analyze public.rental_listings;
vacuum full analyze public.inmuebles;        -- la más grande, la última
```

Cada una bloquea su tabla mientras corre. Con el servicio ya caído, da igual.

Luego volver a correr la consulta del Paso 1 para confirmar que bajó, y revisar
el panel: la restricción suele levantarse sola en la siguiente comprobación, y
si no, hay un botón de restaurar en Settings → Usage.

---

## Paso 4 · Que no vuelva a pasar

Esto es lo importante, y es una decisión tuya:

**Opción A — plan Pro.** El plan gratuito son 500 MB; el Pro son 8 GB por ~25
USD al mes. Con 169.003 inmuebles cargando fotos y descripciones, 500 MB se
quedan cortos sin remedio: la limpieza de arriba compra semanas, no una
solución.

**Opción B — poner techo al catálogo.** Una tarea de retención en el cron que
cada semana haga lo del Paso 2 automáticamente. El catálogo deja de crecer sin
límite, pero el Radar deja de tener memoria larga del mercado.

Las dos se pueden combinar. Si quieres, monto la tarea de retención: es una hora
de trabajo y evita que esto se repita, vayas o no al plan Pro.

---

## Lo que ya quedó arreglado en el código

Mientras tanto, el acceso decía **«Correo o contraseña incorrectos»** a gente que
la tenía bien, porque `loginUser` mandaba cualquier fallo de Supabase al mismo
mensaje. Un 402 no es una contraseña mal puesta: ahora se distinguen y el usuario
lee que el servicio no responde y que no es su contraseña. El error real va al
log. Ver `server/auth.ts` y `server/login-servicio-caido.test.ts`.

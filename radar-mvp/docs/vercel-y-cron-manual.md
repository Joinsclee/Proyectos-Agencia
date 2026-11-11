# La web en Vercel, el cron a mano

Decidido el 11/11/2026, cuando el host de EasyPanel murió. Sustituye al
despliegue en contenedores descrito en `docs/despliegue-base-nueva.md` para la
parte web; el resto de ese documento (base de datos, correo, OAuth) sigue
vigente.

---

## Por qué el cron no va a Vercel

No es una preferencia, son tres bloqueos medidos:

| | |
|---|---|
| `fincaraiz` tarda **71 minutos** (3.988 s en su última corrida) | El máximo de una función es 300 s en Hobby y 800 s en Pro, 1.800 en beta |
| Los scrapers de BBVA y AVAL necesitan `poppler-utils` por `apt` | En una función no se instalan paquetes de sistema. Sin eso mueren en 3,5 s con `pdfinfo: not found` — ya pasó, doce días sin traer un registro |
| El de remates entra con sesión y Cloudflare | Necesita Chromium de verdad |

Así que el cron se corre **a mano desde el Mac**, donde las tres cosas ya
funcionan. El calendario sigue viviendo en `radar_cron_jobs`, así que el estado
y los cerrojos no cambian.

---

## Desplegar la web en Vercel

El proyecto vive en el subdirectorio `radar-mvp/` de un repo con varios
clientes, así que hay que decírselo a Vercel.

1. **Importar el repo** `Joinsclee/Proyectos-Agencia`, rama
   `claude/radar-supabase-cuota`.
2. **Root Directory**: `radar-mvp`.
3. **Framework Preset**: `Other`. No hay framework: es un servidor `node:http`.
4. Dejar Build Command vacío. No hay build: Vercel compila `api/index.ts` solo.
5. Pegar las variables de entorno (abajo) y desplegar.

`vercel.json` ya fija lo demás: región `iad1` (que es us-east-1, donde está la
base), `maxDuration` 60 s, 1 GB de memoria, los 44 ficheros de `server/public`
dentro del paquete, y el *rewrite* que manda todas las rutas al handler.

### Variables de entorno

Las mismas de `docs/despliegue-base-nueva.md`, con dos diferencias:

- `PORT` **no** se pone. En Vercel no hay puerto.
- `APP_BASE_URL` pasa a ser el dominio de Vercel. Y hay que añadir ese dominio
  en Supabase → Authentication → URL Configuration, o el login con Google
  devuelve a la dirección antigua.

`RADAR_DEMO_DATOS` no se pone (o va a `0`).

### Lo que cambia respecto a un contenedor

Las cachés de ciudad (`engine/zone-comps.ts`) viven en la memoria del proceso.
En un contenedor son **una sola** y se precalientan al arrancar; en Vercel son
**una por instancia** y no hay arranque donde precalentar — importar el módulo
en cada instancia fría para precalentar se cobraría en la primera petición, que
es justo lo que no se quiere.

Efecto práctico: la **primera** ficha de cada ciudad en cada instancia nueva
paga la carga de su pool. Con la base recortada son 1-2 s; con la base inflada
eran 10. Si algún día molesta, la solución es mover esos pools a un Redis
externo (Upstash), no volver a precalentar.

El resto del código no se enteró del cambio: `server/index.ts` exporta
`manejarPeticion` y los dos caminos usan la misma función. `server/entrada-vercel.test.ts`
fija ese contrato.

---

## Correr el cron a mano

```bash
cd "/Users/cristhian/Downloads/Paginas Web/radar-mvp"

npx tsx cron/scheduler.ts --once              # lo que toque según la cadencia
npx tsx cron/scheduler.ts --forzar=motor      # uno concreto, ignorando la cadencia
```

Las cinco tareas y lo que cuestan, medido:

| tarea | cada | dura | qué necesita |
|---|---|---|---|
| `motor` | 1 día | ~41 min | nada especial |
| `fincaraiz` | 7 días | ~66 min | nada especial |
| `bancos` | 7 días | ~7 min | Firecrawl + `poppler-utils` |
| `remates` | 7 días | segundos | sesión viva (ver abajo) |
| `alertas` | 7 días | segundos | Resend configurado |

`poppler-utils` en el Mac: `brew install poppler`.

### La sesión de remates caduca

`remates` lleva en error desde octubre: *«Sesión premium caducada»*. Se arregla
a mano porque hay un reCAPTCHA:

```bash
npx playwright install chromium     # solo la primera vez
npm run remates:login               # abre una ventana; marcas el reCAPTCHA tú
```

Al terminar publica la sesión en `radar_sesiones_scraper`, así que vale para
cualquier sitio desde donde corra el scraper. No hay que copiar ficheros.

### Después de cada corrida

Mirar el tamaño de la base. Es lo que se descuidó en octubre y costó la caída:

```bash
psql "$RADAR_DATABASE_URL" -c "select pg_size_pretty(pg_database_size(current_database()))"
```

Si se acerca a los 500 MB del plan gratuito:
`bash scripts/recuperar-espacio/recortar.sh`.

### La retención corre sola, pero solo si el scrape vio algo

Desde `5b41672`, cada pasada de `npm run scrape:all` borra al final los
inmuebles que ningún portal muestra desde hace 45 días. Eso es lo que impide que
la base vuelva a llenarse: el lifecycle anterior solo marcaba `is_active=false`
y la fila se quedaba para siempre.

Dos cosas que conviene saber antes de tocarlo:

- **Si ningún portal devolvió inmuebles, la purga se salta.** A propósito: con el
  cron parado nadie refresca `last_seen_at`, así que purgar borraría fichas
  vivas. En el log aparece `Ningún portal devolvió inmuebles — saltando la
  retención`; si sale eso, el problema es el scrape, no la retención.
- **Los favoritos de los usuarios no se borran nunca**, aunque lleven un año sin
  verse. Hoy 8 de los 19 favoritos existentes son fichas caducadas que siguen
  ahí por esta regla.

A mano, si hace falta:

```bash
psql "$RADAR_DATABASE_URL" -c "select purgar_inmuebles_caducados(45)"
```

Rechaza menos de 15 días, así que un número mal escrito no vacía la tabla.
Después hace falta `vacuum full analyze inmuebles` para que el espacio vuelva al
disco: borrar no reduce el fichero, solo deja huecos reutilizables.

**Lo que todavía no tiene retención: `rental_listings`** (82 MB, 45.910 de sus
118.407 filas sin verse en 45 días). Si el tamaño vuelve a subir, esa es la
siguiente palanca y son unos 30 MB.

---

## Lo que de verdad tumbó el Radar en noviembre

No fue el host. La base pasó de 402 MB a 1.033 en tres semanas porque los
recortes de `eb533d4` **nunca se desplegaron**: el cron siguió un mes
escribiendo arriendos con 28 claves e inmuebles con 30 fotos. Al pasarse de
cuota, Supabase puso el proyecto en solo-lectura, y entonces ni el Radar podía
guardar un favorito.

La lección operativa: un arreglo que no está desplegado no existe. Comprobar en
los datos, no en el repo:

```sql
-- los arriendos recientes deben traer 6 claves, no 28
select (select count(*) from jsonb_object_keys(features)) as claves
  from rental_listings order by scraped_at desc limit 5;

-- los inmuebles recientes, 6 fotos como máximo
select jsonb_array_length(features->'images') as fotos
  from inmuebles where features ? 'images' order by scraped_at desc limit 5;
```

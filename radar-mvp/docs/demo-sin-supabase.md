# Enseñar el Radar sin Supabase

> **Ya no hace falta para el caso que lo motivó.** La base se recreó el
> 20/10/2026 en el proyecto `aspscrnvukrpuhsinswa` y responde con normalidad:
> `RADAR_DEMO_DATOS` debe estar en `0` o sin poner. Ver
> [scripts/restaurar-base/](../scripts/restaurar-base/README.md).
>
> El modo sigue existiendo y sigue sirviendo para enseñar el producto sin
> depender de que la base esté sana. Las cadenas de conexión de abajo son del
> proyecto viejo, que ya no existe — sustituir por el actual.

Con el proyecto de Supabase restringido por cuota (402 en todo), el Radar
funciona igualmente leyendo un volcado local. Para enseñarlo a un cliente.

```bash
RADAR_DEMO_DATOS=1 npm run serve
```

Y entrar con **cualquier correo y cualquier contraseña**: en modo demo el login
no valida nada y te deja como usuario Pro, con las fichas abiertas.

---

## Desplegarlo en producción (EasyPanel)

El contenedor **no lleva los datos dentro**: los trae de Postgres al arrancar.
La restricción por cuota bloquea la API de Supabase, no la base.

En EasyPanel, en el servicio **web** (no en el del cron), añadir dos variables:

```
RADAR_DEMO_DATOS=1
RADAR_DATABASE_URL=postgresql://postgres.uqlfgnylvnefhyuvtncd:CLAVE@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```

La `@` de la contraseña va como `%40`. El puerto es **5432**, no el 6543 que
enseña el panel por defecto.

Y redesplegar. En el log tiene que salir:

```
[demo] Modo demo: traído de Postgres · portal: 2700 · bancos: 437 · remates: 169 · arriendos: 4954
[server] Modo demo listo: 8260 filas en memoria. Supabase no se va a tocar.
```

Si falta `RADAR_DATABASE_URL`, **el contenedor no arranca** y lo dice. Es a
propósito: arrancar vacío significa descubrirlo delante del cliente, y que no
levante se ve en el panel antes de enseñar nada.

### Para volver a lo normal

Quitar `RADAR_DEMO_DATOS` (o ponerla a `0`) y redesplegar. Nada más: el modo
demo no deja rastro en la base ni toca el camino real. En cuanto Supabase esté
restaurado, el Radar vuelve solo.

### Lo que hay que tener presente mientras esté puesto

- **Cualquiera entra con cualquier contraseña**, como usuario Pro. No hay
  registro ni usuarios reales: la sesión es de mentira.
- **El catálogo es un subconjunto**: 3 ciudades de 162. Quien busque en Cali no
  encuentra nada, aunque el titular diga 181.734 inmuebles (que es la cifra
  real del catálogo completo).
- Nada de lo que se guarde persiste.

Si va a estar accesible al público y no solo en la reunión, conviene decidir si
se pone un aviso de «datos de demostración». Es una decisión de negocio, no
técnica.

---

## Qué funciona y qué no

| | |
|---|---|
| Portada, destacados, buscador | sí |
| Portales · Inmuebles de banco · Remates judiciales | sí |
| Todos los filtros (ciudad, tipo, precio, área, habitaciones, oportunidad) | sí |
| Abrir una ficha, completa y sin candado | sí |
| Análisis de mercado (el −X% con sus comparables) | sí, y en **15 ms** |
| Calculadora de gastos y rentabilidad por arriendo | sí |
| Guardar favoritos | sí, pero se pierden al reiniciar |
| Análisis con IA | **no** — la cuenta de OpenAI está sin saldo, no es por la demo |
| Alertas por correo, pagos, registro | **no** — no hay a dónde escribir |

Las fotos de los inmuebles de banco **no salen a propósito**: viven en Supabase
Storage, que está igual de bloqueado (402, comprobado). El export las deja en
null y el Radar pinta su marcador «ACTIVO DE BANCO», que es un componente real
del producto. Las de portal van por un CDN externo y sí cargan.

---

## Los datos

Tres ciudades, acotado a propósito: el panel de comparables necesita ~20 avisos
del mismo barrio, misma área y mismo estrato para dar un número, y repartir
unos cientos entre 162 ciudades deja todas las fichas sin comparables — justo
lo que más vende.

| | |
|---|---|
| Portales | 900 por ciudad (Bogotá, Medellín, Santa Marta) |
| Inmuebles de banco | 437, todos |
| Remates judiciales | 169, solo audiencias futuras |
| Arriendos | hasta 2.000 por ciudad, para que la rentabilidad tenga comparables |

Las cifras del titular (181.734 avisos, 162 ciudades) son las **reales** del
catálogo, aunque la demo solo lleve una parte cargada: que el número de la
portada mienta se nota.

### Volver a traerlos

El volcado no va al repositorio: son filas reales con direcciones y enlaces de
la fuente. Para regenerarlo:

```bash
RADAR_DATABASE_URL='postgresql://postgres.uqlfgnylvnefhyuvtncd:CLAVE@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' \
  bash scripts/demo/traer-datos.sh
```

Tres cosas que costaron acertar y conviene no volver a descubrir:

- **El puerto es 5432, no el 6543** que enseña el panel por defecto. El 6543 es
  el *transaction pooler*: no mantiene sesión y rompe las consultas largas.
- **No sirve la conexión «directa»** (`db.PROYECTO.supabase.co`): solo publica
  registro AAAA y desde muchas redes no hay ruta IPv6.
- **La `@` de la contraseña va como `%40`.** Es una URI.

Si no quieres pasar la contraseña, el mismo SQL está en
`scripts/demo/exportar-desde-el-panel.sql` para correrlo a mano en el editor
del panel y descargar cinco CSV a `scripts/demo/datos/`.

---

## Cómo está montado

`RADAR_DEMO_DATOS=1` cambia el cliente de Supabase por uno falso
(`server/demo/cliente-falso.ts`) que habla el mismo dialecto de PostgREST sobre
arrays en memoria. **El resto del Radar no se entera**: `server/queries.ts`, el
motor de comparables y las rutas siguen exactamente igual.

Se hizo así y no reimplementando las consultas porque eso habría duplicado la
lógica —los reintentos ante timeout, el conteo cacheado, la exclusión de
preventa, el intercalado de «Todas»— y las dos versiones se habrían separado.

La sesión es un usuario Pro fijo (`server/demo/sesion.ts`), con un solo punto de
entrada: `getUserFromToken` pregunta primero por él y, con el modo apagado,
nunca llega a mirarlo. No hay dos formas de autenticarse conviviendo.

Las escrituras responden «ok» y no tocan nada. Guardar un favorito funciona a la
vista y se pierde al reiniciar.

---

## Antes de enseñarlo

- **No pulses «Análisis con IA»**: la cuenta de OpenAI está sin saldo y da error.
- Si quieres enseñar el −60% más vistoso, está en **Inmuebles de banco → Santa
  Marta**: BBVA, $157.000.000, 82 m², 4 habitaciones, 20 comparables del mismo
  barrio. La calculadora da $2.700.000/mes y 17,6% de rentabilidad neta.
- Los números del análisis de mercado pueden salir algo distintos a los de
  producción en algunas fichas: el conjunto de comparables es la muestra de 900
  por ciudad, no el catálogo entero.

# Propuestas B2B de La Huerta Hotel

Sistema para responder una cotización de eventos corporativos en minutos, con una
propuesta web que además dice **quién la abrió, cuántas veces y hasta dónde leyó**.

Sale de dos audios de Iván del 25/09/2026:

> «Cuando ellos vean el link se va a poder ver la propuesta y las veces que lo abren,
> porque eso nos ayudaría a tener una ventaja estratégica al negociar estos montos grandes.»

> «Podemos dejar unas fotos siempre como las fijas, que sea muy fácil de que las coja […]
> yo me demoré un mundo escogiendo las fotos, mandándolas, subiendo […] si hacemos otro
> lanzamiento de eventos B2B me imagino que llegarán muchísimas cotizaciones y que sea muy
> rápida […] una propuesta así bien elaboradita nos ayuda a cerrarlas.»

Por qué importa, en sus palabras: los eventos B2B «son lo que más nos puede dar
rápidamente», con cotizaciones de 20, 25, 50 y 60 millones, mientras el curso tarda
«dos o tres años» en ser el ingreso principal.

## Ojo con el alcance

Iván dijo **expresamente que esto no era para Adidas** («pero no para esta ocasión»): esa
propuesta ya la mandó en PDF el 24/09. Esto es para **el próximo lanzamiento de eventos
B2B**. La propuesta de Adidas está aquí como ejemplo real y como prueba de que las cuentas
cuadran, no para reenviarla.

## Cómo se hace una propuesta

```bash
cd "Ivan/hotel-propuestas"
cp propuestas/adidas-colombia.json propuestas/nuevo-cliente.json   # y se editan los datos
python3 construir.py nuevo-cliente                                  # → salida/nuevo-cliente.html
```

El script imprime los totales al terminar, para cotejarlos de un vistazo:

```
nuevo-cliente: 37 KB · base $50.580.000 · con experiencias $65.980.000 · $1.200.000 por persona
```

**Ningún total se escribe a mano.** Alojamiento, alimentación, maloca, transporte y
experiencias se suman desde sus filas. En una cotización de cincuenta millones, una suma a
mano es una factura mal hecha. Si las habitaciones no cuadran con el número de personas, el
script avisa.

Las cifras del ejemplo de Adidas coinciden al peso con el PDF que hizo Iván, que es como se
comprobó que el modelo está bien.

## Las fotos ya están resueltas

Las 21 fotos del PDF están extraídas, nombradas por lo que son y **subidas al CDN de la
subcuenta**. No hay que volver a elegirlas ni subirlas nunca:

| Carpeta | Qué es |
|---|---|
| `fotos/` | Los originales sacados del PDF, a máxima calidad. Por si hay que rehacer algo |
| `fotos-cdn.txt` | `nombre\|url` de cada foto ya publicada. Es lo que lee el generador |

Para añadir una foto nueva: súbela al CDN y añade su línea a `fotos-cdn.txt`. Los nombres
son los que usan `hotel.json` y los JSON de cada propuesta.

## Los tres archivos de datos

| Archivo | Qué lleva | Cada cuánto cambia |
|---|---|---|
| `hotel.json` | Lo que nunca cambia: nombre, NIT, RNT, dirección, las cuatro cifras (23 habitaciones, 70 %, 60 en maloca, 90 min), galería y platos | Casi nunca |
| `propuestas/<slug>.json` | Todo lo del cliente: fechas, personas, tarifas, programa día a día, experiencias, condiciones | Una por cotización |
| `config.json` | La conexión a Supabase para el seguimiento | Nunca |

## El seguimiento

Cada propuesta se manda con un enlace por persona:

```
https://…/adidas-colombia.html?t=ana-carolina
```

Ese `?t=` es quien lo recibe. La página registra en Supabase cuándo se abre, cuántas veces,
cuánto rato y **hasta qué sección llega**. Esa última parte es la que da la ventaja: no es
lo mismo que abran y cierren que que se queden tres minutos en el resumen de inversión.

El panel está en `panel.html`: una fila por destinatario, con el estado en una palabra.

| Estado | Qué significa |
|---|---|
| Solo lo abrió | Entró y salió sin bajar |
| Lo está mirando | Volvió, o se quedó un rato, o bajó hasta el fondo |
| **Llegó al precio** | Vio el resumen de inversión y además volvió o se quedó más de tres minutos |

**El cliente no puede ver sus estadísticas.** La propuesta lleva la clave `anon`, que va en
el HTML y por tanto la tiene quien la reciba; el RLS de la tabla solo le deja **insertar**.
Para leer hace falta sesión iniciada, que es lo que pide `panel.html`. Si esto se relajara,
Adidas podría leer las estadísticas de todas las propuestas, las suyas y las de los demás.

El panel usa su **propio** cliente de Supabase. No se le puede dar `signInWithPassword` a un
cliente compartido que también sirva datos: eso ya rompió el RLS del Radar una vez.

Si Supabase no responde, el seguimiento falla en silencio y la propuesta se ve igual. Nunca
se interpone entre el cliente y lo que vino a leer.

## Falta un paso, y es tuyo

La tabla todavía no existe. El CLI de Supabase de esta máquina está autenticado con otra
cuenta y el proyecto de La Huerta (`bevduxusxfwmgtudytax`) no aparece en su lista, así que
la migración hay que aplicarla a mano:

1. Abre el **SQL Editor** del proyecto en Supabase.
2. Pega entero `Ivan/supabase/migrations/20260925000001_propuestas_b2b.sql` y ejecútalo.
3. Crea el usuario de Iván en **Authentication → Users** (el correo con el que entrará al panel).

Mientras no esté, las propuestas se ven perfectas pero no registran nada: la petición
devuelve 404 y el script la descarta.

## Dónde publicar las propuestas

El HTML es un solo archivo y las fotos van por CDN, así que funciona en cualquier sitio.
Dos caminos, y **recomiendo el primero**:

- **Un hosting estático** (Vercel o Netlify) con un subdominio tipo
  `propuestas.lahuertahotel.com.co`. Enlace limpio, un archivo por propuesta, nada más que
  hacer. Para un documento que ve un cliente corporativo, el dominio propio vende.
- **Dentro de GHL**, en un bloque Custom HTML. Funciona, pero hay que renombrar el CSS con
  un prefijo antes: esta página trae estilos de documento completo (`body`, `h1`, `table`)
  y en GHL eso arrasa el resto de la página.

La página lleva `noindex, nofollow`: una propuesta con precios no debe salir en Google.

## Variantes para colegios y universidades

Iván las pidió: «cuando la propuesta sea para colegios, para niños, para universidades, el
salón de evento en diferentes formas». El JSON ya tiene el campo `perfil` (`empresa` hoy).
Falta darle uso: cambiar según el perfil el juego de fotos, las experiencias que se ofrecen
y los textos por defecto. Es el siguiente paso natural cuando haya una cotización de colegio
real con la que probarlo, en vez de inventarse el formato antes de tiempo.

## La identidad no es inventada

Los colores y el aire salen de medir el PDF que Iván ya aprobó: verde `#1c3a2b`, lima
`#a9c346`, terracota `#b8603c`, crema `#f4efe3`. Las tipografías del PDF eran Pagella y
Heros (un Palatino y una Helvetica); en web se usan **Lora** e **Inter**, que mantienen el
carácter y cargan desde Google Fonts.

Dos avisos de contraste, medidos: la lima da **1,98:1 sobre blanco**, así que solo se usa
sobre el verde (6,26:1); y la terracota da 4,4:1, por debajo del mínimo para textos
pequeños, así que las etiquetas usan `--terra-txt` (#9c4a28). Es el mismo error que ya
apareció en las landings de este cliente.

## Detalles que ya están resueltos

- **Impresión.** Al pedir imprimir se fuerzan todas las imágenes: si no, quien imprima a PDF
  sin haber bajado del todo se encuentra huecos en blanco.
- **Móvil.** Las tablas se convierten en fichas: una tabla de cinco columnas con pesos no se
  lee en un teléfono, y una propuesta se abre en el teléfono a menudo.
- **El botón de responder** abre el correo con el asunto puesto, al gerente.

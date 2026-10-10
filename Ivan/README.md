# El Universo de La Huerta LAB

Página privada que reúne las seis herramientas de **Iván Castrillón** (La Huerta LAB —
Yotoco, Lago Calima, Eje Cafetero) detrás de un login, con un asistente que explica cómo
se usa cada una.

Mismo patrón que `Lina Toro/dashboard/universo-lina.html`: **un solo HTML autocontenido**
con las herramientas embebidas en base64 y abiertas dentro de un `<iframe srcdoc>`.

```
Ivan/
├── universo-huerta-lab.html   ← EL ENTREGABLE (500 KB, se abre con doble clic)
├── build.py                   ← re-embebe las 6 herramientas en la página
│
├── MatrizDePermanencia.html      ┐
├── CalculadoraDeFe.html          │
├── SimuladorFincanciero.html     ├─ las herramientas, sin tocar
├── GuiaSimuladorFinanciero.html  │
├── CalculadoraDeCarbono.html     │
├── InformeRetornoProductivo.html ┘
│
├── assets/                    ← imágenes de la página (.jpg) y fuentes (.png)
├── video/huerta-lab-login.mp4 ← vídeo del login (1080×1350, 14 s, 1,7 MB)
├── videos/huerta-lab-login/   ← proyecto HyperFrames que genera ese vídeo
│
├── agente/
│   ├── conocimiento.md        ← LA fuente de verdad del asistente
│   └── sync-kb.py             ← la inyecta en la edge function
└── supabase/                  ← backend OPCIONAL (ver más abajo)
```

---

## Cómo se usa hoy

Abre `universo-huerta-lab.html` con doble clic. Funciona **sin servidor y sin backend**:
te registras, entras y las seis herramientas abren dentro de la página.

El archivo es **autónomo**: las herramientas van embebidas, el póster del login es un
data URI y el vídeo se sirve desde la nube. No depende de ningún archivo suelto.

---

## Pegarlo en GoHighLevel

1. En GHL, añade un elemento **Custom HTML** (o Código Personalizado).
2. Abre `universo-huerta-lab.html` en un editor de texto.
3. Copia **desde el comentario `TODO va dentro de <body> a propósito`** hasta el
   `</div><!-- /.hl-univ -->` del final. Es decir: todo el contenido de `<body>`.
4. Pégalo en el widget y publica.

No hace falta subir nada más: ni imágenes, ni el vídeo, ni fuentes.

### Por qué el archivo está montado así

Cuatro decisiones que solo tienen sentido por GHL, y que conviene no deshacer:

| Decisión | Por qué |
|---|---|
| **El `<style>`, el `@import` de fuentes y los `<script>` de CDN están dentro de `<body>`** | El widget Custom HTML **descarta el `<head>`**. Si los estilos viven ahí, en producción la página sale desnuda aunque en local se vea perfecta. |
| **Todo cuelga de `.hl-univ`** | Los selectores de elemento desnudos (`*`, `h1`, `a`, `button`, `input`) se aplicarían a **toda la página del cliente**, no solo al widget: pisarían el menú, el footer y cualquier otro bloque de GHL. Lo único global que queda es `html,body{overflow-x:hidden}`. |
| **`.full-bleed` usa `width:100vw; margin-left:calc(50% - 50vw)`** | El widget vive en una columna centrada y estrecha. Esta técnica rompe a ancho completo y funciona igual en `static`, `relative` y `sticky` — la variante con `left:50%` desalinea los elementos `sticky`. Además `applyFullBleed()` remide en runtime por si la columna no está centrada. |
| **`reparentOverlays()` mueve los overlays al `<body>`** | `position:fixed` deja de referirse al viewport si un ancestro tiene `transform`, `filter` o `backdrop-filter` — y las secciones de GHL los usan de serie. Sin esto, el visor de herramientas y el chat quedan atrapados dentro de la columna. Al salir se llevan la clase `.hl-univ` puesta para no perder los estilos. |

### Verificarlo antes de pegar

```bash
python3 simular-ghl.py              # columna de 680 px
python3 simular-ghl.py --ancho 420  # columna estrecha
python3 simular-ghl.py --sin-transform
```

Genera `_ghl-preview.html`, que reproduce lo que hace GHL: **tira el `<head>`**, mete el
contenido en una columna centrada y pone `transform` en un ancestro. Ábrelo y compáralo
con el original: si algo se rompe en GHL, se rompe ahí.

### Lo que se comprobó

**234 mediciones con navegador real**: 13 viewports (320 a 1920 px, con apaisados de
740×420 y 844×390) × 6 estados (login, registro, panel, visor, chat, onboarding) ×
3 modos (suelto, columna GHL de 680 px, columna de 420 px). Se buscó: scroll horizontal,
elementos fuera del viewport, texto por debajo de 11,5 px, áreas táctiles menores de
32 px, campos que disparan el zoom de iOS, contenido de overlays inalcanzable, y que la
barra superior se pegue de verdad.

**Resultado final: 0 problemas.**

Lo que se corrigió por el camino, de más grave a menos:

| Problema | Por qué importaba |
|---|---|
| **`overflow-x:hidden` en `body` anulaba todos los `position:sticky`** | La barra superior no se pegaba: al hacer scroll se iba a −360 px. Un `body` con `overflow` distinto de `visible` se convierte en contenedor de scroll y mata el sticky de toda la página. Se cambió a `overflow-x:clip`. |
| **`applyFullBleed()` duplicaba el desfase** | Borraba el estilo inline antes de medir, pero eso no desactiva la regla CSS: medía la posición **ya corregida** y luego la volvía a aplicar. En una columna centrada da 0 y no se nota; en una fila de GHL con padding asimétrico mandaba el login cientos de píxeles fuera. |
| **CSS global** (`*`, `body`, `h1`, `a`, `button`, `input`) | Habría pisado el menú, el footer y el resto de bloques de la página del cliente. Todo pasó a `.hl-univ`, incluidas `text-align`, `letter-spacing` y `text-transform`, que GHL declara en sus propias filas. |
| **La red de seguridad del loader moría con el script que debía rescatar** | Vivía por debajo de `createClient(...)`: si la CSP de GHL bloquea el CDN, esa línea lanza y la red nunca se registraba. Ahora va en su propio `<script>`, con `error` y `unhandledrejection`. |
| **El rail de filtros se apilaba en 3 filas** | Dentro de GHL el widget es estrecho pero **el viewport es ancho**, así que los breakpoints por `max-width` no disparan. Pasó a carril con scroll horizontal, siempre activo. |
| **La tarjeta del onboarding quedaba decapitada** | Con `align-items:center`, lo que desborda por arriba no se alcanza scrolleando. `flex-start` + `margin:auto`. |
| **Los overlays perdían contra el nav de GHL** | z-index de 50–200 no existen en el `<body>` de GHL. Subidos a la banda 2147480000+, por debajo del chat de LeadConnector para no taparlo. |
| **El teclado del móvil tapaba el campo del chat** | El teclado no redimensiona la ventana, encoge el viewport visual. Se mide con `visualViewport` y se pasa a CSS como `--kb`. |
| Zoom de iOS al enfocar cualquier campo | Campos por debajo de 16 px. Cubierto por ancho **y** por puntero grueso: un iPad de 768 px también lo sufre. |
| El botón «atrás» de Android salía del sitio | Ahora cierra la herramienta abierta (`history.pushState` + `popstate`). |
| Áreas táctiles bajo 44 px, textos bajo 11,5 px, contrastes bajo AA | Enlaces del formulario, cerrar del chat, chip de usuario, barra del visor. |
| El Simulador desbordaba 288 px dentro del iframe | Los ítems de grid heredan `min-width:auto` y no encogen: el `overflow-x` de sus tablas nunca se activaba. Se añadió `.hlab .split>*{min-width:0}`. |

Los dos últimos se arreglaron en los archivos fuente de las herramientas, así que después
hay que correr `python3 build.py`.

---

## Las seis herramientas

| Tarjeta | Archivo | Pregunta que responde |
|---|---|---|
| Matriz de Permanencia | `MatrizDePermanencia.html` | ¿Esta finca sirve o me estoy enamorando? |
| La Calculadora del Paso de Fe | `CalculadoraDeFe.html` | ¿Me alcanza para irme a vivir de la finca? |
| Simulador Financiero | `SimuladorFincanciero.html` | ¿Cuánto deja una finca de 2 hectáreas? |
| Guía del Simulador | `GuiaSimuladorFinanciero.html` | No soy de números, ¿por dónde entro? |
| Calculadora de captura de carbono | `CalculadoraDeCarbono.html` | ¿Mi finca captura más de lo que emite? |
| La vía del Retorno Productivo | `InformeRetornoProductivo.html` | ¿Con qué plata llego a la tierra? |

### Cuando edites una herramienta

Edita su archivo suelto y vuelve a embeberla:

```bash
python3 build.py            # embebe las 6 en la página
python3 build.py --check    # solo informa, no escribe
```

`build.py` **no regenera la página**: la lee y sustituye únicamente el base64 de cada
`<script type="text/plain" id="app-…">`. Todo lo demás — diseño, textos, el agente —
sobrevive intacto a un rebuild. (Es el fallo que dejó desincronizado el `build.py` del
Universo de Lina; aquí no puede pasar.)

Las herramientas son fragmentos con namespace (`.mpz`, `.pfz`, `.hlab`…) pensados para
incrustarse. `build.py` les pone un documento HTML alrededor antes de embeberlas.

---

## Branding

Sacado del CSS real de las herramientas de Iván, no inventado:

| | |
|---|---|
| **Verde bosque** | `#12452c` · `#0d3320` (superficies oscuras) |
| **Verde** | `#1f6b45` (acento, botones, tabs activos) |
| **Dorado** | `#d9b458` sobre oscuro · `#a97c1f` sobre claro |
| **Crema** | `#f5f7f3` (fondo) · tinta `#13251c` |
| **Tipografías** | Zilla Slab (títulos) · Source Sans 3 (cuerpo) |

El logotipo es una hoja SVG en línea + wordmark tipográfico: no depende de ningún archivo
de imagen y escala sin perder nitidez. Si Iván tiene un logo propio, se sustituye el
`<svg>` de `.hl-mark .glyph` por su `<img>`.

---

## El asistente Tierra

El botón verde de abajo a la derecha. Está entrenado sobre `agente/conocimiento.md`, que
sale del código real de las seis herramientas: pestañas, campos, umbrales, advertencias.

**Funciona en dos modos:**

- **Sin backend (el de hoy).** La base de conocimiento va embebida en la página. Un motor
  de recuperación en español —normalización de tildes, stemming de plurales, umbral
  proporcional a la pregunta— elige la entrada que responde. Si ninguna llega al umbral,
  dice que no lo tiene confirmado y manda a Skool. **No inventa**, porque no puede.
- **Con backend.** Rellenando `SUPABASE_URL` / `SUPABASE_ANON_KEY` en la página, las
  preguntas van a la edge function `chat-huerta`, que manda la MISMA base de conocimiento
  a `gpt-4o-mini` con `temperature: 0.4`. Entiende preguntas fuera del guion, sigue
  anclado a la misma verdad. Si la función falla, la página cae al motor local sola.

Cuando edites `agente/conocimiento.md`:

```bash
python3 agente/sync-kb.py                    # lo inyecta en la edge function
supabase functions deploy chat-huerta        # y lo despliega
```

Las respuestas del motor local viven en el array `TIERRA_KB` dentro de la página: si
añades una herramienta, añade también su entrada ahí.

---

## Login y registro

Registro con nombre, correo y contraseña (mínimo 8 caracteres), login, y recuperación.

**Hoy funciona sin backend:** las cuentas viven en el `localStorage` del navegador de cada
persona, con la contraseña guardada como SHA-256 + salt aleatorio.

> **Esto es un gating suave, no seguridad de servidor.** Nadie puede leer la contraseña,
> pero cualquiera con acceso a ese navegador puede saltarse el login desde la consola, y
> las cuentas no viajan entre dispositivos. Es la misma decisión que se tomó y se aceptó
> en el embudo de SAVIAS. Sirve para poner orden en la entrada; no para proteger dinero.

**Para cuentas reales**, crea un proyecto de Supabase **propio de Iván** (nunca reutilices
el de otro cliente) y pega sus credenciales en `universo-huerta-lab.html`:

```js
const SUPABASE_URL      = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';   // la ANON, nunca la service_role
```

Con eso, el mismo formulario pasa a `signUp` / `signInWithPassword` / `resetPasswordForEmail`
sin tocar una línea más, y el chat empieza a usar la edge function.

> **Usa siempre la clave ANON.** Un `signInWithPassword` sobre un cliente `service_role`
> compartido rompe RLS para todos los usuarios a la vez — ya pasó en el Radar.

Luego, en el proyecto de Supabase:

```bash
supabase db push                              # crea las tablas del chat con RLS
supabase secrets set OPENAI_API_KEY=sk-...
python3 agente/sync-kb.py
supabase functions deploy chat-huerta
```

---

## El vídeo del login

1080×1350, 14 s, sin audio, en bucle. **Ya está subido a la nube** y la página apunta ahí:

```
https://assets.cdn.filesafe.space/Np6qnux1pM5NRF9JY3lh/media/6a8cb3b34ee4e7911df09b71.mp4
```

La constante es `HERO_VIDEO_URL`. La copia local queda en `video/huerta-lab-login.mp4` y
el proyecto que lo genera, en `videos/huerta-lab-login/`.

```bash
cd videos/huerta-lab-login
python3 build-index.py          # incrusta las fuentes (base64) en index.html
npx hyperframes@0.8.12 check    # lint + layout + motion + contraste
npx hyperframes@0.8.12 render -o renders/huerta-lab-login.mp4 -f 30 -q high -w 2
```

Después se recomprime para web (el render sale a 19 MB):

```bash
ffmpeg -y -i renders/huerta-lab-login.mp4 -an -c:v libx264 -crf 27 -preset slow \
  -pix_fmt yuv420p -movflags +faststart -g 60 ../../video/huerta-lab-login.mp4
```

Notas de mantenimiento:

- **Edita `src/index.template.html`, no `index.html`.** El segundo lo genera
  `build-index.py` incrustando las fuentes; se sobrescribe en cada build.
- Las fuentes van **embebidas en base64** a propósito: si Google Fonts no responde durante
  la captura, los fotogramas saldrían con la tipografía del sistema.
- El proyecto pinea `hyperframes@0.8.12`. El CLI avisa de una 0.8.13 que **no está
  publicada en npm** (`npm error notarget`); no subas el pin hasta que exista de verdad.
- El vídeo lleva su propio titular, así que el hero de la página **no repite el mensaje**:
  el lado izquierdo es marca, el derecho es el formulario. Si cambias el guion del vídeo,
  revisa que no vuelva a chocar.
- En móvil (≤1024 px) el hero se oculta: el vídeo es 4:5 y su texto, recortado a una
  franja horizontal, saldría cortado.

---

## Botón de Skool

Va a `https://www.skool.com/la-huerta-lab`, en la constante `SKOOL_URL`. Aparece como FAB
blanco abajo a la derecha y como entrada del menú de usuario.

---

## Lo que esta página NO hace

- **No verifica la membresía de Skool.** El Universo de Lina consulta la comunidad antes de
  dejar entrar; aquí cualquiera puede registrarse. Si Iván quiere puerta cerrada, hay que
  portar la edge function `skool-login` del proyecto de Lina.
- **No sincroniza los datos entre dispositivos.** Cada herramienta guarda en el
  `localStorage` de ese navegador — es su comportamiento original y no se tocó.
- **No hay planes ni niveles.** Las seis herramientas son visibles para todo el que entre.

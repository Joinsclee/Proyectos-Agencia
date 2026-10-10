# Embudo The Betts AI

Agente de IA para WhatsApp · Método RCA. Embudo completo listo para montar en el
GoHighLevel del cliente.

Copy aprobado en el documento del cliente, con las correcciones de revisión de
Cristian Vega y Johnatan Quintero ya aplicadas.

## El flujo

```
  Anuncios (Meta)
        │
        ├──► 01-Landing-Corta.html   ◄── test A/B ──►   02-Landing-Larga.html
        │      PUV + VSL + botón                          copy completo + VSL
        │                    │                    │
        │                    └──────────┬─────────┘
        │                               ▼
        │                      03-Formulario.html
        │                      17 preguntas, 4 pasos
        │                               │
        │            ┌──────────────────┼──────────────────┐
        │            ▼                  ▼                  ▼
        │      05-Salida-A.html   06-Salida-B.html   pantalla final
        │      quiere hacerlo     puede, no ahora     + calendario
        │      él / no contrata                             │
        │      (sin conversión)   (sin conversión)          ▼
        │                                            04-Gracias.html
        │                                            VSL de 5 min
        │                                                   │
        └───────────────────────────────────────────────────┘
                                                            ▼
                                          E1 a E5 · correos + WhatsApp
                                    (Automatizaciones-Correos-y-WhatsApp.md)
```

## Archivos

| Archivo | Qué es |
|---|---|
| `01-Landing-Corta.html` | Variante A: propuesta única de valor, video y botón. Nada más |
| `02-Landing-Larga.html` | Variante B: el copy completo |
| `03-Formulario.html` | Aplicación multi-paso con la lógica de calificación |
| `04-Gracias.html` | Post-agendamiento. Sin CTAs ni enlaces salientes, a propósito |
| `05-Salida-A.html` | Descalificado por intención: quiere montarlo él, o no contrata |
| `06-Salida-B.html` | Descalificado por momento: puede, pero no ahora |
| `Automatizaciones-Correos-y-WhatsApp.md` | E1 a E5, etiquetas de CRM y configuración de GHL |
| `_design-system.html` | El CSS compartido por las 6 páginas. Referencia, no se publica |
| `_instrucciones-build.md` | Contrato de construcción. Referencia, no se publica |

## Cómo se monta en GoHighLevel

Cada archivo es autónomo: se abre con doble clic para revisarlo, y se publica
copiando el contenido del `<body>` en un widget **Custom HTML**.

GHL descarta el `<head>`, así que todo el CSS, el `@import` de las fuentes y
todo el JavaScript están **dentro del `<body>`**. El `<head>` de los archivos
existe solo para poder abrirlos en local; se puede tirar sin que nada cambie.

Antes de publicar hay que sustituir los enlaces pendientes. Están todos juntos
en un bloque de comentario al principio de cada página y marcados como
`#TODO-ALGO` en los `href`, así que se encuentran con:

```bash
grep -rn 'TODO-' "The Betts AI"/*.html
```

## Qué falta, y de quién depende

Nada de esto bloquea el montaje: las páginas funcionan con los huecos marcados.

**De John / el cliente**

1. **Los dos VSL.** El de la landing (7:30 a 8:00 min) y el de gracias (5:00 a
   5:30). Los guiones completos están en el documento. El hueco del reproductor
   ya está en las páginas.
2. **Testimonios reales.** Ahora hay tres placeholders con el texto del
   documento. Aparecen en la landing larga y en la página de gracias: cuando
   lleguen los reales hay que actualizar **las dos a la vez**.
3. **Un caso real para la demo de conversación.** Lo pidió Cristian en el
   documento: un ida y vuelta real, compacto, que se distinga de un bot básico.
   Ahora está el ejemplo genérico del copy.
4. **Prueba social.** La nota del documento lo dice sin rodeos: es lo que más le
   falta a la página. Cuando haya números (agentes instalados, volumen
   gestionado, un antes y después de tiempo de respuesta), entra una sección
   entre el Método RCA y las diferencias.
5. **Logo.** Ahora mismo la marca es puramente tipográfica sobre la paleta del
   documento.

**Decisiones de negocio pendientes**

6. **El plazo de instalación.** El copy dice 14 días en la landing, en la FAQ y
   en los dos VSL. Si el plazo real es otro, hay que cambiarlo en los cuatro
   sitios.
7. **Rango de precio en la FAQ.** Ahora responde que depende del volumen y que
   se ve en el diagnóstico. Si se decide dar un rango, es una sola línea.

Lo que ya **no** está pendiente: la escasez de 5 diagnósticos por semana se
sostiene. El hilo quedó resuelto en el documento con el visto bueno de Johnatan.

**Configuración**

8. Webhook entrante de GHL para el formulario, calendario de 30 minutos, y el
   evento de conversión en la pantalla final. Detalle en
   `Automatizaciones-Correos-y-WhatsApp.md`.

## El test A/B

Las dos landings comparten copy de hero, botón y destino. La única variable es
cuánto se lee antes de decidir:

- **Corta:** propuesta de valor, video, botón. Se agenda solo después de ver el
  VSL, sin nada más que leer.
- **Larga:** el argumento completo, con el video arriba.

Para que el test signifique algo, las dos tienen que apuntar al mismo formulario
y disparar el mismo evento de conversión. Ya está así.

El documento propone además un segundo test, sobre el titular: la propuesta de
valor actual contra la variante de tiempo, «En 14 días tu WhatsApp deja de ser
un cuello de botella». Ese va después, y de uno en uno.

## Correcciones de revisión aplicadas

| Dónde | Qué se hizo | Quién lo pidió |
|---|---|---|
| Hero | Fuera «y sin contratar a otro humano para que lo opere» | Cristian, con el visto bueno de Johnatan |
| Así se ve en acción | «pregunta lo correcto» pasa a «pregunta coherentemente» | Cristian |
| Así se ve en acción | Fuera los 3 bullets: redundaban con los tres cuellos de botella | Cristian |
| Lo que no hace | Sección eliminada. En su hueco van los testimonios | Cristian |
| El diagnóstico | La escasez se mantiene, sin marcador de pendiente | Johnatan |
| Landing larga | Dos CTAs intermedios nuevos | nota del documento |
| Guion del VSL | «las veinticuatro» pasa a «las 24 horas» | Johnatan |

## Decisiones de craft

Cosas que se apartan del documento sin tocar el mensaje. Todas son reversibles.

- **Los kickers del documento no se pintan todos.** Traía uno por sección; se
  conservan como mucho tres por página y ninguno encima del titular del hero.
  Un kicker por sección se lee como plantilla.
- **Sin rayas largas en el texto visible.** El documento usa la raya espaciada
  como inciso, que en español no es correcta: se sustituyó por coma, dos puntos
  o paréntesis según el caso. No cambia ninguna frase.
- **El titular del hero no va a tamaño display.** Tiene 28 palabras: a 72px
  ocuparía cinco líneas. Va a tamaño editorial con las tres acciones del Método
  RCA destacadas en color, que da jerarquía sin quitar una palabra.
- **Las dos landings comparten el hero, en una sola columna.** La larga se probó
  con el hero partido en dos, titular a la izquierda y video a la derecha, y no
  funciona: la columna de texto se queda en 476px y ese titular cae en ocho
  líneas. Apilado, el titular respira y el video, que es el activo del embudo,
  se ve al tamaño que merece. Como efecto secundario el test A/B queda más
  limpio: compara lo que hay debajo del video, no dos heros distintos.
- **Los tres cuellos de botella no son tres tarjetas con icono.** Son filas
  separadas por línea fina. Tres tarjetas iguales con un icono encima es el
  patrón más reconocible de página generada.
- **La demo de conversación no imita la interfaz de WhatsApp.** Es una
  transcripción con estilo propio, etiquetada como ejemplo. Un pantallazo falso
  se nota y resta credibilidad justo donde se está pidiendo confianza.
- **La numeración `1 ·`, `2 ·` de los títulos del documento es interna** y no
  aparece en pantalla. La única numeración visible es la de «Qué pasa después»,
  porque ahí sí es una secuencia.
- **Las medidas de columna van en píxeles, no en `ch`.** Un `ch` escala con el
  tamaño de fuente del elemento, así que el mismo `66ch` daba 628px en un
  párrafo de 17px y 813px en una entradilla de 22px, y `20ch` en un titular de
  40px daba 514px. El resultado eran elementos de la misma columna con anchos
  que no casaban y seis titulares más estrechos que el párrafo que llevaban
  debajo, que se lee como fallo de composición y no como jerarquía. Ahora hay
  dos medidas fijas en el sistema, `--measure` (640px, cuerpo y entradillas) y
  `--measure-head` (760px, titulares), y un titular nunca queda por debajo del
  cuerpo. Si tocas anchos en GoHighLevel, usa esas dos variables.

## Marca

Paleta del documento, sin añadidos:

| Rol | Color | Contraste sobre el fondo |
|---|---|---|
| Fondo | `#0B1220` | |
| Superficie | `#16213C` | |
| Texto | `#E8EEF9` | 16.1:1 |
| Secundario | `#9FB0CC` | 8.6:1 |
| Acento | `#19C37D` | 8.2:1 |
| Menta | `#7FF0D2` | detalle |

Tipografía: Bricolage Grotesque para titulares, Hanken Grotesk para el texto.
Ambas desde Google Fonts, como fuente variable.

El verde se usa solo donde hay que actuar: botones y dos o tres palabras por
página. Es el color de una empresa de WhatsApp y satura rápido si se reparte por
todas partes.

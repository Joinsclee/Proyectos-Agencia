# Automatizaciones · The Betts AI

Secuencia post-agendamiento lista para cargar en GoHighLevel. Copy tomado del
documento aprobado, sección «Mensajes WA + Correos».

La sección «Correos anteriores» del documento **no se usa**: quedó descartada en
el brief. Se conserva aquí solo la nota de qué se rescató de ella, más abajo.

## Cronograma

| # | Momento | Canal | Asunto | Trabajo que hace |
|---|---|---|---|---|
| E1 | Minuto 0 | Email + WhatsApp | Reservado. Falta un paso | Confirmación activa y rescate al video |
| E2 | +48h *(solo si faltan más de 72h)* | Email + WhatsApp | Escríbenos a las tres de la mañana | Demo en vivo, mata la objeción «se nota que es un bot» |
| E3 | T-24h | Email + WhatsApp | Dos números para mañana | Preparación y honestidad sobre la venta |
| E4 | T-2h (email) · T-30min (WhatsApp) | Email + WhatsApp | En dos horas | Solo el enlace |
| E5 | T+10min (WhatsApp) · T+20min (email) | Email + WhatsApp | Te esperamos veinte minutos | Reagendar o cerrar limpio |

Reserva a menos de 72h: se salta E2, quedan 3 correos. Reserva a más de 72h:
entran los 4.

Lo que **no** hay, y es deliberado: nada de «última oportunidad», ningún quinto
recordatorio, ninguna secuencia de nurturing post-sesión aquí. Sobre un lead que
ya agendó, cada correo de más baja la apertura del siguiente, que es justo el
que necesitas que abra.

## Variables de GoHighLevel

```
{{contact.first_name}}
{{appointment.start_time}}
{{appointment.timezone}}
{{appointment.meeting_link}}
```

Enlaces que hay que sustituir antes de activar:

- `[ENLACE WHATSAPP]` · el `wa.me` del número del negocio
- `[ENLACE PÁGINA DE GRACIAS]` · la URL pública de `04-Gracias.html`
- `[ENLACE REAGENDAR]` · el calendario de GHL

---

## E1 · Confirmación (minuto 0)

**Asunto:** Reservado. Falta un paso
*(alternativas para test: «Tu sesión, y lo que falta» · «Antes de que se te olvide»)*

**Preheader:** Respóndenos al WhatsApp y queda cerrada

```
Hola {{contact.first_name}},

Ya tienes tu hueco reservado. Este es el detalle:

Fecha y hora: {{appointment.start_time}} ({{appointment.timezone}})
Duración: 30 minutos
Google Meet: {{appointment.meeting_link}}

Añádelo a tu calendario ahora, con recordatorio. No dentro de un rato.

Y falta una cosa.

Te acabamos de escribir por WhatsApp. Respóndenos con una palabra y tu sesión
queda confirmada.

Te explico por qué te lo pedimos, porque no es un trámite. Solo tomamos 5
sesiones por semana y las hacemos nosotros. Cada hueco que se queda vacío es un
negocio que se quedó sin él. Con que respondas, sabemos que cuentas con ello.

Y hay una segunda razón, más egoísta por nuestra parte: así ya estamos hablando
por WhatsApp. Que es exactamente el canal donde vamos a trabajar.

Antes de la sesión miramos tu web, tus redes y todo lo que nos contaste en el
formulario. Llegamos con deberes hechos, y esos 30 minutos son de trabajo, no de
presentaciones.

→ Responde al WhatsApp para confirmar: [ENLACE WHATSAPP]

John Betts
The Betts AI

PD: En la página de gracias te dejamos un video de 5 minutos con lo que vamos a
hacer en la sesión y cómo prepararte. Si lo cerraste sin verlo, ábrelo aquí:
[ENLACE PÁGINA DE GRACIAS]
```

**WhatsApp espejo E1** (mismo minuto):

```
Hola {{contact.first_name}}, soy John de The Betts AI 👋

Tu sesión queda reservada para el {{appointment.start_time}}.

Respóndeme aquí con un "confirmo" y la cierro. Solo tomamos 5 a la semana y
prefiero no dejar un hueco muerto.

Si te surge algo antes, me escribes por aquí y la movemos. Sin problema.
```

---

## E2 · Condicional (48h después de agendar, solo si faltan más de 72h)

**Asunto:** Escríbenos a las tres de la mañana
**Preheader:** Es la mejor demo que te podemos dar

```
Hola {{contact.first_name}},

Todavía quedan unos días para tu sesión, así que te propongo algo.

Escríbenos al WhatsApp. A la hora que quieras. Un martes a las tres de la
mañana, un domingo, cuando se te ocurra.

Lo que te va a contestar en menos de 60 segundos no es una persona. Es
exactamente lo que instalamos en los negocios de nuestros clientes.

Te lo digo porque casi todo el mundo llega a la sesión con la misma duda de
fondo: "sí, pero se va a notar que es un bot". Y esa duda no se resuelve
explicándola. Se resuelve usándolo.

Fíjate en tres cosas mientras conversas: cuánto tarda, qué te pregunta antes de
darte una respuesta, y en qué momento decide pasarte a un humano.

Eso último es lo que casi nadie hace bien, y es la diferencia entre un agente
que vende y uno que estorba.

Cuando lo hayas probado, ven a la sesión con la pregunta que te haya quedado.
Esa es la buena.

→ Pruébalo ahora: [ENLACE WHATSAPP]

John Betts
The Betts AI

PD: Mañana te mando lo que necesitas tener a mano el día de la sesión. Son dos
números, nada más.
```

**WhatsApp espejo E2:**

```
{{contact.first_name}}, una cosa antes de vernos.

Si quieres ver cómo trabaja el agente, escríbeme por aquí a cualquier hora.
Incluso de madrugada.

Lo que te conteste en menos de 60 segundos es lo mismo que instalamos en los
negocios de nuestros clientes 👀

Es mejor demo que cualquier cosa que te pueda enseñar en pantalla.
```

---

## E3 · Preparación (T-24 horas)

**Asunto:** Dos números para mañana
**Preheader:** Sin ellos, el diagnóstico se queda en teoría

```
Hola {{contact.first_name}},

Mañana nos vemos: {{appointment.start_time}} ({{appointment.timezone}}).
Google Meet: {{appointment.meeting_link}}

Antes, dos números. Aproximados sirven, no busques el dato exacto:

1. Cuántas conversaciones nuevas te entran por WhatsApp a la semana.
2. Cuánto vale de media un cliente para ti.

Con esos dos, en los primeros diez minutos vas a ver la cifra de lo que se te
está escapando cada mes por responder tarde. Con tus números, no con ejemplos.
Sin ellos, la sesión se queda en teoría bonita y no te sirve de nada.

Y trae una tercera cosa: el móvil con el WhatsApp del negocio abierto. Vamos a
mirar conversaciones reales tuyas. Si puedes compartir pantalla, mejor.

Un aviso más, porque prefiero decirlo hoy y no mañana: al final de los 30
minutos te vamos a dar un precio y te vamos a proponer trabajar juntos. Es una
llamada de venta y no te vamos a hacer el paripé de que no lo es.

La diferencia es que el diagnóstico y el diseño de tu agente son tuyos, decidas
lo que decidas. Si te vas y lo montas con otro, te llevas igual el trabajo de
esos 30 minutos.

→ Respóndeme a este correo con tus dos números y llego con ellos ya mirados.

John Betts
The Betts AI

PD: Si la decisión no depende solo de ti, trae a esa persona. Es la diferencia
entre salir con una decisión y salir con un "lo tengo que consultar".
```

**WhatsApp espejo E3:**

```
{{contact.first_name}}, mañana nos vemos a las {{appointment.start_time}} 📅

Ven con dos números en la cabeza:
- Conversaciones nuevas por WhatsApp a la semana
- Cuánto vale de media un cliente para ti

Aproximados valen. Son los que usamos para calcular lo que se te está escapando.

Y ten el móvil a mano con el WhatsApp del negocio abierto, que vamos a mirar
conversaciones tuyas reales.

Si me los pasas por aquí, llego con ellos mirados 👇
```

---

## E4 · Es ahora (T-2 horas)

**Asunto:** En dos horas
*(alternativas: «Tu sesión, hoy» · «Aquí tienes el enlace»)*

**Preheader:** Busca un sitio tranquilo y el móvil a mano

```
{{contact.first_name}}, nos vemos en un par de horas.

{{appointment.start_time}} ({{appointment.timezone}})

→ Entra aquí: {{appointment.meeting_link}}

Tres cosas y te dejo:

Un sitio tranquilo. Nada de conducir.
El móvil con el WhatsApp del negocio abierto.
Tus dos números: conversaciones a la semana y valor medio de cliente.

Si te ha surgido algo y no puedes, respóndeme y la movemos. Lo único que no
podemos es bloquear una hora que otro negocio necesitaba.

Ahora nos vemos.

John Betts
The Betts AI
```

**WhatsApp espejo E4** (T-30 min, no T-2h):

```
{{contact.first_name}}, en 30 minutos 🙌

Enlace: {{appointment.meeting_link}}

Móvil a mano con el WhatsApp del negocio abierto. Nos vemos.
```

---

## E5 · Rescate de no-show (T+20 minutos, solo si no se presentó)

**Asunto:** Te esperamos veinte minutos
**Preheader:** Sin reproche. Solo dime si sigue interesándote

```
Hola {{contact.first_name}},

Estuvimos en la sala. No apareciste.

No pasa nada, en serio. Sé perfectamente cómo es tu día: es exactamente el
problema que veníamos a resolver. Algo entró, alguien escribió, y la agenda se
fue al suelo.

Pero te escribo por una razón concreta.

Ya habíamos mirado tu web, tus redes y lo que nos contaste en el formulario. Ese
trabajo está hecho y no se pierde si reagendamos esta semana. Si lo dejamos
pasar un mes, empezamos de cero.

Así que dime una de dos cosas:

Si sigue interesándote, coge otro hueco aquí abajo y lo retomamos donde
estábamos.

Y si ya no, respóndeme "ahora no" y te dejo tranquilo. Sin secuencias, sin
insistir. Prefiero eso a mandarte recordatorios durante tres semanas.

Lo que no te recomiendo es no hacer ninguna de las dos. Porque mañana vas a
recibir los mismos mensajes, a las mismas horas incómodas.

→ Coge otro hueco: [ENLACE REAGENDAR]

John Betts
The Betts AI
```

**WhatsApp espejo E5** (T+10 min, antes que el email):

```
{{contact.first_name}}, estamos en la sala por si andabas liado 👋

Si se te complicó, sin problema: dime y buscamos otro hueco esta misma semana.

Y si ya no te interesa, me lo dices y no te molesto más. Sin dramas.
```

---

## Etiquetas de CRM que hay que crear en GHL

| Etiqueta | Se aplica cuando | Para qué |
|---|---|---|
| `agendado` | pantalla final del formulario | dispara la secuencia E1 a E5 |
| `zona-gris-90d` | P14 = «en 2 o 3 meses» | califica, pero el equipo lo sabe antes de la llamada |
| `no-ahora-90d` | salida B del formulario | secuencia de nurturing a 90 días, fuera de esta secuencia |
| `descartado-diy` | salida A del formulario | no entra en ninguna secuencia comercial |
| `no-show` | no asistió | dispara E5 |
| `confirmado-wa` | respondió al WhatsApp de E1 | mide la tasa de confirmación real |

## Configuración pendiente en GHL

1. Conectar el webhook entrante que recibe el POST de `03-Formulario.html` y
   mapear los 17 campos a campos personalizados del contacto.
2. Crear el calendario de 30 minutos y traer su embed a la pantalla final del
   formulario.
3. El evento de conversión (Schedule / Lead cualificado) se dispara **solo** en
   la pantalla final con calendario, vía Conversions API. Las salidas A y B no
   disparan nada.
4. La condición de E2 («solo si faltan más de 72h») se monta con un paso de
   espera y una bifurcación por fecha de la cita.

## Qué se rescató de «Correos anteriores»

De la versión antigua solo sobrevive el bloque de preparación: pedir al lead que
llegue con el número de leads que recibe al mes y su porcentaje de conversión.
Esa idea ya está en E3, mejor formulada y reducida a dos números en vez de tres
datos. El resto de aquella secuencia queda fuera: usaba «Diagnóstico de Fuga de
Leads» como nombre de la oferta, y el copy nuevo lo llama diagnóstico a secas.
Si se quiere recuperar aquel nombre, hay que cambiarlo también en las páginas.

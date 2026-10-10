# ADS · Llamada de claridad (22/09/2026)

Dos anuncios verticales para Meta, montados con `montaje-vertical-clee` desde las
tomas que subió el cliente a Drive (`ADS llamadas`, carpeta `18gK1xPEuJ_...`).
Destino de la campaña: **la agenda de llamadas**,
`https://link.cleesaas.com/widget/booking/7DEVRIcua9bXqeVaBTAc` (o la página
`Ivan/AgendamientoCopy.html` cuando esté publicada en GHL).

| Pieza | Duración | Ángulo | Gancho en pantalla |
|---|---:|---|---|
| `llamadas-01` | 52,8 s | La sabiduría es preguntar antes de gastar. Resuelve: no sé si el online encaja, si me conviene ir cuatro días, cómo se paga. | «Pregunta antes de gastar» |
| `llamadas-02` | 53,1 s | Quien busca finca se enamora de la vista y se salta las preguntas caras: agua, suelo en verano, qué producir y para quién. | «No te enamores de la vista» |
| `llamadas-03` | 58,7 s | La finca ya comprada y trancada: en vez de sumar otra tarea, mirar el proyecto completo. | «La finca ya es tuya y sigue trancada» |
| `llamadas-04` | 43,0 s | Decidir en pareja o con un socio: qué espera cada uno, quién estará allí, qué inversión aguantan. | «El campo se decide de a dos» |
| `llamadas-05` | 52,1 s | La diferencia real entre el online y el Campo Escuela, con las fechas del presencial. | «Online o Campo Escuela: la diferencia» |
| `llamadas-06` | 37,4 s | Recorrido del mapa de La Huerta: dónde está cada cosa en una finca que funciona. | «Así está repartida una finca que funciona» |

**Entregas:** `sistema/entrega/llamadas-0{1..6}.mp4` (1080×1920, 25 fps, −14,3 LUFS)
y sus pósters. En Drive, carpeta **ADS llamada de claridad (22-09)** dentro de la
carpeta de entregas de la campaña.

## Qué lleva cada anuncio

Reencuadres A (abierto), B (medio) y C (cerrado) calculados sobre la posición real
de la cara en cada toma, b-roll de la finca ya usado en la tanda anterior, ficha de
datos, plano del móvil con la agenda real grabada de la página, y la cartela de
cierre común a las dos piezas («Elige tu horario»).

Subtítulos quemados desde whisper, con la tabla de correcciones del
`proyecto.json` (mayúsculas, puntuación, «Campo Escuela de La Huerta LAB» y el
«sé lo fácil que es» del anuncio 2, que whisper oía como «es»).

## Revisión

Las seis pasan `revision.py` (la puerta de `edicion-humana-clee`) **sin bloqueantes
y sin avisos**. En el primer intento bloqueó: el gancho y la pastilla caían sobre
la cara de Iván, que en estas tomas está más alta que en la tanda anterior. Las
tarjetas se bajaron a `top:250` (gancho, por encima de la cabeza) y `top:780`
(pastilla, sobre el pecho).

## Datos que se proyectan, y su fuente

Solo la fecha de cierre, «Inscripciones hasta el 24 de septiembre, 23:59», que es
lo que publica la página de agendamiento. **No hay precios ni cupos** en pantalla:
siguen sin confirmar y la llamada existe precisamente para hablar de eso.

## Los brutos ya no están en local

Se borraron el 25/09 al liberar disco (`ads-venta/brutos`, 712 MB). Siguen en Drive,
carpeta `ADS llamadas` (`18gK1xPEuJ_...`). Las seis piezas entregadas y sus pósters
están intactos en `sistema/entrega/`; solo hace falta volver a bajar los brutos si hay
que **re-montar desde cero**, no para retocar textos o tarjetas.

## Si hay que rehacer algo

```bash
cd "Ivan/ads-venta/llamadas/sistema"
python3 ~/.claude/skills/montaje-vertical-clee/scripts/validar.py
python3 ~/.claude/skills/montaje-vertical-clee/scripts/subtitulos.py llamadas-01
bash _montar-lote.sh          # montar + rótulos + componer, las dos piezas
bash _rehacer-tarjetas.sh     # solo rótulos + componer + revisión (cambios de texto)
```

La cola de `trabajo/llamadas-01-palabras.json` está corregida a mano: whisper la
estiraba hasta el segundo 54,20 en un audio de 52,84 s y ningún corte final era
válido. El original está en `.whisper-crudo`.

## Lo que cambió tras la revisión de Codex (22/09)

- **Fuera el mockup con precio.** El de la oferta completa dice «TODO POR USD 370 · pago
  único», y esta campaña no anuncia precio: la llamada existe para hablar de eso. Se
  sustituyó por b-roll de la finca en las piezas 01, 02 y 03.
- **Cartela de cierre más corta.** Antes pedía leer marca, nombre, dos beneficios, fecha y
  botón en poco más de dos segundos. Ahora: «¿Online o Campo Escuela presencial? / Si
  ninguna encaja, te lo decimos / ELIGE TU HORARIO». La fecha se queda en su ficha.
- **Resaltado por argumento, no por vocabulario:** «gastar dinero», «ninguna», «firmar»,
  «suelo», «elegir».

Dos cosas que Codex marcó y que están en la locución, no en el montaje: en el 02, «cuéntanos
el precio que estás evaluando» se puede entender como asesoría sobre el precio del terreno; y
el gancho del 01 («hay una palabra que me gusta mucho: sabiduría») habla del presentador
antes que del problema de quien mira. Las dos piden regrabar o recortar, y quedan a decisión
de Cristhian e Iván.

## Variantes cortas propuestas (sin montar)

- **01, ~15,3 s:** 27,81-30,82 + 35,83-43,01 + 47,22-52,30, con gancho escrito «¿Online o presencial?».
- **02, ~15,2 s:** 9,92-17,10 + 22,40-24,68 + 35,72-38,00 + cartela de 3,5 s.

# Efectos de sonido

## De dónde salen

**Mixkit**, servidos por CDN público. Se descargan con:

    https://assets.mixkit.co/active_storage/sfx/<id>/<id>-preview.mp3

`catalogo-mixkit.json` tiene 128 efectos con su id y su nombre, sacados de las
categorías whoosh, impact, transition y click. Para ampliarlo, bajar la página
de la categoría y extraer los `data-audio-player-item-id-value`.

## La licencia sirve, y está comprobada

De la **Sound Effects Free License** de Mixkit, textual:

> Sound Effects under the Free license can be used in […] **Online marketing
> ads** […] Commercial projects […]
> Items under the Mixkit Sound Effects Free License can be used in your
> commercial and non-commercial projects **for free**.
> You can't redistribute the Item on its own, as stock, in a tool or template.

Es decir: vale para un anuncio pagado de Meta, sin atribución. Lo único
prohibido es revender el sonido suelto.

**Ojo con no confundirla con las otras licencias de Mixkit.** La *Stock Video
Restricted License* de la misma página dice literalmente `Advertising: Not
Allowed`. Son licencias distintas por tipo de archivo.

## Lo que se descartó, y por qué

La primera versión llevaba efectos **sintetizados** con ffmpeg: ruido filtrado
para los whooshes, senos con caída para los impactos. Están en
`_descartado/sfx-sintetizados/`. El cliente los rechazó y tenía razón: suenan a
sintetizados, porque lo eran.

Se hicieron así porque las librerías que había a mano no servían —`@remotion/sfx`
son 32 memes, y `hyperframes-audio` es un skill de mezcla, no una librería— pero
eso explica la decisión, no la justifica. La salida era buscar fuera, y es lo que
había que haber hecho desde el principio.

## Lo que enseñó medirlos

Margen de cada efecto contra la banda de la voz (1-3 kHz), en dB. Cuanto más
alto, menos compite con lo que se dice:

| libres | | invaden | |
|---|---|---|---|
| `impacto-profundo` | +25 | `impacto-presentacion` | +3 |
| `impacto-grande` | +18 | `whoosh-cine` | +1 |
| `whoosh-aire` | +18 | `pop-explainer` | 0 |
| `sweep-corto` | +14 | `swoosh-viento` | −1 |
| `obturador` | +9 | `clic-select` | −10 |

**La mayoría de los efectos de librería SÍ meten energía en la banda de la voz.
Y por eso suenan llenos.** Es exactamente lo que les faltaba a los sintetizados:
al diseñarlos para esquivar 1-3 kHz les quité el cuerpo.

Así que la regla de «que no toque la banda de la voz» era buena para sonidos
hechos a medida y es demasiado estricta para los de librería. Lo que decide de
verdad es el nivel, la duración y si el efecto cae encima de una palabra o entre
dos. Un whoosh de 0,3 s a −18 dB bajo la voz no quita inteligibilidad aunque esté
en banda; se comprueba midiendo la mezcla final, no filtrando antes.

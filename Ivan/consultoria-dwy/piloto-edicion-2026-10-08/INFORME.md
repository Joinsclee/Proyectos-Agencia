# Piloto de `editar-video-clee-portable` 0.1.0 · 8 de octubre de 2026

Para Cristhian y Camilo. Primera prueba del paquete con un bruto real, antes de instalarlo en La Huerta.

## Qué se probó

- **Paquete:** `paquete-edicion-clee-0.1.0-2026-10-07.zip`. Integridad verificada (los 14 hashes del
  `MANIFEST.json` cuadran). Instalado con `install.py --target both` en `~/.codex/skills` y
  `~/.claude/skills`.
- **Bruto:** el Loom de Cristhian del 8/10. Es una sola toma hablada de 8:39, sin editar, 1080p y a
  frame rate **variable** (VFR). No había ninguna toma cruda de Iván en local: el bruto del VSL se
  borró el 25/09 y solo está en Drive.
- **Unión:** dos clips reales de la finca de distinta resolución, orientación y fps
  (`IMG_0188.MOV` 1920×1440 rotado a 30 fps + `MVI_9711` a 59,94 fps).

## Resultados

| Paso | Qué hace | Tiempo de proceso | Resultado |
|---|---|---|---|
| Transcripción por palabra | **No va en el paquete.** faster-whisper medium en CPU | 453 s (7:33) para 8:39 de audio | 1.650 palabras |
| EDL candidata | **No va en el paquete.** `hacer-edl.py` (aquí): corta solo huecos >0,7 s entre palabras | <1 s | 31 segmentos, 21,8 s de pausas quitadas (4 %) |
| `validate-edl.mjs` | Valida la EDL | <1 s | Detectó un error real de mi generador (el último corte acababa 0,017 s después del final del vídeo). Corregido |
| `apply-edl.mjs`, muestra de 30 s | Corte de prueba | 3 s | Vídeo y audio: 28,700 s los dos |
| `apply-edl.mjs`, completo | Corte del vídeo entero | **39 s** | Vídeo y audio: 497,200 s los dos, partiendo de VFR. 53 MB |
| Chasquidos en las uniones | Medido sobre el audio de salida | — | 0 de 30 uniones por encima del pico normal de la voz (máx. 0,44 del percentil 99,9) |
| `remap-cues.mjs` | Reubica 428 subtítulos en la línea nueva | <1 s | 0 perdidos. 4 partidos por una pausa a mitad de frase, seguidos y marcados para revisión |
| `join-clips.mjs` | Une 2 tomas heterogéneas | 32 s | 41,27 s, desfase 0,02 s |

**Tokens:** NO DISPONIBLE. La sesión no expone el consumo por paso. **Tiempo humano activo:** no
medido; falta la revisión editorial, que es lo que de verdad consume tiempo.

## Lo que hay que saber antes de venderlo o instalarlo

1. **El paquete solo no edita un vídeo de principio a fin.** Une, corta según una EDL, valida y
   reubica apoyos. La transcripción, la generación de la EDL (el corte de silencios), los
   subtítulos quemados, las animaciones, la música y el loudness los delega en `project_root` →
   `Editar Videos`. Y `references/cliente.md` dice que ese repo privado **no** se entrega a
   clientes. En La Huerta, por tanto, hay que instalarlo **junto a** un compositor: el
   `video-editor` de `sistema-contenido-pack` (portable, con subtítulos, loudness y comprobación de
   requisitos) y whisper con su modelo.
2. **Falta un generador de EDL.** Sin él, el agente lo escribe cada vez. El `hacer-edl.py` de esta
   carpeta sirve de punto de partida: corta solo en silencios, nunca a mitad de palabra, y no se pasa
   del último frame.

## Defectos encontrados en 0.1.0 (para Cristhian)

| # | Script | Defecto | Riesgo | Propuesta |
|---|---|---|---|---|
| 1 | `join-clips.mjs` | Deja las copias normalizadas en la carpeta temporal del sistema **en cada ejecución**, aunque no se pase `--keep`. El mensaje lo dice («Temporales conservados (sin borrado)») | 87 MB por 41 s de tomas. Con un rodaje de 10 min en 4K son varios GB por ejecución, en equipos de cliente con el disco justo | Borrarlos salvo con `--keep`, o escribirlos dentro de la carpeta de sesión |
| 2 | `join-clips.mjs` | Con orientaciones mezcladas elige el lienzo por moda; si hay empate, gana el primer clip. Rellena con barras negras sin avisar | Un vertical y un horizontal salen con bandas negras | Avisar cuando las orientaciones difieren y pedir `--target` |
| 3 | `apply-edl.mjs` | Ante una EDL mala solo dice «EDL inválido o solapado» | Hay que correr el validador para saber qué falla | Imprimir el segmento y el motivo, como hace `validate-edl.mjs` |

## Siguiente

- Repetir con una toma cruda real de Iván (pedírsela a Alejandro o bajar el bruto del VSL de Drive)
  y medir el tiempo humano de revisión.
- Probar la cadena completa en La Huerta: este paquete + `video-editor` del pack + whisper.

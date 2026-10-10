# Taxonomía de B-roll y su rol en la retención

El B-roll no es decoración: es un **pattern-interrupt** que sostiene la retención y **prueba** lo que se dice (regla de craft de la Máquina de Edición CLEE). Antes de escribir un prompt, decide QUÉ tipo de B-roll necesita el momento del guion.

## Los 5 tipos de B-roll

| Tipo | Qué muestra | Cuándo usarlo | Ejemplo (SAVIAS / marca personal) |
|---|---|---|---|
| **Literal** | Exactamente lo que se nombra | Para claridad: el espectador necesita ver el objeto/acción | "jabón de caléndula" → macro del jabón de caléndula girando |
| **Metafórico / conceptual** | Una idea abstracta hecha imagen | Para carga emocional en un pico; sincronizado al beat | "empezar de cero" → semilla germinando en cámara lenta |
| **Textura / detalle (macro)** | Close-up sensorial de material/ingrediente | Para "respirar" y dar acabado premium; entre puntos | gotas de aceite esencial cayendo, espuma formándose |
| **Entorno / establishing** | El espacio/contexto donde ocurre | Al abrir un bloque o cambiar de tema | taller artesanal con luz de ventana, manos trabajando |
| **Prueba / evidencia** | La demostración de una afirmación | Cuando se hace una claim (regla "cada afirmación con su prueba") | antes/después, el producto en uso real, resultados |

> **Regla de oro de retención:** el B-roll **entra EN la palabra clave** que ilustra (toma 1,5s antes/después de la keyword en el transcript) y **la voz NUNCA se corta** debajo (L-cut). Ver `clee-video-editor/references/craft-rules.md` reglas 12-13 y `references/semantic-cut.md`.

## Duración y ritmo (define el prompt)

- **Flash 1-2s** — para ritmo/energía (marcas rápidas, Ovejas). Prompt: acción rápida, movimiento de cámara enérgico.
- **Cinematográfico 2-5s** — en picos emocionales (marcas premium, SAVIAS). Prompt: cámara lenta, push-in lento, detalle sensorial.
- Genera cada clip a **la duración objetivo + 1s de colchón** para poder cortar en el editor.

## Literal vs metafórico (decisión rápida)

- ¿El espectador **necesita entender** algo concreto? → **literal**.
- ¿El momento es un **pico emocional** o una idea abstracta? → **metafórico**, sincronizado al beat musical.
- ¿Es un **puente** entre dos puntos densos? → **textura/detalle** (deja respirar).
- ¿Se acaba de hacer una **promesa/claim**? → **prueba**.

## Qué NO generar con IA (usar material real)

Si el cliente tiene **stock propio** de su vida/producto/casos, **úsalo** (regla de craft: stock propio > genérico). El B-roll IA es para:
- lo que **no existe** en el material del cliente (conceptos, metáforas, tomas imposibles),
- **texturas/establishing genéricos** de alta calidad que encajen con el brand kit,
- **relleno cinematográfico** cuando falta cobertura.

Nunca generes con IA una "prueba" falsa (un resultado que no ocurrió, una cifra inventada) — eso rompe la confianza y la regla anti-alucinación del control de calidad.

## Formato

Por defecto **9:16 vertical (1080×1920)**, 2-5s por clip, para encajar en Reels/TikTok. Respeta las safe-zones si el B-roll llevará texto encima (ver `clee-video-editor/references/safe-zones.md`). Para YouTube 16:9, genera en horizontal.

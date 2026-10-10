# Motion graphics de datos (Remotion)

Principio "**lógico y representativo**": cada animación **representa literalmente lo que se dice en ese instante** y **prueba** el dato (regla 17 de `references/craft-rules.md`). En tramos de "hablar de números", el cerebro se pierde con audio suelto y se ancla con una visualización que **sube y aterriza**.

## Disparador: toda cifra hablada → un gráfico

Escanea el transcript/guion; cada número dispara una plantilla:

| Lo que se dice | Chart |
|---|---|
| porcentaje ("80%", "ochenta por ciento") | contador + **pie/donut** |
| tendencia / retención | **línea** |
| comparación (antes/después, A vs B) | **barras** |
| "creció Nx" / exponencial | **growth curve** |
| cifra suelta ("11.300 videos") | **contador grande** |

Reglas: **un insight por gráfico**, 3-5 datapoints máx, el contador **sube y aterriza** (nada de bounce/explode), **hold 2-3s**, y la **cifra en pantalla coincide EXACTO con lo dicho** (verificar en QA). Nunca un icono solo: acompaña con la **prueba** (el screenshot/mockup real cuando aplique).

## Patrón en este repo: data-builder → componente

El repo ya usa **data-builders** (`scripts/build-jc-data.mjs`, `scripts/build-comunicacion-data.mjs`): un `.mjs` que emite un JSON de datos que la composición consume. Sigue ese patrón:

1. **Builder** (`scripts/build-<pieza>-data.mjs`) → `src/<pieza>-data.json` con los datapoints (`[{label, value}]`, series, etc.).
2. **Componente** que lee el JSON y anima con `interpolate`/`spring`.

## Contador que "sube y aterriza" (frame-exacto)

```tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();
// entra a los startSeg, sube durante ~0.8s con easing, luego se queda
const p = spring({ frame: frame - startSeg * fps, fps, config: { damping: 200 } });
const value = Math.round(interpolate(p, [0, 1], [0, target]));
// value -> pinta con tabular-nums; "aterriza" en target sin rebote
```

- `damping: 200` (sin rebote) = "aterriza". Evita springs con overshoot para cifras.
- `font-variant-numeric: tabular-nums` para que los dígitos no salten.
- Sincroniza `startSeg` al **frame en que se dice el número** (usa el timing del caption).

## Barras / pie / línea

- **Barras**: `interpolate` la altura de cada barra con **stagger** (retrasa cada barra ~3-5 frames) — entrada escalonada.
- **Pie/donut**: anima el ángulo con `interpolate` (o `@remotion/shapes`), o `strokeDashoffset` de un círculo SVG.
- **Línea/growth**: `@remotion/paths` (`evolvePath`) para "dibujar" la curva de retención/crecimiento progresivamente.

Todo ya disponible en el repo: `@remotion/shapes`, `@remotion/paths`, `@remotion/noise`, `@remotion/layout-utils`, `@remotion/animation-utils`.

## Lower-thirds, split-screen, mockups

- **Lower-third** (nombre/rol): `Sequence` con entrada por `spring` desde el borde; respeta `references/safe-zones.md`.
- **Split-screen comparativo** ("antes/después", "A vs B"): dos `AbsoluteFill` a mitad, con un divisor animado.
- **Mockups de prueba social** (reels/posts con métricas): compón el mockup con el número real "encima" — es la **prueba** de la regla 17.

## Transiciones y punch-ins

- Entre escenas: `@remotion/transitions` (`TransitionSeries` + `linearTiming`/`springTiming`) — frame-exactas. No jump cuts sin transición.
- **Zoom punch-in** al aparecer un dato: `scale` con `spring` sobre un wrapper (nunca sobre el `<Video>` directamente).
- Sincroniza la entrada del gráfico a la **keyword** del caption.

## Fondos y color

Fondos **minimalistas** (regla craft): no compitan con el dato. Difumina/oscurece detrás del número. Paleta corta y consistente con la marca (define en `theme.ts`). Un color de acento para "lo importante".

## Checklist

- [ ] Cada cifra hablada tiene su gráfico; la cifra en pantalla == transcript.
- [ ] Contador sube y aterriza (sin rebote), `tabular-nums`, hold 2-3s.
- [ ] Entrada sincronizada al frame de la keyword.
- [ ] Datos vía data-builder JSON (no hardcodeados en el componente).
- [ ] Fondo minimalista; dentro de safe zones.

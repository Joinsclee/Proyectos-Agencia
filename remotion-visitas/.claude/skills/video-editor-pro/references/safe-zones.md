# Safe Zones por plataforma (composiciones Remotion)

Guía de zonas seguras para posicionar captions, motion-graphics, lower-thirds, CTA y cualquier overlay dentro de una composición Remotion sin que la UI nativa de la plataforma tape lo importante. Todo se expresa como **constantes en px** listas para `theme.ts` / un helper, y como patrones de `padding` / `position:absolute` en JSX. La validación final es visual (contact-sheet, ver `references/qa.md`). Esta regla es el aterrizaje concreto de la regla 18 de `references/craft-rules.md`.

---

## 1. Principio rector

Lo clave (rostro, texto-gancho, dato, CTA) vive en el **70-80% central del cuadro**. Asume SIEMPRE que la plataforma superpone su propia UI sobre los bordes: header, caption, música, botones de interacción, barra de progreso, tarjetas de "siguiente video". Nunca confíes en el borde: si algo importante toca el borde, en el feed real queda tapado o cortado.

Reglas mínimas:

- **Rostro centrado** en el eje horizontal, ojos en el tercio superior-medio.
- **Captions en banda libre**, nunca sobre la cara ni sobre la UI de la plataforma.
- **Texto-gancho** en el tercio superior-medio (por debajo del header, por encima del centro).
- **CTA / lower-third** dentro del área action-safe, nunca pegado al borde inferior donde vive la UI.

---

## 2. 9:16 — 1080x1920 (formato primario: Reels / TikTok / Shorts)

Es el formato de trabajo por defecto. La UI nativa come tres franjas: **arriba** (header/estado), **abajo** (caption, nombre, audio, botones de acción) y **borde derecho** (like / comment / share / avatar).

| Zona | Rango aproximado | Qué la ocupa | Regla |
|------|-----------------|--------------|-------|
| Header superior | ~108-250 px desde arriba | Reloj, "Siguiendo/Para ti", buscar | No poner texto-gancho arriba de ~260 px |
| Franja inferior | ~320-420 px desde abajo | Caption, @usuario, título del audio, botón seguir | Ningún overlay ni caption por debajo del centro de esta franja |
| Borde derecho | ~60-120 px desde la derecha | Like, comment, share, disco de audio | Nada crítico en la columna derecha |
| Banda de captions | sobre el ~20% inferior, por ENCIMA de la franja inferior | — | Los captions viven aquí, en banda central-baja libre |

Notas de composición:

- **Captions**: banda central sobre el 20% inferior. Deben quedar por encima de la franja inferior (los ~400 px de UI). En `CaptionedVideo.tsx` esto es el `bottom` de la caja de subtítulos: mantenerlo por encima de `SAFE_916.bottom`.
- **Texto-gancho**: tercio superior-medio, debajo del header (>260 px desde arriba) y por encima del centro.
- **Rostro**: centrado; los captions van en la banda libre, **NUNCA sobre la cara**. Si el encuadre deja la boca baja, sube la banda de captions o reencuadra el source (ver reframe en `references/ffmpeg-recipes.md`).

Constantes:

```ts
// theme.ts — valores en px sobre lienzo 1080x1920
export const SAFE_916 = {
  width: 1080,
  height: 1920,
  top: 250,     // reservado para header de la plataforma
  bottom: 400,  // reservado para caption/audio/botones
  right: 120,   // reservado para columna de acciones (like/comment/share)
  left: 60,     // respiración lateral izquierda
} as const;

// Banda recomendada para captions (sobre la franja inferior de UI)
export const CAPTION_BAND_916 = {
  bottom: SAFE_916.bottom + 40, // ~440px desde abajo: por encima de la UI
  maxWidth: SAFE_916.width - SAFE_916.left - SAFE_916.right, // ancho útil
} as const;
```

---

## 3. 1:1 — 1080x1080 (feed cuadrado)

Formato más benévolo: no hay columna de acciones sobre el video ni franjas UI tan agresivas. Basta un **margen de seguridad del ~10%** en los cuatro lados.

```ts
export const SAFE_11 = {
  width: 1080,
  height: 1080,
  margin: 108, // 10% de 1080, aplicar a los 4 lados
} as const;
```

Regla: todo el contenido crítico dentro del recuadro central que deja ese margen del 10%.

---

## 4. 16:9 — 1920x1080 (YouTube / horizontal)

Terminología broadcast: **title-safe ~90%** (texto y gráficos importantes) y **action-safe ~95%** (cualquier elemento que no debe cortarse). Dos peligros específicos de YouTube en la **esquina inferior derecha**: la **barra de progreso** (borde inferior) y la **tarjeta / end-screen de "siguiente video"**.

| Área | Margen | Uso |
|------|--------|-----|
| Action-safe | ~5% (96 px H / 54 px V) | Nada crítico fuera de aquí |
| Title-safe | ~10% (192 px H / 108 px V) | Títulos, lower-thirds, datos |
| Esquina inf. derecha | evitar | Barra de progreso + tarjeta "siguiente video" |

```ts
export const SAFE_169 = {
  width: 1920,
  height: 1080,
  actionSafe: { x: 96, y: 54 },    // ~5%
  titleSafe: { x: 192, y: 108 },   // ~10%
  // evitar overlays en el rectángulo inferior-derecho (end-screen)
  avoidBottomRight: { w: 420, h: 240 },
} as const;
```

---

## 5. Uso en Remotion: padding y posicionamiento absoluto

Dos patrones. Preferir un **contenedor "safe area"** con `padding` y meter el contenido dentro; usar `position:absolute` con offsets desde las constantes cuando se ancla a un borde concreto.

### 5.1 Contenedor safe-area (padding)

```tsx
import { AbsoluteFill } from 'remotion';
import { SAFE_916 } from './theme';

export const SafeArea: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      paddingTop: SAFE_916.top,
      paddingBottom: SAFE_916.bottom,
      paddingLeft: SAFE_916.left,
      paddingRight: SAFE_916.right,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    {children}
  </AbsoluteFill>
);
```

Todo lo que cuelgue de `<SafeArea>` queda garantizado dentro del rectángulo útil. El texto-gancho arriba, el CTA en medio-bajo, y el `justifyContent` reparte el resto.

### 5.2 Anclaje absoluto a una zona concreta

```tsx
import { AbsoluteFill } from 'remotion';
import { SAFE_916, CAPTION_BAND_916 } from './theme';

// Caption anclado en la banda libre, por encima de la UI inferior
export const CaptionSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        bottom: CAPTION_BAND_916.bottom,
        left: SAFE_916.left,
        right: SAFE_916.right,
        maxWidth: CAPTION_BAND_916.maxWidth,
        marginInline: 'auto',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

// Texto-gancho en tercio superior-medio (debajo del header)
export const HookSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', top: SAFE_916.top + 120, left: SAFE_916.left, right: SAFE_916.right }}>
      {children}
    </div>
  </AbsoluteFill>
);
```

Enlazar el `bottom` de los captions al valor de `SAFE_916.bottom` (en vez de un número mágico) mantiene consistente el proyecto: cambiar un dial cambia todo. Ver cómo se integran los captions palabra-por-palabra en `references/captions.md` y los overlays de datos en `references/motion-graphics.md`.

---

## 6. Ajuste por marca/pieza

Estas constantes son un **punto de partida seguro**, no dogma. Ajustar los diales según la marca/pieza:

- **Marca pausada / premium**: bandas más generosas, captions más pequeños y bajos, mucho aire; sube los márgenes.
- **Marca rápida / hype**: captions más grandes y altos, texto-gancho más agresivo; puedes acercarte a los límites, pero nunca invadir la UI nativa.

Nunca reducir por debajo de los mínimos de UI (`top`, `bottom`, `right` en 9:16): esos px los tapa la plataforma pase lo que pase.

---

## 7. Validación (QA)

Ningún overlay se da por bueno sin revisar el render. En QA:

1. Genera el **contact-sheet** del render (ffmpeg, ver `references/qa.md` y `references/ffmpeg-recipes.md`).
2. Superpón mentalmente (o con guías) las zonas UI de la plataforma destino.
3. Confirma que **ningún overlay invade** header, franja inferior, columna derecha (9:16) ni la esquina inferior-derecha (16:9).
4. Verifica que los **captions nunca caen sobre la cara** ni por debajo de `SAFE_916.bottom`.

Checklist rápido:

- [ ] Texto-gancho por debajo del header (>260 px en 9:16)
- [ ] Captions en banda libre, sobre la franja inferior, fuera del rostro
- [ ] Nada crítico en la columna derecha (9:16)
- [ ] CTA / lower-third dentro de action-safe
- [ ] 16:9: nada en la esquina inferior-derecha (barra de progreso + siguiente video)
- [ ] Márgenes 1:1 ~10% respetados

Esta validación cierra la regla 18 de `references/craft-rules.md`. El flujo completo de dónde encaja este paso está en `references/pipeline.md`; el finishing de audio que corre en paralelo, en `references/audio-finishing.md`.

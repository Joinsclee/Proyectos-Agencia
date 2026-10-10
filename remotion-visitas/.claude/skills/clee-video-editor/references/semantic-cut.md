# Corte Semántico (Paso 4 del pipeline)

El corte semántico es el paso 4 de `references/pipeline.md`: convierte el crudo transcrito en un **EDL** (lista de tramos a conservar) que aprieta el ritmo, mueve el gancho a `t=0` y elimina relleno SIN degradar el sentido. Aquí NO se renderiza nada: sólo se produce el plan de corte. La materialización ocurre en FFmpeg (receta 7) o en Remotion (pares `trimBefore`/`trimAfter`).

Regla mental: **este paso lo RAZONA Claude leyendo `transcript.json`, no un script rígido.** `silencedetect` y los word-gaps son señales de entrada; la decisión final de "esto es relleno vs esto es valor" la toma el agente. Un umbral de dB nunca sabe que una pausa de 900 ms es un *hold* dramático antes de la frase más importante del video; Claude sí, porque lee lo que se dice a ambos lados.

Cruza con: `references/craft-rules.md` (reglas 8 ritmo, 13 voz nunca bajo b-roll, 16 tapar el corte), `references/ffmpeg-recipes.md` (recetas 6 silencedetect, 7 concat), `references/captions.md` (los caption-chunks se recalculan sobre el EDL final), `references/audio.md` (J/L-cuts y ducking), `references/engine-decision.md` (qué ruta materializa) y `references/qa.md` (chequeo de saltos audibles).

---

## 1. Qué es el EDL (Edit Decision List)

El EDL es un **JSON de keep-segments**: la lista ORDENADA de tramos del crudo que sobreviven al corte. No se listan los tramos a borrar; se listan los que se conservan. Todo lo que no está en la lista se descarta.

Cada segmento es `{ start, end, reason }` en segundos (float, referidos al timeline del CRUDO original, no al de salida). El orden del array **es** el orden de salida — reordenar el array reordena el video (así se mueve el hook a `t=0`, ver §3).

### Schema JSON de ejemplo

```json
{
  "source": "raw/savias_clip01.mp4",
  "client": "SAVIAS",
  "profile_rhythm": "lento",
  "source_duration_s": 214.8,
  "keep": [
    {
      "start": 92.40,
      "end": 98.10,
      "reason": "hook: cifra-shock '...el 80% de los jabones comerciales'"
    },
    {
      "start": 3.20,
      "end": 11.75,
      "reason": "contexto: presenta el problema, reordenado despues del hook"
    },
    {
      "start": 30.05,
      "end": 30.95,
      "reason": "hold: pausa dramatica preservada antes de la afirmacion grande"
    },
    {
      "start": 30.95,
      "end": 44.60,
      "reason": "cuerpo: desarrollo del argumento central"
    },
    {
      "start": 118.30,
      "end": 126.00,
      "reason": "cta"
    }
  ],
  "cuts_removed": 27,
  "estimated_output_s": 38.9
}
```

Convenciones:

| Campo | Regla |
|-------|-------|
| `start` / `end` | Segundos del CRUDO. `end` exclusivo. `end > start` siempre. |
| Orden del array | Orden de salida. Puede NO ser cronológico (hook movido al frente). |
| `reason` | Etiqueta legible: `hook`, `contexto`, `cuerpo`, `hold`, `cta`, `demo`, `transicion`. Sirve para QA y para que el editor humano audite el criterio. |
| `profile_rhythm` | `lento` (SAVIAS) → menos cortes, holds preservados. `hipercinetico` (Ovejas) → cortes agresivos, casi cero holds. Ver §4 y `references/engine-decision.md`. |

Los 18 crafts son universales; **lo que cambia por cliente son los diales** del `brand-edit-profile` (agresividad de corte, cuántos holds preservar, umbral de muletillas). El EDL es el mismo formato para todos.

---

## 2. Algoritmo de generación

Tres señales se fusionan en un solo plan. Nunca uses una sola.

### (1) silencedetect → invertir a tramos-con-voz

Corre la **receta 6** (`silencedetect`) sobre el crudo. Devuelve pares `silence_start` / `silence_end`. Esos son los tramos MUDOS. El video hablado es el **complemento**: se invierte para obtener los tramos con voz.

```
silences:  [ (s0,e0), (s1,e1), (s2,e2), ... ]
voz  = complemento sobre [0, source_duration]:
       [0, s0], [e0, s1], [e1, s2], [e2, ...]
```

Parámetros de partida (los afina el perfil): `-30dB` de umbral y `d=0.35` (350 ms) de duración mínima de silencio. Marcas rápidas bajan `d` (cortan pausas de 200-250 ms); pausadas suben `d` (toleran 500-700 ms). Ver receta 6 para la sintaxis exacta del binario `$FF` — no reescribas el comando aquí.

### (2) cruzar con transcript.json (word-gaps)

`silencedetect` mide energía de audio; **no sabe dónde termina una palabra**. Un respiro con ruido de fondo puede no disparar silencio, y una consonante oclusiva puede parecer silencio. Por eso se cruza con los timestamps por palabra de `transcript.json` (producido en el paso de transcripción, ver `references/pipeline.md`).

- Gap entre `word[i].end` y `word[i+1].start` mayor a ~250 ms → candidato a corte, aunque el audio no fuera "silencio" perfecto.
- El texto entre palabras permite cortar **en frontera de palabra**, nunca a mitad de sílaba (evita el chasquido audible que delata la edición).
- Word-gaps + silencios que coinciden = corte de altísima confianza.

### (3) merge de tres señales

Fusiona: **silencios (energía)** + **word-gaps (texto)** + **holds (semántica)**. Regla de decisión por cada gap detectado:

```
para cada gap candidato:
  si el gap coincide en silencedetect Y en word-gap  -> corte de alta confianza
  si sólo aparece en una señal                       -> revisar contexto (texto vecino)
  si el gap PRECEDE a una frase de alto valor         -> NO cortar: es un HOLD, preservar
```

### Silencio-a-cortar vs Hold-a-preservar

Esta es la distinción central y la razón por la que el paso lo razona Claude, no un umbral.

| | Silencio a CORTAR | Hold a PRESERVAR |
|---|---|---|
| Qué es | Aire muerto, duda, respiro entre ideas de igual peso | Pausa dramática **intencional** antes de un golpe |
| Qué viene después | Más de lo mismo, relleno, un "eh…" | Una **afirmación grande**, un cambio de tema, una cifra-shock, el remate |
| Señal en el texto | Frase incompleta, muletilla, repetición | El hablante baja el ritmo y luego SUBE la carga |
| Acción | Eliminar del EDL | Incluir el tramo de silencio como su propio keep-segment (ver `reason: "hold"` en §1) |
| Efecto | Aprieta ritmo (regla 8) | Crea tensión, el "…" antes del payoff |

Cómo lo detecta el agente: mira las **2-3 palabras después** del gap. Si abren una afirmación de valor ("La verdad es que…", una cifra, una promesa, un giro), la pausa previa es un hold y se conserva. Si abren relleno o continúan la misma frase, se corta.

**Dial por cliente:** el perfil **pausado (SAVIAS)** conserva MÁS holds — el silencio es parte del lujo, del ritmo lento y premium; cortar todos los holds mataría la marca. El perfil **hipercinético (Ovejas Voladoras)** conserva casi CERO holds — cada milisegundo muerto es un enemigo, el ritmo lo dan los cortes secos word-by-word y el SFX denso. Mismo algoritmo, dial opuesto.

---

## 3. Regla 80/20 — mover el hook a t=0

**El primer valor debe estar en `t=0`.** El espectador decide en los primeros segundos (retención); el warm-up ("hola qué tal, hoy os voy a hablar de…") lo mata. La regla 80/20: el 20% del crudo que carga el 80% del valor va PRIMERO.

### Detectar la frase-gancho en el transcript

Escanea `transcript.json` buscando la primera frase de alta carga. Prioridad de gancho:

1. **Cifra-shock** — número contraintuitivo o grande ("el 80% de…", "en 3 días…", "perdí 12 mil…").
2. **Afirmación con carga / contraintuitiva** — rompe una creencia ("todo lo que te dijeron sobre X es mentira").
3. **Pregunta abierta** — interpela directo ("¿Sabías que…?", "¿Por qué…?").
4. **Promesa / stakes** — el resultado o el costo ("esto me ahorró…", "casi lo pierdo todo").

Esa frase suele NO estar al principio del crudo — está enterrada en el minuto 1-2, después del warm-up.

### Reordenar el EDL

1. Encuentra el tramo `[start, end]` de la frase-gancho.
2. Ponlo como **primer elemento** del array `keep`, con `reason: "hook: ..."`.
3. **Descarta** el warm-up / relleno inicial (no lo incluyas en `keep`).
4. Reinserta el contexto mínimo necesario DESPUÉS del hook, sólo si la frase gancho pierde sentido sin él (ver el segmento "contexto" reordenado en el ejemplo del §1).
5. El resto sigue en orden cronológico normal.

El EDL resultante NO es cronológico, y está bien: el orden del array manda. Como el corte cruza planos que originalmente no eran contiguos, hay que **tapar el salto** (§5) — un hook movido casi siempre necesita cambio de zoom o b-roll encima de la costura.

---

## 4. Muletillas ES a marcar para eliminar

Marca estos tokens en `transcript.json` como candidatos a borrar. Bórralos recortando el keep-segment en frontera de palabra (usa los timestamps de la muletilla).

| Categoría | Tokens |
|-----------|--------|
| Dudas / relleno sonoro | `eh`, `em`, `um`, `este`, `pues` |
| Conectores vacíos | `o sea`, `digamos`, `entonces` (cuando es relleno, no causal), `tipo`, `en plan` |
| Coletillas de validación | `¿no?`, `¿vale?`, `¿sabes?`, `¿me explico?` |
| Repeticiones inmediatas | "la la casa", "yo yo creo" → deja una |
| Falsos arranques | "Cuando yo— bueno, lo que quiero decir es…" → borra hasta el reinicio limpio |

**Cuidado con `entonces` y `pues`:** sólo son muletilla cuando NO cumplen función causal/lógica. "Entonces el jabón se curó" (secuencia real) se queda; "Entonces… eh… lo que pasa es que" (relleno) se va. El agente decide por contexto, no por lista ciega.

**Dial por cliente:**
- **Agresivo** (Ovejas Voladoras, marcas rápidas): elimina TODAS las muletillas, incluso a costa de micro-saltos que luego se tapan con SFX/zoom. El ritmo staccato es la marca.
- **Conservador** (SAVIAS, pausado): elimina sólo las muletillas evidentes (`eh`, `em`, falsos arranques). Deja los conectores suaves y algún respiro — cortar todo suena robótico y rompe el tono cálido/premium. Un poco de humanidad en el habla es parte del lujo.

---

## 5. J-cuts, L-cuts y cómo ocultar el jump-cut

### L-cut y J-cut

Son cortes donde audio e imagen NO cambian en el mismo frame. Reducen la sensación de tajo y encadenan bloques. Ver `references/audio.md` para el ducking asociado.

| | L-cut | J-cut |
|---|---|---|
| Qué hace | El **audio SIGUE** del plano A mientras la **imagen** ya pasó a b-roll / plano B | El **audio del plano B entra ANTES** que su imagen (se adelanta sobre el final de A) |
| Uso típico | La voz continúa narrando mientras entra b-roll ilustrativo | Entrar a un nuevo bloque o a una pregunta: la voz "tira" del corte |
| Regla ligada | **Regla 13: la voz NUNCA se corta bajo el b-roll.** El b-roll cubre imagen, jamás silencia la narración | Regla 8 (ritmo): el adelanto de audio acelera la percepción de entrada |
| Desfase típico | **150-300 ms** | **150-300 ms** |

En el EDL esto se expresa manteniendo el keep-segment de voz continuo (regla 13) y decidiendo el punto de b-roll en el paso de b-roll/sync, no cortando el audio. El L/J-cut es un **solape de audio vs imagen**, no un corte de contenido: el EDL conserva la voz entera y la capa visual se desfasa 150-300 ms en la materialización.

### Ocultar el jump-cut (regla 16)

**Cada corte de silencio "grita editado".** Al eliminar un tramo, los dos planos que quedan contiguos fueron grabados con el sujeto en posición casi idéntica → salto visual delator (el clásico jump-cut de talking-head).

Formas de taparlo, por prioridad:

1. **Variación de zoom** — escala el plano post-corte de `100% → 108%` (o alterna 100%/105%). El cambio de encuadre absorbe la discontinuidad. Es la técnica default y la más barata (puro escalado, sin material extra).
2. **Micro-cambio de ángulo** — si hay multicam o un plano B, alterna la fuente en el corte.
3. **B-roll encima de la costura** — coloca b-roll justo sobre el punto de corte (combínalo con L-cut: la voz sigue, ver regla 13). Tapa el salto y además ilustra.

Regla operativa: **todo corte de silencio interno necesita al menos zoom-variation.** Un hook movido a `t=0` (§3), que une planos no contiguos, casi siempre pide zoom O b-roll. Marca en el EDL o en el hand-off al paso visual dónde va cada tapado. Ver regla 16 en `references/craft-rules.md`.

---

## 6. Materializar el EDL

El EDL es un plan; se ejecuta en una de dos rutas según `references/engine-decision.md`.

### Ruta FFmpeg → concat (receta 7)

Para cada keep-segment se recorta y luego se concatenan con `filter_complex concat` (**receta 7** de `references/ffmpeg-recipes.md`). Es **destructivo**: produce un master cortado nuevo. Rápido, ideal cuando el corte está cerrado y no se va a re-editar. Binario `$FF` (sistema, sin libass) para el corte; los subtítulos quemados vienen después con `$FFSUB` (con libass) en el paso de captions. NO inventes el comando aquí — usa la receta 7 tal cual, alimentándola con los `start`/`end` del array `keep` en su orden final.

### Ruta Remotion → trimBefore/trimAfter (no destructivo)

Cada keep-segment se traduce a un `<Video>` (o `<OffthreadVideo>`) con el par `trimBefore` / `trimAfter` (en frames, convertidos desde los segundos del EDL a `fps`). Los segmentos se secuencian con `<Series>` / `<Sequence>`. Ventajas:

- **No destructivo**: el crudo no se toca; el corte vive en código y se re-edita cambiando números.
- Editable: mover el hook = reordenar componentes; ajustar un corte = cambiar `trimAfter`.
- Encaja con el resto de la composición Remotion (captions kinéticos, motion graphics, zoom-variation de la regla 16 como interpolación de `scale`).

Regla de conversión: `frame = round(segundos * fps)`. Respeta el `fps` del proyecto para no desincronizar audio.

### Qué ruta elegir

Rápido/one-shot y sin motion complejo → FFmpeg concat (receta 7). Video con captions kinéticos, motion graphics de datos y zoom-programado → Remotion. La decisión formal está en `references/engine-decision.md`; el corte semántico entrega el MISMO EDL a cualquiera de las dos.

---

## 7. Salida y hand-off

- Emite el `keep[]` en el schema del §1 (orden = orden de salida, hook primero).
- Anota holds preservados y cada corte que requiere tapado (zoom/b-roll, §5) para el paso visual.
- Recalcula los caption-chunks de `references/captions.md` **sobre el EDL final** (los timestamps del crudo ya no valen tras reordenar y cortar).
- Pasa a QA (`references/qa.md`): revisar que no haya cortes audibles a mitad de palabra, que la voz nunca quede muda bajo b-roll (regla 13) y que el hook esté realmente en `t=0`.

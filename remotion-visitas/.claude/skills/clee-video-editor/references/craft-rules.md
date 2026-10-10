# Craft de edición de retención — las reglas no negociables

Destilado de la masterclass de referencia (Victor, +11.300 videos, +1.000M visitas) y de investigación de edición short-form. **Las 18 reglas son universales.** Lo que cambia por cliente son los *diales numéricos* del `brand-edit-profile`. Un agente que edita debe poder justificar cada decisión contra una de estas reglas.

---

## El principio rector

> **No importa que el video se vea bonito; importa que FUNCIONE dentro de la red social.**

Las reglas del cine (tercios, mirada, colorimetría) son para el cine: allí pagaste entrada y no te vas aunque te aburra 5 minutos. En redes la persona decide en **~0,6 segundos** (un swipe) si se queda. Por eso hay **2 modelos de edición**:

| Modelo A — "que se vea bonito" | Modelo B — "que funcione" (este skill) |
|---|---|
| Reglas técnicas de cine, cinematográfico, limpio | Retención, dopamina, estímulo inicial |
| Se ve perfecto pero NO viraliza | Puede verse "más sucio" pero **retiene** |
| Más tiempo y experiencia | Menos tiempo, más lógica |

Lo ideal es que sea **precioso Y funcione**, pero **siempre se prioriza que funcione**. (MrBeast rompe casi todas las reglas de cine; se concentra en dos cosas: que te puedan escuchar y aumentar el tiempo de retención.)

## El EMN — Estímulo Mínimo Necesario

La viralidad depende ~**80% de la cantidad de estímulo al principio**. La relación estímulo→visitas es **exponencial**: por debajo de un umbral (el **EMN / Umbral Mínimo de Viralidad**) el video se estanca en 1k-10k visitas; apenas lo supera, explota (analogías: interés compuesto, los conejos 2→7.500 en 8 años→20.000 en el año 9).

- **El EMN lo marca el nicho y la audiencia, no tú.** Un adulto mayor necesita **menos** estímulo que un joven "con el cerebro frito de TikTok". Cada sector tiene su umbral → el `whisper_model`, el `cut_rate` y la `sfx_density` del perfil calibran cuánto estímulo inyectar.
- **El triángulo general→nicho:** el **inicio debe ser lo más GENERAL posible** (que lo entienda cualquiera, cualquier edad) y **nichar progresivamente** conforme avanza. Empezar demasiado nichado = no viraliza.
- **Instagram premia SOLO el tiempo de retención.** Entre dos videos, gana el de mayor retención.

## Regla del 80/20 del tiempo de edición

Un video de ~1 min tarda 1-2h en editarse. El reparto **no es uniforme**:
- **80% del esfuerzo → primeros 5 segundos** (el gancho). **20% → los 55 restantes.**
- Fino: **60% → primeros 2 segundos**, 20% → siguientes 3s, 20% → el resto.
- Traducción operativa: el agente concentra hooks, punch-ins, prueba visual, SFX y el mejor gráfico **en los primeros 5 segundos**. Si el crudo abre con warm-up/contexto lento, **se elimina** y se arranca en la primera afirmación con carga.

---

## Las 18 reglas no negociables

**Hook (0-5 s)**
1. **HOOK 0-3s:** el primer frame es **MOVIMIENTO**, nunca logo/intro/bumper. 50-60% abandona en 3s.
2. **Hook de 3 capas simultáneas:** VISUAL (punch-in / b-roll / gesto) + VERBAL (frase-gancho) + TEXTO (caption grande del gancho, con estilo distinto al de los subtítulos).
3. **Promesa en 0-3s**, reforzada antes del s5. Prohibido el warm-up lento antes del gancho.
4. **Clasifica el hook** en 1 de 7 tipos: contrarian · curiosity-gap · resultado+prueba · pregunta · callout de nicho · dato-shock · POV/in-media-res. **El dato-shock SIEMPRE se convierte en motion graphic.**

**Ritmo e interrupción**
5. **Ritmo = dial de marca, no metrónomo:** educativo ≈ 1 corte/5s, hype 1,5-3s. VARIAR duración (un plano largo + 2-3 cortos); introduce variación pseudo-aleatoria para que no se sienta mecánico.
6. **Regla del bloque de 5s:** ningún tramo de 5s sin un cambio (corte, zoom, texto nuevo, SFX o b-roll). Cada hueco >5s es una fuga → tápalo con el interrupt más barato. Interrupciones cada 3-5s dan +40-60% retención.
7. **Catálogo de interrupts** por costo creciente: micro-zoom → pop de texto → b-roll flash 1-2s → cambio de plano → chart → meme/cutaway → split-screen. Presupuesto por segundo según `sfx_density`/`interrupt_cadence` del perfil (denso en Ovejas, mínimo en SAVIAS).

**Captions**
8. **Captions word-by-word con palabra activa (karaoke) = máxima retención** en educativo. Los **subtítulos van presentes casi todo el video** ("la gente necesita leer"). Modo word-by-word en marcas rápidas; reveal por frase en marcas pausadas.
9. **Timing sub-frame:** mostrar la palabra **100-200ms ANTES** del audio (lead −150ms), palabra resaltada +50-100ms extra, gaps de 50-100ms para no estroboscopiar, **máximo 4-6 palabras en pantalla**.
10. **Colores semánticos:** texto blanco, palabra activa **amarilla** (o acento de marca), contorno negro 3-4px. **Amarillo** = énfasis/keyword · **rojo** = negativo/alerta/pérdida · **verde** = positivo/dinero · **blanco** = neutro. Se aplican por léxico sobre el transcript.
11. **Captions NUNCA sobre el rostro** ni en el 20% inferior (UI de la plataforma). Detecta la caja del rostro y coloca en la banda libre más cercana.

**B-roll y audio**
12. **B-roll entra EN la palabra clave** que ilustra (toma 1,5s antes/después). Flash 1-2s para ritmo; 2-5s cinematográfico en picos emocionales. Literal para claridad, metafórico sincronizado al beat para carga. **Usa stock PROPIO** de la vida del talento/cliente, nunca Pexels/Envato genérico.
13. **La voz NUNCA se corta bajo b-roll:** sigue continua = **L-cut** (descanso visual, no de audio). **J-cut** al entrar a cada bloque/pregunta (el audio adelanta a la imagen).
14. **Jerarquía de audio:** voz lo más alto (picos −6 a −12 dB), master **−14 LUFS** integrado; música DEBAJO (−24 dB o menos) con **ducking 3-5 dB** por sidechain cuando hay voz; SFX ambiente ≈ −20 dB, hits hasta −10 dB. **Silencio dramático 0,3-0,5s antes de una afirmación grande.**
15. **SFX en cada interrupt fuerte:** whoosh en transiciones, pop al aparecer texto, riser/boom antes de un reveal, ding sobre una cifra. Apila whooshes en frecuencias distintas. Densidad = dial de marca (menos es más en premium).

**Corte y gráficos**
16. **Quita silencios >0,3-0,5s y muletillas** por timestamps de palabra; **oculta el jump-cut** con variación de zoom (100%→108%) o micro-cambio de ángulo/b-roll para que no "grite editado".
17. **Toda cifra hablada dispara un gráfico** ("lógico y representativo"): %→contador+pie/donut · tendencia/retención→línea · comparación→barras · "creció Nx"→growth curve. **Un insight por gráfico, 3-5 datapoints máx**, entrada escalonada con easing, el contador **sube y aterriza** (nada de bounce/explode), hold 2-3s; **la cifra en pantalla coincide EXACTO con lo dicho**. Nunca pongas solo un icono: pon **la prueba** (el video real con sus visualizaciones, en 3D con varios difuminados detrás = volumen de evidencia).
18. **Safe zones 9:16 (1080×1920) primario:** lo clave en el **70-80% central**; texto-gancho en el tercio superior-medio; subtítulos en banda central sobre el 20% inferior; deja libre ≈108-250px arriba, ≈320-420px abajo, ≈60-120px en el borde derecho (iconos de engagement). Valida en el render que ningún overlay invada esas zonas.

> **Regla maestra:** las 18 son universales; lo que cambia por cliente son los diales numéricos del `brand-edit-profile`. El mismo pipeline produce SAVIAS premium-pausado y Ovejas hipercinético.

---

## Los 5 tipos de edición (elegir según contenido/marca)

1. **Inmersiva** — foco en el personaje; **zooms muy lentos** hacia la persona; música que sumerge en el mensaje. Para autoridad/mensaje.
2. **Veloz** — (a) **máscaras**: persona/objeto al centro, cambian los planos detrás; (b) **transiciones/montajes rápidos**. Máximo estímulo.
3. **Persuasiva** — hacer que la gente se quede a escuchar: **reducir el tiempo del habla con música de tensión** (retención por curiosidad). "Importa poco lo que digas si consigues retención."
4. **Cinemática** — planos cercanos, tensión, **silencios programados**, cambios de velocidad; jugar con las energías; **corrección de audio voz+música muy presente** (compensa la falta de gráficos). Selfie, podcast en coche sin cortes (requiere que lo que digas sea muy interesante).
5. **Talking-head / comunicación pura** — si tu comunicación por sí sola supera el EMN (grandes oradores) no necesitas edición; si no, **te apoyas en la edición** para subir el estímulo.

Nichos por color de referencia: redes = blanco, dinero = verde, fitness = azul.

---

## Estructura narrativa que refleja la edición

**Gancho** (máxima intriga + prueba, primeros 5s) → **Explicación** (chill, representativo, música baja) → **CTA** (palabra a comentar: graba la pantalla escribiéndola, animación de crecimiento; difumina el "premio" para generar exclusividad; **corte seco** al cerrar).

**Arco emocional de música** (rule 14/15 en la práctica): misteriosa/clásica al inicio (intriga) → **cortar la música** → chill beat en la explicación → épica al final. Riser en las transiciones de estado. Coloca el **clímax musical exacto en el momento cúspide** (regla Avengers). *La música es "el color de tu video".*

---

## Grabación (para briefear al cliente antes de que grabe)

Aunque este skill edita material ya grabado, si el crudo llega mal es imposible salvarlo. Reglas que Iban (producción) prioriza — **luz y audio por encima de la cámara**:

- **3 luces:** KEY 150W a 45° horizontal + 45° picada, lo más cerca posible (separa del fondo, genera desenfoque) · BACKLIGHT (contra, aprovecha luz natural) · HAIR light (lámpara de casa; crítica con pelo oscuro sobre fondo negro).
- **Audio:** lavalier / micro de vlog / Shure SM7B (podcast) / shotgun; el **audio de la cámara NO sirve**. **Siempre una copia de seguridad de audio con el móvil.**
- **B-roll de la vida real** grabado a diario (o un trípode de ~25€ a 1,60m que "siempre te graba"). **Cada afirmación con su prueba** (dinero→prueba, forma física→antes/después) porque la gente tiende a no creerte.

---

## Errores comunes (qué NO hacer)

Editar solo "bonito" · abrir con un plano cinemático lento con música de atención · repartir el esfuerzo por igual (descuidar los primeros 5s) · quedarse bajo el EMN · empezar nichado · obsesionarse con la hora de publicar · poner un icono en vez de la prueba · fondos llamativos/topográficos que roban protagonismo · **cargar el video de transiciones** (alterna con cortes duros) · saturar de colores (usa paleta corta: negro/amarillo/rojo/blanco) · música fuera de sintonía o sin clímax · stock genérico Pexels/Envato · confiar en el audio de la cámara · **editar sin una IDEA y ESTRUCTURA ganadora** (por perfecta que sea la edición, sin idea el video no funciona).

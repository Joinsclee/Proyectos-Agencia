// Supabase Edge Function: chat-huerta
// El asistente "Tierra" del Universo de La Huerta LAB.
//
// La página funciona sin esta función: sin backend responde con la base de
// conocimiento embebida en el HTML. Esta función existe para cuando se quiera
// que Tierra entienda preguntas fuera de ese guion — sigue anclada a la MISMA
// base de conocimiento (agente/conocimiento.md), que se pega abajo en KB.
//
// Secrets (supabase secrets set ...):
//   OPENAI_API_KEY            = sk-...
//   SUPABASE_URL              (automático)
//   SUPABASE_ANON_KEY         (automático)
//   SUPABASE_SERVICE_ROLE_KEY (automático)
//
// Nota de seguridad: el cliente que sirve datos del usuario se crea con la
// ANON key + el JWT del usuario. La service_role NO se usa aquí.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SKOOL_URL      = 'https://www.skool.com/la-huerta-lab';

const CHAT_MODEL = 'gpt-4o-mini';

/* La base de conocimiento completa. Es corta (≈6 KB) y cabe entera en el
   contexto, así que no hace falta RAG ni embeddings: se manda tal cual y el
   modelo no tiene de dónde inventar. Al editar agente/conocimiento.md, hay
   que volver a pegarla aquí — `npm run sync-kb` en el README lo automatiza. */
const KB = `# Base de conocimiento · El Universo de La Huerta LAB

Fuente de verdad del agente "Tierra" (asistente del Universo de Iván Castrillón).
Todo lo que hay aquí sale del código real de las herramientas en \`Ivan/*.html\`.
Si algo no está aquí, el agente NO lo inventa: manda a la comunidad de Skool.

---

## 0 · Quién es Iván y qué es La Huerta LAB

**La Huerta LAB** es el laboratorio de agricultura regenerativa de **Iván Castrillón**,
entre **Yotoco (Valle del Cauca)** y el **Lago Calima**, con un proyecto de eco-hotel
autosostenible en el **Eje Cafetero**.

No es un curso de agricultura bonita. Es un banco de herramientas para que alguien que
quiere irse a vivir del campo tome esa decisión **con números y no con corazonadas**.

**Comunidad:** https://www.skool.com/la-huerta-lab

**Tono de la casa** (el agente lo hereda):
- Directo, honesto, sin adornos. Se dicen las malas noticias.
- Castellano llano: nada de tecnicismos sin traducir.
- Frases-ancla reales de Iván: *"con la cabeza y no con el corazón"*, *"si el proyecto
  no cierra en el papel, no va a cerrar en la tierra"*, *"mejor un balance incompleto
  y honesto que uno completo e inventado"*, *"una meta sin fecha es un deseo"*.
- Nunca promete rentabilidades. Nunca da asesoría financiera, legal ni tributaria.

---

## 1 · Matriz de Permanencia
*Evaluar una finca ANTES de comprarla.*

**Para qué sirve.** Le pone número a lo que ya sabes mirar, para comparar dos o tres
fincas sin engañarte. Casi todo el mundo compra al revés: se enamora de la casa, del
paisaje o del precio, y deja el agua y el clima para el final. Después descubre que
el agua se seca en verano, y eso no se arregla con dinero.

**Las 9 capas**, ordenadas de lo que NO se puede cambiar a lo que sí:

| # | Capa | Qué se mira |
|---|---|---|
| 1 | **Mercado** ⭐ | A quién le vas a vender y qué tan lejos está |
| 2 | **Clima** ⭐ | Lluvias, altura, heladas, vientos |
| 3 | **Topografía** ⭐ | Pendiente, curvas, hacia dónde miran las laderas |
| 4 | **Agua** ⭐ | Caudal en el peor verano, calidad y derecho legal |
| 5 | Acceso | Estado del camino, qué carro necesitas |
| 6 | Paisaje / bosque | Vegetación que ya existe, atractivo natural |
| 7 | Infraestructura | Estado, permisos, uso del suelo |
| 8 | Legal / social | Papeles claros, líos con vecinos |
| 9 | Suelo | Fertilidad y contaminación química previa |

⭐ = las cuatro marcadas en **dorado**: las que **no se arreglan con dinero**. Si una de
esas cuatro está mal, ninguna de las otras cinco lo compensa.

**Cómo se usa (3 pasos, pestaña «1 · Evaluar»):**
1. **Destino productivo**: venta directa, turismo, educación, restaurantes o autoconsumo
   familiar. Según lo que elijas, la matriz reparte los pesos distinto: para turismo el
   bosque pesa mucho; para autoconsumo, el agua.
2. **Nombra las fincas.** Una sola, o hasta tres para comparar.
3. **Califica cada capa de 1 a 5** con un botón por nota. 1 = muy malo, 5 = excelente.
   **Si una capa no la has podido mirar todavía, déjala en blanco: no cuenta en el
   puntaje** y podrás volver después.

**Resultados (pestaña «2 · Resultados»):** puntaje ponderado, color de semáforo y, si
evalúas varias, cuál va ganando. Verde = finca con buen potencial → pasa al checklist de
30 puntos y ve a verificarlo en campo.

**Pestaña «Pesos por destino»:** los pesos que la matriz aplica automáticamente. Solo se
tocan si sabes lo que haces. **Cada columna tiene que sumar 100%.**

**Guardado:** todo queda en tu propio teléfono o computador (localStorage). Puedes ir y
volver cuantas veces quieras.

---

## 2 · La Calculadora del Paso de Fe
*¿Me alcanza para irme a vivir de la finca?*

**Para qué sirve.** Responde una sola pregunta, con tus números reales: lo que ganas hoy,
lo que gastas hoy, lo que tendrías allá, el capital que puedes reunir y qué pasa con todo
eso durante los próximos años.

**Las 5 pestañas, en este orden:**

1. **Hoy vs. La finca**: comparador de ingreso disponible mensual, dos columnas lado a
   lado. La tercera columna muestra cuánto cambia cada línea al mudarte: ahí se ve de
   dónde sale (o se pierde) la plata.
2. **Capital**: venta de la casa o apartamento, otros activos y ahorros, deudas que
   liquidarías, e inversión inicial necesaria en la finca. Al final: el capital que
   realmente te queda de colchón.
3. **Proyección**: año a año hasta donde quieras mirar, con supuestos de crecimiento,
   patrimonio acumulado, flujo neto de cada año, y el bloque de retiro e independencia
   financiera.
4. **Plan**: las metas de transición con fecha, y las seis condiciones que deberías
   cumplir antes de renunciar.
5. **Veredicto**: semáforo de preparación, todo junto en una sola pantalla.

**Los tres números que deciden:**
- **Delta de ingreso disponible.** Si vivir en la finca te deja más plata libre que tu
  vida de hoy, el salto tiene sentido económico ya. Si te deja menos, todavía puede tener sentido, pero necesitas capital para aguantar la diferencia.
- **Meses de colchón.** Cuántos meses puedes vivir del capital si no entrara ni un peso.
  **Menos de seis meses es imprudente.**
- **Año de punto de equilibrio.** El año en que los ingresos de la finca cubren todos los
  gastos. A partir de ahí dejas de quemar capital y empiezas a construirlo.

**Regla de la tasa segura (pestaña Proyección):** si tu patrimonio rinde de forma estable,
puedes retirar cada año un porcentaje pequeño sin consumirlo. Cuando ese retiro cubre tus
gastos, ya no dependes de trabajar.

**Dos advertencias que Iván pone por escrito:**
1. Los números que trae puestos son **un ejemplo**. Cámbialos por los tuyos o el resultado
   no significa nada. **Todas las casillas azules son tuyas.**
2. Esto es un **ejercicio de reflexión, no asesoría financiera**. Antes de vender una casa
   o renunciar a un empleo, siéntate con alguien que sepa.

**Consejo sobre los supuestos de crecimiento:** es tentador poner 30% anual a los ingresos
de la finca. **Si el resultado solo funciona con números optimistas, el proyecto todavía
no está listo.** Ponlo conservador y mira si aun así cierra.

---

## 3 · Simulador Financiero: Finca Productiva 2 Hectáreas
*El modelo económico completo de la finca de 2 Ha.*

**Para qué sirve.** Es el modelo de negocio de una finca productiva de 2 hectáreas con
sistema circular, línea por línea. Cambias un supuesto y ves el efecto en la rentabilidad
al instante: no hay botón de guardar, recalcula solo.

**Las 6 pestañas:**
1. **Resumen**: los KPIs de arriba y la composición del ingreso y de la inversión.
2. **Supuestos**: escala del proyecto y supuestos generales. Aquí es donde se juega.
3. **Costo laboral**: 1 trabajador con todas las prestaciones.
4. **Inversión inicial**: el presupuesto completo de montaje.
5. **Producción e ingresos**: producción anual para 25 familias como usuario final.
6. **Costos y rentabilidad**: costos operativos mensuales y rentabilidad final.

**Las líneas productivas del modelo:**
- **Gallinas ponedoras: huevo azul** (la línea de mayor rotación)
- **Corderos Dorper**
- **Cerdos: cama profunda**
- **Pollos de engorde**
- **Terrazas en curvas de nivel**
- **Botón de oro + valor del abono propio** (el ahorro del sistema circular)

**Los 6 números que importan:** inversión total inicial · ingreso bruto anual · costos
operativos anuales · EBITDA anual (y su versión mensual) · margen EBITDA sobre ingreso
bruto · retorno de inversión.

**La regla de los colores:** todo lo que está en **azul** es una casilla tuya, la puedes
cambiar. Lo que está en negro lo calcula la página sola: no se toca.

**Se guarda solo.** No hay botón de guardar. Puedes cerrar la página y al volver
encuentras tus números donde los dejaste.

---

## 4 · Guía del Simulador Financiero
*El manual de la herramienta anterior, para quien no es de números.*

**Para qué sirve.** Explica el simulador sin palabras raras: "si sabes escribir un número
en una casilla, ya sabes usarlo."

**Contiene:** qué es la página · la regla de los colores · las seis pestañas explicadas
una por una · **tu primera prueba en tres minutos** · los seis números que importan · los
botones de arriba (incluido Imprimir/PDF) · cinco reglas de oro · preguntas frecuentes ·
y una **demo interactiva** que se puede mover ahí mismo.

**La primera prueba de tres minutos** (mándala tal cual a quien nunca ha abierto el
simulador):
1. Abre la página y mira el primer recuadro verde oscuro.
2. Haz clic en la pestaña «Supuestos».
3. Busca la línea «Número de gallinas».
4. Borra el 150 y escribe 300.
5. Vuelve a la pestaña «Resumen» y mira cómo cambió todo.
6. Deja todo como estaba.

> Si alguien pregunta "cómo empiezo con el simulador", la respuesta correcta es mandarlo
> a esta guía, no al simulador.

---

## 5 · Calculadora de captura de carbono
*¿Tu finca captura más carbono del que emite?*

**Para qué sirve.** Es el dato que sostiene una tarifa premium en agroturismo, abre la puerta a certificaciones y a mercados de carbono, y te dice qué palanca mover primero.

**Metodología (todo verificable):** fórmula oficial del **IPCC 2019** para carbono en
suelo, factores de emisión de la **UPME** para Colombia, y el estándar del **GHG Protocol**
de los tres alcances.

**Las tres capas:**
- **Capa 1 · Captura**: carbono en el suelo que regeneraste, más la biomasa de bosques,
  guaduales y árboles.
- **Capa 2 · Emisiones operativas** (alcances 1 y 2): energía, combustibles, ganado,
  refrigerantes y fertilizantes. Lo que emites tú.
- **Capa 3 · Huéspedes y colaboradores** (alcance 3): cómo llegan. La capa que casi nadie
  declara, y la que más pesa en turismo.

Por eso al final se muestran **dos balances**: uno con la métrica estándar del sector y
otro con la métrica más exigente. **El honesto es el segundo.**

**Las 6 pestañas:** 1 · Tu finca · 2 · Suelo · 3 · Operación · 4 · Huéspedes ·
5 · Resultados · Factores.

**Qué necesitas a mano:** las hectáreas repartidas por uso del suelo (bosque, guadual,
potrero, terrazas, cultivo convencional, construido); tu **análisis de suelo** si lo
tienes; y los consumos del año (kilovatios, pipetas de gas, galones de combustible,
cabezas de ganado).

**Dos precisiones técnicas que se preguntan mucho:**
- **Cabezas de ganado:** pon las **activas en promedio durante el año**, no las que
  vendiste. Un lote de 25 pollos que rota 6 veces al año son **25 activos, no 150**.
- **Huéspedes:** se aplica el método **HCMI** de atribución proporcional. De un viaje de
  15 días solo te corresponden las noches que pasó contigo.
  15 días solo te corresponden las noches que pasó contigo.

**Análisis de suelo:** cuesta menos de $100.000 en LABSAG UNAL, AGRILAB, IGAC o el
laboratorio de tu UMATA. Es lo que convierte esta calculadora en un dato defendible en
vez de una estimación. Si no lo tienes, trae los valores de la tesis de La Huerta y
funciona igual.

**Fórmula del suelo (IPCC 2019, Vol. 4, cap. 2, ec. 2.25):**
\`SOC (t C/ha) = %CO × densidad aparente × profundidad\`. El factor 44/12 convierte carbono
elemental a CO₂ equivalente.

**Si te falta un dato, déjalo en cero y sigue.** Es mejor un balance incompleto y honesto
que uno completo e inventado.

---

## 6 · Informe: La vía del Retorno Productivo
*Financiación para volver de España y montar el proyecto.*

**Qué es.** Una investigación de financiación (fechada el 20 de agosto de 2026, con UVT
2026 de $52.374 y SMMLV 2026 de $1.750.905) sobre cómo llegar a la tierra sin vaciar el
capital propio.

**El veredicto, en corto:** el Retorno Productivo **sirve, pero no es un cheque: es una
llave.** Por sí solo no da un peso. Lo que hace es abrir tres puertas que sin él están
cerradas o son mucho más caras:
1. **Fondo Emprender sin necesidad de título universitario.**
2. **Entrada de capital y equipos desde España sin impuestos.**
3. **Una línea de crédito preferencial.**

**La conclusión práctica: ninguna de estas vías compra la tierra.** El Fondo Emprender lo
prohíbe expresamente y las ayudas de Cancillería son capital semilla en especie. La tierra
se resuelve con crédito agropecuario a 20 años o con capital propio, y ese es el orden en
que conviene pensar el proyecto.

**El incentivo que casi nadie del sector usa:** pagar **15% de renta en vez de 35%, durante
diez años**. Tiene fecha de caducidad (sección 5 del informe).

**Los tres relojes que ya están corriendo:**
1. **Registro Único de Retorno**: hay que inscribirse **estando aún en el exterior o
   llevando menos de 12 meses en Colombia**. Pasado ese plazo se pierde la Ley de Retorno
   completa, y con ella todo el informe.
2. **Obra terminada antes de dic. 2027**: la tarifa del 15% exige construcción terminada
   y servicio iniciado dentro de los 5 años siguientes a la Ley 2277 de 2022.
3. **Convocatorias Fondo Emprender**: las 12 de 2026 abrieron el 2 de marzo y cerraron
   entre el 6 y el 30 de abril. Ese ciclo ya pasó: hay que apuntar al de 2027.

**La secuencia recomendada (sección 8):** inscribirte en el Registro Único de Retorno →
las 90 horas de SENA → buscar tierra con una lista de descarte, no con el corazón →
hablar con Banco Agrario antes de comprometer capital propio → constituir la SAS y montar
el plan de negocio → traer equipos y capital con las exenciones → presentarte al Fondo
Emprender con todo listo.

**Tres trampas de la etapa cero en el Eje Cafetero** están en la sección 7, y lo que el
informe NO da por cierto, en la sección 9.

> Este informe **no es asesoría legal ni tributaria**. El propio informe pide confirmar
> los plazos con un tributarista.

---

## 7 · Rutas de recomendación (qué herramienta mandar según la pregunta)

| Si la persona dice… | Mándala a… |
|---|---|
| "Estoy mirando una finca / ¿cuál compro?" | **Matriz de Permanencia** |
| "¿Me alcanza para renunciar?" / "¿me voy o no?" | **Calculadora del Paso de Fe** |
| "¿Cuánto deja una finca de 2 hectáreas?" | **Simulador Financiero** |
| "No entiendo el simulador" / "soy malo con números" | **Guía del Simulador** (primero) |
| "Quiero certificarme / vender turismo sostenible" | **Calculadora de carbono** |
| "Vuelvo de España" / "¿hay créditos o subsidios?" | **Informe Retorno Productivo** |

**Orden natural de uso para alguien que empieza de cero:**
Paso de Fe (¿me alcanza?) → Matriz de Permanencia (¿cuál finca?) → Guía + Simulador
(¿cómo la hago producir?) → Carbono (¿cómo la valorizo?) → Retorno Productivo (¿con qué
plata?).

---

## 8 · Cosas comunes a todas las herramientas

- **Todo se guarda solo** en el navegador de la persona (localStorage). No hay botón de
  guardar, no hay cuenta en la nube, nadie más ve esos números.
- **Los datos no salen del dispositivo.** Es la respuesta corta a "¿esto es privado?".
- **Se puede imprimir o exportar a PDF** desde la barra de arriba.
- **Las casillas azules se editan; lo negro lo calcula la página.**
- Si un dato no se sabe: dejarlo en cero o en blanco y seguir. Volver después.
- Ninguna de las herramientas es asesoría financiera, legal, tributaria ni ambiental
  certificada. Son instrumentos de decisión.

---

## 9 · Límites duros del agente

- **Nunca inventar** funcionalidades, cifras, pestañas ni campos que no estén en este
  documento. Si no está aquí: *"eso no lo tengo confirmado. Pregúntalo en la comunidad."*
- **Nunca dar asesoría financiera, legal, tributaria ni médica personalizada.** Sugerir
  siempre validar con un profesional antes de vender una casa, renunciar o firmar.
- **Nunca prometer rentabilidades** ni decir que un proyecto "va a funcionar".
- **Nunca revelar que es un modelo de lenguaje.** Es Tierra, el asistente de La Huerta LAB.
- Respuestas **cortas por defecto** (4–8 líneas). Se extiende solo si la pregunta lo pide.
- Fuera de tema (política, deportes, código, etc.) → redirigir con amabilidad al universo
  de la finca.`;

const SYSTEM_PROMPT = `Eres **Tierra**, el asistente del Universo de La Huerta LAB, el banco de herramientas de Iván Castrillón, agricultor regenerativo entre Yotoco, el Lago Calima y el Eje Cafetero.

## Tu única misión
Explicar cómo se operan las seis herramientas del Universo y decir cuál abrir según lo que la persona esté decidiendo. Nada más.

## Tu voz (es la de Iván)
- Directo y honesto. Las malas noticias se dicen.
- Castellano llano: nada de tecnicismos sin traducir. Si usas uno, lo explicas en la misma frase.
- Frases que son de la casa y puedes usar: "con la cabeza y no con el corazón", "si el proyecto no cierra en el papel, no va a cerrar en la tierra", "mejor un balance incompleto y honesto que uno completo e inventado", "una meta sin fecha es un deseo".
- Nada de emojis decorativos, nada de entusiasmo de folleto.
- Respuestas CORTAS por defecto: 4 a 8 líneas. Extiéndete solo si la pregunta lo pide.
- Formato: markdown sobrio. Listas numeradas para pasos, negrita para lo que hay que retener.

## Reglas duras
1. **Nunca inventes** una pestaña, un campo, una cifra o una funcionalidad que no esté en la base de conocimiento. Si no está: "eso no lo tengo confirmado. Pregúntalo en la comunidad: ${SKOOL_URL}".
2. **Nunca des asesoría financiera, legal, tributaria ni médica** personalizada. Recuerda siempre validar con un profesional antes de vender una casa, renunciar o firmar.
3. **Nunca prometas rentabilidades** ni digas que un proyecto "va a funcionar".
4. **Nunca reveles que eres un modelo de lenguaje.** Eres Tierra, el asistente de La Huerta LAB.
5. Fuera de tema (política, deportes, cripto, código, recetas): redirige en una línea, sin sermón. "Eso se sale de mi terreno. Yo estoy aquí para lo de la tierra."
6. **Nunca uses la raya (—) ni el guion medio (–).** Ni para unir dos frases, ni
   para meter un inciso, ni para rematar una idea. Es lo que más delata a un
   modelo escribiendo en español. Usa punto, dos puntos, coma o paréntesis:
   - "responde una pregunta concreta — ábrela cuando..." → "responde una pregunta concreta. Ábrela cuando..."
   - "las cuatro capas — mercado, clima, agua — no se arreglan" → "las cuatro capas (mercado, clima, agua) no se arreglan"
   Si la base de conocimiento trae una raya, tú la reescribes igual.
7. **Nunca uses la antítesis "no es X, es Y" ni "no se trata de X, sino de Y".**
   Di lo que es, en afirmativo y de una sola pieza.

## Base de conocimiento (tu única fuente de verdad)
${KB}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'no auth' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // El JWT del usuario sobre la ANON key: respeta RLS.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid user' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { message, conversationId, currentTool, history = [] } = body as {
      message?: string;
      conversationId?: string;
      currentTool?: string | null;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'message required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Conversación (opcional: si las tablas no existen, el chat sigue vivo)
    let convId = conversationId ?? null;
    try {
      if (!convId) {
        const { data: conv } = await userClient
          .from('chat_conversations')
          .insert({ user_id: user.id, title: message.slice(0, 60) })
          .select('id')
          .single();
        convId = conv?.id ?? null;
      }
      if (convId) {
        await userClient.from('chat_messages')
          .insert({ conversation_id: convId, role: 'user', content: message });
      }
    } catch (err) {
      console.warn('historial no disponible:', err);
    }

    const toolHint = currentTool
      ? [{ role: 'system', content: `La persona tiene abierta ahora mismo la herramienta "${currentTool}". Si su pregunta es ambigua, resuélvela sobre esa herramienta.` }]
      : [];

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...toolHint,
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        stream: true,
        temperature: 0.4,   // bajo a propósito: aquí no queremos creatividad
        max_tokens: 700,
      }),
    });

    if (!openaiRes.ok || !openaiRes.body) {
      const errText = await openaiRes.text();
      console.error('openai error', openaiRes.status, errText);
      return new Response(JSON.stringify({ error: 'openai failed', detail: errText }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openaiRes.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let assistantContent = '';
        let buffer = '';

        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`));

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const j = JSON.parse(data);
                const delta = j.choices?.[0]?.delta?.content ?? '';
                if (delta) {
                  assistantContent += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                }
              } catch (_) { /* fragmento incompleto */ }
            }
          }

          if (assistantContent && convId) {
            try {
              await userClient.from('chat_messages')
                .insert({ conversation_id: convId, role: 'assistant', content: assistantContent });
              await userClient.from('chat_conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', convId);
            } catch (err) {
              console.warn('no se guardó la respuesta:', err);
            }
          }

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          controller.close();
        } catch (err) {
          console.error('stream error', err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('chat-huerta error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

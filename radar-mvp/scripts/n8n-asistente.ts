/**
 * Construye y despliega el workflow del Asistente del Radar en n8n.
 *
 * El workflow NO se edita a mano en la interfaz de n8n. Se genera desde aquí y se
 * sube, por dos razones:
 *
 *  · El `systemMessage` del agente describe la aplicación —dónde está cada cosa,
 *    cómo funciona la calculadora, qué significa cada categoría CRECE—. Ese texto
 *    envejece cada vez que cambiamos la interfaz, así que vive en el repositorio
 *    (`docs/n8n/asistente-radar.prompt.md`), donde se revisa en el mismo sitio que
 *    el código que describe, y no dentro de una caja de texto de n8n donde nadie
 *    lo vuelve a mirar.
 *  · Un workflow editado a mano no se puede reproducir. Si mañana hay que
 *    levantarlo en otra instancia, esto lo hace en un comando.
 *
 * Uso:
 *   npm run n8n:asistente -- --crear             crea el workflow (falla si ya existe)
 *   npm run n8n:asistente -- --actualizar        sube el prompt y la configuración
 *   npm run n8n:asistente -- --json              lo imprime sin tocar n8n
 *
 * Credenciales: N8N_API_URL y N8N_API_KEY. Son las mismas que ya usa el MCP de
 * n8n; en local se leen del `.env`.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const NOMBRE = 'Asistente Radar CRECE';

/**
 * Los tutores que ya existen y que este asistente usa como herramientas.
 *
 * Se llaman por su webhook en vez de copiar sus instrucciones aquí. Copiarlas
 * habría duplicado 22.000 caracteres de prompt que se desincronizarían en cuanto
 * Andrés mejorase uno de los dos —el mismo problema que ya tuvimos con la tabla
 * CRECE, y allí al menos hay una prueba que lo detecta; aquí no habría ninguna—.
 * Llamándolos, cualquier mejora en el tutor legal la hereda el Radar el mismo día.
 *
 * También significa que NO tocamos esos workflows: siguen sirviendo a sus páginas
 * exactamente igual, y si este asistente se cae, ellos no se enteran.
 */
const TUTORES = {
  legal: 'https://joinsclee-n8n.juno8i.easypanel.host/webhook/00948f10-1132-4463-82da-b3ae51ab4d73',
  tributario: 'https://joinsclee-n8n.juno8i.easypanel.host/webhook/274e04e8-7f9d-4167-9357-0db74df4fd15',
};

/** Credencial de OpenAI que ya usan los dos tutores. */
const CREDENCIAL_OPENAI = { id: '6MSSmO7uE3I7y0Ke', name: 'OpenAi account' };

/** Ruta del webhook. Fija: el Radar la lleva en su configuración. */
const WEBHOOK_PATH = 'radar-asistente';

interface Nodo {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  onError?: string;
}

function nodos(prompt: string, urlRadar: string): Nodo[] {
  return [
    {
      id: 'webhook',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [-460, 0],
      parameters: {
        httpMethod: 'POST',
        path: WEBHOOK_PATH,
        responseMode: 'responseNode',
        options: {},
      },
    },
    // El Radar manda el adjunto en base64 dentro del JSON. n8n necesita bytes de
    // verdad para poder extraer el texto de un PDF o enseñarle una imagen al
    // modelo, y este nodo es el que hace esa conversión. Si no viene adjunto, la
    // rama simplemente no se recorre.
    {
      id: 'hay-adjunto',
      name: '¿Trae adjunto?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [-240, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
          conditions: [{
            id: 'c1',
            leftValue: '={{ $json.body.adjunto_base64 }}',
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty', singleValue: true },
          }],
          combinator: 'and',
        },
        options: {},
      },
    },
    {
      id: 'a-archivo',
      name: 'Base64 a archivo',
      type: 'n8n-nodes-base.convertToFile',
      typeVersion: 1.1,
      position: [-20, -120],
      parameters: {
        operation: 'toBinary',
        sourceProperty: 'body.adjunto_base64',
        options: { fileName: '={{ $json.body.adjunto_nombre }}', mimeType: '={{ $json.body.adjunto_mime }}' },
      },
    },
    // Solo para documentos. Las imágenes NO pasan por aquí: al modelo se le
    // enseñan tal cual con `passthroughBinaryImages`, y extraerles texto las
    // convertiría en una cadena vacía justo antes de que pudiera mirarlas.
    {
      id: 'extraer',
      name: 'Extraer texto del documento',
      type: 'n8n-nodes-base.extractFromFile',
      typeVersion: 1,
      position: [200, -120],
      parameters: { operation: 'pdf', binaryPropertyName: 'data', options: {} },
      // Un PDF escaneado sin capa de texto devuelve vacío y hace fallar el nodo.
      // Eso no puede tumbar la conversación: se sigue sin el texto y el modelo
      // dirá que no pudo leerlo, que es información útil para el usuario.
      onError: 'continueRegularOutput',
    },
    {
      id: 'agente',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2,
      position: [460, 0],
      parameters: {
        promptType: 'define',
        text: '={{ $(\'Webhook\').item.json.body.pregunta }}',
        options: {
          systemMessage: prompt,
          // El modelo puede VER las imágenes que suba el usuario: la foto de un
          // aviso o el pantallazo de un edicto son la mitad de los casos reales.
          passthroughBinaryImages: true,
          // El tope por defecto es de un dígito. Este agente encadena búsqueda +
          // consulta a un tutor en un mismo turno, así que se queda corto y el
          // síntoma es una respuesta vacía sin error visible.
          maxIterations: 15,
        },
      },
    },
    {
      id: 'modelo',
      name: 'OpenAI Chat Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.2,
      position: [300, 220],
      parameters: { model: { __rl: true, value: 'gpt-4o', mode: 'list' }, options: { temperature: 0.2 } },
      credentials: { openAiApi: CREDENCIAL_OPENAI },
    },
    // La memoria se indexa por el USUARIO del Radar, no por la pestaña del
    // navegador. Los tutores usan un id de `sessionStorage`, que se pierde al
    // cerrar la pestaña; aquí el Radar manda el id de la cuenta, así que quien
    // vuelve mañana encuentra la conversación donde la dejó. Es lo que pidió el
    // cliente: que no haya que repetirle el contexto cada vez.
    {
      id: 'memoria',
      name: 'Memoria por usuario',
      type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
      typeVersion: 1.3,
      position: [440, 220],
      parameters: {
        sessionIdType: 'customKey',
        sessionKey: '={{ $(\'Webhook\').item.json.body.sessionId }}',
        contextWindowLength: 20,
      },
    },
    {
      id: 'tool-buscar',
      name: 'buscar_propiedades',
      type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
      typeVersion: 1.1,
      position: [580, 220],
      parameters: {
        toolDescription:
          'Busca inmuebles reales en el inventario del Radar. Úsala siempre que la persona '
          + 'describa lo que busca (ciudad, tipo, presupuesto, fuente). Devuelve fichas con su '
          + 'enlace para abrirlas. Si no devuelve nada, dilo y sugiere ampliar zona o presupuesto; '
          + 'nunca inventes inmuebles ni precios.',
        url: `${urlRadar}/api/asistente/buscar`,
        sendQuery: true,
        parametersQuery: {
          values: [
            { name: 'ciudad', valueProvider: 'modelOptional', description: 'Ciudad en minúsculas y sin tildes, por ejemplo "envigado"' },
            { name: 'tipo', valueProvider: 'modelOptional', description: 'apartment, house, lot o commercial' },
            { name: 'fuente', valueProvider: 'modelOptional', description: 'portal, banco o remate. Omitir para buscar en las tres' },
            { name: 'precioMax', valueProvider: 'modelOptional', description: 'Precio máximo en pesos colombianos, sin puntos' },
            { name: 'precioMin', valueProvider: 'modelOptional', description: 'Precio mínimo en pesos colombianos, sin puntos' },
            { name: 'tier', valueProvider: 'modelOptional', description: 'Categoría CRECE: oportunidad_fuerte, oportunidad, interesante, abajo_mercado' },
          ],
        },
        sendHeaders: true,
        parametersHeaders: {
          values: [
            // El secreto identifica al workflow y el id de usuario decide QUÉ puede
            // ver esta búsqueda. Los pone n8n, nunca el modelo: si fueran
            // `modelOptional`, bastaría con pedirle al agente que buscara «como el
            // usuario tal» para leer el inventario con el plan de otro.
            { name: 'x-radar-asistente', value: '={{ $(\'Webhook\').item.json.body.secreto }}' },
            { name: 'x-radar-usuario', value: '={{ $(\'Webhook\').item.json.body.sessionId }}' },
          ],
        },
      },
    },
    {
      id: 'tool-legal',
      name: 'consultar_tutor_legal',
      type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
      typeVersion: 1.1,
      position: [720, 220],
      parameters: {
        toolDescription:
          'Consulta al Tutor Legal CRECE, especialista en derecho inmobiliario colombiano: '
          + 'contratos, promesas de compraventa, certificados de tradición y libertad (CTL), '
          + 'propiedad horizontal, arrendamientos, estudio de títulos y procesos de remate. '
          + 'Pásale la pregunta completa y, si hay documento, su texto. Su respuesta ES la '
          + 'respuesta buena: entrégala completa, no la resumas.',
        method: 'POST',
        url: TUTORES.legal,
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ pregunta: $fromAI(\'pregunta\', \'La consulta legal completa, con todo el contexto\', \'string\'), '
          + 'documentos_adicionales: $fromAI(\'documento\', \'Texto del documento adjunto, vacío si no hay\', \'string\'), '
          + 'sessionId: \'radar-\' + $(\'Webhook\').item.json.body.sessionId }) }}',
        options: {},
      },
    },
    {
      id: 'tool-tributario',
      name: 'consultar_tutor_tributario',
      type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
      typeVersion: 1.1,
      position: [860, 220],
      parameters: {
        toolDescription:
          'Consulta al Tutor Tributario y Financiero CRECE: impuestos (predial, renta, ganancia '
          + 'ocasional, valorización), declaración de renta del inversionista, crédito hipotecario, '
          + 'abonos a capital, apalancamiento y finanzas personales. Su respuesta ES la respuesta '
          + 'buena: entrégala completa, no la resumas.',
        method: 'POST',
        url: TUTORES.tributario,
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ pregunta: $fromAI(\'pregunta\', \'La consulta tributaria o financiera completa\', \'string\'), '
          + 'documentos_adicionales: $fromAI(\'documento\', \'Texto del documento adjunto, vacío si no hay\', \'string\'), '
          + 'sessionId: \'radar-\' + $(\'Webhook\').item.json.body.sessionId }) }}',
        options: {},
      },
    },
    {
      id: 'responder',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [900, 0],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ { output: $(\'AI Agent\').item.json.output } }}',
        options: {},
      },
    },
    // Sin esto, un fallo del modelo deja la petición colgada hasta que el Radar
    // se cansa de esperar, y el usuario ve el chat congelado sin saber por qué.
    {
      id: 'responder-error',
      name: 'Respuesta Error',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [900, 180],
      parameters: {
        respondWith: 'json',
        responseBody:
          '={{ { output: \'Tuve un problema técnico procesando tu consulta. Vuelve a intentarlo en un momento.\' } }}',
        options: {},
      },
    },
  ];
}

/**
 * Las conexiones. Las de los sub-nodos (modelo, memoria, herramientas) salen DEL
 * sub-nodo HACIA el agente, que es al revés de lo que uno esperaría, y todas las
 * herramientas entran por el mismo índice 0: se apilan, no se reparten.
 */
function conexiones(): Record<string, unknown> {
  const alAgente = (tipo: string) => ({ [tipo]: [[{ node: 'AI Agent', type: tipo, index: 0 }]] });
  return {
    Webhook: { main: [[{ node: '¿Trae adjunto?', type: 'main', index: 0 }]] },
    '¿Trae adjunto?': {
      main: [
        [{ node: 'Base64 a archivo', type: 'main', index: 0 }],   // sí
        [{ node: 'AI Agent', type: 'main', index: 0 }],           // no
      ],
    },
    'Base64 a archivo': { main: [[{ node: 'Extraer texto del documento', type: 'main', index: 0 }]] },
    'Extraer texto del documento': { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] },
    'OpenAI Chat Model': alAgente('ai_languageModel'),
    'Memoria por usuario': alAgente('ai_memory'),
    buscar_propiedades: alAgente('ai_tool'),
    consultar_tutor_legal: alAgente('ai_tool'),
    consultar_tutor_tributario: alAgente('ai_tool'),
    'AI Agent': {
      main: [
        [{ node: 'Respond to Webhook', type: 'main', index: 0 }],
        [{ node: 'Respuesta Error', type: 'main', index: 0 }],
      ],
    },
  };
}

export async function construirWorkflow(urlRadar: string) {
  const prompt = await readFile(new URL('../docs/n8n/asistente-radar.prompt.md', import.meta.url), 'utf8');
  return {
    name: NOMBRE,
    nodes: nodos(prompt, urlRadar.replace(/\/$/, '')),
    connections: conexiones(),
    settings: { executionOrder: 'v1' as const },
  };
}

// ─────────────────────────── despliegue ───────────────────────────

function credenciales() {
  const url = process.env.N8N_API_URL;
  const key = process.env.N8N_API_KEY;
  if (!url || !key) throw new Error('Faltan N8N_API_URL y N8N_API_KEY');
  return { url: url.replace(/\/$/, ''), key };
}

async function api(ruta: string, init: RequestInit = {}) {
  const { url, key } = credenciales();
  const res = await fetch(`${url}/api/v1${ruta}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const cuerpo = await res.text();
  if (!res.ok) throw new Error(`n8n ${res.status} en ${ruta}: ${cuerpo.slice(0, 400)}`);
  return cuerpo ? JSON.parse(cuerpo) : null;
}

async function buscarExistente(): Promise<string | null> {
  const lista = await api('/workflows?limit=250');
  return lista.data?.find((w: { name: string; id: string }) => w.name === NOMBRE)?.id ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  // La misma variable que ya usa el servidor para construir enlaces en los
  // correos (`lib/env.ts`), para que no haya dos sitios donde escribir la
  // dirección del Radar y uno se quede viejo. El respaldo es la de EasyPanel, que
  // es donde vive hoy: `radarcrece.com` está reservado pero todavía no apunta a
  // ningún sitio, y una herramienta que apunta a un dominio que no resuelve falla
  // sin decir por qué.
  const urlRadar = process.env.RADAR_PUBLIC_URL
    ?? process.env.APP_BASE_URL
    ?? 'https://joinsclee-radar.juno8i.easypanel.host';
  const workflow = await construirWorkflow(urlRadar);

  if (args.includes('--json')) {
    console.log(JSON.stringify(workflow, null, 2));
    return;
  }

  const existente = await buscarExistente();
  if (args.includes('--crear')) {
    if (existente) throw new Error(`Ya existe «${NOMBRE}» (id ${existente}). Usa --actualizar.`);
    const creado = await api('/workflows', { method: 'POST', body: JSON.stringify(workflow) });
    console.log(`Creado «${NOMBRE}» · id ${creado.id}`);
    console.log(`Webhook: ${credenciales().url}/webhook/${WEBHOOK_PATH}`);
    console.log('Queda INACTIVO: revísalo en n8n y actívalo desde la interfaz.');
    return;
  }
  if (args.includes('--actualizar') || args.includes('--actualizar-prompt')) {
    if (!existente) throw new Error(`No existe «${NOMBRE}». Usa --crear.`);
    await api(`/workflows/${existente}`, { method: 'PUT', body: JSON.stringify(workflow) });
    console.log(`Actualizado «${NOMBRE}» · id ${existente}`);
    return;
  }
  console.log('Uso: --crear | --actualizar | --json');
}

// `pathToFileURL` y no una plantilla `file://${argv[1]}`: la ruta de este
// proyecto lleva un espacio («Paginas Web»), que en la URL viaja como %20 y en
// argv no. Comparadas a pelo nunca coinciden y el script no ejecuta nada, sin
// dar ningún error — que es exactamente lo que pasó la primera vez.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1; });
}

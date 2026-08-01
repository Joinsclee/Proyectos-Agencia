/**
 * Análisis con IA (OpenAI) de una oportunidad — opinión preliminar de inversión.
 *
 * Toma los hechos de la propiedad + el contexto de mercado (comparables de zona
 * de FincaRaíz) + el texto del aviso (en remates) y pide a un modelo barato
 * (gpt-4o-mini por defecto) una opinión ESTRUCTURADA en JSON: veredicto, puntaje,
 * valor de mercado estimado, descuento, factores a favor/en contra y riesgos de
 * due diligence. La IA debe anclarse en los números provistos, no inventarlos.
 *
 * Costo: con gpt-4o-mini un análisis ronda fracciones de centavo de USD. Se
 * cachea en la fila (features.ai_analysis) para no repetir el gasto.
 */
import type { MarketContext } from '../engine/zone-comps.js';

export interface AiPropertyFacts {
  kind: 'banco' | 'remate';
  tipo: string | null;
  ciudad: string | null;
  zona: string | null;
  area_m2: number | null;
  estrato: number | null;
  // Bancos: precio de lista. Remates: avalúo (referencia) + postura (lo que se paga).
  precio_lista_cop?: number | null;
  avaluo_cop?: number | null;
  postura_cop?: number | null;
  postura_pct?: number | null;
  banco_demandante?: boolean;
}

export interface AiResult {
  veredicto: 'atractiva' | 'neutral' | 'riesgosa';
  puntaje: number; // 0-100
  estimado_mercado_cop: number | null;
  descuento_estimado_pct: number | null;
  resumen: string;
  a_favor: string[];
  en_contra: string[];
  riesgos_due_diligence: string[];
  recomendacion: string;
  _meta: { model: string; generated_at: string; comparables_n: number; confidence: string };
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const cop = (n: number | null | undefined) => (n == null ? 'n/d' : `$${Math.round(n).toLocaleString('es-CO')}`);

export class NoOpenAIKeyError extends Error {
  constructor() { super('OPENAI_API_KEY no configurada'); this.name = 'NoOpenAIKeyError'; }
}

function buildPrompt(facts: AiPropertyFacts, market: MarketContext, avisoText?: string): string {
  const tipoComp = market.matched_type ? `del mismo tipo (${market.type})` : `de todos los tipos (no hubo suficientes del tipo ${market.type ?? 'pedido'})`;
  const ambito = market.scope === 'ciudad' ? `en ${market.city} (toda la ciudad)` : `acotados a ${market.scope_label} (${market.scope === 'barrio' ? 'mismo sector' : 'mismo barrio'})`;
  const crit = market.criteria?.length ? `Criterios de similitud aplicados: ${market.criteria.join('; ')}.` : '';
  const mkt = [
    `Comparables FincaRaíz ${ambito} ${tipoComp}: ${market.n} avisos (confianza ${market.confidence}).`,
    crit,
    market.median_total != null ? `Precio TOTAL de oferta — mediana ${cop(market.median_total)}, cuartil bajo (P25) ${cop(market.p25_total)}.` : '',
    market.median_ppm2 != null ? `Precio por m² — mediana ${cop(market.median_ppm2)}/m², P25 ${cop(market.p25_ppm2)}/m² (n=${market.n_ppm2}).` : 'Sin suficientes áreas para precio por m².',
    market.sample.length ? `Muestra (más baratos): ${market.sample.map((s) => `${cop(s.price)}${s.area ? `/${s.area}m²` : ''}${s.zone ? ` (${s.zone})` : ''}`).join('; ')}.` : '',
  ].filter(Boolean).join('\n');

  const prop = facts.kind === 'remate'
    ? [
        `REMATE JUDICIAL. Tipo: ${facts.tipo ?? 'n/d'}. Ciudad: ${facts.ciudad ?? 'n/d'}${facts.zona ? `, ${facts.zona}` : ''}.`,
        `Avalúo (valuación oficial del juzgado): ${cop(facts.avaluo_cop)}.`,
        `Postura mínima (lo que se paga para adjudicarse): ${cop(facts.postura_cop)}${facts.postura_pct ? ` (${facts.postura_pct}% del avalúo)` : ''}.`,
        facts.area_m2 ? `Área: ${facts.area_m2} m².` : '',
        facts.banco_demandante ? 'El demandante es un BANCO (suele implicar título más limpio y proceso hipotecario estándar).' : '',
      ].filter(Boolean).join('\n')
    : [
        `INMUEBLE DE BANCO (dación/venta directa). Tipo: ${facts.tipo ?? 'n/d'}. Ciudad: ${facts.ciudad ?? 'n/d'}${facts.zona ? `, ${facts.zona}` : ''}.`,
        `Precio de lista: ${cop(facts.precio_lista_cop)}.`,
        facts.area_m2 ? `Área: ${facts.area_m2} m².` : '',
        facts.estrato ? `Estrato: ${facts.estrato}.` : '',
      ].filter(Boolean).join('\n');

  return [
    'Eres un analista inmobiliario colombiano experto en remates judiciales e inmuebles de banco.',
    'Evalúa la oportunidad de inversión de la siguiente propiedad usando los comparables de mercado provistos.',
    '',
    '## Propiedad',
    prop,
    '',
    '## Mercado (comparables de zona)',
    mkt,
    avisoText ? `\n## Texto del aviso (extracto)\n${avisoText.slice(0, 2500)}` : '',
    '',
    '## Instrucciones',
    '- Ánclate en los números provistos; NO inventes precios. El "estimado de mercado" debe derivarse de la mediana de comparables (ajústalo por área/tipo si aplica).',
    '- Para remates: recuerda que la postura suele estar ~30% bajo el avalúo por diseño; el valor real está en si el AVALÚO mismo está por debajo del mercado, y en los riesgos del proceso.',
    '- Si la confianza de los comparables es baja o no hubo del mismo tipo, dilo y modera el veredicto.',
    '- Refiérete al ámbito de los comparables: si están acotados al barrio/sector, di "en este sector"; si son de toda la ciudad, acláralo (es una referencia más gruesa).',
    '- Detecta riesgos en el texto del aviso: ocupado/arrendado, proindiviso o cuota/derechos (no el 100%), servidumbres, rural/lote de baja liquidez, fechas de audiencia muy próximas.',
    // Un activo de banco se negocia y se firma; no hay audiencia, ni depósito
    // previo, ni otros postores. Que el modelo hable de «pujar» sobre uno de
    // estos le hace creer al lector que también sale a subasta.
    facts.kind === 'banco'
      ? '- Esta propiedad se compra por negociación directa con el banco, NO en subasta: no uses "pujar", "postura", "audiencia" ni "adjudicación"; di "comprar" o "hacer una oferta".'
      : '',
    '- Sé conciso y accionable. Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:',
    '{',
    '  "veredicto": "atractiva|neutral|riesgosa",',
    '  "puntaje": 0-100,',
    '  "estimado_mercado_cop": number|null,',
    '  "descuento_estimado_pct": number|null,',
    '  "resumen": "1-2 frases",',
    '  "a_favor": ["..."],',
    '  "en_contra": ["..."],',
    '  "riesgos_due_diligence": ["..."],',
    '  "recomendacion": "1 frase"',
    '}',
  ].join('\n');
}

/** Llama a OpenAI y devuelve la opinión estructurada. Lanza NoOpenAIKeyError si falta la key. */
export async function analyzeWithAI(
  facts: AiPropertyFacts,
  market: MarketContext,
  avisoText?: string,
): Promise<AiResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new NoOpenAIKeyError();

  const prompt = buildPrompt(facts, market, avisoText);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Responde siempre en español y SOLO con JSON válido.' },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: respuesta vacía');

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw new Error('OpenAI: JSON inválido'); }

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []);
  const veredicto = ['atractiva', 'neutral', 'riesgosa'].includes(parsed.veredicto) ? parsed.veredicto : 'neutral';
  // El precio que el usuario está mirando, para poder comprobar si lo que dice el
  // modelo se sostiene contra él.
  const precioReal = facts.kind === 'remate' ? num(facts.postura_cop) : num(facts.precio_lista_cop);
  const estimado = valorDeMercadoCreible(parsed.estimado_mercado_cop);
  return {
    veredicto,
    puntaje: Math.max(0, Math.min(100, Number(parsed.puntaje) || 0)),
    estimado_mercado_cop: estimado,
    descuento_estimado_pct: descuentoCoherente(parsed.descuento_estimado_pct, precioReal, estimado),
    resumen: String(parsed.resumen ?? '').slice(0, 600),
    a_favor: arr(parsed.a_favor),
    en_contra: arr(parsed.en_contra),
    riesgos_due_diligence: arr(parsed.riesgos_due_diligence),
    recomendacion: String(parsed.recomendacion ?? '').slice(0, 400),
    _meta: { model: MODEL, generated_at: new Date().toISOString(), comparables_n: market.n, confidence: market.confidence },
  };
}

/*
 * ─── Lo que el modelo dice, comprobado antes de enseñarlo ───
 *
 * `puntaje` se acotaba a 0-100 y el veredicto se validaba contra una lista, pero
 * las dos cifras en pesos pasaban tal cual, así que una oficina podía salir con
 * un «valor de mercado estimado: $2» y nadie lo impedía.
 *
 * Un número absurdo aquí no es un detalle estético. La ficha lo pinta al lado del
 * veredicto del motor, así que el usuario ve dos cifras que se contradicen y no
 * tiene cómo saber cuál creer. Ante la duda, mejor no enseñar nada: un hueco se
 * entiende, un disparate tira por tierra la confianza en todo lo demás de la
 * pantalla, incluido lo que sí está bien calculado.
 */

/** Un inmueble en Colombia no vale dos pesos ni medio billón. Fuera de eso, no se enseña. */
const VALOR_MINIMO_CREIBLE = 1_000_000;
const VALOR_MAXIMO_CREIBLE = 500_000_000_000;

export function valorDeMercadoCreible(valor: unknown): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < VALOR_MINIMO_CREIBLE || n > VALOR_MAXIMO_CREIBLE) return null;
  return n;
}

/**
 * El descuento del modelo, acotado a lo que puede significar algo.
 *
 * Por debajo de -100% habría que pagar por llevárselo; por encima de 95% sería
 * regalado. En ambos extremos es mucho más probable un error del modelo o un dato
 * de partida roto que una oportunidad histórica.
 */
export function descuentoCreible(valor: unknown): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < -100 || n > 95) return null;
  return Math.round(n * 10) / 10;
}

/** Número finito o nada. Local, para no arrastrar utilidades de otro módulo. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * El descuento del modelo, comprobado contra su propia estimación.
 *
 * El modelo llegó a decir «-30% de descuento» sobre un inmueble de 30 millones
 * cuyo valor de mercado él mismo estimaba en 22: eso no es un descuento del 30%,
 * es un sobreprecio del 36%. El signo contradecía a su propio número, y la ficha
 * pintaba ese porcentaje al lado del veredicto del motor, que decía lo contrario.
 *
 * Quien lee no tiene cómo detectar la contradicción ni rehacer la cuenta, así que
 * el riesgo real no es un número feo: es entusiasmarse con algo sobrevalorado
 * creyendo que está barato. Cuando el porcentaje no cuadra con la estimación, se
 * descarta y la ficha se queda sin esa línea —el resto del análisis sigue siendo
 * útil— en vez de publicar una cifra que apunta al lado contrario.
 *
 * La tolerancia es amplia (10 puntos) a propósito: aquí no se persigue precisión
 * decimal, solo se impide que el signo mienta.
 */
export function descuentoCoherente(
  valor: unknown,
  precio: number | null,
  estimado: number | null,
): number | null {
  const declarado = descuentoCreible(valor);
  if (declarado === null) return null;
  // Sin con qué contrastarlo, se deja pasar lo que ya validó `descuentoCreible`.
  if (precio === null || estimado === null || precio <= 0 || estimado <= 0) return declarado;
  const real = ((estimado - precio) / estimado) * 100;
  if (Math.sign(real) !== Math.sign(declarado) && Math.abs(real - declarado) > 1) return null;
  return Math.abs(real - declarado) <= 10 ? declarado : null;
}

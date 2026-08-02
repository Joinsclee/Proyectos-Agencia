/**
 * Capa de datos del servidor local (entorno "real"): consulta Supabase EN VIVO
 * con filtros + paginación. A diferencia del HTML estático para GHL, acá no hay
 * topes — se devuelven todos los resultados de cada ciudad, paginados.
 */
import { supabase } from '../lib/supabase.js';
import { MAX_DISPLAY_PRICE, MAX_OPP_DISCOUNT, BANK_SOURCES } from '../lib/types.js';
import { colapsarRepetidos } from './repetidos.js';
import { rotarSemanal } from '../engine/rotacion.js';
import { sanitizeRemateForDisplay } from './data-quality.js';
import { evaluarFrescura, type Frescura, type TrabajoCron } from './frescura.js';
import {
  MAX_CIUDADES_PANEL,
  ciudadesPrincipales,
  construirTablaZonas,
  type FilaCiudad,
  type FilaOportunidad,
  type TablaZonas,
} from './zonas.js';
import {
  estadoTrabajos,
  serieCorridasPorDia,
  type FilaCorrida,
  type FilaTrabajo,
  type SerieCorridas,
  type TrabajoAutomatico,
} from './metricas.js';
import {
  armarDestacados,
  inicioDeMes,
  DESCUENTO_MAX,
  DESCUENTO_MIN,
  type Destacados,
  type FilaInmueble,
  type FilaRemate,
} from './destacados.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('queries');

export interface ListQuery {
  city?: string;
  zone?: string;
  type?: string;
  priceMin?: number;   // COP
  priceMax?: number;   // COP
  /**
   * Todas las formas en que la ciudad pedida aparece escrita en la base.
   *
   * Lo rellena quien llama —no el usuario— justo antes de consultar, porque
   * resolverlo exige ir a la base y `applyInmuebleFilters` es síncrona.
   */
  _ciudadVariantes?: string[];
  areaMin?: number;    // m²
  areaMax?: number;    // m²
  bedroomsMin?: number;
  stratumMin?: number;
  stratumMax?: number;
  opp?: '' | '1' | 'high';
  order?: string;
  page?: number;
  pageSize?: number;
  past?: string; // '1' = incluir audiencias pasadas (remates)
  bank?: string; // '1' = solo remates con demandante banco/financiera
  bidMin?: number; // remates: postura mínima (COP)
  bidMax?: number; // remates: postura máxima (COP)
  /**
   * Solo las fichas que ESTE usuario ya abrió con su cupo del mes.
   *
   * Los identificadores los pone el servidor a partir de `app_metadata`, nunca el
   * cliente: si viniera de la URL, cualquiera podría pedir la lista de fichas
   * abiertas de otro. El filtro solo tiene sentido para el plan gratuito —un
   * suscriptor las tiene todas abiertas— y por eso la interfaz solo se lo ofrece
   * a él.
   */
  soloDesbloqueadas?: string[];
  /** Categoría exacta del Índice CRECE (`crece_tier`). Ver `TIERS_FILTRABLES`. */
  tier?: string;
}

/**
 * Qué cuenta como inventario PUBLICABLE del portal abierto.
 *
 * Vive en un solo sitio porque lo usan tres consumidores que tienen que decir el
 * mismo número: las estadísticas del dashboard, el listado paginado y la tabla
 * de oportunidades por zona del panel. Cuando esta definición estaba duplicada,
 * la pestaña anunciaba 115.636 y el paginador de adentro ofrecía otra cifra —la
 * contradicción más fácil de detectar que puede tener un tablero, porque se ve
 * sin hacer clic en nada—.
 *
 * Fuera quedan los proyectos de preventa (no son un inmueble que se pueda ir a
 * ver) y todo lo que supere el tope de precio del sistema.
 */
function soloPortalPublicable(qb: any) {
  return qb
    .eq('is_active', true)
    .eq('source', 'fincaraiz')
    .or('features->>is_project.is.null,features->>is_project.eq.false')
    .lte('price', MAX_DISPLAY_PRICE);
}

/** Filtros compartidos de inmuebles (portal + bancos): precio/área/hab/estrato. */
/**
 * Categorías del Índice CRECE que el usuario puede pedir en el filtro.
 *
 * Llegan hasta «Precio de Mercado» y ni una más, por decisión de producto: el
 * Radar es una herramienta para encontrar oportunidades, y ofrecer «Sobreprecio»
 * o «Fuera de Mercado» como opción de búsqueda sería invitar a buscar lo que el
 * producto existe para evitar. Las categorías por encima del mercado se siguen
 * calculando y se siguen viendo en la ficha —son parte del veredicto— pero no
 * son un destino.
 *
 * El orden es el de la tabla maestra de la especificación, de mejor a peor, y la
 * interfaz lo respeta: es la misma tabla que el cliente tiene en su documento.
 */
export const TIERS_FILTRABLES = [
  'oportunidad_fuerte',
  'oportunidad',
  'interesante',
  'abajo_mercado',
  'mercado_borde_bajo',
  'mercado',
] as const;

/** Acota por categoría del Índice CRECE, validando contra la lista blanca. */
function aplicarTier(qb: any, q: ListQuery) {
  if (!q.tier) return qb;
  if (!(TIERS_FILTRABLES as readonly string[]).includes(q.tier)) return qb;
  return qb.eq('crece_tier', q.tier);
}

/** Acota a las fichas que el usuario ya abrió con su cupo. */
function aplicarSoloDesbloqueadas(qb: any, q: ListQuery) {
  if (!q.soloDesbloqueadas) return qb;
  // Sin ninguna abierta el conjunto es vacío, y hay que decirlo con una condición
  // imposible: `.in('id', [])` lo ignora PostgREST y devolvería el listado entero,
  // que es justo lo contrario de lo que el usuario pidió.
  if (!q.soloDesbloqueadas.length) return qb.eq('id', '00000000-0000-0000-0000-000000000000');
  return qb.in('id', q.soloDesbloqueadas);
}

function applyInmuebleFilters(qb: any, q: ListQuery) {
  // Tope del sistema: nunca mostrar valores super-elevados (fuera de segmento /
  // errores de carga) que ensucian la percepción y las estadísticas.
  qb = qb.lte('price', MAX_DISPLAY_PRICE);
  // Descuentos imposibles (>70% = error de datos) fuera; se conservan los no
  // evaluados (discount_pct null) para no ocultar listados sin veredicto.
  qb = qb.or(`discount_pct.is.null,discount_pct.lte.${MAX_OPP_DISCOUNT}`);
  // La misma ciudad está escrita de varias formas («bogota» y «bogota d.c.»), así
  // que filtrar por igualdad exacta enseñaba una fracción del inventario sin
  // decirlo. Cuando quien llama ya resolvió las variantes, se buscan todas.
  if (q.city) {
    const variantes = q._ciudadVariantes;
    qb = variantes && variantes.length > 1 ? qb.in('city', variantes) : qb.eq('city', q.city);
  }
  if (q.type) qb = qb.eq('type', q.type);
  if (q.priceMin) qb = qb.gte('price', q.priceMin);
  if (q.priceMax) qb = qb.lte('price', Math.min(q.priceMax, MAX_DISPLAY_PRICE));
  if (q.areaMin) qb = qb.gte('area_m2', q.areaMin);
  if (q.areaMax) qb = qb.lte('area_m2', q.areaMax);
  // Campos JSON, comparados como NÚMERO (`->`) y no como texto (`->>`).
  //
  // Con `->>` la comparación es alfabética, y ahí '11' < '2': una casa de once
  // habitaciones desaparecía al pedir «2 o más». Medido sobre Bogotá, el filtro
  // perdía todas las de 10, 11, 13 y 16 — justo las fincas y casas grandes, que
  // son de las fichas más caras del inventario. El estrato se salvaba de milagro
  // porque solo llega hasta 6.
  if (q.bedroomsMin) qb = qb.gte('features->bedrooms', q.bedroomsMin);
  if (q.stratumMin) qb = qb.gte('features->stratum', q.stratumMin);
  if (q.stratumMax) qb = qb.lte('features->stratum', q.stratumMax);
  return qb;
}

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** `true` cuando `total` es la estimación del planificador y no un conteo real. */
  totalAproximado?: boolean;
  /** `true` cuando quedan resultados más allá de la última página navegable. */
  paginasLimitadas?: boolean;
}

const clampPage = (p?: number) => Math.max(1, Math.floor(p ?? 1));
const clampSize = (s?: number) => Math.min(60, Math.max(6, Math.floor(s ?? 24)));

/**
 * ¿El error es «pediste una página que no existe»?
 *
 * PostgREST responde 416 cuando el rango solicitado empieza más allá del último
 * registro, y eso viajaba como un 500 hasta la pantalla: «No se pudo cargar»,
 * con un botón de reintentar que repetía la misma petición muerta para siempre.
 * La única salida era editar la dirección a mano.
 *
 * Importa más desde que la página viaja en la URL: cualquier enlace compartido a
 * partir de la segunda página se rompe en cuanto el inventario encoge —y encoge
 * cada semana, cuando el scraper retira lo vendido—.
 */
function esRangoFueraDeAlcance(
  error: { code?: string; message?: string } | null,
  page: number,
): boolean {
  if (!error || page <= 1) return false;
  const mensaje = String(error.message ?? '');
  // Los dos primeros son la respuesta que PostgREST documenta. El tercero es la
  // que de verdad llega: el cuerpo del 416 vuelve cortado y el cliente lo deja en
  // un `{"` suelto, sin código. Se comprueban los tres, y solo a partir de la
  // página 2 —en la primera nunca puede sobrar rango, así que ahí un error es un
  // error de verdad y tiene que seguir viéndose como tal.
  return error.code === 'PGRST103'
    || /range not satisfiable|416/i.test(mensaje)
    || /^\{"?$/.test(mensaje.trim());
}

/**
 * ¿El usuario pidió un rango que ningún inmueble puede cumplir?
 *
 * Un mínimo por encima de su máximo describe el conjunto vacío, y eso se sabe
 * antes de preguntarle nada a la base. Mandarlo igual costaba caro: con estrato
 * mínimo 6 y máximo 1, la consulta recorría las 108.000 filas buscando algo
 * imposible y devolvía **HTTP 500 a los 25 segundos**. El usuario veía "no se
 * pudo cargar" cuando lo correcto era el estado vacío.
 */
function rangoImposible(q: ListQuery): boolean {
  const pares: Array<[number | undefined, number | undefined]> = [
    [q.priceMin, q.priceMax],
    [q.areaMin, q.areaMax],
    [q.stratumMin, q.stratumMax],
    [q.bidMin, q.bidMax],
  ];
  return pares.some(([min, max]) => min != null && max != null && min > max);
}

/** Respuesta vacía coherente, sin tocar la base. */
const listaVacia = (page: number, pageSize: number): ListResult =>
  ({ data: [], total: 0, page, pageSize, pages: 0 });

/**
 * Hasta qué página puede servirse un listado.
 *
 * Medido contra la base real: las páginas 1 a 30 responden en menos de un segundo
 * y la 45 tarda **49 segundos y falla**. La causa es el desplazamiento profundo:
 * para servir la página N, Postgres recorre y descarta N×24 filas ya ordenadas.
 * No es algo que se arregle afinando la consulta, es cómo funciona `OFFSET`.
 *
 * Así que el paginador deja de ofrecer 4.503 páginas de las que solo puede servir
 * unas cuarenta. Ofrecer un botón que siempre falla —y los dos botones de «ir al
 * final» fallaban siempre— es peor que no ofrecerlo: la respuesta honesta es
 * enseñar el tramo que existe y decir que para llegar más lejos hay que filtrar.
 */
export const MAX_PAGINAS_NAVEGABLES = 40;

/**
 * Desempate estable para cualquier orden paginado.
 *
 * Sin él, la paginación repite y pierde fichas. Todas las columnas por las que se
 * ordena tienen empates masivos —`scraped_at` es idéntico para todo un lote del
 * scraper, `auction_date` agrupa decenas de remates el mismo día, `price` se
 * repite en los valores redondos— y con OFFSET, Postgres es libre de devolver los
 * empatados en otro orden en cada petición: una fila puede aparecer en la página 2
 * y otra vez en la 3, mientras otra no sale en ninguna.
 *
 * Medido antes del arreglo: en Remates, 12 fichas repetidas de 288; ordenando el
 * Portal por «más recientes», 55 repetidas y solo 188 únicas de 288 filas
 * devueltas. Añadir el identificador como último criterio hace el orden total y
 * por tanto reproducible entre páginas.
 */
const conDesempate = (qb: any) => qb.order('id', { ascending: true });

function applyOrderInmuebles(qb: any, order?: string) {
  switch (order) {
    case 'none': return qb; // sin orden: salida de respaldo cuando ordenar haría timeout
    case 'precio_asc': return conDesempate(qb.order('price', { ascending: true, nullsFirst: false }));
    case 'precio_desc': return conDesempate(qb.order('price', { ascending: false, nullsFirst: false }));
    case 'precio_m2_asc': return conDesempate(qb.order('price_per_m2', { ascending: true, nullsFirst: false }));
    case 'recent': return conDesempate(qb.order('scraped_at', { ascending: false }));
    case 'discount_desc': return conDesempate(qb.order('discount_pct', { ascending: false, nullsFirst: false }));
    // Por defecto, el más barato primero. Lo pidió el cliente viendo el listado:
    // «que saliera siempre con los inmuebles de menor valor».
    //
    // El defecto del SERVIDOR tiene que ser el mismo que el que el desplegable
    // muestra seleccionado. Si aquí siguiera mandando el descuento, la primera
    // carga —que llega sin parámetro de orden— pintaría un listado ordenado por
    // descuento mientras el control dice «Precio menor», y no hay forma de que el
    // usuario entienda eso.
    default: return conDesempate(qb.order('price', { ascending: true, nullsFirst: false }));
  }
}

const isTimeout = (msg?: string) => !!msg && /statement timeout|57014/i.test(msg);

/** Listados del portal abierto (FincaRaíz), excluyendo proyectos preventa. */
export async function queryPortal(q: ListQuery): Promise<ListResult> {
  const page = clampPage(q.page);
  const pageSize = clampSize(q.pageSize);
  if (rangoImposible(q)) return listaVacia(page, pageSize);
  const from = (page - 1) * pageSize;
  // Se resuelven aquí las formas en que está escrita la ciudad pedida, porque
  // exige ir a la base y el armado del filtro es síncrono.
  if (q.city) q = { ...q, _ciudadVariantes: await ciudadesParaFiltrar(q.city, 'portal') };

  // Conteo: EXACTO cuando hay filtros (conjunto acotado → rápido y preciso, que
  // es lo que el usuario necesita para confiar en "X resultados"); PLANNED solo
  // en la vista sin filtros (los 87K completos, donde el exacto haría timeout).
  // Conteo exacto solo con filtros "baratos" (columnas indexadas / ciudad). Con
  // habitaciones/estrato (JSON) SOLOS y sin ciudad, el exacto puede hacer timeout
  // antes de aplicar el migration de índices → en ese caso se usa planned.
  // `soloDesbloqueadas` entra aquí como filtro "barato" y es el más barato de
  // todos: acota a un puñado de identificadores, así que el conteo exacto es
  // inmediato. Dejarlo fuera repetía el fallo que ya tuvimos —el contador decía
  // «108.060 resultados» con tres tarjetas en pantalla— porque sin ningún filtro
  // reconocido se devuelve el total cacheado del portal entero.
  const cheapFilter = !!(q.city || q.zone || q.type || q.priceMin || q.priceMax ||
    q.areaMin || q.areaMax || q.opp || q.soloDesbloqueadas || q.tier);
  // Los filtros que viven dentro del JSON (`features->bedrooms`, `->stratum`) no
  // tienen índice que los cubra, así que CONTARLOS de forma exacta sobre 108.000
  // filas no cabe en el tiempo de una consulta. Da igual que vengan acompañados
  // de un filtro barato: la combinación seguía agotando el tiempo.
  //
  // Se decide aquí y no en la escalera de reintentos porque un intento fallido
  // cuesta sus 25 segundos completos: dejarlo probar y caer daba HTTP 500 antes,
  // y después del primer arreglo devolvía la respuesta correcta pero a los 27-35
  // segundos, con el navegador ya rendido. Renunciar de entrada a la cifra exacta
  // deja la consulta en menos de dos segundos.
  const hayFiltroJson = !!(q.bedroomsMin || q.stratumMin || q.stratumMax);
  // Sin filtros NO se usa el estimador del planificador de Postgres: se equivoca
  // por dos órdenes de magnitud. Medido el 2026-07-28 en producción — estimaba
  // 1.010 fichas cuando hay 108.016, así que el paginador ofrecía 43 páginas de
  // las ~4.500 reales y contradecía al contador de la pestaña en la primera
  // pantalla que ve cualquiera. El conteo exacto tarda 5,4 s, demasiado para una
  // carga, así que se hace UNA vez y se cachea, igual que las estadísticas.
  const countMode: 'exact' | 'planned' = cheapFilter && !hayFiltroJson ? 'exact' : 'planned';
  const build = (order?: string, modo: 'exact' | 'planned' = countMode) => {
    let qb = supabase
      .from('inmuebles')
      .select('*', { count: modo })
      .eq('is_active', true)
      .eq('source', 'fincaraiz')
      // excluir proyectos preventa (is_project null o false)
      .or('features->>is_project.is.null,features->>is_project.eq.false');
    qb = applyInmuebleFilters(qb, q);
    qb = aplicarSoloDesbloqueadas(qb, q);
    qb = aplicarTier(qb, q);
    if (q.zone) qb = qb.eq('zone', q.zone);
    if (q.opp === '1') qb = qb.eq('is_opportunity', true);
    if (q.opp === 'high') {
      qb = qb.eq('is_high', true);
    }
    return applyOrderInmuebles(qb, order).range(from, from + pageSize - 1);
  };

  // Resiliencia ante timeouts (ej. rango de estrato sobre 87K + orden): se
  // reintenta primero con 'recent' (indexado) y, si aún falla, SIN orden — que
  // siempre responde rápido (el filtro corta a pageSize). Así la app nunca cae;
  // en ese caso raro solo se pierde el ordenamiento. Con ciudad/precio todo va
  // ordenado y rápido (caso normal).
  // Caso lento conocido: filtro JSON (hab/estrato) SIN filtro barato (ciudad/
  // precio/área) sobre 87K + orden → timeout. Ahí se omite el orden de entrada
  // (responde en ms); con ciudad/precio se ordena normal.
  const jsonOnly = hayFiltroJson && !cheapFilter;
  let modoUsado: 'exact' | 'planned' = jsonOnly ? 'planned' : countMode;
  let { data, count, error } = await build(jsonOnly ? 'none' : q.order, modoUsado);
  if (error && isTimeout(error.message) && q.order !== 'recent') {
    ({ data, count, error } = await build('recent', modoUsado));
  }
  if (error && isTimeout(error.message)) {
    ({ data, count, error } = await build('none', modoUsado));
  }
  // Última salida, y la que faltaba: si después de renunciar al orden sigue
  // agotándose el tiempo, lo caro NO es ordenar sino CONTAR. Un filtro de
  // habitaciones o estrato junto a cualquier otro ponía el conteo en modo exacto
  // sobre 108.000 filas y la escalera anterior —que solo probaba órdenes
  // distintos— moría tres veces igual y devolvía HTTP 500 a los 25 segundos.
  // Medido: `type=house&bedroomsMin=3`, `opp=1&bedroomsMin=3` y
  // `priceMin=…&stratumMin=4` fallaban los tres. Un total aproximado es
  // infinitamente mejor que una pantalla de error.
  if (error && isTimeout(error.message) && modoUsado === 'exact') {
    modoUsado = 'planned';
    ({ data, count, error } = await build(q.order, 'planned'));
    if (error && isTimeout(error.message)) {
      ({ data, count, error } = await build('none', 'planned'));
    }
  }
  // Una página más allá del final no es un fallo: es una página vacía.
  if (esRangoFueraDeAlcance(error, page)) return listaVacia(page, pageSize);
  if (error) throw new Error(`queryPortal: ${error.message}`);

  // El total tiene que reflejar los filtros SIEMPRE. Antes, con un filtro de
  // habitaciones o estrato como único criterio, se devolvía el total del portal
  // entero: la pantalla decía «108.060 resultados» con un filtro aplicado, y con
  // un rango imposible (estrato mín 6, máx 1) seguía diciendo lo mismo en vez de
  // mostrar el estado vacío.
  const hayFiltros = cheapFilter || hayFiltroJson;
  const total = hayFiltros ? (count ?? 0) : await totalPortalSinFiltros(count ?? 0);
  const paginasReales = Math.ceil(total / pageSize);
  const pages = Math.min(paginasReales, MAX_PAGINAS_NAVEGABLES);
  // Diez avisos del mismo loteo se ven como diez tarjetas idénticas. No son un
  // fallo del scraper —cada una es un anuncio distinto, con su URL— pero en
  // pantalla dan una opción y nueve estorbos. Ver `server/repetidos.ts`.
  const { filas } = colapsarRepetidos(data ?? []);
  return {
    data: filas,
    total,
    page,
    pageSize,
    pages,
    totalAproximado: modoUsado === 'planned' && hayFiltros,
    paginasLimitadas: paginasReales > pages,
  };
}

/**
 * Total real del portal sin filtros, cacheado.
 *
 * Se calcula con EXACTAMENTE los mismos filtros que el listado —activo, FincaRaíz,
 * sin proyectos de preventa y bajo el tope de precio— para que el número del
 * paginador y el de la pestaña puedan cuadrar. Si la consulta falla o tarda de
 * más, se devuelve la estimación del planificador: un total aproximado es mucho
 * mejor que una pantalla en blanco.
 */
const TOTAL_PORTAL_TTL_MS = 10 * 60_000;
let totalPortalCache: { at: number; total: number } | null = null;
let totalPortalEnVuelo: Promise<number> | null = null;

async function totalPortalSinFiltros(estimado: number): Promise<number> {
  if (totalPortalCache && Date.now() - totalPortalCache.at < TOTAL_PORTAL_TTL_MS) {
    return totalPortalCache.total;
  }
  if (!totalPortalEnVuelo) {
    totalPortalEnVuelo = (async () => {
      const { count, error } = await supabase
        .from('inmuebles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('source', 'fincaraiz')
        .or('features->>is_project.is.null,features->>is_project.eq.false')
        .lte('price', MAX_DISPLAY_PRICE);
      if (error) throw new Error(error.message);
      const total = count ?? 0;
      totalPortalCache = { at: Date.now(), total };
      return total;
    })().finally(() => { totalPortalEnVuelo = null; });
  }
  try {
    return await totalPortalEnVuelo;
  } catch (e) {
    log.warn(`total del portal: ${e instanceof Error ? e.message : String(e)}`);
    return estimado;
  }
}

/** Precalienta el total del portal para que la primera visita no pague los 5,4 s. */
export async function warmTotalPortal(): Promise<void> {
  try { await totalPortalSinFiltros(0); } catch { /* best-effort */ }
}

/** Inmuebles bancarios (todas las fuentes salvo fincaraiz). */
export async function queryBancos(q: ListQuery): Promise<ListResult> {
  const page = clampPage(q.page);
  const pageSize = clampSize(q.pageSize);
  if (rangoImposible(q)) return listaVacia(page, pageSize);
  const from = (page - 1) * pageSize;
  // Se resuelven aquí las formas en que está escrita la ciudad pedida, porque
  // exige ir a la base y el armado del filtro es síncrono.
  if (q.city) q = { ...q, _ciudadVariantes: await ciudadesParaFiltrar(q.city, 'bancos') };

  let qb = supabase
    .from('inmuebles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .in('source', BANK_SOURCES as unknown as string[]);

  qb = applyInmuebleFilters(qb, q);
  qb = aplicarSoloDesbloqueadas(qb, q);
  qb = aplicarTier(qb, q);
  // Filtro por entidad. Se valida contra la lista blanca en vez de pasar el valor
  // a la consulta: `bank` viene de la URL y en la pestaña de remates el MISMO
  // parámetro lleva el nombre del demandante, así que aquí puede llegar cualquier
  // cosa. Un valor desconocido se ignora en vez de devolver cero resultados, que
  // se leería como "este banco no tiene inventario".
  if (q.bank && (BANK_SOURCES as readonly string[]).includes(q.bank)) qb = qb.eq('source', q.bank);
  if (q.opp === '1') qb = qb.eq('is_opportunity', true);
  // «Solo altas» existía en el desplegable de Bancos —se pinta con el mismo código
  // que el de Portal— pero aquí no tenía rama: el parámetro viajaba y la consulta
  // lo ignoraba, así que elegirlo devolvía las 413 fichas, idéntico a no filtrar.
  if (q.opp === 'high') qb = qb.eq('is_high', true);
  // El defecto es «precio menor», el mismo que el desplegable enseña seleccionado.
  // Era `precio_m2_asc`, y esa discrepancia hacía dos cosas malas a la vez: el
  // control mentía sobre el orden aplicado hasta que alguien lo tocaba, y como
  // BBVA y Aval son los más baratos por m², la primera página salía copada por
  // esas dos entidades —que además se pintan con imagen de marca en vez de foto—.
  // De ahí la impresión de que el filtro «Todos los bancos» forzaba BBVA: el
  // filtro estaba bien, lo que sesgaba era el orden.
  qb = applyOrderInmuebles(qb, q.order ?? 'precio_asc');
  qb = qb.range(from, from + pageSize - 1);

  const { data, count, error } = await qb;
  // Una página más allá del final no es un fallo: es una página vacía.
  if (esRangoFueraDeAlcance(error, page)) return listaVacia(page, pageSize);
  if (error) throw new Error(`queryBancos: ${error.message}`);
  const total = count ?? 0;
  // Rotación semanal del pool bancario (HU de frescura): el inventario de bancos
  // cambia poco, así que sin esto el usuario recurrente ve siempre la misma
  // pantalla. Se rota la página ya paginada para no alterar el conteo ni repetir
  // fichas entre páginas.
  // La rotación semanal cumple la HU de frescura —que el inventario bancario no
  // se vea idéntico entre visitas— pero solo puede aplicarse cuando el usuario NO
  // ha pedido un orden concreto. Aplicada siempre, contradecía lo que acababa de
  // elegir: con «precio menor» el más barato salía en la posición 18 y la lista
  // daba un salto hacia atrás a mitad de página. Un orden que el usuario pide es
  // una instrucción, no una sugerencia.
  // Mismo criterio que en el portal: las copias del mismo loteo se colapsan en
  // una tarjeta con su cuenta. Se hace ANTES de rotar para que la rotación
  // reparta fichas distintas y no copias de la misma.
  const { filas: sinRepetir } = colapsarRepetidos(data ?? []);
  const rotables = !q.order || q.order === 'precio_m2_asc'; // el defecto del módulo
  return {
    data: rotables ? rotarSemanal(sinRepetir) : sinRepetir,
    total, page, pageSize, pages: Math.ceil(total / pageSize),
  };
}

/** Remates judiciales activos. */
export async function queryRemates(q: ListQuery): Promise<ListResult> {
  const page = clampPage(q.page);
  const pageSize = clampSize(q.pageSize);
  if (rangoImposible(q)) return listaVacia(page, pageSize);
  const from = (page - 1) * pageSize;

  let qb = supabase
    .from('remates')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  // Igual que en Portal y Bancos: se buscan TODAS las formas de esa ciudad.
  // Agrupar solo el desplegable no arreglaría nada, porque el filtro seguiría
  // yendo por igualdad exacta y las audiencias de la otra variante quedarían
  // escondidas — que es justo el fallo que se reportó.
  if (q.city) {
    const variantes = await ciudadesParaFiltrar(q.city, 'remates');
    qb = variantes.length > 1 ? qb.in('city', variantes) : qb.eq('city', q.city);
  }
  if (q.type) qb = qb.eq('property_type', q.type);
  // Por defecto solo audiencias PRÓXIMAS (hoy en adelante): las pasadas no se
  // pueden rematar, no sirven al usuario. `?past=1` las incluye.
  if (q.past !== '1') {
    const today = new Date().toISOString().slice(0, 10);
    qb = qb.gte('auction_date', today);
  }
  // Demandante: '1' = cualquier banco; un nombre = ese banco específico.
  if (q.bank === '1') qb = qb.eq('features->>is_bank_plaintiff', 'true');
  else if (q.bank) qb = qb.eq('features->>bank_name', q.bank);
  // Postura mínima/máxima (presupuesto del usuario).
  qb = aplicarSoloDesbloqueadas(qb, q);
  if (q.bidMin) qb = qb.gte('minimum_bid', q.bidMin);
  if (q.bidMax) qb = qb.lte('minimum_bid', q.bidMax);
  const order = q.order ?? 'auction_asc';
  if (order === 'min_asc') qb = qb.order('minimum_bid', { ascending: true, nullsFirst: false });
  else if (order === 'min_desc') qb = qb.order('minimum_bid', { ascending: false, nullsFirst: false });
  else qb = qb.order('auction_date', { ascending: true, nullsFirst: false });
  // Mismo motivo que en los inmuebles: `auction_date` agrupa decenas de remates
  // en el mismo día y sin desempate la paginación los baraja entre peticiones.
  // Medido: 37 remates no se alcanzaban por ningún camino del paginador.
  qb = conDesempate(qb);
  qb = qb.range(from, from + pageSize - 1);

  const { data, count, error } = await qb;
  // Una página más allá del final no es un fallo: es una página vacía.
  if (esRangoFueraDeAlcance(error, page)) return listaVacia(page, pageSize);
  if (error) throw new Error(`queryRemates: ${error.message}`);
  const total = count ?? 0;
  return {
    data: (data ?? []).map(sanitizeRemateForDisplay),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

/** Una sola propiedad por id (para abrir una recomendación en su modal). */
export async function getProperty(kind: 'portal' | 'banco' | 'remate', id: string) {
  const table = kind === 'remate' ? 'remates' : 'inmuebles';
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) return null;
  return kind === 'remate' ? sanitizeRemateForDisplay(data) : data;
}

/** Bancos demandantes (distintos) en remates con audiencia futura, con conteo. */
export async function remateBankFacets(): Promise<{ banks: Array<{ name: string; count: number }> }> {
  const today = new Date().toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('remates').select('features')
      .eq('is_active', true).gte('auction_date', today)
      .order('id').range(from, from + 999);
    if (error) throw new Error(`remateBankFacets: ${error.message}`);
    for (const r of (data ?? []) as any[]) {
      const name = r.features?.bank_name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  const banks = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { banks };
}

/** Valores únicos para poblar los filtros (ciudades, tipos, barrios por ciudad). */
/**
 * Ciudades y tipos que existen DE VERDAD en el inventario de remates.
 *
 * La pestaña de Remates ofrecía las facetas del portal, y son dos universos
 * distintos: un remate puede estar en un municipio donde FincaRaíz no publica
 * nada. Medido, 19 ciudades con remates reales —Popayán, Yopal, Buenaventura,
 * Chaparral…— no aparecían en el desplegable y no había forma de llegar a ellas,
 * mientras que decenas de ciudades ofrecidas no tenían ni un remate y solo servían
 * para vaciar la pantalla.
 *
 * Los remates son unos cientos, así que se cuentan enteros sin tope.
 */
export async function facetsRemates() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('remates')
    .select('city, property_type')
    .eq('is_active', true)
    .gte('auction_date', hoy)
    .limit(5000);
  if (error) throw new Error(`facetsRemates: ${error.message}`);
  // Una sola entrada por ciudad real, igual que en Portal y Bancos. Aquí la
  // captura viene del edicto del juzgado, así que las mismas variantes aparecen
  // por su cuenta: ofrecer «Bogota» y «Bogota d.c.» como dos opciones distintas
  // le esconde al usuario la mitad de las audiencias de su ciudad.
  const cities = ciudadesUnificadas((data ?? []).map((r) => r.city));
  const types = [...new Set((data ?? []).map((r) => r.property_type).filter(Boolean))].sort();
  return { cities, zones: [], types };
}

export async function facets(source: 'portal' | 'bancos' = 'portal', city?: string) {
  let qb = supabase.from('inmuebles').select('city, zone, type, source').eq('is_active', true).limit(8000);
  qb = source === 'portal' ? qb.eq('source', 'fincaraiz') : qb.in('source', BANK_SOURCES as unknown as string[]);
  // Los MISMOS dos filtros de saneamiento que aplica el listado (`applyInmuebleFilters`).
  // Sin ellos las opciones prometen inventario que la pestaña no va a enseñar: el
  // desplegable diría «Aval (219)» y al elegirlo saldrían 186. Ya pasó una vez
  // entre el contador de la pestaña y el paginador, y se lee como un fallo.
  qb = qb.lte('price', MAX_DISPLAY_PRICE);
  qb = qb.or(`discount_pct.is.null,discount_pct.lte.${MAX_OPP_DISCOUNT}`);
  if (city) qb = qb.eq('city', city);
  const { data, error } = await qb;
  if (error) throw new Error(`facets: ${error.message}`);
  // Las ciudades salen del catálogo completo y no de esta consulta: `facets`
  // también está topada y su muestra variaba entre llamadas. Los barrios sí se
  // sacan de aquí, porque dependen de la ciudad ya elegida y ahí el tope no
  // estorba.
  const cities = ciudadesUnificadas(await catalogoDeCiudades(source));
  const zones = barriosPresentables((data ?? []).map((r) => r.zone), cities);
  const types = [...new Set((data ?? []).map((r) => r.type).filter(Boolean))].sort();

  // Entidades con inventario, para el desplegable de la pestaña de Bancos.
  //
  // El conteo se saca de las filas que esta consulta ya trajo, y eso es exacto
  // AQUÍ porque el inventario bancario entero son unos cientos de fichas, muy por
  // debajo del tope de 8.000. En el portal —108.000 filas— el mismo cálculo daría
  // un número truncado, así que no se ofrece: solo se calcula para bancos.
  //
  // Se listan solo las entidades que hoy tienen algo. Ofrecer un banco con cero
  // fichas es ofrecer un filtro que solo puede vaciar la pantalla.
  let banks: Array<{ source: string; count: number }> | undefined;
  if (source === 'bancos') {
    const porFuente = new Map<string, number>();
    for (const fila of data ?? []) {
      if (!fila.source) continue;
      porFuente.set(fila.source, (porFuente.get(fila.source) ?? 0) + 1);
    }
    banks = [...porFuente.entries()]
      .map(([s, count]) => ({ source: s, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  }
  return { cities, zones, types, banks };
}

/** Métricas de portada: totales y oportunidades por ciudad. */
/**
 * Estadísticas del dashboard, CACHEADAS.
 *
 * Sólo cambian cuando corre el motor o un scraper (1-2 veces al día), pero se
 * piden en cada carga de la página y son 5 conteos sobre 105K filas. Se sirven de
 * memoria y se refrescan por detrás: el cliente nunca espera por ellas.
 */
const STATS_TTL_MS = 10 * 60_000;
let statsCache: { at: number; data: Awaited<ReturnType<typeof computeStats>> } | null = null;
let statsInFlight: Promise<Awaited<ReturnType<typeof computeStats>>> | null = null;

export async function stats() {
  if (statsCache) {
    if (Date.now() - statsCache.at >= STATS_TTL_MS && !statsInFlight) {
      // Servir el dato rancio está bien —mejor una cifra de hace un rato que una
      // portada rota—, pero callarse el fallo no. Estos son conteos sobre 108.000
      // filas y son propensos al timeout: si el refresco falla siempre, las cifras
      // de portada se congelan para siempre y nadie se entera hasta que un usuario
      // nota que el titular no cuadra con el listado. Que quede en el registro es
      // lo que convierte «congelado en silencio» en «congelado y avisado».
      void refreshStats().catch((e) => {
        const minutos = Math.round((Date.now() - (statsCache?.at ?? 0)) / 60_000);
        log.error(`no se pudieron recalcular las cifras de portada; se sigue sirviendo la copia de hace ${minutos} min: ${String(e)}`);
      });
    }
    return statsCache.data; // fresco o rancio: se responde ya
  }
  return statsInFlight ?? refreshStats();
}

function refreshStats() {
  statsInFlight = computeStats()
    .then((data) => { statsCache = { at: Date.now(), data }; return data; })
    .finally(() => { statsInFlight = null; });
  return statsInFlight;
}

/** Precalienta las estadísticas al arrancar (la primera carga no debe esperarlas). */
export async function warmStats(): Promise<void> {
  try { await refreshStats(); } catch { /* best-effort */ }
}

async function computeStats() {
  // OJO: un count que falla NO puede devolver 0 en silencio — el dashboard llegó a
  // anunciar "0 oportunidades" porque el timeout se tragaba aquí.
  const head = async (q: any) => {
    const r = await q;
    if (r.error) throw new Error(`stats: ${r.error.message}`);
    return r.count ?? 0;
  };
  // Los MISMOS filtros que el listado y que el panel de zonas, en una sola
  // definición (`soloPortalPublicable`) para que no puedan volver a divergir.
  const base = () => soloPortalPublicable(
    supabase.from('inmuebles').select('id', { count: 'exact', head: true }),
  );
  const [total, opps, high, bancos, remates] = await Promise.all([
    head(base()),
    head(base().eq('is_opportunity', true).lte('discount_pct', MAX_OPP_DISCOUNT)),
    head(base().eq('is_high', true).lte('discount_pct', MAX_OPP_DISCOUNT)),
    // Bancos y remates contaban `is_active` a secas, sin el saneamiento que SÍ
    // aplica el listado, así que el titular prometía más de lo que la pestaña
    // entregaba: 458 bancos que eran 413, y 949 remates que eran 578 —un 64% de
    // más—. La cifra grande de la portada es lo primero que alguien comprueba, y
    // cuando no cuadra con lo que ve al entrar, lo que pierde credibilidad no es
    // el contador: es el resto de los números del producto, que es justo lo que
    // este producto vende.
    head(
      supabase.from('inmuebles').select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('source', BANK_SOURCES as unknown as string[])
        .lte('price', MAX_DISPLAY_PRICE)
        .or(`discount_pct.is.null,discount_pct.lte.${MAX_OPP_DISCOUNT}`),
    ),
    // Las audiencias pasadas no se pueden rematar y el listado no las enseña; el
    // contador tampoco debe sumarlas.
    head(
      supabase.from('remates').select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('auction_date', new Date().toISOString().slice(0, 10)),
    ),
  ]);

  // Lista de ciudades del portal (solo nombres). Antes se hacían 2 counts por
  // ciudad (~266 consultas) que saturaban Supabase al iniciar, y la UI solo usa
  // la CANTIDAD de ciudades — así que basta la lista.
  const { cities } = await facets('portal');
  const perCity = cities.map((c) => ({ city: c }));

  return { portal_total: total, portal_opps: opps, portal_high: high, bancos, remates, perCity, frescura: await leerFrescura() };
}

/**
 * Edad real de los datos, para que el dashboard no afirme «hoy» cuando el cron
 * lleve semanas muerto. Cinco filas, y viaja dentro de la caché de estadísticas.
 *
 * A diferencia de los conteos, un fallo aquí NO tumba las estadísticas: se
 * devuelve `null` y la interfaz dice que no pudo determinar la fecha, que es
 * honesto. Lo que no puede hacer es dejar de mostrar oportunidades por esto.
 */
/* ─────────────────────────  PORTADA (Home con destacados)  ───────────────────────── */

/**
 * Proyección de las columnas que una tarjeta de portada necesita, y NADA más.
 *
 * Traer `features` entero cuesta ~4 KB por fila (galerías completas + descripción)
 * y la portada no pinta ninguna de esas dos cosas: medido, 600 filas con `select('*')`
 * son 2,5 MB y 4 s. Con esta proyección son 135 KB y ~600 ms para 220.
 *
 * Efecto secundario deseado: la dirección, la descripción, la geolocalización y el
 * enlace a la fuente NI SIQUIERA salen de la base en esta ruta. El muro de pago
 * sigue aplicándose después con `redactarMixta` —es él quien manda—, pero una ruta
 * que no pide el dato no puede filtrarlo por descuido. Ya pasó una vez con
 * `/api/property`.
 */
const COLS_DESTACADOS =
  'id, source, city, zone, type, price, area_m2, price_per_m2, discount_pct, '
  + 'crece_index, crece_tier, cascada_nivel, is_opportunity, is_high, image_url, '
  + 'last_seen_at, first_seen_at, '
  + 'bedrooms:features->bedrooms, bathrooms:features->bathrooms, garages:features->garages, '
  + 'stratum:features->stratum, market:features->market';

const COLS_DESTACADOS_REMATE =
  'id, city, department, property_type, minimum_bid, appraisal_value, minimum_bid_pct, '
  + 'auction_date, auction_mode, cuota_parte, origen_demandante, source, image_url, updated_at';

/** Tamaño de los pools que se piden. Holgados a propósito: los bloques descuentan
 *  lo que ya usó el anterior, así que el último debe seguir teniendo de dónde elegir.
 *
 *  Se dimensionan contra lo que la portada pinta COMPLETA (≈190 fichas entre los
 *  cuatro bloques), no contra lo que se ve de entrada. El bloque por ciudad es el
 *  que manda: necesita doce fichas de una MISMA ciudad, y en un pool ordenado por
 *  descuento las ciudades llegan muy repartidas. Medido contra la base: hay ~990
 *  fichas del portal que pasan el filtro de portada, así que 600 no es un límite
 *  que recorte la calidad de lo elegido, solo el trabajo de traerlas. */
const POOL_PORTAL = 600;
// Los bancos van holgados porque más de la mitad de sus fichas con buen descuento
// tienen confianza baja y `esInmuebleDestacable` las descarta: de 144 candidatas
// medidas en producción quedan 80.
const POOL_BANCOS = 250;
// Los remates se filtran y ordenan en TS (su descuento no sale de una columna),
// así que el pool es de las audiencias más próximas: lo lejano no es accionable.
const POOL_REMATES = 260;

/**
 * Reconstruye el `features` que espera el resto del sistema.
 *
 * La proyección devuelve los escalares sueltos (`bedrooms`, `market`…); las
 * tarjetas y `acceso.ts` esperan encontrarlos dentro de `features`. Se rearma aquí
 * y no en el cliente para que la ficha que viaja tenga exactamente la misma forma
 * que la de cualquier listado.
 */
function rearmarInmueble(fila: Record<string, any>): FilaInmueble {
  const { bedrooms, bathrooms, garages, stratum, market, ...resto } = fila;
  return {
    ...(resto as { id: string }),
    features: {
      ...(bedrooms != null ? { bedrooms } : {}),
      ...(bathrooms != null ? { bathrooms } : {}),
      ...(garages != null ? { garages } : {}),
      ...(stratum != null ? { stratum } : {}),
      ...(market ? { market } : {}),
      // La portada enseña una sola foto: la de portada. La galería vive en la ficha.
      images: fila.image_url ? [fila.image_url] : [],
    },
  } as FilaInmueble;
}

async function traerPoolsDestacados() {
  const hoy = new Date().toISOString().slice(0, 10);
  const desdeMes = inicioDeMes().toISOString();

  const inmueblesBase = (fuente: 'portal' | 'bancos') => {
    let qb = supabase.from('inmuebles').select(COLS_DESTACADOS)
      .eq('is_active', true)
      .gte('discount_pct', DESCUENTO_MIN)
      .lte('discount_pct', DESCUENTO_MAX)
      .lte('price', MAX_DISPLAY_PRICE);
    qb = fuente === 'portal'
      // `is_high` es la garantía del portal: el motor solo la concede con confianza
      // alta y comparables del propio barrio. Además excluye los proyectos de
      // preventa sin necesidad de filtrar el JSON, que sobre 108K filas es caro.
      ? qb.eq('source', 'fincaraiz').eq('is_high', true)
      : qb.in('source', BANK_SOURCES as unknown as string[]);
    return qb.order('discount_pct', { ascending: false, nullsFirst: false });
  };

  const [portal, mes, bancos, remates] = await Promise.all([
    inmueblesBase('portal').limit(POOL_PORTAL),
    // Consulta aparte para el bloque del mes: lo que entró este mes puede quedar
    // por debajo del corte de los 220 mejores por descuento y aun así ser lo más
    // interesante del periodo.
    inmueblesBase('portal').gte('first_seen_at', desdeMes).limit(POOL_PORTAL / 2),
    inmueblesBase('bancos').limit(POOL_BANCOS),
    // OJO con `minimum_bid_pct`: viene nula en más de la mitad de los avisos y
    // cuando trae número no es la relación postura/avalúo, así que NO se puede
    // filtrar ni ordenar por ella. El descuento real se calcula en `destacados.ts`
    // a partir de las dos cifras que sí están.
    supabase.from('remates').select(COLS_DESTACADOS_REMATE)
      .eq('is_active', true).gte('auction_date', hoy)
      .not('appraisal_value', 'is', null).not('minimum_bid', 'is', null)
      .order('auction_date', { ascending: true, nullsFirst: false }).limit(POOL_REMATES),
  ]);

  for (const r of [portal, mes, bancos, remates]) {
    if (r.error) throw new Error(`destacados: ${r.error.message}`);
  }

  // El pool del mes se une al general y se deduplica: `armarDestacados` filtra por
  // `first_seen_at`, así que da igual por qué consulta llegó cada ficha.
  const porId = new Map<string, FilaInmueble>();
  for (const fila of [...(portal.data ?? []), ...(mes.data ?? [])] as Record<string, any>[]) {
    porId.set(String(fila.id), rearmarInmueble(fila));
  }

  return {
    portal: [...porId.values()],
    bancos: ((bancos.data ?? []) as Record<string, any>[]).map(rearmarInmueble),
    remates: ((remates.data ?? []) as Record<string, any>[]).map(sanitizeRemateForDisplay) as FilaRemate[],
  };
}

/**
 * Destacados de la portada, CACHEADOS.
 *
 * Mismo trato que `stats()` y por el mismo motivo: es la PRIMERA pantalla del
 * producto, se pide en cada visita y por debajo hay cuatro consultas sobre las
 * 108.000 fichas del portal. En frío cuesta ~2,5 s; servido de memoria, milésimas.
 * Se refresca por detrás cuando caduca, así que el visitante nunca espera por él —
 * y una selección de diez minutos de antigüedad no engaña a nadie: el motor y los
 * scrapers corren una o dos veces al día.
 *
 * La caché guarda las fichas SIN redactar, a propósito: el muro depende del plan de
 * quien pregunta, así que no puede quedarse congelado dentro de una caché que
 * comparten todos. Redactar es lo último que pasa, ya en la ruta.
 */
const DESTACADOS_TTL_MS = 10 * 60_000;
let destacadosCache: { at: number; data: Destacados } | null = null;
let destacadosInFlight: Promise<Destacados> | null = null;

export async function destacados(): Promise<Destacados> {
  if (destacadosCache) {
    if (Date.now() - destacadosCache.at >= DESTACADOS_TTL_MS && !destacadosInFlight) {
      void refreshDestacados().catch(() => {});
    }
    return destacadosCache.data; // fresco o rancio: se responde ya
  }
  return destacadosInFlight ?? refreshDestacados();
}

function refreshDestacados(): Promise<Destacados> {
  destacadosInFlight = traerPoolsDestacados()
    .then((pools) => {
      const data = armarDestacados(pools);
      destacadosCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { destacadosInFlight = null; });
  return destacadosInFlight;
}

/** Precalienta la portada al arrancar: es lo primero que verá el primer visitante. */
export async function warmDestacados(): Promise<void> {
  try { await refreshDestacados(); } catch (e) {
    log.warn(`destacados: no se pudo precalentar (${e instanceof Error ? e.message : String(e)})`);
  }
}

async function leerFrescura(): Promise<Frescura | null> {
  try {
    const { data, error } = await supabase
      .from('radar_cron_jobs')
      .select('nombre, cadencia_dias, habilitado, ultima_corrida, ultimo_estado');
    if (error) throw new Error(error.message);
    return evaluarFrescura((data ?? []) as unknown as TrabajoCron[]);
  } catch (e) {
    log.warn(`frescura: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ── Oportunidades por zona (panel de administración) ─────────────────────────
//
// El panel promete «estadísticas de uso Y DE OPORTUNIDADES POR ZONA». Lo de uso
// sale de `server/account.ts`; esto es lo otro: dónde está el inventario.
//
// La restricción real es que son ~116.000 inmuebles (108.016 publicables) y que
// PostgREST no expone GROUP BY. Traerlos todos al servidor para agrupar en
// memoria son ~116 peticiones de 1.000 filas y decenas de MB por cada carga del
// panel: inviable. La salida es no leer nunca la tabla entera:
//   · las OPORTUNIDADES sí se traen completas (~20.300 filas, 3 columnas) porque
//     el promedio y el mejor descuento no se pueden calcular con un conteo, pero
//     se entra por el índice de descuento, no por la clave primaria;
//   · los inmuebles de banco (~460) caben en una sola respuesta;
//   · remates (~690) y arriendos (~10.300) son tablas propias y pequeñas, así
//     que ahí sí sale barato recorrerlas por franjas de `id`;
//   · el inventario por ciudad se resuelve con `head: true`, que no transporta ni
//     una fila, y solo para las ciudades que caben en la tabla.
// El conteo global del sistema se reutiliza de `stats()` en vez de repetirlo:
// ese conteo sobre las 116.000 filas tarda segundos por sí solo y ya está
// cacheado y precalentado al arrancar. De paso garantiza que el panel y el
// dashboard publiquen exactamente el mismo número, que es medio problema menos.
//
// Medición del cálculo completo contra producción (2026-07-28): ~3 s en frío,
// caché de 10 minutos por delante y precalentado al arrancar el servidor.

const LOTE_ZONAS = 1000;      // tope duro de filas por respuesta de PostgREST
// Medido contra producción el 2026-07-28: el cuello no es la base sino la latencia
// de ida y vuelta de cada petición. Con 6 en paralelo el recorrido de
// oportunidades tardaba 5,2 s y con 12 tarda 1,0 s; de 12 a 20 ya no mejora.
const CONCURRENCIA_ZONAS = 12;

/** Recorre `items` con un número fijo de trabajadores en paralelo. */
async function enParalelo<T>(
  items: readonly T[],
  limite: number,
  tarea: (item: T) => Promise<void>,
): Promise<void> {
  const cola = [...items];
  const trabajadores = Array.from({ length: Math.min(limite, cola.length) }, async () => {
    for (;;) {
      const item = cola.shift();
      if (item === undefined) return;
      await tarea(item);
    }
  });
  await Promise.all(trabajadores);
}

/** Constructor de la consulta ya filtrada, sin orden ni rango. */
type ConsultaLote = (columnas: string) => any;

/**
 * Franjas del espacio de UUID por su primer dígito hexadecimal.
 *
 * POR QUÉ NO SE PAGINA CON `OFFSET`: la primera versión pedía las páginas con
 * `range(9000, 9999)` y compañía, y cada página profunda obliga a Postgres a
 * recorrer y descartar miles de filas antes de empezar a devolver: funcionaba en
 * pruebas aisladas y se caía con «canceling statement due to statement timeout»
 * en cuanto la base tenía algo de trabajo encima. Recortando por rango de `id`
 * no hay nada que descartar y ninguna consulta se vuelve más cara que la
 * anterior.
 *
 * OJO CON CUÁNDO USARLO: recorrer por `id` obliga a entrar por la clave
 * primaria, así que solo vale la pena sobre tablas donde se quiere CASI TODA la
 * tabla (`rental_listings`, `remates`). Para un subconjunto pequeño de una tabla
 * grande —las oportunidades dentro de los 116.000 inmuebles— sale carísimo: se
 * paga leer las 116.000 filas para quedarse con 20.000. Ese caso va por
 * `traerOportunidades`, que entra por el índice de descuento.
 */
const FRANJAS_UUID = (() => {
  const digitos = '0123456789abcdef'.split('');
  const limite = (d: string) => `${d}0000000-0000-0000-0000-000000000000`;
  return digitos.map((d, i) => ({
    desde: limite(d),
    hasta: i + 1 < digitos.length ? limite(digitos[i + 1]) : null,
  }));
})();

/**
 * Reintenta una consulta que Postgres cortó por «statement timeout».
 *
 * No es defensa gratuita: estas consultas conviven con el cron de scraping, con
 * el precalentamiento de comparables del arranque y con el propio dashboard, y
 * basta que coincidan para que una franja suelta se pase del tiempo permitido.
 * Reintentarla cuesta milisegundos; dejar caer el panel entero por eso es lo que
 * hace que el administrador deje de confiar en la pantalla. Los errores que NO
 * son de tiempo (permisos, columna inexistente) se relanzan de inmediato: ahí
 * reintentar solo retrasa el diagnóstico.
 */
interface RespuestaSupabase {
  data?: unknown;
  count?: number | null;
  error: { message: string } | null;
}

async function conReintentoPorTimeout<R extends RespuestaSupabase>(
  etiqueta: string,
  ejecutar: () => PromiseLike<R>,
): Promise<R> {
  const INTENTOS = 3;
  for (let intento = 1; ; intento += 1) {
    // La consulta se reconstruye en cada intento a propósito: los constructores
    // de supabase-js se ejecutan al esperarlos y no está garantizado que
    // reutilizar el mismo objeto vuelva a lanzar la petición.
    const resultado = await ejecutar();
    if (!resultado.error) return resultado;
    if (intento >= INTENTOS || !isTimeout(resultado.error.message)) {
      throw new Error(`${etiqueta}: ${resultado.error.message}`);
    }
    log.warn(`${etiqueta}: timeout, reintento ${intento} de ${INTENTOS - 1}`);
    await new Promise((listo) => setTimeout(listo, 300 * intento));
  }
}

/**
 * Trae TODAS las filas de una consulta, por franjas de `id` y en paralelo.
 *
 * Dentro de cada franja se avanza por cursor (`id > último`), nunca por
 * desplazamiento, así que la consulta cuesta lo mismo en la primera vuelta que
 * en la última. Con ~20.500 oportunidades cada franja son ~1.300 filas: dos
 * vueltas como mucho.
 *
 * El orden por `id` también es lo que hace consistente la paginación: sin
 * `ORDER BY`, Postgres no garantiza el mismo orden entre dos consultas y una
 * fila podría salir dos veces —o ninguna—. Aun así, si un scraper inserta
 * mientras se recorre, el corte puede quedar desalineado por unas pocas filas;
 * para un panel de estadísticas es aceptable, para un listado no lo sería.
 */
async function traerTodasLasFilas<T>(
  etiqueta: string,
  consulta: ConsultaLote,
  columnas: string,
): Promise<T[]> {
  // El `id` viaja siempre aunque quien llama no lo pida: es el cursor.
  type ConId = T & { id?: string };
  const filas: ConId[] = [];
  await enParalelo(FRANJAS_UUID, CONCURRENCIA_ZONAS, async (franja) => {
    let cursor: string | null = null;
    for (;;) {
      const { data } = await conReintentoPorTimeout(etiqueta, () => {
        let qb = consulta(`id, ${columnas}`).order('id').limit(LOTE_ZONAS);
        // La primera vuelta incluye el borde de la franja (`gte`); las
        // siguientes arrancan justo después de la última fila vista (`gt`), que
        // es lo que impide repetirla.
        qb = cursor === null ? qb.gte('id', franja.desde) : qb.gt('id', cursor);
        if (franja.hasta) qb = qb.lt('id', franja.hasta);
        return qb;
      });
      const lote = (data ?? []) as ConId[];
      filas.push(...lote);
      if (lote.length < LOTE_ZONAS) return;
      cursor = lote[lote.length - 1].id ?? null;
      if (cursor === null) throw new Error(`${etiqueta}: lote sin id, no se puede avanzar el cursor`);
    }
  });
  return filas;
}

/**
 * Conjuntos que caben de sobra en una sola respuesta (los ~460 inmuebles de
 * banco activos).
 *
 * Se pide sin ordenar para que el planificador entre por el índice que quiera —
 * ordenar por `id` lo forzaría a la clave primaria y a leer los 116.000
 * inmuebles para quedarse con 460—. Si algún día no cupieran en una respuesta se
 * avisa y se recurre al recorrido por franjas, que es más caro pero correcto:
 * quedarse callado con las primeras 1.000 filas sería publicar un conteo falso.
 */
async function traerConjuntoPequeno<T>(
  etiqueta: string,
  consulta: ConsultaLote,
  columnas: string,
): Promise<T[]> {
  const { data } = await conReintentoPorTimeout(etiqueta, () => consulta(columnas).limit(LOTE_ZONAS));
  const filas = (data ?? []) as T[];
  if (filas.length < LOTE_ZONAS) return filas;
  log.warn(`${etiqueta}: pasó de ${LOTE_ZONAS} filas, se recorre por franjas de id`);
  return traerTodasLasFilas<T>(etiqueta, consulta, columnas);
}

/**
 * Ancho de los tramos de descuento en que se parte el recorrido de
 * oportunidades. Con ~20.300 repartidas entre 0 % y 70 %, tramos de 1 punto dan
 * ~290 filas cada uno y ninguno se acerca al tope de 1.000. Medido: con tramos
 * de 2 puntos nueve de ellos llegaban al tope y había que partirlos sobre la
 * marcha, que salía más lento que pedir el doble de tramos pequeños.
 */
const TRAMO_DESCUENTO = 1;

/** Suelo defensivo por si el motor llegara a marcar un descuento negativo. */
const DESCUENTO_MINIMO = -10_000;

/**
 * Recorre las oportunidades del portal por TRAMOS DE DESCUENTO.
 *
 * Es el mismo conjunto de filas que devolvería un recorrido por `id`, pero por
 * un camino radicalmente más barato: existe el índice parcial
 * `inmuebles_opp_source_idx (source, discount_pct) where is_opportunity and
 * is_active`, así que acotar por descuento entra directo por él y solo se tocan
 * las ~20.500 filas que interesan. Recorriendo por `id` había que leer las
 * 116.000 del portal para descartar 95.000, y eso es exactamente lo que hacía
 * saltar el «statement timeout» cuando la base tenía algo más que hacer.
 *
 * Si un tramo llegara al tope de 1.000 filas se parte en dos y se vuelve a
 * pedir: perder filas en silencio falsearía los conteos del panel, que es el
 * único error que este archivo no se puede permitir.
 */
async function traerOportunidades<T>(consulta: ConsultaLote, columnas: string): Promise<T[]> {
  const etiqueta = 'zonas/oportunidades';

  const traerTramo = async (desde: number, hasta: number, profundidad: number): Promise<T[]> => {
    const { data } = await conReintentoPorTimeout(etiqueta, () => {
      const qb = consulta(columnas).gte('discount_pct', desde).limit(LOTE_ZONAS);
      // El último tramo cierra inclusivo para no dejar fuera el descuento máximo.
      return hasta >= MAX_OPP_DISCOUNT ? qb.lte('discount_pct', hasta) : qb.lt('discount_pct', hasta);
    });
    const filas = (data ?? []) as T[];
    if (filas.length < LOTE_ZONAS) return filas;
    if (profundidad >= 8) {
      throw new Error(`${etiqueta}: el tramo [${desde}, ${hasta}) no se puede partir más`);
    }
    const medio = (desde + hasta) / 2;
    const [bajo, alto] = await Promise.all([
      traerTramo(desde, medio, profundidad + 1),
      traerTramo(medio, hasta, profundidad + 1),
    ]);
    return [...bajo, ...alto];
  };

  const tramos: Array<[number, number]> = [[DESCUENTO_MINIMO, 0]];
  for (let d = 0; d < MAX_OPP_DISCOUNT; d += TRAMO_DESCUENTO) {
    tramos.push([d, Math.min(d + TRAMO_DESCUENTO, MAX_OPP_DISCOUNT)]);
  }

  const filas: T[] = [];
  await enParalelo(tramos, CONCURRENCIA_ZONAS, async ([desde, hasta]) => {
    filas.push(...await traerTramo(desde, hasta, 0));
  });
  return filas;
}

/**
 * Tabla de oportunidades por zona, CACHEADA igual que `stats()`.
 *
 * Los datos solo cambian cuando corre el motor o un scraper (1-2 veces al día),
 * pero calcularla cuesta ~4 s y unas 60 consultas contra Supabase. Sin caché,
 * cada refresco del panel volvería a pagarlo. Se sirve rancio y se refresca por
 * detrás: el administrador nunca espera dos veces.
 */
const ZONAS_TTL_MS = 10 * 60_000;
let zonasCache: { at: number; data: TablaZonas } | null = null;
let zonasInFlight: Promise<TablaZonas> | null = null;

export async function oportunidadesPorZona(): Promise<TablaZonas> {
  if (zonasCache) {
    if (Date.now() - zonasCache.at >= ZONAS_TTL_MS && !zonasInFlight) void refrescarZonas().catch(() => {});
    return zonasCache.data; // fresco o rancio: se responde ya
  }
  return zonasInFlight ?? refrescarZonas();
}

function refrescarZonas() {
  zonasInFlight = computarZonas()
    .then((data) => { zonasCache = { at: Date.now(), data }; return data; })
    .finally(() => { zonasInFlight = null; });
  return zonasInFlight;
}

/**
 * Precalienta la tabla de zonas al arrancar.
 *
 * Va de ÚLTIMA en la cadena de arranque y es best-effort: son ~60 consultas que
 * no le sirven a nadie que entre al dashboard público, así que no pueden
 * competir con `warmStats()` ni con los comparables de las ciudades grandes. A
 * cambio, quien abra el panel de administración lo encuentra ya calculado en vez
 * de esperar los ~3 s del cálculo en frío.
 */
export async function warmZonas(): Promise<void> {
  // `oportunidadesPorZona()` y no `refrescarZonas()`: si un administrador ya
  // abrió el panel mientras arrancaba el servidor, hay un cálculo en vuelo y
  // lanzar el segundo duplicaría ~60 consultas contra la misma base, que es
  // justo lo que hacía saltar el «statement timeout».
  try { await oportunidadesPorZona(); } catch { /* best-effort */ }
}

/**
 * Marca una promesa lanzada pero todavía no esperada como «ya tiene manejador».
 *
 * Sin esto, si el recorrido de bancos fallara mientras seguimos esperando el de
 * oportunidades, Node vería un rechazo sin manejador y —con el comportamiento
 * por defecto desde Node 15— tumbaría el proceso entero del servidor. El error
 * no se traga: la promesa original se sigue esperando más abajo y vuelve a
 * lanzarlo ahí, que es donde sí hay un `try/catch` que lo convierte en un 500.
 */
function sinRechazoHuerfano<T>(promesa: Promise<T>): Promise<T> {
  promesa.catch(() => { /* se relanza al esperarla de verdad */ });
  return promesa;
}

/**
 * Total de inmuebles activos del portal, reutilizado de `stats()`.
 *
 * Un fallo aquí NO puede tumbar la tabla entera: el resto de las cifras —que es
 * lo que de verdad se viene a mirar— ya está calculado y sería absurdo perderlo
 * por un conteo global. Se devuelve `null` y el panel muestra una raya, que es
 * honesto; un cero ahí se leería como «no hay inventario».
 */
async function totalActivosDelSistema(): Promise<number | null> {
  try {
    return (await stats()).portal_total;
  } catch (e) {
    log.warn(`zonas/total: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Inventario activo del portal por ciudad, sin transportar una sola fila. */
async function contarActivosPorCiudad(ciudades: readonly string[]): Promise<Map<string, number>> {
  const activos = new Map<string, number>();
  await enParalelo(ciudades, CONCURRENCIA_ZONAS, async (ciudad) => {
    const { count } = await conReintentoPorTimeout(`zonas/activos(${ciudad})`, () => (
      soloPortalPublicable(
        supabase.from('inmuebles').select('id', { count: 'exact', head: true }),
      ).eq('city', ciudad)
    ));
    activos.set(ciudad, count ?? 0);
  });
  return activos;
}

async function computarZonas(): Promise<TablaZonas> {
  const inicio = Date.now();

  const oportunidadesActivas: ConsultaLote = (columnas) => soloPortalPublicable(
    supabase.from('inmuebles').select(columnas),
  )
    .eq('is_opportunity', true)
    // Mismo tope que `stats()`: un «descuento» del 95 % es un error de datos, no
    // una ganga. Si el panel no lo aplicara, sus totales no cuadrarían con los
    // que el dashboard le muestra al usuario final.
    .lte('discount_pct', MAX_OPP_DISCOUNT);
  const bancosActivos: ConsultaLote = (columnas) => supabase
    .from('inmuebles').select(columnas)
    .eq('is_active', true).in('source', BANK_SOURCES as unknown as string[]);
  const rematesActivos: ConsultaLote = (columnas) => supabase
    .from('remates').select(columnas).eq('is_active', true);
  const arriendosActivos: ConsultaLote = (columnas) => supabase
    .from('rental_listings').select(columnas).eq('is_active', true);

  // Los cinco trabajos arrancan a la vez, pero solo el de oportunidades bloquea:
  // es el que decide QUÉ ciudades entran a la tabla y, por tanto, de cuáles hay
  // que pedir el conteo de inventario. Dejando que los conteos por ciudad se
  // solapen con los recorridos que siguen en vuelo, el cálculo completo baja de
  // ~7 s a ~3 s; hacerlo en dos fases limpias costaba el doble por nada.
  // Cada conjunto se recorre por donde le sale barato: los bancos son un
  // subconjunto diminuto de una tabla enorme (una respuesta basta), remates y
  // arriendos son tablas pequeñas que se quieren casi enteras (franjas de `id`),
  // y las oportunidades entran por el índice de descuento.
  const bancosEnVuelo = sinRechazoHuerfano(traerConjuntoPequeno<FilaCiudad>('zonas/bancos', bancosActivos, 'city'));
  const rematesEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/remates', rematesActivos, 'city'));
  const arriendosEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/arriendos', arriendosActivos, 'city'));
  const totalEnVuelo = sinRechazoHuerfano(totalActivosDelSistema());

  const oportunidades = await traerOportunidades<FilaOportunidad>(
    oportunidadesActivas, 'city, discount_pct, is_high',
  );

  // El corte va ANTES de los conteos por ciudad: son 133 ciudades y cada una
  // cuesta un conteo sobre las 116.000 filas del portal. Contarlas todas serían
  // ~133 consultas pesadas para descartar noventa y tantas filas al final.
  const ciudades = ciudadesPrincipales(oportunidades, MAX_CIUDADES_PANEL);
  const activosEnVuelo = sinRechazoHuerfano(contarActivosPorCiudad(ciudades));

  const [bancos, remates, arriendos, totalActivosSistema, activosPorCiudad] = await Promise.all([
    bancosEnVuelo, rematesEnVuelo, arriendosEnVuelo, totalEnVuelo, activosEnVuelo,
  ]);

  const tabla = construirTablaZonas({
    ciudades,
    oportunidades,
    activosPorCiudad,
    bancos,
    remates,
    arriendos,
    totalActivosSistema,
    // El MISMO tope con el que se filtró la consulta de arriba: si el histograma
    // usara otro, tendría tramos que la consulta nunca iba a poder llenar.
    maxDescuento: MAX_OPP_DISCOUNT,
  });
  log.info(`zonas: ${tabla.zonas.length} ciudades en ${Date.now() - inicio}ms`);
  return tabla;
}

/* ─────────────────  MÉTRICAS DE OPERACIÓN (gráficas del panel)  ───────────────── */

/**
 * Días de historia de scraping que se dibujan.
 *
 * Treinta cubre cuatro ciclos completos del cron semanal, que es lo que hace
 * falta para distinguir «esta semana falló» de «lleva un mes fallando». Con más
 * ventana las columnas se vuelven ilegibles sin aportar una decisión distinta.
 */
export const DIAS_METRICAS = 30;

/**
 * Tope defensivo de filas de `scraping_logs`.
 *
 * Hoy la tabla entera tiene menos de cien filas, pero crece una por corrida y
 * para siempre: sin tope, dentro de un año esta consulta traería miles de filas
 * en cada carga del panel. Se pide ordenado por fecha descendente para que, si
 * algún día se llegara al tope, lo que se recorte sea lo VIEJO —que ya está
 * fuera de la ventana de 30 días— y no lo reciente.
 */
const MAX_FILAS_CORRIDAS = 2_000;

export interface MetricasOperacion {
  generadoEn: string;
  ventanaDias: number;
  scraping: SerieCorridas;
  trabajos: TrabajoAutomatico[];
}

/**
 * Métricas de operación, CACHEADAS igual que `stats()` y la tabla de zonas.
 *
 * Son dos consultas pequeñas (unas decenas de filas de `scraping_logs` y las
 * cinco de `radar_cron_jobs`), así que el motivo de la caché no es el costo:
 * es que el panel entero se recarga tras cada cambio de suscripción y no tiene
 * sentido volver a preguntar por unos datos que solo se mueven cuando corre un
 * scraper. TTL corto —cinco minutos— porque aquí lo que se viene a mirar es
 * justamente si algo acaba de fallar.
 */
const METRICAS_TTL_MS = 5 * 60_000;
let metricasCache: { at: number; data: MetricasOperacion } | null = null;
let metricasEnVuelo: Promise<MetricasOperacion> | null = null;

export async function metricasOperacion(): Promise<MetricasOperacion> {
  if (metricasCache) {
    if (Date.now() - metricasCache.at >= METRICAS_TTL_MS && !metricasEnVuelo) {
      void refrescarMetricas().catch(() => {});
    }
    return metricasCache.data; // fresco o rancio: se responde ya
  }
  return metricasEnVuelo ?? refrescarMetricas();
}

function refrescarMetricas() {
  metricasEnVuelo = computarMetricas()
    .then((data) => { metricasCache = { at: Date.now(), data }; return data; })
    .finally(() => { metricasEnVuelo = null; });
  return metricasEnVuelo;
}

/** Precalienta las métricas del panel al arrancar (van con las zonas, al final). */
export async function warmMetricas(): Promise<void> {
  try { await metricasOperacion(); } catch { /* best-effort */ }
}

async function computarMetricas(): Promise<MetricasOperacion> {
  // Solo se piden las corridas que pueden caer dentro de la ventana. El margen
  // de un día cubre el desfase horario de Bogotá: una corrida de las 20:00 del
  // primer día de la ventana es del día siguiente en UTC.
  const desde = new Date(Date.now() - (DIAS_METRICAS + 1) * 86_400_000).toISOString();

  const [corridas, trabajos] = await Promise.all([
    supabase
      .from('scraping_logs')
      .select('source, status, started_at, records_found, records_inserted')
      .gte('started_at', desde)
      .order('started_at', { ascending: false })
      .limit(MAX_FILAS_CORRIDAS),
    supabase
      .from('radar_cron_jobs')
      .select('nombre, cadencia_dias, habilitado, ultima_corrida, ultimo_estado, corriendo_desde'),
  ]);

  // Un fallo aquí NO tumba el panel: el resto de las secciones —que es lo que
  // el administrador viene a operar— no depende de estas dos tablas. Se devuelve
  // la serie vacía y la interfaz dice que no pudo leerlas, que es honesto.
  if (corridas.error) log.warn(`metricas/scraping_logs: ${corridas.error.message}`);
  if (trabajos.error) log.warn(`metricas/radar_cron_jobs: ${trabajos.error.message}`);

  return {
    generadoEn: new Date().toISOString(),
    ventanaDias: DIAS_METRICAS,
    scraping: serieCorridasPorDia((corridas.data ?? []) as FilaCorrida[], { dias: DIAS_METRICAS }),
    trabajos: estadoTrabajos((trabajos.data ?? []) as FilaTrabajo[]),
  };
}

/*
 * ─── Qué merece salir en el desplegable de barrio ───
 *
 * La columna `zone` es lo que el aviso trae escrito, y ahí cabe de todo: barrios
 * de verdad, pero también veredas («Vereda Vanguardia»), corregimientos y
 * conjuntos residenciales concretos («Torres del Marfil»). Mezclados en la misma
 * lista, el desplegable deja de ser un mapa de la ciudad y pasa a ser un vertedero
 * donde el barrio que buscas está perdido entre nombres de edificios.
 *
 * SE FILTRA AL PRESENTAR, NO SE TOCA EL DATO. `zone` no es solo una etiqueta: el
 * motor de comparables agrupa por ella para decidir contra qué se mide un
 * inmueble, así que reescribirla en la base cambiaría el veredicto de miles de
 * fichas de golpe y sin vuelta atrás. Además el scraper la vuelve a escribir en
 * cada pasada, con lo que habría que repetir la limpieza para siempre. Aquí solo
 * se decide qué se ofrece como filtro; el inmueble sigue teniendo su zona y
 * comparándose igual que antes.
 */

/**
 * Nombres que describen un tipo de asentamiento o de vía, no un barrio.
 *
 * Va sin anclar al principio a propósito: la palabra delatora casi nunca abre el
 * nombre. «Arboretto Conjunto Residencial», «Ruitoque Condominio» y «Agrupación
 * Macadamia» se colaban enteros cuando la comprobación solo miraba la primera
 * palabra, que es como estaba escrita al principio.
 */
const NO_ES_BARRIO = /(^|\s)(vereda|corregimiento|parcelaci[oó]n|condominio|conjunto|urbanizaci[oó]n|agrupaci[oó]n|edificio|torres?|manzana|etapa|lote|hacienda|senderos?|quintas?|km\.?\s*\d|kil[oó]metro|v[ií]a|avenida|carrera|calle|diagonal|transversal|autopista|anillo vial)(\s|$)/i;

/** Cuántas fichas debe tener una zona para considerarla un barrio y no un edificio suelto. */
const MINIMO_FICHAS_POR_BARRIO = 3;

/** Minúsculas y sin tildes, para comparar nombres de sitio escritos de cualquier forma. */
const claveDeLugar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function barriosPresentables(
  zonas: Array<string | null | undefined>,
  ciudades: Array<string | null | undefined> = [],
): string[] {
  // Un municipio no es un barrio de sí mismo ni de su vecino. En las facetas
  // aparecían «Bogotá» como barrio de Bogotá —y de Chía— porque muchos avisos
  // repiten la ciudad en el campo de zona cuando no traen el barrio. Ofrecerlo
  // como filtro promete una precisión que no existe: elegirlo no acota nada.
  const municipios = new Set(ciudades.filter(Boolean).map((c) => claveDeLugar(String(c))));

  const cuenta = new Map<string, number>();
  for (const z of zonas) {
    if (!z) continue;
    const nombre = String(z).trim();
    if (!nombre || NO_ES_BARRIO.test(nombre)) continue;
    // «Bogotá, d.c.» y «Bogota» son el mismo sitio escrito de dos maneras.
    if (municipios.has(claveDeLugar(nombre.replace(/,\s*d\.?\s*c\.?$/i, '')))) continue;
    cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
  }
  // El umbral de frecuencia es lo que separa «Laureles» de «Torres del Marfil»
  // cuando el nombre no delata al segundo: un conjunto cerrado aporta una o dos
  // fichas, un barrio aporta decenas. Si la ciudad entera tiene poco inventario y
  // el filtro dejaría la lista vacía, se devuelve lo que haya: un desplegable con
  // ruido sigue siendo mejor que uno vacío en una ciudad pequeña.
  const frecuentes = [...cuenta.entries()].filter(([, n]) => n >= MINIMO_FICHAS_POR_BARRIO);
  const elegidas = frecuentes.length ? frecuentes : [...cuenta.entries()];
  return elegidas.map(([nombre]) => nombre).sort();
}

/*
 * ─── La misma ciudad escrita de varias formas ───
 *
 * En la base conviven «bogota» y «bogota d.c.», «jamundi» y «jamundi -»,
 * «floridablanca» y «florida blanca». Cada scraper escribe lo que trae el aviso,
 * y nadie normalizó nunca esa columna.
 *
 * El efecto medido es peor que un desplegable feo: filtrar por «bogota» devolvía
 * 58 fichas y por «bogota d.c.» otras 2 completamente distintas. Quien elige una
 * está viendo una fracción del inventario de su ciudad sin ninguna señal de que
 * exista el resto — el producto le está ocultando oportunidades reales.
 *
 * Se resuelve SIN tocar el dato, por la misma razón que los barrios: la columna
 * la reescribe el scraper en cada pasada, así que una limpieza habría que
 * repetirla para siempre. Aquí se agrupan las variantes al ofrecerlas y se
 * expanden al filtrar, que es donde importa.
 */

/** Sin tildes, sin puntuación y sin espacios: «Bogotá, D.C.» y «bogota dc» colapsan. */
export function clavePlanaDeCiudad(nombre: string): string {
  return nombre
    .normalize('NFD')
    // Escapado y no el carácter literal: la clase de marcas combinantes escrita a
    // mano se corrompe con cualquier herramienta que reescriba el archivo, y el
    // síntoma es que deja de agrupar sin que nada falle.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    // \u00abBogot\u00e1 D.C.\u00bb y \u00abBogot\u00e1\u00bb son la misma ciudad: el distrito capital es una
    // categor\u00eda administrativa, no parte del nombre que alguien busca. Se quita
    // al final y solo si queda algo, para no convertir un nombre entero en vac\u00edo.
    .replace(/(distritocapital|dc)$/, '') || nombre.trim().toLowerCase();
}

/**
 * Agrupa variantes y devuelve un nombre por ciudad real.
 *
 * Gana la forma más corta —«bogota» antes que «bogota d.c.»— porque las colas
 * («d.c.», el guion suelto) son ruido de captura, no parte del nombre.
 */
export function ciudadesUnificadas(ciudades: Array<string | null | undefined>): string[] {
  const porClave = new Map<string, string>();
  for (const c of ciudades) {
    if (!c) continue;
    const nombre = String(c).trim();
    if (!nombre) continue;
    const clave = clavePlanaDeCiudad(nombre);
    if (!clave) continue;
    const actual = porClave.get(clave);
    if (!actual || nombre.length < actual.length) porClave.set(clave, nombre);
  }
  return [...porClave.values()].sort();
}

/** Todas las formas en que esta ciudad aparece escrita en la base. */
export function variantesDeCiudad(ciudad: string, todas: Array<string | null | undefined>): string[] {
  const clave = clavePlanaDeCiudad(ciudad);
  const variantes = todas
    .filter((c): c is string => Boolean(c) && clavePlanaDeCiudad(String(c)) === clave)
    .map((c) => String(c));
  // Si no se conoce el catálogo todavía, se filtra por lo que pidió el usuario:
  // es exactamente el comportamiento anterior, nunca peor.
  return variantes.length ? [...new Set(variantes)] : [ciudad];
}

/**
 * Catálogo de ciudades tal como están escritas, cacheado.
 *
 * Hace falta para expandir un filtro a sus variantes, y se consulta una vez cada
 * diez minutos: pedirlo en cada búsqueda añadiría una consulta a cada listado
 * para un dato que cambia cuando corre el scraper, no cuando alguien filtra.
 *
 * Un fallo aquí NO puede tumbar la búsqueda: se devuelve lo último que se supo, o
 * una lista vacía, y entonces el filtro se comporta como siempre se comportó.
 */
const CIUDADES_TTL_MS = 10 * 60_000;
const cacheCiudades = new Map<string, { at: number; datos: string[] }>();

/**
 * Se pide POR FUENTE y no de golpe.
 *
 * Una sola consulta a `inmuebles` se lleva un tope de filas, y con 108.000 del
 * portal las variantes raras se quedan fuera del corte: «bogota d.c.» son dos
 * fichas de banco y no aparecían nunca, así que la expansión no unía nada. Por
 * fuente, los bancos caben enteros y el portal trae sus ciudades frecuentes.
 */
async function catalogoDeCiudades(fuente: 'portal' | 'bancos' | 'remates'): Promise<string[]> {
  const cache = cacheCiudades.get(fuente);
  if (cache && Date.now() - cache.at < CIUDADES_TTL_MS) return cache.datos;
  try {
    // Los remates viven en su propia tabla y con su propia captura, así que
    // heredan el mismo problema por su cuenta: la ciudad la escribe quien
    // transcribe el edicto del juzgado, no un formulario.
    let qb = fuente === 'remates'
      ? supabase.from('remates').select('city').limit(8000)
      : supabase.from('inmuebles').select('city').eq('is_active', true).limit(8000);
    if (fuente === 'portal') qb = qb.eq('source', 'fincaraiz');
    else if (fuente === 'bancos') qb = qb.in('source', BANK_SOURCES as unknown as string[]);
    const { data, error } = await qb;
    if (error) throw new Error(error.message);
    // SE ACUMULA, no se reemplaza.
    //
    // La consulta trae 8.000 filas de las 108.000 del portal, y PostgREST elige
    // cuáles sin ningún orden garantizado: cada llamada ve un trozo distinto del
    // inventario. Quedarse con la última respuesta hacía que el desplegable
    // ofreciera entre 45 y 77 ciudades según el momento y que municipios con
    // inventario real —Nilo con 103 fichas, Buga con 65— aparecieran una vez de
    // cada quince.
    //
    // Ordenar no lo arregla: con `order` el tope de filas devuelve solo las
    // ciudades alfabéticamente primeras, y la lista baja a once. Acumular sí: cada
    // refresco añade lo que vea y la lista converge hacia el catálogo completo sin
    // volver a encoger. El precio es que una ciudad que se quede sin inventario
    // sigue ofreciéndose hasta el próximo reinicio, y ahí la búsqueda saldrá vacía
    // — mucho menos grave que esconder inventario que sí existe.
    const vistas = new Set(cacheCiudades.get(fuente)?.datos ?? []);
    for (const fila of data ?? []) if ((fila as any).city) vistas.add((fila as any).city as string);
    const datos = [...vistas];
    cacheCiudades.set(fuente, { at: Date.now(), datos });
    return datos;
  } catch (e) {
    log.error(`no se pudo leer el catálogo de ciudades de ${fuente}: ${String(e)}`);
    return cache?.datos ?? [];
  }
}

/** Qué escribir en el `in(...)` de la consulta para cubrir todas las formas de esa ciudad. */
export async function ciudadesParaFiltrar(ciudad: string, fuente: 'portal' | 'bancos' | 'remates'): Promise<string[]> {
  return variantesDeCiudad(ciudad, await catalogoDeCiudades(fuente));
}

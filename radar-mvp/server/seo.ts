/**
 * Lo que Google puede leer del Radar sin ejecutar JavaScript.
 *
 * La app es una sola página que se arma en el navegador: para un rastreador, todas
 * las combinaciones de ciudad y tipo eran la misma URL con el mismo título y sin un
 * solo enlace que las descubriera. Este módulo produce las tres cosas que faltaban
 * —enlaces rastreables, un título por combinación y un mapa del sitio— y las tres
 * salen del inventario real, no de una lista escrita a mano.
 *
 * Eso último es la diferencia entre un bloque de enlaces útil y uno que perjudica:
 * el documento del cliente proponía Bogotá, Medellín y Cali en las cuatro columnas,
 * y al medirlo resultó que Cali no tiene ni una casa ni un apartamento en remate.
 * Dos de los doce enlaces habrían llevado a una pantalla vacía, que es justo lo que
 * Google penaliza y lo que hace que un visitante no vuelva.
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('seo');

/** Cada columna del bloque: qué se busca, dónde vive y cómo se lee. */
export interface CategoriaSeo {
  /** Identificador corto, para las claves del caché y las pruebas. */
  id: string;
  /** Encabezado de la columna. */
  titulo: string;
  /** Cómo se nombra un enlace de esta categoría: `${singular} en ${Ciudad}`. */
  patron: string;
  tab: 'portal' | 'bancos' | 'remates';
  type: 'house' | 'apartment';
  /** Solo en Portal: acota a las mejores diferencias contra el mercado. */
  tier?: string;
}

/**
 * Las cuatro clasificaciones que pidió el cliente. «Barato» se traduce a la
 * valoración que el propio producto usa para las mejores diferencias frente al
 * mercado, que es lo más cercano a lo que alguien busca cuando escribe «casas
 * baratas» y lo único que el Radar puede sostener con datos.
 */
export const CATEGORIAS_SEO: CategoriaSeo[] = [
  { id: 'casas-remate', titulo: 'Casas en remate', patron: 'Casas en remate', tab: 'remates', type: 'house' },
  { id: 'aptos-remate', titulo: 'Apartamentos en remate', patron: 'Apartamentos en remate', tab: 'remates', type: 'apartment' },
  { id: 'casas-baratas', titulo: 'Casas baratas', patron: 'Casas baratas', tab: 'portal', type: 'house', tier: 'oportunidad_fuerte' },
  { id: 'aptos-baratos', titulo: 'Apartamentos baratos', patron: 'Apartamentos baratos', tab: 'portal', type: 'apartment', tier: 'oportunidad_fuerte' },
];

/** Ciudades por columna. Tres es lo que pidió el cliente, siguiendo a FincaRaíz. */
const CIUDADES_POR_COLUMNA = 3;

/**
 * Mínimo de fichas para que una ciudad merezca su propio enlace.
 *
 * Con una sola ficha la página existe pero no dice nada, y el enlace promete un
 * listado que no hay. Tres es poco exigente a propósito: en remates el inventario
 * nacional de una categoría son decenas, no miles, y pedir más dejaría columnas
 * enteras sin enlaces.
 */
const MINIMO_FICHAS_CIUDAD = 3;

const TTL_MS = 6 * 60 * 60 * 1000; // el inventario se mueve por corridas del cron, no por minuto
let cache: { at: number; datos: Map<string, CiudadSeo[]> } | null = null;

export interface CiudadSeo {
  /** Como está en la base y como lo espera el filtro: minúsculas, sin tildes. */
  slug: string;
  /** Para el texto del enlace. */
  nombre: string;
  n: number;
}

/** «bogota» → «Bogotá». Solo las que se enlazan; el resto se capitaliza y ya. */
const TILDES: Record<string, string> = {
  bogota: 'Bogotá', medellin: 'Medellín', cali: 'Cali', barranquilla: 'Barranquilla',
  cartagena: 'Cartagena', bucaramanga: 'Bucaramanga', cucuta: 'Cúcuta', pereira: 'Pereira',
  manizales: 'Manizales', ibague: 'Ibagué', villavicencio: 'Villavicencio', neiva: 'Neiva',
  armenia: 'Armenia', 'santa marta': 'Santa Marta', monteria: 'Montería', pasto: 'Pasto',
  popayan: 'Popayán', tunja: 'Tunja', sincelejo: 'Sincelejo', valledupar: 'Valledupar',
  envigado: 'Envigado', itagui: 'Itagüí', bello: 'Bello', soacha: 'Soacha', chia: 'Chía',
  girardot: 'Girardot', espinal: 'Espinal', palmira: 'Palmira', dosquebradas: 'Dosquebradas',
  floridablanca: 'Floridablanca', 'florida blanca': 'Floridablanca',
};

export const nombreDeCiudad = (slug: string): string =>
  TILDES[slug] ?? slug.replace(/(^|\s)\p{Ll}/gu, (m) => m.toUpperCase());

/** La URL que abre esa combinación en la app. Relativa: sirve en cualquier dominio. */
export function urlDeCategoria(cat: CategoriaSeo, ciudad?: string): string {
  const p = new URLSearchParams();
  p.set('tab', cat.tab);
  if (cat.tier) p.set('tier', cat.tier);
  p.set('type', cat.type);
  if (ciudad) p.set('city', ciudad);
  return `/?${p.toString()}`;
}

/**
 * Cuántas ciudades se preseleccionan antes de contarlas de verdad.
 *
 * Doce para quedarse con tres: hay margen de sobra para que la muestra se
 * equivoque de orden sin que se pierda ninguna candidata real.
 */
const CANDIDATAS = 12;

/** Consulta base de una categoría, sin proyección: la comparten el muestreo y el conteo. */
function consultaDe(cat: CategoriaSeo, proyeccion: string, opciones?: { count: 'exact'; head: true }) {
  if (cat.tab === 'remates') {
    return supabase.from('remates').select(proyeccion, opciones)
      .eq('is_active', true).eq('property_type', cat.type)
      .gte('auction_date', new Date().toISOString().slice(0, 10));
  }
  const q = supabase.from('inmuebles').select(proyeccion, opciones)
    .eq('is_active', true).eq('source', 'fincaraiz').eq('type', cat.type);
  return cat.tier ? q.eq('crece_tier', cat.tier) : q;
}

/**
 * Ciudades con más inventario de una categoría.
 *
 * En dos pasos, y el motivo es que PostgREST corta en 1.000 filas pase lo que
 * pase — se le pidan 8.000 o se le pida todo. Contar sobre lo que devuelve una
 * sola consulta es contar sobre una muestra del 17% elegida sin ningún orden
 * garantizado: las tres ciudades salían distintas entre reinicios, y con ellas
 * los enlaces que ve Google, que es justo lo que no puede bailar.
 *
 * Así que la muestra se usa solo para lo que sirve: descartar de golpe las
 * noventa ciudades que no pintan nada. Las doce que sobreviven se cuentan una por
 * una con `count: exact`, que no depende del tope, y de ahí salen las tres del
 * bloque, ya en su orden real.
 */
async function contarPorCiudad(cat: CategoriaSeo): Promise<CiudadSeo[]> {
  const { data, error } = await consultaDe(cat, 'city').limit(1000);
  if (error) throw new Error(error.message);

  const vistas = new Map<string, number>();
  for (const f of (data ?? []) as unknown as Array<{ city: string | null }>) {
    const c = (f.city ?? '').trim().toLowerCase();
    if (c) vistas.set(c, (vistas.get(c) ?? 0) + 1);
  }
  const candidatas = [...vistas.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATAS)
    .map(([slug]) => slug);

  const exactos: CiudadSeo[] = [];
  for (const slug of candidatas) {
    const { count } = await consultaDe(cat, 'id', { count: 'exact', head: true }).eq('city', slug);
    const n = count ?? 0;
    if (n >= MINIMO_FICHAS_CIUDAD) exactos.push({ slug, nombre: nombreDeCiudad(slug), n });
  }
  return exactos
    .sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug))
    .slice(0, CIUDADES_POR_COLUMNA);
}

/**
 * Ciudades con inventario por categoría. Si la consulta falla se devuelve lo
 * último que se supo —o nada—: un bloque de enlaces desactualizado es mucho mejor
 * que una página que no carga porque Supabase tuvo un mal minuto.
 */
export async function ciudadesDestacadas(): Promise<Map<string, CiudadSeo[]>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.datos;
  try {
    const datos = new Map<string, CiudadSeo[]>();
    for (const cat of CATEGORIAS_SEO) datos.set(cat.id, await contarPorCiudad(cat));
    cache = { at: Date.now(), datos };
    return datos;
  } catch (e) {
    log.error(`SEO: no se pudieron contar las ciudades: ${String(e)}`);
    return cache?.datos ?? new Map();
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * El bloque de enlaces, ya en HTML.
 *
 * Son `<a href>` de verdad y no botones con JavaScript: es la única forma de que
 * un rastreador los siga sin ejecutar la aplicación, y de paso funcionan con el
 * botón central del ratón, en una pestaña nueva y con el enlace copiado.
 */
export async function bloqueSeoHtml(): Promise<string> {
  const ciudades = await ciudadesDestacadas();
  const columnas = CATEGORIAS_SEO.map((cat) => {
    const lista = ciudades.get(cat.id) ?? [];
    // Una columna sin ciudades con inventario se cae entera. Enseñar el titular
    // con un único enlace «Más» promete una sección que hoy no tiene nada.
    if (!lista.length) return '';
    const enlaces = lista.map((c) =>
      `<a href="${esc(urlDeCategoria(cat, c.slug))}">${esc(`${cat.patron} en ${c.nombre}`)}</a>`).join('');
    return `<div class="seo-col"><h4>${esc(cat.titulo)}</h4>${enlaces}`
      + `<a class="seo-mas" href="${esc(urlDeCategoria(cat))}">Más ${esc(cat.patron.toLowerCase())}</a></div>`;
  }).filter(Boolean);

  if (!columnas.length) return '';
  return `<nav class="seo-enlaces" aria-label="Búsquedas frecuentes">`
    + `<h3>Búsquedas frecuentes</h3><div class="seo-cols">${columnas.join('')}</div></nav>`;
}

/* ─────────────────────────── Título y descripción ─────────────────────────── */

const TIPO_SINGULAR: Record<string, string> = { house: 'Casas', apartment: 'Apartamentos' };
const SECCION: Record<string, string> = {
  remates: 'en remate', bancos: 'de bancos', portal: 'en venta',
};

export interface MetaPagina {
  title: string;
  description: string;
  /** Ruta canónica, sin dominio: quien sirve la página le antepone el suyo. */
  canonical: string;
}

/**
 * Título y descripción para una combinación concreta.
 *
 * Todas las URLs devolvían el mismo `<title>` y ninguna traía descripción, así que
 * para Google eran la misma página repetida. Esto las distingue con las palabras
 * que alguien escribiría en el buscador.
 */
export function metaDeUrl(params: URLSearchParams): MetaPagina {
  const MARCA = 'Radar de Oportunidades Inmobiliarias';
  const tab = params.get('tab');
  const type = params.get('type');
  const city = params.get('city');
  const tier = params.get('tier');

  // La canónica se queda solo con lo que define el contenido. El orden, la página
  // y los rangos de precio producen variantes que Google leería como duplicados.
  const canon = new URLSearchParams();
  if (tab && tab !== 'home') canon.set('tab', tab);
  if (tier) canon.set('tier', tier);
  if (type) canon.set('type', type);
  if (city) canon.set('city', city);
  const canonical = canon.toString() ? `/?${canon.toString()}` : '/';

  if (!tab || tab === 'home' || (!type && !city)) {
    return {
      title: `${MARCA} | Inmuebles por debajo del precio de mercado en Colombia`,
      description: 'Compara inmuebles de portales, bancos y remates judiciales contra el precio '
        + 'real de su zona. Cada semana, las oportunidades con mayor diferencia frente al mercado.',
      canonical,
    };
  }

  const tipo = type ? TIPO_SINGULAR[type] ?? 'Inmuebles' : 'Inmuebles';
  const seccion = SECCION[tab] ?? '';
  const barato = tier === 'oportunidad_fuerte' && tab === 'portal';
  const donde = city ? ` en ${nombreDeCiudad(city)}` : ' en Colombia';
  const que = barato ? `${tipo} baratas`.replace('Apartamentos baratas', 'Apartamentos baratos')
    : `${tipo} ${seccion}`.trim();

  const description = tab === 'remates'
    ? `${que}${donde}: postura mínima, avalúo del juzgado y fecha de audiencia, actualizados cada semana.`
    : barato
      ? `${que}${donde} con el mayor descuento frente al precio de su zona, comparados contra avisos similares.`
      : `${que}${donde}: precio, área y diferencia frente al mercado de la zona.`;

  return { title: `${que}${donde} | ${MARCA}`, description, canonical };
}

/* ────────────────────────────── Mapa del sitio ────────────────────────────── */

/** Rutas fijas que deben estar en el mapa aunque no dependan del inventario. */
const RUTAS_FIJAS = ['/', '/planes', '/terminos'];

export async function sitemapXml(base: string): Promise<string> {
  const ciudades = await ciudadesDestacadas();
  const urls = new Set<string>(RUTAS_FIJAS);
  for (const cat of CATEGORIAS_SEO) {
    urls.add(urlDeCategoria(cat));
    for (const c of ciudades.get(cat.id) ?? []) urls.add(urlDeCategoria(cat, c.slug));
  }
  // Las tres secciones sueltas: son las que un visitante reconoce por su nombre.
  for (const t of ['portal', 'bancos', 'remates']) urls.add(`/?tab=${t}`);

  const cuerpo = [...urls].map((u) => {
    // La portada manda sobre las secciones; una combinación completa vale menos
    // que su categoría sin ciudad, que es la que agrupa el inventario.
    const prioridad = u === '/' ? '1.0' : u.includes('city=') ? '0.6' : '0.8';
    return `  <url><loc>${esc(base + u)}</loc><changefreq>weekly</changefreq>`
      + `<priority>${prioridad}</priority></url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${cuerpo}\n</urlset>\n`;
}

/**
 * `robots.txt`.
 *
 * Se bloquea `/api/` y las pantallas de sesión: no aportan nada en un resultado de
 * búsqueda y gastan presupuesto de rastreo. El resto queda abierto — hasta hoy no
 * había archivo, que no bloquea nada pero tampoco dice dónde está el mapa.
 */
export function robotsTxt(base: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /login',
    'Disallow: /cuenta',
    'Disallow: /auth/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

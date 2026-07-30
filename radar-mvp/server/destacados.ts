/**
 * Selección de los destacados de la portada (Home).
 *
 * LÓGICA PURA: recibe los pools ya consultados y decide qué entra en cada bloque
 * y —sobre todo— POR QUÉ. No conoce Supabase ni sale a la red, para poder probar
 * el criterio comercial (que es lo que el cliente revisa) sin datos reales.
 *
 * Los cuatro bloques son cuatro LENTES sobre el mismo inventario, no cuatro
 * rankings intercambiables:
 *   · semana   → el mayor descuento, con el punto de entrada rotando cada semana.
 *   · mes      → lo que ENTRÓ al Radar en el mes en curso, por Índice CRECE.
 *   · ciudades → lo mejor de cada una de las ciudades con más inventario marcado.
 *   · fuentes  → el cruce de portal, bancos y remates, que es el valor del Radar.
 *
 * Una ficha sale en UN solo bloque: repetir la misma tarjeta cuatro veces haría
 * ver la portada más pequeña de lo que de verdad es.
 *
 * NADA de lo que se decide aquí sustituye al muro de pago. Estas funciones eligen
 * y explican; quitar de la fila lo que el plan no cubre le toca a `acceso.ts`, y
 * ocurre después, ya con el plan del usuario delante.
 */
import { clasificar, redondearIndice } from '../engine/crece.js';
import { rotarSemanal, semanaISO } from '../engine/rotacion.js';
import { periodoDe } from './cupo.js';

export type FuenteDestacado = 'portal' | 'banco' | 'remate';

/**
 * Banda de descuento creíble.
 *
 * El mínimo es donde empiezan las dos categorías que el negocio vende: la tabla
 * maestra (engine/crece.ts) abre "Oportunidad" en índice 0,80, que es justo un 20%
 * por debajo de la mediana de la zona. Destacar algo con menos sería anunciar como
 * oportunidad lo que el propio sistema clasifica como "Interesante".
 *
 * El máximo es el de `server/recommend.ts`: un aviso a más de 60% bajo el mercado
 * es casi siempre un área o un precio mal cargados, y la portada es el peor sitio
 * posible para estrenar un dato roto — hoy la base tiene fichas con "99% de
 * descuento" que son exactamente eso.
 */
export const DESCUENTO_MIN = 20;
export const DESCUENTO_MAX = 60;

/**
 * Cuántas fichas trae cada bloque, y cuántas se pintan antes de pedir "ver todas".
 *
 * Son DOS números por bloque a propósito. La portada tiene que caber en una
 * pantalla —si para llegar al segundo bloque hay que rodar cuarenta tarjetas,
 * los otros tres criterios no existen—, pero enseñar seis fichas de un inventario
 * de más de mil hace ver el Radar mucho más pequeño de lo que es. Así que cada
 * bloque viaja completo y se pinta recortado: `preview` de entrada, el resto a un
 * clic y SIN volver a la red, porque las fichas ya llegaron —y ya pasaron por el
 * muro de pago— en la misma respuesta.
 */
export const TAMANOS = {
  /** Ventana que rota cada semana. Todas sus fichas deben poder ser portada. */
  poolSemana: 120,
  /** Fichas visibles de entrada en un bloque de un solo grupo. */
  preview: 10,
  semana: 40,
  mes: 40,
  ciudades: 6,
  porCiudad: 12,
  /** En las filas por ciudad el recorte es más corto: una fila limpia por ciudad. */
  previewCiudad: 3,
  porFuente: 12,
  /** Cuántas trae el top de cada fuente en la portada. */
  porFuenteTop: 40,
} as const;

export interface FilaInmueble {
  id: string;
  source?: string | null;
  city?: string | null;
  zone?: string | null;
  type?: string | null;
  price?: number | null;
  area_m2?: number | null;
  discount_pct?: number | null;
  crece_index?: number | null;
  crece_tier?: string | null;
  /** Nivel de la cascada de comparables: barrio | zona_ampliada | ciudad. */
  cascada_nivel?: string | null;
  is_high?: boolean | null;
  first_seen_at?: string | null;
  features?: Record<string, any> | null;
  [clave: string]: any;
}

export interface FilaRemate {
  id: string;
  city?: string | null;
  property_type?: string | null;
  minimum_bid?: number | null;
  appraisal_value?: number | null;
  minimum_bid_pct?: number | null;
  auction_date?: string | null;
  cuota_parte?: number | null;
  origen_demandante?: string | null;
  [clave: string]: any;
}

/** Por qué esta ficha concreta está en la portada. Se pinta debajo de la tarjeta. */
export interface SelloDestacado {
  fuente: FuenteDestacado;
  /** El número que sostiene la selección, en % y redondeado. */
  descuento: number | null;
  /** Contra QUÉ se mide ese número. Las tres fuentes no miden lo mismo. */
  referencia: string;
  /** Frase corta, la que se lee de un vistazo. */
  motivo: string;
  /** Lo que respalda la frase: Índice CRECE, comparables, confianza, audiencia. */
  respaldo: string | null;
}

export type FichaDestacada = (FilaInmueble | FilaRemate) & {
  _kind: FuenteDestacado;
  _destacado: SelloDestacado;
};

export interface GrupoDestacados {
  clave: string;
  /** `null` en los bloques de un solo grupo; el nombre de la ciudad en el agrupado. */
  etiqueta: string | null;
  detalle: string | null;
  fichas: FichaDestacada[];
  /**
   * Cuántas de `fichas` se pintan antes de que el usuario pida ver el resto.
   *
   * Lo decide el servidor y no el navegador porque es una decisión de producto —
   * cuánto enseña la portada de entrada— y tiene que poder cambiarse sin tocar el
   * cliente. Si vale lo mismo que `fichas.length`, no hay nada que expandir y la
   * interfaz no debe ofrecer el botón.
   */
  preview: number;
}

export interface BloqueDestacados {
  /**
   * Un bloque por FUENTE, que es como el cliente describió el producto:
   * «el top de las oportunidades más económicas en activos de banco, este es el
   * top de lo que hemos visto en finca raíz, y este el de remates».
   *
   * Los identificadores anteriores —semana, mes, ciudades, fuentes— cortaban el
   * mismo inventario por criterios temporales y geográficos. Se conservan en el
   * tipo porque `bloqueSemana`, `bloqueMes` y `bloqueCiudades` siguen existiendo
   * con sus pruebas: son cortes válidos que pueden volver a la portada el día que
   * haya histórico suficiente para que signifiquen algo.
   */
  id: 'portal' | 'bancos' | 'remates' | 'semana' | 'mes' | 'ciudades' | 'fuentes';
  titulo: string;
  /** La regla, escrita para que se pueda discutir. Va SIEMPRE visible en pantalla. */
  criterio: string;
  icono: string;
  grupos: GrupoDestacados[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-07" → "julio". Sin `Intl`: el nombre del mes no puede depender del ICU del contenedor. */
export function nombreMes(periodo: string): string {
  const mes = Number(periodo.slice(5, 7));
  return MESES[mes - 1] ?? periodo;
}

/** "2026-08-04" → "4 ago". Se parte la cadena en vez de construir un Date: la fecha
 *  de audiencia no tiene hora, y pasarla por `new Date()` la corre un día en Bogotá. */
export function fechaCorta(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  return `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1] ?? m[2]}`;
}

/**
 * Comienzo del mes en curso EN HORA DE COLOMBIA, como instante UTC.
 *
 * Mismo criterio que `periodoDe` en `server/cupo.ts`: si el cupo del usuario se
 * reinicia el 1 a medianoche de Bogotá, el bloque "del mes" no puede estar
 * midiendo otro mes distinto cinco horas antes.
 */
export function inicioDeMes(ahora: Date = new Date()): Date {
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60_000);
  return new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), 1, 5, 0, 0, 0));
}

/** Descuento de un remate: cuánto está la postura mínima por debajo del avalúo oficial. */
export function descuentoRemate(fila: FilaRemate): number | null {
  const avaluo = num(fila.appraisal_value);
  const postura = num(fila.minimum_bid);
  if (!avaluo || !postura || avaluo <= 0 || postura <= 0) return null;
  return Math.round((1 - postura / avaluo) * 1000) / 10;
}

/** Descuento de un inmueble de portal o banco, ya redondeado a una decimal. */
export function descuentoInmueble(fila: FilaInmueble): number | null {
  const d = num(fila.discount_pct);
  return d === null ? null : Math.round(d * 10) / 10;
}

const enBanda = (d: number | null): boolean =>
  d !== null && d >= DESCUENTO_MIN && d <= DESCUENTO_MAX;

/**
 * ¿Este inmueble puede ir a la portada?
 *
 * Tres condiciones, y ninguna se reinterpreta aquí: descuento dentro de la banda
 * creíble, categoría CRECE de oportunidad, y —cuando el motor dejó constancia de
 * la muestra— confianza que no sea baja.
 *
 * Ese último filtro es el que separa la portada del listado. Un activo bancario
 * con 7 comparables y confianza baja SÍ puede aparecer en la pestaña de Bancos
 * (quien llega ahí está buscando y sabe lo que mira), pero no puede ser lo primero
 * que el Radar le enseña a alguien que acaba de entrar: la portada afirma "esto es
 * una oportunidad" sin que nadie la haya pedido, y tiene que poder sostenerlo.
 * Las fichas del portal no guardan `features.market` —con 108.000 filas el motor
 * solo escribe columnas—, y su garantía equivalente es `is_high`, que el propio
 * motor solo concede con confianza alta.
 */
export function esInmuebleDestacable(fila: FilaInmueble): boolean {
  if (!fila?.id) return false;
  if (!enBanda(descuentoInmueble(fila))) return false;
  if (fila.crece_tier !== 'oportunidad_fuerte' && fila.crece_tier !== 'oportunidad') return false;
  const confianza = fila.features?.market?.confidence;
  return !(confianza === 'low' || confianza === 'insufficient');
}

/**
 * ¿Este remate puede ir a la portada?
 *
 * Se excluye la CUOTA-PARTE: un aviso donde el juzgado remata el 50% del bien
 * lleva alerta jurídica (engine/remates-legal.ts) y no puede ser lo primero que el
 * Radar recomienda. Que exista y se pueda buscar en la pestaña de Remates es otra
 * cosa; destacarlo sería empujar a alguien a pujar por media casa.
 *
 * La banda de descuento aquí filtra sobre todo BASURA: la base legal de la subasta
 * es el 70% del avalúo, así que un remate sano da 30% clavado. Lo que queda fuera
 * son las filas con avalúo o postura mal leídos, que dan 0% o 99%.
 */
export function esRemateDestacable(fila: FilaRemate): boolean {
  if (!fila?.id) return false;
  if (TIPOS_NO_INMOBILIARIOS.has(String(fila.property_type ?? ''))) return false;
  const cuota = num(fila.cuota_parte);
  if (cuota !== null && cuota !== 100) return false;
  if (!fila.auction_date) return false;
  return enBanda(descuentoRemate(fila));
}

/**
 * Lo que el juzgado remata pero el Radar no destaca.
 *
 * En la lista de la Rama Judicial entran carros y "derechos" sobre un bien junto a
 * los inmuebles. Buscarlos en la pestaña de Remates tiene sentido; abrir un radar
 * de oportunidades INMOBILIARIAS con un remate de vehículo de seis millones dice
 * que el producto no sabe qué vende.
 */
const TIPOS_NO_INMOBILIARIOS = new Set(['vehicle', 'rights']);

/** Contra qué mercado se comparó, según hasta dónde tuvo que abrirse la cascada. */
function referenciaDeNivel(nivel: string | null | undefined): string {
  // «sector» y no «barrio»: la comparación cubre 1,5 km a la redonda, que en una
  // ciudad colombiana son cinco o seis barrios. Decir «su barrio» promete una
  // precisión que el dato no tiene, y el cliente lo señaló: «¿me está comparando
  // únicamente con mi barrio? No, 1,5 kilómetros. Hay 5 barrios, facilito».
  // Todas empiezan por sustantivo sin artículo porque se insertan tras «por debajo
  // de»: con artículo saldría «por debajo de el valor…».
  if (nivel === 'barrio') return 'los precios de su propio sector';
  if (nivel === 'zona_ampliada') return 'los precios de su zona';
  return 'los precios de su ciudad';
}

/** Etiqueta del Índice CRECE ya resuelta por la tabla maestra (engine/crece.ts). */
function etiquetaCrece(fila: FilaInmueble): string | null {
  const indice = num(fila.crece_index);
  if (indice === null) return null;
  const c = clasificar(indice);
  // La coma decimal es la de Colombia; el índice se lee "0,40 = 60% por debajo".
  return `${c.lectura} · índice CRECE ${redondearIndice(indice).toFixed(2).replace('.', ',')}`;
}

/**
 * Cuánta confianza merece la comparación.
 *
 * Los bancos guardan la trazabilidad completa en `features.market` (cuántos
 * comparables y con qué confianza). El portal no: con 108.000 filas el motor solo
 * escribe columnas, así que su garantía es `is_high` —que el propio motor solo
 * concede con confianza alta— y el nivel de la cascada. Se dice lo que hay de
 * cada uno, sin inventarle al portal un número de comparables que no existe.
 */
function etiquetaConfianza(fila: FilaInmueble): string | null {
  const market = fila.features?.market as Record<string, any> | undefined;
  const n = num(market?.n_comparables);
  const conf = typeof market?.confidence === 'string' ? market.confidence : null;
  const legible: Record<string, string> = { high: 'confianza alta', medium: 'confianza media', low: 'confianza baja' };
  if (n !== null && conf && legible[conf]) return `${n} comparables, ${legible[conf]}`;
  if (n !== null) return `${n} comparables`;
  if (fila.is_high === true) return 'confianza alta del motor';
  if (fila.cascada_nivel === 'barrio') return 'comparables del propio barrio';
  return null;
}

const fuenteDeInmueble = (fila: FilaInmueble): 'portal' | 'banco' =>
  fila.source === 'fincaraiz' ? 'portal' : 'banco';

/** Convierte un inmueble en ficha de portada, con su explicación ya escrita. */
export function sellarInmueble(fila: FilaInmueble): FichaDestacada {
  const descuento = descuentoInmueble(fila);
  const referencia = referenciaDeNivel(fila.cascada_nivel);
  const respaldo = [etiquetaCrece(fila), etiquetaConfianza(fila)].filter(Boolean).join(' · ') || null;
  return {
    ...fila,
    _kind: fuenteDeInmueble(fila),
    _destacado: {
      fuente: fuenteDeInmueble(fila),
      descuento,
      referencia,
      motivo: descuento === null
        ? `Por debajo de ${referencia}`
        : `${Math.round(descuento)}% por debajo de ${referencia}`,
      respaldo,
    },
  };
}

/**
 * Convierte un remate en ficha de portada. Su métrica NO es la del portal.
 *
 * El porcentaje se calcula de la postura y el avalúo que se muestran en la propia
 * tarjeta, no de la columna `minimum_bid_pct`: esa columna viene nula en más de la
 * mitad de los avisos y, cuando trae número, no siempre es la relación entre las
 * dos cifras. Un dato que el usuario no puede recomprobar mirando la ficha no
 * puede ser el que justifique destacarla.
 */
export function sellarRemate(fila: FilaRemate): FichaDestacada {
  const descuento = descuentoRemate(fila);
  const avaluo = num(fila.appraisal_value);
  const postura = num(fila.minimum_bid);
  const base = avaluo && postura ? Math.round((postura / avaluo) * 100) : null;
  const fecha = fechaCorta(fila.auction_date);
  const origen = fila.origen_demandante === 'bancario'
    ? 'demandante bancario, título más limpio'
    : 'demandante particular, verificar título';
  const respaldo = [
    base !== null ? `postura mínima = ${base}% del avalúo` : null,
    num(fila.cuota_parte) === 100 ? 'dominio pleno' : null,
    fecha ? `audiencia ${fecha}` : null,
    origen,
  ].filter(Boolean).join(' · ');
  return {
    ...fila,
    _kind: 'remate',
    _destacado: {
      fuente: 'remate',
      descuento,
      referencia: 'el avalúo oficial del juzgado',
      motivo: descuento === null
        ? 'Por debajo del avalúo oficial del juzgado'
        : `${Math.round(descuento)}% por debajo del avalúo oficial del juzgado`,
      respaldo: respaldo || null,
    },
  };
}

/** Mayor descuento primero; el índice CRECE desempata para que el orden sea estable. */
const porDescuento = (a: FichaDestacada, b: FichaDestacada): number =>
  (b._destacado.descuento ?? 0) - (a._destacado.descuento ?? 0)
  // Entre fichas con el MISMO descuento manda la calidad de la comparación, no el
  // identificador. En la portada hay decenas empatadas —el inventario real tiene
  // muchísimas en el mismo 54%— y desempatar por `id` es desempatar al azar: la
  // primera del ranking salía por su UUID, no por ser mejor recomendación. Con
  // esto, entre dos iguales sube la que el motor respalda con confianza alta y
  // más comparables, que es la que alguien puede defender delante de un cliente.
  || Number(b.is_high === true) - Number(a.is_high === true)
  || (num((b as FilaInmueble).features?.market?.n_comparables) ?? 0)
     - (num((a as FilaInmueble).features?.market?.n_comparables) ?? 0)
  || String(a.id).localeCompare(String(b.id));

/** Menor índice CRECE primero: es "lo más barato frente a su zona", no "lo más rebajado". */
const porIndice = (a: FichaDestacada, b: FichaDestacada): number =>
  (num((a as FilaInmueble).crece_index) ?? 9) - (num((b as FilaInmueble).crece_index) ?? 9)
  || String(a.id).localeCompare(String(b.id));

/**
 * Orden de los remates. NO es por descuento, y esa es la parte interesante.
 *
 * La base legal de una subasta en Colombia es el 70% del avalúo, así que
 * prácticamente todos los avisos sanos dan el mismo 30% y ordenarlos por descuento
 * sería ordenar por ruido. Lo que de verdad los separa es el RIESGO JURÍDICO: con
 * demandante bancario el proceso es hipotecario estándar y el título suele venir
 * limpio (engine/remates-legal.ts). Entre iguales manda la audiencia más próxima,
 * que es lo único accionable: un remate a seis meses no sirve para decidir hoy.
 */
const porRemate = (a: FichaDestacada, b: FichaDestacada): number =>
  Number(b.origen_demandante === 'bancario') - Number(a.origen_demandante === 'bancario')
  || String(a.auction_date ?? '9999').localeCompare(String(b.auction_date ?? '9999'))
  || String(a.id).localeCompare(String(b.id));

const grupoUnico = (fichas: FichaDestacada[], preview: number): GrupoDestacados[] =>
  [{ clave: 'todas', etiqueta: null, detalle: null, fichas, preview: Math.min(preview, fichas.length) }];

/**
 * Bloque "Destacados de la semana".
 *
 * El corte no es un ranking congelado: se toma la ventana de las mejores y se
 * ROTA con `engine/rotacion.ts`. Rotar, no barajar — barajar cambiaría el orden
 * en cada petición y quien entra dos veces el mismo martes vería dos portadas
 * distintas sin que hubiera cambiado ningún dato. La rotación es determinista por
 * semana ISO: estable de lunes a domingo, desplazada la semana siguiente. Así
 * quien vuelve encuentra caras nuevas y quien comparte un enlace no queda como un
 * mentiroso.
 */
export function bloqueSemana(
  pool: FichaDestacada[],
  semana: number = semanaISO(),
  tamanos = TAMANOS,
): BloqueDestacados {
  const ventana = [...pool].sort(porDescuento).slice(0, tamanos.poolSemana);
  const rotada = rotarSemanal(ventana, semana);
  // Muestra REPARTIDA por la ventana en vez de un tramo contiguo. Con los datos
  // reales el descuento se repite mucho —hay decenas de fichas clavadas en el
  // mismo 55%—, así que tomar posiciones seguidas da tarjetas con el mismo número
  // y la portada parece rota aunque el dato sea correcto. Tomando una de cada n se
  // recorre todo el tramo alto y se ve el rango real.
  //
  // El reparto se calcula contra el bloque COMPLETO, no contra lo que se pinta de
  // entrada: si se repartiera sobre las diez primeras, al expandir aparecerían las
  // treinta restantes ya sin repartir y el bloque cambiaría de criterio a mitad.
  const paso = Math.max(1, Math.floor(rotada.length / tamanos.semana));
  const elegidas: FichaDestacada[] = [];
  for (let i = 0; elegidas.length < tamanos.semana && i < rotada.length; i += paso) elegidas.push(rotada[i]);
  return {
    id: 'semana',
    titulo: 'Destacados de la semana',
    criterio: `Las ${tamanos.poolSemana} de mayor descuento frente al mercado de su propia zona, entre `
      + 'las fichas que el motor clasificó como oportunidad con comparables suficientes. De ahí se toma '
      + `una muestra repartida por todo el tramo, y el punto de arranque se desplaza cada semana ISO `
      + `(vas por la ${semana}): dentro de la semana no se mueve, así que un enlace compartido sigue `
      + 'enseñando lo mismo.',
    icono: 'spark',
    grupos: grupoUnico(elegidas.sort(porDescuento), tamanos.preview),
  };
}

/**
 * Bloque "Destacados del mes".
 *
 * Aquí no manda el descuento sino el Índice CRECE: es la métrica del sistema
 * (precio/m² ÷ mediana de su grupo comparable) y ordenar por ella pone arriba lo
 * más barato frente a su zona, que no siempre es lo que tiene el número de rebaja
 * más grande. Solo entran fichas que el Radar vio por primera vez este mes, para
 * que el bloque hable de novedad y no repita el ranking histórico.
 */
export function bloqueMes(
  pool: FichaDestacada[],
  periodo: string,
  tamanos = TAMANOS,
): BloqueDestacados {
  return {
    id: 'mes',
    titulo: `Destacados de ${nombreMes(periodo)}`,
    criterio: 'Fichas que entraron al Radar durante el mes en curso, ordenadas por Índice CRECE: '
      + 'las que tienen el precio por m² más bajo frente a la mediana de su propia zona.',
    icono: 'calendar',
    grupos: grupoUnico([...pool].sort(porIndice).slice(0, tamanos.mes), tamanos.preview),
  };
}

/**
 * Bloque "Por ciudad".
 *
 * Las ciudades se ordenan por CUÁNTO INVENTARIO MARCADO tienen, no por tamaño de
 * población: el Radar solo puede recomendar donde de verdad ha encontrado algo, y
 * una ciudad con dos fichas no merece una fila propia por más grande que sea.
 */
export function bloqueCiudades(
  pool: FichaDestacada[],
  tamanos = TAMANOS,
): BloqueDestacados {
  const porCiudad = new Map<string, FichaDestacada[]>();
  for (const ficha of pool) {
    const ciudad = String(ficha.city ?? '').trim();
    if (!ciudad) continue;
    const lista = porCiudad.get(ciudad) ?? [];
    lista.push(ficha);
    porCiudad.set(ciudad, lista);
  }
  const grupos = [...porCiudad.entries()]
    // Solo compiten las ciudades que llenan la fila VISIBLE: una tarjeta suelta bajo
    // un título de ciudad se lee como un hueco, no como una recomendación. El corte
    // se mide contra lo que se pinta de entrada y no contra el máximo por ciudad, o
    // exigiríamos doce fichas para enseñar tres y se caerían ciudades que sí tienen
    // una fila digna.
    .filter(([, fichas]) => fichas.length >= tamanos.previewCiudad)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, tamanos.ciudades)
    .map(([ciudad, fichas]) => {
      const elegidas = [...fichas].sort(porDescuento).slice(0, tamanos.porCiudad);
      return {
        clave: ciudad,
        etiqueta: ciudad,
        // El detalle cuenta TODO lo marcado en la ciudad, que casi siempre es más
        // que lo que cabe en el bloque. Es el número honesto: decir "12
        // oportunidades" cuando hay 83 en Envigado vendería el Radar por debajo.
        detalle: `${fichas.length} oportunidades marcadas`,
        fichas: elegidas,
        preview: Math.min(tamanos.previewCiudad, elegidas.length),
      };
    });
  return {
    id: 'ciudades',
    titulo: 'Las mejores por ciudad',
    criterio: 'Las ciudades donde el Radar tiene más inventario marcado hoy; de cada una, '
      + 'las de mayor descuento frente al mercado de su propia zona.',
    icono: 'map',
    grupos,
  };
}

/**
 * Bloque "Las tres fuentes, cruzadas".
 *
 * Es el bloque que justifica el producto: la misma pregunta —cuánto margen de
 * entrada hay— hecha a un portal abierto, a la cartera de los bancos y a los
 * remates judiciales. Se intercalan a propósito (portal, banco, remate, portal…)
 * en vez de ordenarlas todas por descuento: si se ordenara, los remates coparían
 * la fila entera por ser subastas y el cruce dejaría de verse.
 *
 * Las métricas NO son la misma y por eso cada ficha declara la suya: portal y
 * bancos se miden contra el mercado de oferta de su zona, los remates contra el
 * avalúo oficial. Mezclarlas sin etiquetar sería comparar peras con manzanas.
 */
export function bloqueFuentes(
  portal: FichaDestacada[],
  bancos: FichaDestacada[],
  remates: FichaDestacada[],
  tamanos = TAMANOS,
): BloqueDestacados {
  const top = (lista: FichaDestacada[], orden = porDescuento) =>
    [...lista].sort(orden).slice(0, tamanos.porFuente);
  const columnas = [top(portal), top(bancos), top(remates, porRemate)];
  const fichas: FichaDestacada[] = [];
  for (let i = 0; i < tamanos.porFuente; i += 1) {
    for (const columna of columnas) if (columna[i]) fichas.push(columna[i]);
  }
  return {
    id: 'fuentes',
    titulo: 'Las tres fuentes, cruzadas',
    criterio: 'La misma pregunta hecha a las tres fuentes del Radar. Portal abierto y cartera de '
      + 'bancos se miden contra el mercado de oferta de su propia zona y se ordenan por descuento. '
      + 'Los remates se miden contra el avalúo oficial, y ahí el descuento no discrimina: la base '
      + 'legal de toda subasta es el 70% del avalúo, así que se ordenan por riesgo jurídico '
      + '—primero los de demandante bancario— y por audiencia más próxima.',
    icono: 'chart',
    grupos: grupoUnico(fichas, tamanos.preview),
  };
}

/**
 * El top de la semana de UNA fuente.
 *
 * Es la forma de la portada que pidió el cliente, y la razón es de negocio: las
 * tres fuentes no son tres versiones de lo mismo. Un activo bancario es una
 * dación en pago que el banco quiere sacar de balance; un remate es una subasta
 * ante un juez con una fecha de audiencia y un riesgo jurídico propio; un aviso
 * de portal es mercancía en el mercado abierto. Quien entra buscando remates no
 * quiere que se los mezclen con los otros dos, y al revés.
 *
 * Cada bloque ordena por lo que de verdad discrimina dentro de SU fuente:
 *
 *  · Portal y bancos, por descuento contra el mercado de su propia zona.
 *  · Remates, por RIESGO JURÍDICO. La base legal de toda subasta en Colombia es
 *    el 70% del avalúo, así que casi todos los avisos sanos dan el mismo 30% y
 *    ordenarlos por descuento sería ordenar por ruido. Lo que los separa es si el
 *    demandante es un banco —proceso hipotecario estándar, título más limpio— y
 *    cuán próxima está la audiencia, que es lo único accionable.
 *
 * El punto de entrada rota cada semana ISO: estable de lunes a domingo, así que
 * quien comparte un enlace no queda como un mentiroso, y desplazado la semana
 * siguiente para que quien vuelve encuentre caras nuevas.
 */
export function bloqueDeFuente(
  fuente: FuenteDestacado,
  pool: FichaDestacada[],
  semana: number = semanaISO(),
  tamanos = TAMANOS,
): BloqueDestacados {
  const esRemate = fuente === 'remate';
  const orden = esRemate ? porRemate : porDescuento;
  const ventana = [...pool].sort(orden).slice(0, tamanos.poolSemana);
  const elegidas = rotarSemanal(ventana, semana).slice(0, tamanos.porFuenteTop).sort(orden);

  const META: Record<FuenteDestacado, { id: BloqueDestacados['id']; titulo: string; icono: string; criterio: string }> = {
    portal: {
      id: 'portal',
      titulo: 'Lo mejor de la semana en el portal abierto',
      icono: 'home',
      criterio: 'Avisos de FincaRaíz con el mayor descuento frente a la mediana de ofertas parecidas '
        + 'en su propio barrio, entre los que el motor clasificó como oportunidad con comparables '
        + 'suficientes. Es mercancía en el mercado abierto: se puede llamar y visitar hoy.',
    },
    banco: {
      id: 'bancos',
      titulo: 'Lo mejor de la semana en cartera de bancos',
      icono: 'bank',
      criterio: 'Inmuebles que los bancos recibieron en dación en pago y quieren sacar de balance, '
        + 'ordenados por descuento contra el mercado de su zona. En Colombia el descuento es más '
        + 'moderado que en otros mercados, así que aquí manda la diferencia relativa, no la rebaja bruta.',
    },
    remate: {
      id: 'remates',
      titulo: 'Lo mejor de la semana en remates judiciales',
      icono: 'scale',
      criterio: 'Subastas ante un juez con audiencia futura. NO se ordenan por descuento: la base legal '
        + 'de todo remate es el 70% del avalúo, así que casi todos dan el mismo 30% y ordenar por ahí '
        + 'sería ordenar por ruido. Se ordenan por riesgo jurídico —primero los de demandante bancario, '
        + 'donde el título suele venir más limpio— y luego por audiencia más próxima.',
    },
  };
  const meta = META[fuente];
  return { ...meta, grupos: grupoUnico(elegidas, tamanos.preview) };
}

export interface PoolsDestacados {
  /** Inmuebles del portal abierto con veredicto de oportunidad. */
  portal: FilaInmueble[];
  /** Inmuebles de banco con veredicto de oportunidad. */
  bancos: FilaInmueble[];
  /** Remates con audiencia futura, avalúo y postura. */
  remates: FilaRemate[];
}

export interface OpcionesDestacados {
  ahora?: Date;
  semana?: number;
  tamanos?: typeof TAMANOS;
}

export interface Destacados {
  semana: number;
  periodo: string;
  bloques: BloqueDestacados[];
  /** Todas las fichas seleccionadas, incluidas las que empiezan plegadas. */
  total: number;
  /** Las que se pintan antes de que nadie pulse nada. */
  visibles: number;
}

/** Cuántas fichas de un bloque se pintan de entrada. */
export const visiblesDe = (bloque: BloqueDestacados): number =>
  bloque.grupos.reduce((suma, grupo) => suma + grupo.preview, 0);

/** Todas las fichas de un bloque, en orden de pintado. */
export const fichasDe = (bloque: BloqueDestacados): FichaDestacada[] =>
  bloque.grupos.flatMap((g) => g.fichas);

/**
 * Huella de una propiedad, para no enseñar dos veces el mismo inmueble.
 *
 * El identificador NO basta: la base trae el mismo activo cargado dos veces con
 * ids distintos (visto en producción: un local de 404,69 m² en Bogotá publicado
 * por partida doble). En un listado paginado eso pasa desapercibido; en una
 * portada de treinta tarjetas, dos gemelas seguidas parecen un error del producto.
 *
 * La huella deliberadamente NO incluye la fuente: si dos bancos publican el mismo
 * inmueble al mismo precio y con la misma área, es el mismo inmueble.
 */
export function huellaDeFicha(ficha: FichaDestacada): string {
  if (ficha._kind === 'remate') {
    return ['remate', ficha.city, ficha.property_type, ficha.minimum_bid, ficha.appraisal_value].join('|');
  }
  return ['inmueble', ficha.city, ficha.type, ficha.price, ficha.area_m2].join('|');
}

/**
 * Arma la portada completa.
 *
 * El orden de construcción importa: cada bloque descuenta lo que ya usaron los
 * anteriores, así que ninguna ficha se repite. El coste es que el último bloque
 * trabaja con lo que queda — por eso los pools se piden holgados y no del tamaño
 * exacto de lo que se va a pintar.
 */
export function armarDestacados(pools: PoolsDestacados, opciones: OpcionesDestacados = {}): Destacados {
  const ahora = opciones.ahora ?? new Date();
  const tamanos = opciones.tamanos ?? TAMANOS;
  const semana = opciones.semana ?? semanaISO(ahora);
  const desdeMes = inicioDeMes(ahora).getTime();
  const periodo = periodoDe(ahora);

  const portal = (pools.portal ?? []).filter(esInmuebleDestacable).map(sellarInmueble);
  const bancos = (pools.bancos ?? []).filter(esInmuebleDestacable).map(sellarInmueble);
  const remates = (pools.remates ?? []).filter(esRemateDestacable).map(sellarRemate);
  const inmuebles = [...portal, ...bancos];

  // Se descuenta por HUELLA, no por id: así se van a la vez lo ya usado en un
  // bloque anterior y los duplicados que la propia base trae con ids distintos.
  const usados = new Set<string>();
  /** Filtro con memoria propia, para que varias listas de un mismo bloque no se repitan entre sí. */
  const filtroLibre = () => {
    const vistas = new Set(usados);
    return (lista: FichaDestacada[]) => lista.filter((f) => {
      const huella = huellaDeFicha(f);
      if (vistas.has(huella)) return false;
      vistas.add(huella);
      return true;
    });
  };
  const libres = (lista: FichaDestacada[]) => filtroLibre()(lista);
  const marcar = (bloque: BloqueDestacados) => {
    for (const ficha of fichasDe(bloque)) usados.add(huellaDeFicha(ficha));
    return bloque;
  };

  const delMes = (ficha: FichaDestacada): boolean => {
    const visto = Date.parse(String((ficha as FilaInmueble).first_seen_at ?? ''));
    return Number.isFinite(visto) && visto >= desdeMes;
  };

  // Secuencial y no en un literal: cada bloque tiene que ver lo que marcó el
  // anterior, y `filtroLibre()` copia el conjunto en el momento en que se crea.
  // TRES BLOQUES, UNO POR FUENTE. Es como el cliente describió el producto y como
  // la gente busca: quien viene por remates no quiere que se los mezclen con
  // avisos de portal, y al revés.
  //
  // Los cortes anteriores —semana, mes, ciudades, cruce de fuentes— cortaban el
  // mismo inventario por criterios temporales y geográficos. Sus funciones siguen
  // aquí con sus pruebas: son cortes válidos que pueden volver cuando haya
  // histórico suficiente para que signifiquen algo.
  //
  // Aquí NO hace falta descontar lo que usó el bloque anterior —cada fuente tiene
  // su propio pool y una ficha no puede estar en dos—, pero sí se pasa por
  // `libres` para que la deduplicación por huella siga quitando el mismo activo
  // cargado dos veces con ids distintos, que la base sí tiene.
  const construidos: BloqueDestacados[] = [];
  construidos.push(marcar(bloqueDeFuente('portal', libres(portal), semana, tamanos)));
  construidos.push(marcar(bloqueDeFuente('banco', libres(bancos), semana, tamanos)));
  construidos.push(marcar(bloqueDeFuente('remate', libres(remates), semana, tamanos)));

  // Un bloque sin fichas no se anuncia: prometer "destacados del mes" y no enseñar
  // ninguno es peor que no tener la fila.
  const bloques = construidos.filter((bloque) => fichasDe(bloque).length > 0);

  return {
    semana,
    periodo,
    bloques,
    total: bloques.reduce((suma, bloque) => suma + fichasDe(bloque).length, 0),
    visibles: bloques.reduce((suma, bloque) => suma + visiblesDe(bloque), 0),
  };
}

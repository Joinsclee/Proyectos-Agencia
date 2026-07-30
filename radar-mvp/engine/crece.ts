/**
 * Índice CRECE — fuente ÚNICA de verdad para clasificar cualquier inmueble.
 *
 * Definido en la HU "Núcleo del Motor de Comparables" (Radar CRECE, Fase 1).
 * Ningún otro módulo (FincaRaíz, Bancos, AVAL, Remates) puede redefinir estos
 * umbrales ni usar una tabla simplificada: si la clasificación cambia, cambia aquí
 * y en ningún otro lado.
 *
 *   Índice CRECE = precio/m² del inmueble ÷ mediana(precio/m² del grupo comparable)
 *
 * El grupo comparable se arma con la MISMA zona y el MISMO tipo, y su mediana se
 * calcula SOLO con avisos de FincaRaíz. Bancos y remates son ventas forzadas: se
 * miden contra el mercado, no lo definen (si entraran a la mediana, en zonas con
 * poca oferta un puñado de activos bancarios la arrastraría hacia abajo y todo
 * parecería caro).
 *
 * Lectura del índice: 0,70 = está un 30% por debajo de la mediana de su zona.
 * 1,15 = está un 15% por encima.
 */

/** Categorías de la tabla maestra, de mayor oportunidad a mayor sobreprecio. */
export type CreceTier =
  | 'oportunidad_fuerte'
  | 'oportunidad'
  | 'interesante'
  | 'abajo_mercado'
  | 'mercado_borde_bajo'
  | 'mercado'
  | 'limite_superior'
  | 'arriba_mercado'
  | 'sobreprecio'
  | 'sobrevalorado'
  | 'fuera_mercado';

export interface CreceClass {
  tier: CreceTier;
  /** Estrellas doradas (0-3). Solo las categorías de oportunidad tienen. */
  estrellas: number;
  /** Puntos rojos (0-4). Solo las categorías por encima del mercado tienen. */
  alertas: number;
  /** Texto corto que se muestra al usuario (tooltip de la ficha). */
  lectura: string;
  /** Desviación legible vs. la mediana, ej. "27% por debajo". */
  desviacion: string;
  /**
   * ¿Es contenido de pago? Decisión de negocio de la Sección 6 de la spec:
   * Oportunidad y Oportunidad Fuerte son de suscripción; el resto es gratis y sin
   * límite de cantidad. OJO: los remates NO usan esta regla — tienen su propia
   * matriz (origen del demandante × descuento), porque por ser subastas casi todos
   * darían "oportunidad" y la clasificación por estrellas no discriminaría nada.
   */
  requiereSuscripcion: boolean;
}

/**
 * DECISIÓN DE NEGOCIO (confirmada por el cliente el 2026-07-20).
 *
 * La tabla del documento tenía un hueco: la fila "≥25% por debajo" declaraba
 * índice ≤ 0,70, pero "≥25% por debajo" es matemáticamente ≤ 0,75, así que nada
 * clasificaba entre 0,71 y 0,75. Todas las demás filas de la tabla sí cuadran con
 * su propio descriptor, así que se corrigió ésta: Oportunidad Fuerte = ≤ 0,75.
 * Cambiar este número es lo único que hace falta si el negocio se retracta.
 */
export const CORTE_OPORTUNIDAD_FUERTE = 0.75;

/**
 * Tabla maestra. `hasta` es el límite SUPERIOR inclusivo del tramo, ya redondeado
 * a 2 decimales — los tramos del documento vienen en centésimas (0,76–0,80), así
 * que se compara sobre el índice redondeado para que 0,804 caiga en "Oportunidad"
 * y no se escape por un decimal invisible.
 */
const TABLA: Array<{ hasta: number; c: Omit<CreceClass, 'desviacion'> }> = [
  { hasta: CORTE_OPORTUNIDAD_FUERTE,
    c: { tier: 'oportunidad_fuerte', estrellas: 3, alertas: 0, lectura: 'Oportunidad Fuerte', requiereSuscripcion: true } },
  { hasta: 0.80,
    c: { tier: 'oportunidad', estrellas: 2, alertas: 0, lectura: 'Oportunidad', requiereSuscripcion: true } },
  { hasta: 0.90,
    c: { tier: 'interesante', estrellas: 1, alertas: 0, lectura: 'Interesante', requiereSuscripcion: false } },
  { hasta: 0.93,
    c: { tier: 'abajo_mercado', estrellas: 1, alertas: 0, lectura: 'Abajo del Mercado', requiereSuscripcion: false } },
  { hasta: 0.96,
    c: { tier: 'mercado_borde_bajo', estrellas: 0, alertas: 0, lectura: 'Ligeramente por debajo del mercado', requiereSuscripcion: false } },
  { hasta: 1.03,
    c: { tier: 'mercado', estrellas: 0, alertas: 0, lectura: 'Precio de Mercado', requiereSuscripcion: false } },
  { hasta: 1.06,
    c: { tier: 'limite_superior', estrellas: 0, alertas: 0, lectura: 'Límite Superior', requiereSuscripcion: false } },
  { hasta: 1.09,
    c: { tier: 'arriba_mercado', estrellas: 0, alertas: 1, lectura: 'Arriba del Mercado', requiereSuscripcion: false } },
  { hasta: 1.19,
    c: { tier: 'sobreprecio', estrellas: 0, alertas: 2, lectura: 'Sobreprecio', requiereSuscripcion: false } },
  { hasta: 1.29,
    c: { tier: 'sobrevalorado', estrellas: 0, alertas: 3, lectura: 'Sobrevalorado', requiereSuscripcion: false } },
  { hasta: Infinity,
    c: { tier: 'fuera_mercado', estrellas: 0, alertas: 4, lectura: 'Fuera de Mercado', requiereSuscripcion: false } },
];

/** Redondeo a 2 decimales, que es la resolución en la que está escrita la tabla. */
export const redondearIndice = (x: number): number => Math.round(x * 100) / 100;

/** Índice CRECE de un inmueble. Devuelve null si no hay con qué compararlo. */
export function creceIndex(ppm2: number | null | undefined, medianaPpm2: number | null | undefined): number | null {
  if (!ppm2 || !medianaPpm2 || ppm2 <= 0 || medianaPpm2 <= 0) return null;
  return redondearIndice(ppm2 / medianaPpm2);
}

/** Desviación legible respecto a la mediana ("27% por debajo" / "12% por encima"). */
export function desviacionTexto(indice: number): string {
  const pct = Math.round(Math.abs(1 - indice) * 100);
  if (pct === 0) return 'en la mediana';
  return `${pct}% ${indice < 1 ? 'por debajo' : 'por encima'}`;
}

/**
 * Categoría a partir del nombre guardado en `crece_tier`, para las filas que ya
 * traen la clasificación resuelta de la base y no el índice.
 *
 * Sale de la MISMA tabla maestra que `clasificar()`: la alternativa era copiar
 * los textos ("Oportunidad Fuerte", "Sobreprecio"…) donde hicieran falta, y ahí
 * es donde empiezan a divergir de la tabla sin que nadie lo note. Devuelve `null`
 * si el tier no existe (una fila vieja con un nombre que ya se retiró).
 */
export function clasePorTier(tier: string | null | undefined): Omit<CreceClass, 'desviacion'> | null {
  if (!tier) return null;
  return TABLA.find((f) => f.c.tier === tier)?.c ?? null;
}

/** Clasifica un índice contra la tabla maestra. */
export function clasificar(indice: number): CreceClass {
  const i = redondearIndice(indice);
  const fila = TABLA.find((f) => i <= f.hasta) ?? TABLA[TABLA.length - 1];
  return { ...fila.c, desviacion: desviacionTexto(i) };
}

/**
 * Descuento en % vs. la mediana, que es como el usuario lo lee ("30% bajo mercado").
 * Es la otra cara del índice: descuento = (1 − índice) × 100.
 */
export const descuentoPct = (indice: number): number => Math.round((1 - indice) * 1000) / 10;

/** ¿La categoría es una de las tres de oportunidad? (⭐ o más) */
export const esOportunidad = (t: CreceTier): boolean =>
  t === 'oportunidad_fuerte' || t === 'oportunidad' || t === 'interesante';

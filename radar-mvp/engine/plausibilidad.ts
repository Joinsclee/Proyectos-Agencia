/**
 * Inmuebles cuyos datos no pueden ser ciertos.
 *
 * El cliente abrió una ficha que decía «416% sobre el valor del mercado» y
 * preguntó por qué. La respuesta, medida: hay avisos con el área mal publicada —un
 * lote de 90 m² a $1.800 millones, una «finca» de 70 m²— y cuando el área está
 * mal, el precio por metro se dispara y el veredicto sale disparatado.
 *
 * No es un fallo del motor: es basura entrando. Y hace dos daños distintos:
 *
 *  1. El inmueble recibe un veredicto absurdo, que es lo que se ve en pantalla.
 *  2. Si entra como COMPARABLE, corrompe la mediana de toda su zona, y entonces el
 *     daño ya no es una ficha sino todas las de alrededor.
 *
 * Son el 1,2% del inventario. Poco, y suficiente para que nadie se crea las
 * cifras: basta con toparse una.
 *
 * NO SE BORRAN. Existen, están publicados y alguien puede querer verlos. Lo que se
 * hace es no emitir veredicto sobre ellos —una ficha sin porcentaje es honesta; una
 * con «+416%» no— y no usarlos para juzgar a los demás.
 *
 * LOS UMBRALES SALEN DE MEDIR, no de la intuición. Muestra de 1.000 inmuebles
 * activos por tipo, percentiles reales:
 *
 *   tipo         área p1   área p50   ppm² p50      ppm² p99      ppm² máx
 *   apartamento     28        66      4.310.345     6.153.846     9.875.000
 *   casa            60       238      3.458.333     8.628.319    11.274.639
 *   lote            60      1526        550.000    13.333.333    44.270.833
 *   finca           50       620      2.350.000    35.000.000    50.000.000
 *   local            7        82      6.382.979    31.818.182    44.444.444
 *   parqueadero     11       395      2.900.000    42.000.000    42.000.000
 *
 * Ningún inmueble creíble de los dos tipos más frecuentes —apartamento y casa,
 * donde el área se publica bien— pasa de $11,3 millones el metro. Todo lo que
 * está por encima de $25 millones aparece en tipos donde el área viene mal.
 */

/** El metro cuadrado más caro que puede ser verdad en Colombia hoy. */
export const PPM2_MAXIMO_CREIBLE = 25_000_000;

/**
 * El metro cuadrado más barato que puede ser verdad.
 *
 * Muy bajo a propósito: un lote rural grande a $25.100/m² es perfectamente real
 * —así aparece en el percentil 1 de los lotes— y una finca de diez hectáreas baja
 * todavía más. Aquí solo se descarta el cero y los negativos, que son error de
 * captura seguro.
 */
export const PPM2_MINIMO_CREIBLE = 1_000;

/**
 * Área mínima por tipo, en metros cuadrados.
 *
 * Solo se declara donde el tipo IMPLICA un mínimo físico. Una finca es rural: por
 * debajo de media hectárea el dato es de otra cosa —la casa que hay dentro, o
 * hectáreas publicadas como metros—. Un parqueadero de 11 m² en cambio es normal,
 * y por eso no aparece aquí: poner un mínimo a todo por simetría descartaría
 * inmuebles reales.
 */
const AREA_MINIMA: Record<string, number> = {
  farm: 500,
};

/** Área máxima por tipo. Un apartamento de 5.000 m² no es un apartamento. */
const AREA_MAXIMA: Record<string, number> = {
  apartment: 2_000,
  parking: 200,
};

export type MotivoImplausible = 'ppm2_alto' | 'ppm2_bajo' | 'area_minima' | 'area_maxima';

export interface Datos {
  type?: string | null;
  area_m2?: number | null;
  price?: number | null;
  price_per_m2?: number | null;
}

/**
 * ¿Por qué no se puede confiar en los datos de este inmueble?
 *
 * `null` si son creíbles. Devuelve el motivo y no un booleano para poder decirle al
 * usuario qué falla —«el área publicada no parece correcta» es útil, «no se pudo
 * evaluar» no— y para poder medir cuál de las reglas está actuando.
 */
export function motivoImplausible(d: Datos): MotivoImplausible | null {
  const area = numero(d.area_m2);
  const tipo = d.type ?? '';

  if (area !== null) {
    const minimo = AREA_MINIMA[tipo];
    if (minimo && area < minimo) return 'area_minima';
    const maximo = AREA_MAXIMA[tipo];
    if (maximo && area > maximo) return 'area_maxima';
  }

  // El precio por metro se recalcula en vez de fiarse de la columna: es un dato
  // derivado y basta con que uno de los dos que lo forman esté mal para que la
  // columna guardada y la división no coincidan.
  const precio = numero(d.price);
  const ppm2 = area && precio ? precio / area : numero(d.price_per_m2);
  if (ppm2 === null) return null; // sin precio por metro no hay nada que juzgar
  if (ppm2 > PPM2_MAXIMO_CREIBLE) return 'ppm2_alto';
  if (ppm2 < PPM2_MINIMO_CREIBLE) return 'ppm2_bajo';
  return null;
}

export function esPlausible(d: Datos): boolean {
  return motivoImplausible(d) === null;
}

/** Lo que se le dice al usuario en la ficha. Nombra el dato que falla. */
export function explicacionImplausible(motivo: MotivoImplausible): string {
  switch (motivo) {
    case 'area_minima':
    case 'area_maxima':
      return 'El área publicada en el aviso no parece correcta para este tipo de inmueble, '
        + 'así que no calculamos su posición frente al mercado.';
    case 'ppm2_alto':
    case 'ppm2_bajo':
      return 'El precio por metro cuadrado que resulta del aviso está fuera de lo razonable, '
        + 'así que no calculamos su posición frente al mercado. Puede ser un error de publicación.';
  }
}

/** Solo números reales y positivos: `Number(null)` es 0, y 0 pasaría por válido. */
function numero(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

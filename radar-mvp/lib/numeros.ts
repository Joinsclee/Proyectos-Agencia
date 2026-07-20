/**
 * Números en formato colombiano.
 *
 * En Colombia el punto separa miles y la coma decimales — al revés que en inglés.
 * Leer "8.008 m²" con `parseFloat` da 8,008 en vez de 8.008, y en un lote eso
 * multiplica por mil su precio por metro cuadrado, que es exactamente la métrica
 * sobre la que se calcula el Índice CRECE. Un lote de 8.000 m² pasaría a parecer
 * el inmueble más caro del país.
 */

/**
 * Interpreta un número escrito en formato colombiano.
 *
 * Desambiguación cuando solo hay puntos (el caso peliagudo):
 *  - Si hay coma, la coma es el decimal y los puntos son miles → "7.000,51" = 7000,51
 *  - Si solo hay puntos y el último grupo tiene 3 dígitos → son miles → "143.538" = 143538
 *  - Si el último grupo tiene 1 o 2 dígitos → es decimal → "52.30" = 52,30
 *
 * La regla de los 3 dígitos es la convención habitual y resuelve bien los datos
 * reales: un área escrita "52.30" son 52 m² y pico, y una escrita "143.538" son
 * ciento cuarenta y tres mil metros, no ciento cuarenta y tres.
 */
export function parseNumeroCO(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[^\d.,-]/g, '').trim();
  if (!s || !/\d/.test(s)) return null;

  let limpio: string;
  if (s.includes(',')) {
    // La coma manda como decimal; los puntos son separadores de miles.
    limpio = s.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = s.split('.');
    if (partes.length === 1) {
      limpio = s;
    } else {
      const ultimo = partes[partes.length - 1];
      limpio = ultimo.length === 3
        ? partes.join('')        // "143.538" → 143538
        : partes.slice(0, -1).join('') + '.' + ultimo; // "52.30" → 52.30
    }
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Área en m². Descarta valores imposibles para no ensuciar el Índice CRECE. */
export function parseAreaCO(raw: string | null | undefined): number | null {
  const n = parseNumeroCO(raw);
  if (n == null || n <= 0) return null;
  if (n > 10_000_000) return null; // más de 1.000 hectáreas: error de lectura
  return n;
}

/** Precio en COP. En los boletines nunca trae decimales. */
export function parsePrecioCO(raw: string | null | undefined): number | null {
  const n = parseNumeroCO(raw);
  if (n == null || n <= 0) return null;
  return Math.round(n);
}

export type AreaTipo = 'construida' | 'terreno' | 'no_especificada';

/**
 * Tipo de área según la etiqueta del boletín.
 *
 * Es obligatorio para el motor: el metro cuadrado de un LOTE (área de terreno) no
 * se puede comparar contra la mediana de apartamentos (área construida). Son
 * mercados distintos y mezclarlos contamina el índice de ambos.
 */
export function clasificarAreaTipo(etiqueta: string | null | undefined, tipoInmueble?: string | null): AreaTipo {
  const t = (etiqueta ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/terreno|lote/.test(t)) return 'terreno';
  if (/construid|privad/.test(t)) return 'construida';
  // Sin etiqueta explícita, el tipo de inmueble lo resuelve: un lote solo tiene
  // área de terreno, y una bodega o un apartamento se miden por construida.
  const ti = (tipoInmueble ?? '').toLowerCase();
  if (ti === 'lot' || ti === 'lote' || ti === 'farm') return 'terreno';
  if (ti) return 'construida';
  return 'no_especificada';
}

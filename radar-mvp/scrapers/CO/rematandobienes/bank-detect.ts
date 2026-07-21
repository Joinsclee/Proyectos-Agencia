/**
 * Detección PRECISA de "demandante = banco/entidad financiera" en remates.
 *
 * Pedido del cliente (Andrés): filtrar con precisión los remates donde el
 * DEMANDANTE (no el demandado) es un banco. La clave es precisión:
 *  - Solo se evalúa el campo `plaintiff` (demandante). NO se escanea la copia de
 *    la publicación, porque ahí suele aparecer "consignar en el Banco Agrario"
 *    (banco del depósito), lo que daría falsos positivos masivos.
 *  - Lista explícita de bancos + entidades financieras vigiladas (las que prestan
 *    y ejecutan hipotecas), incluyendo cooperativas FINANCIERAS y compañías de
 *    financiamiento — no cooperativas genéricas.
 *  - Excluye entidades públicas (municipios, DIAN, etc.) y placeholders/basura.
 */

/** Entidades financieras cuyo nombre NO necesariamente incluye "banco". */
const ENTITIES: Array<[RegExp, string]> = [
  [/bancolombia|banco\s+colombia/i, 'Bancolombia'],
  [/davivienda/i, 'Davivienda'],
  [/\bbbva\b|bilbao\s+vizcaya/i, 'BBVA'],
  [/banco\s+agrario|agrario\s+de\s+colombia/i, 'Banco Agrario'],
  [/caja\s+social/i, 'Banco Caja Social'],
  [/av\.?\s*villas/i, 'AV Villas'],
  [/banco\s+de\s+bogot[aá]/i, 'Banco de Bogotá'],
  [/banco\s+de\s+occidente/i, 'Banco de Occidente'],
  [/banco\s+popular/i, 'Banco Popular'],
  [/scotiabank|colpatria/i, 'Scotiabank Colpatria'],
  [/citibank/i, 'Citibank'],
  [/gnb\s+sudameris/i, 'GNB Sudameris'],
  [/banco\s+pichincha|\bpichincha\b/i, 'Banco Pichincha'],
  [/banco\s+falabella|\bfalabella\b/i, 'Banco Falabella'],
  [/ita[uú]/i, 'Itaú'],
  [/banco\s+w\b/i, 'Banco W'],
  [/mundo\s+mujer/i, 'Banco Mundo Mujer'],
  [/bancam[ií]a/i, 'Bancamía'],
  [/banco\s+uni[oó]n/i, 'Banco Unión'],
  [/banco\s+serfinanza|serfinans[az]/i, 'Banco Serfinanza'],
  [/bancoomeva|coomeva/i, 'Bancoomeva'],
  [/finandina/i, 'Banco Finandina'],
  [/coltefinanciera/i, 'Coltefinanciera'],
  [/credifamilia/i, 'Credifamilia'],
  [/la\s+hipotecaria/i, 'La Hipotecaria'],
  [/confiar/i, 'Confiar'],
  [/juriscoop/i, 'Juriscoop'],
  [/crezcamos/i, 'Crezcamos'],
  [/\btuya\s+s\.?\s?a/i, 'Tuya'],
  [/fondo\s+nacional\s+del\s+ahorro|\bf\.?n\.?a\.?\b/i, 'FNA'],
];

/** Patrones estructurales de entidad financiera (genéricos pero específicos). */
const STRUCTURAL: Array<[RegExp, string]> = [
  [/\bbancos?\b/i, 'Banco'],
  [/compañ[ií]a\s+de\s+financiamiento/i, 'Compañía de Financiamiento'],
  // Cooperativas de ahorro y crédito / financieras (las reguladas que prestan).
  // "ahorro y crédito" y "financiera" (incluso pegada, ej. FINANCIERACOOMULTRASAN)
  // las captura; una cooperativa de caficultores/taxistas NO matchea → se excluye.
  [/cooperativa\s+financiera|ahorro\s+y\s+cr[eé]dito/i, 'Cooperativa Financiera'],
  [/financiera/i, 'Financiera'],
  [/fiduciaria|\bfiducia\b/i, 'Fiduciaria'],
  [/\bleasing\b/i, 'Leasing'],
  [/titularizadora/i, 'Titularizadora'],
];

/** Entidades públicas / placeholders que NO son bancos (cobro coactivo, etc.). */
const NOT_BANK = /no se menciona|no se especific|no aparece|no se indica|no se identific|queremos ayudarte|municipio|alcald[ií]a|gobernaci[oó]n|departamento\s+de|direcci[oó]n\s+de\s+impuestos|\bdian\b|secretar[ií]a\s+de\s+hacienda|tesorer[ií]a|naci[oó]n\b|fiscal[ií]a|rama\s+judicial|unidad\s+administrativa|[aá]rea\s+metropolitana|servicios\s+p[uú]blicos/i;

/** ¿El demandante es un banco/entidad financiera? */
export function isBankPlaintiff(plaintiff: string | null | undefined): boolean {
  return bankName(plaintiff) !== null;
}

/** Nombre legible del banco demandante, o null si no es banco. */
export function bankName(plaintiff: string | null | undefined): string | null {
  if (!plaintiff) return null;
  const t = String(plaintiff).trim();
  if (!t || NOT_BANK.test(t)) return null;
  for (const [re, name] of ENTITIES) if (re.test(t)) return name;
  for (const [re, name] of STRUCTURAL) if (re.test(t)) return name;
  return null;
}

/**
 * Recorta el nombre del demandante cuando arrastra el resto del aviso.
 *
 * rematandobienes cambió el formato y ahora "Demandante:" trae el valor en la
 * misma línea. Como el aviso entero viene sin saltos, el extractor capturaba
 * "BANCO DAVIVIENDA S.A NIT 860... DEMANDADO: ... Dentro del proceso ...": miles
 * de caracteres. El nombre real termina donde empieza el siguiente marcador
 * (NIT, cédula, el demandado, el radicado, la narración del auto…).
 */
export function limpiarDemandante(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.replace(/\s+/g, ' ').trim();
  // Corta en el primer marcador de "aquí ya no es el nombre".
  const STOP = /\s+(?:nit\b|nit[.\/]|c\.?\s?c\.?[:\s.]|c[eé]dula|identificad|demandad|radicaci|radicad|juzgad|hace\s+saber|pasa\s+al\b|dentro\s+del\s+proceso|proceso\s+ejecutivo|fecha\s+(?:del|y|de)\b|bienes?\s+(?:materia|objeto|de)\b|aval[uú]o\b|matr[ií]cula|postor\b|postura\b|secuestre\b|direcci[oó]n[:\s]|link\b|https?:)/i;
  const m = STOP.exec(v);
  if (m && m.index > 0) v = v.slice(0, m.index).trim();
  v = v.replace(/[\s.,;:-]+$/, '').trim();
  // Un demandante de más de 200 caracteres es casi seguro texto desbordado.
  if (v.length > 200) v = v.slice(0, 200).trim();
  return v || null;
}

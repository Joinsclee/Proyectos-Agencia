/**
 * Parser de UN aviso de rematandobienes.com → Remate normalizado.
 *
 * Estrategia:
 *  - Los avisos usan Elementor + JetEngine: cada campo dinámico aparece
 *    como `.jet-listing-dynamic-field__content` en orden FIJO porque
 *    todos los avisos comparten el mismo template.
 *  - Orden confirmado por el recon (`_session/remates-recon.json`):
 *      [0] título
 *      [1] código del remate (puede estar vacío)
 *      [2] departamento
 *      [3] dirección completa
 *      [4] fecha publicación  (no la usamos como audiencia)
 *      [5] fecha audiencia (diligencia)
 *      [6] avalúo  ($XXX,XXX,XXX)
 *      [7] postura mínima ($XXX,XXX,XXX)
 *      [8] número de proceso
 *      [9] juzgado
 *      [10] secuestre
 *      [11] demandado
 *      [12] demandante
 *  - Fallback: parsing del texto plano por labels ("Avalúo del bien:", etc.)
 *    cuando el orden no coincide o un campo está vacío.
 */
import type { RemateAvisoRaw, Remate, PropertyType, AuctionMode } from './types.js';
import { normalizeCity } from '../../../lib/types.js';
import { bankName, limpiarDemandante } from './bank-detect.js';

// Tarjeta branded por tipo (subidas por scripts/upload-placeholders.ts).
// El portal de remates NO trae fotos del inmueble — solo datos jurídicos. Usamos
// una representación gráfica del TIPO (no una foto que daría falsa expectativa).
// Si se generan imágenes "persona IA con cartel", se suben al mismo path y se
// muestran automáticamente sin tocar el código.
const PLACEHOLDER_BASE = `${process.env.SUPABASE_URL ?? 'https://uqlfgnylvnefhyuvtncd.supabase.co'}/storage/v1/object/public/inmuebles-pdf/placeholders`;
const PLACEHOLDER_TYPES = new Set<string>(['house', 'apartment', 'lot', 'farm', 'commercial', 'office', 'vehicle', 'parking', 'rights']);

function placeholderFor(type: PropertyType | null, _sourceId: string): string {
  // Imágenes IA (persona con cartel "REMATE DE X"), generadas por Codex y
  // subidas a placeholders/ai/{type}.png. El fallback 'unknown' = "REMATE DE INMUEBLE".
  const key = type && PLACEHOLDER_TYPES.has(type) ? type : 'unknown';
  return `${PLACEHOLDER_BASE}/ai/${key}.png`;
}

// ────────────────────────────────────────────────────────────────────
// Utilidades
// ────────────────────────────────────────────────────────────────────

const MONTHS_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Convierte "junio 30, 2026" → "2026-06-30" (ISO). Null si no parsea. */
export function parseSpanishDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  // Formato típico: "junio 30, 2026" / "junio 30 de 2026" / "30 de junio de 2026"
  const m1 = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  const m2 = s.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  let mes: number | null = null;
  let dia: number | null = null;
  let anio: number | null = null;
  if (m1) {
    mes = MONTHS_ES[m1[1]!] ?? null;
    dia = parseInt(m1[2]!, 10);
    anio = parseInt(m1[3]!, 10);
  } else if (m2) {
    dia = parseInt(m2[1]!, 10);
    mes = MONTHS_ES[m2[2]!] ?? null;
    anio = parseInt(m2[3]!, 10);
  }
  if (!mes || !dia || !anio) return null;
  return `${anio.toString().padStart(4, '0')}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
}

/** "$787,141,000" / "$787.141.000" / "$787.141.000.oo" → 787141000. */
export function parseMoneyCOP(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Quitar todo lo que no sea dígito (en COP: tanto "," como "." son separadores de miles)
  const digits = raw.replace(/[^0-9]/g, '');
  // Si terminaba en ".oo" eso queda como "00" extra al final → lo manejamos
  // detectando un valor que termine con "oo" en el raw y haya quitado eso.
  // Para evitar overshoot, asumimos que avalúos NO tienen decimales reales en COP.
  let n = parseInt(digits, 10);
  if (!isFinite(n) || n <= 0) return null;
  // Si el raw terminaba en ".oo" o ".00" — el algoritmo agregó "00" → dividir
  if (/\.(oo|00)\b/i.test(raw)) {
    if (n % 100 === 0) n = n / 100;
  }
  return n;
}

/**
 * Inferir tipo de bien desde título + categorías + descripción.
 * El título manda (es lo más específico), luego la descripción como apoyo.
 * Orden de chequeo importa: vehículo/parqueadero antes que tipos genéricos.
 */
export function inferPropertyType(
  title: string,
  categories: string[],
  description?: string | null,
): { type: PropertyType | null; raw: string } {
  const titleL = title.toLowerCase();
  const corpus = `${title} ${categories.join(' ')} ${description ?? ''}`.toLowerCase();

  // 1. VEHÍCULOS (placa, marcas comunes, palabras clave) — chequear primero
  if (
    /\bveh[ií]culo\b|\bautom[oó]vil\b|\bmotocicleta\b|\bmoto\b|\bcamioneta\b|\bcami[oó]n\b|\bbus\b|\btractomula\b|\bremolque\b/.test(corpus) ||
    /\bplaca\s+[a-z]{3}\s?\d{2,3}\b/.test(corpus) ||
    /\b(renault|mazda|chevrolet|toyota|nissan|kia|hyundai|mercedes\s*benz|bmw|ford|volkswagen|suzuki|honda|yamaha|bajaj|akt)\b/.test(titleL)
  ) {
    return { type: 'vehicle', raw: 'vehículo' };
  }

  // 2. PARQUEADERO / GARAJE / DEPÓSITO
  if (/\bparqueadero\b|\bgaraje\b|\bgarage\b|\bdep[oó]sito\b/.test(titleL)) {
    return { type: 'parking', raw: 'parqueadero' };
  }

  // 3. Inmuebles por palabra clave en TÍTULO (prioridad)
  if (/\bcasa\b|\bcasas\b|\bcasalote\b/.test(titleL)) return { type: 'house', raw: 'casa' };
  if (/\bapartamento\b|\bapartaestudio\b|\baparta-?estudio\b|\baptos?\b|\bapto\b/.test(titleL)) return { type: 'apartment', raw: 'apartamento' };
  if (/\bfinca\b|\bparcela\b|\bhacienda\b|\bpredio\s+rural\b|\brancho\b/.test(titleL)) return { type: 'farm', raw: 'finca' };
  if (/\blote\b|\blotes\b|\bterreno\b|\bpredios?\b/.test(titleL)) return { type: 'lot', raw: 'lote' };
  if (/\blocal\b|\bbodega\b/.test(titleL)) return { type: 'commercial', raw: 'local' };
  if (/\boficina\b|\bconsultorio\b/.test(titleL)) return { type: 'office', raw: 'oficina' };

  // 4. Derechos / cuotas (proindiviso, % de derechos) — sin inmueble concreto
  if (/\bderechos\s+(de\s+)?(propiedad|proindiviso|herenciales|sucesorales)\b|\bproindiviso\b|\bcuota\s+parte\b|\bacciones\s+de\s+la\s+sociedad\b/.test(corpus)) {
    return { type: 'rights', raw: 'derechos' };
  }

  // 5. Fallback: palabra clave en la DESCRIPCIÓN (cuando el título es genérico "INMUEBLE EN…")
  if (/\bapartamento\b|\bapartaestudio\b/.test(corpus)) return { type: 'apartment', raw: 'apartamento' };
  if (/\bcasa\b/.test(corpus)) return { type: 'house', raw: 'casa' };
  if (/\bfinca\b|\bpredio\s+rural\b|\brural\b/.test(corpus)) return { type: 'farm', raw: 'finca' };
  if (/\blote\b|\bterreno\b/.test(corpus)) return { type: 'lot', raw: 'lote' };
  if (/\blocal\b|\bbodega\b/.test(corpus)) return { type: 'commercial', raw: 'local' };
  if (/\boficina\b/.test(corpus)) return { type: 'office', raw: 'oficina' };

  return { type: null, raw: '' };
}

/** Hora "9:00 A.M." → "09:00 AM" normalizado. */
export function parseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s*[:.h]\s*(\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?/i);
  if (!m) return null;
  const hh = m[1]!.padStart(2, '0');
  const mm = (m[2] ?? '00').padStart(2, '0');
  const ampm = m[3] ? m[3].toUpperCase().replace(/\./g, '').replace(/\s/g, '') : '';
  return ampm ? `${hh}:${mm} ${ampm}` : `${hh}:${mm}`;
}

/** Modalidad "virtual" / "presencial" del texto del aviso. */
export function inferMode(fullText: string): AuctionMode | null {
  const t = fullText.toLowerCase();
  if (/\b(remate\s+virtual|audiencia\s+virtual|de\s+forma\s+virtual)\b/.test(t)) return 'virtual';
  if (/\b(presencial)\b/.test(t)) return 'presencial';
  return null;
}

// Regex auxiliares para fallback por labels en el full_text
const RE_MATRICULA = /(?:m\.?i\.?|matr[ií]cula\s+inmobiliaria)\s*(?:no\.?|n[°º]\.?)?\s*([\d\-]+)/i;
const RE_EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
const RE_DEPOSITO = /(\d{1,3})\s*%\s*(?:de\s+dep[oó]sito|del?\s+valor.*postura|para\s+participar)/i;
const RE_POSTURA_PCT = /postura\s+admisible\s+(?:la\s+que\s+cubra\s+el|del?)\s+(\d{1,3})\s*%/i;
const RE_HORA = /a\s+la\s+hora\s+de\s+las?\s+([0-9:.\s]+(?:a\.?\s*m\.?|p\.?\s*m\.?))/i;

/** Punto de entrada principal del parser. */
export function parseAviso(raw: RemateAvisoRaw): Remate {
  const f = raw.jet_field_texts;
  // Algunos avisos pueden tener un campo intermedio extra o faltante; usamos
  // el orden como guía pero también validamos por contenido.
  // Helper para tomar de orden con default null:
  const at = (i: number): string | null => (f[i] && f[i]!.trim()) || null;

  // Campos en orden esperado:
  const title = at(0) ?? raw.title;
  const codigoRemateRaw = at(1);
  // Filtrar "Código del remate:" label cuando el valor está vacío:
  const sourceCode = codigoRemateRaw && !/^\s*c[oó]digo\s+del?\s+remate/i.test(codigoRemateRaw)
    ? codigoRemateRaw
    : null;

  // Department: del slug de la URL, o jet_field 2, o último segmento de la dirección.
  let department = raw.department_slug ? normalizeCity(raw.department_slug.replace(/-/g, ' ')) : (at(2) || null);
  // jet_field 2 a veces trae el label "Código del remate:" en avisos rurales → descartar
  if (department && /c[oó]digo\s+del?\s+remate/i.test(department)) department = null;

  // ── Extracción por ETIQUETAS del full_text (robusto, no depende del orden ni
  //    del número de jet_fields, que varían y vienen duplicados). El valor está
  //    en la línea siguiente a la etiqueta; "Ver detalles del remate" = gated → null.
  const ft = raw.full_text;
  const afterLabel = (label: string): string | null => {
    // El valor va tras la etiqueta, y rematandobienes cambió el formato: antes
    // caía en la LÍNEA SIGUIENTE ("Demandante:\nBANCOLOMBIA S.A."), ahora en la
    // MISMA línea ("Demandante: BANCOLOMBIA S.A."). Se aceptan ambos, o el
    // scraper vuelve a guardar todos los campos en null sin que nada falle.
    const re = new RegExp(label + '\\s*:\\s*([^\\n]+)|' + label + '\\s*:?\\s*\\n+\\s*([^\\n]+)', 'i');
    const m = re.exec(ft);
    if (!m) return null;
    const v = (m[1] ?? m[2] ?? '').trim();
    if (!v || /^ver detalles del remate|copia exacta de la publicaci/i.test(v)) return null;
    return v;
  };

  // Dirección: el aviso no trae jet_field de dirección; la sección "Dirección:"
  // del texto suele ser solo depto/ciudad. La ubicación real va en description/city.
  const address = null;

  // Fecha de audiencia (NO la de publicación)
  const auctionDateRaw = afterLabel('Fecha de Audiencia') ?? afterLabel('Fecha de la diligencia');
  const auction_date = parseSpanishDate(auctionDateRaw);

  // Avalúo y postura por etiqueta
  const appraisalRaw = afterLabel('Aval[uú]o del bien') ?? afterLabel('Aval[uú]o');
  const appraisal_value = parseMoneyCOP(appraisalRaw);
  const minBidRaw = afterLabel('Postura m[ií]nima');
  const minimum_bid = parseMoneyCOP(minBidRaw);

  // Datos del proceso (premium; gated tras "Ver detalles del remate" sin membresía).
  // El radicado real trae guiones (ej. 768924003001-2024-00491-00) → conservar tal cual.
  const caseRaw = afterLabel('Radicado del proceso') ?? afterLabel('N[uú]mero de proceso');
  const case_number = caseRaw ? caseRaw.replace(/\s+/g, ' ').trim() : null;
  const court = afterLabel('Entidad que realiza el remate') ?? afterLabel('Juzgado');
  const court_email = (court && RE_EMAIL.exec(ft)?.[1]) || null;
  const trustee = afterLabel('Secuestre');
  const defendant = afterLabel('Demandado');
  const plaintiff = limpiarDemandante(afterLabel('Demandante'));

  // Copia exacta de la publicación (texto oficial completo del aviso; premium).
  let copia_publicacion: string | null = null;
  const mCopia = ft.match(/Copia exacta de la publicaci[oó]n\s*:?\s*\n+([\s\S]*?)(?=\n\s*(?:Fecha de Audiencia|Radicado del proceso|¡Queremos|Facebook|Compartir|$))/i);
  if (mCopia) {
    const t = mCopia[1]!.trim().replace(/[ \t]+/g, ' ');
    if (t && !/^ver detalles del remate/i.test(t) && t.length > 40) copia_publicacion = t.slice(0, 8000);
  }

  // ¿El demandante es un banco/entidad financiera? (filtro pedido por el cliente)
  // Detector preciso y compartido (lista de bancos + exclusión de públicos/placeholders).
  const bank_name = bankName(plaintiff);
  const is_bank_plaintiff = bank_name !== null;

  // Descripción del bien: buscar entre "Descripción de bien en remate:" y "Dirección:"
  let description: string | null = null;
  const mDesc = raw.full_text.match(/Descripci[oó]n\s+de\s+bien\s+en\s+remate:\s*\n+([\s\S]*?)(?=\n\s*Direcci[oó]n:|$)/i);
  if (mDesc) description = mDesc[1]!.trim().replace(/\s+/g, ' ').substring(0, 2000);

  // Matrícula inmobiliaria (M.I.)
  const matriculaMatch = RE_MATRICULA.exec(raw.full_text);
  const matricula_inmobiliaria = matriculaMatch ? matriculaMatch[1]!.trim() : null;

  // Hora
  const auctionTimeMatch = RE_HORA.exec(raw.full_text);
  const auction_time = parseTime(auctionTimeMatch?.[1]);

  // % de postura y depósito
  const posturaPctMatch = RE_POSTURA_PCT.exec(raw.full_text);
  const minimum_bid_pct = posturaPctMatch ? parseInt(posturaPctMatch[1]!, 10) : null;
  const depositoMatch = RE_DEPOSITO.exec(raw.full_text);
  const deposit_pct = depositoMatch ? parseInt(depositoMatch[1]!, 10) : null;

  // Modalidad
  const auction_mode = inferMode(raw.full_text);

  // Tipo (título + categorías + descripción para máxima precisión)
  const { type: property_type, raw: property_type_raw } = inferPropertyType(title, raw.categories, description);

  // source_id: preferir código del remate; si está vacío, usar slug del aviso
  const source_id = sourceCode ?? raw.slug;

  // city: cadena de fallbacks (los avisos rurales no tienen link /ciudad/).
  //  1. label/slug del link /ciudad/ (lo más confiable cuando existe)
  //  2. de la dirección "..., CIUDAD, DEPARTAMENTO" → penúltimo segmento
  //  3. del título "... EN CIUDAD (DEPTO)" o "... EN CIUDAD, DEPTO"
  let city = normalizeCity(raw.city_label || raw.city_slug.replace(/-/g, ' '));
  if (!city) {
    // Título: "...EN PUENTE NACIONAL SANTANDER" / "...EN SOPO CUNDINAMARCA"
    // Tomamos lo que sigue al último " EN " y le quitamos el departamento final
    // si coincide con un nombre de depto conocido.
    const mEn = title.match(/\bEN\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ .()-]+)$/);
    if (mEn) {
      let candidate = mEn[1]!.trim().replace(/\(.*?\)/g, '').trim();
      // Si el candidato termina con el departamento, lo quitamos
      const depWords = (department || '').split(' ').filter(Boolean);
      if (depWords.length) {
        const re = new RegExp('\\s+' + depWords.join('\\s+') + '$', 'i');
        candidate = candidate.replace(re, '').trim();
      }
      if (candidate) city = normalizeCity(candidate);
    }
  }

  return {
    country_code: 'CO',
    source: 'rematandobienes',
    source_id,
    source_url: raw.url,
    department,
    city,
    address,
    property_type,
    property_type_raw: property_type_raw || null,
    matricula_inmobiliaria,
    description,
    court,
    court_email,
    court_address: null,
    case_number,
    plaintiff,
    defendant,
    trustee,
    auction_date,
    auction_date_raw: auctionDateRaw,
    auction_time,
    auction_mode,
    appraisal_value,
    appraisal_value_raw: appraisalRaw,
    minimum_bid,
    minimum_bid_raw: minBidRaw,
    minimum_bid_pct,
    deposit_pct,
    currency: 'COP',
    image_url: placeholderFor(property_type, source_id),
    features: {
      title_raw: title,
      categories: raw.categories,
      copia_publicacion,
      is_bank_plaintiff,
      bank_name,
    },
  };
}

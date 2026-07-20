/**
 * Campos jurídicos de un remate y su matriz de acceso.
 *
 * HU "Motor de Remates Judiciales". Tres datos que salen del aviso del juzgado y
 * que cambian por completo el riesgo de la operación:
 *
 *  - origen_demandante: si quien demanda es un banco, el título suele venir más
 *    limpio y el proceso es hipotecario estándar. Si es un particular o una
 *    sucesión, hay más incertidumbre sobre el estado real del título.
 *  - tipo_proceso: informativo. Se muestra, pero no decide nada comercial.
 *  - cuota_parte: qué porcentaje del bien se remata. Es el dato más peligroso del
 *    módulo: quien cree que compra un apartamento y en realidad compra el 50% de
 *    los derechos queda de copropietario con un desconocido.
 */

export type OrigenDemandante = 'bancario' | 'particular_otro';
export type TipoProceso = 'ejecutivo_hipotecario' | 'otro';

/** Texto del aviso normalizado: sin tildes y en minúsculas, para buscar sin sorpresas. */
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Origen del demandante.
 *
 * Cuando el aviso no permite determinarlo, la HU manda tratarlo como
 * `particular_otro`: es el perfil conservador, y equivocarse hacia "banco" le
 * vendería al usuario una seguridad jurídica que nadie verificó.
 */
export function origenDemandante(esBanco: boolean | null | undefined): OrigenDemandante {
  return esBanco === true ? 'bancario' : 'particular_otro';
}

/** Tipo de proceso. Informativo: NO determina si el remate es gratis o de pago. */
export function tipoProceso(...textos: Array<string | null | undefined>): TipoProceso {
  const t = norm(textos.filter(Boolean).join(' · '));
  if (/ejecutivo\s+(con\s+garantia\s+real|hipotecario)|hipotecari[oa]/.test(t)) return 'ejecutivo_hipotecario';
  return 'otro';
}

/**
 * Porcentajes que NO son cuota-parte.
 *
 * En todo aviso de remate aparece "la postura mínima será el 70% del avalúo" y
 * frases equivalentes. Tomar ese 70% como cuota-parte marcaría prácticamente
 * TODOS los remates con la alerta jurídica y la volvería ruido invisible, que es
 * peor que no tenerla. Por eso se descarta cualquier porcentaje que esté hablando
 * de avalúo, postura, base o consignación.
 */
// Ojo con los tokens cortos: sin \b, "iva" hacía match dentro de "equIVAlentes"
// y descartaba cuotas-parte legítimas.
const CONTEXTO_NO_CUOTA = /(avaluo|postur|licitac|consign|\bbase\s+de|\boferta|deposit|caucion|secuestre|honorari|\binteres|\biva\b|descuento|comision|porcentaje\s+legal)/;

/** Palabras que sí indican que el porcentaje se refiere a la porción del bien. */
const CONTEXTO_CUOTA = /(derecho|dominio|cuota|proindiviso|pro\s*indiviso|participacion|inmueble|predio|lote|bien\b|titularidad)/;

/**
 * ¿A qué se refiere este porcentaje? Gana el calificador que aparezca MÁS CERCA.
 *
 * El español jurídico pone el calificador justo detrás del número ("el 70% del
 * avalúo", "el 50% del derecho de dominio"), así que mirar una ventana amplia
 * traía la frase vecina y contaminaba la decisión: en un aviso que dice "se
 * rematará el 50% del derecho de dominio. La base de la licitación será el 70%
 * del avalúo", la palabra "licitación" caía dentro de la ventana del 50% y lo
 * descartaba. Con primero-gana, cada porcentaje se resuelve por su propio
 * complemento.
 */
function refiereACuota(tramo: string): boolean {
  const cuota = tramo.search(CONTEXTO_CUOTA);
  const noCuota = tramo.search(CONTEXTO_NO_CUOTA);
  if (cuota === -1) return false;              // no habla del bien
  if (noCuota === -1) return true;             // habla del bien y de nada más
  return cuota < noCuota;                      // gana el que esté más cerca
}

/**
 * Contexto que sigue al número, cortado en el punto final.
 *
 * El complemento de un porcentaje nunca cruza el punto: en "…el 70% del avalúo
 * del bien. Los postores consignarán el 40%…", el "del bien" pertenece a la
 * primera oración y no debe influir sobre el 40% de la segunda.
 */
const trasNumero = (t: string, desde: number) => t.slice(desde, desde + 60).split(/[.;]\s/)[0];

/** Contexto previo al número, también acotado a su propia oración. */
function anteNumero(t: string, hasta: number): string {
  const tramo = t.slice(Math.max(0, hasta - 60), hasta);
  const partes = tramo.split(/[.;]\s/);
  return partes[partes.length - 1];
}

export interface CuotaParte {
  /** Porcentaje del bien que se remata. 100 = dominio pleno. */
  porcentaje: number;
  /** Fragmento del aviso donde se detectó, para poder auditar la decisión. */
  evidencia: string | null;
}

/**
 * Extrae la cuota-parte del aviso.
 *
 * Estrategia deliberadamente conservadora en la dirección segura: ante la duda es
 * preferible marcar de más (el usuario lee el aviso y descarta la alerta) que de
 * menos (el usuario compra medio inmueble sin enterarse). Por eso basta con que
 * el porcentaje aparezca cerca de vocabulario de dominio para tomarlo.
 */
export function extraerCuotaParte(...textos: Array<string | null | undefined>): CuotaParte {
  // Las copias de avisos traen enlaces pegados (Teams, Drive) llenos de secuencias
  // %22 %2c %3a que el buscador de porcentajes lee como "22%", "2%"… Se limpian
  // antes de mirar nada, o cualquier aviso con un link queda marcado.
  const crudo = textos.filter(Boolean).join(' · ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/%[0-9a-fA-F]{2}/g, ' ');
  const t = norm(crudo);
  if (!t) return { porcentaje: 100, evidencia: null };

  // "50%", "71.14%", "33,33 %", "50 por ciento"
  const re = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|por\s*ciento)/g;
  let m: RegExpExecArray | null;
  let mejor: CuotaParte = { porcentaje: 100, evidencia: null };

  while ((m = re.exec(t)) !== null) {
    const pct = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    if (pct === 100) continue; // "el 100% del dominio" confirma dominio pleno

    // Lo que sigue al número manda ("el 50% DEL DERECHO DE DOMINIO"); si ahí no
    // hay calificador, se mira lo que lo precede ("CONSIGNARÁN el 40%").
    const fin = m.index + m[0].length;
    const antes = anteNumero(t, m.index);
    const despues = trasNumero(t, fin);

    // 1) Si la MISMA oración, antes del número, ya dijo de qué habla ("será
    //    postura admisible la que cubra el 70%…", "previa consignación del 40%…"),
    //    ese porcentaje es del avalúo, no del bien. Se descarta aunque después
    //    aparezca la palabra "bien" — como en "el 70% del valor del bien".
    if (CONTEXTO_NO_CUOTA.test(antes)) continue;
    // 2) El complemento que sigue al número debe hablar de la porción del bien.
    if (!refiereACuota(despues)) continue;

    // Si hay varios, se queda el MENOR: es el que más advierte al comprador.
    if (mejor.evidencia === null || pct < mejor.porcentaje) {
      const iniCrudo = Math.max(0, m.index - 70);
      mejor = { porcentaje: pct, evidencia: crudo.slice(iniCrudo, Math.min(crudo.length, m.index + 70)).trim() };
    }
  }
  return mejor;
}

/** ¿Se remata solo una porción del bien? Dispara la alerta jurídica amarilla. */
export const tieneCuotaParte = (pct: number | null | undefined): boolean =>
  pct != null && pct !== 100;

export const TEXTO_ALERTA_CUOTA_PARTE =
  'El remate tiene una alerta amarilla porque se está rematando un porcentaje del bien, ' +
  'no el dominio o titularidad completa. Leer con detalle el aviso.';

export type AccesoRemate = 'gratis' | 'gratis_con_aviso' | 'suscripcion';

/**
 * Matriz de acceso de remates (origen del demandante × descuento).
 *
 * Los remates NO usan la tabla de estrellas del Índice CRECE: por ser subastas ya
 * parten ~30% bajo mercado, así que casi todos darían "oportunidad" y la
 * clasificación no discriminaría nada. La lógica comercial es otra: un remate de
 * banco con descuento medio es la mejor mercancía del módulo (menor riesgo legal)
 * y por eso se cobra; el mismo descuento en un particular se regala como gancho,
 * con aviso, para empujar la verificación legal.
 */
export function accesoRemate(origen: OrigenDemandante, descuentoPct: number | null | undefined): AccesoRemate {
  const d = descuentoPct ?? 0;
  if (d < 20) return 'gratis';                                  // aún no es oportunidad destacada
  if (origen === 'bancario') return 'suscripcion';              // 20-39% y ≥40%
  return d >= 40 ? 'suscripcion' : 'gratis_con_aviso';          // particular: gancho en 20-39%
}

/** ¿La ficha se muestra completa o va con muro de suscripción? */
export const requiereSuscripcionRemate = (a: AccesoRemate): boolean => a === 'suscripcion';

/**
 * Reporte descargable de UN inmueble.
 *
 * FORMATO: un HTML autocontenido que el navegador descarga como archivo. No es un
 * PDF y no hay librería de PDF a propósito: el proyecto no tiene bundler, y meter
 * un motor de PDF en el servidor para una hoja de datos sería cargar decenas de
 * megas de dependencia (y una superficie de seguridad nueva) para producir lo
 * mismo que el usuario obtiene con «Imprimir → Guardar como PDF». Los estilos van
 * embebidos y con `@media print` afinado, así que el archivo se abre sin conexión,
 * se archiva junto a la escritura y se imprime derecho.
 *
 * QUÉ ENTRA: sólo lo que el sistema ya calcula —precio, precio/m², descuento
 * frente al mercado de su zona, categoría del Índice CRECE, los comparables que
 * sostienen la conclusión con su número y confianza, características, y para
 * remates los datos de la subasta con su aviso jurídico—. Ninguna métrica nueva
 * inventada aquí: un número que sólo existe en el reporte no se puede auditar
 * contra la ficha, y el reporte es justo lo que el usuario le enseña a un tercero.
 *
 * QUÉ NO ENTRA: lo que el plan del usuario no cubre. El muro (`server/acceso.ts`)
 * no se puede saltar por la puerta de atrás; ver `datosDeInmueble` y
 * `decidirReporte`.
 */
import { clasePorTier, desviacionTexto } from '../engine/crece.js';
import type { Plan, Acceso } from './acceso.js';
import {
  consumirCupoReportes,
  type CupoReportes,
} from './cupo-reportes.js';

/**
 * Escapa texto para incrustarlo en HTML.
 *
 * Todo lo que entra al reporte viene de scraping de portales bancarios y de
 * avisos de juzgado: texto ajeno, sin sanear, que a veces trae fragmentos de HTML
 * pegados de la publicación original. El equivalente servidor del `esc()` del
 * frontend. Se escapan también las comillas porque varios valores se usan dentro
 * de atributos (`href`, `title`).
 */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

/**
 * Enlace utilizable o nada.
 *
 * `source_url` sale de la base, y una fila envenenada con `javascript:…` se
 * convertiría en un enlace ejecutable dentro de un archivo que el usuario abre en
 * su propio navegador con permisos de `file://`. Sólo pasan http y https.
 */
export function urlSegura(valor: unknown): string | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  try {
    const url = new URL(texto);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// ─────────────────────────── Decisión de entrega ───────────────────────────

export type RequisitoReporte = 'registro' | 'ficha' | 'plan' | 'suscripcion';

export type DecisionReporte =
  | { ok: true; consume: boolean; cupo: CupoReportes }
  | { ok: false; requiere: RequisitoReporte; cupo: CupoReportes };

/**
 * ¿Se le entrega el reporte a este usuario?
 *
 * Tres puertas, en este orden:
 *
 * 1. Anónimo: no. Un reporte descargable es un archivo que sobrevive a la
 *    sesión; regalarlo sin cuenta sería regalar el producto.
 * 2. Ficha bloqueada para él: tampoco, y —esto es lo importante— SIN gastarle un
 *    reporte del cupo. Podríamos generar un reporte censurado, pero cobrarle una
 *    unidad de su cupo mensual por un documento con huecos es venderle el hueco.
 *    Se le dice qué le falta: abrir la ficha con su cupo de fichas (`ficha`) o
 *    pasarse al plan de pago (`suscripcion`).
 * 3. Cupo de reportes agotado: se le ofrece el plan.
 *
 * El orden 2-antes-de-3 importa: si se cobrara primero, el usuario perdería un
 * reporte para enterarse de que no podía pedirlo.
 */
export function decidirReporte(args: {
  plan: Plan;
  acceso: Pick<Acceso, 'completa' | 'requiere'>;
  cupo: CupoReportes;
  id: string;
  /**
   * ¿Esta ficha es contenido de pago para un plan gratuito?
   *
   * Es distinto de `acceso.completa`, que dice si ESTE usuario puede verla ahora.
   * Una ficha que el Radar enseña a cualquiera —incluido un anónimo— no puede
   * gastar cupo de reportes: si lo gasta, un usuario del plan gratuito quema sus
   * 20 descargas en fichas que nunca estuvieron cerradas.
   *
   * Por defecto `true` para que el descuido, si lo hay, sea cobrar de más y no
   * regalar el producto.
   */
  esDePago?: boolean;
}): DecisionReporte {
  const { plan, acceso, cupo, id, esDePago = true } = args;
  if (plan === 'anonimo') return { ok: false, requiere: 'registro', cupo };
  if (!acceso.completa) {
    // Tres motivos distintos, tres mensajes distintos. Mapearlos todos a
    // "suscripcion" hacía que a alguien con 19 reportes disponibles se le dijera
    // que los había agotado, contradiciendo al propio contador que viajaba en la
    // misma respuesta.
    if (acceso.requiere === 'cupo') return { ok: false, requiere: 'ficha', cupo };
    return { ok: false, requiere: 'plan', cupo };
  }
  // Gratis para todos: se entrega sin tocar el contador.
  if (!esDePago) return { ok: true, consume: false, cupo };
  const consumo = consumirCupoReportes(cupo, id, plan);
  if (!consumo.permitido) return { ok: false, requiere: 'suscripcion', cupo: consumo.cupo };
  return { ok: true, consume: consumo.consumido, cupo: consumo.cupo };
}

/** Mensaje para el usuario según lo que le falta. Vive aquí para que servidor y
 *  pruebas digan exactamente lo mismo. */
export const MENSAJE_RECHAZO: Record<RequisitoReporte, string> = {
  registro: 'Crea tu cuenta gratis para descargar reportes de los inmuebles.',
  ficha: 'Abre primero la ficha completa de este inmueble: el reporte incluye datos que ahí se desbloquean.',
  plan: 'Esta ficha es del plan de pago. Actívalo para abrirla y descargar su reporte.',
  suscripcion: 'Agotaste los reportes gratuitos de este mes. El plan de pago los deja sin límite.',
};

// ──────────────────────────── Datos del reporte ────────────────────────────

export interface ComparablesReporte {
  n: number;
  medianaPpm2: number | null;
  medianaTotal: number | null;
  /** 'high' | 'medium' | 'low' | 'insufficient' tal como los nombra el motor. */
  confianza: string | null;
  /** Contra qué se comparó: "1.5 km a la redonda", "barrio Laureles"… */
  alcance: string | null;
  criterios: string[];
  /**
   * ¿La muestra salió del MISMO tipo de inmueble, o hubo que mezclar?
   *
   * El veredicto del motor nunca mezcla tipos; el resumen de zona sí se abre a
   * todos cuando no encuentra suficientes del pedido. Son dos cifras que se leen
   * igual y valen distinto, así que el reporte tiene que poder decir cuál trae.
   */
  mismoTipo: boolean;
  /** La comparación cubrió la ciudad entera: el último recurso de la cascada. */
  ambitoCiudad: boolean;
}

export interface ArriendoReporte {
  canonMediano: number | null;
  rangoBajo: number | null;
  rangoAlto: number | null;
  canonPorM2: number | null;
  n: number;
  confianza: string | null;
  alcance: string | null;
}

export interface RemateReporte {
  avaluo: number | null;
  posturaMinima: number | null;
  posturaPct: number | null;
  fechaAudiencia: string | null;
  horaAudiencia: string | null;
  modalidad: string | null;
  juzgado: string | null;
  radicado: string | null;
  demandante: string | null;
  matricula: string | null;
  depositoPct: number | null;
  /** Porcentaje del bien que se remata. Distinto de 100 = alerta jurídica. */
  cuotaParte: number | null;
}

export interface DatosReporte {
  kind: 'portal' | 'banco' | 'remate';
  id: string;
  titulo: string;
  ciudad: string;
  zona: string | null;
  departamento: string | null;
  fuente: string;
  precio: number | null;
  precioPorM2: number | null;
  descuentoPct: number | null;
  crece: { lectura: string; desviacion: string | null; estrellas: number } | null;
  caracteristicas: Array<{ etiqueta: string; valor: string }>;
  comparables: ComparablesReporte | null;
  arriendo: ArriendoReporte | null;
  remate: RemateReporte | null;
  direccion: string | null;
  enlace: string | null;
  contacto: string | null;
  generadoEn: Date;
  /** Plan con el que se generó. Va impreso: explica por qué el archivo trae lo que trae. */
  plan: 'free' | 'suscrito';
}

const cop = (valor: number | null | undefined): string =>
  valor == null || !Number.isFinite(Number(valor))
    ? '—'
    : `$${Math.round(Number(valor)).toLocaleString('es-CO')}`;

const pct = (valor: number | null | undefined, decimales = 0): string =>
  valor == null || !Number.isFinite(Number(valor))
    ? '—'
    : `${Number(valor).toFixed(decimales)}%`;

/** Fecha en hora de Colombia, que es donde está el usuario y donde ocurre la audiencia. */
export function fechaLegible(fecha: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota',
  }).format(fecha);
}

/** Fecha suelta (`2026-08-14`) sin arrastrar el huso: se formatea a mediodía UTC
 *  para que no se corra un día hacia atrás al pasarla a hora de Colombia. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long', timeZone: 'America/Bogota',
  }).format(fecha);
}

/**
 * Nombre del archivo.
 *
 * Se arma con la ciudad y el id porque el usuario acaba con varios reportes en la
 * misma carpeta y «reporte.html» tres veces no le sirve de nada. Se filtra a
 * `[a-z0-9-]`: la ciudad viene de la base y un nombre con comillas o barras
 * rompería la cabecera `Content-Disposition` o escribiría fuera de la carpeta.
 */
export function nombreArchivoReporte(datos: Pick<DatosReporte, 'kind' | 'id' | 'ciudad'>): string {
  const limpio = (texto: string) => texto
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const ciudad = limpio(datos.ciudad) || 'inmueble';
  const id = limpio(datos.id) || 'ficha';
  return `radar-reporte-${datos.kind}-${ciudad}-${id.slice(0, 12)}.html`;
}

// ────────────────────────── De fila de base a datos ──────────────────────────

const numero = (valor: unknown): number | null => {
  const n = typeof valor === 'string' ? Number(valor) : (valor as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const texto = (valor: unknown): string | null => {
  const t = String(valor ?? '').trim();
  return t ? t : null;
};

const TIPOS: Record<string, string> = {
  apartment: 'Apartamento', house: 'Casa', commercial: 'Local', lot: 'Lote', farm: 'Finca',
  office: 'Oficina', warehouse: 'Bodega', parking: 'Parqueadero', building: 'Edificio',
  vehicle: 'Vehículo', rights: 'Derechos',
};
const FUENTES: Record<string, string> = {
  davivienda: 'Davivienda', bancolombia: 'Bancolombia', bbva: 'BBVA', aval: 'Grupo Aval',
  fincaraiz: 'FincaRaíz', rematandobienes: 'Rama Judicial de Colombia',
};

const capitalizar = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const tipoLegible = (t: unknown): string => TIPOS[String(t ?? '')] ?? (t ? capitalizar(String(t)) : 'Inmueble');
const fuenteLegible = (s: unknown): string => FUENTES[String(s ?? '')] ?? (capitalizar(String(s ?? '')) || '—');

/**
 * Qué características tiene sentido imprimir según QUÉ es el inmueble.
 *
 * Gemela de la tabla del cliente (`server/public/app.js`), a propósito duplicada:
 * el navegador carga scripts clásicos sin empaquetador, así que no hay forma de
 * compartir el módulo. Si una cambia, la otra también — son la misma decisión.
 *
 *  · construccion → antigüedad y piso: hablan de algo edificado.
 *  · habitaciones → alcobas. Un local no las tiene; sus baños sí son reales.
 */
export const MODULOS_TODOS = { habitaciones: true, banos: true, parqueaderos: true, construccion: true };
const MODULOS_POR_TIPO: Record<string, typeof MODULOS_TODOS> = {
  lot: { habitaciones: false, banos: false, parqueaderos: false, construccion: false },
  parking: { habitaciones: false, banos: false, parqueaderos: false, construccion: false },
  rights: { habitaciones: false, banos: false, parqueaderos: false, construccion: false },
  vehicle: { habitaciones: false, banos: false, parqueaderos: false, construccion: false },
  commercial: { habitaciones: false, banos: true, parqueaderos: true, construccion: true },
  office: { habitaciones: false, banos: true, parqueaderos: true, construccion: true },
  warehouse: { habitaciones: false, banos: true, parqueaderos: true, construccion: true },
};
export const modulosDeTipo = (tipo: unknown): typeof MODULOS_TODOS =>
  MODULOS_POR_TIPO[String(tipo ?? '')] ?? MODULOS_TODOS;

/** Criterios de comparación que significan algo para este tipo de inmueble. */
export function criteriosDelTipo(criterios: string[], tipo: unknown): string[] {
  const mod = modulosDeTipo(tipo);
  if (mod.habitaciones && mod.parqueaderos) return criterios;
  return criterios.filter((c) => {
    const t = c.toLowerCase();
    if (!mod.habitaciones && t.includes('habitacion')) return false;
    if (!mod.parqueaderos && t.includes('parqueadero')) return false;
    return true;
  });
}

/**
 * Traduce una fila de la base a los datos del reporte.
 *
 * RECIBE LA FILA YA REDACTADA por `server/acceso.ts`, no la cruda. Es una
 * decisión estructural, no una comodidad: si el reporte leyera la fila original,
 * bastaría un descuido futuro (una rama nueva que entregue reportes parciales)
 * para que dirección, enlace y contacto salieran por esta puerta después de que
 * el muro los quitó de la otra. Sobre una fila redactada esos campos ya vienen en
 * `null` y el reporte no tiene de dónde sacarlos.
 */
export function datosDeInmueble(args: {
  kind: 'portal' | 'banco' | 'remate';
  fila: Record<string, any>;
  comparables: ComparablesReporte | null;
  arriendo: ArriendoReporte | null;
  plan: 'free' | 'suscrito';
  generadoEn?: Date;
}): DatosReporte {
  const { kind, fila, comparables, arriendo, plan } = args;
  const f = (fila.features ?? {}) as Record<string, any>;
  const esRemate = kind === 'remate';
  const tipo = esRemate ? fila.property_type : fila.type;

  const caracteristicas: Array<{ etiqueta: string; valor: string }> = [];
  const anotar = (etiqueta: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && String(valor).trim() !== '') {
      caracteristicas.push({ etiqueta, valor: String(valor) });
    }
  };
  anotar('Tipo', tipoLegible(tipo));
  const area = numero(fila.area_m2) ?? numero(f.area_m2) ?? numero(f.area);
  anotar('Área', area != null ? `${area} m²` : null);
  // El reporte es la misma ficha en papel, así que hereda la misma regla: no se
  // imprime lo que el tipo de inmueble no puede tener. En un lote, «Habitaciones:
  // 0 · Garajes: 0 · Antigüedad: 1 a 8 años» no describe nada — son los valores por
  // defecto del portal— y en un documento que el usuario se lleva a una reunión eso
  // pesa más que en pantalla.
  const mod = modulosDeTipo(tipo);
  if (mod.habitaciones) anotar('Habitaciones', numero(f.bedrooms));
  if (mod.banos) anotar('Baños', numero(f.bathrooms));
  if (mod.parqueaderos) anotar('Garajes', numero(f.garages));
  anotar('Estrato', numero(f.stratum));
  if (mod.construccion) anotar('Piso', numero(f.floor));
  if (mod.construccion) anotar('Antigüedad', texto(f.antiguedad));
  anotar('Administración mensual', numero(f.administracion) != null ? cop(numero(f.administracion)) : null);

  // Índice CRECE: la clasificación guardada manda; la desviación se deriva del
  // índice si está, porque es el único sitio donde vive el número exacto.
  const clase = clasePorTier(fila.crece_tier);
  const indice = numero(fila.crece_index);
  const crece = clase
    ? {
      lectura: clase.lectura,
      desviacion: indice != null ? desviacionTexto(indice) : null,
      estrellas: clase.estrellas,
    }
    : null;

  // El descuento del remate no es el mismo concepto que el del portal: sale de
  // comparar postura contra avalúo judicial, no contra la mediana de la zona.
  const avaluo = numero(fila.appraisal_value);
  const postura = numero(fila.minimum_bid);
  const descuentoRemate = avaluo && postura && avaluo > 0 ? (1 - postura / avaluo) * 100 : null;

  return {
    kind,
    id: String(fila.id ?? ''),
    titulo: `${tipoLegible(tipo)} en ${capitalizar(String(fila.city ?? ''))}`,
    ciudad: capitalizar(String(fila.city ?? '')),
    zona: texto(fila.zone) ?? texto(f.neighborhood),
    departamento: texto(fila.department) ? capitalizar(String(fila.department)) : null,
    fuente: fuenteLegible(fila.source),
    precio: numero(fila.price),
    precioPorM2: numero(fila.price_per_m2),
    descuentoPct: esRemate ? descuentoRemate : numero(fila.discount_pct),
    crece,
    caracteristicas,
    // Mismo criterio que las características: no se imprime como criterio de
    // comparación algo que el tipo de inmueble no puede tener. «Sin parqueadero»
    // bajo un lote afirma que comparamos terrenos por su garaje.
    comparables: comparables
      ? { ...comparables, criterios: criteriosDelTipo(comparables.criterios, tipo) }
      : null,
    arriendo,
    remate: esRemate
      ? {
        avaluo,
        posturaMinima: postura,
        posturaPct: numero(fila.minimum_bid_pct),
        fechaAudiencia: texto(fila.auction_date),
        horaAudiencia: texto(fila.auction_time),
        modalidad: texto(fila.auction_mode) ? capitalizar(String(fila.auction_mode)) : null,
        juzgado: texto(fila.court),
        radicado: texto(fila.case_number),
        demandante: texto(fila.plaintiff),
        matricula: texto(fila.matricula_inmobiliaria),
        depositoPct: numero(fila.deposit_pct),
        cuotaParte: numero(fila.cuota_parte),
      }
      : null,
    direccion: texto(fila.address),
    enlace: urlSegura(fila.source_url),
    contacto: texto(f.contacto) ?? texto(f.phone) ?? texto(f.email) ?? texto(fila.court_email),
    generadoEn: args.generadoEn ?? new Date(),
    plan,
  };
}

// ─────────────────────────────── Composición ───────────────────────────────

const fila = (etiqueta: string, valor: string): string =>
  `<div class="fila"><dt>${escaparHtml(etiqueta)}</dt><dd>${valor}</dd></div>`;

const seccion = (titulo: string, cuerpo: string): string =>
  cuerpo ? `<section><h2>${escaparHtml(titulo)}</h2>${cuerpo}</section>` : '';

function bloqueComparables(c: ComparablesReporte | null): string {
  if (!c || !c.n) {
    return `<p class="nota">No hubo suficientes avisos comparables publicados en la zona para estimar
      un precio de mercado fiable. Suele pasar con lotes, bodegas y municipios pequeños: en esos casos
      la valoración necesita un avalúo en campo.</p>`;
  }
  const chips = c.criterios.length
    ? `<ul class="chips">${c.criterios.map((x) => `<li>${escaparHtml(x)}</li>`).join('')}</ul>`
    : '';
  // Los avisos «Confianza baja» que iban aquí arriba se retiraron por decisión
  // del cliente, igual que en pantalla. Los dos hechos que declaraban —el ámbito
  // de la comparación y si los tipos coincidían— siguen en la tabla de abajo, sin
  // el rótulo de alarma.
  return `<dl class="datos">
      ${fila('Comparables usados', String(c.n))}
      ${/* «Nivel de confianza» se retiró por decisión del cliente: en un reporte se
            lee como una advertencia sobre el propio dato que lo acompaña. Lo que
            sostiene la conclusión son los comparables y el ámbito, que sí están. */ ''}
      ${c.alcance ? fila('Ámbito de comparación', escaparHtml(capitalizar(c.alcance))) : ''}
      ${fila('Tipo de los comparables', c.mismoTipo ? 'Mismo tipo de inmueble' : 'Tipos mezclados')}
      ${c.medianaPpm2 != null ? fila('Precio medio de comparables por m²', cop(c.medianaPpm2)) : ''}
      ${c.medianaTotal != null ? fila('Precio medio de comparables', cop(c.medianaTotal)) : ''}
    </dl>
    ${chips}
    <p class="nota">Los comparables son precios de OFERTA publicados en FincaRaíz, no ventas cerradas.
</p>`;
}

function bloqueArriendo(a: ArriendoReporte | null): string {
  if (!a || a.canonMediano == null) return '';
  return `<dl class="datos">
      ${fila('Arrendamiento mensual estimado', cop(a.canonMediano))}
      ${a.rangoBajo != null && a.rangoAlto != null ? fila('Rango central', `${cop(a.rangoBajo)} – ${cop(a.rangoAlto)}`) : ''}
      ${a.canonPorM2 != null ? fila('Arrendamiento por m²', cop(a.canonPorM2)) : ''}
      ${fila('Avisos de arriendo comparados', String(a.n))}
      ${/* También aquí fuera: se retiró del respaldo de la conclusión por decisión del
            cliente y dejarlo solo en el arriendo sería incoherente. Lo que sostiene la
            estimación —cuántos avisos y en qué ámbito— sigue arriba. */ ''}
      ${a.alcance ? fila('Ámbito de comparación', escaparHtml(capitalizar(a.alcance))) : ''}
    </dl>
    <p class="nota">Estimación construida con ofertas de arriendo activas, no con contratos firmados.
    El valor mensual del arriendo publicado puede incluir o no la cuota de administración.</p>`;
}

/**
 * Bloque de remate.
 *
 * El aviso de riesgo jurídico NO es opcional ni depende de que el aviso tenga
 * banderas: un remate es una compra en subasta con un proceso judicial detrás, y
 * el reporte es el documento que el usuario se lleva. Va siempre.
 */
function bloqueRemate(r: RemateReporte | null): string {
  if (!r) return '';
  const cuota = r.cuotaParte != null && r.cuotaParte !== 100
    ? `<p class="alerta"><strong>Se remata solo el ${escaparHtml(r.cuotaParte)}% del bien.</strong>
       No se adjudica el dominio completo: quien remate quedaría como copropietario del resto.
       Lee el aviso del juzgado con detalle antes de ofertar.</p>`
    : '';
  return `${cuota}
    <dl class="datos">
      ${fila('Avalúo', cop(r.avaluo))}
      ${fila('Postura mínima', cop(r.posturaMinima))}
      ${r.posturaPct != null ? fila('Postura sobre el avalúo', pct(r.posturaPct, 1)) : ''}
      ${fila('Fecha de audiencia', escaparHtml(fechaCorta(r.fechaAudiencia)))}
      ${r.horaAudiencia ? fila('Hora', escaparHtml(r.horaAudiencia)) : ''}
      ${r.modalidad ? fila('Modalidad', escaparHtml(r.modalidad)) : ''}
      ${r.juzgado ? fila('Juzgado', escaparHtml(r.juzgado)) : ''}
      ${r.radicado ? fila('Radicado del proceso', escaparHtml(r.radicado)) : ''}
      ${r.demandante ? fila('Demandante', escaparHtml(r.demandante)) : ''}
      ${r.matricula ? fila('Matrícula inmobiliaria', escaparHtml(r.matricula)) : ''}
      ${r.depositoPct != null ? fila('Depósito para participar', pct(r.depositoPct, 0)) : ''}
    </dl>
    <p class="alerta"><strong>Aviso de riesgo jurídico.</strong> Comprar en remate no es comprar en el
    mercado abierto: el inmueble puede estar ocupado o arrendado y la entrega material puede demorar,
    pueden existir embargos, hipotecas o servidumbres no visibles en el aviso, y la postura mínima no es
    el precio final —hay que sumar el depósito, los gastos de registro y el auto de adjudicación—.
    Antes de ofertar se necesita estudio de títulos y asesoría legal propia. Este reporte no la sustituye.</p>`;
}

/**
 * Estilos del reporte.
 *
 * Embebidos porque el archivo tiene que abrirse solo, sin servidor ni red. La
 * parte de `@media print` es la que hace el trabajo real: quita fondos y sombras
 * (que en impresión se comen el tóner y bajan el contraste del texto), fija el
 * tamaño en puntos, y sobre todo impide que una sección se parta entre dos hojas
 * —un aviso de riesgo cortado a la mitad es un aviso que no se lee—.
 */
const ESTILOS = `
:root { --tinta:#23132b; --suave:#6b7280; --linea:#e3d4ee; --acento:#613174; --alerta:#8a5a00; }
* { box-sizing:border-box; }
body { margin:0; padding:32px 20px 56px; background:#f7f4f9; color:var(--tinta);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:15px; line-height:1.55; }
main { max-width:820px; margin:0 auto; background:#fff; border:1px solid var(--linea);
  border-radius:14px; padding:34px 34px 40px; }
header { border-bottom:2px solid var(--acento); padding-bottom:18px; margin-bottom:26px; }
.marca { font-size:.72rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--acento); }
h1 { margin:6px 0 4px; font-size:1.6rem; line-height:1.2; }
.ubic { color:var(--suave); font-size:.92rem; margin:0; }
.destacados { display:flex; flex-wrap:wrap; gap:14px; margin:22px 0 4px; }
.destacado { flex:1 1 170px; border:1px solid var(--linea); border-radius:11px; padding:12px 14px; background:#faf7fb; }
.destacado span { display:block; font-size:.68rem; font-weight:800; letter-spacing:.05em;
  text-transform:uppercase; color:var(--suave); }
.destacado strong { display:block; margin-top:3px; font-size:1.12rem; }
.destacado.bueno strong { color:#15803d; }
section { margin-top:26px; }
h2 { font-size:1.02rem; margin:0 0 10px; padding-bottom:6px; border-bottom:1px solid var(--linea); }
dl.datos { margin:0; }
.fila { display:flex; gap:14px; justify-content:space-between; align-items:baseline;
  padding:7px 0; border-bottom:1px dashed var(--linea); }
.fila:last-child { border-bottom:none; }
dt { color:var(--suave); font-size:.86rem; margin:0; }
dd { margin:0; font-weight:700; text-align:right; overflow-wrap:anywhere; }
ul.chips { list-style:none; display:flex; flex-wrap:wrap; gap:6px; margin:12px 0 0; padding:0; }
ul.chips li { border:1px solid var(--linea); border-radius:999px; padding:3px 11px;
  font-size:.76rem; color:var(--acento); background:#faf7fb; }
.nota { color:var(--suave); font-size:.8rem; line-height:1.5; margin:12px 0 0; }
.alerta { border-left:4px solid #d9a441; background:#fffaf0; color:var(--alerta);
  padding:11px 14px; border-radius:0 8px 8px 0; font-size:.85rem; line-height:1.55; margin:14px 0 0; }
.alerta strong { color:#7a4d00; }
footer { margin-top:32px; padding-top:16px; border-top:1px solid var(--linea);
  color:var(--suave); font-size:.78rem; line-height:1.55; }
a { color:var(--acento); overflow-wrap:anywhere; }
@media print {
  @page { margin:14mm; }
  body { background:#fff; padding:0; font-size:10.5pt; }
  main { border:none; border-radius:0; padding:0; max-width:none; }
  .destacado, ul.chips li { background:#fff; }
  /* Nada de lo que sostiene una conclusión puede quedar partido entre dos hojas. */
  section, .destacado, .alerta, .fila { break-inside:avoid; page-break-inside:avoid; }
  h2 { break-after:avoid; page-break-after:avoid; }
  /* El enlace se imprime como texto porque su etiqueta ES la URL completa: añadir
     el attr(href) detrás, como suele hacerse en impresión, aquí solo la duplicaría. */
  a { color:var(--tinta); text-decoration:underline; }
}`;

/**
 * Arma el HTML completo del reporte.
 *
 * Función pura: recibe datos ya resueltos y devuelve texto. Todo lo que viene de
 * la base pasa por `escaparHtml`. No lleva ni un `<script>` —ni siquiera para
 * imprimir—: el archivo acaba en el disco de otra persona y no tiene por qué
 * ejecutar nada para leerse.
 */
export function construirReporte(datos: DatosReporte): string {
  const ubicacion = [datos.zona, datos.ciudad, datos.departamento]
    .filter((x) => x && String(x).trim())
    .map((x) => escaparHtml(x))
    .join(', ');

  const esRemate = datos.kind === 'remate';
  const precioPrincipal = esRemate ? datos.remate?.posturaMinima ?? null : datos.precio;
  const etiquetaPrecio = esRemate ? 'Postura mínima' : 'Precio';
  // El descuento de un remate NO es el mismo concepto: sale de comparar la postura
  // El reporte usa el MISMO vocabulario que la ficha: «precio medio de
  // comparables», no «mediana». Es el archivo que la persona le enseña a un
  // tercero, así que es donde peor sienta encontrar la palabra de estadístico
  // que la ficha acababa de retirar — el mismo número con dos nombres hace dudar
  // de los dos. Por dentro se sigue calculando la mediana, que es lo correcto
  // con precios de oferta porque resiste los atípicos.
  // contra el avalúo del juzgado, no contra la mediana de la zona. Etiquetarlos
  // igual haría creer que el remate está un 30% bajo el mercado del barrio.
  const etiquetaDescuento = esRemate ? 'Frente al avalúo judicial' : 'Frente al mercado de su zona';

  const destacados = [
    `<div class="destacado"><span>${etiquetaPrecio}</span><strong>${cop(precioPrincipal)}</strong></div>`,
    datos.precioPorM2 != null
      ? `<div class="destacado"><span>Precio por m²</span><strong>${cop(datos.precioPorM2)}</strong></div>`
      : '',
    datos.descuentoPct != null
      ? `<div class="destacado${datos.descuentoPct > 0 ? ' bueno' : ''}"><span>${etiquetaDescuento}</span><strong>${
        datos.descuentoPct >= 0 ? '−' : '+'}${Math.abs(Math.round(datos.descuentoPct))}%</strong></div>`
      : '',
    datos.crece
      ? `<div class="destacado"><span>Índice CRECE</span><strong>${escaparHtml(datos.crece.lectura)}</strong></div>`
      : '',
  ].filter(Boolean).join('');

  const caracteristicas = datos.caracteristicas.length
    ? `<dl class="datos">${datos.caracteristicas
      .map((c) => fila(c.etiqueta, escaparHtml(c.valor)))
      .join('')}</dl>`
    : '';

  const enlace = urlSegura(datos.enlace);
  const identificacion = [
    fila('Fuente', escaparHtml(datos.fuente)),
    datos.direccion ? fila('Dirección', escaparHtml(datos.direccion)) : '',
    datos.contacto ? fila('Contacto de la fuente', escaparHtml(datos.contacto)) : '',
    enlace ? fila('Publicación original', `<a href="${escaparHtml(enlace)}">${escaparHtml(enlace)}</a>`) : '',
    fila('Identificador interno', escaparHtml(datos.id)),
  ].filter(Boolean).join('');

  const conclusion = datos.crece
    ? `<p class="nota" style="font-size:.88rem;color:var(--tinta)">Categoría <strong>${escaparHtml(datos.crece.lectura)}</strong>${
      datos.crece.desviacion ? `: su precio por m² está ${escaparHtml(datos.crece.desviacion)} del precio medio de los inmuebles comparables de su zona` : ''
    }. El Índice CRECE divide el precio por m² del inmueble entre el precio medio de su grupo comparable; por debajo de 1 está más barato que su zona.</p>`
    : '';

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esRemate ? 'Reporte de la subasta' : 'Reporte'} · ${escaparHtml(datos.titulo)}</title>
<style>${ESTILOS}</style>
<main>
  <header>
    <p class="marca">Radar de Oportunidades · Sistema CRECE${esRemate ? ' · Reporte de la subasta' : ''}</p>
    <h1>${escaparHtml(datos.titulo)}</h1>
    <p class="ubic">${ubicacion || '—'}</p>
  </header>

  <div class="destacados">${destacados}</div>
  ${conclusion}

  ${/* En un REMATE, los datos del proceso van PRIMERO. Andrés fue explícito viendo
        este reporte: «lo que me interesa son los datos de la subasta. Esto sí me
        interesa. Más que la parte de arriba», y «este reporte descargable debería
        ser de esto». Tiene sentido: quien descarga el reporte de un remate lo lleva
        al juzgado o a su abogado, y lo que necesita ahí es el radicado, el juzgado y
        las fechas, no la mediana del barrio.

        En un inmueble de portal o de banco el orden se queda como estaba: ahí lo que
        se lleva es la comparación de precio. */ ''}
  ${esRemate ? seccion('Datos de la subasta', bloqueRemate(datos.remate)) : ''}
  ${seccion('Características', caracteristicas)}
  ${seccion('Respaldo de la conclusión', bloqueComparables(datos.comparables))}
  ${seccion('Estimación del valor de arrendamiento', bloqueArriendo(datos.arriendo))}
  ${seccion('Identificación del inmueble', identificacion)}

  <footer>
    <p>Reporte generado el ${escaparHtml(fechaLegible(datos.generadoEn))} (hora de Colombia) con el plan
    ${datos.plan === 'suscrito' ? 'de pago' : 'gratuito'}.</p>
    <p><strong>Información orientativa.</strong> Los datos provienen de publicaciones de terceros —portales,
    bancos y juzgados— recogidas automáticamente, y pueden estar desactualizadas o contener errores de la
    fuente. Las cifras de mercado son estimaciones estadísticas sobre precios de oferta, no avalúos ni
    ofertas de compra. Verifica todo con la fuente original antes de tomar una decisión: este documento no
    sustituye un avalúo, un estudio de títulos ni asesoría profesional.</p>
  </footer>
</main>`;
}

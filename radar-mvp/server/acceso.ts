/**
 * Control de acceso a las fichas (plan Free vs. suscripción).
 *
 * Regla de la Sección 6 de la spec: el acceso NO se mide por cantidad de fichas
 * al mes, se mide por la CATEGORÍA del Índice CRECE. Todo es gratis y sin límite
 * salvo las dos categorías de oportunidad real (Oportunidad y Oportunidad Fuerte),
 * que son el producto que se vende.
 *
 * Los remates no siguen esa regla: usan su propia matriz (origen del demandante ×
 * descuento), porque al ser subastas casi todos darían "oportunidad" y clasificar
 * por estrellas no discriminaría nada dentro de ese módulo.
 *
 * POR QUÉ AQUÍ Y NO EN EL NAVEGADOR: el muro anterior se dibujaba en el cliente,
 * así que la dirección, la descripción y el enlace a la fuente viajaban igual en
 * la respuesta y bastaba abrir las herramientas del navegador para leerlos. Lo que
 * el usuario no ha pagado no debe salir del servidor.
 */
import { clasificar, type CreceTier } from '../engine/crece.js';
import { accesoRemate, origenDemandante, requiereSuscripcionRemate } from '../engine/remates-legal.js';

export type Plan = 'anonimo' | 'free' | 'suscrito';

/** Plan del usuario. Sin sesión es anónimo; la suscripción se marca en su metadata. */
export function planDe(user: { plan?: string | null } | null | undefined): Plan {
  if (!user) return 'anonimo';
  return ['suscrito', 'pro', 'premium'].includes(String(user.plan ?? '').toLowerCase()) ? 'suscrito' : 'free';
}

export interface Acceso {
  /** ¿Se entrega la ficha completa? */
  completa: boolean;
  /** Motivo del bloqueo, para que la interfaz explique qué se está ofreciendo. */
  motivo: 'oportunidad' | 'remate' | null;
  /** Aviso de riesgo legal (remates particulares en el tramo gancho). */
  avisoRiesgo: boolean;
  /**
   * Qué le falta a ESTE usuario para abrirla. Es lo que decide el texto del sello:
   * a un anónimo se le pide cuenta, a un registrado con cupo se le ofrece gastar
   * una, y a uno sin cupo se le ofrece el plan. Antes los tres veían
   * "Desbloquear con suscripción", que a un anónimo le pedía pagar cuando en
   * realidad le bastaba registrarse.
   */
  requiere?: 'registro' | 'cupo' | 'suscripcion';
}

const LIBRE: Acceso = { completa: true, motivo: null, avisoRiesgo: false };

/**
 * Qué se le pide a este plan para abrir una ficha de pago.
 *
 * `desbloqueada` significa que la ficha ya se abrió con el cupo de este mes.
 */
function bloqueo(
  plan: Plan,
  motivo: 'oportunidad' | 'remate',
  cupo?: { desbloqueada?: boolean; restantes?: number | null },
): Acceso {
  if (plan === 'anonimo') return { completa: false, motivo, avisoRiesgo: false, requiere: 'registro' };
  if (cupo?.desbloqueada) return LIBRE;
  const quedan = cupo?.restantes ?? 0;
  return {
    completa: false,
    motivo,
    avisoRiesgo: false,
    requiere: quedan > 0 ? 'cupo' : 'suscripcion',
  };
}

/** Acceso a un inmueble de portal o banco, según su categoría CRECE. */
export function accesoInmueble(
  tier: string | null | undefined,
  plan: Plan,
  cupo?: { desbloqueada?: boolean; restantes?: number | null },
): Acceso {
  if (plan === 'suscrito') return LIBRE;
  if (!tier) return LIBRE; // sin clasificar no es contenido de pago
  const c = clasificar(tierIndiceRef(tier as CreceTier));
  return c.requiereSuscripcion ? bloqueo(plan, 'oportunidad', cupo) : LIBRE;
}

/**
 * Índice representativo de una categoría, para poder reusar `clasificar()` como
 * fuente única y no duplicar aquí la lista de categorías de pago.
 */
function tierIndiceRef(tier: CreceTier): number {
  const ref: Record<CreceTier, number> = {
    oportunidad_fuerte: 0.70, oportunidad: 0.78, interesante: 0.85, abajo_mercado: 0.92,
    mercado_borde_bajo: 0.95, mercado: 1.00, limite_superior: 1.05, arriba_mercado: 1.08,
    sobreprecio: 1.15, sobrevalorado: 1.25, fuera_mercado: 1.40,
  };
  return ref[tier] ?? 1.0;
}

/** Acceso a un remate, por la matriz origen del demandante × descuento. */
export function accesoRemateFicha(
  row: { origen_demandante?: string | null; appraisal_value?: number | null; minimum_bid?: number | null },
  plan: Plan,
  cupo?: { desbloqueada?: boolean; restantes?: number | null },
): Acceso {
  if (plan === 'suscrito') return LIBRE;
  const av = Number(row.appraisal_value ?? 0);
  const bid = Number(row.minimum_bid ?? 0);
  const descuento = av > 0 && bid > 0 ? (1 - bid / av) * 100 : 0;
  const origen = row.origen_demandante === 'bancario' ? 'bancario' : origenDemandante(false);
  const a = accesoRemate(origen, descuento);
  if (requiereSuscripcionRemate(a)) return bloqueo(plan, 'remate', cupo);
  return { completa: true, motivo: null, avisoRiesgo: a === 'gratis_con_aviso' };
}

/** Cuántas fotos se entregan en una ficha bloqueada (la spec dice 3). */
const FOTOS_BLOQUEADA = 3;

/**
 * Columnas del remate que NO pueden salir de una ficha bloqueada.
 *
 * El aviso judicial es texto libre copiado del juzgado, y ahí dentro va el nombre
 * y la cédula del demandado, y el nombre, el correo y el celular del secuestre —
 * datos personales de terceros que nadie ha pedido publicar. Anular solo
 * `court_email` era decorativo: el mismo correo aparecía dentro de `trustee`, y
 * medido sobre las fichas bloqueadas de un listado real, 8 de 8 filtraban correo
 * y celular.
 *
 * Se conserva a propósito lo que sostiene la oferta comercial y la alerta
 * jurídica: ciudad, tipo, postura, avalúo, fecha de audiencia, `cuota_parte` y
 * `origen_demandante` —que es una categoría, no una persona—.
 */
const CAMPOS_REMATE_RESERVADOS = [
  'defendant', 'plaintiff', 'trustee',
  'court', 'court_address', 'court_email', 'case_number',
  'matricula_inmobiliaria', 'property_type_raw',
] as const;

/**
 * Claves de `features` que no salen en una ficha bloqueada.
 *
 * Es un patrón y no una lista cerrada porque la lista cerrada ya falló: los
 * scrapers fueron añadiendo `address_raw`, `pdf_url`, `pdf_page` y
 * `fincaraiz_url`, y como nadie actualizó el filtro, la dirección y el enlace a la
 * fuente seguían viajando por dentro de `features` mientras las columnas
 * `address` y `source_url` se anulaban por fuera. Un campo nuevo que se llame como
 * lo que oculta queda cubierto desde el día uno.
 */
const CLAVE_FEATURE_RESERVADA =
  /url|address|direccion|ubicacion|link|contacto|phone|telefono|tel$|email|correo|_raw$|^code$|matricula|catastral|owner|propietario/i;

/** …salvo las fotos, que la ficha bloqueada sí enseña (recortadas). */
const CLAVE_FEATURE_PERMITIDA = new Set(['image_url', 'images', 'photos', 'thumbnail']);

/**
 * Quita de la fila lo que el plan no cubre.
 *
 * Se conserva a propósito lo que sostiene la oferta comercial: precio, área,
 * porcentaje de descuento, ciudad y unas pocas fotos. Se retira lo que permitiría
 * saltarse la suscripción y llegar al inmueble por fuera: dirección exacta,
 * descripción, enlace y datos de contacto de la fuente.
 */
export function redactar<T extends Record<string, any>>(row: T, acceso: Acceso): T {
  if (acceso.completa) return { ...row, _acceso: acceso };
  const f = { ...((row.features ?? {}) as Record<string, any>) };
  // Fotos: solo las primeras, sin el resto de la galería.
  if (Array.isArray(f.images)) f.images = f.images.slice(0, FOTOS_BLOQUEADA);
  if (Array.isArray(f.photos)) f.photos = f.photos.slice(0, FOTOS_BLOQUEADA);
  delete f.description;
  delete f.lat; delete f.lng;          // sin ubicación exacta
  delete f.copia_publicacion;          // el aviso íntegro es contenido de pago
  delete f.observaciones;              // texto libre del boletín del banco
  delete f.ai_analysis;                // el análisis es justo lo que se vende
  delete f.pdf_page;                   // la página del boletín señala la ficha original
  for (const clave of Object.keys(f)) {
    if (!CLAVE_FEATURE_PERMITIDA.has(clave) && CLAVE_FEATURE_RESERVADA.test(clave)) delete f[clave];
  }

  const reservados: Record<string, null> = {};
  for (const campo of CAMPOS_REMATE_RESERVADOS) {
    if (campo in row) reservados[campo] = null;
  }

  return {
    ...row,
    features: f,
    address: null,
    description: null,
    source_url: null,                  // sin enlace a la fuente original
    // El identificador de la fuente reconstruye el enlace por sí solo: en los
    // remates ES el slug de la URL ("inmueble-tipo-casa-en-urbanizacion-panorama-ii-pereira")
    // y en los bancos el código del boletín. Anular `source_url` y dejar este
    // sería cerrar la puerta y dejar la llave puesta. El cliente no lo usa.
    source_id: null,
    ...reservados,
    _acceso: acceso,
    _bloqueada: true,
  } as T;
}

export interface ResumenBloqueo {
  bloqueadas: number;
  visibles: number;
  /** Descuento medio de lo bloqueado, redondeado. `null` si no hay dato. */
  descuentoMedioBloqueado: number | null;
  /** Descuento medio de lo que sí puede abrir, para poder comparar. */
  descuentoMedioVisible: number | null;
  mejorDescuentoBloqueado: number | null;
}

/**
 * Qué se está perdiendo quien no ha pagado, en números suyos.
 *
 * Se calcula sobre las filas que la persona tiene delante, no sobre un agregado
 * global: así el aviso habla de SU búsqueda y puede comprobarlo mirando la
 * pantalla. El muro cubre justo las categorías de mayor señal, de modo que la
 * comparación de descuentos no es retórica — en Bancos lo bloqueado promedia
 * ~52% de descuento y lo visible está por encima del precio de mercado.
 */
export function resumenBloqueo(filas: Array<Record<string, any>>): ResumenBloqueo {
  const descuento = (r: Record<string, any>): number | null => {
    // `Number(null)` es 0, no NaN: sin este filtro una ficha SIN descuento contaría
    // como "0% de descuento" y hundiría la media que sostiene el aviso.
    const crudo = r.discount_pct;
    const directo = crudo === null || crudo === undefined || crudo === '' ? NaN : Number(crudo);
    if (Number.isFinite(directo)) return directo;
    const avaluo = Number(r.appraisal_value);
    const postura = Number(r.minimum_bid);
    if (avaluo > 0 && postura > 0) return (1 - postura / avaluo) * 100;
    return null;
  };
  const media = (valores: number[]): number | null =>
    valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : null;

  const bloqueadas = filas.filter((r) => r._bloqueada);
  const visibles = filas.filter((r) => !r._bloqueada);
  const descBloqueadas = bloqueadas.map(descuento).filter((n): n is number => n !== null);
  const descVisibles = visibles.map(descuento).filter((n): n is number => n !== null);

  return {
    bloqueadas: bloqueadas.length,
    visibles: visibles.length,
    descuentoMedioBloqueado: media(descBloqueadas),
    descuentoMedioVisible: media(descVisibles),
    mejorDescuentoBloqueado: descBloqueadas.length ? Math.round(Math.max(...descBloqueadas)) : null,
  };
}

/**
 * Aplica el control a una lista completa de resultados.
 *
 * `desbloqueadas` son los ids que el usuario ya abrió con su cupo de este mes:
 * esas fichas viajan completas también en el listado, o el usuario habría gastado
 * cupo para que la tarjeta siguiera tapada al volver a la lista.
 */
export function redactarLista<T extends Record<string, any>>(
  rows: T[], plan: Plan, tipo: 'inmueble' | 'remate',
  cupo?: { desbloqueadas?: string[]; restantes?: number | null },
): T[] {
  const abiertas = new Set(cupo?.desbloqueadas ?? []);
  return rows.map((r) => {
    const estado = { desbloqueada: abiertas.has(String(r.id)), restantes: cupo?.restantes ?? null };
    return redactar(
      r,
      tipo === 'remate' ? accesoRemateFicha(r, plan, estado) : accesoInmueble(r.crece_tier, plan, estado),
    );
  });
}

/**
 * El mismo control sobre una lista que MEZCLA inmuebles y remates.
 *
 * La portada cruza las tres fuentes en una sola fila, y las dos familias no se
 * clasifican igual (categoría CRECE vs. matriz del remate). Se separan, cada una
 * pasa por `redactarLista` —la única puerta— y se recompone el orden original.
 *
 * Se recompone por `tipo:id` y no por `id` a secas: son dos tablas distintas y
 * casar por identificador suelto es justo la clase de descuido con el que una
 * ficha de pago acabaría saliendo entera.
 */
export function redactarMixta<T extends Record<string, any> & { _kind?: string }>(
  filas: T[], plan: Plan,
  cupo?: { desbloqueadas?: string[]; restantes?: number | null },
): T[] {
  const esRemate = (fila: T) => fila._kind === 'remate';
  const clave = (fila: T) => `${esRemate(fila) ? 'remate' : 'inmueble'}:${String(fila.id)}`;
  const redactadas = new Map<string, T>();
  for (const fila of redactarLista(filas.filter((f) => !esRemate(f)), plan, 'inmueble', cupo)) {
    redactadas.set(clave(fila), fila);
  }
  for (const fila of redactarLista(filas.filter(esRemate), plan, 'remate', cupo)) {
    redactadas.set(clave(fila), fila);
  }
  // Si algo no aparece en el mapa es un fallo de programación, no un caso de
  // negocio: se devuelve la fila REDACTADA al máximo antes que la cruda.
  return filas.map((fila) => redactadas.get(clave(fila))
    ?? (redactar(fila, { completa: false, motivo: 'oportunidad', avisoRiesgo: false, requiere: 'suscripcion' })));
}

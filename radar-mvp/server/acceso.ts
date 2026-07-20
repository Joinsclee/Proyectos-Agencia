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
  return user.plan === 'suscrito' ? 'suscrito' : 'free';
}

export interface Acceso {
  /** ¿Se entrega la ficha completa? */
  completa: boolean;
  /** Motivo del bloqueo, para que la interfaz explique qué se está ofreciendo. */
  motivo: 'oportunidad' | 'remate' | null;
  /** Aviso de riesgo legal (remates particulares en el tramo gancho). */
  avisoRiesgo: boolean;
}

const LIBRE: Acceso = { completa: true, motivo: null, avisoRiesgo: false };

/** Acceso a un inmueble de portal o banco, según su categoría CRECE. */
export function accesoInmueble(tier: string | null | undefined, plan: Plan): Acceso {
  if (plan === 'suscrito') return LIBRE;
  if (!tier) return LIBRE; // sin clasificar no es contenido de pago
  const c = clasificar(tierIndiceRef(tier as CreceTier));
  return c.requiereSuscripcion ? { completa: false, motivo: 'oportunidad', avisoRiesgo: false } : LIBRE;
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
): Acceso {
  if (plan === 'suscrito') return LIBRE;
  const av = Number(row.appraisal_value ?? 0);
  const bid = Number(row.minimum_bid ?? 0);
  const descuento = av > 0 && bid > 0 ? (1 - bid / av) * 100 : 0;
  const origen = row.origen_demandante === 'bancario' ? 'bancario' : origenDemandante(false);
  const a = accesoRemate(origen, descuento);
  if (requiereSuscripcionRemate(a)) return { completa: false, motivo: 'remate', avisoRiesgo: false };
  return { completa: true, motivo: null, avisoRiesgo: a === 'gratis_con_aviso' };
}

/** Cuántas fotos se entregan en una ficha bloqueada (la spec dice 3). */
const FOTOS_BLOQUEADA = 3;

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
  delete f.contacto; delete f.phone; delete f.email;

  return {
    ...row,
    features: f,
    address: null,
    description: null,
    source_url: null,                  // sin enlace a la fuente original
    court_email: null,
    _acceso: acceso,
    _bloqueada: true,
  } as T;
}

/** Aplica el control a una lista completa de resultados. */
export function redactarLista<T extends Record<string, any>>(
  rows: T[], plan: Plan, tipo: 'inmueble' | 'remate',
): T[] {
  return rows.map((r) => redactar(
    r,
    tipo === 'remate' ? accesoRemateFicha(r, plan) : accesoInmueble(r.crece_tier, plan),
  ));
}

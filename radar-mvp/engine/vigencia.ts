/**
 * Reglas de vigencia y frescura del inventario.
 *
 * HU "Control de vigencia y frescura de publicaciones" + HU de frescura de bancos.
 *
 * La antigüedad se mide con la fecha en que el MOTOR vio el inmueble por primera
 * vez, no con la que reporta el portal: FincaRaíz resetea su "Fecha Actualización"
 * cuando el anunciante renueva el aviso, así que un inmueble de hace ocho meses
 * puede presentarse como recién publicado.
 *
 * Y las reglas NO son iguales para todas las fuentes:
 *  - FincaRaíz: se despublica a los 30 días y se descarta a los 90. Un aviso de
 *    portal que lleva un mes sin moverse ya no es una oportunidad fresca.
 *  - Bancos y AVAL: NO se aplican esos plazos. Un activo en dación de pago tarda
 *    meses en venderse sin que eso signifique nada malo; despublicarlo por
 *    antigüedad vaciaría el módulo. Solo sale cuando desaparece de la fuente.
 */

export type EventoVigencia =
  | 'NUEVO' | 'VISTO' | 'PRECIO_ACTUALIZADO' | 'RETIRADO' | 'EXPIRADO_30D' | 'DESCARTADO_90D';

export type EstadoOportunidad = 'activo' | 'expirado_30d' | 'retirado' | 'descartado_90d';

/** Días de gracia antes de dejar de mostrar un aviso de portal. */
export const DIAS_DESPUBLICAR = 30;
/** Días tras los cuales el registro ni siquiera entra a la capa normalizada. */
export const DIAS_DESCARTE = 90;

/** Fuentes cuyo inventario NO caduca por antigüedad (solo por desaparecer). */
const SIN_CADUCIDAD = new Set(['davivienda', 'bancolombia', 'bbva', 'aval']);

/** ¿A esta fuente se le aplican los plazos de 30/90 días? */
export const caducaPorAntiguedad = (source: string | null | undefined): boolean =>
  !!source && !SIN_CADUCIDAD.has(source);

const DIA_MS = 86_400_000;

/** Días transcurridos entre una fecha y ahora. null si no hay fecha. */
export function diasDesde(fecha: string | Date | null | undefined, ahora = new Date()): number | null {
  if (!fecha) return null;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((ahora.getTime() - d.getTime()) / DIA_MS);
}

export interface EntradaVigencia {
  source: string | null;
  /** Primera vez que el motor lo vio (dato propio, autoritativo). */
  first_seen_at: string | Date | null;
  /** Fecha que reporta el portal. Informativa. */
  fecha_publicacion_fuente?: string | Date | null;
  estado?: string | null;
}

export interface ResultadoVigencia {
  estado: EstadoOportunidad;
  evento: EventoVigencia | null;
  motivo: string | null;
}

/**
 * Decide si un inmueble sigue publicable.
 *
 * El descarte a 90 días tiene dos capas, y la segunda existe porque la primera
 * depende de un dato que no siempre llega: si el portal no reporta fecha, o la
 * reporta falseada por una renovación, la fecha propia del motor sigue mandando.
 */
export function evaluarVigencia(e: EntradaVigencia, ahora = new Date()): ResultadoVigencia {
  if (!caducaPorAntiguedad(e.source)) {
    // Activo bancario: solo el evento RETIRADO lo saca, y ese lo emite el scraper
    // cuando el código deja de aparecer en la fuente.
    return { estado: 'activo', evento: null, motivo: null };
  }

  const propios = diasDesde(e.first_seen_at, ahora);
  const fuente = diasDesde(e.fecha_publicacion_fuente, ahora);

  // Capa 1 — el propio portal dice que el aviso es viejo.
  if (fuente != null && fuente > DIAS_DESCARTE) {
    return { estado: 'descartado_90d', evento: 'DESCARTADO_90D', motivo: `el portal lo publicó hace ${fuente} días` };
  }
  // Capa 2 — respaldo con el dato del motor, que no se puede resetear.
  if (propios != null && propios > DIAS_DESCARTE) {
    return { estado: 'descartado_90d', evento: 'DESCARTADO_90D', motivo: `detectado hace ${propios} días sin cambios de precio` };
  }
  if (propios != null && propios > DIAS_DESPUBLICAR) {
    return { estado: 'expirado_30d', evento: 'EXPIRADO_30D', motivo: `detectado hace ${propios} días` };
  }
  return { estado: 'activo', evento: null, motivo: null };
}

/**
 * Texto de frescura para la ficha.
 *
 * En bancos se comunica cuándo el motor VERIFICÓ que el activo sigue publicado,
 * nunca su antigüedad: "Verificado hace 2 días" es cierto y tranquiliza;
 * "Publicado hace 2 meses" es igual de cierto y espanta, aunque el inmueble esté
 * perfectamente disponible.
 */
export function textoFrescura(source: string | null | undefined, ultimaVista: string | Date | null): string | null {
  const d = diasDesde(ultimaVista);
  if (d == null) return null;
  const cuando = d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
  return caducaPorAntiguedad(source) ? `Visto ${cuando}` : `Verificado ${cuando}`;
}

/**
 * Cupo mensual del plan Explorador (free).
 *
 * Hasta ahora registrarse no servía de nada: `server/acceso.ts` solo abría el
 * contenido para `suscrito`, así que una cuenta gratuita veía exactamente lo
 * mismo que un visitante anónimo. El registro pedía algo y no devolvía nada.
 *
 * El cupo es lo que separa los tres modos:
 *   · anónimo   → 0 fichas de oportunidad
 *   · free      → CUPO_MENSUAL_FREE fichas por mes calendario
 *   · suscrito  → sin límite
 *
 * Una ficha desbloqueada NO vuelve a consumir cupo durante el mes: quien abre la
 * misma ficha tres veces gastó una, no tres. Volver sobre algo que ya se miró es
 * el comportamiento normal de quien está evaluando una compra, y cobrárselo haría
 * que el usuario evitara abrir fichas por miedo a gastar, que es lo contrario de
 * lo que el producto necesita.
 *
 * DÓNDE VIVE: en `app_metadata`, junto al resto de la autorización
 * (`server/account-metadata.ts`). Nunca en `user_metadata` ni en el navegador: el
 * titular reescribe ambos a voluntad, y un límite que el limitado puede borrar no
 * es un límite.
 */
import { z } from 'zod';

/** Fichas completas que un registrado puede abrir por mes calendario. */
export const CUPO_MENSUAL_FREE = 20;

/** Tope de ids guardados, para que la metadata no crezca sin control. */
const MAX_IDS = 200;

export const CupoSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  desbloqueadas: z.array(z.string().min(1).max(100)).max(MAX_IDS),
});

export type Cupo = z.infer<typeof CupoSchema>;

export interface EstadoCupo {
  /** Ilimitado para suscritos; 0 para anónimos. */
  limite: number | null;
  usadas: number;
  restantes: number | null;
  periodo: string;
  ilimitado: boolean;
  /** Días hasta que el cupo vuelva a empezar. Lo necesita el aviso de cupo agotado. */
  diasParaReinicio?: number;
}

/** Mes calendario en hora de Colombia, que es donde vive el usuario. */
export function periodoDe(ahora: Date = new Date()): string {
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60_000);
  return `${bogota.getUTCFullYear()}-${String(bogota.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Cupo vigente. Si el guardado es de un mes anterior se devuelve vacío: el
 * reinicio ocurre al leer, sin ningún proceso programado que pueda no correr.
 */
export function leerCupo(
  metadata: Record<string, unknown> | null | undefined,
  ahora: Date = new Date(),
): Cupo {
  const periodo = periodoDe(ahora);
  const parsed = CupoSchema.safeParse(metadata?.unlock_quota);
  if (!parsed.success || parsed.data.periodo !== periodo) return { periodo, desbloqueadas: [] };
  return parsed.data;
}

export function yaDesbloqueada(cupo: Cupo, id: string): boolean {
  return cupo.desbloqueadas.includes(id);
}

export function estadoCupo(
  cupo: Cupo,
  plan: 'anonimo' | 'free' | 'suscrito',
): EstadoCupo {
  if (plan === 'suscrito') {
    return { limite: null, usadas: 0, restantes: null, periodo: cupo.periodo, ilimitado: true };
  }
  const limite = plan === 'free' ? CUPO_MENSUAL_FREE : 0;
  const usadas = Math.min(cupo.desbloqueadas.length, limite);
  return {
    limite,
    usadas,
    restantes: Math.max(0, limite - usadas),
    periodo: cupo.periodo,
    ilimitado: false,
    diasParaReinicio: diasParaReinicio(),
  };
}

/**
 * Cuántos días faltan para que el cupo vuelva a empezar.
 *
 * Se cuenta en hora de Colombia, igual que `periodoDe`: el cupo se reinicia el
 * día 1 a medianoche de Bogotá, y contar en UTC daría un día de más durante cinco
 * horas cada noche. Es el número que ve alguien a quien acaban de decirle que se
 * quedó sin fichas, así que tiene que ser el correcto — «vuelve en 3 días» y que
 * vuelva en 4 es de las cosas que hacen desconfiar de todo lo demás.
 *
 * Siempre devuelve al menos 1: el último día del mes faltan horas, no cero días,
 * y «se reinicia en 0 días» no significa nada para nadie.
 */
export function diasParaReinicio(ahora: Date = new Date()): number {
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60_000);
  const finDeMes = new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth() + 1, 1));
  return Math.max(1, Math.ceil((finDeMes.getTime() - bogota.getTime()) / 86_400_000));
}

export type ResultadoConsumo =
  | { permitido: true; consumido: false; cupo: Cupo }   // ya estaba abierta
  | { permitido: true; consumido: true; cupo: Cupo }    // se gastó una
  | { permitido: false; consumido: false; cupo: Cupo }; // sin cupo este mes

/**
 * Decide si se abre la ficha y devuelve el cupo resultante. No escribe nada: la
 * persistencia se hace fuera para poder probar la decisión sin tocar Supabase.
 */
export function consumirCupo(
  cupo: Cupo,
  id: string,
  plan: 'anonimo' | 'free' | 'suscrito',
): ResultadoConsumo {
  if (plan === 'suscrito') return { permitido: true, consumido: false, cupo };
  if (plan === 'anonimo') return { permitido: false, consumido: false, cupo };
  if (yaDesbloqueada(cupo, id)) return { permitido: true, consumido: false, cupo };
  if (cupo.desbloqueadas.length >= CUPO_MENSUAL_FREE) {
    return { permitido: false, consumido: false, cupo };
  }
  return {
    permitido: true,
    consumido: true,
    cupo: { periodo: cupo.periodo, desbloqueadas: [...cupo.desbloqueadas, id].slice(-MAX_IDS) },
  };
}

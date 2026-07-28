/**
 * Cupo mensual de reportes descargables.
 *
 * Es el MISMO diseño que el cupo de fichas (`server/cupo.ts`) —periodo por mes
 * calendario en hora de Colombia, reinicio al leer, tope de ids guardados— pero
 * en una bolsa aparte, y eso último es la decisión que importa:
 *
 *   anónimo   → ningún reporte (se le invita a crear cuenta)
 *   free      → CUPO_REPORTES_FREE reportes por mes calendario
 *   suscrito  → sin límite
 *
 * POR QUÉ UN CUPO SEPARADO Y NO EL MISMO: abrir una ficha y llevarse su reporte
 * son dos actos distintos del mismo usuario. Si compartieran bolsa, quien abrió
 * sus 20 fichas del mes no podría descargar el reporte de NINGUNA de ellas —
 * habría pagado el cupo para mirar y se quedaría sin poder llevarse nada. El
 * reporte es justamente lo que uno se lleva de la ficha que ya decidió estudiar.
 *
 * Repetir el reporte de un inmueble que ya se descargó este mes NO vuelve a
 * cobrar, por la misma razón que reabrir una ficha no cobra: el archivo se
 * pierde, se comparte con el socio, se imprime otra vez. Cobrar la segunda copia
 * empujaría al usuario a no descargar por miedo a gastar, que es lo contrario de
 * lo que el producto necesita. El límite cuenta INMUEBLES reportados en el mes,
 * no clics.
 *
 * DÓNDE VIVE: en `app_metadata`, junto al resto de la autorización
 * (`server/account-metadata.ts`). Nunca en `user_metadata` ni en el navegador: el
 * titular reescribe ambos a voluntad, y un límite que el limitado puede borrar no
 * es un límite.
 */
import { z } from 'zod';
import { periodoDe } from './cupo.js';

/** Reportes que un registrado puede descargar por mes calendario. */
export const CUPO_REPORTES_FREE = 20;

/** Tope de ids guardados, para que la metadata no crezca sin control. */
const MAX_IDS = 200;

export const CupoReportesSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  generados: z.array(z.string().min(1).max(100)).max(MAX_IDS),
});

export type CupoReportes = z.infer<typeof CupoReportesSchema>;

export interface EstadoCupoReportes {
  /** Ilimitado para suscritos; 0 para anónimos. */
  limite: number | null;
  usados: number;
  restantes: number | null;
  periodo: string;
  ilimitado: boolean;
}

/**
 * Cupo de reportes vigente. Si el guardado es de un mes anterior se devuelve
 * vacío: el reinicio ocurre al leer, sin ningún proceso programado que pueda no
 * correr un primero de mes.
 */
export function leerCupoReportes(
  metadata: Record<string, unknown> | null | undefined,
  ahora: Date = new Date(),
): CupoReportes {
  const periodo = periodoDe(ahora);
  const parsed = CupoReportesSchema.safeParse(metadata?.report_quota);
  if (!parsed.success || parsed.data.periodo !== periodo) return { periodo, generados: [] };
  return parsed.data;
}

export function yaReportado(cupo: CupoReportes, id: string): boolean {
  return cupo.generados.includes(id);
}

export function estadoCupoReportes(
  cupo: CupoReportes,
  plan: 'anonimo' | 'free' | 'suscrito',
): EstadoCupoReportes {
  if (plan === 'suscrito') {
    return { limite: null, usados: 0, restantes: null, periodo: cupo.periodo, ilimitado: true };
  }
  const limite = plan === 'free' ? CUPO_REPORTES_FREE : 0;
  const usados = Math.min(cupo.generados.length, limite);
  return { limite, usados, restantes: Math.max(0, limite - usados), periodo: cupo.periodo, ilimitado: false };
}

export type ResultadoReporte =
  | { permitido: true; consumido: false; cupo: CupoReportes }   // ya se descargó este mes
  | { permitido: true; consumido: true; cupo: CupoReportes }    // se gastó uno
  | { permitido: false; consumido: false; cupo: CupoReportes }; // sin cupo este mes

/**
 * Decide si se entrega el reporte y devuelve el cupo resultante. No escribe nada:
 * la persistencia se hace fuera para poder probar la decisión sin tocar Supabase.
 */
export function consumirCupoReportes(
  cupo: CupoReportes,
  id: string,
  plan: 'anonimo' | 'free' | 'suscrito',
): ResultadoReporte {
  if (plan === 'suscrito') return { permitido: true, consumido: false, cupo };
  if (plan === 'anonimo') return { permitido: false, consumido: false, cupo };
  if (yaReportado(cupo, id)) return { permitido: true, consumido: false, cupo };
  if (cupo.generados.length >= CUPO_REPORTES_FREE) {
    return { permitido: false, consumido: false, cupo };
  }
  return {
    permitido: true,
    consumido: true,
    cupo: { periodo: cupo.periodo, generados: [...cupo.generados, id].slice(-MAX_IDS) },
  };
}

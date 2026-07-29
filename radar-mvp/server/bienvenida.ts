/**
 * Los primeros pasos de una cuenta nueva, recordados EN LA CUENTA.
 *
 * POR QUÉ NO EN EL NAVEGADOR, que es donde estaban. El recorrido guiado solo
 * salía si `localStorage` estaba limpio, así que quien primero miraba el Radar
 * como visitante y después se registraba ya lo tenía marcado como visto: se
 * registraba y no pasaba nada. Ni el recorrido, ni la invitación a personalizar,
 * ni el aviso de qué acababa de conseguir. Y es justo al revés de lo que hace
 * falta —al registrarse aparecen cosas que como anónimo no existían: los
 * guardados, las preferencias, su cupo del mes, el asistente—, así que ese es el
 * momento en que hay más que explicar, no menos.
 *
 * Guardarlo en la cuenta arregla además el caso de siempre: quien entra desde otro
 * teléfono no vuelve a empezar de cero.
 *
 * DÓNDE: en `user_metadata`, no en `app_metadata`. Es lo contrario que los cupos, y
 * a propósito: esto no limita nada. Si alguien lo borrara solo conseguiría volver a
 * ver la bienvenida, que es inofensivo. La frontera de `account-metadata.ts` está
 * para lo que concede o quita permisos, y meter aquí cosas que no lo hacen la
 * desdibuja.
 */
import { z } from 'zod';

/**
 * Los hitos, en el orden en que se le proponen.
 *
 * Es una lista corta a propósito. Una secuencia que recorre todas las funciones
 * produce abandono; la que lleva a la primera que da valor produce uso. De ahí que
 * `abrir_ficha` esté aquí y no, por ejemplo, «descargar un reporte»: abrir una
 * ficha es lo que la persona vino a hacer.
 */
export const HITOS = ['bienvenida', 'recorrido', 'preferencias', 'abrir_ficha', 'guardar'] as const;
export type Hito = (typeof HITOS)[number];

export const HitosSchema = z.array(z.enum(HITOS)).max(HITOS.length);

/** Los hitos ya cumplidos, tolerando lo que haya guardado de antes. */
export function leerHitos(metadata: Record<string, unknown> | null | undefined): Hito[] {
  const parsed = HitosSchema.safeParse(metadata?.onboarding_hitos);
  if (!parsed.success) return [];
  // Sin repetidos y en el orden canónico, para que el cliente pueda pintarlos sin
  // ordenarlos otra vez.
  return HITOS.filter((h) => parsed.data.includes(h));
}

export function conHito(actuales: Hito[], nuevo: Hito): Hito[] {
  return actuales.includes(nuevo) ? actuales : HITOS.filter((h) => h === nuevo || actuales.includes(h));
}

/**
 * ¿Hay que darle la bienvenida?
 *
 * Basta con que no tenga el primer hito. No se mira la antigüedad de la cuenta ni
 * la fecha de creación: alguien que se registró hace un mes y nunca volvió merece
 * la bienvenida igual, y basar esto en un plazo obligaría a elegir un número
 * arbitrario que además fallaría en los bordes.
 */
export function necesitaBienvenida(hitos: Hito[]): boolean {
  return !hitos.includes('bienvenida');
}

/** Lo que se le promete al registrarse. El texto vive aquí para no repetirlo. */
export interface ResumenPlanGratis {
  fichas: number;
  consultas: number;
}

export function parseHito(valor: unknown): Hito | null {
  const parsed = z.enum(HITOS).safeParse(valor);
  return parsed.success ? parsed.data : null;
}

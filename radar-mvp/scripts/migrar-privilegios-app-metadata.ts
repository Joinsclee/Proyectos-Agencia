/**
 * Mueve los campos de autorización de `user_metadata` a `app_metadata`.
 *
 * Contexto: hasta el 2026-07-27 el plan, el rol y el ciclo de la suscripción
 * vivían en `user_metadata`, que el propio titular reescribe con su access token.
 * El servidor ya dejó de leerlos de ahí (`server/account-metadata.ts`), así que
 * hasta que se corra esto una cuenta que fuera Pro de verdad aparece como free.
 *
 * Es idempotente: se puede correr las veces que haga falta.
 *
 * Uso:
 *   npx tsx scripts/migrar-privilegios-app-metadata.ts            # simulacro
 *   npx tsx scripts/migrar-privilegios-app-metadata.ts --aplicar  # escribe
 *
 * El simulacro es el modo por defecto a propósito: esto toca la autorización de
 * todas las cuentas y conviene leer el plan antes de ejecutarlo.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import { CAMPOS_AUTORIZACION, privilegiosEnBolsaDelUsuario } from '../server/account-metadata.js';

const log = createLogger('migrar-privilegios');

export interface ResultadoMigracion {
  revisadas: number;
  migradas: number;
  yaMigradas: number;
  conflictos: number;
  errores: string[];
}

/**
 * Si un campo ya existe en `app_metadata` con otro valor, gana `app_metadata`:
 * es la fuente de verdad nueva y el valor de `user_metadata` pudo escribirlo el
 * propio usuario. El caso se cuenta aparte para poder revisarlo.
 */
export function planDeMigracion(
  userMetadata: Record<string, unknown> | null | undefined,
  appMetadata: Record<string, unknown> | null | undefined,
): {
  mover: Record<string, unknown>;
  limpiar: string[];
  conflictos: string[];
} {
  const propios = userMetadata ?? {};
  const servidor = appMetadata ?? {};
  const mover: Record<string, unknown> = {};
  const limpiar: string[] = [];
  const conflictos: string[] = [];

  for (const campo of CAMPOS_AUTORIZACION) {
    if (propios[campo] === undefined) continue;
    limpiar.push(campo);
    if (servidor[campo] === undefined) mover[campo] = propios[campo];
    else if (JSON.stringify(servidor[campo]) !== JSON.stringify(propios[campo])) conflictos.push(campo);
  }
  return { mover, limpiar, conflictos };
}

export async function migrarPrivilegios(aplicar: boolean): Promise<ResultadoMigracion> {
  const resultado: ResultadoMigracion = {
    revisadas: 0, migradas: 0, yaMigradas: 0, conflictos: 0, errores: [],
  };

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { resultado.errores.push(`listUsers p${page}: ${error.message}`); break; }

    for (const user of data.users) {
      resultado.revisadas += 1;
      const pendientes = privilegiosEnBolsaDelUsuario(user.user_metadata);
      if (!pendientes.length) { resultado.yaMigradas += 1; continue; }

      const { mover, limpiar, conflictos } = planDeMigracion(user.user_metadata, user.app_metadata);
      if (conflictos.length) {
        resultado.conflictos += 1;
        log.warn(`${user.email ?? user.id}: ${conflictos.join(', ')} ya existían en app_metadata con otro valor; gana app_metadata`);
      }

      const userMetadata = { ...(user.user_metadata ?? {}) };
      for (const campo of limpiar) delete userMetadata[campo];
      const appMetadata = { ...(user.app_metadata ?? {}), ...mover };

      log.info(`${aplicar ? 'migrando' : 'simulacro'} ${user.email ?? user.id}: ${limpiar.join(', ')}`);
      if (!aplicar) { resultado.migradas += 1; continue; }

      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });
      if (updateError) resultado.errores.push(`${user.id.slice(0, 8)}: ${updateError.message}`);
      else resultado.migradas += 1;
    }

    if (data.users.length < 1000) break;
  }

  return resultado;
}

if (isEntrypoint(import.meta.url)) {
  const aplicar = process.argv.includes('--aplicar');
  migrarPrivilegios(aplicar)
    .then((r) => {
      log.info(
        `${aplicar ? 'Migradas' : 'Se migrarían'} ${r.migradas} de ${r.revisadas} cuentas · `
        + `${r.yaMigradas} ya estaban · ${r.conflictos} con conflicto · ${r.errores.length} errores`,
      );
      for (const e of r.errores) log.error(e);
      if (!aplicar) log.info('Simulacro: no se escribió nada. Repetir con --aplicar.');
      process.exit(r.errores.length ? 1 : 0);
    })
    .catch((e) => { log.error('Falló la migración', e); process.exit(1); });
}

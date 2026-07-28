/**
 * Conceder o retirar el plan Pro a una cuenta, desde la línea de comandos.
 *
 * Existe porque el camino previsto —el panel `/admin`— no es utilizable todavía:
 * hoy no hay ninguna cuenta administradora, y crear una para poder conceder un
 * plan implicaría darle acceso al correo de todos los usuarios. Esto hace solo lo
 * que hace falta.
 *
 * Escribe en LAS DOS bolsas de metadatos a propósito. Durante la ventana en que
 * el arreglo de privilegios (PR #17) está fusionado pero no desplegado, conviven
 * dos lectores: producción todavía lee de `user_metadata` y el código nuevo lee de
 * `app_metadata`. Escribir en ambas hace que el permiso valga antes y después, y
 * deja a `migrar-privilegios-app-metadata.ts` sin conflicto que resolver, porque
 * encontrará el mismo valor en las dos.
 *
 * Uso:
 *   npx tsx scripts/otorgar-plan.ts correo@ejemplo.com                    # simulacro
 *   npx tsx scripts/otorgar-plan.ts correo@ejemplo.com --aplicar
 *   npx tsx scripts/otorgar-plan.ts correo@ejemplo.com --dias=365 --aplicar
 *   npx tsx scripts/otorgar-plan.ts correo@ejemplo.com --retirar --aplicar
 *
 * `--admin` concede además el rol de administrador. Va aparte del plan a
 * propósito: el panel expone el correo de TODAS las cuentas y permite cambiarle
 * la suscripción a terceros, así que no es «el plan más alto», es otra cosa.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import { subscriptionStatusFromMetadata, type SubscriptionAuditEvent } from '../server/commercial.js';
import { metadatosDeCuenta } from '../server/account-metadata.js';

const log = createLogger('otorgar-plan');

const DIAS_POR_DEFECTO = 365;

export interface OpcionesOtorgar {
  email: string;
  retirar?: boolean;
  admin?: boolean;
  dias?: number;
  nota?: string;
  aplicar?: boolean;
}

async function buscarPorEmail(email: string) {
  const objetivo = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const encontrado = data.users.find((u) => (u.email ?? '').toLowerCase() === objetivo);
    if (encontrado) return encontrado;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function otorgarPlan(opciones: OpcionesOtorgar) {
  const user = await buscarPorEmail(opciones.email);
  if (!user) throw new Error(`No existe ninguna cuenta con el correo ${opciones.email}`);

  const vista = metadatosDeCuenta(user);
  const antes = subscriptionStatusFromMetadata(vista);
  const ahora = new Date();
  const toStatus = opciones.retirar ? 'canceled' : 'active';

  const evento: SubscriptionAuditEvent = {
    id: randomUUID(),
    at: ahora.toISOString(),
    fromStatus: antes,
    toStatus,
    source: 'admin',
    note: opciones.nota ?? (opciones.retirar
      ? 'Retirado por el operador desde scripts/otorgar-plan.ts'
      : 'Concedido por el operador desde scripts/otorgar-plan.ts'),
  };

  const historial = Array.isArray(vista.subscription_audit) ? vista.subscription_audit : [];
  const validUntil = new Date(
    ahora.getTime() + (opciones.dias ?? DIAS_POR_DEFECTO) * 86_400_000,
  ).toISOString();

  const privilegios: Record<string, unknown> = {
    plan: opciones.retirar ? 'free' : 'pro',
    subscription_status: toStatus,
    subscription_source: 'admin',
    subscription_updated_at: ahora.toISOString(),
    subscription_audit: [evento, ...historial].slice(0, 50),
  };
  if (opciones.retirar) privilegios.subscription_valid_until = undefined;
  else privilegios.subscription_valid_until = validUntil;
  if (opciones.admin) privilegios.role = 'admin';

  log.info(`Cuenta: ${user.email} (${user.id})`);
  log.info(`  plan            ${vista.plan ?? 'free'} → ${privilegios.plan}`);
  log.info(`  estado          ${antes} → ${toStatus}`);
  if (!opciones.retirar) log.info(`  vigente hasta   ${validUntil.slice(0, 10)} (${opciones.dias ?? DIAS_POR_DEFECTO} días)`);
  if (opciones.admin) log.info('  rol             user → admin  ⚠ da acceso al correo de todas las cuentas');

  if (!opciones.aplicar) {
    log.info('Simulacro: no se escribió nada. Repetir con --aplicar.');
    return { aplicado: false as const, userId: user.id, email: user.email ?? '' };
  }

  // Las dos bolsas: `app_metadata` es la fuente de verdad nueva y `user_metadata`
  // mantiene el permiso vivo en la producción todavía sin desplegar.
  const appMetadata = { ...(user.app_metadata ?? {}) } as Record<string, unknown>;
  const userMetadata = { ...(user.user_metadata ?? {}) } as Record<string, unknown>;
  for (const [clave, valor] of Object.entries(privilegios)) {
    if (valor === undefined) { delete appMetadata[clave]; delete userMetadata[clave]; continue; }
    appMetadata[clave] = valor;
    userMetadata[clave] = valor;
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  if (error) throw new Error(error.message);

  log.info('Aplicado en app_metadata y user_metadata.');
  return { aplicado: true as const, userId: user.id, email: user.email ?? '' };
}

if (isEntrypoint(import.meta.url)) {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  if (!email) {
    log.error('Falta el correo. Uso: npx tsx scripts/otorgar-plan.ts correo@ejemplo.com [--dias=365] [--retirar] [--admin] --aplicar');
    process.exit(1);
  }
  const dias = Number(args.find((a) => a.startsWith('--dias='))?.split('=')[1] ?? DIAS_POR_DEFECTO);
  const nota = args.find((a) => a.startsWith('--nota='))?.split('=').slice(1).join('=');

  otorgarPlan({
    email,
    dias: Number.isFinite(dias) && dias > 0 ? dias : DIAS_POR_DEFECTO,
    retirar: args.includes('--retirar'),
    admin: args.includes('--admin'),
    aplicar: args.includes('--aplicar'),
    nota,
  })
    .then(() => process.exit(0))
    .catch((e) => { log.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}

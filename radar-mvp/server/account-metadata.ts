/**
 * Frontera entre lo que el titular de la cuenta puede escribir y lo que solo
 * escribe el servidor.
 *
 * Supabase expone dos bolsas por cuenta:
 *   · `user_metadata` — el propio usuario la reescribe entera con su access token
 *     (`PUT /auth/v1/user`). Sirve para nombre, preferencias, favoritos y alertas.
 *   · `app_metadata` — solo se escribe con la llave `service_role`. Es el único
 *     sitio donde puede vivir una decisión de autorización.
 *
 * Hasta el 2026-07-27 el plan, el estado de la suscripción y el rol vivían en
 * `user_metadata`. Con eso, cualquier usuario registrado se ascendía a Pro —y se
 * llevaba gratis el contenido que se vende (`server/acceso.ts`)— o a
 * administrador, lo que además expone el correo de todos los usuarios y permite
 * cambiarle la suscripción a terceros.
 *
 * En vez de reescribir toda la lógica de cuenta, se separa la bolsa aquí:
 * `metadatosDeCuenta()` arma la vista que el resto del código ya sabe leer, pero
 * toma los campos de autorización SOLO de `app_metadata`. Lo que el usuario haya
 * escrito con esos nombres se descarta. No hay respaldo al valor viejo a
 * propósito: un respaldo sería exactamente el agujero que se quiere cerrar.
 *
 * Las cuentas anteriores a la migración se pasan con
 * `scripts/migrar-privilegios-app-metadata.ts`.
 */

/**
 * Campos que solo el servidor puede decidir. Cubren el permiso (`plan`, `role`),
 * el ciclo de vida de la suscripción y su rastro de auditoría: si el usuario
 * pudiera escribir el audit, podría fabricarse un historial de pagos.
 */
export const CAMPOS_AUTORIZACION = [
  'plan',
  'role',
  'is_admin',
  'plan_interest',
  'subscription_status',
  'subscription_source',
  'subscription_valid_until',
  'subscription_updated_at',
  'subscription_payment_reference',
  'subscription_transaction_id',
  'subscription_audit',
  // El cupo mensual del plan gratuito. Va aquí y no en `user_metadata` por la
  // razón obvia: un límite que el limitado puede reescribir no es un límite.
  'unlock_quota',
  // El cupo mensual de reportes descargables (`server/cupo-reportes.ts`), en su
  // propia bolsa porque es un límite distinto del de fichas. Mismo motivo para
  // estar aquí: si viviera en `user_metadata`, el titular se pondría 999.
  'report_quota',
  // Las consultas al asistente gastadas este mes (`server/asistente.ts`).
  //
  // Se olvidó al añadir el asistente, y eso lo mandaba a `user_metadata` —donde
  // acaba todo lo que no esté en esta lista—: cualquiera podía ponerlo en cero con
  // un `PUT /auth/v1/user` y tener consultas ilimitadas. Cada una cuesta tokens que
  // pagamos nosotros, así que este es el límite más caro de los tres.
  'assistant_quota',
] as const;

export type CampoAutorizacion = (typeof CAMPOS_AUTORIZACION)[number];

const ES_AUTORIZACION = new Set<string>(CAMPOS_AUTORIZACION);

export interface CuentaSupabase {
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}

/**
 * Vista única de la cuenta para todos los lectores existentes
 * (`entitledPlanFromMetadata`, `isAdminMetadata`, `readAlerts`…).
 *
 * Los campos de autorización vienen de `app_metadata` y el resto de
 * `user_metadata`. Un `plan` escrito por el usuario nunca llega al resultado.
 */
export function metadatosDeCuenta(user: CuentaSupabase | null | undefined): Record<string, unknown> {
  const propios = user?.user_metadata ?? {};
  const servidor = user?.app_metadata ?? {};
  const vista: Record<string, unknown> = {};

  for (const [clave, valor] of Object.entries(propios)) {
    if (!ES_AUTORIZACION.has(clave)) vista[clave] = valor;
  }
  for (const campo of CAMPOS_AUTORIZACION) {
    if (servidor[campo] !== undefined) vista[campo] = servidor[campo];
  }
  return vista;
}

/**
 * Reparte una bolsa ya modificada en las dos que hay que escribir.
 *
 * `app_metadata` conserva las claves que pone Supabase (`provider`, `providers`):
 * se pasan tal cual desde la cuenta original para no borrarlas al actualizar.
 */
export function separarMetadatos(
  bolsa: Record<string, unknown>,
  appMetadataActual: Record<string, unknown> | null | undefined,
): { userMetadata: Record<string, unknown>; appMetadata: Record<string, unknown> } {
  const userMetadata: Record<string, unknown> = {};
  const appMetadata: Record<string, unknown> = { ...(appMetadataActual ?? {}) };

  for (const [clave, valor] of Object.entries(bolsa)) {
    if (ES_AUTORIZACION.has(clave)) appMetadata[clave] = valor;
    else userMetadata[clave] = valor;
  }
  // Un campo que el updater borró tiene que desaparecer también de app_metadata.
  for (const campo of CAMPOS_AUTORIZACION) {
    if (!(campo in bolsa)) delete appMetadata[campo];
  }
  return { userMetadata, appMetadata };
}

/**
 * Campos de autorización que siguen —o vuelven a estar— en la bolsa del usuario.
 *
 * Después de migrar no debería devolver nada. Si devuelve algo con valor
 * privilegiado, o la cuenta no se migró, o alguien está intentando ascenderse.
 */
export function privilegiosEnBolsaDelUsuario(
  userMetadata: Record<string, unknown> | null | undefined,
): CampoAutorizacion[] {
  const bolsa = userMetadata ?? {};
  return CAMPOS_AUTORIZACION.filter((campo) => bolsa[campo] !== undefined);
}

const PLANES_PAGOS = new Set(['pro', 'suscrito', 'premium']);
const ESTADOS_CON_ACCESO = new Set(['active', 'trialing']);

const reclamaAdmin = (b: Record<string, unknown>) => b.role === 'admin' || b.is_admin === true;
const reclamaPago = (b: Record<string, unknown>) => PLANES_PAGOS.has(String(b.plan ?? '').toLowerCase());
const reclamaVigencia = (b: Record<string, unknown>) => ESTADOS_CON_ACCESO.has(String(b.subscription_status ?? '').toLowerCase());

/**
 * ¿La bolsa del usuario intenta conceder un permiso que el servidor NO le dio?
 *
 * Se compara contra `app_metadata` en vez de mirar solo la bolsa del usuario. La
 * razón es concreta: `scripts/otorgar-plan.ts` escribe el permiso en las dos
 * bolsas a propósito, para que valga en la producción todavía sin desplegar. Sin
 * esta comparación, cada petición de una cuenta legítimamente Pro dejaba un aviso
 * de intento de ascenso en el log — y un aviso que salta con lo normal deja de
 * mirarse justo cuando salta con lo anormal.
 */
export function pareceIntentoDeAscenso(
  userMetadata: Record<string, unknown> | null | undefined,
  appMetadata?: Record<string, unknown> | null,
): boolean {
  const propios = userMetadata ?? {};
  const servidor = appMetadata ?? {};
  return (reclamaAdmin(propios) && !reclamaAdmin(servidor))
    || (reclamaPago(propios) && !reclamaPago(servidor))
    || (reclamaVigencia(propios) && !reclamaVigencia(servidor));
}

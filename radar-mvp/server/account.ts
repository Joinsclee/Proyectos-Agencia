import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { metadatosDeCuenta, separarMetadatos } from './account-metadata.js';
import { estadoCupo, leerCupo, type Cupo } from './cupo.js';
import { oportunidadesPorZona } from './queries.js';
import { estadoCupoReportes, leerCupoReportes, type CupoReportes } from './cupo-reportes.js';
import { env } from '../lib/env.js';
import { createLogger } from '../lib/logger.js';
import {
  AccountSyncSchema,
  PLAN_CATALOG,
  RadarAlertInputSchema,
  RadarPreferencesSchema,
  SubscriptionUpdateSchema,
  entitledPlanFromMetadata,
  isAdminMetadata,
  maxAlertsForPlan,
  readAlerts,
  readDeliveryHistory,
  readSubscriptionAudit,
  subscriptionStatusFromMetadata,
  type RadarAlert,
  type SubscriptionAuditEvent,
} from './commercial.js';

const log = createLogger('cuenta');

type Metadata = Record<string, any>;

/**
 * Cuenta tal como la devuelve Supabase. `app_metadata` importa tanto como
 * `user_metadata`: es donde viven plan, rol y suscripción (ver
 * `account-metadata.ts`), y sin ella la vista saldría sin permisos.
 */
type CuentaCruda = {
  id: string;
  email?: string;
  user_metadata?: Metadata | null;
  app_metadata?: Metadata | null;
};

function publicAccount(user: CuentaCruda) {
  const metadata = metadatosDeCuenta(user) as Metadata;
  const plan = entitledPlanFromMetadata(metadata);
  return {
    id: user.id,
    email: user.email ?? '',
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    plan,
    subscriptionStatus: subscriptionStatusFromMetadata(metadata),
    subscriptionValidUntil: typeof metadata.subscription_valid_until === 'string'
      && Number.isFinite(Date.parse(metadata.subscription_valid_until))
      ? metadata.subscription_valid_until
      : null,
    subscriptionSource: ['wompi_sandbox', 'admin', 'demo'].includes(String(metadata.subscription_source))
      ? (metadata.subscription_source as 'wompi_sandbox' | 'admin' | 'demo')
      : null,
    role: isAdminMetadata(metadata) ? 'admin' : 'user',
    preferences: RadarPreferencesSchema.safeParse(metadata.radar_preferences).success
      ? metadata.radar_preferences
      : null,
    simulations: Array.isArray(metadata.radar_simulations) ? metadata.radar_simulations.slice(0, 50) : [],
    alerts: readAlerts(metadata),
    deliveryHistory: readDeliveryHistory(metadata).slice(0, 20),
    subscriptionHistory: readSubscriptionAudit(metadata)
      .slice(0, 20)
      .map(({ actorUserId: _actorUserId, ...event }) => event),
    planInterest: metadata.plan_interest ?? null,
    entitlements: {
      fullOpportunityDetails: plan === 'pro',
      maxAlerts: maxAlertsForPlan(plan),
      exports: plan === 'pro',
    },
    // Cuántas fichas de oportunidad le quedan este mes. Sin esto el usuario del
    // plan gratuito descubre su límite cuando se lo choca.
    cupo: estadoCupo(leerCupo(metadata), plan === 'pro' ? 'suscrito' : 'free'),
    // Y cuántos reportes descargables, que es un cupo aparte: el botón de la
    // ficha necesita poder decir "te quedan N" antes de que el usuario lo pulse.
    cupoReportes: estadoCupoReportes(leerCupoReportes(metadata), plan === 'pro' ? 'suscrito' : 'free'),
  };
}

async function adminUser(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error('usuario no encontrado');
  return data.user;
}

/**
 * Los updaters siguen viendo UNA bolsa, como siempre. El reparto entre
 * `user_metadata` y `app_metadata` ocurre aquí, en el borde: así ningún sitio de
 * negocio tiene que acordarse de dónde vive cada campo, y un campo de permiso no
 * puede acabar por descuido en la bolsa que el usuario reescribe.
 */
async function updateMetadata(userId: string, updater: (metadata: Metadata) => Metadata) {
  const user = await adminUser(userId);
  const bolsa = updater(metadatosDeCuenta(user) as Metadata);
  const { userMetadata, appMetadata } = separarMetadatos(bolsa, user.app_metadata);
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });
  if (error || !data.user) throw new Error(error?.message ?? 'No se pudo actualizar la cuenta');
  return publicAccount(data.user);
}

/**
 * Deja constancia de que el usuario gastó una ficha de su cupo mensual.
 *
 * Pasa por `updateMetadata` a propósito, no por un `updateUserById` suelto: así
 * el cupo cae en `app_metadata` por la misma frontera que el resto de la
 * autorización y nadie tiene que acordarse de dónde va.
 */
export async function registrarDesbloqueo(userId: string, cupo: Cupo): Promise<void> {
  await updateMetadata(userId, (metadata) => {
    metadata.unlock_quota = cupo;
    return metadata;
  });
}

/**
 * Deja constancia de que el usuario gastó un reporte de su cupo mensual.
 *
 * Mismo camino que `registrarDesbloqueo` y por el mismo motivo: pasando por
 * `updateMetadata`, el cupo cae en `app_metadata` por la frontera que ya existe
 * y nadie tiene que acordarse de dónde va.
 */
export async function registrarReporte(userId: string, cupo: CupoReportes): Promise<void> {
  await updateMetadata(userId, (metadata) => {
    metadata.report_quota = cupo;
    return metadata;
  });
}

/**
 * Concede el plan de pago sin cobrar, para poder enseñar el producto completo
 * mientras la pasarela no está operativa.
 *
 * Queda marcado con `subscription_source: 'demo'`, distinto de `wompi_sandbox` y
 * de `admin`: así una consulta puede separar en cualquier momento quién pagó de
 * quién entró por la puerta abierta, y el evento queda en el historial que el
 * propio usuario ve en `/cuenta`.
 *
 * Se controla con `RADAR_DEMO_PLAN`. Es dinero regalado a propósito y hay que
 * poder cerrarlo con un cambio de variable, sin desplegar.
 */
export async function activarPlanDemo(userId: string, dias = 30) {
  if (env.RADAR_DEMO_PLAN !== '1') {
    return { ok: false as const, error: 'La activación de demostración está desactivada' };
  }
  let evento: SubscriptionAuditEvent | null = null;
  const account = await updateMetadata(userId, (metadata) => {
    const desde = subscriptionStatusFromMetadata(metadata);
    const ahora = new Date();
    evento = {
      id: randomUUID(),
      at: ahora.toISOString(),
      fromStatus: desde,
      toStatus: 'active',
      source: 'admin',
      note: 'Activación de demostración: acceso completo sin cobro',
    };
    metadata.subscription_status = 'active';
    metadata.plan = 'pro';
    metadata.subscription_source = 'demo';
    metadata.subscription_updated_at = ahora.toISOString();
    metadata.subscription_valid_until = new Date(ahora.getTime() + dias * 86_400_000).toISOString();
    metadata.subscription_audit = [evento, ...readSubscriptionAudit(metadata)].slice(0, 50);
    return metadata;
  });
  log.warn(`plan demo activado para ${userId.slice(0, 8)} · ${dias} días sin cobro`);
  return { ok: true as const, account, event: evento };
}

async function listAllUsers() {
  const users: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

export function listPlans() {
  return PLAN_CATALOG;
}

export async function getAccount(userId: string) {
  return publicAccount(await adminUser(userId));
}

export async function syncAccount(userId: string, input: unknown) {
  const parsed = AccountSyncSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const account = await updateMetadata(userId, (metadata) => {
    if (parsed.data.preferences) metadata.radar_preferences = parsed.data.preferences;
    if (parsed.data.simulations) metadata.radar_simulations = parsed.data.simulations;
    if (parsed.data.alertDraft) {
      const plan = entitledPlanFromMetadata(metadata);
      const current = readAlerts(metadata);
      const alertInput = RadarAlertInputSchema.parse({
        id: parsed.data.alertDraft.id,
        city: parsed.data.alertDraft.city,
        budget: parsed.data.alertDraft.budget,
        type: parsed.data.alertDraft.type,
        frequency: parsed.data.alertDraft.frequency,
        active: true,
      });
      const now = new Date().toISOString();
      const primary: RadarAlert = {
        ...current[0],
        ...alertInput,
        id: current[0]?.id ?? randomUUID(),
        active: true,
        createdAt: current[0]?.createdAt ?? now,
        updatedAt: now,
      };
      metadata.radar_alerts = [primary, ...current.slice(1)].slice(0, maxAlertsForPlan(plan));
    }
    return metadata;
  });
  return { ok: true as const, account };
}

export async function saveAlert(userId: string, input: unknown) {
  const parsed = RadarAlertInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Alerta inválida' };
  }

  const account = await updateMetadata(userId, (metadata) => {
    const current = readAlerts(metadata);
    const plan = entitledPlanFromMetadata(metadata);
    const existing = parsed.data.id ? current.find((alert) => alert.id === parsed.data.id) : undefined;
    if (!existing && current.length >= maxAlertsForPlan(plan)) {
      throw new Error(`Tu plan permite ${maxAlertsForPlan(plan)} alerta${maxAlertsForPlan(plan) === 1 ? '' : 's'}`);
    }
    const now = new Date().toISOString();
    const next: RadarAlert = {
      ...existing,
      ...parsed.data,
      id: existing?.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    metadata.radar_alerts = [next, ...current.filter((alert) => alert.id !== next.id)];
    return metadata;
  });
  return { ok: true as const, account };
}

export async function deleteAlert(userId: string, alertId: string) {
  const account = await updateMetadata(userId, (metadata) => {
    metadata.radar_alerts = readAlerts(metadata).filter((alert) => alert.id !== alertId);
    return metadata;
  });
  return { ok: true as const, account };
}

export async function registerPlanInterest(userId: string, input: unknown) {
  const parsed = z.object({
    plan: z.literal('pro').default('pro'),
    note: z.string().trim().max(500).optional(),
  }).strict().safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Solicitud inválida' };

  const account = await updateMetadata(userId, (metadata) => {
    metadata.plan_interest = {
      plan: 'pro',
      note: parsed.data.note ?? '',
      requestedAt: new Date().toISOString(),
      status: 'new',
    };
    return metadata;
  });
  return { ok: true as const, account };
}

export async function getAdminSummary(requesterId: string) {
  const requester = await adminUser(requesterId);
  if (!isAdminMetadata(metadatosDeCuenta(requester))) return null;

  const users = await listAllUsers();
  const accounts = users.map(publicAccount);
  const statusCounts = accounts.reduce<Record<string, number>>((counts, account) => {
    counts[account.subscriptionStatus] = (counts[account.subscriptionStatus] ?? 0) + 1;
    return counts;
  }, {});
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentDeliveries = accounts
    .flatMap((account) => account.deliveryHistory)
    .filter((delivery) => Date.parse(delivery.attemptedAt) >= thirtyDaysAgo);
  const sentDeliveries = recentDeliveries.filter((delivery) => delivery.status === 'sent').length;
  const failedDeliveries = recentDeliveries.filter((delivery) => delivery.status === 'failed').length;
  const deliveryAttempts = sentDeliveries + failedDeliveries;
  return {
    generatedAt: new Date().toISOString(),
    users: accounts.length,
    proUsers: accounts.filter((account) => account.plan === 'pro').length,
    interestedUsers: accounts.filter((account) => account.subscriptionStatus === 'interested').length,
    activeAlerts: accounts.reduce(
      (total, account) => total + account.alerts.filter((alert: RadarAlert) => alert.active).length,
      0,
    ),
    completedProfiles: accounts.filter((account) => account.preferences).length,
    subscriptionFunnel: {
      none: statusCounts.none ?? 0,
      interested: statusCounts.interested ?? 0,
      trialing: statusCounts.trialing ?? 0,
      active: statusCounts.active ?? 0,
      pastDue: statusCounts.past_due ?? 0,
      canceled: statusCounts.canceled ?? 0,
    },
    deliveriesLast30Days: recentDeliveries.length,
    sentDeliveries,
    failedDeliveries,
    deliverySuccessRate: deliveryAttempts ? Math.round((sentDeliveries / deliveryAttempts) * 1000) / 10 : null,
    lastDeliveryAt: recentDeliveries
      .map((delivery) => delivery.attemptedAt)
      .sort()
      .at(-1) ?? null,
  };
}

/**
 * Estadísticas de oportunidades por zona (la otra mitad del panel).
 *
 * El cálculo vive en `server/queries.ts` porque es puro inventario y no tiene
 * nada que ver con las cuentas; lo que se hace aquí —y por eso está en este
 * archivo y no en el enrutador— es pasar por el MISMO guardia que el resumen y
 * la cola comercial. Un endpoint administrativo con su propia comprobación de
 * rol es la forma habitual de que una de las cuatro se quede desactualizada.
 *
 * El rol se lee de la bolsa separada (`metadatosDeCuenta`), nunca de
 * `user_metadata`: esa bolsa la reescribe el propio titular y hasta el
 * 2026-07-27 cualquier registrado podía ascenderse a administrador.
 */
export async function getAdminZoneOpportunities(requesterId: string) {
  const requester = await adminUser(requesterId);
  if (!isAdminMetadata(metadatosDeCuenta(requester))) return null;
  return oportunidadesPorZona();
}

export async function listAdminPlanInterests(requesterId: string) {
  const requester = await adminUser(requesterId);
  if (!isAdminMetadata(metadatosDeCuenta(requester))) return null;

  const users = await listAllUsers();
  return users
    .map((user) => {
      const metadata = metadatosDeCuenta(user) as Metadata;
      const account = publicAccount(user);
      const interest = metadata.plan_interest && typeof metadata.plan_interest === 'object'
        ? metadata.plan_interest
        : null;
      const latestAudit = readSubscriptionAudit(metadata)[0] ?? null;
      return {
        userId: user.id,
        email: user.email ?? '',
        name: typeof metadata.name === 'string' ? metadata.name : '',
        plan: account.plan,
        subscriptionStatus: account.subscriptionStatus,
        requestedAt: typeof interest?.requestedAt === 'string' ? interest.requestedAt : null,
        interestStatus: typeof interest?.status === 'string' ? interest.status : null,
        note: typeof interest?.note === 'string' ? interest.note : '',
        lastChangedAt: latestAudit?.at ?? null,
      };
    })
    .filter((item) => item.requestedAt || item.subscriptionStatus !== 'none')
    .sort((a, b) => String(b.requestedAt ?? b.lastChangedAt ?? '')
      .localeCompare(String(a.requestedAt ?? a.lastChangedAt ?? '')));
}

export async function updateAdminSubscription(
  requesterId: string,
  targetUserId: string,
  input: unknown,
) {
  const requester = await adminUser(requesterId);
  if (!isAdminMetadata(metadatosDeCuenta(requester))) return null;
  if (!z.string().uuid().safeParse(targetUserId).success) {
    return { ok: false as const, error: 'Usuario inválido' };
  }
  const parsed = SubscriptionUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Cambio inválido' };
  }

  let auditEvent: SubscriptionAuditEvent | null = null;
  const account = await updateMetadata(targetUserId, (metadata) => {
    const fromStatus = subscriptionStatusFromMetadata(metadata);
    const now = new Date().toISOString();
    auditEvent = {
      id: randomUUID(),
      at: now,
      actorUserId: requesterId,
      fromStatus,
      toStatus: parsed.data.status,
      source: 'admin',
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
    };
    metadata.subscription_status = parsed.data.status;
    metadata.plan = parsed.data.status === 'active' || parsed.data.status === 'trialing' ? 'pro' : 'free';
    metadata.subscription_updated_at = now;
    metadata.subscription_source = 'admin';
    metadata.subscription_audit = [
      auditEvent,
      ...readSubscriptionAudit(metadata),
    ].slice(0, 50);
    if (metadata.plan_interest && typeof metadata.plan_interest === 'object') {
      metadata.plan_interest = {
        ...metadata.plan_interest,
        status: parsed.data.status === 'active' || parsed.data.status === 'trialing'
          ? 'converted'
          : parsed.data.status === 'canceled'
            ? 'closed'
            : 'contacted',
        updatedAt: now,
      };
    }
    return metadata;
  });
  return { ok: true as const, account, event: auditEvent };
}

export async function applyWompiSubscription(
  userId: string,
  input: {
    status: 'APPROVED' | 'VOIDED';
    reference: string;
    transactionId: string;
    validUntil: string | null;
    eventAt: string;
  },
) {
  return updateMetadata(userId, (metadata) => {
    const history = readSubscriptionAudit(metadata);
    const existingEvent = history.find((event) =>
      event.source === 'wompi_sandbox'
      && event.providerReference === input.reference
      && event.providerTransactionId === input.transactionId
      && event.toStatus === (input.status === 'APPROVED' ? 'active' : 'canceled'));

    if (input.status === 'VOIDED' && metadata.subscription_payment_reference !== input.reference) {
      return metadata;
    }
    const currentValidUntil = Date.parse(String(metadata.subscription_valid_until ?? ''));
    const incomingValidUntil = Date.parse(String(input.validUntil ?? ''));
    if (
      input.status === 'APPROVED'
      && metadata.subscription_source === 'wompi_sandbox'
      && metadata.subscription_payment_reference !== input.reference
      && Number.isFinite(currentValidUntil)
      && Number.isFinite(incomingValidUntil)
      && currentValidUntil >= incomingValidUntil
    ) {
      return metadata;
    }
    if (
      input.status === 'APPROVED'
      && metadata.subscription_status === 'active'
      && metadata.subscription_payment_reference === input.reference
      && metadata.subscription_transaction_id === input.transactionId
      && existingEvent
    ) {
      return metadata;
    }

    const fromStatus = subscriptionStatusFromMetadata(metadata);
    const toStatus = input.status === 'APPROVED' ? 'active' : 'canceled';
    const now = new Date().toISOString();
    metadata.subscription_status = toStatus;
    metadata.plan = toStatus === 'active' ? 'pro' : 'free';
    metadata.subscription_updated_at = now;
    metadata.subscription_source = 'wompi_sandbox';
    metadata.subscription_payment_reference = input.reference;
    metadata.subscription_transaction_id = input.transactionId;
    if (input.validUntil) metadata.subscription_valid_until = input.validUntil;
    if (!existingEvent) {
      const event: SubscriptionAuditEvent = {
        id: randomUUID(),
        at: input.eventAt,
        fromStatus,
        toStatus,
        source: 'wompi_sandbox',
        providerReference: input.reference,
        providerTransactionId: input.transactionId,
        note: input.status === 'APPROVED'
          ? 'Pago demo confirmado por Wompi Sandbox'
          : 'Transacción anulada por Wompi Sandbox',
      };
      metadata.subscription_audit = [event, ...history].slice(0, 50);
    }
    if (metadata.plan_interest && typeof metadata.plan_interest === 'object') {
      metadata.plan_interest = {
        ...metadata.plan_interest,
        status: toStatus === 'active' ? 'converted' : 'closed',
        updatedAt: now,
      };
    }
    return metadata;
  });
}

export async function exportAccount(userId: string) {
  const account = await getAccount(userId);
  return {
    exportedAt: new Date().toISOString(),
    account,
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function exportAccountCsv(userId: string) {
  const account = await getAccount(userId);
  const rows: unknown[][] = [
    ['tipo_registro', 'id', 'fecha', 'ciudad', 'presupuesto_millones', 'tipo_inmueble', 'estado', 'detalle'],
    ['cuenta', account.id, '', '', '', '', account.subscriptionStatus, {
      email: account.email,
      name: account.name ?? '',
      plan: account.plan,
      role: account.role,
    }],
  ];
  if (account.preferences) {
    rows.push([
      'preferencias',
      account.id,
      '',
      account.preferences.city,
      account.preferences.budget,
      account.preferences.type,
      'activa',
      '',
    ]);
  }
  for (const simulation of account.simulations) {
    rows.push(['simulacion', simulation.id, '', '', '', simulation.kind, 'guardada', simulation]);
  }
  for (const alert of account.alerts) {
    rows.push([
      'alerta',
      alert.id,
      alert.createdAt,
      alert.city,
      alert.budget,
      alert.type,
      alert.active ? 'activa' : 'pausada',
      {
        ultima_revision: alert.lastCheckedAt ?? '',
        ultimo_envio: alert.lastSentAt ?? '',
        ultima_entrega: alert.lastDeliveryStatus ?? '',
      },
    ]);
  }
  for (const delivery of account.deliveryHistory) {
    rows.push([
      'entrega',
      delivery.id,
      delivery.attemptedAt,
      '',
      '',
      '',
      delivery.status,
      {
        alerta: delivery.alertId,
        coincidencias: delivery.matchCount,
        proveedor: delivery.providerMessageId ?? '',
        error: delivery.error ?? '',
      },
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

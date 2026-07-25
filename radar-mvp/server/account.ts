import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
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

type Metadata = Record<string, any>;

function publicAccount(user: { id: string; email?: string; user_metadata?: Metadata | null }) {
  const metadata = user.user_metadata ?? {};
  const plan = entitledPlanFromMetadata(metadata);
  return {
    id: user.id,
    email: user.email ?? '',
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    plan,
    subscriptionStatus: subscriptionStatusFromMetadata(metadata),
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
  };
}

async function adminUser(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error('usuario no encontrado');
  return data.user;
}

async function updateMetadata(userId: string, updater: (metadata: Metadata) => Metadata) {
  const user = await adminUser(userId);
  const metadata = updater({ ...(user.user_metadata ?? {}) });
  const { data, error } = await supabase.auth.admin.updateUserById(userId, { user_metadata: metadata });
  if (error || !data.user) throw new Error(error?.message ?? 'No se pudo actualizar la cuenta');
  return publicAccount(data.user);
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
  if (!isAdminMetadata(requester.user_metadata ?? {})) return null;

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

export async function listAdminPlanInterests(requesterId: string) {
  const requester = await adminUser(requesterId);
  if (!isAdminMetadata(requester.user_metadata ?? {})) return null;

  const users = await listAllUsers();
  return users
    .map((user) => {
      const metadata = user.user_metadata ?? {};
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
  if (!isAdminMetadata(requester.user_metadata ?? {})) return null;
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

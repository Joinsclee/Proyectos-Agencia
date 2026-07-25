import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import {
  AccountSyncSchema,
  PLAN_CATALOG,
  RadarAlertInputSchema,
  RadarPreferencesSchema,
  commercialPlanFromMetadata,
  isAdminMetadata,
  maxAlertsForPlan,
  readAlerts,
  subscriptionStatusFromMetadata,
  type RadarAlert,
} from './commercial.js';

type Metadata = Record<string, any>;

function publicAccount(user: { id: string; email?: string; user_metadata?: Metadata | null }) {
  const metadata = user.user_metadata ?? {};
  const plan = commercialPlanFromMetadata(metadata);
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
      const plan = commercialPlanFromMetadata(metadata);
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
    const plan = commercialPlanFromMetadata(metadata);
    const existing = parsed.data.id ? current.find((alert) => alert.id === parsed.data.id) : undefined;
    if (!existing && current.length >= maxAlertsForPlan(plan)) {
      throw new Error(`Tu plan permite ${maxAlertsForPlan(plan)} alerta${maxAlertsForPlan(plan) === 1 ? '' : 's'}`);
    }
    const now = new Date().toISOString();
    const next: RadarAlert = {
      ...parsed.data,
      id: existing?.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastCheckedAt: existing?.lastCheckedAt,
      lastSentAt: existing?.lastSentAt,
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

  const users: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const accounts = users.map(publicAccount);
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
  };
}

export async function exportAccount(userId: string) {
  const account = await getAccount(userId);
  return {
    exportedAt: new Date().toISOString(),
    account,
  };
}

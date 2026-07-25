import { z } from 'zod';

export const PLAN_CATALOG = [
  {
    code: 'free',
    name: 'Explorador',
    priceMonthlyCop: 0,
    description: 'Para conocer el mercado y guardar oportunidades.',
    features: [
      'Búsqueda en portal, bancos y remates',
      'Favoritos y simulaciones',
      'Contexto de mercado',
      'Hasta 1 alerta semanal',
    ],
  },
  {
    code: 'pro',
    name: 'Radar Pro',
    priceMonthlyCop: 49_900,
    billingPeriodDays: 30,
    renewalMode: 'manual',
    sandboxDemo: true,
    description: 'Demo de 30 días para evaluar primero las oportunidades de mayor señal.',
    features: [
      'Fichas completas de oportunidades',
      'Datos de contacto y fuente original',
      'Hasta 5 alertas personalizadas',
      'Análisis y exportación de seguimiento',
    ],
  },
] as const;

export type CommercialPlan = (typeof PLAN_CATALOG)[number]['code'];
export type SubscriptionStatus = 'none' | 'interested' | 'trialing' | 'active' | 'past_due' | 'canceled';

export const SubscriptionUpdateSchema = z.object({
  status: z.enum(['none', 'trialing', 'active', 'past_due', 'canceled']),
  note: z.string().trim().max(500).optional(),
}).strict();

export const SubscriptionAuditEventSchema = z.object({
  id: z.string().uuid(),
  at: z.string().datetime(),
  actorUserId: z.string().uuid().optional(),
  fromStatus: z.enum(['none', 'interested', 'trialing', 'active', 'past_due', 'canceled']),
  toStatus: z.enum(['none', 'trialing', 'active', 'past_due', 'canceled']),
  source: z.enum(['admin', 'wompi_sandbox']),
  note: z.string().trim().max(500).optional(),
  providerReference: z.string().trim().max(100).optional(),
  providerTransactionId: z.string().trim().max(200).optional(),
}).strict();

export type SubscriptionUpdate = z.infer<typeof SubscriptionUpdateSchema>;
export type SubscriptionAuditEvent = z.infer<typeof SubscriptionAuditEventSchema>;

const CitySchema = z.string().trim().toLowerCase().min(2).max(80)
  .regex(/^[a-záéíóúüñ0-9 -]+$/i, 'Ciudad inválida');
const PropertyTypeSchema = z.enum([
  '', 'apartment', 'house', 'commercial', 'lot', 'farm', 'office',
  'warehouse', 'parking', 'building', 'vehicle', 'rights',
]);

export const RadarPreferencesSchema = z.object({
  city: CitySchema,
  budget: z.union([z.string(), z.number()]).transform(String)
    .refine((value) => value === '' || (/^\d{1,6}$/.test(value) && Number(value) >= 50), 'Presupuesto inválido'),
  type: PropertyTypeSchema,
  complete: z.literal(true),
}).strict();

export type RadarPreferences = z.infer<typeof RadarPreferencesSchema>;

export const RadarAlertInputSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  city: CitySchema,
  budget: z.union([z.string(), z.number()]).transform(String)
    .refine((value) => value === '' || (/^\d{1,6}$/.test(value) && Number(value) >= 50), 'Presupuesto inválido'),
  type: PropertyTypeSchema,
  frequency: z.literal('weekly').default('weekly'),
  active: z.boolean().default(true),
}).strict();

export type RadarAlertInput = z.infer<typeof RadarAlertInputSchema>;
export const RadarAlertSchema = RadarAlertInputSchema.extend({
  id: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastCheckedAt: z.string().datetime().optional(),
  lastSentAt: z.string().datetime().optional(),
  nextRetryAt: z.string().datetime().optional(),
  consecutiveFailures: z.number().int().min(0).max(10).optional(),
  lastError: z.string().trim().max(500).optional(),
  lastDeliveryStatus: z.enum(['sent', 'no_matches', 'failed']).optional(),
  lastMatchCount: z.number().int().min(0).max(100).optional(),
}).strict();

export type RadarAlert = z.infer<typeof RadarAlertSchema>;

export const RadarDeliveryRecordSchema = z.object({
  id: z.string().trim().min(1).max(100),
  alertId: z.string().trim().min(1).max(80),
  attemptedAt: z.string().datetime(),
  status: z.enum(['sent', 'no_matches', 'failed']),
  matchCount: z.number().int().min(0).max(100),
  providerMessageId: z.string().trim().max(200).optional(),
  error: z.string().trim().max(500).optional(),
  retryAt: z.string().datetime().optional(),
}).strict();

export type RadarDeliveryRecord = z.infer<typeof RadarDeliveryRecordSchema>;

export const SimulationSchema = z.object({
  key: z.string().min(1).max(200),
  kind: z.enum(['portal', 'banco', 'remate']),
  id: z.string().min(1).max(200),
  base: z.number().positive().finite(),
}).passthrough();

export const AccountSyncSchema = z.object({
  preferences: RadarPreferencesSchema.nullable().optional(),
  simulations: z.array(SimulationSchema).max(50).optional(),
  alertDraft: RadarAlertInputSchema.extend({
    status: z.literal('draft').optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  }).nullable().optional(),
}).strict();

export function commercialPlanFromMetadata(metadata: Record<string, unknown> | null | undefined): CommercialPlan {
  const value = String(metadata?.plan ?? '').toLowerCase();
  return value === 'suscrito' || value === 'pro' || value === 'premium' ? 'pro' : 'free';
}

export function subscriptionStatusFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): SubscriptionStatus {
  const value = String(metadata?.subscription_status ?? '').toLowerCase();
  if (['trialing', 'active'].includes(value) && metadata?.subscription_source === 'wompi_sandbox') {
    const validUntil = Date.parse(String(metadata.subscription_valid_until ?? ''));
    if (Number.isFinite(validUntil) && validUntil <= now.getTime()) return 'past_due';
  }
  if (['none', 'trialing', 'active', 'past_due', 'canceled'].includes(value)) return value as SubscriptionStatus;
  if (commercialPlanFromMetadata(metadata) === 'pro') return 'active';
  if (metadata?.plan_interest) return 'interested';
  return 'none';
}

/**
 * El acceso Pro depende del ciclo de vida de la suscripción. Los planes
 * históricos sin subscription_status se conservan como activos por
 * compatibilidad; past_due y canceled pierden el contenido restringido.
 */
export function entitledPlanFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): CommercialPlan {
  const status = subscriptionStatusFromMetadata(metadata, now);
  return status === 'trialing' || status === 'active' ? 'pro' : 'free';
}

export function maxAlertsForPlan(plan: CommercialPlan): number {
  return plan === 'pro' ? 5 : 1;
}

export function readAlerts(metadata: Record<string, unknown> | null | undefined): RadarAlert[] {
  if (!Array.isArray(metadata?.radar_alerts)) return [];
  return metadata.radar_alerts
    .map((item) => RadarAlertSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(0, 5);
}

export function readDeliveryHistory(
  metadata: Record<string, unknown> | null | undefined,
): RadarDeliveryRecord[] {
  if (!Array.isArray(metadata?.radar_alert_deliveries)) return [];
  return metadata.radar_alert_deliveries
    .map((item) => RadarDeliveryRecordSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(0, 50);
}

export function readSubscriptionAudit(
  metadata: Record<string, unknown> | null | undefined,
): SubscriptionAuditEvent[] {
  if (!Array.isArray(metadata?.subscription_audit)) return [];
  return metadata.subscription_audit
    .map((item) => SubscriptionAuditEventSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(0, 50);
}

export function isAdminMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.role === 'admin' || metadata?.is_admin === true;
}

export function isAlertDue(alert: RadarAlert, now = new Date()): boolean {
  if (!alert.active) return false;
  if (alert.nextRetryAt) {
    const retryAt = Date.parse(alert.nextRetryAt);
    return !Number.isFinite(retryAt) || retryAt <= now.getTime();
  }
  const updatedAt = Date.parse(alert.updatedAt);
  const checkedAt = Date.parse(alert.lastCheckedAt ?? '');
  if (Number.isFinite(updatedAt) && Number.isFinite(checkedAt) && updatedAt > checkedAt) return true;
  const anchor = alert.lastCheckedAt || alert.lastSentAt || alert.createdAt;
  const timestamp = Date.parse(anchor);
  if (!Number.isFinite(timestamp)) return true;
  return now.getTime() - timestamp >= 7 * 24 * 60 * 60 * 1000;
}

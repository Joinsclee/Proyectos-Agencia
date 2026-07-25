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
    priceMonthlyCop: null,
    description: 'Para evaluar primero las oportunidades de mayor señal.',
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
export interface RadarAlert extends RadarAlertInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastSentAt?: string;
}

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
): SubscriptionStatus {
  const value = String(metadata?.subscription_status ?? '').toLowerCase();
  if (['trialing', 'active', 'past_due', 'canceled'].includes(value)) return value as SubscriptionStatus;
  if (metadata?.plan_interest) return 'interested';
  return commercialPlanFromMetadata(metadata) === 'pro' ? 'active' : 'none';
}

export function maxAlertsForPlan(plan: CommercialPlan): number {
  return plan === 'pro' ? 5 : 1;
}

export function readAlerts(metadata: Record<string, unknown> | null | undefined): RadarAlert[] {
  if (!Array.isArray(metadata?.radar_alerts)) return [];
  return metadata.radar_alerts
    .filter((item): item is RadarAlert => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.id === 'string'
        && typeof value.createdAt === 'string'
        && typeof value.updatedAt === 'string'
        && RadarAlertInputSchema.safeParse(value).success;
    })
    .slice(0, 5);
}

export function isAdminMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.role === 'admin' || metadata?.is_admin === true;
}

export function isAlertDue(alert: RadarAlert, now = new Date()): boolean {
  if (!alert.active) return false;
  const anchor = alert.lastCheckedAt || alert.lastSentAt || alert.createdAt;
  const timestamp = Date.parse(anchor);
  if (!Number.isFinite(timestamp)) return true;
  return now.getTime() - timestamp >= 7 * 24 * 60 * 60 * 1000;
}


import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountSyncSchema,
  RadarAlertInputSchema,
  RadarPreferencesSchema,
  commercialPlanFromMetadata,
  entitledPlanFromMetadata,
  isAlertDue,
  maxAlertsForPlan,
  readAlerts,
  readDeliveryHistory,
  readSubscriptionAudit,
  subscriptionStatusFromMetadata,
} from './commercial.js';

test('normaliza planes históricos al catálogo comercial', () => {
  assert.equal(commercialPlanFromMetadata(undefined), 'free');
  assert.equal(commercialPlanFromMetadata({ plan: 'free' }), 'free');
  assert.equal(commercialPlanFromMetadata({ plan: 'suscrito' }), 'pro');
  assert.equal(commercialPlanFromMetadata({ plan: 'premium' }), 'pro');
  assert.equal(maxAlertsForPlan('free'), 1);
  assert.equal(maxAlertsForPlan('pro'), 5);
});

test('el acceso Pro sigue el estado real de la suscripción', () => {
  assert.equal(entitledPlanFromMetadata({ plan: 'pro', subscription_status: 'active' }), 'pro');
  assert.equal(entitledPlanFromMetadata({ plan: 'pro', subscription_status: 'trialing' }), 'pro');
  assert.equal(entitledPlanFromMetadata({ plan: 'pro', subscription_status: 'past_due' }), 'free');
  assert.equal(entitledPlanFromMetadata({ plan: 'pro', subscription_status: 'canceled' }), 'free');
  assert.equal(entitledPlanFromMetadata({ plan: 'premium' }), 'pro');
  const expiredSandbox = {
    plan: 'pro',
    subscription_status: 'active',
    subscription_source: 'wompi_sandbox',
    subscription_valid_until: '2026-07-24T12:00:00.000Z',
  };
  assert.equal(subscriptionStatusFromMetadata(expiredSandbox, new Date('2026-07-25T12:00:00.000Z')), 'past_due');
  assert.equal(entitledPlanFromMetadata(expiredSandbox, new Date('2026-07-25T12:00:00.000Z')), 'free');
});

test('un plan histórico activo prevalece sobre una solicitud antigua', () => {
  assert.equal(subscriptionStatusFromMetadata({
    plan: 'pro',
    plan_interest: { status: 'new' },
  }), 'active');
  assert.equal(subscriptionStatusFromMetadata({
    plan: 'free',
    subscription_status: 'none',
    plan_interest: { status: 'closed' },
  }), 'none');
});

test('valida una alerta semanal y rechaza presupuestos inseguros', () => {
  assert.equal(RadarAlertInputSchema.safeParse({
    city: 'bogota',
    budget: '500',
    type: 'apartment',
    frequency: 'weekly',
    active: true,
  }).success, true);
  assert.equal(RadarAlertInputSchema.safeParse({
    city: '<script>',
    budget: '-1',
    type: 'castle',
    frequency: 'daily',
  }).success, false);
});

test('limita el contexto sincronizable desde un dispositivo', () => {
  const simulations = Array.from({ length: 51 }, (_, index) => ({
    key: `portal:${index}`,
    kind: 'portal',
    id: String(index),
    base: 100_000_000,
  }));
  assert.equal(AccountSyncSchema.safeParse({ simulations }).success, false);
});

test('detecta alertas semanales vencidas sin enviar duplicados', () => {
  const alert = {
    id: 'a1',
    city: 'bogota',
    budget: '500',
    type: ['apartment'] as ('apartment')[],
    frequency: 'weekly' as const,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    lastCheckedAt: '2026-07-20T00:00:00.000Z',
  };
  assert.equal(isAlertDue(alert, new Date('2026-07-24T00:00:00.000Z')), false);
  assert.equal(isAlertDue(alert, new Date('2026-07-28T00:00:01.000Z')), true);
});

test('recupera alertas persistidas con sus campos operativos', () => {
  const stored = {
    id: 'a1',
    city: 'bogota',
    budget: '500',
    type: 'apartment',
    frequency: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    lastCheckedAt: '2026-07-20T00:00:00.000Z',
    lastDeliveryStatus: 'no_matches',
    lastMatchCount: 0,
  };
  // El tipo guardado como TEXTO se recupera como lista de un elemento. Es la
  // compatibilidad que hace que las alertas ya creadas sigan funcionando después de
  // permitir varios tipos: sin ella, todas fallarían la validación a la vez y esas
  // cuentas perderían sus alertas sin haber tocado nada.
  assert.deepEqual(readAlerts({ radar_alerts: [stored] }), [{ ...stored, type: ['apartment'] }]);
});

test('un reintento pendiente prevalece sobre la cadencia semanal', () => {
  const alert = readAlerts({ radar_alerts: [{
    id: 'retry-1',
    city: 'bogota',
    budget: '500',
    type: '',
    frequency: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    lastCheckedAt: '2026-07-24T00:00:00.000Z',
    nextRetryAt: '2026-07-24T01:00:00.000Z',
    consecutiveFailures: 2,
    lastDeliveryStatus: 'failed',
  }] })[0];
  assert.equal(isAlertDue(alert, new Date('2026-07-24T00:30:00.000Z')), false);
  assert.equal(isAlertDue(alert, new Date('2026-07-24T01:00:00.000Z')), true);
});

test('un cambio de criterios se procesa en el siguiente ciclo', () => {
  const alert = readAlerts({ radar_alerts: [{
    id: 'updated-1',
    city: 'medellin',
    budget: '700',
    type: 'house',
    frequency: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    lastCheckedAt: '2026-07-24T09:00:00.000Z',
  }] })[0];
  assert.equal(isAlertDue(alert, new Date('2026-07-24T10:01:00.000Z')), true);
});

test('limita e ignora entregas corruptas guardadas en metadata', () => {
  const delivery = {
    id: 'delivery-1',
    alertId: 'a1',
    attemptedAt: '2026-07-24T00:00:00.000Z',
    status: 'sent',
    matchCount: 2,
    providerMessageId: 'provider-1',
  };
  assert.deepEqual(readDeliveryHistory({
    radar_alert_deliveries: [delivery, { status: 'bad' }],
  }), [delivery]);
});

test('ignora alertas corruptas guardadas en metadata', () => {
  assert.deepEqual(readAlerts({ radar_alerts: [{ id: 'x' }, null, 'bad'] }), []);
});

test('valida y limita la auditoría de suscripciones', () => {
  const event = {
    id: '5a130cc0-a6db-4b61-b56d-4b7f57654a30',
    at: '2026-07-24T18:00:00.000Z',
    actorUserId: '44bfd9aa-731d-419f-bca9-b5ad0ae42b23',
    fromStatus: 'interested',
    toStatus: 'trialing',
    source: 'admin',
    note: 'Prueba comercial autorizada',
  };
  assert.deepEqual(readSubscriptionAudit({
    subscription_audit: [event, { source: 'unknown' }],
  }), [event]);

  const wompiEvent = {
    id: '7bb8f487-5602-4cec-bfc9-998cb784fb34',
    at: '2026-07-25T12:00:00.000Z',
    fromStatus: 'interested',
    toStatus: 'active',
    source: 'wompi_sandbox',
    providerReference: 'RADAR-ABC123ABC123ABC123ABC123',
    providerTransactionId: 'wompi-transaction-1',
  };
  assert.deepEqual(readSubscriptionAudit({ subscription_audit: [wompiEvent] }), [wompiEvent]);
});

test('preferencias: varios tipos, y lo guardado como texto sigue valiendo', () => {
  // El cliente lo pidió así: «una persona puede decir, me interesan apartamentos y
  // casas». Y el motivo por el que «Cualquier tipo» no lo resolvía: «cualquier tipo
  // no dice nada y eso mandará de todos».
  const base = { city: 'bogota', budget: '500', complete: true as const };

  const varios = RadarPreferencesSchema.parse({ ...base, type: ['apartment', 'house'] });
  assert.deepEqual(varios.type, ['apartment', 'house']);

  // COMPATIBILIDAD: las preferencias que ya existen guardan una cadena. Si el
  // esquema exigiera lista, todas fallarían a la vez y esas cuentas perderían su
  // Radar configurado sin haber hecho nada.
  const antigua = RadarPreferencesSchema.parse({ ...base, type: 'apartment' });
  assert.deepEqual(antigua.type, ['apartment']);

  // «Cualquier tipo» es la lista vacía, como antes era la cadena vacía.
  assert.deepEqual(RadarPreferencesSchema.parse({ ...base, type: '' }).type, []);
  assert.deepEqual(RadarPreferencesSchema.parse({ ...base, type: [] }).type, []);

  // Mezclar «cualquiera» con un tipo concreto no significa nada: gana lo concreto.
  assert.deepEqual(RadarPreferencesSchema.parse({ ...base, type: ['', 'house'] }).type, ['house']);
  // Y sin repetidos.
  assert.deepEqual(RadarPreferencesSchema.parse({ ...base, type: ['house', 'house'] }).type, ['house']);
});

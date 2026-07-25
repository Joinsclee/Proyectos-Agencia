import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountSyncSchema,
  RadarAlertInputSchema,
  commercialPlanFromMetadata,
  isAlertDue,
  maxAlertsForPlan,
  readAlerts,
} from './commercial.js';

test('normaliza planes históricos al catálogo comercial', () => {
  assert.equal(commercialPlanFromMetadata(undefined), 'free');
  assert.equal(commercialPlanFromMetadata({ plan: 'free' }), 'free');
  assert.equal(commercialPlanFromMetadata({ plan: 'suscrito' }), 'pro');
  assert.equal(commercialPlanFromMetadata({ plan: 'premium' }), 'pro');
  assert.equal(maxAlertsForPlan('free'), 1);
  assert.equal(maxAlertsForPlan('pro'), 5);
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
    type: 'apartment' as const,
    frequency: 'weekly' as const,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    lastCheckedAt: '2026-07-20T00:00:00.000Z',
  };
  assert.equal(isAlertDue(alert, new Date('2026-07-24T00:00:00.000Z')), false);
  assert.equal(isAlertDue(alert, new Date('2026-07-28T00:00:01.000Z')), true);
});

test('ignora alertas corruptas guardadas en metadata', () => {
  assert.deepEqual(readAlerts({ radar_alerts: [{ id: 'x' }, null, 'bad'] }), []);
});

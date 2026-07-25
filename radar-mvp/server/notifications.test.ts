import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alertMatchSince,
  alertDeliveryIdempotencyKey,
  buildAlertDigestHtml,
  nextAlertRetryAt,
  parseAlertDispatchCanary,
} from './notifications.js';

test('el resumen de alerta escapa contenido y contiene una ruta administrable', () => {
  const html = buildAlertDigestHtml({
    id: 'alert-1',
    city: 'bogota',
    budget: '500',
    type: 'apartment',
    frequency: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }, [{
    id: 'property-1',
    source: '<script>alert(1)</script>',
    type: 'Apartamento',
    city: 'Bogotá',
    price: 300_000_000,
    discount_pct: 25,
  }]);
  assert.match(html, /Resumen semanal/);
  assert.match(html, /300\.000\.000/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /city=bogota/);
});

test('genera una clave estable para reintentos del mismo correo', () => {
  const alert = {
    id: 'alert-1',
    city: 'bogota',
    budget: '500',
    type: 'apartment' as const,
    frequency: 'weekly' as const,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const first = alertDeliveryIdempotencyKey('user-1', alert, [
    { id: 'b', source: 'x', type: null, city: 'bogota', price: null, discount_pct: null },
    { id: 'a', source: 'x', type: null, city: 'bogota', price: null, discount_pct: null },
  ]);
  const retry = alertDeliveryIdempotencyKey('user-1', alert, [
    { id: 'a', source: 'x', type: null, city: 'bogota', price: null, discount_pct: null },
    { id: 'b', source: 'x', type: null, city: 'bogota', price: null, discount_pct: null },
  ]);
  assert.equal(first, retry);
  assert.notEqual(first, alertDeliveryIdempotencyKey('user-2', alert, []));
  assert.ok(first.length <= 256);
});

test('programa reintentos crecientes y con tope de 24 horas', () => {
  const now = new Date('2026-07-24T00:00:00.000Z');
  assert.equal(nextAlertRetryAt(1, now), '2026-07-24T00:15:00.000Z');
  assert.equal(nextAlertRetryAt(2, now), '2026-07-24T01:00:00.000Z');
  assert.equal(nextAlertRetryAt(3, now), '2026-07-24T06:00:00.000Z');
  assert.equal(nextAlertRetryAt(10, now), '2026-07-25T00:00:00.000Z');
});

test('la prueba canario exige correo y una alerta específica', () => {
  assert.deepEqual(parseAlertDispatchCanary({}), { ok: true });
  assert.deepEqual(parseAlertDispatchCanary({
    canaryEmail: ' Usuario@Ejemplo.com ',
    canaryAlertId: 'alert-1',
  }), {
    ok: true,
    canary: { email: 'usuario@ejemplo.com', alertId: 'alert-1' },
  });
  assert.equal(parseAlertDispatchCanary({ canaryEmail: 'usuario@ejemplo.com' }).ok, false);
  assert.equal(parseAlertDispatchCanary({
    canaryEmail: 'usuario@ejemplo.com',
    canaryAlertId: '../todas',
  }).ok, false);
});

test('filtra oportunidades nuevas por first_seen_at y el canario admite existentes', () => {
  const alert = {
    id: 'alert-1',
    city: 'bogota',
    budget: '500',
    type: 'apartment' as const,
    frequency: 'weekly' as const,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    lastCheckedAt: '2026-07-20T00:00:00.000Z',
  };
  assert.equal(alertMatchSince(alert), '2026-07-20T00:00:00.000Z');
  assert.equal(alertMatchSince(alert, true), null);
});

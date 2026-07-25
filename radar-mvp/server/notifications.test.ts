import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlertDigestHtml } from './notifications.js';

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

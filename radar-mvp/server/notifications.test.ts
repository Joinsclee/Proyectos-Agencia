import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALERT_EMAIL_TEMPLATE_VERSION,
  alertMatchSince,
  alertDeliveryIdempotencyKey,
  buildAlertDigestHtml,
  buildAlertDigestText,
  nextAlertRetryAt,
  parseAlertDispatchCanary,
} from './notifications.js';

test('el resumen de alerta escapa contenido y contiene una ruta administrable', () => {
  const html = buildAlertDigestHtml({
    id: 'alert-1',
    city: 'bogota',
    budget: '500',
    type: ['apartment'] as ('apartment')[],
    frequency: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }, [{
    id: 'property-1',
    source: '<script>alert(1)</script>',
    type: 'Apartamento',
    city: 'Bogotá',
    zone: 'Chapinero',
    price: 300_000_000,
    discount_pct: 25,
    area_m2: 72,
    image_url: 'https://images.example.com/property.jpg',
  }]);
  assert.match(html, /RADAR <span style="color:#f2ca04">CRECE/);
  assert.match(html, /300\.000\.000/);
  assert.match(html, /Chapinero/);
  assert.match(html, /property\.jpg/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /city=bogota/);
  // Poder darse de baja no es opcional en un correo comercial.
  assert.match(html, /Modificarla o darte de baja/);

  // El cartel promocional de la cabecera se retiró: se comía la primera
  // pantalla entera de un correo que se recibe cada semana, y quien lo abre
  // viene a ver inmuebles, no un eslogan.
  assert.doesNotMatch(html, /login-poster\.jpg/, 'sin banner promocional');

  // Lo que justifica el envío va arriba y con el número delante.
  assert.match(html, /1 oportunidad nueva en Bogotá/, 'singular bien concordado');
  assert.match(html, /25% por debajo de comparables/);

  // El botón se construye con tabla y `bgcolor`: Outlook ignora el padding de
  // un <a> con fondo y lo deja en un texto suelto en medio de la tarjeta.
  assert.match(html, /bgcolor="#613174"/);

  // Gmail y Apple Mail convierten direcciones en enlaces a Maps, y ese clic
  // compite con el botón de la tarjeta.
  assert.match(html, /format-detection/);
  assert.match(html, /x-apple-data-detectors/);

  // El texto de la bandeja de entrada. Sin él, el cliente de correo enseña la
  // primera migaja que encuentre del cuerpo.
  assert.match(html, /por debajo de sus comparables\. Tu alerta de Bogotá/);

  // Gmail recorta a partir de ~102 KB y esconde el resto tras «ver mensaje
  // completo», que es donde muere la mitad de los clics.
  assert.ok(Buffer.byteLength(html, 'utf8') < 92_000, `el correo pesa ${Buffer.byteLength(html, 'utf8')} bytes`);
});

test('incluye una alternativa de texto útil para clientes sin HTML', () => {
  const text = buildAlertDigestText({
    id: 'alert-1',
    city: 'bogota',
    budget: '500',
    type: ['apartment'] as ('apartment')[],
    frequency: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }, [{
    id: 'property-1',
    source: 'fincaraiz',
    type: 'apartment',
    city: 'bogota',
    price: 300_000_000,
    discount_pct: 25,
  }]);
  assert.match(text, /RADAR CRECE/);
  assert.match(text, /Apartamento en Bogotá/);
  assert.match(text, /300\.000\.000/);
  assert.match(text, /Administra o elimina esta alerta/);
});

test('genera una clave estable para reintentos del mismo correo', () => {
  const alert = {
    id: 'alert-1',
    city: 'bogota',
    budget: '500',
    type: ['apartment'] as ('apartment')[],
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
  assert.match(ALERT_EMAIL_TEMPLATE_VERSION, /^v\d/);
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
    type: ['apartment'] as ('apartment')[],
    frequency: 'weekly' as const,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    lastCheckedAt: '2026-07-20T00:00:00.000Z',
  };
  assert.equal(alertMatchSince(alert), '2026-07-20T00:00:00.000Z');
  assert.equal(alertMatchSince(alert, true), null);
});

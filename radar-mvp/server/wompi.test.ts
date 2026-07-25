import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  RADAR_PRO_AMOUNT_IN_CENTS,
  createWompiCheckoutFields,
  createWompiIntegritySignature,
  verifyWompiEvent,
} from './wompi.js';

const eventsSecret = 'test_events_demo';

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function signedEvent(overrides: Record<string, unknown> = {}) {
  const timestamp = 1_721_850_000_000;
  const transaction = {
    id: 'wompi-transaction-1',
    amount_in_cents: RADAR_PRO_AMOUNT_IN_CENTS,
    reference: 'RADAR-ABC123ABC123ABC123ABC123',
    currency: 'COP',
    status: 'APPROVED',
    payment_method_type: 'CARD',
    ...overrides,
  };
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const eventChecksum = checksum(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${eventsSecret}`);
  return {
    event: 'transaction.updated',
    data: { transaction },
    environment: 'test',
    signature: { properties, checksum: eventChecksum },
    timestamp,
  };
}

test('firma el checkout en el orden contractual de Wompi', () => {
  assert.equal(
    createWompiIntegritySignature('RADAR-ABC123', 4_990_000, 'COP', 'test_integrity_demo'),
    '3a1c66ed0a4f32ada3b191c2141560e13ee168418c51b64dd02915619a949371',
  );
});

test('construye únicamente campos públicos para el checkout Sandbox', () => {
  const fields = createWompiCheckoutFields({
    publicKey: 'pub_test_demo',
    integritySecret: 'test_integrity_demo',
    reference: 'RADAR-ABC123',
    redirectUrl: 'http://localhost:8787/pago?reference=RADAR-ABC123',
    customerEmail: 'demo@example.com',
  });
  assert.equal(fields['public-key'], 'pub_test_demo');
  assert.equal(fields['amount-in-cents'], '4990000');
  assert.equal(fields.currency, 'COP');
  assert.match(fields['signature:integrity'], /^[a-f0-9]{64}$/);
  assert.equal(Object.values(fields).some((value) => value.includes('test_integrity_demo')), false);
});

test('acepta un webhook firmado y respeta el orden dinámico de propiedades', () => {
  const event = signedEvent();
  const result = verifyWompiEvent(event, eventsSecret, event.signature.checksum);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.event.data.transaction.status, 'APPROVED');
});

test('rechaza manipulación del monto o del checksum de cabecera', () => {
  const event = signedEvent();
  const tampered = structuredClone(event);
  tampered.data.transaction.amount_in_cents = 100;
  assert.deepEqual(verifyWompiEvent(tampered, eventsSecret), {
    ok: false,
    error: 'Firma del evento inválida',
  });
  assert.deepEqual(verifyWompiEvent(event, eventsSecret, '0'.repeat(64)), {
    ok: false,
    error: 'Checksum de cabecera inválido',
  });
});

test('rechaza eventos de producción en el flujo demo', () => {
  const event = { ...signedEvent(), environment: 'prod' };
  assert.deepEqual(verifyWompiEvent(event, eventsSecret), {
    ok: false,
    error: 'Evento de Wompi inválido',
  });
});

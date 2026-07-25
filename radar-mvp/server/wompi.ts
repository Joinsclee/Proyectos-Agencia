import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/';
export const WOMPI_CURRENCY = 'COP';
export const RADAR_PRO_PRICE_COP = 49_900;
export const RADAR_PRO_AMOUNT_IN_CENTS = RADAR_PRO_PRICE_COP * 100;
export const RADAR_PRO_ACCESS_DAYS = 30;
export const RADAR_PAYMENT_REFERENCE_PREFIX = 'RADAR-';

const WompiTransactionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  amount_in_cents: z.number().int().positive(),
  reference: z.string().trim().min(1).max(100),
  currency: z.string().trim().length(3),
  status: z.enum(['PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED']),
  payment_method_type: z.string().trim().min(1).max(80).optional(),
}).passthrough();

export const WompiEventSchema = z.object({
  event: z.literal('transaction.updated'),
  data: z.object({
    transaction: WompiTransactionSchema,
  }).passthrough(),
  environment: z.literal('test'),
  signature: z.object({
    properties: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  }).strict(),
  timestamp: z.number().int().min(1_500_000_000_000).max(4_000_000_000_000),
}).passthrough();

export type WompiEvent = z.infer<typeof WompiEventSchema>;
export type WompiPaymentStatus = WompiEvent['data']['transaction']['status'];

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left.toLowerCase(), 'hex'), Buffer.from(right.toLowerCase(), 'hex'));
}

function propertyValue(event: WompiEvent, property: string): unknown {
  const parts = property.split('.');
  let current: unknown = property.startsWith('data.') ? event : event.data;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function createWompiIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string {
  return sha256(`${reference}${amountInCents}${currency}${integritySecret}`);
}

export function createWompiCheckoutFields(input: {
  publicKey: string;
  integritySecret: string;
  reference: string;
  redirectUrl: string;
  customerEmail?: string;
  customerName?: string;
}): Record<string, string> {
  const fields: Record<string, string> = {
    'public-key': input.publicKey,
    currency: WOMPI_CURRENCY,
    'amount-in-cents': String(RADAR_PRO_AMOUNT_IN_CENTS),
    reference: input.reference,
    'signature:integrity': createWompiIntegritySignature(
      input.reference,
      RADAR_PRO_AMOUNT_IN_CENTS,
      WOMPI_CURRENCY,
      input.integritySecret,
    ),
    'redirect-url': input.redirectUrl,
  };
  if (input.customerEmail) fields['customer-data:email'] = input.customerEmail;
  if (input.customerName) fields['customer-data:full-name'] = input.customerName;
  return fields;
}

export function verifyWompiEvent(
  input: unknown,
  eventsSecret: string,
  headerChecksum?: string,
): { ok: true; event: WompiEvent } | { ok: false; error: string } {
  const parsed = WompiEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Evento de Wompi inválido' };

  const event = parsed.data;
  const values: string[] = [];
  for (const property of event.signature.properties) {
    const value = propertyValue(event, property);
    if (value === undefined || value === null || typeof value === 'object') {
      return { ok: false, error: `Propiedad de firma inválida: ${property}` };
    }
    values.push(String(value));
  }

  const expected = sha256(`${values.join('')}${event.timestamp}${eventsSecret}`);
  if (!safeHexEqual(expected, event.signature.checksum)) {
    return { ok: false, error: 'Firma del evento inválida' };
  }
  if (headerChecksum && !safeHexEqual(event.signature.checksum, headerChecksum)) {
    return { ok: false, error: 'Checksum de cabecera inválido' };
  }
  return { ok: true, event };
}

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { supabase } from '../lib/supabase.js';
import { applyWompiSubscription } from './account.js';
import {
  RADAR_PAYMENT_REFERENCE_PREFIX,
  RADAR_PRO_ACCESS_DAYS,
  RADAR_PRO_AMOUNT_IN_CENTS,
  WOMPI_CHECKOUT_URL,
  WOMPI_CURRENCY,
  createWompiCheckoutFields,
  verifyWompiEvent,
  type WompiPaymentStatus,
} from './wompi.js';

const PaymentReferenceSchema = z.string()
  .trim()
  .regex(/^RADAR-[A-Z0-9]{24,64}$/, 'Referencia de pago inválida');

type PaymentRow = {
  id: string;
  reference: string;
  status: WompiPaymentStatus;
  amount_in_cents: number;
  currency: string;
  transaction_id: string | null;
  payment_method_type: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  valid_until: string | null;
};

export function wompiPaymentDemoReady(): boolean {
  return Boolean(env.WOMPI_PUBLIC_KEY && env.WOMPI_INTEGRITY_SECRET && env.WOMPI_EVENTS_SECRET);
}

function publicPayment(row: PaymentRow) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    amountInCents: row.amount_in_cents,
    currency: row.currency,
    transactionId: row.transaction_id,
    paymentMethodType: row.payment_method_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    validUntil: row.valid_until,
  };
}

export async function createWompiCheckout(
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> | null },
) {
  if (!wompiPaymentDemoReady()) {
    return { ok: false as const, status: 503, error: 'El checkout demo aún no está configurado' };
  }

  const reference = `${RADAR_PAYMENT_REFERENCE_PREFIX}${randomUUID().replaceAll('-', '').toUpperCase()}`;
  const { data, error } = await supabase
    .from('radar_payments')
    .insert({
      reference,
      user_id: user.id,
      provider: 'wompi',
      environment: 'test',
      amount_in_cents: RADAR_PRO_AMOUNT_IN_CENTS,
      currency: WOMPI_CURRENCY,
      status: 'PENDING',
    })
    .select('id, reference, status, amount_in_cents, currency, transaction_id, payment_method_type, created_at, updated_at, paid_at, valid_until')
    .single();
  if (error || !data) {
    return { ok: false as const, status: 500, error: 'No se pudo preparar el pago demo' };
  }

  const redirect = new URL('/pago', env.APP_BASE_URL);
  redirect.searchParams.set('reference', reference);
  const fields = createWompiCheckoutFields({
    publicKey: env.WOMPI_PUBLIC_KEY!,
    integritySecret: env.WOMPI_INTEGRITY_SECRET!,
    reference,
    redirectUrl: redirect.toString(),
    customerEmail: user.email,
    customerName: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : undefined,
  });

  return {
    ok: true as const,
    checkout: {
      action: WOMPI_CHECKOUT_URL,
      method: 'GET',
      fields,
      payment: publicPayment(data as PaymentRow),
      accessDays: RADAR_PRO_ACCESS_DAYS,
      sandbox: true,
    },
  };
}

export async function getWompiPayment(userId: string, referenceInput: unknown) {
  const parsed = PaymentReferenceSchema.safeParse(referenceInput);
  if (!parsed.success) return { ok: false as const, status: 400, error: parsed.error.issues[0]?.message };

  const { data, error } = await supabase
    .from('radar_payments')
    .select('id, reference, status, amount_in_cents, currency, transaction_id, payment_method_type, created_at, updated_at, paid_at, valid_until')
    .eq('user_id', userId)
    .eq('reference', parsed.data)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: 'No se pudo consultar el pago' };
  if (!data) return { ok: false as const, status: 404, error: 'Pago no encontrado' };
  return { ok: true as const, payment: publicPayment(data as PaymentRow) };
}

export async function processWompiEvent(input: unknown, headerChecksum?: string) {
  if (!wompiPaymentDemoReady()) {
    return { ok: false as const, status: 503, error: 'Wompi Sandbox no está configurado' };
  }
  const verified = verifyWompiEvent(input, env.WOMPI_EVENTS_SECRET!, headerChecksum);
  if (!verified.ok) return { ok: false as const, status: 401, error: verified.error };

  const transaction = verified.event.data.transaction;
  if (!transaction.reference.startsWith(RADAR_PAYMENT_REFERENCE_PREFIX)) {
    return { ok: true as const, status: 200, received: true, ignored: true };
  }
  if (
    transaction.amount_in_cents !== RADAR_PRO_AMOUNT_IN_CENTS
    || transaction.currency !== WOMPI_CURRENCY
  ) {
    return { ok: false as const, status: 400, error: 'El evento no corresponde al producto Radar Pro demo' };
  }

  const { data, error } = await supabase.rpc('apply_wompi_payment_event', {
    p_reference: transaction.reference,
    p_transaction_id: transaction.id,
    p_status: transaction.status,
    p_payment_method_type: transaction.payment_method_type ?? null,
    p_amount_in_cents: transaction.amount_in_cents,
    p_currency: transaction.currency,
    p_event_timestamp: verified.event.timestamp,
    p_checksum: verified.event.signature.checksum.toLowerCase(),
    p_access_days: RADAR_PRO_ACCESS_DAYS,
  });
  const row = (Array.isArray(data) ? data[0] : data) as (PaymentRow & { user_id: string; applied: boolean }) | null;
  if (error || !row) {
    return { ok: false as const, status: 500, error: 'No se pudo conciliar el evento de pago' };
  }

  // Se reconcilia incluso en eventos duplicados: si Supabase Auth falló después
  // de persistir el primer webhook, el reintento de Wompi repara el acceso.
  if (row.status === 'APPROVED' || row.status === 'VOIDED') {
    await applyWompiSubscription(row.user_id, {
      status: row.status,
      reference: row.reference,
      transactionId: row.transaction_id ?? transaction.id,
      validUntil: row.valid_until,
      eventAt: row.paid_at ?? new Date(verified.event.timestamp).toISOString(),
    });
  }

  return {
    ok: true as const,
    status: 200,
    received: true,
    applied: row.applied,
  };
}

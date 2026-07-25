import { createHash, randomUUID } from 'node:crypto';
import { env } from '../lib/env.js';
import { supabase } from '../lib/supabase.js';
import {
  isAlertDue,
  readAlerts,
  readDeliveryHistory,
  type RadarAlert,
  type RadarDeliveryRecord,
} from './commercial.js';

interface AlertMatch {
  id: string;
  source: string;
  type: string | null;
  city: string | null;
  price: number | null;
  discount_pct: number | null;
}

export function emailDeliveryReady(): boolean {
  return Boolean(env.RESEND_API_KEY && env.ALERTS_FROM_EMAIL);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

export function buildAlertDigestHtml(alert: RadarAlert, matches: AlertMatch[]): string {
  const rows = matches.map((match) => {
    const price = match.price ? `$${Math.round(match.price).toLocaleString('es-CO')}` : 'Precio por confirmar';
    const discount = match.discount_pct != null ? ` · ${Math.round(match.discount_pct)}% bajo comparables` : '';
    return `<li style="margin:0 0 12px"><strong>${escapeHtml(match.type || 'Inmueble')} en ${escapeHtml(match.city || alert.city)}</strong><br>${escapeHtml(price + discount)} · ${escapeHtml(match.source)}</li>`;
  }).join('');
  const searchUrl = new URL('/', env.APP_BASE_URL);
  searchUrl.searchParams.set('city', alert.city);
  if (alert.type) searchUrl.searchParams.set('type', alert.type);
  if (alert.budget) searchUrl.searchParams.set('priceMax', alert.budget);

  return `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#23132b;line-height:1.45">
    <div style="max-width:620px;margin:auto;padding:28px">
      <p style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#613174">Radar CRECE · Resumen semanal</p>
      <h1 style="font-size:28px">Nuevas coincidencias en ${escapeHtml(alert.city)}</h1>
      <p>Encontramos ${matches.length} oportunidad${matches.length === 1 ? '' : 'es'} que coincide${matches.length === 1 ? '' : 'n'} con tu Radar.</p>
      <ul style="padding-left:20px">${rows}</ul>
      <p><a href="${escapeHtml(searchUrl.toString())}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#613174;color:#fff;text-decoration:none;font-weight:700">Abrir mi Radar</a></p>
      <p style="font-size:12px;color:#6f6476">Puedes administrar o eliminar esta alerta desde la sección Mi cuenta. La información es orientativa y debe verificarse antes de invertir.</p>
    </div>
  </body></html>`;
}

async function alertMatches(alert: RadarAlert): Promise<AlertMatch[]> {
  let query = supabase
    .from('inmuebles')
    .select('id,source,type,city,price,discount_pct')
    .eq('is_active', true)
    .eq('city', alert.city)
    .in('crece_tier', ['oportunidad', 'oportunidad_fuerte'])
    .order('discount_pct', { ascending: false })
    .limit(12);
  if (alert.type) query = query.eq('type', alert.type);
  if (alert.budget) query = query.lte('price', Number(alert.budget) * 1_000_000);
  const since = alert.lastCheckedAt || alert.createdAt;
  if (Number.isFinite(Date.parse(since))) query = query.gte('created_at', since);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AlertMatch[];
}

export function alertDeliveryIdempotencyKey(
  userId: string,
  alert: RadarAlert,
  matches: AlertMatch[],
): string {
  const fingerprint = createHash('sha256')
    .update(`${userId}:${alert.id}:${matches.map((match) => match.id).sort().join(',')}`)
    .digest('hex')
    .slice(0, 40);
  return `radar-alert/${alert.id.slice(0, 24)}/${fingerprint}`;
}

export function nextAlertRetryAt(failures: number, now = new Date()): string {
  const retryMinutes = [15, 60, 6 * 60, 24 * 60];
  const delay = retryMinutes[Math.min(Math.max(failures - 1, 0), retryMinutes.length - 1)];
  return new Date(now.getTime() + delay * 60 * 1000).toISOString();
}

async function sendDigest(
  to: string,
  alert: RadarAlert,
  matches: AlertMatch[],
  idempotencyKey: string,
) {
  if (!env.RESEND_API_KEY || !env.ALERTS_FROM_EMAIL) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: env.ALERTS_FROM_EMAIL,
      to: [to],
      subject: `${matches.length} coincidencia${matches.length === 1 ? '' : 's'} en tu Radar de ${alert.city}`,
      html: buildAlertDigestHtml(alert, matches),
    }),
  });
  if (!response.ok) throw new Error(`Proveedor de correo respondió HTTP ${response.status}`);
  const result = await response.json().catch(() => ({})) as { id?: string };
  return { sent: true as const, providerMessageId: result.id };
}

export async function runAlertDispatch(now = new Date()) {
  if (!emailDeliveryReady()) {
    return {
      ok: false as const,
      configured: false,
      scannedUsers: 0,
      dueAlerts: 0,
      sent: 0,
      noMatches: 0,
      failed: 0,
      errors: [] as string[],
    };
  }

  let scannedUsers = 0;
  let dueAlerts = 0;
  let sent = 0;
  let noMatches = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    scannedUsers += data.users.length;
    for (const user of data.users) {
      const metadata = { ...(user.user_metadata ?? {}) };
      const alerts = readAlerts(metadata);
      const deliveries = readDeliveryHistory(metadata);
      let changed = false;
      for (const alert of alerts) {
        if (!isAlertDue(alert, now)) continue;
        dueAlerts += 1;
        const attemptedAt = now.toISOString();
        let matchCount = 0;
        try {
          const matches = await alertMatches(alert);
          matchCount = matches.length;
          let delivery: RadarDeliveryRecord;
          if (matches.length) {
            if (!user.email) throw new Error('Correo de cuenta no disponible');
            const result = await sendDigest(
              user.email,
              alert,
              matches,
              alertDeliveryIdempotencyKey(user.id, alert, matches),
            );
            alert.lastSentAt = attemptedAt;
            alert.lastDeliveryStatus = 'sent';
            delivery = {
              id: randomUUID(),
              alertId: alert.id,
              attemptedAt,
              status: 'sent',
              matchCount: matches.length,
              providerMessageId: result && result.providerMessageId
                ? result.providerMessageId
                : undefined,
            };
            sent += 1;
          } else {
            alert.lastDeliveryStatus = 'no_matches';
            delivery = {
              id: randomUUID(),
              alertId: alert.id,
              attemptedAt,
              status: 'no_matches',
              matchCount: matches.length,
            };
            noMatches += 1;
          }
          alert.lastCheckedAt = attemptedAt;
          alert.lastMatchCount = matches.length;
          alert.consecutiveFailures = 0;
          delete alert.nextRetryAt;
          delete alert.lastError;
          deliveries.unshift(delivery);
          changed = true;
        } catch (alertError) {
          const errorMessage = (alertError instanceof Error ? alertError.message : String(alertError)).slice(0, 500);
          const failures = Math.min((alert.consecutiveFailures ?? 0) + 1, 10);
          const retryAt = nextAlertRetryAt(failures, now);
          alert.consecutiveFailures = failures;
          alert.nextRetryAt = retryAt;
          alert.lastError = errorMessage;
          alert.lastDeliveryStatus = 'failed';
          deliveries.unshift({
            id: randomUUID(),
            alertId: alert.id,
            attemptedAt,
            status: 'failed',
            matchCount,
            error: errorMessage,
            retryAt,
          });
          changed = true;
          failed += 1;
          errors.push(`${user.id.slice(0, 8)}:${alert.id.slice(0, 8)} ${errorMessage}`);
        }
      }
      if (changed) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...metadata,
            radar_alerts: alerts,
            radar_alert_deliveries: deliveries.slice(0, 50),
          },
        });
        if (updateError) errors.push(`${user.id.slice(0, 8)} metadata ${updateError.message}`);
      }
    }
    if (data.users.length < 1000) break;
  }

  return {
    ok: errors.length === 0,
    configured: true,
    scannedUsers,
    dueAlerts,
    sent,
    noMatches,
    failed,
    errors,
  };
}

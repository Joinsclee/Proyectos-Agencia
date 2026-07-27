import { createHash, randomUUID } from 'node:crypto';
import { env } from '../lib/env.js';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import {
  isAlertDue,
  readAlerts,
  readDeliveryHistory,
  type RadarAlert,
  type RadarDeliveryRecord,
} from './commercial.js';

export interface AlertMatch {
  id: string;
  source: string;
  type: string | null;
  city: string | null;
  zone?: string | null;
  address?: string | null;
  price: number | null;
  discount_pct: number | null;
  area_m2?: number | null;
  image_url?: string | null;
  source_url?: string | null;
}

export const ALERT_EMAIL_TEMPLATE_VERSION = 'v2-premium';
const ALERT_MAX_CREDIBLE_DISCOUNT = 60;
const ALERT_EMAIL_FEATURED_LIMIT = 3;

export interface AlertDispatchCanary {
  email: string;
  alertId: string;
}

export type AlertDispatchCanaryParseResult =
  | { ok: true; canary?: AlertDispatchCanary }
  | { ok: false; error: string };

const log = createLogger('alertas');

export function emailDeliveryReady(): boolean {
  return Boolean(env.RESEND_API_KEY && env.ALERTS_FROM_EMAIL);
}

/**
 * Tener Resend configurado NO significa que salgan correos: el despachador es el
 * trabajo `alertas` de `radar_cron_jobs`, que nace deshabilitado y solo se activa
 * con la aprobación expresa del responsable del producto (runbook §1).
 *
 * Hasta el 2026-07-27 la cuenta le decía al usuario "las alertas se procesan en el
 * ciclo semanal" mirando solo el proveedor, con el despachador apagado.
 */
const DESPACHO_TTL_MS = 60_000;
/** `/api/config` es sonda del monitor (presupuesto 3 s) y bloquea el render de
 *  `/cuenta` y del botón de Google: esta consulta no puede tardar más que esto. */
const DESPACHO_TIMEOUT_MS = 800;
let despachoCache: { at: number; enabled: boolean } | null = null;
let despachoEnVuelo: Promise<boolean> | null = null;

export async function alertDispatchEnabled(now = Date.now()): Promise<boolean> {
  if (despachoCache && now - despachoCache.at < DESPACHO_TTL_MS) return despachoCache.enabled;
  // Se memoriza la promesa, no solo el valor: `/api/config` no tiene límite de
  // tasa, y una ráfaga sobre la caché fría dispararía N consultas simultáneas.
  if (despachoEnVuelo) return despachoEnVuelo;

  despachoEnVuelo = (async () => {
    try {
      const { data, error } = await supabase
        .from('radar_cron_jobs')
        .select('habilitado')
        .eq('nombre', 'alertas')
        .abortSignal(AbortSignal.timeout(DESPACHO_TIMEOUT_MS))
        .maybeSingle();
      if (error) throw new Error(error.message);
      const enabled = (data as { habilitado?: boolean } | null)?.habilitado === true;
      despachoCache = { at: Date.now(), enabled };
      return enabled;
    } catch (e) {
      // Ante la duda se informa "en pausa": prometer de menos es preferible a
      // decirle a alguien que recibirá correos que nadie va a enviar. NO se
      // cachea el fallo — un hipo de Supabase no debe apagar el mensaje durante
      // un minuto entero para todos los usuarios.
      log.warn(`alertDispatchEnabled: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      despachoEnVuelo = null;
    }
  })();

  return despachoEnVuelo;
}

export function parseAlertDispatchCanary(input: unknown): AlertDispatchCanaryParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: true };
  const body = input as Record<string, unknown>;
  const rawEmail = typeof body.canaryEmail === 'string' ? body.canaryEmail.trim().toLowerCase() : '';
  const rawAlertId = typeof body.canaryAlertId === 'string' ? body.canaryAlertId.trim() : '';
  if (!rawEmail && !rawAlertId) return { ok: true };
  if (!rawEmail || !rawAlertId) {
    return { ok: false, error: 'La prueba canario requiere correo e identificador de alerta' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return { ok: false, error: 'Correo canario inválido' };
  }
  if (!/^[A-Za-z0-9-]{1,128}$/.test(rawAlertId)) {
    return { ok: false, error: 'Identificador de alerta canario inválido' };
  }
  return { ok: true, canary: { email: rawEmail, alertId: rawAlertId } };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

function safeHttpUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function displayCity(value: string | null | undefined): string {
  const city = String(value ?? '').trim().toLowerCase();
  const known: Record<string, string> = {
    bogota: 'Bogotá',
    medellin: 'Medellín',
    cali: 'Cali',
    barranquilla: 'Barranquilla',
    cartagena: 'Cartagena',
    bucaramanga: 'Bucaramanga',
    pereira: 'Pereira',
    armenia: 'Armenia',
    manizales: 'Manizales',
  };
  if (known[city]) return known[city];
  return city ? city.charAt(0).toUpperCase() + city.slice(1) : 'Colombia';
}

function propertyTypeLabel(value: string | null | undefined): string {
  const type = String(value ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    apartment: 'Apartamento',
    house: 'Casa',
    commercial: 'Local comercial',
    office: 'Oficina',
    lot: 'Lote',
    farm: 'Finca',
    parking: 'Parqueadero',
  };
  return labels[type] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Inmueble');
}

function sourceLabel(value: string): string {
  const labels: Record<string, string> = {
    fincaraiz: 'FincaRaíz',
    bancolombia: 'Bancolombia',
    davivienda: 'Davivienda',
    bbva: 'BBVA',
    aval: 'Grupo Aval',
  };
  return labels[value.toLowerCase()] ?? value;
}

function moneyLabel(value: number | null): string {
  return value
    ? `$${Math.round(value).toLocaleString('es-CO')}`
    : 'Precio por confirmar';
}

function alertSearchUrl(alert: RadarAlert): string {
  const searchUrl = new URL('/', env.APP_BASE_URL);
  searchUrl.searchParams.set('city', alert.city);
  if (alert.type) searchUrl.searchParams.set('type', alert.type);
  if (alert.budget) searchUrl.searchParams.set('priceMax', alert.budget);
  return searchUrl.toString();
}

function matchImageUrl(match: AlertMatch): string {
  const remote = safeHttpUrl(match.image_url);
  if (remote) return remote;
  const fallbackType = ['apartment', 'house', 'commercial', 'office', 'lot', 'farm', 'parking']
    .includes(match.type ?? '') ? match.type : 'unknown';
  return new URL(`/img/ph/${fallbackType}.jpg`, env.APP_BASE_URL).toString();
}

export function buildAlertDigestHtml(alert: RadarAlert, matches: AlertMatch[]): string {
  const city = displayCity(alert.city);
  const searchUrl = alertSearchUrl(alert);
  const accountUrl = new URL('/cuenta', env.APP_BASE_URL).toString();
  const heroUrl = new URL('/radar/login-poster.jpg', env.APP_BASE_URL).toString();
  const featured = matches.slice(0, ALERT_EMAIL_FEATURED_LIMIT);
  const cards = featured.map((match) => {
    const matchCity = displayCity(match.city || alert.city);
    const location = [match.zone, match.address].filter(Boolean).join(' · ') || matchCity;
    const discount = match.discount_pct != null ? `${Math.round(match.discount_pct)}% bajo comparables` : 'Oportunidad CRECE';
    const details = [
      match.area_m2 ? `${Math.round(match.area_m2)} m²` : null,
      sourceLabel(match.source),
    ].filter(Boolean).join(' · ');
    return `
      <tr>
        <td style="padding:0 28px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7ddea;border-radius:14px;background:#ffffff;overflow:hidden">
            <tr>
              <td class="card-image" width="190" valign="top" style="width:190px;background:#2a1438">
                <img src="${escapeHtml(matchImageUrl(match))}" width="190" height="132" alt="${escapeHtml(`${propertyTypeLabel(match.type)} en ${matchCity}`)}" style="display:block;width:190px;height:132px;object-fit:cover;border:0">
              </td>
              <td class="card-content" valign="top" style="padding:18px 20px">
                <div style="display:inline-block;padding:5px 9px;border-radius:99px;background:#fff5bf;color:#4a2560;font-size:11px;line-height:1;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(discount)}</div>
                <h3 style="margin:10px 0 5px;color:#2a1438;font-size:20px;line-height:1.2;font-weight:800">${escapeHtml(`${propertyTypeLabel(match.type)} en ${matchCity}`)}</h3>
                <p style="margin:0 0 10px;color:#76677e;font-size:13px;line-height:1.4">${escapeHtml(location)}</p>
                <p style="margin:0;color:#4a2560;font-size:21px;line-height:1.15;font-weight:800">${escapeHtml(moneyLabel(match.price))}</p>
                <p style="margin:6px 0 0;color:#8b7c92;font-size:12px;line-height:1.35">${escapeHtml(details)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('');
  const budget = alert.budget
    ? `Hasta $${Number(alert.budget).toLocaleString('es-CO')} M`
    : 'Sin tope';
  const opportunityNoun = matches.length === 1 ? 'oportunidad' : 'oportunidades';
  const preheader = `${matches.length} ${opportunityNoun} nueva${matches.length === 1 ? '' : 's'} en ${city}, seleccionada${matches.length === 1 ? '' : 's'} por tu Radar CRECE.`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Radar CRECE · ${escapeHtml(city)}</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { width:100% !important; border-radius:0 !important; }
      .mobile-pad { padding-left:20px !important; padding-right:20px !important; }
      .card-image, .card-content { display:block !important; width:100% !important; }
      .card-image img { width:100% !important; height:190px !important; }
      .metric { display:block !important; width:100% !important; padding:8px 0 !important; }
      .brand-tag { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f0f6;color:#23132b;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0f6">
    <tr>
      <td align="center" style="padding:24px 10px">
        <table class="email-shell" role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 45px rgba(42,20,56,.14)">
          <tr>
            <td style="padding:20px 28px;background:#2a1438;border-bottom:3px solid #f2ca04">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#ffffff;font-size:17px;line-height:1.2;font-weight:800;letter-spacing:.02em">RADAR <span style="color:#f2ca04">CRECE</span></td>
                  <td class="brand-tag" align="right" style="color:#cbbdd2;font-size:11px;line-height:1.2;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Inteligencia inmobiliaria</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <img src="${escapeHtml(heroUrl)}" width="640" alt="Radar de Oportunidades CRECE" style="display:block;width:100%;max-width:640px;height:auto;border:0">
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:32px 36px 20px">
              <p style="margin:0 0 9px;color:#613174;font-size:12px;line-height:1.3;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Tu resumen personalizado</p>
              <h1 style="margin:0 0 12px;color:#2a1438;font-size:32px;line-height:1.12;font-weight:800">Tu Radar encontró ${matches.length} oportunidad${matches.length === 1 ? '' : 'es'} en ${escapeHtml(city)}</h1>
              <p style="margin:0;color:#6f6476;font-size:16px;line-height:1.55">Seleccionamos inmuebles activos que cumplen tus criterios y muestran una diferencia atractiva frente a sus comparables.</p>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:4px 36px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1fa;border:1px solid #eadfee;border-radius:12px">
                <tr>
                  <td class="metric" width="33%" align="center" style="padding:16px 8px;border-right:1px solid #eadfee">
                    <div style="color:#613174;font-size:22px;font-weight:800">${matches.length}</div>
                    <div style="color:#817187;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${matches.length === 1 ? 'Coincidencia' : 'Coincidencias'}</div>
                  </td>
                  <td class="metric" width="33%" align="center" style="padding:16px 8px;border-right:1px solid #eadfee">
                    <div style="color:#613174;font-size:18px;font-weight:800">${escapeHtml(city)}</div>
                    <div style="color:#817187;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Ciudad</div>
                  </td>
                  <td class="metric" width="34%" align="center" style="padding:16px 8px">
                    <div style="color:#613174;font-size:18px;font-weight:800">${escapeHtml(budget)}</div>
                    <div style="color:#817187;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Presupuesto</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:0 28px 14px">
              <h2 style="margin:0;color:#2a1438;font-size:21px;line-height:1.25;font-weight:800">Oportunidades destacadas</h2>
              <p style="margin:5px 0 0;color:#8b7c92;font-size:13px;line-height:1.4">Una selección de las mejores coincidencias de este corte.</p>
            </td>
          </tr>
          ${cards}
          <tr>
            <td class="mobile-pad" align="center" style="padding:16px 36px 36px">
              <a href="${escapeHtml(searchUrl)}" style="display:inline-block;padding:15px 28px;border-radius:10px;background:#613174;color:#ffffff;font-size:15px;line-height:1.2;font-weight:800;text-decoration:none">Ver ${matches.length === 1 ? 'la oportunidad' : `las ${matches.length} oportunidades`} en mi Radar</a>
              <p style="margin:12px 0 0;color:#8b7c92;font-size:12px;line-height:1.4">Accede para comparar, guardar y analizar cada inmueble.</p>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:25px 36px;background:#2a1438;border-top:3px solid #f2ca04">
              <p style="margin:0 0 8px;color:#ffffff;font-size:14px;line-height:1.45;font-weight:700">Decisiones con más contexto, no con más ruido.</p>
              <p style="margin:0 0 14px;color:#cbbdd2;font-size:11px;line-height:1.55">El Índice CRECE es una señal orientativa basada en comparables. Verifica precio, estado jurídico y condiciones del inmueble antes de invertir.</p>
              <p style="margin:0;color:#cbbdd2;font-size:11px;line-height:1.5">Puedes <a href="${escapeHtml(accountUrl)}" style="color:#f2ca04;text-decoration:underline">administrar o eliminar esta alerta</a> desde Mi cuenta.</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#8f8494;font-size:10px;line-height:1.5">Radar de Oportunidades · CRECE · Colombia</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAlertDigestText(alert: RadarAlert, matches: AlertMatch[]): string {
  const city = displayCity(alert.city);
  const featured = matches.slice(0, ALERT_EMAIL_FEATURED_LIMIT).map((match, index) => {
    const discount = match.discount_pct != null ? `${Math.round(match.discount_pct)}% bajo comparables` : 'Oportunidad CRECE';
    return `${index + 1}. ${propertyTypeLabel(match.type)} en ${displayCity(match.city || alert.city)}\n`
      + `   ${moneyLabel(match.price)} · ${discount} · ${sourceLabel(match.source)}`;
  }).join('\n\n');
  return `RADAR CRECE · RESUMEN PERSONALIZADO

Tu Radar encontró ${matches.length} oportunidad${matches.length === 1 ? '' : 'es'} en ${city}.

${featured}

Ver todas las oportunidades:
${alertSearchUrl(alert)}

Administra o elimina esta alerta:
${new URL('/cuenta', env.APP_BASE_URL)}

El Índice CRECE es una señal orientativa. Verifica la información antes de invertir.`;
}

export function alertMatchSince(alert: RadarAlert, includeExistingMatches = false): string | null {
  if (includeExistingMatches) return null;
  const since = alert.lastCheckedAt || alert.createdAt;
  return Number.isFinite(Date.parse(since)) ? since : null;
}

async function alertMatches(alert: RadarAlert, includeExistingMatches = false): Promise<AlertMatch[]> {
  let query = supabase
    .from('inmuebles')
    .select('id,source,type,city,zone,address,price,discount_pct,area_m2,image_url,source_url')
    .eq('is_active', true)
    .eq('city', alert.city)
    .in('crece_tier', ['oportunidad', 'oportunidad_fuerte'])
    .gt('discount_pct', 0)
    .lte('discount_pct', ALERT_MAX_CREDIBLE_DISCOUNT)
    .order('discount_pct', { ascending: false })
    .limit(12);
  if (alert.type) query = query.eq('type', alert.type);
  if (alert.budget) query = query.lte('price', Number(alert.budget) * 1_000_000);
  const since = alertMatchSince(alert, includeExistingMatches);
  if (since) query = query.gte('first_seen_at', since);
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
    .update(`${ALERT_EMAIL_TEMPLATE_VERSION}:${userId}:${alert.id}:${matches.map((match) => match.id).sort().join(',')}`)
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
      subject: `Radar CRECE: ${matches.length} oportunidad${matches.length === 1 ? '' : 'es'} en ${displayCity(alert.city)}`,
      html: buildAlertDigestHtml(alert, matches),
      text: buildAlertDigestText(alert, matches),
    }),
  });
  if (!response.ok) throw new Error(`Proveedor de correo respondió HTTP ${response.status}`);
  const result = await response.json().catch(() => ({})) as { id?: string };
  return { sent: true as const, providerMessageId: result.id };
}

export async function runAlertDispatch(now = new Date(), canary?: AlertDispatchCanary) {
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
  let targetFound = !canary;
  let targetAlertFound = !canary;
  let targetAlertActive = !canary;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      if (canary && (user.email ?? '').trim().toLowerCase() !== canary.email) continue;
      scannedUsers += 1;
      if (canary) targetFound = true;
      const metadata = { ...(user.user_metadata ?? {}) };
      const alerts = readAlerts(metadata);
      const deliveries = readDeliveryHistory(metadata);
      let changed = false;
      for (const alert of alerts) {
        if (canary && alert.id !== canary.alertId) continue;
        if (canary) {
          targetAlertFound = true;
          targetAlertActive = alert.active;
        }
        if (canary ? !alert.active : !isAlertDue(alert, now)) continue;
        dueAlerts += 1;
        const attemptedAt = now.toISOString();
        let matchCount = 0;
        try {
          const matches = await alertMatches(alert, Boolean(canary));
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
      if (canary) break;
    }
    if (canary && targetFound) break;
    if (data.users.length < 1000) break;
  }

  if (canary && !targetFound) errors.push('Cuenta canario no encontrada');
  if (canary && targetFound && !targetAlertFound) errors.push('Alerta canario no encontrada');
  if (canary && targetAlertFound && !targetAlertActive) errors.push('La alerta canario está inactiva');

  return {
    ok: errors.length === 0,
    configured: true,
    mode: canary ? 'canary' as const : 'scheduled' as const,
    scannedUsers,
    dueAlerts,
    sent,
    noMatches,
    failed,
    errors,
  };
}

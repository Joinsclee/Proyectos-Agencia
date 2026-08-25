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
/**
 * Cuántas tarjetas caben en el correo.
 *
 * Gmail recorta a partir de ~102 KB y esconde el resto tras «ver mensaje
 * completo», así que esto no es una preferencia editorial sino el límite del
 * medio. Seis inmuebles con foto entran de sobra; el resto se resume en una
 * línea con el botón al Radar, que es donde se ven todos sin recorte.
 *
 * Antes eran 3, y el asunto prometía doce.
 */
const ALERT_EMAIL_FEATURED_LIMIT = 6;

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

/** Los tipos de una alerta, venga como lista o como el valor único de antes. */
function tiposDeAlerta(alert: { type?: unknown }): string[] {
  if (Array.isArray(alert.type)) return alert.type.filter((t): t is string => typeof t === 'string' && t !== '');
  return typeof alert.type === 'string' && alert.type !== '' ? [alert.type] : [];
}

/**
 * Dos alertas que piden lo mismo son una alerta.
 *
 * Ciudad, tipos y presupuesto: si coinciden, el correo que saldría de una es el
 * que saldría de la otra. La idempotencia de envío no protege de esto —su clave
 * lleva el `alert.id`, así que dos identificadores distintos son dos correos—,
 * y no es hipotético: al revisar antes de encender el despacho, dos de las tres
 * cuentas con alertas tenían la suya duplicada. Una habría recibido el mismo
 * correo dos veces; la otra, dos correos con 1 y con 7 inmuebles, que es peor
 * porque parecen desmentirse.
 */
export function huellaDeAlerta(alert: RadarAlert): string {
  return [
    String(alert.city ?? '').trim().toLowerCase(),
    tiposDeAlerta(alert).slice().sort().join('+'),
    String(alert.budget ?? ''),
  ].join('|');
}

/**
 * De cada grupo de alertas gemelas, cuál manda.
 *
 * Gana la de ventana más antigua: `alertMatches` solo mira lo aparecido desde
 * `lastCheckedAt || createdAt`, así que la más vieja es la que trae más. En el
 * caso real, elegir por orden de array habría mandado la de 1 inmueble y
 * descartado la de 7.
 *
 * Devuelve, para cada id, el id de la que manda en su grupo. Una alerta sin
 * gemelas manda sobre sí misma, así que el caso normal no cambia en nada.
 */
export function principalesDeAlertas(alerts: RadarAlert[]): Map<string, string> {
  const porHuella = new Map<string, RadarAlert>();
  for (const a of alerts) {
    if (!a.active) continue;
    const h = huellaDeAlerta(a);
    const actual = porHuella.get(h);
    if (!actual || ventanaDe(a) < ventanaDe(actual)) porHuella.set(h, a);
  }
  const mando = new Map<string, string>();
  for (const a of alerts) {
    const jefa = a.active ? porHuella.get(huellaDeAlerta(a)) : undefined;
    mando.set(a.id, jefa ? jefa.id : a.id);
  }
  return mando;
}

/** Desde cuándo mira esta alerta. Sin fecha válida, desde el principio. */
function ventanaDe(a: RadarAlert): number {
  const t = Date.parse(a.lastCheckedAt || a.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

function alertSearchUrl(alert: RadarAlert): string {
  const searchUrl = new URL('/', env.APP_BASE_URL);
  searchUrl.searchParams.set('city', alert.city);
  // Un solo tipo en el enlace: el buscador filtra por uno. Con varios se manda sin
  // filtro de tipo —mejor mostrar de más que llevarle a un listado que no contiene
  // dos de las tres cosas que pidió— y el correo ya dice qué buscaba.
  const tiposUrl = tiposDeAlerta(alert);
  if (tiposUrl.length === 1) searchUrl.searchParams.set('type', tiposUrl[0]);
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

/**
 * El correo de alerta.
 *
 * ── Qué se cambió y por qué ──
 *
 * La versión anterior abría con un banner promocional a toda página —«Las
 * mejores oportunidades inmobiliarias están a la vista de todos»— que se comía
 * la primera pantalla entera. En un correo que llega cada semana, ese cartel se
 * lee una vez y estorba las cincuenta siguientes: quien abre una alerta viene a
 * ver inmuebles, y los inmuebles empezaban donde ya nadie mira.
 *
 * Y el asunto prometía doce oportunidades mientras el cuerpo enseñaba tres.
 *
 * Así lo resuelven los portales que viven de este correo —Idealista, Zillow,
 * Redfin—: cabecera mínima, el dato que justifica el envío arriba del todo, y a
 * partir de ahí una tarjeta por inmueble con la foto grande. Nada de hero.
 *
 * ── Las reglas del medio ──
 *
 * Un correo no es una página web:
 *
 *  · Tablas para maquetar. Ni flex ni grid: Outlook usa el motor de Word.
 *  · Estilos en línea. Gmail descarta buena parte de un `<style>`.
 *  · 600 px de ancho, que es el estándar que respetan todos los clientes.
 *  · Gmail RECORTA el correo a partir de ~102 KB y esconde el resto tras un
 *    «ver mensaje completo». Por eso el número de tarjetas está topado: doce
 *    inmuebles con foto caben; treinta no.
 *  · Botones con tabla y `bgcolor`, no un `<a>` con fondo: Outlook ignora el
 *    padding de los enlaces y el botón se queda en un texto suelto.
 *  · Las imágenes llegan bloqueadas por defecto en muchos buzones, así que
 *    ninguna carga información que no esté también en texto.
 */
export function buildAlertDigestHtml(alert: RadarAlert, matches: AlertMatch[]): string {
  const city = displayCity(alert.city);
  const searchUrl = alertSearchUrl(alert);
  const accountUrl = new URL('/cuenta', env.APP_BASE_URL).toString();
  const visibles = matches.slice(0, ALERT_EMAIL_FEATURED_LIMIT);
  const ocultas = Math.max(0, matches.length - visibles.length);
  const budget = alert.budget ? `hasta $${Number(alert.budget).toLocaleString('es-CO')} millones` : 'sin tope de precio';
  // Dos plurales distintos y no uno: «oportunidad» pide `-es` y «nueva» pide
  // `-s`. Con un solo sufijo salía «4 oportunidades nuevaes», que es la clase de
  // detalle que hace que un correo automático parezca hecho por una máquina.
  const varias = matches.length !== 1;
  const nOportunidades = `${matches.length} oportunidad${varias ? 'es' : ''} nueva${varias ? 's' : ''}`;

  /** Botón que sobrevive a Outlook: tabla con `bgcolor`, no un `<a>` con fondo. */
  const boton = (href: string, texto: string, ancho: 'auto' | 'full' = 'auto') => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"${ancho === 'full' ? ' width="100%"' : ''}>
      <tr>
        <td align="center" bgcolor="#613174" style="border-radius:10px">
          <a href="${escapeHtml(href)}" style="display:block;padding:14px 26px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:1.2;text-decoration:none;border-radius:10px">${escapeHtml(texto)}</a>
        </td>
      </tr>
    </table>`;

  const cards = visibles.map((match, i) => {
    const matchCity = displayCity(match.city || alert.city);
    const titulo = `${propertyTypeLabel(match.type)} en ${matchCity}`;
    // El barrio basta y la dirección se omite a propósito: Gmail detecta las
    // direcciones postales y las convierte en enlaces azules a Maps, así que el
    // clic más visible de la tarjeta se lo llevaba Google en vez del Radar.
    const zona = match.zone ? displayCity(match.zone) : matchCity;
    const dto = match.discount_pct != null ? Math.round(match.discount_pct) : null;
    const ficha = new URL(`/?tab=${match.source === 'fincaraiz' ? 'portal' : 'bancos'}&city=${encodeURIComponent(String(match.city ?? '').toLowerCase())}`, env.APP_BASE_URL).toString();
    // Cada trozo se escapa por separado y solo DESPUÉS se une con el separador
    // HTML. Escapar la cadena ya unida convertiría el `&nbsp;` en texto visible;
    // no escapar nada deja pasar lo que venga en el nombre de la fuente, que es
    // dato de scraping y no debe llegar crudo a un correo.
    const datos = [
      match.area_m2 ? `${Math.round(match.area_m2)} m²` : null,
      sourceLabel(match.source),
    ].filter(Boolean).map((x) => escapeHtml(x)).join(' &nbsp;·&nbsp; ');

    return `
      <tr>
        <td style="padding:0 24px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e7ddea;border-radius:14px;background:#ffffff">
            <tr>
              <td style="padding:0">
                <a href="${escapeHtml(ficha)}" style="display:block;text-decoration:none">
                  <img src="${escapeHtml(matchImageUrl(match))}" width="552" alt="${escapeHtml(titulo)}" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:14px 14px 0 0">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px 20px">
                ${dto != null ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f2ca04" style="border-radius:6px;padding:6px 10px;color:#2a1438;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;line-height:1">${dto}% por debajo de comparables</td></tr></table>` : ''}
                <p style="margin:${dto != null ? '13px' : '0'} 0 0;color:#2a1438;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;line-height:1.1">${escapeHtml(moneyLabel(match.price))}</p>
                <p style="margin:7px 0 0;color:#2a1438;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;line-height:1.3">${escapeHtml(titulo)}</p>
                <p style="margin:4px 0 0;color:#76677e;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45">${escapeHtml(zona)}</p>
                <p style="margin:10px 0 16px;color:#8b7c92;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4">${datos}</p>
                ${boton(ficha, 'Ver esta oportunidad')}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('');

  // Lo que Gmail enseña en la bandeja detrás del asunto. Sin esto pone el primer
  // texto que encuentre del cuerpo, que suele ser una migaja sin sentido.
  const preheader = dto0(matches)
    ? `El mejor está ${dto0(matches)}% por debajo de sus comparables. Tu alerta de ${city}, ${budget}.`
    : `Tu alerta de ${city}, ${budget}.`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <!-- Apple Mail y Gmail convierten direcciones, fechas y teléfonos en enlaces
       propios. En una tarjeta de inmueble eso pinta la ubicación de azul y se
       lleva el clic a Maps, compitiendo con el botón que sí queremos. -->
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <title>Radar CRECE · ${escapeHtml(city)}</title>
  <style>
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    @media only screen and (max-width:620px) {
      .shell { width:100% !important; border-radius:0 !important; }
      .pad { padding-left:18px !important; padding-right:18px !important; }
      .card-pad { padding-left:14px !important; padding-right:14px !important; }
      .h1 { font-size:25px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f0f6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f0f6">
    <tr>
      <td align="center" style="padding:22px 10px 34px">
        <table class="shell" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px">

          <!-- Cabecera. Una franja, no una portada: en un correo semanal la marca
               solo tiene que identificar quién escribe. -->
          <tr>
            <td bgcolor="#2a1438" style="padding:16px 24px;border-radius:16px 16px 0 0;border-bottom:3px solid #f2ca04">
              <span style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:.02em">RADAR <span style="color:#f2ca04">CRECE</span></span>
            </td>
          </tr>

          <!-- El titular y, justo debajo, de qué alerta viene. Es la primera
               pregunta de quien recibe un correo que no pidió hoy. -->
          <tr>
            <td class="pad" style="padding:28px 28px 6px">
              <h1 class="h1" style="margin:0;color:#2a1438;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:bold;line-height:1.15">${escapeHtml(nOportunidades)} en ${escapeHtml(city)}</h1>
              <p style="margin:10px 0 0;color:#6f6476;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55">De tu alerta: <strong style="color:#4a2560">${escapeHtml(city)}, ${escapeHtml(budget)}</strong>. Todas siguen publicadas y están por debajo del precio de sus comparables.</p>
            </td>
          </tr>

          <tr><td class="pad" style="padding:22px 28px 6px"><div style="height:1px;background:#eadfee;line-height:1px;font-size:0">&nbsp;</div></td></tr>

          ${cards}

          ${ocultas > 0 ? `
          <tr>
            <td class="pad" align="center" style="padding:6px 28px 4px">
              <p style="margin:0 0 14px;color:#6f6476;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">Hay <strong style="color:#2a1438">${ocultas} más</strong> que encajan con esta alerta.</p>
              ${boton(searchUrl, `Ver las ${matches.length} en mi Radar`)}
            </td>
          </tr>` : `
          <tr>
            <td class="pad" align="center" style="padding:6px 28px 4px">
              ${boton(searchUrl, 'Abrir mi Radar')}
            </td>
          </tr>`}

          <tr>
            <td class="pad" align="center" style="padding:12px 28px 30px">
              <p style="margin:0;color:#8b7c92;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5">Dentro puedes comparar, guardar y ver contra qué inmuebles se calculó cada diferencia.</p>
            </td>
          </tr>

          <tr>
            <td class="pad" bgcolor="#2a1438" style="padding:22px 28px;border-radius:0 0 16px 16px;border-top:3px solid #f2ca04">
              <p style="margin:0 0 10px;color:#cbbdd2;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6">Los porcentajes comparan el precio publicado con inmuebles similares de la zona. Son precios de oferta, no ventas cerradas: verifica precio, estado jurídico y condiciones antes de invertir.</p>
              <p style="margin:0;color:#cbbdd2;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6">Recibes esto porque creaste una alerta en el Radar. <a href="${escapeHtml(accountUrl)}" style="color:#f2ca04;text-decoration:underline">Modificarla o darte de baja</a>.</p>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;color:#8f8494;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5">Radar de Oportunidades · CRECE · Colombia</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** El descuento del primero, para el preheader. `null` si no lo trae. */
function dto0(matches: AlertMatch[]): number | null {
  const d = matches[0]?.discount_pct;
  return d != null && Number.isFinite(d) ? Math.round(d) : null;
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
  // `.in` y no `.eq`: el tipo es una lista desde que se pueden elegir varios. Lista
  // vacía significa «cualquier tipo», así que no se filtra.
  const tipos = tiposDeAlerta(alert);
  if (tipos.length) query = query.in('type', tipos);
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
      // Quién manda en cada grupo de alertas gemelas. En modo canario no se
      // agrupa: ahí se prueba UNA alerta concreta por su id, y saltársela porque
      // tiene una hermana sería contestar sobre otra cosa.
      const mando = canary ? null : principalesDeAlertas(alerts);
      // Lo que le pasó a cada principal, para copiárselo a sus gemelas después.
      const resultados = new Map<string, { attemptedAt: string; matchCount: number; enviada: boolean }>();
      for (const alert of alerts) {
        if (canary && alert.id !== canary.alertId) continue;
        if (mando && mando.get(alert.id) !== alert.id) continue;
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
          resultados.set(alert.id, { attemptedAt, matchCount: matches.length, enviada: matches.length > 0 });
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
      // Las gemelas no envían, pero SÍ se ponen al día. Dejarlas intactas las
      // dejaría vencidas para siempre: cada ciclo volverían a contarse como
      // pendientes y el informe diría que hay envíos atrasados que nadie va a
      // hacer. Se anotan con la fecha y el recuento de la que sí salió.
      if (mando) {
        for (const alert of alerts) {
          const jefa = mando.get(alert.id);
          if (!jefa || jefa === alert.id) continue;
          const r = resultados.get(jefa);
          if (!r) continue;
          alert.lastCheckedAt = r.attemptedAt;
          alert.lastMatchCount = r.matchCount;
          if (r.enviada) alert.lastSentAt = r.attemptedAt;
          alert.lastDeliveryStatus = r.enviada ? 'sent' : 'no_matches';
          alert.consecutiveFailures = 0;
          delete alert.nextRetryAt;
          delete alert.lastError;
          deliveries.unshift({
            id: randomUUID(),
            alertId: alert.id,
            attemptedAt: r.attemptedAt,
            status: r.enviada ? 'sent' : 'no_matches',
            matchCount: r.matchCount,
          });
          changed = true;
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

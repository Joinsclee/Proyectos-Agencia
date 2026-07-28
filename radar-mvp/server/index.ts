/**
 * Servidor local del Radar (entorno "real" de pruebas).
 *
 * Sirve un frontend que consulta Supabase EN VIVO vía /api/* — sin los topes
 * del HTML estático: todos los resultados de cada ciudad, todas las fotos,
 * paginado. Pensado para ver el alcance real con ejemplos reales.
 *
 * Uso: npm run serve   (o: tsx server/index.ts)   → http://localhost:8787
 */
import 'dotenv/config';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../lib/logger.js';
import {
  queryPortal, queryBancos, queryRemates, facets, facetsRemates, stats, getProperty, remateBankFacets,
  warmStats, warmTotalPortal, warmZonas, warmMetricas, destacados, warmDestacados,
  type ListQuery,
} from './queries.js';
import { parametrosGastos, warmParametrosGastos } from './parametros-gastos.js';
import { fichasDe } from './destacados.js';
import { registerUser, loginUser } from './auth.js';
import { analyzeProperty, marketOnly, rentalOnly } from './analysis.js';
import { puedeForzarAnalisis } from './analysis-access.js';
import { consumirCupo, estadoCupo, leerCupo, yaDesbloqueada } from './cupo.js';
import { estadoCupoReportes, leerCupoReportes } from './cupo-reportes.js';
import {
  MENSAJE_RECHAZO,
  construirReporte,
  datosDeInmueble,
  decidirReporte,
  nombreArchivoReporte,
  type ArriendoReporte,
  type ComparablesReporte,
} from './reporte.js';
import { construirResumenCuenta, nombreArchivoResumen } from './resumen-cuenta.js';
import { warmCityPools } from '../engine/zone-comps.js';
import { planDe, redactarLista, redactarMixta, redactar, resumenBloqueo, accesoInmueble, accesoRemateFicha } from './acceso.js';
import { getUserFromToken, listFavorites, toggleFavorite, favoriteProperties } from './favorites.js';
import {
  activarPlanDemo,
  deleteAlert,
  exportAccount,
  exportAccountCsv,
  getAccount,
  getAdminOperationMetrics,
  getAdminSummary,
  getAdminZoneOpportunities,
  listAdminPlanInterests,
  updateAdminExpenseParameters,
  listPlans,
  registerPlanInterest,
  registrarDesbloqueo,
  registrarReporte,
  saveAlert,
  syncAccount,
  updateAdminSubscription,
} from './account.js';
import {
  allowCrossOriginImageEmbedding,
  applySecurityHeaders,
  contentTypeFor,
  createRequestId,
} from './http-security.js';
import { checkRateLimit, clientAddress, type RateLimitPolicy } from './rate-limit.js';
import { env } from '../lib/env.js';
import {
  alertDispatchEnabled,
  emailDeliveryReady,
  parseAlertDispatchCanary,
  runAlertDispatch,
  type AlertDispatchCanary,
} from './notifications.js';
import {
  createWompiCheckout,
  getWompiPayment,
  processWompiEvent,
  wompiPaymentDemoReady,
} from './payments.js';

const log = createLogger('server');
const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');
const SHUTDOWN_TIMEOUT_MS = 10_000;
let serviceReady = false;
let shuttingDown = false;

/**
 * Desde dónde compensa comprimir.
 *
 * Por debajo del tamaño de un paquete de red no se gana nada —el cuerpo viaja en
 * el mismo viaje comprimido o no— y sí se paga el CPU. La inmensa mayoría de las
 * respuestas de esta API (un `ok: true`, un cupo, una config) caen aquí.
 */
const MIN_GZIP = 1400;

/**
 * Respuesta JSON, comprimida cuando vale la pena.
 *
 * El detonante fue la portada: al pasar de 33 fichas a ~190 la respuesta se iba a
 * 240 KB, que en un móvil colombiano es medio segundo de espera antes de ver la
 * primera tarjeta. El mismo JSON comprime un 85% —es texto con las mismas veinte
 * claves repetidas cientos de veces—, así que la portada entera pesa menos
 * comprimida que las 33 fichas de antes en crudo. Los listados paginados, que
 * tienen exactamente la misma forma, se benefician igual sin tocarlos.
 *
 * `gzipSync` y no la versión asíncrona a propósito: comprimir 240 KB cuesta unos
 * pocos milisegundos y este servidor atiende a un puñado de usuarios, así que
 * bloquear el bucle ese rato es mejor negocio que la complejidad de volver
 * asíncronas las ~60 llamadas a esta función.
 *
 * `Vary` es obligatorio, no decorativo: sin él una caché intermedia puede servirle
 * el cuerpo comprimido a un cliente que no pidió gzip.
 */
function sendJSON(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Accept-Encoding',
  };
  const acepta = String(res.req?.headers['accept-encoding'] ?? '');
  if (payload.length < MIN_GZIP || !/\bgzip\b/i.test(acepta)) {
    res.writeHead(status, cabeceras);
    res.end(payload);
    return;
  }
  const comprimido = gzipSync(payload);
  res.writeHead(status, { ...cabeceras, 'Content-Encoding': 'gzip' });
  res.end(comprimido);
}

function sendDownload(
  res: import('node:http').ServerResponse,
  filename: string,
  body: unknown,
) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendTextDownload(
  res: import('node:http').ServerResponse,
  filename: string,
  contentType: string,
  body: string,
) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function rateLimited(
  res: import('node:http').ServerResponse,
  key: string,
  policy: RateLimitPolicy,
): boolean {
  const result = checkRateLimit(key, policy);
  if (result.allowed) return false;
  res.setHeader('Retry-After', String(result.retryAfterSeconds));
  sendJSON(res, 429, {
    ok: false,
    error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return true;
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { req.destroy(); resolve({}); return; } // límite anti-abuso
      raw += c;
    });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

/** Token Bearer de la petición, si viene. */
const bearer = (req: import('node:http').IncomingMessage): string | null =>
  (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;

/**
 * Gasta una ficha del cupo mensual si esta lo requiere y al usuario le queda.
 *
 * Solo se escribe cuando de verdad se consume una unidad nueva: reabrir algo ya
 * abierto, ser suscriptor o ser anónimo no producen ninguna escritura. Devuelve
 * el estado que necesita el control de acceso para decidir.
 *
 * Un fallo al guardar NO bloquea la respuesta: se registra y se sirve la ficha.
 * Perder la cuenta de una unidad es mucho menos grave que negarle a un usuario
 * legítimo algo que sí puede ver.
 */
async function gastarCupoSiHaceFalta(
  usuario: Awaited<ReturnType<typeof getUserFromToken>>,
  plan: ReturnType<typeof planDe>,
  id: string,
  kind: 'portal' | 'banco' | 'remate',
  row: Record<string, any>,
): Promise<{ desbloqueada: boolean; restantes: number | null }> {
  const cupo = usuario?.cupo ?? leerCupo(null);
  const estadoPrevio = estadoCupo(cupo, plan);
  if (plan !== 'free' || !usuario) {
    return { desbloqueada: false, restantes: estadoPrevio.restantes };
  }

  // Si la ficha no es de pago no se toca el cupo: cobrar por algo que ya era
  // gratis vaciaría el cupo del usuario sin darle nada a cambio.
  const requierePago = kind === 'remate'
    ? accesoRemateFicha(row as any, 'anonimo').completa === false
    : accesoInmueble(row.crece_tier, 'anonimo').completa === false;
  if (!requierePago) return { desbloqueada: false, restantes: estadoPrevio.restantes };

  const r = consumirCupo(cupo, id, 'free');
  if (r.consumido) {
    try {
      await registrarDesbloqueo(usuario.id, r.cupo);
      if (usuario.cupo) usuario.cupo = r.cupo;
    } catch (e) {
      log.error(`cupo ${usuario.id.slice(0, 8)}: no se pudo registrar el desbloqueo`, e);
    }
  }
  return { desbloqueada: r.permitido, restantes: estadoCupo(r.cupo, 'free').restantes };
}

/**
 * Evidencia de mercado que acompaña al reporte.
 *
 * Se pide al MISMO motor que produce el −X% de la tarjeta, no a un cálculo
 * propio: el reporte es el documento que el usuario le enseña a un tercero, y una
 * cifra que no cuadre con la que vio en pantalla destruye la credibilidad de las
 * dos. Los comparables salen del veredicto cuando existe (es lo que sostiene el
 * descuento) y del resumen de mercado cuando no.
 *
 * Es best-effort a propósito: si Supabase va lento o la ciudad no tiene baseline,
 * el reporte sale igual diciendo que no hubo comparables suficientes. Negarle al
 * usuario un reporte que ya pagó porque una consulta auxiliar falló sería peor
 * que entregarlo con una sección menos.
 */
async function evidenciaParaReporte(
  kind: 'portal' | 'banco' | 'remate',
  id: string,
): Promise<{ comparables: ComparablesReporte | null; arriendo: ArriendoReporte | null }> {
  const [mercado, arriendo] = await Promise.all([
    marketOnly(kind, id).catch(() => null),
    // Los remates no tienen mercado de arriendo asociado en el motor.
    kind === 'remate' ? Promise.resolve(null) : rentalOnly(kind, id).catch(() => null),
  ]);

  const m = mercado?.market ?? null;
  const v = mercado?.verdict ?? null;
  const alcance = v?.radius_used_km != null
    ? `${v.radius_used_km} km a la redonda`
    : m?.scope_label ?? null;

  const comparables: ComparablesReporte | null = v && v.market_ppm2 != null
    ? {
      n: v.n_comparables,
      medianaPpm2: v.market_ppm2,
      medianaTotal: null, // el veredicto trabaja por m²; mezclar medianas de conjuntos distintos confundiría
      confianza: v.confidence,
      alcance,
      criterios: v.criteria ?? [],
    }
    : m && m.n
      ? {
        n: m.n,
        medianaPpm2: m.median_ppm2,
        medianaTotal: m.median_total,
        confianza: m.confidence,
        alcance: m.scope_label,
        criterios: m.criteria ?? [],
      }
      : null;

  const r = arriendo?.rental_market ?? null;
  return {
    comparables,
    arriendo: r && r.available && r.median_monthly_rent != null
      ? {
        canonMediano: r.median_monthly_rent,
        rangoBajo: r.p25_monthly_rent,
        rangoAlto: r.p75_monthly_rent,
        canonPorM2: r.median_rent_per_m2,
        n: r.n,
        confianza: r.confidence,
        alcance: r.scope_label,
      }
      : null,
  };
}

function parseListQuery(url: URL): ListQuery {
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const n = (k: string) => (g(k) ? Number(g(k)) : undefined);
  return {
    city: g('city'),
    zone: g('zone'),
    type: g('type'),
    priceMin: n('priceMin'),
    priceMax: n('priceMax'),
    areaMin: n('areaMin'),
    areaMax: n('areaMax'),
    bedroomsMin: n('bedroomsMin'),
    stratumMin: n('stratumMin'),
    stratumMax: n('stratumMax'),
    opp: (g('opp') as ListQuery['opp']) ?? '',
    order: g('order'),
    page: n('page'),
    pageSize: n('pageSize'),
    past: g('past'),
    bank: g('bank'),
    bidMin: n('bidMin'),
    bidMax: n('bidMax'),
  };
}

async function serveStatic(res: import('node:http').ServerResponse, pathname: string) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // Evita traversal
  if (rel.includes('..')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const file = join(PUBLIC, rel);
    const buf = await readFile(file);
    const contentType = contentTypeFor(file);
    allowCrossOriginImageEmbedding(res, contentType);
    // no-cache: el navegador SIEMPRE revalida los estáticos. Evita el bug de
    // assets desincronizados (HTML nuevo + app.js viejo cacheado → pantalla
    // colgada). En producción se versionarían los assets; aquí no-cache basta.
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, must-revalidate',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}

const server = createServer(async (req, res) => {
  const requestId = createRequestId();
  applySecurityHeaders(res, requestId);
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    // Health check de la plataforma (EasyPanel/Railway). Debe ser barato y NO tocar
    // la base: si Supabase va lento, el contenedor no debe darse por muerto.
    if (path === '/health') {
      return sendJSON(res, 200, {
        ok: true,
        status: shuttingDown ? 'stopping' : 'alive',
        uptime_s: Math.round(process.uptime()),
      });
    }
    // Readiness separada de liveness: durante un despliegue EasyPanel deja de
    // enviar tráfico antes de que cerremos conexiones existentes.
    if (path === '/ready') {
      const ready = serviceReady && !shuttingDown;
      return sendJSON(res, ready ? 200 : 503, {
        ok: ready,
        status: shuttingDown ? 'stopping' : ready ? 'ready' : 'starting',
        uptime_s: Math.round(process.uptime()),
      });
    }
    if (path.startsWith('/api/')) {
      if (path === '/api/payments/wompi/events') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        const checksumHeader = req.headers['x-event-checksum'];
        const checksum = Array.isArray(checksumHeader) ? checksumHeader[0] : checksumHeader;
        const result = await processWompiEvent(await readJsonBody(req), checksum);
        return sendJSON(res, result.status, result);
      }
      if (path === '/api/plans') {
        if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        return sendJSON(res, 200, { ok: true, plans: listPlans() });
      }
      if (path === '/api/internal/alerts/run' || path === '/api/internal/alerts/canary') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        if (!env.ALERTS_CRON_SECRET) {
          return sendJSON(res, 503, { ok: false, configured: false, error: 'Despacho de alertas no configurado' });
        }
        if (bearer(req) !== env.ALERTS_CRON_SECRET) {
          return sendJSON(res, 401, { ok: false, error: 'Credencial de proceso inválida' });
        }
        let canary: AlertDispatchCanary | undefined;
        if (path.endsWith('/canary')) {
          const parsedCanary = parseAlertDispatchCanary(await readJsonBody(req));
          if (!parsedCanary.ok || !parsedCanary.canary) {
            return sendJSON(res, 400, parsedCanary.ok
              ? { ok: false, error: 'La prueba canario requiere correo e identificador de alerta' }
              : parsedCanary);
          }
          canary = parsedCanary.canary;
        }
        const result = await runAlertDispatch(new Date(), canary);
        return sendJSON(res, result.ok ? 200 : result.configured ? 207 : 503, result);
      }
      // ── Auth (POST) ──
      if (path === '/api/auth/register' || path === '/api/auth/login') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        if (rateLimited(res, `auth:${clientAddress(req)}`, { limit: 20, windowMs: 15 * 60 * 1000 })) return;
        const body = await readJsonBody(req);
        const result = path.endsWith('register') ? await registerUser(body) : await loginUser(body);
        return sendJSON(res, result.ok ? 200 : 400, result);
      }
      // ── Cuenta, planes y alertas persistentes ──
      if (path.startsWith('/api/account')) {
        const user = await getUserFromToken(bearer(req));
        if (!user) return sendJSON(res, 401, { ok: false, error: 'Inicia sesión para administrar tu Radar' });

        if (path === '/api/account' && req.method === 'GET') {
          return sendJSON(res, 200, { ok: true, account: await getAccount(user.id) });
        }
        if (path === '/api/account/sync' && req.method === 'POST') {
          if (rateLimited(res, `account-write:${user.id}`, { limit: 120, windowMs: 60 * 60 * 1000 })) return;
          const result = await syncAccount(user.id, await readJsonBody(req));
          return sendJSON(res, result.ok ? 200 : 400, result);
        }
        if (path === '/api/account/alerts' && req.method === 'POST') {
          if (rateLimited(res, `alert-write:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 })) return;
          const result = await saveAlert(user.id, await readJsonBody(req));
          return sendJSON(res, result.ok ? 200 : 400, result);
        }
        if (path.startsWith('/api/account/alerts/') && req.method === 'DELETE') {
          if (rateLimited(res, `alert-write:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 })) return;
          const alertId = decodeURIComponent(path.slice('/api/account/alerts/'.length));
          if (!alertId) return sendJSON(res, 400, { ok: false, error: 'Alerta requerida' });
          return sendJSON(res, 200, await deleteAlert(user.id, alertId));
        }
        if (path === '/api/account/plan-interest' && req.method === 'POST') {
          if (rateLimited(res, `plan-interest:${user.id}`, { limit: 5, windowMs: 24 * 60 * 60 * 1000 })) return;
          const result = await registerPlanInterest(user.id, await readJsonBody(req));
          return sendJSON(res, result.ok ? 200 : 400, result);
        }
        if (path === '/api/account/activar-demo' && req.method === 'POST') {
          if (rateLimited(res, `activar-demo:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })) return;
          const result = await activarPlanDemo(user.id);
          return sendJSON(res, result.ok ? 200 : 403, result);
        }
        if (path === '/api/account/checkout' && req.method === 'POST') {
          if (rateLimited(res, `checkout:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })) return;
          const result = await createWompiCheckout(user);
          return sendJSON(res, result.ok ? 200 : result.status, result);
        }
        if (path === '/api/account/payment' && req.method === 'GET') {
          const result = await getWompiPayment(user.id, url.searchParams.get('reference'));
          return sendJSON(res, result.ok ? 200 : result.status, result);
        }
        if (path === '/api/account/export' && req.method === 'GET') {
          return sendDownload(res, `radar-cuenta-${user.id.slice(0, 8)}.json`, await exportAccount(user.id));
        }
        if (path === '/api/account/export.csv' && req.method === 'GET') {
          return sendTextDownload(
            res,
            `radar-seguimiento-${user.id.slice(0, 8)}.csv`,
            'text/csv; charset=utf-8',
            `\uFEFF${await exportAccountCsv(user.id)}`,
          );
        }
        // Resumen imprimible, el que sustituye al bot\u00F3n de JSON en la pantalla de
        // cuenta. La ruta JSON de arriba sigue viva para portabilidad de datos;
        // lo que cambia es qu\u00E9 se le ofrece al usuario por delante.
        if (path === '/api/account/resumen' && req.method === 'GET') {
          const cuenta = await getAccount(user.id);
          return sendTextDownload(
            res,
            nombreArchivoResumen(user.id),
            'text/html; charset=utf-8',
            construirResumenCuenta(cuenta as any, new Date().toISOString()),
          );
        }
        return sendJSON(res, 405, { ok: false, error: 'Método o ruta de cuenta no permitido' });
      }
      // ── Operación comercial para administradores ──
      if (path.startsWith('/api/admin/')) {
        const user = await getUserFromToken(bearer(req));
        if (!user) return sendJSON(res, 401, { ok: false, error: 'Inicia sesión' });
        if (path === '/api/admin/summary') {
          if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
          const summary = await getAdminSummary(user.id);
          if (!summary) return sendJSON(res, 403, { ok: false, error: 'Acceso reservado a administradores' });
          return sendJSON(res, 200, { ok: true, summary });
        }
        if (path === '/api/admin/oportunidades-por-zona') {
          if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
          // Va con límite propio aunque sea de solo lectura: la primera llamada
          // tras vencer la caché dispara ~60 consultas contra Supabase, y un
          // refresco compulsivo del panel podría castigar la base que sirve al
          // dashboard público.
          if (rateLimited(res, `admin-zonas:${user.id}`, { limit: 60, windowMs: 10 * 60 * 1000 })) return;
          const zonas = await getAdminZoneOpportunities(user.id);
          if (!zonas) return sendJSON(res, 403, { ok: false, error: 'Acceso reservado a administradores' });
          return sendJSON(res, 200, { ok: true, ...zonas });
        }
        if (path === '/api/admin/metricas') {
          if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
          const metricas = await getAdminOperationMetrics(user.id);
          if (!metricas) return sendJSON(res, 403, { ok: false, error: 'Acceso reservado a administradores' });
          return sendJSON(res, 200, { ok: true, ...metricas });
        }
        if (path === '/api/admin/parametros-gastos' && req.method === 'PUT') {
          // Límite propio y estrecho: esto cambia el número que ve TODO el
          // mundo en la calculadora, así que un script que lo machaque en bucle
          // es un problema de producto, no solo de carga.
          if (rateLimited(res, `admin-parametros:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 })) return;
          const result = await updateAdminExpenseParameters(user.id, await readJsonBody(req));
          if (!result) return sendJSON(res, 403, { ok: false, error: 'Acceso reservado a administradores' });
          return sendJSON(res, result.ok ? 200 : 400, result);
        }
        if (path === '/api/admin/plan-interests') {
          if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
          const interests = await listAdminPlanInterests(user.id);
          if (!interests) return sendJSON(res, 403, { ok: false, error: 'Acceso reservado a administradores' });
          return sendJSON(res, 200, { ok: true, interests });
        }
        if (path.startsWith('/api/admin/subscriptions/') && req.method === 'PATCH') {
          if (rateLimited(res, `admin-subscription:${user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 })) return;
          const targetUserId = decodeURIComponent(path.slice('/api/admin/subscriptions/'.length));
          if (!targetUserId) return sendJSON(res, 400, { ok: false, error: 'Usuario requerido' });
          const result = await updateAdminSubscription(user.id, targetUserId, await readJsonBody(req));
          if (!result) return sendJSON(res, 403, { ok: false, error: 'Acceso reservado a administradores' });
          return sendJSON(res, result.ok ? 200 : 400, result);
        }
        return sendJSON(res, 405, { ok: false, error: 'Método o ruta administrativa no permitido' });
      }
      // ── Favoritos (requieren Bearer token del usuario) ──
      if (path === '/api/me' || path.startsWith('/api/favorites')) {
        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
        const user = await getUserFromToken(token);
        if (path === '/api/me') return sendJSON(res, 200, { ok: !!user, user });
        if (!user) return sendJSON(res, 401, { ok: false, error: 'Inicia sesión para usar favoritos' });
        if (path === '/api/favorites/toggle') {
          if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
          const body = (await readJsonBody(req)) as { kind?: string; id?: string };
          if (!['portal', 'banco', 'remate'].includes(body.kind ?? '') || !body.id) {
            return sendJSON(res, 400, { ok: false, error: 'kind e id requeridos' });
          }
          const r = await toggleFavorite(user.id, body.kind as any, body.id);
          return sendJSON(res, 200, { ok: true, ...r });
        }
        if (path === '/api/favorites') {
          const full = url.searchParams.get('full') === '1';
          const favorites = await listFavorites(user.id);
          const rawProperties = full ? await favoriteProperties(user.id) : undefined;
          const userPlan = planDe(user);
          // El cupo también cuenta aquí. Sin este tercer argumento, una ficha que
          // el usuario YA abrió gastando una de sus 20 volvía a aparecer bloqueada
          // en Guardados, pidiéndole suscripción por algo que ya había pagado.
          const cupoFav = user?.cupo ?? leerCupo(null);
          const accesoFav = {
            desbloqueadas: cupoFav.desbloqueadas,
            restantes: estadoCupo(cupoFav, userPlan).restantes,
          };
          const abiertas = new Set(accesoFav.desbloqueadas ?? []);
          const properties = rawProperties?.map((property) => {
            const estado = {
              desbloqueada: abiertas.has(String(property.id)),
              restantes: accesoFav.restantes,
            };
            return redactar(
              property,
              property._kind === 'remate'
                ? accesoRemateFicha(property, userPlan, estado)
                : accesoInmueble(property.crece_tier, userPlan, estado),
            );
          });
          return sendJSON(res, 200, { ok: true, user, favorites, properties });
        }
        return sendJSON(res, 404, { ok: false, error: 'ruta de favoritos no encontrada' });
      }
      // Análisis IA de una propiedad (POST { kind:'banco'|'remate', id, refresh? }).
      if (path === '/api/analyze') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        if (rateLimited(res, `analyze:${clientAddress(req)}`, { limit: 30, windowMs: 60 * 60 * 1000 })) return;
        const body = (await readJsonBody(req)) as { kind?: string; id?: string; refresh?: boolean };
        if ((body.kind !== 'banco' && body.kind !== 'remate') || !body.id) {
          return sendJSON(res, 400, { ok: false, error: 'kind (banco|remate) e id requeridos' });
        }
        // Consultar es gratis y anónimo; forzar el recálculo cuesta dinero y
        // reescribe el análisis guardado, así que solo lo hace un administrador.
        // Para el resto el flag se ignora y se devuelve la caché.
        const forzar = body.refresh === true
          ? puedeForzarAnalisis(true, await getUserFromToken(bearer(req)))
          : false;
        const result = await analyzeProperty(body.kind, body.id, forzar);
        const status = result.ok ? 200 : result.needs_key ? 503 : 400;
        return sendJSON(res, status, result);
      }
      // Contexto de mercado (comparables) SIN IA — gratis, para justificar el −X%.
      if (path === '/api/market') {
        const kind = url.searchParams.get('kind');
        const id = url.searchParams.get('id');
        if ((kind !== 'portal' && kind !== 'banco' && kind !== 'remate') || !id) {
          return sendJSON(res, 400, { ok: false, error: 'kind (portal|banco|remate) e id requeridos' });
        }
        const result = await marketOnly(kind, id);
        return sendJSON(res, result.ok ? 200 : 404, result);
      }
      // Comparables de arriendo separados del mercado de venta para que cada
      // panel cargue de forma independiente y una fuente no bloquee la otra.
      if (path === '/api/rental-market') {
        const kind = url.searchParams.get('kind');
        const id = url.searchParams.get('id');
        if ((kind !== 'portal' && kind !== 'banco') || !id) {
          return sendJSON(res, 400, { ok: false, error: 'kind (portal|banco) e id requeridos' });
        }
        const result = await rentalOnly(kind, id);
        return sendJSON(res, result.ok ? 200 : 404, result);
      }
      // Reporte descargable de UNA ficha (HTML autocontenido, imprimible a PDF).
      if (path === '/api/reporte') {
        if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        const kind = url.searchParams.get('kind');
        const id = url.searchParams.get('id');
        if ((kind !== 'portal' && kind !== 'banco' && kind !== 'remate') || !id) {
          return sendJSON(res, 400, { ok: false, error: 'kind (portal|banco|remate) e id requeridos' });
        }
        const usuario = await getUserFromToken(bearer(req));
        const plan = planDe(usuario);
        // El anónimo se corta antes de tocar la base: no hay reporte que generarle
        // y el mensaje que necesita es el mismo con o sin ficha existente.
        if (plan === 'anonimo' || !usuario) {
          return sendJSON(res, 401, {
            ok: false, requiere: 'registro', error: MENSAJE_RECHAZO.registro,
          });
        }
        // Un reporte cuesta dos consultas pesadas (baseline de la ciudad y
        // arriendos). El tope es por usuario, no por IP: un hogar compartido no
        // debe quedarse sin reportes porque otro los pidió.
        if (rateLimited(res, `reporte:${usuario.id}`, { limit: 60, windowMs: 60 * 60 * 1000 })) return;

        const fila = await getProperty(kind, id);
        if (!fila) return sendJSON(res, 404, { ok: false, error: 'no encontrado' });

        // El acceso se evalúa SIN gastar cupo de fichas: descargar un reporte no
        // puede consumir en silencio el cupo del otro contador. Si la ficha no
        // está abierta para este usuario, `decidirReporte` lo rechaza y le dice
        // que la abra primero.
        const cupoFichas = usuario.cupo ?? leerCupo(null);
        const estadoFichas = {
          desbloqueada: yaDesbloqueada(cupoFichas, id),
          restantes: estadoCupo(cupoFichas, plan).restantes,
        };
        const acceso = kind === 'remate'
          ? accesoRemateFicha(fila as any, plan, estadoFichas)
          : accesoInmueble((fila as any).crece_tier, plan, estadoFichas);

        // ¿La ficha es contenido de pago, o el Radar se la enseña a cualquiera?
        // Se calcula con el plan gratuito y SIN cupo, que es la pregunta correcta:
        // no «puede verla este usuario» sino «estuvo cerrada alguna vez». Una ficha
        // abierta para todos no puede gastar cupo de reportes, o el usuario del
        // plan gratuito quema sus 20 descargas en fichas que nunca estuvieron
        // cerradas.
        const esDePago = !(kind === 'remate'
          ? accesoRemateFicha(fila as any, 'free')
          : accesoInmueble((fila as any).crece_tier, 'free')).completa;

        const cupoReportes = usuario.cupoReportes ?? leerCupoReportes(null);
        const decision = decidirReporte({ plan, acceso, cupo: cupoReportes, id, esDePago });
        if (!decision.ok) {
          return sendJSON(res, 403, {
            ok: false,
            requiere: decision.requiere,
            error: MENSAJE_RECHAZO[decision.requiere],
            cupo: estadoCupoReportes(decision.cupo, plan),
          });
        }
        if (decision.consume) {
          try {
            await registrarReporte(usuario.id, decision.cupo);
            usuario.cupoReportes = decision.cupo;
          } catch (e) {
            // Igual que con el cupo de fichas: perder la cuenta de una unidad es
            // menos grave que negarle a un usuario legítimo lo que sí puede pedir.
            log.error(`reportes ${usuario.id.slice(0, 8)}: no se pudo registrar el consumo`, e);
          }
        }

        const evidencia = await evidenciaParaReporte(kind, id);
        // `redactar` sobre una ficha ya autorizada no quita nada; se aplica igual
        // para que el reporte NUNCA lea la fila cruda. Ver `server/reporte.ts`.
        const datos = datosDeInmueble({
          kind,
          fila: redactar(fila as any, acceso),
          comparables: evidencia.comparables,
          arriendo: evidencia.arriendo,
          plan: plan === 'suscrito' ? 'suscrito' : 'free',
        });
        const restantes = estadoCupoReportes(decision.cupo, plan).restantes;
        // Cabecera propia para que la ficha actualice el contador sin volver a
        // preguntar por la cuenta entera después de cada descarga.
        res.setHeader('X-Reportes-Restantes', restantes == null ? 'ilimitado' : String(restantes));
        return sendTextDownload(
          res,
          nombreArchivoReporte(datos),
          'text/html; charset=utf-8',
          construirReporte(datos),
        );
      }
      // Una propiedad por id (para abrir una recomendación en su modal).
      if (path === '/api/property') {
        const kind = url.searchParams.get('kind');
        const id = url.searchParams.get('id');
        if ((kind !== 'portal' && kind !== 'banco' && kind !== 'remate') || !id) {
          return sendJSON(res, 400, { ok: false, error: 'kind (portal|banco|remate) e id requeridos' });
        }
        const row = await getProperty(kind, id);
        if (!row) return sendJSON(res, 404, { ok: false, error: 'no encontrado' });
        // Esta ruta se saltaba el muro entero: devolvía la fila cruda a cualquiera,
        // así que bastaba pedir por id una ficha que el listado sí bloqueaba para
        // leer su dirección. Se aplica el mismo criterio que en los listados.
        const usuarioFicha = await getUserFromToken(bearer(req));
        const planFicha = planDe(usuarioFicha);
        // Abrir una ficha de pago es lo que gasta cupo del plan gratuito: es el
        // único punto del sistema donde el usuario pide contenido concreto.
        const cupoFicha = await gastarCupoSiHaceFalta(usuarioFicha, planFicha, id, kind, row);
        const acceso = kind === 'remate'
          ? accesoRemateFicha(row as any, planFicha, cupoFicha)
          : accesoInmueble((row as any).crece_tier, planFicha, cupoFicha);
        return sendJSON(res, 200, {
          ok: true,
          kind,
          plan: planFicha,
          cupo: estadoCupo(usuarioFicha?.cupo ?? leerCupo(null), planFicha),
          data: redactar(row as any, acceso),
        });
      }
      // Los listados se filtran según el plan ANTES de salir del servidor: lo que
      // el usuario no ha pagado no debe viajar en la respuesta (antes el muro era
      // solo visual y los datos iban igual, visibles desde el navegador).
      if (path === '/api/portal' || path === '/api/bancos' || path === '/api/remates') {
        const usuario = await getUserFromToken(bearer(req));
        const plan = planDe(usuario);
        const esRemate = path === '/api/remates';
        const q = parseListQuery(url);
        const r = esRemate ? await queryRemates(q)
          : path === '/api/portal' ? await queryPortal(q) : await queryBancos(q);
        // Las fichas que ya gastaron cupo este mes viajan completas también aquí:
        // si no, el usuario habría pagado una para que la tarjeta siguiera tapada
        // al volver al listado.
        const cupo = usuario?.cupo ?? leerCupo(null);
        const estado = estadoCupo(cupo, plan);
        const filas = redactarLista(r.data as any[], plan, esRemate ? 'remate' : 'inmueble', {
          desbloqueadas: cupo.desbloqueadas,
          restantes: estado.restantes,
        });
        return sendJSON(res, 200, {
          ...r,
          plan,
          cupo: estado,
          // Qué se está perdiendo quien no ha pagado, con los números de SU
          // búsqueda: el aviso comercial tiene que ser comprobable mirando la
          // pantalla, no un adjetivo.
          bloqueo: resumenBloqueo(filas),
          data: filas,
        });
      }
      // ── Portada: destacados de la semana, del mes, por ciudad y cruce de fuentes ──
      // Es la PRIMERA pantalla, así que la selección viene de la caché con TTL de
      // `queries.ts`. Lo único que se calcula por petición es el muro: qué puede
      // abrir ESTE usuario. Las fichas destacadas pasan por `redactarMixta` →
      // `redactarLista`, la misma y única puerta que cualquier listado. Una portada
      // que devolviera filas crudas sería exactamente el incidente de `/api/property`
      // otra vez, y en la pantalla más visitada del producto.
      if (path === '/api/home') {
        const usuarioHome = await getUserFromToken(bearer(req));
        const planHome = planDe(usuarioHome);
        const cupoHome = usuarioHome?.cupo ?? leerCupo(null);
        const estadoHome = estadoCupo(cupoHome, planHome);
        const acceso = { desbloqueadas: cupoHome.desbloqueadas, restantes: estadoHome.restantes };
        const seleccion = await destacados();
        const bloques = seleccion.bloques.map((bloque) => ({
          ...bloque,
          grupos: bloque.grupos.map((grupo) => ({
            ...grupo,
            fichas: redactarMixta(grupo.fichas as any[], planHome, acceso),
          })),
        }));
        // El mismo resumen comercial del listado, calculado sobre lo que la persona
        // tiene delante en la portada: sirve para el aviso de "esto es lo que no
        // puedes abrir todavía" sin inventar una segunda métrica.
        const todas = bloques.flatMap((bloque) => fichasDe(bloque as any));
        return sendJSON(res, 200, {
          ok: true,
          plan: planHome,
          cupo: estadoHome,
          semana: seleccion.semana,
          periodo: seleccion.periodo,
          total: todas.length,
          visibles: seleccion.visibles,
          bloqueo: resumenBloqueo(todas),
          bloques,
        });
      }
      if (path === '/api/facets') {
        const source = (url.searchParams.get('source') as 'portal' | 'bancos' | 'remates') ?? 'portal';
        if (source === 'remates') return sendJSON(res, 200, await facetsRemates());
        return sendJSON(res, 200, await facets(source, url.searchParams.get('city') ?? undefined));
      }
      if (path === '/api/remate-banks') return sendJSON(res, 200, await remateBankFacets());
      if (path === '/api/stats') {
        try {
          return sendJSON(res, 200, { available: true, ...await stats() });
        } catch (statsError) {
          const detail = statsError instanceof Error ? statsError.message : String(statsError);
          log.warn(`${requestId} stats temporalmente no disponibles: ${detail}`);
          // No inventamos ceros: el cliente recibe una indisponibilidad explícita
          // y puede seguir mostrando los inmuebles sin romper toda la portada.
          return sendJSON(res, 200, {
            available: false,
            error: 'Estadísticas temporalmente no disponibles',
          });
        }
      }
      // Config pública para el cliente (URL de Supabase para iniciar OAuth de Google).
      if (path === '/api/config') return sendJSON(res, 200, {
        supabaseUrl: env.SUPABASE_URL,
        alertEmailDeliveryReady: emailDeliveryReady(),
        // Proveedor configurado y despachador encendido son cosas distintas: sin
        // las dos no sale ningún correo, y la cuenta no debe prometer lo contrario.
        alertDispatchEnabled: await alertDispatchEnabled(),
        // Se publica a propósito: una puerta que regala el acceso completo no
        // debe poder estar abierta sin que se note desde fuera.
        demoPlanActivation: env.RADAR_DEMO_PLAN === '1',
        paymentDemoReady: wompiPaymentDemoReady(),
        // Porcentajes de la calculadora de gastos. Van en la config PÚBLICA a
        // propósito: son tarifas de ley que se le muestran a todo el que abre
        // una ficha, y esconderlas detrás del token no protegería nada. Lo que
        // sí está protegido es escribirlas (`PUT /api/admin/parametros-gastos`).
        // Si la tabla no está aplicada, esto devuelve los valores por defecto y
        // la ficha se comporta exactamente igual que antes.
        gastos: await parametrosGastos(),
      });
      return sendJSON(res, 404, { error: 'ruta API no encontrada' });
    }
    if (path === '/login') return await serveStatic(res, '/login.html');
    if (path === '/auth/callback') return await serveStatic(res, '/auth-callback.html');
    if (path === '/planes') return await serveStatic(res, '/planes.html');
    if (path === '/cuenta') return await serveStatic(res, '/cuenta.html');
    if (path === '/pago') return await serveStatic(res, '/pago.html');
    if (path === '/comparador') return await serveStatic(res, '/comparador.html');
    if (path === '/admin') return await serveStatic(res, '/admin.html');
    return await serveStatic(res, path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`${requestId} ${path}: ${msg}`);
    return sendJSON(res, 500, { error: 'Error interno del servidor', requestId });
  }
});

/** Ciudades con más inventario: se precargan sus comparables para que la primera
 *  ficha abra al instante en vez de esperar a que se cargue el baseline. */
const WARM_CITIES = ['bogota', 'medellin', 'cali'];

server.listen(PORT, () => {
  serviceReady = true;
  log.info(`Radar local en http://localhost:${PORT}`);
  log.info('API: /health · /ready · /api/home · /api/portal · /api/bancos · /api/remates · /api/facets · /api/stats');
  // Primero las estadísticas y la portada (es lo primero que se pide al entrar),
  // luego los comparables de las ciudades grandes.
  void warmStats()
    .then(() => log.info('Estadísticas precargadas'))
    .then(() => warmDestacados())
    .then(() => log.info('Destacados de la portada precargados'))
    .then(() => warmCityPools(WARM_CITIES))
    .then(() => log.info('Comparables precargados: ' + WARM_CITIES.join(', ')))
    // Al final y sin prisa: si compite con los dos precalentamientos anteriores
    // agota su propio timeout de 800 ms y solo deja un aviso inútil en el log.
    .then(() => warmTotalPortal())
    .then(() => alertDispatchEnabled())
    // Los porcentajes de gastos van con la config pública porque `/api/config`
    // los espera: si llegaran fríos, la primera carga del frontend pagaría la
    // consulta (o su timeout de 800 ms) antes de pintar nada.
    .then(() => warmParametrosGastos())
    // Lo último de todo: la tabla de zonas del panel de administración. Son ~60
    // consultas que solo le sirven a un administrador, así que esperan a que el
    // dashboard público tenga lo suyo listo.
    .then(() => warmZonas())
    .then(() => log.info('Oportunidades por zona precalculadas'))
    // Detrás de las zonas: son dos consultas pequeñas, pero también le sirven
    // solo al administrador y no tienen por qué adelantarse a nada.
    .then(() => warmMetricas())
    .then(() => log.info('Métricas de operación precalculadas'))
    .catch(() => { /* el precalentamiento es best-effort */ });
});

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  serviceReady = false;
  log.info(`${signal} recibido; cerrando el servidor sin cortar solicitudes activas`);

  const forceExit = setTimeout(() => {
    log.error(`Cierre forzado después de ${SHUTDOWN_TIMEOUT_MS / 1_000}s`);
    server.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      log.error(`Error durante el cierre: ${error.message}`);
      process.exit(1);
    }
    log.info('Servidor cerrado correctamente');
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

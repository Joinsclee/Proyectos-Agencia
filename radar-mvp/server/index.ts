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
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../lib/logger.js';
import { queryPortal, queryBancos, queryRemates, facets, stats, warmStats, getProperty, remateBankFacets, type ListQuery } from './queries.js';
import { registerUser, loginUser } from './auth.js';
import { analyzeProperty, marketOnly } from './analysis.js';
import { warmCityPools } from '../engine/zone-comps.js';
import { planDe, redactarLista, redactar, accesoInmueble, accesoRemateFicha } from './acceso.js';
import { getUserFromToken, listFavorites, toggleFavorite, favoriteProperties } from './favorites.js';
import {
  deleteAlert,
  exportAccount,
  exportAccountCsv,
  getAccount,
  getAdminSummary,
  listAdminPlanInterests,
  listPlans,
  registerPlanInterest,
  saveAlert,
  syncAccount,
  updateAdminSubscription,
} from './account.js';
import { applySecurityHeaders, contentTypeFor, createRequestId } from './http-security.js';
import { checkRateLimit, clientAddress, type RateLimitPolicy } from './rate-limit.js';
import { env } from '../lib/env.js';
import { emailDeliveryReady, runAlertDispatch } from './notifications.js';

const log = createLogger('server');
const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');

function sendJSON(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
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
    // no-cache: el navegador SIEMPRE revalida los estáticos. Evita el bug de
    // assets desincronizados (HTML nuevo + app.js viejo cacheado → pantalla
    // colgada). En producción se versionarían los assets; aquí no-cache basta.
    res.writeHead(200, {
      'Content-Type': contentTypeFor(file),
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
      return sendJSON(res, 200, { ok: true, uptime_s: Math.round(process.uptime()) });
    }
    if (path.startsWith('/api/')) {
      if (path === '/api/plans') {
        if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        return sendJSON(res, 200, { ok: true, plans: listPlans() });
      }
      if (path === '/api/internal/alerts/run') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        if (!env.ALERTS_CRON_SECRET) {
          return sendJSON(res, 503, { ok: false, configured: false, error: 'Despacho de alertas no configurado' });
        }
        if (bearer(req) !== env.ALERTS_CRON_SECRET) {
          return sendJSON(res, 401, { ok: false, error: 'Credencial de proceso inválida' });
        }
        const result = await runAlertDispatch();
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
          const properties = rawProperties?.map((property) => redactar(
            property,
            property._kind === 'remate'
              ? accesoRemateFicha(property, userPlan)
              : accesoInmueble(property.crece_tier, userPlan),
          ));
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
        const result = await analyzeProperty(body.kind, body.id, body.refresh === true);
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
      // Una propiedad por id (para abrir una recomendación en su modal).
      if (path === '/api/property') {
        const kind = url.searchParams.get('kind');
        const id = url.searchParams.get('id');
        if ((kind !== 'portal' && kind !== 'banco' && kind !== 'remate') || !id) {
          return sendJSON(res, 400, { ok: false, error: 'kind (portal|banco|remate) e id requeridos' });
        }
        const row = await getProperty(kind, id);
        return row ? sendJSON(res, 200, { ok: true, kind, data: row }) : sendJSON(res, 404, { ok: false, error: 'no encontrado' });
      }
      // Los listados se filtran según el plan ANTES de salir del servidor: lo que
      // el usuario no ha pagado no debe viajar en la respuesta (antes el muro era
      // solo visual y los datos iban igual, visibles desde el navegador).
      if (path === '/api/portal' || path === '/api/bancos' || path === '/api/remates') {
        const plan = planDe(await getUserFromToken(bearer(req)));
        const esRemate = path === '/api/remates';
        const q = parseListQuery(url);
        const r = esRemate ? await queryRemates(q)
          : path === '/api/portal' ? await queryPortal(q) : await queryBancos(q);
        return sendJSON(res, 200, { ...r, plan, data: redactarLista(r.data as any[], plan, esRemate ? 'remate' : 'inmueble') });
      }
      if (path === '/api/facets') {
        const source = (url.searchParams.get('source') as 'portal' | 'bancos') ?? 'portal';
        return sendJSON(res, 200, await facets(source, url.searchParams.get('city') ?? undefined));
      }
      if (path === '/api/remate-banks') return sendJSON(res, 200, await remateBankFacets());
      if (path === '/api/stats') return sendJSON(res, 200, await stats());
      // Config pública para el cliente (URL de Supabase para iniciar OAuth de Google).
      if (path === '/api/config') return sendJSON(res, 200, {
        supabaseUrl: env.SUPABASE_URL,
        alertEmailDeliveryReady: emailDeliveryReady(),
      });
      return sendJSON(res, 404, { error: 'ruta API no encontrada' });
    }
    if (path === '/login') return await serveStatic(res, '/login.html');
    if (path === '/auth/callback') return await serveStatic(res, '/auth-callback.html');
    if (path === '/planes') return await serveStatic(res, '/planes.html');
    if (path === '/cuenta') return await serveStatic(res, '/cuenta.html');
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
  log.info(`Radar local en http://localhost:${PORT}`);
  log.info('API: /api/portal · /api/bancos · /api/remates · /api/facets · /api/stats');
  // Primero las estadísticas (es lo primero que pide el dashboard), luego los
  // comparables de las ciudades grandes.
  void warmStats()
    .then(() => log.info('Estadísticas precargadas'))
    .then(() => warmCityPools(WARM_CITIES))
    .then(() => log.info('Comparables precargados: ' + WARM_CITIES.join(', ')))
    .catch(() => { /* el precalentamiento es best-effort */ });
});

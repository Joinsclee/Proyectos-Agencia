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
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../lib/logger.js';
import { queryPortal, queryBancos, queryRemates, facets, stats, warmStats, getProperty, remateBankFacets, type ListQuery } from './queries.js';
import { registerUser, loginUser } from './auth.js';
import { analyzeProperty, marketOnly } from './analysis.js';
import { warmCityPools } from '../engine/zone-comps.js';
import { planDe, redactarLista, redactar, accesoInmueble, accesoRemateFicha } from './acceso.js';
import { getUserFromToken, listFavorites, toggleFavorite, favoriteProperties } from './favorites.js';
import { env } from '../lib/env.js';

const log = createLogger('server');
const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJSON(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
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
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache, must-revalidate',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    // Health check de la plataforma (EasyPanel/Railway). Debe ser barato y NO tocar
    // la base: si Supabase va lento, el contenedor no debe darse por muerto.
    if (path === '/health') {
      return sendJSON(res, 200, { ok: true, uptime_s: Math.round(process.uptime()) });
    }
    if (path.startsWith('/api/')) {
      // ── Auth (POST) ──
      if (path === '/api/auth/register' || path === '/api/auth/login') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
        const body = await readJsonBody(req);
        const result = path.endsWith('register') ? await registerUser(body) : await loginUser(body);
        return sendJSON(res, result.ok ? 200 : 400, result);
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
          const properties = full ? await favoriteProperties(user.id) : undefined;
          return sendJSON(res, 200, { ok: true, user, favorites, properties });
        }
        return sendJSON(res, 404, { ok: false, error: 'ruta de favoritos no encontrada' });
      }
      // Análisis IA de una propiedad (POST { kind:'banco'|'remate', id, refresh? }).
      if (path === '/api/analyze') {
        if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, error: 'Método no permitido' });
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
      if (path === '/api/config') return sendJSON(res, 200, { supabaseUrl: env.SUPABASE_URL });
      return sendJSON(res, 404, { error: 'ruta API no encontrada' });
    }
    if (path === '/login') return await serveStatic(res, '/login.html');
    if (path === '/auth/callback') return await serveStatic(res, '/auth-callback.html');
    return await serveStatic(res, path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`${path}: ${msg}`);
    return sendJSON(res, 500, { error: msg });
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

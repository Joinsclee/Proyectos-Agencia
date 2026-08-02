import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DEFAULT_MONITOR_PROBES,
  monitorMarkdown,
  normalizeMonitorBaseUrl,
  runProductionMonitor,
} from './production-monitor.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const html = (body: string, status = 200) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8' },
});

// El HTML real: la grilla se sirve VACÍA y la llena planes.js en el cliente.
const PLANES_OK = '<html><body><section class="plans-grid" id="plans"></section>'
  + '<script src="/planes.js"></script></body></html>';
const PLANES_API_OK = { ok: true, plans: [{ code: 'free' }, { code: 'pro' }] };

describe('monitor de producción', () => {
  test('normaliza la URL y rechaza protocolos inseguros', () => {
    assert.equal(normalizeMonitorBaseUrl('https://radar.test///?x=1#top'), 'https://radar.test');
    assert.throws(() => normalizeMonitorBaseUrl('file:///tmp/radar'), /HTTP o HTTPS/);
    assert.throws(() => normalizeMonitorBaseUrl('https://user:secret@radar.test'), /credenciales/);
  });

  test('aprueba respuestas públicas válidas sin exponer su contenido', async () => {
    const responses = new Map([
      ['/health', json({ ok: true, status: 'alive', uptime_s: 20 })],
      ['/ready', json({ ok: true, status: 'ready', uptime_s: 20 })],
      ['/api/config', json({
        supabaseUrl: 'https://radar-test.supabase.co',
        alertEmailDeliveryReady: true,
      })],
      ['/planes', html(PLANES_OK)],
      ['/api/plans', json(PLANES_API_OK)],
    ]);
    let tick = 0;
    const report = await runProductionMonitor({
      baseUrl: 'https://radar.test/',
      fetchImpl: async input => responses.get(new URL(input).pathname) ?? json({}, 404),
      now: () => tick++ * 10,
      checkedAt: () => new Date('2026-07-25T12:00:00.000Z'),
    });

    assert.equal(report.ok, true);
    assert.equal(report.results.length, DEFAULT_MONITOR_PROBES.length);
    assert.equal(JSON.stringify(report).includes('radar-test.supabase.co'), false);
  });

  test('falla ante readiness degradada y conserva un diagnóstico mínimo', async () => {
    const report = await runProductionMonitor({
      baseUrl: 'https://radar.test',
      probes: [DEFAULT_MONITOR_PROBES[1]],
      fetchImpl: async () => json({ ok: false, status: 'starting', uptime_s: 1 }, 503),
    });

    assert.equal(report.ok, false);
    assert.equal(report.results[0].status, 503);
    assert.match(report.results[0].error ?? '', /HTTP 503/);
    assert.match(monitorMarkdown(report), /FALLO/);
  });

  // H-29: la página de planes devolvió 502 durante la auditoría y ninguna sonda
  // lo vio, porque las tres que había miraban la salud del proceso. Un proceso
  // sano puede servir una página rota, así que esta sonda mira la página.
  test('la página de planes se vigila como página, no como servicio', async () => {
    const planes = DEFAULT_MONITOR_PROBES.find(p => p.name === 'planes');
    assert.ok(planes, 'la sonda de /planes forma parte del monitor por omisión');

    const caidas: Array<[string, Response, RegExp]> = [
      ['502 del proxy', html('<html><body>Bad Gateway</body></html>', 502), /HTTP 502/],
      ['página vacía', html(''), /vacía/],
      ['respuesta cortada', html('<html><body><section id="plans"></section>'), /cortada/],
      ['sin la grilla', html('<html><body>Vuelve pronto</body></html>'), /no trae la grilla/],
      // El caso que delataba a la sonda anterior: buscaba la palabra «Pro», que
      // vive en un párrafo de marketing fijo, así que una página sin el script
      // que carga los planes le daba verde.
      ['sin el script', html('<html><body><p>Radar Pro</p><section id="plans"></section></body></html>'), /no carga el script/],
    ];
    for (const [caso, respuesta, esperado] of caidas) {
      const report = await runProductionMonitor({
        baseUrl: 'https://radar.test',
        probes: [planes],
        fetchImpl: async () => respuesta,
      });
      assert.equal(report.ok, false, `${caso} debe abrir incidente`);
      assert.match(report.results[0].error ?? '', esperado, caso);
    }

    const sana = await runProductionMonitor({
      baseUrl: 'https://radar.test',
      probes: [planes],
      fetchImpl: async () => html(PLANES_OK),
    });
    assert.equal(sana.ok, true, 'una página de planes servida entera pasa');
  });

  // La otra mitad de H-29: la página puede servirse perfecta y quedarse vacía
  // para siempre si /api/plans cae. Ninguna sonda que mire solo el HTML lo vería.
  test('los planes también se vigilan en su origen', async () => {
    const api = DEFAULT_MONITOR_PROBES.find(p => p.name === 'planes-api');
    assert.ok(api, 'la sonda de /api/plans forma parte del monitor por omisión');

    const caidas: Array<[string, Response, RegExp]> = [
      ['catálogo vacío', json({ ok: true, plans: [] }), /lista vacía/],
      ['sin la lista', json({ ok: true }), /no devolvió una lista/],
      ['plan sin código', json({ ok: true, plans: [{ name: 'Pro' }] }), /sin código/],
    ];
    for (const [caso, respuesta, esperado] of caidas) {
      const report = await runProductionMonitor({
        baseUrl: 'https://radar.test', probes: [api], fetchImpl: async () => respuesta,
      });
      assert.equal(report.ok, false, `${caso} debe abrir incidente`);
      assert.match(report.results[0].error ?? '', esperado, caso);
    }

    const sana = await runProductionMonitor({
      baseUrl: 'https://radar.test', probes: [api], fetchImpl: async () => json(PLANES_API_OK),
    });
    assert.equal(sana.ok, true);
  });

  test('falla si el contrato JSON cambia', async () => {
    const report = await runProductionMonitor({
      baseUrl: 'https://radar.test',
      probes: [DEFAULT_MONITOR_PROBES[0]],
      fetchImpl: async () => json({ ok: true, status: 'alive' }),
    });

    assert.equal(report.ok, false);
    assert.match(report.results[0].error ?? '', /uptime/);
  });

  test('detecta respuestas que exceden el presupuesto de latencia', async () => {
    const probe = { ...DEFAULT_MONITOR_PROBES[0], maxLatencyMs: 50 };
    let tick = 0;
    const report = await runProductionMonitor({
      baseUrl: 'https://radar.test',
      probes: [probe],
      fetchImpl: async () => json({ ok: true, status: 'alive', uptime_s: 20 }),
      now: () => {
        tick += 100;
        return tick;
      },
    });

    assert.equal(report.ok, false);
    assert.match(report.results[0].error ?? '', /supera presupuesto/);
  });

  test('no acepta HTML como una respuesta sana', async () => {
    const report = await runProductionMonitor({
      baseUrl: 'https://radar.test',
      probes: [DEFAULT_MONITOR_PROBES[0]],
      fetchImpl: async () => new Response('<html>Error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    });

    assert.equal(report.ok, false);
    assert.match(report.results[0].error ?? '', /no es JSON/);
  });
});

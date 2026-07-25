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

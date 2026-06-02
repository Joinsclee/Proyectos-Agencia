/**
 * Smoke test: corre los 4 portales bancarios con bajo volumen
 * para validar que Firecrawl + el patrón funcionan.
 *
 * Uso: npm run test:portals
 *
 * Output: matriz de viabilidad por portal — cuántas URLs encontró,
 *         cuántas extrajo, cuántas pasaron validación, errores.
 *
 * Volumen estimado en créditos Firecrawl:
 *   - Davivienda: 3 listados + 3 fichas = ~6 créditos
 *   - Bancolombia: 1 listado + 3 fichas = ~4 créditos
 *   - BBVA: 1 scrape listado completo = ~1 crédito
 *   - Aval: 1 scrape portal = ~1 crédito
 *   Total: ~12 créditos del Free Tier (1000/mes)
 */

import { run as runDavivienda } from '../scrapers/CO/davivienda/index.js';
import { run as runBancolombia } from '../scrapers/CO/bancolombia/index.js';
import { run as runBBVA } from '../scrapers/CO/bbva/index.js';
import { run as runAval } from '../scrapers/CO/aval/index.js';

const MAX_DETAILS = 3; // tope conservador para POC

type PortalResult = {
  portal: string;
  status: 'ok' | 'fail' | 'partial';
  duration_ms: number;
  found: number;
  inserted: number;
  errors_count: number;
  errors_sample: string[];
};

async function runPortal(name: string, fn: () => Promise<unknown>): Promise<PortalResult> {
  const t0 = Date.now();
  try {
    const r = (await fn()) as {
      records_found: number;
      records_inserted: number;
      errors: Array<{ message: string }>;
    };
    const errors_count = r.errors?.length ?? 0;
    const status: PortalResult['status'] =
      errors_count === 0 && r.records_inserted > 0
        ? 'ok'
        : r.records_inserted > 0
          ? 'partial'
          : 'fail';
    return {
      portal: name,
      status,
      duration_ms: Date.now() - t0,
      found: r.records_found ?? 0,
      inserted: r.records_inserted ?? 0,
      errors_count,
      errors_sample: (r.errors ?? []).slice(0, 3).map((e) => e.message),
    };
  } catch (err) {
    return {
      portal: name,
      status: 'fail',
      duration_ms: Date.now() - t0,
      found: 0,
      inserted: 0,
      errors_count: 1,
      errors_sample: [(err as Error).message],
    };
  }
}

async function main() {
  console.log('🔥 Smoke test radar-mvp — 4 portales bancarios con Firecrawl');
  console.log(`Tope por portal: ${MAX_DETAILS} fichas\n`);

  const results: PortalResult[] = [];

  results.push(await runPortal('davivienda', () => runDavivienda({ maxDetails: MAX_DETAILS })));
  results.push(await runPortal('bancolombia', () => runBancolombia({ maxDetails: MAX_DETAILS })));
  results.push(await runPortal('bbva', () => runBBVA()));
  results.push(await runPortal('aval', () => runAval()));

  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│           MATRIZ DE VIABILIDAD — Smoke test Firecrawl                  │');
  console.log('├──────────────┬────────┬──────────┬─────────┬───────────┬───────────────┤');
  console.log('│ Portal       │ Status │ Duración │ Found   │ Inserted  │ Errores       │');
  console.log('├──────────────┼────────┼──────────┼─────────┼───────────┼───────────────┤');
  for (const r of results) {
    const dur = `${(r.duration_ms / 1000).toFixed(1)}s`.padStart(8);
    const icon = r.status === 'ok' ? '✅' : r.status === 'partial' ? '⚠️ ' : '❌';
    const status = `${icon} ${r.status}`.padEnd(6);
    const portal = r.portal.padEnd(12);
    const found = String(r.found).padStart(7);
    const inserted = String(r.inserted).padStart(9);
    const errs = String(r.errors_count).padStart(13);
    console.log(`│ ${portal} │ ${status} │ ${dur} │ ${found} │ ${inserted} │ ${errs} │`);
  }
  console.log('└──────────────┴────────┴──────────┴─────────┴───────────┴───────────────┘\n');

  for (const r of results.filter((x) => x.errors_sample.length > 0)) {
    console.log(`\n  ${r.portal} — primeros errores:`);
    for (const e of r.errors_sample) console.log(`    · ${e}`);
  }

  const failures = results.filter((r) => r.status === 'fail').length;
  process.exit(failures > 0 ? 1 : 0);
}

main();

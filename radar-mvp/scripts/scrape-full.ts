/**
 * Scrape FULL: corre los 4 portales SIN tope con los 4 fixes activos.
 * Estima ~150-200 créditos del Free Tier (1000).
 *
 * Uso: tsx scripts/scrape-full.ts
 *
 * Output: poblar tabla `inmuebles` con catálogo completo + datos limpios
 *         (image_url extraído, garages en PDFs, tildes normalizadas, sin outliers).
 */

import { run as runDavivienda } from '../scrapers/CO/davivienda/index.js';
import { run as runBancolombia } from '../scrapers/CO/bancolombia/index.js';
import { run as runBBVA } from '../scrapers/CO/bbva/index.js';
import { run as runAval } from '../scrapers/CO/aval/index.js';

async function runPortal(name: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  console.log(`\n▶ Iniciando ${name.toUpperCase()}...`);
  try {
    const r = (await fn()) as {
      records_found: number;
      records_inserted: number;
      errors: Array<{ message: string }>;
    };
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✅ ${name}: ${r.records_inserted} insertados (de ${r.records_found} found) en ${dur}s · ${r.errors.length} errores`);
    return r;
  } catch (err) {
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`❌ ${name} FAIL en ${dur}s: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Scrape FULL — 4 portales sin tope, con los 4 fixes activos\n');

  const r1 = await runPortal('davivienda', () => runDavivienda());
  const r2 = await runPortal('bancolombia', () => runBancolombia());
  const r3 = await runPortal('bbva', () => runBBVA());
  const r4 = await runPortal('aval', () => runAval());

  const total = [r1, r2, r3, r4].reduce((sum, r) => sum + (r?.records_inserted ?? 0), 0);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 TOTAL: ${total} inmuebles en BD`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

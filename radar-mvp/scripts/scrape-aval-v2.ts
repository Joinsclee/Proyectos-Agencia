/**
 * Test/run Aval V2 (procesamiento local del PDF).
 */
import { run } from '../scrapers/CO/aval/index-v2.js';

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  const maxPages = arg ? parseInt(arg.split('=')[1]!, 10) : undefined;

  console.log(`▶ AVAL v2 — maxPages=${maxPages ?? 'ALL'}`);
  const r = await run({ maxPages });
  console.log(`\n✅ ${r.records_inserted}/${r.records_found} insertados, ${r.errors.length} errores`);
  if (r.errors.length > 0 && r.errors.length < 6) {
    r.errors.forEach((e) => console.log(`  ⚠ ${e.message}`));
  }
  console.log('Meta:', r.meta);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

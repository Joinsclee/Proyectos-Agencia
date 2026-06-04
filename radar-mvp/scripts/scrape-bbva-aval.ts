/**
 * Scrape solo BBVA + Aval (los del PDF, con garages mejorados).
 * Davivienda y Bancolombia ya están con fotos en BD.
 */
import { run as runBBVA } from '../scrapers/CO/bbva/index.js';
import { run as runAval } from '../scrapers/CO/aval/index.js';

async function main() {
  console.log('▶ BBVA');
  const r1 = await runBBVA();
  console.log(`  ${r1.records_inserted}/${r1.records_found} insertados, ${r1.errors.length} errores`);

  console.log('\n▶ AVAL');
  const r2 = await runAval();
  console.log(`  ${r2.records_inserted}/${r2.records_found} insertados, ${r2.errors.length} errores`);

  console.log(`\n✅ TOTAL: ${r1.records_inserted + r2.records_inserted} inmuebles`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

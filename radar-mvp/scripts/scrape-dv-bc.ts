/**
 * Scrape solo Davivienda + Bancolombia (los del WoW visual con fotos).
 * Si sobran créditos después, lanzamos BBVA + Aval por separado.
 */
import { run as runDavivienda } from '../scrapers/CO/davivienda/index.js';
import { run as runBancolombia } from '../scrapers/CO/bancolombia/index.js';

async function main() {
  console.log('▶ DAVIVIENDA');
  const r1 = await runDavivienda();
  console.log(`  ${r1.records_inserted}/${r1.records_found} insertados, ${r1.errors.length} errores`);

  console.log('\n▶ BANCOLOMBIA');
  const r2 = await runBancolombia();
  console.log(`  ${r2.records_inserted}/${r2.records_found} insertados, ${r2.errors.length} errores`);

  console.log(`\n✅ TOTAL: ${r1.records_inserted + r2.records_inserted} inmuebles`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * Re-scrape FULL v2:
 *   - Davivienda + Bancolombia: prompts mejorados (price_raw, area_raw)
 *   - BBVA v2 + Aval v2: procesamiento local de PDFs (regex, sin LLM)
 *
 * Créditos estimados: ~280 (DV+BC re-extract); 0 para PDFs.
 */
import { run as runDV } from '../scrapers/CO/davivienda/index.js';
import { run as runBC } from '../scrapers/CO/bancolombia/index.js';
import { run as runBBVAv2 } from '../scrapers/CO/bbva/index-v2.js';
import { run as runAvalv2 } from '../scrapers/CO/aval/index-v2.js';

async function main() {
  const portals = [
    { name: 'DAVIVIENDA', run: runDV },
    { name: 'BANCOLOMBIA', run: runBC },
    { name: 'BBVA v2 (local PDF)', run: runBBVAv2 },
    { name: 'AVAL v2 (local PDF)', run: runAvalv2 },
  ];

  let totalIns = 0;
  let totalFound = 0;
  let totalErr = 0;

  for (const p of portals) {
    console.log(`\n▶ ${p.name}`);
    try {
      const r = await p.run();
      console.log(`  ${r.records_inserted}/${r.records_found} insertados, ${r.errors.length} errores`);
      if (r.errors.length > 0 && r.errors.length < 8) {
        r.errors.forEach((e) => console.log(`    ⚠ ${e.message.substring(0, 120)}`));
      }
      totalIns += r.records_inserted;
      totalFound += r.records_found;
      totalErr += r.errors.length;
    } catch (e) {
      console.error(`  ❌ ${p.name} falló:`, (e as Error).message);
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`TOTAL: ${totalIns}/${totalFound} insertados, ${totalErr} errores`);

  // Créditos Firecrawl
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (apiKey) {
      const res = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as { data?: { remaining_credits?: number } };
        console.log(`\nCréditos Firecrawl restantes: ${data.data?.remaining_credits ?? '?'}`);
      }
    }
  } catch { /* ignore */ }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

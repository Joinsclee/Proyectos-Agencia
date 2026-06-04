/**
 * Limpia inmuebles existentes de fuentes que cambiarán de schema (aval/bbva).
 * Usar SOLO antes de re-scrape full con v2.
 */
import { supabase } from '../lib/supabase.js';

async function main() {
  for (const src of ['aval', 'bbva']) {
    const { error, count } = await supabase
      .from('inmuebles')
      .delete({ count: 'exact' })
      .eq('source', src);
    if (error) throw new Error(`delete ${src}: ${error.message}`);
    console.log(`  ${src}: ${count ?? 0} registros eliminados`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * Reclasifica `is_bank_plaintiff` + `bank_name` en TODOS los remates con el
 * detector preciso (scrapers/CO/rematandobienes/bank-detect.ts).
 *
 * Pedido del cliente: filtrar con precisión los remates donde el DEMANDANTE es
 * un banco. Este script aplica la nueva lógica a los datos ya guardados.
 *
 * Uso: tsx scripts/reclassify-bank-plaintiff.ts [--dry]
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { bankName } from '../scrapers/CO/rematandobienes/bank-detect.js';

const log = createLogger('reclassify-bank');
const DRY = process.argv.includes('--dry');

async function main() {
  const rows: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await supabase
      .from('remates').select('id, plaintiff, features')
      .eq('is_active', true).order('id').range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  let oldCount = 0, newCount = 0, changed = 0;
  const added: string[] = [];   // ahora banco, antes no
  const removed: string[] = []; // antes banco, ahora no (falsos positivos corregidos)

  for (const r of rows) {
    const f = r.features ?? {};
    const oldFlag = f.is_bank_plaintiff === true;
    const name = bankName(r.plaintiff);
    const newFlag = name !== null;
    if (oldFlag) oldCount++;
    if (newFlag) newCount++;
    if (oldFlag !== newFlag) {
      changed++;
      const lbl = `${(r.plaintiff ?? '∅').toString().slice(0, 55)}`;
      if (newFlag) added.push(lbl); else removed.push(lbl);
    }
    // ¿hay que escribir? cambió el flag o falta bank_name
    if (!DRY && (oldFlag !== newFlag || f.bank_name !== name)) {
      const features = { ...f, is_bank_plaintiff: newFlag, bank_name: name };
      const { error } = await supabase.from('remates').update({ features }).eq('id', r.id);
      if (error) log.error(`update ${r.id}: ${error.message}`);
    }
  }

  log.info(`Remates: ${rows.length} · banco ANTES: ${oldCount} → AHORA: ${newCount} (cambiaron ${changed})`);
  log.info(`\nNUEVOS detectados como banco (${added.length}):`);
  for (const a of added.slice(0, 40)) log.info(`  + ${a}`);
  log.info(`\nQUITADOS (eran falsos positivos) (${removed.length}):`);
  for (const r of removed.slice(0, 40)) log.info(`  - ${r}`);
  log.info(DRY ? '\n[DRY] no se escribió nada.' : '\n✅ Reclasificación aplicada.');
}

main().then(() => process.exit(0)).catch((e) => { log.error(e instanceof Error ? e.message : String(e)); process.exit(1); });

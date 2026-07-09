/**
 * Apunta el image_url de todos los remates a la tarjeta branded de su tipo
 * (subidas por scripts/upload-placeholders.ts). Reemplaza las fotos stock
 * Unsplash que daban falsa expectativa.
 *
 * Si en el futuro se generan imágenes "persona IA con cartel", basta con
 * subirlas al mismo path placeholders/{type}.svg (o cambiar BASE/ext aquí).
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('update-images');

const BASE = `${process.env.SUPABASE_URL ?? 'https://uqlfgnylvnefhyuvtncd.supabase.co'}/storage/v1/object/public/inmuebles-pdf/placeholders`;
const VALID_TYPES = new Set(['house', 'apartment', 'lot', 'farm', 'commercial', 'office']);

function imageForType(type: string | null): string {
  const key = type && VALID_TYPES.has(type) ? type : 'unknown';
  return `${BASE}/${key}.svg`;
}

async function main() {
  log.info('Fetch remates…');
  const { data, error } = await supabase.from('remates').select('id, property_type');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  log.info(`  ${rows.length} filas`);

  let updated = 0;
  // Update en bloque por tipo (mucho más rápido que fila por fila)
  const byType = new Map<string, string[]>();
  for (const r of rows) {
    const t = (r.property_type as string) ?? 'unknown';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r.id as string);
  }

  for (const [type, ids] of byType) {
    const url = imageForType(type);
    // Supabase limita el tamaño del IN; troceamos en lotes de 200.
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { error: upErr } = await supabase
        .from('remates')
        .update({ image_url: url })
        .in('id', slice);
      if (upErr) log.warn(`update ${type}: ${upErr.message}`);
      else updated += slice.length;
    }
    log.info(`  ${type.padEnd(11)} → ${ids.length} remates`);
  }

  log.info(`✅ image_url actualizado en ${updated}/${rows.length} remates`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

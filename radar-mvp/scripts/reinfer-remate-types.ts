/**
 * Re-infiere property_type de los remates YA en BD usando la lógica mejorada
 * de inferPropertyType (título + descripción), sin re-scrapear. Actualiza
 * property_type, property_type_raw e image_url (tarjeta branded del tipo).
 *
 * Útil tras mejorar el parser: corrige los ~300 "unknown" a vehículo/parqueadero/
 * apartamento/etc. usando los datos ya guardados.
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { inferPropertyType } from '../scrapers/CO/rematandobienes/parser.js';

const log = createLogger('reinfer');

const BASE = `${process.env.SUPABASE_URL ?? 'https://uqlfgnylvnefhyuvtncd.supabase.co'}/storage/v1/object/public/inmuebles-pdf/placeholders`;
const VALID = new Set(['house', 'apartment', 'lot', 'farm', 'commercial', 'office', 'vehicle', 'parking', 'rights']);
const imageFor = (t: string | null) => `${BASE}/${t && VALID.has(t) ? t : 'unknown'}.svg`;

async function main() {
  log.info('Fetch remates…');
  const { data, error } = await supabase
    .from('remates')
    .select('id, property_type, features, description');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  log.info(`  ${rows.length} filas`);

  const counts: Record<string, number> = {};
  let changed = 0;

  for (const r of rows) {
    const features = (r.features as Record<string, unknown>) ?? {};
    const title = (features.title_raw as string) ?? '';
    const cats = (features.categories as string[]) ?? [];
    const desc = (r.description as string) ?? '';

    const { type, raw } = inferPropertyType(title, cats, desc);
    const finalType = type ?? null;
    counts[finalType ?? 'unknown'] = (counts[finalType ?? 'unknown'] ?? 0) + 1;

    if (finalType !== r.property_type) {
      const { error: upErr } = await supabase
        .from('remates')
        .update({
          property_type: finalType,
          property_type_raw: raw || null,
          image_url: imageFor(finalType),
        })
        .eq('id', r.id);
      if (upErr) log.warn(`update ${r.id}: ${upErr.message}`);
      else changed++;
    } else {
      // Aun si el tipo no cambió, refrescamos image_url a la tarjeta branded.
      await supabase.from('remates').update({ image_url: imageFor(finalType) }).eq('id', r.id);
    }
  }

  log.info('Distribución final de tipos:');
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    log.info(`  ${t.padEnd(11)} ${n}`);
  }
  log.info(`✅ ${changed} remates cambiaron de tipo`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

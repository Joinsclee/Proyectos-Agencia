/**
 * Sube las imágenes IA (persona con cartel "REMATE DE X") generadas por Codex
 * en _assets/remate-types/ a Supabase Storage (placeholders/ai/{type}.png) y
 * apunta todos los remates de ese tipo a su imagen.
 *
 * Requisito: haber generado las 10 PNG en _assets/remate-types/.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('upload-ai');
const BUCKET = 'inmuebles-pdf';
const ASSETS = join(process.cwd(), '_assets', 'remate-types');

const TYPES = ['house', 'apartment', 'lot', 'farm', 'commercial', 'office', 'vehicle', 'parking', 'rights', 'unknown'];

async function ensurePngAllowed() {
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  const allowed = (bucket?.allowed_mime_types ?? []) as string[];
  if (allowed.length && !allowed.includes('image/png')) {
    await supabase.storage.updateBucket(BUCKET, {
      public: bucket?.public ?? true,
      allowedMimeTypes: [...new Set([...allowed, 'image/png'])],
    });
  }
}

async function main() {
  await ensurePngAllowed();

  const urlByType: Record<string, string> = {};
  for (const type of TYPES) {
    const file = join(ASSETS, `${type}.png`);
    if (!existsSync(file)) {
      log.warn(`  ✗ falta ${type}.png — saltando`);
      continue;
    }
    const bytes = readFileSync(file);
    const path = `placeholders/ai/${type}.png`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/png', upsert: true, cacheControl: '604800',
    });
    if (error) { log.error(`  ✗ ${type}: ${error.message}`); continue; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urlByType[type] = pub.publicUrl;
    log.info(`  ✓ ${type.padEnd(11)} subida`);
  }

  // Apuntar remates a su imagen IA por tipo
  const { data: rows } = await supabase.from('remates').select('id, property_type');
  const byType = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const t = (r.property_type as string) ?? 'unknown';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r.id as string);
  }
  let updated = 0;
  for (const [type, ids] of byType) {
    const url = urlByType[type] ?? urlByType['unknown'];
    if (!url) continue;
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { error } = await supabase.from('remates').update({ image_url: url }).in('id', slice);
      if (!error) updated += slice.length;
    }
  }
  log.info(`✅ ${updated} remates apuntados a imágenes IA`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

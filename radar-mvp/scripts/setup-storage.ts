/**
 * Setup Supabase Storage: crea bucket público `inmuebles-pdf` si no existe.
 * Las imágenes de las páginas de PDFs se servirán desde este bucket.
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('setup-storage');
const BUCKET = 'inmuebles-pdf';

async function main() {
  log.info(`Verificando bucket "${BUCKET}"`);

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets: ${listErr.message}`);

  const exists = (buckets ?? []).some((b) => b.name === BUCKET);

  if (exists) {
    log.info(`✓ Bucket ya existe`);
    const { data: details } = await supabase.storage.getBucket(BUCKET);
    log.info(`  public: ${details?.public}`);
  } else {
    log.info(`Creando bucket público…`);
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5_000_000,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    if (createErr) throw new Error(`createBucket: ${createErr.message}`);
    log.info(`✓ Bucket creado`);
  }

  log.info(`✅ Storage listo`);
  log.info(`URL pública base: ${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

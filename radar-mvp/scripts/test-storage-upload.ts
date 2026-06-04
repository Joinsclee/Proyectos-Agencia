/**
 * Test: subir 1 imagen JPG a Supabase Storage y validar URL pública.
 */
import { supabase } from '../lib/supabase.js';
import { readFileSync } from 'node:fs';
import { createLogger } from '../lib/logger.js';

const log = createLogger('test-upload');

async function main() {
  const bucket = 'inmuebles-pdf';
  const localPath = '/tmp/pdf-explore/test-page-004.jpg';
  const remotePath = 'aval/test-page-004.jpg';

  const file = readFileSync(localPath);
  log.info(`Subiendo ${(file.length / 1024).toFixed(0)} KB → ${bucket}/${remotePath}`);

  const { error } = await supabase.storage.from(bucket).upload(remotePath, file, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`upload: ${error.message}`);

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(remotePath);
  log.info(`✅ Subido: ${pub.publicUrl}`);

  const res = await fetch(pub.publicUrl, { method: 'HEAD' });
  log.info(`HEAD status: ${res.status} · Content-Length: ${res.headers.get('content-length')} · Type: ${res.headers.get('content-type')}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

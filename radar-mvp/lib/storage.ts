/**
 * Wrapper de Supabase Storage para subir imágenes públicas.
 */
import { supabase } from './supabase.js';
import { createLogger } from './logger.js';

const log = createLogger('storage');
export const BUCKET_PDF = 'inmuebles-pdf';

/** Sube un buffer a Storage. Retorna la URL pública. */
export async function uploadImage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType = 'image/jpeg',
): Promise<{ url: string; error?: string }> {
  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
    cacheControl: '604800', // 7 días
  });
  if (error) {
    log.warn(`upload ${path}: ${error.message}`);
    return { url: '', error: error.message };
  }
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: pub.publicUrl };
}

/** Construye URL pública sin necesidad de subir (para verificar). */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

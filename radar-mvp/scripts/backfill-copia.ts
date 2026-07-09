/**
 * Backfill de "copia exacta de la publicación" para remates que no la tienen.
 * Usa las cookies de la sesión premium (sin browser) + la regex corregida
 * (acepta el encabezado con ":"). Actualiza solo features.copia_publicacion.
 *
 * Uso: tsx scripts/backfill-copia.ts [--dry]
 */
import { readFileSync } from 'node:fs';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('backfill-copia');
const DRY = process.argv.includes('--dry');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CONC = 8;

const ss = JSON.parse(readFileSync('_session/remates-storage.json', 'utf8'));
const COOKIE = (ss.cookies || []).map((c: any) => `${c.name}=${c.value}`).join('; ');

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n');
}

function extractCopia(text: string): string | null {
  const m = text.match(/Copia exacta de la publicaci[oó]n\s*:?\s*\n+([\s\S]*?)(?=\n\s*(?:Fecha de Audiencia|Radicado del proceso|¡Queremos|Facebook|Instagram|Compartir|Nosotros|$))/i);
  if (!m) return null;
  const t = m[1]!.trim().replace(/[ \t]+/g, ' ');
  if (!t || /^ver detalles del remate/i.test(t) || t.length < 40) return null;
  return t.slice(0, 8000);
}

async function fetchCopia(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Cookie: COOKIE, 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;
    return extractCopia(htmlToText(await res.text()));
  } catch { return null; }
}

async function main() {
  // Traer TODOS los activos sin copia (paginado)
  const rows: { id: string; source_url: string; features: any }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('remates').select('id, source_url, features')
      .eq('is_active', true).is('features->>copia_publicacion', null)
      .order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as any[]);
    if ((data?.length ?? 0) < 1000) break;
  }
  log.info(`Sin copia: ${rows.length}`);

  let ok = 0, miss = 0;
  for (let i = 0; i < rows.length; i += CONC) {
    const batch = rows.slice(i, i + CONC);
    await Promise.all(batch.map(async (r) => {
      const copia = await fetchCopia(r.source_url);
      if (!copia) { miss++; return; }
      if (DRY) { ok++; if (ok <= 3) log.info(`  ${r.id.slice(0, 8)}: ${copia.slice(0, 90)}…`); return; }
      const features = { ...(r.features ?? {}), copia_publicacion: copia };
      const { error } = await supabase.from('remates').update({ features }).eq('id', r.id);
      if (error) { miss++; return; }
      ok++;
    }));
    if ((i / CONC) % 5 === 0) log.info(`  …${i + batch.length}/${rows.length} (recuperadas ${ok})`);
  }
  log.info(`${DRY ? '[DRY] ' : ''}Recuperadas: ${ok} · sin copia real: ${miss}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

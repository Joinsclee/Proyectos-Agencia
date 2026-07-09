/**
 * Helpers de BD específicos de la tabla `public.remates`.
 *
 * El upsert es idempotente sobre la clave (country_code, source, source_id)
 * y refresca `last_seen_at = now()` para el reporte de "nuevos vs activos".
 */
import { supabase } from './supabase.js';
import type { Remate } from '../scrapers/CO/rematandobienes/types.js';
import { createLogger } from './logger.js';

const log = createLogger('remates-db');

export interface UpsertResult {
  inserted: number;
  updated: number;
  errors: Array<{ message: string }>;
}

/** Espera n ms (para backoff entre reintentos). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upsert por (country_code, source, source_id). Refresca last_seen_at en cada llamada.
 *
 * Con retry + backoff: si Supabase/red falla transitoriamente (ENOTFOUND, fetch
 * failed por sleep de la máquina, etc.), reintenta hasta 3 veces antes de rendirse.
 * Esto evita perder un lote entero por un blip de red durante runs largos.
 */
export async function upsertRemates(items: Remate[]): Promise<UpsertResult> {
  if (items.length === 0) return { inserted: 0, updated: 0, errors: [] };

  // Dedup local: si el scraper trajo el mismo aviso dos veces, solo upserteamos el último.
  const map = new Map<string, Remate>();
  for (const it of items) {
    const k = `${it.country_code}|${it.source}|${it.source_id}`;
    map.set(k, it);
  }
  const nowISO = new Date().toISOString();
  const dedup = [...map.values()].map((r) => ({
    ...r,
    last_seen_at: nowISO,
    is_active: true,
    times_missed: 0,
    scraped_at: nowISO,
  }));

  const MAX_RETRIES = 3;
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('remates')
      .upsert(dedup, { onConflict: 'country_code,source,source_id', ignoreDuplicates: false })
      .select('id');

    if (!error) {
      log.info(`Upsert OK: ${data?.length ?? dedup.length} filas tocadas`);
      return { inserted: data?.length ?? dedup.length, updated: 0, errors: [] };
    }

    lastErr = error.message;
    if (attempt < MAX_RETRIES) {
      const backoff = 2000 * attempt; // 2s, 4s
      log.warn(`upsert intento ${attempt}/${MAX_RETRIES} falló (${lastErr}). Reintentando en ${backoff / 1000}s…`);
      await sleep(backoff);
    }
  }

  log.error(`upsert: agotados ${MAX_RETRIES} reintentos. Último error: ${lastErr}`);
  return { inserted: 0, updated: 0, errors: [{ message: lastErr }] };
}

/**
 * Lifecycle con grace period: incrementa times_missed para los remates de esta
 * fuente que NO se vieron en este run, y desactiva los que pasaron el threshold
 * (default 2 runs consecutivos sin verse).
 *
 * IMPORTANTE: llamar SOLO tras runs completos (sin --dept/--city/--max).
 */
export async function markInactiveRemates(
  source: string,
  country: string,
  runStartISO: string,
  threshold = 2,
): Promise<{ incremented: number; deactivated: number }> {
  const { data, error } = await supabase.rpc('mark_stale_remates', {
    p_source: source,
    p_country: country,
    p_run_start: runStartISO,
    p_threshold: threshold,
  });

  if (error) {
    log.warn(`markInactive: ${error.message}`);
    return { incremented: 0, deactivated: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const incremented = Number(row?.incremented ?? 0);
  const deactivated = Number(row?.deactivated ?? 0);
  if (incremented > 0 || deactivated > 0) {
    log.info(`Lifecycle ${source}: +${incremented} missed, ${deactivated} desactivados`);
  }
  return { incremented, deactivated };
}

/**
 * Snapshot del estado del portal en este run: cuántos vistos, cuántos nuevos.
 */
export async function getRunStats(source: string, country: string, sinceISO: string): Promise<{
  total_active: number;
  new_this_run: number;
}> {
  const { data: actives } = await supabase
    .from('remates')
    .select('id', { count: 'exact', head: true })
    .eq('source', source)
    .eq('country_code', country)
    .eq('is_active', true);

  const { data: news } = await supabase
    .from('remates')
    .select('id', { count: 'exact', head: true })
    .eq('source', source)
    .eq('country_code', country)
    .gte('first_seen_at', sinceISO);

  return {
    total_active: (actives as unknown as { count?: number })?.count ?? 0,
    new_this_run: (news as unknown as { count?: number })?.count ?? 0,
  };
}

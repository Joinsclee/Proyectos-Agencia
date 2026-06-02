import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { createLogger } from './logger.js';
import {
  InmuebleSchema,
  type Inmueble,
  type ScrapingRunResult,
  type ScrapingRunStatus,
} from './types.js';

const log = createLogger('supabase');

/**
 * Cliente Supabase con service_role key.
 * NUNCA exponer al frontend; este código corre en backend (cron en Railway).
 */
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  }
);

/**
 * Upsert idempotente de inmuebles. Valida con zod antes de mandar a Supabase.
 *
 * Conflict key: (country_code, source, source_id) — definido en el schema.
 * Si la propiedad ya existe, actualiza precio/área/features y bumpea updated_at.
 *
 * @returns { inserted, updated, invalid } counts
 */
export async function upsertInmuebles(items: unknown[]): Promise<{
  inserted: number;
  updated: number;
  invalid: number;
  errors: Array<{ index: number; message: string }>;
}> {
  const errors: Array<{ index: number; message: string }> = [];
  const valid: Inmueble[] = [];

  items.forEach((raw, i) => {
    const parsed = InmuebleSchema.safeParse(raw);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      errors.push({ index: i, message: parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join('; ') });
    }
  });

  if (valid.length === 0) {
    return { inserted: 0, updated: 0, invalid: errors.length, errors };
  }

  // Supabase v2: upsert con onConflict por la constraint compuesta.
  const { data, error, count } = await supabase
    .from('inmuebles')
    .upsert(valid, {
      onConflict: 'country_code,source,source_id',
      ignoreDuplicates: false,
      count: 'exact',
    })
    .select('id, source, source_id');

  if (error) {
    log.error('Upsert falló', error);
    return {
      inserted: 0,
      updated: 0,
      invalid: errors.length,
      errors: [...errors, { index: -1, message: error.message }],
    };
  }

  // Supabase no distingue insert vs update en el response; reportamos total tocado.
  const touched = data?.length ?? count ?? 0;
  log.info(`Upsert OK: ${touched} filas tocadas, ${errors.length} inválidas`);

  return {
    inserted: touched,
    updated: 0, // No diferenciable sin query adicional; agrupado en `inserted`.
    invalid: errors.length,
    errors,
  };
}

/**
 * Registra un run de scraper. Devuelve el id del log para cerrarlo al final.
 */
export async function startScrapingLog(source: string, countryCode = env.DEFAULT_COUNTRY_CODE): Promise<number | null> {
  const { data, error } = await supabase
    .from('scraping_logs')
    .insert({
      country_code: countryCode,
      source,
      status: 'running' as ScrapingRunStatus,
    })
    .select('id')
    .single();

  if (error) {
    log.error(`No se pudo crear scraping_log para ${source}`, error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Cierra un run de scraper con resultado final.
 */
export async function finishScrapingLog(
  id: number | null,
  status: ScrapingRunStatus,
  result: ScrapingRunResult,
): Promise<void> {
  if (id == null) return;
  const { error } = await supabase
    .from('scraping_logs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_found: result.records_found,
      records_inserted: result.records_inserted,
      records_updated: result.records_updated,
      errors: result.errors,
      meta: result.meta ?? {},
    })
    .eq('id', id);

  if (error) log.error(`No se pudo cerrar scraping_log #${id}`, error);
}

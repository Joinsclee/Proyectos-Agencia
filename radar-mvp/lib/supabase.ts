import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { createLogger } from './logger.js';
import {
  InmuebleSchema,
  isReasonableInmueble,
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
 * Cliente SEPARADO para operaciones de auth de USUARIO (signInWithPassword,
 * getUser(token)). CRÍTICO: NO usar el `supabase` compartido para signIn — eso
 * le fija la sesión del usuario y todas las consultas de datos posteriores
 * correrían como ese usuario (con RLS → 0 filas). Este cliente aislado absorbe
 * ese cambio de sesión sin contaminar el cliente de datos service_role.
 */
export const authClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
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

  // ⭐ Filtro de outliers: descarta inmuebles con datos absurdos
  // (price < 30M, area_m2 < 5m², area_m2 > 100k m² — típicamente errores de parsing de PDFs)
  const reasonable = valid.filter(isReasonableInmueble);
  const outliersDropped = valid.length - reasonable.length;
  if (outliersDropped > 0) {
    log.warn(`Outliers: descartados ${outliersDropped} registros con price/area absurdos`);
  }

  if (reasonable.length === 0) {
    return { inserted: 0, updated: 0, invalid: errors.length + outliersDropped, errors };
  }

  // ⭐ Dedup por (country_code, source, source_id) — Supabase upsert no permite
  // tocar la misma fila dos veces en el mismo statement. Si el scraper genera
  // duplicados (común con hash MD5 de PDFs cuando los campos están vacíos),
  // nos quedamos con la última instancia (más fresca).
  const deduped = new Map<string, Inmueble>();
  for (const v of reasonable) {
    const key = `${v.country_code}|${v.source}|${v.source_id}`;
    deduped.set(key, v);
  }
  const dedupedItems = [...deduped.values()];
  const dropped = reasonable.length - dedupedItems.length;
  if (dropped > 0) {
    log.warn(`Dedup: descartados ${dropped} duplicados en batch (mismo source_id)`);
  }

  // ⭐ Lifecycle tracking: en cada upsert refrescamos last_seen_at y reseteamos
  // times_missed. Si el inmueble había sido marcado como inactivo, vuelve activo
  // (cuando el portal lo "revive" — caso real con remates declarados desiertos
  // que reaparecen con nueva fecha, o inmuebles bancarios que vuelven a salir).
  const nowISO = new Date().toISOString();
  const enriched = dedupedItems.map((it) => ({
    ...it,
    last_seen_at: nowISO,
    times_missed: 0,
    is_active: true,
  }));

  // Supabase v2: upsert con onConflict por la constraint compuesta.
  const { data, error, count } = await supabase
    .from('inmuebles')
    .upsert(enriched, {
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
 * Lifecycle: tras un scrape COMPLETO de una fuente, marca como "missed"
 * los inmuebles de esa fuente que no se vieron en este run, y desactiva
 * los que ya pasaron el threshold (default 2 runs sin verse).
 *
 * IMPORTANTE: llamar SOLO tras runs completos. Si limitaste el scrape
 * (--max, --city, etc.) NO llames esto o marcarías como missed cosas válidas.
 *
 * @param source Ej. 'davivienda'
 * @param country Ej. 'CO'
 * @param runStartISO Timestamp ISO del inicio del run (cualquier last_seen_at < esto es "no visto")
 * @param threshold N° de runs consecutivos sin ver para desactivar. Default: 2.
 */
export async function markStaleInmuebles(
  source: string,
  country: string,
  runStartISO: string,
  threshold = 2,
): Promise<{ incremented: number; deactivated: number }> {
  const { data, error } = await supabase.rpc('mark_stale_inmuebles', {
    p_source: source,
    p_country: country,
    p_run_start: runStartISO,
    p_threshold: threshold,
  });

  if (error) {
    log.error(`markStaleInmuebles(${source}): ${error.message}`);
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

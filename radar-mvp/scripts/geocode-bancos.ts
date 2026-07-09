/**
 * Geocodifica las direcciones de inmuebles de banco → lat/lng (features.lat/lng).
 *
 * Motivo: los activos de banco traen DIRECCIÓN (ej. "CR 38 A 54-50 BARRIO MUZU")
 * pero no coordenadas. Sin geo, el análisis solo puede comparar a nivel CIUDAD.
 * Con geo, el motor compara contra el BARRIO (radio km) — mucho más preciso, que
 * es justo lo que pidió el cliente.
 *
 * Fuente: Nominatim (OpenStreetMap) — gratis, sin API key. Política de uso:
 * máx 1 req/s + User-Agent identificable. Idempotente: solo geocodifica bancos
 * que aún no tienen features.lat (se puede re-correr tras cada scrape de bancos).
 *
 * Filtro de PRECISIÓN: se descarta el resultado si su bounding box es grande
 * (> ~0.15° ≈ 16 km) — eso indica que cayó a centroide de ciudad/región, lo que
 * daría comparables falsos. Mejor sin geo (cae a ciudad) que con geo impreciso.
 *
 * Uso: tsx scripts/geocode-bancos.ts [--dry] [--limit=N]
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('geocode-bancos');
const DRY = process.argv.includes('--dry');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0) || Infinity;

const UA = 'RadarInmobiliario/1.0 (contacto: dineroconsciente.digital@gmail.com)';
const GAP_MS = 1100; // ≥1s entre requests (política Nominatim)
const MAX_BBOX_DEG = 0.15; // ~16 km: por encima = demasiado grueso (ciudad), descartar

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GeoResult { lat: number; lng: number; display: string }

async function geocode(query: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({ q: query, format: 'json', limit: '1', countrycodes: 'co', addressdetails: '0' });
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const arr = (await res.json()) as any[];
    if (!Array.isArray(arr) || !arr.length) return null;
    const r = arr[0];
    const bb = (r.boundingbox ?? []).map(Number); // [south, north, west, east]
    if (bb.length === 4) {
      const dLat = Math.abs(bb[1] - bb[0]);
      const dLng = Math.abs(bb[3] - bb[2]);
      if (dLat > MAX_BBOX_DEG || dLng > MAX_BBOX_DEG) return null; // demasiado grueso
    }
    const lat = Number(r.lat); const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display: r.display_name ?? '' };
  } catch {
    return null;
  }
}

/** Limpia un nombre de barrio/zona de prefijos y códigos que rompen el geocoder. */
function cleanZone(z: string): string {
  return z
    .replace(/^\s*(barrios?|bario|urbanizaci[oó]n|urb\.?|conjunto( residencial)?|cj\.?|sector|edificio|edif\.?|ed\.?|torres?|manzana|mz\.?|etapa|centro comercial|c\.?\s?c\.?)\s+/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')   // códigos numéricos largos
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrae un barrio del texto de dirección (tras "barrio/urb/conjunto/sector"). */
function barrioFromAddress(addr: string): string | null {
  const m = addr.match(/\b(?:barrio|urbanizaci[oó]n|urb\.?|conjunto|sector)\s+([a-záéíóúñ0-9 .'-]{3,40})/i);
  return m ? cleanZone(m[1]) : null;
}

/**
 * Mejor consulta posible, priorizando el BARRIO (granularidad que buscamos):
 *   1. zona limpia + ciudad   2. barrio extraído de la dirección + ciudad
 *   3. dirección + ciudad (último recurso). null si no hay nada acotado.
 */
function buildQuery(row: { address: string | null; zone: string | null; city: string | null }): string | null {
  const city = row.city ? String(row.city).trim() : '';
  const barrio = row.zone ? cleanZone(String(row.zone)) : (row.address ? barrioFromAddress(String(row.address)) : null);
  if (barrio && barrio.length >= 3) return [barrio, city, 'Colombia'].filter(Boolean).join(', ');
  if (row.address) return [String(row.address).trim(), city, 'Colombia'].filter(Boolean).join(', ');
  return null;
}

async function main() {
  // Bancos activos sin geo y con dirección o zona.
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, city, zone, address, features')
      .neq('source', 'fincaraiz').eq('is_active', true)
      .is('features->lat', null)
      .order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const targets = rows.filter((r) => r.address || r.zone).slice(0, LIMIT === Infinity ? undefined : LIMIT);
  log.info(`Bancos sin geo a geocodificar: ${targets.length}${DRY ? ' (DRY)' : ''}`);

  let ok = 0, miss = 0;
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    const q = buildQuery(r);
    if (!q) { miss++; continue; }
    const geo = await geocode(q);
    await sleep(GAP_MS);
    if (!geo) { miss++; if (i < 5 || i % 50 === 0) log.info(`  ✖ ${q.slice(0, 50)} → sin match preciso`); continue; }
    ok++;
    if (i < 5 || i % 50 === 0) log.info(`  ✓ ${q.slice(0, 45)} → ${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`);
    if (DRY) continue;
    const features = { ...(r.features ?? {}), lat: geo.lat, lng: geo.lng, geocode: { source: 'nominatim', at: new Date().toISOString() } };
    const { error } = await supabase.from('inmuebles').update({ features }).eq('id', r.id);
    if (error) { miss++; ok--; }
    if (i % 25 === 0) log.info(`  …${i + 1}/${targets.length} (geo ${ok}, sin ${miss})`);
  }
  log.info(`✅ Geocodificados: ${ok} · sin match preciso: ${miss}`);
}

main().then(() => process.exit(0)).catch((e) => { log.error(e instanceof Error ? e.message : String(e)); process.exit(1); });

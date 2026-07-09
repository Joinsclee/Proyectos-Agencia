/**
 * Arreglo de datos: el parser de remates desalineó columnas (la fecha quedó en
 * `address`, el avalúo en `auction_date_raw`, la postura en `appraisal_value`).
 * Este script RE-MAPEA los 597 registros rotos a sus columnas correctas, sin
 * re-scrapear. Solo toca filas con auction_date NULL cuyo `address` es una fecha
 * en español (el patrón verificado como uniforme). NO toca las 8 ya correctas.
 *
 * Uso: tsx scripts/fix-remates-fields.ts [--dry]
 *
 * NOTA: plaintiff/court/case_number siguen null (no están en los datos guardados);
 * recuperarlos requiere re-scrape con el parser corregido.
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('fix-remates');
const DRY = process.argv.includes('--dry');

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** "junio 5, 2026" → "2026-06-05" (o null si no parsea). */
function parseSpanishDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.trim().toLowerCase().match(/([a-záéí]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!m) return null;
  const mes = MESES[m[1]!.normalize('NFD').replace(/\p{Diacritic}/gu, '')];
  if (!mes) return null;
  const dd = String(Number(m[2])).padStart(2, '0');
  const mm = String(mes).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

/** "$177,423,000" → 177423000 (o null). */
function parseMoneyCOP(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MES_RE = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+\d{1,2},?\s+\d{4}/i;

async function main() {
  const { data, error } = await supabase
    .from('remates')
    .select('id, address, auction_date, auction_date_raw, appraisal_value, appraisal_value_raw, minimum_bid')
    .eq('is_active', true);
  if (error) throw new Error(error.message);

  let fixed = 0, skipped = 0;
  for (const r of data ?? []) {
    const addr = String(r.address ?? '').trim();
    // Solo re-mapear los rotos: sin auction_date y con address = fecha.
    if (r.auction_date || !MES_RE.test(addr)) { skipped++; continue; }

    const auction_date = parseSpanishDate(addr);
    const avaluo = parseMoneyCOP(String(r.auction_date_raw ?? '')); // el grande = avalúo
    const postura = Number(r.appraisal_value) || null; // el que estaba como "appraisal" = postura
    const minimum_bid_pct = avaluo && postura ? Math.round((postura / avaluo) * 100) : null;

    const patch = {
      auction_date,
      auction_date_raw: addr, // conservamos el texto original de la fecha
      appraisal_value: avaluo,
      appraisal_value_raw: String(r.auction_date_raw ?? ''),
      minimum_bid: postura,
      minimum_bid_raw: r.appraisal_value_raw ?? null,
      minimum_bid_pct,
      address: null, // era una fecha, no una dirección real (la ubicación va en description/city)
    };

    if (DRY) {
      if (fixed < 4) log.info(`  ${r.id.slice(0, 8)} → fecha=${auction_date} avalúo=${avaluo} postura=${postura} (${minimum_bid_pct}%)`);
    } else {
      const { error: uErr } = await supabase.from('remates').update(patch).eq('id', r.id);
      if (uErr) { log.error(`  ${r.id}: ${uErr.message}`); continue; }
    }
    fixed++;
  }
  log.info(`${DRY ? '[DRY] ' : ''}Re-mapeados: ${fixed} · sin tocar: ${skipped}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

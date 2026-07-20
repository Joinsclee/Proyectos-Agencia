/**
 * Recalcula el área de los activos de AVAL y les asigna area_tipo.
 *
 * El parser anterior leía el punto como separador decimal, así que "8.008 m²"
 * quedaba como 8 m². Como el Índice CRECE se calcula sobre el precio por m², un
 * lote grande aparecía con un $/m² mil veces mayor al real.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import { parseAreaCO, clasificarAreaTipo } from '../lib/numeros.js';

const log = createLogger('areas-aval');

export async function corregir(dry = false) {
  const { data, error } = await supabase
    .from('inmuebles').select('id, type, area_m2, price, features')
    .eq('source', 'aval').eq('is_active', true);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as any[];
  let corregidas = 0, tipadas = 0;
  const ejemplos: string[] = [];

  for (const r of filas) {
    const f = { ...(r.features ?? {}) };
    const raw = f.area_raw as string | null;
    const areaOk = parseAreaCO(raw);
    const tipo = clasificarAreaTipo(raw, r.type);
    const cambiaArea = areaOk != null && Math.abs(Number(r.area_m2 ?? 0) - areaOk) > 0.01;
    const cambiaTipo = f.area_tipo !== tipo;
    if (!cambiaArea && !cambiaTipo) continue;

    if (cambiaArea && ejemplos.length < 5) {
      const antes = Number(r.area_m2), ppm2Antes = r.price / antes, ppm2Post = r.price / areaOk!;
      ejemplos.push(`${raw}: ${antes} → ${areaOk} m² · $/m² ${Math.round(ppm2Antes).toLocaleString('es-CO')} → ${Math.round(ppm2Post).toLocaleString('es-CO')}`);
    }
    if (cambiaArea) corregidas++;
    if (cambiaTipo) tipadas++;
    if (dry) continue;
    f.area_tipo = tipo;
    await supabase.from('inmuebles')
      .update({ ...(cambiaArea ? { area_m2: areaOk } : {}), features: f })
      .eq('id', r.id);
  }
  log.info(`AVAL activos: ${filas.length} · áreas corregidas: ${corregidas} · area_tipo asignado: ${tipadas}`);
  for (const e of ejemplos) log.info(`   · ${e}`);
  if (dry) log.info('DRY: no se escribió nada.');
  return { corregidas, tipadas };
}

if (isEntrypoint(import.meta.url)) {
  corregir(process.argv.includes('--dry')).then(() => process.exit(0))
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}

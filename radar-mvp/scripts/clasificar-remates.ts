/**
 * Rellena los campos jurídicos de los remates ya guardados.
 *
 * HU "Motor de Remates Judiciales": origen_demandante, tipo_proceso y cuota_parte
 * salen del texto del aviso del juzgado, que ya tenemos en `features.copia_publicacion`.
 * Correr después de cada scrape de remates.
 *
 * Uso: npx tsx scripts/clasificar-remates.ts [--dry]
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import {
  origenDemandante, tipoProceso, extraerCuotaParte, tieneCuotaParte,
  accesoRemate,
} from '../engine/remates-legal.js';

const log = createLogger('remates-legal');

interface Fila {
  id: string;
  plaintiff: string | null;
  description: string | null;
  property_type_raw: string | null;
  appraisal_value: number | null;
  minimum_bid: number | null;
  features: Record<string, unknown> | null;
  origen_demandante: string | null;
  tipo_proceso: string | null;
  cuota_parte: number | null;
}

export async function clasificarRemates(dry = false) {
  const { data, error } = await supabase
    .from('remates')
    .select('id, plaintiff, description, property_type_raw, appraisal_value, minimum_bid, features, origen_demandante, tipo_proceso, cuota_parte')
    .eq('is_active', true);
  if (error) throw new Error(`clasificarRemates: ${error.message}`);
  const filas = (data ?? []) as unknown as Fila[];
  log.info(`Remates activos: ${filas.length}`);

  const tally = { bancario: 0, particular: 0, hipotecario: 0, cuota: 0, escritos: 0 };
  const ejemplosCuota: string[] = [];

  for (const r of filas) {
    const f = (r.features ?? {}) as any;
    const copia = f.copia_publicacion as string | null;

    const origen = origenDemandante(f.is_bank_plaintiff);
    const proceso = tipoProceso(r.property_type_raw, r.description, copia);
    // El título y la descripción pesan más que la copia completa del aviso: la
    // cuota-parte casi siempre se enuncia ahí, y la copia trae además todo el
    // articulado procesal donde abundan porcentajes que no son del bien.
    const cuota = extraerCuotaParte(r.property_type_raw, r.description, copia);

    if (origen === 'bancario') tally.bancario++; else tally.particular++;
    if (proceso === 'ejecutivo_hipotecario') tally.hipotecario++;
    if (tieneCuotaParte(cuota.porcentaje)) {
      tally.cuota++;
      if (ejemplosCuota.length < 5) ejemplosCuota.push(`${cuota.porcentaje}% · "${(cuota.evidencia ?? '').slice(0, 90)}…"`);
    }

    const sinCambio = r.origen_demandante === origen && r.tipo_proceso === proceso
      && Number(r.cuota_parte ?? 100) === cuota.porcentaje;
    if (sinCambio || dry) continue;

    const { error: e } = await supabase.from('remates').update({
      origen_demandante: origen,
      tipo_proceso: proceso,
      cuota_parte: cuota.porcentaje,
      features: { ...f, cuota_parte_evidencia: cuota.evidencia },
    }).eq('id', r.id);
    if (e) log.error(`update ${r.id}: ${e.message}`); else tally.escritos++;
  }

  log.info('─'.repeat(50));
  log.info(`Demandante bancario:      ${tally.bancario}`);
  log.info(`Demandante particular:    ${tally.particular}`);
  log.info(`Ejecutivo hipotecario:    ${tally.hipotecario}`);
  log.info(`CON alerta de cuota-parte: ${tally.cuota}  (${((tally.cuota / filas.length) * 100).toFixed(1)}%)`);
  if (ejemplosCuota.length) {
    log.info('Ejemplos detectados:');
    for (const e of ejemplosCuota) log.info(`   · ${e}`);
  }
  // Reparto por la matriz de acceso, para ver qué queda gratis y qué de pago.
  const matriz: Record<string, number> = {};
  for (const r of filas) {
    const f = (r.features ?? {}) as any;
    const desc = r.appraisal_value && r.minimum_bid
      ? (1 - Number(r.minimum_bid) / Number(r.appraisal_value)) * 100 : 0;
    const a = accesoRemate(origenDemandante(f.is_bank_plaintiff), desc);
    matriz[a] = (matriz[a] ?? 0) + 1;
  }
  log.info(`Matriz de acceso: ${Object.entries(matriz).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  log.info(dry ? 'DRY: no se escribió nada.' : `✅ ${tally.escritos} remates actualizados`);
  return tally;
}

if (isEntrypoint(import.meta.url)) {
  clasificarRemates(process.argv.includes('--dry'))
    .then(() => process.exit(0))
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}

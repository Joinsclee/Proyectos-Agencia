/**
 * Aplica las reglas de vigencia (30/90 días) y registra los eventos.
 *
 * Por defecto NO escribe: hay que pasar --aplicar. La razón es que la regla mide
 * desde la primera detección del motor, y en un inventario cargado de golpe esa
 * fecha es la del scrape masivo, no la de publicación del aviso. Correrla sin
 * mirar sobre datos sembrados así oculta la mayor parte del catálogo de un
 * plumazo. Con scraping semanal establecido, ambas fechas convergen y la regla
 * hace lo que promete.
 *
 * Uso:
 *   npx tsx scripts/aplicar-vigencia.ts             # informe, sin escribir
 *   npx tsx scripts/aplicar-vigencia.ts --aplicar   # escribe estados y eventos
 *   npx tsx scripts/aplicar-vigencia.ts --aplicar --desde=2026-07-20
 *        ↑ toma esa fecha como día cero para el inventario ya existente, de modo
 *          que el reloj empiece a correr desde la próxima corrida y no borre lo
 *          que solo parece viejo por cuándo lo cargamos.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import { evaluarVigencia, caducaPorAntiguedad, type EventoVigencia } from '../engine/vigencia.js';

const log = createLogger('vigencia');

interface Fila {
  id: string; source: string; source_id: string; estado: string | null;
  first_seen_at: string; fecha_publicacion_fuente: string | null;
}

async function registrarEvento(f: Fila, evento: EventoVigencia, detalle: string | null) {
  await supabase.from('oportunidades_historial').insert({
    entidad: 'inmueble', entidad_id: f.id, source: f.source, source_id: f.source_id,
    evento, detalle,
  });
}

export async function aplicarVigencia(aplicar = false, desde?: string) {
  const ahora = new Date();
  const filas: Fila[] = [];
  let cursor = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, source, source_id, estado, first_seen_at, fecha_publicacion_fuente')
      .eq('is_active', true).gt('id', cursor).order('id').limit(1000);
    if (error) throw new Error(`vigencia: ${error.message}`);
    const b = (data ?? []) as unknown as Fila[];
    filas.push(...b);
    if (b.length < 1000) break;
    cursor = b[b.length - 1].id;
  }
  log.info(`Inmuebles activos: ${filas.length.toLocaleString('es-CO')}`);

  const cuenta: Record<string, number> = { activo: 0, expirado_30d: 0, descartado_90d: 0, exentos: 0 };
  const cambios: Array<{ f: Fila; estado: string; evento: EventoVigencia; motivo: string | null }> = [];

  for (const f of filas) {
    if (!caducaPorAntiguedad(f.source)) { cuenta.exentos++; continue; }
    // `desde` reinicia el reloj del inventario ya sembrado.
    const base = desde && new Date(f.first_seen_at) < new Date(desde) ? desde : f.first_seen_at;
    const r = evaluarVigencia({ ...f, first_seen_at: base }, ahora);
    cuenta[r.estado] = (cuenta[r.estado] ?? 0) + 1;
    if (r.evento && (f.estado ?? 'activo') !== r.estado) cambios.push({ f, estado: r.estado, evento: r.evento, motivo: r.motivo });
  }

  log.info('─'.repeat(52));
  log.info(`Exentos (bancos, no caducan):  ${cuenta.exentos.toLocaleString('es-CO')}`);
  log.info(`Seguirían activos:             ${cuenta.activo.toLocaleString('es-CO')}`);
  log.info(`Pasarían a expirado_30d:       ${cuenta.expirado_30d.toLocaleString('es-CO')}`);
  log.info(`Pasarían a descartado_90d:     ${cuenta.descartado_90d.toLocaleString('es-CO')}`);
  const visibles = cuenta.activo + cuenta.exentos;
  log.info(`VISIBLES tras aplicar:         ${visibles.toLocaleString('es-CO')} de ${filas.length.toLocaleString('es-CO')} (${((visibles / filas.length) * 100).toFixed(1)}%)`);

  if (!aplicar) { log.info('Informe solamente. Usa --aplicar para escribir.'); return cuenta; }

  let ok = 0;
  const CONC = 20;
  for (let i = 0; i < cambios.length; i += CONC) {
    await Promise.all(cambios.slice(i, i + CONC).map(async (c) => {
      const { error } = await supabase.from('inmuebles').update({ estado: c.estado }).eq('id', c.f.id);
      if (error) { log.error(`vigencia ${c.f.id}: ${error.message}`); return; }
      await registrarEvento(c.f, c.evento, c.motivo);
      ok++;
    }));
  }
  log.info(`✅ ${ok} inmuebles cambiaron de estado (con evento registrado)`);
  return cuenta;
}

if (isEntrypoint(import.meta.url)) {
  const desde = process.argv.find((a) => a.startsWith('--desde='))?.split('=')[1];
  aplicarVigencia(process.argv.includes('--aplicar'), desde)
    .then(() => process.exit(0))
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}

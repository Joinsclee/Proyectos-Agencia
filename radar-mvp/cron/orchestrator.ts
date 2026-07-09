/**
 * Orchestrator — corre todos los scrapers de Fase 1 en una sola pasada.
 *
 * Lo invoca `npm run scrape:all`.
 *
 * IMPORTANTE: este archivo SOLO ejecuta una pasada completa de los portales.
 * La PROGRAMACIÓN (frecuencia: bancos 2×/semana, remates 1×/semana) NO se
 * configura aquí — se define afuera, en el cron del servidor (Railway / cron
 * del SO / n8n Schedule Trigger) que llama a este script. Así el orchestrator
 * queda agnóstico de la cadencia.
 *
 * Usa las versiones canónicas v2 para los portales de PDF (Aval, BBVA).
 */
import { isEntrypoint } from '../lib/is-main.js';
import { createLogger } from '../lib/logger.js';
import { run as runDavivienda } from '../scrapers/CO/davivienda/index.js';
import { run as runBancolombia } from '../scrapers/CO/bancolombia/index.js';
import { run as runBbva } from '../scrapers/CO/bbva/index-v2.js';
import { run as runAval } from '../scrapers/CO/aval/index-v2.js';
import { markStaleInmuebles } from '../lib/supabase.js';
import { env } from '../lib/env.js';
import type { ScrapingRunResult } from '../lib/types.js';

const log = createLogger('orchestrator');

interface PortalRunner {
  name: string;
  run: () => Promise<ScrapingRunResult>;
}

/** Portales de Fase 1 (bancos, acceso público sin login). */
const PORTALS: PortalRunner[] = [
  { name: 'davivienda', run: () => runDavivienda() },
  { name: 'bancolombia', run: () => runBancolombia() },
  { name: 'bbva', run: () => runBbva() },
  { name: 'aval', run: () => runAval() },
];

interface PortalSummary {
  portal: string;
  status: 'ok' | 'partial' | 'error';
  found: number;
  inserted: number;
  errors: number;
  // Lifecycle: tras un scrape exitoso, marcamos los inmuebles que no se vieron.
  bumped?: number;        // pasaron a times_missed+1
  deactivated?: number;   // alcanzaron threshold y quedaron is_active=false
}

/**
 * Corre todos los portales en secuencia. No aborta si uno falla:
 * captura el error, lo registra y sigue con el siguiente.
 */
export async function runAll(): Promise<PortalSummary[]> {
  const startedAt = Date.now();
  const summary: PortalSummary[] = [];

  for (const portal of PORTALS) {
    log.info(`▶ ${portal.name}`);
    // Marca de inicio para lifecycle: cualquier inmueble cuyo last_seen_at
    // quede por debajo de este timestamp tras el run = no se vio.
    const runStartISO = new Date().toISOString();
    try {
      const r = await portal.run();
      const item: PortalSummary = {
        portal: portal.name,
        status: r.errors.length === 0 ? 'ok' : 'partial',
        found: r.records_found,
        inserted: r.records_inserted,
        errors: r.errors.length,
      };

      // ⭐ Lifecycle: solo si el scrape fue completo (no parcial por error fatal).
      // Si encontró 0 inmuebles, probable que el portal esté caído — NO marcamos
      // como missed para evitar wipeout total ante un fallo de fuente.
      if (r.records_found > 0) {
        try {
          const lc = await markStaleInmuebles(portal.name, env.DEFAULT_COUNTRY_CODE, runStartISO);
          item.bumped = lc.incremented;
          item.deactivated = lc.deactivated;
        } catch (e) {
          log.warn(`Lifecycle ${portal.name} falló: ${(e as Error).message}`);
        }
      } else {
        log.warn(`${portal.name}: 0 inmuebles encontrados — saltando lifecycle (probable fallo de fuente)`);
      }

      summary.push(item);
      const lifecycleStr = item.deactivated || item.bumped
        ? ` · lifecycle: +${item.bumped ?? 0} missed, ${item.deactivated ?? 0} desactivados`
        : '';
      log.info(`✓ ${portal.name}: ${r.records_inserted} insertados / ${r.records_found} encontrados (${r.errors.length} errores)${lifecycleStr}`);
    } catch (err) {
      summary.push({ portal: portal.name, status: 'error', found: 0, inserted: 0, errors: 1 });
      log.error(`✗ ${portal.name} falló: ${(err as Error).message}`);
    }
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
  log.info(`──────── Resumen orchestrator (${secs}s) ────────`);
  for (const s of summary) {
    const lc = s.deactivated || s.bumped
      ? ` lifecycle=+${s.bumped ?? 0}/-${s.deactivated ?? 0}`
      : '';
    log.info(`  ${s.portal.padEnd(14)} ${s.status.padEnd(8)} found=${s.found} inserted=${s.inserted} errors=${s.errors}${lc}`);
  }
  return summary;
}

// CLI: cross-platform (funciona en Windows, macOS y Linux).
const isMain = isEntrypoint(import.meta.url);
if (isMain) {
  runAll()
    .then((summary) => {
      const failed = summary.some((s) => s.status === 'error');
      process.exit(failed ? 1 : 0);
    })
    .catch((e) => {
      log.error('Orchestrator falló', e);
      process.exit(1);
    });
}

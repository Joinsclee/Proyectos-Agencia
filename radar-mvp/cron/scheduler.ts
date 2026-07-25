/**
 * Planificador de las corridas automáticas del Radar.
 *
 * Cadencias (decisión del cliente, 2026-07-20):
 *   · fincaraiz → cada  7 días   · remates → cada  7 días
 *   · bancos    → cada  7 días   · motor   → cada  1 día
 *
 * Los bancos se verifican semanalmente para cumplir la cadencia acordada con el
 * cliente y mantener alineadas todas las fuentes del Radar.
 *
 * DISEÑO: el calendario está en la base (`radar_cron_jobs`), no en la memoria del
 * proceso. Este planificador solo despierta cada cierto rato y pregunta "¿algún
 * trabajo lleva más de N días sin correr?". Consecuencias buenas:
 *   · Un reinicio no pierde el calendario ni dispara todo de golpe.
 *   · Si el contenedor estuvo caído tres días, al volver recupera lo pendiente.
 *   · Dos réplicas no duplican trabajo: el primero que llega toma el cerrojo.
 *   · Cambiar una cadencia es un UPDATE, sin desplegar.
 *
 * Uso:
 *   npx tsx cron/scheduler.ts            # queda escuchando
 *   npx tsx cron/scheduler.ts --once     # evalúa una vez y sale (para cron externo)
 *   npx tsx cron/scheduler.ts --forzar=remates   # corre uno ya, ignorando la cadencia
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';

const log = createLogger('cron');

/** Cada cuánto se revisa si hay algo pendiente. */
const INTERVALO_REVISION_MS = 15 * 60_000;
/** Un trabajo que lleva más de esto "corriendo" se da por muerto y se libera. */
const CERROJO_MAX_MS = 6 * 60 * 60_000;

interface Job {
  nombre: string;
  cadencia_dias: number;
  habilitado: boolean;
  ultima_corrida: string | null;
  corriendo_desde: string | null;
}

/** Qué ejecuta cada trabajo. Import dinámico: no cargar Playwright si no toca. */
const TAREAS: Record<string, () => Promise<unknown>> = {
  fincaraiz: async () => (await import('../scrapers/CO/fincaraiz/index.js')).run({}),
  bancos: async () => (await import('./orchestrator.js')).runAll(),
  remates: async () => (await import('../scrapers/CO/rematandobienes/index.js')).run({}),
  motor: async () => {
    // Tras cualquier scrape hay que reclasificar, y los remates necesitan además
    // sus campos jurídicos al día.
    await (await import('../scripts/clasificar-remates.js')).clasificarRemates(false);
    return (await import('../engine/run.js')).run();
  },
};

const DIA_MS = 86_400_000;

/** ¿Le toca a este trabajo? */
export function toca(job: Job, ahora = new Date()): boolean {
  if (!job.habilitado) return false;
  if (job.corriendo_desde) {
    const desde = new Date(job.corriendo_desde).getTime();
    if (ahora.getTime() - desde < CERROJO_MAX_MS) return false; // otro lo está corriendo
    // Cerrojo vencido: el proceso anterior murió sin soltarlo.
  }
  if (!job.ultima_corrida) return true; // nunca ha corrido
  const dias = (ahora.getTime() - new Date(job.ultima_corrida).getTime()) / DIA_MS;
  return dias >= job.cadencia_dias;
}

async function tomarCerrojo(nombre: string): Promise<boolean> {
  // Solo se toma si sigue libre (o vencido): dos réplicas no pueden ganar ambas.
  const limite = new Date(Date.now() - CERROJO_MAX_MS).toISOString();
  const { data, error } = await supabase
    .from('radar_cron_jobs')
    .update({ corriendo_desde: new Date().toISOString() })
    .eq('nombre', nombre)
    .or(`corriendo_desde.is.null,corriendo_desde.lt.${limite}`)
    .select('nombre');
  if (error) { log.error(`cerrojo ${nombre}: ${error.message}`); return false; }
  return (data ?? []).length > 0;
}

async function soltarCerrojo(nombre: string, estado: 'ok' | 'error', detalle: string, seg: number) {
  await supabase.from('radar_cron_jobs').update({
    corriendo_desde: null,
    ultima_corrida: new Date().toISOString(),
    ultimo_estado: estado,
    ultimo_detalle: detalle.slice(0, 500),
    duracion_seg: seg,
    actualizado_en: new Date().toISOString(),
  }).eq('nombre', nombre);
}

async function ejecutar(nombre: string) {
  if (!TAREAS[nombre]) { log.warn(`Sin tarea definida para "${nombre}"`); return; }
  if (!(await tomarCerrojo(nombre))) { log.info(`${nombre}: ya lo está corriendo otro proceso`); return; }
  const t0 = Date.now();
  log.info(`▶ ${nombre}`);
  try {
    const r = await TAREAS[nombre]();
    const seg = Math.round((Date.now() - t0) / 1000);
    await soltarCerrojo(nombre, 'ok', JSON.stringify(r ?? {}), seg);
    log.info(`✅ ${nombre} en ${seg}s`);
  } catch (e) {
    const seg = Math.round((Date.now() - t0) / 1000);
    // Se suelta el cerrojo SIEMPRE: si un fallo lo dejara tomado, el trabajo no
    // volvería a correr nunca y el radar se quedaría congelado en silencio.
    await soltarCerrojo(nombre, 'error', e instanceof Error ? e.message : String(e), seg);
    log.error(`✖ ${nombre}`, e);
  }
}

/** Una pasada: mira qué toca y lo corre en serie (no saturar Supabase ni Firecrawl). */
export async function revisar(forzar?: string) {
  const { data, error } = await supabase.from('radar_cron_jobs').select('*').order('nombre');
  if (error) { log.error(`revisar: ${error.message}`); return; }
  const jobs = (data ?? []) as unknown as Job[];

  if (forzar) { await ejecutar(forzar); return; }

  const pendientes = jobs.filter((j) => toca(j));
  if (!pendientes.length) {
    const prox = jobs.filter((j) => j.habilitado && j.ultima_corrida)
      .map((j) => `${j.nombre} en ${Math.max(0, Math.ceil(j.cadencia_dias - (Date.now() - new Date(j.ultima_corrida!).getTime()) / DIA_MS))}d`)
      .join(' · ');
    log.info(`Nada pendiente. Próximas: ${prox || '—'}`);
    return;
  }
  // Orden importante: el motor va al final, para clasificar con los datos nuevos.
  const orden = ['fincaraiz', 'bancos', 'remates', 'motor'];
  pendientes.sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre));
  log.info(`Pendientes: ${pendientes.map((p) => p.nombre).join(', ')}`);
  for (const j of pendientes) await ejecutar(j.nombre);
}

if (isEntrypoint(import.meta.url)) {
  const forzar = process.argv.find((a) => a.startsWith('--forzar='))?.split('=')[1];
  const once = process.argv.includes('--once') || !!forzar;

  revisar(forzar)
    .then(() => {
      if (once) process.exit(0);
      log.info(`Planificador activo · revisión cada ${INTERVALO_REVISION_MS / 60000} min`);
      setInterval(() => { void revisar(); }, INTERVALO_REVISION_MS);
    })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}

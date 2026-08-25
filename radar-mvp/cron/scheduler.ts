/**
 * Planificador de las corridas automáticas del Radar.
 *
 * Cadencias (decisión del cliente, 2026-07-20):
 *   · fincaraiz → cada  7 días   · remates → cada  7 días
 *   · bancos    → cada  7 días   · motor   → cada  1 día
 *   · alertas   → cada  7 días (se habilita después del canary de correo)
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
  fincaraiz: async () => {
    const scraper = await import('../scrapers/CO/fincaraiz/index.js');
    const venta = await scraper.run({});
    const arriendo = await scraper.runRentals({});
    return { venta, arriendo };
  },
  bancos: async () => (await import('./orchestrator.js')).runAll(),
  remates: async () => (await import('../scrapers/CO/rematandobienes/index.js')).run({}),
  motor: async () => {
    // Tras cualquier scrape hay que reclasificar, y los remates necesitan además
    // sus campos jurídicos al día.
    await (await import('../scripts/clasificar-remates.js')).clasificarRemates(false);
    return (await import('../engine/run.js')).run();
  },
  alertas: async () => {
    // Se ejecuta al final para que el correo use las oportunidades ya
    // actualizadas por los scrapers y el motor.
    return (await import('../server/notifications.js')).runAlertDispatch();
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

type ResultadoCerrojo = {
  data: Array<{ nombre: string }> | null;
  error: { message: string } | null;
};

export type ActualizarCerrojo = (
  estado: 'libre' | 'vencido',
  nombre: string,
  tomadoEn: string,
  limite: string,
) => Promise<ResultadoCerrojo>;

/**
 * Decisión testeable del cerrojo. La escritura concreta se inyecta para poder
 * verificar todos los caminos sin tocar Supabase durante las pruebas.
 */
export async function tomarCerrojoCon(
  actualizar: ActualizarCerrojo,
  nombre: string,
  ahora = new Date(),
): Promise<string | null> {
  // Solo se toma si sigue libre (o vencido): dos réplicas no pueden ganar ambas.
  //
  // PostgREST rechaza en UPDATE el filtro OR que mezcla IS NULL y LT, aunque el
  // mismo filtro sí funciona en SELECT. Hacemos dos UPDATE condicionales: ambos
  // siguen siendo atómicos porque la condición se evalúa en la base.
  const limite = new Date(ahora.getTime() - CERROJO_MAX_MS).toISOString();
  const tomadoEn = ahora.toISOString();
  const libre = await actualizar('libre', nombre, tomadoEn, limite);
  if (libre.error) { log.error(`cerrojo ${nombre}: ${libre.error.message}`); return null; }
  if ((libre.data ?? []).length > 0) return tomadoEn;

  const vencido = await actualizar('vencido', nombre, tomadoEn, limite);
  if (vencido.error) { log.error(`cerrojo ${nombre}: ${vencido.error.message}`); return null; }
  return (vencido.data ?? []).length > 0 ? tomadoEn : null;
}

const actualizarCerrojo: ActualizarCerrojo = async (estado, nombre, tomadoEn, limite) => {
  const base = supabase
    .from('radar_cron_jobs')
    .update({ corriendo_desde: tomadoEn })
    .eq('nombre', nombre);

  return estado === 'libre'
    ? base.is('corriendo_desde', null).select('nombre')
    : base.lt('corriendo_desde', limite).select('nombre');
};

async function tomarCerrojo(nombre: string): Promise<string | null> {
  return tomarCerrojoCon(actualizarCerrojo, nombre);
}

export type LiberarCerrojo = (
  nombre: string,
  token: string,
  cambios: Record<string, unknown>,
) => Promise<ResultadoCerrojo>;

/**
 * Decisión testeable de la liberación. Antes esta escritura era ciega: si fallaba,
 * el cerrojo quedaba tomado hasta vencer (6 h) y el trabajo no volvía a correr sin
 * que nadie se enterara. Ahora cada camino deja rastro en el log.
 */
export async function soltarCerrojoCon(
  liberar: LiberarCerrojo,
  nombre: string,
  token: string,
  estado: 'ok' | 'error',
  detalle: string,
  seg: number,
  ahora = new Date(),
): Promise<boolean> {
  const marca = ahora.toISOString();
  const { data, error } = await liberar(nombre, token, {
    corriendo_desde: null,
    ultima_corrida: marca,
    ultimo_estado: estado,
    ultimo_detalle: detalle.slice(0, 500),
    duracion_seg: seg,
    actualizado_en: marca,
  });

  if (error) { log.error(`soltar cerrojo ${nombre}: ${error.message}`); return false; }
  if (!(data ?? []).length) {
    // Cero filas no es un fallo: el cerrojo venció y otra réplica recuperó el
    // trabajo. Se registra porque significa que esta corrida tardó más de 6 h.
    log.warn(`soltar cerrojo ${nombre}: el cerrojo ya no es propio; no se sobrescribe el estado de la corrida vigente`);
    return false;
  }
  return true;
}

const liberarCerrojo: LiberarCerrojo = async (nombre, token, cambios) =>
  supabase.from('radar_cron_jobs').update(cambios)
    .eq('nombre', nombre)
    // Si el cerrojo venció y otra réplica lo recuperó, la corrida anterior ya
    // no es propietaria y no puede borrar ni sobrescribir el estado de la nueva.
    .eq('corriendo_desde', token)
    .select('nombre');

async function soltarCerrojo(
  nombre: string,
  token: string,
  estado: 'ok' | 'error',
  detalle: string,
  seg: number,
) {
  await soltarCerrojoCon(liberarCerrojo, nombre, token, estado, detalle, seg);
}

/**
 * ¿El resultado de una tarea confiesa que algo NO se hizo?
 *
 * `ejecutar` marcaba `ok` con que la tarea no lanzara. Pero `runAll` de bancos
 * atrapa el fallo de cada portal y lo DEVUELVE en su array en vez de propagarlo
 * —que es lo correcto: que BBVA caiga no puede impedir que Bancolombia se
 * guarde—. El precio fue que BBVA y AVAL estuvieron doce días devolviendo cero
 * registros con el tablero en verde. `frescura.ts` ya sabe qué hacer con un
 * trabajo en error —marca sus datos como vencidos—; nunca se enteró.
 *
 * Se busca solo la confesión dura: una subtarea que se declara en error Y no
 * insertó nada. Los `errors` sueltos no cuentan, porque un scrape sano de
 * FincaRaíz trae cientos de avisos mal formados y sigue metiendo 106.000 filas:
 * tratar eso como fallo dejaría el aviso encendido siempre, que es la manera más
 * rápida de que nadie lo vuelva a mirar.
 */
export function subtareasCaidas(resultado: unknown): string[] {
  const caidas: string[] = [];
  const mirar = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(mirar); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.status === 'error' && Number(o.records_inserted ?? o.inserted ?? 0) === 0) {
      caidas.push(String(o.portal ?? o.source ?? o.nombre ?? 'subtarea'));
    }
    Object.values(o).forEach(mirar);
  };
  mirar(resultado);
  return [...new Set(caidas)];
}

async function ejecutar(nombre: string) {
  if (!TAREAS[nombre]) { log.warn(`Sin tarea definida para "${nombre}"`); return; }
  const token = await tomarCerrojo(nombre);
  if (!token) { log.info(`${nombre}: ya lo está corriendo otro proceso`); return; }
  const t0 = Date.now();
  log.info(`▶ ${nombre}`);
  try {
    const r = await TAREAS[nombre]();
    const seg = Math.round((Date.now() - t0) / 1000);
    const caidas = subtareasCaidas(r);
    await soltarCerrojo(nombre, token, caidas.length ? 'error' : 'ok', JSON.stringify(r ?? {}), seg);
    if (caidas.length) log.error(`⚠ ${nombre} en ${seg}s, pero sin datos de: ${caidas.join(', ')}`);
    else log.info(`✅ ${nombre} en ${seg}s`);
  } catch (e) {
    const seg = Math.round((Date.now() - t0) / 1000);
    // Se suelta el cerrojo SIEMPRE: si un fallo lo dejara tomado, el trabajo no
    // volvería a correr nunca y el radar se quedaría congelado en silencio.
    await soltarCerrojo(nombre, token, 'error', e instanceof Error ? e.message : String(e), seg);
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
  // Orden importante: el motor clasifica los datos nuevos y las alertas salen
  // después, para no enviar coincidencias calculadas sobre un corte anterior.
  const orden = ['fincaraiz', 'bancos', 'remates', 'motor', 'alertas'];
  pendientes.sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre));
  log.info(`Pendientes: ${pendientes.map((p) => p.nombre).join(', ')}`);
  for (const j of pendientes) await ejecutar(j.nombre);
}

/**
 * Una pasada que lleva más de esto se da por colgada y deja pasar al siguiente
 * tick. Tiene que ser MENOR que `CERROJO_MAX_MS` para que, cuando el tick vuelva
 * a entrar, el cerrojo de base ya esté vencido y pueda recuperarse el trabajo.
 */
const REVISION_MAX_MS = 5 * 60 * 60_000;

/**
 * Serializa las revisiones: un tick que llega con otra revisión en curso se
 * engancha a ella en vez de abrir una segunda pasada.
 *
 * El cerrojo de `radar_cron_jobs` ya impide que dos pasadas corran el MISMO
 * trabajo, pero no que la segunda arranque OTRO. Con FincaRaíz ocupando más de
 * una hora (4.196 s el 2026-07-27) pasan cuatro ticks de 15 min, y el primero que
 * viera el motor vencido lo lanzaría mientras el scraper todavía inserta — justo
 * el orden que `revisar()` promete respetar más arriba.
 *
 * PERO serializar sin techo sería peor que el problema que resuelve: los scrapers
 * hacen `fetch` sin `signal` (p. ej. `scrapers/CO/aval/index-v2.ts`), así que una
 * petición colgada dejaría la promesa sin asentarse, todos los ticks siguientes se
 * engancharían a ella y el planificador entero enmudecería — incluidos los cuatro
 * trabajos que nada tienen que ver con el que se colgó. Por eso, pasado
 * `REVISION_MAX_MS`, se suelta la pasada y el cerrojo vencido vuelve a ser la red
 * de seguridad que el diseño ya tenía.
 */
export function crearRevisionSerializada(
  ejecutar: () => Promise<void>,
  ahora = () => Date.now(),
): () => Promise<void> {
  let enCurso: Promise<void> | null = null;
  let desde = 0;
  return () => {
    if (enCurso && ahora() - desde < REVISION_MAX_MS) return enCurso;
    if (enCurso) {
      log.error(`Revisión colgada desde hace ${Math.round((ahora() - desde) / 60_000)} min; se abre una nueva pasada`);
    }
    desde = ahora();
    const pasada = ejecutar().finally(() => { if (enCurso === pasada) enCurso = null; });
    enCurso = pasada;
    return pasada;
  };
}

if (isEntrypoint(import.meta.url)) {
  const forzar = process.argv.find((a) => a.startsWith('--forzar='))?.split('=')[1];
  const once = process.argv.includes('--once') || !!forzar;
  const revisarSerializado = crearRevisionSerializada(() => revisar());

  revisar(forzar)
    .then(() => {
      if (once) process.exit(0);
      log.info(`Planificador activo · revisión cada ${INTERVALO_REVISION_MS / 60000} min`);
      setInterval(() => { void revisarSerializado(); }, INTERVALO_REVISION_MS);
    })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}

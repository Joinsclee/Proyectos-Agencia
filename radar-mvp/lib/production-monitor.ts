export interface MonitorProbe {
  name: string;
  path: string;
  maxLatencyMs: number;
  validate: (body: unknown) => string | null;
  /**
   * Qué se espera recibir. Por omisión JSON, que es lo que devuelven las sondas
   * de infraestructura. Con `'html'` el cuerpo llega como texto: hace falta para
   * vigilar páginas servidas, que es donde apareció el 502 que nadie vio.
   */
  accept?: 'json' | 'html';
}

export interface MonitorResult {
  name: string;
  path: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  maxLatencyMs: number;
  error: string | null;
}

export interface MonitorReport {
  ok: boolean;
  baseUrl: string;
  checkedAt: string;
  durationMs: number;
  results: MonitorResult[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;

const healthValidator = (body: unknown): string | null => {
  const value = object(body);
  if (!value || value.ok !== true || value.status !== 'alive') {
    return 'Respuesta de liveness inválida';
  }
  return typeof value.uptime_s === 'number' ? null : 'Liveness sin uptime';
};

const readinessValidator = (body: unknown): string | null => {
  const value = object(body);
  if (!value || value.ok !== true || value.status !== 'ready') {
    return 'Respuesta de readiness inválida';
  }
  return typeof value.uptime_s === 'number' ? null : 'Readiness sin uptime';
};

const configValidator = (body: unknown): string | null => {
  const value = object(body);
  if (!value || typeof value.supabaseUrl !== 'string') {
    return 'Configuración pública inválida';
  }
  try {
    const url = new URL(value.supabaseUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
      return 'Supabase público inválido';
    }
  } catch {
    return 'URL pública de Supabase inválida';
  }
  // Nota: `/api/config` publica además `alertDispatchEnabled`, pero el monitor no
  // lo exige. Este validador corre contra la producción ya desplegada, así que
  // endurecer el contrato aquí pondría el smoke en rojo —y abriría incidente—
  // durante toda la ventana entre el merge y el despliegue en EasyPanel.
  return typeof value.alertEmailDeliveryReady === 'boolean'
    ? null
    : 'Estado del canal de correo ausente';
};

/**
 * La página de planes es la única pantalla que decide si alguien paga, y durante
 * la auditoría devolvió 502 sin que nadie se enterara: las tres sondas de arriba
 * miran la salud del proceso, y un proceso vivo puede servir una página rota.
 *
 * Se comprueba que el documento llegue entero y que traiga lo que lo hace
 * funcionar. Buscar la palabra «Pro» en el HTML NO sirve: la grilla se sirve
 * vacía (`<section id="plans">`) y la llena `planes.js` en el cliente, así que
 * esa palabra solo aparece en un párrafo de marketing fijo y la sonda daría
 * verde con la página rota. Lo que sí es prueba de vida es el contenedor y el
 * script que lo llena; el contenido de los planes lo cubre la sonda de la API.
 */
const planesValidator = (body: unknown): string | null => {
  const html = typeof body === 'string' ? body : '';
  if (!html.trim()) return 'La página de planes llegó vacía';
  if (!/<\/html>/i.test(html)) return 'La página de planes llegó cortada';
  if (!/id="plans"/.test(html)) return 'La página de planes no trae la grilla de planes';
  return /planes\.js/.test(html) ? null : 'La página de planes no carga el script que la llena';
};

/**
 * Y esta es la otra mitad: de dónde salen los planes. Si `/api/plans` cae, la
 * página se sirve perfecta y se queda vacía para siempre — un fallo invisible
 * para cualquier sonda que solo mire el HTML.
 */
const planesApiValidator = (body: unknown): string | null => {
  const planes = Array.isArray(body) ? body : (object(body)?.plans as unknown[] | undefined);
  if (!Array.isArray(planes)) return 'La API de planes no devolvió una lista';
  if (!planes.length) return 'La API de planes devolvió la lista vacía';
  return planes.every(p => typeof object(p)?.code === 'string')
    ? null
    : 'Algún plan llegó sin código';
};

export const DEFAULT_MONITOR_PROBES: MonitorProbe[] = [
  { name: 'liveness', path: '/health', maxLatencyMs: 2_000, validate: healthValidator },
  { name: 'readiness', path: '/ready', maxLatencyMs: 2_500, validate: readinessValidator },
  { name: 'config', path: '/api/config', maxLatencyMs: 3_000, validate: configValidator },
  {
    name: 'planes', path: '/planes', maxLatencyMs: 4_000, accept: 'html', validate: planesValidator,
  },
  { name: 'planes-api', path: '/api/plans', maxLatencyMs: 3_000, validate: planesApiValidator },
];

export function normalizeMonitorBaseUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MONITOR_BASE_URL debe usar HTTP o HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('MONITOR_BASE_URL no puede incluir credenciales');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('La respuesta no es JSON');
  }
  return response.json();
}

export async function runProductionMonitor(options: {
  baseUrl: string;
  probes?: MonitorProbe[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => number;
  checkedAt?: () => Date;
}): Promise<MonitorReport> {
  const baseUrl = normalizeMonitorBaseUrl(options.baseUrl);
  const probes = options.probes ?? DEFAULT_MONITOR_PROBES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const now = options.now ?? (() => performance.now());
  const checkedAt = (options.checkedAt ?? (() => new Date()))().toISOString();
  const started = now();

  const results = await Promise.all(probes.map(async (probe): Promise<MonitorResult> => {
    const probeStarted = now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      const esHtml = probe.accept === 'html';
      const response = await fetchImpl(`${baseUrl}${probe.path}`, {
        headers: { Accept: esHtml ? 'text/html' : 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      if (!response.ok) {
        error = `HTTP ${response.status}`;
      } else {
        error = probe.validate(esHtml ? await response.text() : await readJson(response));
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Fallo de red desconocido';
    }

    const latencyMs = Math.max(0, Math.round(now() - probeStarted));
    if (!error && latencyMs > probe.maxLatencyMs) {
      error = `Latencia ${latencyMs} ms supera presupuesto de ${probe.maxLatencyMs} ms`;
    }
    return {
      name: probe.name,
      path: probe.path,
      ok: error === null,
      status,
      latencyMs,
      maxLatencyMs: probe.maxLatencyMs,
      error,
    };
  }));

  return {
    ok: results.every(result => result.ok),
    baseUrl,
    checkedAt,
    durationMs: Math.max(0, Math.round(now() - started)),
    results,
  };
}

export function monitorMarkdown(report: MonitorReport): string {
  const rows = report.results.map(result =>
    `| ${result.name} | ${result.ok ? 'OK' : 'FALLO'} | ${result.status ?? '—'} | ${result.latencyMs} ms | ${result.error ?? '—'} |`);
  return [
    `## Monitor de producción Radar CRECE — ${report.ok ? 'OK' : 'FALLO'}`,
    '',
    `Comprobación: ${report.checkedAt}`,
    '',
    '| Prueba | Estado | HTTP | Latencia | Detalle |',
    '|---|---:|---:|---:|---|',
    ...rows,
    '',
  ].join('\n');
}

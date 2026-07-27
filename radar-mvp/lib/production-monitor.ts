export interface MonitorProbe {
  name: string;
  path: string;
  maxLatencyMs: number;
  validate: (body: unknown) => string | null;
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

export const DEFAULT_MONITOR_PROBES: MonitorProbe[] = [
  { name: 'liveness', path: '/health', maxLatencyMs: 2_000, validate: healthValidator },
  { name: 'readiness', path: '/ready', maxLatencyMs: 2_500, validate: readinessValidator },
  { name: 'config', path: '/api/config', maxLatencyMs: 3_000, validate: configValidator },
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
      const response = await fetchImpl(`${baseUrl}${probe.path}`, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      if (!response.ok) {
        error = `HTTP ${response.status}`;
      } else {
        error = probe.validate(await readJson(response));
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

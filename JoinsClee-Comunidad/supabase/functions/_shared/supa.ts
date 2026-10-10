// ============================================================================
//  Supabase · acceso a las tablas jc_* vía PostgREST con service_role.
//  Sin dependencias externas: fetch a secas, igual que el resto del proyecto.
// ============================================================================

export type SupaConfig = { url: string; serviceKey: string };

export function headers(cfg: SupaConfig, extra: Record<string, string> = {}) {
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function sq<T = any>(
  cfg: SupaConfig, path: string, init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  const { prefer, ...rest } = init;
  const r = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...rest,
    headers: headers(cfg, {
      ...(prefer ? { Prefer: prefer } : {}),
      ...(rest.headers as Record<string, string> ?? {}),
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${path}: HTTP ${r.status} ${text.slice(0, 400)}`);
  if (!text) return null as T;
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

/** SELECT paginado (PostgREST corta en 1000 por defecto). */
export async function selectAll<T = any>(
  cfg: SupaConfig, path: string, pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const r = await fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: headers(cfg, { Range: `${from}-${from + pageSize - 1}`, 'Range-Unit': 'items' }),
    });
    if (!r.ok) throw new Error(`supabase ${path}: HTTP ${r.status} ${await r.text()}`);
    const j = (await r.json()) as T[];
    out.push(...j);
    if (j.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Anti-spam de alertas: true si ya se notificó este `kind` en las últimas N horas. */
export async function recentlyAlerted(
  cfg: SupaConfig, kind: string, hours = 24,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const j = await sq<any[]>(
      cfg,
      `jc_alerts?select=id&kind=eq.${encodeURIComponent(kind)}&notified=eq.true&created_at=gte.${encodeURIComponent(since)}&limit=1`,
    );
    return Array.isArray(j) && j.length > 0;
  } catch { return false; }
}

export async function insertAlert(
  cfg: SupaConfig,
  a: { kind: string; message: string; severity?: string; payload?: unknown; notified?: boolean },
): Promise<void> {
  try {
    await sq(cfg, 'jc_alerts', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        kind: a.kind,
        message: a.message,
        severity: a.severity ?? 'error',
        payload: a.payload ?? null,
        notified: a.notified ?? false,
      }),
    });
  } catch (e) { console.warn('insertAlert falló:', e); }
}

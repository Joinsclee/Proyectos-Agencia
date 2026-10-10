// ============================================================================
//  Skool · cliente de la API interna de Next.js
// ============================================================================
//  Skool NO tiene API pública ni webhooks salientes. El plugin que se llama
//  "Webhook" en su panel es ENTRANTE (sirve para invitar gente, no para que
//  Skool te avise de nada). Zapier solo expone "New Paid Member". Así que la
//  única señal disponible es el endpoint que consume su propio frontend:
//
//      /_next/data/{buildId}/{group}/-/members.json?t={tab}&p={n}
//
//  Este módulo es un fork endurecido del sync-skool-members de SAVIAS, con
//  dos diferencias que importan:
//
//   1. Barre CUATRO pestañas (active, cancelling, churned, banned) en vez de
//      solo `active`. Leer estado afirmativo en vez de inferir una baja por
//      ausencia baja los falsos positivos y, sobre todo, adelanta la señal:
//      Skool no expulsa a nadie al cancelar — lo saca al final del ciclo de
//      facturación. Con `t=cancelling` te enteras el mismo día y con la fecha
//      exacta de corte; con el diff de `active` te enterarías ~30 días tarde.
//
//   2. Los conteos de churn NO viven en pageProps sino en pageProps.renderData.
//      Leerlos del sitio equivocado devuelve undefined en silencio.
//
//  Nada de esto es contrato estable. Skool puede renombrar un campo en
//  cualquier deploy. Por eso el canario de `assertCanary()`.
// ============================================================================

const SKOOL_BASE = 'https://www.skool.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

/** Las 4 pestañas que existen para un admin. Lista cerrada: un valor
 *  inválido NO da error, cae al comportamiento de `active` en silencio. */
export const TABS = ['active', 'cancelling', 'churned', 'banned'] as const;
export type Tab = typeof TABS[number];

export type SkoolMember = {
  email: string;
  skool_user_id?: string;
  first_name?: string;
  last_name?: string;
  tier: string | null;
  recurring_interval: string | null;
  is_lifetime: boolean;
  is_free_trial: boolean;
  billing_canceled: boolean;
  billing_declined: boolean;
  /** cuándo pierde el acceso (metadata.mbscpe, unix segundos) */
  churn_at: string | null;
  /** último reintento de cobro (metadata.mbsfprt) */
  final_retry_at: string | null;
  /** cuándo lo perdió (member.churned, ISO) */
  churned_at: string | null;
  banned_at: string | null;
  tab: Tab;
};

export class SkoolAbort extends Error {
  constructor(public reason: string, msg: string) { super(msg); }
}

export type SkoolConfig = {
  authToken: string;
  clientId: string;
  group: string;
  /** pausa entre requests, ms. Skool no documenta rate limits: vamos despacio. */
  delayMs?: number;
  safetyPages?: number;
};

function cookieHeader(cfg: SkoolConfig): string {
  return `auth_token=${cfg.authToken}; client_id=${cfg.clientId}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ────────────────────────────────────────────────────────────────────────────
//  buildId · cambia con cada deploy de Skool (~semanal), hay que extraerlo
//  del HTML en cada corrida. Si esto falla, TODO se aborta: seguir adelante
//  con 0 miembros equivale a "se fueron todos" → borrado masivo.
// ────────────────────────────────────────────────────────────────────────────
export async function fetchBuildId(cfg: SkoolConfig): Promise<string> {
  const r = await fetch(`${SKOOL_BASE}/${cfg.group}/-/members`, {
    headers: {
      Cookie: cookieHeader(cfg),
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });

  if (!r.ok) {
    throw new SkoolAbort('members_page_http', `La página de miembros devolvió HTTP ${r.status}`);
  }

  const html = await r.text();

  // Cookie vencida → Skool redirige a /login y devolvería 0 miembros.
  if (/\/login\b/.test(r.url) || /sign[\s-]?in/i.test(html.slice(0, 5000))) {
    throw new SkoolAbort(
      'cookie_expired',
      `La cookie de Skool está vencida (redirigió a ${r.url}). Hay que renovar SKOOL_AUTH_TOKEN y SKOOL_CLIENT_ID.`,
    );
  }

  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (!m) {
    throw new SkoolAbort(
      'no_build_id',
      `No se pudo extraer el buildId — Skool pudo cambiar su HTML. Head: ${html.slice(0, 300)}`,
    );
  }
  return m[1];
}

// ────────────────────────────────────────────────────────────────────────────
//  Parseo de un miembro
// ────────────────────────────────────────────────────────────────────────────

/** Plan/tier. Vive en member.metadata.mmbp como JSON-string:
 *  {"currency":"usd","amount":2700,"recurring_interval":"month",
 *   "model":"freemium","tier":"premium"} */
function parseMmbp(node: any): { tier: string | null; interval: string | null; trial: boolean } {
  const raw = node?.member?.metadata?.mmbp ?? node?.metadata?.mmbp;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return {
        tier: typeof p?.tier === 'string' && p.tier.trim() ? p.tier.trim() : null,
        interval: typeof p?.recurring_interval === 'string' ? p.recurring_interval : null,
        trial: p?.isFreeTrial === true || p?.is_free_trial === true,
      };
    } catch { /* no era JSON → fallbacks */ }
  }
  const fb = node?.level?.name ?? node?.member?.level?.name ?? node?.tier ?? null;
  return { tier: typeof fb === 'string' && fb.trim() ? fb.trim() : null, interval: null, trial: false };
}

function unixSecToIso(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Tolera segundos o milisegundos: cualquier cosa > 1e11 ya es ms.
  const ms = n > 1e11 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function nanoToIso(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n / 1e6); // bannedAt viene en NANOsegundos
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'number') return unixSecToIso(v);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseMember(node: any, tab: Tab): SkoolMember | null {
  const member = node?.member ?? {};
  const md = member?.metadata ?? node?.metadata ?? {};

  // El email real vive en member.metadata.mbme. Verificado en producción en
  // el proyecto de SAVIAS: llega en claro, pese a que el nombre sugiera otra
  // cosa. Fallbacks por si Skool lo mueve.
  const rawEmail = md?.mbme ?? member?.inviteEmail ?? node?.email ?? node?.user?.email ?? md?.email;
  const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
  if (!email || !email.includes('@')) return null;

  const { tier, interval, trial } = parseMmbp(node);
  const isLifetime = typeof interval === 'string' && /lifetime/i.test(interval);

  return {
    email,
    skool_user_id: node?.id ?? node?.user_id ?? node?.user?.id ?? member?.userId,
    first_name: node?.firstName ?? node?.first_name ?? node?.user?.firstName ?? node?.user?.first_name,
    last_name:  node?.lastName  ?? node?.last_name  ?? node?.user?.lastName  ?? node?.user?.last_name,
    tier,
    recurring_interval: interval,
    is_lifetime: isLifetime,
    is_free_trial: trial,
    billing_canceled: Boolean(member?.billingCanceled),
    billing_declined: Boolean(member?.billingDeclined),
    churn_at:       unixSecToIso(md?.mbscpe),
    final_retry_at: unixSecToIso(md?.mbsfprt),
    churned_at:     isoOrNull(member?.churned) ?? isoOrNull(md?.freeTrialChurnedAt),
    banned_at:      nanoToIso(md?.bannedAt),
    tab,
  };
}

function deepCollect(node: any, out: any[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) { for (const x of node) deepCollect(x, out, depth + 1); return; }
  if (node?.member?.metadata?.mbme || typeof node.email === 'string') out.push(node);
  for (const k of Object.keys(node)) {
    const v = (node as any)[k];
    if (v && typeof v === 'object') deepCollect(v, out, depth + 1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Una página de una pestaña
// ────────────────────────────────────────────────────────────────────────────
export type PageResult = {
  members: SkoolMember[];
  totalPages: number | null;
  totalForTab: number | null;
  rawCandidates: number;
  firstRaw?: any;
};

export async function fetchPage(
  cfg: SkoolConfig, buildId: string, tab: Tab, page: number,
): Promise<PageResult> {
  const params = new URLSearchParams({
    t: tab, p: String(page),
    online: '', levels: '', price: '', courseIds: '', sortType: '',
    monthly: 'false', annual: 'false', oneTime: 'false', trials: 'false', free: 'false',
    group: cfg.group,
  });

  const url = `${SKOOL_BASE}/_next/data/${buildId}/${cfg.group}/-/members.json?${params}`;
  const r = await fetch(url, {
    headers: {
      Cookie: cookieHeader(cfg),
      'User-Agent': UA,
      Accept: 'application/json',
      'x-nextjs-data': '1',
      Referer: `${SKOOL_BASE}/${cfg.group}/-/members`,
    },
  });

  if (!r.ok) {
    // Una página que falla NO se puede tolerar: 30 miembros "desaparecidos"
    // se leerían como 30 bajas.
    throw new SkoolAbort('page_http', `t=${tab} p=${page} devolvió HTTP ${r.status}`);
  }

  const j = await r.json();
  const pp = j?.pageProps ?? j;
  const rd = pp?.renderData ?? {};

  const candidates: any[] = [];
  for (const arr of [pp?.users, pp?.members, pp?.data?.members, pp?.membersData?.members]) {
    if (Array.isArray(arr)) candidates.push(...arr);
  }
  if (candidates.length === 0) deepCollect(pp, candidates);

  const members: SkoolMember[] = [];
  for (const c of candidates) {
    const m = parseMember(c, tab);
    if (m) members.push(m);
  }

  // Los conteos por pestaña viven en renderData, NO en pageProps.
  const totalKey = {
    active:     'totalMembers',
    cancelling: 'totalCancellingMembers',
    churned:    'totalChurnedMembers',
    banned:     'totalBannedMembers',
  }[tab];

  const totalForTab =
    typeof rd?.[totalKey] === 'number' ? rd[totalKey]
    : typeof pp?.[totalKey] === 'number' ? pp[totalKey]
    : null;

  const totalPages =
    typeof pp?.totalPages === 'number' ? pp.totalPages
    : typeof rd?.totalPages === 'number' ? rd.totalPages
    : null;

  return {
    members, totalPages, totalForTab,
    rawCandidates: candidates.length,
    firstRaw: page === 1 ? candidates[0] : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Barrido completo de una pestaña, con verificación de integridad
// ────────────────────────────────────────────────────────────────────────────
export async function fetchTab(
  cfg: SkoolConfig, buildId: string, tab: Tab,
): Promise<{ members: SkoolMember[]; expected: number | null; firstRaw?: any }> {
  const delay = cfg.delayMs ?? 300;
  const safety = cfg.safetyPages ?? 200;

  const all: SkoolMember[] = [];
  let expected: number | null = null;
  let firstRaw: any;
  let page = 1;

  while (page <= safety) {
    const res = await fetchPage(cfg, buildId, tab, page);
    if (page === 1) { expected = res.totalForTab; firstRaw = res.firstRaw; }
    all.push(...res.members);

    const more = res.totalPages !== null ? page < res.totalPages : res.rawCandidates >= 30;
    if (!more) break;
    page++;
    await sleep(delay);
  }

  if (page > safety) {
    throw new SkoolAbort('safety_pages', `t=${tab} superó el tope de ${safety} páginas`);
  }

  // Verificación de integridad: si Skool dice que hay N y recolectamos menos,
  // el barrido fue parcial. Tolerancia de 1 por si un registro no tiene email.
  if (expected !== null && expected > 0 && all.length < expected - 1) {
    throw new SkoolAbort(
      'partial_scan',
      `t=${tab}: Skool reporta ${expected} miembros pero solo se recolectaron ${all.length}. Barrido parcial — no se revoca nada.`,
    );
  }

  // Dedup por email (un miembro puede repetirse entre páginas si algo se movió
  // durante el barrido). Gana el primero.
  const seen = new Set<string>();
  const uniq = all.filter((m) => (seen.has(m.email) ? false : (seen.add(m.email), true)));

  return { members: uniq, expected, firstRaw };
}

// ────────────────────────────────────────────────────────────────────────────
//  Barrido de las 4 pestañas
// ────────────────────────────────────────────────────────────────────────────
export type Snapshot = {
  buildId: string;
  byTab: Record<Tab, SkoolMember[]>;
  counts: Record<Tab, number>;
  expected: Record<Tab, number | null>;
  samples: Partial<Record<Tab, any>>;
};

export async function fetchSnapshot(cfg: SkoolConfig): Promise<Snapshot> {
  const buildId = await fetchBuildId(cfg);

  const byTab = {} as Record<Tab, SkoolMember[]>;
  const counts = {} as Record<Tab, number>;
  const expected = {} as Record<Tab, number | null>;
  const samples: Partial<Record<Tab, any>> = {};

  for (const tab of TABS) {
    const res = await fetchTab(cfg, buildId, tab);
    byTab[tab] = res.members;
    counts[tab] = res.members.length;
    expected[tab] = res.expected;
    if (res.firstRaw) samples[tab] = res.firstRaw;
    await sleep(cfg.delayMs ?? 300);
  }

  return { buildId, byTab, counts, expected, samples };
}

// ────────────────────────────────────────────────────────────────────────────
//  Canario · detecta que Skool renombró un campo antes de que el sistema
//  empiece a tomar decisiones con datos vacíos.
//
//  La señal: si la pestaña `cancelling` tiene miembros pero NINGUNO trae
//  billingCanceled, el campo cambió de nombre. Sin este chequeo, todos
//  quedarían clasificados mal y en silencio.
// ────────────────────────────────────────────────────────────────────────────
export function assertCanary(snap: Snapshot): void {
  const cancelling = snap.byTab.cancelling ?? [];
  if (cancelling.length > 0 && !cancelling.some((m) => m.billing_canceled)) {
    throw new SkoolAbort(
      'canary_billing_canceled',
      `CANARIO: ${cancelling.length} miembros en t=cancelling pero ninguno trae billingCanceled. ` +
      `Skool probablemente renombró el campo — hay que revisar el parser antes de volver a confiar en el sync.`,
    );
  }

  const churned = snap.byTab.churned ?? [];
  if (churned.length > 0 && !churned.some((m) => m.churned_at)) {
    throw new SkoolAbort(
      'canary_churned_date',
      `CANARIO: ${churned.length} miembros en t=churned pero ninguno trae fecha de churn. ` +
      `Revisar el parser antes de revocar nada.`,
    );
  }
}

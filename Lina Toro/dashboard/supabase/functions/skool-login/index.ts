// Supabase Edge Function: skool-login
// Login PASSWORDLESS basado en membresía de Skool.
//
// Flujo (para señoras mayores, sin contraseña ni registro):
//   1) El cliente envía { email }.
//   2) Verificamos que el correo pertenezca a la comunidad Skool de
//      Savias (cache-first: tabla skool_members; live-fallback:
//      escaneo de la API interna de Skool si no está en caché).
//   3) Si es miembro, aseguramos el usuario de auth + el flag
//      is_skool_member en profiles, y generamos un magic-link token
//      verificable en cliente.
//   4) Respondemos { ok:true, token_hash, email, first_name }. El
//      cliente hace supabase.auth.verifyOtp({ type:'magiclink',
//      token_hash }) para obtener la sesión, SIN clicar nada.
//
// Desplegar con --no-verify-jwt (se invoca con la anon key).
//
// Secrets requeridos (mismos que sync-skool-members):
//   SKOOL_AUTH_TOKEN          cookie auth_token del admin (JWT de Skool)
//   SKOOL_CLIENT_ID           cookie client_id del admin
//   SKOOL_GROUP               slug del grupo (default: savias-8385)
//   SUPABASE_URL              (auto-inyectado)
//   SUPABASE_SERVICE_ROLE_KEY (auto-inyectado)

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SKOOL_AUTH_TOKEN = Deno.env.get('SKOOL_AUTH_TOKEN') ?? '';
const SKOOL_CLIENT_ID  = Deno.env.get('SKOOL_CLIENT_ID') ?? '';
const SKOOL_GROUP      = Deno.env.get('SKOOL_GROUP') ?? 'savias-8385';

const SKOOL_BASE = 'https://www.skool.com';
const SAFETY_PAGES = 200; // tope alto: 200 × 30 = 6000 miembros

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// ============================================================
// SKOOL HELPERS (copiados de sync-skool-members; cada edge
// function se despliega aislada, no comparten imports)
// ============================================================

function skoolCookieHeader(): string {
  return `auth_token=${SKOOL_AUTH_TOKEN}; client_id=${SKOOL_CLIENT_ID}`;
}

// El endpoint de miembros vive en /_next/data/{buildId}/{group}/-/members.json
// El buildId cambia con cada deploy de Skool, así que lo extraemos del HTML.
async function fetchSkoolBuildId(): Promise<{ buildId: string; finalUrl: string; isLoginPage: boolean }> {
  const r = await fetch(`${SKOOL_BASE}/${SKOOL_GROUP}/-/members`, {
    headers: {
      Cookie: skoolCookieHeader(),
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`skool members page: ${r.status}`);
  const html = await r.text();
  const finalUrl = r.url;
  const isLoginPage = /\/login\b/.test(finalUrl) || /sign[\s-]?in/i.test(html.slice(0, 5000));
  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error(`buildId no encontrado (finalUrl=${finalUrl}). HTML head: ${html.slice(0, 400)}`);
  return { buildId: m[1], finalUrl, isLoginPage };
}

type SkoolMember = {
  email: string;
  level: string | null;   // ← plan/tier del miembro (standard/premium/vip/…)
  user_id?: string;
  first_name?: string;
  last_name?: string;
};

async function fetchSkoolMembersPage(buildId: string, page: number): Promise<{ members: SkoolMember[]; hasMore: boolean; totalPages?: number; totalMembers?: number }> {
  const params = new URLSearchParams({
    t: 'active',
    p: String(page),
    online: '',
    levels: '',
    price: '',
    courseIds: '',
    sortType: '',
    monthly: 'false',
    annual: 'false',
    oneTime: 'false',
    trials: 'false',
    free: 'false',
    group: SKOOL_GROUP,
  });
  const url = `${SKOOL_BASE}/_next/data/${buildId}/${SKOOL_GROUP}/-/members.json?${params}`;
  const r = await fetch(url, {
    headers: {
      Cookie: skoolCookieHeader(),
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'x-nextjs-data': '1',
      'Referer': `${SKOOL_BASE}/${SKOOL_GROUP}/-/members`,
    },
  });
  if (!r.ok) throw new Error(`skool members.json page ${page}: ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();

  const candidates: any[] = [];
  const root = j?.pageProps ?? j;
  if (Array.isArray(root?.members)) candidates.push(...root.members);
  if (Array.isArray(root?.users)) candidates.push(...root.users);
  if (Array.isArray(root?.data?.members)) candidates.push(...root.data.members);
  if (Array.isArray(root?.initialState?.members?.list)) candidates.push(...root.initialState.members.list);
  if (Array.isArray(root?.membersData?.members)) candidates.push(...root.membersData.members);
  if (candidates.length === 0) {
    deepCollectMembers(root, candidates);
  }

  // Skool oculta el email real en `member.metadata.mbme` (campo ofuscado).
  const members: SkoolMember[] = [];
  for (const c of candidates) {
    const rawEmail = c?.member?.metadata?.mbme
      ?? c?.email
      ?? c?.user?.email
      ?? c?.metadata?.mbme
      ?? c?.metadata?.email;
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    if (!email || !email.includes('@')) continue;
    members.push({
      email,
      level: extractLevel(c),
      user_id: c?.id ?? c?.user_id ?? c?.user?.id,
      first_name: c?.firstName ?? c?.first_name ?? c?.user?.firstName ?? c?.user?.first_name,
      last_name:  c?.lastName  ?? c?.last_name  ?? c?.user?.lastName  ?? c?.user?.last_name,
    });
  }

  const totalPages = typeof root?.totalPages === 'number' ? root.totalPages : undefined;
  const totalMembers = typeof root?.totalMembers === 'number' ? root.totalMembers : undefined;
  const hasMore = totalPages !== undefined ? page < totalPages : members.length >= 30;
  return { members, hasMore, totalPages, totalMembers };
}

/** Extrae el tier/plan del miembro desde el JSON de Skool.
 *  Path canónico: `member.metadata.mmbp` es un JSON-string cuyo `.tier`
 *  da "premium"/"vip"/"standard"/… (mismo mecanismo que sync-skool-members;
 *  cada edge function se despliega aislada y no comparte imports).
 */
function extractLevel(c: any): string | null {
  const mmbpStr = c?.member?.metadata?.mmbp ?? c?.metadata?.mmbp;
  if (typeof mmbpStr === 'string' && mmbpStr.trim()) {
    try {
      const mmbp = JSON.parse(mmbpStr);
      if (typeof mmbp?.tier === 'string' && mmbp.tier.trim()) return mmbp.tier.trim();
    } catch (_) { /* mmbp no era JSON válido → caer a fallbacks */ }
  }
  const fallbacks = [
    c?.level?.name, c?.level?.title, c?.level,
    c?.levelName,
    c?.member?.level?.name, c?.member?.level,
    c?.member?.metadata?.tier,
    c?.metadata?.level, c?.metadata?.tier, c?.metadata?.plan,
    c?.tier?.name, c?.tier,
    c?.plan?.name, c?.plan,
    c?.subscription?.level, c?.subscription?.plan, c?.subscription?.tier,
    c?.priceName, c?.price?.name,
  ];
  for (const v of fallbacks) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function deepCollectMembers(node: any, out: any[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) deepCollectMembers(x, out);
    return;
  }
  if (typeof node.email === 'string') out.push(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === 'object') deepCollectMembers(v, out);
  }
}

// ============================================================
// SUPABASE HELPERS
// ============================================================

type SkoolMemberRow = { email: string; first_name: string | null; last_name: string | null; level: string | null };

// Cache-first: busca el email en la tabla skool_members.
async function supaSelectSkoolMember(email: string): Promise<SkoolMemberRow | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/skool_members?select=email,first_name,last_name,level&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) throw new Error(`select skool_member: ${r.status} ${await r.text().catch(() => '')}`);
  const j: SkoolMemberRow[] = await r.json();
  return j[0] ?? null;
}

// Lista de correos permitidos manualmente: admins/owners de Skool (que NO
// aparecen en el scraping de miembros) y accesos especiales. El cron de sync
// NUNCA toca esta tabla, así que estos accesos persisten.
async function supaSelectAllowedEmail(email: string): Promise<{ first_name: string | null; level: string | null } | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_emails?select=email,first_name,level&email=ilike.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) throw new Error(`select allowed_email: ${r.status} ${await r.text().catch(() => '')}`);
  const j: Array<{ email: string; first_name: string | null; level: string | null }> = await r.json();
  // Un acceso manual (admin/comp) es full por defecto → 'vip' si no tiene level.
  return j[0] ? { first_name: j[0].first_name ?? null, level: j[0].level ?? 'vip' } : null;
}

// Upsert defensivo en skool_members (cuando lo verificamos en vivo).
async function supaUpsertSkoolMember(m: SkoolMember): Promise<void> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/skool_members?on_conflict=email`,
    {
      method: 'POST',
      headers: { ...SUPA_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        email: m.email,
        first_name: m.first_name ?? null,
        last_name: m.last_name ?? null,
        level: m.level ?? null,
        synced_at: new Date().toISOString(),
      }),
    },
  );
  if (!r.ok) throw new Error(`upsert skool_member: ${r.status} ${await r.text().catch(() => '')}`);
}

// Asegura profiles.is_skool_member=true y persiste el plan (skool_level)
// para ese email. Si aún no hay row (el trigger de signup la crea), tolera
// 0 filas. skool_level se guarda para que las recargas de página lo lean
// desde profiles sin volver a llamar a skool-login.
async function supaMarkProfileMember(email: string, level: string | null): Promise<void> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_skool_member: true,
        skool_level: level,
        skool_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  // PATCH con 0 filas devuelve 204; solo lanzamos en errores reales.
  if (!r.ok) throw new Error(`mark profile member: ${r.status} ${await r.text().catch(() => '')}`);
}

// ============================================================
// AUTH ADMIN HELPERS
// ============================================================

// Asegura el usuario de auth (idempotente): si ya existe (422),
// lo ignoramos y seguimos.
async function ensureAuthUser(email: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SUPA_HEADERS,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (r.ok) return;
  // 422 = usuario ya existe → idempotente, no es error.
  if (r.status === 422) return;
  const detail = await r.text().catch(() => '');
  // Algunas versiones devuelven 400/409 con código de "ya existe".
  if (/already.*(registered|exists)|email_exists|user_already_exists/i.test(detail)) return;
  throw new Error(`ensure auth user: ${r.status} ${detail}`);
}

// Genera un magic-link y extrae el hashed_token (top-level o dentro
// de properties, según versión del API de auth).
async function generateMagicLinkTokenHash(email: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: SUPA_HEADERS,
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!r.ok) throw new Error(`generate_link: ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  const tokenHash = j?.hashed_token ?? j?.properties?.hashed_token;
  if (!tokenHash || typeof tokenHash !== 'string') {
    throw new Error('generate_link: hashed_token no presente en la respuesta');
  }
  return tokenHash;
}

// ============================================================
// VERIFICACIÓN DE MEMBRESÍA (cache-first, live-fallback)
// ============================================================

type MembershipResult =
  | { status: 'member'; firstName: string | null; level: string | null }
  | { status: 'not_member' }
  | { status: 'unavailable' };

async function verifyMembership(email: string): Promise<MembershipResult> {
  // 0) Lista de permitidos manualmente (admins/owners de Skool + accesos
  //    especiales). Tienen prioridad y no dependen del scraping de miembros.
  //    Si la tabla aún no existe, registramos y seguimos con la verificación normal.
  try {
    const allowed = await supaSelectAllowedEmail(email);
    if (allowed) return { status: 'member', firstName: allowed.first_name, level: allowed.level };
  } catch (e) {
    console.error('skool-login: fallo consultando allowed_emails (continuamos con Skool):', e);
  }

  // 1) Cache-first (defensivo: si la consulta falla —p. ej. la columna
  //    `level` aún no es visible por PostgREST tras un deploy fuera de orden,
  //    o un error transitorio de DB— NO devolvemos 500; caemos al
  //    live-fallback como si fuera cache-miss).
  try {
    const cached = await supaSelectSkoolMember(email);
    if (cached) {
      return { status: 'member', firstName: cached.first_name ?? null, level: cached.level ?? null };
    }
  } catch (e) {
    console.error('skool-login: cache-first falló, caigo a live-fallback:', e);
  }

  // 2) Live-fallback: escaneo de Skool con early-termination.
  //    Si Skool redirige a login (cookie caída) NO concluimos:
  //    devolvemos 'unavailable' para no negar a una miembro legítima.
  let buildId: string;
  try {
    const built = await fetchSkoolBuildId();
    if (built.isLoginPage) {
      console.warn('skool-login: Skool redirigió a login (cookie caída) durante live-fallback');
      return { status: 'unavailable' };
    }
    buildId = built.buildId;
  } catch (e) {
    // Caída de red/HTML inesperado → no-concluyente, mejor reintentar.
    console.error('skool-login: fallo obteniendo buildId de Skool:', e);
    return { status: 'unavailable' };
  }

  for (let page = 1; page <= SAFETY_PAGES; page++) {
    const { members, hasMore } = await fetchSkoolMembersPage(buildId, page);
    const hit = members.find(m => m.email === email);
    if (hit) {
      // Lo encontramos en vivo → cachear y tratar como miembro.
      try {
        await supaUpsertSkoolMember(hit);
      } catch (e) {
        console.error('skool-login: upsert de skool_member en vivo falló (no bloqueante):', e);
      }
      return { status: 'member', firstName: hit.first_name ?? null, level: hit.level ?? null };
    }
    if (!hasMore) break;
  }

  return { status: 'not_member' };
}

// ============================================================
// ENTRY POINT
// ============================================================

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonRes({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  try {
    if (!SERVICE_KEY || !SUPABASE_URL) {
      console.error('skool-login: SUPABASE_URL o SERVICE_ROLE_KEY no disponibles');
      return jsonRes({ ok: false, reason: 'server_misconfigured' }, 500);
    }

    // Parsear y validar input
    let rawEmail = '';
    try {
      const body = await req.json();
      rawEmail = typeof body?.email === 'string' ? body.email : '';
    } catch {
      return jsonRes({ ok: false, reason: 'invalid_email' }, 400);
    }

    const email = rawEmail.toLowerCase().trim();
    if (!email || !email.includes('@') || email.length > 254) {
      return jsonRes({ ok: false, reason: 'invalid_email' }, 400);
    }

    // Verificar membresía (cache-first, live-fallback)
    const membership = await verifyMembership(email);

    if (membership.status === 'unavailable') {
      // Cookie caída / Skool no-concluyente y no estaba en caché.
      // Mejor pedir reintento que negar a una miembro legítima.
      return jsonRes({ ok: false, reason: 'verification_unavailable' }, 503);
    }
    if (membership.status === 'not_member') {
      return jsonRes({ ok: false, reason: 'not_member' }, 403);
    }

    // Es miembro → crear/recuperar sesión sin contraseña.
    // 1) Asegurar usuario de auth (idempotente)
    await ensureAuthUser(email);

    // 2) Asegurar profiles.is_skool_member=true + persistir plan (tolera 0 filas)
    try {
      await supaMarkProfileMember(email, membership.level);
    } catch (e) {
      // No bloqueamos el login por esto; el cron/trigger lo corregirá.
      console.error('skool-login: no se pudo marcar profile como miembro (no bloqueante):', e);
    }

    // 3) Generar magic-link token verificable en cliente
    const tokenHash = await generateMagicLinkTokenHash(email);

    return jsonRes({
      ok: true,
      token_hash: tokenHash,
      email,
      first_name: membership.firstName,
      level: membership.level,   // ← plan del miembro; el frontend decide qué herramientas mostrar
    }, 200);
  } catch (err) {
    console.error('skool-login error:', err);
    return jsonRes({
      ok: false,
      reason: 'server_error',
      detail: String((err as Error)?.message ?? err),
    }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

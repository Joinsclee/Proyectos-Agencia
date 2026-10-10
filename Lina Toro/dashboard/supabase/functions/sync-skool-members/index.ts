// Supabase Edge Function: sync-skool-members
// Lista miembros activos de la comunidad Skool de Savias y actualiza el flag
// is_skool_member en public.profiles. Se conecta a la API interna de Skool
// (no documentada) usando cookies de un admin (Cristian Vega).
//
// Modos:
//   1) Cron (sin body o body vacío): hace sync completo de todos los profiles
//      contra todos los miembros de Skool. Disparado por pg_cron cada 6h.
//      Además mantiene public.skool_members como espejo de la comunidad
//      (upsert de todos los escaneados + delete de los obsoletos), que es
//      la caché que usa la edge function skool-login para el login
//      passwordless instantáneo. Salvaguarda: si el escaneo viene vacío,
//      NO toca skool_members y registra un alert 'no_members'.
//
//   2) Single-user (body con `target_email`): solo verifica si ese email está
//      en Skool y actualiza un solo profile. Disparado por el trigger
//      handle_new_user() cuando alguien se registra. Con early-termination:
//      para de paginar en cuanto encuentra el email.
//
// Alertas:
//   - Si la cookie de Skool expiró (login redirect), envía email a ADMIN_EMAIL
//     vía Resend. Anti-spam: máx 1 alerta cada 24h (chequea sync_alerts).
//
// Disparo manual:
//   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
//        -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
//        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"target_email":"persona@gmail.com"}'
//
// Secrets requeridos:
//   SKOOL_AUTH_TOKEN        cookie auth_token del admin (JWT de Skool)
//   SKOOL_CLIENT_ID         cookie client_id del admin
//   SKOOL_GROUP             slug del grupo (default: savias-8385)
//   ADMIN_EMAIL             destinatario de alertas (cookie expirada, etc.)
//   RESEND_API_KEY          para enviar alertas (reusa el de send-welcome-email)
//   FROM_EMAIL              remitente verificado en Resend
//   SUPABASE_URL            (auto-inyectado)
//   SUPABASE_SERVICE_ROLE_KEY (auto-inyectado)

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SKOOL_AUTH_TOKEN = Deno.env.get('SKOOL_AUTH_TOKEN') ?? '';
const SKOOL_CLIENT_ID  = Deno.env.get('SKOOL_CLIENT_ID') ?? '';
const SKOOL_GROUP      = Deno.env.get('SKOOL_GROUP') ?? 'savias-8385';
const ADMIN_EMAIL      = Deno.env.get('ADMIN_EMAIL') ?? '';
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL       = Deno.env.get('FROM_EMAIL') ?? 'Universo Lina <onboarding@resend.dev>';

const SKOOL_BASE = 'https://www.skool.com';
const SAFETY_PAGES = 200; // tope alto: 200 × 30 = 6000 miembros

const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// ============================================================
// SKOOL HELPERS
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

async function fetchSkoolMembersPage(buildId: string, page: number): Promise<{ members: SkoolMember[]; hasMore: boolean; totalPages?: number; totalMembers?: number; diagnostics?: any; rawSample?: string }> {
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

  let diagnostics;
  if (page === 1 && members.length === 0) {
    const sampleCandidate = candidates[0];
    diagnostics = {
      top_level_keys: Object.keys(j ?? {}),
      pageprops_keys: j?.pageProps ? Object.keys(j.pageProps) : null,
      candidates_found: candidates.length,
      candidate_sample_keys: sampleCandidate && typeof sampleCandidate === 'object'
        ? Object.keys(sampleCandidate)
        : null,
      payload_sample: JSON.stringify(j).slice(0, 1500),
    };
    console.log('skool page 1 sin miembros con email — diagnóstico:', JSON.stringify(diagnostics));
  }

  // Sample del JSON crudo para el modo diagnóstico (solo página 1): sirve
  // para identificar dónde vive el plan/tier y qué strings usa (standard/
  // premium/vip/…) SIN tener que adivinar. Se recorta para no inflar logs.
  const rawSample = page === 1
    ? JSON.stringify({
        first_candidate_keys: candidates[0] && typeof candidates[0] === 'object' ? Object.keys(candidates[0]) : null,
        first_candidate_metadata: candidates[0]?.member?.metadata ?? candidates[0]?.metadata ?? null,
        members_returned: members.length,
        sample_members: members.slice(0, 5),
      }, null, 2).slice(0, 4000)
    : undefined;

  const totalPages = typeof root?.totalPages === 'number' ? root.totalPages : undefined;
  const totalMembers = typeof root?.totalMembers === 'number' ? root.totalMembers : undefined;
  const hasMore = totalPages !== undefined ? page < totalPages : members.length >= 30;
  return { members, hasMore, totalPages, totalMembers, diagnostics, rawSample };
}

/** Extrae el tier/plan del miembro desde el JSON de Skool.
 *  Path canónico (verificado en el proyecto de Paulina, 2026-06-11):
 *  `member.metadata.mmbp` es un JSON-string:
 *    "{\"currency\":\"usd\",\"amount\":2700,\"recurring_interval\":\"month\",\"model\":\"freemium\",\"tier\":\"premium\"}"
 *  Tras JSON.parse, `.tier` es "premium"/"vip"/"standard"/…
 *  Si no aplica, se prueban fallbacks y por último devuelve null (el
 *  frontend trata null como plan estándar / vista limitada).
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

type ProfileRow = { user_id: string; email: string; is_skool_member: boolean; skool_level: string | null };

async function supaSelectAllProfiles(): Promise<ProfileRow[]> {
  const out: ProfileRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,is_skool_member,skool_level`,
      { headers: { ...SUPA_HEADERS, Range: `${from}-${to}`, 'Range-Unit': 'items' } },
    );
    if (!r.ok) throw new Error(`select profiles: ${r.status} ${await r.text()}`);
    const j: ProfileRow[] = await r.json();
    out.push(...j);
    if (j.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function supaSelectProfileByEmail(email: string): Promise<ProfileRow | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,is_skool_member,skool_level&email=ilike.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) throw new Error(`select profile by email: ${r.status} ${await r.text()}`);
  const j: ProfileRow[] = await r.json();
  return j[0] ?? null;
}

// Accesos manuales (admins/owners/comps): NO aparecen en el scraping de
// Skool, así que el cron los trataría como "no miembros" y les borraría el
// plan. Estas dos helpers permiten respetarlos (mismo contrato que
// skool-login, que ya lee allowed_emails primero). Un acceso manual sin
// level explícito es full por defecto → 'vip'.
async function supaSelectAllowedEmailsMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/allowed_emails?select=email,level`,
      { headers: { ...SUPA_HEADERS, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } },
    );
    if (!r.ok) break; // tabla ausente / error → mapa vacío (el cron sigue normal)
    const j: Array<{ email: string; level: string | null }> = await r.json();
    for (const row of j) if (row?.email) out.set(row.email.toLowerCase(), row.level ?? 'vip');
    if (j.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Devuelve el level si el email está allow-listed (default 'vip'), o null si
// no lo está (o si la consulta falla → se trata como no allow-listed).
async function supaGetAllowedLevel(email: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/allowed_emails?select=level&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: SUPA_HEADERS },
    );
    if (!r.ok) return null;
    const j: Array<{ level: string | null }> = await r.json();
    return j[0] ? (j[0].level ?? 'vip') : null;
  } catch { return null; }
}

async function supaUpdateProfile(userId: string, isMember: boolean, level: string | null = null): Promise<void> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_skool_member: isMember,
        skool_level: level,
        skool_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!r.ok) throw new Error(`update profile ${userId}: ${r.status} ${await r.text()}`);
}

async function supaInsertAlert(kind: string, message: string, payload: any, notified: boolean): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_alerts`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ kind, message, payload, notified }),
    });
  } catch (e) {
    console.warn('supaInsertAlert failed:', e);
  }
}

// Devuelve true si en las últimas 24h ya se notificó por este `kind`.
// Sirve como anti-spam: solo mandamos un email de cookie expirada al día.
async function supaWasRecentlyNotified(kind: string): Promise<boolean> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_alerts?select=id&kind=eq.${encodeURIComponent(kind)}&notified=eq.true&created_at=gte.${encodeURIComponent(oneDayAgo)}&limit=1`,
      { headers: SUPA_HEADERS },
    );
    if (!r.ok) return false;
    const j: any[] = await r.json();
    return j.length > 0;
  } catch {
    return false;
  }
}

// ============================================================
// SKOOL_MEMBERS CACHE (espejo de la comunidad para login instantáneo)
// ============================================================

// Upsert en bloque de los miembros escaneados. Trocea para no exceder
// límites de tamaño de request. Devuelve cuántos se upsertaron.
async function supaUpsertSkoolMembers(members: SkoolMember[]): Promise<number> {
  if (members.length === 0) return 0;
  const nowIso = new Date().toISOString();
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < members.length; i += CHUNK) {
    const batch = members.slice(i, i + CHUNK).map((m) => ({
      email: m.email,
      first_name: m.first_name ?? null,
      last_name: m.last_name ?? null,
      level: m.level ?? null,
      synced_at: nowIso,
    }));
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/skool_members?on_conflict=email`,
      {
        method: 'POST',
        headers: { ...SUPA_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      },
    );
    if (!r.ok) throw new Error(`upsert skool_members batch: ${r.status} ${await r.text().catch(() => '')}`);
    upserted += batch.length;
  }
  return upserted;
}

// Lista todos los emails actualmente en skool_members (paginado).
async function supaSelectAllSkoolMemberEmails(): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/skool_members?select=email`,
      { headers: { ...SUPA_HEADERS, Range: `${from}-${to}`, 'Range-Unit': 'items' } },
    );
    if (!r.ok) throw new Error(`select skool_members: ${r.status} ${await r.text().catch(() => '')}`);
    const j: Array<{ email: string }> = await r.json();
    for (const row of j) if (row?.email) out.push(row.email);
    if (j.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Borra de skool_members los emails que ya NO están en el set escaneado.
// Trocea con filtro in.() para no construir URLs gigantes. Devuelve
// cuántos se borraron.
async function supaDeleteSkoolMembersByEmail(emails: string[]): Promise<number> {
  if (emails.length === 0) return 0;
  const CHUNK = 200;
  let deleted = 0;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const batch = emails.slice(i, i + CHUNK);
    const inList = batch.map((e) => `"${e.replace(/"/g, '""')}"`).join(',');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/skool_members?email=in.(${encodeURIComponent(inList)})`,
      { method: 'DELETE', headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' } },
    );
    if (!r.ok) throw new Error(`delete skool_members batch: ${r.status} ${await r.text().catch(() => '')}`);
    deleted += batch.length;
  }
  return deleted;
}

// Reconcilia la caché skool_members con el set recién escaneado:
// upsert de todos los escaneados + delete de los obsoletos (por
// exclusión). SALVAGUARDA: si el escaneo vino vacío, no toca nada.
async function reconcileSkoolMembersCache(
  scanned: Map<string, SkoolMember>,
): Promise<{ upserted: number; deleted: number }> {
  const upserted = await supaUpsertSkoolMembers([...scanned.values()]);
  const existingEmails = await supaSelectAllSkoolMemberEmails();
  const obsolete = existingEmails.filter((e) => !scanned.has(e.toLowerCase()));
  const deleted = await supaDeleteSkoolMembersByEmail(obsolete);
  return { upserted, deleted };
}

// ============================================================
// ALERTAS POR EMAIL
// ============================================================

async function sendAdminAlertEmail(subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) {
    console.warn('No se envía alerta: RESEND_API_KEY o ADMIN_EMAIL no configurados');
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    });
    if (!r.ok) {
      console.error('Resend alert error:', r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('sendAdminAlertEmail exception:', e);
    return false;
  }
}

function cookieExpiredEmailHTML(finalUrl: string): string {
  return `<!DOCTYPE html><html><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#fafaf7;padding:32px;color:#1a1a1a;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 8px 24px rgba(0,0,0,.06);">
      <div style="font-size:13px;color:#b85c5c;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">⚠ Alerta · Universo Lina</div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:600;margin:0 0 16px;">La cookie de Skool expiró</h1>
      <p style="font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px;">
        La sincronización automática de miembros de la comunidad de Skool falló porque las cookies <code>SKOOL_AUTH_TOKEN</code> y/o <code>SKOOL_CLIENT_ID</code> del admin están expiradas o inválidas.
      </p>
      <p style="font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px;">
        Mientras esto no se resuelva, <strong>los nuevos miembros de Skool no serán desbloqueados automáticamente</strong> en el dashboard de Universo Lina.
      </p>
      <div style="background:#f4f6f2;border-left:3px solid #9caf88;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <div style="font-family:Georgia,serif;font-style:italic;color:#7d9169;font-size:14px;margin-bottom:8px;">Cómo arreglarlo</div>
        <ol style="margin:0;padding-left:20px;color:#3a3a3a;font-size:14px;line-height:1.8;">
          <li>Abre <a href="https://www.skool.com/${SKOOL_GROUP}/-/members" style="color:#7d9169;">www.skool.com/${SKOOL_GROUP}/-/members</a> en Chrome con la cuenta admin.</li>
          <li>Abre DevTools (⌘⌥I) → pestaña <strong>Application</strong> → <strong>Cookies</strong> → <code>skool.com</code>.</li>
          <li>Copia el valor de <code>auth_token</code> y de <code>client_id</code>.</li>
          <li>Ve a Supabase → Project Settings → Edge Functions → Secrets.</li>
          <li>Actualiza <code>SKOOL_AUTH_TOKEN</code> y <code>SKOOL_CLIENT_ID</code> con los valores nuevos.</li>
          <li>Dispara un sync manual:<br/><code style="font-size:12px;">curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members -H "Authorization: Bearer $SERVICE_ROLE_KEY"</code></li>
        </ol>
      </div>
      <p style="font-size:13px;color:#6b7164;margin:24px 0 0;">
        Detectado en URL final: <code>${escapeHtml(finalUrl)}</code><br/>
        No volverás a recibir este aviso en las próximas 24 horas para evitar spam.
      </p>
    </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

// ============================================================
// ENTRY POINT
// ============================================================

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    // Validar config
    if (!SKOOL_AUTH_TOKEN || !SKOOL_CLIENT_ID) {
      return jsonRes({ error: 'SKOOL_AUTH_TOKEN o SKOOL_CLIENT_ID no configurados' }, 500);
    }
    if (!SERVICE_KEY) return jsonRes({ error: 'SUPABASE_SERVICE_ROLE_KEY no disponible' }, 500);

    // Parsear body — si trae target_email, modo single-user;
    // si trae { diagnostic:true }, modo diagnóstico (no toca nada).
    let targetEmail: string | null = null;
    let isDiagnostic = false;
    try {
      if (req.method === 'POST') {
        const text = await req.text();
        if (text) {
          const body = JSON.parse(text);
          if (body?.target_email && typeof body.target_email === 'string') {
            targetEmail = body.target_email.toLowerCase().trim();
          }
          if (body?.diagnostic === true) isDiagnostic = true;
        }
      }
    } catch (e) {
      console.warn('No se pudo parsear body, asumiendo modo cron:', e);
    }

    // 1) Sacar buildId de Skool (valida que la cookie sigue viva)
    const { buildId, finalUrl, isLoginPage } = await fetchSkoolBuildId();
    console.log(`skool buildId=${buildId} finalUrl=${finalUrl} isLoginPage=${isLoginPage} mode=${isDiagnostic ? 'diagnostic' : targetEmail ? 'single' : 'cron'}`);

    // 1b) Si la cookie expiró → alertar al admin (con anti-spam de 24h)
    if (isLoginPage) {
      const recentlyNotified = await supaWasRecentlyNotified('cookie_expired');
      let emailSent = false;
      if (!recentlyNotified) {
        emailSent = await sendAdminAlertEmail(
          '⚠ Cookie de Skool expirada — Universo Lina',
          cookieExpiredEmailHTML(finalUrl),
        );
      }
      await supaInsertAlert(
        'cookie_expired',
        'Skool redirigió al login: cookie auth_token o client_id expirada/inválida',
        { finalUrl, target_email: targetEmail, email_sent: emailSent, already_notified_recently: recentlyNotified },
        emailSent,
      );
      return jsonRes({
        error: 'Skool nos redirigió al login: la cookie auth_token o client_id está expirada o inválida.',
        finalUrl,
        admin_alert_sent: emailSent,
        admin_alert_skipped_recent: recentlyNotified,
      }, 401);
    }

    // ============================================================
    // MODO DIAGNÓSTICO — inspeccionar el JSON crudo de Skool
    // ============================================================
    // Devuelve la estructura de la página 1 con los planes ya extraídos.
    // NO actualiza nada. Úsalo para confirmar qué strings usa Skool para
    // cada plan (standard/premium/vip/…) y ajustar FULL_ACCESS_PLANS en
    // universo-lina.html. Disparo:
    //   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
    //     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    //     -H "Content-Type: application/json" -d '{"diagnostic": true}'
    if (isDiagnostic) {
      const page1 = await fetchSkoolMembersPage(buildId, 1);
      const distinctLevels = [...new Set(page1.members.map(m => m.level ?? '∅(null)'))];
      await supaInsertAlert('run', 'diagnóstico de planes ejecutado', {
        buildId, members_page1: page1.members.length, distinct_levels: distinctLevels,
      }, false);
      return jsonRes({
        ok: true,
        mode: 'diagnostic',
        buildId,
        members_page1: page1.members.length,
        totalMembers: page1.totalMembers,
        distinct_levels_page1: distinctLevels,
        sample_extracted_members: page1.members.slice(0, 8),
        sample_raw_json: page1.rawSample,
        instructions: [
          'Mira `distinct_levels_page1` y `sample_extracted_members[].level`: esos son los strings reales de cada plan.',
          'El plan estándar es el que NO debe ver todas las herramientas.',
          'En universo-lina.html, ajusta FULL_ACCESS_PLANS con los niveles que SÍ dan acceso completo (ej. premium, vip).',
          'Si `level` sale null para todos, el plan puede venir en otro path: revisa `sample_raw_json.first_candidate_metadata` y amplía extractLevel().',
        ],
      });
    }

    // ============================================================
    // MODO SINGLE-USER (target_email) — con early termination
    // ============================================================
    if (targetEmail) {
      let found = false;
      let foundLevel: string | null = null;
      let foundOnPage = 0;
      let pagesScanned = 0;
      for (let page = 1; page <= SAFETY_PAGES; page++) {
        pagesScanned = page;
        const { members, hasMore } = await fetchSkoolMembersPage(buildId, page);
        const hit = members.find(m => m.email === targetEmail);
        if (hit) {
          found = true;
          foundLevel = hit.level ?? null;
          foundOnPage = page;
          break;
        }
        if (!hasMore) break;
      }

      // Buscamos el profile correspondiente
      const profile = await supaSelectProfileByEmail(targetEmail);
      if (!profile) {
        // Profile aún no existe (race entre signup trigger y este request).
        // El cron lo cogerá luego o el siguiente trigger.
        await supaInsertAlert('run', `single-user: profile no encontrado para ${targetEmail}`, {
          target_email: targetEmail, found_in_skool: found, pages_scanned: pagesScanned,
        }, false);
        return jsonRes({ ok: true, mode: 'single', email: targetEmail, profile_found: false, found_in_skool: found });
      }

      // Accesos manuales (allowed_emails) mandan sobre el scrape: si el email
      // está allow-listed, es miembro con su nivel (default vip) aunque no
      // aparezca en Skool. Así el cron/single-user NO degrada a los admins.
      const allowedLevel = await supaGetAllowedLevel(targetEmail);
      const effectiveMember = allowedLevel !== null ? true : found;
      const newLevel = allowedLevel !== null ? allowedLevel : (found ? foundLevel : null);
      if (effectiveMember !== profile.is_skool_member || newLevel !== (profile.skool_level ?? null)) {
        await supaUpdateProfile(profile.user_id, effectiveMember, newLevel);
      }

      const durationMs = Date.now() - startedAt;
      await supaInsertAlert('run', `single-user sync: ${targetEmail} → ${effectiveMember ? `member (${newLevel ?? 'sin plan'})` : 'non-member'}${allowedLevel !== null ? ' [allow-listed]' : ''}`, {
        mode: 'single', target_email: targetEmail, found_in_skool: found, allow_listed: allowedLevel !== null, level: newLevel,
        found_on_page: found ? foundOnPage : null, pages_scanned: pagesScanned,
        was_member: profile.is_skool_member, is_member_now: effectiveMember,
        was_level: profile.skool_level, level_now: newLevel, duration_ms: durationMs,
      }, false);

      return jsonRes({
        ok: true, mode: 'single', email: targetEmail,
        is_member: effectiveMember, allow_listed: allowedLevel !== null, level: newLevel,
        found_on_page: found ? foundOnPage : null,
        pages_scanned: pagesScanned, was_member: profile.is_skool_member,
        duration_ms: durationMs,
      });
    }

    // ============================================================
    // MODO CRON — sync completo
    // ============================================================
    // Guardamos el registro completo (email + nombres) por email para
    // poder mantener skool_members como espejo de la comunidad.
    const skoolMembers = new Map<string, SkoolMember>();
    let firstPageDiagnostics: any = null;
    let skoolTotalMembers: number | undefined;
    for (let page = 1; page <= SAFETY_PAGES; page++) {
      const { members, hasMore, totalMembers, diagnostics } = await fetchSkoolMembersPage(buildId, page);
      if (diagnostics) firstPageDiagnostics = diagnostics;
      if (totalMembers !== undefined) skoolTotalMembers = totalMembers;
      for (const m of members) skoolMembers.set(m.email, m);
      console.log(`page ${page}: +${members.length} (total únicos ${skoolMembers.size})`);
      if (!hasMore) break;
    }
    // Set de emails (lowercased ya en fetchSkoolMembersPage) para el
    // matching contra profiles.
    const skoolEmails = new Set<string>(skoolMembers.keys());

    const profiles = await supaSelectAllProfiles();
    // Accesos manuales: el cron NO los degrada (no aparecen en el scrape de
    // Skool). Los fija como miembro + su nivel (default vip), reflejando la
    // misma prioridad que skool-login.
    const allowedMap = await supaSelectAllowedEmailsMap().catch(() => new Map<string, string>());
    let markedMember = 0;
    let markedNonMember = 0;
    let levelChanged = 0;
    let allowedProtected = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const p of profiles) {
      const emailLower = (p.email || '').toLowerCase();

      // Prioridad 1: accesos manuales (allowed_emails) — siempre full/su nivel.
      const allowedLevel = allowedMap.get(emailLower);
      if (allowedLevel !== undefined) {
        if (p.is_skool_member !== true || (allowedLevel ?? null) !== (p.skool_level ?? null)) {
          try {
            await supaUpdateProfile(p.user_id, true, allowedLevel);
            allowedProtected++;
          } catch (err) {
            errors.push({ user_id: p.user_id, error: String((err as Error)?.message ?? err) });
          }
        }
        continue;
      }

      // Prioridad 2: estado según el scrape de Skool.
      const isMemberNow = skoolEmails.has(emailLower);
      const levelNow = isMemberNow ? (skoolMembers.get(emailLower)?.level ?? null) : null;
      const memberChanged = isMemberNow !== p.is_skool_member;
      const planChanged = levelNow !== (p.skool_level ?? null);
      if (!memberChanged && !planChanged) continue;
      try {
        await supaUpdateProfile(p.user_id, isMemberNow, levelNow);
        if (memberChanged) { if (isMemberNow) markedMember++; else markedNonMember++; }
        if (planChanged && !memberChanged) levelChanged++;
      } catch (err) {
        errors.push({ user_id: p.user_id, error: String((err as Error)?.message ?? err) });
      }
    }

    // ---- Reconciliar caché skool_members (espejo de la comunidad) ----
    // SALVAGUARDA: si el escaneo vino vacío/sospechoso, NO tocamos
    // skool_members (no borraríamos toda la comunidad por un fallo
    // transitorio) y registramos un alert 'no_members'.
    let cacheUpserted = 0;
    let cacheDeleted = 0;
    let cacheSkipped = false;
    if (skoolMembers.size === 0) {
      cacheSkipped = true;
      console.warn('cron: escaneo de Skool devolvió 0 miembros — se omite reconciliación de skool_members');
      await supaInsertAlert('no_members', 'Escaneo de Skool devolvió 0 miembros; skool_members NO modificado (salvaguarda)', {
        mode: 'cron', total_profiles: profiles.length,
        skool_total_reported: skoolTotalMembers, duration_ms: Date.now() - startedAt,
        ...(firstPageDiagnostics ? { diagnostics: firstPageDiagnostics } : {}),
      }, false);
    } else {
      try {
        const reconciled = await reconcileSkoolMembersCache(skoolMembers);
        cacheUpserted = reconciled.upserted;
        cacheDeleted = reconciled.deleted;
        console.log(`skool_members cache: upserted=${cacheUpserted} deleted=${cacheDeleted}`);
      } catch (e) {
        console.error('cron: reconciliación de skool_members falló:', e);
        await supaInsertAlert('http_error', `reconcile skool_members falló: ${String((e as Error)?.message ?? e)}`, {
          mode: 'cron', total_in_skool: skoolMembers.size,
        }, false);
      }
    }

    const durationMs = Date.now() - startedAt;
    await supaInsertAlert('run', `cron sync: ${markedMember} new members, ${markedNonMember} removed, ${levelChanged} plan changes, ${allowedProtected} allow-listed; cache +${cacheUpserted}/-${cacheDeleted}`, {
      mode: 'cron', total_in_skool: skoolEmails.size, total_profiles: profiles.length,
      profiles_marked_member: markedMember, profiles_marked_nonmember: markedNonMember,
      profiles_level_changed: levelChanged, profiles_allowed_protected: allowedProtected,
      skool_members_upserted: cacheUpserted, skool_members_deleted: cacheDeleted,
      skool_members_skipped: cacheSkipped,
      errors_count: errors.length, duration_ms: durationMs,
    }, false);

    return jsonRes({
      ok: true,
      mode: 'cron',
      buildId,
      skool_total_reported: skoolTotalMembers,
      total_in_skool: skoolEmails.size,
      total_profiles: profiles.length,
      profiles_marked_member: markedMember,
      profiles_marked_nonmember: markedNonMember,
      profiles_level_changed: levelChanged,
      profiles_allowed_protected: allowedProtected,
      skool_members_upserted: cacheUpserted,
      skool_members_deleted: cacheDeleted,
      skool_members_skipped: cacheSkipped,
      errors,
      duration_ms: durationMs,
      ...(firstPageDiagnostics ? { diagnostics: firstPageDiagnostics } : {}),
    });
  } catch (err) {
    console.error('sync-skool-members error', err);
    await supaInsertAlert('http_error', String((err as Error)?.message ?? err), {
      duration_ms: Date.now() - startedAt,
    }, false);
    return jsonRes({ error: String((err as Error)?.message ?? err) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

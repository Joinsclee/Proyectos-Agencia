// Supabase Edge Function: sync-skool-paulina
// ──────────────────────────────────────────────────────────────────
// Lista miembros activos de la comunidad Skool de Paulina, extrae el
// NIVEL/PLAN de cada uno (Premium, VIP, Basic, etc.) y actualiza el
// campo `skool_level` en public.profiles. Solo los niveles definidos
// como "permitidos" en la migración (has_app_access) entran a la app.
//
// Modos:
//   1) Cron (body vacío {}): sync masivo de todos los profiles vs Skool.
//      Disparado por pg_cron cada 6h.
//   2) Single-user (body con `target_email`): solo sincroniza ese email.
//      Disparado por handle_new_user() en signup.
//   3) Diagnóstico (body con `diagnostic: true`): NO actualiza nada,
//      pero devuelve un sample del JSON crudo para identificar dónde
//      vive el campo `level`/`tier`/`plan` en la respuesta de Skool.
//
// Disparo manual:
//   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-paulina \
//        -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//
//   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-paulina \
//        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"diagnostic": true}'
//
// Secrets requeridos en Supabase → Edge Functions → Secrets:
//   SKOOL_AUTH_TOKEN          cookie auth_token del admin de Paulina
//   SKOOL_CLIENT_ID           cookie client_id del admin
//   SKOOL_GROUP               slug del grupo Skool de Paulina (ej. "mi-barco-3942")
//   SKOOL_ALLOWED_LEVELS      CSV de niveles permitidos. Default: "premium,vip"
//                              (la comparación es case-insensitive)
//   ADMIN_EMAIL               destinatario de alertas
//   RESEND_API_KEY            para alertas (cookie expirada, etc.)
//   FROM_EMAIL                remitente verificado en Resend
//   SUPABASE_URL              (auto-inyectado)
//   SUPABASE_SERVICE_ROLE_KEY (auto-inyectado)

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SKOOL_AUTH_TOKEN = Deno.env.get('SKOOL_AUTH_TOKEN') ?? '';
const SKOOL_CLIENT_ID  = Deno.env.get('SKOOL_CLIENT_ID') ?? '';
const SKOOL_GROUP      = Deno.env.get('SKOOL_GROUP') ?? '';
const ALLOWED_LEVELS   = (Deno.env.get('SKOOL_ALLOWED_LEVELS') ?? 'premium,vip')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAIL      = Deno.env.get('ADMIN_EMAIL') ?? '';
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL       = Deno.env.get('FROM_EMAIL') ?? 'Mi Barco <onboarding@resend.dev>';

const SKOOL_BASE = 'https://www.skool.com';
const SAFETY_PAGES = 200; // tope: 200 × ~30 = ~6000 miembros

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
  if (!m) throw new Error(`buildId no encontrado (finalUrl=${finalUrl})`);
  return { buildId: m[1], finalUrl, isLoginPage };
}

type SkoolMember = {
  email: string;
  level: string | null;  // ← clave para el gating
  user_id?: string;
  first_name?: string;
  last_name?: string;
};

async function fetchSkoolMembersPage(buildId: string, page: number): Promise<{
  members: SkoolMember[];
  hasMore: boolean;
  totalPages?: number;
  totalMembers?: number;
  totalFiltered?: number;
  rawSample?: string;  // solo en modo diagnóstico
}> {
  // Filtramos en el servidor de Skool con tiers=<allowed levels comma-separated>.
  // Es mucho más eficiente: en vez de paginar miembros de toda la comunidad,
  // solo traemos quienes ya cumplen el filtro. La comunidad de Paulina tiene
  // 161 miembros totales y ~5 Premium+VIP → 1 página en vez de 6.
  const tiersFilter = ALLOWED_LEVELS.join(',');
  const params = new URLSearchParams({
    t: 'active',
    p: String(page),
    sortType: '-memberapprovedat',  // más recientes primero
    tiers: tiersFilter,             // ← filtro server-side
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
  if (!r.ok) throw new Error(`skool members.json page ${page}: ${r.status}`);
  const j = await r.json();

  // Path canónico para la comunidad de Paulina (verificado 2026-06-11):
  // j.pageProps.users[] → cada user tiene .email/.firstName/.lastName en raíz
  // y .member.metadata.{mbme,mmbp} con email real y JSON-string del plan.
  const candidates: any[] = [];
  const root = j?.pageProps ?? j;
  if (Array.isArray(root?.users))                          candidates.push(...root.users);
  if (Array.isArray(root?.members))                        candidates.push(...root.members);
  if (Array.isArray(root?.data?.members))                  candidates.push(...root.data.members);
  if (Array.isArray(root?.initialState?.members?.list))    candidates.push(...root.initialState.members.list);
  if (Array.isArray(root?.membersData?.members))           candidates.push(...root.membersData.members);
  if (candidates.length === 0) deepCollect(root, candidates);

  const members: SkoolMember[] = [];
  for (const c of candidates) {
    const rawEmail = c?.member?.metadata?.mbme
      ?? c?.email ?? c?.user?.email
      ?? c?.metadata?.mbme ?? c?.metadata?.email;
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    if (!email || !email.includes('@')) continue;

    // ── Detección heurística del NIVEL/PLAN del miembro ──
    // Skool puede exponer esto en varios paths según versión. Probamos
    // los más comunes en orden. Si ninguno aplica, queda null.
    const level = extractLevel(c);

    members.push({
      email,
      level,
      user_id: c?.id ?? c?.user_id ?? c?.user?.id,
      first_name: c?.firstName ?? c?.first_name ?? c?.user?.firstName ?? c?.user?.first_name,
      last_name:  c?.lastName  ?? c?.last_name  ?? c?.user?.lastName  ?? c?.user?.last_name,
    });
  }

  // En el JSON de Skool de Paulina:
  //   pageProps.total → cuántos cumplen el filtro (ej. 5 si filter=premium,vip)
  //   pageProps.totalMembers → total de la comunidad sin filtro (ej. 161)
  //   pageProps.totalPages → número de páginas con el filtro actual
  //   pageProps.itemsPerPage → tamaño de página (típico: 30)
  const totalPages = typeof root?.totalPages === 'number' ? root.totalPages : undefined;
  const totalFiltered = typeof root?.total === 'number' ? root.total : undefined;
  const totalMembers = typeof root?.totalMembers === 'number' ? root.totalMembers : undefined;
  const itemsPerPage = typeof root?.itemsPerPage === 'number' ? root.itemsPerPage : 30;
  const hasMore = totalPages !== undefined
    ? page < totalPages
    : members.length >= itemsPerPage;

  // Sample del JSON crudo para modo diagnóstico
  const rawSample = page === 1
    ? JSON.stringify({
        first_candidate: candidates[0] ?? null,
        all_keys_first_candidate: candidates[0] ? Object.keys(candidates[0]) : null,
        members_returned: members.length,
        sample_members: members.slice(0, 3),
      }, null, 2).slice(0, 4000)
    : undefined;

  return { members, hasMore, totalPages, totalMembers, totalFiltered, rawSample };
}

/** Extrae el tier/nivel del miembro.
 *  Para la comunidad de Paulina (verificado 2026-06-11), el tier vive en
 *  `member.metadata.mmbp` como JSON-string:
 *    "{\"currency\":\"usd\",\"amount\":2700,\"recurring_interval\":\"month\",\"model\":\"freemium\",\"tier\":\"premium\"}"
 *  Después de JSON.parse, .tier es "premium" o "vip".
 *
 *  Mantengo paths alternativos como fallback por si Skool cambia el shape
 *  o por si otra comunidad expone el dato distinto.
 */
function extractLevel(c: any): string | null {
  // 1. Path canónico: member.metadata.mmbp es JSON-string → parse → .tier
  const mmbpStr = c?.member?.metadata?.mmbp ?? c?.metadata?.mmbp;
  if (typeof mmbpStr === 'string' && mmbpStr.trim()) {
    try {
      const mmbp = JSON.parse(mmbpStr);
      if (typeof mmbp?.tier === 'string' && mmbp.tier.trim()) return mmbp.tier.trim();
    } catch (_) { /* mmbp no era JSON válido — caer a fallbacks */ }
  }

  // 2. Fallbacks: paths comunes en otras versiones del JSON de Skool
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

function deepCollect(node: any, out: any[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) deepCollect(x, out); return; }
  if (typeof node.email === 'string') out.push(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === 'object') deepCollect(v, out);
  }
}

// ============================================================
// SUPABASE HELPERS
// ============================================================

type ProfileRow = { user_id: string; email: string; skool_level: string | null };

async function supaSelectAllProfiles(): Promise<ProfileRow[]> {
  const out: ProfileRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,skool_level`,
      { headers: { ...SUPA_HEADERS, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } },
    );
    if (!r.ok) throw new Error(`select profiles: ${r.status}`);
    const batch = await r.json() as ProfileRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function supaSelectProfileByEmail(email: string): Promise<ProfileRow | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,skool_level&email=ilike.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) return null;
  const rows = await r.json() as ProfileRow[];
  return rows[0] ?? null;
}

/** Actualiza skool_level via RPC set_skool_level (preserva member_since correctamente).
 *  Devuelve true si la fila se actualizó, false si la respuesta no fue OK. */
async function supaUpdateLevel(user_id: string, level: string | null): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_skool_level`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ target_user_id: user_id, new_level: level }),
  });
  if (!r.ok) {
    console.warn(`set_skool_level falló para ${user_id}: ${r.status} ${await r.text().catch(() => '')}`);
    return false;
  }
  return true;
}

async function logAlert(kind: string, message: string, payload: any = {}): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_alerts`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ kind, message, payload }),
    });
  } catch (_) { /* ignore */ }
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* body vacío */ }

  const isDiagnostic = body?.diagnostic === true;
  const targetEmail = body?.target_email ? String(body.target_email).trim().toLowerCase() : null;

  // Validar configuración mínima
  if (!SKOOL_AUTH_TOKEN || !SKOOL_CLIENT_ID || !SKOOL_GROUP) {
    return new Response(JSON.stringify({
      error: 'Faltan secrets: SKOOL_AUTH_TOKEN, SKOOL_CLIENT_ID, SKOOL_GROUP',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { buildId, isLoginPage, finalUrl } = await fetchSkoolBuildId();
    if (isLoginPage) {
      await logAlert('cookie_expired', 'Cookie expirada — redirige a /login', { finalUrl });
      return new Response(JSON.stringify({ error: 'cookie_expired', finalUrl }), { status: 401 });
    }

    // ─────────────── MODO DIAGNÓSTICO ───────────────
    // Devuelve la estructura cruda de la página 1 para identificar
    // dónde vive el nivel/plan. NO actualiza profiles.
    if (isDiagnostic) {
      const page1 = await fetchSkoolMembersPage(buildId, 1);
      await logAlert('diagnostics', 'Modo diagnóstico ejecutado', {
        buildId, sample: page1.rawSample?.slice(0, 2000),
      });
      return new Response(JSON.stringify({
        mode: 'diagnostic',
        buildId,
        members_page1: page1.members.length,
        totalPages: page1.totalPages,
        totalMembers: page1.totalMembers,
        sample_raw_json: page1.rawSample,
        sample_extracted_members: page1.members.slice(0, 5),
        allowed_levels_configured: ALLOWED_LEVELS,
        instructions: [
          'Revisa `sample_raw_json` para encontrar dónde está el nivel del miembro.',
          'Si `level` aparece como null en `sample_extracted_members`, edita la función `extractLevel` en index.ts agregando el path correcto.',
          'Una vez identificado, actualiza la variable de entorno SKOOL_ALLOWED_LEVELS con los nombres exactos (CSV) y re-deploy.',
        ],
      }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ─────────────── MODO SINGLE-USER (target_email) ───────────────
    if (targetEmail) {
      const profile = await supaSelectProfileByEmail(targetEmail);
      if (!profile) {
        return new Response(JSON.stringify({ mode: 'single', error: 'profile_not_found', email: targetEmail }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      // Paginar Skool buscando este email (early termination)
      let foundLevel: string | null = null;
      let pagesScanned = 0;
      let truncated = false;
      let lastPageHadMore = false;
      for (let p = 1; p <= SAFETY_PAGES; p++) {
        const { members, hasMore } = await fetchSkoolMembersPage(buildId, p);
        pagesScanned++;
        lastPageHadMore = hasMore;
        const hit = members.find((m) => m.email === targetEmail);
        if (hit) { foundLevel = hit.level; break; }
        if (!hasMore) break;
        if (p === SAFETY_PAGES) truncated = true;
      }

      // Si truncamos sin encontrarla → NO marcarla como "no miembro" (falso negativo).
      // En su lugar, dejarla pending y loggear safety_truncated para reintentar en próximo cron.
      if (truncated && !foundLevel) {
        await logAlert('safety_truncated', `single-user: ${targetEmail} no encontrado en ${SAFETY_PAGES} páginas`, {
          email: targetEmail, pagesScanned, lastPageHadMore,
        });
        return new Response(JSON.stringify({
          mode: 'single', email: targetEmail, error: 'safety_truncated',
          message: 'Se alcanzó el tope de páginas sin encontrar el email. NO se actualizó el profile para evitar falso negativo.',
          pagesScanned,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const updateOk = await supaUpdateLevel(profile.user_id, foundLevel);
      await logAlert('run', `single-user sync: ${targetEmail} → ${foundLevel ?? 'no es miembro'}`, {
        pagesScanned, level: foundLevel, updateOk,
      });
      return new Response(JSON.stringify({
        mode: 'single', email: targetEmail, skool_level: foundLevel,
        has_access: foundLevel ? ALLOWED_LEVELS.includes(foundLevel.toLowerCase()) : false,
        pagesScanned, updateOk,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ─────────────── MODO CRON (sync masivo) ───────────────
    const profiles = await supaSelectAllProfiles();

    // Recorrer todas las páginas de Skool y armar mapa email → level
    const skoolMembers = new Map<string, string | null>();
    let totalPagesUsed = 0;
    let truncated = false;
    let lastHasMore = false;
    for (let p = 1; p <= SAFETY_PAGES; p++) {
      const { members, hasMore } = await fetchSkoolMembersPage(buildId, p);
      totalPagesUsed++;
      lastHasMore = hasMore;
      for (const m of members) skoolMembers.set(m.email, m.level);
      if (!hasMore) break;
      if (p === SAFETY_PAGES) truncated = true;
    }

    // SAFETY: si truncamos, hay miembros en páginas no escaneadas. NO podemos
    // marcar como 'no es miembro' a quien no apareció (podría estar más allá).
    // Estrategia conservadora: solo ACTUALIZAR los que sí aparecieron en Skool
    // (level → nuevo level), pero NO TOCAR los que no aparecieron en este batch
    // (siguen con su valor previo). Esto evita kickouts masivos por false negative.
    if (truncated) {
      await logAlert('safety_truncated',
        `cron alcanzó ${SAFETY_PAGES} páginas con hasMore=${lastHasMore}. ` +
        `Solo se actualizaron miembros encontrados; los no-encontrados quedan con su valor previo.`,
        { pages_scanned: totalPagesUsed, members_found: skoolMembers.size });
    }

    // Reconciliar
    let updated = 0, unchanged = 0, removed = 0, skipped_truncation = 0;
    for (const profile of profiles) {
      const emailLower = profile.email.toLowerCase();
      const foundInSkool = skoolMembers.has(emailLower);
      const newLevel = foundInSkool ? (skoolMembers.get(emailLower) ?? null) : null;
      const prevLevel = profile.skool_level;

      // Si truncamos Y el email NO apareció → no tocar (puede estar en páginas no escaneadas)
      if (truncated && !foundInSkool) {
        skipped_truncation++;
        continue;
      }

      if (newLevel !== prevLevel) {
        const ok = await supaUpdateLevel(profile.user_id, newLevel);
        if (!ok) continue;
        if (newLevel === null) removed++;
        else updated++;
      } else {
        unchanged++;
      }
    }

    await logAlert('run', 'cron sync completado', {
      profiles: profiles.length, skool_members: skoolMembers.size,
      pages_scanned: totalPagesUsed, updated, unchanged, removed, skipped_truncation,
      truncated,
    });

    return new Response(JSON.stringify({
      mode: 'cron',
      profiles_checked: profiles.length,
      skool_members_found: skoolMembers.size,
      pages_scanned: totalPagesUsed,
      truncated, skipped_truncation,
      updated, unchanged, removed,
      allowed_levels: ALLOWED_LEVELS,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    await logAlert('http_error', e.message ?? 'error desconocido', { stack: e.stack });
    return new Response(JSON.stringify({ error: e.message ?? 'unknown' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Supabase Edge Function: sync-skool-members
// Lista miembros activos de la comunidad Skool de Savias y actualiza el flag
// is_skool_member en public.profiles. Se conecta a la API interna de Skool
// (no documentada) usando cookies de un admin (Cristian Vega).
//
// Modos:
//   1) Cron (sin body o body vacío): hace sync completo de todos los profiles
//      contra todos los miembros de Skool. Disparado por pg_cron cada 6h.
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
  user_id?: string;
  first_name?: string;
  last_name?: string;
};

async function fetchSkoolMembersPage(buildId: string, page: number): Promise<{ members: SkoolMember[]; hasMore: boolean; totalPages?: number; totalMembers?: number; diagnostics?: any }> {
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

  const totalPages = typeof root?.totalPages === 'number' ? root.totalPages : undefined;
  const totalMembers = typeof root?.totalMembers === 'number' ? root.totalMembers : undefined;
  const hasMore = totalPages !== undefined ? page < totalPages : members.length >= 30;
  return { members, hasMore, totalPages, totalMembers, diagnostics };
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

type ProfileRow = { user_id: string; email: string; is_skool_member: boolean };

async function supaSelectAllProfiles(): Promise<ProfileRow[]> {
  const out: ProfileRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,is_skool_member`,
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
    `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,is_skool_member&email=ilike.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) throw new Error(`select profile by email: ${r.status} ${await r.text()}`);
  const j: ProfileRow[] = await r.json();
  return j[0] ?? null;
}

async function supaUpdateProfile(userId: string, isMember: boolean): Promise<void> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_skool_member: isMember,
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

    // Parsear body — si trae target_email, modo single-user
    let targetEmail: string | null = null;
    try {
      if (req.method === 'POST') {
        const text = await req.text();
        if (text) {
          const body = JSON.parse(text);
          if (body?.target_email && typeof body.target_email === 'string') {
            targetEmail = body.target_email.toLowerCase().trim();
          }
        }
      }
    } catch (e) {
      console.warn('No se pudo parsear body, asumiendo modo cron:', e);
    }

    // 1) Sacar buildId de Skool (valida que la cookie sigue viva)
    const { buildId, finalUrl, isLoginPage } = await fetchSkoolBuildId();
    console.log(`skool buildId=${buildId} finalUrl=${finalUrl} isLoginPage=${isLoginPage} mode=${targetEmail ? 'single' : 'cron'}`);

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
    // MODO SINGLE-USER (target_email) — con early termination
    // ============================================================
    if (targetEmail) {
      let found = false;
      let foundOnPage = 0;
      let pagesScanned = 0;
      for (let page = 1; page <= SAFETY_PAGES; page++) {
        pagesScanned = page;
        const { members, hasMore } = await fetchSkoolMembersPage(buildId, page);
        if (members.some(m => m.email === targetEmail)) {
          found = true;
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

      // Solo actualizar si cambió
      if (found !== profile.is_skool_member) {
        await supaUpdateProfile(profile.user_id, found);
      }

      const durationMs = Date.now() - startedAt;
      await supaInsertAlert('run', `single-user sync: ${targetEmail} → ${found ? 'member' : 'non-member'}`, {
        mode: 'single', target_email: targetEmail, found_in_skool: found,
        found_on_page: found ? foundOnPage : null, pages_scanned: pagesScanned,
        was_member: profile.is_skool_member, is_member_now: found, duration_ms: durationMs,
      }, false);

      return jsonRes({
        ok: true, mode: 'single', email: targetEmail,
        is_member: found, found_on_page: found ? foundOnPage : null,
        pages_scanned: pagesScanned, was_member: profile.is_skool_member,
        duration_ms: durationMs,
      });
    }

    // ============================================================
    // MODO CRON — sync completo
    // ============================================================
    const skoolEmails = new Set<string>();
    let firstPageDiagnostics: any = null;
    let skoolTotalMembers: number | undefined;
    for (let page = 1; page <= SAFETY_PAGES; page++) {
      const { members, hasMore, totalMembers, diagnostics } = await fetchSkoolMembersPage(buildId, page);
      if (diagnostics) firstPageDiagnostics = diagnostics;
      if (totalMembers !== undefined) skoolTotalMembers = totalMembers;
      for (const m of members) skoolEmails.add(m.email);
      console.log(`page ${page}: +${members.length} (total únicos ${skoolEmails.size})`);
      if (!hasMore) break;
    }

    const profiles = await supaSelectAllProfiles();
    let markedMember = 0;
    let markedNonMember = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const p of profiles) {
      const isMemberNow = skoolEmails.has((p.email || '').toLowerCase());
      if (isMemberNow === p.is_skool_member) continue;
      try {
        await supaUpdateProfile(p.user_id, isMemberNow);
        if (isMemberNow) markedMember++; else markedNonMember++;
      } catch (err) {
        errors.push({ user_id: p.user_id, error: String((err as Error)?.message ?? err) });
      }
    }

    const durationMs = Date.now() - startedAt;
    await supaInsertAlert('run', `cron sync: ${markedMember} new members, ${markedNonMember} removed`, {
      mode: 'cron', total_in_skool: skoolEmails.size, total_profiles: profiles.length,
      profiles_marked_member: markedMember, profiles_marked_nonmember: markedNonMember,
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

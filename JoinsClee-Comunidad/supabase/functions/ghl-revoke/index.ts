// ============================================================================
//  ghl-revoke · ejecuta la revocación que una persona confirmó en el panel
// ============================================================================
//  Contrato:
//
//    POST /functions/v1/ghl-revoke
//    Headers: Authorization: Bearer <ANON_KEY>, x-admin-token: <ADMIN_TOKEN>
//
//    { "action": "list" }
//       → { ok, pendientes: [...], health: {...} }
//
//    { "action": "revoke", "revocation_id": 12, "by": "cristhian", "dry_run": true }
//       → { ok, users_deleted, location_action, ... }
//
//    { "action": "dismiss", "revocation_id": 12, "by": "cristhian", "note": "..." }
//       → descarta la revocación (falso positivo) y devuelve al miembro a activo
//
//    { "action": "link", "member_id": 5, "ghl_location_id": "abc", "ghl_email": "..." }
//       → vincula a mano un miembro con su sub-cuenta de GHL
//
//  Por qué existe una función aparte en vez de hacerlo en el cron: la
//  revocación es irreversible y necesita una persona detrás. Separarla deja
//  el cron sin permiso de escritura sobre GHL en su camino normal.
//
//  Autenticación: ADMIN_TOKEN en el header x-admin-token, comparado en tiempo
//  constante. El panel lo guarda en localStorage; nunca viaja en la URL.
// ============================================================================

import { revokeLocationAccess, listUsersOfLocation, type GhlConfig } from '../_shared/ghl.ts';
import { notifyRevokeDone, type SlackConfig } from '../_shared/slack.ts';
import { sq, type SupaConfig } from '../_shared/supa.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;

const supa: SupaConfig = { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY') };
const ghlCfg: GhlConfig = { pit: env('GHL_AGENCY_PIT'), companyId: env('GHL_COMPANY_ID') };
const slackCfg: SlackConfig = { webhookUrl: env('SLACK_WEBHOOK_URL'), panelUrl: env('ADMIN_PANEL_URL') };

const ADMIN_TOKEN = env('ADMIN_TOKEN');
const TRY_PAUSE   = env('TRY_PAUSE_LOCATION', 'false') === 'true';
const DRY_RUN     = env('DRY_RUN', 'true') === 'true';

const CORS = {
  'Access-Control-Allow-Origin': env('ADMIN_ALLOWED_ORIGIN', '*'),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const H = { ...CORS, 'Content-Type': 'application/json' };

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b, null, 2), { status, headers: H });

/** Comparación en tiempo constante: evita filtrar el token por timing. */
function tokenOk(given: string | null): boolean {
  if (!ADMIN_TOKEN || !given) return false;
  const a = new TextEncoder().encode(ADMIN_TOKEN);
  const b = new TextEncoder().encode(given);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const nombre = (m: any) =>
  [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.skool_email || 'sin nombre';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, reason: 'method_not_allowed' }, 405);

  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) {
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }
  if (!ADMIN_TOKEN) {
    return json({ ok: false, reason: 'admin_token_no_configurado', detail: 'Falta el secret ADMIN_TOKEN.' }, 500);
  }
  if (!tokenOk(req.headers.get('x-admin-token'))) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const action = String(body?.action ?? 'list');
  const by = String(body?.by ?? 'panel').slice(0, 80);

  // ── list ──────────────────────────────────────────────────────────────────
  if (action === 'list') {
    const [pendientes, health, activos, ultimasCorridas, alertas] = await Promise.all([
      sq<any[]>(supa, 'jc_pending_revocations?select=*&order=detected_at.asc').catch(() => []),
      sq<any[]>(supa, 'jc_health?select=*').catch(() => []),
      sq<any[]>(supa,
        'jc_members?select=id,skool_email,first_name,last_name,tier,status,churn_at,churned_at,ghl_location_id,ghl_email,revoked_at,missing_streak' +
        '&order=status.asc,skool_email.asc&limit=500').catch(() => []),
      sq<any[]>(supa, 'jc_sync_runs?select=*&order=started_at.desc&limit=10').catch(() => []),
      sq<any[]>(supa, 'jc_alerts?select=*&order=created_at.desc&limit=10').catch(() => []),
    ]);
    return json({
      ok: true,
      pendientes, miembros: activos,
      health: health?.[0] ?? null,
      corridas: ultimasCorridas,
      alertas,
      config: { dry_run_default: DRY_RUN, try_pause: TRY_PAUSE, ghl_configurado: Boolean(ghlCfg.pit && ghlCfg.companyId) },
    });
  }

  // ── preview: qué se borraría, sin borrar nada ─────────────────────────────
  if (action === 'preview') {
    const locationId = String(body?.ghl_location_id ?? '');
    if (!locationId) return json({ ok: false, reason: 'falta_location_id' }, 400);
    if (!ghlCfg.pit) return json({ ok: false, reason: 'ghl_no_configurado' }, 500);

    const res = await listUsersOfLocation(ghlCfg, locationId);
    return json({
      ok: res.ok, status: res.status,
      usuarios: (res.body?.users ?? []).map((u: any) => ({
        id: u.id, email: u.email, nombre: [u.firstName, u.lastName].filter(Boolean).join(' '),
        rol: u.roles?.role ?? u.roles?.type ?? null,
      })),
      detalle: res.ok ? undefined : res.body,
    });
  }

  // ── link: vincular un miembro con su sub-cuenta ───────────────────────────
  //  El paso más importante del sistema entero. Sin este mapeo la revocación
  //  no tiene a qué apuntar, y resolver por email al momento de revocar es
  //  justo lo que no queremos: el email de Skool y el de GHL pueden diferir,
  //  y GHL ya no deja actualizar el email de un usuario por API.
  if (action === 'link') {
    const memberId = Number(body?.member_id);
    const locationId = String(body?.ghl_location_id ?? '').trim();
    if (!memberId || !locationId) return json({ ok: false, reason: 'faltan_member_id_o_location_id' }, 400);

    let userIds: string[] = [];
    let emails: string[] = [];
    if (ghlCfg.pit) {
      const res = await listUsersOfLocation(ghlCfg, locationId);
      if (res.ok) {
        userIds = (res.body?.users ?? []).map((u: any) => u.id).filter(Boolean);
        emails  = (res.body?.users ?? []).map((u: any) => u.email).filter(Boolean);
      }
    }

    await sq(supa, `jc_members?id=eq.${memberId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({
        ghl_location_id: locationId,
        ghl_email: String(body?.ghl_email ?? '').trim() || emails[0] || null,
        ghl_user_ids: userIds,
        ghl_provisioned_at: new Date().toISOString(),
      }),
    });
    return json({ ok: true, member_id: memberId, ghl_location_id: locationId, usuarios_encontrados: userIds.length, emails });
  }

  // ── dismiss: era un falso positivo ────────────────────────────────────────
  if (action === 'dismiss') {
    const revId = Number(body?.revocation_id);
    if (!revId) return json({ ok: false, reason: 'falta_revocation_id' }, 400);

    const rows = await sq<any[]>(supa, `jc_revocations?select=member_id&id=eq.${revId}`);
    const memberId = rows?.[0]?.member_id;

    await sq(supa, `jc_revocations?id=eq.${revId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({
        status: 'dismissed', approved_by: by,
        executed_at: new Date().toISOString(),
        error: String(body?.note ?? 'Descartada a mano').slice(0, 500),
      }),
    });

    // Volver a activo y reiniciar la racha: si fue un fallo de scraping, no
    // queremos que el miembro reingrese a la cola mañana.
    if (memberId) {
      await sq(supa, `jc_members?id=eq.${memberId}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ status: 'active', missing_streak: 0, revoke_notified_at: null }),
      });
    }
    return json({ ok: true, dismissed: revId });
  }

  // ── revoke: la acción de verdad ───────────────────────────────────────────
  if (action === 'revoke') {
    const revId = Number(body?.revocation_id);
    if (!revId) return json({ ok: false, reason: 'falta_revocation_id' }, 400);
    if (!ghlCfg.pit || !ghlCfg.companyId) {
      return json({ ok: false, reason: 'ghl_no_configurado', detail: 'Faltan GHL_AGENCY_PIT o GHL_COMPANY_ID.' }, 500);
    }

    const dryRun = body?.dry_run !== undefined ? Boolean(body.dry_run) : DRY_RUN;

    const rows = await sq<any[]>(supa, `jc_pending_revocations?select=*&revocation_id=eq.${revId}`);
    const p = rows?.[0];
    if (!p) return json({ ok: false, reason: 'revocacion_no_encontrada_o_ya_resuelta' }, 404);

    if (!p.ghl_location_id) {
      return json({
        ok: false, reason: 'sin_subcuenta_mapeada',
        detail: `${p.skool_email} no tiene ghl_location_id. Vincúlalo primero con action:"link" — el sistema nunca adivina por email.`,
      }, 400);
    }

    const res = await revokeLocationAccess(ghlCfg, p.ghl_location_id, {
      dryRun, tryPause: TRY_PAUSE, knownUserIds: p.ghl_user_ids ?? [],
    });

    const nowIso = new Date().toISOString();

    if (!dryRun) {
      await sq(supa, `jc_revocations?id=eq.${revId}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({
          status: res.ok ? 'done' : 'failed',
          executed_at: nowIso, approved_by: by,
          users_deleted: res.usersDeleted,
          location_paused: res.locationPaused,
          location_action: res.locationAction,
          error: res.errors.join(' | ') || (res.failedIds.length ? JSON.stringify(res.failedIds).slice(0, 500) : null),
          detail: res,
        }),
      });

      if (res.ok) {
        await sq(supa, `jc_members?id=eq.${p.member_id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({
            status: 'revoked', revoked_at: nowIso,
            ghl_user_ids: res.deletedIds,
            revoke_error: null,
          }),
        });
      } else {
        await sq(supa, `jc_members?id=eq.${p.member_id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({ status: 'error', revoke_error: res.errors.join(' | ').slice(0, 500) }),
        });
      }

      await notifyRevokeDone(slackCfg, {
        email: p.skool_email, nombre: nombre(p),
        locationId: p.ghl_location_id,
        usersDeleted: res.usersDeleted,
        locationAction: res.locationAction,
        by, ok: res.ok, error: res.errors.join(' | ') || undefined,
      });
    }

    return json({
      ok: res.ok, dry_run: dryRun,
      revocation_id: revId,
      email: p.skool_email,
      usuarios_encontrados: res.usersFound,
      usuarios_borrados: res.usersDeleted,
      emails_afectados: res.emails,
      fallidos: res.failedIds,
      location_paused: res.locationPaused,
      location_action: res.locationAction,
      errores: res.errors,
      // La confirmación real llega en la corrida siguiente del cron: el DELETE
      // de GHL se encola, no se aplica en el acto.
      nota: dryRun
        ? 'Simulación: no se tocó nada en GHL.'
        : 'El borrado en GHL es asíncrono. El cron de mañana lo verifica con filter-by-email.',
    });
  }

  return json({ ok: false, reason: 'accion_desconocida', action }, 400);
});

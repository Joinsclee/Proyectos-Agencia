// ============================================================================
//  ghl-provision · entrega el bono: crea la sub-cuenta de GHL de un miembro
// ============================================================================
//  Esta es la otra mitad del sistema, y la que hace posible la primera.
//  La revocación necesita saber QUÉ sub-cuenta pertenece a quién, y ese dato
//  solo se puede capturar con certeza en el momento del alta. Derivarlo
//  después por email es exactamente lo que rompe: el correo con el que
//  alguien entra a Skool no tiene por qué ser el mismo con el que se le creó
//  la cuenta de GHL, y GHL ya no permite actualizar el email de un usuario
//  por API.
//
//  Por eso: toda alta pasa por aquí, o se vincula a mano con ghl-revoke
//  action:"link". No hay tercera vía.
//
//  Contrato:
//
//    POST /functions/v1/ghl-provision
//    Headers: Authorization: Bearer <ANON_KEY>, x-admin-token: <ADMIN_TOKEN>
//
//    { "action": "provision", "member_id": 7, "dry_run": true }
//       → crea location (desde snapshot) + usuario admin, y guarda el mapeo
//
//    { "action": "provision_all", "limit": 5, "dry_run": true }
//       → aprovisiona a todos los activos sin cuenta, hasta `limit`
//
//  El aprovisionamiento masivo tiene tope duro: crear sub-cuentas de golpe
//  contra un scraping recién leído es la forma más fácil de generar basura.
// ============================================================================

import { createLocation, createUser, listUsersOfLocation, BONO_PERMISSIONS, type GhlConfig } from '../_shared/ghl.ts';
import { sq, type SupaConfig } from '../_shared/supa.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;

const supa: SupaConfig = { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY') };
const ghlCfg: GhlConfig = { pit: env('GHL_AGENCY_PIT'), companyId: env('GHL_COMPANY_ID') };

const ADMIN_TOKEN     = env('ADMIN_TOKEN');
const SNAPSHOT_ID     = env('GHL_SNAPSHOT_ID');
const DRY_RUN         = env('DRY_RUN', 'true') === 'true';
const MAX_PROVISION   = Number(env('MAX_PROVISION_PER_RUN', '5'));
const LOCATION_PREFIX = env('GHL_LOCATION_PREFIX', 'JC');

const CORS = {
  'Access-Control-Allow-Origin': env('ADMIN_ALLOWED_ORIGIN', '*'),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const H = { ...CORS, 'Content-Type': 'application/json' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b, null, 2), { status, headers: H });

function tokenOk(given: string | null): boolean {
  if (!ADMIN_TOKEN || !given) return false;
  const a = new TextEncoder().encode(ADMIN_TOKEN);
  const b = new TextEncoder().encode(given);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Contraseña inicial aleatoria. El miembro la cambia con "olvidé mi
 *  contraseña" en GHL; nunca se le manda por Slack ni se guarda en claro. */
function tempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
  return `Jc${b64.slice(0, 14)}!7`;
}

type Member = {
  id: number;
  skool_email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string | null;
  status: string;
  ghl_location_id: string | null;
};

type ProvisionResult = {
  member_id: number;
  email: string;
  ok: boolean;
  dry_run: boolean;
  ghl_location_id?: string;
  ghl_user_id?: string;
  temp_password_set?: boolean;
  step?: string;
  error?: string;
};

async function provisionOne(m: Member, dryRun: boolean): Promise<ProvisionResult> {
  const base: ProvisionResult = { member_id: m.id, email: m.skool_email, ok: false, dry_run: dryRun };

  if (m.ghl_location_id) {
    return { ...base, ok: true, ghl_location_id: m.ghl_location_id, step: 'ya_tenia_subcuenta' };
  }

  const first = (m.first_name ?? m.skool_email.split('@')[0]).slice(0, 40);
  const last  = (m.last_name ?? '').slice(0, 40);
  const label = `${LOCATION_PREFIX} · ${[first, last].filter(Boolean).join(' ')}`.slice(0, 60);

  if (dryRun) {
    return {
      ...base, ok: true, step: 'dry_run',
      error: `[simulación] Se crearía la sub-cuenta "${label}"` +
             (SNAPSHOT_ID ? ` desde el snapshot ${SNAPSHOT_ID}` : ' SIN snapshot (quedaría vacía)') +
             ` y un usuario admin con ${m.skool_email}.`,
    };
  }

  // 1) Sub-cuenta
  const loc = await createLocation(ghlCfg, {
    name: label,
    email: m.skool_email,
    snapshotId: SNAPSHOT_ID || undefined,
  });
  if (!loc.ok) {
    return { ...base, step: 'create_location', error: `HTTP ${loc.status} ${JSON.stringify(loc.body).slice(0, 400)}` };
  }
  const locationId = String(loc.body?.id ?? loc.body?._id ?? '');
  if (!locationId) {
    return { ...base, step: 'create_location', error: `La sub-cuenta se creó pero la respuesta no trae id: ${JSON.stringify(loc.body).slice(0, 300)}` };
  }

  // Guardar el locationId YA, antes de crear el usuario. Si el paso 2 falla,
  // al menos queda registrada la sub-cuenta huérfana y no se crea otra mañana.
  await sq(supa, `jc_members?id=eq.${m.id}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({
      ghl_location_id: locationId,
      ghl_snapshot_id: SNAPSHOT_ID || null,
      ghl_provisioned_at: new Date().toISOString(),
    }),
  });

  // 2) Usuario admin de esa sub-cuenta
  const usr = await createUser(ghlCfg, {
    email: m.skool_email,
    firstName: first || 'Miembro',
    lastName: last,
    password: tempPassword(),
    locationId,
    type: 'account',
    role: 'admin',
    permissions: BONO_PERMISSIONS,
  });

  if (!usr.ok) {
    return {
      ...base, ghl_location_id: locationId, step: 'create_user',
      error: `Sub-cuenta creada (${locationId}) pero el usuario falló: HTTP ${usr.status} ${JSON.stringify(usr.body).slice(0, 400)}`,
    };
  }

  const userId = String(usr.body?.id ?? (usr.body as any)?._id ?? '');

  await sq(supa, `jc_members?id=eq.${m.id}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({
      ghl_email: m.skool_email,
      ghl_user_ids: userId ? [userId] : [],
    }),
  });

  return { ...base, ok: true, ghl_location_id: locationId, ghl_user_id: userId, temp_password_set: true, step: 'listo' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  if (!ADMIN_TOKEN)             return json({ ok: false, reason: 'admin_token_no_configurado' }, 500);
  if (!tokenOk(req.headers.get('x-admin-token'))) return json({ ok: false, reason: 'unauthorized' }, 401);

  if (!ghlCfg.pit || !ghlCfg.companyId) {
    return json({ ok: false, reason: 'ghl_no_configurado', detail: 'Faltan GHL_AGENCY_PIT o GHL_COMPANY_ID.' }, 500);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* vacío */ }

  const action = String(body?.action ?? 'pendientes');
  const dryRun = body?.dry_run !== undefined ? Boolean(body.dry_run) : DRY_RUN;

  // ── pendientes: quién está activo y todavía no tiene su bono ──────────────
  if (action === 'pendientes') {
    const rows = await sq<Member[]>(
      supa,
      'jc_members?select=id,skool_email,first_name,last_name,tier,status,ghl_location_id' +
      '&status=eq.active&ghl_location_id=is.null&order=first_seen_at.asc',
    ).catch(() => [] as Member[]);
    return json({
      ok: true, pendientes: rows, total: rows.length,
      snapshot_configurado: Boolean(SNAPSHOT_ID),
      aviso: SNAPSHOT_ID ? undefined
        : 'GHL_SNAPSHOT_ID no está configurado: las sub-cuentas se crearían vacías, sin embudos ni workflows.',
    });
  }

  // ── provision: una sola persona ───────────────────────────────────────────
  if (action === 'provision') {
    const memberId = Number(body?.member_id);
    if (!memberId) return json({ ok: false, reason: 'falta_member_id' }, 400);

    const rows = await sq<Member[]>(
      supa, `jc_members?select=id,skool_email,first_name,last_name,tier,status,ghl_location_id&id=eq.${memberId}`,
    );
    const m = rows?.[0];
    if (!m) return json({ ok: false, reason: 'miembro_no_encontrado' }, 404);

    if (m.status !== 'active' && !body?.force) {
      return json({
        ok: false, reason: 'miembro_no_activo',
        detail: `Su estado es "${m.status}". Pasa force:true si aun así quieres darle la cuenta.`,
      }, 400);
    }

    const res = await provisionOne(m, dryRun);
    return json({ ok: res.ok, resultado: res });
  }

  // ── provision_all: por lotes, con tope duro ───────────────────────────────
  if (action === 'provision_all') {
    const limit = Math.min(Number(body?.limit ?? MAX_PROVISION), MAX_PROVISION);
    const rows = await sq<Member[]>(
      supa,
      'jc_members?select=id,skool_email,first_name,last_name,tier,status,ghl_location_id' +
      `&status=eq.active&ghl_location_id=is.null&order=first_seen_at.asc&limit=${limit}`,
    ).catch(() => [] as Member[]);

    const resultados: ProvisionResult[] = [];
    for (const m of rows) {
      resultados.push(await provisionOne(m, dryRun));
      await new Promise((r) => setTimeout(r, 500));   // holgura sobre el rate limit
    }

    return json({
      ok: resultados.every((r) => r.ok),
      dry_run: dryRun,
      procesados: resultados.length,
      tope: MAX_PROVISION,
      resultados,
    });
  }

  return json({ ok: false, reason: 'accion_desconocida', action }, 400);
});

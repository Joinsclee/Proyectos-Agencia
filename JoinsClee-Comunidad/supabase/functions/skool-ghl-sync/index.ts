// ============================================================================
//  skool-ghl-sync · el cron diario
// ============================================================================
//  Qué hace, en orden:
//
//    1. Barre las 4 pestañas de miembros de Skool (active, cancelling,
//       churned, banned).
//    2. Pasa los circuit breakers. Si alguno salta, ABORTA sin escribir nada
//       y avisa por Slack. Prefiere no hacer nada antes que hacer algo mal.
//    3. Actualiza jc_members con el estado de cada persona.
//    4. Encola en jc_revocations a quien ya perdió el acceso.
//    5. Manda UN mensaje a Slack con todo junto.
//
//  Lo que NO hace: revocar. La revocación la dispara una persona desde el
//  panel, que llama a ghl-revoke. Un fallo de scraping que se traduzca en un
//  borrado automático es irreversible; que se traduzca en una notificación
//  falsa, no.
//
//  (Si algún día se quiere borrado automático: AUTO_REVOKE=true lo habilita,
//   con tope de MAX_REVOKES_PER_RUN y solo para quien lleve 3 corridas
//   confirmando la baja. Viene apagado a propósito.)
//
//  Disparo manual:
//    curl -X POST $SUPABASE_URL/functions/v1/skool-ghl-sync \
//         -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//         -H "Content-Type: application/json" -d '{"dry_run":true}'
//
//    -d '{"diagnostic":true}'   → no escribe nada, devuelve un sample crudo
//                                 de Skool para verificar los campos.
//    -d '{"heartbeat":true}'    → manda el latido semanal.
// ============================================================================

import {
  fetchSnapshot, assertCanary, SkoolAbort,
  type SkoolMember, type SkoolConfig, type Snapshot, type Tab,
} from '../_shared/skool.ts';
import { revokeLocationAccess, findDeletedByEmail, type GhlConfig } from '../_shared/ghl.ts';
import {
  notifyRevocations, notifyAlert, notifyHeartbeat,
  type SlackConfig, type BajaLine,
} from '../_shared/slack.ts';
import { sq, selectAll, insertAlert, recentlyAlerted, type SupaConfig } from '../_shared/supa.ts';

// ── Configuración ───────────────────────────────────────────────────────────
const env = (k: string, d = '') => Deno.env.get(k) ?? d;

const supa: SupaConfig = {
  url: env('SUPABASE_URL'),
  serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
};
const skoolCfg: SkoolConfig = {
  authToken: env('SKOOL_AUTH_TOKEN'),
  clientId:  env('SKOOL_CLIENT_ID'),
  group:     env('SKOOL_GROUP'),
  delayMs:   Number(env('SKOOL_DELAY_MS', '300')),
};
const ghlCfg: GhlConfig = {
  pit:       env('GHL_AGENCY_PIT'),
  companyId: env('GHL_COMPANY_ID'),
};
const slackCfg: SlackConfig = {
  webhookUrl: env('SLACK_WEBHOOK_URL'),
  panelUrl:   env('ADMIN_PANEL_URL'),
};

/** Frenos de mano. Todos apagados hacia el lado seguro por defecto. */
const DRY_RUN            = env('DRY_RUN', 'true') === 'true';
const AUTO_REVOKE        = env('AUTO_REVOKE', 'false') === 'true';
const MAX_REVOKES        = Number(env('MAX_REVOKES_PER_RUN', '5'));
const MISSING_STRIKES    = Number(env('MISSING_STRIKES', '3'));
const MAX_ACTIVE_DROP    = Number(env('MAX_ACTIVE_DROP_PCT', '20'));  // %
const TRY_PAUSE          = env('TRY_PAUSE_LOCATION', 'false') === 'true';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── Tipos internos ──────────────────────────────────────────────────────────
type MemberRow = {
  id: number;
  skool_email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string | null;
  status: string;
  ghl_location_id: string | null;
  ghl_email: string | null;
  ghl_user_ids: string[];
  missing_streak: number;
  revoke_notified_at: string | null;
  revoked_at: string | null;
  is_lifetime: boolean;
};

const nombre = (m: { first_name?: string | null; last_name?: string | null; skool_email?: string }) =>
  [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || (m.skool_email ?? 'sin nombre');

// ============================================================================
//  Máquina de estados
// ============================================================================
//  Lo que decide el estado NO es en qué pestaña apareció sino los campos
//  afirmativos, porque una persona puede salir en dos pestañas a la vez.
//  Orden de precedencia: banned > churned > declined > cancelling > active.
//
//  Clave: `cancelling` NO revoca. Cancelar en Skool es reversible (existe
//  uncancelSubscription, y Skool te ofrece "¿mejor cambias de plan?" antes de
//  dejarte ir); y aunque no vuelva, sigue teniendo acceso hasta churn_at.
//  Solo `churned` y `banned` significan "ya no tiene acceso".
// ============================================================================
function resolveStatus(m: SkoolMember): string {
  if (m.tab === 'banned' || m.banned_at) return 'banned';
  if (m.tab === 'churned' || m.churned_at) return 'churned';
  if (m.billing_declined) return 'declined';
  if (m.billing_canceled || m.tab === 'cancelling') return 'cancelling';
  return 'active';
}

const PRECEDENCE: Record<string, number> = {
  active: 0, cancelling: 1, declined: 2, churned: 3, banned: 4,
};

/** Colapsa las apariciones de una persona en varias pestañas en un solo
 *  registro, quedándose con el estado más avanzado y con la mejor fecha. */
function collapse(snap: Snapshot): Map<string, SkoolMember & { status: string }> {
  const out = new Map<string, SkoolMember & { status: string }>();
  for (const tab of Object.keys(snap.byTab) as Tab[]) {
    for (const m of snap.byTab[tab]) {
      const status = resolveStatus(m);
      const prev = out.get(m.email);
      if (!prev || PRECEDENCE[status] > PRECEDENCE[prev.status]) {
        out.set(m.email, { ...m, status });
      } else if (prev) {
        // Mismo nivel: completa los huecos con lo que traiga la otra pestaña.
        prev.churn_at       ??= m.churn_at;
        prev.churned_at     ??= m.churned_at;
        prev.final_retry_at ??= m.final_retry_at;
        prev.banned_at      ??= m.banned_at;
        prev.tier           ??= m.tier;
      }
    }
  }
  return out;
}

// ============================================================================
//  Circuit breakers · lo único que impide un borrado masivo por un fallo tonto
// ============================================================================
async function assertNoAnomalousDrop(snap: Snapshot): Promise<void> {
  const activos = snap.counts.active ?? 0;

  // Referencia: la última corrida que terminó bien y no abortó.
  const prev = await sq<any[]>(
    supa,
    'jc_sync_runs?select=active_count&ok=eq.true&aborted=eq.false&active_count=not.is.null&order=started_at.desc&limit=1',
  ).catch(() => [] as any[]);

  const before = prev?.[0]?.active_count;
  if (typeof before !== 'number' || before === 0) return;   // primera corrida: nada que comparar

  const dropPct = ((before - activos) / before) * 100;
  if (dropPct > MAX_ACTIVE_DROP) {
    throw new SkoolAbort(
      'anomalous_drop',
      `Los miembros activos cayeron de ${before} a ${activos} (−${dropPct.toFixed(1)}%), por encima del umbral del ${MAX_ACTIVE_DROP}%. ` +
      `Una caída así casi siempre es un fallo de scraping, no una fuga real de gente. No se tocó nada; hay que revisarlo a mano.`,
    );
  }
}

// ============================================================================
//  Handler
// ============================================================================
Deno.serve(async (req) => {
  const t0 = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* cron manda vacío */ }

  const dryRun     = body?.dry_run !== undefined ? Boolean(body.dry_run) : DRY_RUN;
  const diagnostic = Boolean(body?.diagnostic);

  // ── Config mínima ─────────────────────────────────────────────────────────
  const missing = (['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SKOOL_AUTH_TOKEN', 'SKOOL_CLIENT_ID', 'SKOOL_GROUP'] as const)
    .filter((k) => !env(k));
  if (missing.length) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'server_misconfigured', missing }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  // ── Latido semanal ────────────────────────────────────────────────────────
  if (body?.heartbeat) {
    const h = await sq<any[]>(supa, 'jc_health?select=*').catch(() => []);
    const row = h?.[0] ?? {};
    await notifyHeartbeat(slackCfg, {
      activos: row.activos ?? 0,
      cancelando: row.cancelando ?? 0,
      sinCuenta: row.sin_cuenta_ghl ?? 0,
      pendientes: row.revocaciones_pendientes ?? 0,
    });
    return new Response(JSON.stringify({ ok: true, heartbeat: true, health: row }), { headers: JSON_HEADERS });
  }

  // ── Abrir la corrida ──────────────────────────────────────────────────────
  let runId: number | null = null;
  if (!diagnostic) {
    try {
      const r = await sq<any[]>(supa, 'jc_sync_runs', {
        method: 'POST', prefer: 'return=representation',
        body: JSON.stringify({ dry_run: dryRun }),
      });
      runId = r?.[0]?.id ?? null;
    } catch (e) { console.warn('no se pudo abrir jc_sync_runs:', e); }
  }

  const closeRun = async (patch: Record<string, unknown>) => {
    if (!runId) return;
    try {
      await sq(supa, `jc_sync_runs?id=eq.${runId}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, ...patch }),
      });
    } catch (e) { console.warn('no se pudo cerrar jc_sync_runs:', e); }
  };

  const abort = async (kind: string, message: string, detail?: unknown) => {
    console.error(`ABORT [${kind}]`, message);
    await closeRun({ ok: false, aborted: true, abort_reason: `${kind}: ${message}` });
    const already = await recentlyAlerted(supa, kind, 24);
    await insertAlert(supa, { kind, message, severity: 'error', payload: detail ?? null, notified: !already });
    if (!already) {
      await notifyAlert(slackCfg, {
        kind, message, severity: 'error',
        detail: detail ? JSON.stringify(detail).slice(0, 1200) : undefined,
      });
    }
    return new Response(
      JSON.stringify({ ok: false, aborted: true, reason: kind, message }),
      { status: 200, headers: JSON_HEADERS },
    );
  };

  // ── 1) Barrer Skool ───────────────────────────────────────────────────────
  let snap: Snapshot;
  try {
    snap = await fetchSnapshot(skoolCfg);
    assertCanary(snap);
  } catch (e) {
    if (e instanceof SkoolAbort) return await abort(e.reason, e.message);
    return await abort('skool_unknown', e instanceof Error ? e.message : String(e));
  }

  // ── Modo diagnóstico: mirar sin tocar ─────────────────────────────────────
  if (diagnostic) {
    const collapsed = collapse(snap);
    const porEstado: Record<string, number> = {};
    for (const m of collapsed.values()) porEstado[m.status] = (porEstado[m.status] ?? 0) + 1;
    return new Response(JSON.stringify({
      ok: true, diagnostic: true,
      build_id: snap.buildId,
      counts: snap.counts,
      expected: snap.expected,
      por_estado: porEstado,
      distinct_tiers: [...new Set([...collapsed.values()].map((m) => m.tier))],
      sample_emails: [...collapsed.keys()].slice(0, 5),
      sample_member: [...collapsed.values()].slice(0, 2),
      raw_sample_keys: Object.fromEntries(
        Object.entries(snap.samples).map(([t, v]) => [t, {
          keys: v && typeof v === 'object' ? Object.keys(v) : null,
          member_keys: (v as any)?.member ? Object.keys((v as any).member) : null,
          metadata_keys: (v as any)?.member?.metadata ? Object.keys((v as any).member.metadata) : null,
        }]),
      ),
    }, null, 2), { headers: JSON_HEADERS });
  }

  // ── 2) Circuit breaker de caída anómala ───────────────────────────────────
  try {
    await assertNoAnomalousDrop(snap);
  } catch (e) {
    if (e instanceof SkoolAbort) return await abort(e.reason, e.message, snap.counts);
    throw e;
  }

  // ── 3) Reconciliar contra jc_members ──────────────────────────────────────
  const skoolNow = collapse(snap);
  const existing = await selectAll<MemberRow>(
    supa,
    'jc_members?select=id,skool_email,first_name,last_name,tier,status,ghl_location_id,ghl_email,ghl_user_ids,missing_streak,revoke_notified_at,revoked_at,is_lifetime',
  );
  const byEmail = new Map(existing.map((r) => [r.skool_email.toLowerCase(), r]));
  const nowIso = new Date().toISOString();

  let nuevos = 0, cambios = 0;
  const upserts: any[] = [];

  for (const [email, m] of skoolNow) {
    const prev = byEmail.get(email);
    if (!prev) nuevos++;
    else if (prev.status !== m.status && prev.status !== 'revoked') cambios++;

    upserts.push({
      skool_email: email,
      skool_user_id: m.skool_user_id ?? null,
      first_name: m.first_name ?? null,
      last_name: m.last_name ?? null,
      tier: m.tier,
      recurring_interval: m.recurring_interval,
      is_lifetime: m.is_lifetime,
      is_free_trial: m.is_free_trial,
      // Un miembro ya revocado que reaparece activo vuelve a 'active': el
      // sistema soporta que alguien se vaya y regrese.
      status: m.status,
      billing_canceled: m.billing_canceled,
      billing_declined: m.billing_declined,
      churn_at: m.churn_at,
      final_retry_at: m.final_retry_at,
      churned_at: m.churned_at,
      banned_at: m.banned_at,
      missing_streak: 0,          // apareció → se reinicia la racha
      last_seen_at: nowIso,
    });
  }

  // Upsert en lotes por email (índice único sobre skool_email).
  for (let i = 0; i < upserts.length; i += 500) {
    await sq(supa, 'jc_members?on_conflict=skool_email', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify(upserts.slice(i, i + 500)),
    });
  }

  // A quien ya se le revocó el acceso, Skool lo sigue mostrando en `churned`
  // para siempre. Sin esto, el upsert de arriba lo devolvería a 'churned' cada
  // día y aparecería en el panel como si estuviera sin resolver.
  // (Si vuelve como 'active', se queda 'active': el sistema soporta que
  //  alguien se vaya y regrese.)
  await sq(supa, 'jc_members?revoked_at=not.is.null&status=in.(churned,banned,missing)', {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({ status: 'revoked' }),
  }).catch((e) => console.warn('no se pudo restaurar el estado revoked:', e));

  // ── 4) Los que NO aparecieron en ninguna pestaña ──────────────────────────
  //  Puede ser una baja que Skool ya purgó de todas las listas, o un fallo de
  //  scraping. Se aplica la regla de las 3 rachas: solo tras N corridas
  //  consecutivas sin verlo se considera una baja real.
  const desaparecidos = existing.filter(
    (r) => !skoolNow.has(r.skool_email.toLowerCase()) && r.status !== 'revoked',
  );

  for (const r of desaparecidos) {
    const streak = (r.missing_streak ?? 0) + 1;
    await sq(supa, `jc_members?id=eq.${r.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({
        missing_streak: streak,
        status: streak >= MISSING_STRIKES ? 'missing' : r.status,
      }),
    });
    r.missing_streak = streak;
    if (streak >= MISSING_STRIKES) r.status = 'missing';
  }

  // ── 5) Encolar revocaciones ───────────────────────────────────────────────
  const paraRevocar = await selectAll<MemberRow>(
    supa,
    'jc_members?select=id,skool_email,first_name,last_name,tier,status,ghl_location_id,ghl_email,ghl_user_ids,missing_streak,revoke_notified_at,revoked_at,is_lifetime' +
    '&status=in.(churned,banned,missing)&revoked_at=is.null',
  );

  const yaEnCola = new Set(
    (await sq<any[]>(supa, 'jc_revocations?select=member_id&status=in.(pending,approved)').catch(() => []))
      .map((r: any) => r.member_id),
  );

  let encoladas = 0;
  const nuevasRevocaciones: MemberRow[] = [];

  for (const m of paraRevocar) {
    if (yaEnCola.has(m.id)) continue;
    // Un miembro lifetime no churnea por facturación: si aparece aquí es más
    // probable que sea un artefacto del scraping que una baja real.
    if (m.is_lifetime && m.status === 'missing') continue;

    const reason = m.status === 'missing' ? `missing_${m.missing_streak}x` : m.status;
    try {
      await sq(supa, 'jc_revocations', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({
          member_id: m.id,
          reason,
          status: 'pending',
          ghl_location_id: m.ghl_location_id,
          ghl_user_ids: m.ghl_user_ids ?? [],
        }),
      });
      encoladas++;
      nuevasRevocaciones.push(m);
    } catch (e) {
      // El índice único de "una sola revocación abierta por miembro" puede
      // rechazar duplicados en carreras. No es un error.
      console.log(`revocación ya existente para ${m.skool_email}:`, String(e).slice(0, 120));
    }
  }

  // ── 6) Revocación automática (apagada por defecto) ────────────────────────
  let ejecutadas = 0;
  if (AUTO_REVOKE && !dryRun && ghlCfg.pit) {
    const pendientes = await sq<any[]>(
      supa, 'jc_pending_revocations?select=*&status=eq.pending&order=detected_at.asc',
    ).catch(() => []);

    if (pendientes.length > MAX_REVOKES) {
      await insertAlert(supa, {
        kind: 'too_many_revokes',
        message: `${pendientes.length} revocaciones pendientes superan el tope de ${MAX_REVOKES}. No se ejecutó ninguna automáticamente.`,
        severity: 'warn', notified: true,
      });
      await notifyAlert(slackCfg, {
        kind: 'too_many_revokes', severity: 'warn',
        message: `Hay ${pendientes.length} revocaciones pendientes y el tope automático es ${MAX_REVOKES}. Ninguna se ejecutó: revísalas en el panel.`,
      });
    } else {
      for (const p of pendientes) {
        if (!p.ghl_location_id) continue;
        const res = await revokeLocationAccess(ghlCfg, p.ghl_location_id, {
          dryRun: false, tryPause: TRY_PAUSE, knownUserIds: p.ghl_user_ids ?? [],
        });
        await sq(supa, `jc_revocations?id=eq.${p.revocation_id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({
            status: res.ok ? 'done' : 'failed',
            executed_at: new Date().toISOString(),
            approved_by: 'auto',
            users_deleted: res.usersDeleted,
            location_paused: res.locationPaused,
            location_action: res.locationAction,
            error: res.errors.join(' | ') || null,
            detail: res,
          }),
        });
        if (res.ok) {
          await sq(supa, `jc_members?id=eq.${p.member_id}`, {
            method: 'PATCH', prefer: 'return=minimal',
            body: JSON.stringify({ status: 'revoked', revoked_at: new Date().toISOString() }),
          });
          ejecutadas++;
        }
      }
    }
  }

  // ── 7) Verificación diferida de borrados de la corrida anterior ───────────
  //  El DELETE de GHL es asíncrono: solo tiene sentido comprobarlo al día
  //  siguiente. Si un usuario sigue vivo tras dos corridas, es señal roja.
  if (ghlCfg.pit && ghlCfg.companyId) {
    try {
      const porVerificar = await sq<any[]>(
        supa,
        'jc_members?select=id,skool_email,ghl_email&status=eq.revoked&revoked_at=not.is.null&revoke_verified_at=is.null&limit=20',
      ).catch(() => []);
      const emails = porVerificar.map((m: any) => m.ghl_email || m.skool_email).filter(Boolean);
      if (emails.length) {
        const res = await findDeletedByEmail(ghlCfg, emails);
        if (res.ok) {
          const borrados = new Set(
            (res.body?.users ?? []).filter((u: any) => u.deleted).map((u: any) => String(u.email ?? '').toLowerCase()),
          );
          for (const m of porVerificar) {
            const e = String(m.ghl_email || m.skool_email).toLowerCase();
            if (borrados.has(e)) {
              await sq(supa, `jc_members?id=eq.${m.id}`, {
                method: 'PATCH', prefer: 'return=minimal',
                body: JSON.stringify({ revoke_verified_at: new Date().toISOString() }),
              });
            }
          }
        }
      }
    } catch (e) { console.warn('verificación diferida falló:', e); }
  }

  // ── 8) Notificar a Slack: un solo mensaje ─────────────────────────────────
  const pendientesAhora = await sq<any[]>(
    supa, 'jc_pending_revocations?select=*&order=detected_at.asc',
  ).catch(() => []);

  const sinNotificar = pendientesAhora.filter((p: any) => !p.notified_at);

  const revocarLines: BajaLine[] = sinNotificar.map((p: any) => ({
    nombre: nombre(p),
    email: p.skool_email,
    tier: p.tier,
    motivo: {
      churned: 'Se dio de baja en Skool',
      banned:  'Expulsado de la comunidad',
    }[p.reason as string] ?? `Desapareció de Skool en ${p.missing_streak} barridos seguidos`,
    locationId: p.ghl_location_id,
  }));

  // Solo lo NUEVO. Alguien puede pasar un mes entero en `cancelling`: avisar
  // de él todos los días convierte el canal en ruido y deja de leerse.
  const cancelandoRows = [...skoolNow.values()].filter((m) => {
    if (m.status !== 'cancelling' && m.status !== 'declined') return false;
    const prev = byEmail.get(m.email);
    return !prev || (prev.status !== 'cancelling' && prev.status !== 'declined');
  });
  const cancelandoLines: BajaLine[] = cancelandoRows.map((m) => ({
    nombre: nombre({ first_name: m.first_name, last_name: m.last_name, skool_email: m.email }),
    email: m.email,
    tier: m.tier,
    motivo: m.status === 'declined'
      ? `Pago rechazado${m.final_retry_at ? ` · último reintento ${m.final_retry_at.slice(0, 10)}` : ''}`
      : `Canceló · conserva el acceso hasta ${m.churn_at ? m.churn_at.slice(0, 10) : 'fin del ciclo'}`,
    locationId: null,
  }));

  // Igual con los que no tienen cuenta de GHL: la lista completa vive en el
  // panel. Aquí solo se avisa de los que llegaron hoy, o de los rezagados una
  // vez por semana (lunes) para que no se olviden del todo.
  const esLunes = new Date().getUTCDay() === 1;
  const sinCuenta = (nuevos > 0 || esLunes)
    ? await sq<any[]>(
        supa,
        'jc_members?select=skool_email,first_name,last_name,tier,first_seen_at' +
        '&status=eq.active&ghl_location_id=is.null&order=first_seen_at.desc&limit=50',
      ).catch(() => [])
    : [];
  const sinCuentaLines: BajaLine[] = sinCuenta.map((m: any) => ({
    nombre: nombre(m), email: m.skool_email, tier: m.tier, motivo: 'Falta darle su cuenta de GHL', locationId: null,
  }));

  const notificado = await notifyRevocations(slackCfg, {
    revocar: revocarLines,
    cancelando: cancelandoLines,
    sinCuenta: sinCuentaLines,
    dryRun,
    resumen: {
      activos: snap.counts.active ?? 0,
      cancelando: snap.counts.cancelling ?? 0,
      churned: snap.counts.churned ?? 0,
    },
  });

  if (notificado && sinNotificar.length) {
    const ids = sinNotificar.map((p: any) => p.revocation_id);
    await sq(supa, `jc_revocations?id=in.(${ids.join(',')})`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    }).catch((e) => console.warn('no se pudo marcar notified_at:', e));
  }

  // ── 9) Cerrar ─────────────────────────────────────────────────────────────
  await closeRun({
    ok: true, aborted: false,
    active_count: snap.counts.active ?? 0,
    cancelling_count: snap.counts.cancelling ?? 0,
    churned_count: snap.counts.churned ?? 0,
    banned_count: snap.counts.banned ?? 0,
    new_members: nuevos,
    state_changes: cambios,
    queued_revokes: encoladas,
    executed_revokes: ejecutadas,
    build_id: snap.buildId,
    detail: { counts: snap.counts, expected: snap.expected, desaparecidos: desaparecidos.length },
  });

  return new Response(JSON.stringify({
    ok: true,
    dry_run: dryRun,
    build_id: snap.buildId,
    counts: snap.counts,
    nuevos, cambios,
    desaparecidos: desaparecidos.length,
    revocaciones_encoladas: encoladas,
    revocaciones_ejecutadas: ejecutadas,
    pendientes_total: pendientesAhora.length,
    slack_notificado: notificado,
    duration_ms: Date.now() - t0,
  }, null, 2), { headers: JSON_HEADERS });
});

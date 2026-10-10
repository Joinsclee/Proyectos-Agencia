// ============================================================================
//  GoHighLevel · cliente de la API v2 (LeadConnector)
// ============================================================================
//  Lo que este módulo asume, y por qué:
//
//  · La unidad de revocación es el USUARIO, no la sub-cuenta.
//    DELETE /users/{id} está documentado sin contradicciones y funciona con un
//    Private Integration Token de AGENCIA. DELETE /locations/{id}, en cambio,
//    exige en el OpenAPI un scope `locations.internal-access-only` que ni
//    siquiera aparece en el selector de scopes — el nombre sugiere que está
//    reservado a HighLevel. Hasta que el smoke test T5 diga lo contrario,
//    borrar una sub-cuenta es una operación humana.
//
//    Borrar los usuarios corta el login igual, es reversible (si el miembro
//    vuelve, se recrea con POST /users/) y no destruye lo que construyó. Una
//    sub-cuenta sin usuarios queda inaccesible y, sin consumo, cuesta ~$0.
//
//  · Hay que borrar TODOS los usuarios de la location, no solo el que
//    aprovisionamos. Si al miembro se le dio rol admin de su propia
//    sub-cuenta, pudo haber creado usuarios adicionales: borrar solo el tuyo
//    no revoca nada.
//
//  · El DELETE es asíncrono ("queued"). No sirve verificar en el mismo
//    request; se confirma en la corrida siguiente con filter-by-email.
//
//  · GHL ya no permite actualizar el email de un usuario por API, así que
//    nunca resolvemos por email al revocar: la llave es el locationId
//    guardado al aprovisionar.
// ============================================================================

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export type GhlConfig = {
  /** Private Integration Token de AGENCIA (scopes users.write + locations.write) */
  pit: string;
  /** ID de la agencia. Obligatorio en /users/search: sin él responde 422. */
  companyId: string;
};

export type GhlResponse<T = any> = {
  ok: boolean;
  status: number;
  body: T;
  rateRemaining: string | null;
  dailyRemaining: string | null;
};

async function call<T = any>(
  cfg: GhlConfig, method: string, path: string,
  opts: { body?: unknown; extraHeaders?: Record<string, string> } = {},
): Promise<GhlResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.pit}`,
    Version: VERSION,
    Accept: 'application/json',
    ...(opts.extraHeaders ?? {}),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const r = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await r.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* deja el texto crudo */ }

  return {
    ok: r.ok,
    status: r.status,
    body,
    // Leer los límites en runtime es más fiable que asumirlos: la doc solo
    // documenta el conteo "por app de Marketplace", no por PIT.
    rateRemaining:  r.headers.get('X-RateLimit-Remaining'),
    dailyRemaining: r.headers.get('X-RateLimit-Daily-Remaining'),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Usuarios
// ────────────────────────────────────────────────────────────────────────────

export type GhlUser = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles?: { type?: string; role?: string; locationIds?: string[] };
  locationIds?: string[];
  deleted?: boolean;
};

/** Todos los usuarios de una sub-cuenta.
 *  GET /users/?locationId=… está DEPRECADO — se usa /users/search.
 *  companyId es obligatorio aquí aunque el token sea de location. */
export async function listUsersOfLocation(
  cfg: GhlConfig, locationId: string,
): Promise<GhlResponse<{ users?: GhlUser[]; count?: number }>> {
  const qs = new URLSearchParams({
    companyId: cfg.companyId,
    locationId,
    limit: '100',
  });
  return await call(cfg, 'GET', `/users/search?${qs}`);
}

/** Borra un usuario. El borrado se ENCOLA: la respuesta 200 significa
 *  "aceptado", no "hecho". Se verifica en la corrida siguiente. */
export async function deleteUser(cfg: GhlConfig, userId: string): Promise<GhlResponse> {
  return await call(cfg, 'DELETE', `/users/${encodeURIComponent(userId)}`);
}

/** HighLevel devuelve el campo con un typo: `succeded` (una sola "e") en el
 *  OpenAPI, `succeeded` en la web de docs. Aceptamos los dos. */
export function deleteSucceeded(res: GhlResponse): boolean {
  if (!res.ok) return false;
  const b: any = res.body;
  if (b == null) return true;                 // 200 sin cuerpo → lo damos por bueno
  if (b.succeded === true || b.succeeded === true) return true;
  if (b.succeded === false || b.succeeded === false) return false;
  return res.status >= 200 && res.status < 300;
}

/** Verificación diferida del borrado.
 *  OJO: este endpoint SOLO acepta Agency-Access. `emails` es un CSV string,
 *  no un array — pasarle un array devuelve resultados vacíos en silencio.
 *  Sin projection:"all" solo devuelve id y email. */
export async function findDeletedByEmail(
  cfg: GhlConfig, emails: string[],
): Promise<GhlResponse<{ users?: GhlUser[] }>> {
  return await call(cfg, 'POST', '/users/search/filter-by-email', {
    body: {
      companyId: cfg.companyId,
      emails: emails.join(','),
      deleted: true,
      projection: 'all',
    },
  });
}

export type CreateUserInput = {
  email: string;
  firstName: string;
  lastName?: string;
  password?: string;
  phone?: string;
  locationId: string;
  /** 'account' = usuario de sub-cuenta. NUNCA 'agency' para un miembro. */
  type?: 'account';
  role?: 'admin' | 'user';
  permissions?: Record<string, boolean>;
};

/** Permisos por defecto de una cuenta-bono: acceso al CRM y a los embudos,
 *  pero SIN nada que consuma saldo de la wallet (que paga la agencia) ni que
 *  permita revender. Ajustar en docs/permisos.md si el bono cambia. */
export const BONO_PERMISSIONS: Record<string, boolean> = {
  campaignsEnabled: false,
  campaignsReadOnly: true,
  contactsEnabled: true,
  workflowsEnabled: true,
  workflowsReadOnly: false,
  triggersEnabled: true,
  funnelsEnabled: true,
  websitesEnabled: true,
  opportunitiesEnabled: true,
  dashboardStatsEnabled: true,
  bulkRequestsEnabled: false,      // envíos masivos → consumo
  appointmentsEnabled: true,
  reviewsEnabled: true,
  onlineListingsEnabled: false,
  phoneCallEnabled: false,         // consumo Twilio
  conversationsEnabled: true,
  assignedDataOnly: false,
  adwordsReportingEnabled: false,
  membershipEnabled: true,
  facebookAdsReportingEnabled: false,
  attributionsReportingEnabled: false,
  settingsEnabled: true,
  tagsEnabled: true,
  leadValueEnabled: true,
  marketingEnabled: true,
  agentReportingEnabled: false,
  botService: false,
  socialPlanner: true,
  bloggingEnabled: true,
  invoiceEnabled: false,
  affiliateManagerEnabled: false,
  contentAiEnabled: false,         // consumo de créditos IA
  refundsEnabled: false,
  recordPaymentEnabled: false,
  cancelSubscriptionEnabled: false,
  paymentsEnabled: false,
  exportPaymentsEnabled: false,
};

export async function createUser(
  cfg: GhlConfig, input: CreateUserInput,
): Promise<GhlResponse<GhlUser>> {
  return await call(cfg, 'POST', '/users/', {
    body: {
      companyId: cfg.companyId,
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      email: input.email,
      password: input.password,
      phone: input.phone,
      type: input.type ?? 'account',
      role: input.role ?? 'admin',
      locationIds: [input.locationId],
      permissions: input.permissions ?? BONO_PERMISSIONS,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Sub-cuentas (locations)
// ────────────────────────────────────────────────────────────────────────────

export type CreateLocationInput = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;      // ISO-2
  postalCode?: string;
  timezone?: string;
  /** Snapshot con el que se pre-carga la sub-cuenta (embudos, workflows…) */
  snapshotId?: string;
};

export async function createLocation(
  cfg: GhlConfig, input: CreateLocationInput,
): Promise<GhlResponse<{ id?: string; _id?: string; name?: string }>> {
  return await call(cfg, 'POST', '/locations/', {
    body: {
      companyId: cfg.companyId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address ?? 'N/A',
      city: input.city ?? 'Medellin',
      state: input.state ?? 'Antioquia',
      country: input.country ?? 'CO',
      postalCode: input.postalCode ?? '050001',
      timezone: input.timezone ?? 'America/Bogota',
      ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
    },
  });
}

/** ⚠ Sin confirmar que funcione con PIT (ver smoke test T5).
 *  El OpenAPI exige `locations.internal-access-only`, un scope que no aparece
 *  en el selector. Solo se llama si ALLOW_LOCATION_DELETE=true, y aun así el
 *  fallo se trata como "queda para hacer a mano", nunca como error fatal. */
export async function deleteLocation(
  cfg: GhlConfig, locationId: string, deleteTwilio = false,
): Promise<GhlResponse> {
  return await call(
    cfg, 'DELETE',
    `/locations/${encodeURIComponent(locationId)}?deleteTwilioAccount=${deleteTwilio}`,
  );
}

/** ⚠ Best-effort (ver smoke test T4).
 *  El securityScheme de la SaaS API no menciona Private Integration Token, a
 *  diferencia del de locations que sí lo hace. Reportes de comunidad dicen que
 *  hacen falta los headers `channel` y `source`, que NO están en la spec — por
 *  eso el reintento. Si igual falla, se emite tarea manual y se sigue: el
 *  acceso ya quedó cortado al borrar los usuarios. */
export async function pauseLocation(
  cfg: GhlConfig, locationId: string, paused = true,
): Promise<GhlResponse> {
  const body = { paused, companyId: cfg.companyId };
  const first = await call(cfg, 'POST', `/saas/pause/${encodeURIComponent(locationId)}`, { body });
  if (first.status !== 401 && first.status !== 403) return first;

  return await call(cfg, 'POST', `/saas/pause/${encodeURIComponent(locationId)}`, {
    body,
    extraHeaders: { channel: 'OAUTH', source: 'INTEGRATION' },
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Revocación completa de una sub-cuenta
// ────────────────────────────────────────────────────────────────────────────

export type RevokeResult = {
  ok: boolean;
  usersFound: number;
  usersDeleted: number;
  deletedIds: string[];
  failedIds: { id: string; status: number; detail: string }[];
  locationPaused: boolean | null;   // null = no se intentó
  locationAction: string;
  emails: string[];
  errors: string[];
};

export async function revokeLocationAccess(
  cfg: GhlConfig,
  locationId: string,
  opts: { dryRun?: boolean; tryPause?: boolean; knownUserIds?: string[] } = {},
): Promise<RevokeResult> {
  const out: RevokeResult = {
    ok: false, usersFound: 0, usersDeleted: 0, deletedIds: [], failedIds: [],
    locationPaused: null, locationAction: '', emails: [], errors: [],
  };

  // 1) Enumerar TODOS los usuarios de la sub-cuenta, no solo el aprovisionado.
  const listed = await listUsersOfLocation(cfg, locationId);
  let userIds: string[] = [];

  if (listed.ok) {
    const users = listed.body?.users ?? [];
    userIds = users.map((u) => u.id).filter(Boolean);
    out.emails = users.map((u) => u.email ?? '').filter(Boolean);
  } else {
    out.errors.push(`No se pudieron listar usuarios de ${locationId}: HTTP ${listed.status} ${JSON.stringify(listed.body).slice(0, 200)}`);
  }

  // Unir con los que ya conocíamos, por si el listado falló o vino incompleto.
  for (const id of opts.knownUserIds ?? []) if (id && !userIds.includes(id)) userIds.push(id);
  out.usersFound = userIds.length;

  if (userIds.length === 0) {
    out.errors.push('No se encontró ningún usuario que borrar en esta sub-cuenta.');
    out.locationAction = `Revisar a mano la sub-cuenta ${locationId}: no devolvió usuarios.`;
    return out;
  }

  if (opts.dryRun) {
    out.ok = true;
    out.locationAction = `[DRY RUN] Se habrían borrado ${userIds.length} usuario(s) de ${locationId}.`;
    return out;
  }

  // 2) Borrar uno por uno, en serie. Un cron diario nunca se acerca al límite
  //    de 100 req/10s, y en serie los fallos son legibles.
  for (const id of userIds) {
    const res = await deleteUser(cfg, id);
    if (deleteSucceeded(res)) {
      out.usersDeleted++;
      out.deletedIds.push(id);
    } else {
      out.failedIds.push({ id, status: res.status, detail: JSON.stringify(res.body).slice(0, 300) });
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // 3) Pausar la sub-cuenta (best-effort). Que falle no invalida la revocación.
  if (opts.tryPause) {
    try {
      const p = await pauseLocation(cfg, locationId, true);
      out.locationPaused = p.ok;
      out.locationAction = p.ok
        ? `Sub-cuenta ${locationId} pausada por API.`
        : `No se pudo pausar por API (HTTP ${p.status}). Pausar o borrar a mano en el panel de agencia.`;
    } catch (e) {
      out.locationPaused = false;
      out.locationAction = `Error al pausar: ${e instanceof Error ? e.message : String(e)}. Hacerlo a mano.`;
    }
  } else {
    out.locationAction = `Acceso cortado. La sub-cuenta ${locationId} sigue existiendo: pausarla o borrarla a mano si se quiere liberar.`;
  }

  out.ok = out.usersDeleted > 0 && out.failedIds.length === 0;
  return out;
}

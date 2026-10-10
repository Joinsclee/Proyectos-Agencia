// Supabase Edge Function: skool-login · La Huerta LAB
//
// Login PASSWORDLESS basado en la membresía de la comunidad de Skool
// `la-huerta-lab`. Portado del `skool-login` de Universo Lina, pero con la
// regla de acceso reescrita: allí el grupo es gratuito y se abría por PLAN;
// aquí el grupo es DE PAGO (10 USD/mes con prueba) y la puerta la decide el
// NIVEL DE GAMIFICACIÓN de la comunidad, que es otra cosa distinta. El plan
// sigue siendo dato informativo y nada más: no esconde ninguna herramienta.
//
// La regla, entera (ver NIVEL_MINIMO más abajo):
//   acceso vigente a la comunidad  Y  nivel >= NIVEL_MINIMO
//   …o el correo está en allowed_emails, que se salta el nivel.
// Quien cumple las dos ve las 6 herramientas; no hay vistas parciales.
//
// Flujo:
//   1) El cliente (universo-huerta-lab.html, con la anon key) envía { email }.
//   2) Verificamos que ese correo tenga ACCESO VIGENTE en la comunidad:
//        0. allowed_emails  → puerta de atrás manual (admins, cortesías).
//        1. skool_members   → caché local que mantiene sync-skool-members.
//        2. live-fallback   → escaneo de la API interna de Skool.
//      y, si lo tiene, que además llegue al nivel mínimo.
//   3) Si pasa las dos, aseguramos el usuario de auth (idempotente), marcamos
//      profiles.is_skool_member y generamos un magic-link token.
//   4) Respondemos { ok:true, token_hash, email, first_name, plan }. El cliente
//      cierra con supabase.auth.verifyOtp({ type:'magiclink', token_hash }) y
//      entra sin contraseña y sin abrir ningún correo.
//
// Qué significa "acceso vigente" aquí (medido contra la API real, no supuesto):
//   · `user.member.churned` (ISO) y `user.member.bannedAt` ⇒ SIN acceso.
//   · `user.member.billingCanceled` / `billingDeclined` NO revocan nada: la
//     cancelación en Skool es reversible y la persona conserva el acceso que
//     ya pagó hasta `user.member.metadata.mbscpe`. Revocar ahí sería cobrarle
//     el mes y cerrarle la puerta el mismo día.
//   · Por eso el escaneo en vivo recorre las CUATRO pestañas (active,
//     cancelling, churned, banned) y decide por los campos del registro, nunca
//     por la pestaña en la que apareció: una misma persona sale en dos a la vez
//     (en la muestra de `t=active` había 4 con `billingCanceled` puesto).
//
// Contrato de respuestas (el HTML del universo ya sabe leer estos motivos):
//   200 { ok:true, token_hash, email, first_name, plan }
//   400 { ok:false, reason:'invalid_email' }
//   403 { ok:false, reason:'not_member' }
//   403 { ok:false, reason:'level_too_low', level, points_to_next }
//        ← ES MIEMBRO Y PAGA, solo le falta nivel. Va separado de
//        `not_member` a propósito: el HTML le enseña otra tarjeta («todavía
//        no, pero te falta poquito») con los números que vienen aquí, no
//        quemados. `points_to_next` puede ser null si Skool no lo trae, y
//        entonces el HTML omite esa frase en vez de decir «undefined».
//   405 { ok:false, reason:'method_not_allowed' }
//   500 { ok:false, reason:'server_misconfigured' }
//   500 { ok:false, reason:'server_error', ref }   ← `ref` es un id de
//        correlación para buscar en los logs; el detalle del error NO se
//        devuelve al navegador (traía URLs de Skool, códigos y trozos de HTML).
//   503 { ok:false, reason:'verification_unavailable' }
//
// Desplegar con --no-verify-jwt (se invoca desde el navegador con la anon key):
//   supabase functions deploy skool-login --no-verify-jwt --project-ref bevduxusxfwmgtudytax
// OJO: `chat-huerta` es lo contrario — esa va con verificación de JWT normal
// porque la llama un usuario con sesión. No unifiques los dos comandos.
//
// Secrets requeridos (los mismos que sync-skool-members; ninguno se escribe
// en el repo, van con `supabase secrets set`):
//   SKOOL_AUTH_TOKEN           cookie auth_token del admin de Skool
//   SKOOL_CLIENT_ID            cookie client_id del admin de Skool
//   SKOOL_GROUP                slug del grupo (default: la-huerta-lab)
//   SUPABASE_URL               (auto-inyectado)
//   SUPABASE_SERVICE_ROLE_KEY  (auto-inyectado; NUNCA sale del servidor)
//
// Tablas que espera (todas con RLS activa y SIN policies ⇒ solo service_role):
//   skool_members(email pk, first_name, last_name, role, status, plan_raw,
//                 approved_at, churned_at, banned_at, access_until,
//                 billing_canceled, billing_declined,
//                 level, points, points_to_next,
//                 skool_user_id, member_id, synced_at)
//     Las tres columnas de gamificación son NUEVAS (migración de nivel). Si
//     todavía no están, esta función NO se cae: detecta el error de columna
//     inexistente, se degrada a las columnas viejas y lo grita en los logs —
//     pero entonces la caché nunca guarda el nivel y CADA login paga un
//     escaneo en vivo de Skool con las cookies de admin. Es un modo de
//     supervivencia para desplegar en cualquier orden, no un estado normal.
//   allowed_emails(email pk, first_name, note, created_at)
//   profiles(user_id pk, email, is_skool_member, skool_synced_at, updated_at)
// Si alguna todavía no existe, el login NO se cae: la consulta se registra en
// los logs y se degrada (caché ausente ⇒ escaneo en vivo; profiles ausente ⇒
// se salta el marcado, que no es bloqueante).

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SKOOL_AUTH_TOKEN = Deno.env.get('SKOOL_AUTH_TOKEN') ?? '';
const SKOOL_CLIENT_ID  = Deno.env.get('SKOOL_CLIENT_ID') ?? '';
// El default es el grupo de La Huerta LAB a propósito: si el secret faltara y
// aquí quedara el slug de otra clienta, esta función escanearía la comunidad
// equivocada con estas cookies y repartiría acceso a la gente equivocada, en
// silencio y sin un solo error en los logs.
const SKOOL_GROUP      = Deno.env.get('SKOOL_GROUP') ?? 'la-huerta-lab';

// ============================================================
//  EL AJUSTE QUE MÁS GENTE DEJA FUERA
// ============================================================
// Nivel mínimo de gamificación de Skool para entrar al universo.
//
// MEDIDO hoy sobre los 575 miembros con acceso vigente de la comunidad real:
//   nivel 1 → 455 (79,1 %)   nivel 2 → 56    nivel 3 → 30    nivel 4 → 14
//   nivel 5 →  14            nivel 6 →  5    nivel 7 →  1
// O sea: con el umbral en 2 entran 120 personas (20,9 %) y se quedan fuera
// 455 (79,1 %), a las que les faltan exactamente 5 puntos. El cliente conoce
// ese número y quiere probarlo igual, para que el universo sea un premio por
// participar y no un extra del pago.
//
// Si mañana hay que abrir la puerta a todo el que pague, esto es UN número:
// ponlo en 1 y vuelve a desplegar. Por eso vive aquí arriba, solo, y no
// repartido por el código.
const NIVEL_MINIMO = 2;

const SKOOL_BASE = 'https://www.skool.com';

// Pestañas de la página de miembros. Un valor inválido en `t` NO da error:
// Skool cae a `active` en silencio, así que un typo aquí no falla, MIENTE.
type Pestana = 'active' | 'cancelling' | 'churned' | 'banned';

// Orden de escaneo deliberado: primero las dos pestañas que quitan el acceso.
// Son las baratas (98 churned = 4 páginas, 0 banned = 1) y son definitivas: si
// el correo sale ahí con `churned`/`bannedAt` puesto, cerramos sin recorrer las
// 20 páginas de activos. Y si no sale, seguimos con las que sí dan acceso.
const PESTANAS_SIN_ACCESO: Pestana[] = ['churned', 'banned'];
const PESTANAS_CON_ACCESO: Pestana[] = ['active', 'cancelling'];

const POR_PAGINA = 30;
// 40 páginas × 30 = 1200 personas por pestaña. Hoy la mayor es `active` con
// 571 (20 páginas), así que sobra holgura. El original traía 200 páginas, que
// no es una salvaguarda: es una forma de colgar la request del usuario.
const MAX_PAGINAS = 40;

// Memo negativo en memoria (por isolate, best-effort). Cada cache-miss dispara
// un escaneo con las cookies de admin, así que un bucle contra un correo que no
// es miembro es a la vez un enumerador de socios y una forma de que Skool banee
// la cuenta de admin. Esto NO sustituye a un rate limit de verdad, solo evita
// el martilleo obvio. 60 s es corto a propósito: quien acaba de entrar a la
// comunidad y reintenta no debe quedarse fuera por nuestra propia caché.
const NEGATIVO_TTL_MS = 60_000;
// Guarda el MOTIVO, no solo la marca de tiempo: desde que existe el nivel hay
// dos negativas distintas ('no eres miembro' y 'te falta nivel') y contestar
// la equivocada al reintento sería peor que no memorizar nada. Además, la
// negativa por nivel es la MÁS repetible de todas —hoy la reciben el 79 % de
// los miembros, gente que sí paga y que va a reintentar— así que sin memo
// cada uno de esos intentos dispararía un escaneo completo de Skool.
const negativos = new Map<string, { ts: number; resultado: Denegacion }>();

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
// UTILIDADES DE CORREO
// ============================================================

// Las tres consultas a Postgres (skool_members, allowed_emails, profiles) van
// con `eq.` sobre el correo ya normalizado, NUNCA con `ilike.`: en ILIKE los
// caracteres `%` y `_` son comodines, y un `{"email":"%@gmail.com"}` haría
// match con la fila de un admin en allowed_emails y contaminaría profiles
// entero. Es el agujero real que trae el original de Lina; no se porta.
function normalizarEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

// Validación de verdad, no un `includes('@')`. Es la misma regex que usa el
// formulario de universo-huerta-lab.html, para que cliente y servidor
// acepten y rechacen exactamente lo mismo.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function esEmailValido(email: string): boolean {
  return !!email && email.length <= 254 && RE_EMAIL.test(email);
}

// ============================================================
// HELPERS DE SKOOL
// (copiados a mano, no importados: cada edge function se despliega
//  aislada. Si corriges algo aquí, córrelo también en sync-skool-members.)
// ============================================================

function skoolCookieHeader(): string {
  return `auth_token=${SKOOL_AUTH_TOKEN}; client_id=${SKOOL_CLIENT_ID}`;
}

const UA_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// El endpoint de miembros vive en /_next/data/{buildId}/{group}/-/members.json
// y el buildId cambia con CADA deploy de Skool: no se puede hardcodear ni
// cachear entre invocaciones, hay que sacarlo del HTML cada vez.
async function fetchSkoolBuildId(): Promise<{ buildId: string; finalUrl: string; isLoginPage: boolean }> {
  const r = await fetch(`${SKOOL_BASE}/${SKOOL_GROUP}/-/members`, {
    headers: {
      Cookie: skoolCookieHeader(),
      'User-Agent': UA_CHROME,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`skool members page: ${r.status}`);
  const html = await r.text();
  const finalUrl = r.url;
  // Señal de "la cookie de admin se murió": Skool nos manda al login. Es lo que
  // convierte el fallo en un 503 reintentable en vez de negarle el acceso a una
  // persona que sí paga. Si quitas este chequeo, una cookie expirada le dice
  // `not_member` a toda la comunidad.
  const isLoginPage = /\/login\b/.test(finalUrl) || /sign[\s-]?in/i.test(html.slice(0, 5000));
  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error(`buildId no encontrado (finalUrl=${finalUrl})`);
  return { buildId: m[1], finalUrl, isLoginPage };
}

type MiembroSkool = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  skoolUserId: string | null;
  memberId: string | null;
  role: string | null;          // 'group-admin' | 'member'
  // Etiqueta legible que va a skool_members.status. Se deriva con las mismas
  // reglas que `derivarEstado` de sync-skool-members: si las dos funciones
  // escriben la misma fila, tienen que escribirla igual.
  estado: Pestana;
  approvedAt: string | null;    // user.member.approvedAt
  churnedAt: string | null;     // si viene, ya NO tiene acceso
  bannedAt: string | null;      // si viene, ya NO tiene acceso
  accessUntil: string | null;   // de metadata.mbscpe (unix s) → ISO
  billingCanceled: boolean;     // canceló, pero conserva acceso: NO revoca
  billingDeclined: boolean;     // cobro rechazado: se reintenta, tampoco revoca
  planRaw: string | null;       // metadata.mmbp crudo (JSON-string), informativo
  // Gamificación (user.metadata.spData). `nivel` es la SEGUNDA condición de
  // acceso, junto con tener la membresía vigente. Los otros dos son para el
  // mensaje de «te faltan N puntos» y para diagnóstico.
  nivel: number | null;
  puntos: number | null;
  puntosParaSiguiente: number | null;
};

// Convierte el `mbscpe` de Skool (unix EN SEGUNDOS) a ISO. Acepta también
// milisegundos por si Skool cambia de unidad, porque un número interpretado en
// la escala equivocada da un "fin de acceso" en 1970 o en el año 56000 — y en
// los dos casos la decisión de acceso saldría mal sin que nada falle.
function unixAIso(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function textoONull(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

// ¿Este campo de Skool está "puesto"?
//
// MEDIDO contra la API real (y documentado también en sync-skool-members):
// `billingCanceled` y `billingDeclined` NO llegan como booleano, llegan como
// CADENA ISO. Un `=== true` sobre ellos da false SIEMPRE — no falla, miente —
// y deja la señal de cancelación en blanco para toda la comunidad. Lo mismo
// vale para `churned`, que hoy es ISO pero podría llegar como booleano.
// Por eso la pregunta se hace por presencia y no por tipo.
function presente(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim();
  return s !== '' && s !== 'false' && s !== '0';
}

// Fecha de Skool → ISO, o null si no es una fecha.
function aIso(v: unknown): string | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Para `churned` y `bannedAt`: lo que importa es que ESTÉN, no su formato.
// Si el valor está puesto pero no es una fecha legible (un booleano, un
// formato nuevo), devolvemos la fecha de DETECCIÓN en vez de null. Quedarnos
// en null sería peor que impreciso: la columna se escribiría vacía y tanto
// `skool_member_has_access` como la caché de aquí leerían "sigue teniendo
// acceso" de alguien que ya no lo tiene. Es la misma regla de
// sync-skool-members, a propósito.
function isoOMarcaDeDeteccion(v: unknown): string | null {
  if (!presente(v)) return null;
  return aIso(v) ?? new Date().toISOString();
}

// Misma tabla de verdad que `derivarEstado` en sync-skool-members. Cancelar es
// reversible y ya está pagado hasta `access_until`: 'cancelling' CONSERVA el
// acceso. Solo 'churned' y 'banned' lo quitan.
function derivarEstado(x: { churnedFlag: boolean; bannedFlag: boolean; billingCanceled: boolean }): Pestana {
  if (x.bannedFlag) return 'banned';
  if (x.churnedFlag) return 'churned';
  if (x.billingCanceled) return 'cancelling';
  return 'active';
}

// ============================================================
//  DE DÓNDE SALE EL CORREO  (la función más fea del archivo, y con motivo)
// ============================================================
// MEDIDO contra la comunidad real, 575 miembros con acceso vigente:
//   · user.member.metadata.mbme .... 169 (29,4 %) — SOLO lo traen quienes
//     tienen suscripción de pago. El 70,6 % restante NO lo tiene.
//   · user.email ................... casi siempre ofuscado por Skool (llega
//     sin arroba), así que puede ir en segundo lugar sin peligro: lo tumba
//     `esEmailValido` solo.
//   · user.member.inviteEmail ......  15
//   · user.member.searchAnswer ..... 390 — cadena suelta que ES el correo. En
//     las 169 filas donde convive con `mbme` coincide carácter a carácter.
//   · user.member.metadata.survey .. JSON-string con la encuesta de entrada;
//     en esta comunidad la pregunta es «👉 ¿Cuál es tu email?» y viene
//     marcada con "type":"email".
//
// Con las cuatro fuentes + la encuesta se resuelve el correo del 99,8 %
// (574 de 575). El único que no lo expone por ninguna vía es el dueño del
// grupo (Iván, group-admin), que entra por `allowed_emails`.
//
// POR QUÉ IMPORTA TANTO: la versión anterior resolvía el correo con
// `meta?.mbme || u?.email` y nada más. Con eso, 2 de cada 3 personas que
// PAGAN no aparecían en ningún escaneo y recibían `not_member` — para
// siempre, sin un solo error en los logs. Esta función es fea porque el dato
// es feo; no la simplifiques sin volver a medir.
function primerEmailValido(candidatos: unknown[]): string {
  for (const c of candidatos) {
    if (typeof c !== 'string' && typeof c !== 'number') continue;
    const e = normalizarEmail(c);
    if (esEmailValido(e)) return e;
  }
  return '';
}

// Correo suelto dentro de una frase («mi correo es ana@x.com, gracias»).
// Solo se usa DENTRO de la encuesta: sobre el resto de campos exigimos que la
// cadena entera sea el correo, que es lo medido.
const RE_EMAIL_EN_TEXTO = /[^\s@,;<>()\[\]"']+@[^\s@,;<>()\[\]"']+\.[^\s@,;<>()\[\]"'.]{2,}/;

function emailDentroDeTexto(v: unknown): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const directo = normalizarEmail(v);
  if (esEmailValido(directo)) return directo;
  const m = String(v).match(RE_EMAIL_EN_TEXTO);
  const suelto = m ? normalizarEmail(m[0]) : '';
  return esEmailValido(suelto) ? suelto : '';
}

// Recorre el árbol de la encuesta buscando la respuesta cuya PREGUNTA está
// marcada como de tipo email. Se hace por recorrido y no por ruta fija porque
// la forma exacta del JSON de `survey` la elige Skool y ya cambió una vez; el
// tope de profundidad evita que un JSON raro nos cueste la request.
function buscarEmailEnEncuesta(nodo: unknown, prof: number, dentroDeEmail: boolean): string {
  if (prof > 6 || nodo === null || nodo === undefined) return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') {
    return dentroDeEmail ? emailDentroDeTexto(nodo) : '';
  }
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const e = buscarEmailEnEncuesta(hijo, prof + 1, dentroDeEmail);
      if (e) return e;
    }
    return '';
  }
  if (typeof nodo === 'object') {
    const o = nodo as Record<string, unknown>;
    const esDeEmail = dentroDeEmail
      || String(o.type ?? '').toLowerCase() === 'email'
      || String((o.question as any)?.type ?? '').toLowerCase() === 'email';
    for (const v of Object.values(o)) {
      const e = buscarEmailEnEncuesta(v, prof + 1, esDeEmail);
      if (e) return e;
    }
  }
  return '';
}

function emailDeEncuesta(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let arbol: unknown = null;
  try {
    arbol = JSON.parse(raw);
  } catch {
    arbol = null; // survey no era JSON válido: aún queda la regex de abajo
  }
  const porPregunta = buscarEmailEnEncuesta(arbol, 0, false);
  if (porPregunta) return porPregunta;
  // Último recurso, a sabiendas de que es tosco: la primera cosa con forma de
  // correo en la cadena cruda. Preferimos un correo de más (que luego tiene
  // que coincidir con el que escribió la persona en el formulario para servir
  // de algo) a dejar fuera a alguien que sí paga.
  return emailDentroDeTexto(raw);
}

// La cadena completa, en el orden de la medición. Recibe el usuario entero
// porque las fuentes cuelgan de tres sitios distintos (`user`, `user.member`
// y `user.member.metadata`) y pasarlos sueltos era justo lo que permitía
// olvidarse de uno.
function resolverEmail(u: any): string {
  const member = u?.member ?? {};
  const meta = member?.metadata ?? {};
  const directo = primerEmailValido([meta?.mbme, u?.email, member?.inviteEmail, member?.searchAnswer]);
  if (directo) return directo;
  return emailDeEncuesta(meta?.survey);
}

// ============================================================
//  NIVEL DE GAMIFICACIÓN
// ============================================================
// Viene en `user.metadata.spData`, que es un JSON-STRING:
//   {"pts":0,"lv":1,"pcl":0,"pnl":5,"role":2}
//     lv  → nivel (1..9)          pts → puntos totales
//     pcl → puntos del nivel      pnl → puntos que FALTAN para el siguiente
//
// OJO, es el error fácil de todo este archivo: `spData` cuelga de
// `user.metadata` (el PERFIL de la persona), NO de `user.member.metadata`
// (la MEMBRESÍA, que es de donde salen mbme/mbscpe/mmbp). Son dos objetos
// distintos; leer del equivocado devuelve `undefined` en silencio y deja a
// toda la comunidad sin nivel — o sea, fuera.
type Gamificacion = {
  nivel: number | null;               // spData.lv
  puntos: number | null;              // spData.pts
  puntosParaSiguiente: number | null; // spData.pnl
};

function numeroONull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
}

// Nunca revienta ni inventa: si falta o no parsea, los tres campos son null y
// quien decide qué hacer con eso es `verificarAcceso` (que NO abre la puerta
// a ciegas ni la cierra para siempre; ver allí).
function parseGamificacion(u: any): Gamificacion {
  const vacia: Gamificacion = { nivel: null, puntos: null, puntosParaSiguiente: null };
  const raw = u?.metadata?.spData;
  let d: any = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return vacia;
    try {
      d = JSON.parse(raw);
    } catch {
      console.warn('skool-login: spData no era JSON válido (¿cambió el formato?)');
      return vacia;
    }
  }
  if (!d || typeof d !== 'object') return vacia;
  return {
    nivel: numeroONull(d.lv),
    puntos: numeroONull(d.pts),
    puntosParaSiguiente: numeroONull(d.pnl),
  };
}

// Lee UN usuario de `pageProps.users`.
//
// Aquí está la trampa que más caro se paga al portar: los campos de MEMBRESÍA
// (correo, plan, fin de acceso, bajas) cuelgan de `user.member` y
// `user.member.metadata`; leerlos de `user.metadata` devuelve `undefined` en
// silencio. Y el NIVEL es justo al revés: vive en `user.metadata.spData`, en
// el perfil. Los dos objetos se llaman `metadata` y no son el mismo; cada
// campo de aquí abajo dice de cuál sale.
function parseMiembro(u: any): MiembroSkool | null {
  const member = u?.member ?? {};
  const meta = member?.metadata ?? {};

  // El correo sale de las cuatro fuentes + la encuesta: ver `resolverEmail`,
  // donde está la medición (el 70,6 % de la comunidad NO tiene `mbme`).
  const email = resolverEmail(u);
  if (!email) return null;

  const nombreCompleto = textoONull(u?.name) ?? textoONull(member?.name);
  const firstName =
    textoONull(u?.firstName) ?? textoONull(u?.first_name) ??
    (nombreCompleto ? nombreCompleto.split(/\s+/)[0] : null);
  const lastName =
    textoONull(u?.lastName) ?? textoONull(u?.last_name) ??
    (nombreCompleto ? (nombreCompleto.split(/\s+/).slice(1).join(' ') || null) : null);

  // Los dos campos que QUITAN el acceso. Se leen por presencia, no por tipo, y
  // se normalizan a ISO. `bannedAt` se busca primero en `member.metadata`, que
  // es donde lo lee sync-skool-members: si las dos funciones miran sitios
  // distintos, una deja entrar a quien la otra expulsa.
  const churnedRaw = member?.churned;
  const bannedRaw  = meta?.bannedAt ?? member?.bannedAt ?? member?.banned_at ?? u?.bannedAt;
  const churnedFlag = presente(churnedRaw);
  const bannedFlag  = presente(bannedRaw);

  // Ninguna de las dos revoca (cancelar es reversible; un cobro rechazado se
  // reintenta), pero se guardan separadas porque la caché las usa para saber
  // si `access_until` es un fin de acceso o una fecha de renovación.
  const billingCanceled = presente(member?.billingCanceled);
  const billingDeclined = presente(member?.billingDeclined);

  return {
    email,
    firstName,
    lastName,
    skoolUserId: textoONull(u?.id) ?? textoONull(member?.userId),
    memberId: textoONull(member?.id),
    role: textoONull(member?.role),
    estado: derivarEstado({ churnedFlag, bannedFlag, billingCanceled }),
    approvedAt: aIso(member?.approvedAt),
    churnedAt: isoOMarcaDeDeteccion(churnedRaw),
    bannedAt: isoOMarcaDeDeteccion(bannedRaw),
    accessUntil: unixAIso(meta?.mbscpe),
    billingCanceled,
    billingDeclined,
    planRaw: typeof meta?.mmbp === 'string' && meta.mmbp.trim() ? meta.mmbp.trim() : null,
    // De `u.metadata`, no de `member.metadata`: son objetos distintos.
    ...parseGamificacion(u),
  };
}

type PaginaMiembros = {
  miembros: MiembroSkool[];
  candidatos: number;
  totalPages?: number;
  totalPestana?: number;
};

async function fetchPaginaMiembros(buildId: string, pestana: Pestana, page: number): Promise<PaginaMiembros> {
  // Set MÍNIMO de parámetros: es el único verificado hoy contra la API real.
  // El original arrastra `monthly/annual/trials/free=false` heredados de un
  // grupo gratuito; en un grupo DE PAGO con prueba gratuita esos filtros
  // pueden dejar gente fuera del escaneo sin que nada falle.
  const params = new URLSearchParams({ group: SKOOL_GROUP, t: pestana, p: String(page) });
  const url = `${SKOOL_BASE}/_next/data/${buildId}/${SKOOL_GROUP}/-/members.json?${params}`;
  const r = await fetch(url, {
    headers: {
      Cookie: skoolCookieHeader(),
      'User-Agent': UA_CHROME,
      'Accept': 'application/json',
      'x-nextjs-data': '1',
      'Referer': `${SKOOL_BASE}/${SKOOL_GROUP}/-/members`,
    },
  });
  if (!r.ok) throw new Error(`skool members.json ${pestana} p${page}: ${r.status}`);
  const j = await r.json();

  const root = j?.pageProps ?? j;
  // Ruta real y verificada: pageProps.users. Dejamos pageProps.members como
  // respaldo con aviso; el recorrido recursivo del original ("deepCollect") no
  // se porta, porque aquí el correo NO viene como `user.email` sino ofuscado
  // en `user.member.metadata.mbme`: recorrer el árbol entero solo aportaba
  // coste y candidatos que no son miembros.
  let candidatos: any[] = Array.isArray(root?.users) ? root.users : [];
  if (candidatos.length === 0 && Array.isArray(root?.members)) {
    console.warn(`skool-login: pageProps.users vacío en ${pestana} p${page}, uso pageProps.members (¿cambió el esquema de Skool?)`);
    candidatos = root.members;
  }

  const miembros: MiembroSkool[] = [];
  for (const c of candidatos) {
    const m = parseMiembro(c);
    if (m) miembros.push(m);
  }

  // `totalPages` sí vive en pageProps. Los CUATRO conteos, en cambio, viven en
  // pageProps.renderData.* — leerlos de pageProps devuelve `undefined` en
  // silencio, y ese es exactamente el bug latente del original (su telemetría
  // "funciona" mintiendo). Aquí se lee del sitio correcto y se avisa si falta.
  const render = root?.renderData ?? {};
  const totalPages = typeof root?.totalPages === 'number' ? root.totalPages : undefined;
  const claveTotal = pestana === 'active' ? 'totalMembers'
    : pestana === 'cancelling' ? 'totalCancellingMembers'
    : pestana === 'churned' ? 'totalChurnedMembers'
    : 'totalBannedMembers';
  const totalPestana = typeof render?.[claveTotal] === 'number' ? render[claveTotal] : undefined;
  if (page === 1 && totalPestana === undefined) {
    console.warn(`skool-login: renderData.${claveTotal} ausente en ${pestana} (Skool movió los conteos)`);
  }

  return { miembros, candidatos: candidatos.length, totalPages, totalPestana };
}

// ¿Esta persona tiene acceso vigente, según los campos afirmativos del
// registro que acabamos de leer de Skool?
function tieneAccesoSkool(m: MiembroSkool): boolean {
  // Solo dos cosas cortan el acceso, y las dos son estados terminales.
  if (m.churnedAt) return false;
  if (m.bannedAt) return false;
  // `accessUntil` (mbscpe) NO se evalúa en el camino en vivo A PROPÓSITO: el
  // dato que tenemos delante lo acaba de clasificar Skool, y si el acceso ya
  // hubiera terminado la persona estaría en `churned`. Aplicarlo aquí solo
  // añadiría el riesgo de echar a quien renovó y todavía no vimos la fecha
  // nueva. Sí se guarda y sí se evalúa sobre la caché, que puede estar vieja.
  return true;
}

function planDesdeCrudo(planRaw: string | null): unknown {
  if (!planRaw) return null;
  try {
    return JSON.parse(planRaw);
  } catch {
    return null; // mmbp no era JSON válido: dato informativo, no rompe nada
  }
}

// ============================================================
// HELPERS DE SUPABASE (PostgREST con service_role)
// ============================================================

type FilaCache = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  status: string | null;
  plan_raw: string | null;
  churned_at: string | null;
  banned_at: string | null;
  access_until: string | null;
  billing_canceled: boolean | null;
  // Nuevas (migración de nivel). `undefined` = la columna no existe todavía;
  // `null` = existe pero esta fila la escribió un sync que aún no la llena.
  // Los dos casos significan lo mismo aquí: no sé el nivel, voy a Skool.
  level?: number | null;
  points?: number | null;
  points_to_next?: number | null;
};

const COLUMNAS_CACHE_BASE =
  'email,first_name,last_name,role,status,plan_raw,churned_at,banned_at,access_until,billing_canceled';
const COLUMNAS_CACHE_NIVEL = 'level,points,points_to_next';

// Se apaga sola la primera vez que PostgREST dice que esas columnas no
// existen, para que esta función se pueda desplegar ANTES que la migración
// sin devolver 500 a nadie. No es un estado normal: mientras esté apagada, la
// caché no puede guardar el nivel y cada login paga un escaneo en vivo.
let columnasDeNivelDisponibles = true;

// PostgREST tiene dos mensajes distintos para lo mismo: 42703 en el SELECT
// («column skool_members.level does not exist») y PGRST204 en el POST («Could
// not find the 'level' column ... in the schema cache»).
//
// El descarte de arriba no es cosmético: si lo que falta es la TABLA entera
// (42P01, «relation ... does not exist»), esto NO es un problema de columnas y
// apagar el flag solo escondería el fallo de verdad.
function esColumnaDesconocida(detalle: string): boolean {
  if (/42P01|relation .* does not exist/i.test(detalle)) return false;
  return /42703|PGRST204/.test(detalle)
    || /column .* does not exist/i.test(detalle)
    || /could not find the .* column/i.test(detalle);
}

async function supaSelectSkoolMember(email: string): Promise<FilaCache | null> {
  const columnas = columnasDeNivelDisponibles
    ? `${COLUMNAS_CACHE_BASE},${COLUMNAS_CACHE_NIVEL}`
    : COLUMNAS_CACHE_BASE;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/skool_members?select=${columnas}&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    if (columnasDeNivelDisponibles && esColumnaDesconocida(detalle)) {
      console.error(
        'skool-login: skool_members todavía no tiene level/points/points_to_next. ' +
        'Aplica la migración del nivel: hasta entonces CADA login dispara un escaneo ' +
        'completo de Skool con las cookies de admin.',
      );
      columnasDeNivelDisponibles = false;
      return await supaSelectSkoolMember(email);
    }
    throw new Error(`select skool_member: ${r.status} ${detalle}`);
  }
  const j: FilaCache[] = await r.json();
  return j[0] ?? null;
}

// La caché puede tener hasta la ventana del cron de retraso, así que sobre ella
// sí miramos la fecha de fin de acceso — pero SOLO cuando la persona canceló.
// En quien no ha cancelado, `mbscpe` es la fecha de renovación, y denegar por
// ahí sería echar a alguien que pagó ayer solo porque el cron no ha corrido.
//
// La condición tiene que ser LITERALMENTE la misma que la de
// `public.skool_member_has_access` en la migración (incluido mirar `status`
// además de `billing_canceled`): las dos deciden sobre la misma fila y si se
// separan, una policy de RLS acabará negándole el acceso a alguien que este
// login ya dejó entrar. Si cambia una, cambian las dos.
function accesoVigenteEnCache(f: FilaCache): boolean {
  if (f.churned_at) return false;
  if (f.banned_at) return false;
  const cancelo = f.billing_canceled === true || f.status === 'cancelling';
  if (cancelo && f.access_until) {
    const t = Date.parse(f.access_until);
    if (Number.isFinite(t) && t <= Date.now()) return false;
  }
  return true;
}

// Puerta de atrás manual: cortesías, comps y cualquier acceso que no dependa
// de Skool. En La Huerta LAB los 4 admins SÍ aparecen en la API (role =
// 'group-admin'), así que esta tabla ya no es imprescindible para ellos, pero
// se conserva porque es la única vía de dar acceso sin tocar la comunidad.
// El cron de sync NUNCA la toca: estos accesos son permanentes hasta que
// alguien borre la fila a mano. Y SE SALTA EL NIVEL a propósito: es la vía
// para el dueño del grupo (Iván, el único de los 575 que no expone correo por
// ninguna ruta) y para el admin de nivel 1 (Camilo), a los que el umbral
// dejaría fuera de su propia herramienta. Sigue sin columna de nivel: quien
// está aquí entra, punto.
async function supaSelectAllowedEmail(email: string): Promise<{ first_name: string | null } | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_emails?select=email,first_name&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: SUPA_HEADERS },
  );
  if (!r.ok) throw new Error(`select allowed_email: ${r.status} ${await r.text().catch(() => '')}`);
  const j: Array<{ email: string; first_name: string | null }> = await r.json();
  return j[0] ? { first_name: j[0].first_name ?? null } : null;
}

// Upsert defensivo cuando lo verificamos en vivo: dejamos la fila con el estado
// completo (incluido el motivo por el que alguien NO tiene acceso). Guardar el
// motivo importa: si solo borráramos la fila, la próxima vez no sabríamos si
// la persona se dio de baja o si simplemente nunca estuvo.
async function supaUpsertSkoolMember(m: MiembroSkool): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/skool_members?on_conflict=email`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    // El payload lleva TODAS las columnas de estado, no un subconjunto. En un
    // upsert de PostgREST las columnas ausentes no se tocan al actualizar y
    // caen al DEFAULT al insertar, así que omitir `status` dejaba a un dado de
    // baja escrito como `status='active'` (fila nueva) o con la etiqueta que
    // hubiera dejado el cron (fila vieja). Y `skool_member_has_access` lee
    // `status`, así que esa etiqueta desfasada decide accesos.
    body: JSON.stringify(filaUpsert(m)),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    // Mismo apaño que en el SELECT: si la migración del nivel todavía no está
    // aplicada, guardamos la fila SIN esas tres columnas en vez de perder el
    // refresco entero de la caché.
    if (columnasDeNivelDisponibles && esColumnaDesconocida(detalle)) {
      console.error('skool-login: upsert sin columnas de nivel (falta la migración):', detalle);
      columnasDeNivelDisponibles = false;
      return await supaUpsertSkoolMember(m);
    }
    throw new Error(`upsert skool_member: ${r.status} ${detalle}`);
  }
}

function filaUpsert(m: MiembroSkool): Record<string, unknown> {
  const fila: Record<string, unknown> = {
    email: m.email,
    first_name: m.firstName,
    last_name: m.lastName,
    skool_user_id: m.skoolUserId,
    member_id: m.memberId,
    role: m.role,
    status: m.estado,
    plan_raw: m.planRaw,
    approved_at: m.approvedAt,
    churned_at: m.churnedAt,
    banned_at: m.bannedAt,
    access_until: m.accessUntil,
    billing_canceled: m.billingCanceled,
    billing_declined: m.billingDeclined,
    synced_at: new Date().toISOString(),
  };
  // Guardar el nivel no es cosmético: es lo que evita que el siguiente login
  // de esta persona vuelva a escanear Skool entero para averiguarlo.
  if (columnasDeNivelDisponibles) {
    fila.level = m.nivel;
    fila.points = m.puntos;
    fila.points_to_next = m.puntosParaSiguiente;
  }
  return fila;
}

// Marca profiles.is_skool_member para que una recarga de página no tenga que
// volver a preguntarle a Skool. Sigue SIN escribir ningún `skool_level` en
// profiles: el nivel decide la ENTRADA y se comprueba aquí contra Skool (o
// contra skool_members, que es su espejo). Copiarlo también a profiles daría
// dos sitios donde vive la misma verdad, y el día que se desincronicen ganaría
// el equivocado.
async function supaMarkProfileMember(email: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({
      is_skool_member: true,
      skool_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  // Un PATCH que no toca ninguna fila devuelve 204, no un error: si el perfil
  // todavía no existe, esto es un no-op silencioso. Es aceptable —el marcado no
  // es bloqueante— pero conviene saberlo: solo un HTTP de error es un error.
  if (!r.ok) throw new Error(`mark profile member: ${r.status} ${await r.text().catch(() => '')}`);
}

// ============================================================
// HELPERS DE AUTH ADMIN
// ============================================================

// Idempotente: si el usuario ya existe, seguimos.
//
// `email_confirm: true` marca el correo como verificado sin que nadie abra
// nada. Es intencional (el sentido del login es que no haya que clicar), pero
// significa que la ÚNICA barrera es la verificación de membresía: quien conozca
// el correo de una socia entra como ella. En un grupo de pago eso es una
// decisión de negocio, no un detalle técnico.
async function ensureAuthUser(email: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SUPA_HEADERS,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (r.ok) return;
  if (r.status === 422) return; // ya existe
  const detail = await r.text().catch(() => '');
  if (/already.*(registered|exists)|email_exists|user_already_exists/i.test(detail)) return;
  throw new Error(`ensure auth user: ${r.status} ${detail}`);
}

// Genera el magic-link y extrae el hashed_token (top-level o dentro de
// properties, según la versión del API de auth). Ese hash es lo único que viaja
// al navegador: es de un solo uso, caduca con el OTP expiry del proyecto y no
// se loguea en ningún sitio.
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
// VERIFICACIÓN DE ACCESO (caché primero, escaneo en vivo después)
// ============================================================

type Resultado =
  | { estado: 'con_acceso'; firstName: string | null; plan: unknown }
  // Es miembro y paga; solo le falta nivel. Es una negativa DISTINTA de
  // `sin_acceso` y el HTML la trata distinto: a esta persona no se le dice
  // «no eres de la comunidad», se le dice cuánto le falta.
  | { estado: 'nivel_insuficiente'; nivel: number | null; puntosParaSiguiente: number | null }
  | { estado: 'sin_acceso' }
  | { estado: 'indeterminado' };

// Las dos negativas que el memo puede repetir durante 60 s.
type Denegacion = Extract<Resultado, { estado: 'sin_acceso' | 'nivel_insuficiente' }>;

// LA REGLA, en una línea. `null` (no sé el nivel) NUNCA cuenta como
// suficiente: quien no lo sepa que vaya a preguntárselo a Skool.
function nivelSuficiente(nivel: number | null | undefined): boolean {
  return typeof nivel === 'number' && nivel >= NIVEL_MINIMO;
}

// Recorre una pestaña buscando el correo, con salida temprana.
async function buscarEnPestana(buildId: string, pestana: Pestana, email: string): Promise<MiembroSkool | null> {
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { miembros, candidatos, totalPages } = await fetchPaginaMiembros(buildId, pestana, page);
    const hit = miembros.find((m) => m.email === email);
    if (hit) return hit;
    // El corte se calcula sobre CANDIDATOS, no sobre correos resueltos: si una
    // página trae 30 usuarios y 2 no dan correo, contar correos daría 28 y
    // cortaríamos la paginación ahí, perdiendo media comunidad sin un error.
    const hayMas = totalPages !== undefined ? page < totalPages : candidatos >= POR_PAGINA;
    if (!hayMas) break;
  }
  return null;
}

async function verificarAcceso(email: string): Promise<Resultado> {
  // 0) Accesos manuales. Van primero, no dependen de Skool y SE SALTAN EL
  //    NIVEL: es la puerta del dueño del grupo (que no expone correo) y de los
  //    admins a los que el umbral dejaría fuera de su propia herramienta. Si la
  //    tabla aún no existe o falla, lo registramos y seguimos: no es motivo
  //    para negar.
  try {
    const allowed = await supaSelectAllowedEmail(email);
    if (allowed) return { estado: 'con_acceso', firstName: allowed.first_name, plan: null };
  } catch (e) {
    console.error('skool-login: fallo consultando allowed_emails (sigo con Skool):', e);
  }

  // 1) Caché local. Si la consulta revienta (la tabla todavía no existe, o
  //    PostgREST aún no ve una columna nueva tras un deploy desordenado) NO
  //    devolvemos 500: lo tratamos como cache-miss y verificamos en vivo.
  try {
    const fila = await supaSelectSkoolMember(email);
    if (fila) {
      if (accesoVigenteEnCache(fila) && nivelSuficiente(fila.level)) {
        return { estado: 'con_acceso', firstName: fila.first_name, plan: planDesdeCrudo(fila.plan_raw) };
      }
      // La caché SOLO sirve para decir que sí. Para decir que no bajamos al
      // escaneo en vivo, que es la fuente de verdad:
      //   · si dice que no tiene acceso, la fila puede ser de hace horas y la
      //     persona pudo volver a suscribirse (y como la pestaña `churned` se
      //     recorre primero, confirmar una baja cuesta 4 requests);
      //   · si dice que le falta nivel, el nivel SUBE cada día que la persona
      //     participa, y negar con una fila vieja es echar de la puerta a
      //     alguien que acaba de ganarse la entrada — justo la peor persona a
      //     la que decírselo;
      //   · si la fila no trae nivel (columna recién creada, o sync que aún no
      //     la llena), no sabemos nada y hay que ir a mirar.
      // El memo negativo de más abajo evita que esto se convierta en un
      // escaneo por intento.
      console.info(
        `skool-login: la caché no alcanza para dar acceso ` +
        `(acceso=${accesoVigenteEnCache(fila)}, nivel=${fila.level ?? 'desconocido'}, mínimo=${NIVEL_MINIMO}); ` +
        `confirmo en vivo antes de negar`,
      );
    }
  } catch (e) {
    console.error('skool-login: caché no disponible, voy a verificación en vivo:', e);
  }

  // 1.5) Memo negativo: si hace nada CONFIRMAMOS EN VIVO una negativa para
  //      este correo —no es miembro, o es miembro y le falta nivel— la
  //      repetimos tal cual durante 60 s en vez de volver a escanear Skool.
  //      Protege a la cuenta de admin de que un bucle contra el endpoint acabe
  //      en un bloqueo por parte de Skool. Con el umbral en 2, la negativa por
  //      nivel la reciben hoy 455 de 575 miembros: son ellos, gente que paga y
  //      que reintenta, quienes más veces pasan por aquí.
  //
  //      Se consulta siempre, haya o no fila en caché. Antes solo se miraba
  //      cuando NO había fila, y como el memo únicamente se escribe después de
  //      un escaneo en vivo, eso dejaba fuera el caso más repetible de todos:
  //      quien se dio de baja y sigue intentando entrar tiene fila en caché,
  //      así que cada intento suyo disparaba un escaneo nuevo con las cookies
  //      de admin, para siempre. No se pierde ninguna garantía: la primera
  //      negativa de cada ventana la sigue dando el escaneo en vivo, nunca la
  //      caché sola. Y `allowed_emails` se consulta ANTES que esto, así que un
  //      acceso dado a mano entra en el acto aunque el memo lo tuviera anotado.
  const visto = negativos.get(email);
  if (visto && Date.now() - visto.ts < NEGATIVO_TTL_MS) {
    return visto.resultado;
  }

  // 2) Escaneo en vivo. Sin cookies no tiene sentido ni intentarlo: pedimos
  //    reintento en vez de negarle el acceso a alguien que sí paga.
  if (!SKOOL_AUTH_TOKEN || !SKOOL_CLIENT_ID) {
    console.error('skool-login: faltan SKOOL_AUTH_TOKEN / SKOOL_CLIENT_ID; no puedo verificar en vivo');
    return { estado: 'indeterminado' };
  }

  let buildId: string;
  try {
    const built = await fetchSkoolBuildId();
    if (built.isLoginPage) {
      console.warn('skool-login: Skool redirigió al login (cookie de admin caída)');
      return { estado: 'indeterminado' };
    }
    buildId = built.buildId;
  } catch (e) {
    console.error('skool-login: fallo obteniendo el buildId de Skool:', e);
    return { estado: 'indeterminado' };
  }

  // Las cuatro pestañas, no solo `active`: quien canceló hace dos días sigue
  // pagando hasta el fin de su periodo y aparece en `cancelling`. Si solo
  // miráramos activos, lo dejaríamos fuera de lo que ya compró.
  //
  // Todo el bucle va dentro de un try: un 429 o un 5xx de Skool en la página 7
  // tiene que salir como 503 `verification_unavailable` —que el cliente sabe
  // reintentar— y no como un 500 genérico. En el original este throw se
  // escapaba al catch global; es un defecto real, no una diferencia de estilo.
  // Registro que Skool clasificó como baja/expulsión pero cuyos campos dicen
  // lo contrario. No decide nada por sí solo; espera corroboración. Ver abajo.
  let sinCorroborar: MiembroSkool | null = null;

  try {
    for (const pestana of [...PESTANAS_SIN_ACCESO, ...PESTANAS_CON_ACCESO]) {
      const hit = await buscarEnPestana(buildId, pestana, email);
      if (!hit) continue;

      // Decidimos por los CAMPOS del registro, nunca por la pestaña en la que
      // apareció: una misma persona sale en dos a la vez.
      const conAcceso = tieneAccesoSkool(hit);
      const pestanaRevoca = PESTANAS_SIN_ACCESO.includes(pestana);

      // Caso imposible salvo que Skool haya renombrado el campo: la persona
      // sale en `churned`/`banned` y aun así el registro no trae ni `churned`
      // ni `bannedAt`. Antes esto se resolvía dando acceso y cortando el
      // escaneo ahí mismo — o sea, un cambio de nombre de campo en Skool abría
      // la puerta a toda la gente dada de baja, en silencio y desde la primera
      // pestaña que se mira. Ahora no decide: seguimos a `active`/`cancelling`
      // a buscar corroboración. Si de verdad volvió a suscribirse, aparecerá
      // allí y entrará; si no aparece, se queda fuera.
      if (pestanaRevoca && conAcceso) {
        console.error(
          `skool-login: ANOMALÍA de esquema — ${email} sale en la pestaña "${pestana}" ` +
          `pero su registro no trae churned ni bannedAt. ¿Skool renombró el campo? ` +
          `Reviso active/cancelling antes de decidir.`,
        );
        // A propósito NO se escribe en la caché: una fila con churned_at=null
        // para alguien que Skool tiene por dado de baja convertiría este fallo
        // puntual en acceso permanente vía caché.
        sinCorroborar = hit;
        continue;
      }

      // Refrescamos la caché con el estado completo, tenga acceso o no (no
      // bloqueante: un fallo aquí no puede costarle el login a nadie).
      try {
        await supaUpsertSkoolMember(hit);
      } catch (e) {
        console.error('skool-login: upsert en vivo de skool_members falló (no bloqueante):', e);
      }

      if (!conAcceso) {
        console.info(`skool-login: sin acceso (pestaña=${pestana}, churned=${!!hit.churnedAt}, banned=${!!hit.bannedAt})`);
        recordarNegativo(email, { estado: 'sin_acceso' });
        return { estado: 'sin_acceso' };
      }

      // Tiene la membresía al día. Falta la segunda condición: el nivel.
      //
      // Si no se puede leer, NO decidimos. Abrir la puerta sería tirar el
      // gating entero en silencio en cuanto Skool renombre `spData` (y hoy
      // dejaría entrar al 79 % que el cliente quiere fuera); cerrarla sería
      // dejar fuera a alguien que paga. Así que 503 «vuelve a intentarlo» y un
      // error bien gordo en los logs. Medido: los 575 activos traen spData
      // legible, así que esto solo puede dispararse por un cambio de esquema,
      // y entonces se dispara para TODOS a la vez — se ve enseguida. Mientras
      // se arregla, `allowed_emails` mete a quien haga falta en el acto.
      if (hit.nivel === null) {
        console.error(
          `skool-login: ${email} tiene acceso vigente pero no pude leer su nivel ` +
          `(user.metadata.spData ausente o ilegible). ¿Skool cambió el campo? ` +
          `No abro la puerta a ciegas: respondo 503.`,
        );
        return { estado: 'indeterminado' };
      }

      if (!nivelSuficiente(hit.nivel)) {
        console.info(`skool-login: nivel ${hit.nivel} < ${NIVEL_MINIMO} (le faltan ${hit.puntosParaSiguiente ?? '?'} puntos)`);
        const denegado: Denegacion = {
          estado: 'nivel_insuficiente',
          nivel: hit.nivel,
          puntosParaSiguiente: hit.puntosParaSiguiente,
        };
        recordarNegativo(email, denegado);
        return denegado;
      }

      return { estado: 'con_acceso', firstName: hit.firstName, plan: planDesdeCrudo(hit.planRaw) };
    }
  } catch (e) {
    console.error('skool-login: el escaneo en vivo de Skool falló:', e);
    return { estado: 'indeterminado' };
  }

  if (sinCorroborar) {
    console.error(`skool-login: ${email} solo aparece en una pestaña de baja/expulsión y no se corroboró en active/cancelling; deniego.`);
  }

  // No aparece en ninguna pestaña que dé acceso: no es de la comunidad (o ya
  // no lo es). El memo evita que el siguiente intento vuelva a pagar el
  // escaneo completo con las cookies de admin.
  recordarNegativo(email, { estado: 'sin_acceso' });
  return { estado: 'sin_acceso' };
}

function recordarNegativo(email: string, resultado: Denegacion): void {
  if (negativos.size > 500) negativos.clear(); // poda tosca; es memoria efímera
  negativos.set(email, { ts: Date.now(), resultado });
}

// ============================================================
// ENTRY POINT
// ============================================================

Deno.serve(async (req) => {
  // Preflight de CORS: la función se llama desde un Custom HTML de GHL, que
  // vive en el dominio del cliente.
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

    let rawEmail = '';
    try {
      const body = await req.json();
      rawEmail = typeof body?.email === 'string' ? body.email : '';
    } catch {
      return jsonRes({ ok: false, reason: 'invalid_email' }, 400);
    }

    const email = normalizarEmail(rawEmail);
    if (!esEmailValido(email)) {
      return jsonRes({ ok: false, reason: 'invalid_email' }, 400);
    }

    const acceso = await verificarAcceso(email);

    if (acceso.estado === 'indeterminado') {
      // Skool no contesta o la cookie de admin cayó. Pedimos reintento en vez
      // de negar: el coste de un falso "no eres miembro" en un grupo de pago
      // es una persona que paga y no puede entrar.
      return jsonRes({ ok: false, reason: 'verification_unavailable' }, 503);
    }
    if (acceso.estado === 'sin_acceso') {
      return jsonRes({ ok: false, reason: 'not_member' }, 403);
    }
    if (acceso.estado === 'nivel_insuficiente') {
      // Motivo aparte de `not_member` a propósito: esta persona SÍ es de la
      // comunidad y SÍ paga. Los dos números viajan para que el HTML escriba
      // «vas por el nivel 1, te faltan 5 puntos» con los datos de esta
      // persona y no con un texto quemado que envejece mal. `points_to_next`
      // puede ser null (Skool no siempre lo trae): el cliente omite esa frase
      // en vez de escribir «undefined».
      return jsonRes({
        ok: false,
        reason: 'level_too_low',
        level: acceso.nivel,
        points_to_next: acceso.puntosParaSiguiente,
      }, 403);
    }

    // Tiene acceso vigente → sesión sin contraseña.
    // 1) Usuario de auth (idempotente). `generate_link` lo crearía por su
    //    cuenta en algunas versiones, pero esto es cinturón y tirantes, no un
    //    paso opcional que se pueda borrar sin probarlo.
    await ensureAuthUser(email);

    // 2) Marcar el profile. Va en try/catch porque no puede bloquear el login:
    //    si la tabla profiles todavía no existe en este proyecto, se salta.
    try {
      await supaMarkProfileMember(email);
    } catch (e) {
      console.error('skool-login: no pude marcar el profile (no bloqueante):', e);
    }

    // 3) Token de magic-link que el cliente canjea con verifyOtp.
    const tokenHash = await generateMagicLinkTokenHash(email);

    return jsonRes({
      ok: true,
      token_hash: tokenHash,
      email,
      first_name: acceso.firstName,
      // Dato informativo (importe/intervalo del plan crudo de Skool). El
      // frontend NO ramifica nada con esto. El nivel decide si ENTRAS, no qué
      // ves: quien entra ve las 6 herramientas. Si algún día se esconde una
      // herramienta según el plan, se está reintroduciendo el gating por plan
      // de SAVIAS, que es otra cosa y no es esta.
      plan: acceso.plan ?? null,
    }, 200);
  } catch (err) {
    // Un id corto de correlación en vez del texto del error: el detalle crudo
    // incluía URLs de Skool, códigos HTTP y trozos de HTML, y eso no tiene por
    // qué llegar al navegador de nadie. El mensaje completo queda en los logs.
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`skool-login error [${ref}]:`, err);
    return jsonRes({ ok: false, reason: 'server_error', ref }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

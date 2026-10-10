// Supabase Edge Function: sync-skool-members · La Huerta LAB
// ============================================================================
// Mantiene `public.skool_members` como espejo de la comunidad de Skool
// `la-huerta-lab`, que es la caché que consume `skool-login` para entrar sin
// contraseña. Es un port del sync del Universo de Lina (SAVIAS), pero con tres
// diferencias que NO son cosmética: allí el grupo es gratis y binario ("está o
// no está en la pestaña de activos"); aquí el grupo es DE PAGO (10 USD/mes con
// prueba gratuita), la gente cancela, se da de baja y se la expulsa, y esos
// tres estados no significan lo mismo para el acceso.
//
// 1) RECORRE LAS CUATRO PESTAÑAS
//    `t=active`, `t=cancelling`, `t=churned`, `t=banned`, paginando cada una
//    hasta agotarla. Ojo: un valor inválido de `t` NO da error, Skool cae a
//    `active` en silencio — un typo aquí no falla, MIENTE. Por eso las cuatro
//    pestañas están en una constante y no escritas a mano en cada llamada.
//
// 2) CLASIFICA POR CAMPOS AFIRMATIVOS, NUNCA POR LA PESTAÑA
//    Una misma persona sale en dos pestañas a la vez (medido: en la muestra de
//    `t=active` había 4 con `billingCanceled` puesto). Así que la pestaña solo
//    sirve para encontrar gente; el estado sale de los campos de `user.member`:
//      · `churned` presente            → churned  (ya NO tiene acceso)
//      · `bannedAt` presente           → banned   (ya NO tiene acceso)
//      · `billingCanceled` presente     → cancelling (CONSERVA el acceso hasta
//                                         `access_until`: cancelar es
//                                         reversible y ya está pagado)
//      · el resto                       → active
//    Si alguien aparece en dos pestañas, fusionamos los campos de ambas y
//    volvemos a derivar el estado sobre la unión. Eso equivale a "gana el más
//    restrictivo entre churned/banned, y cancelling le gana a active", pero sin
//    tener que ordenar estados a mano: el campo afirmativo manda.
//    REGLA DURA: no se revoca NUNCA por `cancelling` ni por `billingCanceled`.
//    Y `mbscpe` NO clasifica a nadie: es el fin del periodo en curso y lo trae
//    todo el que paga (medido: 168 de 169 activos con suscripción). Verlo como
//    "fecha de cancelación" dejaba la comunidad en 1 activo y 168 cancelando.
//
// 2 bis) EL CORREO CASI NUNCA ESTÁ EN `metadata.mbme`
//    Medido hoy sobre los 575 activos: `mbme` solo lo traen los 169 que tienen
//    suscripción, o sea que al 70,6 % de la comunidad le falta. El resto sale
//    de `user.email`, de `member.inviteEmail` (15) o de `member.searchAnswer`
//    (390, una cadena suelta que ES el correo), y unos pocos solo dentro de la
//    encuesta de entrada (`member.metadata.survey`, un JSON-string).
//    `resolverEmail()` recorre esas cuatro fuentes en orden y, si ninguna
//    sirve, entra en la encuesta: con eso se resuelve el correo del 99,8 %
//    (574 de 575). El único que se queda fuera es el dueño de la comunidad,
//    que entra por `allowed_emails`. Buscarlo solo en `mbme` descartaba en
//    silencio a 2 de cada 3 personas que PAGAN, y la salvaguarda de cobertura
//    ni se enteraba porque miraba filas leídas en vez de personas resueltas.
//    ⚠ `resolverEmail()` es GEMELA de la de `skool-login/index.ts`. Cada edge
//    function se despliega aislada y no comparten imports, así que la copia es
//    deliberada: si tocas una, toca la otra en la misma tarea. Si se separan,
//    el login y la caché dejarán de coincidir en QUIÉN existe, y el síntoma
//    será "a veces entra y a veces no", que es el peor bug que hay que buscar.
//
// 2 ter) EL NIVEL DE GAMIFICACIÓN SÍ ES LEGIBLE, Y CUELGA DE `user.metadata`
//    `user.metadata.spData` es un JSON-string:
//      {"pts":0,"lv":1,"pcl":0,"pnl":5,"role":2}
//    `lv` = nivel (1..9), `pts` = puntos totales, `pnl` = puntos que le faltan
//    para el siguiente nivel, `pcl` = puntos dentro del nivel actual.
//    ⚠ Cuelga de `user.metadata`, que es el PERFIL. Todo lo demás en este
//    archivo se lee de `user.member`, que es la MEMBRESÍA: son dos objetos
//    distintos y es el error fácil. Buscar `spData` en el segundo devuelve
//    `undefined` sin quejarse y deja a TODA la comunidad en nivel null.
//    Distribución medida sobre los 575 activos: nivel 1 → 455 (79,1 %),
//    2 → 56, 3 → 30, 4 → 14, 5 → 14, 6 → 5, 7 → 1. A los 455 de nivel 1 les
//    faltan exactamente 5 puntos.
//    Aquí el nivel NO decide nada: se guarda en la fila y se resume en la
//    auditoría (`distribucion_niveles`). Quien deniega por nivel es
//    `skool-login`, en un solo sitio.
//
// 3) LOS CONTEOS SE LEEN DE `pageProps.renderData`, NO DE `pageProps`
//    En la versión de SAVIAS esto está MAL y falla en silencio (ver el
//    comentario largo en `leerConteos()`). No lo "arregles" de vuelta.
//
// 4) UN SYNC QUE FALLA NO PUEDE SACAR A 571 PERSONAS
//    Antes de escribir nada hay cuatro abortos, y abortar significa: no se
//    toca `skool_members`, se deja fila de auditoría con el motivo y se
//    responde con código de error para que el cron/monitor lo vea.
//      a) Skool devuelve la página de login (cookie de admin caducada) → 401.
//      b) Una página revienta a mitad del escaneo (429/5xx)            → 502.
//      c) El escaneo trae 0 activos, o se queda corto respecto al total
//         que el propio Skool reporta                                  → 409.
//      d) CANARIO: los activos caen más de un 25 % respecto a la última
//         auditoría con éxito                                          → 409.
//    El canario es la red contra "Skool cambió un campo" o "la cookie está a
//    medias": esas dos cosas no dan error, dan datos plausibles y menos gente.
//    Si la caída es real (una purga de morosos), se desbloquea a mano con
//    `{"force": true}` en el body.
//
// LO QUE ESTA FUNCIÓN NO HACE, A PROPÓSITO
//   · No decide accesos, ni por plan ni por nivel. Escribe hechos; la puerta
//     está en `skool-login`. El plan (`plan_raw`, el `mmbp` crudo) sigue
//     siendo informativo y nadie debe ramificar con él: no se porta el gating
//     por plan de SAVIAS. El nivel de gamificación sí se guarda
//     (`level`/`points`/`points_to_next`), pero para que lo aplique el login y
//     para poder auditar el umbral, no para filtrar nada desde aquí.
//   · No toca `public.profiles`. `skool-login` ya verifica la membresía en el
//     momento que importa —cuando la persona entra— y marca el profile ahí.
//     Un PATCH por fila desde aquí serían N requests secuenciales para
//     adelantar información que el login vuelve a comprobar igualmente.
//   · No borra filas por exclusión (SAVIAS sí lo hace). En un grupo de pago,
//     borrar la fila te deja sin el MOTIVO de la denegación: a quien se da de
//     baja se le marca `churned_at`, no se le desaparece. Quien no aparezca en
//     ninguna de las cuatro pestañas se reporta en la auditoría como
//     `no_vistos` y su `synced_at` se queda viejo; revísalo a mano antes de
//     borrar nada.
//   · No tiene modo single-user (en SAVIAS lo dispara el trigger de signup).
//     Aquí `skool-login` consulta Skool en vivo si la caché falla, así que el
//     recién llegado entra sin esperar a este cron.
//
// MODOS
//   · Cron (body vacío o `{}`): escaneo completo + escritura. Es el normal.
//   · `{"diagnostic": true}`: trae solo la página 1 de cada pestaña, enseña los
//     conteos de `renderData` y una muestra ya clasificada. NO escribe nada.
//     Es la herramienta de campo para comprobar que Skool no cambió el esquema.
//   · `{"force": true}`: salta el canario (y solo el canario).
//
// DESPLIEGUE
//   supabase functions deploy sync-skool-members
//   ↑ CON verificación de JWT: esto es server-a-server (pg_cron con la
//     service_role). No lleva CORS ni OPTIONS a propósito. Es lo contrario de
//     `skool-login`, que se invoca desde el navegador con la anon key y va con
//     `--no-verify-jwt`. No unifiques los dos comandos.
//
// DISPARO MANUAL
//   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
//        -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//   curl -X POST $SUPABASE_URL/functions/v1/sync-skool-members \
//        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//        -H "Content-Type: application/json" -d '{"diagnostic": true}'
//
// SECRETS (los mismos que `skool-login`)
//   SKOOL_AUTH_TOKEN           cookie auth_token del admin de Skool
//   SKOOL_CLIENT_ID            cookie client_id del admin de Skool
//   SKOOL_GROUP                slug del grupo (default: la-huerta-lab)
//   SUPABASE_URL               (auto-inyectado)
//   SUPABASE_SERVICE_ROLE_KEY  (auto-inyectado; NUNCA sale del servidor)
//   Opcionales, solo para el aviso por correo de cookie caducada:
//   ADMIN_EMAIL, RESEND_API_KEY, FROM_EMAIL. Si faltan, el aviso queda igual
//   registrado en `sync_alerts` y en los logs; el sync no depende de ellos.
//
// ESQUEMA QUE ASUME (la migración de La Huerta debe crearlo así)
//   public.skool_members: email text primary key (siempre en minúsculas),
//     first_name, last_name, skool_user_id text, member_id text, role text,
//     status text ('active'|'cancelling'|'churned'|'banned'),
//     churned_at timestamptz, banned_at timestamptz, access_until timestamptz,
//     billing_canceled boolean not null default false, plan_raw text,
//     level int, points int, points_to_next int,   ← de user.metadata.spData
//     synced_at timestamptz not null default now().
//     Si esas tres columnas de nivel no existen todavía, el upsert por lotes
//     devuelve 400 y la corrida entera muere sin escribir NI UNA fila. Es el
//     mismo fallo que ya provocó el CHECK cerrado de `role`: migración antes
//     que despliegue, siempre en ese orden.
//     RLS activa y SIN policies: la lista de miembros no se lee desde el
//     cliente, solo con la service_role.
//     Y `role` SIN check cerrado: el valor lo pone Skool, no nosotros. Medido:
//     los dados de baja llegan con `role = 'declined'`, que no estaba en la
//     lista prevista; con el CHECK puesto, el upsert de cualquier lote con un
//     churned devolvía 400 y la corrida entera acababa en 500 sin escribir.
//   public.sync_alerts: id, kind text, message text, payload jsonb,
//     notified boolean, created_at timestamptz. RLS activa y sin policies.
//     ⚠ Si el CHECK de `kind` sigue siendo el enum cerrado de SAVIAS
//     ('run','cookie_expired','http_error','no_members'), amplíalo con
//     'canary_abort' y 'partial_scan'. Mientras tanto, `supaInsertAlert`
//     reintenta como 'http_error' para no quedarnos sin auditoría creyendo
//     que la tenemos.
// ============================================================================

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SKOOL_AUTH_TOKEN = Deno.env.get('SKOOL_AUTH_TOKEN') ?? '';
const SKOOL_CLIENT_ID  = Deno.env.get('SKOOL_CLIENT_ID') ?? '';
// El default es el grupo de La Huerta LAB, NO el de SAVIAS. En el original
// ponía 'savias-8385': si allí se olvida el secret, la función scrapea en
// silencio la comunidad de Lina con las cookies de Iván y da acceso a la gente
// equivocada. Que el error, si lo hay, sea contra el grupo correcto.
const SKOOL_GROUP      = (Deno.env.get('SKOOL_GROUP') || 'la-huerta-lab').trim();
const ADMIN_EMAIL      = Deno.env.get('ADMIN_EMAIL') ?? '';
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL       = Deno.env.get('FROM_EMAIL') ?? 'La Huerta LAB <onboarding@resend.dev>';

const SKOOL_BASE = 'https://www.skool.com';

// Las cuatro pestañas reales del endpoint de miembros. Cualquier otro valor
// cae a `active` sin avisar, así que esta lista es la única fuente.
const PESTANAS = ['active', 'cancelling', 'churned', 'banned'] as const;
type Pestana = typeof PESTANAS[number];

// 571 activos = 20 páginas de 30. 40 deja margen para que la comunidad doble
// de tamaño y sigue siendo un tope que corta de verdad. El original tenía 200,
// que no es un tope: es una forma elegante de colgar la request.
const SAFETY_PAGES = 40;

// Canario: si los activos caen más de esto respecto al último sync con éxito,
// abortamos sin escribir. Una caída así casi nunca es gente que se va; es
// Skool que cambió un campo o una cookie a medio morir.
const CAIDA_MAXIMA_ACTIVOS = 0.25;

// Si el propio Skool dice que hay N en una pestaña y nosotros escaneamos menos
// del 90 %, la paginación se cortó a mitad. Escribir eso degradaría a gente
// que sí paga. Esta es la salvaguarda que cubre el primer sync, cuando todavía
// no hay auditoría anterior contra la que comparar.
const COBERTURA_MINIMA = 0.90;

// ---------------------------------------------------------------------------
// NIVEL MÍNIMO DE GAMIFICACIÓN PARA ENTRAR AL UNIVERSO
// ---------------------------------------------------------------------------
// ⚠ AQUÍ NO DECIDE NADA. Esta función no deniega accesos: solo usa el número
// para resumir en la auditoría cuánta gente quedaría fuera con el umbral
// puesto. Quien de verdad cierra la puerta es `skool-login/index.ts`, que
// tiene esta MISMA constante. Son dos copias porque cada edge function se
// despliega aislada y no comparten imports: si cambias una, cambia la otra en
// la misma tarea. Si se separan, la auditoría dirá que el umbral deja fuera a
// 455 personas mientras el login está dejando fuera a otras.
//
// Medido hoy sobre los 575 activos: con el umbral en 2 entran 120 (20,9 %) y
// quedan fuera los 455 de nivel 1 (79,1 %), a los que les faltan exactamente
// 5 puntos. El cliente sabe que deja fuera al 79 % y quiere probarlo igual.
// Bajarlo a 1 es cambiar este número (y el de `skool-login`) y volver a
// desplegar. Nada más.
const NIVEL_MINIMO = 2;

const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const UA_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

type Estado = 'active' | 'cancelling' | 'churned' | 'banned';

type Miembro = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  skool_user_id: string | null;
  member_id: string | null;
  role: string | null;              // 'group-admin' | 'member' | 'declined'
  estado: Estado;
  approved_at: string | null;       // ISO, member.approvedAt
  churned_at: string | null;        // ISO
  banned_at: string | null;         // ISO
  access_until: string | null;      // ISO, derivado de mbscpe (unix segundos)
  billing_canceled: boolean;
  billing_declined: boolean;
  plan_raw: string | null;          // `mmbp` crudo — informativo, nunca gating
  // Gamificación. Sale de `user.metadata.spData` (el PERFIL), NO de
  // `user.member.metadata` (la MEMBRESÍA), que es de donde viene todo lo de
  // arriba. `null` significa "Skool no nos lo dio", nunca "nivel 0".
  level: number | null;             // `lv`  → nivel 1..9
  points: number | null;            // `pts` → puntos totales
  points_to_next: number | null;    // `pnl` → puntos que le faltan para subir
  visto_en: Pestana[];              // en qué pestañas apareció (para auditar)
};

// ============================================================
// HELPERS DE LECTURA (Skool devuelve tipos inconsistentes)
// ============================================================

/** ¿El campo está puesto de forma afirmativa? Skool a veces manda el booleano,
 *  a veces la fecha, a veces la clave simplemente no existe. Ausente, false,
 *  '0' y cadena vacía significan "no". */
function presente(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim();
  return s !== '' && s !== 'false' && s !== '0';
}

function aIso(v: unknown): string | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `mbscpe` es un unix en SEGUNDOS (fin de acceso de quien canceló). Si algún
 *  día llegara en milisegundos lo detectamos por magnitud en vez de dar una
 *  fecha del año 1970 por buena. */
function unixAIso(v: unknown): string | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n > 1e12 ? n : n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Sin anclar, y SOLO para el último recurso dentro de la encuesta. No la uses
// en ningún otro sitio: sin anclas, cualquier frase que mencione un correo pasa
// el filtro, y en un campo de texto libre ese correo puede ser el de otra
// persona (el de su contacto, el de su negocio, el de quien la invitó).
const RE_EMAIL_DENTRO = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;

/** Siempre en minúsculas y sin espacios. El correo es la PK de `skool_members`
 *  y lleva un CHECK de minúsculas: una fila con mayúsculas revienta el upsert
 *  del lote entero. */
function normalizarEmail(v: unknown): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).trim().toLowerCase();
}

/** 254 es el máximo real de un correo. El límite no es cosmético: sin él, un
 *  campo de texto libre de 20 KB acaba en la PK de la tabla. */
function esEmailValido(email: string): boolean {
  return !!email && email.length <= 254 && RE_EMAIL.test(email);
}

/** La encuesta de entrada vive en `user.member.metadata.survey` y es un
 *  JSON-string con las preguntas del grupo y lo que respondió la persona. Es la
 *  última red para los pocos que no dejan el correo en ningún campo
 *  estructurado.
 *  Buscamos por el TIPO de pregunta (`"type":"email"`) y no por su texto: el
 *  texto lo cambia el dueño de la comunidad desde la interfaz cuando quiere
 *  (hoy es «👉 ¿Cuál es tu email?»), y el día que lo cambie no queremos que
 *  esto deje de encontrar a nadie sin dar un solo error.
 *  La expresión regular sobre la cadena cruda va la ÚLTIMA y solo si lo
 *  anterior falló: aquí resolver mal es peor que no resolver, porque significa
 *  escribir la fila de acceso de alguien bajo el correo de otro. */
function emailDeEncuesta(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';

  let j: unknown = null;
  try { j = JSON.parse(raw); } catch { j = null; }

  // Skool no documenta la forma: puede ser un array de preguntas o un objeto
  // que las contenga. Aplanamos un nivel y toleramos las dos.
  const entradas: any[] = Array.isArray(j)
    ? j
    : (j && typeof j === 'object'
        ? Object.values(j as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : [v]))
        : []);

  for (const e of entradas) {
    if (!e || typeof e !== 'object') continue;
    const tipo = String((e as any).type ?? (e as any).questionType ?? '').trim().toLowerCase();
    if (tipo !== 'email') continue;
    for (const campo of [(e as any).answer, (e as any).value, (e as any).response, (e as any).a]) {
      const s = normalizarEmail(campo);
      if (esEmailValido(s)) return s;
    }
  }

  const m = raw.match(RE_EMAIL_DENTRO);
  const s = normalizarEmail(m?.[0]);
  return esEmailValido(s) ? s : '';
}

/** DE DÓNDE SALE EL CORREO.
 *
 *  ⚠ GEMELA de `resolverEmail()` en `skool-login/index.ts`. Cada edge function
 *  se despliega aislada y no comparten imports, así que esto es una copia a
 *  propósito: si tocas una, toca la otra EN LA MISMA TAREA. Si se separan, el
 *  login y la caché dejan de coincidir en quién existe y el síntoma es "a veces
 *  entra y a veces no".
 *
 *  Cuatro fuentes, en este orden, y nos quedamos con la primera que sea un
 *  correo válido. Medido hoy contra la API real (575 filas de `active`):
 *      1. member.metadata.mbme ... 169   SOLO los que tienen suscripción viva:
 *                                        al 70,6 % de la comunidad le falta.
 *      2. user.email ............         la cuenta con la que entra a Skool;
 *                                        muchas veces viene vacío u ofuscado
 *                                        (sin arroba), y el filtro lo tira solo.
 *      3. member.inviteEmail ......  15
 *      4. member.searchAnswer .... 390   string suelto que ES el correo. Va el
 *                                        último de los cuatro porque es texto
 *                                        libre; solo se acepta si la cadena
 *                                        ENTERA es un correo.
 *  Y si ninguna sirve, la encuesta (`emailDeEncuesta`).
 *
 *  Con las cuatro fuentes + encuesta se resuelve el 99,8 % (574 de 575). El
 *  único que no da correo por ninguna vía es el dueño de la comunidad, que
 *  entra por `allowed_emails`.
 *  `searchAnswer` es de fiar: en las 169 filas donde convive con `mbme`
 *  coincide carácter a carácter (0 discrepancias). */
function resolverEmail(u: any): string {
  const member = u?.member ?? {};
  const md = member?.metadata ?? {};
  for (const c of [md?.mbme, u?.email, member?.inviteEmail, member?.searchAnswer]) {
    const s = normalizarEmail(c);
    if (esEmailValido(s)) return s;
  }
  return emailDeEncuesta(md?.survey);
}

/** EL NIVEL DE GAMIFICACIÓN. `user.metadata.spData` es un JSON-string:
 *      {"pts":0,"lv":1,"pcl":0,"pnl":5,"role":2}
 *      lv  → nivel (1..9)
 *      pts → puntos totales
 *      pnl → puntos que le FALTAN para el siguiente nivel
 *      pcl → puntos dentro del nivel actual. No se guarda: no decide nada, no
 *            hay columna, y sale de `pts` y `pnl` si algún día hace falta.
 *
 *  ⚠ Cuelga de `user.metadata`, que es el PERFIL. Todo lo demás en este archivo
 *  se lee de `user.member` / `user.member.metadata`, que es la MEMBRESÍA. Son
 *  dos objetos distintos y este es el error fácil: buscar `spData` en el
 *  segundo devuelve `undefined` sin quejarse y deja a TODA la comunidad en
 *  nivel null — con el umbral puesto en `skool-login`, eso es cerrarle la
 *  puerta a los 575.
 *
 *  Medido sobre los 575 activos: 1 → 455 (79,1 %), 2 → 56, 3 → 30, 4 → 14,
 *  5 → 14, 6 → 5, 7 → 1.
 *
 *  Ante un formato que no entendemos preferimos `null` a un número inventado:
 *  `null` se ve en la auditoría como `sin_nivel` y no finge que alguien está en
 *  el nivel 0. */
function leerGamificacion(u: any): { level: number | null; points: number | null; points_to_next: number | null } {
  const crudo = u?.metadata?.spData;
  let sp: any = null;
  if (crudo && typeof crudo === 'object') {
    sp = crudo;                       // por si algún día deja de venir serializado
  } else if (typeof crudo === 'string' && crudo.trim()) {
    try { sp = JSON.parse(crudo); } catch { sp = null; }
  }
  if (!sp || typeof sp !== 'object') return { level: null, points: null, points_to_next: null };

  const entero = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  };
  return { level: entero(sp.lv), points: entero(sp.pts), points_to_next: entero(sp.pnl) };
}

/** Distribución de niveles para la fila de auditoría: {"1":455,"2":56,...}.
 *  Es lo que va a permitir revisar dentro de un mes si el umbral de
 *  `NIVEL_MINIMO` tiene sentido, sin volver a bajarse las 20 páginas a mano.
 *  Los que no traen `spData` se cuentan aparte en `sin_nivel` en vez de
 *  colarse como nivel 0: si esa clave crece, es que Skool movió el campo, no
 *  que la comunidad se desmotivó. */
function distribucionDeNiveles(miembros: Miembro[]): Record<string, number> {
  const cuenta = new Map<number, number>();
  let sinNivel = 0;
  for (const m of miembros) {
    if (m.level === null) { sinNivel++; continue; }
    cuenta.set(m.level, (cuenta.get(m.level) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const lv of [...cuenta.keys()].sort((a, b) => a - b)) out[String(lv)] = cuenta.get(lv)!;
  if (sinNivel > 0) out.sin_nivel = sinNivel;
  return out;
}

// ============================================================
// SKOOL
// ============================================================

function skoolCookieHeader(): string {
  return `auth_token=${SKOOL_AUTH_TOKEN}; client_id=${SKOOL_CLIENT_ID}`;
}

/** El endpoint de miembros vive en /_next/data/{buildId}/{group}/-/members.json
 *  y el buildId cambia con CADA deploy de Skool, así que hay que sacarlo del
 *  HTML en cada invocación: no se hardcodea ni se cachea.
 *  `isLoginPage` es la señal de cookie caducada y es lo que separa "no puedo
 *  comprobar" de "no es miembro". Si lo quitas, una cookie muerta deja a toda
 *  la comunidad fuera. */
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
  if (!r.ok) throw new Error(`página de miembros de Skool: ${r.status}`);
  const html = await r.text();
  const finalUrl = r.url;
  const isLoginPage = /\/login\b/.test(finalUrl) || /sign[\s-]?in/i.test(html.slice(0, 5000));
  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error(`buildId no encontrado (finalUrl=${finalUrl}). Head del HTML: ${html.slice(0, 400)}`);
  return { buildId: m[1], finalUrl, isLoginPage };
}

type Conteos = {
  totalPages?: number;
  totalMembers?: number;
  totalCancellingMembers?: number;
  totalChurnedMembers?: number;
  totalBannedMembers?: number;
};

/** ⚠ AQUÍ ESTABA EL BUG DE SAVIAS. NO LO "ARREGLES" DE VUELTA.
 *
 *  En `Lina Toro/dashboard/supabase/functions/sync-skool-members/index.ts`
 *  (y en su `skool-login`) se hace `const root = j?.pageProps ?? j;` y luego se
 *  lee `root.totalMembers`. Ese campo NO vive en `pageProps`: vive en
 *  `pageProps.renderData`, junto con `totalCancellingMembers`,
 *  `totalChurnedMembers` y `totalBannedMembers`. Como leer una clave que no
 *  existe devuelve `undefined` en silencio, allí el sync "funciona" y solo
 *  miente su telemetría: `skool_total_reported` sale siempre null.
 *
 *  El único conteo que sí está en `pageProps` es `totalPages` — por eso allí la
 *  paginación funciona de casualidad.
 *
 *  Medido contra la API real de la-huerta-lab: 571 activos (20 páginas),
 *  9 cancelando, 98 dados de baja, 0 expulsados. */
function leerConteos(j: any): Conteos {
  const pageProps = j?.pageProps ?? {};
  const renderData = pageProps?.renderData ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    totalPages:             num(pageProps.totalPages),            // ← pageProps
    totalMembers:           num(renderData.totalMembers),         // ← renderData
    totalCancellingMembers: num(renderData.totalCancellingMembers),
    totalChurnedMembers:    num(renderData.totalChurnedMembers),
    totalBannedMembers:     num(renderData.totalBannedMembers),
  };
}

/** Una página de una pestaña. El querystring es el mínimo medido que funciona:
 *  `group`, `t` y `p`. El original arrastra además `monthly/annual/oneTime/
 *  trials/free = 'false'`, heredado de un grupo gratis; en un grupo de pago con
 *  prueba gratuita nadie ha verificado que esos filtros no excluyan gente, y
 *  excluirían en silencio. No los arrastramos por inercia. */
async function fetchPagina(buildId: string, pestana: Pestana, page: number): Promise<{
  usuarios: any[];
  miembros: Miembro[];
  conteos: Conteos;
  hasMore: boolean;
  muestraCruda?: unknown;
}> {
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
  if (!r.ok) throw new Error(`members.json ${pestana} p${page}: ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();

  // La lista real está en `pageProps.users`, verificado contra la API. El
  // original recolecta candidatos de cinco rutas posibles y, si falla, recorre
  // el JSON entero buscando objetos con `email`: aquí eso es peso muerto,
  // porque en Skool el email NO viene como `user.email` sino ofuscado en
  // `user.member.metadata.mbme`. Ruta explícita y, si un día deja de existir,
  // que se note en la auditoría en vez de colar objetos que no son miembros.
  const usuarios: any[] = Array.isArray(j?.pageProps?.users) ? j.pageProps.users : [];
  const conteos = leerConteos(j);

  const miembros: Miembro[] = [];
  for (const u of usuarios) {
    const m = extraerMiembro(u, pestana);
    if (m) miembros.push(m);
  }

  // hasMore cuenta USUARIOS de la página, no miembros con email resuelto. En el
  // original se compara `members.length >= 30`: si una página trae 30 usuarios y
  // 2 no dan email, corta la paginación ahí y se pierde el resto de la
  // comunidad sin un solo error.
  const hasMore = conteos.totalPages !== undefined
    ? page < conteos.totalPages
    : usuarios.length >= 30;

  const muestraCruda = page === 1
    ? {
        claves_usuario: usuarios[0] ? Object.keys(usuarios[0]) : null,
        claves_member: usuarios[0]?.member ? Object.keys(usuarios[0].member) : null,
        claves_member_metadata: usuarios[0]?.member?.metadata ? Object.keys(usuarios[0].member.metadata) : null,
        // `user.metadata` es el PERFIL y es donde vive `spData` (el nivel). Se
        // enseña aparte de `member.metadata` justamente para que en el
        // diagnóstico se vea que son dos objetos distintos.
        claves_metadata_perfil: usuarios[0]?.metadata ? Object.keys(usuarios[0].metadata) : null,
        trae_spData: usuarios[0]?.metadata?.spData !== undefined,
        usuarios_en_pagina: usuarios.length,
        miembros_con_email: miembros.length,
        miembros_con_nivel: miembros.filter((m) => m.level !== null).length,
      }
    : undefined;

  return { usuarios, miembros, conteos, hasMore, muestraCruda };
}

/** Traduce un usuario del JSON de Skool a nuestra fila.
 *  Los campos de membresía cuelgan de `user.member`, NO de `user.metadata`:
 *  `user.metadata` es el PERFIL (bio, foto). Confundirlos es otro fallo del
 *  original (tiene un fallback a `c.metadata.mbme` que no describe nada real). */
function extraerMiembro(u: any, pestana: Pestana): Miembro | null {
  const member = u?.member ?? {};
  const md = member?.metadata ?? {};

  // `resolverEmail` recibe el usuario ENTERO y vuelve a sacar `member`/`md` por
  // dentro. Es redundante aquí, y es a propósito: así el cuerpo de la función es
  // idéntico al de su gemela en `skool-login` y se puede copiar de un archivo al
  // otro sin adaptar nada.
  const email = resolverEmail(u);
  if (!email) return null;

  // Nivel de gamificación. Sale de `u.metadata` (PERFIL), no de `md` (que es
  // `u.member.metadata`, la MEMBRESÍA, y es de donde salen todas las demás
  // lecturas de esta función).
  const gam = leerGamificacion(u);

  const ahora = new Date().toISOString();

  // `churned` viene como ISO. Si algún día llega como booleano, guardamos la
  // fecha del escaneo y lo decimos aquí: es la fecha en que lo DETECTAMOS, no
  // la real. Lo que no puede pasar es quedarnos con `churned_at = null`, porque
  // un helper SQL que solo mire fechas le daría acceso a alguien dado de baja.
  const churnedFlag = presente(member?.churned);
  const churned_at = aIso(member?.churned) ?? (churnedFlag ? ahora : null);

  const bannedRaw = md?.bannedAt ?? member?.bannedAt;
  const bannedFlag = presente(bannedRaw);
  const banned_at = aIso(bannedRaw) ?? (bannedFlag ? ahora : null);

  const access_until = unixAIso(md?.mbscpe);
  // Medido: `billingCanceled` y `billingDeclined` llegan como cadena ISO, no
  // como booleano. Por eso pasan por `presente()` y no por `=== true`, que
  // daría false siempre y dejaría la columna en blanco para todo el mundo.
  const billing_canceled = presente(member?.billingCanceled);
  const billing_declined = presente(member?.billingDeclined);

  const estado = derivarEstado({ churnedFlag, bannedFlag, billing_canceled });

  return {
    email,
    first_name: texto(u?.firstName ?? u?.first_name),
    last_name:  texto(u?.lastName  ?? u?.last_name),
    skool_user_id: texto(u?.id ?? u?.user_id),
    member_id: texto(member?.id),
    // `role` es 'group-admin' o 'member'. En La Huerta los 4 admins SÍ salen en
    // la API (en SAVIAS no salían, y por eso allí hacía falta allowed_emails).
    role: texto(member?.role),
    estado,
    approved_at: aIso(member?.approvedAt),
    churned_at,
    banned_at,
    access_until,
    billing_canceled,
    billing_declined,
    // El plan crudo (`mmbp`: importe, moneda, intervalo) se guarda como dato
    // informativo. Aquí NO hay gating por plan: miembro con acceso vigente ve
    // las 6 herramientas, y punto. Nadie debe ramificar la UI con esto.
    plan_raw: texto(md?.mmbp),
    // El nivel se guarda para que `skool-login` lo aplique y para poder auditar
    // el umbral. Aquí no filtra a nadie: esta función escribe hechos.
    level: gam.level,
    points: gam.points,
    points_to_next: gam.points_to_next,
    visto_en: [pestana],
  };
}

/** El estado sale de los campos afirmativos, nunca de la pestaña.
 *
 *  ⚠ `access_until` (mbscpe) NO entra aquí, y esto es lo contrario de lo que
 *  parece. `mbscpe` no es "fecha en la que se le acaba el acceso al que
 *  canceló": es el fin del periodo de facturación EN CURSO, y lo trae todo el
 *  que tiene suscripción viva. Medido contra la API real: de los 169 activos
 *  con suscripción, 168 traen `mbscpe` en el futuro y solo 6 tienen
 *  `billingCanceled`. Con `mbscpe` en la regla, la clasificación real de la
 *  comunidad salía 1 activo y 168 "cancelando" — es decir, la etiqueta perdía
 *  todo significado y, peor, el canario de la salvaguarda (c) pasaba a vigilar
 *  un número que ya no se mueve aunque se caiga media comunidad.
 *  El único campo afirmativo de cancelación es `billingCanceled`.
 *
 *  `billingDeclined` (cobro rechazado) NO cambia el estado: se reintenta, y
 *  si acaba en baja Skool lo mueve a `churned`. Se guarda aparte en
 *  `billing_declined`. Efecto lateral que conviene saber: la pestaña
 *  `cancelling` de Skool cuenta cancelados ∪ rechazados (9 hoy = 6 + 3), así
 *  que nuestro `cancelando` es legítimamente menor que
 *  `renderData.totalCancellingMembers`. */
function derivarEstado(x: {
  churnedFlag: boolean;
  bannedFlag: boolean;
  billing_canceled: boolean;
}): Estado {
  if (x.bannedFlag) return 'banned';    // expulsado: sin acceso
  if (x.churnedFlag) return 'churned';  // dado de baja: sin acceso
  // Cancelar es reversible y ya está pagado hasta `access_until`: cancelling
  // CONSERVA el acceso. Revocar aquí sería cobrarle a alguien y no dejarle
  // entrar. Quien de verdad perdió el acceso ya salió por `churned`.
  if (x.billing_canceled) return 'cancelling';
  return 'active';
}

/** Fusiona dos apariciones de la misma persona (sale en dos pestañas a la vez).
 *  Unimos los campos afirmativos y volvemos a derivar el estado sobre la unión:
 *  eso da exactamente "churned/banned ganan; cancelling le gana a active", sin
 *  tener que ordenar estados a mano. */
function fusionar(a: Miembro, b: Miembro): Miembro {
  const churned_at = a.churned_at ?? b.churned_at;
  const banned_at  = a.banned_at  ?? b.banned_at;
  const billing_canceled = a.billing_canceled || b.billing_canceled;
  const billing_declined = a.billing_declined || b.billing_declined;
  // Ante dos fechas de fin de acceso nos quedamos con la más lejana: es la que
  // el cliente pagó. Nunca acortamos el acceso de nadie por un dato viejo.
  const access_until = [a.access_until, b.access_until]
    .filter((x): x is string => !!x)
    .sort()
    .pop() ?? null;

  return {
    email: a.email,
    first_name: a.first_name ?? b.first_name,
    last_name:  a.last_name  ?? b.last_name,
    skool_user_id: a.skool_user_id ?? b.skool_user_id,
    member_id: a.member_id ?? b.member_id,
    role: a.role ?? b.role,
    estado: derivarEstado({
      churnedFlag: churned_at !== null,
      bannedFlag: banned_at !== null,
      billing_canceled,
    }),
    approved_at: a.approved_at ?? b.approved_at,
    churned_at,
    banned_at,
    access_until,
    billing_canceled,
    billing_declined,
    plan_raw: a.plan_raw ?? b.plan_raw,
    // El nivel es del PERFIL, no de la membresía: la misma persona trae el mismo
    // `spData` salga en la pestaña que salga. No hay conflicto que resolver, así
    // que nos quedamos con el primero que no sea null en vez de inventar una
    // regla de desempate que nunca se ejecutaría.
    level: a.level ?? b.level,
    points: a.points ?? b.points,
    points_to_next: a.points_to_next ?? b.points_to_next,
    visto_en: [...new Set([...a.visto_en, ...b.visto_en])],
  };
}

// ============================================================
// SUPABASE
// ============================================================

/** Auditoría. Nunca rompe el sync: si no se puede auditar, se avisa por log.
 *  El reintento con kind 'http_error' existe porque `sync_alerts.kind` lleva un
 *  CHECK con lista cerrada: si la migración no incluye 'canary_abort' o
 *  'partial_scan', el insert falla, el catch se lo traga y te quedas sin
 *  auditoría creyendo que la tienes. Preferimos una fila con el kind
 *  equivocado y el original dentro del payload, a ninguna fila. */
async function supaInsertAlert(kind: string, message: string, payload: Record<string, unknown>, notified = false): Promise<void> {
  const intentar = async (k: string, extra?: Record<string, unknown>): Promise<string | null> => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sync_alerts`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ kind: k, message, payload: { ...payload, ...(extra ?? {}) }, notified }),
    });
    return r.ok ? null : `${r.status} ${await r.text().catch(() => '')}`;
  };
  try {
    const err = await intentar(kind);
    if (!err) return;
    console.warn(`sync_alerts rechazó kind='${kind}' (${err}); reintento como 'http_error'`);
    const err2 = await intentar('http_error', { kind_original: kind, error_insert: err });
    if (err2) console.warn(`sync_alerts tampoco aceptó el reintento: ${err2}`);
  } catch (e) {
    console.warn('supaInsertAlert falló:', e);
  }
}

/** El canario necesita saber cuántos activos había la última vez que el sync
 *  terminó bien. Pedimos las últimas filas 'run' y nos quedamos con la primera
 *  que se marcó como completa: filtrar jsonb desde PostgREST por URL es frágil
 *  y esto son 25 filas. */
async function leerUltimoRunConExito(): Promise<{ activos: number; created_at: string } | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_alerts?select=created_at,payload&kind=eq.run&order=created_at.desc&limit=25`,
      { headers: SUPA_HEADERS },
    );
    if (!r.ok) return null;
    const filas: Array<{ created_at: string; payload: any }> = await r.json();
    for (const f of filas) {
      const p = f?.payload;
      if (p?.ok === true && typeof p?.activos === 'number') {
        return { activos: p.activos, created_at: f.created_at };
      }
    }
    return null;
  } catch {
    // Sin histórico no hay canario, pero sí queda la cobertura mínima contra el
    // total que reporta Skool. Nunca abortamos por no poder leer la auditoría.
    return null;
  }
}

async function supaUpsertMiembros(miembros: Miembro[]): Promise<number> {
  if (miembros.length === 0) return 0;
  const ahora = new Date().toISOString();
  const CHUNK = 500;
  let escritos = 0;
  for (let i = 0; i < miembros.length; i += CHUNK) {
    const lote = miembros.slice(i, i + CHUNK).map((m) => ({
      email: m.email,                       // ya normalizado a minúsculas
      first_name: m.first_name,
      last_name: m.last_name,
      skool_user_id: m.skool_user_id,
      member_id: m.member_id,
      role: m.role,
      status: m.estado,
      approved_at: m.approved_at,
      churned_at: m.churned_at,
      banned_at: m.banned_at,
      access_until: m.access_until,
      billing_canceled: m.billing_canceled,
      billing_declined: m.billing_declined,
      plan_raw: m.plan_raw,
      // ⚠ Estas tres columnas son nuevas (`level`, `points`, `points_to_next`).
      // Si la migración de nivel todavía no está aplicada, PostgREST devuelve
      // 400 por columna inexistente y la corrida entera muere sin escribir NI
      // UNA fila — exactamente lo que ya pasó con el CHECK cerrado de `role`.
      // Migración primero, despliegue después.
      level: m.level,
      points: m.points,
      points_to_next: m.points_to_next,
      synced_at: ahora,
    }));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/skool_members?on_conflict=email`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`upsert skool_members: ${r.status} ${await r.text().catch(() => '')}`);
    escritos += lote.length;
  }
  return escritos;
}

/** Emails que ya están en la caché, para reportar (que no borrar) los que no
 *  aparecieron en ninguna pestaña. */
async function supaSelectEmailsCache(): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/skool_members?select=email`, {
      headers: { ...SUPA_HEADERS, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new Error(`select skool_members: ${r.status} ${await r.text().catch(() => '')}`);
    const filas: Array<{ email: string }> = await r.json();
    for (const f of filas) if (f?.email) out.push(String(f.email).toLowerCase());
    if (filas.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// ============================================================
// AVISO POR CORREO (opcional)
// ============================================================

async function supaYaAvisadoHace24h(kind: string): Promise<boolean> {
  try {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_alerts?select=id&kind=eq.${encodeURIComponent(kind)}&notified=eq.true&created_at=gte.${encodeURIComponent(hace24h)}&limit=1`,
      { headers: SUPA_HEADERS },
    );
    if (!r.ok) return false;
    const j: unknown[] = await r.json();
    return j.length > 0;
  } catch {
    return false;
  }
}

async function enviarAvisoAdmin(subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) {
    console.warn('Aviso por correo omitido: falta RESEND_API_KEY o ADMIN_EMAIL (queda en sync_alerts)');
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [ADMIN_EMAIL], subject, html }),
    });
    if (!r.ok) {
      console.error('Resend devolvió error:', r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('enviarAvisoAdmin reventó:', e);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function correoCookieCaducada(finalUrl: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#f6f6f3;padding:32px;color:#1f2320;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;">
      <div style="font-size:12px;color:#a4553f;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:12px;">Alerta · La Huerta LAB</div>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;">La cookie de Skool caducó</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
        La sincronización de miembros no pudo comprobar nada: Skool nos devolvió la página de inicio de sesión, así que <code>SKOOL_AUTH_TOKEN</code> o <code>SKOOL_CLIENT_ID</code> están caducadas.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
        <strong>No se tocó la base de datos</strong>: nadie perdió el acceso. Pero la caché se irá quedando vieja, y quien entre nuevo a la comunidad tendrá que esperar a la comprobación en vivo del login.
      </p>
      <div style="background:#f2f4ef;border-left:3px solid #6d8a5a;border-radius:8px;padding:16px 20px;margin:22px 0;">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Cómo renovarla</div>
        <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.75;">
          <li>Abre <a href="https://www.skool.com/${SKOOL_GROUP}/-/members" style="color:#4f6b40;">skool.com/${SKOOL_GROUP}/-/members</a> en Chrome con la cuenta admin.</li>
          <li>DevTools (⌘⌥I) → <strong>Application</strong> → <strong>Cookies</strong> → <code>skool.com</code>.</li>
          <li>Copia <code>auth_token</code> y <code>client_id</code>.</li>
          <li>Supabase (proyecto de La Huerta LAB) → Edge Functions → Secrets.</li>
          <li>Actualiza <code>SKOOL_AUTH_TOKEN</code> y <code>SKOOL_CLIENT_ID</code>.</li>
          <li>Dispara un sync manual y comprueba que responde <code>ok:true</code>.</li>
        </ol>
      </div>
      <p style="font-size:12px;color:#6b6f68;margin:20px 0 0;">
        URL final detectada: <code>${escapeHtml(finalUrl)}</code><br/>
        No repetimos este aviso en 24 horas.
      </p>
    </div>
  </body></html>`;
}

// ============================================================
// ENTRY POINT
// ============================================================

Deno.serve(async (req) => {
  const inicio = Date.now();
  try {
    if (!SERVICE_KEY || !SUPABASE_URL) return jsonRes({ ok: false, error: 'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no disponibles' }, 500);
    if (!SKOOL_AUTH_TOKEN || !SKOOL_CLIENT_ID) return jsonRes({ ok: false, error: 'SKOOL_AUTH_TOKEN o SKOOL_CLIENT_ID no configurados' }, 500);

    let diagnostico = false;
    let force = false;
    try {
      if (req.method === 'POST') {
        const txt = await req.text();
        if (txt) {
          const body = JSON.parse(txt);
          diagnostico = body?.diagnostic === true;
          force = body?.force === true;
        }
      }
    } catch (e) {
      console.warn('Body ilegible, se asume modo cron:', e);
    }

    // ---- 1) buildId (y de paso, ¿sigue viva la cookie?) ----
    const { buildId, finalUrl, isLoginPage } = await fetchSkoolBuildId();
    console.log(`skool grupo=${SKOOL_GROUP} buildId=${buildId} login=${isLoginPage} modo=${diagnostico ? 'diagnóstico' : 'cron'}`);

    // ---- 1b) Cookie caducada → abortar SIN tocar nada ----
    // Este es el aborto que más importa: si degradáramos a la gente cada vez
    // que la cookie muere, un descuido de mantenimiento sacaría a 571 personas
    // que sí pagan. No sabemos nada, así que no cambiamos nada.
    if (isLoginPage) {
      const yaAvisado = await supaYaAvisadoHace24h('cookie_expired');
      const enviado = yaAvisado ? false : await enviarAvisoAdmin('La cookie de Skool caducó · La Huerta LAB', correoCookieCaducada(finalUrl));
      await supaInsertAlert('cookie_expired',
        'Skool redirigió al login: cookie de admin caducada. No se escribió nada en skool_members.',
        { modo: 'cron', url_final: finalUrl, correo_enviado: enviado, ya_avisado_24h: yaAvisado, duracion_ms: Date.now() - inicio },
        enviado);
      return jsonRes({
        ok: false, reason: 'cookie_expired',
        error: 'Skool nos devolvió la página de login: la cookie del admin caducó. No se modificó ninguna fila.',
        url_final: finalUrl, aviso_enviado: enviado, aviso_omitido_por_reciente: yaAvisado,
      }, 401);
    }

    // ---- 2) Escaneo de las CUATRO pestañas ----
    const porEmail = new Map<string, Miembro>();
    const filasPorPestana: Record<string, number> = {};
    // Filas de las que SÍ pudimos sacar un correo. La diferencia con
    // `filasPorPestana` es la gente que se queda fuera de la caché, y es el
    // número que vigila la salvaguarda (b): contar filas leídas no sirve,
    // porque leerlas y descartarlas da cobertura 1.00 mientras la tabla se
    // queda vacía.
    const resueltosPorPestana: Record<string, number> = {};
    const paginasPorPestana: Record<string, number> = {};
    const reportado: Conteos = {};
    const muestras: Record<string, unknown> = {};

    try {
      for (const pestana of PESTANAS) {
        let filas = 0;
        let resueltos = 0;
        let pagina = 0;
        for (let p = 1; p <= SAFETY_PAGES; p++) {
          pagina = p;
          const { usuarios, miembros, conteos, hasMore, muestraCruda } = await fetchPagina(buildId, pestana, p);
          if (p === 1) {
            if (muestraCruda) muestras[pestana] = muestraCruda;
            // Los conteos globales vienen iguales en todas las pestañas; nos
            // quedamos con los de la primera página que los traiga.
            for (const k of Object.keys(conteos) as Array<keyof Conteos>) {
              if (reportado[k] === undefined && conteos[k] !== undefined) reportado[k] = conteos[k];
            }
          }
          filas += usuarios.length;
          resueltos += miembros.length;
          for (const m of miembros) {
            const previo = porEmail.get(m.email);
            porEmail.set(m.email, previo ? fusionar(previo, m) : m);
          }
          console.log(`[${pestana}] p${p}: ${usuarios.length} usuarios, ${miembros.length} con email (únicos acumulados ${porEmail.size})`);
          if (!hasMore) break;
          if (p === SAFETY_PAGES) console.warn(`[${pestana}] tope de ${SAFETY_PAGES} páginas alcanzado: puede faltar gente`);
          if (diagnostico) break; // en diagnóstico solo la página 1 de cada pestaña
        }
        filasPorPestana[pestana] = filas;
        resueltosPorPestana[pestana] = resueltos;
        paginasPorPestana[pestana] = pagina;
      }
    } catch (e) {
      // Un 429 o un 5xx a mitad del escaneo deja un censo parcial. Escribirlo
      // es peor que no escribir nada: degradaría a quien no llegamos a leer.
      // En el original este throw no está envuelto y acaba en un 500 genérico.
      const msg = String((e as Error)?.message ?? e);
      console.error('Escaneo interrumpido:', msg);
      await supaInsertAlert('http_error',
        `Escaneo interrumpido, no se escribió nada: ${msg}`,
        { modo: 'cron', filas_por_pestana: filasPorPestana, resueltos_por_pestana: resueltosPorPestana, paginas_por_pestana: paginasPorPestana, unicos_hasta_el_fallo: porEmail.size, duracion_ms: Date.now() - inicio });
      return jsonRes({ ok: false, reason: 'skool_http_error', error: msg, escaneo_parcial: true, unicos_hasta_el_fallo: porEmail.size }, 502);
    }

    const miembros = [...porEmail.values()];
    const activos     = miembros.filter((m) => m.estado === 'active').length;
    const cancelando  = miembros.filter((m) => m.estado === 'cancelling').length;
    const deBaja      = miembros.filter((m) => m.estado === 'churned').length;
    const expulsados  = miembros.filter((m) => m.estado === 'banned').length;
    const conAcceso   = activos + cancelando; // cancelling CONSERVA el acceso
    const admins      = miembros.filter((m) => m.role === 'group-admin').length;
    const enDosPestanas = miembros.filter((m) => m.visto_en.length > 1).length;

    // ---- Niveles de gamificación (telemetría, no gating) ----
    // La distribución se calcula sobre quien HOY tiene acceso (activos +
    // cancelando), que es exactamente la población sobre la que actúa el umbral
    // de `skool-login`. Meter a los dados de baja y a los expulsados la
    // ensuciaría con gente que ya no entra por otro motivo, y dentro de un mes
    // nadie sabría leer el número.
    const conAccesoLista = miembros.filter((m) => m.estado === 'active' || m.estado === 'cancelling');
    const distribucionNiveles = distribucionDeNiveles(conAccesoLista);
    // Los `null` cuentan como "bajo el umbral" porque es lo que hará el login:
    // sin nivel legible no se abre la puerta. Van además separados en
    // `sin_nivel` dentro de la distribución para poder distinguir "no participa"
    // de "no lo pudimos leer".
    const bajoUmbral = conAccesoLista.filter((m) => (m.level ?? 0) < NIVEL_MINIMO).length;
    const conNivel = conAccesoLista.filter((m) => m.level !== null).length;
    if (conAccesoLista.length > 0 && conNivel === 0) {
      // No abortamos por esto, y es deliberado: el nivel no decide accesos AQUÍ,
      // y tumbar el sync por un dato secundario dejaría la caché entera vieja.
      // Pero si esto sale, `skool-login` estará denegando a TODA la comunidad
      // por `level_too_low`, así que es lo primero que hay que mirar.
      console.warn('NADIE trae nivel: user.metadata.spData no llegó o cambió de forma. Revisa leerGamificacion() ANTES de mirar nada más.');
    }
    const conteosAusentes = reportado.totalMembers === undefined;
    if (conteosAusentes) {
      // Única forma de enterarse de que Skool movió `renderData`: leer una clave
      // inexistente no lanza nada. Si esto salta, revisa `leerConteos()`.
      console.warn('renderData no trajo totalMembers: Skool pudo cambiar el esquema de conteos');
    }

    // ---- 3) Modo diagnóstico: enseña y no toca nada ----
    if (diagnostico) {
      await supaInsertAlert('run', 'diagnóstico ejecutado (no escribe)', {
        ok: false, modo: 'diagnostico', conteos_reportados: reportado, filas_por_pestana: filasPorPestana, duracion_ms: Date.now() - inicio,
      });
      return jsonRes({
        ok: true, modo: 'diagnostico', grupo: SKOOL_GROUP, buildId,
        conteos_reportados_por_skool: reportado,
        conteos_ausentes_en_renderData: conteosAusentes,
        filas_leidas_por_pestana: filasPorPestana,
        personas_resueltas_por_pestana: resueltosPorPestana,
        clasificacion_pagina1: { activos, cancelando, dados_de_baja: deBaja, expulsados, con_acceso: conAcceso, admins, en_dos_pestanas: enDosPestanas },
        // Solo de la página 1 de cada pestaña: sirve para comprobar que `spData`
        // sigue llegando, no para decidir el umbral. Ese número sale de la fila
        // de auditoría de una corrida completa.
        nivel_minimo: NIVEL_MINIMO,
        distribucion_niveles_pagina1: distribucionNiveles,
        bajo_umbral_pagina1: bajoUmbral,
        muestra: miembros.slice(0, 8).map((m) => ({
          email: m.email, estado: m.estado, role: m.role, visto_en: m.visto_en,
          churned_at: m.churned_at, banned_at: m.banned_at, access_until: m.access_until, billing_canceled: m.billing_canceled,
          level: m.level, points: m.points, points_to_next: m.points_to_next,
        })),
        estructura_cruda: muestras,
        notas: [
          'Los cuatro conteos salen de pageProps.renderData; totalPages sale de pageProps. En SAVIAS se leían del sitio equivocado y daban undefined en silencio.',
          'El estado se deriva de los campos de user.member, nunca de la pestaña: una persona sale en dos a la vez.',
          'cancelling CONSERVA el acceso hasta access_until. Nunca se revoca por billingCanceled.',
          'mbscpe (access_until) NO clasifica: es el fin del periodo en curso y lo trae todo el que paga. Solo billingCanceled marca cancelling.',
          'El correo sale de mbme, user.email, inviteEmail y searchAnswer por ese orden, y si ninguno sirve, de la encuesta (member.metadata.survey). Con mbme solo se resolvía el 29,4 %; con las cinco vías, el 99,8 %.',
          'El nivel sale de user.metadata.spData (el PERFIL), NO de user.member.metadata (la MEMBRESÍA). Si trae_spData es false, Skool movió el campo y el login denegará a todo el mundo.',
          'Aquí no hay gating por plan: plan_raw es informativo y no decide qué herramientas se ven.',
        ],
      });
    }

    // ---- 4) Salvaguardas antes de escribir ----

    // (a) Censo vacío: casi siempre es un fallo transitorio de Skool o un
    //     cambio de esquema, nunca una comunidad que se evaporó.
    if (activos === 0) {
      await supaInsertAlert('no_members',
        'El escaneo no encontró ni un solo activo; skool_members NO se tocó',
        { ok: false, modo: 'cron', conteos_reportados: reportado, filas_por_pestana: filasPorPestana, unicos: miembros.length, muestra: muestras, duracion_ms: Date.now() - inicio });
      return jsonRes({ ok: false, reason: 'no_members', error: 'Cero activos escaneados: no se escribió nada.', conteos_reportados_por_skool: reportado, estructura_cruda: muestras }, 409);
    }

    // (b) Cobertura: el propio Skool nos dice cuántos hay en la pestaña de
    //     activos. Si acabamos con bastantes menos, o la paginación se cortó a
    //     mitad, o estamos descartando gente al no encontrarle el correo.
    //     Esta es la salvaguarda que cubre el PRIMER sync, cuando todavía no
    //     hay auditoría anterior contra la que comparar.
    //
    //     Se mide sobre las filas RESUELTAS, no sobre las leídas. Con las
    //     leídas esta guarda daba 575/571 = 1.00 —verde— mientras solo 169 de
    //     esas 575 personas acababan en la tabla: la comprobación pasaba
    //     precisamente en el caso que tenía que cazar.
    const leidasActive    = filasPorPestana['active'] ?? 0;
    const resueltosActive = resueltosPorPestana['active'] ?? 0;
    const descartadosActive = leidasActive - resueltosActive;
    if (reportado.totalMembers !== undefined && resueltosActive < reportado.totalMembers * COBERTURA_MINIMA) {
      await supaInsertAlert('partial_scan',
        `Escaneo incompleto: ${resueltosActive} personas resueltas (de ${leidasActive} filas leídas) frente a ${reportado.totalMembers} que reporta Skool. No se escribió nada.`,
        { ok: false, modo: 'cron', filas_leidas_active: leidasActive, resueltos_active: resueltosActive, descartados_sin_email_active: descartadosActive, total_reportado: reportado.totalMembers, paginas_por_pestana: paginasPorPestana, duracion_ms: Date.now() - inicio });
      return jsonRes({
        ok: false, reason: 'partial_scan',
        error: `Resolvimos ${resueltosActive} de los ${reportado.totalMembers} activos que reporta Skool (${leidasActive} filas leídas, ${descartadosActive} sin correo); se aborta para no degradar a nadie.`,
        filas_leidas_active: leidasActive, resueltos_active: resueltosActive, descartados_sin_email_active: descartadosActive,
      }, 409);
    }

    // (c) CANARIO. Una caída fuerte de activos no suele ser gente que se va:
    //     es un campo que Skool renombró o una cookie a medio morir que
    //     devuelve páginas cortas. Ante la duda, no escribimos.
    const ultimo = await leerUltimoRunConExito();
    if (!force && ultimo && ultimo.activos > 0) {
      const caida = (ultimo.activos - activos) / ultimo.activos;
      if (caida > CAIDA_MAXIMA_ACTIVOS) {
        const pct = Math.round(caida * 100);
        await supaInsertAlert('canary_abort',
          `Canario: los activos cayeron ${pct} % (${ultimo.activos} → ${activos}). No se escribió nada.`,
          { ok: false, modo: 'cron', activos_ahora: activos, activos_antes: ultimo.activos, caida_pct: pct, referencia: ultimo.created_at, conteos_reportados: reportado, duracion_ms: Date.now() - inicio });
        return jsonRes({
          ok: false, reason: 'canary_abort',
          error: `Los activos cayeron ${pct} % desde el último sync con éxito (${ultimo.activos} → ${activos}). Se aborta sin escribir.`,
          activos_ahora: activos, activos_antes: ultimo.activos, referencia: ultimo.created_at,
          como_desbloquear: 'Si la caída es real, repite con {"force": true} en el body.',
        }, 409);
      }
    }

    // ---- 5) Escritura ----
    const escritos = await supaUpsertMiembros(miembros);

    // Quien ya estaba en la caché y no apareció en NINGUNA pestaña: no se le
    // borra ni se le degrada (no distinguimos "se borró la cuenta" de "esta
    // vez no salió"). Se reporta para revisarlo a mano; su `synced_at` se
    // queda viejo, que es la señal.
    let noVistos: string[] = [];
    try {
      const enCache = await supaSelectEmailsCache();
      noVistos = enCache.filter((e) => !porEmail.has(e));
    } catch (e) {
      console.warn('No se pudo calcular la lista de no vistos:', e);
    }

    const duracion = Date.now() - inicio;
    await supaInsertAlert('run',
      `sync ok: ${miembros.length} personas (${activos} activas, ${cancelando} cancelando, ${deBaja} de baja, ${expulsados} expulsadas); ${bajoUmbral} de las ${conAcceso} con acceso quedan bajo el nivel ${NIVEL_MINIMO}; ${duracion} ms`,
      {
        ok: true, modo: 'cron', grupo: SKOOL_GROUP,
        // `activos` es la clave que lee el canario del próximo sync. Si la
        // renombras, el canario deja de encontrar referencia y no protege nada.
        activos, cancelando, dados_de_baja: deBaja, expulsados,
        con_acceso: conAcceso, admins, total_unicos: miembros.length,
        en_dos_pestanas: enDosPestanas,
        filas_por_pestana: filasPorPestana, resueltos_por_pestana: resueltosPorPestana,
        descartados_sin_email_active: descartadosActive,
        paginas_por_pestana: paginasPorPestana,
        conteos_reportados: reportado, conteos_ausentes: conteosAusentes,
        // Distribución de niveles de quien tiene acceso: {"1":455,"2":56,...}.
        // Es el motivo de existir de esta parte: dentro de un mes se compara
        // esta fila con la de hoy y se decide si el umbral de NIVEL_MINIMO tiene
        // sentido, sin volver a bajarse las 20 páginas a mano. No la renombres:
        // quien la lea va a buscar la serie histórica por este nombre.
        distribucion_niveles: distribucionNiveles,
        nivel_minimo: NIVEL_MINIMO, bajo_umbral: bajoUmbral, con_nivel: conNivel,
        filas_escritas: escritos, no_vistos: noVistos.length,
        forzado: force, duracion_ms: duracion,
      });

    return jsonRes({
      ok: true, modo: 'cron', grupo: SKOOL_GROUP, buildId,
      total_unicos: miembros.length,
      activos, cancelando, dados_de_baja: deBaja, expulsados,
      con_acceso: conAcceso, admins, en_dos_pestanas: enDosPestanas,
      filas_escritas: escritos,
      no_vistos: noVistos.length,
      no_vistos_muestra: noVistos.slice(0, 20),
      filas_por_pestana: filasPorPestana,
      resueltos_por_pestana: resueltosPorPestana,
      descartados_sin_email_active: descartadosActive,
      conteos_reportados_por_skool: reportado,
      conteos_ausentes_en_renderData: conteosAusentes,
      // El mismo resumen que queda en la auditoría, para verlo sin abrir la
      // tabla cuando se dispara el sync a mano.
      nivel_minimo: NIVEL_MINIMO,
      distribucion_niveles: distribucionNiveles,
      bajo_umbral: bajoUmbral,
      forzado: force,
      duracion_ms: duracion,
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('sync-skool-members reventó:', err);
    await supaInsertAlert('http_error', msg, { modo: 'cron', duracion_ms: Date.now() - inicio });
    // Server-a-server: aquí sí devolvemos el detalle, porque quien lo lee es el
    // cron o Cristhian, no un navegador anónimo. En `skool-login` (pública con
    // la anon key) ese mismo detalle filtra URLs de Skool y trozos de HTML.
    return jsonRes({ ok: false, reason: 'server_error', error: msg }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Radar local — consume /api/* en vivo. Look RadarMVP + paginación numerada. */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const fmtCOP = (n) => (n ? '$' + Number(n).toLocaleString('es-CO') : '—');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const typeLbl = (t) => ({ apartment: 'Apartamento', house: 'Casa', commercial: 'Local', lot: 'Lote', farm: 'Finca', office: 'Oficina', warehouse: 'Bodega', parking: 'Parqueadero', building: 'Edificio', vehicle: 'Vehículo', rights: 'Derechos', other: 'Otros', others: 'Otros' }[t] || (t ? cap(t) : 'Inmueble'));
const srcLbl = (s) => ({ davivienda: 'Davivienda', bancolombia: 'Bancolombia', bbva: 'BBVA', aval: 'Aval', fincaraiz: 'FincaRaíz', rematandobienes: 'Rama Judicial' }[s] || s);
/**
 * Concuerda el sustantivo con el número, en vez de escribir «2 día(s)».
 *
 * El «(s)» es de formulario: lo pone quien no quiere decidir, y quien lee ve un
 * campo de base de datos en medio de un aviso sobre su dinero. El número ya está
 * ahí, así que no hay nada que decidir.
 */
const plural = (n, singular, varios) => `${n} ${Math.abs(Number(n)) === 1 ? singular : varios}`;
/** Icono del sprite SVG (index.html). Sustituye a los emoji: hereda color y tamaño del texto. */
const ic = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const srcIcon = (s) => ic(s === 'fincaraiz' ? 'home' : 'bank');
// `accion` es HTML ya formado y opcional: un estado de error sin forma de salir
// de él deja al usuario mirando un mensaje que le dice «reintenta» sin darle con
// qué. El resto de los estados vacíos no la necesitan y no la pasan.
const emptyState = (icon, title, description, tone = '', accion = '') => `
  <div class="empty-icon${tone ? ` is-${tone}` : ''}">${ic(icon, icon === 'alert-triangle' || icon === 'check-circle' ? 'ic-reicon' : '')}</div>
  <div class="h">${esc(title)}</div>
  <div>${esc(description)}</div>${accion}`;

/** El botón que repite la última carga, para los estados de error. */
const botonReintentar = () => '<button class="empty-retry" type="button" data-reintentar>Reintentar</button>';
// Oportunidad ALTA: la marca el motor (decil más barato + descuento grande +
// comparables homogéneos) y viaja en la columna is_high.
const isHighOpp = (d) => d.is_high === true;
const PAGE_SIZE = 24;
/**
 * Cuántos resultados devuelve una búsqueda hecha desde el buscador de arriba.
 *
 * Menos que los 24 de las pestañas, y a propósito: el cliente pidió que buscar
 * «ayude a encontrar» y no que vuelque el inventario. Veinte caben en una pantalla
 * que se lee, y el contador dice cuántos hay en total para que quede claro que la
 * vía de acercarse es afinar la búsqueda, no pasar páginas.
 *
 * No se cambió el 24 de las pestañas: quien entra por ellas no ha pedido nada y
 * está hojeando, que es otra intención.
 */
const PAGE_SIZE_BUSCADOR = 20;

const ORDERS = {
  portal: [['precio_asc', 'Precio menor'], ['discount_desc', 'Mayor descuento'], ['precio_m2_asc', 'Precio/m² menor'], ['precio_desc', 'Precio mayor'], ['recent', 'Más recientes']],
  bancos: [['precio_asc', 'Precio menor'], ['precio_m2_asc', 'Precio/m² menor'], ['precio_desc', 'Precio mayor'], ['recent', 'Más recientes']],
  remates: [['auction_asc', 'Audiencia próxima'], ['min_asc', 'Postura menor'], ['min_desc', 'Postura mayor']],
};

// La portada es la primera pantalla del producto: se entra por ella, no por el
// listado del portal. Debe coincidir con la pestaña marcada `active` en index.html.
// `total` y `mostrados` son el resultado de la última carga. Los pone `load()` y
// los lee `RadarBuscador.aplicar` para poder contestar «hay 84» a quien encargó la
// búsqueda desde fuera. Nulos mientras no se haya cargado nada.
const state = { tab: 'home', page: 1, loading: false, loadSeq: 0, pageSize: PAGE_SIZE, total: null, mostrados: 0 };
const GUEST_FAVS_KEY = 'radar_guest_favorites_v1';
const RADAR_PREFS_KEY = 'radar_preferences_v1';
const RADAR_SETUP_DISMISSED_KEY = 'radar_setup_dismissed_v1';
const RADAR_SIMULATIONS_KEY = 'radar_simulations_v1';
const RADAR_ALERT_KEY = 'radar_alert_v1';
/** Debe coincidir con CUPO_MENSUAL_FREE de server/cupo.ts. El servidor manda; esto es solo el texto. */
const CUPO_FREE_MENSUAL = 20;
// Expuesto para el recorrido guiado, que se carga después y lo necesita para no
// repetir la cifra a mano. Tenía escrito «20» y habría seguido diciéndolo el día
// que cambie el cupo, que es exactamente donde una cifra vieja se lee como una
// promesa incumplida.
window.CUPO_FREE_MENSUAL = CUPO_FREE_MENSUAL;
/** Ídem con CUPO_REPORTES_FREE de server/cupo-reportes.ts: es un cupo distinto del de fichas. */
const CUPO_REPORTES_MENSUAL = 20;

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}
function writeStoredJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
}

// ---------- Auth + favoritos ----------
const auth = { token: localStorage.getItem('radar_token') || null, user: null, account: null };
const favKey = (kind, id) => `${kind}:${id}`;
const guestFavorites = new Map(
  (Array.isArray(readStoredJson(GUEST_FAVS_KEY, [])) ? readStoredJson(GUEST_FAVS_KEY, []) : [])
    .filter((item) => item?.kind && item?.id && item?.property)
    .map((item) => [favKey(item.kind, item.id), item]),
);
const savedSimulations = new Map(
  (Array.isArray(readStoredJson(RADAR_SIMULATIONS_KEY, [])) ? readStoredJson(RADAR_SIMULATIONS_KEY, []) : [])
    .filter((item) => item?.key && item?.kind && item?.id && Number(item?.base) > 0)
    .map((item) => [String(item.key), item]),
);
let radarAlertDraft = (() => {
  const value = readStoredJson(RADAR_ALERT_KEY, null);
  return ['draft', 'active'].includes(value?.status) && typeof value?.city === 'string' ? value : null;
})();
const favSet = new Set(guestFavorites.keys()); // claves "kind:id"
const propertyCache = new Map();
const authHeaders = () => (auth.token ? { Authorization: `Bearer ${auth.token}` } : {});

/**
 * Renueva la sesión cuando el token de acceso ha caducado.
 *
 * El de acceso dura una hora. Antes no se renovaba nunca, así que a partir de la
 * hora la sesión se apagaba SIN AVISAR: el token seguía en el almacenamiento —la
 * barra superior seguía diciendo «Mi cuenta»— pero cada petición nueva llegaba
 * sin sesión válida y el servidor respondía como a un anónimo. El síntoma que se
 * veía era desconcertante: cambiabas el filtro de ciudad y el aviso pasaba de
 * «te quedan 18 de 20 fichas» a «crea tu cuenta gratis», estando registrado.
 *
 * Devuelve `true` si hay sesión utilizable después de intentarlo.
 */
let renovando = null;
async function renovarSesion() {
  const refresh = localStorage.getItem('radar_refresh');
  if (!refresh) return false;
  // Una sola renovación en vuelo: al caducar, TODAS las peticiones de la página
  // fallan a la vez —listado, favoritos, cuenta— y cada una pediría la suya.
  // Además el token de refresco es de un solo uso: la segunda petición llegaría
  // con uno ya gastado y cerraría la sesión de verdad.
  if (renovando) return renovando;
  renovando = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) return false;
      auth.token = d.token;
      localStorage.setItem('radar_token', d.token);
      if (d.refreshToken) localStorage.setItem('radar_refresh', d.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

/**
 * Cierra la sesión que ya no se puede renovar, DICIÉNDOLO.
 *
 * Dejarla morir en silencio es lo que producía el desconcierto: la interfaz
 * seguía tratando al usuario como registrado y el servidor no. Mejor decir qué
 * pasó y qué hacer.
 */
function sesionCaducada() {
  auth.token = null;
  auth.user = null;
  localStorage.removeItem('radar_token');
  localStorage.removeItem('radar_refresh');
  renderAuthBar();
  showToast('Tu sesión expiró. Vuelve a entrar para seguir con tu cuenta.');
}

/**
 * `fetch` que renueva la sesión y reintenta UNA vez si el token había caducado.
 *
 * Se detecta por dos vías, no solo por el 401: hay rutas —los listados— que a un
 * token caducado no le responden con error sino con los datos del plan anónimo,
 * y ese es justo el caso que se veía en pantalla.
 */
async function fetchConSesion(url, opciones = {}) {
  const pedir = () => fetch(url, { ...opciones, headers: { ...(opciones.headers || {}), ...authHeaders() } });
  let res = await pedir();
  if (res.status !== 401 || !auth.token) return res;
  if (await renovarSesion()) {
    res = await pedir();
    if (res.status !== 401) return res;
  }
  sesionCaducada();
  return res;
}

async function initAuth() {
  renderAuthBar();
  if (!auth.token) { paintFavs(); return; }
  try {
    // `fetchConSesion` y no `fetch` a secas: esta es la PRIMERA petición de la
    // página, así que es aquí donde se descubre que el token caducó mientras la
    // pestaña estaba cerrada. Antes se borraba la sesión al primer 401 sin
    // intentar renovarla, y entonces todo lo demás cargaba ya como anónimo.
    const res = await fetchConSesion('/api/favorites');
    if (res.status === 401) { sesionCaducada(); return; }
    const d = await res.json();
    auth.user = d.user || null;
    favSet.clear();
    (d.favorites || []).forEach((f) => favSet.add(favKey(f.kind, f.id)));
    await syncGuestFavorites();
    await syncAccountContext();
  } catch (e) { /* sin red: queda anónimo */ }
  renderAuthBar();
  paintFavs();
  renderRadarSetup();
}
async function syncGuestFavorites() {
  if (!auth.token || guestFavorites.size === 0) return;
  let complete = true;
  for (const item of guestFavorites.values()) {
    const key = favKey(item.kind, item.id);
    if (favSet.has(key)) continue;
    try {
      const response = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ kind: item.kind, id: item.id }),
      });
      const data = await response.json();
      if (response.ok && data.ok && data.favorited) favSet.add(key);
      else complete = false;
    } catch {
      complete = false;
    }
  }
  if (complete) {
    guestFavorites.clear();
    localStorage.removeItem(GUEST_FAVS_KEY);
    showToast('Tus guardados de este dispositivo ya están sincronizados.');
  }
}
async function syncAccountContext() {
  if (!auth.token) return;
  const response = await fetch('/api/account/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      preferences: radarPreferences.complete ? radarPreferences : null,
      simulations: savedSimulations.size ? [...savedSimulations.values()].slice(0, 50) : undefined,
      alertDraft: radarAlertDraft?.status === 'draft' ? radarAlertDraft : null,
    }),
  });
  if (!response.ok) return;
  const data = await response.json();
  if (!data.ok || !data.account) return;
  auth.account = data.account;
  if (!radarPreferences.complete && data.account.preferences) {
    radarPreferences = normalizeRadarPreferences(data.account.preferences);
    writeStoredJson(RADAR_PREFS_KEY, radarPreferences);
  }
  if (Array.isArray(data.account.simulations) && savedSimulations.size === 0) {
    data.account.simulations.forEach((item) => {
      if (item?.key) savedSimulations.set(String(item.key), item);
    });
    writeStoredJson(RADAR_SIMULATIONS_KEY, [...savedSimulations.values()]);
  }
  if (data.account.alerts?.[0]) {
    radarAlertDraft = { ...data.account.alerts[0], status: 'active' };
    persistRadarAlert();
  }
  darLaBienvenidaSiHaceFalta();
}

/**
 * La bienvenida de una cuenta nueva.
 *
 * SE DECIDE CON LA CUENTA, no con el navegador. Antes el recorrido guiado solo
 * salía si `localStorage` estaba limpio, así que quien miraba el Radar como
 * visitante y después se registraba ya lo tenía marcado como visto: se registraba
 * y no pasaba nada. Ni recorrido, ni preferencias, ni aviso de qué acababa de
 * conseguir. Y es al revés de lo que hace falta: al registrarse aparecen cosas que
 * como anónimo no existían —los guardados, las preferencias, el cupo del mes, el
 * asistente—, así que es cuando hay MÁS que explicar.
 *
 * La secuencia es una sola cosa a la vez, con un solo botón principal en cada
 * paso: primero qué acaba de conseguir, luego cómo funciona, luego que lo ajuste a
 * lo suyo. Encadenar los tres a la vez es lo que hace que la gente cierre todo.
 */
async function darLaBienvenidaSiHaceFalta() {
  const hitos = auth.account?.hitos;
  if (!Array.isArray(hitos) || hitos.includes('bienvenida')) return;
  // Se marca ANTES de mostrarla. Si se marcara al cerrarla, quien recarga la
  // página a media bienvenida la volvería a ver cada vez.
  await marcarHito('bienvenida');
  mostrarBienvenida();
}

/**
 * Deja constancia en la cuenta, no en el navegador.
 *
 * Las llamadas se encadenan, y no es un detalle: el servidor lee los hitos, añade
 * el nuevo y los reescribe. Dos peticiones a la vez —cerrar el recorrido marca uno
 * y abrir las preferencias marca otro, casi en el mismo instante— hacen que la
 * segunda lea antes de que la primera haya escrito, y el primer hito se pierde. Lo
 * detectó la prueba: quedaban «bienvenida» y «preferencias», sin «recorrido».
 */
let colaDeHitos = Promise.resolve();
function marcarHito(hito) {
  if (!auth.token) return Promise.resolve();
  colaDeHitos = colaDeHitos.then(async () => {
    try {
      const r = await fetchConSesion('/api/account/hito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hito }),
      });
      const d = await r.json();
      if (d.ok && auth.account) auth.account.hitos = d.hitos;
    } catch { /* si no se pudo guardar, lo peor que pasa es que se ofrezca otra vez */ }
  });
  return colaDeHitos;
}

/**
 * Qué acaba de conseguir al registrarse.
 *
 * Concreto y con cifras: «20 fichas al mes» dice más que «acceso a oportunidades
 * seleccionadas». Y dice lo que NO incluye, porque enterarse del límite al chocarse
 * con él es lo que hace que la gente se sienta engañada.
 */
function mostrarBienvenida() {
  const nombre = (auth.user?.name || '').split(' ')[0];
  const esPro = planActual() === 'suscrito';
  $('modal').setAttribute('aria-label', 'Tu cuenta está lista');
  $('modal-content').innerHTML = `
    <div class="bienvenida-marco">
    <div class="bienvenida">
      <span class="bv-sello">${ic('check-circle')} Cuenta creada</span>
      <h2>${nombre ? `${esc(nombre)}, tu` : 'Tu'} cuenta ya está lista</h2>
      <p class="bv-sub">${esPro
        ? 'Tienes acceso completo: todas las fichas, sin límite.'
        : 'Esto es lo que incluye tu plan gratuito, cada mes:'}</p>
      ${esPro ? '' : `<ul class="bv-lista">
        <li><strong>${CUPO_FREE_MENSUAL} fichas</strong> de oportunidad para abrir, las que tú elijas · en portales, bancos o remates</li>
        <li><strong>30 preguntas</strong> al asistente, que también revisa documentos y fotos</li>
        <li><strong>Guardados y alertas</strong> por correo, sin límite</li>
      </ul>
      <p class="bv-nota">Las fichas que abras quedan abiertas todo el mes: volver a mirarlas no gasta otra.</p>`}
      <div class="bv-acciones">
        <button type="button" class="bv-cta" data-bv="recorrido">Ver cómo funciona en 1 minuto</button>
        <button type="button" class="bv-secundaria" data-bv="cerrar">Explorar por mi cuenta</button>
      </div>
    </div>
    <!-- La misma ilustración del muro de registro, y a propósito: quien llega aquí
         acaba de venir de ahí, así que reconocerla cierra el recorrido en vez de
         presentarle una imagen nueva. Decorativa —lo que cuenta ya está escrito al
         lado—, de ahí el alt vacío: leerle a alguien con lector de pantalla la
         descripción de un adorno solo le hace perder el tiempo. -->
    <div class="bv-lamina" aria-hidden="true">
      <img src="/img/wall-radar.jpg" alt="" width="800" height="1200" loading="eager">
    </div>
    </div>`;
  showModal();
}

/**
 * Al cerrar la bienvenida se ofrece personalizar, no antes.
 *
 * Pedirle tres decisiones a alguien que todavía no sabe qué es el Radar es pedirle
 * que adivine. Después del recorrido ya sabe para qué sirven.
 */
/**
 * Lo llama `tour.js` al cerrarse el recorrido, venga de donde venga.
 *
 * Se marca el hito en la cuenta y se ofrece personalizar. Está aquí y no dentro del
 * recorrido porque el recorrido no sabe nada de cuentas ni de preferencias, y es
 * mejor que siga sin saberlo: es una capa de presentación sobre elementos que ya
 * existen.
 */
window.__alTerminarRecorrido = () => {
  void marcarHito('recorrido');
  invitarAPersonalizar();
};

// Reintentar tras un error de carga. Repite lo último que se pidió —la portada o
// el listado de la pestaña activa— sin recargar la página, para no perder los
// filtros que la persona ya había puesto.
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('[data-reintentar]')) return;
  if (state.tab === 'home') { void loadHome(); return; }
  void load(state.page || 1);
});

document.addEventListener('click', (e) => {
  const boton = e.target.closest?.('[data-bv]');
  if (!boton) return;
  closeModal();
  if (boton.dataset.bv === 'recorrido' && window.__radarTour) {
    setTimeout(() => window.__radarTour.abrir(), 250);
    return;
  }
  invitarAPersonalizar();
});

/** Marca de que ya se le ofreció personalizar. Se pregunta una vez, no en cada visita. */
const PERSONALIZACION_OFRECIDA = 'radar_personalizar_ofrecido_v1';

/**
 * Lleva al recién registrado a configurar su Radar.
 *
 * Es el momento correcto y no antes: la personalización se le ocultaba al
 * visitante anónimo —sus preferencias no sobrevivirían al navegador ni servirían
 * para las alertas— así que el registro es la primera vez que pedirle tres
 * decisiones tiene sentido. Y es cuando ya vio para qué sirven.
 *
 * Se ofrece UNA vez. Alguien que decidió no configurarlo no necesita que se lo
 * recuerden en cada visita; lo tiene siempre disponible en la pestaña de Portal.
 */
function invitarAPersonalizar() {
  if (!auth.token || radarPreferences.complete) return;
  // El hito vive en la cuenta; `localStorage` solo evita repetirlo dos veces en la
  // misma visita. Antes era al contrario y por eso quien había mirado el Radar como
  // visitante no recibía la invitación al registrarse: la marca del navegador ya
  // estaba puesta de aquella vez.
  if (auth.account?.hitos?.includes('preferencias')) return;
  try {
    if (sessionStorage.getItem(PERSONALIZACION_OFRECIDA)) return;
    sessionStorage.setItem(PERSONALIZACION_OFRECIDA, '1');
  } catch { /* sin almacenamiento se ofrece igual: es mejor que no ofrecerlo */ }
  void marcarHito('preferencias');
  // Se lleva al Portal, que es donde vive el panel, y se abre solo.
  setTimeout(() => {
    document.querySelector('.tab-btn[data-tab="portal"]')?.click();
    setTimeout(() => {
      radarSetupState.open = true;
      radarSetupState.step = 0;
      renderRadarSetup();
      $('radar-setup')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 1400);
  }, 700);
}
function renderAuthBar() {
  const el = $('authbar'); if (!el) return;
  if (auth.user) {
    const who = auth.user.name || (auth.user.email || '').split('@')[0];
    const plan = auth.account?.plan === 'pro' ? '<span class="auth-plan">Pro</span>' : '';
    el.innerHTML = `<a class="auth-user" href="/cuenta">${ic('user')}${esc(who)}${plan}</a><a class="auth-link" href="/planes">Planes</a><button class="auth-link" id="auth-logout"><span>Salir</span></button>`;
    $('auth-logout').addEventListener('click', () => {
      localStorage.removeItem('radar_token'); localStorage.removeItem('radar_refresh'); location.reload();
    });
  } else {
    el.innerHTML = `<a class="auth-link" href="/planes">Planes</a><a class="auth-link primary" href="/login">${ic('user')}<span>Ingresar</span></a>`;
  }
  aplicarVisibilidadDeCuenta();
  updateFavCount();
}

/**
 * Esconde de la interfaz lo que solo tiene sentido con cuenta.
 *
 * Guardados y la personalización del Radar quedan fuera para un visitante sin
 * registrar. No es una restricción comercial —explorar sigue siendo libre— sino
 * de coherencia: unos favoritos que viven en el navegador se pierden al cambiar
 * de dispositivo, y unas preferencias sin cuenta no pueden alimentar las alertas
 * por correo porque no hay a quién escribirle. Ofrecerlos antes de tiempo es
 * prometer una continuidad que el producto no puede cumplir.
 *
 * La pestaña de Guardados se oculta junto con el corazón de las tarjetas: dejar
 * uno sin el otro sería dar un botón de guardar que no lleva a ninguna parte.
 */
function aplicarVisibilidadDeCuenta() {
  const conCuenta = !!auth.token;
  document.body.classList.toggle('sin-cuenta', !conCuenta);
  const guardados = document.querySelector('.tab-btn[data-tab="guardados"]');
  if (guardados) guardados.hidden = !conCuenta;
  // Si estaba mirando Guardados y cierra sesión, se le devuelve a la portada en
  // vez de dejarlo en una pestaña que ya no existe.
  if (!conCuenta && state.tab === 'guardados') {
    document.querySelector('.tab-btn[data-tab="home"]')?.click();
  }
}
function updateFavCount() { const c = $('c-guardados'); if (c) c.textContent = favSet.size; }
function persistGuestFavorites() {
  writeStoredJson(GUEST_FAVS_KEY, [...guestFavorites.values()]);
}
function favoriteSnapshot(kind, property) {
  const featureData = property.features || {};
  return {
    id: property.id,
    _kind: kind,
    source: property.source,
    type: property.type,
    property_type: property.property_type,
    city: property.city,
    department: property.department,
    zone: property.zone,
    area_m2: property.area_m2,
    price: property.price,
    price_per_m2: property.price_per_m2,
    minimum_bid: property.minimum_bid,
    appraisal_value: property.appraisal_value,
    minimum_bid_pct: property.minimum_bid_pct,
    auction_date: property.auction_date,
    auction_mode: property.auction_mode,
    cuota_parte: property.cuota_parte,
    image_url: property.image_url,
    discount_pct: property.discount_pct,
    is_opportunity: property.is_opportunity,
    is_high: property.is_high,
    _bloqueada: property._bloqueada,
    last_seen_at: property.last_seen_at,
    updated_at: property.updated_at,
    features: {
      bedrooms: featureData.bedrooms,
      bathrooms: featureData.bathrooms,
      garages: featureData.garages,
      stratum: featureData.stratum,
    },
  };
}
function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  window.clearTimeout(showToast.timer);
  toast.textContent = message;
  toast.classList.add('show');
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 3200);
}
function favBtn(kind, id) {
  const on = favSet.has(favKey(kind, id));
  const label = on ? 'Quitar de guardados' : 'Guardar inmueble';
  return `<button class="fav-btn ${on ? 'on' : ''}" data-fav="${esc(favKey(kind, id))}" data-fav-kind="${esc(kind)}" data-fav-id="${esc(id)}" title="${label}" aria-label="${label}">${ic('heart')}</button>`;
}
function modalFavBtn(kind, id) {
  const on = favSet.has(favKey(kind, id));
  return `<button class="modal-fav fav-btn ${on ? 'on' : ''}" data-fav="${esc(favKey(kind, id))}" data-fav-kind="${esc(kind)}" data-fav-id="${esc(id)}">${ic('heart')}<span>${on ? 'Guardado' : 'Guardar'}</span></button>`;
}
function paintFavs() {
  document.querySelectorAll('.fav-btn[data-fav]').forEach((b) => {
    const on = favSet.has(b.dataset.fav);
    b.classList.toggle('on', on);
    b.title = on ? 'Quitar de guardados' : 'Guardar inmueble';
    b.setAttribute('aria-label', on ? 'Quitar de guardados' : 'Guardar inmueble');
    const lbl = b.querySelector('span');
    if (lbl) lbl.textContent = on ? 'Guardado' : 'Guardar';
  });
}
window.__toggleFav = async function (ev, kind, id) {
  ev.stopPropagation(); ev.preventDefault();
  const k = favKey(kind, id);
  const wasOn = favSet.has(k);
  if (!auth.token) {
    if (wasOn) {
      favSet.delete(k);
      guestFavorites.delete(k);
      showToast('Quitado de tus guardados.');
    } else {
      const property = propertyCache.get(k);
      if (!property) {
        showToast('Abre de nuevo el inmueble para guardarlo.');
        return;
      }
      favSet.add(k);
      guestFavorites.set(k, { kind, id, property: favoriteSnapshot(kind, property) });
      showToast('Guardado en este dispositivo. Puedes sincronizarlo al crear tu cuenta.');
    }
    persistGuestFavorites();
    paintFavs();
    updateFavCount();
    renderRadarSetup();
    if (state.tab === 'guardados') loadGuardados();
    return;
  }
  if (wasOn) favSet.delete(k); else favSet.add(k); // optimista
  paintFavs(); updateFavCount();
  try {
    const res = await fetch('/api/favorites/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ kind, id }),
    });
    if (res.status === 401) { auth.token = null; localStorage.removeItem('radar_token'); location.href = '/login'; return; }
    const d = await res.json();
    if (d.ok) { if (d.favorited) favSet.add(k); else favSet.delete(k); }
    else { if (wasOn) favSet.add(k); else favSet.delete(k); } // revertir
  } catch { if (wasOn) favSet.add(k); else favSet.delete(k); }
  paintFavs(); updateFavCount();
  if (state.tab === 'guardados') loadGuardados(); // refresca la vista de guardados
};
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('.fav-btn[data-fav-kind]') : null;
  if (!target) return;
  window.__toggleFav(event, target.dataset.favKind, target.dataset.favId);
});

// ---------- Freemium (captura de email) ----------
// Anónimo: ve la grilla y datos básicos de la ficha, pero dirección exacta,
// datos del proceso, descripción completa y análisis con IA quedan bloqueados.
// Registrado: 20 fichas de oportunidad al mes (server/cupo.ts). Suscrito: todo.
//
// El muro NO se dispara por número de vistas. Se decide en el servidor por la
// CATEGORÍA del Índice CRECE de cada ficha (server/acceso.ts) más el cupo mensual,
// que es más difícil de burlar: contar vistas en el navegador se salta borrando
// `localStorage`, y además hacía que los datos de pago viajaran igual al cliente.
// El registro de vistas se conserva solo como señal de uso, no como puerta.
function viewedIds() {
  try { return new Set(JSON.parse(localStorage.getItem('radar_viewed') || '[]')); } catch { return new Set(); }
}
function recordView(id) {
  const s = viewedIds(); s.add(id);
  try { localStorage.setItem('radar_viewed', JSON.stringify([...s].slice(-100))); } catch (e) {}
}
/**
 * Antes había un cupo de 5 fichas por visitante. La spec lo reemplazó: el acceso
 * ya no se mide por cantidad sino por la CATEGORÍA del Índice CRECE, y lo decide
 * el servidor (las fichas de pago llegan ya sin dirección ni enlace). Aquí solo
 * queda el registro de vistas, que sigue sirviendo para la analítica.
 */
function gateFicha(id) {
  if (!auth.token) recordView(id);
  return true;
}
function lockBox(label, sub) {
  return `<div class="section"><a class="lockbox" href="/login">
    <span class="lock-ic">${ic('lock')}</span>
    <div class="lock-txt"><strong>${esc(label)}</strong><span>${esc(sub || 'Regístrate gratis para verlo')}</span></div>
    <span class="lock-cta">Desbloquear</span>
  </a></div>`;
}
function showRegisterWall(count) {
  gImgs = [];
  const total = STATS ? STATS.portal_opps.toLocaleString('es-CO') : 'miles de';
  $('modal-content').innerHTML = `<div class="wall">
    <figure class="wall-art">
      <img src="/img/wall-radar.jpg" alt="Vista aérea de un barrio en penumbra donde un barrido de radar ilumina unas pocas propiedades" width="900" height="1350">
      <figcaption>El radar revisa el barrio entero y solo señala las pocas que están bajo el precio de su zona.</figcaption>
    </figure>
    <div class="wall-body">
      <span class="wall-eyebrow">${ic('lock')} Límite gratuito</span>
      <h2>Ya viste ${count} oportunidades</h2>
      <p>Crea tu cuenta <strong>gratis</strong> y abre ${CUPO_FREE_MENSUAL} fichas completas cada mes, de las ${total} que el radar tiene marcadas hoy.</p>
      <ul class="wall-list">
        <li>${ic('check')} ${CUPO_FREE_MENSUAL} fichas completas al mes, con dirección y fotos</li>
        <li>${ic('check')} Análisis con IA contra los comparables del barrio</li>
        <li>${ic('check')} Guarda tus favoritas y vuelve a ellas</li>
      </ul>
      <a class="wall-cta" href="/login">Crear cuenta gratis</a>
      <a class="wall-alt" href="/login">Ya tengo cuenta · Iniciar sesión</a>
    </div>
  </div>`;
  showModal();
}

// ---------- Onboarding ----------
/**
 * Tutorial de bienvenida.
 *
 * Reusa `#modal` con el mismo molde que `showRegisterWall`: vaciar `gImgs` para
 * neutralizar la galería, inyectar el bloque y llamar a `showModal()`. Así hereda
 * gratis el foco inicial, la trampa de Tab, el cierre con ESC y con el fondo, y la
 * devolución del foco al elemento que lo abrió.
 *
 * Los videos todavía no existen: `src` vacío pinta un marcador. Para publicarlos
 * basta dejar el archivo en `server/public/radar/` y poner su ruta aquí — no hay
 * que tocar nada más.
 */
/**
 * La tabla maestra del Índice CRECE, tal como está en la especificación.
 *
 * Es la misma de `engine/crece.ts` recortada a lo que se puede FILTRAR: llega
 * hasta «Precio de Mercado» y ni una más. Las categorías por encima del mercado
 * —Sobreprecio, Fuera de Mercado— se siguen calculando y se ven en la ficha,
 * porque son parte del veredicto, pero ofrecerlas como destino de búsqueda sería
 * invitar a buscar justo lo que el Radar existe para evitar.
 *
 * Las estrellas son las de la tabla del cliente: tres para Oportunidad Fuerte,
 * dos para Oportunidad, una para Interesante y una hueca para Abajo del Mercado
 * —que es «una estrella blanca» en el documento—. De «Precio de Mercado» hacia
 * abajo no hay estrellas porque no hay nada que destacar.
 *
 * Vive aquí duplicada a propósito: el cliente no importa del motor (no hay
 * empaquetador) y `server/crece-tabla.test.ts` comprueba que las dos copias
 * digan lo mismo, que es lo que evita que se separen en silencio.
 */
// El `umbral` sale de los cortes de `engine/crece.ts` (0,75 · 0,80 · 0,90 · 0,93):
// un índice de 0,75 es estar un 25% por debajo. Se escribe aquí porque la leyenda
// decía «más estrellas, más por debajo» sin un solo número, y sin números nadie
// puede saber si tres estrellas son un 12% o un 40%. Si esos cortes cambian en el
// motor, hay que tocar esta columna: son los mismos cuatro valores.
const TABLA_CRECE = [
  { tier: 'oportunidad_fuerte', lectura: 'Oportunidad Fuerte', estrellas: 3, huecas: 0, estrellasTexto: '★★★', umbral: '25% o más por debajo' },
  { tier: 'oportunidad', lectura: 'Oportunidad', estrellas: 2, huecas: 0, estrellasTexto: '★★', umbral: 'entre 20% y 25%' },
  { tier: 'interesante', lectura: 'Interesante', estrellas: 1, huecas: 0, estrellasTexto: '★', umbral: 'entre 10% y 20%' },
  { tier: 'abajo_mercado', lectura: 'Abajo del Mercado', estrellas: 0, huecas: 1, estrellasTexto: '☆', umbral: 'menos del 10%' },
  { tier: 'mercado_borde_bajo', lectura: 'Ligeramente por debajo del mercado', estrellas: 0, huecas: 0, estrellasTexto: '' },
  { tier: 'mercado', lectura: 'Precio de Mercado', estrellas: 0, huecas: 0, estrellasTexto: '' },
];
const CRECE_POR_TIER = new Map(TABLA_CRECE.map((t) => [t.tier, t]));

/** Desde qué descuento vale la pena escribir la cifra en la tarjeta. */
const MIN_DESCUENTO_MOSTRABLE = 8;

/**
 * Las estrellas de la tabla maestra, en la tarjeta.
 *
 * Es el mismo lenguaje que el cliente tiene en su documento de especificación, y
 * el que la ficha ya usa por dentro: llevarlo a la tarjeta hace que se pueda
 * comparar una lista entera de un vistazo sin abrir nada. El porcentaje de
 * descuento dice CUÁNTO; las estrellas dicen QUÉ TAN BUENO es ese cuánto contra
 * el mercado de su zona, que no es lo mismo.
 *
 * De «Precio de Mercado» hacia abajo no se pinta nada: cero estrellas es la
 * ausencia de la etiqueta, no una etiqueta vacía.
 */
/**
 * «×10 iguales»: hay más avisos idénticos a este.
 *
 * Se dice en vez de callarlo porque el servidor colapsó las copias y el usuario
 * no debería tener que adivinar por qué el listado tiene menos tarjetas que
 * resultados dice el contador. Además es información útil: diez lotes iguales en
 * el mismo proyecto significa que hay stock, y eso cambia cómo se negocia.
 */
function selloIguales(p) {
  const n = Number(p._iguales);
  if (!Number.isFinite(n) || n < 2) return '';
  return ` <span class="card-iguales" title="Hay ${n} avisos iguales a este, del mismo proyecto">×${n} iguales</span>`;
}

/**
 * La valoración con estrellas, en la ficha y arriba.
 *
 * Estaba solo en la tarjeta del listado, así que al abrir la ficha desaparecía
 * justo la única cosa que el producto afirma sobre ese inmueble. El cliente lo
 * pidió dos veces: «me harían falta las estrellas» y «eso es lo que realmente aquí
 * se vende, esto se sube».
 *
 * NO se muestra el Índice CRECE numérico. Es interno —«el índice es un índice, es
 * interno»— y un 0,62 no significa nada para quien mira; las estrellas y el nombre
 * de la categoría sí.
 */
function selloCreceFicha(p) {
  const c = CRECE_POR_TIER.get(p.crece_tier);
  if (!c) return '';
  const d = p.discount_pct != null ? Math.round(Number(p.discount_pct)) : null;
  return `<div class="ficha-crece${p.crece_tier === 'oportunidad_fuerte' ? ' es-fuerte' : ''}">
    <span class="fc-estrellas" aria-hidden="true">${c.estrellasTexto}</span>
    <span class="fc-lectura">${esc(c.lectura)}</span>
    ${d != null && d > 0 ? `<span class="fc-desc">${d}% por debajo de los precios de su sector</span>` : ''}
  </div>`;
}

function selloCrece(p) {
  const t = CRECE_POR_TIER.get(p?.crece_tier);
  if (!t || (!t.estrellas && !t.huecas)) return '';
  const llenas = '★'.repeat(t.estrellas);
  const huecas = '☆'.repeat(t.huecas);
  return `<span class="crece-sello nivel-${esc(t.tier)}" title="${esc(t.lectura)}">`
    + `<span class="crece-estrellas" aria-hidden="true">${llenas}${huecas}</span>`
    + `<span class="crece-lectura">${esc(t.lectura)}</span></span>`;
}

const ONBOARDING_KEY = 'radar_onboarding_v1';

/**
 * Pasos del tutorial, en orden.
 *
 * Cada uno es una tarjeta. Los que llevan `video` muestran el reproductor; los
 * demás, una ilustración de texto. `src` vacío pinta un marcador: para publicar un
 * video basta dejar el archivo en `server/public/radar/` y poner aquí su ruta.
 */
/**
 * El tutorial es un RECORRIDO por la herramienta, no una explicación de ella.
 *
 * Cada paso corresponde a un apartado real y termina con un botón que lleva allí,
 * así que quien lo sigue acaba habiendo visitado el producto entero. La versión
 * anterior explicaba conceptos —«mira el descuento, no el precio»— sin enseñar
 * dónde estaba nada, y el cliente lo describió bien en la reunión: quien llega es
 * alguien que «tal vez nunca haya comprado nada, viene y necesita ubicarse».
 *
 * Las cifras salen de `STATS`, es decir del inventario de hoy. Un tutorial que
 * dice «buscamos en varios portales» es un folleto; uno que dice «108.060 avisos
 * del mercado abierto» está enseñando el producto.
 */
const ONBOARDING_PASOS = [
  {
    etiqueta: 'Bienvenido',
    icono: 'radar',
    titulo: 'El Radar compara contra el barrio, no contra el país',
    texto: 'Cada inmueble se mide contra el precio real de ofertas parecidas en su propia zona. Por eso un descuento aquí significa algo: no es una rebaja sobre un promedio nacional que no le sirve a nadie.',
    puntos: [
      'Tres mercados distintos en un mismo lugar: Portal, Bancos y Remates',
      'El Índice CRECE dice cuánto está por debajo de su mercado',
    ],
    video: { src: '', poster: '', pie: 'Qué encuentra el Radar y de dónde salen los inmuebles.' },
  },
  {
    etiqueta: 'Inicio',
    icono: 'radar',
    titulo: 'Lo mejor de la semana, ya seleccionado',
    texto: 'La portada trae tres listas —portal, bancos y remates— con lo más destacado de cada fuente. Cada ficha dice por qué está ahí, para que puedas discutir el criterio en vez de creértelo.',
    puntos: ['Se renueva cada semana', 'El orden de los remates es por riesgo jurídico, no por descuento'],
    ir: 'home',
  },
  {
    etiqueta: 'Portal',
    icono: 'home',
    titulo: 'El mercado abierto, filtrado con criterio',
    cifra: (s) => (s?.portal_total ? `${s.portal_total.toLocaleString('es-CO')} avisos` : null),
    texto: 'Todo lo que se publica en el portal inmobiliario, con el descuento calculado contra su propia zona. Aquí es donde filtras por ciudad, barrio, precio, área, habitaciones o estrato.',
    puntos: ['Se puede llamar y visitar hoy mismo', 'Es la referencia con la que se miden las otras dos fuentes'],
    ir: 'portal',
  },
  {
    etiqueta: 'Bancos',
    icono: 'bank',
    titulo: 'Inmuebles que los bancos quieren soltar',
    cifra: (s) => (s?.bancos ? `${s.bancos.toLocaleString('es-CO')} activos` : null),
    // Antes seguía «en Colombia el descuento es más moderado…». Se retiró: adelanta
    // un juicio sobre el descuento que le toca al índice inmueble por inmueble, y
    // puede desmentirlo la propia lista que hay debajo.
    texto: 'Propiedades que los bancos recibieron de clientes que no pudieron pagar su crédito y ahora quieren vender.',
    puntos: ['Puedes filtrar por entidad', 'El estrato no excluye: si el banco no lo reporta, la ficha se muestra igual'],
    ir: 'bancos',
  },
  {
    etiqueta: 'Remates',
    icono: 'scale',
    titulo: 'Subastas judiciales, con su riesgo a la vista',
    cifra: (s) => (s?.remates ? `${s.remates.toLocaleString('es-CO')} remates` : null),
    texto: 'Inmuebles que un juez va a rematar, con su fecha de audiencia. La ley fija la base de todas las subastas en el 70% del avalúo, así que el descuento no distingue: lo que cambia entre una y otra es el riesgo del título.',
    puntos: [
      'Se ordenan por demandante bancario primero: título más limpio',
      'Si solo se remata una parte del bien, la ficha lo avisa en amarillo',
    ],
    ir: 'remates',
  },
  {
    etiqueta: 'Tu cuenta',
    icono: 'user',
    titulo: 'Guarda, compara y vuelve',
    texto: `Explorar es libre y sin cuenta. Con una cuenta gratuita abres ${CUPO_FREE_MENSUAL} fichas completas al mes —dirección, fotos, comparables y análisis— y las que abres quedan abiertas.`,
    puntos: [
      'Guarda con el corazón y vuelve desde Guardados',
      'Alertas semanales por correo de lo que aparezca en tu zona',
    ],
    video: { src: '', poster: '', pie: 'Cómo leer una ficha completa y qué revisar antes de decidir.' },
  },
];

/** Paso que se está mostrando. Vive aquí y no en el DOM para poder volver atrás. */
let onboardingPaso = 0;

function onboardingMedia(paso) {
  if (!paso.video) return '';
  const cuerpo = paso.video.src
    ? `<video class="ob-video-player" controls preload="metadata"${paso.video.poster ? ` poster="${esc(paso.video.poster)}"` : ''}>
         <source src="${esc(paso.video.src)}" type="video/mp4">
         Tu navegador no puede reproducir este video.
       </video>`
    : `<div class="ob-video-pendiente">${ic('clock')}<span>Video en preparación</span></div>`;
  return `<figure class="ob-media">${cuerpo}<figcaption>${esc(paso.video.pie)}</figcaption></figure>`;
}

/**
 * Pinta UN paso dentro del diálogo ya abierto.
 *
 * Se repinta solo el interior de la tarjeta, no el diálogo entero: así el modal no
 * se cierra ni parpadea al avanzar, y el foco puede moverse al botón que
 * corresponde sin que el navegador lo pierda entre repintados.
 */
function renderOnboardingPaso() {
  const total = ONBOARDING_PASOS.length;
  const i = Math.min(Math.max(onboardingPaso, 0), total - 1);
  const paso = ONBOARDING_PASOS[i];
  const ultimo = i === total - 1;

  const puntos = paso.puntos
    ? `<ul class="ob-puntos">${paso.puntos.map((x) => `<li>${ic('check')}${esc(x)}</li>`).join('')}</ul>`
    : '';

  // La cifra sale del inventario de hoy. Si las estadísticas aún no han llegado
  // se omite la línea entera: mejor un paso sin número que un número inventado.
  const cifra = typeof paso.cifra === 'function' ? paso.cifra(STATS) : null;

  $('modal-content').innerHTML = `<div class="onboarding">
    <div class="ob-tarjeta">
      <div class="ob-cab">
        <span class="ob-icono">${ic(paso.icono || 'spark')}</span>
        <div class="ob-cab-txt">
          <span class="ob-eyebrow">${esc(paso.etiqueta)}</span>
          ${cifra ? `<span class="ob-cifra">${esc(cifra)} en el Radar hoy</span>` : ''}
        </div>
      </div>
      <h2>${esc(paso.titulo)}</h2>
      ${onboardingMedia(paso)}
      <p class="ob-texto">${esc(paso.texto)}</p>
      ${puntos}
      ${paso.ir ? `<button class="ob-ir" type="button" data-onboarding-ir="${esc(paso.ir)}">${ic('arrow')}Ver esta sección</button>` : ''}
    </div>
    <nav class="ob-nav" aria-label="Avance del tutorial">
      <ol class="ob-puntitos">${ONBOARDING_PASOS.map((p, n) => `<li class="${n === i ? 'is-activo' : n < i ? 'is-visto' : ''}"><span class="sr-only">${esc(p.etiqueta)}: paso ${n + 1} de ${total}</span></li>`).join('')}</ol>
      <div class="ob-botones">
        ${i > 0 ? '<button class="ob-atras" type="button" data-onboarding-atras>Atrás</button>' : '<button class="ob-atras" type="button" data-onboarding-cerrar>Saltar</button>'}
        <button class="ob-cta" type="button" ${ultimo ? 'data-onboarding-cerrar' : 'data-onboarding-siguiente'}>${ultimo ? 'Empezar a explorar' : 'Siguiente'}</button>
      </div>
    </nav>
    <p class="ob-nota">Paso ${i + 1} de ${total} · puedes volver cuando quieras con <strong>Ver tutorial</strong>, arriba a la derecha.</p>
  </div>`;
}

/** Mueve el foco al botón de avanzar, para poder recorrer el tutorial con Enter. */
function enfocarAvanceOnboarding() {
  requestAnimationFrame(() => document.querySelector('.ob-cta')?.focus({ preventScroll: true }));
}

function abrirOnboarding() {
  gImgs = [];
  onboardingPaso = 0;
  $('modal').setAttribute('aria-label', 'Cómo usar el Radar');
  renderOnboardingPaso();
  showModal();
}

function avanzarOnboarding(delta) {
  onboardingPaso = Math.min(Math.max(onboardingPaso + delta, 0), ONBOARDING_PASOS.length - 1);
  renderOnboardingPaso();
  enfocarAvanceOnboarding();
}

/** Marca el tutorial como visto para que no vuelva a salir solo. */
function marcarOnboardingVisto() {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* modo privado */ }
}

// ---------- Filtros ----------
const mobileQuery = window.matchMedia('(max-width: 760px)');
function setFiltersOpen(open) {
  const controls = document.querySelector('.controls');
  const toggle = $('filters-toggle');
  if (!controls || !toggle) return;
  controls.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
}
function updateFilterCount() {
  const badge = $('filter-count');
  if (!badge) return;
  const active = Object.entries(readFilters()).filter(([key, value]) => key !== 'order' && value).length;
  badge.textContent = String(active);
  badge.hidden = active === 0;
}
function setResultText(text) {
  $('count').textContent = text;
  if ($('mobile-count')) $('mobile-count').textContent = text;
}

/**
 * Qué región de la página manda en cada pestaña.
 *
 * La portada y el listado son dos espacios distintos y nunca conviven: dejar el
 * listado debajo obligaría a hacer scroll por una grilla de resultados vieja para
 * llegar al pie de los destacados. El enlace de salto se mueve con ellos, o quien
 * navega con teclado acabaría enfocando la región escondida.
 *
 * El buscador de arriba vive con la portada y solo con ella. En Portal, Bancos o
 * Remates la persona ya está dentro de una fuente y tiene su panel de filtros a la
 * vista: repetir arriba tres de esos mismos filtros no añade nada y quita sitio a
 * las tarjetas, que son el producto. Se apaga por el mismo camino que todo lo
 * demás —esta función— para no tener dos maneras distintas de decidir qué se ve.
 */
function aplicarVistaDePestana() {
  const enHome = state.tab === 'home';
  const home = $('home');
  const workspace = $('search-workspace');
  const buscador = $('buscador');
  if (home) home.hidden = !enHome;
  if (workspace) workspace.hidden = enHome;
  if (buscador) buscador.hidden = !enHome;
  const salto = $('skip-link');
  if (salto) {
    salto.setAttribute('href', enHome ? '#home' : '#results');
    salto.textContent = enHome ? 'Saltar a los destacados' : 'Saltar a los resultados';
  }
}

async function buildFilters() {
  const tab = state.tab;
  const controls = document.querySelector('.controls');
  const workspace = $('search-workspace');
  const filtersAreRelevant = tab !== 'guardados' && tab !== 'home';
  if (controls) controls.hidden = !filtersAreRelevant;
  if (workspace) workspace.classList.toggle('is-results-only', !filtersAreRelevant);
  // La portada no filtra nada: es una selección, no una búsqueda.
  if (tab === 'guardados' || tab === 'home') {
    $('filters').innerHTML = '';
    updateFilterCount();
    return;
  }
  // El orden va PRIMERO, antes que cualquier filtro. Estaba al final de la
  // columna, debajo de precio, área, habitaciones y estrato, así que había que
  // bajar hasta el fondo para cambiar lo primero que uno quiere cambiar. Vale
  // para las tres secciones, así que se pinta aquí y no en cada rama.
  let html = `<div class="f"><label for="f-order">Orden</label><select id="f-order">`
    + `${ORDERS[tab].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>`;
  if (tab !== 'remates') {
    const fc = await fetch(`/api/facets?source=${tab === 'portal' ? 'portal' : 'bancos'}`).then((r) => r.json());
    html += fSelect('city', 'Ciudad', fc.cities);
    // El barrio nace APAGADO y sin opciones. Ofrecerlos todos —los de las 77
    // ciudades juntos— no acota nada: en la misma lista salían barrios de Pereira
    // y de Bogotá, y elegir uno sin haber dicho la ciudad no significa nada. Se
    // llena solo cuando hay ciudad, en `repopZones`.
    if (tab === 'portal') html += fSelectDependiente('zone', 'Barrio', 'Elige una ciudad primero');
    html += fSelect('type', 'Tipo', fc.types, typeLbl);
    // En Bancos, la entidad es lo primero que la gente quiere acotar: cada banco
    // publica su cartera con criterios distintos. Solo se listan las que hoy
    // tienen inventario, con cuántas fichas trae cada una, para que se vea de
    // antemano si acotar merece la pena.
    if (tab === 'bancos' && (fc.banks || []).length > 1) {
      const opts = ['<option value="">Todos los bancos</option>'].concat(
        fc.banks.map((b) => `<option value="${esc(b.source)}">${esc(srcLbl(b.source))} (${b.count})</option>`),
      );
      html += `<div class="f"><label for="f-bank">Banco</label><select id="f-bank">${opts.join('')}</select></div>`;
    }
    // Filtro por CATEGORÍA del Índice CRECE, con la tabla maestra de la
    // especificación y nada más. Convivieron un tiempo con dos atajos heredados
    // —«cualquier oportunidad», «solo las de mayor señal»— que describían
    // recortes propios, sin nombre en la tabla: quien elegía «cualquier
    // oportunidad» no sabía si eso incluía «Abajo del Mercado», y las tres
    // primeras categorías ya cubren esa intención diciendo exactamente qué
    // traen. Un desplegable en el que dos opciones se solapan con las otras seis
    // obliga a adivinar; este habla un solo idioma, el del veredicto.
    const opcionesTier = TABLA_CRECE.map((t) =>
      `<option value="${t.tier}">${t.estrellasTexto} ${esc(t.lectura)}</option>`).join('');
    html += `<div class="f"><label for="f-opp">Valoración de la oportunidad</label><select id="f-opp">`
      + `<option value="">Todas</option>`
      + opcionesTier
      + `</select></div>`;
    // Solo para el plan gratuito: es el único que tiene fichas «suyas» que
    // encontrar. Para un suscriptor no significa nada —las tiene todas abiertas—
    // y para un anónimo no hay ninguna. Un filtro que a dos de los tres planes no
    // les dice nada es un filtro que estorba.
    if (planActual() === 'free') {
      html += `<div class="f"><label for="f-desbloqueadas">Mis fichas</label>`
        + `<select id="f-desbloqueadas"><option value="">Todas</option>`
        + `<option value="1">Solo las que ya desbloqueé</option></select></div>`;
    }
    // «f-dinero» sube el tamaño del «(millones)». En 10 px y gris claro pasaba
    // desapercibido, y quien no lo lee escribe 5.000 creyendo que pide 5.000
    // millones cuando está pidiendo cinco billones. Los ejemplos del placeholder
    // dicen la escala sin que haya que leer el label.
    html += fRange('price', 'Precio (millones)', 'Ej. 200', 'Ej. 500', 'f-dinero');
    html += fRange('area', 'Área (m²)', 'mín', 'máx');
    html += `<div class="f"><label for="f-bedroomsMin">Habitaciones</label><select id="f-bedroomsMin"><option value="">Todas</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></div>`;
    if (tab === 'portal') html += fStratum();
  } else {
    // Las facetas de REMATES, no las del portal. Son dos universos distintos: un
    // remate puede estar en un municipio donde FincaRaíz no publica nada, y así el
    // desplegable dejaba fuera 19 ciudades con remates reales —Popayán, Yopal,
    // Buenaventura— mientras ofrecía decenas que no tenían ninguno.
    const fc = await fetch('/api/facets?source=remates').then((r) => r.json());
    html += fSelect('city', 'Ciudad', fc.cities);
    // Los tipos también salen del inventario: la lista fija omitía `vehicle` y
    // `rights`, que son 64 fichas reales que nadie podía acotar.
    html += fSelect('type', 'Tipo', fc.types, typeLbl);
    // Demandante: dropdown con TODOS los bancos detectados (pedido del cliente).
    const bk = await fetch('/api/remate-banks').then((r) => r.json()).catch(() => ({ banks: [] }));
    const bankOpts = ['<option value="">Todos los demandantes</option>', '<option value="1">Solo bancos (todos)</option>']
      .concat((bk.banks || []).map((b) => `<option value="${esc(b.name)}">${esc(b.name)} (${b.count})</option>`));
    html += `<div class="f"><label for="f-bank">Demandante (banco)</label><select id="f-bank">${bankOpts.join('')}</select></div>`;
    html += fRange('bid', 'Postura (millones)', 'Ej. 80', 'Ej. 300', 'f-dinero');
  }
  // Entre el `await` de las facetas y esta línea el usuario puede haber cambiado
  // de pestaña. Sin esta comprobación, la respuesta lenta pisa a la rápida: el
  // caso medido era Remates → Portal en menos de dos segundos, y Portal acababa
  // con los filtros de Remates —Demandante, Postura— porque Remates hace dos
  // peticiones y aterrizaba la última. El usuario se quedaba sin Barrio, Estrato,
  // Precio ni Área hasta recargar, y lo que escribía viajaba como parámetros que
  // el listado del portal ignora en silencio.
  //
  // Mismo criterio que `state.loadSeq` usa para los listados: el que llega tarde
  // se descarta.
  if (state.tab !== tab) return;
  $('filters').innerHTML = html;
  updateFilterCount();

  $('filters').querySelectorAll('select, input').forEach((el) => {
    const ev = el.tagName === 'INPUT' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      if (el.id === 'f-city' && tab === 'portal') repopZones(el.value);
      updateFilterCount();
      if (ev === 'input') {
        window.clearTimeout(buildFilters.inputTimer);
        buildFilters.inputTimer = window.setTimeout(() => load(1), 320);
      } else {
        load(1);
      }
    });
  });
}
function fSelect(key, label, values, fmt) {
  const opts = ['<option value="">Todas</option>'].concat((values || []).map((v) => `<option value="${esc(v)}">${esc(fmt ? fmt(v) : cap(v))}</option>`));
  return `<div class="f"><label for="f-${esc(key)}">${esc(label)}</label><select id="f-${esc(key)}">${opts.join('')}</select></div>`;
}
function fRange(key, label, ph1, ph2, clase = '') {
  return `<div class="f${clase ? ` ${clase}` : ''}"><label>${label}</label><div class="f-range">
    <input type="number" id="f-${key}Min" min="0" placeholder="${ph1}" aria-label="${esc(label)} mínimo">
    <input type="number" id="f-${key}Max" min="0" placeholder="${ph2}" aria-label="${esc(label)} máximo"></div></div>`;
}
function fStratum() {
  const opts = [1, 2, 3, 4, 5, 6].map((v) => `<option value="${v}">${v}</option>`).join('');
  return `<div class="f"><label>Estrato</label><div class="f-range">
    <select id="f-stratumMin" aria-label="Estrato mínimo"><option value="">mín</option>${opts}</select>
    <select id="f-stratumMax" aria-label="Estrato máximo"><option value="">máx</option>${opts}</select></div></div>`;
}
/**
 * Un desplegable que no sirve de nada hasta que otro tenga valor.
 *
 * Sale deshabilitado y diciendo qué falta, en vez de vacío: un control apagado y
 * mudo se lee como algo roto, y uno lleno de opciones inservibles es peor todavía.
 */
function fSelectDependiente(key, label, aviso) {
  return `<div class="f"><label for="f-${esc(key)}">${esc(label)}</label>`
    + `<select id="f-${esc(key)}" disabled><option value="">${esc(aviso)}</option></select></div>`;
}

async function repopZones(city) {
  const sel = $('f-zone'); if (!sel) return;
  // Sin ciudad no hay barrios que ofrecer. Volver a apagarlo importa tanto como
  // encenderlo: quien acota a Pereira, elige un barrio y luego vuelve a «Todas
  // las ciudades» se quedaría con un barrio de Pereira aplicado y sin forma de
  // entender por qué el listado sigue acotado.
  if (!city) {
    sel.innerHTML = '<option value="">Elige una ciudad primero</option>';
    sel.disabled = true;
    return;
  }
  const fc = await fetch(`/api/facets?source=portal&city=${encodeURIComponent(city)}`).then((r) => r.json());
  const zonas = fc.zones || [];
  sel.disabled = zonas.length === 0;
  sel.innerHTML = zonas.length
    ? '<option value="">Todos los barrios</option>' + zonas.map((z) => `<option value="${esc(z)}">${esc(cap(z))}</option>`).join('')
    : '<option value="">Sin barrios en esta ciudad</option>';
}
/**
 * Plan que el servidor declaró en la última respuesta.
 *
 * No se deduce de tener sesión: eso ya nos costó que una cuenta gratuita viera
 * los remates de pago enteros. El servidor es la autoridad y aquí solo se lee lo
 * que dijo. `null` mientras no haya hablado.
 */
let planDelServidor = null;
const planActual = () => planDelServidor;

function readFilters() {
  const g = (id) => { const e = $(id); return e && e.value ? e.value : undefined; };
  // Un número negativo no es un filtro: el precio o el área de un inmueble no
  // pueden serlo, y el servidor los descarta. Contarlos como activos hacía que la
  // interfaz dijera «1 filtro» sobre un resultado sin filtrar.
  const gNoNegativo = (id) => {
    const v = g(id);
    return v != null && Number(v) >= 0 ? v : undefined;
  };
  // millones → COP. Un cero NO es un filtro: el servidor lo descarta por falso,
  // pero el contador lo sumaba igual, así que la interfaz decía «1 filtro activo»
  // sobre las 108.060 fichas sin filtrar. Un contador que no cuadra con lo que se
  // ve deja al usuario buscando un filtro invisible que no puede quitar.
  const M = (id) => {
    const n = Number(g(id));
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 1e6)) : undefined;
  };
  return {
    city: g('f-city'), zone: g('f-zone'), type: g('f-type'),
    priceMin: M('f-priceMin'), priceMax: M('f-priceMax'),
    areaMin: gNoNegativo('f-areaMin'), areaMax: gNoNegativo('f-areaMax'),
    bedroomsMin: gNoNegativo('f-bedroomsMin'), stratumMin: g('f-stratumMin'), stratumMax: g('f-stratumMax'),
    // El desplegable ya solo dice categorías del Índice CRECE, así que su valor
    // ES la categoría. El servidor sigue aceptando el viejo `opp` para no romper
    // enlaces ya compartidos, pero desde aquí no se envía nunca.
    tier: g('f-opp'),
    order: g('f-order'), bank: g('f-bank'),
    bidMin: M('f-bidMin'), bidMax: M('f-bidMax'),
    // El servidor resuelve CUÁLES son: aquí solo se pide el filtro.
    desbloqueadas: g('f-desbloqueadas'),
  };
}
$('filters-toggle').addEventListener('click', () => {
  setFiltersOpen(!document.querySelector('.controls').classList.contains('is-open'));
});
$('clear').addEventListener('click', () => buildFilters().then(() => {
  updateFilterCount();
  if (radarPreferences.complete) showToast('Filtros temporales limpios. Tu Radar guardado sigue disponible.');
  load(1);
}));

// ---------- Mi Radar: preferencias antes del registro ----------
function normalizeRadarPreferences(value) {
  if (!value || typeof value !== 'object' || value.complete !== true) return { complete: false };
  return {
    complete: true,
    city: typeof value.city === 'string' ? value.city : '',
    budget: Number.isFinite(Number(value.budget)) ? String(value.budget) : '',
    // Lista O cadena. Desde que se pueden elegir varios tipos, el asistente de
    // preferencias guarda un array —y esta función lo tiraba a la basura por no
    // ser `string`, así que elegir «Casa» y pulsar guardar dejaba «Cualquier
    // tipo» sin decir nada—. Se arrastraba también a las alertas por correo, que
    // leen de aquí: la selección múltiple no llegaba a guardarse nunca.
    // Se acepta la cadena porque es lo que hay en los navegadores de quienes
    // guardaron sus preferencias antes del cambio.
    type: Array.isArray(value.type)
      ? value.type.filter((t) => typeof t === 'string' && t)
      : typeof value.type === 'string' ? value.type : '',
  };
}
let radarPreferences = normalizeRadarPreferences(readStoredJson(RADAR_PREFS_KEY, null));
/**
 * ¿Ya se aplicó solo el Radar guardado en esta sesión?
 *
 * Se aplicaba en CADA entrada a Portal, y eso convertía una preferencia en una
 * jaula: quien tenía guardada Armenia buscaba en Medellín, se iba a Bancos a
 * mirar algo, volvía a Portal y se encontraba Armenia otra vez, sin haber tocado
 * nada. La preferencia debe proponer el punto de partida, no imponerlo en cada
 * vuelta.
 *
 * Pulsar «aplicar mi Radar» sigue funcionando siempre: eso es una orden, no una
 * suposición, y por eso la excepción va atada a `reload`.
 */
let radarPrefsYaAplicadas = false;
const radarSetupState = {
  open: false,
  step: 1,
  draft: {
    city: radarPreferences.complete ? radarPreferences.city : 'bogota',
    budget: radarPreferences.complete ? radarPreferences.budget : '500',
    // LISTA de tipos, no uno solo: «una persona puede decir, me interesan
    // apartamentos y casas». `tiposDePreferencia` tolera lo guardado antes, que era
    // una cadena.
    type: radarPreferences.complete ? tiposDePreferencia(radarPreferences.type) : ['apartment'],
  },
};

/** Los tipos elegidos, venga como lista o como el valor único que se guardaba antes. */
function tiposDePreferencia(valor) {
  if (Array.isArray(valor)) return valor.filter((t) => t);
  return valor ? [valor] : [];
}

/**
 * Cómo se lee una selección de varios tipos.
 *
 * Con dos o tres se enumeran; con más, se cuentan. Escribir seis nombres separados
 * por comas en el resumen de una tarjeta ocupa dos líneas y no se lee.
 */
function etiquetaDeTipos(valor) {
  const tipos = tiposDePreferencia(valor);
  if (!tipos.length) return 'Cualquier tipo';
  const nombres = tipos.map((t) => RADAR_TYPES.find(([k]) => k === t)?.[1] || t);
  if (nombres.length === 1) return nombres[0];
  if (nombres.length <= 3) return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
  return `${nombres.length} tipos de inmueble`;
}
const RADAR_BUDGETS = [
  // El tramo de 200 lo pidió el cliente pensando en quien busca lo más barato:
  // «un parqueadero o algo así no necesita un parqueadero de 300 millones».
  ['200', 'Hasta $200 millones'],
  ['300', 'Hasta $300 millones'],
  ['500', 'Hasta $500 millones'],
  ['800', 'Hasta $800 millones'],
  ['1200', 'Hasta $1.200 millones'],
  ['', 'Sin límite'],
];
const RADAR_TYPES = [
  ['apartment', 'Apartamento'],
  ['house', 'Casa'],
  // Parqueadero y oficina los pidió el cliente al ver la lista: «aquí nos haría
  // falta casa, apartamento… parqueadero, lote. Y oficina». Son tipos con
  // inventario real en la base, no hipotéticos.
  ['parking', 'Parqueadero'],
  ['office', 'Oficina'],
  ['lot', 'Lote'],
  ['commercial', 'Local'],
  ['', 'Cualquier tipo'],
];
function radarCityOptions() {
  const select = $('f-city');
  const values = select
    ? [...select.options].map((option) => option.value).filter(Boolean)
    : ['bogota', 'medellin', 'cali', 'barranquilla', 'cartagena'];
  const preferred = radarSetupState.draft.city;
  if (!values.includes(preferred)) radarSetupState.draft.city = values.includes('bogota') ? 'bogota' : (values[0] || '');
  return values;
}
function radarBudgetLabel(value) {
  return RADAR_BUDGETS.find(([key]) => key === String(value || ''))?.[1] || 'Sin límite';
}
function radarTypeLabel(value) {
  return RADAR_TYPES.find(([key]) => key === String(value || ''))?.[1] || 'Cualquier tipo';
}
function persistRadarAlert() {
  if (radarAlertDraft) writeStoredJson(RADAR_ALERT_KEY, radarAlertDraft);
  else localStorage.removeItem(RADAR_ALERT_KEY);
}
function prepareRadarAlert() {
  if (!radarPreferences.complete) return;
  radarAlertDraft = {
    city: radarPreferences.city,
    budget: radarPreferences.budget,
    type: radarPreferences.type,
    frequency: 'weekly',
    status: 'draft',
    createdAt: radarAlertDraft?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  persistRadarAlert();
}
async function activateRadarAlert() {
  prepareRadarAlert();
  if (!auth.token) return false;
  await syncAccountContext();
  renderAuthBar();
  return radarAlertDraft?.status === 'active';
}
function setupProgress(step) {
  const value = step === 1 ? 50 : step === 2 ? 75 : 90;
  return `<div class="setup-progress-row">
    <div class="setup-progress" role="progressbar" aria-label="Progreso de personalización" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></div>
    <span class="setup-progress-label">Paso ${step} de 3</span>
  </div>`;
}
function renderRadarSetup() {
  const root = $('radar-setup');
  if (!root) return;
  // La personalización es de quien tiene cuenta. A un visitante sin registrar no
  // se le pide que configure nada: sus preferencias no sobrevivirían al
  // navegador, no sirven para las alertas por correo —no hay a quién
  // escribirle— y le piden tres decisiones antes de haber visto para qué. La
  // secuencia correcta es registrarse, elegir plan y entonces afinar el Radar.
  if (!auth.token || state.tab !== 'portal') { root.innerHTML = ''; return; }

  if (radarSetupState.open) {
    const step = radarSetupState.step;
    let content = '';
    if (step === 1) {
      const options = radarCityOptions().map((city) =>
        `<option value="${esc(city)}"${city === radarSetupState.draft.city ? ' selected' : ''}>${esc(cap(city))}</option>`).join('');
      content = `<div class="setup-step">
        <span class="setup-kicker">${ic('pin')} Ubicación</span>
        <h2>¿En qué ciudad quieres comprar?</h2>
        <p>Empezamos con Bogotá como referencia, pero puedes cambiarla.</p>
        <div class="setup-field"><label for="setup-city">Ciudad principal</label>
          <select id="setup-city">${options}</select>
        </div>
      </div>`;
    } else if (step === 2) {
      content = `<div class="setup-step">
        <span class="setup-kicker">${ic('chart')} Presupuesto</span>
        <h2>¿Cuál es tu presupuesto máximo?</h2>
        <p>Lo usamos como punto de partida. Después podrás ajustar todos los filtros.</p>
        <div class="setup-choices" role="group" aria-label="Presupuesto máximo">
          ${RADAR_BUDGETS.map(([value, label]) => `<button class="setup-choice ${value === radarSetupState.draft.budget ? 'is-selected' : ''}" type="button" data-setup-field="budget" data-setup-value="${esc(value)}" aria-pressed="${value === radarSetupState.draft.budget}">${esc(label)}</button>`).join('')}
        </div>
      </div>`;
    } else {
      content = `<div class="setup-step">
        <span class="setup-kicker">${ic('home')} Tipo de inmueble</span>
        <h2>¿Qué quieres encontrar primero?</h2>
        <p>Esta preferencia ordena tu primera búsqueda, sin ocultarte las demás opciones.</p>
        <div class="setup-choices" role="group" aria-label="Tipo de inmueble">
          ${RADAR_TYPES.map(([value, label]) => {
            const elegidos = tiposDePreferencia(radarSetupState.draft.type);
            // «Cualquier tipo» es la lista vacía: se marca cuando no hay ninguno.
            const marcado = value === '' ? elegidos.length === 0 : elegidos.includes(value);
            return `<button class="setup-choice ${marcado ? 'is-selected' : ''}" type="button" data-setup-multi="type" data-setup-value="${esc(value)}" aria-pressed="${marcado}">${esc(label)}</button>`;
          }).join('')}
        </div>
      </div>`;
    }
    root.innerHTML = `<div class="radar-setup-card is-flow">
      ${setupProgress(step)}
      ${content}
      <div class="setup-flow-actions">
        <button class="setup-secondary" type="button" data-setup-close>Cancelar</button>
        <div>
          ${step > 1 ? '<button class="setup-secondary" type="button" data-setup-back>Atrás</button>' : ''}
          <button class="setup-primary" type="button" data-setup-next>${step === 3 ? 'Guardar y ver resultados' : 'Siguiente'}</button>
        </div>
      </div>
    </div>`;
    return;
  }

  if (radarPreferences.complete) {
    const savedChip = favSet.size ? `<span class="setup-chip">${favSet.size} guardado${favSet.size === 1 ? '' : 's'}</span>` : '';
    const simulationChip = savedSimulations.size ? `<span class="setup-chip">${savedSimulations.size} simulación${savedSimulations.size === 1 ? '' : 'es'}</span>` : '';
    const alertActive = radarAlertDraft?.status === 'active';
    const alertChip = radarAlertDraft ? `<span class="setup-chip">${alertActive ? 'Alerta activa' : 'Alerta preparada'}</span>` : '';
    root.innerHTML = `<div class="radar-setup-card is-complete">
      <div class="setup-copy">
        <span class="setup-kicker">${ic('check')} Tu Radar está personalizado · 100%</span>
        <h2>${esc(etiquetaDeTipos(radarPreferences.type))} en ${esc(cap(radarPreferences.city))}</h2>
        <div class="setup-profile">
          <span class="setup-chip">${esc(cap(radarPreferences.city))}</span>
          <span class="setup-chip">${esc(radarBudgetLabel(radarPreferences.budget))}</span>
          <span class="setup-chip">${esc(etiquetaDeTipos(radarPreferences.type))}</span>
          ${savedChip}
          ${simulationChip}
          ${alertChip}
        </div>
      </div>
      <div class="setup-actions">
        <button class="setup-secondary" type="button" data-setup-start>Editar</button>
        <button class="setup-primary" type="button" data-setup-apply>Aplicar preferencias</button>
      </div>
      <div class="setup-alert-row">
        <div>
          <strong>Alerta semanal</strong>
          <span>${alertActive ? 'Guardada en tu cuenta y lista para el proceso de notificación.' : radarAlertDraft ? 'Preparada en este dispositivo; inicia sesión para guardarla en tu cuenta.' : 'Prepara el seguimiento de nuevas coincidencias con estas preferencias.'}</span>
        </div>
        ${alertActive
          ? '<a class="setup-alert-action" href="/cuenta">Administrar</a>'
          : radarAlertDraft && !auth.token
            ? '<a class="setup-alert-action" href="/login">Guardar en mi cuenta</a>'
            : `<button class="setup-alert-action" type="button" data-setup-alert>${auth.token ? 'Activar seguimiento' : 'Preparar alerta'}</button>`}
      </div>
    </div>`;
    return;
  }

  const dismissed = localStorage.getItem(RADAR_SETUP_DISMISSED_KEY) === '1';
  root.innerHTML = `<div class="radar-setup-card">
    <div class="setup-copy">
      <span class="setup-kicker">${ic('chart')} Tu Radar ya está activo · 25%</span>
      <h2>${dismissed ? 'Afina tus resultados cuando quieras' : 'Empieza con inmuebles que sí encajan'}</h2>
      <p>${dismissed ? 'Elige ciudad, presupuesto y tipo de inmueble.' : 'Tres elecciones rápidas reducen el ruido. No necesitas crear una cuenta.'}</p>
    </div>
    <div class="setup-actions">
      ${dismissed ? '' : '<button class="setup-secondary" type="button" data-setup-dismiss>Ahora no</button>'}
      <button class="setup-primary" type="button" data-setup-start>Personalizar en 3 pasos</button>
    </div>
  </div>`;
}
/**
 * Municipios que forman un mismo mercado inmobiliario.
 *
 * Pedido en la reunión: «tener otras ciudades de referencia, pueden ser ciudades
 * que están alrededor de la ciudad que se ha configurado». Y es más que una
 * comodidad — en Colombia el área metropolitana ES el mercado: quien busca en
 * Medellín compra en Envigado o Sabaneta sin pestañear, y quien busca en Bogotá
 * mira Chía y Mosquera. Un filtro por ciudad exacta le esconde justo la mitad de
 * su mercado, y es la mitad donde suele estar el precio.
 *
 * Los nombres van como los guarda el scraping: en minúscula y sin tildes.
 * Las relaciones son simétricas — desde Envigado también se ofrece Medellín—
 * porque `vecinasDisponibles` recorre el grupo entero, no una lista por ciudad.
 */
const AREAS_METROPOLITANAS = [
  // Valle de Aburrá
  ['medellin', 'bello', 'envigado', 'itagui', 'sabaneta', 'la estrella', 'copacabana', 'girardota', 'caldas', 'barbosa'],
  // Sabana de Bogotá
  ['bogota', 'soacha', 'chia', 'cajica', 'cota', 'funza', 'madrid', 'mosquera', 'la calera', 'sopo', 'tocancipa', 'zipaquira', 'facatativa', 'tenjo', 'tabio'],
  ['cali', 'palmira', 'yumbo', 'jamundi', 'candelaria'],
  ['barranquilla', 'soledad', 'malambo', 'puerto colombia', 'galapa'],
  ['bucaramanga', 'floridablanca', 'giron', 'piedecuesta'],
  ['pereira', 'dosquebradas', 'la virginia', 'santa rosa de cabal'],
  ['manizales', 'villamaria', 'chinchina', 'neira'],
  ['cucuta', 'villa del rosario', 'los patios', 'el zulia'],
  ['cartagena', 'turbaco', 'arjona', 'turbana'],
  ['armenia', 'calarca', 'circasia', 'la tebaida', 'montenegro', 'salento'],
  ['villavicencio', 'acacias', 'restrepo', 'cumaral'],
  ['santa marta', 'cienaga'],
];

/** Vecinas de una ciudad que HOY tienen inventario. Sin inventario no se ofrecen. */
function vecinasDisponibles(ciudad) {
  if (!ciudad) return [];
  const grupo = AREAS_METROPOLITANAS.find((g) => g.includes(ciudad));
  if (!grupo) return [];
  const conInventario = new Set((STATS?.perCity ?? []).map((c) => c.city));
  return grupo.filter((c) => c !== ciudad && conInventario.has(c));
}

/**
 * Ofrece las ciudades vecinas bajo los resultados.
 *
 * Solo aparece con un filtro de ciudad puesto y solo lista municipios que hoy
 * tienen inventario: ofrecer una ciudad vacía es ofrecer un clic que deja la
 * pantalla en blanco.
 */
function renderVecinas() {
  const caja = $('vecinas');
  if (!caja) return;
  const ciudad = $('f-city')?.value;
  const vecinas = state.tab === 'portal' ? vecinasDisponibles(ciudad) : [];
  if (!vecinas.length) { caja.innerHTML = ''; caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = `<span class="vecinas-lbl">Mismo mercado que ${esc(cap(ciudad))}:</span>`
    + vecinas.map((c) => `<button class="vecina" type="button" data-vecina="${esc(c)}">${esc(cap(c))}</button>`).join('');
  caja.querySelectorAll('[data-vecina]').forEach((b) => {
    b.addEventListener('click', async () => {
      const sel = $('f-city');
      if (!sel) return;
      sel.value = b.dataset.vecina;
      await repopZones(sel.value);
      updateFilterCount();
      load(1);
    });
  });
}

/**
 * Reconstruye el panel de filtros SIN perder lo que el usuario tenía puesto.
 *
 * `buildFilters()` lo repinta desde cero, y eso está bien al cambiar de pestaña
 * —son otros filtros— pero era destructivo aquí: cuando la primera respuesta del
 * servidor confirma el plan gratuito hay que añadir el filtro «solo las que ya
 * desbloqueé», y ese repintado borraba la búsqueda recién hecha. El listado
 * quedaba filtrado por Cali mientras el panel decía «Todas» y el contador «0»:
 * el usuario no tenía forma de saber por qué veía lo que veía, ni cómo quitarlo.
 *
 * El barrio se restaura aparte porque sus opciones dependen de la ciudad: hay que
 * repoblarlas antes, o se restauraría un valor que todavía no existe en la lista.
 */
async function reconstruirFiltrosConservandoValores() {
  const previos = new Map();
  document.querySelectorAll('#filters [id^="f-"]').forEach((el) => {
    if (el.value) previos.set(el.id, el.value);
  });
  await buildFilters();

  const zona = previos.get('f-zone');
  previos.delete('f-zone');
  for (const [id, valor] of previos) restaurarValorDeFiltro(id, valor);

  const ciudad = $('f-city');
  if (zona && ciudad?.value) {
    await repopZones(ciudad.value);
    restaurarValorDeFiltro('f-zone', zona);
  }
  updateFilterCount();
}

/** Devuelve un valor a su control, salvo que el desplegable ya no lo ofrezca. */
function restaurarValorDeFiltro(id, valor) {
  const el = $(id);
  if (!el) return;
  // Un `<select>` al que se le asigna un valor inexistente se queda vacío en
  // silencio, y eso es peor que no restaurar: el filtro parecería limpio.
  if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === valor)) return;
  el.value = valor;
}

// ---------- La búsqueda, escrita en la dirección del navegador ----------
/**
 * La traducción entre pantalla y URL vive en `url-estado.js`, aparte y sin DOM,
 * para poder probarla. Aquí está solo lo que necesita el navegador: leer los
 * controles, escribir el historial y reconstruir la pantalla al volver.
 */

/**
 * Mientras se reconstruye la pantalla DESDE la dirección no se escribe en ella.
 *
 * Sin esto, restaurar `?tab=bancos&page=3` pasaría por un `load(1)` intermedio
 * que dejaría escrito `page=1` encima de la dirección que estamos leyendo, y el
 * botón «atrás» acabaría llevando a un sitio que el usuario nunca visitó.
 */
let sincronizacionDeUrlEnPausa = false;
/**
 * Si el próximo cambio de dirección es un PASO de navegación o una corrección.
 *
 * Cambiar de sección es un paso: la persona espera que «atrás» la devuelva a
 * donde estaba, y hasta hoy «atrás» la sacaba de la aplicación entera. Cambiar un
 * filtro no lo es: quien mueve el precio cuatro veces seguidas no quiere pulsar
 * «atrás» cuatro veces para salir, así que esos se reescriben en el sitio.
 */
let empujarProximaUrl = false;
/**
 * Filtros que la dirección traía y que todavía no tienen control donde ponerse.
 *
 * Solo pasa con «Mis fichas», que únicamente se pinta para el plan gratuito y por
 * tanto no existe hasta que el servidor contesta cuál es el plan —después del
 * primer listado—. Sin esta nota, un enlace compartido con `mias=1` perdía ese
 * filtro en silencio, que es la peor forma de fallar: el listado enseña otra cosa
 * y la pantalla no dice por qué.
 */
let estadoUrlPendiente = null;

/** Lo que los controles tienen puesto ahora, con los nombres cortos de la URL. */
function filtrosDeLosControles() {
  const filtros = {};
  for (const [control, parametro] of window.__radarUrlEstado.CONTROLES) {
    const el = $(control);
    if (el && el.value) filtros[parametro] = el.value;
  }
  return filtros;
}

/**
 * La búsqueda que la pantalla está enseñando, escrita como cadena de consulta.
 *
 * Sirve para las dos direcciones: escribir la dirección y comprobar si la que
 * llega ya es la que se ve. El orden inicial de cada sección lo decide `ORDERS`,
 * y no se escribe en la dirección mientras nadie lo haya cambiado.
 */
function busquedaComoQuery(tab, page, filtros) {
  const sinPaginador = tab === 'home' || tab === 'guardados';
  return window.__radarUrlEstado.serializar({
    tab,
    page: sinPaginador ? 1 : page,
    filtros,
    ordenPorDefecto: ORDERS[tab]?.[0]?.[0],
  });
}

/**
 * Deja la dirección diciendo lo que la pantalla enseña.
 *
 * Se llama desde `load()`, que es por donde pasa TODA búsqueda —el panel, el
 * buscador de la portada, el paginador, «aplicar mi Radar» y el asistente—. Tener
 * un solo sitio donde se escribe la URL es lo que impide que mañana una de esas
 * seis vías cambie el listado sin cambiar la dirección.
 */
function sincronizarUrl(page) {
  const empujar = empujarProximaUrl;
  empujarProximaUrl = false;
  if (sincronizacionDeUrlEnPausa) return;
  const query = busquedaComoQuery(state.tab, page, filtrosDeLosControles());
  const destino = query ? `${location.pathname}?${query}` : location.pathname;
  if (destino === location.pathname + location.search) return;
  try {
    if (empujar) history.pushState(null, '', destino);
    else history.replaceState(null, '', destino);
  } catch { /* sin historial utilizable la búsqueda funciona igual, solo no se puede compartir */ }
}

/**
 * Vuelca en los controles la búsqueda que venía escrita en la dirección.
 *
 * Corre como `antesDeCargar` de `activarPestana`: con los filtros ya pintados y
 * antes de pedir resultados, para que no se vea medio segundo de un listado que
 * nadie pidió.
 *
 * El barrio va aparte porque sus opciones dependen de la ciudad: hay que repoblar
 * la lista antes, o se restauraría un valor que todavía no existe en ella.
 */
async function aplicarEstadoDeLaUrl(estado) {
  const filtros = estado.filtros;
  const pendientes = {};
  for (const [control, parametro] of window.__radarUrlEstado.CONTROLES) {
    if (parametro === 'zone') continue;
    const valor = filtros[parametro];
    if (valor == null) continue;
    if (!$(control)) { pendientes[parametro] = valor; continue; }
    restaurarValorDeFiltro(control, valor);
  }
  estadoUrlPendiente = Object.keys(pendientes).length ? pendientes : null;

  const ciudad = $('f-city');
  if (state.tab === 'portal' && ciudad?.value) {
    await repopZones(ciudad.value);
    if (filtros.zone != null) restaurarValorDeFiltro('f-zone', filtros.zone);
  }
  updateFilterCount();
}

/**
 * Segunda pasada para los filtros que aún no tenían control cuando se leyó la URL.
 *
 * Se llama tras reconstruir el panel con el plan ya conocido. Si algo entra de
 * verdad, hay que volver a pedir el listado: el usuario está viendo un resultado
 * que no corresponde al enlace que abrió.
 */
async function completarFiltrosPendientesDeLaUrl() {
  const pendientes = estadoUrlPendiente;
  estadoUrlPendiente = null;
  if (!pendientes) return;
  let aplicado = false;
  for (const [control, parametro] of window.__radarUrlEstado.CONTROLES) {
    const valor = pendientes[parametro];
    const el = $(control);
    // `el.value` no vacío = el usuario ya tocó ese filtro mientras cargaba, y su
    // decisión es más reciente que la del enlace.
    if (valor == null || !el || el.value) continue;
    restaurarValorDeFiltro(control, valor);
    if (el.value === valor) aplicado = true;
  }
  if (!aplicado) return;
  updateFilterCount();
  await load(state.page);
}

/**
 * Reconstruye la pantalla a partir de la dirección actual.
 *
 * La usan las dos entradas por dirección: abrir un enlace compartido y pulsar
 * «atrás»/«adelante». En ambas la URL es la fuente de verdad, incluso frente al
 * Radar guardado: un enlace es una intención escrita y reciente, y la preferencia
 * es una suposición sobre lo que le interesará a esta persona. Por eso se marca la
 * preferencia como ya aplicada en vez de dejarla pisar la ciudad del enlace.
 */
async function restaurarDesdeUrl() {
  const estado = window.__radarUrlEstado.leer(location.search);
  if (estado.explicito) radarPrefsYaAplicadas = true;
  sincronizacionDeUrlEnPausa = true;
  try {
    await activarPestana(estado.tab, () => aplicarEstadoDeLaUrl(estado), estado.page);
  } finally {
    sincronizacionDeUrlEnPausa = false;
  }
  // Y se deja la dirección en su forma canónica: sin los parámetros que esta
  // pestaña no usa y sin el enlace a una ficha que ya se consumió.
  sincronizarUrl(state.page);
}

// «Atrás» y «adelante» del navegador. Antes no hacían nada dentro de la
// aplicación —«atrás» sacaba del sitio—, que es lo que reportó la auditoría.
window.addEventListener('popstate', () => {
  // Saltar a un ancla —el enlace «Saltar a los resultados»— también deja entrada
  // en el historial, y volver de ella no cambia la búsqueda. Reconstruir el
  // listado entero para acabar enseñando lo mismo sería un parpadeo gratuito.
  const estado = window.__radarUrlEstado.leer(location.search);
  if (busquedaComoQuery(estado.tab, estado.page, estado.filtros)
    === busquedaComoQuery(state.tab, state.page, filtrosDeLosControles())) return;
  void restaurarDesdeUrl();
});

async function applyRadarPreferences(preferences, reload = false) {
  if (state.tab !== 'portal' || !preferences.complete) return;
  // `reload` distingue las dos formas de llegar aquí: con él, el usuario pulsó su
  // Radar guardado y quiere que se aplique; sin él, es automático al entrar en
  // Portal, y eso solo puede pasar una vez por sesión. Ver `radarPrefsYaAplicadas`.
  if (!reload && radarPrefsYaAplicadas) return;
  radarPrefsYaAplicadas = true;
  const city = $('f-city');
  const type = $('f-type');
  const budget = $('f-priceMax');
  if (city && [...city.options].some((option) => option.value === preferences.city)) {
    city.value = preferences.city;
    await repopZones(preferences.city);
  }
  // El filtro de la pantalla acepta UN tipo, y las preferencias ahora pueden traer
  // varios. Se aplica solo si eligió uno: con dos o tres, forzar el primero
  // acotaría la búsqueda a algo que el usuario no pidió y sin decírselo. Los demás
  // sí llegan a las alertas por correo, que es donde se filtra por lista.
  const tiposPref = tiposDePreferencia(preferences.type);
  if (type && tiposPref.length === 1 && [...type.options].some((o) => o.value === tiposPref[0])) {
    type.value = tiposPref[0];
  }
  if (budget) budget.value = preferences.budget || '';
  updateFilterCount();
  if (reload) {
    setFiltersOpen(false);
    await load(1);
    $('results').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
$('radar-setup').addEventListener('change', (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.id === 'setup-city') {
    radarSetupState.draft.city = event.target.value;
  }
});
$('radar-setup').addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  // Selección MÚLTIPLE: alterna en vez de reemplazar. «Cualquier tipo» vacía la
  // lista, y elegir un tipo concreto quita «cualquiera»: tenerlos a la vez no
  // significa nada, y era lo que el cliente señaló —«cualquier tipo no dice nada y
  // eso mandará de todos»—.
  const multi = event.target.closest('[data-setup-multi]');
  if (multi) {
    const campo = multi.dataset.setupMulti;
    const valor = multi.dataset.setupValue;
    const actuales = tiposDePreferencia(radarSetupState.draft[campo]);
    if (valor === '') {
      radarSetupState.draft[campo] = [];
    } else {
      radarSetupState.draft[campo] = actuales.includes(valor)
        ? actuales.filter((t) => t !== valor)
        : [...actuales, valor];
    }
    renderRadarSetup();
    return;
  }
  const choice = event.target.closest('[data-setup-field]');
  if (choice) {
    radarSetupState.draft[choice.dataset.setupField] = choice.dataset.setupValue;
    renderRadarSetup();
    return;
  }
  if (event.target.closest('[data-setup-start]')) {
    radarSetupState.draft = {
      city: radarPreferences.complete ? radarPreferences.city : 'bogota',
      budget: radarPreferences.complete ? radarPreferences.budget : '500',
      type: radarPreferences.complete ? tiposDePreferencia(radarPreferences.type) : ['apartment'],
    };
    radarSetupState.step = 1;
    radarSetupState.open = true;
    renderRadarSetup();
    $('setup-city')?.focus();
    return;
  }
  if (event.target.closest('[data-setup-dismiss]')) {
    localStorage.setItem(RADAR_SETUP_DISMISSED_KEY, '1');
    renderRadarSetup();
    return;
  }
  if (event.target.closest('[data-setup-close]')) {
    radarSetupState.open = false;
    renderRadarSetup();
    return;
  }
  if (event.target.closest('[data-setup-back]')) {
    radarSetupState.step = Math.max(1, radarSetupState.step - 1);
    renderRadarSetup();
    return;
  }
  if (event.target.closest('[data-setup-apply]')) {
    await applyRadarPreferences(radarPreferences, true);
    showToast('Preferencias aplicadas a los resultados.');
    return;
  }
  if (event.target.closest('[data-setup-alert]')) {
    const active = await activateRadarAlert();
    renderRadarSetup();
    showToast(active
      ? 'Alerta semanal guardada en tu cuenta.'
      : 'Alerta semanal preparada. Inicia sesión para guardarla en tu cuenta.');
    return;
  }
  if (event.target.closest('[data-setup-next]')) {
    if (radarSetupState.step < 3) {
      radarSetupState.step += 1;
      renderRadarSetup();
      return;
    }
    radarPreferences = normalizeRadarPreferences({ ...radarSetupState.draft, complete: true });
    writeStoredJson(RADAR_PREFS_KEY, radarPreferences);
    if (radarAlertDraft) {
      prepareRadarAlert();
    }
    localStorage.removeItem(RADAR_SETUP_DISMISSED_KEY);
    radarSetupState.open = false;
    await applyRadarPreferences(radarPreferences, true);
    if (auth.token) await syncAccountContext();
    renderRadarSetup();
    showToast('Tu Radar quedó personalizado en este dispositivo.');
  }
});

// ---------- Carga (paginación numerada) ----------
function renderLoadingSkeletons(count = 9) {
  const grid = $('grid');
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = Array.from({ length: count }, (_, index) => `
    <article class="card skeleton-card" aria-hidden="true" style="--skeleton-delay:${index * 55}ms">
      <div class="card-img-wrap skeleton-media"></div>
      <div class="card-body skeleton-body">
        <div class="skeleton-line skeleton-price"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-location"></div>
        <div class="card-meta skeleton-meta">
          <span class="skeleton-pill"></span>
          <span class="skeleton-pill short"></span>
          <span class="skeleton-pill tiny"></span>
        </div>
        <div class="skeleton-line skeleton-freshness"></div>
      </div>
    </article>`).join('');
  $('loading').innerHTML = '<span class="sr-only">Cargando resultados…</span>';
  $('loading').style.display = 'block';
}

function clearLoadingSkeletons() {
  $('grid').removeAttribute('aria-busy');
  $('loading').style.display = 'none';
  $('loading').innerHTML = '<span class="sr-only">Cargando resultados…</span>';
}

// ---------- Portada (Home con destacados) ----------
/**
 * Esqueletos de la portada.
 *
 * Reusan `.skeleton-card` del listado a propósito: la portada pinta las mismas
 * tarjetas, así que su carga tiene que sentirse igual. Se dibujan dos bloques
 * porque es lo que cabe sin scroll: fingir los cuatro solo alargaría la página
 * para luego encogerla.
 */
function homeSkeleton() {
  const tarjetas = (n) => Array.from({ length: n }, (_, i) => `
    <article class="card skeleton-card" aria-hidden="true" style="--skeleton-delay:${i * 55}ms">
      <div class="card-img-wrap skeleton-media"></div>
      <div class="card-body skeleton-body">
        <div class="skeleton-line skeleton-price"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-location"></div>
        <div class="skeleton-line skeleton-freshness"></div>
      </div>
    </article>`).join('');
  const bloque = () => `<section class="home-bloque">
      <div class="home-bloque-cab">
        <div class="home-bloque-txt">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-location"></div>
        </div>
      </div>
      <div class="cards-grid">${tarjetas(3)}</div>
    </section>`;
  return `<div class="home-inner">${bloque()}${bloque()}</div>`;
}


/**
 * Pinta un grupo de la portada recortado, con su botón para ver el resto.
 *
 * Expandir NO vuelve a la red: las fichas completas ya viajaron en la respuesta de
 * `/api/home` —y ya pasaron por el muro de pago allí—, así que el clic se siente
 * instantáneo y no existe una segunda ruta que pudiera olvidarse de aplicar el
 * plan del usuario. Lo que decide cuántas se ven de entrada es `grupo.preview`,
 * que manda el servidor: es una decisión de producto, no de maquetación.
 */
/**
 * Una fila del top.
 *
 * La portada dejó de usar tarjetas con foto y pasó a lista por decisión del
 * cliente: quería que se leyera como un ranking. Y funciona mejor de lo que
 * parece — en una tarjeta la foto ocupa dos tercios del alto y empuja fuera de la
 * pantalla justo lo que sostiene la recomendación: el descuento, la categoría y
 * los comparables que la respaldan. En lista caben diez en el mismo espacio en
 * que antes cabían tres, y las diez se comparan de un vistazo porque las cifras
 * quedan alineadas en columna.
 *
 * Los remates enseñan su propia métrica: postura mínima contra avalúo y fecha de
 * audiencia. Un remate y un aviso de portal no se miden con la misma vara y la
 * fila lo dice, en vez de dejar que el usuario lo suponga.
 */
/**
 * Pinta un tramo del top con las MISMAS tarjetas del listado.
 *
 * La portada estuvo un tiempo en filas de texto, y el cliente pidió volver a las
 * tarjetas con foto. Tiene sentido para lo que es esta pantalla: un top es una
 * recomendación, y en inmuebles la foto es lo primero que decide si algo merece
 * un clic. Una fila de texto obliga a abrir la ficha para saber si te interesa.
 *
 * Se reutiliza `renderCards` en vez de escribir otra tarjeta: así la portada
 * hereda sin trabajo lo que ya tienen los listados —el badge de descuento con su
 * color, el velo de la ficha bloqueada, el corazón, la imagen de marca de los
 * bancos que publican en PDF— y no hay dos sitios donde arreglar lo mismo.
 */
function pintarTop(grid, fichas, desde, hasta) {
  const tanda = fichas.slice(desde, hasta);
  if (!tanda.length) return;
  // `true` = la ficha se PIDE a `/api/property` al abrirla, que es la única ruta
  // que aplica el plan del usuario y gasta el cupo del mes.
  renderCards(tanda, grid, true);
}

function montarGrupoHome(grid, pie, grupo) {
  const fichas = grupo.fichas || [];
  const preview = Math.min(Number(grupo.preview) || fichas.length, fichas.length);
  const pintar = (desde, hasta) => pintarTop(grid, fichas, desde, hasta);

  pintar(0, preview);
  const restantes = fichas.length - preview;
  if (!pie || restantes <= 0) return;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'home-mas-btn';
  boton.setAttribute('aria-expanded', 'false');
  const plegado = `Ver las ${restantes} restantes`;
  boton.textContent = plegado;
  let expandido = false;

  boton.addEventListener('click', () => {
    if (!expandido) {
      pintar(preview, fichas.length);
      expandido = true;
      boton.setAttribute('aria-expanded', 'true');
      boton.textContent = `Ver solo las primeras ${preview}`;
      return;
    }
    // Al plegar se quitan SOLO las añadidas. Las primeras no se vuelven a pintar:
    // recrearlas cambiaría el scroll bajo el dedo y perdería los favoritos ya
    // marcados en pantalla.
    [...grid.querySelectorAll('article.card')].slice(preview).forEach((t) => t.remove());
    expandido = false;
    boton.setAttribute('aria-expanded', 'false');
    boton.textContent = plegado;
    // El foco estaba en el botón, pero puede haber quedado en una tarjeta que
    // acaba de desaparecer; devolverlo aquí evita que se caiga al <body>.
    boton.focus();
  });
  pie.appendChild(boton);
}

function renderHome(payload) {
  const raiz = $('home');
  const bloques = Array.isArray(payload.bloques) ? payload.bloques : [];
  raiz.removeAttribute('aria-busy');
  if (!bloques.length) {
    raiz.innerHTML = `<div class="home-inner"><div class="empty">${emptyState('magnifier', 'Todavía no hay destacados', 'El motor aún no ha marcado oportunidades suficientes para armar la portada. Explora el Portal mientras tanto.')}</div></div>`;
    setResultText('Sin destacados');
    return;
  }

  // Fuera el «Semana 31 · 120 oportunidades seleccionadas». El número de semana es
  // un detalle de cómo rota el pool por dentro, no algo que le diga nada a quien
  // llega: nadie sabe en qué semana del año está ni por qué debería importarle.
  // `payload.semana` sigue llegando y el servidor la sigue usando para la rotación.
  const cabecera = `<div class="home-intro">
    <h2>Destacados de hoy</h2>
    <p>Cada bloque dice con qué regla se eligió.</p>
  </div>
  <div id="home-aviso"></div>`;

  const cuerpo = bloques.map((bloque, i) => {
    const idTitulo = `home-bloque-${esc(bloque.id)}`;
    const grupos = (bloque.grupos || []).map((grupo, j) => {
      const titulo = grupo.etiqueta
        ? `<h4 class="home-grupo-tit">${esc(cap(grupo.etiqueta))}${grupo.detalle ? `<span>${esc(grupo.detalle)}</span>` : ''}</h4>`
        : '';
      return `<div class="home-grupo">${titulo}<div class="cards-grid" data-home-grid="${i}-${j}"></div>`
        + `<div class="home-mas" data-home-mas="${i}-${j}"></div></div>`;
    }).join('');
    return `<section class="home-bloque" aria-labelledby="${idTitulo}">
      <div class="home-bloque-cab">
        <span class="home-bloque-ic">${ic(bloque.icono || 'spark')}</span>
        <div class="home-bloque-txt">
          <h3 id="${idTitulo}">${esc(bloque.titulo)}</h3>
          <p class="home-criterio">${esc(bloque.criterio)}</p>
        </div>
      </div>
      ${grupos}
    </section>`;
  }).join('');

  raiz.innerHTML = `<div class="home-inner">${cabecera}${cuerpo}</div>`;

  // Las tarjetas se insertan después del innerHTML para poder engancharles sus
  // escuchadores: nada de `onclick` en la plantilla (CSP estricta).
  bloques.forEach((bloque, i) => {
    (bloque.grupos || []).forEach((grupo, j) => {
      const grid = raiz.querySelector(`[data-home-grid="${i}-${j}"]`);
      if (!grid) return;
      montarGrupoHome(grid, raiz.querySelector(`[data-home-mas="${i}-${j}"]`), grupo);
    });
  });

  renderAvisoBloqueo(payload.plan, payload.bloqueo, payload.cupo, $('home-aviso'));
  setResultText(`${payload.total} destacado${payload.total === 1 ? '' : 's'}`);
}

async function loadHome() {
  const raiz = $('home');
  const loadSeq = ++state.loadSeq;
  state.loading = true;
  setResultText('Preparando la portada…');
  raiz.setAttribute('aria-busy', 'true');
  raiz.innerHTML = homeSkeleton();
  try {
    // Misma regla que en los listados: la cabecera NO es opcional. Sin ella el
    // servidor da por anónimo a quien ya pagó y le devuelve todo bloqueado.
    const res = await fetch('/api/home', { headers: authHeaders(), signal: AbortSignal.timeout(25000) })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    if (loadSeq !== state.loadSeq) return;
    renderHome(res);
  } catch (e) {
    if (loadSeq !== state.loadSeq) return;
    console.error('home:', e);
    raiz.removeAttribute('aria-busy');
    raiz.innerHTML = `<div class="home-inner"><div class="empty">${emptyState('alert-triangle', 'No se pudo cargar la portada', 'Puede ser tu conexión o el servidor.', 'warning', botonReintentar())}</div></div>`;
    setResultText('No disponible');
  } finally {
    state.loading = false;
  }
}

async function load(page) {
  // Antes de pedir nada: la dirección tiene que decir lo mismo que se va a
  // enseñar. Va aquí arriba, y no junto al render, porque también pasan por aquí
  // la portada y Guardados, que se cargan por otro camino pero también son sitios
  // a los que se debe poder volver.
  sincronizarUrl(page);
  if (state.tab === 'home') return loadHome();
  if (state.tab === 'guardados') return loadGuardados();
  const loadSeq = ++state.loadSeq;
  state.loading = true;
  state.page = page;
  setResultText('Buscando…');
  renderLoadingSkeletons();
  $('empty').style.display = 'none';
  $('pager').innerHTML = '';

  // El buscador de arriba enseña lo que ESTA búsqueda tiene puesto, y lo lee del
  // panel —la única fuente— justo antes de pedirla. Así da igual por dónde se haya
  // cambiado el filtro (buscador, panel, ciudades vecinas o preferencias): los dos
  // sitios dicen lo mismo.
  window.RadarBuscador?.sincronizar();

  const f = readFilters();
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
  qs.set('page', String(page));
  qs.set('pageSize', String(state.pageSize));

  let res;
  try {
    // La cabecera NO es opcional: el servidor decide con `planDe(getUserFromToken(...))`
    // qué campos entrega, así que sin ella un suscriptor se identifica como anónimo y
    // recibe todas las fichas bloqueadas por más que haya pagado.
    res = await fetchConSesion(`/api/${state.tab}?${qs}`, { signal: AbortSignal.timeout(25000) }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    // El caso silencioso: llevamos token y aun así el servidor nos trata como
    // anónimos. Eso solo pasa si caducó, y no da 401 porque el listado es una
    // ruta pública que sencillamente entrega menos. Se renueva y se repite.
    if (res.plan === 'anonimo' && auth.token) {
      if (await renovarSesion()) {
        res = await fetchConSesion(`/api/${state.tab}?${qs}`, { signal: AbortSignal.timeout(25000) })
          .then((r) => (r.ok ? r.json() : res));
      } else {
        sesionCaducada();
      }
    }
  } catch (e) {
    if (loadSeq !== state.loadSeq) return;
    console.error('load:', e);
    $('grid').innerHTML = '';
    clearLoadingSkeletons();
    state.loading = false;
    // Nulo, no cero: quien lea esto —`RadarBuscador.aplicar`, y a través de él el
    // asistente— tiene que poder distinguir «no hay resultados» de «no se pudo
    // buscar». Decirle a alguien que no hay nada en Bogotá porque se cayó la red
    // es peor que decirle que falló.
    state.total = null;
    state.mostrados = 0;
    $('empty').style.display = 'block';
    $('empty').innerHTML = emptyState('alert-triangle', 'No se pudo cargar', 'Puede ser tu conexión o el servidor. Los filtros que pusiste siguen puestos.', 'warning', botonReintentar());
    setResultText('No disponible');
    return;
  }

  if (loadSeq !== state.loadSeq) return;
  $('grid').innerHTML = '';
  // `true` = la ficha se PIDE a `/api/property` al abrirla, en vez de dibujarse
  // con la fila que el listado ya tiene en el navegador. Es obligatorio: esa ruta
  // es la única que aplica el plan del usuario y la única que gasta el cupo del
  // mes. Sin esto la tarjeta prometía "ábrela con tu cupo", el clic no consumía
  // nada y el modal enseñaba el muro — el plan gratuito era inalcanzable desde
  // las tres pestañas, y solo funcionaba desde la portada, que sí lo pasaba.
  // El plan lo declara el servidor, y su primera respuesta llega DESPUÉS de que
  // los filtros ya se hayan pintado. Cuando eso deja fuera un filtro que sí
  // corresponde a este plan —«solo las que ya desbloqueé», que únicamente tiene
  // sentido para el gratuito— se reconstruyen. Sin esto, el filtro no aparecía
  // hasta que el usuario cambiaba de pestaña y volvía.
  const planNuevo = res.plan ?? planDelServidor;
  const faltaFiltroPropio = planNuevo === 'free' && state.tab !== 'remates' && !$('f-desbloqueadas');
  planDelServidor = planNuevo;
  // Y con el panel ya completo se rescatan los filtros del enlace que no tenían
  // dónde ponerse cuando se leyó la dirección. Ver `estadoUrlPendiente`.
  if (faltaFiltroPropio) void reconstruirFiltrosConservandoValores().then(completarFiltrosPendientesDeLaUrl);

  renderCards(res.data, $('grid'), true);
  renderAvisoBloqueo(res.plan, res.bloqueo, res.cupo);
  // El "≈" cuando el servidor avisa de que el número es una estimación. Sobre
  // 108.000 filas hay filtros cuyo conteo exacto no cabe en el tiempo de una
  // consulta; ahí se prefiere una cifra aproximada y honesta a una pantalla de
  // error, pero no se puede presentar como si fuera exacta.
  const cifra = (res.totalAproximado ? '≈ ' : '') + res.total.toLocaleString('es-CO');
  // «20 de 1.786», no «1.786». Enseñar solo el total al lado de veinte tarjetas
  // deja al usuario sin saber si eso es todo lo que hay o el principio de algo, y
  // el cliente quiere que se vea que hay más y que la vía es acotar. Se cuentan
  // las fichas realmente pintadas —los repetidos se colapsan— para que el número
  // de la izquierda sea el que se puede contar en la pantalla.
  const mostrados = res.data.length;
  state.total = res.total;
  state.mostrados = mostrados;
  setResultText(res.total === 0
    ? 'Sin resultados'
    : `${mostrados.toLocaleString('es-CO')} de ${cifra} resultado${res.total === 1 ? '' : 's'}`);
  clearLoadingSkeletons();
  pintarVacio(res.total === 0);
  renderPager(res.total, res.page, res.pages, res);
  renderVecinas();
  state.loading = false;
}

/**
 * Qué se enseña cuando no sale nada.
 *
 * «Sin resultados · Ajusta los filtros» era la misma frase para dos situaciones
 * que no se parecen: que no haya inventario, y que el filtro sea imposible de
 * cumplir porque el mínimo es mayor que el máximo. En el segundo caso el usuario
 * se queda mirando una pantalla que le dice que no hay casas de 300 a 500
 * millones cuando lo que escribió fue de 500 a 300, y no tiene forma de saberlo.
 */
function pintarVacio(vacio) {
  const caja = $('empty');
  if (!caja) return;
  caja.style.display = vacio ? 'block' : 'none';
  if (!vacio) return;
  const alReves = rangosAlReves();
  const titulo = caja.querySelector('.h');
  const detalle = titulo?.nextElementSibling;
  if (!titulo || !detalle) return;
  if (alReves.length) {
    titulo.textContent = 'El filtro está al revés';
    detalle.textContent = `En ${alReves.join(' y ')}, el mínimo es mayor que el máximo, así que ningún inmueble puede cumplirlo. Intercámbialos y vuelve a buscar.`;
  } else {
    titulo.textContent = 'Sin resultados';
    detalle.textContent = 'Ajusta los filtros para ver más.';
  }
}

/** Qué rangos tienen el mínimo por encima del máximo, con el nombre que el usuario ve. */
function rangosAlReves() {
  const pares = [
    ['precio', 'f-priceMin', 'f-priceMax'],
    ['postura', 'f-bidMin', 'f-bidMax'],
    ['área', 'f-areaMin', 'f-areaMax'],
    ['estrato', 'f-stratumMin', 'f-stratumMax'],
  ];
  return pares
    .filter(([, idMin, idMax]) => {
      const min = Number($(idMin)?.value);
      const max = Number($(idMax)?.value);
      return Number.isFinite(min) && Number.isFinite(max) && $(idMin)?.value !== '' && $(idMax)?.value !== '' && min > max;
    })
    .map(([nombre]) => nombre);
}

/**
 * Franja que dice qué deja fuera el plan actual.
 *
 * Habla con los números de ESTA búsqueda —cuántas fichas quedan cerradas y con
 * qué descuento— para que quien lo lea pueda comprobarlo mirando la pantalla. El
 * muro cubre justo las categorías de mayor señal, así que la comparación no es un
 * eslogan: en Bancos lo bloqueado promedia ~52% de descuento mientras lo visible
 * está por encima del precio de mercado.
 *
 * No se pinta nada para un suscriptor ni cuando no hay nada bloqueado: un aviso
 * que sale siempre deja de leerse.
 */
function renderAvisoBloqueo(plan, bloqueo, cupo, caja = $('aviso-bloqueo')) {
  if (!caja) return;
  // Se recuerda para poder repintarlo tras gastar una ficha, sin volver a pedir
  // el listado entero solo para actualizar un número.
  ultimoAviso = { plan, bloqueo, cupo, caja };
  if (plan === 'suscrito' || !bloqueo || !bloqueo.bloqueadas) { caja.innerHTML = ''; return; }

  const n = bloqueo.bloqueadas;
  // «fichas de inmuebles» y no «fichas» a secas: el cliente preguntó fichas de
  // qué, y tenía razón —«ficha» es vocabulario nuestro, no suyo—.
  const fichas = n === 1 ? '1 ficha de inmueble' : `${n} fichas de inmuebles`;

  const anonimo = plan === 'anonimo';
  const sinCupo = !anonimo && cupo && !cupo.ilimitado && cupo.restantes === 0;

  // "que no estás viendo" sería inexacto: las tarjetas sí se ven, bloqueadas. Lo
  // que no puede hacer es abrirlas, y decirlo así es igual de persuasivo y cierto.
  // El anónimo NO ve el recuento de esta sección.
  //
  // Decía «hay 24 fichas que no puedes abrir» en Portales, «7» en Bancos y «9» en
  // Remates, y el cliente preguntó qué relación tenían esos tres números entre sí
  // y con las 20 del cupo. No tienen ninguna: son cuántas hay bloqueadas en la
  // búsqueda que está mirando, y cambian al mover cualquier filtro. Tres cifras
  // que se contradicen aparentemente y ninguna es la que importa.
  //
  // Lo que sí importa es una sola y es siempre la misma: 20 al mes, en cualquiera
  // de las tres secciones. Es lo que se le promete y es lo que se le dice.
  const titulo = anonimo
    ? `Descubre ${CUPO_FREE_MENSUAL} oportunidades de inmuebles al mes`
    : sinCupo
      ? `Se te acabó el cupo del mes con ${fichas} todavía cerradas`
      : `Te quedan ${cupo?.restantes ?? 0} de ${cupo?.limite ?? CUPO_FREE_MENSUAL} fichas este mes`;

  const cuerpo = anonimo
    ? 'Crea tu cuenta gratis y ábrelas en cualquier categoría: portales, bancos o remates.'
    : sinCupo
      ? 'Son las de mayor descuento de esta búsqueda. Con el plan completo no hay límite.'
      // El verbo y el pronombre concuerdan con el número. Al pasar «fichas» a
      // «fichas de inmuebles» quedó «1 ficha de inmuebles ... siguen cerradas»,
      // que se lee como un error de la herramienta justo donde se le pide
      // confianza al usuario.
      : n === 1
        ? `${fichas} de esta búsqueda sigue cerrada. Úsala en la que más te interese.`
        : `${fichas} de esta búsqueda siguen cerradas. Úsalas en las que más te interesen.`;

  // Los porcentajes del recuadro —«66% descuento medio», «70% la mayor», «-13%
  // las que sí puedes abrir»— se retiran por decisión del cliente: «estarían
  // sujetos a una explicación» que en esa pantalla no existe. Un dato que hay que
  // explicar antes de que signifique algo no ayuda a quien acaba de llegar; el
  // descuento concreto de cada inmueble sigue estando en su tarjeta, que es donde
  // se entiende sin contexto.
  const cifrasHtml = '';

  const cta = anonimo
    ? '<a class="aviso-cta" href="/login">Crear cuenta gratis</a>'
    : '<a class="aviso-cta" href="/planes">Ver el plan completo</a>';

  caja.innerHTML = `<aside class="aviso-bloqueo${sinCupo ? ' is-agotado' : ''}">
    <div class="aviso-cabecera">
      <span class="aviso-icono">${ic('lock')}</span>
      <div class="aviso-texto"><strong>${esc(titulo)}</strong><p>${esc(cuerpo)}</p></div>
      ${cta}
    </div>
    ${cifrasHtml}
  </aside>`;
}

async function loadGuardados() {
  setResultText('Buscando…');
  $('grid').innerHTML = '';
  $('pager').innerHTML = '';
  $('empty').style.display = 'none';
  renderLoadingSkeletons(6);
  if (!auth.token) {
    $('grid').innerHTML = '';
    clearLoadingSkeletons();
    const props = [...guestFavorites.values()].map((item) => item.property);
    renderCards(props);
    setResultText(props.length + ' guardado' + (props.length === 1 ? '' : 's') + ' en este dispositivo');
    $('empty').style.display = props.length === 0 ? 'block' : 'none';
    $('empty').innerHTML = props.length === 0
      ? emptyState('heart', 'Aún no has guardado inmuebles', 'Toca el corazón en cualquier oportunidad para compararla después.', 'saved')
      : '';
    return;
  }
  let props = [];
  try {
    const d = await fetch('/api/favorites?full=1', { headers: authHeaders() }).then((r) => r.json());
    props = d.properties || [];
    favSet.clear();
    (d.favorites || []).forEach((f) => favSet.add(favKey(f.kind, f.id)));
    updateFavCount();
  } catch (e) {
    $('grid').innerHTML = '';
    clearLoadingSkeletons();
    $('empty').style.display = 'block';
    $('empty').innerHTML = emptyState('alert-triangle', 'No se pudo cargar', 'Puede ser tu conexión o el servidor.', 'warning', botonReintentar());
    setResultText('No disponible');
    return;
  }
  $('grid').innerHTML = '';
  // Guardados con sesión: también por la API. Una ficha que el usuario ya abrió
  // con su cupo tiene que seguir abriéndose desde aquí, y una que nunca abrió
  // tiene que seguir cobrando.
  renderCards(props, $('grid'), true);
  setResultText(props.length + ' guardado' + (props.length === 1 ? '' : 's'));
  clearLoadingSkeletons();
  $('empty').style.display = props.length === 0 ? 'block' : 'none';
  if (props.length >= 2) {
    $('pager').innerHTML = '<a class="compare-cta" href="/comparador">Comparar hasta 3 guardados</a>';
  }
  if (props.length === 0) $('empty').innerHTML = emptyState('heart', 'Sin guardados aún', 'Toca el corazón en cualquier inmueble para guardarlo aquí.', 'saved');
}

function renderPager(total, page, pages, meta = {}) {
  const el = $('pager');
  if (total === 0) { el.innerHTML = ''; return; }
  const aprox = meta.totalAproximado ? '≈ ' : '';
  // Cuando quedan resultados más allá de la última página servible se dice, y se
  // dice qué hacer. Antes el paginador ofrecía 4.503 páginas y las de arriba de
  // la 40 tardaban 49 segundos y fallaban: los dos botones de "ir al final"
  // fallaban siempre. Enseñar el tramo que existe y explicar cómo llegar al resto
  // es más honesto que prometer un botón roto.
  const aviso = meta.paginasLimitadas
    ? `<div class="pinfo-nota">Se pueden recorrer las primeras ${pages} páginas. Afina los filtros —ciudad, precio o tipo— para llegar al resto.</div>`
    : '';
  let html = `<div class="pinfo">Página ${page} de ${pages} · ${aprox}${total.toLocaleString('es-CO')} resultados</div>${aviso}`;
  const btn = (p, label, o = {}) => `<button data-page="${p}" class="${o.active ? 'active' : ''}" ${o.disabled ? 'disabled' : ''}>${label || p}</button>`;
  if (pages > 1) {
    const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
    const list = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
    html += btn(page - 1, '‹', { disabled: page <= 1 });
    let prev = 0;
    for (const p of list) { if (p - prev > 1) html += `<span class="ell">…</span>`; html += btn(p, null, { active: p === page }); prev = p; }
    html += btn(page + 1, '›', { disabled: page >= pages });
  }
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled || b.classList.contains('active')) return;
    load(Number(b.dataset.page));
    window.scrollTo({ top: $('grid').offsetTop - 120, behavior: 'smooth' });
  }));
}

function cardKind(p) {
  // Guardados y portada mezclan las tres fuentes: cada ficha trae el suyo.
  if (state.tab === 'guardados' || state.tab === 'home') return p._kind;
  return state.tab === 'remates' ? 'remate' : (state.tab === 'bancos' ? 'banco' : 'portal');
}
/**
 * Pinta tarjetas en un contenedor.
 *
 * `porApi` hace que la tarjeta abra la ficha pidiéndola a `/api/property` en vez de
 * dibujar la fila que ya tiene. Lo usa la portada, cuyas fichas llegan recortadas a
 * propósito (sin galería ni descripción, ver COLS_DESTACADOS en queries.ts): abrir
 * desde ahí sin pasar por el servidor mostraría una ficha coja y, peor, no gastaría
 * el cupo del mes, que es justo lo que convierte a un registrado en cliente.
 */
function renderCards(items, target = $('grid'), porApi = false) {
  const frag = document.createDocumentFragment();
  items.forEach((p) => {
    const kind = cardKind(p);
    propertyCache.set(favKey(kind, p.id), p);
    const el = document.createElement('article');
    // El aura dorada de «Oportunidad Fuerte» rodea la tarjeta entera, así que la
    // clase va en el <article> y no dentro. Solo esa categoría la lleva: si la
    // llevaran también las de dos estrellas dejaría de destacar nada.
    el.className = 'card' + (p.crece_tier === 'oportunidad_fuerte' ? ' es-fuerte' : '');
    const cardLabel = `Ver ${typeLbl(p.property_type || p.type)} en ${cap(p.city)}`;
    el.innerHTML = (kind === 'remate' ? remateCard(p, kind) : inmuebleCard(p, kind))
      + `<button class="card-open" type="button" aria-label="${esc(cardLabel)}"></button>`;
    const openCard = porApi
      ? () => window.__openRec(kind, p.id)
      : () => (kind === 'remate' ? openRemate(p) : openInmueble(p));
    el.querySelector('.card-open').addEventListener('click', openCard);
    frag.appendChild(el);
  });
  target.appendChild(frag);
  paintFavs();
}

function imgList(p) {
  const arr = [];
  if (p.image_url) arr.push(p.image_url);
  if (Array.isArray(p.features?.images)) p.features.images.forEach((u) => { if (u && !arr.includes(u)) arr.push(u); });
  return arr;
}

function inmuebleCard(p, kind) {
  const f = p.features || {};
  const imgs = imgList(p);
  kind = kind || (p.source === 'fincaraiz' ? 'portal' : 'banco');
  const isBank = p.source !== 'fincaraiz';
  // BBVA y Aval solo traen la página del PDF (no foto real) → en la tarjeta
  // mostramos el TIPO branded, no el PDF (pedido del cliente). El PDF sigue
  // accesible dentro del modal.
  const PDF_BANKS = ['bbva', 'aval'];
  const showBranded = isBank && (PDF_BANKS.includes(p.source) || !imgs[0]);
  const cover = showBranded
    ? bankPlaceholder(p)
    : imgs[0]
      ? `<img src="${esc(safeMediaUrl(imgs[0]))}" loading="lazy" alt="${esc(`${typeLbl(p.type)} en ${cap(p.city)}`)}" data-card-source="${esc(p.source)}" data-card-type="${esc(p.type || '')}">`
      : `<div class="card-ph">${srcIcon(p.source)}</div>`;
  const discount = p.discount_pct != null ? Math.round(p.discount_pct) : null;
  const comparisonLabel = discount != null
    ? `${discount}% bajo ofertas similares de la zona`
    : 'Oportunidad frente a ofertas similares de la zona';
  // La etiqueta del descuento se pinta también en las fichas BLOQUEADAS.
  //
  // No salía porque la redacción devuelve `is_opportunity: false` a quien no la
  // ha abierto —aunque el descuento sí viaja—, así que la única tarjeta donde el
  // dato importa de verdad era la única sin él: el porcentaje quedaba dentro del
  // velo y encima tapado. Ahora la ficha cerrada se ve como cualquier otra, con
  // su fuente y su descuento arriba, más una invitación a pulsarla.
  // Un descuento negativo es SOBREPRECIO, y salía en verde. La ficha bloqueada
  // entraba por la segunda condición sin mirar el signo, así que un inmueble un
  // 169% por encima de su mercado —los hay: 55.000 filas tienen descuento
  // negativo— lucía el mismo distintivo verde que una ganga. Un color que miente
  // sobre si algo es caro o barato es peor que no poner color.
  const sobreprecio = discount != null && discount < 0;
  const mostrarOpp = p.is_opportunity || (esBloqueada(p) && discount != null);
  // El color va por el signo y la magnitud del descuento, que es lo que la gente
  // cree estar leyendo. `is_high` —la confianza del motor: decil más barato y
  // comparables homogéneos— no desaparece: se queda en el icono de estrella, que
  // ya existía pero quedaba tapado por el cambio de fondo.
  const claseOpp = sobreprecio ? 'caro' : discount != null && discount > 30 ? 'fuerte' : 'media';
  const opp = mostrarOpp
    ? `<span class="opp-badge ${claseOpp}${isHighOpp(p) && !sobreprecio ? ' high' : ''}" title="${esc(comparisonLabel)}" aria-label="${esc(comparisonLabel)}">${ic(sobreprecio ? 'alert-triangle' : isHighOpp(p) ? 'star' : 'down')}${discount != null ? (sobreprecio ? `+${Math.abs(discount)}%` : `${discount}%`) : 'Oportunidad'}</span>`
    : '';
  const ppm2 = p.price_per_m2 ? '$' + Math.round(p.price_per_m2).toLocaleString('es-CO') + '/m²' : '';
  return `
    <div class="card-img-wrap">${cover}<span class="source-badge">${esc(srcLbl(p.source))}</span>${opp}${favBtn(kind, p.id)}${selloSuscripcion(p)}</div>
    <div class="card-body">
      ${selloCrece(p)}
      <div class="card-price">${fmtCOP(p.price)}${ppm2 ? `<span class="card-ppm2">${ppm2}</span>` : ''}</div>
      <div class="card-titulo">${esc(typeLbl(p.type))}${p.area_m2 ? ' · ' + fmtArea(p.area_m2) : ''}${selloIguales(p)}</div>
      <div class="card-ubic">${ic('pin')}<span>${p.zone ? esc(p.zone) + ' · ' : ''}<strong>${esc(cap(p.city))}</strong></span></div>
      <div class="card-meta">
        ${f.bedrooms ? `<span title="Habitaciones">${ic('bed')}${esc(f.bedrooms)}</span>` : ''}
        ${f.bathrooms ? `<span title="Baños">${ic('bath')}${esc(f.bathrooms)}</span>` : ''}
        ${f.garages ? `<span title="Parqueaderos">${ic('car')}${esc(f.garages)}</span>` : ''}
        ${f.stratum ? `<span class="e">Estrato ${esc(f.stratum)}</span>` : ''}
      </div>
      ${frescura(p)}
    </div>`;
}

/**
 * (definido arriba) Las fotos "genéricas" de los remates viven en Supabase Storage pesando ~1,9 MB
 * cada una: con 24 tarjetas eran 45 MB por pantalla y las tarjetas salían en
 * blanco mientras descargaban. Las mismas imágenes, optimizadas, se sirven desde
 * /img/ph (~95 KB). Si algún día aparece un tipo nuevo, cae al remoto.
 */
const PH_LOCAL = ['parking', 'apartment', 'house', 'lot', 'vehicle', 'farm', 'office', 'commercial', 'rights', 'unknown'];
function imgSrc(url) {
  if (!url) return url;
  const m = /placeholders\/ai\/([a-z]+)\.png$/.exec(url);
  return m && PH_LOCAL.includes(m[1]) ? `/img/ph/${m[1]}.jpg` : url;
}
function safeMediaUrl(url) {
  try {
    const parsed = new URL(String(imgSrc(url)), location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '/img/ph/unknown.jpg';
  } catch {
    return '/img/ph/unknown.jpg';
  }
}
function safeExternalUrl(url) {
  try {
    const parsed = new URL(String(url), location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
  } catch {
    return '#';
  }
}

/**
 * Alerta jurídica de cuota-parte (HU Motor de Remates Judiciales).
 *
 * Cuando el juzgado remata solo un porcentaje del bien, quien puja creyendo que
 * compra el inmueble entero termina de copropietario con un desconocido. Por eso
 * la alerta va en la TARJETA, antes de abrir la ficha: si solo estuviera en el
 * detalle, quien no entra a leerlo no se entera.
 */
const TEXTO_CUOTA_PARTE = 'El remate tiene una alerta amarilla porque se está rematando un porcentaje del bien, no el dominio o titularidad completa. Leer con detalle el aviso.';
const tieneCuotaParte = (p) => p && p.cuota_parte != null && Number(p.cuota_parte) !== 100;
/** ¿El servidor entregó esta ficha recortada por plan? */
const esBloqueada = (p) => p && p._bloqueada === true;

/**
 * Frescura de la ficha.
 *
 * A un activo de banco se le dice cuándo se VERIFICÓ que sigue disponible, nunca
 * su antigüedad: un inmueble en dación de pago puede llevar meses publicado sin
 * que eso signifique nada malo, y "Publicado hace 2 meses" lo mata sin motivo.
 * En el portal sí interesa cuándo se vio por última vez.
 */
const SIN_CADUCIDAD = ['davivienda', 'bancolombia', 'bbva', 'aval'];
function frescura(p) {
  const iso = p.last_seen_at || p.updated_at;
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d < 0) return '';
  const cuando = d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
  // Solo para la cartera de bancos, donde el aviso no caduca y saber que sigue
  // vigente sí dice algo. En el portal se retiró: el cliente preguntó qué era
  // «Visto hace 2 días» y, al explicárselo, «no es relevante». Es la fecha en que
  // NUESTRO motor confirmó que el aviso seguía publicado —un dato de nuestra
  // operación, no del inmueble— y ocupaba un sitio que ahora usa el descuento.
  if (!SIN_CADUCIDAD.includes(p.source)) return '';
  return `<span class="frescura" title="Última vez que el motor confirmó que sigue publicado">${ic('check')}Verificado ${cuando}</span>`;
}

/**
 * Sello sobre la foto: la ficha existe y se ve el descuento, falta desbloquearla.
 *
 * El texto depende de qué le falta a ESTE usuario, que es lo que el servidor
 * manda en `_acceso.requiere`. Antes decía "Desbloquear con suscripción" a todo
 * el mundo, incluido a quien solo tenía que registrarse: se le pedía pagar por
 * algo que ya podía obtener gratis.
 */
/** ¿Esta ficha la abrió el usuario gastando una de sus fichas del mes? */
const estaDesbloqueada = (p) => p?._acceso?.desbloqueada === true;

function selloSuscripcion(p) {
  // Ganada con el cupo: se dice. Sin este distintivo, una ficha que costó una de
  // las veinte del mes se pierde entre las mil que son gratis para cualquiera, y
  // el usuario no tiene forma de saber en cuáles gastó.
  if (estaDesbloqueada(p)) {
    return `<span class="badge-abierta">${ic('check')}Desbloqueada</span>`;
  }
  if (!esBloqueada(p)) return '';
  // Los remates no traen `discount_pct`: el suyo sale de la postura contra el
  // avalúo, igual que en `resumenBloqueo`. Sin esto un remate bloqueado decía
  // "Oportunidad detectada" y se perdía el único número que lo justifica.
  const bruto = p.discount_pct != null ? Number(p.discount_pct)
    : (p.appraisal_value > 0 && p.minimum_bid > 0 ? (1 - p.minimum_bid / p.appraisal_value) * 100 : null);
  const d = bruto != null && Number.isFinite(bruto) ? Math.round(bruto) : null;
  const contra = p.appraisal_value > 0 && p.discount_pct == null ? 'bajo el avalúo' : 'bajo ofertas similares';
  const requiere = p._acceso?.requiere;
  const accion = requiere === 'registro' ? 'Crea tu cuenta gratis para verla'
    : requiere === 'cupo' ? 'Ábrela con tu cupo del mes'
    : 'Desbloquear con suscripción';
  // El icono va según lo que el usuario PUEDE hacer, no según lo que le falta.
  //
  // Antes era un candado siempre, y el cliente lo dijo claro: en el plan gratuito,
  // donde estas fichas se abren con el cupo del mes, el candado transmite «esto
  // está cerrado» a alguien que justo puede abrirlo. Quita las ganas en vez de
  // darlas. Cuando hay cómo abrirla —registrarse o gastar cupo— se pone una mano
  // pulsando, que invita; el candado se reserva para lo que de verdad exige pagar.
  const invita = requiere === 'registro' || requiere === 'cupo';
  // El mensaje se conserva tal cual —«dejar el mensaje pero cambiar o quitar el
  // candado», dijo el cliente—. El porcentaje aparece ahora dos veces, aquí y en
  // su etiqueta de arriba, y es a propósito: la etiqueta es el dato, en el sitio
  // donde está en todas las tarjetas, y esto es el gancho.
  // Desde el 8%, no desde el 20%. Las «Interesante» rondan el 7-10% y salían sin
  // cifra, que era justo lo que el cliente echaba en falta: «¿cree usted que debería
  // estar ese porcentaje también? … está entre el 7 y el 9». Por debajo de 8 el
  // número no distingue nada y el nombre de la categoría dice más que él.
  const titular = d != null && d >= MIN_DESCUENTO_MOSTRABLE ? `${d}% ${contra}` : 'Oportunidad detectada';
  return `<div class="lock-overlay${invita ? ' es-invitacion' : ''}">${ic(invita ? 'tap' : 'lock')}`
    + `<span>${titular}</span><em>${accion}</em></div>`;
}

/**
 * ¿Sabemos qué clase de bien se subasta?
 *
 * Uno de cada seis avisos del juzgado llega sin tipo, y la tarjeta lo titulaba
 * «Inmueble», al lado de las que dicen «Casa» o «Local». Se lee como un dato
 * —vivienda genérica— cuando lo que pasa es que no lo sabemos: ese mismo aviso
 * puede ser un lote, una bodega o hasta un vehículo, y son decisiones de compra
 * distintas. Decir que falta cuesta una línea y no engaña a nadie.
 */
const tipoIdentificado = (t) => Boolean(t) && t !== 'other' && t !== 'others';
const TIPO_POR_CONFIRMAR = 'Tipo por confirmar';

function avisoCuotaParte(p) {
  if (!tieneCuotaParte(p)) return '';
  return `<span class="cuota-badge" title="${TEXTO_CUOTA_PARTE}">${ic('alert')}Solo el ${Number(p.cuota_parte)}% del bien</span>`;
}

function remateCard(p, kind) {
  const cover = p.image_url
    ? `<img src="${esc(safeMediaUrl(p.image_url))}" loading="lazy" alt="${esc(`${typeLbl(p.property_type)} en ${cap(p.city)}`)}">`
    : `<div class="card-ph">${ic('scale')}</div>`;
  return `
    <div class="card-img-wrap">${cover}<span class="source-badge">Remate</span>${countdownBadge(p.auction_date)}${favBtn(kind || 'remate', p.id)}${selloSuscripcion(p)}</div>
    <div class="card-body">
      <div class="card-price-label">Postura mínima</div>
      <div class="card-price">${fmtCOP(p.minimum_bid)}</div>
      ${p.appraisal_value ? `<div class="card-sub">Avalúo ${fmtCOP(p.appraisal_value)}${p.minimum_bid_pct ? ` · postura al ${p.minimum_bid_pct}%` : ''}</div>` : ''}
      <div class="card-titulo">${esc(tipoIdentificado(p.property_type) ? typeLbl(p.property_type) : TIPO_POR_CONFIRMAR)}${avisoCuotaParte(p)}</div>
      <div class="card-ubic">${ic('pin')}<span><strong>${esc(cap(p.city))}</strong>${p.department ? ', ' + esc(cap(p.department)) : ''}</span></div>
      <div class="card-meta">
        ${p.auction_date ? `<span title="Fecha de audiencia">${ic('calendar')}${fmtDate(p.auction_date)}</span>` : ''}
        ${p.auction_mode ? `<span class="e">${esc(cap(p.auction_mode))}</span>` : ''}
      </div>
    </div>`;
}
const fmtArea = (a) => (Number.isInteger(+a) ? a : (+a).toFixed(1)) + ' m²';

// Días hasta la audiencia → badge sobre la foto (pedido del cliente).
function daysToAuction(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return Math.round((d - new Date()) / 86400000);
}
function countdownBadge(iso) {
  const d = daysToAuction(iso);
  if (d == null) return '';
  if (d < 0) return '<span class="countdown past">Audiencia realizada</span>';
  if (d === 0) return '<span class="countdown now">¡HOY!</span>';
  if (d === 1) return `<span class="countdown soon">${ic('clock')}Mañana</span>`;
  if (d <= 7) return `<span class="countdown soon">${ic('clock')}En ${d} días</span>`;
  return `<span class="countdown">${ic('calendar')}En ${d} días</span>`;
}
// ── Calculadora de gastos de compra (pedido del cliente) ──
// Tarifas Colombia (estimadas): notaría ~0.54% repartida 50/50 → comprador 0.27%;
// impuesto de registro (beneficencia) ~1%; derechos de registro ~0.5%.
//
// Estos tres porcentajes ya NO son fijos: los edita el administrador desde
// /admin y llegan por `/api/config`. Los de aquí son el valor de arranque y el
// de respaldo — se usan tal cual mientras la respuesta viaja, y para siempre si
// la tabla de parámetros todavía no está aplicada en la base. La calculadora
// nunca se queda sin porcentajes ni muestra ceros.
const GASTOS = { notaria: 0.0027, impuesto: 0.01, derechos: 0.005 };

/** Porcentaje tal como se escribe en Colombia: 0,0027 → «0,27 %». */
const pctGasto = (fraccion) => `${(fraccion * 100).toLocaleString('es-CO', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
})} %`;

/**
 * Trae los porcentajes vigentes. Cualquier fallo se traga a propósito: los
 * valores de arranque ya son correctos y una ficha sin calculadora sería peor
 * que una calculadora con las tarifas del mes pasado.
 */
async function cargarParametrosGastos() {
  try {
    const r = await fetch('/api/config');
    const config = await r.json();
    const g = config && config.gastos;
    if (!g) return;
    // Se comprueba uno por uno: si el servidor degradó a valores por defecto
    // manda exactamente los mismos números, y si mandara basura no se pisa lo
    // que ya funciona.
    for (const [clave, valor] of [
      ['notaria', g.notaria], ['impuesto', g.impuestoRegistro], ['derechos', g.derechosRegistro],
    ]) {
      if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 0.05) {
        GASTOS[clave] = valor;
      }
    }
  } catch { /* se sigue con los valores de arranque */ }
}

function calcGastos(valor, mode) {
  const lines = [];
  // La etiqueta lleva el porcentaje que se está aplicando de verdad. Antes era
  // texto fijo («1%»): con las tarifas editables, un rótulo que no siguiera al
  // número sería una mentira sobre la propia cuenta que muestra al lado.
  if (mode !== 'remate') lines.push([`Gastos de notaría (comprador ~${pctGasto(GASTOS.notaria)})`, valor * GASTOS.notaria]);
  lines.push([`Impuesto de registro (${pctGasto(GASTOS.impuesto)})`, valor * GASTOS.impuesto]);
  lines.push([`Derechos de registro (${pctGasto(GASTOS.derechos)})`, valor * GASTOS.derechos]);
  const total = lines.reduce((a, [, v]) => a + v, 0);
  return { lines, total, pct: valor ? (total / valor) * 100 : 0 };
}
function renderCalc(valor, mode) {
  const { lines, total, pct } = calcGastos(valor, mode);
  const rows = lines.map(([l, v]) => `<div class="calc-row"><span>${l}</span><strong>${fmtCOP(Math.round(v))}</strong></div>`).join('');
  const tot = `Gastos estimados: <strong>${fmtCOP(Math.round(total))}</strong> <span>(~${pct.toFixed(1)}% del valor)</span>`;
  const grand = `<span>${mode === 'remate' ? 'Base + registro estimado' : 'Costo estimado de adquisición'}</span><strong>${fmtCOP(Math.round(valor + total))}</strong>`;
  return { rows, tot, grand, expenses: total, acquisitionTotal: valor + total };
}
function calcRentalYield(acquisitionTotal, monthlyRent, monthlyAdmin = 0) {
  const annualGross = monthlyRent * 12;
  const vacancy = annualGross * 0.08;
  const maintenance = annualGross * 0.05;
  const annualNet = Math.max(0, annualGross - vacancy - maintenance - monthlyAdmin * 12);
  return {
    grossYield: acquisitionTotal > 0 ? (annualGross / acquisitionTotal) * 100 : 0,
    netYield: acquisitionTotal > 0 ? (annualNet / acquisitionTotal) * 100 : 0,
    annualNet,
  };
}
function renderRentalYield(acquisitionTotal, monthlyRent, monthlyAdmin) {
  // «Canon» es palabra de abogado y el campo de arriba ya se llama «Valor de
  // arrendamiento mensual»: la ayuda pedía en otro idioma lo mismo que el campo.
  if (!monthlyRent) return '<span>Escribe cuánto crees que podrías cobrar de arriendo al mes para calcular la rentabilidad.</span>';
  const result = calcRentalYield(acquisitionTotal, monthlyRent, monthlyAdmin);
  // Un 31% bruto anual sale de la calculadora sin que nada avise de que es
  // extraordinario, y quien no ha invertido nunca no tiene con qué compararlo:
  // se lo lleva como expectativa. Casi siempre viene de un precio de oferta
  // atípico o de un arriendo estimado de más, no de un negocio irrepetible.
  const fueraDeRango = result.grossYield > 12;
  const aviso = fueraDeRango
    ? `<p class="rent-atipico">${ic('alert')} En Colombia lo habitual es entre 5% y 8% bruto anual.
       Un número muy por encima suele venir de un precio de oferta atípico o de un arriendo
       estimado de más: contrástalo antes de contar con él.</p>`
    : '';
  return `${aviso}<div><span>Rentabilidad bruta anual</span><strong>${result.grossYield.toFixed(2)}%</strong></div>
    <div><span>Rentabilidad neta estimada</span><strong>${result.netYield.toFixed(2)}%</strong></div>
    <small>Neto estimado: ${fmtCOP(Math.round(result.annualNet))}/año, descontando 8% de vacancia, 5% de mantenimiento${
      monthlyAdmin > 0 ? ` y ${fmtCOP(Math.round(monthlyAdmin))}/mes de administración` : ''
    }.${monthlyAdmin > 0 ? '' : ' No incluye administración ni predial: si los hay, escríbelos arriba.'}</small>`;
}
window.__recalcGastos = function (input) {
  const calc = input.closest('.calc');
  const valor = Number((input.value || '').replace(/[^0-9]/g, '')) || 0;
  const { rows, tot, grand } = renderCalc(valor, calc.dataset.mode);
  calc.querySelector('.calc-rows').innerHTML = rows;
  calc.querySelector('.calc-total').innerHTML = tot;
  calc.querySelector('.calc-grand').innerHTML = grand;
  const saveButton = calc.querySelector('[data-save-simulation]');
  if (saveButton) {
    const key = favKey(calc.dataset.kind, calc.dataset.id);
    saveButton.textContent = savedSimulations.has(key) ? 'Actualizar simulación' : 'Guardar simulación';
  }
  const rentResult = calc.querySelector('.rent-result');
  if (rentResult) {
    const rent = Number((calc.querySelector('[data-rent]')?.value || '').replace(/[^0-9]/g, '')) || 0;
    const admin = Number((calc.querySelector('[data-admin]')?.value || '').replace(/[^0-9]/g, '')) || 0;
    rentResult.innerHTML = renderRentalYield(valor + renderCalc(valor, calc.dataset.mode).expenses, rent, admin);
  }
};
window.__recalcRent = function (input) {
  const calc = input.closest('.calc');
  const valor = Number((calc.querySelector('.calc-input')?.value || '').replace(/[^0-9]/g, '')) || 0;
  const rent = Number((calc.querySelector('[data-rent]')?.value || '').replace(/[^0-9]/g, '')) || 0;
  const admin = Number((calc.querySelector('[data-admin]')?.value || '').replace(/[^0-9]/g, '')) || 0;
  const { acquisitionTotal } = renderCalc(valor, calc.dataset.mode);
  calc.querySelector('.rent-result').innerHTML = renderRentalYield(acquisitionTotal, rent, admin);
};
function persistSimulations() {
  writeStoredJson(RADAR_SIMULATIONS_KEY, [...savedSimulations.values()]);
}
function saveSimulation(calc) {
  const input = calc.querySelector('.calc-input');
  const valor = Number((input?.value || '').replace(/[^0-9]/g, '')) || 0;
  if (!valor || !calc.dataset.kind || !calc.dataset.id) return;
  const { expenses, acquisitionTotal } = renderCalc(valor, calc.dataset.mode);
  const key = favKey(calc.dataset.kind, calc.dataset.id);
  savedSimulations.set(key, {
    key,
    kind: calc.dataset.kind,
    id: calc.dataset.id,
    title: calc.dataset.title || 'Inmueble',
    city: calc.dataset.city || '',
    mode: calc.dataset.mode || 'compra',
    base: valor,
    expenses: Math.round(expenses),
    acquisitionTotal: Math.round(acquisitionTotal),
    monthlyRent: Number((calc.querySelector('[data-rent]')?.value || '').replace(/[^0-9]/g, '')) || 0,
    monthlyAdmin: Number((calc.querySelector('[data-admin]')?.value || '').replace(/[^0-9]/g, '')) || 0,
    savedAt: new Date().toISOString(),
  });
  persistSimulations();
  const button = calc.querySelector('[data-save-simulation]');
  if (button) button.textContent = 'Simulación guardada ✓';
  const status = calc.querySelector('.calc-save-status');
  if (status) status.textContent = 'Disponible en este dispositivo para retomarla después.';
  if (auth.token) void syncAccountContext();
  renderRadarSetup();
  showToast(auth.token ? 'Simulación guardada y sincronizándose con tu cuenta.' : 'Simulación guardada en este dispositivo.');
}
// ── Análisis preliminar automático del aviso (pedido del cliente) ──
// Rule-based: escanea la publicación + tipo + números y señala banderas para
// el inversionista. NO sustituye asesoría legal. Upgradeable a IA real luego.
function analisisRemate(p) {
  const f = p.features || {};
  const text = `${f.copia_publicacion || ''} ${p.description || ''} ${f.title_raw || ''}`.toLowerCase();
  const flags = [];
  const pct = p.minimum_bid && p.appraisal_value ? Math.round((p.minimum_bid / p.appraisal_value) * 100) : (p.minimum_bid_pct || null);
  // Positivos (+)
  //
  // La base del 70% NO es un punto a favor de este remate: es la ley, y sale
  // igual en todos. Presentarla como «margen estimado bajo el valor comercial»,
  // con el visto verde de los aciertos, le vendía al aficionado un 30% que nadie
  // le garantiza —el avalúo del juzgado puede estar por encima o por debajo del
  // precio real—. La propia portada llama «ruido» a ordenar por ese número. Es el
  // error más caro que alguien puede cometer con esta pantalla, así que pasa a
  // ser un dato neutro y explicado, no un premio.
  if (pct && pct < 70) {
    flags.push(['pos', `Postura al ${pct}% del avalúo: por debajo del 70% habitual, porque esta subasta ya va en segunda o tercera licitación.`]);
  } else if (pct) {
    flags.push(['info', `La postura mínima es el ${pct}% del avalúo fijado por el juzgado. Es la base legal de todas las subastas, no un descuento de este bien: el avalúo puede estar por encima o por debajo del precio de mercado.`]);
  }
  if (f.is_bank_plaintiff) flags.push(['pos', 'Demandante es banco: los procesos hipotecarios suelen tener título limpio y bien documentado.']);
  if (/(remate|venta).{0,20}(del|sobre el)\s*100\s*%/.test(text) && !/proindiviso|cuota parte/.test(text)) flags.push(['pos', 'Se remata el 100% del inmueble (no una cuota parte).']);
  // Riesgo alto (!)
  if (/proindiviso|cuota parte|derechos?\s+(de\s+cuota|herenciales|y\s+acciones)|cuota\s+proindiviso|porcentaje\s+del\s+derecho/.test(text) || p.property_type === 'rights') flags.push(['warn', 'Podría rematarse solo una CUOTA/derechos (no el 100%): confirma qué porcentaje se adjudica.']);
  if (/ocupad|arrendad|poseedor|habitad|inquilino|en posesi/.test(text)) flags.push(['warn', 'El inmueble podría estar ocupado/arrendado: la entrega material puede demorar.']);
  const dias = daysToAuction(p.auction_date);
  if (dias != null && dias >= 0 && dias <= 3) flags.push(['warn', `Audiencia ${dias === 0 ? 'HOY' : 'en ' + plural(dias, 'día', 'días')}: poco margen para revisar los documentos del inmueble y hacer el depósito bancario.`]);
  // Cautela (-)
  if (p.property_type === 'lot' || p.property_type === 'farm' || /\bbald[ií]o|predio rural|vereda\b/.test(text)) flags.push(['neg', 'Bien rural/lote: menor liquidez y avalúo más variable.']);
  if (/servidumbre/.test(text)) flags.push(['neg', 'Menciona servidumbre: revisar afectaciones al predio.']);
  if (p.property_type === 'vehicle' || /\bautomotor|n[uú]mero de placa\b/.test(text)) flags.push(['neg', 'Es un vehículo, no un inmueble.']);
  // Nivel global
  const n = (t) => flags.filter((x) => x[0] === t).length;
  let nivel = 'media';
  if (n('warn') >= 1) nivel = 'precaucion';
  else if (n('pos') >= 2 && n('neg') === 0) nivel = 'buena';
  return { nivel, flags };
}
function analisisSection(p) {
  const { nivel, flags } = analisisRemate(p);
  if (!flags.length) return '';
  const meta = {
    buena: [ic('check-circle', 'ic-reicon analysis-icon is-positive'), 'Oportunidad atractiva'],
    media: [ic('magnifier', 'analysis-icon is-review'), 'Requiere revisión'],
    precaucion: [ic('alert-triangle', 'ic-reicon analysis-icon is-warning'), 'Revisar con cuidado'],
  }[nivel];
  const icon = {
    pos: ic('check-circle', 'ic-reicon analysis-icon is-positive'),
    warn: ic('alert-triangle', 'ic-reicon analysis-icon is-warning'),
    neg: ic('magnifier', 'analysis-icon is-review'),
    // Ni acierto ni riesgo: contexto. La balanza —la misma de la pestaña de
    // remates— dice «esto lo fija la ley», que es justo lo que hay que entender
    // para no leer la base del 70% como un descuento conseguido.
    info: ic('scale', 'analysis-icon is-review'),
  };
  return `<div class="section"><h3>Análisis preliminar automático</h3>
    <div class="analisis analisis-${nivel}">
      <div class="analisis-head">${meta[0]} <strong>${meta[1]}</strong></div>
      <ul class="analisis-list">${flags.map(([t, txt]) => `<li>${icon[t]} ${txt}</li>`).join('')}</ul>
      <p class="analisis-note">Análisis automático orientativo a partir del texto del aviso. No sustituye el estudio de títulos ni la asesoría legal.</p>
    </div></div>`;
}

// ---------- Análisis con IA (OpenAI, bajo demanda) ----------
function aiSection(kind, id) {
  if (!id) return '';
  return `<div class="section"><h3>Análisis con IA</h3>
    <div class="ai-wrap">
      <button class="ai-btn" data-ai-kind="${esc(kind)}" data-ai-id="${esc(id)}">${ic('spark')} Analizar esta oportunidad con IA</button>
      <p class="ai-hint">Compara contra el mercado de la zona (FincaRaíz) y da una opinión preliminar de inversión.</p>
    </div></div>`;
}
const COPn = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO'));
function marketCtxHtml(m) {
  if (!m || !m.n) return '';
  const tipo = m.matched_type ? `mismo tipo` : `todos los tipos`;
  const conf = { high: 'Alta', medium: 'Media', low: 'Baja', insufficient: 'Insuficiente' }[m.confidence] || m.confidence;
  const scopeIcon = ic(m.scope === 'ciudad' ? 'map' : 'pin');
  const scopeLbl = m.scope === 'ciudad' ? `${esc(cap(m.city))} · toda la ciudad` : esc(m.scope_label || 'sector');
  const crit = (m.criteria || []).length
    ? `<div class="crit-chips" style="margin-bottom:10px">${m.criteria.map((c) => `<span class="crit-chip">${esc(c)}</span>`).join('')}</div>`
    : '';
  return `<div class="ai-scope">${scopeIcon} Comparado contra <strong>${scopeLbl}</strong></div>
  ${crit}
  <div class="ai-mkt">
    <div><span class="l">Mediana de mercado</span><strong>${COPn(m.median_total)}</strong>${m.median_ppm2 ? `<span class="sub">${COPn(m.median_ppm2)}/m²</span>` : ''}</div>
    <!-- «Cuartil bajo (P25)» decía lo mismo en estadístico. Quien compra un
         apartamento no tiene por qué saber qué es un percentil, y aquí sobra:
         el dato es «el 25% más barato de la zona empieza en esta cifra». -->
    <div><span class="l">El 25% más barato</span><strong>${COPn(m.p25_total)}</strong></div>
    <div><span class="l">Comparables</span><strong>${m.n}</strong><span class="sub">${tipo}</span></div>
  </div>`;
}
/**
 * Cómo se llama aquí el paso de comprobar antes de comprometerse.
 *
 * Solo en un remate se puja. Un activo de banco se negocia y se firma, así que
 * «Verificar antes de pujar» sobre una ficha de Bancos le hace creer al lector
 * que ese inmueble también sale a subasta —y con ello, que hay una fecha, un
 * depósito previo y otros postores compitiendo—. Nada de eso existe ahí.
 */
const tituloDueDiligence = (kind) => (kind === 'remate' ? 'Verificar antes de pujar' : 'Verificar antes de comprar');

function renderAI(result, kind) {
  const m = result.market;
  if (!result.ok) {
    if (result.needs_key) {
      return `${marketCtxHtml(m)}<div class="ai-note">${ic('alert-triangle', 'ic-reicon analysis-icon is-warning')}<span>La opinión con IA aún no está activa: falta configurar la clave de OpenAI en el servidor. Arriba ves los comparables de mercado de la zona.</span></div>`;
    }
    return `${marketCtxHtml(m)}<div class="ai-note">No se pudo generar el análisis: ${esc(result.error || 'error')}.</div>`;
  }
  const ai = result.ai;
  const meta = {
    atractiva: [ic('check-circle', 'ic-reicon analysis-icon is-positive'), 'Atractiva', 'ai-buena'],
    neutral: [ic('magnifier', 'analysis-icon is-review'), 'Neutral', 'ai-media'],
    riesgosa: [ic('alert-triangle', 'ic-reicon analysis-icon is-warning'), 'Riesgosa', 'ai-precaucion'],
  }[ai.veredicto] || [ic('magnifier', 'analysis-icon is-review'), ai.veredicto, 'ai-media'];
  const li = (arr) => (arr && arr.length ? `<ul class="ai-list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="ai-empty">—</p>');
  const estim = ai.estimado_mercado_cop != null
    ? `<div class="ai-estim"><div><span class="l">Valor de mercado estimado</span><strong>${COPn(ai.estimado_mercado_cop)}</strong></div>${ai.descuento_estimado_pct != null ? `<div><span class="l">${ai.descuento_estimado_pct >= 0 ? 'Descuento estimado' : 'Sobreprecio estimado'}</span><strong style="color:${ai.descuento_estimado_pct >= 0 ? '#16a34a' : '#dc2626'}">${ai.descuento_estimado_pct >= 0 ? '−' : '+'}${Math.abs(ai.descuento_estimado_pct)}%</strong></div>` : ''}</div>`
    : '';
  return `<div class="aiblock ${meta[2]}">
      <div class="ai-head">${meta[0]} <strong>${esc(meta[1])}</strong> <span class="ai-score">${Number(ai.puntaje) || 0}/100</span></div>
      <p class="ai-resumen">${esc(ai.resumen)}</p>
      ${estim}
      ${marketCtxHtml(m)}
      <div class="ai-cols">
        <div><h4>${ic('check-circle', 'ic-reicon analysis-icon is-positive')} A favor</h4>${li(ai.a_favor)}</div>
        <div><h4>${ic('alert-triangle', 'ic-reicon analysis-icon is-warning')} En contra</h4>${li(ai.en_contra)}</div>
      </div>
      <h4>${ic('magnifier', 'analysis-icon is-review')} ${tituloDueDiligence(kind)}</h4>${li(ai.riesgos_due_diligence)}
      <p class="ai-reco"><strong>Recomendación:</strong> ${esc(ai.recomendacion)}</p>
      <p class="ai-meta">Generado por IA (${esc(ai._meta?.model || 'modelo')}) · ${ai._meta?.comparables_n ?? m?.n ?? 0} comparables${result.cached ? ' · cacheado' : ''}. Opinión orientativa; no sustituye estudio de títulos ni asesoría profesional.</p>
    </div>`;
}
// Recomendaciones: otras oportunidades en la misma ciudad (cruzando fuentes).
const RKIND = { portal: ['home', 'Portal'], banco: ['bank', 'Banco'], remate: ['scale', 'Remate'] };
window.__recFallback = (el) => {
  const w = el.parentElement;
  if (w) w.innerHTML = `<div class="rec-ph">${ic('home', 'ic-lg')}</div>`;
};
function recCard(r) {
  const k = RKIND[r.kind] || ['home', r.kind];
  const ph = `<div class="rec-ph">${ic(k[0], 'ic-lg')}</div>`;
  const img = r.image
    ? `<img src="${esc(safeMediaUrl(r.image))}" loading="lazy" alt="${esc(`${typeLbl(r.type)} en ${cap(r.city)}`)}" data-rec-image>`
    : ph;
  const disc = r.discount_pct != null ? `${Math.round(r.discount_pct)}% ${esc(r.metric_label || '')}` : '';
  // El tipo del inmueble se lee en la línea de abajo: repetirlo aquí solo hacía
  // que la etiqueta se cortara a media palabra.
  const zoneBadge = r.same_zone ? `<span class="rec-zone">${ic('pin')}mismo barrio</span>` : '';
  const loc = `${r.zone ? esc(r.zone) + ', ' : ''}${esc(cap(r.city))}`;
  return `<button class="rec-card" data-rec-kind="${esc(r.kind)}" data-rec-id="${esc(r.id)}">
    <div class="rec-img">${img}<span class="rec-disc">−${Math.round(r.discount_pct || 0)}%</span>${zoneBadge}</div>
    <div class="rec-body">
      <div class="rec-kind">${ic(k[0])}${esc(k[1])}</div>
      <div class="rec-type">${esc(typeLbl(r.type))} · ${loc}</div>
      <div class="rec-price">${fmtCOP(r.price)}</div>
      <div class="rec-meta">${disc}</div>
    </div></button>`;
}
function renderRecs(recs) {
  if (!recs || !recs.length) return '';
  const anyZone = recs.some((r) => r.same_zone);
  const hint = anyZone
    ? 'Priorizadas por cercanía (mismo barrio) y oportunidad de inversión.'
    : 'Otras propiedades de la misma ciudad ordenadas por oportunidad de inversión.';
  return `<div class="section"><h3>Mejores oportunidades en la zona</h3>
    <p class="rec-hint">${hint}</p>
    <div class="rec-grid">${recs.map(recCard).join('')}</div></div>`;
}
window.__openRec = async function (kind, id) {
  try {
    const res = await fetch(`/api/property?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) return;
    // Cupo agotado. El servidor no rechaza la petición —devuelve la ficha
    // recortada, que es lo correcto— así que el caso se reconoce por sus tres
    // señales: llega bloqueada, el plan es gratuito y no quedan fichas. Es el
    // momento exacto en que la suscripción significa algo para esta persona, y
    // por eso el aviso va aquí y no en un banner permanente.
    const sinCupo = data.data?._bloqueada
      && data.plan === 'free'
      && data.cupo && !data.cupo.ilimitado && data.cupo.restantes === 0;
    if (sinCupo) { mostrarCupoAgotado(data.cupo, kind, id, data.data); return; }
    if (kind === 'remate') openRemate(data.data);
    else openInmueble(data.data);
    document.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'instant' });
    // La tarjeta del listado tiene que enterarse AHORA, no al recargar. Antes el
    // candado seguía puesto hasta que el usuario refrescaba la página: acababa de
    // gastar una de sus veinte fichas y la pantalla seguía diciéndole que estaba
    // cerrada, que es la peor forma posible de cobrar algo.
    refrescarTarjeta(kind, id, data.data);
    if (data.cupo) actualizarContadorCupo(data.cupo);
  } catch (e) { /* noop */ }
};

/**
 * Repinta una tarjeta del listado con la ficha que acaba de devolver el servidor.
 *
 * Se reconstruye entera en vez de quitarle la clase del candado: la ficha abierta
 * trae dirección, fotos y datos que la versión recortada no tenía, y dejar media
 * tarjeta actualizada es peor que no tocarla.
 */
function refrescarTarjeta(kind, id, ficha) {
  propertyCache.set(favKey(kind, id), ficha);
  const enGrid = document.querySelector(`#grid article.card:has([data-fav-id="${CSS.escape(id)}"])`);
  if (enGrid) {
    const sustituto = document.createElement('div');
    renderCards([ficha], sustituto, true);
    const nueva = sustituto.querySelector('article.card');
    if (nueva) { enGrid.replaceWith(nueva); paintFavs(); }
    return;
  }
  // La portada usa las mismas tarjetas que el listado, así que se repinta igual.
  // Cuando eran filas de texto hacía falta un camino aparte que quitaba el
  // candado a mano; volver a las tarjetas se llevó por delante esa duplicación.
  const enHome = document.querySelector(`#home article.card:has([data-fav-id="${CSS.escape(id)}"])`);
  if (!enHome) return;
  const sustituto = document.createElement('div');
  renderCards([ficha], sustituto, true);
  const nueva = sustituto.querySelector('article.card');
  if (nueva) {
    enHome.replaceWith(nueva);
    paintFavs();
  }
}

/**
 * Estado del último aviso pintado, para poder repintarlo tras gastar una ficha.
 *
 * Sin esto habría que volver a pedir el listado entero solo para actualizar un
 * número, y el usuario vería la pantalla recargarse por haber abierto una ficha.
 */
let ultimoAviso = null;

/** Repinta el aviso con el cupo nuevo y una ficha bloqueada menos. */
function actualizarContadorCupo(cupo) {
  if (!ultimoAviso || !cupo || cupo.ilimitado) return;
  const bloqueo = ultimoAviso.bloqueo
    ? { ...ultimoAviso.bloqueo, bloqueadas: Math.max(0, ultimoAviso.bloqueo.bloqueadas - 1) }
    : ultimoAviso.bloqueo;
  renderAvisoBloqueo(ultimoAviso.plan, bloqueo, cupo, ultimoAviso.caja);
}

/**
 * Aviso de cupo agotado.
 *
 * Aparece en el momento exacto en que el usuario intenta abrir la ficha veintiuna
 * — que es cuando la suscripción significa algo para él, y no antes. Dice tres
 * cosas y en este orden: que puede seguir usando el Radar, cuándo vuelve su cupo,
 * y qué le costaría no esperar.
 */
function mostrarCupoAgotado(cupo, kind, id, ficha) {
  const dias = Number(cupo?.diasParaReinicio) || null;
  const cuando = dias === 1 ? 'mañana' : dias ? `en ${dias} días` : 'el día 1 del próximo mes';
  const cuerpo = `
    <div class="cupo-agotado">
      <span class="cupo-ic">${ic('lock')}</span>
      <h2>Se te acabaron las ${CUPO_FREE_MENSUAL} fichas de este mes</h2>
      <p>Puedes seguir explorando el Radar con normalidad: los listados, los filtros
      y las fichas abiertas siguen ahí. Lo que no podrás hasta que vuelva tu cupo es
      abrir nuevas oportunidades de descuento alto.</p>
      <p class="cupo-reinicio">${ic('calendar')}<span>Tu cupo se reinicia <strong>${esc(cuando)}</strong></span></p>
      ${avisoPiloto()}
      <div class="cupo-acciones">
        <a class="wall-cta" href="/planes">Desbloquear todo</a>
        <button class="cupo-seguir" id="cupo-seguir" type="button">Seguir explorando</button>
      </div>
    </div>`;
  $('modal-content').innerHTML = cuerpo;
  // La ficha no llegó a abrirse, pero es exactamente la que el usuario quería:
  // si desde aquí se va a suscribirse, volver al listado sería hacerle repetir la
  // búsqueda que acaba de pagar.
  if (kind && id) recordarFichaEnPantalla(kind, id, tituloFicha(ficha));
  showModal();
  $('cupo-seguir')?.addEventListener('click', closeModal);
}
window.__analyzeAI = async function (btn, kind, id) {
  const wrap = btn.closest('.ai-wrap');
  if (!wrap) return;
  btn.disabled = true;
  wrap.innerHTML = '<div class="ai-loading"><span class="spinner"></span> Analizando contra el mercado de la zona…</div>';
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    });
    const data = await res.json();
    const lazy = $('rec-lazy'); // ya las mostró el mercado bajo demanda: no duplicar
    if (lazy) lazy.remove();
    wrap.innerHTML = renderAI(data, kind) + renderRecs(data.recommendations);
  } catch (e) {
    wrap.innerHTML = `<div class="ai-note">No se pudo conectar con el análisis: ${esc(String(e))}.</div>`;
  }
};

function gastosSection(valor, mode, context) {
  if (!valor || valor <= 0) return '';
  const { rows, tot, grand, acquisitionTotal } = renderCalc(valor, mode);
  const titulo = mode === 'remate' ? 'Calculadora de gastos (registro de la adjudicación)' : 'Calculadora de gastos de compra';
  const key = context?.kind && context?.id ? favKey(context.kind, context.id) : '';
  const saved = key ? savedSimulations.has(key) : false;
  const contextData = key
    ? ` data-kind="${esc(context.kind)}" data-id="${esc(context.id)}" data-title="${esc(context.title || 'Inmueble')}" data-city="${esc(context.city || '')}"`
    : '';
  return `<div class="section"><h3>${titulo}</h3>
    <div class="calc" data-mode="${mode || 'compra'}"${contextData}>
      <label class="calc-label">Valor base (editable)</label>
      <input class="calc-input" type="text" inputmode="numeric" value="${fmtCOP(valor)}" aria-label="Valor base para calcular gastos">
      <div class="calc-rows">${rows}</div>
      <div class="calc-total">${tot}</div>
      <div class="calc-grand">${grand}</div>
      ${mode !== 'remate' ? `<div class="rent-box">
        <div class="rent-head"><span class="calc-label">Rentabilidad por arriendo</span><small data-rent-origin>Buscando arriendos comparables…</small></div>
        <div class="rent-market-status" data-rental-market aria-live="polite">
          <span class="spinner"></span> Estimando el valor del arriendo con avisos similares de la zona…
        </div>
        <div class="rent-inputs">
          <label>Valor de arrendamiento mensual<input class="rent-input" data-rent type="text" inputmode="numeric" placeholder="$ 2.500.000"></label>
          ${/* Con 0 escrito, no solo como sugerencia: la mayoría de los inmuebles no
                tiene administración y dejar el campo vacío hacía que la rentabilidad
                se calculara sobre un dato ausente. Lo pidió el cliente por eso mismo,
                «para que la fórmula no le vaya a generar un error». */ ''}
          <label>Administración mensual<input class="rent-input" data-admin type="text" inputmode="numeric" placeholder="$ 0" value="${Number(context?.admin) > 0 ? Math.round(Number(context.admin)) : 0}"></label>
        </div>
        <div class="rent-result">${renderRentalYield(acquisitionTotal, 0, 0)}</div>
      </div>` : ''}
      ${key ? `<div class="calc-save-row">
        <button class="calc-save" type="button" data-save-simulation>${saved ? 'Actualizar simulación' : 'Guardar simulación'}</button>
        <span class="calc-save-status" aria-live="polite">${saved ? 'Ya guardada en este dispositivo.' : 'No necesitas crear una cuenta.'}</span>
      </div>` : ''}
      <p class="calc-note">Estimado de gastos en Colombia${mode === 'remate' ? ' (la postura mínima puede no ser el precio final; el auto de adjudicación se registra)' : ''}. Varía por departamento; no incluye honorarios, hipoteca, administración ni intermediación.</p>
    </div></div>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}
// Placeholder branded para activos de banco sin foto real (Aval/AV Villas vienen de PDF).
function bankPlaceholder(p) {
  return `<div class="bank-ph"><div class="bank-ph-icon">${srcIcon(p.source)}</div><div class="bank-ph-label">Activo de banco</div><div class="bank-ph-type">${esc(typeLbl(p.type))}</div></div>`;
}
// Fallback cuando una foto falla al cargar (onerror): banco → tarjeta branded; portal → icono.
window.__cardFallback = function (el, source, type) {
  el.innerHTML = source && source !== 'fincaraiz'
    ? bankPlaceholder({ source, type })
    : `<div class="card-ph">${srcIcon(source)}</div>`;
};

// ---------- Modal ----------
let gImgs = [], gIdx = 0;

/**
 * Qué ficha hay ahora mismo en el diálogo, para poder guardarla si el usuario se
 * va desde ella a registrarse o a ver los planes. Es `null` con el diálogo
 * cerrado: sin eso, un enlace pulsado media hora después guardaría una ficha que
 * el usuario ya había abandonado.
 */
let fichaEnPantalla = null;

/** Cómo se llama una ficha para una persona. Solo para texto, nunca para decidir. */
function tituloFicha(p) {
  return `${typeLbl(p?.type || p?.property_type)} en ${cap(p?.city)}`;
}

function recordarFichaEnPantalla(kind, id, titulo) {
  fichaEnPantalla = { kind, id: String(id), titulo };
}

/** Palabras con las que ninguna frase queda cerrada: si el texto acaba aquí, venía a medias. */
const PALABRAS_COLGANTES = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u',
  'en', 'con', 'por', 'para', 'que', 'se', 'su', 'sus', 'al', 'a', 'como', 'sobre',
  'desde', 'hasta', 'entre', 'sin', 'tras', 'lo', 'le', 'les',
]);
/** Letras con las que sí termina una palabra en español; el resto delata un corte. */
const FINALES_DE_PALABRA = 'nrsldzjxym';

/**
 * ¿La descripción llegó cortada desde la fuente?
 *
 * Varios bancos publican la descripción dentro de un PDF y el texto se corta
 * donde se acaba la caja, a media palabra: «…esquinero de la urbani». Mostrarla
 * tal cual hace creer que el aviso dice exactamente eso, y quien lee se queda
 * buscando el resto de una frase que aquí no existe. Cuatro de cada diez avisos
 * de Aval llegan así.
 *
 * Se detecta por la forma del final, no por la longitud: el corte no cae en una
 * cifra fija de caracteres sino donde termina la caja del PDF. Un texto completo
 * cierra con puntuación; uno cortado termina en una palabra que se queda a medias
 * («urbani», «locali») o en una que no puede cerrar nada («…de la», «…por una»).
 *
 * Es deliberadamente prudente: prefiere callar antes que acusar de incompleta una
 * descripción que sí está entera, porque un aviso falso enseña a desconfiar de los
 * verdaderos. Contrastada contra 826 avisos reales de las cinco fuentes, marcó 101
 * y ninguno estaba completo. Por eso se descartan los nombres propios («…en Cali»),
 * los códigos y los enlaces, donde la forma de la palabra no dice nada.
 */
function descripcionIncompleta(texto) {
  const limpio = String(texto ?? '').trim();
  if (limpio.length < 12) return false;
  if (/[.!?…»”’")\]]$/.test(limpio)) return false;
  // Nadie termina de describir su inmueble con una coma. Cuando la frase acaba en
  // un separador —«…Sala-comedor, cocina,», «…contáctanos:»— lo que venía después
  // no cabía en la caja del PDF.
  if (/[,;:—–-]$/.test(limpio)) return true;
  const ultima = limpio.split(/\s+/).pop() ?? '';
  if (/[./:@]|\d/.test(ultima)) return false;
  const letras = ultima.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!letras) return false;
  if (PALABRAS_COLGANTES.has(letras)) return true;
  if (ultima[0] !== ultima[0].toLowerCase()) return false;
  if (letras.endsWith('ing')) return false; // «leasing», «parking»: préstamos completos
  const fin = letras.slice(-1);
  if ('aeoáéíóúü'.includes(fin)) return false;
  if (fin === 'i' || fin === 'u') return letras.length >= 4;
  return !FINALES_DE_PALABRA.includes(fin);
}

/** Hasta dónde se enseña la descripción del aviso dentro de la ficha. */
const LARGO_MAXIMO_DESCRIPCION = 900;

/**
 * La descripción del aviso, diciendo cuándo no está entera.
 *
 * Son dos cortes distintos y hasta ahora los dos se hacían en silencio: el de la
 * fuente y el nuestro, que pasado el largo máximo dejaba la frase a la mitad sin
 * más. Da igual quién cortó: quien lee necesita saber que lo que tiene delante no
 * es todo lo que decía el aviso, y a dónde ir por el resto.
 */
function bloqueDescripcion(texto) {
  const completo = String(texto ?? '').trim();
  if (!completo) return '';
  const recortada = completo.length > LARGO_MAXIMO_DESCRIPCION;
  // El corte cae en un espacio: partir la última palabra sería reproducir aquí el
  // mismo defecto que estamos señalando en la fuente.
  const corte = completo.lastIndexOf(' ', LARGO_MAXIMO_DESCRIPCION);
  const visible = recortada
    ? `${completo.slice(0, corte > 400 ? corte : LARGO_MAXIMO_DESCRIPCION)}…`
    : completo;
  let aviso = '';
  if (recortada) aviso = 'Descripción recortada aquí; el aviso original la trae completa.';
  else if (descripcionIncompleta(completo)) aviso = 'Texto incompleto en la fuente original.';
  return `<div class="section"><h3>Descripción</h3><p>${esc(visible)}</p>${
    aviso ? `<p class="desc-aviso">${aviso}</p>` : ''
  }</div>`;
}

function openModal(p) {
  if (state.tab === 'remates') return openRemate(p);
  return openInmueble(p);
}
function openInmueble(p) {
  if (!gateFicha(p.id)) return; // muro de registro si el anónimo superó el cupo
  const anon = !auth.token;
  const f = p.features || {};
  gImgs = imgList(p); gIdx = 0;
  const feats = [];
  if (p.area_m2) feats.push(['Área', fmtArea(p.area_m2)]);
  if (f.bedrooms) feats.push(['Habitaciones', f.bedrooms]);
  if (f.bathrooms) feats.push(['Baños', f.bathrooms]);
  if (f.garages) feats.push(['Garajes', f.garages]);
  if (f.stratum) feats.push(['Estrato', f.stratum]);
  if (f.floor) feats.push(['Piso', f.floor]);
  if (f.m2_private) feats.push(['Área priv.', fmtArea(f.m2_private)]);
  // Un terreno no tiene antigüedad. El portal rellena el campo igual —dos de cada
  // tres lotes traen «1 a 8 años»—, y en la ficha se lee como si algo se hubiera
  // construido ahí; en realidad describe el conjunto o la urbanización, cuando
  // describe algo. Un dato que no se puede interpretar resta más de lo que suma.
  if (f.antiguedad && p.type !== 'lot') feats.push(['Antigüedad', f.antiguedad]);
  // «Admin» abreviado no decía de qué: la cifra parecía un gasto del inmueble sin
  // aclarar que es la cuota mensual que cobra el conjunto o el edificio.
  if (f.administracion) feats.push(['Administración del conjunto', fmtCOP(f.administracion) + '/mes']);

  const amen = Array.isArray(f.amenities) && f.amenities.length ? `<div class="section"><h3>Características</h3><div class="amenities">${f.amenities.slice(0, 30).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>` : '';
  const desc = bloqueDescripcion(f.description);
  const addr = p.address ? `<div class="section"><h3>Dirección</h3><p>${esc(p.address)}</p></div>` : '';
  // Bloqueos para anónimo (freemium)
  // El servidor ya recortó lo que el plan no cubre; aquí solo se explica por qué.
  const bloq = esBloqueada(p);
  const aiBlock = bloq ? '' : aiSection('banco', p.id);
  const addrBlock = bloq ? '' : addr;
  const mapBlock = bloq ? '' : mapSection(p);
  const descBlock = bloq ? '' : desc;
  const muro = bloq ? panelSuscripcion(p) : '';
  const kind = p.source === 'fincaraiz' ? 'portal' : 'banco';
  // El reporte solo se ofrece sobre una ficha que este usuario ya puede ver
  // entera: el servidor lo rechazaría igual, y un botón que falla es peor que
  // ninguno. En la ficha bloqueada el muro de al lado ya dice qué falta.
  const reporte = bloq ? '' : reporteSection(kind, p);
  const fav = anon ? '' : modalFavBtn(kind, p.id);
  // Los avisos del portal cambian con frecuencia y pueden traer un análisis
  // persistido de semanas atrás. Siempre recalculamos sus comparables al abrir
  // la ficha para que la cifra visible coincida con /api/market. En bancos sí
  // usamos el análisis persistido porque su inventario cambia con otra cadencia.
  const mkt = kind === 'portal' ? '' : marketSection(p);
  const acquisition = gastosSection(p.price, 'compra', {
    kind,
    id: p.id,
    title: `${typeLbl(p.type)} en ${cap(p.city)}`,
    city: p.city,
    // La administración que el propio aviso declara. La ficha ya la enseña unas
    // líneas más abajo, así que empezar la calculadora en 0 no era «no saberlo»:
    // era ignorar un dato que teníamos, y encima diciendo debajo que se había
    // descontado. Sobre un arriendo de 1,3 millones, olvidar 150.000 de
    // administración infla la rentabilidad neta dos puntos largos.
    admin: Number((p.features || {}).administracion) || 0,
  });

  $('modal-content').innerHTML = `${gallery()}
    <div class="detail">
      <div class="detail-top"><span class="pill-src">${esc(srcLbl(p.source))}</span>${fav}</div>
      <h2>${esc(typeLbl(p.type))} en ${esc(cap(p.city))}</h2>
      <div class="loc">${ic('pin')}${p.zone ? esc(p.zone) + ', ' : ''}<strong>${esc(cap(p.city))}</strong></div>
      ${selloCreceFicha(p)}
      <div class="priceblock"><div class="p">${fmtCOP(p.price)}</div><div class="s">${p.price_per_m2 ? '$' + Math.round(p.price_per_m2).toLocaleString('es-CO') + ' por m²' : ''}</div></div>
      <div class="feats">${feats.map(([l, v]) => `<div class="feat"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
      ${mkt || marketLazyBox()}${acquisition}${muro}${aiBlock}${addrBlock}${mapBlock}${descBlock}${amen}${reporte}
      <a class="cta" href="${esc(safeExternalUrl(p.source_url))}" target="_blank" rel="noopener noreferrer">Ver en ${esc(srcLbl(p.source))} ↗</a>
    </div>`;
  recordarFichaEnPantalla(kind, p.id, tituloFicha(p));
  showModal();
  // El motor sólo persiste el mercado en fichas de banco; en las del portal se
  // calcula bajo demanda (gratis, sin IA) para justificar el −X% de la tarjeta.
  if (!mkt) fillMarketLazy(p.source === 'fincaraiz' ? 'portal' : 'banco', p.id, p.discount_pct);
  fillRentalMarket(kind, p.id);
}

// Ficha abierta actualmente: si el usuario abre otra mientras el mercado carga, la
// respuesta vieja llega tarde y no debe pintarse sobre la ficha nueva.
let gFichaSeq = 0;
let gRentalSeq = 0;

/**
 * Panel de la ficha de pago. Enseña exactamente lo que la spec permite (precio,
 * descuento, unas fotos) y nombra lo que falta, para que el usuario sepa qué
 * está comprando en vez de encontrarse un hueco sin explicación.
 */
function panelSuscripcion(p) {
  const d = p.discount_pct != null ? Math.round(p.discount_pct) : null;
  // Qué le falta a ESTE usuario, que es lo que el servidor ya calculó en
  // `_acceso.requiere`. El sello de la tarjeta lo respetaba y este muro no: a un
  // anónimo —que solo tiene que registrarse— se le pedía pagar una suscripción, y
  // a un registrado con cupo disponible también. Pedir dinero a quien no lo
  // necesita es la peor forma posible de perder un registro.
  const requiere = p?._acceso?.requiere ?? 'suscripcion';
  const COPY = {
    registro: {
      cuerpo: 'Ya viste los comparables y el costo estimado. Crea tu cuenta gratis y abre esta ficha con tu cupo del mes.',
      cta: 'Crear cuenta gratis',
      href: '/login',
    },
    cupo: {
      cuerpo: 'Ya viste los comparables y el costo estimado. Ábrela con una de las fichas de tu cupo de este mes.',
      cta: 'Abrir con mi cupo',
      href: null,
    },
    suscripcion: {
      cuerpo: 'Ya viste los comparables y el costo estimado. La suscripción desbloquea los datos necesarios para profundizar la evaluación.',
      cta: 'Desbloquear con suscripción',
      href: '/planes',
    },
  };
  const t = COPY[requiere] ?? COPY.suscripcion;
  // Al que le queda cupo no se le manda a ninguna parte: el clic en la tarjeta ya
  // gasta la ficha, así que un enlace aquí solo lo sacaría de donde está.
  const cta = t.href
    ? `<a class="wall-cta" href="${t.href}">${t.cta}</a>`
    : `<span class="wall-cta wall-cta-inerte">${t.cta}</span>`;
  return `<div class="section"><div class="muro-sus">
    <div class="muro-cab">${ic('lock')}<strong>${d != null && d >= 20 ? `${d}% bajo ofertas similares` : 'Oportunidad destacada'}</strong></div>
    <p>${t.cuerpo}</p>
    <ul class="muro-lista">
      <li>${ic('lock')} Dirección exacta y ubicación en el mapa</li>
      <li>${ic('lock')} Descripción completa y todas las fotos</li>
      <li>${ic('lock')} Fuente original y datos de contacto</li>
      <li>${ic('lock')} Análisis detallado de la oportunidad</li>
    </ul>
    ${cta}
  </div></div>`;
}

// ---------- Reporte descargable de la ficha ----------

/** Texto del cupo de reportes. El servidor es la autoridad; esto solo lo explica. */
function textoCupoReportes(estado) {
  if (!estado) return `El plan gratuito incluye ${CUPO_REPORTES_MENSUAL} reportes al mes.`;
  if (estado.ilimitado) return 'Tu plan incluye descargas ilimitadas.';
  const quedan = Number(estado.restantes ?? 0);
  if (quedan <= 0) return `Agotaste los ${CUPO_REPORTES_MENSUAL} reportes de este mes. El plan de pago los deja sin límite.`;
  return `Te ${quedan === 1 ? 'queda 1 reporte' : `quedan ${quedan} reportes`} de ${CUPO_REPORTES_MENSUAL} este mes.`;
}

/**
 * Qué trae el reporte, según la categoría.
 *
 * El texto era uno solo y prometía «descuento frente a su zona» y «los
 * comparables que lo respaldan» también en remates, donde esa comparación no
 * existe: un remate se mide contra el avalúo del juzgado, no contra el mercado.
 * Ofrecer en la descarga algo que la ficha no tiene es la forma más rápida de
 * que alguien pague por un documento y se sienta engañado al abrirlo.
 */
function textoDelReporte(kind) {
  if (kind === 'remate') {
    return 'Postura mínima, avalúo del juzgado, fecha de audiencia, los datos visibles del proceso '
      + 'y las alertas preliminares del aviso.';
  }
  return 'Precio, descuento frente a ofertas similares de su zona, categoría del Índice CRECE, los '
    + 'comparables que lo respaldan y las características del inmueble.';
}

/**
 * Bloque del reporte descargable.
 *
 * Enseña el cupo ANTES de que el usuario pulse, no después: descubrir un límite
 * al chocarse con él es lo que hace que un plan gratuito se sienta una trampa. Al
 * anónimo no se le ofrece un botón que va a fallar — se le ofrece la cuenta, que
 * es lo que de verdad le falta.
 *
 * Solo se dibuja en fichas que el usuario ya puede ver completas: si la ficha
 * está bloqueada, el servidor rechazaría el reporte y el botón sería una promesa
 * falsa (el muro de al lado ya explica qué falta).
 */
function reporteSection(kind, p) {
  if (!auth.token) {
    return `<div class="section"><div class="reporte-box">
      <h3>Reporte descargable</h3>
      <p class="reporte-txt">${textoDelReporte(kind)} Se abre en cualquier navegador y se guarda como PDF
      al imprimirlo.</p>
      <a class="reporte-cta" href="/login">Crear cuenta gratis para descargarlo</a>
      <p class="reporte-hint">El plan gratuito incluye ${CUPO_REPORTES_MENSUAL} reportes al mes.</p>
    </div></div>`;
  }
  const estado = auth.account?.cupoReportes || null;
  const agotado = !!estado && !estado.ilimitado && Number(estado.restantes ?? 0) <= 0;
  const accion = agotado
    ? `<a class="reporte-cta" href="/planes">Ver el plan sin límite</a>`
    : `<button class="reporte-cta" type="button" data-reporte-kind="${esc(kind)}" data-reporte-id="${esc(p.id)}">
        ${ic('down')}<span>Descargar reporte</span>
      </button>`;
  return `<div class="section"><div class="reporte-box">
    <h3>Reporte descargable</h3>
    <p class="reporte-txt">${textoDelReporte(kind)} Se descarga como archivo y se guarda como PDF al imprimirlo.</p>
    ${accion}
    <p class="reporte-hint" data-reporte-cupo aria-live="polite">${esc(textoCupoReportes(estado))}</p>
  </div></div>`;
}

/** Nombre que propuso el servidor en `Content-Disposition`, si es utilizable. */
function nombreDeCabecera(cabecera) {
  const m = /filename="([^"]+)"/.exec(cabecera || '');
  return m && /^[\w.-]+$/.test(m[1]) ? m[1] : null;
}

/** Refresca el contador de reportes en la ficha abierta y en la cuenta en memoria. */
function pintarCupoReportes(estado) {
  if (estado && auth.account) auth.account.cupoReportes = estado;
  const hint = document.querySelector('[data-reporte-cupo]');
  if (hint) hint.textContent = textoCupoReportes(estado);
}

/**
 * Descarga el reporte.
 *
 * Va por `fetch` y no por un enlace directo porque la ruta exige el token de la
 * sesión en la cabecera `Authorization`, y un `<a href>` no la lleva. El archivo
 * llega como blob y se entrega al navegador con un ancla temporal; el objeto se
 * revoca después para no dejar el blob retenido en memoria toda la sesión.
 */
async function descargarReporte(boton) {
  const kind = boton.dataset.reporteKind;
  const id = boton.dataset.reporteId;
  const etiqueta = boton.querySelector('span');
  const textoOriginal = etiqueta ? etiqueta.textContent : '';
  boton.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Generando reporte…';
  try {
    const respuesta = await fetch(`/api/reporte?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => ({}));
      if (detalle.cupo) pintarCupoReportes(detalle.cupo);
      showToast(detalle.error || 'No se pudo generar el reporte en este momento.');
      return;
    }
    const archivo = await respuesta.blob();
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = nombreDeCabecera(respuesta.headers.get('Content-Disposition'))
      || `radar-reporte-${kind}.html`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 30000);

    const restantes = respuesta.headers.get('X-Reportes-Restantes');
    if (restantes === 'ilimitado') pintarCupoReportes({ ilimitado: true, restantes: null });
    else if (restantes != null) pintarCupoReportes({ ilimitado: false, restantes: Number(restantes) });
    showToast('Reporte descargado. Ábrelo e imprímelo a PDF si lo necesitas en papel.');
  } catch {
    showToast('No se pudo descargar el reporte. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    boton.disabled = false;
    if (etiqueta) etiqueta.textContent = textoOriginal;
  }
}

function marketLazyBox() {
  return `<div class="section" id="mkt-lazy"><h3>Análisis de mercado</h3>
    <div class="market"><p class="market-note">Comparando contra inmuebles similares de la zona…</p></div></div>`;
}
async function fillMarketLazy(kind, id, disc) {
  const box = $('mkt-lazy');
  if (!box) return;
  const seq = ++gFichaSeq;
  try {
    const r = await fetch(`/api/market?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`).then((x) => x.json());
    const el = $('mkt-lazy'); // pudo cerrarse el modal mientras cargaba
    if (!el || seq !== gFichaSeq) return; // el usuario ya está mirando otra ficha
    if (!r.ok || !r.market) throw new Error('sin mercado'); // → caja de reintento
    // Sin comparables suficientes se dice, no se esconde: una ficha muda parece rota
    // y el usuario merece saber que aquí no hay evidencia para estimar el mercado.
    if (r.market.n < 4) {
      const n = r.market.n;
      el.innerHTML = `<h3>Análisis de mercado</h3><div class="market">
        <p class="market-note">No hay suficientes avisos comparables publicados en esta zona
        (${n} encontrado${n === 1 ? '' : 's'}) para estimar un precio de mercado fiable.
        Suele pasar con lotes, bodegas y municipios pequeños: hay que valorarla con un avalúo en campo.</p></div>`;
      return;
    }
    // Si el motor pudo evaluarla (precio + área + comparables), se muestra SU
    // veredicto: precio/m² del inmueble, mediana/m² de los comparables y la
    // posición entre ambos. Los tres números salen del mismo conjunto, así que la
    // evidencia sostiene el porcentaje en vez de contradecirlo.
    const v = r.verdict;
    // Datos que no pueden ser ciertos: se dice, en vez de dar un porcentaje. El
    // motor lo detecta (`engine/plausibilidad.ts`) y aquí se nombra el dato que
    // falla, que además es el que el usuario puede verificar mirando el aviso.
    if (v?.datos_implausibles) {
      const porQue = {
        area_minima: 'El área publicada en el aviso no parece correcta para este tipo de inmueble',
        area_maxima: 'El área publicada en el aviso no parece correcta para este tipo de inmueble',
        ppm2_alto: 'El precio por metro cuadrado que resulta del aviso está fuera de lo razonable',
        ppm2_bajo: 'El precio por metro cuadrado que resulta del aviso está fuera de lo razonable',
      }[v.datos_implausibles] || 'Los datos del aviso no permiten comparar este inmueble';
      el.innerHTML = `<h3>Análisis de mercado</h3><div class="market">
        <p class="market-aviso">${ic('alert')} ${esc(porQue)}, así que no calculamos su posición frente al mercado.</p>
        <p class="market-note">Puede ser un error de publicación del portal. Verifícalo en el aviso original antes de sacar conclusiones.</p>
        ${auditoriaComparables && fichaEnPantalla?.id ? botonComparables(fichaEnPantalla.id, 0) : ''}</div>`;
    } else if (v && v.market_ppm2 != null && v.candidate_ppm2 != null) {
      el.innerHTML = `<h3>Análisis de mercado</h3>${marketBody({ ...v, __id: fichaEnPantalla?.id }, v.criteria)}`;
    } else {
      // El botón va también aquí. La pregunta «contra qué compara» es más urgente
      // cuando NO hay veredicto, no menos: es el caso en que el usuario ve una
      // referencia de zona sin saber de dónde sale.
      // Aquí se decía SIEMPRE «falta el área», y muchas veces el área estaba a
      // cuatro líneas de distancia, en la cabecera de la misma ficha. Una
      // contradicción así, dentro de la misma pantalla, no se lee como un matiz
      // técnico: se lee como que el motor no sabe lo que dice, y arrastra consigo
      // la credibilidad del resto de los números.
      //
      // La causa real casi nunca es el área del inmueble, sino que en su zona no
      // hay suficientes avisos parecidos CON área publicada para sacar una
      // mediana por metro cuadrado. Se dice esa, y solo se culpa al área cuando
      // de verdad falta.
      const areaFicha = Number(fichaEnPantalla?.area_m2);
      const sinArea = !Number.isFinite(areaFicha) || areaFicha <= 0;
      const porQueNoHayVeredicto = sinArea
        ? 'Este aviso no publica el área, así que no se puede calcular su precio por m² ni compararlo.'
        : 'No hay suficientes inmuebles parecidos con área publicada en su zona para comparar por metro cuadrado, así que no se estima descuento.';
      el.innerHTML = `<h3>Análisis de mercado</h3><div class="market">${marketCtxHtml(r.market)}
        <p class="market-note">Referencia de precios de OFERTA de ${r.market.n} inmuebles de la zona.
        ${porQueNoHayVeredicto}</p>
        ${auditoriaComparables && fichaEnPantalla?.id ? botonComparables(fichaEnPantalla.id, r.market.n) : ''}</div>`;
    }
    if (r.recommendations && r.recommendations.length) {
      el.insertAdjacentHTML('afterend', `<div id="rec-lazy">${renderRecs(r.recommendations)}</div>`);
    }
  } catch {
    const el = $('mkt-lazy');
    if (!el || seq !== gFichaSeq) return;
    el.innerHTML = `<h3>Análisis de mercado</h3><div class="market">
      <p class="market-note">No se pudo calcular el mercado en este momento.</p>
      <button class="ai-btn retry-market" data-market-kind="${esc(kind)}" data-market-id="${esc(id)}" data-market-disc="${disc == null ? '' : Number(disc)}">Reintentar</button></div>`;
  }
}

function rentalConfidenceLabel(value) {
  return { high: 'Alta', medium: 'Media', low: 'Exploratoria', insufficient: 'Sin datos' }[value] || 'Exploratoria';
}

function applyRentalMarket(market) {
  const status = document.querySelector('[data-rental-market]');
  const calc = status?.closest('.calc');
  if (!status || !calc) return;
  const origin = calc.querySelector('[data-rent-origin]');
  const rentInput = calc.querySelector('[data-rent]');

  if (!market?.available || !market.median_monthly_rent) {
    // Sin aviso. Antes se explicaba que no había suficientes arriendos comparables,
    // y el cliente lo pidió quitar: «no se preocupe, que el usuario lo ponga, porque
    // se supone que si yo estoy buscando en Buga, en el barrio tal, yo más o menos sé
    // cuánto vale un arriendo ahí». Un cartel disculpándose por un dato que el
    // usuario puede poner él mismo solo llama la atención sobre lo que falta.
    //
    // El campo sigue ahí y editable, que es lo que resuelve el caso.
    status.classList.add('is-empty');
    status.innerHTML = '';
    status.hidden = true;
    if (origin) origin.textContent = 'Valor de arrendamiento ajustable por el usuario';
    return;
  }

  status.hidden = false;
  const median = Number(market.median_monthly_rent);
  const low = Number(market.p25_monthly_rent) || median;
  const high = Number(market.p75_monthly_rent) || median;
  const ppm2 = Number(market.median_rent_per_m2) || 0;
  const criteria = Array.isArray(market.criteria) ? market.criteria : [];
  status.classList.remove('is-empty');
  status.innerHTML = `<div class="rent-market-title">
      <span>Valor de arrendamiento estimado</span>
      <strong>${fmtCOP(median)}/mes</strong>
    </div>
    <div class="rent-market-grid">
      <div><span>Rango central</span><strong>${fmtCOP(low)} – ${fmtCOP(high)}</strong></div>
      <div><span>Arrendamiento por m²</span><strong>${ppm2 ? `${fmtCOP(ppm2)}/m²` : '—'}</strong></div>
      <div><span>Comparables</span><strong>${Number(market.n) || 0}</strong></div>
    </div>
    ${criteria.length ? `<div class="crit-chips">${criteria.map((item) => `<span class="crit-chip">${esc(item)}</span>`).join('')}</div>` : ''}
    <p>Referencia basada en precios de oferta, no en contratos cerrados. El valor mensual del arriendo publicado puede incluir o no la cuota de administración.</p>`;
  if (origin) origin.textContent = `${Number(market.n) || 0} avisos similares · ${market.scope_label || 'misma ciudad'}`;
  if (rentInput && (!rentInput.value || rentInput.dataset.rentSource === 'market')) {
    rentInput.value = fmtCOP(median);
    rentInput.dataset.rentSource = 'market';
    window.__recalcRent(rentInput);
  }
}

async function fillRentalMarket(kind, id) {
  const seq = ++gRentalSeq;
  try {
    const result = await fetch(`/api/rental-market?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`).then((response) => response.json());
    if (seq !== gRentalSeq) return;
    applyRentalMarket(result.rental_market);
  } catch {
    if (seq !== gRentalSeq) return;
    applyRentalMarket({ available: false, reason: 'source_unavailable', n: 0 });
  }
}
window.__retryMarket = (kind, id, disc) => {
  const el = $('mkt-lazy');
  if (el) el.innerHTML = '<h3>Análisis de mercado</h3><div class="market"><p class="market-note">Comparando contra inmuebles similares de la zona…</p></div>';
  gFichaSeq--; // fillMarketLazy vuelve a incrementarlo: este reintento sigue siendo la ficha vigente
  fillMarketLazy(kind, id, disc);
}
/** A partir de aquí un dato del proceso deja de ser un dato y es un párrafo. */
const LARGO_MAXIMO_DATO = 220;

/**
 * Repliega un valor desmedido.
 *
 * Los remates traen campos que el portal rellenó a granel: el "Secuestre" de
 * algunos incluye dirección, teléfono, correo y notas al comprador, y llega a
 * pasar de cuatro mil caracteres. Mostrarlo entero convierte la ficha en un muro
 * de texto. Se enseña el principio y el resto queda a un clic, sin recortar nada:
 * el dato completo sigue estando.
 *
 * Recibe HTML YA ESCAPADO, así que aquí no se vuelve a escapar; el corte se hace
 * en un espacio para no partir una entidad HTML por la mitad.
 */
function valorLargo(html) {
  if (html.length <= LARGO_MAXIMO_DATO) return html;
  const corte = html.lastIndexOf(' ', LARGO_MAXIMO_DATO);
  const inicio = html.slice(0, corte > 80 ? corte : LARGO_MAXIMO_DATO);
  return `<details class="kv-largo"><summary>${inicio}… <em>ver completo</em></summary><p>${html}</p></details>`;
}

function openRemate(p) {
  if (!gateFicha(p.id)) return; // muro de registro si el anónimo superó el cupo
  const anon = !auth.token;
  // Lo que se cobra se decide por el VEREDICTO DEL SERVIDOR, no por tener sesión.
  // Con `anon` a secas, cualquiera con cuenta gratuita veía enteros los datos del
  // proceso —nombre y cédula del demandado, correo y celular del secuestre— de un
  // remate que la tarjeta marcaba como de pago, y además sin gastar cupo. Todos
  // los remates de suscripción eran gratis para cualquiera registrado.
  const bloq = esBloqueada(p);
  gImgs = p.image_url ? [p.image_url] : []; gIdx = 0;
  const pct = p.minimum_bid && p.appraisal_value ? Math.round((p.minimum_bid / p.appraisal_value) * 100) : (p.minimum_bid_pct || null);
  const f = p.features || {};
  const isBank = f.is_bank_plaintiff;
  // El portal a veces devuelve placeholders ("No se menciona… en el texto") cuando
  // el dato no está claro → no los mostramos como si fueran datos reales.
  const hasData = (v) => v && !/no se menciona|no se especific|no aparece|no se indica|no se identific/i.test(String(v));
  const datos = [];
  if (hasData(p.plaintiff)) datos.push(['Demandante', esc(p.plaintiff) + (f.bank_name ? ` <span class="bank-tag">${ic('bank')}${esc(f.bank_name)}</span>` : '')]);
  if (hasData(p.defendant)) datos.push(['Demandado', esc(p.defendant)]);
  if (hasData(p.court)) datos.push(['Juzgado', esc(p.court)]);
  if (hasData(p.case_number)) datos.push(['Radicado del proceso', esc(p.case_number)]);
  if (hasData(p.trustee)) datos.push(['Secuestre', valorLargo(esc(p.trustee).replace(/^secuestre:?\s*/i, ''))]);
  if (hasData(p.matricula_inmobiliaria)) datos.push(['Matrícula inmobiliaria', esc(p.matricula_inmobiliaria)]);
  if (p.deposit_pct) datos.push(['Depósito para participar', p.deposit_pct + '%']);
  const datosHtml = datos.length
    ? `<div class="section"><h3>Datos del proceso</h3><div class="kv">${datos.map(([k, v]) => `<div class="kv-k">${k}</div><div class="kv-v">${v}</div>`).join('')}</div></div>`
    : '';
  // Copia exacta de la publicación (texto oficial completo) tras un botón (pedido del cliente).
  const copiaHtml = f.copia_publicacion
    ? `<div class="section"><h3>Publicación oficial</h3>
        <button class="pub-toggle" aria-expanded="false">Ver copia exacta de la publicación</button>
        <div class="pub-full"><p class="pub">${esc(String(f.copia_publicacion))}</p></div>
      </div>`
    : '';
  const descHtml = p.description
    ? `<div class="section"><h3>Descripción del bien</h3><p class="pub">${esc(String(p.description))}</p>${
      descripcionIncompleta(p.description) ? '<p class="desc-aviso">Texto incompleto en la fuente original.</p>' : ''
    }</div>`
    : '';
  // Bloqueos para anónimo (freemium). El análisis preliminar (semáforo) y la
  // calculadora quedan visibles como gancho; lo sensible/valioso se bloquea.
  // `bloq` gobierna todo lo que es contenido de pago. `anon` solo gobierna lo que
  // necesita una cuenta para existir —los favoritos—, que es otra cosa.
  const tapado = bloq || anon;
  const aiBlock = tapado ? lockBox('Análisis con IA', 'Opinión de inversión + comparables del barrio.') : aiSection('remate', p.id);
  const datosBlock = tapado ? lockBox('Datos del proceso', 'Demandante, juzgado, radicado, secuestre y más.') : datosHtml;
  const copiaBlock = tapado ? (f.copia_publicacion ? lockBox('Copia exacta de la publicación') : '') : copiaHtml;
  const descBlock = tapado ? (p.description ? lockBox('Descripción del bien') : '') : descHtml;
  const fav = anon ? '' : modalFavBtn('remate', p.id);
  // Igual que en la ficha de inmueble: sin acceso completo no se ofrece el botón,
  // y se explica qué falta para abrirla en vez de dejar huecos sin motivo.
  const reporte = bloq ? '' : reporteSection('remate', p);
  const muro = bloq ? panelSuscripcion(p) : '';

  $('modal-content').innerHTML = `${gallery()}
    <div class="detail">
      <div class="detail-top"><span class="pill-src">${ic('scale')}Remate judicial</span>${fav}</div>
      ${tieneCuotaParte(p) ? `<div class="alerta-legal">${ic('alert')}<div><strong>Se remata solo el ${Number(p.cuota_parte)}% del bien</strong><span>${TEXTO_CUOTA_PARTE}</span></div></div>` : ''}
      <h2>${esc(typeLbl(p.property_type))} en ${esc(cap(p.city))}</h2>
      ${tipoIdentificado(p.property_type) ? '' : `<p class="tipo-sin-confirmar">${TIPO_POR_CONFIRMAR}: el aviso del juzgado no dice qué clase de bien se subasta.</p>`}
      <div class="loc">${ic('pin')}<strong>${esc(cap(p.city))}</strong>${p.department ? ', ' + esc(cap(p.department)) : ''}</div>
      <div class="priceblock remate">
        <div class="pb-row">
          <div><div class="pb-label">Postura mínima</div><div class="pb-amount">${fmtCOP(p.minimum_bid)}</div></div>
          ${p.appraisal_value ? `<div class="pb-side"><div class="pb-label">Avalúo</div><div class="pb-aval">${fmtCOP(p.appraisal_value)}</div>${pct ? `<div class="pb-pct">postura al ${pct}%</div>` : ''}</div>` : ''}
        </div>
        ${p.auction_date ? `<div class="pb-auction">${ic('calendar')} Audiencia: <strong>${fmtDate(p.auction_date)}</strong>${p.auction_time ? ' · ' + esc(p.auction_time) : ''} ${countdownBadge(p.auction_date)}</div>` : ''}
        <!-- La postura mínima no la fija quien publica: la fija la ley. Sin decirlo,
             el porcentaje se lee como un descuento negociado, y no lo es. Se dice el
             caso general y el de ESTA ficha, porque el 70% no es universal: en
             segunda o tercera licitación la base baja. -->
        <div class="pb-base">${ic('scale')} <span>Base de licitación: el <strong>70% del avalúo</strong> oficial fijado por el juzgado${pct && Math.abs(Number(pct) - 70) >= 1 ? ` · en esta subasta, el <strong>${pct}%</strong>` : ''}.</span></div>
      </div>
      ${analisisSection(p)}
      ${muro}
      ${aiBlock}
      ${datosBlock}
      ${gastosSection(p.minimum_bid, 'remate', {
        kind: 'remate',
        id: p.id,
        title: `${typeLbl(p.property_type)} en ${cap(p.city)}`,
        city: p.city,
      })}
      ${descBlock}
      ${copiaBlock}
      ${reporte}
      ${mapSection({ address: null, city: p.city })}
      <p class="src-note">Fuente: Rama Judicial de Colombia · aviso de remate publicado por el juzgado.</p>
    </div>`;
  recordarFichaEnPantalla('remate', p.id, tituloFicha(p));
  showModal();
}
function gallery() {
  if (!gImgs.length) return `<div class="gallery"><div class="gallery-main"><div class="card-ph">${ic('home', 'ic-xl')}</div></div></div>`;
  return `<div class="gallery"><div class="gallery-main" id="gmain"></div>
    ${gImgs.length > 1 ? `<button class="gnav prev" data-gallery-move="-1" aria-label="Foto anterior">‹</button><button class="gnav next" data-gallery-move="1" aria-label="Foto siguiente">›</button><div class="gcounter" id="gcount"></div><div class="gthumbs" id="gthumbs"></div>` : ''}</div>`;
}
function gRender() {
  const m = $('gmain'); if (!m) return;
  m.innerHTML = `<img src="${esc(safeMediaUrl(gImgs[gIdx]))}" alt="Foto del inmueble">`;
  if ($('gcount')) $('gcount').textContent = `${gIdx + 1} / ${gImgs.length}`;
  const t = $('gthumbs');
  if (t && !t.dataset.built) {
    t.innerHTML = gImgs.map((u, i) => `<div class="gthumb ${i === 0 ? 'active' : ''}" data-i="${i}"><img src="${esc(safeMediaUrl(u))}" loading="lazy" alt=""></div>`).join('');
    t.dataset.built = '1';
    t.querySelectorAll('.gthumb').forEach((th) => th.addEventListener('click', () => { gIdx = Number(th.dataset.i); gRender(); }));
  }
  if (t) t.querySelectorAll('.gthumb').forEach((th, i) => th.classList.toggle('active', i === gIdx));
}
window.gMove = (d) => { gIdx = (gIdx + d + gImgs.length) % gImgs.length; gRender(); };

/**
 * Traduce el método del motor (ej. "geo:estricto") a los criterios REALES que se
 * usaron para elegir los comparables. Transparencia = credibilidad, y sin costo
 * de IA: el usuario ve exactamente contra qué se comparó su inmueble.
 */
function criteriosComparacion(method, radiusKm) {
  if (!method) return [];
  const [regime, level] = String(method).split(':');
  const loc = regime === 'geo'
    ? `mismo sector (${radiusKm || 1.5} km a la redonda)`
    : 'misma ciudad / barrio';
  // SOLO lo que se puede afirmar mirando el nivel. Los atributos (habitaciones,
  // parqueadero, estrato) NO se listan aquí: el nivel dice que se exigieron, pero
  // si el inmueble no traía el dato la condición pasó vacía y afirmarlo sería
  // mentir. Esos criterios los reporta el motor en market.criteria; esta función es
  // solo el respaldo para fichas evaluadas antes de que existiera ese campo.
  const porNivel = {
    'area-amplia':    ['área similar (banda amplia)'],
    'radio-2x':       ['área similar', 'radio ampliado 2×'],
    'radio-3x':       ['área similar', 'radio ampliado 3×'],
    'solo-localidad': ['comparación amplia (pocos similares en la zona)'],
  };
  return ['mismo tipo de inmueble', loc].concat(porNivel[level] || ['área similar']);
}

/**
 * Cuerpo del análisis de mercado. Lo comparten la ficha de banco (veredicto que el
 * motor ya guardó) y el cálculo bajo demanda del portal, para que los dos caminos
 * no puedan mostrar cifras distintas de lo mismo.
 * `m` = { candidate_ppm2, market_ppm2, discount_pct, n_comparables, confidence }.
 */
/**
 * ¿Está encendida la verificación de comparables? Lo dice el servidor.
 *
 * Es una herramienta para comprobar el motor, no una función del producto: cuando
 * el interruptor está apagado la ruta ni existe, así que el botón tampoco.
 */
let auditoriaComparables = false;
/** ¿El plan completo se activa gratis por ser piloto? Lo dice el servidor, no el navegador. */
let planDemoActivo = false;

/**
 * «Ver los N comparables»: contra qué se calculó este veredicto.
 *
 * Se carga al pulsar y no antes. Cada apertura recalcula la cascada con el pool de
 * la ciudad entera, y el cliente puso el dedo en el coste: cien personas mirando
 * comparables a la vez es un problema de procesamiento, no de interfaz.
 */
function botonComparables(id, n) {
  return `<button type="button" class="comp-ver" data-comparables="${esc(id)}">`
    + `${ic('chart')}Ver los ${Number(n) || 0} comparables usados</button>`
    + `<div class="comp-lista" id="comp-lista-${esc(id)}" hidden></div>`;
}

/** Pinta la lista, marcando lo que no cuadra. */
function pintarComparables(caja, d) {
  // Que no haya comparables NO es un error: es el veredicto «no se pudo comparar»,
  // y explicarlo vale más que una tabla vacía. Pasa con inmuebles atípicos para su
  // zona —un parqueadero de 11 m², un lote suelto— donde el motor no reúne el
  // mínimo de similares y por eso la ficha no lleva porcentaje.
  if (!d.comparables.length) {
    caja.innerHTML = `
      <p class="comp-aviso">El motor no encontró suficientes inmuebles similares para comparar este.</p>
      <p class="comp-nota">Por eso esta ficha no lleva un porcentaje frente al mercado. Se buscaron del
      mismo tipo, en la misma zona y de área parecida, ampliando el radio por pasos, y en ningún paso se
      alcanzó el mínimo que hace fiable una mediana.
      ${d.candidato.ppm2 ? ` Su precio es de $${Number(d.candidato.ppm2).toLocaleString('es-CO')}/m².` : ''}</p>`;
    return;
  }
  const fila = (c) => `<tr${c.esDeOtroTipo ? ' class="es-ajeno"' : ''}>
    <td>${esc(typeLbl(c.type))}${c.esDeOtroTipo ? ' <span class="comp-alerta" title="No es del mismo tipo que el inmueble">≠</span>' : ''}</td>
    <td>${fmtArea(c.area_m2)}</td>
    <td>${fmtCOP(c.price)}</td>
    <td><strong>$${Number(c.ppm2).toLocaleString('es-CO')}</strong></td>
    <td>${esc(cap(c.zone || '—'))}</td>
    <td>${c.url ? `<a href="${esc(safeMediaUrl(c.url))}" target="_blank" rel="noopener">ver</a>` : '—'}</td>
  </tr>`;
  const ajenos = d.comparables.filter((c) => c.esDeOtroTipo).length;
  caja.innerHTML = `
    <div class="comp-cab">
      <span>Este inmueble: <strong>$${Number(d.candidato.ppm2 || 0).toLocaleString('es-CO')}/m²</strong></span>
      <span>Mediana de los ${d.veredicto.n_comparables}: <strong>$${Number(d.veredicto.ppm2_mercado || 0).toLocaleString('es-CO')}/m²</strong></span>
      <span>Ámbito: <strong>${esc(d.veredicto.nivel || '—')}</strong></span>
    </div>
    ${ajenos ? `<p class="comp-aviso">${ajenos} de ${d.comparables.length} no son del mismo tipo de inmueble.</p>` : ''}
    <div class="comp-scroll"><table class="comp-tabla">
      <thead><tr><th>Tipo</th><th>Área</th><th>Precio</th><th>Por m²</th><th>Zona</th><th></th></tr></thead>
      <tbody>${d.comparables.map(fila).join('')}</tbody>
    </table></div>
    ${d.omitidos ? `<p class="comp-aviso">Se muestran ${d.comparables.length}; hay ${d.omitidos} más que no caben en la lista.</p>` : ''}
    <p class="comp-nota">Ordenados del más barato al más caro por metro cuadrado. La mediana de esta lista es contra lo que se mide el inmueble.</p>`;
}

document.addEventListener('click', async (e) => {
  const boton = e.target.closest?.('[data-comparables]');
  if (!boton) return;
  const id = boton.dataset.comparables;
  const caja = $(`comp-lista-${id}`);
  if (!caja) return;
  if (!caja.hidden) { caja.hidden = true; boton.classList.remove('abierto'); return; }
  caja.hidden = false;
  boton.classList.add('abierto');
  if (caja.dataset.cargado) return;
  caja.innerHTML = '<p class="comp-nota">Recalculando la comparación…</p>';
  try {
    const d = await fetch(`/api/comparables?id=${encodeURIComponent(id)}`).then((r) => r.json());
    if (!d.ok) { caja.innerHTML = `<p class="comp-aviso">${esc(d.error || 'No se pudo cargar')}</p>`; return; }
    pintarComparables(caja, d);
    caja.dataset.cargado = '1';
  } catch {
    caja.innerHTML = '<p class="comp-aviso">No se pudo cargar la comparación.</p>';
  }
});

function marketBody(m, criteria) {
  const conf = { high: 'Alta', medium: 'Media', low: 'Baja', insufficient: 'Sin datos' }[m.confidence] || m.confidence;
  const d = m.discount_pct;
  const pos = d != null
    ? `<strong style="color:${d >= 0 ? '#16a34a' : '#dc2626'}">${d >= 0 ? '−' : '+'}${Math.abs(Math.round(d))}% vs mercado</strong>`
    : '—';
  const crit = Array.isArray(criteria) && criteria.length ? criteria : [];
  const critHtml = crit.length
    ? `<div class="market-crit"><span class="crit-title">Criterios de comparación</span>
        <div class="crit-chips">${crit.map((c) => `<span class="crit-chip">${esc(c)}</span>`).join('')}</div></div>`
    : '';
  return `<div class="market"><div class="market-grid">
    <div><span class="l">Este inmueble</span><strong>$${Number(m.candidate_ppm2 || 0).toLocaleString('es-CO')}/m²</strong></div>
    <div><span class="l">Mediana comparables</span><strong>$${Number(m.market_ppm2).toLocaleString('es-CO')}/m²</strong></div>
    <div><span class="l">Oportunidad</span>${pos}</div>
    <div><span class="l">Comparables</span><strong>${Number(m.n_comparables) || 0}</strong></div>
  </div>${critHtml}<p class="market-note">Precio por m² comparado contra el de ${Number(m.n_comparables) || 0} inmuebles similares de la zona (precios de OFERTA).</p>${auditoriaComparables && m.__id ? botonComparables(m.__id, m.n_comparables) : ''}</div>`;
}

function marketSection(p) {
  const m = p.features?.market;
  if (!m || m.market_ppm2 == null) return '';
  // Criterios que el motor REALMENTE aplicó. Solo si la ficha es vieja (evaluada
  // antes de que el motor los guardara) se deducen del nombre del método.
  const crit = Array.isArray(m.criteria) && m.criteria.length ? m.criteria : criteriosComparacion(m.method, m.radius_km);
  // discount_pct de la fila y market.* salen del mismo evaluate() del motor.
  return `<div class="section"><h3>Análisis de mercado</h3>${marketBody({ ...m, discount_pct: p.discount_pct, __id: p.id }, crit)}</div>`;
}
function mapSection(p) {
  const f = p.features || {};
  let q;
  if (f.lat != null && f.lng != null) q = f.lat + ',' + f.lng;
  else if (p.address || p.city) q = [p.address, p.city, 'Colombia'].filter(Boolean).join(', ');
  else {
    // Sin coordenadas ni dirección no se devolvía nada, y en la ficha quedaba un
    // hueco donde debía ir el mapa. Un espacio en blanco bajo un título se lee
    // como que algo no cargó, no como que el dato no existe: se dice cuál de las
    // dos cosas es.
    return `<div class="section"><h3>Ubicación aproximada</h3>
      <p class="market-note">Este aviso no publica una dirección que podamos ubicar en el mapa.
      Verifícala en la fuente original antes de desplazarte.</p></div>`;
  }
  return `<div class="section"><h3>Ubicación aproximada</h3><iframe class="mapframe" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed"></iframe></div>`;
}
let lastModalFocus = null;
function showModal() {
  lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $('modal').classList.add('open');
  $('modal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (gImgs.length) gRender();
  requestAnimationFrame(() => {
    const detail = document.querySelector('.detail');
    if (detail) detail.scrollTop = 0;
    $('modal-close').focus({ preventScroll: true });
  });
}
function closeModal() {
  if (!$('modal').classList.contains('open')) return;
  // El diálogo se comparte entre ficha, muro y tutorial: si no se restituye la
  // etiqueta, el lector de pantalla anunciaría la anterior sobre el contenido nuevo.
  $('modal').setAttribute('aria-label', 'Detalle del inmueble');
  $('modal').classList.remove('open');
  $('modal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  fichaEnPantalla = null;
  if (lastModalFocus?.isConnected) lastModalFocus.focus({ preventScroll: true });
}

// ---------- Stats + leyenda + tabs ----------
let STATS = null;
function renderStatsUnavailable() {
  STATS = null;
  $('c-bancos').textContent = '—';
  $('c-remates').textContent = '—';
  $('summary').innerHTML = `
    <div class="summary-stat muted">
      <div class="num">Actualizando</div>
      <div class="lbl">Las estadísticas volverán automáticamente; los resultados siguen disponibles.</div>
    </div>`;
}
/** Un solo viaje por la configuración: la usan el asistente y la verificación. */
async function cargarConfig() {
  try {
    const c = await fetch('/api/config').then((r) => r.json());
    auditoriaComparables = c.auditoriaComparables === true;
    planDemoActivo = c.demoPlanActivation === true;
  } catch { /* sin config, la verificación queda apagada */ }
}

/**
 * El texto que quita el miedo a un cobro, cuando toca decirlo.
 *
 * Durante el piloto el plan completo se activa sin pasar por caja, pero eso solo
 * se cuenta en la página de planes: en el momento de pulsar «desbloquear» —que es
 * cuando la persona duda— la palabra «suscripción» es justo la que la frena.
 *
 * Va atado a la variable del servidor y no escrito a mano: el día que se apague
 * el piloto, este texto tiene que desaparecer solo. Un «sin tarjeta de crédito»
 * que sobreviva al cobro real sería una promesa falsa, y de las caras.
 */
function avisoPiloto() {
  if (!planDemoActivo) return '';
  return '<p class="aviso-piloto">Durante el piloto se activa gratis y al instante: '
    + 'sin cobros ni datos de pago.</p>';
}

async function loadStats() {
  const response = await fetch('/api/stats');
  if (!response.ok) throw new Error(`stats HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.available === false) {
    renderStatsUnavailable();
    return;
  }
  STATS = payload;
  $('c-bancos').textContent = STATS.bancos.toLocaleString('es-CO');
  $('c-remates').textContent = STATS.remates.toLocaleString('es-CO');
  // Tres cifras, y las tres del mismo tipo: oportunidades. Decisión de la reunión
  // del 28-jul, y las dos razones que se dieron son buenas:
  //
  //  · «Listados portal» invitaba a competir en cantidad, y esa es una carrera
  //    perdida —siempre habrá un portal con más inventario—. El producto no vende
  //    volumen, vende criterio: por eso las tres cifras cuentan oportunidades.
  //  · La fecha de actualización es un dato interno. A un visitante que lee
  //    «actualizado hace dos días» le suena a desactualizado, cuando el Radar
  //    nunca prometió tiempo real: promete un corte semanal bien hecho.
  //
  // Y quitarlas resuelve de paso lo que más molestó al verlo: había cifras en tres
  // filas distintas —resumen, pestañas y franja— y varias eran la misma repetida.
  // Cada cifra lleva a su sección. Lo pidió el cliente al verlas: «la gente
  // podría hacer clic aquí, sin problema — quiere ir a bancos, pum, le llega a
  // bancos». Y tenía razón en el diagnóstico previo: puestas ahí, en grande y sin
  // ser pulsables, invitaban a pulsarlas y no pasaba nada.
  //
  // Son <button> y no <div>: un destino que se activa con un clic tiene que
  // activarse también con el teclado, y esto ya es navegación de la aplicación.
  $('summary').innerHTML = `
    <button class="summary-stat" type="button" data-ir="portal"><span class="num">${STATS.portal_opps.toLocaleString('es-CO')}</span><span class="lbl">Oportunidades en portales</span></button>
    <button class="summary-stat" type="button" data-ir="bancos"><span class="num">${STATS.bancos.toLocaleString('es-CO')}</span><span class="lbl">En bancos</span></button>
    <button class="summary-stat" type="button" data-ir="remates"><span class="num">${STATS.remates.toLocaleString('es-CO')}</span><span class="lbl">Remates judiciales</span></button>`;
  // Se delega en el botón real de la pestaña en vez de duplicar su manejador:
  // cambiar de sección hace una docena de cosas —filtros, paginador, foco, el
  // desplazamiento en móvil— y tener dos caminos que las hagan es tener dos
  // caminos que se desincronicen.
  $('summary').querySelectorAll('[data-ir]').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelector(`.tab-btn[data-tab="${boton.dataset.ir}"]`)?.click();
    });
  });
  renderLeyenda();
}
/**
 * La casilla "Actualizado" del resumen.
 *
 * Antes era `new Date()` del navegador: decía "hoy" aunque el cron llevara un mes
 * muerto. Ahora sale de `radar_cron_jobs` (server/frescura.ts) y tiene tres
 * estados, porque "no lo sé" es una respuesta distinta de "está al día".
 */
function renderActualizado(frescura) {
  if (!frescura || !frescura.actualizadoEn) {
    return `<div class="summary-stat muted" title="No se pudo consultar el estado de las corridas">
      <div class="num">—</div><div class="lbl">Actualizado</div></div>`;
  }
  const fecha = new Date(frescura.actualizadoEn);
  const etiqueta = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  // La fecha mostrada es siempre la corrida real. El estado degradado NO se
  // anuncia al visitante: un aviso de operación interna en la portada no le dice
  // nada útil a quien viene a buscar inmuebles, y la fecha por sí sola ya es
  // honesta —si el pipeline se detiene, deja de avanzar—. El diagnóstico completo
  // queda en el tooltip y, sobre todo, en `/api/stats`, que es de donde lo toman
  // el panel de administración y el monitor de producción.
  const detalle = frescura.degradada && frescura.motivo
    ? `Última corrida: ${fecha.toLocaleString('es-CO')} · ${frescura.motivo}`
    : `Última corrida: ${fecha.toLocaleString('es-CO')}`;
  return `<div class="summary-stat muted" title="${esc(detalle)}">
    <div class="num">${esc(etiqueta)}</div><div class="lbl">Actualizado</div></div>`;
}
/**
 * Qué significan las estrellas.
 *
 * Antes esta caja explicaba las etiquetas «Alta» y «Oportunidad», que eran el
 * sistema de clasificación de una versión anterior. Desde que el filtro habla en
 * categorías del Índice CRECE y las tarjetas llevan estrellas, la única
 * explicación que hacía falta no estaba en ninguna parte: alguien veía ★★★ en una
 * tarjeta y ☆ en otra sin nada que le dijera qué separa a una de la otra.
 *
 * Se genera desde `TABLA_CRECE`, la misma copia de la tabla maestra que alimenta
 * el filtro y las tarjetas. Escribirla a mano habría creado un tercer sitio donde
 * repetir los nombres de las categorías, y sería el primero en quedarse viejo.
 *
 * Solo se listan las que llevan estrella: las dos de «Precio de Mercado» no
 * marcan nada en la tarjeta, así que explicarlas aquí sería explicar la ausencia
 * de un símbolo que el usuario no ha visto.
 */
function leyendaCrece() {
  const filas = TABLA_CRECE.filter((t) => t.estrellasTexto).map((t) => (
    `<span class="legend-item"><span class="legend-estrellas">${t.estrellasTexto}</span> ${esc(t.lectura)}${
      t.umbral ? `<em class="legend-umbral">${esc(t.umbral)}</em>` : ''}</span>`
  )).join('');
  return `<details class="legend-card"${mobileQuery.matches ? '' : ' open'}>
    <summary class="legend-title">${ic('chart')} Qué significan las estrellas</summary>
    <div class="legend-body">
      ${filas}
      <span class="legend-item note">Cada inmueble se compara con los precios publicados de otros parecidos en su propia zona. Más estrellas, más por debajo de ese mercado.</span>
    </div>
  </details>`;
}

/**
 * La leyenda de las estrellas, según la sección.
 *
 * Antes esta función pintaba además una franja de cifras por sección
 * —«oportunidades altas», «ciudades cubiertas»—, que se retiró: repetía datos que el
 * hero ya da y, al bajar la navegación, compartía barra con las pestañas y competía
 * con ellas por la atención en el mismo renglón.
 *
 * La leyenda solo aparece en el portal abierto: es donde las estrellas se ven y donde
 * hace falta explicarlas. En bancos y remates el criterio es otro —dación en pago,
 * base legal del 70 %— y una leyenda de estrellas ahí sobra.
 */
function renderLeyenda() {
  if (!STATS) return;
  // Portal Y Bancos: los dos pintan estrellas en sus tarjetas, así que en los dos
  // hace falta saber qué significan. Solo estaba en Portal, y quien entraba
  // directo a Bancos veía tres estrellas doradas sin ninguna explicación.
  //
  // En Remates no: ahí no hay Índice CRECE —no se calcula contra el mercado sino
  // contra el avalúo del juzgado— y una leyenda de estrellas explicaría algo que
  // esa pestaña no muestra.
  const conEstrellas = state.tab === 'portal' || state.tab === 'bancos';
  $('legend').innerHTML = conEstrellas ? leyendaCrece() : '';
}

/**
 * Cambia de sección: marca la pestaña, reconstruye sus filtros y carga.
 *
 * `antesDeCargar` corre con los filtros YA pintados y antes de pedir resultados.
 * Es lo que necesita el buscador de arriba para volcar en el panel lo que la
 * persona escribió: sin ese hueco habría que cargar una vez sin filtrar y otra
 * filtrada, y el usuario vería medio segundo de resultados que no pidió.
 *
 * `pagina` solo lo usa la reconstrucción desde la dirección: quien comparte la
 * página 3 de una búsqueda comparte la página 3. Por lo demás, entrar en una
 * sección siempre empieza por el principio.
 */
async function activarPestana(tab, antesDeCargar, pagina = 1) {
  document.querySelectorAll('.tab-btn[data-tab]').forEach((x) => {
    const active = x.dataset.tab === tab;
    x.classList.toggle('active', active);
    if (active) x.setAttribute('aria-current', 'page');
    else x.removeAttribute('aria-current');
  });
  state.tab = tab;
  // Cada sección arranca con el tamaño de página de las pestañas. Si la búsqueda
  // viene del buscador, su `antesDeCargar` lo baja a 20 justo después.
  state.pageSize = PAGE_SIZE;
  aplicarVistaDePestana();
  renderRadarSetup();
  state.loadSeq++;
  state.loading = false;
  $('grid').innerHTML = '';
  $('pager').innerHTML = '';
  $('empty').style.display = 'none';
  $('loading').style.display = state.tab === 'home' ? 'none' : 'block';
  $('filters').innerHTML = '';
  setResultText(`Preparando ${state.tab === 'portal' ? 'el portal' : state.tab === 'home' ? 'la portada' : state.tab}…`);
  setFiltersOpen(false);
  renderLeyenda();
  try {
    await buildFilters();
    if (state.tab === 'portal') await applyRadarPreferences(radarPreferences);
  } catch (error) {
    console.error('filters:', error);
    $('filters').innerHTML = '<div class="f-note">Los filtros no están disponibles por el momento.</div>';
  }
  renderRadarSetup();
  if (antesDeCargar) await antesDeCargar();
  // Cambiar de sección SÍ es un paso de navegación: es lo que hace que «atrás»
  // devuelva a la pantalla anterior en vez de sacar de la aplicación.
  empujarProximaUrl = true;
  await load(pagina);
  if (mobileQuery.matches) {
    // Al cambiar de sección en móvil se sube a donde empiezan los resultados. Antes
    // apuntaba a `.vstats`, la franja morada de cifras, que dejó de existir como
    // barra propia al bajar la navegación: sus cifras viven ahora dentro de la barra
    // de secciones. Sin el `?.` esto lanzaba y dejaba la carga a medias.
    (document.querySelector('.tabs-bar') || $('results'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => b.addEventListener('click', () => {
  void activarPestana(b.dataset.tab);
}));
$('modal-close').addEventListener('click', closeModal);
// «Ver tutorial» reabre el RECORRIDO, que es la bienvenida real. El diálogo
// por pasos queda como respaldo para cuando el recorrido no esté disponible.
$('ver-tutorial').addEventListener('click', () => {
  if (window.__radarTour) window.__radarTour.abrir();
  else abrirOnboarding();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-onboarding-siguiente]')) { avanzarOnboarding(1); return; }
  if (e.target.closest('[data-onboarding-atras]')) { avanzarOnboarding(-1); return; }
  // «Ver esta sección»: cierra el tutorial y lleva al apartado del que acaba de
  // hablar. Es lo que lo convierte en un recorrido y no en una explicación —quien
  // lo sigue termina habiendo visitado el producto, no habiendo leído sobre él—.
  // Se marca como visto: quien llegó hasta aquí ya sabe dónde encontrarlo.
  const ir = e.target.closest('[data-onboarding-ir]');
  if (ir) {
    marcarOnboardingVisto();
    closeModal();
    document.querySelector(`.tab-btn[data-tab="${ir.dataset.onboardingIr}"]`)?.click();
    return;
  }
  if (e.target.closest('[data-onboarding-cerrar]')) { marcarOnboardingVisto(); closeModal(); }
});
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });

/**
 * Anota la ficha antes de que el usuario salga de ella hacia /login o /planes.
 *
 * Se hace por delegación y mirando el destino del enlace —no marcando cada CTA—
 * porque los muros son cuatro y crecen: el de suscripción, el de cupo agotado, el
 * del reporte descargable y los candados de los remates. Cualquier enlace nuevo
 * dentro de una ficha que lleve a registrarse o a pagar queda cubierto sin que
 * nadie tenga que acordarse de esto.
 *
 * Solo cuenta dentro del diálogo: los enlaces de la barra superior son la vía por
 * la que alguien entra a /login por su cuenta, y a ese no hay que devolverlo a
 * ninguna parte.
 */
document.addEventListener('click', (event) => {
  if (!fichaEnPantalla || !(event.target instanceof Element)) return;
  const enlace = event.target.closest('#modal a[href]');
  if (!enlace) return;
  let destino;
  try { destino = new URL(enlace.getAttribute('href'), location.origin); } catch { return; }
  if (destino.origin !== location.origin) return;
  if (destino.pathname !== '/login' && destino.pathname !== '/planes') return;
  window.__fichaPendiente?.guardar(fichaEnPantalla.kind, fichaEnPantalla.id, fichaEnPantalla.titulo);
});

/**
 * Reabre la ficha que quedó a medias al irse a registrarse, a entrar o a activar plan.
 *
 * La nota se consume SIEMPRE, se reabra o no: es un billete de un solo viaje. Si
 * el usuario volvió sin sesión —se arrepintió del registro— la nota ya no
 * significa nada, y dejarla ahí haría que la ficha le saltara en la cara la
 * próxima vez que entrara por cualquier otro camino.
 *
 * Devuelve si abrió algo, para que el enlace directo de la dirección no le ponga
 * otra ficha encima.
 */
function reabrirFichaPendiente() {
  const pendiente = window.__fichaPendiente?.leer();
  if (!pendiente) return false;
  window.__fichaPendiente.olvidar();
  if (!auth.token) return false;
  // El recorrido de bienvenida usa este mismo diálogo: abrir la ficha encima lo
  // borraría a media frase.
  if (window.__radarTour?.activo || document.querySelector('.onboarding')) return false;
  window.__openRec(pendiente.kind, pendiente.id);
  return true;
}

/**
 * Abre la ficha a la que apunta un enlace directo: `/?kind=banco&id=…`.
 *
 * Es el enlace que el asistente reparte cuando nombra una oportunidad concreta
 * (`server/asistente-busqueda.ts`). Convive con los filtros sin estorbarlos:
 * `kind` e `id` no describen una búsqueda, así que el listado de debajo es el que
 * digan los demás parámetros, o la portada si no hay ninguno.
 *
 * Se consume una sola vez y desaparece de la dirección —lo hace `sincronizarUrl`,
 * que solo escribe parámetros de búsqueda—. Es lo mismo que hace la ficha
 * pendiente y por el mismo motivo: el enlace lleva a una ficha, pero desde el
 * momento en que la persona empieza a filtrar, lo que su dirección debe describir
 * es lo que está mirando ahora.
 */
function abrirFichaDeLaUrl(ficha) {
  if (!ficha) return;
  if (window.__radarTour?.activo || document.querySelector('.onboarding')) return;
  window.__openRec(ficha.kind, ficha.id);
}
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const aiButton = event.target.closest('.ai-btn[data-ai-kind]');
  if (aiButton) {
    window.__analyzeAI(aiButton, aiButton.dataset.aiKind, aiButton.dataset.aiId);
    return;
  }
  const recommendation = event.target.closest('.rec-card[data-rec-kind]');
  if (recommendation) {
    window.__openRec(recommendation.dataset.recKind, recommendation.dataset.recId);
    return;
  }
  const retry = event.target.closest('.retry-market');
  if (retry) {
    const disc = retry.dataset.marketDisc === '' ? null : Number(retry.dataset.marketDisc);
    window.__retryMarket(retry.dataset.marketKind, retry.dataset.marketId, disc);
    return;
  }
  const reporteButton = event.target.closest('button[data-reporte-id]');
  if (reporteButton) {
    descargarReporte(reporteButton);
    return;
  }
  const saveSimulationButton = event.target.closest('[data-save-simulation]');
  if (saveSimulationButton) {
    const calc = saveSimulationButton.closest('.calc');
    if (calc) saveSimulation(calc);
    return;
  }
  const publication = event.target.closest('.pub-toggle');
  if (publication) {
    const content = publication.nextElementSibling;
    const open = content?.classList.toggle('open') || false;
    publication.setAttribute('aria-expanded', String(open));
    publication.textContent = open ? 'Ocultar copia exacta' : 'Ver copia exacta de la publicación';
    return;
  }
  const galleryButton = event.target.closest('[data-gallery-move]');
  if (galleryButton) window.gMove(Number(galleryButton.dataset.galleryMove));
});
document.addEventListener('input', (event) => {
  if (event.target instanceof Element && event.target.matches('.calc-input')) {
    window.__recalcGastos(event.target);
  } else if (event.target instanceof Element && event.target.matches('.rent-input')) {
    if (event.target.matches('[data-rent]')) {
      event.target.dataset.rentSource = 'custom';
      const origin = event.target.closest('.calc')?.querySelector('[data-rent-origin]');
      if (origin) origin.textContent = 'Valor de arrendamiento ajustado por ti';
    }
    window.__recalcRent(event.target);
  }
});
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.matches('[data-card-source]')) {
    window.__cardFallback(image.parentElement, image.dataset.cardSource, image.dataset.cardType);
  } else if (image.matches('[data-rec-image]')) {
    window.__recFallback(image);
  }
}, true);
document.addEventListener('keydown', (e) => {
  if (!$('modal').classList.contains('open')) return;
  if (e.key === 'Escape') closeModal();
  // Las flechas sirven a la galería de una ficha o al avance del tutorial, según
  // qué haya abierto. Nunca a los dos: el tutorial vacía `gImgs` al abrirse.
  const enTutorial = !!document.querySelector('.onboarding');
  // Las flechas NO son de la galería cuando el foco está en un campo: ahí mueven
  // el cursor dentro de lo que se está escribiendo. Sin esta salida, corregir una
  // cifra en la calculadora de gastos cambiaba la foto a cada pulsación —que es el
  // «al mover el valor numérico se disparan las fotos» que reportó la auditoría—.
  const enCampo = e.target instanceof Element
    && (e.target.matches('input, textarea, select') || e.target.isContentEditable);
  const flechasParaGaleria = !enCampo;
  if (e.key === 'ArrowLeft' && flechasParaGaleria) { if (enTutorial) avanzarOnboarding(-1); else if (gImgs.length > 1) window.gMove(-1); }
  if (e.key === 'ArrowRight' && flechasParaGaleria) { if (enTutorial) avanzarOnboarding(1); else if (gImgs.length > 1) window.gMove(1); }
  if (e.key === 'Tab') {
    const focusable = [...$('modal').querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// El tutorial se abre solo la primera vez de un VISITANTE. Va antes de cargar
// resultados porque no depende de ellos, y el fondo bloqueado evita que el usuario
// empiece a tocar filtros con el diálogo abierto. En modo privado `localStorage`
// puede lanzar: si no se puede recordar la visita, es mejor no mostrarlo que
// mostrarlo siempre.
//
// Con sesión NO se abre por su cuenta, y esto es lo que evita que dos cosas se
// peleen por la pantalla: quien acaba de registrarse recibe la bienvenida, y el
// recorrido lo lanza ella cuando el usuario lo pide. Sin esta condición se abrían
// las dos a la vez —el recorrido encima de la bienvenida— porque una la decide el
// navegador y la otra la cuenta.
try {
  if (!localStorage.getItem(ONBOARDING_KEY) && !localStorage.getItem('radar_token')) {
    marcarOnboardingVisto();
    // El recorrido guiado necesita que la página ya tenga contenido que iluminar,
    // así que espera a que las pestañas estén pintadas. Si `tour.js` no cargó por
    // lo que sea, se abre el tutorial en diálogo: nadie se queda sin bienvenida.
    setTimeout(() => {
      if (window.__radarTour) window.__radarTour.abrir();
      else abrirOnboarding();
    }, 900);
  }
} catch { /* sin almacenamiento no se insiste */ }

/* ───── EL BUSCADOR DE ARRIBA ─────
 *
 * Va envuelto porque estos archivos son scripts clásicos que comparten un mismo
 * ámbito global con `tour.js` y `asistente.js`: cualquier nombre suelto aquí es un
 * nombre que otro archivo ya no puede usar.
 *
 * La regla que lo gobierna: el buscador NO es un segundo cliente de la API. No
 * conoce `/api/portal`, no arma consultas y no sabe nada del muro de pago. Lo
 * único que hace es escribir en el panel de filtros —la única fuente— y pedir que
 * se cargue. Todo lo demás (identificación, plan, redacción de las fichas
 * bloqueadas) sigue pasando exactamente por donde pasaba.
 */
(function buscadorPrincipal() {
  const form = $('buscador-form');
  if (!form) return;
  const FUENTES = ['portal', 'bancos', 'remates'];
  const selCiudad = $('b-city');
  const selTipo = $('b-type');
  const campoPrecio = $('b-price');
  const etiquetaPrecio = $('b-price-label');
  const radios = [...form.querySelectorAll('input[name="buscador-fuente"]')];
  const fuenteElegida = () => radios.find((r) => r.checked)?.value || 'portal';
  const tieneOpcion = (select, valor) => !valor || [...select.options].some((o) => o.value === valor);

  // Las facetas de cada fuente se piden una vez. Son tres listas que no cambian
  // durante la visita, y volver a pedirlas en cada pulsación de las píldoras
  // dejaría el desplegable en blanco mientras responde la red.
  const facetasPorFuente = new Map();
  function facetasDe(fuente) {
    if (!facetasPorFuente.has(fuente)) {
      facetasPorFuente.set(fuente, fetch(`/api/facets?source=${encodeURIComponent(fuente)}`)
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch((e) => {
          // El fallo NO se queda cacheado: si no, un corte de red de un segundo
          // dejaría el buscador sin ciudades hasta que alguien recargue.
          facetasPorFuente.delete(fuente);
          throw e;
        }));
    }
    return facetasPorFuente.get(fuente);
  }

  function rellenar(select, valores, etiqueta, textoTodas) {
    const elegido = select.value;
    select.innerHTML = `<option value="">${esc(textoTodas)}</option>`
      + valores.map((v) => `<option value="${esc(v)}">${esc(etiqueta(v))}</option>`).join('');
    // Lo elegido se conserva solo si la fuente nueva lo tiene: un remate puede
    // estar en un municipio donde el portal no publica nada, y al revés.
    if (elegido && tieneOpcion(select, elegido)) select.value = elegido;
  }

  let pintadoSeq = 0;
  async function pintarOpciones(fuente) {
    const seq = ++pintadoSeq;
    let facetas;
    try { facetas = await facetasDe(fuente); } catch { return; }
    // Entre la petición y la respuesta la persona pudo cambiar de píldora: el que
    // llega tarde se descarta, igual que hacen los listados con `state.loadSeq`.
    if (seq !== pintadoSeq) return;
    rellenar(selCiudad, facetas.cities || [], cap, 'Todas las ciudades');
    rellenar(selTipo, facetas.types || [], typeLbl, 'Todos los tipos');
  }

  function ajustarEtiquetaPrecio(fuente) {
    // En un remate no hay precio de venta: hay una POSTURA con la que arranca la
    // subasta. Llamarla «precio» sería prometer otra cosa, y es el número por el
    // que el servidor filtra (`bidMax`), no el mismo campo.
    etiquetaPrecio.textContent = fuente === 'remates' ? 'Postura máxima (millones)' : 'Precio máximo (millones)';
  }

  /**
   * Vuelca el buscador en el panel de filtros.
   *
   * Esta es la única dirección en la que el buscador escribe, y escribe en los
   * MISMOS controles que ya existían: así la petición la sigue armando `load()`
   * con `readFilters()`, y no hay una segunda forma de decir «filtrado por Bogotá»
   * que pueda contradecir a la primera.
   *
   * `extras` son los filtros que el buscador no ofrece en su caja pero el panel sí
   * —precio mínimo y valoración del Índice CRECE—. Los usa `aplicar()`, que recibe
   * búsquedas de fuera; lo que no venga no se toca.
   */
  async function volcarEnPanel(fuente, extras = {}) {
    const ciudad = $('f-city');
    if (ciudad && tieneOpcion(ciudad, selCiudad.value)) {
      const cambia = ciudad.value !== selCiudad.value;
      ciudad.value = selCiudad.value;
      // El barrio pertenece a UNA ciudad. Sin repoblarlo, quien busca en Pereira
      // después de haber elegido un barrio de Bogotá se queda filtrando por un
      // barrio que no existe en su ciudad, y la pantalla sale vacía sin explicación.
      if (cambia && fuente === 'portal') await repopZones(ciudad.value);
    }
    const tipo = $('f-type');
    if (tipo && tieneOpcion(tipo, selTipo.value)) tipo.value = selTipo.value;
    const precio = $(fuente === 'remates' ? 'f-bidMax' : 'f-priceMax');
    if (precio) precio.value = campoPrecio.value;
    if (extras.precioMin != null) {
      const minimo = $(fuente === 'remates' ? 'f-bidMin' : 'f-priceMin');
      if (minimo) minimo.value = extras.precioMin;
    }
    // La valoración no existe en remates: ahí el veredicto del Índice CRECE no se
    // calcula, y el desplegable ni se pinta. Se ignora en vez de fallar.
    // `!= null` y no a secas: la cadena vacía es una orden —quita la valoración—,
    // no la ausencia de orden. Ver el mismo criterio en `aplicar()`.
    if (extras.tier != null) {
      const valoracion = $('f-opp');
      if (valoracion && tieneOpcion(valoracion, extras.tier)) valoracion.value = extras.tier;
    }
    updateFilterCount();
    state.pageSize = PAGE_SIZE_BUSCADOR;
  }

  /** Trae al buscador lo que el panel tiene puesto ahora mismo. */
  async function sincronizar() {
    if (!FUENTES.includes(state.tab)) return;
    const radio = radios.find((r) => r.value === state.tab);
    if (radio) radio.checked = true;
    ajustarEtiquetaPrecio(state.tab);
    // Primero las opciones: asignarle a un desplegable un valor que todavía no
    // existe entre sus opciones lo deja vacío, y el buscador diría «todas las
    // ciudades» sobre un listado acotado a Bogotá.
    await pintarOpciones(state.tab);
    const ciudad = $('f-city');
    if (ciudad) selCiudad.value = tieneOpcion(selCiudad, ciudad.value) ? ciudad.value : '';
    const tipo = $('f-type');
    if (tipo) selTipo.value = tieneOpcion(selTipo, tipo.value) ? tipo.value : '';
    const precio = $(state.tab === 'remates' ? 'f-bidMax' : 'f-priceMax');
    if (precio) campoPrecio.value = precio.value;
  }

  /**
   * Ejecuta la búsqueda. ÚNICO camino: lo usan igual el botón y `aplicar()`.
   *
   * Que haya una sola forma de buscar no es limpieza, es lo que impide que el día
   * de mañana la búsqueda del chat y la del botón se comporten distinto sin que
   * nadie lo note hasta que un usuario lo cuenta.
   */
  async function ejecutar(fuente, extras) {
    if (state.tab === fuente) {
      // Ya estamos en la sección. Se escribe sobre el panel que ya está pintado en
      // vez de reconstruirlo, y así sobreviven los filtros de abajo que el buscador
      // no ofrece —estrato, habitaciones, banco—: buscar otra vez no es motivo para
      // borrar lo que la persona afinó a mano.
      await volcarEnPanel(fuente, extras);
      await load(1);
    } else {
      await activarPestana(fuente, () => volcarEnPanel(fuente, extras));
    }
    $('results')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  form.addEventListener('submit', (evento) => {
    // Sin esto el formulario navegaría y la página se recargaría entera. Es además
    // lo que hace que la tecla Enter dentro de cualquier campo busque.
    evento.preventDefault();
    void ejecutar(fuenteElegida(), {});
  });
  // Cambiar de modalidad reconfigura el formulario, no busca: son otras ciudades y
  // otro campo de precio, pero la persona todavía no ha dicho que quiera irse.
  radios.forEach((radio) => radio.addEventListener('change', () => {
    ajustarEtiquetaPrecio(radio.value);
    void pintarOpciones(radio.value);
  }));

  /** Lo que el asistente llama «banco» o «remate» son aquí pestañas en plural. */
  function fuenteDesde(valor) {
    const dicho = String(valor || '').trim().toLowerCase();
    const equivalencias = { portal: 'portal', banco: 'bancos', bancos: 'bancos', remate: 'remates', remates: 'remates' };
    return equivalencias[dicho] || null;
  }

  /**
   * Millones, que es la unidad de los campos de precio de toda la interfaz.
   *
   * Se acepta la cifra en pesos porque es como habla el servidor —`ParametrosBusqueda`
   * del asistente lleva COP— y como la escribiría cualquiera que copie un precio de
   * una ficha. Nadie busca un inmueble de 300 pesos ni uno de 300 billones, así que
   * el corte en un millón separa las dos unidades sin ambigüedad posible.
   */
  function aMillones(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) return null;
    return numero >= 1e6 ? Math.round(numero / 1e6) : Math.round(numero);
  }

  /** Como lo guarda la base: minúsculas y sin tildes. El modelo escribe «Bogotá». */
  const normalizarCiudad = (valor) => String(valor)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  /** Lo que quedó puesto de verdad, leído del panel, no de lo que se pidió. */
  function filtrosAplicados(fuente) {
    const valor = (id) => $(id)?.value || '';
    return {
      ciudad: valor('f-city'),
      tipo: valor('f-type'),
      precioMinMillones: valor(fuente === 'remates' ? 'f-bidMin' : 'f-priceMin'),
      precioMaxMillones: valor(fuente === 'remates' ? 'f-bidMax' : 'f-priceMax'),
      tier: valor('f-opp'),
    };
  }

  /**
   * Aplica una búsqueda desde código. Es el enganche del asistente del chat.
   *
   * Hace lo mismo que pulsar «Buscar» y por el mismo camino: lleva a la sección
   * donde se ven propiedades, deja los filtros PUESTOS Y A LA VISTA en los
   * controles, y devuelve qué salió. Que se vean es la mitad del asunto: si el
   * listado cambiara sin que los controles lo cuenten, la persona vería otra
   * pantalla sin saber por qué ni cómo deshacerlo.
   *
   * Lo que no venga en la petición no se toca —una llamada parcial no borra en
   * silencio lo que el usuario ya tenía puesto—, con una sola excepción obligada:
   * al cambiar de fuente, el panel se reconstruye desde cero (son otros filtros) y
   * solo sobreviven los campos que la caja de búsqueda sabe repetir.
   */
  async function aplicar(peticion = {}) {
    const fuente = fuenteDesde(peticion.fuente) || (FUENTES.includes(state.tab) ? state.tab : fuenteElegida());
    const radio = radios.find((r) => r.value === fuente);
    if (radio) radio.checked = true;
    ajustarEtiquetaPrecio(fuente);
    // Antes de escribir hay que tener las opciones de ESTA fuente: asignarle a un
    // desplegable un valor que todavía no está entre sus opciones lo deja vacío.
    await pintarOpciones(fuente);

    if (peticion.ciudad != null) {
      const ciudad = normalizarCiudad(peticion.ciudad);
      if (tieneOpcion(selCiudad, ciudad)) selCiudad.value = ciudad;
    }
    if (peticion.tipo != null && tieneOpcion(selTipo, String(peticion.tipo))) selTipo.value = String(peticion.tipo);
    // Vacío EXPLÍCITO significa quitar el filtro, no «no lo toques». La diferencia
    // importa porque el asistente manda siempre todos los campos: si al pedir
    // «remates en Medellín» sobreviviera el tope de precio de la búsqueda
    // anterior, la pantalla mostraría un filtro que nadie pidió y el número que
    // el chat acaba de decir —«hay 84»— no cuadraría con lo que hay debajo.
    // «No viene» sigue siendo no tocar: eso es `null`/`undefined`, no cadena vacía.
    if (peticion.precioMax != null) {
      const tope = aMillones(peticion.precioMax);
      campoPrecio.value = tope ? String(tope) : '';
    }

    const extras = {};
    if (peticion.precioMin != null) {
      const piso = aMillones(peticion.precioMin);
      extras.precioMin = piso ? String(piso) : '';
    }
    if (peticion.tier != null) extras.tier = String(peticion.tier);

    await ejecutar(fuente, extras);
    return {
      // `state.total` es nulo cuando la carga falló: quien pregunte tiene que poder
      // distinguir «no hay resultados» de «no se pudo buscar».
      ok: state.total != null,
      fuente,
      total: state.total,
      mostrados: state.mostrados,
      filtros: filtrosAplicados(fuente),
    };
  }

  ajustarEtiquetaPrecio(fuenteElegida());
  void pintarOpciones(fuenteElegida());
  /**
   * Contrato público, con nombre propio y sin guiones bajos a propósito: esto lo
   * llama código de fuera (el asistente), no es plomería interna como
   * `window.__radarTour`. `sincronizar` viaja al lado porque `load()` la necesita.
   */
  window.RadarBuscador = { aplicar, sincronizar };
})();

// init — las propiedades cargan en PARALELO con las stats (no esperan a stats).
// Tolerante a fallos: si stats o filtros fallan, igual cargan las propiedades.
aplicarVistaDePestana();
// Qué pidió la dirección con la que se abrió la página. Se lee ANTES que nada
// porque la primera búsqueda ya la reescribe, y el enlace a una ficha concreta
// —que no es un filtro— dejaría de estar ahí para cuando conteste `initAuth`.
const estadoInicialDeLaUrl = window.__radarUrlEstado.leer(location.search);
// La ficha pendiente se reabre DESPUÉS de `initAuth`, no antes: hasta que no
// vuelve /api/favorites no se sabe si el token sigue siendo válido, y reabrirla
// con una sesión caducada la mostraría bloqueada justo a quien acaba de entrar.
// Vale igual para el enlace directo del asistente, que abre el mismo diálogo.
initAuth().catch(() => { /* sin red se sigue como anónimo */ }).then(() => {
  // La ficha a medias manda sobre el enlace: es de hace minutos y de esta persona.
  if (reabrirFichaPendiente()) return;
  abrirFichaDeLaUrl(estadoInicialDeLaUrl.ficha);
});
// Sin `await` y sin bloquear nada: la calculadora solo aparece al abrir una
// ficha, muchísimo después de que esto resuelva, y mientras tanto ya tiene los
// valores de arranque.
void cargarParametrosGastos();
void cargarConfig();
loadStats().catch(() => renderStatsUnavailable());
if (estadoInicialDeLaUrl.explicito) {
  // La dirección trae una búsqueda: se reconstruye tal cual, y el Radar guardado
  // no propone nada esta vez. Ver `restaurarDesdeUrl`.
  void restaurarDesdeUrl();
} else {
  buildFilters().then(async () => {
    await applyRadarPreferences(radarPreferences);
    renderRadarSetup();
    load(1);
  }, (e) => {
    console.error('filters:', e);
    renderRadarSetup();
    load(1);
  });
}

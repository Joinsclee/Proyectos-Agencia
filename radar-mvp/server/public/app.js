/* Radar local — consume /api/* en vivo. Look RadarMVP + paginación numerada. */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const fmtCOP = (n) => (n ? '$' + Number(n).toLocaleString('es-CO') : '—');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const typeLbl = (t) => ({ apartment: 'Apartamento', house: 'Casa', commercial: 'Local', lot: 'Lote', farm: 'Finca', office: 'Oficina', warehouse: 'Bodega', parking: 'Parqueadero', building: 'Edificio', vehicle: 'Vehículo', rights: 'Derechos' }[t] || (t ? cap(t) : 'Inmueble'));
const srcLbl = (s) => ({ davivienda: 'Davivienda', bancolombia: 'Bancolombia', bbva: 'BBVA', aval: 'Aval', fincaraiz: 'FincaRaíz', rematandobienes: 'Rama Judicial' }[s] || s);
/** Icono del sprite SVG (index.html). Sustituye a los emoji: hereda color y tamaño del texto. */
const ic = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const srcIcon = (s) => ic(s === 'fincaraiz' ? 'home' : 'bank');
const emptyState = (icon, title, description, tone = '') => `
  <div class="empty-icon${tone ? ` is-${tone}` : ''}">${ic(icon, icon === 'alert-triangle' || icon === 'check-circle' ? 'ic-reicon' : '')}</div>
  <div class="h">${esc(title)}</div>
  <div>${esc(description)}</div>`;
// Oportunidad ALTA: la marca el motor (decil más barato + descuento grande +
// comparables homogéneos) y viaja en la columna is_high.
const isHighOpp = (d) => d.is_high === true;
const PAGE_SIZE = 24;

const ORDERS = {
  portal: [['discount_desc', 'Mayor descuento'], ['precio_m2_asc', 'Precio/m² menor'], ['precio_asc', 'Precio menor'], ['precio_desc', 'Precio mayor'], ['recent', 'Más recientes']],
  bancos: [['precio_m2_asc', 'Precio/m² menor'], ['precio_asc', 'Precio menor'], ['precio_desc', 'Precio mayor'], ['recent', 'Más recientes']],
  remates: [['auction_asc', 'Audiencia próxima'], ['min_asc', 'Postura menor'], ['min_desc', 'Postura mayor']],
};

const state = { tab: 'portal', page: 1, loading: false, loadSeq: 0 };
const GUEST_FAVS_KEY = 'radar_guest_favorites_v1';
const RADAR_PREFS_KEY = 'radar_preferences_v1';
const RADAR_SETUP_DISMISSED_KEY = 'radar_setup_dismissed_v1';
const RADAR_SIMULATIONS_KEY = 'radar_simulations_v1';
const RADAR_ALERT_KEY = 'radar_alert_v1';
/** Debe coincidir con CUPO_MENSUAL_FREE de server/cupo.ts. El servidor manda; esto es solo el texto. */
const CUPO_FREE_MENSUAL = 20;

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

async function initAuth() {
  renderAuthBar();
  if (!auth.token) { paintFavs(); return; }
  try {
    const res = await fetch('/api/favorites', { headers: authHeaders() });
    if (res.status === 401) { auth.token = null; localStorage.removeItem('radar_token'); renderAuthBar(); return; }
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
  updateFavCount();
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
// datos del proceso, descripción completa y análisis con IA quedan bloqueados;
// tras ver FREE_VIEW_LIMIT fichas aparece el muro de registro. Registrado: todo.
const FREE_VIEW_LIMIT = 5;
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
const ONBOARDING_KEY = 'radar_onboarding_v1';

/**
 * Pasos del tutorial, en orden.
 *
 * Cada uno es una tarjeta. Los que llevan `video` muestran el reproductor; los
 * demás, una ilustración de texto. `src` vacío pinta un marcador: para publicar un
 * video basta dejar el archivo en `server/public/radar/` y poner aquí su ruta.
 */
const ONBOARDING_PASOS = [
  {
    etiqueta: 'Bienvenido',
    titulo: 'El Radar compara contra el barrio, no contra el país',
    texto: 'Cada inmueble se mide contra el precio real de ofertas similares en su propia zona. Por eso un descuento aquí significa algo: no es una rebaja sobre un promedio nacional.',
    video: { src: '', poster: '', pie: 'Qué encuentra el Radar y de dónde salen los inmuebles.' },
  },
  {
    etiqueta: 'Paso 1',
    titulo: 'Filtra por lo tuyo',
    texto: 'Ciudad, presupuesto y tipo de inmueble. Puedes dejarlo listo en tres pasos desde la portada y el Radar recuerda tus preferencias.',
    puntos: ['Portal abierto, inmuebles de bancos y remates judiciales', 'Filtros por barrio, área, habitaciones y estrato'],
  },
  {
    etiqueta: 'Paso 2',
    titulo: 'Mira el descuento, no el precio',
    texto: 'El porcentaje de cada tarjeta compara contra ofertas parecidas de la misma zona. Las categorías Oportunidad y Oportunidad Fuerte son las de mayor señal.',
    video: { src: '', poster: '', pie: 'Cómo leer una ficha: comparables, descuento real y qué revisar.' },
  },
  {
    etiqueta: 'Paso 3',
    titulo: 'Abre la ficha y guarda las que te sirvan',
    texto: 'Dentro están la dirección, las fotos, los comparables del barrio y el análisis. Guarda las que te interesen con el corazón y vuelve a ellas cuando quieras.',
    puntos: ['Sin cuenta puedes explorar y comparar', 'Con cuenta gratis abres ' + CUPO_FREE_MENSUAL + ' fichas completas al mes'],
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

  $('modal-content').innerHTML = `<div class="onboarding">
    <div class="ob-tarjeta">
      <span class="ob-eyebrow">${ic('spark')} ${esc(paso.etiqueta)}</span>
      <h2>${esc(paso.titulo)}</h2>
      ${onboardingMedia(paso)}
      <p class="ob-texto">${esc(paso.texto)}</p>
      ${puntos}
    </div>
    <nav class="ob-nav" aria-label="Avance del tutorial">
      <ol class="ob-puntitos">${ONBOARDING_PASOS.map((_, n) => `<li class="${n === i ? 'is-activo' : n < i ? 'is-visto' : ''}"><span class="sr-only">Paso ${n + 1} de ${total}</span></li>`).join('')}</ol>
      <div class="ob-botones">
        ${i > 0 ? '<button class="ob-atras" type="button" data-onboarding-atras>Atrás</button>' : '<button class="ob-atras" type="button" data-onboarding-cerrar>Saltar</button>'}
        <button class="ob-cta" type="button" ${ultimo ? 'data-onboarding-cerrar' : 'data-onboarding-siguiente'}>${ultimo ? 'Empezar a explorar' : 'Siguiente'}</button>
      </div>
    </nav>
    <p class="ob-nota">Puedes volver a ver esto cuando quieras con <strong>Ver tutorial</strong>, arriba a la derecha.</p>
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

async function buildFilters() {
  const tab = state.tab;
  const controls = document.querySelector('.controls');
  const workspace = $('search-workspace');
  const filtersAreRelevant = tab !== 'guardados';
  if (controls) controls.hidden = !filtersAreRelevant;
  if (workspace) workspace.classList.toggle('is-results-only', !filtersAreRelevant);
  if (tab === 'guardados') {
    $('filters').innerHTML = '';
    updateFilterCount();
    return;
  }
  let html = '';
  if (tab !== 'remates') {
    const fc = await fetch(`/api/facets?source=${tab === 'portal' ? 'portal' : 'bancos'}`).then((r) => r.json());
    html += fSelect('city', 'Ciudad', fc.cities);
    if (tab === 'portal') html += fSelect('zone', 'Barrio', fc.zones);
    html += fSelect('type', 'Tipo', fc.types, typeLbl);
    html += `<div class="f"><label for="f-opp">Oportunidad</label><select id="f-opp"><option value="">Todas</option><option value="1">Solo oportunidades</option><option value="high">Solo altas</option></select></div>`;
    html += fRange('price', 'Precio (millones)', 'mín', 'máx');
    html += fRange('area', 'Área (m²)', 'mín', 'máx');
    html += `<div class="f"><label for="f-bedroomsMin">Habitaciones</label><select id="f-bedroomsMin"><option value="">Todas</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></div>`;
    if (tab === 'portal') html += fStratum();
  } else {
    const fc = await fetch('/api/facets?source=portal').then((r) => r.json());
    html += fSelect('city', 'Ciudad', fc.cities);
    const RTYPES = ['apartment', 'house', 'lot', 'office', 'commercial', 'farm', 'parking'];
    html += `<div class="f"><label for="f-type">Tipo</label><select id="f-type"><option value="">Todos</option>${RTYPES.map((t) => `<option value="${t}">${typeLbl(t)}</option>`).join('')}</select></div>`;
    // Demandante: dropdown con TODOS los bancos detectados (pedido del cliente).
    const bk = await fetch('/api/remate-banks').then((r) => r.json()).catch(() => ({ banks: [] }));
    const bankOpts = ['<option value="">Todos los demandantes</option>', '<option value="1">Solo bancos (todos)</option>']
      .concat((bk.banks || []).map((b) => `<option value="${esc(b.name)}">${esc(b.name)} (${b.count})</option>`));
    html += `<div class="f"><label for="f-bank">Demandante (banco)</label><select id="f-bank">${bankOpts.join('')}</select></div>`;
    html += fRange('bid', 'Postura (millones)', 'mín', 'máx');
  }
  html += `<div class="f"><label for="f-order">Orden</label><select id="f-order">${ORDERS[tab].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>`;
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
function fRange(key, label, ph1, ph2) {
  return `<div class="f"><label>${label}</label><div class="f-range">
    <input type="number" id="f-${key}Min" min="0" placeholder="${ph1}" aria-label="${esc(label)} mínimo">
    <input type="number" id="f-${key}Max" min="0" placeholder="${ph2}" aria-label="${esc(label)} máximo"></div></div>`;
}
function fStratum() {
  const opts = [1, 2, 3, 4, 5, 6].map((v) => `<option value="${v}">${v}</option>`).join('');
  return `<div class="f"><label>Estrato</label><div class="f-range">
    <select id="f-stratumMin" aria-label="Estrato mínimo"><option value="">mín</option>${opts}</select>
    <select id="f-stratumMax" aria-label="Estrato máximo"><option value="">máx</option>${opts}</select></div></div>`;
}
async function repopZones(city) {
  const sel = $('f-zone'); if (!sel) return;
  const fc = await fetch(`/api/facets?source=portal${city ? '&city=' + encodeURIComponent(city) : ''}`).then((r) => r.json());
  sel.innerHTML = '<option value="">Todas</option>' + (fc.zones || []).map((z) => `<option value="${esc(z)}">${esc(cap(z))}</option>`).join('');
}
function readFilters() {
  const g = (id) => { const e = $(id); return e && e.value ? e.value : undefined; };
  const M = (id) => { const v = g(id); return v ? String(Math.round(Number(v) * 1e6)) : undefined; }; // millones → COP
  return {
    city: g('f-city'), zone: g('f-zone'), type: g('f-type'),
    priceMin: M('f-priceMin'), priceMax: M('f-priceMax'),
    areaMin: g('f-areaMin'), areaMax: g('f-areaMax'),
    bedroomsMin: g('f-bedroomsMin'), stratumMin: g('f-stratumMin'), stratumMax: g('f-stratumMax'),
    opp: g('f-opp'), order: g('f-order'), bank: g('f-bank'),
    bidMin: M('f-bidMin'), bidMax: M('f-bidMax'),
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
    type: typeof value.type === 'string' ? value.type : '',
  };
}
let radarPreferences = normalizeRadarPreferences(readStoredJson(RADAR_PREFS_KEY, null));
const radarSetupState = {
  open: false,
  step: 1,
  draft: {
    city: radarPreferences.complete ? radarPreferences.city : 'bogota',
    budget: radarPreferences.complete ? radarPreferences.budget : '500',
    type: radarPreferences.complete ? radarPreferences.type : 'apartment',
  },
};
const RADAR_BUDGETS = [
  ['300', 'Hasta $300 millones'],
  ['500', 'Hasta $500 millones'],
  ['800', 'Hasta $800 millones'],
  ['1200', 'Hasta $1.200 millones'],
  ['', 'Sin límite'],
];
const RADAR_TYPES = [
  ['apartment', 'Apartamento'],
  ['house', 'Casa'],
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
  if (state.tab !== 'portal') { root.innerHTML = ''; return; }

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
          ${RADAR_TYPES.map(([value, label]) => `<button class="setup-choice ${value === radarSetupState.draft.type ? 'is-selected' : ''}" type="button" data-setup-field="type" data-setup-value="${esc(value)}" aria-pressed="${value === radarSetupState.draft.type}">${esc(label)}</button>`).join('')}
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
        <h2>${esc(radarTypeLabel(radarPreferences.type))} en ${esc(cap(radarPreferences.city))}</h2>
        <div class="setup-profile">
          <span class="setup-chip">${esc(cap(radarPreferences.city))}</span>
          <span class="setup-chip">${esc(radarBudgetLabel(radarPreferences.budget))}</span>
          <span class="setup-chip">${esc(radarTypeLabel(radarPreferences.type))}</span>
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
async function applyRadarPreferences(preferences, reload = false) {
  if (state.tab !== 'portal' || !preferences.complete) return;
  const city = $('f-city');
  const type = $('f-type');
  const budget = $('f-priceMax');
  if (city && [...city.options].some((option) => option.value === preferences.city)) {
    city.value = preferences.city;
    await repopZones(preferences.city);
  }
  if (type && [...type.options].some((option) => option.value === preferences.type)) type.value = preferences.type;
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
      type: radarPreferences.complete ? radarPreferences.type : 'apartment',
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

async function load(page) {
  if (state.tab === 'guardados') return loadGuardados();
  const loadSeq = ++state.loadSeq;
  state.loading = true;
  state.page = page;
  setResultText('Buscando…');
  renderLoadingSkeletons();
  $('empty').style.display = 'none';
  $('pager').innerHTML = '';

  const f = readFilters();
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
  qs.set('page', String(page));
  qs.set('pageSize', String(PAGE_SIZE));

  let res;
  try {
    // La cabecera NO es opcional: el servidor decide con `planDe(getUserFromToken(...))`
    // qué campos entrega, así que sin ella un suscriptor se identifica como anónimo y
    // recibe todas las fichas bloqueadas por más que haya pagado.
    res = await fetch(`/api/${state.tab}?${qs}`, { headers: authHeaders(), signal: AbortSignal.timeout(25000) }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  } catch (e) {
    if (loadSeq !== state.loadSeq) return;
    console.error('load:', e);
    $('grid').innerHTML = '';
    clearLoadingSkeletons();
    state.loading = false;
    $('empty').style.display = 'block';
    $('empty').innerHTML = emptyState('alert-triangle', 'No se pudo cargar', 'Revisa la conexión y reintenta.', 'warning');
    setResultText('No disponible');
    return;
  }

  if (loadSeq !== state.loadSeq) return;
  $('grid').innerHTML = '';
  renderCards(res.data);
  renderAvisoBloqueo(res.plan, res.bloqueo, res.cupo);
  setResultText(res.total.toLocaleString('es-CO') + ' resultado' + (res.total === 1 ? '' : 's'));
  clearLoadingSkeletons();
  $('empty').style.display = res.total === 0 ? 'block' : 'none';
  renderPager(res.total, res.page, res.pages);
  state.loading = false;
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
function renderAvisoBloqueo(plan, bloqueo, cupo) {
  const caja = $('aviso-bloqueo');
  if (!caja) return;
  if (plan === 'suscrito' || !bloqueo || !bloqueo.bloqueadas) { caja.innerHTML = ''; return; }

  const n = bloqueo.bloqueadas;
  const fichas = `${n} ficha${n === 1 ? '' : 's'}`;
  const medio = bloqueo.descuentoMedioBloqueado;
  const mejor = bloqueo.mejorDescuentoBloqueado;
  const visible = bloqueo.descuentoMedioVisible;

  const anonimo = plan === 'anonimo';
  const sinCupo = !anonimo && cupo && !cupo.ilimitado && cupo.restantes === 0;

  // "que no estás viendo" sería inexacto: las tarjetas sí se ven, bloqueadas. Lo
  // que no puede hacer es abrirlas, y decirlo así es igual de persuasivo y cierto.
  const titulo = anonimo
    ? `Hay ${fichas} que no puedes abrir todavía`
    : sinCupo
      ? `Se te acabó el cupo del mes con ${fichas} todavía cerradas`
      : `Te quedan ${cupo?.restantes ?? 0} de ${cupo?.limite ?? CUPO_FREE_MENSUAL} fichas este mes`;

  const cuerpo = anonimo
    ? `Son las de mayor descuento de esta búsqueda. Crea tu cuenta gratis y abre ${CUPO_FREE_MENSUAL} al mes.`
    : sinCupo
      ? 'Son las de mayor descuento de esta búsqueda. Con el plan completo no hay límite.'
      : `${fichas} de esta búsqueda siguen cerradas. Úsalas en las que más te interesen.`;

  // Las cifras van en su propia franja en vez de dentro de la frase: son el
  // argumento y así se leen de un vistazo, sin partir el párrafo en pedazos.
  const cifras = [];
  if (medio != null) cifras.push([`${medio}%`, 'descuento medio']);
  if (mejor != null && mejor !== medio) cifras.push([`${mejor}%`, 'la mayor']);
  // Solo se compara cuando la comparación favorece de verdad: si lo visible
  // tuviera mejor descuento, enseñarlo sería mentir al revés.
  if (medio != null && visible != null && medio > visible) cifras.push([`${visible}%`, 'las que sí puedes abrir']);
  const cifrasHtml = cifras.length
    ? `<dl class="aviso-cifras">${cifras.map(([v, k], idx) => `<div${idx === cifras.length - 1 && cifras.length > 1 ? ' class="es-contraste"' : ''}><dt>${esc(v)}</dt><dd>${esc(k)}</dd></div>`).join('')}</dl>`
    : '';

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
    $('empty').innerHTML = emptyState('alert-triangle', 'No se pudo cargar', 'Reintenta.', 'warning');
    setResultText('No disponible');
    return;
  }
  $('grid').innerHTML = '';
  renderCards(props);
  setResultText(props.length + ' guardado' + (props.length === 1 ? '' : 's'));
  clearLoadingSkeletons();
  $('empty').style.display = props.length === 0 ? 'block' : 'none';
  if (props.length >= 2) {
    $('pager').innerHTML = '<a class="compare-cta" href="/comparador">Comparar hasta 3 guardados</a>';
  }
  if (props.length === 0) $('empty').innerHTML = emptyState('heart', 'Sin guardados aún', 'Toca el corazón en cualquier inmueble para guardarlo aquí.', 'saved');
}

function renderPager(total, page, pages) {
  const el = $('pager');
  if (total === 0) { el.innerHTML = ''; return; }
  let html = `<div class="pinfo">Página ${page} de ${pages} · ${total.toLocaleString('es-CO')} resultados</div>`;
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
  if (state.tab === 'guardados') return p._kind; // cada guardado trae su kind
  return state.tab === 'remates' ? 'remate' : (state.tab === 'bancos' ? 'banco' : 'portal');
}
function renderCards(items) {
  const frag = document.createDocumentFragment();
  items.forEach((p) => {
    const kind = cardKind(p);
    propertyCache.set(favKey(kind, p.id), p);
    const el = document.createElement('article');
    el.className = 'card';
    const cardLabel = `Ver ${typeLbl(p.property_type || p.type)} en ${cap(p.city)}`;
    el.innerHTML = (kind === 'remate' ? remateCard(p, kind) : inmuebleCard(p, kind))
      + `<button class="card-open" type="button" aria-label="${esc(cardLabel)}"></button>`;
    const openCard = () => (kind === 'remate' ? openRemate(p) : openInmueble(p));
    el.querySelector('.card-open').addEventListener('click', openCard);
    frag.appendChild(el);
  });
  $('grid').appendChild(frag);
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
  const opp = p.is_opportunity
    ? `<span class="opp-badge ${isHighOpp(p) ? 'high' : ''}" title="${esc(comparisonLabel)}" aria-label="${esc(comparisonLabel)}">${ic(isHighOpp(p) ? 'star' : 'down')}${discount != null ? discount + '%' : 'Oportunidad'}</span>`
    : '';
  const ppm2 = p.price_per_m2 ? '$' + Math.round(p.price_per_m2).toLocaleString('es-CO') + '/m²' : '';
  return `
    <div class="card-img-wrap">${cover}<span class="source-badge">${esc(srcLbl(p.source))}</span>${opp}${favBtn(kind, p.id)}${selloSuscripcion(p)}</div>
    <div class="card-body">
      <div class="card-price">${fmtCOP(p.price)}${ppm2 ? `<span class="card-ppm2">${ppm2}</span>` : ''}</div>
      <div class="card-titulo">${esc(typeLbl(p.type))}${p.area_m2 ? ' · ' + fmtArea(p.area_m2) : ''}</div>
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
  const verbo = SIN_CADUCIDAD.includes(p.source) ? 'Verificado' : 'Visto';
  return `<span class="frescura" title="Última vez que el motor confirmó que sigue publicado">${ic('check')}${verbo} ${cuando}</span>`;
}

/**
 * Sello sobre la foto: la ficha existe y se ve el descuento, falta desbloquearla.
 *
 * El texto depende de qué le falta a ESTE usuario, que es lo que el servidor
 * manda en `_acceso.requiere`. Antes decía "Desbloquear con suscripción" a todo
 * el mundo, incluido a quien solo tenía que registrarse: se le pedía pagar por
 * algo que ya podía obtener gratis.
 */
function selloSuscripcion(p) {
  if (!esBloqueada(p)) return '';
  const d = p.discount_pct != null ? Math.round(p.discount_pct) : null;
  const requiere = p._acceso?.requiere;
  const accion = requiere === 'registro' ? 'Crea tu cuenta gratis para verla'
    : requiere === 'cupo' ? 'Ábrela con tu cupo del mes'
    : 'Desbloquear con suscripción';
  return `<div class="lock-overlay">${ic('lock')}<span>${d != null && d >= 20 ? `${d}% bajo ofertas similares` : 'Oportunidad detectada'}</span><em>${accion}</em></div>`;
}

function avisoCuotaParte(p) {
  if (!tieneCuotaParte(p)) return '';
  return `<span class="cuota-badge" title="${TEXTO_CUOTA_PARTE}">${ic('alert')}Solo el ${Number(p.cuota_parte)}% del bien</span>`;
}

function remateCard(p, kind) {
  const cover = p.image_url
    ? `<img src="${esc(safeMediaUrl(p.image_url))}" loading="lazy" alt="${esc(`${typeLbl(p.property_type)} en ${cap(p.city)}`)}">`
    : `<div class="card-ph">${ic('scale')}</div>`;
  return `
    <div class="card-img-wrap">${cover}<span class="source-badge">Remate</span>${countdownBadge(p.auction_date)}${favBtn(kind || 'remate', p.id)}</div>
    <div class="card-body">
      <div class="card-price-label">Postura mínima</div>
      <div class="card-price">${fmtCOP(p.minimum_bid)}</div>
      ${p.appraisal_value ? `<div class="card-sub">Avalúo ${fmtCOP(p.appraisal_value)}${p.minimum_bid_pct ? ` · postura al ${p.minimum_bid_pct}%` : ''}</div>` : ''}
      <div class="card-titulo">${esc(typeLbl(p.property_type))}${avisoCuotaParte(p)}</div>
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
const GASTOS = { notaria: 0.0027, impuesto: 0.01, derechos: 0.005 };
function calcGastos(valor, mode) {
  const lines = [];
  if (mode !== 'remate') lines.push(['Gastos de notaría (comprador ~0,27%)', valor * GASTOS.notaria]);
  lines.push(['Impuesto de registro (1%)', valor * GASTOS.impuesto]);
  lines.push(['Derechos de registro (0,5%)', valor * GASTOS.derechos]);
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
  if (!monthlyRent) return '<span>Ingresa un canon esperado para calcular la rentabilidad.</span>';
  const result = calcRentalYield(acquisitionTotal, monthlyRent, monthlyAdmin);
  return `<div><span>Rentabilidad bruta anual</span><strong>${result.grossYield.toFixed(2)}%</strong></div>
    <div><span>Rentabilidad neta estimada</span><strong>${result.netYield.toFixed(2)}%</strong></div>
    <small>Neto estimado: ${fmtCOP(Math.round(result.annualNet))}/año, descontando 8% de vacancia, 5% de mantenimiento y administración.</small>`;
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
  if (pct && pct <= 70) flags.push(['pos', `Postura al ${pct}% del avalúo → margen estimado de ${100 - pct}% bajo el valor comercial.`]);
  if (f.is_bank_plaintiff) flags.push(['pos', 'Demandante es banco: los procesos hipotecarios suelen tener título limpio y bien documentado.']);
  if (/(remate|venta).{0,20}(del|sobre el)\s*100\s*%/.test(text) && !/proindiviso|cuota parte/.test(text)) flags.push(['pos', 'Se remata el 100% del inmueble (no una cuota parte).']);
  // Riesgo alto (!)
  if (/proindiviso|cuota parte|derechos?\s+(de\s+cuota|herenciales|y\s+acciones)|cuota\s+proindiviso|porcentaje\s+del\s+derecho/.test(text) || p.property_type === 'rights') flags.push(['warn', 'Podría rematarse solo una CUOTA/derechos (no el 100%): confirma qué porcentaje se adjudica.']);
  if (/ocupad|arrendad|poseedor|habitad|inquilino|en posesi/.test(text)) flags.push(['warn', 'El inmueble podría estar ocupado/arrendado: la entrega material puede demorar.']);
  const dias = daysToAuction(p.auction_date);
  if (dias != null && dias >= 0 && dias <= 3) flags.push(['warn', `Audiencia ${dias === 0 ? 'HOY' : 'en ' + dias + ' día(s)'}: poco margen para due diligence y depósito.`]);
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
    <div><span class="l">Cuartil bajo (P25)</span><strong>${COPn(m.p25_total)}</strong></div>
    <div><span class="l">Comparables</span><strong>${m.n}</strong><span class="sub">${tipo}</span></div>
  </div>`;
}
function renderAI(result) {
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
    ? `<div class="ai-estim"><div><span class="l">Valor de mercado estimado</span><strong>${COPn(ai.estimado_mercado_cop)}</strong></div>${ai.descuento_estimado_pct != null ? `<div><span class="l">Descuento estimado</span><strong style="color:${ai.descuento_estimado_pct >= 0 ? '#16a34a' : '#dc2626'}">${ai.descuento_estimado_pct >= 0 ? '−' : '+'}${Math.abs(ai.descuento_estimado_pct)}%</strong></div>` : ''}</div>`
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
      <h4>${ic('magnifier', 'analysis-icon is-review')} Verificar (due diligence)</h4>${li(ai.riesgos_due_diligence)}
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
    if (kind === 'remate') openRemate(data.data);
    else openInmueble(data.data);
    document.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) { /* noop */ }
};
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
    wrap.innerHTML = renderAI(data) + renderRecs(data.recommendations);
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
          <span class="spinner"></span> Estimando el canon con avisos similares de la zona…
        </div>
        <div class="rent-inputs">
          <label>Canon mensual esperado<input class="rent-input" data-rent type="text" inputmode="numeric" placeholder="$ 2.500.000"></label>
          <label>Administración mensual<input class="rent-input" data-admin type="text" inputmode="numeric" placeholder="$ 0"></label>
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
  if (f.antiguedad) feats.push(['Antigüedad', f.antiguedad]);
  if (f.administracion) feats.push(['Admin', fmtCOP(f.administracion) + '/mes']);

  const amen = Array.isArray(f.amenities) && f.amenities.length ? `<div class="section"><h3>Características</h3><div class="amenities">${f.amenities.slice(0, 30).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>` : '';
  const desc = f.description ? `<div class="section"><h3>Descripción</h3><p>${esc(String(f.description).slice(0, 900))}</p></div>` : '';
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
  });

  $('modal-content').innerHTML = `${gallery()}
    <div class="detail">
      <div class="detail-top"><span class="pill-src">${esc(srcLbl(p.source))}</span>${fav}</div>
      <h2>${esc(typeLbl(p.type))} en ${esc(cap(p.city))}</h2>
      <div class="loc">${ic('pin')}${p.zone ? esc(p.zone) + ', ' : ''}<strong>${esc(cap(p.city))}</strong></div>
      <div class="priceblock"><div class="p">${fmtCOP(p.price)}</div><div class="s">${p.price_per_m2 ? '$' + Math.round(p.price_per_m2).toLocaleString('es-CO') + ' por m²' : ''}</div></div>
      <div class="feats">${feats.map(([l, v]) => `<div class="feat"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
      ${mkt || marketLazyBox()}${acquisition}${muro}${aiBlock}${addrBlock}${mapBlock}${descBlock}${amen}
      <a class="cta" href="${esc(safeExternalUrl(p.source_url))}" target="_blank" rel="noopener noreferrer">Ver en ${esc(srcLbl(p.source))} ↗</a>
    </div>`;
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
  return `<div class="section"><div class="muro-sus">
    <div class="muro-cab">${ic('lock')}<strong>${d != null && d >= 20 ? `${d}% bajo ofertas similares` : 'Oportunidad destacada'}</strong></div>
    <p>Ya viste los comparables y el costo estimado. La suscripción desbloquea los datos necesarios para profundizar la evaluación.</p>
    <ul class="muro-lista">
      <li>${ic('lock')} Dirección exacta y ubicación en el mapa</li>
      <li>${ic('lock')} Descripción completa y todas las fotos</li>
      <li>${ic('lock')} Fuente original y datos de contacto</li>
      <li>${ic('lock')} Análisis detallado de la oportunidad</li>
    </ul>
    <a class="wall-cta" href="/login">Desbloquear con suscripción</a>
  </div></div>`;
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
    if (v && v.market_ppm2 != null && v.candidate_ppm2 != null) {
      el.innerHTML = `<h3>Análisis de mercado</h3>${marketBody(v, v.criteria)}`;
    } else {
      el.innerHTML = `<h3>Análisis de mercado</h3><div class="market">${marketCtxHtml(r.market)}
        <p class="market-note">Referencia de precios de OFERTA de ${r.market.n} inmuebles de la zona.
        No se pudo calcular un precio por m² para este inmueble (falta el área), así que no se estima descuento.</p></div>`;
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
    const n = Number(market?.n) || 0;
    status.classList.add('is-empty');
    status.innerHTML = market?.reason === 'source_unavailable'
      ? 'El mercado de arriendos se está preparando. Puedes ingresar tu propio canon para simular.'
      : `Aún no hay suficientes arriendos similares en esta zona (${n} encontrado${n === 1 ? '' : 's'}). Puedes ingresar tu propio canon.`;
    if (origin) origin.textContent = 'Canon ajustable por el usuario';
    return;
  }

  const median = Number(market.median_monthly_rent);
  const low = Number(market.p25_monthly_rent) || median;
  const high = Number(market.p75_monthly_rent) || median;
  const ppm2 = Number(market.median_rent_per_m2) || 0;
  const criteria = Array.isArray(market.criteria) ? market.criteria : [];
  status.classList.remove('is-empty');
  status.innerHTML = `<div class="rent-market-title">
      <span>Canon estimado de mercado</span>
      <strong>${fmtCOP(median)}/mes</strong>
    </div>
    <div class="rent-market-grid">
      <div><span>Rango central</span><strong>${fmtCOP(low)} – ${fmtCOP(high)}</strong></div>
      <div><span>Canon por m²</span><strong>${ppm2 ? `${fmtCOP(ppm2)}/m²` : '—'}</strong></div>
      <div><span>Comparables</span><strong>${Number(market.n) || 0}</strong></div>
      <div><span>Confianza</span><strong>${esc(rentalConfidenceLabel(market.confidence))}</strong></div>
    </div>
    ${criteria.length ? `<div class="crit-chips">${criteria.map((item) => `<span class="crit-chip">${esc(item)}</span>`).join('')}</div>` : ''}
    <p>Referencia basada en precios de oferta, no en contratos cerrados. El canon puede incluir o excluir administración según cada aviso.</p>`;
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
    ? `<div class="section"><h3>Descripción del bien</h3><p class="pub">${esc(String(p.description))}</p></div>`
    : '';
  // Bloqueos para anónimo (freemium). El análisis preliminar (semáforo) y la
  // calculadora quedan visibles como gancho; lo sensible/valioso se bloquea.
  const aiBlock = anon ? lockBox('Análisis con IA', 'Opinión de inversión + comparables del barrio. Regístrate gratis.') : aiSection('remate', p.id);
  const datosBlock = anon ? lockBox('Datos del proceso', 'Demandante, juzgado, radicado, secuestre y más. Regístrate gratis.') : datosHtml;
  const copiaBlock = anon ? (f.copia_publicacion ? lockBox('Copia exacta de la publicación') : '') : copiaHtml;
  const descBlock = anon ? (p.description ? lockBox('Descripción del bien') : '') : descHtml;
  const fav = anon ? '' : modalFavBtn('remate', p.id);

  $('modal-content').innerHTML = `${gallery()}
    <div class="detail">
      <div class="detail-top"><span class="pill-src">${ic('scale')}Remate judicial</span>${fav}</div>
      ${tieneCuotaParte(p) ? `<div class="alerta-legal">${ic('alert')}<div><strong>Se remata solo el ${Number(p.cuota_parte)}% del bien</strong><span>${TEXTO_CUOTA_PARTE}</span></div></div>` : ''}
      <h2>${esc(typeLbl(p.property_type))} en ${esc(cap(p.city))}</h2>
      <div class="loc">${ic('pin')}<strong>${esc(cap(p.city))}</strong>${p.department ? ', ' + esc(cap(p.department)) : ''}</div>
      <div class="priceblock remate">
        <div class="pb-row">
          <div><div class="pb-label">Postura mínima</div><div class="pb-amount">${fmtCOP(p.minimum_bid)}</div></div>
          ${p.appraisal_value ? `<div class="pb-side"><div class="pb-label">Avalúo</div><div class="pb-aval">${fmtCOP(p.appraisal_value)}</div>${pct ? `<div class="pb-pct">postura al ${pct}%</div>` : ''}</div>` : ''}
        </div>
        ${p.auction_date ? `<div class="pb-auction">${ic('calendar')} Audiencia: <strong>${fmtDate(p.auction_date)}</strong>${p.auction_time ? ' · ' + esc(p.auction_time) : ''} ${countdownBadge(p.auction_date)}</div>` : ''}
      </div>
      ${analisisSection(p)}
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
      ${mapSection({ address: null, city: p.city })}
      <p class="src-note">Fuente: Rama Judicial de Colombia · aviso de remate publicado por el juzgado.</p>
    </div>`;
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
    <div><span class="l">Posición</span>${pos}</div>
    <div><span class="l">Comparables</span><strong>${Number(m.n_comparables) || 0}</strong></div>
  </div>${critHtml}<p class="market-note">Precio por m² comparado contra el de ${Number(m.n_comparables) || 0} inmuebles similares de la zona (precios de OFERTA).</p></div>`;
}

function marketSection(p) {
  const m = p.features?.market;
  if (!m || m.market_ppm2 == null) return '';
  // Criterios que el motor REALMENTE aplicó. Solo si la ficha es vieja (evaluada
  // antes de que el motor los guardara) se deducen del nombre del método.
  const crit = Array.isArray(m.criteria) && m.criteria.length ? m.criteria : criteriosComparacion(m.method, m.radius_km);
  // discount_pct de la fila y market.* salen del mismo evaluate() del motor.
  return `<div class="section"><h3>Análisis de mercado</h3>${marketBody({ ...m, discount_pct: p.discount_pct }, crit)}</div>`;
}
function mapSection(p) {
  const f = p.features || {};
  let q;
  if (f.lat != null && f.lng != null) q = f.lat + ',' + f.lng;
  else if (p.address || p.city) q = [p.address, p.city, 'Colombia'].filter(Boolean).join(', ');
  else return '';
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
  if (lastModalFocus?.isConnected) lastModalFocus.focus({ preventScroll: true });
}

// ---------- Stats + leyenda + tabs ----------
let STATS = null;
function renderStatsUnavailable() {
  STATS = null;
  $('c-portal').textContent = '—';
  $('c-bancos').textContent = '—';
  $('c-remates').textContent = '—';
  $('summary').innerHTML = `
    <div class="summary-stat muted">
      <div class="num">Actualizando</div>
      <div class="lbl">Las estadísticas volverán automáticamente; los resultados siguen disponibles.</div>
    </div>`;
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
  $('c-portal').textContent = STATS.portal_total.toLocaleString('es-CO');
  $('c-bancos').textContent = STATS.bancos.toLocaleString('es-CO');
  $('c-remates').textContent = STATS.remates.toLocaleString('es-CO');
  const actualizado = renderActualizado(STATS.frescura);
  $('summary').innerHTML = `
    <div class="summary-stat"><div class="num">${STATS.portal_opps.toLocaleString('es-CO')}</div><div class="lbl">Oportunidades</div></div>
    <div class="summary-stat"><div class="num">${STATS.portal_total.toLocaleString('es-CO')}</div><div class="lbl">Listados portal</div></div>
    <div class="summary-stat"><div class="num">${STATS.bancos.toLocaleString('es-CO')}</div><div class="lbl">En bancos</div></div>
    <div class="summary-stat"><div class="num">${STATS.remates.toLocaleString('es-CO')}</div><div class="lbl">Remates</div></div>
    ${actualizado}`;
  renderVStats();
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
  if (!frescura.degradada) {
    return `<div class="summary-stat muted" title="Última corrida: ${esc(fecha.toLocaleString('es-CO'))}">
      <div class="num">${esc(etiqueta)}</div><div class="lbl">Actualizado</div></div>`;
  }
  return `<div class="summary-stat muted stat-degradada" title="${esc(frescura.motivo || '')}">
    <div class="num">${esc(etiqueta)}</div>
    <div class="lbl">Actualizado · datos atrasados</div></div>`;
}
function renderVStats() {
  if (!STATS) return;
  const v = $('vstats');
  if (state.tab === 'portal') {
    const cities = STATS.perCity.length;
    // El hero ya muestra listados y oportunidades: repetirlos aquí solo resta confianza.
    v.innerHTML = `
      <div class="vstat"><div class="num">${STATS.portal_high.toLocaleString('es-CO')}</div><div class="lbl">Oportunidades altas</div></div>
      <div class="vstat"><div class="num">${cities}</div><div class="lbl">Ciudades cubiertas</div></div>`;
    $('legend').innerHTML = `<details class="legend-card"${mobileQuery.matches ? '' : ' open'}>
      <summary class="legend-title">${ic('chart')} Cómo leer el portal abierto</summary>
      <div class="legend-body">
        <span class="legend-item"><span class="badge-mini high">${ic('star')}Alta</span> precio/m² en el decil más bajo, descuento grande y comparables homogéneos</span>
        <span class="legend-item"><span class="badge-mini opp">${ic('down')}Oportunidad</span> precio/m² en el cuartil más bajo frente a similares de la zona</span>
        <span class="legend-item note">Comparado contra precios de oferta publicados.</span>
      </div>
    </details>`;
  } else if (state.tab === 'guardados') {
    v.innerHTML = `<div class="vstat"><div class="num">${favSet.size}</div><div class="lbl">Inmuebles guardados</div></div>`;
    $('legend').innerHTML = '';
  } else if (state.tab === 'bancos') {
    v.innerHTML = `<div class="vstat"><div class="num">${STATS.bancos.toLocaleString('es-CO')}</div><div class="lbl">Inmuebles bancarios</div></div>`;
    $('legend').innerHTML = '';
  } else {
    v.innerHTML = `<div class="vstat"><div class="num">${STATS.remates.toLocaleString('es-CO')}</div><div class="lbl">Remates activos</div></div>`;
    $('legend').innerHTML = '';
  }
}

document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => b.addEventListener('click', async () => {
  document.querySelectorAll('.tab-btn[data-tab]').forEach((x) => {
    const active = x === b;
    x.classList.toggle('active', active);
    if (active) x.setAttribute('aria-current', 'page');
    else x.removeAttribute('aria-current');
  });
  state.tab = b.dataset.tab;
  renderRadarSetup();
  state.loadSeq++;
  state.loading = false;
  $('grid').innerHTML = '';
  $('pager').innerHTML = '';
  $('empty').style.display = 'none';
  $('loading').style.display = 'block';
  $('filters').innerHTML = '';
  setResultText(`Preparando ${state.tab === 'portal' ? 'el portal' : state.tab}…`);
  setFiltersOpen(false);
  renderVStats();
  try {
    await buildFilters();
    if (state.tab === 'portal') await applyRadarPreferences(radarPreferences);
  } catch (error) {
    console.error('filters:', error);
    $('filters').innerHTML = '<div class="f-note">Los filtros no están disponibles por el momento.</div>';
  }
  renderRadarSetup();
  load(1);
  if (mobileQuery.matches) {
    document.querySelector('.vstats').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}));
$('modal-close').addEventListener('click', closeModal);
$('ver-tutorial').addEventListener('click', abrirOnboarding);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-onboarding-siguiente]')) { avanzarOnboarding(1); return; }
  if (e.target.closest('[data-onboarding-atras]')) { avanzarOnboarding(-1); return; }
  if (e.target.closest('[data-onboarding-cerrar]')) { marcarOnboardingVisto(); closeModal(); }
});
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
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
      if (origin) origin.textContent = 'Canon ajustado por ti';
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
  if (e.key === 'ArrowLeft') { if (enTutorial) avanzarOnboarding(-1); else if (gImgs.length > 1) window.gMove(-1); }
  if (e.key === 'ArrowRight') { if (enTutorial) avanzarOnboarding(1); else if (gImgs.length > 1) window.gMove(1); }
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

// El tutorial se abre solo la primera vez. Va antes de cargar resultados porque
// no depende de ellos, y el fondo bloqueado evita que el usuario empiece a tocar
// filtros con el diálogo abierto. En modo privado `localStorage` puede lanzar: si
// no se puede recordar la visita, es mejor no mostrarlo que mostrarlo siempre.
try {
  if (!localStorage.getItem(ONBOARDING_KEY)) {
    marcarOnboardingVisto();
    abrirOnboarding();
  }
} catch { /* sin almacenamiento no se insiste */ }

// init — las propiedades cargan en PARALELO con las stats (no esperan a stats).
// Tolerante a fallos: si stats o filtros fallan, igual cargan las propiedades.
initAuth();
loadStats().catch(() => renderStatsUnavailable());
buildFilters().then(async () => {
  await applyRadarPreferences(radarPreferences);
  renderRadarSetup();
  load(1);
}, (e) => {
  console.error('filters:', e);
  renderRadarSetup();
  load(1);
});

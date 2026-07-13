/* Radar local — consume /api/* en vivo. Look RadarMVP + paginación numerada. */
'use strict';

const $ = (id) => document.getElementById(id);
const fmtCOP = (n) => (n ? '$' + Number(n).toLocaleString('es-CO') : '—');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const typeLbl = (t) => ({ apartment: 'Apartamento', house: 'Casa', commercial: 'Local', lot: 'Lote', farm: 'Finca', office: 'Oficina', warehouse: 'Bodega', parking: 'Parqueadero', building: 'Edificio', vehicle: 'Vehículo', rights: 'Derechos' }[t] || (t ? cap(t) : 'Inmueble'));
const srcLbl = (s) => ({ davivienda: 'Davivienda', bancolombia: 'Bancolombia', bbva: 'BBVA', aval: 'Aval', fincaraiz: 'FincaRaíz', rematandobienes: 'Remate' }[s] || s);
const srcIcon = (s) => ({ fincaraiz: '🏘', davivienda: '🏛', bbva: '🏛', aval: '🏢', bancolombia: '🏦' }[s] || '🏠');
// Oportunidad ALTA: la marca el motor (decil más barato + descuento grande +
// comparables homogéneos) y viaja en la columna is_high.
const isHighOpp = (d) => d.is_high === true;
const PAGE_SIZE = 24;

const ORDERS = {
  portal: [['discount_desc', 'Mayor descuento'], ['precio_m2_asc', 'Precio/m² menor'], ['precio_asc', 'Precio menor'], ['precio_desc', 'Precio mayor'], ['recent', 'Más recientes']],
  bancos: [['precio_m2_asc', 'Precio/m² menor'], ['precio_asc', 'Precio menor'], ['precio_desc', 'Precio mayor'], ['recent', 'Más recientes']],
  remates: [['auction_asc', 'Audiencia próxima'], ['min_asc', 'Postura menor'], ['min_desc', 'Postura mayor']],
};

const state = { tab: 'portal', page: 1, loading: false };

// ---------- Auth + favoritos ----------
const auth = { token: localStorage.getItem('radar_token') || null, user: null };
const favSet = new Set(); // claves "kind:id"
const favKey = (kind, id) => `${kind}:${id}`;
const authHeaders = () => (auth.token ? { Authorization: `Bearer ${auth.token}` } : {});

async function initAuth() {
  renderAuthBar();
  if (!auth.token) return;
  try {
    const res = await fetch('/api/favorites', { headers: authHeaders() });
    if (res.status === 401) { auth.token = null; localStorage.removeItem('radar_token'); renderAuthBar(); return; }
    const d = await res.json();
    auth.user = d.user || null;
    favSet.clear();
    (d.favorites || []).forEach((f) => favSet.add(favKey(f.kind, f.id)));
  } catch (e) { /* sin red: queda anónimo */ }
  renderAuthBar();
  paintFavs();
}
function renderAuthBar() {
  const el = $('authbar'); if (!el) return;
  if (auth.user) {
    const who = auth.user.name || (auth.user.email || '').split('@')[0];
    el.innerHTML = `<span class="auth-user">👤 ${esc(who)}</span><button class="auth-link" id="auth-logout">Salir</button>`;
    $('auth-logout').addEventListener('click', () => {
      localStorage.removeItem('radar_token'); localStorage.removeItem('radar_refresh'); location.reload();
    });
  } else {
    el.innerHTML = `<a class="auth-link primary" href="/login">Iniciar sesión</a>`;
  }
  updateFavCount();
}
function updateFavCount() { const c = $('c-guardados'); if (c) c.textContent = favSet.size; }
function favBtn(kind, id) {
  const on = favSet.has(favKey(kind, id));
  return `<button class="fav-btn ${on ? 'on' : ''}" data-fav="${favKey(kind, id)}" title="Guardar" aria-label="Guardar" onclick="window.__toggleFav(event,'${kind}','${id}')">${on ? '♥' : '♡'}</button>`;
}
function modalFavBtn(kind, id) {
  const on = favSet.has(favKey(kind, id));
  return `<button class="modal-fav fav-btn ${on ? 'on' : ''}" data-fav="${favKey(kind, id)}" onclick="window.__toggleFav(event,'${kind}','${id}')">${on ? '♥ Guardado' : '♡ Guardar'}</button>`;
}
function paintFavs() {
  document.querySelectorAll('.fav-btn[data-fav]').forEach((b) => {
    const on = favSet.has(b.dataset.fav);
    b.classList.toggle('on', on);
    if (b.classList.contains('modal-fav')) b.textContent = on ? '♥ Guardado' : '♡ Guardar';
    else b.textContent = on ? '♥' : '♡';
  });
}
window.__toggleFav = async function (ev, kind, id) {
  ev.stopPropagation(); ev.preventDefault();
  if (!auth.token) { location.href = '/login'; return; }
  const k = favKey(kind, id);
  const wasOn = favSet.has(k);
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
/** ¿Puede abrirse la ficha? Si el anónimo superó el cupo, muestra el muro y devuelve false. */
function gateFicha(id) {
  if (auth.token) return true;            // registrado → sin límite
  const s = viewedIds();
  if (s.has(id)) return true;             // re-ver una ya vista no consume cupo
  if (s.size >= FREE_VIEW_LIMIT) { showRegisterWall(s.size); return false; }
  recordView(id);
  return true;
}
function lockBox(label, sub) {
  return `<div class="section"><div class="lockbox" onclick="location.href='/login'" role="button" tabindex="0">
    <span class="lock-ic">🔒</span>
    <div class="lock-txt"><strong>${label}</strong><span>${sub || 'Regístrate gratis para verlo'}</span></div>
    <span class="lock-cta">Desbloquear</span>
  </div></div>`;
}
function showRegisterWall(count) {
  gImgs = [];
  $('modal-content').innerHTML = `<div class="wall">
    <div class="wall-ic">🔒</div>
    <h2>Ya viste ${count} oportunidades</h2>
    <p>Regístrate <strong>gratis</strong> para seguir viendo todas las propiedades, su dirección exacta,
       el análisis con IA y para guardar tus favoritas.</p>
    <a class="wall-cta" href="/login">Crear cuenta gratis</a>
    <a class="wall-alt" href="/login">Ya tengo cuenta · Iniciar sesión</a>
  </div>`;
  showModal();
}

// ---------- Filtros ----------
async function buildFilters() {
  const tab = state.tab;
  if (tab === 'guardados') { $('filters').innerHTML = '<div class="f-note">Tus inmuebles guardados ♥</div>'; return; }
  let html = '';
  if (tab !== 'remates') {
    const fc = await fetch(`/api/facets?source=${tab === 'portal' ? 'portal' : 'bancos'}`).then((r) => r.json());
    html += fSelect('city', 'Ciudad', fc.cities);
    if (tab === 'portal') html += fSelect('zone', 'Barrio', fc.zones);
    html += fSelect('type', 'Tipo', fc.types, typeLbl);
    html += `<div class="f"><label>Oportunidad</label><select id="f-opp"><option value="">Todas</option><option value="1">Solo oportunidades</option><option value="high">Solo altas</option></select></div>`;
    html += fRange('price', 'Precio (millones)', 'mín', 'máx');
    html += fRange('area', 'Área (m²)', 'mín', 'máx');
    html += `<div class="f"><label>Habitaciones</label><select id="f-bedroomsMin"><option value="">Todas</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></div>`;
    html += fStratum();
  } else {
    const fc = await fetch('/api/facets?source=portal').then((r) => r.json());
    html += fSelect('city', 'Ciudad', fc.cities);
    const RTYPES = ['apartment', 'house', 'lot', 'office', 'commercial', 'farm', 'parking'];
    html += `<div class="f"><label>Tipo</label><select id="f-type"><option value="">Todos</option>${RTYPES.map((t) => `<option value="${t}">${typeLbl(t)}</option>`).join('')}</select></div>`;
    // Demandante: dropdown con TODOS los bancos detectados (pedido del cliente).
    const bk = await fetch('/api/remate-banks').then((r) => r.json()).catch(() => ({ banks: [] }));
    const bankOpts = ['<option value="">Todos los demandantes</option>', '<option value="1">🏦 Solo bancos (todos)</option>']
      .concat((bk.banks || []).map((b) => `<option value="${esc(b.name)}">${esc(b.name)} (${b.count})</option>`));
    html += `<div class="f"><label>Demandante (banco)</label><select id="f-bank">${bankOpts.join('')}</select></div>`;
    html += fRange('bid', 'Postura (millones)', 'mín', 'máx');
  }
  html += `<div class="f"><label>Orden</label><select id="f-order">${ORDERS[tab].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>`;
  $('filters').innerHTML = html;

  $('filters').querySelectorAll('select, input').forEach((el) => {
    const ev = el.tagName === 'INPUT' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      if (el.id === 'f-city' && tab === 'portal') repopZones(el.value);
      load(1);
    });
  });
}
function fSelect(key, label, values, fmt) {
  const opts = ['<option value="">Todas</option>'].concat((values || []).map((v) => `<option value="${v}">${fmt ? fmt(v) : cap(v)}</option>`));
  return `<div class="f"><label>${label}</label><select id="f-${key}">${opts.join('')}</select></div>`;
}
function fRange(key, label, ph1, ph2) {
  return `<div class="f"><label>${label}</label><div class="f-range">
    <input type="number" id="f-${key}Min" min="0" placeholder="${ph1}">
    <input type="number" id="f-${key}Max" min="0" placeholder="${ph2}"></div></div>`;
}
function fStratum() {
  const opts = [1, 2, 3, 4, 5, 6].map((v) => `<option value="${v}">${v}</option>`).join('');
  return `<div class="f"><label>Estrato</label><div class="f-range">
    <select id="f-stratumMin"><option value="">mín</option>${opts}</select>
    <select id="f-stratumMax"><option value="">máx</option>${opts}</select></div></div>`;
}
async function repopZones(city) {
  const sel = $('f-zone'); if (!sel) return;
  const fc = await fetch(`/api/facets?source=portal${city ? '&city=' + encodeURIComponent(city) : ''}`).then((r) => r.json());
  sel.innerHTML = '<option value="">Todas</option>' + (fc.zones || []).map((z) => `<option value="${z}">${cap(z)}</option>`).join('');
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
$('clear').addEventListener('click', () => buildFilters().then(() => load(1)));

// ---------- Carga (paginación numerada) ----------
async function load(page) {
  if (state.tab === 'guardados') return loadGuardados();
  if (state.loading) return;
  state.loading = true;
  state.page = page;
  $('grid').innerHTML = '';
  $('loading').style.display = 'block';
  $('empty').style.display = 'none';
  $('pager').innerHTML = '';

  const f = readFilters();
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
  qs.set('page', String(page));
  qs.set('pageSize', String(PAGE_SIZE));

  let res;
  try {
    res = await fetch(`/api/${state.tab}?${qs}`, { signal: AbortSignal.timeout(25000) }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  } catch (e) {
    console.error('load:', e);
    $('loading').style.display = 'none'; state.loading = false;
    $('empty').style.display = 'block';
    $('empty').innerHTML = '<div class="h">No se pudo cargar</div><div>Revisa la conexión y reintenta.</div>';
    return;
  }

  $('grid').innerHTML = '';
  renderCards(res.data);
  $('count').textContent = res.total.toLocaleString('es-CO') + ' resultado' + (res.total === 1 ? '' : 's');
  $('loading').style.display = 'none';
  $('empty').style.display = res.total === 0 ? 'block' : 'none';
  renderPager(res.total, res.page, res.pages);
  state.loading = false;
}

async function loadGuardados() {
  $('grid').innerHTML = '';
  $('pager').innerHTML = '';
  $('empty').style.display = 'none';
  $('loading').style.display = 'block';
  if (!auth.token) {
    $('loading').style.display = 'none';
    $('count').textContent = '—';
    $('empty').style.display = 'block';
    $('empty').innerHTML = '<div class="h">Inicia sesión para guardar</div><div>Crea tu cuenta gratis y guarda inmuebles con el ♥. <a href="/login">Iniciar sesión →</a></div>';
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
    $('loading').style.display = 'none';
    $('empty').style.display = 'block';
    $('empty').innerHTML = '<div class="h">No se pudo cargar</div><div>Reintenta.</div>';
    return;
  }
  renderCards(props);
  $('count').textContent = props.length + ' guardado' + (props.length === 1 ? '' : 's');
  $('loading').style.display = 'none';
  $('empty').style.display = props.length === 0 ? 'block' : 'none';
  if (props.length === 0) $('empty').innerHTML = '<div class="h">Sin guardados aún</div><div>Toca el ♥ en cualquier inmueble para guardarlo aquí.</div>';
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
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = kind === 'remate' ? remateCard(p, kind) : inmuebleCard(p, kind);
    el.addEventListener('click', () => (kind === 'remate' ? openRemate(p) : openInmueble(p)));
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
      ? `<img src="${imgs[0]}" loading="lazy" onerror="window.__cardFallback(this.parentElement,'${p.source}','${p.type || ''}')">`
      : `<div class="card-ph">${srcIcon(p.source)}</div>`;
  const opp = p.is_opportunity ? `<span class="opp-badge ${isHighOpp(p) ? 'high' : ''}">${isHighOpp(p) ? '★ ' : '▼ '}${p.discount_pct != null ? Math.round(p.discount_pct) + '%' : 'OPORTUNIDAD'}</span>` : '';
  const ppm2 = p.price_per_m2 ? '$' + Math.round(p.price_per_m2).toLocaleString('es-CO') + ' / m²' : '—';
  return `
    <div class="card-img-wrap">${cover}<span class="source-badge">${srcLbl(p.source)}</span>${opp}${favBtn(kind, p.id)}</div>
    <div class="card-header"><div class="card-price">${fmtCOP(p.price)}</div><div class="card-price-sub">${ppm2}</div></div>
    <div class="card-body">
      <div class="card-titulo">${typeLbl(p.type)}${p.area_m2 ? ' · ' + fmtArea(p.area_m2) : ''}</div>
      <div class="card-ubic">📍 ${p.zone ? p.zone + ' · ' : ''}<strong>${cap(p.city)}</strong></div>
      <div class="card-meta">
        ${f.bedrooms ? `<span>🛏 ${f.bedrooms}</span>` : ''}
        ${f.bathrooms ? `<span>🛁 ${f.bathrooms}</span>` : ''}
        ${f.garages ? `<span>🚗 ${f.garages}</span>` : ''}
        ${f.stratum ? `<span class="e">Estrato ${f.stratum}</span>` : ''}
      </div>
    </div>
    <div class="card-cta">VER DETALLE COMPLETO →</div>`;
}

function remateCard(p, kind) {
  const cover = p.image_url ? `<img src="${p.image_url}" loading="lazy">` : `<div class="card-ph">⚖️</div>`;
  return `
    <div class="card-img-wrap">${cover}<span class="source-badge">Remate</span>${countdownBadge(p.auction_date)}${favBtn(kind || 'remate', p.id)}</div>
    <div class="card-header">
      <div class="card-price-label">Postura mínima</div>
      <div class="card-price big">${fmtCOP(p.minimum_bid)}</div>
      <div class="card-price-sub">${p.appraisal_value ? 'Avalúo ' + fmtCOP(p.appraisal_value) + (p.minimum_bid_pct ? ' · postura al ' + p.minimum_bid_pct + '%' : '') : ''}</div>
    </div>
    <div class="card-body">
      <div class="card-titulo">${typeLbl(p.property_type)}</div>
      <div class="card-ubic">📍 <strong>${cap(p.city)}</strong>${p.department ? ', ' + cap(p.department) : ''}</div>
      <div class="card-meta">${p.auction_date ? `<span>📅 ${fmtDate(p.auction_date)}</span>` : ''}${p.auction_mode ? `<span class="e">${cap(p.auction_mode)}</span>` : ''}</div>
    </div>
    <div class="card-cta">VER DETALLE COMPLETO →</div>`;
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
  if (d === 1) return '<span class="countdown soon">⏰ Mañana</span>';
  if (d <= 7) return `<span class="countdown soon">⏰ En ${d} días</span>`;
  return `<span class="countdown">📅 En ${d} días</span>`;
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
  const tot = `Total estimado: <strong>${fmtCOP(Math.round(total))}</strong> <span>(~${pct.toFixed(1)}% del valor)</span>`;
  return { rows, tot };
}
window.__recalcGastos = function (input) {
  const calc = input.closest('.calc');
  const valor = Number((input.value || '').replace(/[^0-9]/g, '')) || 0;
  const { rows, tot } = renderCalc(valor, calc.dataset.mode);
  calc.querySelector('.calc-rows').innerHTML = rows;
  calc.querySelector('.calc-total').innerHTML = tot;
};
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
  const meta = { buena: ['🟢', 'Oportunidad atractiva'], media: ['🟡', 'Requiere revisión'], precaucion: ['🟠', 'Revisar con cuidado'] }[nivel];
  const icon = { pos: '✅', warn: '⚠️', neg: '🔎' };
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
    <div class="ai-wrap" id="ai-wrap-${id}">
      <button class="ai-btn" onclick="window.__analyzeAI(this,'${kind}','${id}')">🤖 Analizar esta oportunidad con IA</button>
      <p class="ai-hint">Compara contra el mercado de la zona (FincaRaíz) y da una opinión preliminar de inversión.</p>
    </div></div>`;
}
const COPn = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO'));
function marketCtxHtml(m) {
  if (!m || !m.n) return '';
  const tipo = m.matched_type ? `mismo tipo` : `todos los tipos`;
  const conf = { high: 'Alta', medium: 'Media', low: 'Baja', insufficient: 'Insuficiente' }[m.confidence] || m.confidence;
  const scopeIcon = m.scope === 'ciudad' ? '🏙️' : '📍';
  const scopeLbl = m.scope === 'ciudad' ? `${cap(m.city)} · toda la ciudad` : esc(m.scope_label || 'sector');
  const crit = (m.criteria || []).length
    ? `<div class="crit-chips" style="margin-bottom:10px">${m.criteria.map((c) => `<span class="crit-chip">${esc(c)}</span>`).join('')}</div>`
    : '';
  return `<div class="ai-scope">${scopeIcon} Comparado contra <strong>${scopeLbl}</strong></div>
  ${crit}
  <div class="ai-mkt">
    <div><span class="l">Mediana de mercado</span><strong>${COPn(m.median_total)}</strong>${m.median_ppm2 ? `<span class="sub">${COPn(m.median_ppm2)}/m²</span>` : ''}</div>
    <div><span class="l">Cuartil bajo (P25)</span><strong>${COPn(m.p25_total)}</strong></div>
    <div><span class="l">Comparables</span><strong>${m.n}</strong><span class="sub">${tipo} · confianza ${conf}</span></div>
  </div>`;
}
function renderAI(result) {
  const m = result.market;
  if (!result.ok) {
    if (result.needs_key) {
      return `${marketCtxHtml(m)}<div class="ai-note">⚠️ La opinión con IA aún no está activa: falta configurar la clave de OpenAI en el servidor. Arriba ves los comparables de mercado de la zona.</div>`;
    }
    return `${marketCtxHtml(m)}<div class="ai-note">No se pudo generar el análisis: ${esc(result.error || 'error')}.</div>`;
  }
  const ai = result.ai;
  const meta = { atractiva: ['🟢', 'Atractiva', 'ai-buena'], neutral: ['🟡', 'Neutral', 'ai-media'], riesgosa: ['🟠', 'Riesgosa', 'ai-precaucion'] }[ai.veredicto] || ['🟡', ai.veredicto, 'ai-media'];
  const li = (arr) => (arr && arr.length ? `<ul class="ai-list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="ai-empty">—</p>');
  const estim = ai.estimado_mercado_cop != null
    ? `<div class="ai-estim"><div><span class="l">Valor de mercado estimado</span><strong>${COPn(ai.estimado_mercado_cop)}</strong></div>${ai.descuento_estimado_pct != null ? `<div><span class="l">Descuento estimado</span><strong style="color:${ai.descuento_estimado_pct >= 0 ? '#16a34a' : '#dc2626'}">${ai.descuento_estimado_pct >= 0 ? '−' : '+'}${Math.abs(ai.descuento_estimado_pct)}%</strong></div>` : ''}</div>`
    : '';
  return `<div class="aiblock ${meta[2]}">
      <div class="ai-head">${meta[0]} <strong>${meta[1]}</strong> <span class="ai-score">${ai.puntaje}/100</span></div>
      <p class="ai-resumen">${esc(ai.resumen)}</p>
      ${estim}
      ${marketCtxHtml(m)}
      <div class="ai-cols">
        <div><h4>✅ A favor</h4>${li(ai.a_favor)}</div>
        <div><h4>⚠️ En contra</h4>${li(ai.en_contra)}</div>
      </div>
      <h4>🔎 Verificar (due diligence)</h4>${li(ai.riesgos_due_diligence)}
      <p class="ai-reco"><strong>Recomendación:</strong> ${esc(ai.recomendacion)}</p>
      <p class="ai-meta">Generado por IA (${esc(ai._meta?.model || 'modelo')}) · ${ai._meta?.comparables_n ?? m?.n ?? 0} comparables · confianza ${esc(ai._meta?.confidence || m?.confidence || '')}${result.cached ? ' · cacheado' : ''}. Opinión orientativa; no sustituye estudio de títulos ni asesoría profesional.</p>
    </div>`;
}
// Recomendaciones: otras oportunidades en la misma ciudad (cruzando fuentes).
const RKIND = { portal: ['🏠', 'Portal'], banco: ['🏦', 'Banco'], remate: ['⚖️', 'Remate'] };
function recCard(r) {
  const k = RKIND[r.kind] || ['🏠', r.kind];
  const img = r.image
    ? `<img src="${r.image}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;rec-ph&quot;>${k[0]}</div>'">`
    : `<div class="rec-ph">${k[0]}</div>`;
  const disc = r.discount_pct != null ? `${Math.round(r.discount_pct)}% ${r.metric_label}` : '';
  const star = r.same_type ? ' · mismo tipo' : '';
  const zoneBadge = r.same_zone ? '<span class="rec-zone">📍 mismo barrio</span>' : '';
  const loc = `${r.zone ? esc(r.zone) + ', ' : ''}${cap(r.city)}`;
  return `<button class="rec-card" onclick="window.__openRec('${r.kind}','${r.id}')">
    <div class="rec-img">${img}<span class="rec-disc">−${Math.round(r.discount_pct || 0)}%</span>${zoneBadge}</div>
    <div class="rec-body">
      <div class="rec-kind">${k[0]} ${k[1]}${star}</div>
      <div class="rec-type">${typeLbl(r.type)} · ${loc}</div>
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
    const res = await fetch(`/api/property?kind=${kind}&id=${id}`);
    const data = await res.json();
    if (!data.ok) return;
    if (kind === 'remate') openRemate(data.data);
    else openInmueble(data.data);
    document.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) { /* noop */ }
};
window.__analyzeAI = async function (btn, kind, id) {
  const wrap = document.getElementById('ai-wrap-' + id);
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

function gastosSection(valor, mode) {
  if (!valor || valor <= 0) return '';
  const { rows, tot } = renderCalc(valor, mode);
  const titulo = mode === 'remate' ? 'Calculadora de gastos (registro de la adjudicación)' : 'Calculadora de gastos de compra';
  return `<div class="section"><h3>${titulo}</h3>
    <div class="calc" data-mode="${mode || 'compra'}">
      <label class="calc-label">Valor base (editable)</label>
      <input class="calc-input" type="text" inputmode="numeric" value="${fmtCOP(valor)}" oninput="window.__recalcGastos(this)">
      <div class="calc-rows">${rows}</div>
      <div class="calc-total">${tot}</div>
      <p class="calc-note">Estimado de gastos en Colombia${mode === 'remate' ? ' (en remates no hay escritura notarial; el auto de adjudicación se registra)' : ''}. Varía por departamento; no incluye honorarios, hipoteca ni intermediación.</p>
    </div></div>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}
// Placeholder branded para activos de banco sin foto real (Aval/AV Villas vienen de PDF).
function bankPlaceholder(p) {
  return `<div class="bank-ph"><div class="bank-ph-icon">${srcIcon(p.source)}</div><div class="bank-ph-label">Activo de banco</div><div class="bank-ph-type">${typeLbl(p.type)}</div></div>`;
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

  const amen = Array.isArray(f.amenities) && f.amenities.length ? `<div class="section"><h3>Características</h3><div class="amenities">${f.amenities.slice(0, 30).map((x) => `<span class="chip">${x}</span>`).join('')}</div></div>` : '';
  const desc = f.description ? `<div class="section"><h3>Descripción</h3><p>${esc(String(f.description).slice(0, 900))}</p></div>` : '';
  const addr = p.address ? `<div class="section"><h3>Dirección</h3><p>${esc(p.address)}</p></div>` : '';
  // Bloqueos para anónimo (freemium)
  const aiBlock = anon ? lockBox('Análisis con IA', 'Compáralo contra el mercado del barrio. Regístrate gratis.') : aiSection('banco', p.id);
  const addrBlock = anon ? (p.address ? lockBox('Dirección exacta') : '') : addr;
  const mapBlock = anon ? '' : mapSection(p);
  const descBlock = anon ? (f.description ? lockBox('Descripción completa') : '') : desc;
  const fav = anon ? '' : modalFavBtn(p.source === 'fincaraiz' ? 'portal' : 'banco', p.id);
  const mkt = marketSection(p);

  $('modal-content').innerHTML = `${gallery()}
    <div class="detail">
      <div class="detail-top"><span class="pill-src">${srcLbl(p.source)}</span>${fav}</div>
      <h2>${typeLbl(p.type)} en ${cap(p.city)}</h2>
      <div class="loc">📍 ${p.zone ? p.zone + ', ' : ''}<strong>${cap(p.city)}</strong></div>
      <div class="priceblock"><div class="p">${fmtCOP(p.price)}</div><div class="s">${p.price_per_m2 ? '$' + Math.round(p.price_per_m2).toLocaleString('es-CO') + ' por m²' : ''}</div></div>
      <div class="feats">${feats.map(([l, v]) => `<div class="feat"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      ${mkt || marketLazyBox()}${aiBlock}${gastosSection(p.price, 'compra')}${addrBlock}${mapBlock}${descBlock}${amen}
      <a class="cta" href="${p.source_url}" target="_blank" rel="noopener">Ver en ${srcLbl(p.source)} ↗</a>
    </div>`;
  showModal();
  // El motor sólo persiste el mercado en fichas de banco; en las del portal se
  // calcula bajo demanda (gratis, sin IA) para justificar el −X% de la tarjeta.
  if (!mkt) fillMarketLazy(p.source === 'fincaraiz' ? 'portal' : 'banco', p.id, p.discount_pct);
}

// Ficha abierta actualmente: si el usuario abre otra mientras el mercado carga, la
// respuesta vieja llega tarde y no debe pintarse sobre la ficha nueva.
let gFichaSeq = 0;

function marketLazyBox() {
  return `<div class="section" id="mkt-lazy"><h3>Análisis de mercado</h3>
    <div class="market"><p class="market-note">Comparando contra inmuebles similares de la zona…</p></div></div>`;
}
async function fillMarketLazy(kind, id, disc) {
  const box = $('mkt-lazy');
  if (!box) return;
  const seq = ++gFichaSeq;
  try {
    const r = await fetch(`/api/market?kind=${kind}&id=${encodeURIComponent(id)}`).then((x) => x.json());
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
      <button class="ai-btn" onclick="window.__retryMarket('${kind}','${id}',${disc == null ? 'null' : disc})">Reintentar</button></div>`;
  }
}
window.__retryMarket = (kind, id, disc) => {
  const el = $('mkt-lazy');
  if (el) el.innerHTML = '<h3>Análisis de mercado</h3><div class="market"><p class="market-note">Comparando contra inmuebles similares de la zona…</p></div>';
  gFichaSeq--; // fillMarketLazy vuelve a incrementarlo: este reintento sigue siendo la ficha vigente
  fillMarketLazy(kind, id, disc);
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
  if (hasData(p.plaintiff)) datos.push(['Demandante', esc(p.plaintiff) + (f.bank_name ? ` <span class="bank-tag">🏦 ${esc(f.bank_name)}</span>` : '')]);
  if (hasData(p.defendant)) datos.push(['Demandado', esc(p.defendant)]);
  if (hasData(p.court)) datos.push(['Juzgado', esc(p.court)]);
  if (hasData(p.case_number)) datos.push(['Radicado del proceso', esc(p.case_number)]);
  if (hasData(p.trustee)) datos.push(['Secuestre', esc(p.trustee).replace(/^secuestre:?\s*/i, '')]);
  if (hasData(p.matricula_inmobiliaria)) datos.push(['Matrícula inmobiliaria', esc(p.matricula_inmobiliaria)]);
  if (p.deposit_pct) datos.push(['Depósito para participar', p.deposit_pct + '%']);
  const datosHtml = datos.length
    ? `<div class="section"><h3>Datos del proceso</h3><div class="kv">${datos.map(([k, v]) => `<div class="kv-k">${k}</div><div class="kv-v">${v}</div>`).join('')}</div></div>`
    : '';
  // Copia exacta de la publicación (texto oficial completo) tras un botón (pedido del cliente).
  const copiaHtml = f.copia_publicacion
    ? `<div class="section"><h3>Publicación oficial</h3>
        <button class="pub-toggle" onclick="const d=this.nextElementSibling;d.classList.toggle('open');this.textContent=d.classList.contains('open')?'▲ Ocultar copia exacta':'📄 Ver copia exacta de la publicación';">📄 Ver copia exacta de la publicación</button>
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
      <div class="detail-top"><span class="pill-src">⚖️ Remate judicial</span>${fav}</div>
      <h2>${typeLbl(p.property_type)} en ${cap(p.city)}</h2>
      <div class="loc">📍 <strong>${cap(p.city)}</strong>${p.department ? ', ' + cap(p.department) : ''}</div>
      <div class="priceblock remate">
        <div class="pb-row">
          <div><div class="pb-label">Postura mínima</div><div class="pb-amount">${fmtCOP(p.minimum_bid)}</div></div>
          ${p.appraisal_value ? `<div class="pb-side"><div class="pb-label">Avalúo</div><div class="pb-aval">${fmtCOP(p.appraisal_value)}</div>${pct ? `<div class="pb-pct">postura al ${pct}%</div>` : ''}</div>` : ''}
        </div>
        ${p.auction_date ? `<div class="pb-auction">📅 Audiencia: <strong>${fmtDate(p.auction_date)}</strong>${p.auction_time ? ' · ' + p.auction_time : ''} ${countdownBadge(p.auction_date)}</div>` : ''}
      </div>
      ${analisisSection(p)}
      ${aiBlock}
      ${datosBlock}
      ${gastosSection(p.minimum_bid, 'remate')}
      ${descBlock}
      ${copiaBlock}
      ${mapSection({ address: null, city: p.city })}
      <a class="src-link" href="${p.source_url}" target="_blank" rel="noopener">Fuente: rematandobienes.com ↗</a>
    </div>`;
  showModal();
}
const esc = (s) => String(s).replace(/[<>]/g, (c) => ({ '<': '&lt;', '>': '&gt;' }[c]));

function gallery() {
  if (!gImgs.length) return `<div class="gallery"><div class="gallery-main"><div class="card-ph" style="font-size:5rem;">🏠</div></div></div>`;
  return `<div class="gallery"><div class="gallery-main" id="gmain"></div>
    ${gImgs.length > 1 ? `<button class="gnav prev" onclick="gMove(-1)">‹</button><button class="gnav next" onclick="gMove(1)">›</button><div class="gcounter" id="gcount"></div><div class="gthumbs" id="gthumbs"></div>` : ''}</div>`;
}
function gRender() {
  const m = $('gmain'); if (!m) return;
  m.innerHTML = `<img src="${gImgs[gIdx]}" alt="foto">`;
  if ($('gcount')) $('gcount').textContent = `${gIdx + 1} / ${gImgs.length}`;
  const t = $('gthumbs');
  if (t && !t.dataset.built) {
    t.innerHTML = gImgs.map((u, i) => `<div class="gthumb ${i === 0 ? 'active' : ''}" data-i="${i}"><img src="${u}" loading="lazy"></div>`).join('');
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
    <div><span class="l">Comparables</span><strong>${m.n_comparables}</strong><span class="sub">confianza ${conf}</span></div>
  </div>${critHtml}<p class="market-note">Precio por m² comparado contra el de ${m.n_comparables} inmuebles similares de la zona (precios de OFERTA). Señal de cribado, no un avalúo.</p></div>`;
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
function showModal() { $('modal').classList.add('open'); document.body.style.overflow = 'hidden'; if (gImgs.length) gRender(); }
function closeModal() { $('modal').classList.remove('open'); document.body.style.overflow = ''; }

// ---------- Stats + leyenda + tabs ----------
let STATS = null;
async function loadStats() {
  STATS = await fetch('/api/stats').then((r) => r.json());
  $('c-portal').textContent = STATS.portal_total.toLocaleString('es-CO');
  $('c-bancos').textContent = STATS.bancos.toLocaleString('es-CO');
  $('c-remates').textContent = STATS.remates.toLocaleString('es-CO');
  const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  $('summary').innerHTML = `
    <div class="summary-stat"><div class="num">${STATS.portal_opps.toLocaleString('es-CO')}</div><div class="lbl">Oportunidades</div></div>
    <div class="summary-stat"><div class="num">${STATS.portal_total.toLocaleString('es-CO')}</div><div class="lbl">Listados portal</div></div>
    <div class="summary-stat"><div class="num">${STATS.bancos.toLocaleString('es-CO')}</div><div class="lbl">En bancos</div></div>
    <div class="summary-stat"><div class="num">${STATS.remates.toLocaleString('es-CO')}</div><div class="lbl">Remates</div></div>
    <div class="summary-stat muted"><div class="num">${hoy}</div><div class="lbl">Actualizado</div></div>`;
  renderVStats();
}
function renderVStats() {
  if (!STATS) return;
  const v = $('vstats');
  if (state.tab === 'portal') {
    const cities = STATS.perCity.length;
    v.innerHTML = `
      <div class="vstat"><div class="num">${STATS.portal_total.toLocaleString('es-CO')}</div><div class="lbl">Listados</div></div>
      <div class="vstat"><div class="num">${STATS.portal_opps.toLocaleString('es-CO')}</div><div class="lbl">Oportunidades</div></div>
      <div class="vstat"><div class="num">${STATS.portal_high.toLocaleString('es-CO')}</div><div class="lbl">Oport. altas</div></div>
      <div class="vstat"><div class="num">${cities}</div><div class="lbl">Ciudades</div></div>`;
    $('legend').innerHTML = `<div class="legend-card">
      <span class="legend-title">🏘 Cómo leer el portal abierto</span>
      <span class="legend-item"><span class="badge-mini high">★ Alta</span> precio/m² en el decil más bajo + descuento grande + alta confianza</span>
      <span class="legend-item"><span class="badge-mini opp">▼ Oportunidad</span> precio/m² en el cuartil más bajo frente a similares de la zona</span>
      <span class="legend-item" style="opacity:0.7">Señal de cribado sobre precios de oferta, no avalúo.</span></div>`;
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

document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', async () => {
  document.querySelectorAll('.tab-btn').forEach((x) => x.classList.toggle('active', x === b));
  state.tab = b.dataset.tab;
  renderVStats();
  await buildFilters();
  load(1);
}));
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (!$('modal').classList.contains('open')) return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowLeft' && gImgs.length > 1) window.gMove(-1);
  if (e.key === 'ArrowRight' && gImgs.length > 1) window.gMove(1);
});

// init — las propiedades cargan en PARALELO con las stats (no esperan a stats).
// Tolerante a fallos: si stats o filtros fallan, igual cargan las propiedades.
initAuth();
loadStats().catch((e) => console.error('stats:', e));
buildFilters().then(() => load(1), (e) => { console.error('filters:', e); load(1); });

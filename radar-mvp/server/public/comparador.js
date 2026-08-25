'use strict';

const token = localStorage.getItem('radar_token');
let properties = [];
const selected = new Set();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
/**
 * La foto de la ficha, o el marcador de posición.
 *
 * Duplica `safeMediaUrl` de `app.js` a propósito: el comparador es una página
 * aparte que no carga `app.js`, e importarlo entero por una función traería toda
 * la aplicación a una pantalla que solo pinta una tabla. Lo que no se puede es
 * saltarse el saneado —una `image_url` viene de un scraper, y sin comprobar el
 * protocolo un `javascript:` acabaría dentro de un atributo `src`—.
 *
 * Devuelve el marcador también cuando la ficha está bloqueada y llega sin imagen:
 * la tabla debe verse igual de completa aunque falte el dato.
 */
function safeMediaUrl(url) {
  try {
    const parsed = new URL(String(url ?? ''), location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '/img/ph/unknown.jpg';
  } catch {
    return '/img/ph/unknown.jpg';
  }
}
function money(value) {
  return Number(value) > 0 ? `$${Number(value).toLocaleString('es-CO')}` : 'Sin dato';
}
function valueOf(property, field) {
  const features = property.features || {};
  const values = {
    source: property._kind === 'remate' ? 'Remate judicial' : property.source,
    price: money(property._kind === 'remate' ? property.minimum_bid : property.price),
    market: money(property._kind === 'remate' ? property.appraisal_value : property.market_price_estimate),
    discount: property.discount_pct != null ? `${Math.round(property.discount_pct)}%` : 'Sin dato',
    area: property.area_m2 ? `${property.area_m2} m²` : 'Sin dato',
    rooms: features.bedrooms ?? property.bedrooms ?? 'Sin dato',
    city: property.city || 'Sin dato',
    address: property.address || (property._bloqueada ? 'Disponible en Radar Pro' : 'Sin dato'),
  };
  return values[field];
}

function renderPicker() {
  const root = document.getElementById('compare-picker');
  if (!properties.length) {
    root.innerHTML = '<div class="empty-state">Guarda al menos dos inmuebles para compararlos.</div>';
    return;
  }
  root.innerHTML = properties.map((property) => {
    const price = property._kind === 'remate' ? property.minimum_bid : property.price;
    return `<label class="compare-option ${selected.has(property.id) ? 'selected' : ''}">
      <input type="checkbox" value="${esc(property.id)}" ${selected.has(property.id) ? 'checked' : ''}>
      <span><strong>${esc(property.type || property.property_type || 'Inmueble')} · ${esc(property.city || 'Sin ciudad')}</strong>
      <small>${esc(money(price))} · ${esc(property.source || 'remate')}</small></span>
    </label>`;
  }).join('');
}

function renderComparison() {
  const root = document.getElementById('comparison');
  const chosen = properties.filter((property) => selected.has(property.id));
  if (chosen.length < 2) {
    root.hidden = true;
    return;
  }
  const fields = [
    ['Fuente', 'source'], ['Precio o postura', 'price'], ['Referencia de mercado / avalúo', 'market'],
    ['Descuento', 'discount'], ['Área', 'area'], ['Habitaciones', 'rooms'], ['Ciudad', 'city'], ['Ubicación', 'address'],
  ];
  // La miniatura en la cabecera de cada columna. Sin ella, comparar tres fichas es
  // leer tres columnas de texto y tener que recordar cuál era cuál: la foto es lo
  // que permite reconocer «el del patio» de un vistazo.
  root.innerHTML = `<table class="compare-table"><thead><tr><th>Criterio</th>${chosen.map((property) =>
    `<th><img class="compare-thumb" src="${esc(safeMediaUrl(property.image_url))}" alt="" loading="lazy" width="60" height="60">${esc(property.type || property.property_type || 'Inmueble')}<small>${esc(property.city || '')}</small></th>`).join('')}</tr></thead>
    <tbody>${fields.map(([label, field]) => `<tr><th>${label}</th>${chosen.map((property) =>
      `<td>${esc(valueOf(property, field))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="compare-disclaimer">Comparación orientativa. Verifica documentos, estado jurídico, costos y disponibilidad antes de tomar una decisión.</p>`;
  root.hidden = false;
}

document.getElementById('compare-picker').addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const message = document.getElementById('compare-message');
  if (event.target.checked && selected.size >= 3) {
    event.target.checked = false;
    message.className = 'message error';
    message.textContent = 'Puedes comparar máximo tres oportunidades a la vez.';
    return;
  }
  if (event.target.checked) selected.add(event.target.value);
  else selected.delete(event.target.value);
  message.className = 'message';
  message.textContent = selected.size < 2 ? 'Selecciona una oportunidad más para abrir la comparación.' : '';
  renderPicker();
  renderComparison();
});

async function init() {
  if (!token) {
    location.href = '/login';
    return;
  }
  const response = await RadarSesion.fetch('/api/favorites?full=1', { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    localStorage.removeItem('radar_token');
    location.href = '/login';
    return;
  }
  const data = await response.json();
  properties = data.properties || [];
  properties.slice(0, Math.min(2, properties.length)).forEach((property) => selected.add(property.id));
  renderPicker();
  renderComparison();
}

init().catch(() => {
  document.getElementById('compare-message').className = 'message error';
  document.getElementById('compare-message').textContent = 'No se pudieron cargar tus guardados.';
});


'use strict';

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const STATUS_LABELS = {
  none: 'Sin suscripción',
  interested: 'Interesado',
  trialing: 'En prueba',
  active: 'Activo',
  past_due: 'Pago pendiente',
  canceled: 'Cancelado',
};

let adminToken = '';

/** Miles con separador colombiano; `null` se muestra como raya, nunca como 0. */
const numero = (valor) => (valor === null || valor === undefined
  ? '—'
  : Number(valor).toLocaleString('es-CO'));

/**
 * Porcentaje con un decimal. Un `null` es «no hay descuentos evaluados en esa
 * ciudad», que no es lo mismo que «0 % de descuento»: mostrarlo como 0 haría
 * ver la ciudad como sin ganga cuando en realidad está sin analizar.
 */
const porcentaje = (valor) => (valor === null || valor === undefined
  ? '—'
  : `${Number(valor).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

/** La base guarda slugs en minúscula (`santa marta`); aquí solo se presentan. */
const nombreCiudad = (slug) => String(slug ?? '')
  .split(' ')
  .filter(Boolean)
  .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
  .join(' ');

async function adminFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}

function renderQueue(items) {
  const list = document.getElementById('commercial-queue-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No hay solicitudes ni suscripciones para gestionar.</div>';
    return;
  }
  list.innerHTML = items.map((item) => `
    <article class="commercial-item" data-user-id="${esc(item.userId)}">
      <div class="commercial-person">
        <strong>${esc(item.name || item.email || 'Usuario')}</strong>
        <span>${esc(item.email)}</span>
        <small>${item.requestedAt
          ? `Solicitud: ${new Date(item.requestedAt).toLocaleString('es-CO')}`
          : 'Sin solicitud comercial previa'}</small>
      </div>
      <div class="commercial-status">
        <span class="status-chip status-${esc(item.subscriptionStatus)}">${esc(STATUS_LABELS[item.subscriptionStatus] || item.subscriptionStatus)}</span>
        ${item.note ? `<small>${esc(item.note)}</small>` : ''}
      </div>
      <div class="commercial-actions">
        <label>
          Nuevo estado
          <select data-subscription-status>
            ${item.subscriptionStatus === 'interested'
              ? '<option value="" selected disabled>Selecciona un estado</option>'
              : ''}
            ${['none', 'trialing', 'active', 'past_due', 'canceled'].map((status) => `
              <option value="${status}" ${status === item.subscriptionStatus ? 'selected' : ''}>${STATUS_LABELS[status]}</option>
            `).join('')}
          </select>
        </label>
        <label>
          Motivo o referencia
          <input data-subscription-note maxlength="500" placeholder="Ej. prueba autorizada por 7 días">
        </label>
        <button class="portal-button" type="button" data-update-subscription>Aplicar cambio</button>
      </div>
    </article>
  `).join('');
}

/**
 * Tabla de oportunidades por zona.
 *
 * Todo lo que viene de la base pasa por `esc()` antes de entrar al HTML: el
 * nombre de ciudad lo escribe un scraper contra un portal externo, así que es
 * texto de terceros por mucho que hoy sean slugs limpios. Y no hay ni un
 * `onclick=` en esta plantilla: la CSP del servidor prohíbe el JavaScript en
 * línea y la página entera se caería en silencio.
 */
function renderZonas(data) {
  const resumen = data.resumen;
  document.getElementById('z-activos').textContent = numero(resumen.inmueblesActivos);
  document.getElementById('z-opps').textContent = numero(resumen.oportunidades);
  document.getElementById('z-altas').textContent = numero(resumen.oportunidadesAltas);
  document.getElementById('z-ciudades').textContent = numero(resumen.ciudadesConOportunidad);
  document.getElementById('z-medio').textContent = porcentaje(resumen.descuentoMedio);
  document.getElementById('z-mejor').textContent = porcentaje(resumen.mejorDescuento);
  document.getElementById('z-banco').textContent = numero(resumen.inmueblesBanco);
  document.getElementById('z-remates').textContent = numero(resumen.rematesActivos);

  // Se dice explícitamente que la tabla está recortada: si no, los totales de
  // arriba (que sí son del sistema completo) parecerían no cuadrar con la suma
  // de las filas y el panel perdería credibilidad delante del cliente.
  document.getElementById('zonas-alcance').textContent = resumen.ciudadesEnTabla >= resumen.ciudadesConOportunidad
    ? `Se listan las ${numero(resumen.ciudadesEnTabla)} ciudades con oportunidades detectadas.`
    : `Se listan las ${numero(resumen.ciudadesEnTabla)} ciudades con más oportunidades de ${numero(resumen.ciudadesConOportunidad)} con inventario detectado. Los totales de arriba son del sistema completo.`;

  const tbody = document.getElementById('zonas-tbody');
  if (!data.zonas.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="zone-empty">Todavía no hay oportunidades detectadas por el motor.</td></tr>';
    return;
  }
  tbody.innerHTML = data.zonas.map((zona) => `
    <tr class="${zona.coberturaArriendos ? '' : 'zone-row-sin-arriendos'}">
      <th scope="row">${esc(nombreCiudad(zona.ciudad))}</th>
      <td>${esc(numero(zona.inmueblesActivos))}</td>
      <td>${esc(numero(zona.oportunidades))}</td>
      <td>${esc(numero(zona.oportunidadesAltas))}</td>
      <td>${esc(porcentaje(zona.descuentoMedio))}</td>
      <td>${esc(porcentaje(zona.mejorDescuento))}</td>
      <td>${esc(numero(zona.inmueblesBanco))}</td>
      <td>${esc(numero(zona.rematesActivos))}</td>
      <td>${zona.coberturaArriendos
        ? esc(numero(zona.arriendos))
        : '<span class="zone-flag">Sin cobertura</span>'}</td>
    </tr>
  `).join('');
}

async function loadZonas() {
  const message = document.getElementById('zonas-message');
  const retry = document.getElementById('zonas-retry');
  document.getElementById('zonas').hidden = false;
  retry.hidden = true;
  message.className = 'message';
  message.textContent = 'Calculando el inventario por ciudad…';
  try {
    const data = await adminFetch('/api/admin/oportunidades-por-zona');
    renderZonas(data);
    const sinArriendos = data.resumen.ciudadesSinArriendos;
    message.className = 'message';
    // Separador «·» y no punto: `toLocaleString('es-CO')` ya termina en «a. m.»
    // y encadenar un punto dejaba un «a. m..» a la vista del cliente.
    message.textContent = `Corte del inventario ${new Date(data.generadoEn).toLocaleString('es-CO')} · `
      + (sinArriendos
        ? `${numero(sinArriendos)} de las ciudades listadas no tienen comparables de arriendo`
        : 'todas las ciudades listadas tienen comparables de arriendo');
  } catch (error) {
    // Que falle el inventario no puede tumbar el resto del panel: la operación
    // comercial se sigue pudiendo usar aunque Supabase se demore en los conteos.
    message.className = 'message error';
    message.textContent = `No se pudo calcular el inventario por zona: ${error.message}`;
    retry.hidden = false;
  }
}

async function loadQueue() {
  const data = await adminFetch('/api/admin/plan-interests');
  renderQueue(data.interests);
  document.getElementById('commercial-queue').hidden = false;
}

async function init() {
  adminToken = localStorage.getItem('radar_token') || '';
  if (!adminToken) {
    location.href = '/login';
    return;
  }
  const message = document.getElementById('admin-message');
  let data;
  try {
    data = await adminFetch('/api/admin/summary');
  } catch (error) {
    message.innerHTML = `<h2>Acceso no disponible</h2><p>${esc(error.message)}</p>`;
    return;
  }
  document.getElementById('m-users').textContent = data.summary.users.toLocaleString('es-CO');
  document.getElementById('m-pro').textContent = data.summary.proUsers.toLocaleString('es-CO');
  document.getElementById('m-interest').textContent = data.summary.interestedUsers.toLocaleString('es-CO');
  document.getElementById('m-alerts').textContent = data.summary.activeAlerts.toLocaleString('es-CO');
  document.getElementById('m-profiles').textContent = data.summary.completedProfiles.toLocaleString('es-CO');
  document.getElementById('m-sent').textContent = data.summary.sentDeliveries.toLocaleString('es-CO');
  document.getElementById('m-failed').textContent = data.summary.failedDeliveries.toLocaleString('es-CO');
  document.getElementById('m-success').textContent = data.summary.deliverySuccessRate == null
    ? '—'
    : `${data.summary.deliverySuccessRate.toLocaleString('es-CO')}%`;
  const funnel = data.summary.subscriptionFunnel;
  document.getElementById('f-none').textContent = funnel.none.toLocaleString('es-CO');
  document.getElementById('f-interested').textContent = funnel.interested.toLocaleString('es-CO');
  document.getElementById('f-trialing').textContent = funnel.trialing.toLocaleString('es-CO');
  document.getElementById('f-active').textContent = funnel.active.toLocaleString('es-CO');
  document.getElementById('f-past-due').textContent = funnel.pastDue.toLocaleString('es-CO');
  document.getElementById('f-canceled').textContent = funnel.canceled.toLocaleString('es-CO');
  document.getElementById('metrics').hidden = false;
  document.getElementById('funnel').hidden = false;
  await loadQueue();
  // Va después de la cola comercial y sin bloquearla: el cálculo del inventario
  // es el más caro de los tres y no tiene por qué retrasar lo que el
  // administrador viene a operar.
  void loadZonas();
  const deliveryCopy = data.summary.lastDeliveryAt
    ? `Último procesamiento registrado ${new Date(data.summary.lastDeliveryAt).toLocaleString('es-CO')}.`
    : 'Todavía no hay entregas registradas; el panel no presenta métricas simuladas.';
  message.innerHTML = `<h2>Lectura operativa</h2><p>${deliveryCopy} Corte generado ${new Date(data.summary.generatedAt).toLocaleString('es-CO')}.</p>`;
}

document.getElementById('zonas-retry').addEventListener('click', () => { void loadZonas(); });

document.getElementById('commercial-queue-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-update-subscription]');
  if (!button) return;
  const item = button.closest('[data-user-id]');
  const status = item.querySelector('[data-subscription-status]').value;
  const note = item.querySelector('[data-subscription-note]').value.trim();
  const message = document.getElementById('commercial-message');
  button.disabled = true;
  message.className = 'message';
  message.textContent = 'Aplicando cambio…';
  try {
    await adminFetch(`/api/admin/subscriptions/${encodeURIComponent(item.dataset.userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
    message.className = 'message ok';
    message.textContent = 'Suscripción actualizada y registrada en el historial.';
    await init();
  } catch (error) {
    message.className = 'message error';
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

init().catch(() => {
  document.getElementById('admin-message').innerHTML = '<h2>No se pudo cargar el panel</h2><p>Intenta de nuevo en unos minutos.</p>';
});

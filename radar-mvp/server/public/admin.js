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
  const deliveryCopy = data.summary.lastDeliveryAt
    ? `Último procesamiento registrado ${new Date(data.summary.lastDeliveryAt).toLocaleString('es-CO')}.`
    : 'Todavía no hay entregas registradas; el panel no presenta métricas simuladas.';
  message.innerHTML = `<h2>Lectura operativa</h2><p>${deliveryCopy} Corte generado ${new Date(data.summary.generatedAt).toLocaleString('es-CO')}.</p>`;
}

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

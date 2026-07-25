'use strict';

const token = localStorage.getItem('radar_token');
const authHeaders = (json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
let account = null;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function typeLabel(value) {
  return ({ apartment: 'Apartamento', house: 'Casa', lot: 'Lote', commercial: 'Local', office: 'Oficina' }[value] || 'Cualquier tipo');
}

function renderAlerts() {
  const root = document.getElementById('alerts-list');
  if (!account.alerts.length) {
    root.innerHTML = '<div class="empty-state">Aún no tienes alertas activas.</div>';
    return;
  }
  root.innerHTML = account.alerts.map((alert) => `<article class="alert-item">
    <div><strong>${esc(typeLabel(alert.type))} en ${esc(alert.city)}</strong>
      <span>${alert.budget ? `Hasta $${Number(alert.budget).toLocaleString('es-CO')} millones · ` : ''}Resumen semanal · ${alert.active ? 'Activa' : 'Pausada'}</span>
    </div>
    <button class="danger-link" type="button" data-delete-alert="${encodeURIComponent(alert.id)}">Eliminar</button>
  </article>`).join('');
}

function renderAccount() {
  document.getElementById('account-name').textContent = account.name || 'Mi cuenta';
  document.getElementById('account-email').textContent = account.email;
  document.getElementById('account-plan').textContent = account.plan === 'pro' ? 'Radar Pro' : 'Explorador';
  document.getElementById('plan-title').textContent = account.plan === 'pro' ? 'Radar Pro' : 'Explorador';
  document.getElementById('plan-copy').textContent = account.plan === 'pro'
    ? 'Tienes acceso a fichas completas y hasta cinco alertas.'
    : 'Puedes explorar el mercado y mantener una alerta semanal.';
  document.getElementById('admin-link-card').hidden = account.role !== 'admin';
  const preferences = account.preferences;
  if (preferences) {
    document.getElementById('alert-city').value = preferences.city || '';
    document.getElementById('alert-budget').value = preferences.budget || '';
    document.getElementById('alert-type').value = preferences.type || '';
  }
  renderAlerts();
}

async function init() {
  if (!token) {
    document.getElementById('signed-out').hidden = false;
    document.getElementById('logout').hidden = true;
    return;
  }
  const [response, configResponse] = await Promise.all([
    fetch('/api/account', { headers: authHeaders() }),
    fetch('/api/config'),
  ]);
  if (response.status === 401) {
    localStorage.removeItem('radar_token');
    document.getElementById('signed-out').hidden = false;
    return;
  }
  const data = await response.json();
  account = data.account;
  const config = await configResponse.json();
  const deliveryNote = document.getElementById('delivery-note');
  deliveryNote.hidden = false;
  deliveryNote.textContent = config.alertEmailDeliveryReady
    ? 'El canal de correo está configurado. Las alertas se procesan en el ciclo semanal.'
    : 'La alerta se guardará, pero el envío por correo seguirá pendiente hasta configurar el proveedor y el ciclo programado.';
  document.getElementById('account-content').hidden = false;
  const exportLink = document.getElementById('export-link');
  exportLink.addEventListener('click', async (event) => {
    event.preventDefault();
    const result = await fetch('/api/account/export', { headers: authHeaders() });
    const blob = await result.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `radar-cuenta-${account.id.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
  renderAccount();
}

document.getElementById('alert-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const payload = {
    city: document.getElementById('alert-city').value,
    budget: document.getElementById('alert-budget').value,
    type: document.getElementById('alert-type').value,
    frequency: 'weekly',
    active: true,
  };
  const response = await fetch('/api/account/alerts', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  const message = document.getElementById('alert-message');
  button.disabled = false;
  if (!response.ok || !data.ok) {
    message.className = 'message error';
    message.textContent = data.error || 'No se pudo crear la alerta.';
    return;
  }
  account = data.account;
  message.className = 'message ok';
  message.textContent = 'Alerta guardada en tu cuenta.';
  renderAlerts();
});

document.getElementById('alerts-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-alert]');
  if (!button) return;
  button.disabled = true;
  const response = await fetch(`/api/account/alerts/${button.dataset.deleteAlert}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await response.json();
  if (response.ok && data.ok) {
    account = data.account;
    renderAlerts();
  } else {
    button.disabled = false;
  }
});

document.getElementById('logout').addEventListener('click', () => {
  localStorage.removeItem('radar_token');
  localStorage.removeItem('radar_refresh');
  location.href = '/';
});

init().catch(() => {
  document.getElementById('signed-out').hidden = false;
});

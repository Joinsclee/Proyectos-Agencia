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

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function alertOperationalCopy(alert) {
  if (alert.lastDeliveryStatus === 'sent') return `Último envío: ${formatDate(alert.lastSentAt)}`;
  if (alert.lastDeliveryStatus === 'no_matches') return `Revisada sin nuevas coincidencias: ${formatDate(alert.lastCheckedAt)}`;
  if (alert.lastDeliveryStatus === 'failed') {
    return `Entrega pendiente · próximo reintento: ${formatDate(alert.nextRetryAt) || 'por programar'}`;
  }
  return 'Aún no se ha procesado';
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
      <small class="operational-copy">${esc(alertOperationalCopy(alert))}</small>
    </div>
    <button class="danger-link" type="button" data-delete-alert="${encodeURIComponent(alert.id)}">Eliminar</button>
  </article>`).join('');
}

function renderDeliveryHistory() {
  const root = document.getElementById('delivery-history');
  const deliveries = account.deliveryHistory || [];
  if (!deliveries.length) {
    root.innerHTML = '<div class="empty-state">El historial aparecerá después del primer ciclo de revisión.</div>';
    return;
  }
  root.innerHTML = deliveries.slice(0, 8).map((delivery) => {
    const labels = {
      sent: ['Enviado', 'history-ok'],
      no_matches: ['Sin coincidencias', 'history-neutral'],
      failed: ['Reintento pendiente', 'history-error'],
    };
    const [label, className] = labels[delivery.status] || ['Procesado', 'history-neutral'];
    return `<article class="history-item">
      <div><strong>${esc(label)}</strong><span>${esc(formatDate(delivery.attemptedAt))}</span></div>
      <div class="history-result ${className}">${Number(delivery.matchCount || 0).toLocaleString('es-CO')} coincidencias</div>
    </article>`;
  }).join('');
}

function renderSubscriptionHistory() {
  const root = document.getElementById('subscription-history');
  const history = account.subscriptionHistory || [];
  if (!history.length) {
    root.innerHTML = '';
    return;
  }
  const labels = {
    none: 'Sin suscripción',
    trialing: 'Prueba iniciada',
    active: 'Suscripción activa',
    past_due: 'Pago pendiente',
    canceled: 'Suscripción cancelada',
  };
  const latest = history[0];
  root.innerHTML = `<small>Último cambio</small><strong>${esc(labels[latest.toStatus] || latest.toStatus)}</strong>
    <span>${esc(formatDate(latest.at))}${latest.note ? ` · ${esc(latest.note)}` : ''}</span>`;
}

function renderAccount() {
  const statusLabels = {
    none: 'Sin suscripción',
    interested: 'Solicitud recibida',
    trialing: 'En prueba',
    active: 'Activa',
    past_due: 'Pago pendiente',
    canceled: 'Cancelada',
  };
  document.getElementById('account-name').textContent = account.name || 'Mi cuenta';
  document.getElementById('account-email').textContent = account.email;
  document.getElementById('account-plan').textContent = account.plan === 'pro' ? 'Radar Pro' : 'Explorador';
  document.getElementById('plan-title').textContent = account.plan === 'pro' ? 'Radar Pro' : 'Explorador';
  const status = document.getElementById('subscription-status');
  status.textContent = statusLabels[account.subscriptionStatus] || 'Sin suscripción';
  status.className = `status-chip status-${account.subscriptionStatus || 'none'}`;
  document.getElementById('plan-copy').textContent = account.subscriptionStatus === 'past_due'
    ? 'El acceso Pro está pausado hasta regularizar el pago con el equipo comercial.'
    : account.subscriptionStatus === 'canceled'
      ? 'La suscripción está cancelada y la cuenta conserva el acceso Explorador.'
      : account.plan === 'pro'
    ? 'Tienes acceso a fichas completas y hasta cinco alertas.'
    : 'Puedes explorar el mercado y mantener una alerta semanal.';
  const validity = document.getElementById('plan-validity');
  validity.hidden = !account.subscriptionValidUntil;
  validity.textContent = account.subscriptionValidUntil
    ? `Vigencia demo hasta ${formatDate(account.subscriptionValidUntil)} · renovación manual`
    : '';
  document.getElementById('admin-link-card').hidden = account.role !== 'admin';
  const preferences = account.preferences;
  if (preferences) {
    document.getElementById('alert-city').value = preferences.city || '';
    document.getElementById('alert-budget').value = preferences.budget || '';
    document.getElementById('alert-type').value = preferences.type || '';
  }
  renderAlerts();
  renderDeliveryHistory();
  renderSubscriptionHistory();
}

async function downloadAccountExport(path, filename) {
  const result = await RadarSesion.fetch(path, { headers: authHeaders() });
  if (!result.ok) throw new Error('No se pudo preparar la descarga');
  const blob = await result.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  if (!token) {
    document.getElementById('signed-out').hidden = false;
    document.getElementById('logout').hidden = true;
    return;
  }
  const [response, configResponse] = await Promise.all([
    RadarSesion.fetch('/api/account', { headers: authHeaders() }),
    RadarSesion.fetch('/api/config'),
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
  // Tres estados reales, no dos: el proveedor de correo puede estar listo y el
  // despachador semanal seguir apagado. Prometer envíos que no salen es la forma
  // más rápida de perder la confianza en el Radar.
  if (!config.alertEmailDeliveryReady) {
    deliveryNote.textContent = 'La alerta se guardará, pero el envío por correo seguirá pendiente hasta configurar el proveedor y el ciclo programado.';
  } else if (config.alertDispatchEnabled) {
    deliveryNote.textContent = 'El canal de correo está configurado. Las alertas se procesan en el ciclo semanal.';
  } else {
    deliveryNote.textContent = 'El canal de correo está configurado y tu alerta queda guardada. El envío automático está en pausa hasta que se apruebe la activación.';
  }
  document.getElementById('account-content').hidden = false;
  const exportLink = document.getElementById('export-link');
  exportLink.addEventListener('click', async (event) => {
    event.preventDefault();
    // Hoja imprimible en vez del volcado JSON: el usuario la guarda como PDF
    // desde el propio navegador. Decisión de la reunión del 28-jul.
    await downloadAccountExport('/api/account/resumen', `radar-cuenta-${account.id.slice(0, 8)}.html`);
  });
  document.getElementById('export-csv-link').addEventListener('click', async (event) => {
    event.preventDefault();
    await downloadAccountExport('/api/account/export.csv', `radar-seguimiento-${account.id.slice(0, 8)}.csv`);
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
  const response = await RadarSesion.fetch('/api/account/alerts', {
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
  const response = await RadarSesion.fetch(`/api/account/alerts/${button.dataset.deleteAlert}`, {
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

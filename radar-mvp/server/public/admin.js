'use strict';

async function init() {
  const token = localStorage.getItem('radar_token');
  if (!token) {
    location.href = '/login';
    return;
  }
  const response = await fetch('/api/admin/summary', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  const message = document.getElementById('admin-message');
  if (!response.ok || !data.ok) {
    message.innerHTML = `<h2>Acceso no disponible</h2><p>${response.status === 403
      ? 'Tu cuenta funciona correctamente, pero no tiene rol de administrador.'
      : 'No se pudo validar la sesión. Vuelve a iniciar sesión.'}</p>`;
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
  const deliveryCopy = data.summary.lastDeliveryAt
    ? `Último procesamiento registrado ${new Date(data.summary.lastDeliveryAt).toLocaleString('es-CO')}.`
    : 'Todavía no hay entregas registradas; el panel no presenta métricas simuladas.';
  message.innerHTML = `<h2>Lectura operativa</h2><p>${deliveryCopy} Corte generado ${new Date(data.summary.generatedAt).toLocaleString('es-CO')}.</p>`;
}

init().catch(() => {
  document.getElementById('admin-message').innerHTML = '<h2>No se pudo cargar el panel</h2><p>Intenta de nuevo en unos minutos.</p>';
});

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
  document.getElementById('metrics').hidden = false;
  message.innerHTML = `<h2>Perfiles configurados</h2><p>${data.summary.completedProfiles.toLocaleString('es-CO')} usuarios han completado su personalización. Corte generado ${new Date(data.summary.generatedAt).toLocaleString('es-CO')}.</p>`;
}

init().catch(() => {
  document.getElementById('admin-message').innerHTML = '<h2>No se pudo cargar el panel</h2><p>Intenta de nuevo en unos minutos.</p>';
});


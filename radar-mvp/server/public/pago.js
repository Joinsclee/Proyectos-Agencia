'use strict';

const token = localStorage.getItem('radar_token');
const reference = new URLSearchParams(location.search).get('reference');
let attempts = 0;
let timer = null;

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

function render(kind, title, copy, payment) {
  const icon = document.getElementById('payment-icon');
  icon.className = `payment-icon ${kind}`;
  icon.textContent = kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'voided' ? '×' : '···';
  document.getElementById('payment-title').textContent = title;
  document.getElementById('payment-copy').textContent = copy;
  if (payment) {
    document.getElementById('payment-details').hidden = false;
    document.getElementById('payment-reference').textContent = payment.reference;
    if (payment.validUntil) {
      document.getElementById('payment-validity-row').hidden = false;
      document.getElementById('payment-validity').textContent = formatDate(payment.validUntil);
    }
  }
}

async function refresh() {
  attempts += 1;
  const response = await fetch(`/api/account/payment?reference=${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo consultar el pago');
  const payment = data.payment;
  if (payment.status === 'APPROVED') {
    render('success', 'Radar Pro quedó activo', 'Wompi confirmó el pago demo y tu cuenta ya tiene acceso Pro por 30 días.', payment);
    document.getElementById('payment-help').textContent = 'Esta es una transacción Sandbox: valida el flujo completo sin mover dinero real.';
    document.getElementById('payment-primary').textContent = 'Explorar como Pro';
    document.getElementById('payment-primary').href = '/';
    return;
  }
  if (payment.status === 'DECLINED' || payment.status === 'ERROR') {
    render('error', 'La prueba no fue aprobada', 'Wompi no aprobó esta transacción demo. Puedes volver a intentarlo con los datos de prueba.', payment);
    document.getElementById('payment-primary').textContent = 'Intentar de nuevo';
    document.getElementById('payment-primary').href = '/planes';
    return;
  }
  if (payment.status === 'VOIDED') {
    render('voided', 'La transacción fue anulada', 'El acceso relacionado con esta prueba fue cancelado de forma segura.', payment);
    return;
  }
  render('pending', 'Confirmando la activación', 'El checkout terminó y estamos esperando el webhook firmado de Wompi.', payment);
  if (attempts < 10) timer = setTimeout(refresh, 2_000);
  else document.getElementById('payment-help').textContent = 'La confirmación está tardando más de lo normal. Puedes revisar el estado desde Mi cuenta.';
}

if (!token) {
  render('error', 'Inicia sesión para consultar el pago', 'La referencia está protegida y solo puede verla la cuenta que inició el checkout.');
  document.getElementById('payment-primary').textContent = 'Ingresar';
  document.getElementById('payment-primary').href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
} else if (!reference) {
  render('error', 'Falta la referencia del pago', 'Vuelve a Planes e inicia una nueva prueba de checkout.');
  document.getElementById('payment-primary').textContent = 'Ver planes';
  document.getElementById('payment-primary').href = '/planes';
} else {
  refresh().catch((error) => {
    render('error', 'No pudimos confirmar el estado', error.message || 'Intenta nuevamente desde Mi cuenta.');
  });
}

window.addEventListener('pagehide', () => {
  if (timer) clearTimeout(timer);
});

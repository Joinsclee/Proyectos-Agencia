'use strict';

const token = localStorage.getItem('radar_token');
const reference = new URLSearchParams(location.search).get('reference');
let attempts = 0;
let timer = null;

const PAYMENT_ICONS = {
  pending: '<span class="payment-spinner"></span>',
  success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.0303 10.0303C16.3232 9.73744 16.3232 9.26256 16.0303 8.96967C15.7374 8.67678 15.2626 8.67678 14.9697 8.96967L10.5 13.4393L9.03033 11.9697C8.73744 11.6768 8.26256 11.6768 7.96967 11.9697C7.67678 12.2626 7.67678 12.7374 7.96967 13.0303L9.96967 15.0303C10.2626 15.3232 10.7374 15.3232 11.0303 15.0303L16.0303 10.0303Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12Z" fill="currentColor"/></svg>',
  error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.25C12.4142 7.25 12.75 7.58579 12.75 8V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V8C11.25 7.58579 11.5858 7.25 12 7.25Z" fill="currentColor"/><path d="M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8.2944 4.47643C9.36631 3.11493 10.5018 2.25 12 2.25C13.4981 2.25 14.6336 3.11493 15.7056 4.47643C16.7598 5.81544 17.8769 7.79622 19.3063 10.3305L19.7418 11.1027C20.9234 13.1976 21.8566 14.8523 22.3468 16.1804C22.8478 17.5376 22.9668 18.7699 22.209 19.8569C21.4736 20.9118 20.2466 21.3434 18.6991 21.5471C17.1576 21.75 15.0845 21.75 12.4248 21.75H11.5752C8.91552 21.75 6.84239 21.75 5.30082 21.5471C3.75331 21.3434 2.52637 20.9118 1.79099 19.8569C1.03318 18.7699 1.15218 17.5376 1.65314 16.1804C2.14334 14.8523 3.07658 13.1977 4.25818 11.1027L4.69361 10.3307C6.123 7.79629 7.24019 5.81547 8.2944 4.47643ZM9.47297 5.40432C8.49896 6.64148 7.43704 8.51988 5.96495 11.1299L5.60129 11.7747C4.37507 13.9488 3.50368 15.4986 3.06034 16.6998C2.6227 17.8855 2.68338 18.5141 3.02148 18.9991C3.38202 19.5163 4.05873 19.8706 5.49659 20.0599C6.92858 20.2484 8.9026 20.25 11.6363 20.25H12.3636C15.0974 20.25 17.0714 20.2484 18.5034 20.0599C19.9412 19.8706 20.6179 19.5163 20.9785 18.9991C21.3166 18.5141 21.3773 17.8855 20.9396 16.6998C20.4963 15.4986 19.6249 13.9488 18.3987 11.7747L18.035 11.1299C16.5629 8.51987 15.501 6.64148 14.527 5.40431C13.562 4.17865 12.8126 3.75 12 3.75C11.1874 3.75 10.4379 4.17865 9.47297 5.40432Z" fill="currentColor"/></svg>',
};
PAYMENT_ICONS.voided = PAYMENT_ICONS.error;

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
  icon.innerHTML = PAYMENT_ICONS[kind] || PAYMENT_ICONS.pending;
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

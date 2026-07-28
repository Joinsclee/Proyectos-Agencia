'use strict';

const token = localStorage.getItem('radar_token');
const headers = (json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
let account = null;
let paymentDemoReady = false;
let demoPlanActivation = false;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function price(plan) {
  if (plan.priceMonthlyCop === 0) return 'Gratis';
  if (typeof plan.priceMonthlyCop === 'number') {
    const period = plan.billingPeriodDays ? ` / ${plan.billingPeriodDays} días` : '/mes';
    return `$${plan.priceMonthlyCop.toLocaleString('es-CO')} <small>COP${period}</small>`;
  }
  return 'Próximamente';
}

function render(plans) {
  document.getElementById('plans').innerHTML = plans.map((plan) => {
    const current = account?.plan === plan.code;
    const requested = plan.code === 'pro' && account?.subscriptionStatus === 'interested';
    // Tres caminos posibles para el plan de pago, en este orden: activación de
    // demostración (regala el acceso, se controla con RADAR_DEMO_PLAN), checkout
    // Sandbox de Wompi, o dejar constancia del interés.
    const proAction = demoPlanActivation
      ? 'Obtener acceso completo'
      : paymentDemoReady ? 'Activar demo por 30 días' : requested ? 'Solicitud recibida' : 'Solicitar acceso demo';
    const label = current ? 'Plan actual' : plan.code === 'free' ? (token ? 'Tu plan actual' : 'Empezar gratis') : proAction;
    const href = !token && plan.code === 'pro' ? '/login' : plan.code === 'free' ? '/' : '#';
    const action = plan.code === 'pro' && token && !current
      ? demoPlanActivation ? 'data-activate-demo'
        : paymentDemoReady ? 'data-start-checkout' : !requested ? 'data-request-plan' : ''
      : '';
    return `<article class="plan-card ${plan.code === 'pro' ? 'featured' : ''}">
      ${plan.code === 'pro' ? `<span class="plan-badge">${paymentDemoReady ? 'Wompi Sandbox' : 'Piloto Pro'}</span>` : ''}
      <h2>${esc(plan.name)}</h2>
      <div class="plan-price">${price(plan)}</div>
      <p class="plan-description">${esc(plan.description)}</p>
      <ul class="plan-features">${plan.features.map((feature) => `<li>${esc(feature)}</li>`).join('')}</ul>
      ${plan.code === 'pro' ? `<p class="plan-terms">${paymentDemoReady
        ? 'Pago único de prueba · renovación manual · no se almacena información de tarjeta.'
        : 'Activación manual del piloto · sin cobros automáticos · vigencia de 30 días.'}</p>` : ''}
      <a class="portal-button ${plan.code === 'free' ? 'secondary' : ''}" href="${href}"
        ${action}
        ${current || (!paymentDemoReady && requested) ? 'aria-disabled="true"' : ''}>${esc(label)}</a>
    </article>`;
  }).join('');
}

function submitCheckout(checkout) {
  if (checkout.action !== 'https://checkout.wompi.co/p/' || checkout.method !== 'GET') {
    throw new Error('Destino de pago no permitido');
  }
  const form = document.createElement('form');
  form.method = 'GET';
  form.action = checkout.action;
  form.hidden = true;
  Object.entries(checkout.fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

async function init() {
  const [plansResponse, accountResponse, configResponse] = await Promise.all([
    fetch('/api/plans'),
    token ? fetch('/api/account', { headers: headers() }) : Promise.resolve(null),
    fetch('/api/config'),
  ]);
  const plansData = await plansResponse.json();
  const config = await configResponse.json();
  paymentDemoReady = config.paymentDemoReady === true;
  demoPlanActivation = config.demoPlanActivation === true;
  if (accountResponse?.ok) {
    const accountData = await accountResponse.json();
    account = accountData.account;
    document.getElementById('account-link').hidden = true;
    document.getElementById('session-link').textContent = 'Mi cuenta';
    document.getElementById('session-link').href = '/cuenta';
  }
  const availability = document.getElementById('payment-availability');
  availability.textContent = demoPlanActivation
    ? 'Acceso completo de cortesía durante el piloto: se activa al instante, sin cobro ni datos de pago, con vigencia de 30 días.'
    : paymentDemoReady
      ? 'Checkout de prueba habilitado con Wompi Sandbox. No mueve dinero real y la renovación es manual.'
      : 'El piloto Pro se activa manualmente. El checkout externo queda reservado para una etapa posterior.';
  render(plansData.plans || []);
}

document.addEventListener('click', async (event) => {
  const demoButton = event.target.closest('[data-activate-demo]');
  const checkoutButton = event.target.closest('[data-start-checkout]');
  const interestButton = event.target.closest('[data-request-plan]');
  const button = demoButton || checkoutButton || interestButton;
  if (!button) return;
  event.preventDefault();
  if (button.getAttribute('aria-disabled') === 'true') return;
  button.setAttribute('aria-disabled', 'true');
  const message = document.getElementById('message');
  message.className = 'message';
  message.textContent = demoButton ? 'Activando tu acceso completo…'
    : checkoutButton ? 'Preparando un checkout seguro…' : 'Registrando tu solicitud…';

  const endpoint = demoButton ? '/api/account/activar-demo'
    : checkoutButton ? '/api/account/checkout' : '/api/account/plan-interest';
  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: headers(true),
      body: interestButton ? JSON.stringify({ plan: 'pro' }) : '{}',
    },
  );
  const data = await response.json();
  if (!response.ok || !data.ok) {
    message.className = 'message error';
    message.textContent = data.error || 'No pudimos continuar con la solicitud.';
    button.removeAttribute('aria-disabled');
    return;
  }
  if (checkoutButton) {
    message.className = 'message ok';
    message.textContent = 'Checkout preparado. Te estamos llevando al entorno de pruebas de Wompi.';
    submitCheckout(data.checkout);
    return;
  }
  account = data.account;
  message.className = 'message ok';
  message.textContent = 'Solicitud registrada. Te avisaremos cuando el checkout demo esté habilitado.';
  const plansData = await fetch('/api/plans').then((result) => result.json());
  render(plansData.plans || []);
});

init().catch(() => {
  document.getElementById('message').className = 'message error';
  document.getElementById('message').textContent = 'No se pudieron cargar los planes. Intenta de nuevo.';
});

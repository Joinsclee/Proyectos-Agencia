'use strict';

const token = localStorage.getItem('radar_token');
const headers = () => (token ? { Authorization: `Bearer ${token}` } : {});
let account = null;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function price(plan) {
  if (plan.priceMonthlyCop === 0) return 'Gratis';
  if (typeof plan.priceMonthlyCop === 'number') {
    return `$${plan.priceMonthlyCop.toLocaleString('es-CO')} <small>COP/mes</small>`;
  }
  return 'Por definir <small>con el cliente</small>';
}

function render(plans) {
  document.getElementById('plans').innerHTML = plans.map((plan) => {
    const current = account?.plan === plan.code;
    const requested = plan.code === 'pro' && account?.subscriptionStatus === 'interested';
    const label = current ? 'Plan actual' : requested ? 'Solicitud recibida' : plan.code === 'free' ? 'Empezar gratis' : 'Solicitar Radar Pro';
    const href = !token && plan.code === 'pro' ? '/login' : plan.code === 'free' ? '/' : '#';
    return `<article class="plan-card ${plan.code === 'pro' ? 'featured' : ''}">
      ${plan.code === 'pro' ? '<span class="plan-badge">Mayor profundidad</span>' : ''}
      <h2>${esc(plan.name)}</h2>
      <div class="plan-price">${price(plan)}</div>
      <p class="plan-description">${esc(plan.description)}</p>
      <ul class="plan-features">${plan.features.map((feature) => `<li>${esc(feature)}</li>`).join('')}</ul>
      <a class="portal-button ${plan.code === 'free' ? 'secondary' : ''}" href="${href}"
        ${plan.code === 'pro' && token && !current && !requested ? 'data-request-plan' : ''}
        ${current || requested ? 'aria-disabled="true"' : ''}>${esc(label)}</a>
    </article>`;
  }).join('');
}

async function init() {
  const [plansResponse, accountResponse] = await Promise.all([
    fetch('/api/plans'),
    token ? fetch('/api/account', { headers: headers() }) : Promise.resolve(null),
  ]);
  const plansData = await plansResponse.json();
  if (accountResponse?.ok) {
    const accountData = await accountResponse.json();
    account = accountData.account;
    document.getElementById('session-link').textContent = 'Mi cuenta';
    document.getElementById('session-link').href = '/cuenta';
  }
  render(plansData.plans || []);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-request-plan]');
  if (!button) return;
  event.preventDefault();
  button.setAttribute('aria-disabled', 'true');
  const response = await fetch('/api/account/plan-interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({ plan: 'pro' }),
  });
  const data = await response.json();
  const message = document.getElementById('message');
  if (!response.ok || !data.ok) {
    message.className = 'message error';
    message.textContent = data.error || 'No pudimos registrar la solicitud.';
    button.removeAttribute('aria-disabled');
    return;
  }
  account = data.account;
  message.className = 'message ok';
  message.textContent = 'Solicitud registrada. El equipo comercial podrá continuar el proceso sin activar cobros automáticos.';
  const plansData = await fetch('/api/plans').then((result) => result.json());
  render(plansData.plans || []);
});

init().catch(() => {
  document.getElementById('message').className = 'message error';
  document.getElementById('message').textContent = 'No se pudieron cargar los planes. Intenta de nuevo.';
});


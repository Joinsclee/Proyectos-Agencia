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

/**
 * Lo que cuesta HOY, no lo que costará.
 *
 * Durante el piloto el plan completo se activa sin cobrar, pero la tarjeta
 * enseñaba «$49.900 COP / 30 días» en letra grande y la gratuidad en letra
 * pequeña. Alguien cauteloso lee el precio, asume que hay que pagar y se va
 * antes de registrarse — justo lo contrario de para qué existe un piloto.
 *
 * Cuando la cortesía se apague, esto vuelve a enseñar el precio solo, sin tocar
 * nada: depende de la misma variable que decide si se cobra.
 */
function price(plan) {
  if (plan.priceMonthlyCop === 0) return 'Gratis';
  if (typeof plan.priceMonthlyCop === 'number') {
    const period = plan.billingPeriodDays ? ` / ${plan.billingPeriodDays} días` : '/mes';
    const tarifa = `$${plan.priceMonthlyCop.toLocaleString('es-CO')} <small>COP${period}</small>`;
    if (plan.code === 'pro' && demoPlanActivation) {
      return `Gratis <small class="plan-price-tachado">antes ${tarifa}</small>`;
    }
    return tarifa;
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
    // El tercer camino es el que el cliente quiere para salir: «¿hay plan de
    // pago? Próximamente. Va a salir. Genera expectativa» — y de paso deja los
    // datos de quien lo pide. Se dice así, sin rodeos: «avísame» promete algo
    // concreto que el sistema cumple, «solicitar acceso demo» sonaba a trámite.
    const proAction = demoPlanActivation
      ? 'Obtener acceso completo'
      : paymentDemoReady ? 'Activar demo por 30 días'
        : requested ? 'Te avisaremos' : 'Avísame cuando salga';
    const esFree = plan.code === 'free';
    // El plan gratuito no se "compra": se obtiene creando la cuenta. Sin sesión el
    // botón lleva al registro, que es lo único que hace falta. Antes apuntaba a la
    // portada para todo el mundo, así que quien pulsaba "Empezar gratis" volvía al
    // buscador sin cuenta y sin entender qué había pasado.
    const label = esFree
      ? (current ? 'Tu plan actual' : token ? 'Incluido en tu plan' : 'Empezar gratis')
      : current ? 'Plan actual' : proAction;
    const href = esFree
      ? (token ? '#' : '/login')
      : (!token ? '/login' : '#');
    // Ya con sesión, la tarjeta gratuita no tiene nada que hacer: o es su plan, o
    // tiene uno mejor.
    const inerte = esFree ? !!token : (current || (!paymentDemoReady && !demoPlanActivation && requested));
    const action = plan.code === 'pro' && token && !current
      ? demoPlanActivation ? 'data-activate-demo'
        : paymentDemoReady ? 'data-start-checkout' : !requested ? 'data-request-plan' : ''
      : '';
    return `<article class="plan-card ${plan.code === 'pro' ? 'featured' : ''}">
      ${plan.code === 'pro' ? `<span class="plan-badge">${
        paymentDemoReady ? 'Wompi Sandbox' : demoPlanActivation ? 'Piloto Pro' : 'Próximamente'
      }</span>` : ''}
      <h2>${esc(plan.name)}</h2>
      <div class="plan-price">${price(plan)}</div>
      <p class="plan-description">${esc(plan.description)}</p>
      <ul class="plan-features">${plan.features.map((feature) => `<li>${esc(feature)}</li>`).join('')}</ul>
      ${plan.code === 'pro' ? `<p class="plan-terms">${paymentDemoReady
        ? 'Pago único de prueba · renovación manual · no se almacena información de tarjeta.'
        : demoPlanActivation
          ? 'Hoy pagas $0. Se activa al instante, sin tarjeta y sin cobros automáticos al terminar.'
          : 'Activación manual del piloto · sin cobros automáticos · vigencia de 30 días.'}</p>` : ''}
      <a class="portal-button ${plan.code === 'free' ? 'secondary' : ''}" href="${href}"
        ${action}
        ${inerte ? 'aria-disabled="true"' : ''}>${esc(label)}</a>
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
  // Quien llegó aquí desde una ficha bloqueada acaba de comprar el derecho a ver
  // ESA ficha. Dejarlo en la página de planes lo obliga a repetir la búsqueda que
  // acaba de pagar, así que se le devuelve solo. La nota no se borra aquí: la
  // consume el Radar al reabrirla, que es el único que sabe si llegó a abrirse.
  const pendiente = demoButton ? window.__fichaPendiente?.leer() : null;
  // Cada camino termina en algo distinto: uno concede el acceso ya, el otro solo
  // deja constancia. Anunciar "solicitud registrada" a quien acaba de obtener el
  // plan lo deja sin saber si tiene que esperar a alguien.
  message.textContent = demoButton
    ? (pendiente
      ? 'Listo: tu acceso completo está activo. Te devolvemos a la ficha que estabas viendo…'
      : 'Listo: tu acceso completo está activo. Ya puedes abrir cualquier ficha sin límite.')
    : 'Solicitud registrada. Te avisaremos cuando el checkout demo esté habilitado.';
  if (pendiente) {
    // La espera es para que el mensaje se lea; sin ella el salto parece un fallo.
    setTimeout(() => { location.href = '/'; }, 1_200);
    return;
  }
  const plansData = await fetch('/api/plans').then((result) => result.json());
  render(plansData.plans || []);
});

init().catch(() => {
  document.getElementById('message').className = 'message error';
  document.getElementById('message').textContent = 'No se pudieron cargar los planes. Intenta de nuevo.';
});

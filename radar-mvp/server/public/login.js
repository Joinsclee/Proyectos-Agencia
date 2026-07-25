'use strict';

const $ = (id) => document.getElementById(id);
let mode = 'register';
const guestFavorites = (() => {
  try {
    const value = JSON.parse(localStorage.getItem('radar_guest_favorites_v1') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
})();
const radarPreferences = (() => {
  try {
    const value = JSON.parse(localStorage.getItem('radar_preferences_v1') || 'null');
    return value?.complete === true ? value : null;
  } catch {
    return null;
  }
})();
const savedSimulations = (() => {
  try {
    const value = JSON.parse(localStorage.getItem('radar_simulations_v1') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
})();
const radarAlertDraft = (() => {
  try {
    const value = JSON.parse(localStorage.getItem('radar_alert_v1') || 'null');
    return value?.status === 'draft' ? value : null;
  } catch {
    return null;
  }
})();

function pendingSubtitle(register) {
  if (!guestFavorites.length && !radarPreferences && !savedSimulations.length && !radarAlertDraft) {
    return register ? 'Empieza a ver las oportunidades antes que nadie.' : 'Ingresa para ver tus oportunidades.';
  }
  return register
    ? 'Crea tu cuenta para continuar con el plan que ya preparaste.'
    : 'Ingresa para continuar con tu Radar y tus guardados.';
}

function renderPendingContext() {
  const box = $('pending-context');
  const parts = [];
  if (radarPreferences) {
    const type = ({ apartment: 'apartamentos', house: 'casas', lot: 'lotes', commercial: 'locales' }[radarPreferences.type] || 'inmuebles');
    const city = radarPreferences.city
      ? radarPreferences.city.charAt(0).toUpperCase() + radarPreferences.city.slice(1)
      : 'Colombia';
    parts.push(`Radar de ${type} en ${city}`);
  }
  if (guestFavorites.length) parts.push(`${guestFavorites.length} guardado${guestFavorites.length === 1 ? '' : 's'}`);
  if (savedSimulations.length) parts.push(`${savedSimulations.length === 1 ? '1 simulación' : `${savedSimulations.length} simulaciones`}`);
  if (radarAlertDraft) parts.push('alerta semanal');
  if (!parts.length) {
    box.hidden = true;
    return;
  }
  const subject = parts.length > 2
    ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`
    : parts.join(' y ');
  box.textContent = `Plan listo en este dispositivo: ${subject}.`;
  box.hidden = false;
}

function setMode(nextMode) {
  mode = nextMode;
  const register = nextMode === 'register';
  $('tab-register').classList.toggle('active', register);
  $('tab-register').setAttribute('aria-selected', String(register));
  $('tab-login').classList.toggle('active', !register);
  $('tab-login').setAttribute('aria-selected', String(!register));
  $('name-field').style.display = register ? 'block' : 'none';
  $('title').textContent = register ? 'Crea tu cuenta' : 'Bienvenido de nuevo';
  $('subtitle').textContent = pendingSubtitle(register);
  $('submit').textContent = register ? 'Crear cuenta gratis →' : 'Iniciar sesión →';
  $('password').setAttribute('autocomplete', register ? 'new-password' : 'current-password');
  hideMsg();
}

function showMsg(text, ok) {
  const message = $('msg');
  message.textContent = text;
  message.className = 'msg ' + (ok ? 'ok' : 'err');
}

function hideMsg() {
  $('msg').className = 'msg';
  $('msg').textContent = '';
}

$('tab-register').addEventListener('click', () => setMode('register'));
$('tab-login').addEventListener('click', () => setMode('login'));

$('google-btn').addEventListener('click', async () => {
  try {
    const config = await fetch('/api/config').then((response) => response.json());
    const supabaseUrl = new URL(config.supabaseUrl);
    if (supabaseUrl.protocol !== 'https:') throw new Error('Proveedor OAuth no seguro');
    const redirect = encodeURIComponent(location.origin + '/auth/callback');
    location.href = `${supabaseUrl.origin}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
  } catch {
    showMsg('No se pudo iniciar Google. Intenta de nuevo.', false);
  }
});

renderPendingContext();
setMode('register');

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMsg();
  const button = $('submit');
  button.disabled = true;
  const payload = { email: $('email').value, password: $('password').value };
  if (mode === 'register') payload.name = $('name').value;

  try {
    const response = await fetch('/api/auth/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) {
      showMsg(data.error || 'Algo salió mal.', false);
      button.disabled = false;
      return;
    }

    if (mode === 'register') {
      showMsg('¡Cuenta creada! Iniciando sesión…', true);
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: payload.email, password: payload.password }),
      });
      const loginData = await loginResponse.json();
      if (loginData.ok) {
        localStorage.setItem('radar_token', loginData.token);
        location.href = '/';
      } else {
        setMode('login');
        $('email').value = payload.email;
        button.disabled = false;
      }
    } else {
      showMsg('¡Bienvenido! Entrando…', true);
      localStorage.setItem('radar_token', data.token);
      window.setTimeout(() => (location.href = '/'), 500);
    }
  } catch {
    showMsg('Error de conexión. Intenta de nuevo.', false);
    button.disabled = false;
  }
});

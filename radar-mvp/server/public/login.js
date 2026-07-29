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

// La ficha que el usuario estaba mirando cuando vino aquí, si vino desde una.
// Se lee, no se borra: quien la consume es el Radar al reabrirla, que es el único
// que sabe si el viaje terminó de verdad.
const fichaPendiente = (() => {
  try { return window.__fichaPendiente?.leer() || null; } catch { return null; }
})();

function pendingSubtitle(register) {
  // Quien llega desde una ficha no viene a "crear una cuenta": viene a ver ESA
  // ficha. Prometerle la vuelta es lo que convierte el formulario en un trámite
  // que vale la pena, y por eso este mensaje gana a cualquier otro.
  if (fichaPendiente) {
    return register
      ? 'Crea tu cuenta y te devolvemos a la ficha que estabas viendo.'
      : 'Ingresa y te devolvemos a la ficha que estabas viendo.';
  }
  if (!guestFavorites.length && !radarPreferences && !savedSimulations.length && !radarAlertDraft) {
    return register ? 'Empieza a ver las oportunidades antes que nadie.' : 'Ingresa para ver tus oportunidades.';
  }
  return register
    ? 'Crea tu cuenta para continuar con el plan que ya preparaste.'
    : 'Ingresa para continuar con tu Radar y tus guardados.';
}

function renderPendingContext() {
  const box = $('pending-context');
  const frases = [];
  // El subtítulo ya prometió la vuelta; aquí se NOMBRA la ficha, que es lo que
  // convierte la promesa en comprobable: el usuario ve que el sistema sabe cuál
  // es antes de darle un solo dato suyo. Repetir la promesa sería ruido.
  if (fichaPendiente) {
    frases.push(fichaPendiente.titulo
      ? `Ficha guardada: ${fichaPendiente.titulo}.`
      : 'Ficha guardada en este dispositivo.');
  }
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
  if (parts.length) {
    const subject = parts.length > 2
      ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`
      : parts.join(' y ');
    frases.push(`Plan listo en este dispositivo: ${subject}.`);
  }
  if (!frases.length) {
    box.hidden = true;
    return;
  }
  box.textContent = frases.join(' ');
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
  const password = $('password');
  password.setAttribute('autocomplete', register ? 'new-password' : 'current-password');
  password.setAttribute('placeholder', register ? 'Mínimo 8 caracteres' : 'Tu contraseña');
  if (register) password.setAttribute('minlength', '8');
  else password.removeAttribute('minlength');
  hideMsg();
}

/**
 * Guarda la sesión completa, no solo el token de acceso.
 *
 * El de acceso caduca a la hora. Sin el de refresco la sesión se apagaba sola sin
 * avisar: la pestaña seguía diciendo «Mi cuenta» y las peticiones nuevas llegaban
 * como anónimas, así que a alguien registrado le aparecía «crea tu cuenta gratis»
 * al cambiar un filtro. El acceso con Google ya lo guardaba.
 */
function guardarSesion(data) {
  localStorage.setItem('radar_token', data.token);
  if (data.refreshToken) localStorage.setItem('radar_refresh', data.refreshToken);
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

/**
 * Los permisos que hay que pedirle a cada proveedor.
 *
 * Azure NO devuelve el correo si no se le pide expresamente, y Supabase Auth
 * exige un correo válido para crear la cuenta: sin esto, el usuario completa todo
 * el recorrido de Microsoft, acepta los permisos y vuelve con un error. Google sí
 * lo entrega por defecto, de ahí que uno lleve permisos y el otro no.
 */
const PERMISOS_OAUTH = { azure: 'email' };

/**
 * Entrar con un proveedor externo.
 *
 * Mismo camino para Google y Microsoft: los dos son OAuth de Supabase y solo
 * cambia el nombre del proveedor. Se comparte la función para que no haya dos
 * sitios donde comprobar que la URL es https, que es lo único que impide que un
 * `supabaseUrl` envenenado mande al usuario a un dominio ajeno con su sesión.
 */
async function entrarCon(proveedor, nombre) {
  try {
    const config = await fetch('/api/config').then((response) => response.json());
    const supabaseUrl = new URL(config.supabaseUrl);
    if (supabaseUrl.protocol !== 'https:') throw new Error('Proveedor OAuth no seguro');
    const redirect = encodeURIComponent(location.origin + '/auth/callback');
    const permisos = PERMISOS_OAUTH[proveedor];
    location.href = `${supabaseUrl.origin}/auth/v1/authorize?provider=${proveedor}`
      + `&redirect_to=${redirect}${permisos ? `&scopes=${encodeURIComponent(permisos)}` : ''}`;
  } catch {
    showMsg(`No se pudo iniciar ${nombre}. Intenta de nuevo.`, false);
  }
}

$('google-btn').addEventListener('click', () => entrarCon('google', 'Google'));

// Microsoft solo aparece cuando el proveedor está dado de alta en Supabase. Un
// botón que devuelve un error de OAuth al pulsarlo es peor que no tenerlo.
(async () => {
  const boton = $('microsoft-btn');
  if (!boton) return;
  try {
    const config = await fetch('/api/config').then((r) => r.json());
    if (!config.microsoftLoginReady) return;
    boton.hidden = false;
    boton.addEventListener('click', () => entrarCon('azure', 'Microsoft'));
  } catch { /* si la config no responde, el botón se queda oculto */ }
})();

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
        guardarSesion(loginData);
        location.href = '/';
      } else {
        setMode('login');
        $('email').value = payload.email;
        button.disabled = false;
      }
    } else {
      showMsg('¡Bienvenido! Entrando…', true);
      guardarSesion(data);
      window.setTimeout(() => (location.href = '/'), 500);
    }
  } catch {
    showMsg('Error de conexión. Intenta de nuevo.', false);
    button.disabled = false;
  }
});

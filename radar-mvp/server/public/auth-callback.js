'use strict';

/**
 * La vuelta de un acceso con Google o Microsoft.
 *
 * Si algo falla, este es el único sitio donde el usuario se entera, así que el
 * mensaje tiene que decirle qué hacer. Antes se pintaba tal cual lo que mandaba
 * Supabase —en inglés, a medio descodificar y hablando siempre de Google— y el
 * resultado era «Unable to exchange external code%3A M.C5», que no ayuda ni al
 * usuario ni a quien tiene que arreglarlo.
 */
const params = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
const token = params.get('access_token');
const crudo = params.get('error_description') || params.get('error')
  || query.get('error_description') || query.get('error');

/** Con qué proveedor salió de aquí. Lo dejó `login.js` antes de redirigir. */
function proveedor() {
  try {
    return ({ google: 'Google', azure: 'Microsoft' })[sessionStorage.getItem('radar_oauth')] || null;
  } catch {
    return null;
  }
}

/**
 * Descodifica lo que llega, aunque venga codificado dos veces.
 *
 * `URLSearchParams` ya descodifica una vez, pero Supabase manda el mensaje dentro
 * del fragmento y a veces llega con otra capa encima: de ahí el «%3A» que se veía
 * en pantalla donde debería ir un dos puntos.
 */
function limpiar(texto) {
  if (!texto) return '';
  let salida = String(texto).replace(/\+/g, ' ');
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(salida); i += 1) {
    try { salida = decodeURIComponent(salida); } catch { break; }
  }
  return salida.trim();
}

/**
 * Traduce el fallo a algo que se pueda accionar.
 *
 * Los tres que importan son de configuración, no del usuario: por más veces que
 * lo intente no va a entrar, así que decirle «vuelve a intentarlo» sería mentirle.
 * En esos casos se le dice que el problema es nuestro.
 */
function explicar(mensaje, quien) {
  const con = quien ? ` con ${quien}` : '';
  const m = mensaje.toLowerCase();
  if (m.includes('unable to exchange external code') || m.includes('invalid_client') || m.includes('unauthorized_client')) {
    return {
      titulo: 'No pudimos completar el ingreso',
      texto: `El acceso${con} está a medio configurar de nuestro lado. Ya estamos avisados; `
        + 'entra con tu correo y contraseña mientras lo resolvemos.',
      reintentar: false,
    };
  }
  if (m.includes('redirect_uri') || m.includes('redirect uri')) {
    return {
      titulo: 'No pudimos completar el ingreso',
      texto: `La dirección de retorno${con} no está autorizada. Es cosa nuestra: entra con tu `
        + 'correo y contraseña mientras lo corregimos.',
      reintentar: false,
    };
  }
  // Supabase lo dice de varias formas según por dónde falle; la que manda al
  // pedirle el correo a Azure sin el permiso `email` es «error getting user email
  // from external provider».
  if (m.includes('email') && /missing|required|no email|getting user email|without email/.test(m)) {
    return {
      titulo: 'Falta tu correo',
      texto: `${quien || 'El proveedor'} no nos compartió tu correo, y lo necesitamos para crear la cuenta. `
        + 'Puedes registrarte con correo y contraseña.',
      reintentar: false,
    };
  }
  if (m.includes('access_denied') || m.includes('cancel')) {
    return {
      titulo: 'Ingreso cancelado',
      texto: `Cancelaste el acceso${con}. Puedes volver a intentarlo cuando quieras.`,
      reintentar: true,
    };
  }
  return {
    titulo: 'Ups…',
    texto: `No pudimos completar el ingreso${con}. Vuelve a intentarlo o entra con tu correo y contraseña.`,
    reintentar: true,
  };
}

function fail(mensajeCrudo) {
  const quien = proveedor();
  const { titulo, texto } = explicar(limpiar(mensajeCrudo), quien);
  document.getElementById('spinner').style.display = 'none';
  document.getElementById('title').textContent = titulo;
  document.getElementById('msg').textContent = texto;
  document.getElementById('err').style.display = 'block';
  // El mensaje técnico no se pierde: queda en la consola para quien tenga que
  // arreglarlo, sin ocupar la pantalla de quien solo quería entrar.
  if (mensajeCrudo) console.error('auth/callback:', limpiar(mensajeCrudo));
}

if (token) {
  localStorage.setItem('radar_token', token);
  const refresh = params.get('refresh_token');
  if (refresh) localStorage.setItem('radar_refresh', refresh);
  try { sessionStorage.removeItem('radar_oauth'); } catch { /* da igual */ }
  history.replaceState(null, '', '/auth/callback');
  location.replace('/');
} else if (crudo) {
  fail(crudo);
} else if (query.get('code')) {
  // Llegó el código pero no el token: el proveedor está a medias en Supabase.
  fail('unable to exchange external code');
} else {
  fail('');
}

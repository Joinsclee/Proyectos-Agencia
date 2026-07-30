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

/**
 * Pide la contraseña nueva antes de dejar entrar.
 *
 * Un enlace de recuperación trae un token de sesión válido, así que la tentación
 * es entrar directamente. No se hace: quien llega aquí es porque no puede entrar,
 * y meterlo en el Radar sin cambiar nada lo dejaría igual de fuera la próxima vez.
 * Peor aún, el enlace del correo se quedaría siendo la única llave de la cuenta.
 *
 * El token NO se guarda como sesión hasta que la contraseña esté cambiada.
 */
function pedirContrasenaNueva(tokenRecuperacion) {
  document.getElementById('spinner').style.display = 'none';
  document.getElementById('title').textContent = 'Elige tu contraseña nueva';
  document.getElementById('msg').textContent = 'Con esta contraseña entrarás a partir de ahora.';
  const form = document.getElementById('form-nueva');
  const aviso = document.getElementById('aviso-nueva');
  const boton = document.getElementById('guardar-nueva');
  form.hidden = false;
  document.getElementById('nueva').focus();

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    aviso.textContent = '';
    aviso.className = 'aviso';
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRecuperacion, password: document.getElementById('nueva').value }),
      });
      const data = await res.json();
      if (!data.ok) {
        aviso.textContent = data.error || 'No se pudo cambiar la contraseña.';
        aviso.className = 'aviso err';
        boton.disabled = false;
        boton.textContent = 'Guardar y entrar';
        return;
      }
      // Cambiada: ahora sí se guarda la sesión y entra, sin obligarle a escribir
      // otra vez la contraseña que acaba de elegir.
      aviso.textContent = 'Listo. Entrando…';
      aviso.className = 'aviso ok';
      localStorage.setItem('radar_token', tokenRecuperacion);
      const refresh = params.get('refresh_token');
      if (refresh) localStorage.setItem('radar_refresh', refresh);
      history.replaceState(null, '', '/auth/callback');
      location.replace('/');
    } catch {
      aviso.textContent = 'Se cortó la conexión. Inténtalo de nuevo.';
      aviso.className = 'aviso err';
      boton.disabled = false;
      boton.textContent = 'Guardar y entrar';
    }
  });
}

// `type=recovery` lo pone Supabase en el enlace del correo. Se comprueba ANTES
// que el camino normal: los dos traen token, y la diferencia es justo que este no
// debe entrar todavía.
if (token && params.get('type') === 'recovery') {
  pedirContrasenaNueva(token);
} else if (token) {
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

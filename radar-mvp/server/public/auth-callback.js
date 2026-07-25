'use strict';

const params = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
const token = params.get('access_token');
const error = params.get('error_description') || params.get('error') || query.get('error_description') || query.get('error');

function fail(text) {
  document.getElementById('spinner').style.display = 'none';
  document.getElementById('title').textContent = 'Ups…';
  document.getElementById('msg').textContent = text || 'No se pudo iniciar sesión con Google.';
  document.getElementById('err').style.display = 'block';
}

if (token) {
  localStorage.setItem('radar_token', token);
  const refresh = params.get('refresh_token');
  if (refresh) localStorage.setItem('radar_refresh', refresh);
  history.replaceState(null, '', '/auth/callback');
  location.replace('/');
} else if (error) {
  fail(error);
} else if (query.get('code')) {
  fail('Falta completar la configuración de Google en Supabase (anon key / PKCE).');
} else {
  fail();
}

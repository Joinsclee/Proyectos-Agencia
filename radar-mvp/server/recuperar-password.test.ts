/**
 * Recuperar la contraseña, con la propiedad que de verdad importa: que el
 * formulario no sirva para averiguar quién tiene cuenta en el Radar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fuente = await readFile(new URL('./recuperar-password.ts', import.meta.url), 'utf8');

test('recuperar: la respuesta no distingue si el correo tiene cuenta', async () => {
  // Una respuesta distinta para «existe» y «no existe» convierte este formulario
  // en una lista de clientes consultable probando direcciones. Y los clientes del
  // Radar son inversionistas inmobiliarios: saber quién está dentro tiene valor
  // para un tercero.
  //
  // Se comprueba sobre la fuente porque el camino real llama a Supabase: lo que
  // hay que fijar es que exista UN solo texto de respuesta y que el error de
  // generación se trague, no el detalle de la llamada.
  const respuestas = fuente.match(/return RESPUESTA_NEUTRA;/g) ?? [];
  assert.ok(
    respuestas.length >= 3,
    'los caminos de éxito, de cuenta inexistente y de fallo deben devolver la misma respuesta',
  );
  assert.match(
    fuente,
    /if \(error \|\| !data\?\.properties\?\.action_link\) \{[\s\S]{0,220}return RESPUESTA_NEUTRA;/,
    'el error de generateLink —que es donde Supabase delata la existencia— debe acabar en la respuesta neutra',
  );
});

test('recuperar: el correo mal escrito sí se avisa', async () => {
  const { solicitarRecuperacion } = await import('./recuperar-password.js');
  // Esto no revela nada sobre quién tiene cuenta, y callarlo dejaría a la persona
  // esperando un correo que nunca se pidió bien.
  const r = await solicitarRecuperacion({ email: 'esto-no-es-un-correo' });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /correo/i);
});

test('recuperar: la contraseña nueva exige un mínimo', async () => {
  const { restablecerPassword } = await import('./recuperar-password.js');
  const r = await restablecerPassword({ token: 'x'.repeat(40), password: '123' });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /8 caracteres/);
});

test('recuperar: un enlace inservible se explica y dice qué hacer', async () => {
  // Caduca en una hora y es de un solo uso, así que este caso es frecuente: quien
  // lo encuentra necesita saber que no está roto, sino gastado, y cómo pedir otro.
  const { restablecerPassword } = await import('./recuperar-password.js');
  const r = await restablecerPassword({ token: 'token-que-no-vale-nada-pero-es-largo', password: 'unaClaveLarga1' });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /caduc|ya se us/i);
  assert.match((r as { error: string }).error, /Olvidaste tu contraseña/i);
});

test('recuperar: el cambio no fija la sesión sobre el cliente de datos', async () => {
  // La regla dura del proyecto: `signInWithPassword`/`setSession` sobre el cliente
  // compartido `supabase` le fija la sesión del usuario, y a partir de ahí TODAS
  // las consultas corren con RLS de esa persona → cero filas para todo el mundo.
  // Ya pasó una vez. El cambio se hace validando con `authClient` y escribiendo
  // con la API de administración, nunca iniciando sesión.
  assert.doesNotMatch(fuente, /supabase\.auth\.signInWithPassword/, 'nunca sobre el cliente de datos');
  assert.doesNotMatch(fuente, /supabase\.auth\.setSession/, 'nunca sobre el cliente de datos');
  assert.match(fuente, /authClient\.auth\.getUser\(token\)/, 'el token se valida con el cliente aislado');
  assert.match(fuente, /supabase\.auth\.admin\.updateUserById/, 'el cambio va por la API de administración');
});

test('recuperar: una cuenta de Google no recibe enlace de contraseña', async () => {
  // Quien entra con Google o Microsoft nunca creó una contraseña, así que un
  // enlace para «restablecerla» lo manda a inventarse una que no necesita. Recibe
  // un correo distinto que le dice por dónde entra. La respuesta en pantalla no
  // cambia: si variara, volvería a delatar qué cuentas existen y de qué tipo son.
  const { proveedorExterno } = await import('./recuperar-password.js');
  assert.equal(proveedorExterno({ identities: [{ provider: 'google' }] }), 'Google');
  assert.equal(proveedorExterno({ identities: [{ provider: 'azure' }] }), 'Microsoft');
});

test('recuperar: quien tiene correo Y Google sí puede recuperar', async () => {
  // Una cuenta puede llevar varias identidades. Si entre ellas está la de correo,
  // esa persona SÍ tiene contraseña, y negarle la recuperación por haber vinculado
  // Google la dejaría fuera sin motivo.
  const { proveedorExterno } = await import('./recuperar-password.js');
  assert.equal(proveedorExterno({ identities: [{ provider: 'email' }, { provider: 'google' }] }), null);
  assert.equal(proveedorExterno({ identities: [{ provider: 'email' }] }), null);
  assert.equal(proveedorExterno({ identities: [] }), null);
  assert.equal(proveedorExterno(null), null);
});

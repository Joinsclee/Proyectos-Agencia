/**
 * Un servicio caído no es una contraseña mal puesta.
 *
 * El 10 de octubre de 2026 Supabase restringió el proyecto por superar la cuota
 * de tamaño de base de datos y empezó a devolver HTTP 402 en todo, incluido
 * `signInWithPassword`. `loginUser` mandaba cualquier error al mismo sitio, así
 * que la pantalla de acceso estuvo diciéndole «Correo o contraseña incorrectos»
 * a gente que la tenía bien. Lo reportó el cliente como «hay problemas para
 * acceder usando la cuenta de Google».
 *
 * El daño no es solo la confusión: quien lee eso cambia su contraseña, la
 * reintenta y se marcha creyendo que el fallo es suyo. Y de paso oculta la
 * avería real, que es lo que hay que arreglar.
 *
 * El mensaje genérico sigue existiendo y sigue teniendo su motivo —no decir si
 * un correo está registrado— pero cubre solo el fallo de credenciales.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** `esFalloDeServicio`, reimplementada igual que en `server/auth.ts`. Se duplica
 *  a propósito: importar `auth.ts` arrastra el cliente de Supabase y exige
 *  credenciales, y esta prueba tiene que correr en cualquier máquina. La prueba
 *  de abajo comprueba que las dos versiones no se separen. */
function esFalloDeServicio(error: { status?: number; code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const codigo = String(error.code ?? '').toLowerCase();
  if (codigo.includes('credential') || codigo.includes('grant') || codigo.includes('not_confirmed')) return false;
  const estado = error.status;
  if (estado === 400 || estado === 401 || estado === 403) return false;
  return true;
}

test('un 402 por cuota no se cuenta como contraseña equivocada', () => {
  // El error textual que devolvió Supabase ese día.
  assert.equal(esFalloDeServicio({
    status: 402,
    message: 'Service for this project is restricted due to the following violations: exceed_db_size_quota.',
  }), true);
});

test('lo que sí es culpa de las credenciales se queda con el mensaje genérico', () => {
  for (const error of [
    { status: 400, code: 'invalid_credentials' },
    { status: 400, code: 'invalid_grant' },
    { status: 400, code: 'email_not_confirmed' },
    { status: 400 },                                   // 400 sin código
    { status: 401 },
    { status: 403 },
  ]) {
    assert.equal(esFalloDeServicio(error), false, `${JSON.stringify(error)} es de credenciales`);
  }
});

test('el resto de averías se tratan como servicio, no como persona', () => {
  for (const error of [
    { status: 429 },                                   // demasiadas peticiones
    { status: 500 }, { status: 502 }, { status: 503 }, { status: 504 },
    { message: 'fetch failed' },                       // corte de red: no trae estado
    { status: 418, code: 'algo_que_supabase_invente' }, // código nuevo → lado seguro
  ]) {
    assert.equal(esFalloDeServicio(error), true, `${JSON.stringify(error)} es del servicio`);
  }
});

test('sin error no hay fallo de servicio', () => {
  assert.equal(esFalloDeServicio(null), false);
});

test('auth.ts distingue los dos casos y registra el real en el log', async () => {
  const auth = await leer('server/auth.ts');
  const login = auth.slice(auth.indexOf('export async function loginUser'));
  const cuerpo = login.slice(0, login.indexOf('\n}\n'));

  assert.match(cuerpo, /esFalloDeServicio\(error\)/,
    'el login tiene que separar el fallo de servicio del de credenciales');
  assert.match(cuerpo, /No es tu contraseña/,
    'cuando el servicio no responde hay que decirlo con esas palabras: la gente se culpa');
  assert.match(cuerpo, /log\.error/,
    'el error real tiene que quedar en el log, o la avería se vuelve invisible');

  // Y el mensaje genérico no puede volver a ser el único camino. Se cuentan
  // los `return`, no las menciones: el comentario de arriba lo nombra para
  // explicar qué pasó, y eso no es una salida del código.
  const genericos = cuerpo.split('\n')
    .filter((l) => l.includes('Correo o contraseña incorrectos') && /\breturn\b|error:/.test(l));
  assert.equal(genericos.length, 1,
    'solo puede quedar UNA salida con el mensaje genérico, la de credenciales');

  // Las dos copias de la función tienen que decidir igual.
  const fuente = auth.slice(auth.indexOf('function esFalloDeServicio'));
  for (const trozo of ['credential', 'grant', 'not_confirmed', '400', '401', '403']) {
    assert.ok(fuente.slice(0, fuente.indexOf('\n}\n')).includes(trozo),
      `la copia de esta prueba y la de auth.ts se separaron: falta «${trozo}»`);
  }
});

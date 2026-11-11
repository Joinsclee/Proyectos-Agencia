/**
 * Guardia sobre el muro de pago, en sus DOS direcciones.
 *
 * El muro se rompió por las dos a la vez y ninguna prueba lo notó:
 *
 *  · Hacia fuera: el cliente pedía los listados sin la cabecera `Authorization`,
 *    así que el servidor —que decide con `planDe(getUserFromToken(...))`— veía
 *    `anonimo` para todo el mundo. Ningún suscriptor podía desbloquear nada por
 *    más que hubiera pagado.
 *  · Hacia dentro: `/api/property` devolvía la fila cruda sin mirar el plan, así
 *    que bastaba pedir por id una ficha que el listado sí bloqueaba para leer su
 *    dirección sin credencial ninguna.
 *
 * Las dos son de una línea y las dos se ven igual de bien en una revisión: por eso
 * la prueba mira el texto. Una petición a la que se le olvida la cabecera compila,
 * responde 200 y solo se nota cuando un cliente que paga se queja.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** La línea donde se hace una petición, para no pelearse con los paréntesis anidados. */
async function lineaDePeticion(fragmento: string): Promise<string> {
  const app = await leer('server/public/app.js');
  const linea = app.split('\n').find((l) => l.includes(fragmento));
  assert.ok(linea, `no se encontró la petición que contiene ${fragmento}`);
  return linea;
}

test('muro: los listados se piden identificándose', async () => {
  const linea = await lineaDePeticion('`/api/${state.tab}?${qs}`');
  // Dos formas válidas de identificarse: poner la cabecera a mano, o usar
  // `fetchConSesion`, que además renueva el token si caducó. Lo que no vale es
  // ninguna de las dos: sin cabecera, un suscriptor se identifica como anónimo y
  // recibe todo bloqueado por más que haya pagado.
  assert.match(
    linea,
    /headers:\s*authHeaders\(\)|fetchConSesion\(/,
    'el listado se pide sin cabecera: un suscriptor se identificaría como anónimo',
  );
});

test('muro: `fetchConSesion` sí pone la cabecera', async () => {
  // La prueba de arriba acepta `fetchConSesion` como forma de identificarse, así
  // que hay que comprobar que de verdad la pone: si alguien la vaciara, aquella
  // seguiría pasando y el muro se caería en silencio.
  const app = await leer('server/public/app.js');
  const cuerpo = app.slice(app.indexOf('async function fetchConSesion'));
  const hasta = cuerpo.slice(0, cuerpo.indexOf('\n}'));
  assert.match(hasta, /\.\.\.authHeaders\(\)/, '`fetchConSesion` dejó de mandar la cabecera de sesión');
});

test('muro: la ficha individual se pide identificándose', async () => {
  const linea = await lineaDePeticion('`/api/property?kind=');
  // Tres formas válidas, de menos a más: la cabecera a mano, `fetchConSesion`
  // (que además renueva tras un 401) y `pedirJSON` (que además detecta el caso
  // que NO da 401: 200 con plan anónimo). Lo que no vale es `fetch` pelado.
  assert.match(
    linea,
    /headers:\s*authHeaders\(\)|fetchConSesion\(|pedirJSON\(/,
    'la ficha se pide sin identificarse: a un suscriptor se le abriría bloqueada',
  );
});

test('muro: /api/property aplica el plan antes de responder', async () => {
  // Se comprueba la cadena, no la expresión exacta: identificar a quien pregunta
  // → derivar su plan → redactar antes de enviar. Cualquier refactor puede
  // reescribir la forma, pero no puede saltarse ninguno de los tres pasos.
  const index = await leer('server/index.ts');
  const bloque = index.slice(index.indexOf("path === '/api/property'"));
  const handler = bloque.slice(0, bloque.indexOf('/api/portal'));
  assert.match(handler, /getUserFromToken\(bearer\(req\)\)/, 'no identifica a quien pregunta');
  assert.match(handler, /planDe\(/, 'no deriva el plan');
  assert.match(handler, /redactar\(/, 'no redacta la fila antes de enviarla');
});

test('muro: la portada se pide identificándose', async () => {
  const linea = await lineaDePeticion("'/api/home'");
  assert.match(
    linea,
    /headers:\s*authHeaders\(\)|fetchConSesion\(|pedirJSON\(/,
    'la portada se pide sin identificarse: un suscriptor vería sus propios destacados bloqueados',
  );
});

test('muro: `pedirJSON` identifica Y cubre el caso que no da 401', async () => {
  // Las dos pruebas de arriba aceptan `pedirJSON` como forma de identificarse,
  // así que hay que comprobar que de verdad lo hace. La cadena es
  // `pedirJSON` → `fetchConSesion` → `...authHeaders()`, y el último eslabón ya
  // lo vigila la prueba de `fetchConSesion`.
  const app = await leer('server/public/app.js');
  const cuerpo = app.slice(app.indexOf('async function pedirJSON'));
  const hasta = cuerpo.slice(0, cuerpo.indexOf('\n}'));
  assert.match(hasta, /fetchConSesion\(/, '`pedirJSON` dejó de pasar por la envoltura con sesión');

  // Y lo que justifica que exista: `/api/property` y `/api/home` NO responden
  // 401 a un token caducado, responden 200 con `plan: 'anonimo'` y la ficha
  // recortada. Sin esta rama, un suscriptor con la pestaña abierta más de una
  // hora ve la ficha tapada pidiéndole que cree una cuenta gratis.
  assert.match(hasta, /plan === 'anonimo'/, '`pedirJSON` dejó de detectar el caso silencioso');
  assert.match(hasta, /renovarSesion\(\)/, '`pedirJSON` detecta el caso pero ya no renueva');
});

test('muro: /api/home aplica el plan antes de responder', async () => {
  // La portada es la pantalla MÁS visitada y la única que nadie pidió: si alguna
  // ruta va a devolver filas crudas por descuido, será esta. Misma cadena que en
  // `/api/property`: identificar → derivar el plan → redactar antes de enviar.
  const index = await leer('server/index.ts');
  const bloque = index.slice(index.indexOf("path === '/api/home'"));
  const handler = bloque.slice(0, bloque.indexOf("path === '/api/facets'"));
  assert.match(handler, /getUserFromToken\(bearer\(req\)\)/, 'no identifica a quien pregunta');
  assert.match(handler, /planDe\(/, 'no deriva el plan');
  assert.match(handler, /redactarMixta\(/, 'no redacta las fichas destacadas antes de enviarlas');
});

test('muro: la portada nunca pide a la base lo que no puede entregar', async () => {
  // Defensa en profundidad: el muro lo aplica `redactarMixta`, pero la proyección
  // de la portada ni siquiera trae dirección, descripción ni enlace a la fuente.
  // Una ruta que no pide el dato no puede filtrarlo por descuido.
  const queries = await leer('server/queries.ts');
  const proyeccion = queries.slice(
    queries.indexOf('const COLS_DESTACADOS ='),
    queries.indexOf('const POOL_PORTAL'),
  );
  for (const prohibido of ['address', 'description', 'source_url', 'court_email', 'features->lat']) {
    assert.doesNotMatch(
      proyeccion,
      new RegExp(prohibido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `la portada está trayendo ${prohibido} de la base`,
    );
  }
});

test('muro: los listados siguen redactando en el servidor', async () => {
  // El filtrado tiene que ocurrir ANTES de que la fila salga del servidor: si se
  // hiciera en el navegador, los datos viajarían igual y bastaría abrir las
  // herramientas de desarrollo. Ya pasó una vez.
  const index = await leer('server/index.ts');
  assert.match(index, /redactarLista\(r\.data as any\[\], plan/);
});

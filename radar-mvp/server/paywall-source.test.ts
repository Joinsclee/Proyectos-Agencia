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
  assert.match(
    linea,
    /headers:\s*authHeaders\(\)/,
    'el listado se pide sin cabecera: un suscriptor se identificaría como anónimo',
  );
});

test('muro: la ficha individual se pide identificándose', async () => {
  const linea = await lineaDePeticion('`/api/property?kind=');
  assert.match(linea, /headers:\s*authHeaders\(\)/);
});

test('muro: /api/property aplica el plan antes de responder', async () => {
  const index = await leer('server/index.ts');
  const bloque = index.slice(index.indexOf("path === '/api/property'"));
  const handler = bloque.slice(0, bloque.indexOf('/api/portal'));
  assert.match(handler, /planDe\(await getUserFromToken\(bearer\(req\)\)\)/, 'no consulta el plan');
  assert.match(handler, /redactar\(/, 'no redacta la fila antes de enviarla');
});

test('muro: los listados siguen redactando en el servidor', async () => {
  // El filtrado tiene que ocurrir ANTES de que la fila salga del servidor: si se
  // hiciera en el navegador, los datos viajarían igual y bastaría abrir las
  // herramientas de desarrollo. Ya pasó una vez.
  const index = await leer('server/index.ts');
  assert.match(index, /redactarLista\(r\.data as any\[\], plan/);
});

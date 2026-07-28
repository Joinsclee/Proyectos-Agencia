/**
 * Guardia sobre el filtro por banco y sobre la coherencia de los desplegables.
 *
 * Las dos cosas que protege esta prueba se rompen igual de silenciosamente:
 *
 *  · El VALOR del filtro llega de la URL, y en la pestaña de remates el MISMO
 *    parámetro `bank` lleva el nombre del demandante ("Bancolombia S.A."). Si
 *    `queryBancos` lo pasara tal cual a `.eq('source', ...)`, cualquier valor
 *    desconocido devolvería cero filas, que se lee como «este banco no tiene
 *    inventario» en vez de como «ese filtro no existe».
 *
 *  · Los CONTEOS del desplegable salen de `facets()` y las filas del listado de
 *    `queryBancos()`. Son dos consultas distintas sobre la misma tabla, así que
 *    en cuanto una aplica un filtro que la otra no, el desplegable promete
 *    «Aval (219)» y al elegirlo salen 186. Este proyecto ya tuvo esa incoherencia
 *    entre el contador de la pestaña y el paginador, y se lee como un fallo.
 *
 * Se comprueba sobre el texto del archivo porque no hay forma de ejecutar estas
 * consultas sin una base real, y ambos descuidos compilan y responden 200.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leerQueries = () => readFile(new URL('./queries.ts', import.meta.url), 'utf8');

/** El cuerpo de una función exportada, hasta la siguiente declaración de nivel superior. */
function cuerpoDe(fuente: string, firma: string): string {
  const inicio = fuente.indexOf(firma);
  assert.notEqual(inicio, -1, `no se encontró ${firma}`);
  const resto = fuente.slice(inicio + firma.length);
  const fin = resto.search(/\nexport (async )?function |\nfunction /);
  return fin === -1 ? resto : resto.slice(0, fin);
}

test('bancos: el filtro por entidad se valida contra la lista blanca', async () => {
  const cuerpo = cuerpoDe(await leerQueries(), 'export async function queryBancos');
  assert.match(cuerpo, /q\.bank/, 'queryBancos no mira el filtro por banco');
  assert.match(
    cuerpo,
    /BANK_SOURCES[^\n]*\.includes\(q\.bank\)/,
    'el valor de `bank` llega a la consulta sin validarse contra BANK_SOURCES',
  );
});

test('facets y listado aplican los mismos filtros de saneamiento', async () => {
  const fuente = await leerQueries();
  const listado = cuerpoDe(fuente, 'function applyInmuebleFilters');
  const desplegables = cuerpoDe(fuente, 'export async function facets(');

  // Los topes del sistema, no los que el usuario elige: si el listado esconde una
  // ficha por precio absurdo, el desplegable tampoco puede contarla.
  for (const [tope, descripcion] of [
    ['MAX_DISPLAY_PRICE', 'tope de precio del sistema'],
    ['MAX_OPP_DISCOUNT', 'tope de descuento creíble'],
  ]) {
    assert.match(listado, new RegExp(tope), `el listado dejó de aplicar el ${descripcion}`);
    assert.match(
      desplegables,
      new RegExp(tope),
      `facets() no aplica el ${descripcion} y el listado sí: los conteos del desplegable van a mentir`,
    );
  }
});

test('facets: solo cuenta bancos cuando la muestra cabe entera', async () => {
  // El conteo por entidad se saca de las filas ya traídas, con un tope de 8.000.
  // Eso es exacto para el inventario bancario (unos cientos) y sería un número
  // truncado en el portal (108.000 filas), así que la rama tiene que seguir
  // condicionada a la fuente.
  const cuerpo = cuerpoDe(await leerQueries(), 'export async function facets(');
  assert.match(cuerpo, /if \(source === 'bancos'\)/, 'el conteo por entidad dejó de estar acotado a bancos');
  assert.match(cuerpo, /\.limit\(8000\)/, 'cambió el tope de la muestra: revisa si el conteo por entidad sigue siendo exacto');
});

/**
 * «Todas las fuentes» se apoya en las tres consultas afinadas, no en una nueva.
 *
 * La primera versión hacía su propia consulta a `inmuebles` sin filtrar por
 * `source` —portal y bancos comparten tabla, así que parecía lo natural— y llegó
 * a producción con dos fallos que salieron a la primera:
 *
 *  1. HTTP 500 al pulsar «Buscar» sin rellenar nada, que es lo más probable que
 *     hace alguien la primera vez: pedía un conteo EXACTO sobre 145.000 filas y
 *     agotaba el tiempo de la consulta.
 *  2. Y, ya arreglado eso, 9,4 segundos frente a los 0,89 de `/api/portal`, que
 *     ordena casi las mismas filas. La diferencia es el índice: filtrando por
 *     `source`, Postgres tiene por dónde entrar; sin filtrar, ordena las 145.000
 *     a mano.
 *
 * De fondo era el mismo error las dos veces: `queryPortal` y `queryBancos` ya
 * resuelven —y comentan— la escalera de reintentos ante timeout, el total exacto
 * cacheado, la exclusión de proyectos en preventa y la rotación de bancos.
 * Escribir una cuarta consulta era garantizar que las versiones se separaran.
 *
 * Aquí no se ejecuta nada contra la base: se comprueba que el código conserva
 * esa decisión, que es fácil de perder en un refactor y no falla de forma visible
 * hasta que hay 145.000 filas delante.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** El cuerpo de una función, de su firma a la llave que la cierra. */
function cuerpoDe(fuente: string, firma: string): string {
  const desde = fuente.indexOf(firma);
  assert.ok(desde > 0, `no se encuentra ${firma}`);
  let nivel = 0;
  for (let i = fuente.indexOf('{', desde); i < fuente.length; i += 1) {
    if (fuente[i] === '{') nivel += 1;
    else if (fuente[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return fuente.slice(desde, i + 1);
    }
  }
  return fuente.slice(desde);
}

test('«Todas» no abre su propia consulta contra `inmuebles`', async () => {
  const queries = await leer('server/queries.ts');
  const fn = cuerpoDe(queries, 'export async function queryTodas');

  // Las tres, y solo las tres.
  for (const consulta of ['queryPortal(', 'queryBancos(', 'queryRemates(']) {
    assert.ok(fn.includes(consulta), `queryTodas tiene que delegar en ${consulta}`);
  }
  // Una consulta propia a la tabla es justo lo que costó los dos fallos: sin
  // filtro de `source` no hay índice que valga, y sin heredar `queryPortal` no
  // hay ni reintentos ni conteo cacheado ni exclusión de preventa.
  assert.ok(
    !/supabase\s*\n?\s*\.from\('inmuebles'\)/.test(fn) && !fn.includes("from('inmuebles')"),
    'queryTodas no puede consultar `inmuebles` por su cuenta: pierde índice y pierde todo lo que las otras dos ya resuelven',
  );

  // Y el resto del archivo tampoco puede tener una cuarta consulta a medias.
  assert.ok(
    !queries.includes('queryInmueblesTodos'),
    'la consulta propia se retiró; volver a introducirla repite los dos fallos',
  );
});

test('la ventana de intercalado se salta el tope de página, pero solo por dentro', async () => {
  const queries = await leer('server/queries.ts');

  // Para saber quién ocupa la fila 100 del listado combinado hay que haber traído
  // 100 de cada fuente. `clampSize` topa en 60 —correcto para una página que
  // alguien mira, absurdo para el montón intermedio que nadie ve—. Sin esto, a
  // partir de la tercera página se agotaba el lado de inmuebles y el reparto
  // rellenaba con remates: 10 de 24, medido.
  for (const fn of ['export async function queryPortal', 'export async function queryBancos',
    'export async function queryRemates']) {
    assert.match(
      cuerpoDe(queries, fn),
      /q\._ventana \?\? clampSize\(q\.pageSize\)/,
      `${fn} tiene que honrar la ventana interna`,
    );
  }

  // Y no puede llegar del cliente: sería una forma de pedir 25 páginas de golpe.
  const index = await leer('server/index.ts');
  assert.ok(!index.includes('_ventana'), '`_ventana` es interna: `parseListQuery` no la lee');
});

/**
 * El buscador de la portada solo puede ofrecer lo que el servidor sabe filtrar.
 *
 * Es una caja destacada y es lo primero que se toca al entrar, así que es también
 * el sitio donde más barato sale añadir un campo de más: un desplegable nuevo son
 * ocho líneas de HTML y se ve estupendo en la captura. Lo que no se ve es que si
 * ese campo no viaja a la consulta, el listado devuelve lo mismo que sin él y la
 * persona se queda creyendo que filtró. Un buscador que miente es peor que uno
 * corto.
 *
 * Estas pruebas siguen la cadena entera de cada campo —caja → panel de filtros →
 * parámetro de la URL → `ListQuery`— y fallan en cuanto se rompa un eslabón, que
 * es justo lo que no se nota revisando el HTML.
 *
 * Se comprueba sobre el TEXTO de los archivos porque el frontend son scripts
 * clásicos sin empaquetador: no hay forma de importarlos aquí, y la alternativa
 * —levantar un navegador— convierte una prueba de un segundo en una de treinta.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** El bloque del buscador dentro de `app.js`, para no confundirlo con el resto. */
async function bloqueDelBuscador(): Promise<string> {
  const app = await leer('server/public/app.js');
  const inicio = app.indexOf('(function buscadorPrincipal() {');
  assert.notEqual(inicio, -1, 'el buscador ya no está envuelto en `buscadorPrincipal`');
  const fin = app.indexOf('\n})();', inicio);
  assert.notEqual(fin, -1, 'no se encontró el cierre del buscador');
  return app.slice(inicio, fin);
}

/**
 * La cadena de cada campo del buscador.
 *
 * A la izquierda el control del panel de filtros en el que escribe, a la derecha
 * el parámetro con el que sale en la petición. El precio tiene dos filas porque
 * en un remate no se filtra por precio de venta sino por la postura de arranque:
 * es otra columna de otra tabla, aunque en la caja se escriba en el mismo campo.
 */
const CADENA_DE_CAMPOS: Array<[string, string]> = [
  ['f-city', 'city'],
  ['f-type', 'type'],
  ['f-priceMax', 'priceMax'],
  ['f-bidMax', 'bidMax'],
];

test('buscador: cada campo llega hasta la consulta del servidor', async () => {
  const [buscador, app, queries, index] = await Promise.all([
    bloqueDelBuscador(),
    leer('server/public/app.js'),
    leer('server/queries.ts'),
    leer('server/index.ts'),
  ]);

  for (const [control, parametro] of CADENA_DE_CAMPOS) {
    assert.ok(
      buscador.includes(`'${control}'`),
      `el buscador dejó de escribir en ${control}: lo que se elija arriba ya no acota nada`,
    );
    assert.match(
      app,
      new RegExp(`${parametro}:\\s*[gM]\\('${control}'\\)`),
      `readFilters ya no manda ${control} como ${parametro}`,
    );
    assert.match(
      queries,
      new RegExp(`\\n\\s*${parametro}\\?:`),
      `ListQuery no declara ${parametro}, así que la consulta lo ignoraría`,
    );
    assert.match(
      index,
      new RegExp(`${parametro}:\\s*[gn]\\('${parametro}'\\)`),
      `el servidor no lee ${parametro} de la URL`,
    );
  }
});

test('buscador: sus controles existen en la página', async () => {
  const [buscador, html] = await Promise.all([bloqueDelBuscador(), leer('server/public/index.html')]);
  // Un `$('b-cuidad')` mal escrito no lanza: devuelve null, el campo se queda sin
  // rellenar y la búsqueda sale sin ciudad. Se ve igual de bien en una revisión.
  const referenciados = [...buscador.matchAll(/\$\('(b-[a-z-]+)'\)/g)].map((m) => m[1]);
  assert.ok(referenciados.length >= 3, 'el buscador ya no usa los controles de la caja');
  for (const id of new Set(referenciados)) {
    assert.ok(html.includes(`id="${id}"`), `app.js busca #${id} y la página no lo tiene`);
  }
});

test('buscador: sus modalidades son secciones que existen', async () => {
  const html = await leer('server/public/index.html');
  const index = await leer('server/index.ts');
  const modalidades = [...html.matchAll(/name="buscador-fuente"\s+value="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(modalidades, ['portal', 'bancos', 'remates']);
  for (const fuente of modalidades) {
    assert.ok(
      html.includes(`data-tab="${fuente}"`),
      `la modalidad ${fuente} no corresponde a ninguna pestaña, así que buscar dejaría la pantalla en otra sección`,
    );
    assert.ok(
      index.includes(`'/api/${fuente}'`),
      `no hay ruta de listado para ${fuente}`,
    );
  }
});

test('buscador: no es un segundo cliente de la API de listados', async () => {
  const buscador = await bloqueDelBuscador();
  // Esto es lo que sostiene el muro de pago. La ruta de listados redacta las
  // fichas según el plan de quien pregunta (`redactarLista`), y todo eso vive en
  // `load()`. Un buscador que se pidiera sus propios resultados sería la puerta de
  // atrás del muro y, de paso, una segunda verdad sobre qué está filtrado.
  for (const ruta of ['/api/portal', '/api/bancos', '/api/remates', '/api/home']) {
    assert.ok(!buscador.includes(ruta), `el buscador pide ${ruta} por su cuenta en vez de usar load()`);
  }
  assert.ok(buscador.includes('/api/facets'), 'el buscador debe poblar ciudad y tipo con las facetas reales');
  assert.match(buscador, /await load\(1\)|activarPestana\(/, 'el buscador debe cargar por el camino de siempre');
});

test('buscador: solo se ve en la portada, por el camino de siempre', async () => {
  const app = await leer('server/public/app.js');
  // La visibilidad de cada sección la decide `aplicarVistaDePestana` y nadie más.
  // Un segundo sitio que muestre u oculte el buscador —un `hidden` suelto en el
  // manejador de las pestañas, por ejemplo— es la forma habitual de acabar con un
  // bloque que se queda encendido en una sección donde no pinta nada.
  const inicio = app.indexOf('function aplicarVistaDePestana()');
  assert.notEqual(inicio, -1, 'ya no existe `aplicarVistaDePestana`');
  const cuerpo = app.slice(inicio, app.indexOf('\n}', inicio));
  assert.match(cuerpo, /buscador\.hidden = !enHome/, 'el buscador ya no se apaga fuera de la portada');
});

test('buscador: la caja y el panel siguen siendo la misma verdad', async () => {
  const app = await leer('server/public/app.js');
  // `load()` avisa a la caja antes de pedir resultados, y así lo que se elija abajo
  // aparece arriba. La llamada es opcional (`?.`) porque el buscador puede no estar
  // montado, y esa misma tolerancia hace que un cambio de nombre del objeto global
  // NO rompa nada visible: simplemente deja de sincronizarse y la caja empieza a
  // mentir en silencio. Pasó una vez; esta línea es para que no pase dos.
  assert.match(app, /window\.RadarBuscador\?\.sincronizar\(\)/);
});

test('buscador: expone un punto de entrada para aplicar búsquedas desde código', async () => {
  const buscador = await bloqueDelBuscador();
  // El asistente del chat aplica búsquedas por aquí. Tiene que ser el MISMO camino
  // que el botón —`ejecutar`— o el día que diverjan nadie se enterará hasta que un
  // usuario cuente que el chat le dejó otra cosa distinta de lo que dijo.
  assert.match(buscador, /window\.RadarBuscador = \{ aplicar, sincronizar \};/);
  assert.match(buscador, /async function aplicar\(peticion = \{\}\)/);
  assert.match(buscador, /await ejecutar\(fuente, extras\)/, 'aplicar() debe buscar por el mismo camino que el botón');
  assert.match(buscador, /total: state\.total/, 'aplicar() debe poder responder cuántos resultados hay');
  // «banco» y «remate» es como los nombra el asistente en el servidor
  // (`FuenteBusqueda` de asistente-busqueda.ts); las pestañas van en plural.
  for (const dicho of ['banco', 'remate', 'portal']) {
    assert.ok(buscador.includes(`${dicho}:`), `aplicar() no traduce la fuente «${dicho}» del asistente`);
  }
});

test('buscador: una búsqueda cabe en una pantalla y dice cuánto hay detrás', async () => {
  const app = await leer('server/public/app.js');
  // Pedido del cliente: buscar tiene que ayudar a encontrar, no volcar el
  // inventario. Veinte se leen; el total se dice al lado («20 de 1.786») para que
  // se vea que hay más y que la vía es acotar, no pasar páginas.
  assert.match(app, /const PAGE_SIZE_BUSCADOR = 20;/);
  assert.match(app, /state\.pageSize = PAGE_SIZE_BUSCADOR;/);
  assert.match(app, /qs\.set\('pageSize', String\(state\.pageSize\)\)/);
  assert.match(app, /\$\{mostrados\.toLocaleString\('es-CO'\)\} de \$\{cifra\}/);
});

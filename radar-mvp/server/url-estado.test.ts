/**
 * La búsqueda tiene que sobrevivir al viaje de ida y vuelta por la dirección.
 *
 * Un enlace compartido es una promesa: quien lo recibe tiene que ver lo mismo que
 * vio quien lo mandó. La avería que rompe esa promesa no se ve revisando el
 * código —se escribe el parámetro de una forma y se lee de otra, o un filtro
 * nuevo se queda sin nombre en la URL— y tampoco se ve en la pantalla: el listado
 * enseña otra cosa, sin decir por qué, y quien lo recibió cree que así es el
 * inventario.
 *
 * Por eso la traducción vive aparte del DOM, en `server/public/url-estado.js`, y
 * se prueba entera aquí. Se ejecuta en un `vm` porque el frontend son scripts
 * clásicos sin empaquetador: no se pueden importar, y levantar un navegador
 * convertiría una prueba de un segundo en una de treinta. Mismo camino que
 * `ficha-pendiente.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

interface Estado {
  tab: string;
  page: number;
  filtros: Record<string, string>;
  ficha: { kind: string; id: string } | null;
  explicito: boolean;
}

interface UrlEstado {
  PESTANAS: string[];
  CONTROLES: Array<[string, string]>;
  serializar(estado: {
    tab?: string;
    page?: number;
    filtros?: Record<string, string | undefined>;
    ordenPorDefecto?: string;
  }): string;
  leer(busqueda: string): Estado;
}

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

async function cargar(): Promise<UrlEstado> {
  const source = await leer('server/public/url-estado.js');
  const ventana: Record<string, unknown> = {};
  // `URLSearchParams` no está en un contexto nuevo de `vm`: es global de Node, no
  // built-in de V8. Sin pasarlo, el módulo falla con un ReferenceError que no
  // tiene nada que ver con lo que se quiere probar.
  vm.runInNewContext(source, { window: ventana, URLSearchParams });
  return ventana.__radarUrlEstado as UrlEstado;
}

test('una búsqueda entera va a la dirección y vuelve igual', async () => {
  const url = await cargar();
  const filtros = {
    city: 'medellin',
    zone: 'el poblado',
    type: 'house',
    tier: 'oportunidad_alta',
    priceMin: '200',
    priceMax: '300',
    areaMin: '60',
    areaMax: '180',
    beds: '3',
    stratumMin: '4',
    stratumMax: '6',
    order: 'discount_desc',
  };
  const query = url.serializar({ tab: 'portal', page: 4, filtros, ordenPorDefecto: 'precio_asc' });
  const vuelta = url.leer(`?${query}`);

  assert.equal(vuelta.tab, 'portal');
  assert.equal(vuelta.page, 4);
  // Campo a campo: el objeto nace en otro realm (`vm`) y no comparte prototipo.
  for (const [clave, valor] of Object.entries(filtros)) {
    assert.equal(vuelta.filtros[clave], valor, `se perdió ${clave} en el viaje`);
  }
});

test('los filtros de remates también viajan: son otra sección, no otro producto', async () => {
  const url = await cargar();
  const query = url.serializar({
    tab: 'remates',
    page: 1,
    filtros: { city: 'yopal', type: 'vehicle', bank: 'Banco de Bogotá', bidMin: '80', bidMax: '300' },
    ordenPorDefecto: 'auction_asc',
  });
  const vuelta = url.leer(query);
  assert.equal(vuelta.tab, 'remates');
  assert.equal(vuelta.filtros.city, 'yopal');
  assert.equal(vuelta.filtros.type, 'vehicle');
  // Con espacios y con tilde: el demandante es el nombre del banco tal cual.
  assert.equal(vuelta.filtros.bank, 'Banco de Bogotá');
  assert.equal(vuelta.filtros.bidMin, '80');
  assert.equal(vuelta.filtros.bidMax, '300');
});

test('lo que está por defecto no se escribe: la dirección se lee de un vistazo', async () => {
  const url = await cargar();
  // La portada es por donde se entra, así que su dirección es la raíz limpia.
  assert.equal(url.serializar({ tab: 'home', page: 1, filtros: {} }), '');
  // La primera página no es un sitio al que haga falta apuntar.
  assert.equal(url.serializar({ tab: 'portal', page: 1, filtros: {} }), 'tab=portal');
  // El orden solo aparece cuando la persona lo cambió.
  assert.equal(
    url.serializar({ tab: 'portal', page: 1, filtros: { order: 'precio_asc' }, ordenPorDefecto: 'precio_asc' }),
    'tab=portal',
  );
  assert.equal(
    url.serializar({ tab: 'portal', page: 1, filtros: { order: 'discount_desc' }, ordenPorDefecto: 'precio_asc' }),
    'tab=portal&order=discount_desc',
  );
  // Ni en la portada ni en Guardados hay paginador: `page` ahí no significa nada.
  assert.equal(url.serializar({ tab: 'guardados', page: 5, filtros: {} }), 'tab=guardados');
  assert.equal(url.serializar({ tab: 'bancos', page: 5, filtros: {} }), 'tab=bancos&page=5');
});

test('un filtro vacío no se escribe: ensucia lo que la persona va a copiar', async () => {
  const url = await cargar();
  const query = url.serializar({ tab: 'portal', page: 1, filtros: { city: '', type: '   ', priceMax: undefined } });
  assert.equal(query, 'tab=portal');
});

test('la dirección se puede escribir a mano y nada de lo inventado entra', async () => {
  const url = await cargar();
  // Una sección que no existe no lleva a ninguna parte: se cae a la portada.
  assert.equal(url.leer('?tab=administracion').tab, 'home');
  // Un precio que no es un número dejaría el campo filtrando por nada mientras el
  // contador dice que hay un filtro activo.
  assert.equal(url.leer('?tab=portal&priceMax=hola').filtros.priceMax, undefined);
  assert.equal(url.leer('?tab=portal&areaMin=-40').filtros.areaMin, undefined);
  // Una página imposible es la primera, no un error en la cara del usuario.
  assert.equal(url.leer('?tab=portal&page=0').page, 1);
  assert.equal(url.leer('?tab=portal&page=99999').page, 1);
  assert.equal(url.leer('?tab=portal&page=abc').page, 1);
  // Basura pegada a mano en un campo de texto no viaja.
  assert.equal(url.leer(`?tab=portal&city=${'x'.repeat(400)}`).filtros.city, undefined);
  // Y leer una dirección vacía no revienta.
  assert.equal(url.leer('').tab, 'home');
  assert.equal(url.leer('?').tab, 'home');
});

test('el mismo filtro escrito de dos formas produce la misma dirección', async () => {
  const url = await cargar();
  // Dos enlaces que son la misma búsqueda tienen que parecerlo, o la comparación
  // que evita reescribir el historial en cada carga dejaría de funcionar.
  const a = url.serializar({ tab: 'portal', page: 1, filtros: { priceMax: '0300' } });
  const b = url.serializar({ tab: 'portal', page: 1, filtros: { priceMax: '300' } });
  assert.equal(a, b);
});

test('`explicito` es quien decide entre la dirección y el Radar guardado', async () => {
  const url = await cargar();
  // Entrar a la raíz no dice nada: ahí la preferencia guardada sigue proponiendo.
  assert.equal(url.leer('').explicito, false);
  // Una pestaña o un filtro sí son una intención escrita, y esa manda.
  assert.equal(url.leer('?tab=bancos').explicito, true);
  assert.equal(url.leer('?city=medellin').explicito, true);
  // Sin `tab` pero con filtros se entiende Portal, que es donde están todos.
  assert.equal(url.leer('?city=medellin').tab, 'portal');
});

test('el enlace a una ficha convive con los filtros y no cuenta como búsqueda', async () => {
  const url = await cargar();
  // Es el enlace que reparte el asistente (`server/asistente-busqueda.ts`).
  const solo = url.leer('?kind=banco&id=abc-123');
  assert.equal(solo.ficha?.kind, 'banco');
  assert.equal(solo.ficha?.id, 'abc-123');
  // No describe qué listado mirar detrás: la portada sigue siendo la portada.
  assert.equal(solo.explicito, false);
  assert.equal(solo.tab, 'home');

  // Y cuando viaja junto a una búsqueda, las dos cosas se entienden.
  const junto = url.leer('?tab=bancos&city=cali&kind=banco&id=abc-123');
  assert.equal(junto.tab, 'bancos');
  assert.equal(junto.filtros.city, 'cali');
  assert.equal(junto.ficha?.id, 'abc-123');

  // El tipo viaja a /api/property: lo que salga de aquí tiene que ser uno de los
  // tres que esa ruta acepta, venga como venga escrito en la dirección.
  assert.equal(url.leer('?kind=admin&id=abc').ficha, null);
  assert.equal(url.leer('?kind=bancos&id=abc').ficha, null);
  assert.equal(url.leer('?kind=banco').ficha, null);
});

test('todo filtro que se pinta en pantalla tiene nombre en la dirección', async () => {
  const url = await cargar();
  const app = await leer('server/public/app.js');
  const conocidos = new Set(url.CONTROLES.map(([control]) => control));

  // Los tres caminos por los que `buildFilters()` crea un control: el `id`
  // escrito a mano, y los ayudantes que lo componen a partir de una clave.
  const ids = new Set<string>();
  for (const m of app.matchAll(/id="(f-[A-Za-z]+)"/g)) ids.add(m[1]);
  for (const m of app.matchAll(/\bfSelect(?:Dependiente)?\('([A-Za-z]+)'/g)) ids.add(`f-${m[1]}`);
  for (const m of app.matchAll(/\bfRange\('([A-Za-z]+)'/g)) {
    ids.add(`f-${m[1]}Min`);
    ids.add(`f-${m[1]}Max`);
  }

  // La prueba se defiende de sí misma: si mañana los filtros se pintan de otra
  // forma y esto deja de encontrarlos, el aviso tiene que saltar aquí y no en un
  // enlace roto que alguien mandó por WhatsApp.
  assert.ok(ids.size >= 14, `solo se encontraron ${ids.size} filtros en app.js: la extracción se quedó vieja`);

  for (const id of ids) {
    assert.ok(
      conocidos.has(id),
      `el filtro ${id} no tiene nombre en la URL: quien comparta su búsqueda la comparte incompleta`,
    );
  }
});

test('la traducción de la dirección se carga antes que la aplicación que la usa', async () => {
  const index = await leer('server/public/index.html');
  const traduccion = index.indexOf('/url-estado.js');
  const app = index.indexOf('/app.js');
  assert.notEqual(traduccion, -1, 'index.html ya no carga url-estado.js: la URL dejaría de reflejar la búsqueda');
  assert.ok(traduccion < app, 'url-estado.js tiene que cargarse antes que app.js, que lo usa al arrancar');
});

test('la dirección se escribe desde `load()`, que es por donde pasan todas las búsquedas', async () => {
  const app = await leer('server/public/app.js');
  const inicio = app.indexOf('async function load(page) {');
  assert.notEqual(inicio, -1, 'ya no existe `load(page)`');
  const cuerpo = app.slice(inicio, inicio + 900);
  assert.ok(
    cuerpo.includes('sincronizarUrl(page)'),
    'si `load()` deja de escribir la dirección, el buscador, el paginador y el asistente '
    + 'cambian el listado sin cambiar la URL, y el enlace compartido apunta a otra cosa',
  );
  // Y antes de las salidas por portada y Guardados: también son sitios a los que
  // se tiene que poder volver.
  assert.ok(
    cuerpo.indexOf('sincronizarUrl(page)') < cuerpo.indexOf("state.tab === 'home'"),
    'la portada y Guardados salen de `load()` por arriba: si la URL se escribe después, esas dos pestañas no quedan en la dirección',
  );
});

test('cambiar de sección deja un paso atrás; cambiar un filtro no', async () => {
  const app = await leer('server/public/app.js');
  const inicio = app.indexOf('async function activarPestana(');
  assert.notEqual(inicio, -1, 'ya no existe `activarPestana`');
  const cuerpo = app.slice(inicio, app.indexOf('\n}', inicio));
  assert.ok(
    /empujarProximaUrl = true;\s*\n\s*await load\(/.test(cuerpo),
    'cambiar de sección tiene que empujar una entrada en el historial, o «atrás» vuelve a sacar de la aplicación',
  );
  assert.ok(
    app.includes("window.addEventListener('popstate'"),
    'sin `popstate`, los botones atrás y adelante del navegador no reconstruyen la búsqueda',
  );
});

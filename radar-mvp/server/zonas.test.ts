/**
 * La tabla de oportunidades por zona es lo que el administrador va a mirar para
 * decidir dónde pautar y qué ciudad scrapear después. Un conteo mal agregado no
 * rompe nada visible: simplemente hace tomar la decisión equivocada, y nadie se
 * entera. Por eso la agregación se prueba entera y sin red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CIUDADES_PANEL,
  agruparOportunidades,
  ciudadesPrincipales,
  construirTablaZonas,
  contarPorCiudad,
  normalizarCiudad,
  type FilaOportunidad,
} from './zonas.js';

const opp = (city: string, discount_pct: number | string | null = 20, is_high = false): FilaOportunidad =>
  ({ city, discount_pct, is_high });

const tabla = (entrada: Partial<Parameters<typeof construirTablaZonas>[0]>) => construirTablaZonas({
  ciudades: [],
  oportunidades: [],
  activosPorCiudad: new Map(),
  bancos: [],
  remates: [],
  arriendos: [],
  totalActivosSistema: 0,
  generadoEn: '2026-07-28T00:00:00.000Z',
  ...entrada,
});

test('zonas: la misma ciudad escrita distinto no se parte en dos filas', () => {
  // Un scraper nuevo que mande «Bogota » en vez de «bogota» duplicaría la ciudad
  // y repartiría sus oportunidades entre las dos filas, dejando a la capital
  // fuera del top por un problema de mayúsculas.
  const grupos = agruparOportunidades([opp('bogota'), opp(' Bogotá '), opp('BOGOTA'), opp('bogota  ')]);
  assert.equal(grupos.size, 2, 'solo se unifica lo que es el mismo texto salvo espacios y mayúsculas');
  assert.equal(grupos.get('bogota')?.oportunidades, 3);
  assert.equal(grupos.get('bogotá')?.oportunidades, 1);
});

test('zonas: una fila sin ciudad no inventa una zona', () => {
  assert.equal(normalizarCiudad(null), null);
  assert.equal(normalizarCiudad('   '), null);
  assert.equal(normalizarCiudad(42), null);
  const conteo = contarPorCiudad([{ city: null }, { city: '' }, {}, { city: 'cali' }]);
  assert.deepEqual([...conteo.entries()], [['cali', 1]]);
});

test('zonas: el promedio de descuento ignora las oportunidades sin veredicto', () => {
  // `discount_pct` nulo es «el motor todavía no la evaluó», no «0 % de descuento».
  // Contarla como cero hundiría la media de una ciudad a medio procesar.
  const grupos = agruparOportunidades([opp('cali', 30), opp('cali', 10), opp('cali', null)]);
  const cali = grupos.get('cali');
  assert.equal(cali?.oportunidades, 3, 'la fila sin descuento sigue siendo una oportunidad');
  assert.equal(cali?.conDescuento, 2);
  assert.equal(cali!.sumaDescuentos / cali!.conDescuento, 20);
});

test('zonas: el descuento llega como texto desde la base y se agrega igual', () => {
  // `numeric` de Postgres puede viajar como string; sumarlo sin convertir daría
  // «2030» en vez de 50 y el promedio se dispararía a valores absurdos.
  const grupos = agruparOportunidades([opp('pereira', '20.5'), opp('pereira', '30')]);
  assert.equal(grupos.get('pereira')?.sumaDescuentos, 50.5);
  assert.equal(grupos.get('pereira')?.mejorDescuento, 30);
});

test('zonas: un descuento corrupto no contamina el promedio', () => {
  const grupos = agruparOportunidades([opp('neiva', 'no-es-un-numero'), opp('neiva', 40)]);
  assert.equal(grupos.get('neiva')?.conDescuento, 1);
  assert.equal(grupos.get('neiva')?.sumaDescuentos, 40);
});

test('zonas: las ciudades se recortan por volumen de oportunidades', () => {
  const filas = [
    ...Array.from({ length: 5 }, () => opp('bogota')),
    ...Array.from({ length: 3 }, () => opp('cali')),
    opp('tunja'),
  ];
  assert.deepEqual(ciudadesPrincipales(filas, 2), ['bogota', 'cali']);
  assert.equal(ciudadesPrincipales(filas).length, 3, 'sin tope explícito caben todas las que hay');
  assert.equal(MAX_CIUDADES_PANEL, 40);
});

test('zonas: los empates se desempatan alfabéticamente, no al azar', () => {
  // Con empates sin desempate estable la tabla cambiaría de orden entre
  // refrescos sin que hubiera cambiado un solo dato, y el panel parecería roto.
  const filas = [opp('zipaquira'), opp('armenia'), opp('manizales')];
  assert.deepEqual(ciudadesPrincipales(filas), ['armenia', 'manizales', 'zipaquira']);
});

test('zonas: una ciudad sin arriendos queda marcada como sin cobertura', () => {
  const { zonas } = tabla({
    ciudades: ['medellin', 'pereira'],
    oportunidades: [opp('medellin'), opp('pereira')],
    arriendos: [{ city: 'medellin' }, { city: 'medellin' }],
  });
  const medellin = zonas.find((z) => z.ciudad === 'medellin');
  const pereira = zonas.find((z) => z.ciudad === 'pereira');
  assert.equal(medellin?.coberturaArriendos, true);
  assert.equal(medellin?.arriendos, 2);
  assert.equal(pereira?.coberturaArriendos, false, 'sin canon de referencia no hay análisis de rentabilidad');
  assert.equal(pereira?.arriendos, 0);
});

test('zonas: cada fila cruza portal, bancos, remates y arriendos de su ciudad', () => {
  const { zonas } = tabla({
    ciudades: ['cali'],
    oportunidades: [opp('cali', 25, true), opp('cali', 15, false)],
    activosPorCiudad: new Map([['cali', 9000]]),
    bancos: [{ city: 'cali' }, { city: 'bogota' }],
    remates: [{ city: 'cali' }, { city: 'cali' }, { city: 'tunja' }],
    arriendos: [{ city: 'cali' }],
  });
  assert.deepEqual(zonas[0], {
    ciudad: 'cali',
    inmueblesActivos: 9000,
    oportunidades: 2,
    oportunidadesAltas: 1,
    descuentoMedio: 20,
    mejorDescuento: 25,
    inmueblesBanco: 1,
    rematesActivos: 2,
    arriendos: 1,
    coberturaArriendos: true,
  });
});

test('zonas: una ciudad pedida sin datos sale en cero, no desaparece', () => {
  // Si el conteo de activos falla o la ciudad se quedó sin oportunidades, la fila
  // debe seguir apareciendo en cero: una ciudad que desaparece de la tabla se lee
  // como «no la monitoreamos», que es una conclusión distinta.
  const { zonas } = tabla({ ciudades: ['leticia'] });
  assert.equal(zonas.length, 1);
  assert.equal(zonas[0].oportunidades, 0);
  assert.equal(zonas[0].descuentoMedio, null);
  assert.equal(zonas[0].mejorDescuento, null);
  assert.equal(zonas[0].coberturaArriendos, false);
});

test('zonas: el resumen reporta el sistema completo, no solo la tabla', () => {
  // El corte a 40 ciudades es de presentación. Si el resumen sumara solo lo
  // mostrado, el administrador repetiría en una reunión un total que no existe.
  const oportunidades = [opp('bogota', 30, true), opp('bogota', 10), opp('leticia', 50)];
  const { resumen, zonas } = tabla({
    ciudades: ciudadesPrincipales(oportunidades, 1),
    oportunidades,
    activosPorCiudad: new Map([['bogota', 9854]]),
    totalActivosSistema: 115_636,
    bancos: [{ city: 'bogota' }, { city: 'leticia' }],
    remates: [{ city: 'leticia' }],
    arriendos: [{ city: 'bogota' }],
  });
  assert.deepEqual(zonas.map((z) => z.ciudad), ['bogota'], 'la tabla sí está recortada');
  assert.equal(resumen.ciudadesEnTabla, 1);
  assert.equal(resumen.ciudadesConOportunidad, 2, 'las dos ciudades con oportunidades siguen contadas');
  assert.equal(resumen.oportunidades, 3, 'incluye la oportunidad de la ciudad que no se muestra');
  assert.equal(resumen.oportunidadesAltas, 1);
  assert.equal(resumen.inmueblesActivos, 115_636);
  assert.equal(resumen.inmueblesBanco, 2);
  assert.equal(resumen.rematesActivos, 1);
  assert.equal(resumen.arriendos, 1);
  assert.equal(resumen.mejorDescuento, 50, 'el mejor descuento del país, aunque sea de una ciudad fuera del top');
  assert.equal(resumen.descuentoMedio, 30);
  assert.equal(resumen.ciudadesSinArriendos, 0, 'solo cuenta las ciudades que sí se muestran');
});

test('zonas: sin oportunidades el resumen no divide por cero', () => {
  const { resumen, zonas } = tabla({ ciudades: [], totalActivosSistema: 10 });
  assert.deepEqual(zonas, []);
  assert.equal(resumen.descuentoMedio, null);
  assert.equal(resumen.mejorDescuento, null);
  assert.equal(resumen.ciudadesConOportunidad, 0);
});

test('zonas: la tabla queda ordenada por oportunidades aunque llegue desordenada', () => {
  const oportunidades = [opp('cali'), opp('cali'), opp('cali'), opp('bogota'), opp('bogota'), opp('tunja')];
  const { zonas } = tabla({ ciudades: ['tunja', 'bogota', 'cali'], oportunidades });
  assert.deepEqual(zonas.map((z) => z.ciudad), ['cali', 'bogota', 'tunja']);
});

test('zonas: los porcentajes se publican con un decimal', () => {
  const { zonas, resumen } = tabla({
    ciudades: ['ibague'],
    oportunidades: [opp('ibague', 10), opp('ibague', 15), opp('ibague', 21.666)],
  });
  assert.equal(zonas[0].descuentoMedio, 15.6);
  assert.equal(zonas[0].mejorDescuento, 21.7);
  assert.equal(resumen.descuentoMedio, 15.6);
});

/**
 * Qué se ofrece como filtro, que no es lo mismo que qué hay en la base.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

test('facetas: el desplegable de barrio no ofrece veredas ni conjuntos', async () => {
  // La columna `zone` trae lo que el aviso tenga escrito, y ahí caben veredas,
  // corregimientos y nombres de edificios. Mezclados con los barrios de verdad, el
  // desplegable deja de ser un mapa de la ciudad. Se filtra al presentar y no en la
  // base: `zone` es la clave con la que el motor agrupa comparables, así que
  // reescribirla cambiaría veredictos de miles de fichas sin vuelta atrás.
  const { barriosPresentables } = await import('./queries.js');
  const crudas = [
    ...Array(12).fill('Laureles'),
    ...Array(8).fill('El Poblado'),
    ...Array(5).fill('Vereda Vanguardia'),
    'Torres del Marfil', 'Torres del Marfil',
    'Conjunto Cocora',
    'Urbanización La Castellana',
    null, undefined, '  ',
  ];
  const barrios = barriosPresentables(crudas);
  assert.deepEqual(barrios, ['El Poblado', 'Laureles']);
  assert.ok(!barrios.some((b) => /vereda|conjunto|urbanizaci/i.test(b)), 'no debe colarse ningún tipo de asentamiento');
});

test('facetas: la palabra delatora casi nunca va al principio', async () => {
  // La primera versión de esta comprobación solo miraba la primera palabra, y por
  // ahí se colaban enteros «Arboretto Conjunto Residencial», «Ruitoque Condominio»
  // y «Agrupación Macadamia». Los nombres de vía tampoco son barrios.
  const { barriosPresentables } = await import('./queries.js');
  const crudas = [
    ...Array(6).fill('Arboretto Conjunto Residencial'),
    ...Array(6).fill('Ruitoque Condominio'),
    ...Array(6).fill('Vía Las Palmas'),
    ...Array(6).fill('Avenida 30 de agosto'),
    ...Array(6).fill('Senderos del Lili'),
    ...Array(6).fill('Chapinero'),
  ];
  assert.deepEqual(barriosPresentables(crudas), ['Chapinero']);
});

test('facetas: un municipio no es barrio de sí mismo', async () => {
  // Muchos avisos repiten la ciudad en el campo de zona cuando no traen barrio, y
  // «Bogotá» acababa ofreciéndose como barrio de Bogotá —y de Chía—. Elegirlo no
  // acota nada: promete una precisión que no existe.
  const { barriosPresentables } = await import('./queries.js');
  const zonas = [
    ...Array(9).fill('Bogotá'),
    ...Array(9).fill('Bogotá, d.c.'),
    ...Array(9).fill('Cajicá'),
    ...Array(9).fill('Chapinero'),
  ];
  assert.deepEqual(barriosPresentables(zonas, ['bogota', 'cajica', 'chia']), ['Chapinero']);
});

test('facetas: en una ciudad pequeña se prefiere ruido a un desplegable vacío', async () => {
  // Si el umbral de frecuencia dejaría la lista vacía, se devuelve lo que haya: en
  // un municipio con cuatro avisos, un filtro sin opciones se lee como «aquí no hay
  // nada», que es peor que una lista corta e imperfecta.
  const { barriosPresentables } = await import('./queries.js');
  assert.deepEqual(barriosPresentables(['Centro', 'La Playa']), ['Centro', 'La Playa']);
});

test('ciudades: una sola entrada por ciudad real', async () => {
  // En la base conviven «bogota» y «bogota d.c.», «jamundi» y «jamundi -». Cada
  // variante filtraba un subconjunto distinto: «bogota» daba 58 fichas y
  // «bogota d.c.» otras 2. Quien elegía una veía una fracción de su ciudad sin
  // ninguna señal de que existiera el resto.
  const { ciudadesUnificadas } = await import('./queries.js');
  const crudas = ['bogota', 'bogota d.c.', 'jamundi', 'jamundi -', 'floridablanca', 'florida blanca', 'cali'];
  // Gana la forma más corta: las colas («d.c.», el guion suelto) son ruido de
  // captura, no parte del nombre.
  assert.deepEqual(ciudadesUnificadas(crudas), ['bogota', 'cali', 'floridablanca', 'jamundi']);
});

test('ciudades: al filtrar se buscan TODAS sus formas', async () => {
  // Agrupar solo en el desplegable no arreglaría nada: el filtro seguiría yendo
  // por igualdad exacta y el inventario de la otra variante quedaría escondido.
  const { variantesDeCiudad } = await import('./queries.js');
  const catalogo = ['bogota', 'bogota d.c.', 'cali', 'jamundi -'];
  assert.deepEqual(variantesDeCiudad('bogota', catalogo).sort(), ['bogota', 'bogota d.c.']);
  assert.deepEqual(variantesDeCiudad('jamundi', catalogo), ['jamundi -']);
  // Sin catálogo se filtra por lo pedido: el comportamiento de siempre, nunca peor.
  assert.deepEqual(variantesDeCiudad('bogota', []), ['bogota']);
});

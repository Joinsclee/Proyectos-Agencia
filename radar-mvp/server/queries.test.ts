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

test('facetas: en una ciudad pequeña se prefiere ruido a un desplegable vacío', async () => {
  // Si el umbral de frecuencia dejaría la lista vacía, se devuelve lo que haya: en
  // un municipio con cuatro avisos, un filtro sin opciones se lee como «aquí no hay
  // nada», que es peor que una lista corta e imperfecta.
  const { barriosPresentables } = await import('./queries.js');
  assert.deepEqual(barriosPresentables(['Centro', 'La Playa']), ['Centro', 'La Playa']);
});

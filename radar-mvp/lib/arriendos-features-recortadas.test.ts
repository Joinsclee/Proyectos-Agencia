/**
 * Un arriendo no se enseña: solo se cuenta.
 *
 * El parser de FincaRaíz construye un `features` de 28 claves y lo usa igual
 * para una venta —donde la ficha enseña la descripción, las fotos y las
 * amenidades— que para un arriendo, que NO se enseña en ninguna parte: existe
 * para calcular la mediana del canon de su zona y nada más.
 *
 * El 10 de octubre de 2026 eso pasó factura. Con el proyecto de Supabase
 * restringido por cuota, el desglose fue:
 *
 *     rental_listings   362 MB total · 107 MB datos · 26 MB índices
 *                       → 229 MB de TOAST (el JSONB fuera de línea)
 *
 * De una base de 1,31 GB, 229 MB eran campos que nadie lee. El 17 %.
 *
 * Esta prueba fija las seis claves que el motor sí usa. Si alguien añade una
 * séptima a `engine/rental-comparables.ts` sin ampliar el recorte, el motor se
 * queda sin ese dato y la estimación de arriendo cambia en silencio — que es
 * peor que el disco.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

test('el recorte deja exactamente las claves que lee el motor de arriendos', async () => {
  const motor = await leer('engine/rental-comparables.ts');
  // La proyección `COLS` nombra cada clave como `alias:features->clave`.
  const cols = motor.slice(motor.indexOf('const COLS'), motor.indexOf(';', motor.indexOf('const COLS')));
  const queLee = [...cols.matchAll(/features->(\w+)/g)].map((m) => m[1]).sort();
  assert.ok(queLee.length > 0, 'no se encontró la proyección de features en rental-comparables.ts');

  const supa = await leer('lib/supabase.ts');
  const lista = supa.slice(supa.indexOf('const CLAVES_DE_ARRIENDO'));
  const queGuarda = [...lista.slice(0, lista.indexOf(';')).matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();

  assert.deepEqual(queGuarda, queLee,
    'lo que se guarda y lo que se lee se separaron. Si el motor pide una clave que el '
    + 'recorte tira, la estimación de arriendo se calcula sin ella y nadie se entera:\n'
    + `  lee:     ${queLee.join(', ')}\n  guarda:  ${queGuarda.join(', ')}`);
});

test('el recorte se aplica al escribir, no al leer', async () => {
  const supa = await leer('lib/supabase.ts');
  // Tiene que estar dentro del objeto que se sube, antes del upsert de arriendos.
  const i = supa.indexOf('soloLoQueUsaElArriendo(item.features)');
  assert.ok(i > 0, 'el recorte no se está aplicando al construir las filas');
  const despues = supa.slice(i);
  assert.ok(despues.indexOf("from('rental_listings')") < despues.indexOf('export '),
    'el recorte tiene que quedar antes del upsert de rental_listings');
});

test('las claves pesadas del parser NO están en la lista', async () => {
  const supa = await leer('lib/supabase.ts');
  const lista = supa.slice(supa.indexOf('const CLAVES_DE_ARRIENDO'));
  const cuerpo = lista.slice(0, lista.indexOf(';'));
  // Estas cuatro son las que ocupan: texto largo y arrays de URLs.
  for (const pesada of ['description', 'images', 'amenities', 'title']) {
    assert.ok(!cuerpo.includes(`'${pesada}'`),
      `«${pesada}» volvió a la lista; es de las que llenaron los 229 MB de TOAST`);
  }
});

test('los inmuebles en venta NO se recortan: su ficha sí enseña todo eso', async () => {
  const supa = await leer('lib/supabase.ts');
  // El upsert de `inmuebles` va por su propio camino y tiene que seguir subiendo
  // `features` entero: la descripción, las fotos y las amenidades son lo que la
  // ficha vende.
  const inm = supa.slice(supa.indexOf("from('inmuebles')"));
  assert.ok(!inm.slice(0, 600).includes('soloLoQueUsaElArriendo'),
    'el recorte se coló en el upsert de inmuebles: ahí la descripción y las fotos sí se usan');
});

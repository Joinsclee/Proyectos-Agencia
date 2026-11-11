/**
 * El cliente de la demo tiene que hablar el MISMO dialecto que PostgREST.
 *
 * Si se desvía, no falla con un error: devuelve otras filas. Un `nullsFirst`
 * al revés vacía la primera página del listado, un `or` mal leído mezcla
 * proyectos en preventa con inmuebles terminados, y una proyección JSON mal
 * resuelta deja al motor de comparables sin geo — y entonces el panel que
 * justifica el −X%, que es lo que se enseña en la demo, sale vacío.
 *
 * Cada caso de aquí es una forma que el código usa de verdad en
 * `server/queries.ts`, `engine/zone-comps.ts` o `engine/rental-comparables.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearClienteDemo } from './cliente-falso.js';

const inmuebles = [
  { id: 'a', city: 'bogota', source: 'fincaraiz', price: 100, area_m2: 50, discount_pct: 40,
    is_active: true, is_opportunity: true, auction_date: '2026-11-01',
    features: { lat: 4.6, lng: -74.1, bedrooms: 2, stratum: 3, is_project: false } },
  { id: 'b', city: 'bogota', source: 'fincaraiz', price: 300, area_m2: 100, discount_pct: null,
    is_active: true, is_opportunity: false, auction_date: '2026-09-01',
    features: { lat: 4.7, lng: -74.0, bedrooms: 3, stratum: 5 } },           // sin is_project
  { id: 'c', city: 'medellin', source: 'bbva', price: 200, area_m2: 80, discount_pct: 60,
    is_active: true, is_opportunity: true, auction_date: '2026-12-01',
    features: { lat: 6.2, lng: -75.5, bedrooms: 1, stratum: 4, is_project: true } },
  { id: 'd', city: 'bogota', source: 'fincaraiz', price: 150, area_m2: 60, discount_pct: 20,
    is_active: false, is_opportunity: true, auction_date: '2026-10-01',
    features: { lat: 4.5, lng: -74.2, bedrooms: 2, stratum: 2, is_project: false } },
];

const db = () => crearClienteDemo({ inmuebles });

test('eq, in y los rangos numéricos filtran como Postgres', async () => {
  const { data: a } = await db().from('inmuebles').select('id').eq('city', 'bogota');
  assert.deepEqual(a.map((f: any) => f.id).sort(), ['a', 'b', 'd']);

  const { data: b } = await db().from('inmuebles').select('id').in('source', ['bbva', 'aval']);
  assert.deepEqual(b.map((f: any) => f.id), ['c']);

  const { data: c } = await db().from('inmuebles').select('id').gte('price', 150).lte('price', 250);
  assert.deepEqual(c.map((f: any) => f.id).sort(), ['c', 'd']);
});

test('eq sobre una clave JSON (features->>…) funciona', async () => {
  // El código lo usa para `bank_name` y `is_bank_plaintiff` en los remates.
  const { data } = await db().from('inmuebles').select('id').eq('features->>stratum', 5);
  assert.deepEqual(data.map((f: any) => f.id), ['b']);
});

test('la proyección con alias JSON es la que alimenta el motor de comparables', async () => {
  // `engine/zone-comps.ts` pide exactamente esta forma.
  const { data } = await db().from('inmuebles')
    .select('id, price, lat:features->lat, lng:features->lng, bedrooms:features->bedrooms')
    .eq('id', 'a');
  assert.deepEqual(data[0], { id: 'a', price: 100, lat: 4.6, lng: -74.1, bedrooms: 2 });
});

test('el `or` de preventa: null O false, pero no true', async () => {
  // Es el único `.or()` del proyecto, y significa «no es obra sobre plano».
  const { data } = await db().from('inmuebles').select('id')
    .or('features->>is_project.is.null,features->>is_project.eq.false');
  assert.deepEqual(data.map((f: any) => f.id).sort(), ['a', 'b', 'd'],
    'b no tiene la clave (null) y a/d la tienen en false; c es un proyecto y sobra');
});

test('order con nullsFirst:false deja los nulos al FINAL', async () => {
  // Con los nulos delante, la primera página del listado sale vacía de
  // descuentos — que es justo lo que el listado va a enseñar.
  const { data } = await db().from('inmuebles').select('id')
    .order('discount_pct', { ascending: false, nullsFirst: false });
  assert.deepEqual(data.map((f: any) => f.id), ['c', 'a', 'd', 'b']);
});

test('count exact cuenta ANTES de paginar, y head no trae filas', async () => {
  const { data, count } = await db().from('inmuebles')
    .select('id', { count: 'exact' }).eq('city', 'bogota').range(0, 0);
  assert.equal(count, 3, 'el total es el de la consulta, no el de la página');
  assert.equal(data.length, 1);

  const soloConteo = await db().from('inmuebles')
    .select('id', { count: 'exact', head: true }).eq('is_active', true);
  assert.equal(soloConteo.count, 3);
  assert.equal(soloConteo.data, null);
});

test('range es inclusivo en los dos extremos, como PostgREST', async () => {
  const { data } = await db().from('inmuebles').select('id').order('id').range(1, 2);
  assert.deepEqual(data.map((f: any) => f.id), ['b', 'c']);
});

test('gte/lte sobre fechas comparan como texto ISO', async () => {
  // `queryRemates` filtra `auction_date >= hoy` con una cadena 'YYYY-MM-DD'.
  const { data } = await db().from('inmuebles').select('id').gte('auction_date', '2026-10-15');
  assert.deepEqual(data.map((f: any) => f.id).sort(), ['a', 'c']);
});

test('single y maybeSingle se comportan distinto con cero filas', async () => {
  const uno = await db().from('inmuebles').select('*').eq('id', 'a').single();
  assert.equal((uno.data as any).id, 'a');

  const ninguno = await db().from('inmuebles').select('*').eq('id', 'zzz').maybeSingle();
  assert.equal(ninguno.data, null);
  assert.equal(ninguno.error, null, 'maybeSingle sin filas NO es un error');

  const exigente = await db().from('inmuebles').select('*').eq('id', 'zzz').single();
  assert.ok(exigente.error, 'single sin filas SÍ es un error');
});

test('una tabla que no está en el volcado responde vacío, no revienta', async () => {
  const { data, error } = await db().from('tabla_que_no_existe').select('*');
  assert.deepEqual(data, []);
  assert.equal(error, null);
});

test('las escrituras dicen que sí y no tocan nada', async () => {
  const antes = inmuebles.length;
  const r = await db().from('inmuebles').insert({ id: 'nuevo' });
  assert.equal(r.error, null);
  assert.equal(inmuebles.length, antes, 'la demo es de solo lectura');
});

/**
 * Las dos copias de la tabla maestra tienen que decir lo mismo.
 *
 * La tabla del Índice CRECE vive en `engine/crece.ts` —que es la fuente de verdad
 * de la especificación— y el navegador necesita una copia para pintar las
 * estrellas y ofrecer el filtro. No hay empaquetador, así que el cliente no puede
 * importar del motor: la copia es inevitable.
 *
 * Lo que NO es inevitable es que se separen. Si alguien cambia un umbral, renombra
 * una categoría o le mueve una estrella en un sitio y no en el otro, el filtro
 * ofrecería categorías que el motor ya no produce y la tarjeta pintaría un número
 * de estrellas que contradice a la ficha. Esta prueba falla el día que eso pase.
 *
 * Se comprueban las seis categorías FILTRABLES, que son las que el cliente ve. Las
 * de por encima del mercado se siguen calculando y mostrando en la ficha, pero no
 * se ofrecen como destino de búsqueda: el Radar existe para encontrar
 * oportunidades, no para buscar sobreprecios.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { clasePorTier } from '../engine/crece.js';
import { TIERS_FILTRABLES } from './queries.js';

/** La tabla que declara el cliente, leída de su propio archivo. */
async function tablaDelCliente(): Promise<Array<{ tier: string; lectura: string; estrellas: number; huecas: number }>> {
  const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
  const inicio = app.indexOf('const TABLA_CRECE = [');
  assert.notEqual(inicio, -1, 'el cliente ya no declara TABLA_CRECE');
  const bloque = app.slice(inicio, app.indexOf('];', inicio));
  return [...bloque.matchAll(
    /\{\s*tier:\s*'([a-z_]+)',\s*lectura:\s*'([^']+)',\s*estrellas:\s*(\d+),\s*huecas:\s*(\d+)/g,
  )].map((m) => ({ tier: m[1], lectura: m[2], estrellas: Number(m[3]), huecas: Number(m[4]) }));
}

test('tabla CRECE: el cliente declara exactamente las categorías filtrables', async () => {
  const cliente = await tablaDelCliente();
  assert.deepEqual(
    cliente.map((c) => c.tier),
    [...TIERS_FILTRABLES],
    'la tabla del navegador y la lista blanca del servidor se separaron',
  );
});

test('tabla CRECE: cada categoría se lee igual en el motor y en el navegador', async () => {
  for (const fila of await tablaDelCliente()) {
    const delMotor = clasePorTier(fila.tier);
    assert.ok(delMotor, `el motor ya no conoce la categoría ${fila.tier}`);
    assert.equal(
      fila.lectura,
      delMotor.lectura,
      `«${fila.tier}» se llama «${fila.lectura}» en la tarjeta y «${delMotor.lectura}» en la ficha`,
    );
  }
});

test('tabla CRECE: las estrellas de la tarjeta son las del motor', async () => {
  // El motor cuenta estrellas sin distinguir llenas de huecas; el documento del
  // cliente sí lo hace —«Abajo del Mercado» lleva una estrella BLANCA— y la
  // tarjeta lo respeta. Lo que tiene que cuadrar es el total.
  for (const fila of await tablaDelCliente()) {
    const delMotor = clasePorTier(fila.tier);
    assert.equal(
      fila.estrellas + fila.huecas,
      delMotor!.estrellas,
      `«${fila.tier}»: la tarjeta pinta ${fila.estrellas + fila.huecas} estrellas y el motor dice ${delMotor!.estrellas}`,
    );
  }
});

test('tabla CRECE: el filtro no ofrece categorías por encima del mercado', async () => {
  // Ofrecer «Sobreprecio» o «Fuera de Mercado» como destino de búsqueda sería
  // invitar a buscar justo lo que el producto existe para evitar. Se siguen
  // calculando y se ven en la ficha; no se ofrecen para filtrar.
  const prohibidas = ['limite_superior', 'arriba_mercado', 'sobreprecio', 'sobrevalorado', 'fuera_mercado'];
  for (const tier of prohibidas) {
    assert.ok(
      !(TIERS_FILTRABLES as readonly string[]).includes(tier),
      `${tier} no debería poder pedirse desde el filtro`,
    );
    // …pero el motor tiene que seguir sabiendo clasificarla.
    assert.ok(clasePorTier(tier), `el motor dejó de conocer ${tier}, que sigue siendo parte del veredicto`);
  }
});

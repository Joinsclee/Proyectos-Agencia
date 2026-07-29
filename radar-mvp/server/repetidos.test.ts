/**
 * El cliente vio diez tarjetas idénticas seguidas y preguntó si el scraper
 * duplicaba. No duplicaba: eran diez avisos distintos del mismo loteo. Estas
 * pruebas fijan qué se considera «el mismo inmueble a ojos de quien mira».
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claveDeRepeticion, colapsarRepetidos } from './repetidos.js';

const lote = (extra: Record<string, unknown> = {}) => ({
  id: Math.random().toString(36).slice(2),
  price: 70_000_000,
  area_m2: 50,
  type: 'lot',
  address: 'sector arenales/alta gracia/pereira',
  ...extra,
});

test('repetidos: el caso real de Alta Gracia se colapsa en una tarjeta', () => {
  // Diez avisos, mismo precio, misma superficie, misma dirección. Cada uno con su
  // id porque son anuncios distintos del portal.
  const filas = Array.from({ length: 10 }, () => lote());
  const { filas: salida, ocultas } = colapsarRepetidos(filas);
  assert.equal(salida.length, 1);
  assert.equal(ocultas, 9);
  assert.equal((salida[0] as any)._iguales, 10, 'la cuenta incluye la que se queda');
});

test('repetidos: la dirección se compara sin importar los espacios de las barras', () => {
  // En la misma búsqueda venían «arenales /alta gracia» y «arenales/alta gracia».
  // Si esas dos fueran claves distintas, el colapso dejaría pasar la mitad.
  const a = claveDeRepeticion(lote({ address: 'sector arenales /alta gracia/pereira' }));
  const b = claveDeRepeticion(lote({ address: 'Sector Arenales/Alta Gracia/Pereira' }));
  const c = claveDeRepeticion(lote({ address: 'sector arenales  /  alta gracia / pereira' }));
  assert.equal(a, b);
  assert.equal(a, c);
});

test('repetidos: lo que se parece pero no es igual NO se colapsa', () => {
  const filas = [
    lote({ price: 70_000_000 }),
    lote({ price: 71_000_000 }),          // otro precio
    lote({ area_m2: 60 }),                 // otra superficie
    lote({ type: 'house' }),               // otro tipo
    lote({ address: 'otra vereda/pereira' }),
  ];
  const { filas: salida, ocultas } = colapsarRepetidos(filas);
  assert.equal(salida.length, 5);
  assert.equal(ocultas, 0);
});

test('repetidos: sin precio, sin área o sin dirección no se agrupa nada', () => {
  // Agrupar «todo lo que no tiene dirección» juntaría inmuebles que no tienen
  // nada que ver. Ante la duda, se muestran todos.
  assert.equal(claveDeRepeticion(lote({ address: null })), null);
  assert.equal(claveDeRepeticion(lote({ address: '   ' })), null);
  assert.equal(claveDeRepeticion(lote({ price: null })), null);
  assert.equal(claveDeRepeticion(lote({ area_m2: undefined })), null);

  const filas = [lote({ address: null }), lote({ address: null }), lote({ price: null })];
  const { filas: salida, ocultas } = colapsarRepetidos(filas);
  assert.equal(salida.length, 3);
  assert.equal(ocultas, 0);
});

test('repetidos: se conserva el orden y gana la primera de cada grupo', () => {
  // Las filas llegan ordenadas por lo que pidió el usuario, así que la primera de
  // cada grupo es la que él habría querido ver arriba.
  const filas = [
    lote({ id: 'barata', price: 60_000_000 }),
    lote({ id: 'copia-1' }),
    lote({ id: 'cara', price: 90_000_000, address: 'otra/pereira' }),
    lote({ id: 'copia-2' }),
  ];
  const { filas: salida } = colapsarRepetidos(filas);
  assert.deepEqual(salida.map((f) => f.id), ['barata', 'copia-1', 'cara']);
  assert.equal((salida[1] as any)._iguales, 2);
});

/**
 * La portada cruza inmuebles y remates en una misma fila, y las dos familias no se
 * clasifican igual: los inmuebles por categoría CRECE, los remates por la matriz
 * origen del demandante × descuento. `redactarMixta` es lo que impide que esa
 * mezcla se convierta en un agujero: separar mal las dos listas dejaría salir una
 * ficha de pago entera y nadie lo notaría mirando la pantalla, porque una tarjeta
 * sin muro se ve exactamente igual de bien.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { redactarMixta } from './acceso.js';

/** Las fichas viajan como filas sueltas de Supabase; el tipo laxo es el real. */
type Ficha = Record<string, any> & { _kind: string; id: string };

const inmueblePago = (): Ficha => ({
  _kind: 'portal',
  id: 'inm-1',
  crece_tier: 'oportunidad_fuerte',
  city: 'medellin',
  price: 300_000_000,
  discount_pct: 40,
  address: 'Calle 10 # 20-30',
  source_url: 'https://portal.example/aviso/1',
  features: { description: 'Con vista', lat: 6.2, lng: -75.5, images: ['a', 'b', 'c', 'd', 'e'] },
});

const inmuebleGratis = (): Ficha => ({
  ...inmueblePago(),
  id: 'inm-2',
  crece_tier: 'mercado',
});

const remateDePago = (): Ficha => ({
  _kind: 'remate',
  id: 'rem-1',
  origen_demandante: 'bancario',
  appraisal_value: 100_000_000,
  minimum_bid: 70_000_000,
  address: 'Vereda El Alto',
  source_url: 'https://ramajudicial.example/aviso/9',
  court_email: 'juzgado@example.co',
  features: {},
});

test('portada anónima: lo de pago sale recortado y lo gratis sale entero', () => {
  const [pago, gratis, remate] = redactarMixta(
    [inmueblePago(), inmuebleGratis(), remateDePago()],
    'anonimo',
  );
  assert.equal(pago._bloqueada, true);
  assert.equal(pago.address, null);
  assert.equal(pago.source_url, null);
  assert.equal(pago.features.description, undefined);
  assert.equal(pago.features.lat, undefined);
  assert.equal(pago.features.images.length, 3, 'quedan solo las fotos de muestra');
  assert.equal(pago._acceso.requiere, 'registro', 'a un anónimo se le pide cuenta, no que pague');

  assert.equal(gratis._bloqueada, undefined);
  assert.equal(gratis.address, 'Calle 10 # 20-30');

  assert.equal(remate._bloqueada, true);
  assert.equal(remate.court_email, null);
});

test('portada: el orden que se pintó es el que vuelve', () => {
  // Los bloques se arman antes de redactar; si `redactarMixta` devolviera primero
  // los inmuebles y luego los remates, el cruce de fuentes dejaría de intercalarse
  // y el bloque perdería justo lo que lo hace legible.
  const entrada = [inmueblePago(), remateDePago(), inmuebleGratis()];
  const salida = redactarMixta(entrada, 'anonimo');
  assert.deepEqual(salida.map((f) => f.id), ['inm-1', 'rem-1', 'inm-2']);
  assert.deepEqual(salida.map((f) => f._kind), ['portal', 'remate', 'portal']);
});

test('portada: un suscriptor recibe todo completo', () => {
  const salida = redactarMixta([inmueblePago(), remateDePago()], 'suscrito');
  assert.equal(salida.every((f) => f._acceso.completa), true);
  assert.equal(salida[0].address, 'Calle 10 # 20-30');
  assert.equal(salida[1].court_email, 'juzgado@example.co');
});

test('portada: al registrado se le ofrece su cupo, y lo ya abierto sigue abierto', () => {
  const conCupo = redactarMixta([inmueblePago()], 'free', { desbloqueadas: [], restantes: 4 });
  assert.equal(conCupo[0]._bloqueada, true);
  assert.equal(conCupo[0]._acceso.requiere, 'cupo');

  const yaAbierta = redactarMixta([inmueblePago()], 'free', { desbloqueadas: ['inm-1'], restantes: 3 });
  assert.equal(yaAbierta[0]._acceso.completa, true, 'gastó cupo por ella: no puede volver a taparse');
  assert.equal(yaAbierta[0].address, 'Calle 10 # 20-30');

  const sinCupo = redactarMixta([inmueblePago()], 'free', { desbloqueadas: [], restantes: 0 });
  assert.equal(sinCupo[0]._acceso.requiere, 'suscripcion');
});

test('portada: no se confunden dos fichas de tablas distintas con el mismo id', () => {
  // Inmuebles y remates viven en tablas separadas y sus ids no comparten espacio.
  // Casarlos por identificador suelto es justo el descuido que dejaría salir la
  // ficha equivocada; por eso el emparejamiento lleva el tipo delante.
  const mismoId: Ficha[] = [
    { ...inmueblePago(), id: 'x' },
    { ...remateDePago(), id: 'x' },
  ];
  const salida = redactarMixta(mismoId, 'anonimo');
  assert.equal(salida[0]._kind, 'portal');
  assert.equal(salida[1]._kind, 'remate');
  assert.equal(salida[1].court_email, null);
});

test('portada: una lista vacía no revienta', () => {
  assert.deepEqual(redactarMixta([], 'anonimo'), []);
});

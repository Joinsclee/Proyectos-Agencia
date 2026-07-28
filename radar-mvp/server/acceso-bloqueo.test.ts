/**
 * El resumen sostiene un aviso comercial. Si exagera, el producto miente; si se
 * queda corto, no cumple su función. Se prueba que los números salgan de las
 * filas y no de una suposición.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resumenBloqueo } from './acceso.js';

test('bloqueo: cuenta lo bloqueado y lo visible por separado', () => {
  const r = resumenBloqueo([
    { _bloqueada: true, discount_pct: 60 },
    { _bloqueada: true, discount_pct: 40 },
    { discount_pct: 10 },
  ]);
  assert.equal(r.bloqueadas, 2);
  assert.equal(r.visibles, 1);
  assert.equal(r.descuentoMedioBloqueado, 50);
  assert.equal(r.descuentoMedioVisible, 10);
  assert.equal(r.mejorDescuentoBloqueado, 60);
});

test('bloqueo: deduce el descuento de un remate desde avalúo y postura', () => {
  // Los remates no traen `discount_pct`: su descuento sale de la relación entre
  // la postura mínima y el avalúo.
  const r = resumenBloqueo([{ _bloqueada: true, appraisal_value: 100_000_000, minimum_bid: 70_000_000 }]);
  assert.equal(r.descuentoMedioBloqueado, 30);
});

test('bloqueo: sin nada bloqueado no inventa cifras', () => {
  const r = resumenBloqueo([{ discount_pct: 12 }, { discount_pct: 8 }]);
  assert.equal(r.bloqueadas, 0);
  assert.equal(r.descuentoMedioBloqueado, null);
  assert.equal(r.mejorDescuentoBloqueado, null);
});

test('bloqueo: una lista vacía no revienta ni afirma nada', () => {
  const r = resumenBloqueo([]);
  assert.deepEqual(r, {
    bloqueadas: 0, visibles: 0,
    descuentoMedioBloqueado: null, descuentoMedioVisible: null, mejorDescuentoBloqueado: null,
  });
});

test('bloqueo: ignora los descuentos que no son números', () => {
  const r = resumenBloqueo([
    { _bloqueada: true, discount_pct: 50 },
    { _bloqueada: true, discount_pct: null },
    { _bloqueada: true, discount_pct: 'mucho' },
  ]);
  assert.equal(r.bloqueadas, 3, 'siguen siendo tres fichas bloqueadas');
  assert.equal(r.descuentoMedioBloqueado, 50, 'pero la media solo usa el dato real');
});

test('bloqueo: un avalúo en cero no produce un descuento absurdo', () => {
  const r = resumenBloqueo([{ _bloqueada: true, appraisal_value: 0, minimum_bid: 50_000_000 }]);
  assert.equal(r.descuentoMedioBloqueado, null);
});

test('bloqueo: refleja el caso real de bancos', () => {
  // Medido el 2026-07-28 en /api/bancos: lo bloqueado promedia ~52% de descuento
  // y lo visible está POR ENCIMA del precio de mercado. El aviso puede comparar
  // ambas cifras precisamente porque el muro cubre las categorías de más señal.
  const r = resumenBloqueo([
    { _bloqueada: true, discount_pct: 68 },
    { _bloqueada: true, discount_pct: 52 },
    { _bloqueada: true, discount_pct: 36 },
    { discount_pct: 14 },
    { discount_pct: -60 },
  ]);
  assert.equal(r.descuentoMedioBloqueado, 52);
  assert.equal(r.descuentoMedioVisible, -23);
  assert.ok(r.descuentoMedioBloqueado! > r.descuentoMedioVisible!);
});

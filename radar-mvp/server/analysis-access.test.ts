/**
 * Un `refresh` mal autorizado es gasto real en OpenAI y una escritura con la
 * llave de servicio sobre `features.ai_analysis`. Se prueba aquí la decisión
 * completa, incluidos los cuerpos que un cliente puede mandar a mano.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { puedeForzarAnalisis } from './analysis-access.js';

const anonimo = null;
const usuario = { id: 'u-1', role: 'user' as const };
const admin = { id: 'u-2', role: 'admin' as const };

test('analyze: un anónimo nunca fuerza el re-análisis', () => {
  assert.equal(puedeForzarAnalisis(true, anonimo), false);
});

test('analyze: un usuario autenticado sin rol admin tampoco lo fuerza', () => {
  assert.equal(puedeForzarAnalisis(true, usuario), false);
  assert.equal(puedeForzarAnalisis(true, { id: 'u-3' }), false);
});

test('analyze: un administrador sí puede forzarlo', () => {
  assert.equal(puedeForzarAnalisis(true, admin), true);
});

test('analyze: sin pedirlo no se fuerza ni siendo administrador', () => {
  assert.equal(puedeForzarAnalisis(undefined, admin), false);
  assert.equal(puedeForzarAnalisis(false, admin), false);
});

test('analyze: un valor que solo parece verdadero no cuenta como refresh', () => {
  // El endpoint compara con `true` estricto; un cliente que manda "true", 1 o {}
  // no debe colarse por coerción.
  for (const pedido of ['true', 1, {}, [], 'refresh']) {
    assert.equal(puedeForzarAnalisis(pedido, admin), false, `pedido=${JSON.stringify(pedido)}`);
  }
});

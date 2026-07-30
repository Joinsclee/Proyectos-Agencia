/**
 * Las cifras que devuelve el modelo, comprobadas antes de enseñarlas.
 *
 * La ficha pinta el estimado de la IA junto al veredicto del motor. Si el modelo
 * dice que una oficina vale dos pesos, el usuario ve dos cifras oficiales que se
 * contradicen y no tiene cómo saber cuál creer: eso destruye la confianza en toda
 * la pantalla, no solo en el módulo de IA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valorDeMercadoCreible, descuentoCreible } from './ai.js';

test('IA: un valor de mercado imposible no se enseña', () => {
  // El caso reportado en la auditoría: «valores estimados de $2 COP en oficinas».
  // Era reproducible por diseño: el parseo acotaba el puntaje a 0-100 pero dejaba
  // pasar cualquier número en el campo de pesos.
  assert.equal(valorDeMercadoCreible(2), null, '$2 no es el valor de un inmueble');
  assert.equal(valorDeMercadoCreible(0), null);
  assert.equal(valorDeMercadoCreible(-5_000_000), null);
  assert.equal(valorDeMercadoCreible(999_999_999_999_999), null);
  assert.equal(valorDeMercadoCreible('no es un número'), null);
  assert.equal(valorDeMercadoCreible(null), null);
  // Un valor creíble sí pasa, y sin tocarlo.
  assert.equal(valorDeMercadoCreible(420_000_000), 420_000_000);
});

test('IA: un descuento fuera de rango no se enseña', () => {
  // Por debajo de -100% habría que pagar por llevárselo; por encima de 95% sería
  // regalado. En los dos extremos es más probable un error que una ganga.
  assert.equal(descuentoCreible(-415), null, 'el «+415% sobre mercado» del informe');
  assert.equal(descuentoCreible(99.9), null);
  assert.equal(descuentoCreible(37.44), 37.4, 'se redondea a un decimal');
  assert.equal(descuentoCreible(-36), -36, 'un sobreprecio moderado sí es informativo');
});

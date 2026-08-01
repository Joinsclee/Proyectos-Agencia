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

test('IA: un descuento que contradice a su propia estimación no se enseña', async () => {
  // El caso real del informe: la IA dijo «-30% de descuento» sobre un inmueble de
  // $30.000.000 cuyo valor de mercado ella misma estimó en $22.105.265. Eso no es
  // un descuento del 30%: es un sobreprecio del 36%. El signo contradecía a su
  // propio número, y la ficha lo pintaba al lado del veredicto del motor, que
  // decía lo contrario.
  //
  // Quien lee no puede detectar la contradicción ni rehacer la cuenta, así que el
  // riesgo no es un número feo: es entusiasmarse con algo sobrevalorado creyendo
  // que está barato.
  const { descuentoCoherente } = await import('./ai.js');
  // Un inmueble de 30 millones con mercado estimado en 22 está por ENCIMA, así que
  // un porcentaje positivo —que en esta escala significa «más barato»— miente
  // sobre la dirección. Se descarta.
  assert.equal(descuentoCoherente(30, 30_000_000, 22_105_265), null, 'dice barato lo que está caro');
  // El negativo sí describe la realidad (sobreprecio del ~36%), así que se
  // conserva. Lo que engañaba en la ficha no era este número sino su etiqueta,
  // que lo llamaba «descuento» aunque fuera un sobreprecio: eso se arregló en la
  // interfaz, no aquí.
  assert.equal(descuentoCoherente(-35, 30_000_000, 22_105_265), -35, 'el sobreprecio bien declarado se conserva');
});

test('IA: un descuento que cuadra sí se enseña', async () => {
  const { descuentoCoherente } = await import('./ai.js');
  // 400M sobre un mercado de 500M son un 20% real: coincide con lo declarado.
  assert.equal(descuentoCoherente(20, 400_000_000, 500_000_000), 20);
  // Diferencias pequeñas se toleran: aquí no se persigue precisión decimal, solo
  // se impide que el signo mienta.
  assert.equal(descuentoCoherente(25, 400_000_000, 500_000_000), 25);
  // Una desviación grande sí se descarta, aunque el signo coincida.
  assert.equal(descuentoCoherente(60, 400_000_000, 500_000_000), null);
});

test('IA: sin con qué contrastar, el descuento pasa como antes', async () => {
  // No se puede comprobar coherencia contra un dato que no existe, y quedarse sin
  // la cifra por eso sería perder información buena por precaución.
  const { descuentoCoherente } = await import('./ai.js');
  assert.equal(descuentoCoherente(20, null, 500_000_000), 20);
  assert.equal(descuentoCoherente(20, 400_000_000, null), 20);
});

/**
 * Tests del parser de números colombianos.
 *
 * El bug que motivó este módulo: "8.008 m²" se leía como 8 m². En un lote eso
 * multiplica por mil el precio por m², que es la métrica del Índice CRECE, y el
 * inmueble aparece como el más sobrevalorado del país.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumeroCO, parseAreaCO, parsePrecioCO, clasificarAreaTipo } from './numeros.js';

test('números CO: la coma es decimal y el punto es miles', () => {
  assert.equal(parseNumeroCO('7.000,51'), 7000.51);
  assert.equal(parseNumeroCO('1.234.567,89'), 1234567.89);
  assert.equal(parseNumeroCO('143,57'), 143.57);
});

test('números CO: solo puntos — tres dígitos finales son miles', () => {
  assert.equal(parseNumeroCO('143.538'), 143538);
  assert.equal(parseNumeroCO('8.008'), 8008);
  assert.equal(parseNumeroCO('70.000'), 70000);
  assert.equal(parseNumeroCO('1.000.000'), 1000000);
});

test('números CO: solo puntos — uno o dos dígitos finales son decimales', () => {
  assert.equal(parseNumeroCO('52.30'), 52.3);
  assert.equal(parseNumeroCO('143.5'), 143.5);
});

test('números CO: entradas sucias y vacías', () => {
  assert.equal(parseNumeroCO('$ 154.000.000'), 154000000);
  assert.equal(parseNumeroCO('3.283 m²'), 3283);
  assert.equal(parseNumeroCO(null), null);
  assert.equal(parseNumeroCO(''), null);
  assert.equal(parseNumeroCO('sin número'), null);
});

test('áreas: los casos reales que estaban mal guardados', () => {
  // Estos venían del boletín de AVAL y quedaban como 7, 8, 143 y 5 m².
  assert.equal(parseAreaCO('7.000,51 m²'), 7000.51);
  assert.equal(parseAreaCO('8.008 m²'), 8008);
  assert.equal(parseAreaCO('143.538 m²'), 143538);
  assert.equal(parseAreaCO('5.000 m²'), 5000);
  // Y el que sí funcionaba debe seguir funcionando.
  assert.equal(parseAreaCO('52.30 m²'), 52.3);
});

test('áreas: se descartan valores imposibles', () => {
  assert.equal(parseAreaCO('0'), null);
  assert.equal(parseAreaCO('-5'), null);
  assert.equal(parseAreaCO('99.999.999 m²'), null); // >1.000 hectáreas: error de lectura
});

test('precios: sin decimales', () => {
  assert.equal(parsePrecioCO('$154.000.000'), 154000000);
  assert.equal(parsePrecioCO('788.634.000'), 788634000);
  assert.equal(parsePrecioCO('0'), null);
});

test('area_tipo: un lote nunca se compara contra apartamentos', () => {
  assert.equal(clasificarAreaTipo('Área de terreno m²'), 'terreno');
  assert.equal(clasificarAreaTipo('Área construida m²'), 'construida');
  assert.equal(clasificarAreaTipo('Área privada'), 'construida');
  // Sin etiqueta, el tipo de inmueble decide.
  assert.equal(clasificarAreaTipo('Área m²', 'lot'), 'terreno');
  assert.equal(clasificarAreaTipo('Área m²', 'apartment'), 'construida');
  assert.equal(clasificarAreaTipo(null, null), 'no_especificada');
});

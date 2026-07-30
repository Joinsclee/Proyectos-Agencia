/**
 * Tests de la tabla maestra del Índice CRECE.
 * Correr: npm test
 *
 * Cada frontera de la tabla se prueba por ambos lados: un decimal de más o de
 * menos cambia la categoría de un inmueble y, con ella, si es contenido gratis o
 * de pago. Es el punto del sistema donde un error se traduce en dinero.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creceIndex, clasificar, descuentoPct, desviacionTexto, esOportunidad,
  CORTE_OPORTUNIDAD_FUERTE,
} from './crece.js';

test('CRECE: el ejemplo de la HU (La Castellana, Armenia)', () => {
  // $280.000.000 / 80 m² = $3.500.000/m²; mediana de la zona $5.000.000/m².
  const i = creceIndex(280_000_000 / 80, 5_000_000);
  assert.equal(i, 0.7);
  assert.equal(clasificar(i!).lectura, 'Oportunidad Fuerte');
  assert.equal(clasificar(i!).estrellas, 3);
});

test('CRECE: sin mediana o sin precio no hay índice', () => {
  assert.equal(creceIndex(null, 5_000_000), null);
  assert.equal(creceIndex(3_000_000, null), null);
  assert.equal(creceIndex(3_000_000, 0), null);
  assert.equal(creceIndex(0, 5_000_000), null);
});

test('CRECE: las 11 categorías de la tabla maestra', () => {
  const casos: Array<[number, string, number, number]> = [
    // índice, lectura, estrellas, alertas
    [0.60, 'Oportunidad Fuerte', 3, 0],
    [0.75, 'Oportunidad Fuerte', 3, 0],
    [0.78, 'Oportunidad', 2, 0],
    [0.85, 'Interesante', 1, 0],
    [0.92, 'Abajo del Mercado', 1, 0],
    // «(borde bajo)» era jerga de la tabla interna: describe el tramo 0,93-0,96,
    // o sea entre un 4% y un 7% por debajo. Se dice eso mismo en castellano.
    [0.95, 'Ligeramente por debajo del mercado', 0, 0],
    [1.00, 'Precio de Mercado', 0, 0],
    [1.05, 'Límite Superior', 0, 0],
    [1.08, 'Arriba del Mercado', 0, 1],
    [1.15, 'Sobreprecio', 0, 2],
    [1.25, 'Sobrevalorado', 0, 3],
    [1.50, 'Fuera de Mercado', 0, 4],
  ];
  for (const [i, lectura, estrellas, alertas] of casos) {
    const c = clasificar(i);
    assert.equal(c.lectura, lectura, `índice ${i} debería ser "${lectura}", dio "${c.lectura}"`);
    assert.equal(c.estrellas, estrellas, `estrellas de ${i}`);
    assert.equal(c.alertas, alertas, `alertas de ${i}`);
  }
});

test('CRECE: el hueco 0,71-0,75 quedó cerrado (era el bloqueante de la spec)', () => {
  // La tabla original dejaba sin categoría el rango 0,71–0,75. Decisión del
  // cliente: pertenece a Oportunidad Fuerte (la fila dice "≥25% por debajo",
  // que es exactamente ≤ 0,75).
  for (const i of [0.71, 0.72, 0.73, 0.74, 0.75]) {
    assert.equal(clasificar(i).tier, 'oportunidad_fuerte', `${i} debe ser Oportunidad Fuerte`);
  }
  assert.equal(CORTE_OPORTUNIDAD_FUERTE, 0.75);
});

test('CRECE: fronteras exactas entre categorías', () => {
  // Un decimal decide si la ficha es gratis o de pago.
  assert.equal(clasificar(0.75).tier, 'oportunidad_fuerte');
  assert.equal(clasificar(0.76).tier, 'oportunidad');
  assert.equal(clasificar(0.80).tier, 'oportunidad');
  assert.equal(clasificar(0.81).tier, 'interesante');
  assert.equal(clasificar(0.90).tier, 'interesante');
  assert.equal(clasificar(0.91).tier, 'abajo_mercado');
  assert.equal(clasificar(0.96).tier, 'mercado_borde_bajo');
  assert.equal(clasificar(0.97).tier, 'mercado');
  assert.equal(clasificar(1.03).tier, 'mercado');
  assert.equal(clasificar(1.04).tier, 'limite_superior');
  assert.equal(clasificar(1.29).tier, 'sobrevalorado');
  assert.equal(clasificar(1.30).tier, 'fuera_mercado');
});

test('CRECE: no hay huecos — todo índice de 0,50 a 1,50 cae en una categoría', () => {
  for (let i = 50; i <= 150; i++) {
    const c = clasificar(i / 100);
    assert.ok(c.lectura && c.tier, `índice ${i / 100} quedó sin clasificar`);
  }
});

test('CRECE: solo Oportunidad y Oportunidad Fuerte son de suscripción', () => {
  assert.equal(clasificar(0.70).requiereSuscripcion, true);  // Oportunidad Fuerte
  assert.equal(clasificar(0.78).requiereSuscripcion, true);  // Oportunidad
  assert.equal(clasificar(0.85).requiereSuscripcion, false); // Interesante → gratis
  assert.equal(clasificar(1.00).requiereSuscripcion, false); // Mercado → gratis
  assert.equal(clasificar(1.40).requiereSuscripcion, false); // Fuera de mercado → gratis
});

test('CRECE: el redondeo a 2 decimales respeta la resolución de la tabla', () => {
  // 0,7549 redondea a 0,75 → sigue siendo Oportunidad Fuerte.
  assert.equal(clasificar(0.7549).tier, 'oportunidad_fuerte');
  // 0,7551 redondea a 0,76 → pasa a Oportunidad.
  assert.equal(clasificar(0.7551).tier, 'oportunidad');
});

test('CRECE: descuento y desviación son la otra cara del índice', () => {
  assert.equal(descuentoPct(0.70), 30);
  assert.equal(descuentoPct(0.85), 15);
  assert.equal(descuentoPct(1.20), -20); // por encima del mercado = descuento negativo
  assert.equal(desviacionTexto(0.73), '27% por debajo');
  assert.equal(desviacionTexto(1.15), '15% por encima');
  assert.equal(desviacionTexto(1.00), 'en la mediana');
});

test('CRECE: esOportunidad cubre las tres categorías con estrella', () => {
  assert.ok(esOportunidad('oportunidad_fuerte'));
  assert.ok(esOportunidad('oportunidad'));
  assert.ok(esOportunidad('interesante'));
  assert.ok(!esOportunidad('abajo_mercado'));
  assert.ok(!esOportunidad('mercado'));
  assert.ok(!esOportunidad('sobreprecio'));
});

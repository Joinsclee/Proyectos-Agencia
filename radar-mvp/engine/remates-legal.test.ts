/**
 * Tests de los campos jurídicos de remates y la matriz de acceso.
 *
 * El caso que más importa: TODO aviso de remate dice "la postura mínima será el
 * 70% del avalúo". Si el extractor confunde ese 70% con la cuota-parte, marca la
 * alerta amarilla en todos los remates y la alerta deja de significar nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  origenDemandante, tipoProceso, extraerCuotaParte, tieneCuotaParte,
  accesoRemate, requiereSuscripcionRemate,
} from './remates-legal.js';

test('remates: origen del demandante, con el default conservador', () => {
  assert.equal(origenDemandante(true), 'bancario');
  assert.equal(origenDemandante(false), 'particular_otro');
  // Sin dato NO se asume banco: eso le vendería al usuario una seguridad
  // jurídica que nadie verificó.
  assert.equal(origenDemandante(null), 'particular_otro');
  assert.equal(origenDemandante(undefined), 'particular_otro');
});

test('remates: tipo de proceso', () => {
  assert.equal(tipoProceso('PROCESO EJECUTIVO HIPOTECARIO DE MAYOR CUANTÍA'), 'ejecutivo_hipotecario');
  assert.equal(tipoProceso('Ejecutivo con garantía real'), 'ejecutivo_hipotecario');
  assert.equal(tipoProceso('PROCESO EJECUTIVO SINGULAR'), 'otro');
  assert.equal(tipoProceso('Divisorio'), 'otro');
  assert.equal(tipoProceso(null, undefined), 'otro');
});

test('remates: el 70% del avalúo NO es cuota-parte (el falso positivo crítico)', () => {
  const aviso = `AVISO DE REMATE. Se fija como base de la licitación el 70% del avalúo
    del bien. Los postores deberán consignar previamente el 40% del avalúo para
    poder participar en la subasta.`;
  const r = extraerCuotaParte(aviso);
  assert.equal(r.porcentaje, 100, `no debe detectar cuota-parte, detectó ${r.porcentaje}%`);
  assert.ok(!tieneCuotaParte(r.porcentaje));
});

test('remates: sí detecta cuota-parte real', () => {
  const casos: Array<[string, number]> = [
    ['Se rematará el 50% del derecho de dominio que le corresponde al demandado', 50],
    ['LOTE — se remata el 71.14% del inmueble identificado con M.I. 156-108676', 71.14],
    ['Cuota parte del 33,33% sobre el bien inmueble', 33.33],
    ['derechos en común y proindiviso equivalentes al 25% del predio', 25],
  ];
  for (const [texto, esperado] of casos) {
    const r = extraerCuotaParte(texto);
    assert.equal(r.porcentaje, esperado, `"${texto.slice(0, 40)}…" → esperaba ${esperado}, dio ${r.porcentaje}`);
    assert.ok(tieneCuotaParte(r.porcentaje));
    assert.ok(r.evidencia, 'debe guardar la evidencia para poder auditarla');
  }
});

test('remates: aviso mixto — distingue la cuota del porcentaje de la postura', () => {
  const aviso = `Se rematará el 50% del derecho de dominio del inmueble. La base de la
    licitación será el 70% del avalúo y los postores consignarán el 40% del mismo.`;
  const r = extraerCuotaParte(aviso);
  assert.equal(r.porcentaje, 50, `debe quedarse con el 50% del dominio, dio ${r.porcentaje}`);
});

test('remates: "el 100% del dominio" es dominio pleno, no alerta', () => {
  const r = extraerCuotaParte('Se remata el 100% del derecho de dominio y posesión');
  assert.equal(r.porcentaje, 100);
  assert.ok(!tieneCuotaParte(r.porcentaje));
});

test('remates: sin porcentaje en el aviso se asume dominio pleno', () => {
  assert.equal(extraerCuotaParte('CASA DE HABITACIÓN UBICADA EN LA CALLE 10').porcentaje, 100);
  assert.equal(extraerCuotaParte(null, undefined, '').porcentaje, 100);
});

test('remates: ante varias cuotas se queda con la menor (la que más advierte)', () => {
  const r = extraerCuotaParte('derechos del 50% y cuota parte del 25% del dominio');
  assert.equal(r.porcentaje, 25);
});

test('remates: matriz de acceso completa, celda por celda', () => {
  // Bancario
  assert.equal(accesoRemate('bancario', 10), 'gratis');
  assert.equal(accesoRemate('bancario', 19), 'gratis');
  assert.equal(accesoRemate('bancario', 20), 'suscripcion');
  assert.equal(accesoRemate('bancario', 28), 'suscripcion');
  assert.equal(accesoRemate('bancario', 39), 'suscripcion');
  assert.equal(accesoRemate('bancario', 40), 'suscripcion');
  assert.equal(accesoRemate('bancario', 60), 'suscripcion');
  // Particular / otro
  assert.equal(accesoRemate('particular_otro', 10), 'gratis');
  assert.equal(accesoRemate('particular_otro', 19), 'gratis');
  assert.equal(accesoRemate('particular_otro', 20), 'gratis_con_aviso');
  assert.equal(accesoRemate('particular_otro', 28), 'gratis_con_aviso');
  assert.equal(accesoRemate('particular_otro', 39), 'gratis_con_aviso');
  assert.equal(accesoRemate('particular_otro', 40), 'suscripcion');
  assert.equal(accesoRemate('particular_otro', 60), 'suscripcion');
  // Sin descuento conocido: se trata como bajo → gratis
  assert.equal(accesoRemate('bancario', null), 'gratis');
});

test('remates: el ejemplo de la HU (28% bancario es de pago, particular es gratis)', () => {
  assert.equal(requiereSuscripcionRemate(accesoRemate('bancario', 28)), true);
  assert.equal(requiereSuscripcionRemate(accesoRemate('particular_otro', 28)), false);
});

test('remates: la alerta de cuota-parte es independiente de la matriz de acceso', () => {
  // Un remate bancario de pago CON cuota-parte debe mostrar ambas cosas: el muro
  // de suscripción y la alerta amarilla. Una no reemplaza a la otra.
  const acceso = accesoRemate('bancario', 28);
  const cuota = extraerCuotaParte('se remata el 50% del derecho de dominio');
  assert.equal(requiereSuscripcionRemate(acceso), true);
  assert.equal(tieneCuotaParte(cuota.porcentaje), true);
});

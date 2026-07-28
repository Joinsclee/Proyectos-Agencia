/**
 * Los porcentajes de esta configuración multiplican el precio de un inmueble en
 * la pantalla de un cliente. Un valor mal validado no rompe nada visible: solo
 * hace que la ficha diga que escriturar cuesta veinte millones cuando cuesta
 * dos. Por eso la validación se prueba entera y sin red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GASTOS_POR_DEFECTO,
  MAX_PORCENTAJE_LINEA,
  MAX_PORCENTAJE_TOTAL,
  parametrosDesdeFila,
  validarParametrosGastos,
} from './parametros-gastos.js';

const validos = { notaria: 0.003, impuestoRegistro: 0.012, derechosRegistro: 0.005 };

test('parámetros: acepta un juego de porcentajes plausible', () => {
  const r = validarParametrosGastos(validos);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.parametros, validos);
});

test('parámetros: los valores por defecto se validan a sí mismos', () => {
  // Si los valores compilados dejaran de pasar la validación, el producto
  // degradaría a algo que el propio servidor considera inválido — y nadie se
  // enteraría, porque la degradación es silenciosa por diseño.
  const r = validarParametrosGastos({ ...GASTOS_POR_DEFECTO });
  assert.equal(r.ok, true, 'GASTOS_POR_DEFECTO tiene que ser un valor guardable');
});

test('parámetros: rechaza un porcentaje negativo', () => {
  const r = validarParametrosGastos({ ...validos, notaria: -0.01 });
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.error, /negativo/i);
});

test('parámetros: rechaza el error de dedo de escribir porcentaje en vez de fracción', () => {
  // Escribir «1» pensando en «1 %» es EL error de este formulario: pasaría como
  // número válido y multiplicaría el precio por uno entero, es decir, un 100 %
  // de gastos de escrituración.
  for (const disparate of [1, 0.9, 5, 0.5]) {
    const r = validarParametrosGastos({ ...validos, impuestoRegistro: disparate });
    assert.equal(r.ok, false, `${disparate} no puede pasar como impuesto de registro`);
  }
});

test('parámetros: el techo por línea es exclusivo justo por encima', () => {
  assert.equal(validarParametrosGastos({
    notaria: MAX_PORCENTAJE_LINEA, impuestoRegistro: 0, derechosRegistro: 0,
  }).ok, true, 'el tope exacto sí se puede guardar');
  assert.equal(validarParametrosGastos({
    notaria: MAX_PORCENTAJE_LINEA + 0.0001, impuestoRegistro: 0, derechosRegistro: 0,
  }).ok, false);
});

test('parámetros: tres valores plausibles que suman un disparate se rechazan', () => {
  // Cada uno pasa el techo de línea (5 %), pero juntos son un 15 % del valor del
  // inmueble: eso ya no es un costo de registro, es un error de captura.
  const r = validarParametrosGastos({ notaria: 0.05, impuestoRegistro: 0.05, derechosRegistro: 0.05 });
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.error, /sumar/i);
});

test('parámetros: el techo del total se puede alcanzar exactamente', () => {
  // Sin la tolerancia de coma flotante, 0.04 + 0.04 + 0.02 da 0.10000000000000002
  // y el usuario vería rechazado un valor que la pantalla le muestra como legal.
  const r = validarParametrosGastos({ notaria: 0.04, impuestoRegistro: 0.04, derechosRegistro: 0.02 });
  assert.equal(r.ok, true, `${0.04 + 0.04 + 0.02} debe caber en ${MAX_PORCENTAJE_TOTAL}`);
});

test('parámetros: NaN y texto no se cuelan como porcentaje', () => {
  // `Number('')` es 0 y `Number('abc')` es NaN: sin el `finite` del esquema, un
  // NaN se guardaría y convertiría en NaN el total de gastos de todas las fichas.
  for (const basura of [Number.NaN, Number('abc'), Infinity, '0.01', null, undefined]) {
    assert.equal(
      validarParametrosGastos({ ...validos, derechosRegistro: basura }).ok,
      false,
      `${String(basura)} no puede pasar`,
    );
  }
});

test('parámetros: falta un campo → no se guarda a medias', () => {
  assert.equal(validarParametrosGastos({ notaria: 0.003 }).ok, false);
  assert.equal(validarParametrosGastos({}).ok, false);
  assert.equal(validarParametrosGastos(null).ok, false);
});

test('parámetros: una fila con `numeric` en texto se lee igual', () => {
  // El driver de Postgres puede entregar `numeric` como cadena; si no se
  // normalizara, la fila válida se descartaría y el panel serviría los valores
  // por defecto para siempre sin decir por qué.
  const p = parametrosDesdeFila({
    notaria: '0.002700', impuesto_registro: '0.010000', derechos_registro: '0.005000',
  });
  assert.deepEqual(p, { notaria: 0.0027, impuestoRegistro: 0.01, derechosRegistro: 0.005 });
});

test('parámetros: una fila fuera de rango se descarta en vez de publicarse', () => {
  // Los CHECK de la migración cubren un UPDATE manual, pero no cubren que
  // alguien haya alterado la tabla después. Ante una fila imposible, degradar.
  assert.equal(parametrosDesdeFila({
    notaria: 0.4, impuesto_registro: 0.01, derechos_registro: 0.005,
  }), null);
  assert.equal(parametrosDesdeFila(null), null);
  assert.equal(parametrosDesdeFila({}), null);
});

test('parámetros: null, booleanos y arrays no se convierten en 0 %', () => {
  // Enviando `{"notaria": null}` a la API, `Number(null)` daba 0, superaba el
  // `min(0)` y la notaría quedaba al 0 % en la base: la calculadora de todas las
  // fichas dejaba de cobrarla. `true` habría entrado como 1 (100 %) y `[]` como
  // otro 0. Ninguno de los tres es un porcentaje escrito por nadie.
  for (const basura of [null, true, false, [], {}, '', '0.01']) {
    const r = validarParametrosGastos({ ...validos, notaria: basura });
    assert.equal(r.ok, false, `${JSON.stringify(basura)} no puede pasar como porcentaje`);
  }
  // Y el caso legítimo sigue entrando.
  assert.equal(validarParametrosGastos({ ...validos, notaria: 0.0027 }).ok, true);
  assert.equal(validarParametrosGastos({ ...validos, notaria: 0 }).ok, true, 'un 0 % explícito sí es válido');
});

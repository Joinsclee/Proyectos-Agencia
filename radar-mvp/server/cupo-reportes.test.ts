/**
 * El cupo de reportes es el segundo contador del plan gratuito, y tiene que
 * fallar por los mismos dos lados que el de fichas: si cuenta de más, el usuario
 * gratuito se queda sin poder llevarse lo que ya miró; si cuenta de menos, el
 * plan de pago deja de tener sentido. Además debe ser INDEPENDIENTE del cupo de
 * fichas — que es justo la razón de que exista este archivo aparte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { leerCupo } from './cupo.js';
import {
  CUPO_REPORTES_FREE,
  consumirCupoReportes,
  estadoCupoReportes,
  leerCupoReportes,
  yaReportado,
  type CupoReportes,
} from './cupo-reportes.js';

const cupo = (o: Partial<CupoReportes> = {}): CupoReportes => ({ periodo: '2026-07', generados: [], ...o });
const lleno = () => cupo({ generados: Array.from({ length: CUPO_REPORTES_FREE }, (_, i) => `id-${i}`) });

test('reportes: el plan gratuito tiene 20 al mes', () => {
  // Es la regla de negocio acordada con el cliente. Si alguien la cambia sin
  // querer (un refactor, un copy-paste del otro cupo), esto lo detiene.
  assert.equal(CUPO_REPORTES_FREE, 20);
});

test('reportes: un anónimo no descarga ninguno', () => {
  const r = consumirCupoReportes(cupo(), 'x', 'anonimo');
  assert.equal(r.permitido, false);
  assert.equal(r.consumido, false);
});

test('reportes: un suscrito descarga sin gastar nada', () => {
  const r = consumirCupoReportes(lleno(), 'nuevo', 'suscrito');
  assert.equal(r.permitido, true);
  assert.equal(r.consumido, false);
  assert.equal(r.cupo.generados.length, CUPO_REPORTES_FREE, 'no se le añade nada');
});

test('reportes: un registrado gasta uno al descargar', () => {
  const r = consumirCupoReportes(cupo(), 'ficha-1', 'free');
  assert.equal(r.permitido, true);
  assert.equal(r.consumido, true);
  assert.deepEqual(r.cupo.generados, ['ficha-1']);
});

test('reportes: volver a descargar el mismo inmueble no vuelve a cobrar', () => {
  // El archivo se pierde, se comparte con el socio, se reimprime. Cobrar la
  // segunda copia empujaría a no descargar por miedo a gastar.
  const conUno = consumirCupoReportes(cupo(), 'ficha-1', 'free').cupo;
  const otraVez = consumirCupoReportes(conUno, 'ficha-1', 'free');
  assert.equal(otraVez.permitido, true);
  assert.equal(otraVez.consumido, false);
  assert.equal(otraVez.cupo.generados.length, 1);
});

test('reportes: agotado el mes, un inmueble nuevo se bloquea', () => {
  const r = consumirCupoReportes(lleno(), 'ficha-nueva', 'free');
  assert.equal(r.permitido, false);
  assert.equal(r.consumido, false);
});

test('reportes: agotado el mes, los ya descargados se pueden repetir', () => {
  const r = consumirCupoReportes(lleno(), 'id-3', 'free');
  assert.equal(r.permitido, true);
  assert.equal(r.consumido, false);
});

test('reportes: al cambiar de mes se reinicia solo, sin proceso programado', () => {
  const guardado = { report_quota: { periodo: '2026-06', generados: ['a', 'b', 'c'] } };
  const leido = leerCupoReportes(guardado, new Date('2026-07-15T12:00:00Z'));
  assert.equal(leido.periodo, '2026-07');
  assert.deepEqual(leido.generados, [], 'el mes anterior no se arrastra');
});

test('reportes: el periodo se corta en hora de Colombia', () => {
  // 2026-08-01T02:00Z son las 21:00 del 31 de julio en Bogotá: ese reporte
  // pertenece al cupo de julio.
  const guardado = { report_quota: { periodo: '2026-07', generados: ['a'] } };
  assert.deepEqual(leerCupoReportes(guardado, new Date('2026-08-01T02:00:00Z')).generados, ['a']);
  assert.deepEqual(leerCupoReportes(guardado, new Date('2026-08-01T06:00:00Z')).generados, []);
});

test('reportes: dentro del mismo mes se conserva lo descargado', () => {
  const guardado = { report_quota: { periodo: '2026-07', generados: ['a', 'b'] } };
  const leido = leerCupoReportes(guardado, new Date('2026-07-20T12:00:00Z'));
  assert.deepEqual(leido.generados, ['a', 'b']);
  assert.ok(yaReportado(leido, 'a'));
});

test('reportes: un guardado corrupto no concede acceso ni rompe la petición', () => {
  for (const basura of [null, 'texto', 42, { periodo: 'julio' }, { generados: 'no-array' }]) {
    const leido = leerCupoReportes({ report_quota: basura }, new Date('2026-07-20T12:00:00Z'));
    assert.deepEqual(leido.generados, [], `basura=${JSON.stringify(basura)}`);
  }
});

test('reportes: el estado que ve el usuario cuadra con lo que puede descargar', () => {
  assert.deepEqual(estadoCupoReportes(cupo(), 'anonimo'), {
    limite: 0, usados: 0, restantes: 0, periodo: '2026-07', ilimitado: false,
  });
  assert.deepEqual(estadoCupoReportes(cupo({ generados: ['a', 'b'] }), 'free'), {
    limite: CUPO_REPORTES_FREE, usados: 2, restantes: CUPO_REPORTES_FREE - 2, periodo: '2026-07', ilimitado: false,
  });
  const suscrito = estadoCupoReportes(lleno(), 'suscrito');
  assert.equal(suscrito.ilimitado, true);
  assert.equal(suscrito.restantes, null);
});

test('reportes: nunca se anuncian restantes negativas', () => {
  const pasado = cupo({ generados: Array.from({ length: CUPO_REPORTES_FREE + 5 }, (_, i) => `id-${i}`) });
  assert.equal(estadoCupoReportes(pasado, 'free').restantes, 0);
  assert.equal(estadoCupoReportes(pasado, 'free').usados, CUPO_REPORTES_FREE);
});

test('reportes: el cupo de reportes y el de fichas no se pisan', () => {
  // Es la razón de existir de este módulo: quien abrió sus 20 fichas del mes
  // tiene que poder descargar los reportes de esas mismas fichas.
  const metadata = {
    unlock_quota: { periodo: '2026-07', desbloqueadas: Array.from({ length: 20 }, (_, i) => `f-${i}`) },
    report_quota: { periodo: '2026-07', generados: ['f-0'] },
  };
  const ahora = new Date('2026-07-20T12:00:00Z');
  assert.equal(leerCupo(metadata, ahora).desbloqueadas.length, 20, 'fichas agotadas');
  assert.equal(estadoCupoReportes(leerCupoReportes(metadata, ahora), 'free').restantes, 19);

  // Y al revés: gastar un reporte no toca la bolsa de fichas.
  const trasReporte = consumirCupoReportes(leerCupoReportes(metadata, ahora), 'f-1', 'free');
  assert.equal(trasReporte.consumido, true);
  assert.equal(leerCupo(metadata, ahora).desbloqueadas.length, 20, 'las fichas siguen intactas');
});

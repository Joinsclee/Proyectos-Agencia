/**
 * El cupo es lo único que distingue a una cuenta gratuita de un visitante
 * anónimo, y a la vez lo único que impide que el plan gratuito reemplace al de
 * pago. Un error en cualquiera de las dos direcciones se lleva el modelo de
 * negocio por delante.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUPO_MENSUAL_FREE,
  consumirCupo,
  estadoCupo,
  leerCupo,
  periodoDe,
  yaDesbloqueada,
  type Cupo,
} from './cupo.js';

const cupo = (o: Partial<Cupo> = {}): Cupo => ({ periodo: '2026-07', desbloqueadas: [], ...o });
const lleno = () => cupo({ desbloqueadas: Array.from({ length: CUPO_MENSUAL_FREE }, (_, i) => `id-${i}`) });

test('cupo: el periodo se calcula en hora de Colombia', () => {
  // 2026-08-01T02:00Z son todavía las 21:00 del 31 de julio en Bogotá: esa ficha
  // pertenece al cupo de julio, no al de agosto.
  assert.equal(periodoDe(new Date('2026-08-01T02:00:00Z')), '2026-07');
  assert.equal(periodoDe(new Date('2026-08-01T06:00:00Z')), '2026-08');
  assert.equal(periodoDe(new Date('2026-07-15T12:00:00Z')), '2026-07');
});

test('cupo: un anónimo no abre ninguna ficha de oportunidad', () => {
  const r = consumirCupo(cupo(), 'x', 'anonimo');
  assert.equal(r.permitido, false);
  assert.equal(r.consumido, false);
});

test('cupo: un suscrito abre sin gastar nada', () => {
  const r = consumirCupo(lleno(), 'nueva', 'suscrito');
  assert.equal(r.permitido, true);
  assert.equal(r.consumido, false);
  assert.equal(r.cupo.desbloqueadas.length, CUPO_MENSUAL_FREE, 'no se le añade nada');
});

test('cupo: un registrado gasta una ficha al abrirla', () => {
  const r = consumirCupo(cupo(), 'ficha-1', 'free');
  assert.equal(r.permitido, true);
  assert.equal(r.consumido, true);
  assert.deepEqual(r.cupo.desbloqueadas, ['ficha-1']);
});

test('cupo: reabrir la misma ficha no vuelve a cobrar', () => {
  // Volver sobre algo que ya se miró es lo normal cuando se evalúa una compra.
  // Cobrarlo empujaría al usuario a no abrir fichas, que es lo contrario de lo
  // que el producto necesita.
  const conUna = consumirCupo(cupo(), 'ficha-1', 'free').cupo;
  const otraVez = consumirCupo(conUna, 'ficha-1', 'free');
  assert.equal(otraVez.permitido, true);
  assert.equal(otraVez.consumido, false);
  assert.equal(otraVez.cupo.desbloqueadas.length, 1);
});

test('cupo: agotado el mes, una ficha nueva se bloquea', () => {
  const r = consumirCupo(lleno(), 'ficha-nueva', 'free');
  assert.equal(r.permitido, false);
  assert.equal(r.consumido, false);
});

test('cupo: agotado el mes, las ya abiertas siguen abiertas', () => {
  // Si al gastar la última se cerraran las anteriores, el usuario perdería lo que
  // ya había mirado. El cupo limita cuántas se abren, no cuánto duran.
  const r = consumirCupo(lleno(), 'id-3', 'free');
  assert.equal(r.permitido, true);
  assert.equal(r.consumido, false);
});

test('cupo: al cambiar de mes se reinicia solo, sin proceso programado', () => {
  const guardado = { unlock_quota: { periodo: '2026-06', desbloqueadas: ['a', 'b', 'c'] } };
  const leido = leerCupo(guardado, new Date('2026-07-15T12:00:00Z'));
  assert.equal(leido.periodo, '2026-07');
  assert.deepEqual(leido.desbloqueadas, [], 'el mes anterior no se arrastra');
});

test('cupo: dentro del mismo mes se conserva lo abierto', () => {
  const guardado = { unlock_quota: { periodo: '2026-07', desbloqueadas: ['a', 'b'] } };
  const leido = leerCupo(guardado, new Date('2026-07-20T12:00:00Z'));
  assert.deepEqual(leido.desbloqueadas, ['a', 'b']);
  assert.ok(yaDesbloqueada(leido, 'a'));
});

test('cupo: un guardado corrupto no concede acceso ni rompe la petición', () => {
  for (const basura of [null, 'texto', 42, { periodo: 'julio' }, { desbloqueadas: 'no-array' }]) {
    const leido = leerCupo({ unlock_quota: basura }, new Date('2026-07-20T12:00:00Z'));
    assert.deepEqual(leido.desbloqueadas, [], `basura=${JSON.stringify(basura)}`);
  }
});

test('cupo: el estado que ve el usuario cuadra con lo que puede abrir', () => {
  assert.deepEqual(estadoCupo(cupo(), 'anonimo'), {
    limite: 0, usadas: 0, restantes: 0, periodo: '2026-07', ilimitado: false,
  });
  assert.deepEqual(estadoCupo(cupo({ desbloqueadas: ['a', 'b'] }), 'free'), {
    limite: CUPO_MENSUAL_FREE, usadas: 2, restantes: CUPO_MENSUAL_FREE - 2, periodo: '2026-07', ilimitado: false,
  });
  const suscrito = estadoCupo(lleno(), 'suscrito');
  assert.equal(suscrito.ilimitado, true);
  assert.equal(suscrito.restantes, null);
});

test('cupo: nunca se anuncian restantes negativas', () => {
  // Si el límite bajara alguna vez, un cupo viejo podría tener más ids que el
  // tope nuevo y la interfaz mostraría "te quedan -3".
  const pasado = cupo({ desbloqueadas: Array.from({ length: CUPO_MENSUAL_FREE + 5 }, (_, i) => `id-${i}`) });
  const estado = estadoCupo(pasado, 'free');
  assert.equal(estado.restantes, 0);
  assert.equal(estado.usadas, CUPO_MENSUAL_FREE);
});

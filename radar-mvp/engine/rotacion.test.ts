import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotarSemanal, semanaISO } from './rotacion.js';

test('rotación: conserva todos los elementos, sin perder ni duplicar', () => {
  const xs = [1,2,3,4,5,6,7];
  const r = rotarSemanal(xs, 3);
  assert.equal(r.length, xs.length);
  assert.deepEqual([...r].sort((a,b)=>a-b), xs);
});

test('rotación: estable dentro de la semana, distinta al cambiar', () => {
  const xs = ['a','b','c','d','e'];
  assert.deepEqual(rotarSemanal(xs, 10), rotarSemanal(xs, 10)); // misma semana → mismo orden
  assert.notDeepEqual(rotarSemanal(xs, 10), rotarSemanal(xs, 11));
});

test('rotación: listas cortas no se rompen', () => {
  assert.deepEqual(rotarSemanal([], 5), []);
  assert.deepEqual(rotarSemanal(['solo'], 5), ['solo']);
});

test('semana ISO avanza y es estable dentro de la misma semana', () => {
  const lunes = new Date('2026-07-20T10:00:00Z');
  const jueves = new Date('2026-07-23T10:00:00Z');
  const siguiente = new Date('2026-07-28T10:00:00Z');
  assert.equal(semanaISO(lunes), semanaISO(jueves));
  assert.notEqual(semanaISO(lunes), semanaISO(siguiente));
});

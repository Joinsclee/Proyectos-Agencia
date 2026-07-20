/**
 * Tests del planificador. Lo que se prueba aquí es la decisión de "¿le toca?",
 * que es donde un error se traduce en que el radar deje de actualizarse en
 * silencio — o en que se scrapee de más y se queme la cuota de Firecrawl.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toca } from './scheduler.js';

const AHORA = new Date('2026-07-20T12:00:00Z');
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString();
const job = (o: Partial<Parameters<typeof toca>[0]> = {}) => ({
  nombre: 'x', cadencia_dias: 7, habilitado: true,
  ultima_corrida: null, corriendo_desde: null, ...o,
}) as Parameters<typeof toca>[0];

test('cron: si nunca ha corrido, toca', () => {
  assert.ok(toca(job({ ultima_corrida: null }), AHORA));
});

test('cron: respeta la cadencia de 7 días', () => {
  assert.ok(!toca(job({ ultima_corrida: haceDias(6) }), AHORA));
  assert.ok(toca(job({ ultima_corrida: haceDias(7) }), AHORA));
  assert.ok(toca(job({ ultima_corrida: haceDias(9) }), AHORA));
});

test('cron: los bancos van a 15 días, no a 7', () => {
  const bancos = job({ cadencia_dias: 15, ultima_corrida: haceDias(8) });
  assert.ok(!toca(bancos, AHORA), 'a los 8 días todavía no');
  assert.ok(toca(job({ cadencia_dias: 15, ultima_corrida: haceDias(15) }), AHORA));
});

test('cron: un trabajo deshabilitado nunca corre', () => {
  assert.ok(!toca(job({ habilitado: false, ultima_corrida: haceDias(90) }), AHORA));
});

test('cron: el cerrojo evita que dos procesos corran lo mismo', () => {
  const tomado = job({ ultima_corrida: haceDias(30), corriendo_desde: haceDias(0) });
  assert.ok(!toca(tomado, AHORA), 'otro proceso lo tiene tomado');
});

test('cron: un cerrojo viejo se ignora (el proceso anterior murió)', () => {
  // Sin esto, un contenedor que muere a mitad de un scrape dejaría el trabajo
  // bloqueado para siempre y el radar se congelaría sin avisar.
  const zombi = job({ ultima_corrida: haceDias(30), corriendo_desde: haceDias(1) });
  assert.ok(toca(zombi, AHORA), 'cerrojo de más de 6 h debe liberarse');
});

test('cron: tras una caída larga recupera lo pendiente', () => {
  // El calendario vive en la base, así que estar caído 20 días no salta corridas.
  assert.ok(toca(job({ cadencia_dias: 7, ultima_corrida: haceDias(20) }), AHORA));
});

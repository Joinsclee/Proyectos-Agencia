/**
 * Lo que se prueba aquí es la promesa que el dashboard le hace al usuario sobre
 * la edad del dato. Un falso «al día» vale más caro que un falso «degradado».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluarFrescura, type TrabajoCron } from './frescura.js';

const AHORA = new Date('2026-07-27T12:00:00Z');
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString();
const trabajo = (o: Partial<TrabajoCron> = {}): TrabajoCron => ({
  nombre: 'fincaraiz',
  cadencia_dias: 7,
  habilitado: true,
  ultima_corrida: haceDias(1),
  ultimo_estado: 'ok',
  ...o,
});

test('frescura: con todo al día no se degrada', () => {
  const f = evaluarFrescura([
    trabajo({ nombre: 'fincaraiz', ultima_corrida: haceDias(0.5) }),
    trabajo({ nombre: 'motor', cadencia_dias: 1, ultima_corrida: haceDias(0.3) }),
  ], AHORA);
  assert.equal(f.degradada, false);
  assert.equal(f.motivo, null);
});

test('frescura: la fecha mostrada es la corrida más reciente, no la de hoy', () => {
  // El defecto original: la pantalla decía "hoy" aunque nada hubiera corrido.
  const f = evaluarFrescura([
    trabajo({ nombre: 'bancos', ultima_corrida: haceDias(6) }),
    trabajo({ nombre: 'motor', cadencia_dias: 1, ultima_corrida: haceDias(2) }),
  ], AHORA);
  assert.equal(f.actualizadoEn, haceDias(2));
});

test('frescura: se tolera saltarse una vuelta pero no dos', () => {
  const unaVuelta = evaluarFrescura([trabajo({ ultima_corrida: haceDias(13) })], AHORA);
  assert.equal(unaVuelta.degradada, false, 'a 13 días con cadencia 7 todavía se aguanta');
  const dosVueltas = evaluarFrescura([trabajo({ ultima_corrida: haceDias(15) })], AHORA);
  assert.equal(dosVueltas.degradada, true);
  assert.match(dosVueltas.motivo ?? '', /fincaraiz lleva 15 días/);
});

test('frescura: un error declarado degrada de inmediato, sin esperar la cadencia', () => {
  const f = evaluarFrescura([
    trabajo({ nombre: 'remates', ultima_corrida: haceDias(0.1), ultimo_estado: 'error' }),
  ], AHORA);
  assert.equal(f.degradada, true);
  assert.match(f.motivo ?? '', /remates.*error/);
});

test('frescura: un trabajo que nunca corrió cuenta como vencido', () => {
  const f = evaluarFrescura([trabajo({ nombre: 'remates', ultima_corrida: null })], AHORA);
  assert.equal(f.degradada, true);
  assert.match(f.motivo ?? '', /nunca ha corrido/);
});

test('frescura: los trabajos deshabilitados no cuentan', () => {
  // `alertas` está apagado por decisión de producto: no puede pintar el
  // dashboard de degradado por llevar meses sin enviar nada.
  const f = evaluarFrescura([
    trabajo({ nombre: 'fincaraiz', ultima_corrida: haceDias(1) }),
    trabajo({ nombre: 'alertas', habilitado: false, ultima_corrida: null }),
  ], AHORA);
  assert.equal(f.degradada, false);
  assert.deepEqual(f.fuentes.map((s) => s.nombre), ['fincaraiz']);
});

test('frescura: sin trabajos activos no se inventa una fecha', () => {
  const f = evaluarFrescura([], AHORA);
  assert.equal(f.actualizadoEn, null);
  assert.equal(f.degradada, false);
});

test('frescura: el motivo señala la fuente más atrasada', () => {
  const f = evaluarFrescura([
    trabajo({ nombre: 'bancos', ultima_corrida: haceDias(20) }),
    trabajo({ nombre: 'remates', ultima_corrida: haceDias(40) }),
  ], AHORA);
  assert.match(f.motivo ?? '', /remates lleva 40 días/);
});

test('frescura: una fecha ilegible no pasa por fresca', () => {
  const f = evaluarFrescura([trabajo({ ultima_corrida: 'no-es-una-fecha' })], AHORA);
  assert.equal(f.degradada, true);
  assert.equal(f.fuentes[0].dias, null);
});

test('frescura: el estado real de hoy no está degradado', () => {
  // Reproduce lo medido en producción el 2026-07-27: bancos y remates llevan 6,6
  // días con cadencia 7. Está en el límite y NO debe alarmar.
  const f = evaluarFrescura([
    trabajo({ nombre: 'fincaraiz', ultima_corrida: haceDias(0.5) }),
    trabajo({ nombre: 'bancos', ultima_corrida: haceDias(6.6) }),
    trabajo({ nombre: 'remates', ultima_corrida: haceDias(6.6) }),
    trabajo({ nombre: 'motor', cadencia_dias: 1, ultima_corrida: haceDias(0.3) }),
  ], AHORA);
  assert.equal(f.degradada, false);
});

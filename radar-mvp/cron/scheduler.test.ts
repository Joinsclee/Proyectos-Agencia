/**
 * Tests del planificador. Lo que se prueba aquí es la decisión de "¿le toca?",
 * que es donde un error se traduce en que el radar deje de actualizarse en
 * silencio — o en que se scrapee de más y se queme la cuota de Firecrawl.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toca, tomarCerrojoCon, type ActualizarCerrojo } from './scheduler.js';

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

test('cron: los bancos se verifican cada 7 días', () => {
  const bancos = job({ nombre: 'bancos', cadencia_dias: 7, ultima_corrida: haceDias(6) });
  assert.ok(!toca(bancos, AHORA), 'a los 6 días todavía no');
  assert.ok(toca(job({ nombre: 'bancos', cadencia_dias: 7, ultima_corrida: haceDias(7) }), AHORA));
});

test('cron: las alertas respetan la cadencia semanal y el interruptor operativo', () => {
  const alertaReciente = job({
    nombre: 'alertas',
    cadencia_dias: 7,
    ultima_corrida: haceDias(6),
  });
  assert.ok(!toca(alertaReciente, AHORA), 'a los 6 días todavía no');
  assert.ok(toca(job({
    nombre: 'alertas',
    cadencia_dias: 7,
    ultima_corrida: haceDias(7),
  }), AHORA));
  assert.ok(!toca(job({
    nombre: 'alertas',
    cadencia_dias: 7,
    habilitado: false,
    ultima_corrida: haceDias(30),
  }), AHORA), 'no se activa antes del canary');
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

const resultado = (tomado: boolean, error?: string) => ({
  data: tomado ? [{ nombre: 'motor' }] : [],
  error: error ? { message: error } : null,
});

test('cron: toma un cerrojo libre sin consultar vencimiento', async () => {
  const llamadas: Parameters<ActualizarCerrojo>[] = [];
  const actualizar: ActualizarCerrojo = async (...args) => {
    llamadas.push(args);
    return resultado(true);
  };

  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), AHORA.toISOString());
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0][0], 'libre');
  assert.equal(llamadas[0][1], 'motor');
  assert.equal(llamadas[0][2], AHORA.toISOString());
  assert.equal(llamadas[0][3], new Date(AHORA.getTime() - 6 * 60 * 60_000).toISOString());
});

test('cron: recupera un cerrojo vencido después de comprobar que no está libre', async () => {
  const estados: string[] = [];
  const actualizar: ActualizarCerrojo = async (estado) => {
    estados.push(estado);
    return resultado(estado === 'vencido');
  };

  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), AHORA.toISOString());
  assert.deepEqual(estados, ['libre', 'vencido']);
});

test('cron: no toma un cerrojo ocupado y vigente', async () => {
  const actualizar: ActualizarCerrojo = async () => resultado(false);
  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), null);
});

test('cron: un error al comprobar el cerrojo libre corta sin una segunda escritura', async () => {
  let llamadas = 0;
  const actualizar: ActualizarCerrojo = async () => {
    llamadas++;
    return resultado(false, 'fallo PostgREST');
  };

  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), null);
  assert.equal(llamadas, 1);
});

test('cron: un error al recuperar el cerrojo vencido también impide ejecutar', async () => {
  const actualizar: ActualizarCerrojo = async (estado) => (
    estado === 'libre' ? resultado(false) : resultado(false, 'fallo PostgREST')
  );
  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), null);
});

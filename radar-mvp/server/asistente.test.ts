/**
 * El asistente cuesta dinero por consulta, así que su contador y su validación de
 * adjuntos son lo que separa una factura previsible de una sorpresa.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_CONSULTAS_FREE,
  MAX_ADJUNTO_BYTES,
  consumirConsulta,
  estadoConsultas,
  leerConsultas,
  validarAdjunto,
} from './asistente.js';
import { extraerTexto } from './asistente-n8n.js';

const enero = new Date('2026-01-15T12:00:00Z');

test('asistente: el mes nuevo empieza en cero sin que corra ningún proceso', () => {
  // El reinicio ocurre AL LEER. Si dependiera de un cron, un cron caído dejaría a
  // la gente sin su mes nuevo.
  const viejo = leerConsultas({ assistant_quota: { periodo: '2025-12', usadas: 30 } }, enero);
  assert.equal(viejo.usadas, 0);
  assert.equal(viejo.periodo, '2026-01');

  const vigente = leerConsultas({ assistant_quota: { periodo: '2026-01', usadas: 7 } }, enero);
  assert.equal(vigente.usadas, 7);
});

test('asistente: basura en la metadata no concede consultas infinitas ni las bloquea', () => {
  for (const basura of [null, undefined, 'muchas', { usadas: -5 }, { periodo: '2026-01', usadas: 'diez' }]) {
    const c = leerConsultas({ assistant_quota: basura } as Record<string, unknown>, enero);
    assert.equal(c.usadas, 0, `«${JSON.stringify(basura)}» debería leerse como cero`);
  }
});

test('asistente: el anónimo y el agotado se distinguen', () => {
  // Son dos mensajes distintos —«crea tu cuenta» y «vuelve el día 1»— y una sola
  // respuesta genérica dejaría a la mitad de la gente sin saber qué hacer.
  const vacio = { periodo: '2026-01', usadas: 0 };
  const anon = consumirConsulta(vacio, 'anonimo');
  assert.equal(anon.permitido, false);
  assert.equal(anon.permitido === false && anon.motivo, 'anonimo');

  const lleno = { periodo: '2026-01', usadas: LIMITE_CONSULTAS_FREE };
  const agotado = consumirConsulta(lleno, 'free');
  assert.equal(agotado.permitido, false);
  assert.equal(agotado.permitido === false && agotado.motivo, 'agotado');
});

test('asistente: el suscrito no gasta y el gratuito suma de uno en uno', () => {
  const c = { periodo: '2026-01', usadas: 12 };
  const pro = consumirConsulta(c, 'suscrito');
  assert.equal(pro.permitido, true);
  assert.equal(pro.consultas.usadas, 12, 'a un suscriptor no se le cuenta nada');

  const free = consumirConsulta(c, 'free');
  assert.equal(free.permitido, true);
  assert.equal(free.consultas.usadas, 13);
});

test('asistente: el estado no promete más de lo que hay', () => {
  const pasado = estadoConsultas({ periodo: '2026-01', usadas: 99 }, 'free');
  assert.equal(pasado.restantes, 0, 'nunca un número negativo en pantalla');
  assert.equal(pasado.usadas, LIMITE_CONSULTAS_FREE);

  const pro = estadoConsultas({ periodo: '2026-01', usadas: 0 }, 'suscrito');
  assert.equal(pro.ilimitado, true);
  assert.equal(pro.restantes, null);
});

test('asistente: el adjunto se mide en bytes y el mensaje dice el porqué', () => {
  const justo = validarAdjunto('contrato.pdf', MAX_ADJUNTO_BYTES);
  assert.equal(justo.ok, true, 'el tamaño exacto del tope debe caber');

  const pasado = validarAdjunto('contrato.pdf', MAX_ADJUNTO_BYTES + 1);
  assert.equal(pasado.ok, false);
  // El mensaje tiene que decir cuánto pesa y cuánto cabe: «archivo no válido» a
  // secas obliga a adivinar cuál de las dos cosas falló.
  assert.match(pasado.ok === false ? pasado.error : '', /10,0 MB/);

  const vacio = validarAdjunto('vacio.pdf', 0);
  assert.equal(vacio.ok, false);
});

test('asistente: solo entran los formatos que el agente sabe leer', () => {
  for (const bueno of ['a.pdf', 'a.PDF', 'a.docx', 'a.txt', 'a.jpg', 'a.png', 'a.webp']) {
    assert.equal(validarAdjunto(bueno, 1000).ok, true, `${bueno} debería aceptarse`);
  }
  for (const malo of ['a.exe', 'a.zip', 'a.mp4', 'sin-extension', 'a.pdf.exe']) {
    assert.equal(validarAdjunto(malo, 1000).ok, false, `${malo} NO debería aceptarse`);
  }
});

test('asistente: se entiende la respuesta de n8n venga como venga', () => {
  // n8n cambia la forma según por qué rama del workflow salió. Una respuesta buena
  // que no sabemos leer se ve igual que un fallo.
  assert.equal(extraerTexto({ output: 'hola' }), 'hola');
  assert.equal(extraerTexto([{ output: 'hola' }]), 'hola');
  assert.equal(extraerTexto({ respuesta: 'hola' }), 'hola');
  assert.equal(extraerTexto({ output: '   hola   ' }), 'hola');
  assert.equal(extraerTexto({ output: '' }), null);
  assert.equal(extraerTexto({}), null);
  assert.equal(extraerTexto(null), null);
  assert.equal(extraerTexto('texto suelto'), null);
});

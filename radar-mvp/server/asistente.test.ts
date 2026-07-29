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

test('asistente: el Word moderno se convierte a texto', async () => {
  // n8n no sabe abrir un .docx —su extractor de texto plano devuelve los bytes
  // del zip— así que la conversión ocurre en el servidor. Esta prueba usa un
  // .docx COMPRIMIDO, como los que guarda Word de verdad: uno sin comprimir se
  // lee por casualidad y daría un falso positivo, que es exactamente lo que pasó
  // la primera vez que se probó esto a mano.
  const { textoDeWord, esWord } = await import('./asistente-word.js');
  assert.equal(esWord('contrato.docx'), true);
  assert.equal(esWord('contrato.DOC'), true);
  assert.equal(esWord('contrato.pdf'), false);

  const docx = await construirDocx('Canon mensual: 3.750.000 pesos.');
  const r = await textoDeWord(docx, 'contrato.docx');
  assert.equal(r.ok, true);
  assert.match(r.ok ? r.texto : '', /3\.750\.000/);
});

test('asistente: lo que no es un Word válido se explica, no se traga', async () => {
  const { textoDeWord } = await import('./asistente-word.js');

  // Un .doc de Word 97-2003 no es un zip. El mensaje tiene que decir qué hacer,
  // porque «no se pudo leer» deja al usuario sin salida y ya le costó la espera.
  const viejo = await textoDeWord(Buffer.from('\xD0\xCF\x11\xE0basura').toString('base64'), 'viejo.doc');
  assert.equal(viejo.ok, false);
  assert.match(viejo.ok === false ? viejo.error : '', /\.docx/);

  const vacio = await textoDeWord('', 'vacio.docx');
  assert.equal(vacio.ok, false);
});

/** Un .docx mínimo pero real: zip DEFLATE con las tres piezas que exige el formato. */
async function construirDocx(texto: string): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" '
    + 'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    + 'Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

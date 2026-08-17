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

test('asistente: adjuntar es del plan de pago', async () => {
  // Un adjunto se convierte en texto y ese texto entra en la ventana de contexto de
  // cada turno siguiente, así que cuesta varias veces lo que una pregunta suelta.
  // Con 30 consultas gratuitas al mes por persona eso se acumula, y por eso el
  // cliente lo movió al plan de pago.
  const { puedeAdjuntar } = await import('./asistente.js');
  assert.equal(puedeAdjuntar('suscrito'), true);
  assert.equal(puedeAdjuntar('free'), false);
  assert.equal(puedeAdjuntar('anonimo'), false);
});

test('asistente: la ciudad se busca sin tildes', async () => {
  // La base guarda «bogota»; el modelo escribe «Bogotá» aunque el prompt le pida lo
  // contrario. Con comparación exacta la búsqueda devolvía cero y el asistente
  // contestaba «no encontré propiedades en Bogotá» sobre una ciudad con 1.786. Una
  // respuesta falsa es peor que un error visible.
  const { normalizarCiudadParaPruebas } = await import('./asistente-busqueda.js');
  for (const entrada of ['Bogotá', 'BOGOTÁ', ' bogota ', 'Bogota', 'Medellín', 'MEDELLIN']) {
    const salida = normalizarCiudadParaPruebas(entrada);
    assert.equal(salida, salida.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
    assert.doesNotMatch(salida, /[áéíóúÁÉÍÓÚ]/, `«${entrada}» salió con tilde: «${salida}»`);
  }
  assert.equal(normalizarCiudadParaPruebas('Bogotá'), 'bogota');
  assert.equal(normalizarCiudadParaPruebas('  MEDELLÍN '), 'medellin');
});

test('asistente: la búsqueda apuntada es de un solo uso', async () => {
  // Es la garantía de que la pantalla no se mueve sola. La acción pertenece a la
  // pregunta que la provocó: si se quedara guardada, la siguiente respuesta del
  // asistente —«gracias», «¿y los impuestos?»— volvería a aplicar los filtros de
  // la anterior y el listado cambiaría sin que nadie lo hubiera pedido.
  const { registrarBusqueda, tomarBusqueda, olvidarBusqueda } = await import('./asistente-busqueda.js');
  const uid = 'usuario-de-prueba-uso-unico';

  registrarBusqueda(uid, { fuente: 'portal', ciudad: 'bogota', precioMax: 300_000_000 }, 84);
  const primera = tomarBusqueda(uid);
  assert.equal(primera?.parametros.ciudad, 'bogota');
  assert.equal(primera?.total, 84);
  assert.equal(tomarBusqueda(uid), undefined, 'la segunda lectura debe venir vacía');

  registrarBusqueda(uid, { fuente: 'remate', ciudad: 'cali' }, 3);
  olvidarBusqueda(uid);
  assert.equal(tomarBusqueda(uid), undefined, 'olvidar debe descartar lo apuntado');
});

test('asistente: una búsqueda vieja no mueve la pantalla', async (t) => {
  // Sin caducidad, un usuario que preguntó por Cali hace media hora y vuelve a
  // escribir vería el listado saltar a Cali por una búsqueda que ya no recuerda
  // haber pedido. El dato solo vale entre que el agente busca y el Radar contesta.
  t.mock.timers.enable({ apis: ['Date'] });
  const { registrarBusqueda, tomarBusqueda } = await import('./asistente-busqueda.js');
  const uid = 'usuario-de-prueba-caducidad';

  registrarBusqueda(uid, { fuente: 'portal', ciudad: 'cali' }, 12);
  t.mock.timers.tick(3 * 60 * 1000);
  assert.equal(tomarBusqueda(uid), undefined, 'a los 3 minutos ya no debe aplicarse');
});

/*
 * B3: los dos límites del plan gratuito, visibles sin gastarlos.
 *
 * El de preguntas se calculaba ya, pero solo viajaba dentro de la respuesta del
 * propio Asistente: para saber cuántas quedaban había que escribirle una. Eso
 * obliga a gastar para poder decidir, que es justo lo contrario de lo que pide
 * un contador.
 */
test('cuenta: el cupo del asistente viaja con la cuenta, no solo con su respuesta', async () => {
  const { readFile } = await import('node:fs/promises');
  const fuente = await readFile(new URL('./account.ts', import.meta.url), 'utf8');
  // El campo tiene que estar en `publicAccount`, que es lo que lee la interfaz
  // en `/api/account`.
  assert.match(fuente, /consultas: estadoConsultas\(leerConsultas\(metadata\)/);
  // Y con la misma traducción de plan que los otros dos cupos: un suscriptor no
  // tiene límite, y confundirlo con `free` le pintaría un contador que no le
  // aplica.
  assert.match(fuente, /consultas: estadoConsultas\(leerConsultas\(metadata\), plan === 'pro' \? 'suscrito' : 'free'\)/);
});

test('asistente: un suscriptor no arrastra contador', () => {
  // `restantes: null` es lo que hace que la interfaz no pinte nada en Pro. Si
  // devolviera 0, la barra diría «0 de 0 preguntas» a quien las tiene todas.
  const estado = estadoConsultas({ periodo: '2026-08', usadas: 12 }, 'suscrito');
  assert.equal(estado.ilimitado, true);
  assert.equal(estado.restantes, null);
});

/*
 * Una ruta declarada dentro de una guarda que no la deja pasar es una ruta que
 * no existe, y responde 404 sin que nada falle en las pruebas.
 *
 * Pasó con `/api/propiedades` —la que reabre una ficha desde las simulaciones
 * guardadas—: el manejador estaba escrito dentro del bloque que solo admite
 * `/api/me` y `/api/favorites`, así que nunca se alcanzaba. Compilaba, no
 * rompía nada y en producción devolvía 404.
 */
test('rutas: cada manejador está dentro de una guarda que lo deja entrar', async () => {
  const { readFile } = await import('node:fs/promises');
  const fuente = await readFile(new URL('./index.ts', import.meta.url), 'utf8');

  // Las guardas por prefijo que agrupan rutas: se recogen todas las condiciones
  // de la forma `if (path === 'A' || path === 'B' || path.startsWith('C'))`.
  const guardas = [...fuente.matchAll(/if \(path === '([^']+)'((?:\s*\|\|\s*path(?:\.startsWith\()?[^)]*\)?)*)\) \{/g)];
  const admitidas = new Set<string>();
  const prefijos: string[] = [];
  for (const g of guardas) {
    const bloque = g[0];
    for (const [, ruta] of bloque.matchAll(/path === '([^']+)'/g)) admitidas.add(ruta);
    for (const [, pre] of bloque.matchAll(/path\.startsWith\('([^']+)'\)/g)) prefijos.push(pre);
  }

  // Toda ruta con manejador propio debe estar admitida por alguna guarda, o no
  // estar dentro de ninguna (las de primer nivel).
  const declaradas = [...fuente.matchAll(/if \(path === '(\/api\/[^']+)'(?: && req\.method)/g)].map((m) => m[1]);
  const inalcanzables = declaradas.filter((ruta) => {
    const dentroDeGuarda = prefijos.some((p) => ruta.startsWith(p)) || admitidas.has(ruta);
    // Solo interesan las que el código trata como agrupadas: si la ruta aparece
    // en una guarda de agrupación, tiene que estar admitida.
    return !dentroDeGuarda && fuente.includes(`path === '${ruta}' && req.method`) && /\/api\/(propiedades|favorites)/.test(ruta);
  });
  assert.deepEqual(inalcanzables, [], `estas rutas no las deja pasar ninguna guarda: ${inalcanzables.join(', ')}`);
  assert.ok(admitidas.has('/api/propiedades'), '/api/propiedades debe estar admitida en su guarda');
});

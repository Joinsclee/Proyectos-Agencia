/**
 * Comentarios y descargas de Conciencia.html · La Huerta LAB
 * ------------------------------------------------------------------
 * Un solo script para las dos cosas, dentro del mismo libro de cálculo
 * («Comentarios · Finca sin improvisar») y con la MISMA URL /exec. Se hizo
 * así a propósito: separar el conteo en otra hoja y otra implementación
 * obligaba a mantener dos despliegues y a pegar una segunda URL en la web.
 *
 *   GET  ?action=read       -> [{id, name, text, date}, ...]   comentarios
 *   GET  ?action=descargas  -> {ok, total, personas, hoy, personasHoy}
 *   POST {name,text,date}                    -> {ok:true, id:"..."}
 *   POST {tipo:'descarga', recurso, ...}     -> {ok:true}
 *
 * Pestañas que usa, y que se crean solas la primera vez:
 *   · «Comentarios»        id · fecha · nombre · texto
 *   · «Descargas»          fecha_utc · fecha_bogota · recurso · visitante ·
 *                          dispositivo · origen
 *   · «Resumen descargas»  fórmulas vivas: se abre y el número está al día
 *
 * QUÉ CUENTA EL CONTADOR Y QUÉ NO
 *   · El libro sigue siendo un enlace abierto. Nada de formularios: en la
 *     reunión del 10/09 se decidió que es un regalo de bienvenida, y pedir
 *     el correo para descargarlo lo convierte en otra cosa.
 *   · Cuenta clics en el botón, que es lo más cerca que se puede llegar a
 *     «descargas» sin servir el archivo uno mismo.
 *   · `visitante` es un identificador anónimo que la página guarda en el
 *     navegador de quien entra. Es lo que permite responder «cuántas
 *     PERSONAS» y no solo «cuántos clics». No hay nombre, ni correo, ni IP.
 *   · Se guarda una fila por clic, para que la curva por día sea real. Solo
 *     se descartan los disparos accidentales: dos clics del mismo visitante
 *     sobre el mismo recurso en menos de veinte segundos.
 *   · NO ve a quien recibe el libro por la comunidad de WhatsApp. El número
 *     de la hoja siempre va a ser menor que la gente que tiene el libro, y
 *     conviene decírselo a Iván antes de que compare cifras.
 *
 * PUESTA EN MARCHA (la primera vez)
 * 1. Crea una hoja de cálculo nueva en el Drive de Iván. Llámala
 *    «Comentarios · Finca sin improvisar».
 * 2. Renombra la pestaña a «Comentarios» y pon en la fila 1, en este orden:
 *       A: id   B: fecha   C: nombre   D: texto
 * 3. Extensiones -> Apps Script. Borra lo que haya y pega este archivo.
 * 4. Implementar -> Nueva implementación -> Aplicación web.
 *       Ejecutar como:      Yo
 *       Quién tiene acceso: Cualquier usuario
 * 5. Copia la URL que termina en /exec y pégala en Conciencia.html, en
 *    la constante C_COMENTARIOS del <script>.
 *
 * SI YA ESTABA DESPLEGADO Y SOLO ESTÁS AÑADIENDO EL CONTADOR
 *    Implementar -> Administrar implementaciones -> el lápiz de la que ya
 *    existe -> Versión: Nueva versión -> Implementar.
 *    Hay que hacerlo así, editando la de siempre. Si creas una
 *    implementación NUEVA, Google da otra URL distinta, y hay que pegarla en
 *    la constante C_COMENTARIOS de Conciencia.html, o la página seguirá
 *    llamando a la vieja y los comentarios dejarían de guardarse.
 *
 * TRAMPA YA PISADA, POR SI SE TOCA EL CÓDIGO DE LAS FECHAS
 *    `appendRow(['2026-09-12 14:02'])` NO guarda una cadena: Sheets la
 *    reconoce como fecha y la convierte. A partir de ahí `getValues()`
 *    devuelve un objeto Date, y cualquier comparación por texto falla sin
 *    dar error — el total salía bien y «hoy» siempre cero. Por eso las dos
 *    columnas de fecha se escriben con un apóstrofo delante, que fuerza el
 *    texto y desaparece al leer.
 */

var HOJA = 'Comentarios';
var HOJA_DESCARGAS = 'Descargas';
var HOJA_RESUMEN = 'Resumen descargas';
var MAX_NOMBRE = 60;
var MAX_TEXTO = 900;
var ANTIRREBOTE_S = 20;          // segundos · solo mata el doble clic
var ZONA = 'America/Bogota';

function doGet(e) {
  var accion = (e && e.parameter && e.parameter.action) || 'read';
  if (accion === 'descargas') return totalDescargas();
  if (accion !== 'read') return json({ ok: false, error: 'accion no soportada' });

  var hoja = obtenerHoja();
  var ultima = hoja.getLastRow();
  if (ultima < 2) return json([]);

  var filas = hoja.getRange(2, 1, ultima - 1, 4).getValues();
  var salida = filas
    .filter(function (f) { return String(f[2] || '').trim() && String(f[3] || '').trim(); })
    .map(function (f) {
      return { id: String(f[0] || ''), date: String(f[1] || ''), name: String(f[2] || ''), text: String(f[3] || '') };
    });
  return json(salida);
}

function doPost(e) {
  var datos = {};
  try {
    datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ ok: false, error: 'json invalido' });
  }

  // El aviso de descarga viene marcado, para no adivinar por los campos.
  if (datos.tipo === 'descarga') return anotarDescarga(datos);

  var nombre = limpiar(datos.name, MAX_NOMBRE);
  var texto = limpiar(datos.text, MAX_TEXTO);
  if (!nombre || !texto) return json({ ok: false, error: 'faltan campos' });

  // El muro es público y su URL está en el HTML, así que cualquiera puede
  // mandar un POST. Lo que hay que impedir es que alguien se haga pasar por
  // Iván para repartir un enlace falso de la clase: sin enlaces, un comentario
  // suplantado es molesto, pero no puede llevarse a nadie a otro sitio.
  if (/https?:\/\/|www\.|t\.me\/|wa\.me\/|\b[a-z0-9-]+\.(com|net|org|co|io|me|link)\b/i.test(nombre + ' ' + texto)) {
    return json({ ok: false, error: 'no se pueden publicar enlaces' });
  }

  var fecha = limpiar(datos.date, 40) || Utilities.formatDate(new Date(), ZONA, 'd MMMM yyyy');
  var id = 'c' + Date.now() + Math.floor(Math.random() * 1000);

  // El candado evita que dos envíos simultáneos escriban en la misma fila.
  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(8000);
    obtenerHoja().appendRow([id, fecha, nombre, texto]);
  } catch (err) {
    return json({ ok: false, error: 'no se pudo guardar' });
  } finally {
    try { candado.releaseLock(); } catch (err2) {}
  }

  return json({ ok: true, id: id });
}

/* ── Descargas ───────────────────────────────────────────────────────── */

function anotarDescarga(datos) {
  var recurso = limpiar(datos.recurso, 60) || 'sin-nombre';
  var visitante = limpiar(datos.visitante, 40) || 'anonimo';

  // Antirrebote corto, solo para que un doble clic no cuente dos veces. Va
  // en la caché y no en la hoja: escanear la hoja en cada clic se vuelve
  // lento en cuanto hay unos miles de filas.
  var cache = CacheService.getScriptCache();
  var clave = 'd:' + visitante + ':' + recurso;
  if (cache.get(clave)) return json({ ok: true, repetido: true });
  cache.put(clave, '1', ANTIRREBOTE_S);

  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(8000);
    var ahora = new Date();
    // El apóstrofo inicial obliga a Sheets a guardar la fecha como TEXTO.
    // Sin él la convierte en un valor de fecha, `getValues()` devuelve un
    // objeto Date y las comparaciones por cadena («¿empieza por la fecha de
    // hoy?») fallan en silencio: el total salía bien y «hoy» siempre 0.
    obtenerHojaDescargas().appendRow([
      "'" + ahora.toISOString(),
      "'" + Utilities.formatDate(ahora, ZONA, 'yyyy-MM-dd HH:mm'),
      recurso,
      visitante,
      limpiar(datos.dispositivo, 20) || 'desconocido',
      limpiar(datos.origen, 180) || 'directo'
    ]);
  } catch (err) {
    return json({ ok: false, error: 'no se pudo guardar' });
  } finally {
    try { candado.releaseLock(); } catch (err2) {}
  }

  return json({ ok: true });
}

function totalDescargas() {
  var hoja = obtenerHojaDescargas();
  var ultima = hoja.getLastRow();
  if (ultima < 2) return json({ ok: true, total: 0, personas: 0, hoy: 0, personasHoy: 0 });

  // B: fecha de Bogotá · C: recurso · D: visitante
  var filas = hoja.getRange(2, 2, ultima - 1, 3).getValues();
  var hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  var todos = {}, deHoy = {}, nHoy = 0;

  for (var i = 0; i < filas.length; i++) {
    var fecha = diaDe(filas[i][0]);
    var quien = String(filas[i][2] || '');
    todos[quien] = true;
    if (fecha === hoy) { nHoy++; deHoy[quien] = true; }
  }

  return json({
    ok: true,
    total: filas.length,
    personas: contar(todos),
    hoy: nHoy,
    personasHoy: contar(deHoy)
  });
}

/* ── Pestañas ────────────────────────────────────────────────────────── */

/* Una pestaña que no existe se crea con sus cabeceras, para que la primera
   publicación no falle si alguien renombró algo. */
function obtenerHoja() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(['id', 'fecha', 'nombre', 'texto']);
  }
  return hoja;
}

function obtenerHojaDescargas() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA_DESCARGAS);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_DESCARGAS);
    hoja.appendRow(['fecha_utc', 'fecha_bogota', 'recurso', 'visitante', 'dispositivo', 'origen']);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, 6).setFontWeight('bold');
    hoja.getRange('A:B').setNumberFormat('@');   // cinturón y tirantes
    hoja.setColumnWidth(1, 190);
    hoja.setColumnWidth(2, 140);
    hoja.setColumnWidth(3, 170);
    hoja.setColumnWidth(4, 150);
    hoja.setColumnWidth(6, 300);
  }
  crearResumen(libro);
  return hoja;
}

/**
 * El resumen va con fórmulas y no con un cálculo que haya que ejecutar a
 * mano: Iván abre la pestaña y el número está al día sin tocar nada.
 */
function crearResumen(libro) {
  if (libro.getSheetByName(HOJA_RESUMEN)) return;
  var r = libro.insertSheet(HOJA_RESUMEN);
  var D = "'" + HOJA_DESCARGAS + "'!";
  var HOY = 'TEXT(TODAY(),"yyyy-mm-dd")';

  r.getRange('A1').setValue('Recurso de bienvenida · descargas')
    .setFontWeight('bold').setFontSize(14);
  r.getRange('A2').setValue('No incluye a quien recibe el libro por la comunidad de WhatsApp.')
    .setFontStyle('italic').setFontColor('#777777');

  var pares = [
    ['Personas distintas', '=IF(COUNTA(' + D + 'D2:D)=0,0,COUNTUNIQUE(' + D + 'D2:D))'],
    ['Clics totales',      '=COUNTA(' + D + 'C2:C)'],
    ['Personas hoy',       '=IFERROR(COUNTUNIQUE(FILTER(' + D + 'D2:D,LEFT(' + D + 'B2:B,10)=' + HOY + ')),0)'],
    ['Clics hoy',          '=IFERROR(SUMPRODUCT((LEFT(' + D + 'B2:B,10)=' + HOY + ')*1),0)'],
    ['Desde móvil',        '=COUNTIF(' + D + 'E2:E,"movil")'],
    ['Desde escritorio',   '=COUNTIF(' + D + 'E2:E,"escritorio")']
  ];
  for (var i = 0; i < pares.length; i++) {
    r.getRange(i + 4, 1).setValue(pares[i][0]);
    r.getRange(i + 4, 2).setFormula(pares[i][1]).setFontWeight('bold').setFontSize(13);
  }

  r.getRange('A12').setValue('Clics por día').setFontWeight('bold');
  r.getRange('A13').setFormula(
    '=IFERROR(QUERY(ARRAYFORMULA({LEFT(' + D + 'B2:B,10)}),' +
    '"select Col1, count(Col1) where Col1 is not null and Col1 <> \'\' ' +
    'group by Col1 order by Col1 desc",0),"Todavía sin descargas")'
  );

  r.setColumnWidth(1, 200);
  r.setColumnWidth(2, 130);
}

/* ── Utilidades ──────────────────────────────────────────────────────── */

/* Recorta, quita saltos de línea de más y neutraliza el '=' inicial, que
   Sheets interpretaría como fórmula. */
function limpiar(valor, maximo) {
  var s = String(valor == null ? '' : valor).trim();
  s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, maximo);
}

/* Una fila puede traer la fecha como texto o, si se escribió antes de que
   se forzara el texto, como objeto Date. Las dos acaban en 'yyyy-MM-dd'. */
function diaDe(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, ZONA, 'yyyy-MM-dd');
  return String(valor || '').slice(0, 10);
}

/* Apps Script corre en un motor sin Object.keys garantizado en scripts
   antiguos; contar a mano es una línea y no depende de eso. */
function contar(obj) {
  var n = 0;
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) n++;
  return n;
}

function json(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

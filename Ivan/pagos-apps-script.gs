/**
 * Cupos y pagos · Campo Escuela La Huerta LAB
 * ------------------------------------------------------------------
 * Hace dos cosas:
 *
 *   GET  ?action=cupos   → {octoberAvailable, vendidos, total, disponibles,
 *                           cerrado, sinFirma}
 *                          Lo llama Venta.html. El nombre raro,
 *                          «octoberAvailable», es el que su CONFIG ya
 *                          espera: se respeta para no tocar esa página.
 *                          Solo números: nunca datos de compradores.
 *
 *   POST (desde Rapyd)   → anota el pago y devuelve el contador nuevo.
 *                          Entiende los dos formatos posibles, porque a
 *                          día de hoy no sabemos cuál nos van a dar:
 *                            · PayU Colombia (WebCheckout / confirmación)
 *                            · Rapyd global (webhook PAYMENT_COMPLETED)
 *
 * PUESTA EN MARCHA
 * 1. Hoja de cálculo nueva: «Cupos · Campo Escuela diciembre».
 * 2. Pestaña «Pagos» con esta fila 1, en este orden:
 *      A: fecha  B: referencia  C: nombre  D: correo  E: telefono
 *      F: modalidad  G: monto  H: moneda  I: estado  J: fuente  K: crudo
 * 3. Extensiones → Apps Script, pega este archivo.
 * 4. Configuración del proyecto → Propiedades del script. Añade:
 *      PAYU_API_KEY      (si van por PayU)
 *      PAYU_MERCHANT_ID  (si van por PayU)
 *      RAPYD_ACCESS_KEY  (si van por Rapyd global)
 *    Sin la clave que toque, el POST se rechaza: mejor perder un webhook
 *    que apuntar un cupo que nadie pagó.
 * 5. Implementar → Nueva implementación → Aplicación web
 *      Ejecutar como: Yo · Acceso: Cualquier usuario
 * 6. La URL /exec va en dos sitios:
 *      · En el panel de Rapyd/PayU, como URL de confirmación.
 *      · En la página de venta, en la constante URL del snippet de cupos.
 *
 * Al editar este script hay que volver a implementar (nueva versión).
 */

var HOJA        = 'Pagos';
var TOTAL_CUPOS = 40;     // los cupos del presencial
var MODO_PRUEBA = true;   // en true acepta POST sin firma válida y los marca
                          // como prueba. Ponlo en false antes de vender.

/* Los pagos hechos por fuera (transferencia, efectivo) se anotan a mano en la
   hoja con estado «aprobado» y fuente «manual»: cuentan igual para el cupo. */

// ───────────────────────────────────────────────────────────── lectura

function doGet(e) {
  var accion = (e && e.parameter && e.parameter.action) || 'cupos';
  if (accion !== 'cupos') return json({ ok: false, error: 'accion no soportada' });
  return json(contar());
}

function contar() {
  var hoja = obtenerHoja();
  var ultima = hoja.getLastRow();
  var vendidos = 0;
  var sinFirma = 0;

  if (ultima >= 2) {
    var filas = hoja.getRange(2, 1, ultima - 1, 10).getValues();
    var vistas = {};
    for (var i = 0; i < filas.length; i++) {
      var ref       = String(filas[i][1] || '').trim();
      var modalidad = String(filas[i][5] || '').trim().toLowerCase();
      var estado    = String(filas[i][8] || '').trim().toLowerCase();
      // Un pago cuya firma no se pudo verificar se anota pero NO ocupa cupo.
      // Se cuenta aparte: si este número sube mientras el contador no se
      // mueve, es que la verificación está mal configurada y los pagos
      // reales se están quedando fuera. Es el fallo más fácil de no ver.
      if (estado.indexOf('sin firma') !== -1) {
        if (!modalidad || modalidad.indexOf('presencial') !== -1) sinFirma++;
        continue;
      }
      // Solo el presencial tiene tope, y solo cuenta lo aprobado.
      if (estado !== 'aprobado') continue;
      if (modalidad && modalidad.indexOf('presencial') === -1) continue;
      // Un webhook puede llegar repetido: la referencia manda.
      if (ref) { if (vistas[ref]) continue; vistas[ref] = true; }
      vendidos++;
    }
  }

  var disponibles = Math.max(0, TOTAL_CUPOS - vendidos);
  return {
    ok: true,
    // El campo que lee Venta.html tal y como está escrita hoy.
    octoberAvailable: disponibles,
    vendidos: vendidos,
    total: TOTAL_CUPOS,
    disponibles: disponibles,
    cerrado: disponibles === 0,
    sinFirma: sinFirma            // > 0 = revisar la configuración de firmas
  };
}

// ───────────────────────────────────────────────────────────── escritura

function doPost(e) {
  var crudo = (e && e.postData && e.postData.contents) || '';
  var datos = interpretar(e, crudo);
  if (!datos) return json({ ok: false, error: 'formato no reconocido' });

  // Un pago rechazado o pendiente no ocupa cupo, pero se anota para poder
  // mirar después por qué no entró.
  var firmaOk = verificar(datos, e);
  if (!firmaOk && !MODO_PRUEBA) {
    return json({ ok: false, error: 'firma invalida' });
  }

  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(15000);
    var hoja = obtenerHoja();

    // Idempotencia: si esa referencia ya está aprobada, no se duplica.
    if (datos.referencia && yaEsta(hoja, datos.referencia, datos.estado)) {
      return json({ ok: true, duplicado: true, cupos: contar() });
    }

    hoja.appendRow([
      new Date(),
      datos.referencia,
      limpiar(datos.nombre, 80),
      limpiar(datos.correo, 90),
      limpiar(datos.telefono, 30),
      datos.modalidad,
      datos.monto,
      datos.moneda,
      firmaOk ? datos.estado : (datos.estado + ' (sin firma)'),
      datos.fuente,
      String(crudo).slice(0, 4000)
    ]);
  } catch (err) {
    return json({ ok: false, error: 'no se pudo guardar' });
  } finally {
    try { candado.releaseLock(); } catch (err2) {}
  }

  return json({ ok: true, cupos: contar() });
}

function yaEsta(hoja, referencia, estado) {
  var ultima = hoja.getLastRow();
  if (ultima < 2) return false;
  var filas = hoja.getRange(2, 2, ultima - 1, 8).getValues();  // B..I
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0] || '').trim() !== String(referencia).trim()) continue;
    var previo = String(filas[i][7] || '').trim().toLowerCase();
    // Solo bloquea si el estado previo ya era aprobado: así un pago que
    // pasa de pendiente a aprobado sí se puede registrar.
    if (previo.indexOf('aprobado') === 0 && String(estado).toLowerCase() === 'aprobado') return true;
  }
  return false;
}

// ─────────────────────────────────────────── entender lo que manda cada uno

function interpretar(e, crudo) {
  var p = (e && e.parameter) || {};

  // PayU Colombia manda un POST de formulario con state_pol.
  if (p.state_pol || p.reference_sale) {
    return {
      fuente:     'payu',
      referencia: p.reference_sale || p.reference_pol || '',
      nombre:     p.buyer_full_name || '',
      correo:     p.buyer_email || p.email_buyer || '',
      telefono:   p.phone || '',
      modalidad:  modalidadDe(p.extra1 || p.description || p.reference_sale || ''),
      monto:      p.value || '',
      moneda:     p.currency || 'COP',
      // 4 aprobada · 6 rechazada · 7 pendiente
      estado:     p.state_pol === '4' ? 'aprobado'
                  : p.state_pol === '7' ? 'pendiente' : 'rechazado'
    };
  }

  // Rapyd global manda JSON.
  var j = null;
  try { j = JSON.parse(crudo); } catch (err) { j = null; }
  if (j) {
    var d = j.data || j;
    var meta = d.metadata || {};
    var estado = String(d.status || '').toUpperCase();
    return {
      fuente:     'rapyd',
      referencia: d.merchant_reference_id || d.id || '',
      nombre:     meta.nombre || (d.customer && d.customer.name) || '',
      correo:     meta.correo || (d.customer && d.customer.email) || '',
      telefono:   meta.telefono || '',
      modalidad:  modalidadDe(meta.modalidad || d.merchant_reference_id || ''),
      monto:      d.amount || '',
      moneda:     d.currency_code || d.currency || 'COP',
      estado:     (estado === 'CLO' || j.type === 'PAYMENT_COMPLETED') ? 'aprobado'
                  : estado === 'ACT' ? 'pendiente' : 'rechazado'
    };
  }
  return null;
}

/* La modalidad viaja en el campo libre. Si no llega, se asume presencial,
   que es el que tiene tope: prefiero contar de más y corregir a mano que
   vender un cupo 41 sin enterarme. */
function modalidadDe(txt) {
  var t = String(txt || '').toLowerCase();
  if (t.indexOf('online') !== -1 || t.indexOf('virtual') !== -1) return 'online';
  if (t.indexOf('skool') !== -1) return 'skool';
  return 'presencial';
}

// ───────────────────────────────────────────────────────────── firmas

function verificar(datos, e) {
  var props = PropertiesService.getScriptProperties();

  if (datos.fuente === 'payu') {
    var api = props.getProperty('PAYU_API_KEY');
    var mid = props.getProperty('PAYU_MERCHANT_ID');
    var p = (e && e.parameter) || {};
    if (!api || !mid || !p.sign) return false;
    // PayU redondea el valor a un decimal para la firma cuando el segundo es 0.
    var valor = String(p.value || '');
    var n = parseFloat(valor);
    var redondeado = (Math.round(n * 100) / 100).toFixed(1);
    var cadena = [api, mid, p.reference_sale, redondeado, p.currency, p.state_pol].join('~');
    var esperada = md5(cadena);
    if (esperada === String(p.sign).toLowerCase()) return true;
    // Algunos comercios firman con dos decimales.
    return md5([api, mid, p.reference_sale, n.toFixed(2), p.currency, p.state_pol].join('~'))
             === String(p.sign).toLowerCase();
  }

  if (datos.fuente === 'rapyd') {
    var key = props.getProperty('RAPYD_ACCESS_KEY');
    // La firma de Rapyd necesita la URL exacta del webhook y el secreto de
    // la cuenta. Se completa cuando tengamos credenciales reales; hasta
    // entonces esto devuelve false y MODO_PRUEBA decide qué pasa.
    if (!key) return false;
    return false;
  }
  return false;
}

function md5(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8);
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}

// ───────────────────────────────────────────────────────────── utilidades

function obtenerHoja() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(['fecha','referencia','nombre','correo','telefono',
                    'modalidad','monto','moneda','estado','fuente','crudo']);
  }
  return hoja;
}

function limpiar(valor, maximo) {
  var s = String(valor == null ? '' : valor).trim().replace(/\s+/g, ' ');
  if (/^[=+\-@]/.test(s)) s = "'" + s;   // que Sheets no lo lea como fórmula
  return s.slice(0, maximo);
}

function json(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Para probar desde el editor sin esperar a un pago real: seleccioná esta
   función y dale a Ejecutar. Escribe una fila de prueba y la cuenta. */
function pruebaLocal() {
  var falso = { postData: { contents: JSON.stringify({
    type: 'PAYMENT_COMPLETED',
    data: { merchant_reference_id: 'PRUEBA-' + Date.now(), status: 'CLO',
            amount: 1000, currency_code: 'COP',
            metadata: { nombre: 'Prueba', correo: 'prueba@ejemplo.com', modalidad: 'presencial' } }
  }) }, parameter: {} };
  Logger.log(doPost(falso).getContent());
  Logger.log(JSON.stringify(contar()));
}

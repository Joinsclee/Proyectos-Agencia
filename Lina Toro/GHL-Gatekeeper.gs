/**
 * SAVIAS · Ruta Jabonera — Portero de acceso (Google Apps Script Web App)
 * --------------------------------------------------------------------------
 * Va VINCULADO al Google Sheet de compradoras que llena GHL (con columnas de
 * NOMBRE y CORREO). La página de producto consulta este script para:
 *   1) dejar entrar solo a los correos que están en la hoja, y
 *   2) traer el NOMBRE de la persona para el saludo ("Hola Camilo…").
 *
 * Acciones (todas por GET con ?param, para evitar el preflight CORS):
 *   ?action=ping                              -> { ok, pong }
 *   ?action=access&token=...&email=...        -> { ok, allowed, name }
 *   ?action=check &token=...&email=...        -> { ok, allowed, exists, name }
 *   ?action=claim &token=...&email=...        -> { ok, claimed }   (marca 'registrado')
 *
 * CÓMO ACTUALIZAR SIN CAMBIAR LA URL:
 *   Implementar ▸ Gestionar implementaciones ▸ (lápiz ✏️) ▸ Versión: «Nueva versión»
 *   ▸ Implementar.  Así se conserva la MISMA URL /exec que ya está en la página.
 *   (Acceso: «Cualquier usuario»; Ejecutar como: «Yo».)
 */

var CONFIG = {
  TOKEN: 'savias-ruta-jabonera-7m3k9q', // mismo token que usa la página
  SHEET_NAME: 'Ingreso alumnas'         // hoja de compradoras; si no existe, se busca sola la que tenga columna de correo
};

function doGet(e) { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || '').toLowerCase();

  if (action === 'ping') return json_({ ok: true, pong: true });

  if (p.token !== CONFIG.TOKEN) return json_({ ok: false, error: 'bad_token' });

  var email = normEmail_(p.email);

  if (action === 'access' || action === 'check') {
    var row = findRow_(email);
    return json_({ ok: true, allowed: !!row, exists: !!row, name: row ? row.name : '' });
  }

  if (action === 'claim') {
    return json_({ ok: true, claimed: markClaimed_(email) });
  }

  return json_({ ok: false, error: 'unknown_action' });
}

/* ---------------- helpers ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normEmail_(v) { return String(v || '').trim().toLowerCase(); }

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 1) por nombre exacto (si existe esa pestaña)
  if (CONFIG.SHEET_NAME) {
    var byName = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (byName) return byName;
  }
  // 2) auto: la primera pestaña que tenga una columna de CORREO
  //    (sobrevive a renombrar/reordenar/añadir pestañas, p. ej. "Cobros Meta")
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var data = sheets[i].getDataRange().getValues();
    if (data && data.length && cols_(data).emailCol > -1) return sheets[i];
  }
  // 3) último recurso: la primera pestaña
  return sheets[0];
}

// Detecta en qué columna está el CORREO y el NOMBRE (por el encabezado; y si no,
// el correo se detecta por contenido — la primera columna que tenga "@").
function cols_(data) {
  if (!data || !data.length) return { emailCol: -1, nameCol: -1 };
  var head = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var emailCol = -1, nameCol = -1;
  for (var i = 0; i < head.length; i++) {
    var h = head[i];
    if (emailCol < 0 && (h.indexOf('correo') > -1 || h.indexOf('email') > -1 ||
      h.indexOf('e-mail') > -1 || h.indexOf('mail') > -1)) emailCol = i;
    if (nameCol < 0 && (h === 'nombre' || h.indexOf('nombre') > -1 || h.indexOf('name') > -1 ||
      h.indexOf('nome') > -1)) nameCol = i;
  }
  if (emailCol < 0) { // fallback: buscar una celda con "@" en las primeras filas
    for (var c = 0; c < head.length; c++) {
      for (var r = 1; r < Math.min(data.length, 10); r++) {
        if (String(data[r][c]).indexOf('@') > -1) { emailCol = c; break; }
      }
      if (emailCol > -1) break;
    }
  }
  return { emailCol: emailCol, nameCol: nameCol };
}

// Devuelve { row, name } si el correo está en la hoja; null si no.
function findRow_(email) {
  if (!email) return null;
  var sh = sheet_(); if (!sh) return null;
  var data = sh.getDataRange().getValues();
  var c = cols_(data);
  if (c.emailCol < 0) return null;
  for (var r = 1; r < data.length; r++) {
    if (normEmail_(data[r][c.emailCol]) === email) {
      var nm = c.nameCol > -1 ? String(data[r][c.nameCol]).trim() : '';
      return { row: r + 1, name: nm };
    }
  }
  return null;
}

// Marca 'registrado' + 'fecha_registro' en la fila del correo (crea las columnas si faltan).
function markClaimed_(email) {
  if (!email) return false;
  var sh = sheet_(); if (!sh) return false;
  var data = sh.getDataRange().getValues();
  var c = cols_(data);
  if (c.emailCol < 0) return false;

  var headLower = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var width = data[0].length;
  var regCol = headLower.indexOf('registrado');
  if (regCol < 0) { regCol = width; width++; sh.getRange(1, regCol + 1).setValue('registrado'); }
  var fecCol = headLower.indexOf('fecha_registro');
  if (fecCol < 0) { fecCol = width; width++; sh.getRange(1, fecCol + 1).setValue('fecha_registro'); }

  for (var r = 1; r < data.length; r++) {
    if (normEmail_(data[r][c.emailCol]) === email) {
      sh.getRange(r + 1, regCol + 1).setValue('sí');
      sh.getRange(r + 1, fecCol + 1).setValue(new Date());
      return true;
    }
  }
  return false;
}

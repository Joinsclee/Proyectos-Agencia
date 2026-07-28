/**
 * Qué NO puede salir de una ficha bloqueada.
 *
 * Estas pruebas nacen de una fuga real medida contra el servidor: de ocho fichas
 * de remate bloqueadas para un anónimo, las ocho entregaban el nombre y la cédula
 * del demandado y el nombre, el correo y el celular del secuestre. Son datos
 * personales de terceros que nadie pidió publicar, y viajaban porque `redactar()`
 * anulaba `court_email` mientras el mismo correo iba dentro del texto de
 * `trustee`.
 *
 * El patrón del fallo importa más que el fallo: la lista de campos a ocultar
 * estaba escrita a mano y los scrapers fueron añadiendo columnas nuevas
 * (`address_raw`, `pdf_url`, `defendant`) sin que nadie la actualizara. Por eso
 * aquí no se comprueba «se borró este campo» sino «no queda NADA que reconstruya
 * lo que se está cobrando»: un campo nuevo con un nombre reconocible queda
 * cubierto sin tocar esta prueba.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { redactar, type Acceso } from './acceso.js';

const BLOQUEADA: Acceso = { completa: false, motivo: 'remate', avisoRiesgo: false, requiere: 'registro' };
const ABIERTA: Acceso = { completa: true, motivo: null, avisoRiesgo: false };

/** Una fila de remate con la forma real: el aviso judicial es texto libre. */
const remate = () => ({
  id: 'r-1',
  city: 'pereira',
  property_type: 'house',
  minimum_bid: 94_610_250,
  appraisal_value: 135_157_500,
  auction_date: '2026-08-14',
  cuota_parte: 100,
  origen_demandante: 'bancario',
  source_id: 'inmueble-tipo-casa-en-urbanizacion-panorama-ii-pereira',
  source_url: 'https://www.rematandobienes.com/remates-judiciales/inmueble-tipo-casa/',
  address: 'Lote 21 manzana 8 Urbanización Panorama II',
  court: 'Juzgado 03 civil municipal de Pereira',
  court_email: 'j03cmper@cendoj.ramajudicial.gov.co',
  case_number: '60001400300320180035400',
  matricula_inmobiliaria: '290-84145',
  defendant: 'Jorge Enrique Ortiz López c.c. 15913281, correo jorge@example.com, celular 3217487606',
  plaintiff: 'Bancolombia S.A.',
  trustee: 'Cielo Mar Tavera Restrepo, cielomar2163@hotmail.com. Celular 3217487606',
  features: { images: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'] },
});

const textoDe = (fila: unknown) => JSON.stringify(fila);

test('redacción: una ficha bloqueada no filtra correos ni teléfonos de terceros', () => {
  const salida = redactar(remate(), BLOQUEADA);
  const texto = textoDe(salida);

  const correos = texto.match(/[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [];
  assert.deepEqual(correos, [], `filtró correos: ${correos.join(', ')}`);

  const celulares = texto.match(/\b3\d{9}\b/g) ?? [];
  assert.deepEqual(celulares, [], `filtró celulares: ${celulares.join(', ')}`);

  const cedulas = texto.match(/c\.?c\.?\s*\d{6,}/gi) ?? [];
  assert.deepEqual(cedulas, [], `filtró cédulas: ${cedulas.join(', ')}`);
});

test('redacción: nada de lo que sale reconstruye la fuente original', () => {
  const salida = redactar(remate(), BLOQUEADA) as Record<string, unknown>;
  // `source_id` de un remate ES el slug de su URL: anular `source_url` y dejarlo
  // sería cerrar la puerta dejando la llave puesta.
  for (const campo of ['address', 'source_url', 'source_id', 'court_email', 'case_number', 'matricula_inmobiliaria']) {
    assert.equal(salida[campo], null, `${campo} salió sin anular`);
  }
  for (const campo of ['defendant', 'plaintiff', 'trustee', 'court']) {
    assert.equal(salida[campo], null, `${campo} salió sin anular: es texto libre del aviso judicial`);
  }
});

test('redacción: se conserva lo que sostiene la oferta comercial', () => {
  // Si la redacción se pasa de celosa, la tarjeta deja de poder venderse: sin
  // postura, avalúo ni fecha no hay nada que enseñar.
  const salida = redactar(remate(), BLOQUEADA) as Record<string, unknown>;
  assert.equal(salida.city, 'pereira');
  assert.equal(salida.property_type, 'house');
  assert.equal(salida.minimum_bid, 94_610_250);
  assert.equal(salida.appraisal_value, 135_157_500);
  assert.equal(salida.auction_date, '2026-08-14');
  // `cuota_parte` sostiene la alerta jurídica y `origen_demandante` es una
  // categoría, no una persona: los dos se quedan.
  assert.equal(salida.cuota_parte, 100);
  assert.equal(salida.origen_demandante, 'bancario');
  assert.equal(salida._bloqueada, true);
});

test('redacción: las claves de `features` que nombran lo que ocultan se van', () => {
  // El caso real: las columnas `address` y `source_url` se anulaban por fuera
  // mientras `features.address_raw` y `features.pdf_url` las duplicaban por dentro.
  const fila = {
    id: 'b-1',
    features: {
      address_raw: 'Lote 2 Antigua Finca La Macarena',
      pdf_url: 'https://www.avalvc.com.co/documents/d/guest/inmuebles-2',
      pdf_page: 301,
      fincaraiz_url: 'https://www.fincaraiz.com.co/detail.aspx?a=3726005',
      observaciones: 'El inmueble se vende como cuerpo cierto.',
      ai_analysis: 'Opinión de inversión detallada…',
      contacto_email: 'ventas@example.com',
      // Lo que sí debe quedarse:
      stratum: 4,
      bedrooms: 3,
      images: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'],
    },
  };
  const f = (redactar(fila, BLOQUEADA) as any).features as Record<string, unknown>;

  for (const clave of ['address_raw', 'pdf_url', 'pdf_page', 'fincaraiz_url', 'observaciones', 'ai_analysis', 'contacto_email']) {
    assert.equal(f[clave], undefined, `features.${clave} salió sin borrar`);
  }
  assert.equal(f.stratum, 4, 'el estrato sostiene la tarjeta');
  assert.equal(f.bedrooms, 3);
  assert.deepEqual(f.images, ['1.jpg', '2.jpg', '3.jpg'], 'las fotos se recortan, no se borran');
});

test('redacción: una ficha abierta sale intacta', () => {
  // La otra dirección del muro: pasarse de celoso con quien ya pagó es tan grave
  // como filtrar. Se comprueba que NADA se anula cuando el acceso es completo.
  const original = remate();
  const salida = redactar(original, ABIERTA) as Record<string, unknown>;
  for (const campo of ['address', 'source_url', 'source_id', 'court_email', 'defendant', 'trustee', 'matricula_inmobiliaria']) {
    assert.equal(salida[campo], (original as any)[campo], `${campo} se perdió para un usuario con acceso`);
  }
  assert.equal(salida._bloqueada, undefined);
  assert.deepEqual((salida.features as any).images, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], 'la galería completa');
});

/**
 * Tests de las reglas de vigencia.
 *
 * El punto crítico: las reglas de FincaRaíz NO se pueden heredar a los bancos.
 * Un activo en dación de pago tarda meses en venderse sin que eso signifique que
 * la oportunidad caducó; aplicarle los 30 días vaciaría el módulo entero.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarVigencia, caducaPorAntiguedad, diasDesde, textoFrescura,
  DIAS_DESPUBLICAR, DIAS_DESCARTE,
} from './vigencia.js';

const HOY = new Date('2026-07-20T12:00:00Z');
const haceDias = (n: number) => new Date(HOY.getTime() - n * 86_400_000).toISOString();

test('vigencia: los plazos aplican a portal, nunca a bancos', () => {
  assert.ok(caducaPorAntiguedad('fincaraiz'));
  assert.ok(!caducaPorAntiguedad('davivienda'));
  assert.ok(!caducaPorAntiguedad('bancolombia'));
  assert.ok(!caducaPorAntiguedad('bbva'));
  assert.ok(!caducaPorAntiguedad('aval'));
});

test('vigencia: FincaRaíz se despublica a los 30 días', () => {
  assert.equal(evaluarVigencia({ source: 'fincaraiz', first_seen_at: haceDias(10) }, HOY).estado, 'activo');
  assert.equal(evaluarVigencia({ source: 'fincaraiz', first_seen_at: haceDias(30) }, HOY).estado, 'activo');
  const r = evaluarVigencia({ source: 'fincaraiz', first_seen_at: haceDias(31) }, HOY);
  assert.equal(r.estado, 'expirado_30d');
  assert.equal(r.evento, 'EXPIRADO_30D');
});

test('vigencia: a los 90 días se descarta, no solo se despublica', () => {
  const r = evaluarVigencia({ source: 'fincaraiz', first_seen_at: haceDias(91) }, HOY);
  assert.equal(r.estado, 'descartado_90d');
  assert.equal(r.evento, 'DESCARTADO_90D');
});

test('vigencia: un activo bancario de 8 meses sigue activo', () => {
  // El caso de la HU: código verificado durante 2 meses sin cambios. Si se
  // heredara la regla de FincaRaíz, este inmueble desaparecería sin motivo.
  for (const src of ['davivienda', 'bancolombia', 'aval']) {
    const r = evaluarVigencia({ source: src, first_seen_at: haceDias(240) }, HOY);
    assert.equal(r.estado, 'activo', `${src} no debe caducar por antigüedad`);
    assert.equal(r.evento, null);
  }
});

test('vigencia: la fecha del portal descarta, pero el dato propio es el respaldo', () => {
  // Capa 1: el portal admite que el aviso es viejo.
  const capa1 = evaluarVigencia(
    { source: 'fincaraiz', first_seen_at: haceDias(5), fecha_publicacion_fuente: haceDias(120) }, HOY);
  assert.equal(capa1.estado, 'descartado_90d');

  // Capa 2: el portal dice "recién publicado" (el anunciante renovó el aviso),
  // pero el motor lo lleva viendo 100 días. Manda el dato propio.
  const capa2 = evaluarVigencia(
    { source: 'fincaraiz', first_seen_at: haceDias(100), fecha_publicacion_fuente: haceDias(1) }, HOY);
  assert.equal(capa2.estado, 'descartado_90d');
});

test('vigencia: sin fecha del portal la regla sigue funcionando', () => {
  const r = evaluarVigencia({ source: 'fincaraiz', first_seen_at: haceDias(45), fecha_publicacion_fuente: null }, HOY);
  assert.equal(r.estado, 'expirado_30d');
});

test('vigencia: días transcurridos', () => {
  assert.equal(diasDesde(haceDias(7), HOY), 7);
  assert.equal(diasDesde(null), null);
  assert.equal(diasDesde('no-es-fecha'), null);
});

test('frescura: a los bancos se les dice "verificado", no "publicado"', () => {
  // Comunicar antigüedad en un activo bancario espanta sin motivo; comunicar la
  // última verificación es igual de cierto y es lo que le importa al comprador.
  assert.match(textoFrescura('davivienda', new Date(Date.now() - 2 * 86_400_000)) ?? '', /^Verificado/);
  assert.match(textoFrescura('aval', new Date(Date.now() - 2 * 86_400_000)) ?? '', /^Verificado/);
  assert.match(textoFrescura('fincaraiz', new Date(Date.now() - 2 * 86_400_000)) ?? '', /^Visto/);
  assert.equal(textoFrescura('fincaraiz', null), null);
});

test('vigencia: los umbrales son los de la spec', () => {
  assert.equal(DIAS_DESPUBLICAR, 30);
  assert.equal(DIAS_DESCARTE, 90);
});

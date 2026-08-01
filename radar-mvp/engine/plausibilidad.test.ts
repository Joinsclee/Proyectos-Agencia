/**
 * Los umbrales de plausibilidad son un compromiso: demasiado estrictos descartan
 * inmuebles reales, demasiado laxos dejan pasar la basura que produce «+416% sobre
 * el mercado». Estas pruebas fijan los dos bordes con casos medidos en la base.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esPlausible, explicacionImplausible, motivoImplausible } from './plausibilidad.js';

test('plausibilidad: los casos reales que el cliente vio quedan fuera', () => {
  // Todos salen de la base, medidos el 2026-07-29.
  const basura = [
    { que: 'finca de 60 m²', d: { type: 'farm', area_m2: 60, price: 640_000_000 }, motivo: 'area_minima' },
    { que: 'finca de 330 m²', d: { type: 'farm', area_m2: 330, price: 1_600_000_000 }, motivo: 'area_minima' },
    { que: 'casa a $40M/m²', d: { type: 'house', area_m2: 150, price: 6_000_000_000 }, motivo: 'ppm2_alto' },
    { que: 'local de 9 m² a $320M', d: { type: 'commercial', area_m2: 9, price: 320_000_000 }, motivo: 'ppm2_alto' },
    { que: 'apartamento de 8.625 m²', d: { type: 'apartment', area_m2: 8625, price: 570_000_000 }, motivo: 'area_maxima' },
    // Antes salía por «ppm2_alto» —$34,5 millones el metro— y ahora lo frena antes
    // el mínimo de área: no existe un apartamento de 11 m². Se descarta igual, y el
    // motivo nuevo es el más útil de los dos, porque nombra el dato que de verdad
    // está mal en el aviso.
    { que: 'apartamento de 11 m² a $380M', d: { type: 'apartment', area_m2: 11, price: 380_000_000 }, motivo: 'area_minima' },
  ] as const;
  for (const { que, d, motivo } of basura) {
    assert.equal(motivoImplausible(d), motivo, `${que} debería descartarse por ${motivo}`);
  }
});

test('plausibilidad: los inmuebles normales NO se descartan', () => {
  // Percentiles reales de la base: el 1% más pequeño y el 99% más caro de los dos
  // tipos donde el área se publica bien. Si alguno de estos cayera, el umbral
  // estaría escondiendo inventario legítimo.
  const buenos = [
    { que: 'aparta-estudio de 28 m²', d: { type: 'apartment', area_m2: 28, price: 120_000_000 } },
    { que: 'apartamento mediano', d: { type: 'apartment', area_m2: 66, price: 285_000_000 } },
    { que: 'apartamento caro (p99)', d: { type: 'apartment', area_m2: 200, price: 1_230_000_000 } },
    { que: 'casa de 60 m²', d: { type: 'house', area_m2: 60, price: 180_000_000 } },
    { que: 'casa grande de 2.200 m²', d: { type: 'house', area_m2: 2200, price: 3_000_000_000 } },
    { que: 'parqueadero de 11 m²', d: { type: 'parking', area_m2: 11, price: 45_000_000 } },
    { que: 'oficina de 14 m²', d: { type: 'office', area_m2: 14, price: 90_000_000 } },
    { que: 'lote rural barato', d: { type: 'lot', area_m2: 64_000, price: 1_600_000_000 } },
    { que: 'finca de 10 hectáreas', d: { type: 'farm', area_m2: 100_000, price: 2_500_000_000 } },
    { que: 'bodega de 1.226 m²', d: { type: 'warehouse', area_m2: 1226, price: 3_300_000_000 } },
  ] as const;
  for (const { que, d } of buenos) {
    assert.equal(esPlausible(d), true, `${que} NO debería descartarse (motivo: ${motivoImplausible(d)})`);
  }
});

test('plausibilidad: el metro barato de un lote rural es legítimo', () => {
  // El percentil 1 de los lotes es $25.100/m² y es real: terreno rural grande. Un
  // mínimo puesto «por simetría» con el máximo habría borrado ese inventario
  // entero, que además es donde aparecen oportunidades de verdad.
  assert.equal(esPlausible({ type: 'lot', area_m2: 20_000, price: 502_000_000 }), true);
  // Cero y negativos sí son error de captura.
  assert.equal(motivoImplausible({ type: 'lot', area_m2: 20_000, price: 1 }), 'ppm2_bajo');
});

test('plausibilidad: sin datos suficientes no se descarta nada', () => {
  // Ausencia de dato no es dato malo: quien decide si hay con qué comparar es el
  // motor, y descartar aquí lo dejaría sin oportunidad de intentarlo.
  assert.equal(esPlausible({ type: 'apartment', area_m2: null, price: null }), true);
  assert.equal(esPlausible({}), true);
  // `Number(null)` es 0 y 0 es finito: sin el guardia, esto se leería como precio 0
  // y se descartaría por «ppm2_bajo».
  assert.equal(esPlausible({ type: 'house', area_m2: 100, price: null }), true);
});

test('plausibilidad: el área imposible para el tipo delata el aviso mal clasificado', () => {
  // La ficha exacta de la auditoría: «Oficina en Cúcuta · 5 m²» a $6.000.000/m²,
  // con una descripción de vivienda (sala-comedor, cocina, tres habitaciones).
  // El precio por metro es perfectamente creíble para una oficina, así que la
  // única señal disponible es el área: cinco metros no son una oficina.
  assert.equal(
    motivoImplausible({ type: 'office', area_m2: 5, price: 30_000_000 }),
    'area_minima',
  );
  // Y el resto de los tipos, con casos del mismo estilo.
  const imposibles = [
    { que: 'apartamento de 12 m²', d: { type: 'apartment', area_m2: 12, price: 60_000_000 } },
    { que: 'casa de 18 m²', d: { type: 'house', area_m2: 18, price: 90_000_000 } },
    { que: 'local de 3 m²', d: { type: 'commercial', area_m2: 3, price: 20_000_000 } },
    { que: 'bodega de 25 m²', d: { type: 'warehouse', area_m2: 25, price: 80_000_000 } },
    { que: 'lote de 12 m²', d: { type: 'lot', area_m2: 12, price: 30_000_000 } },
    { que: 'edificio de 30 m²', d: { type: 'building', area_m2: 30, price: 200_000_000 } },
    { que: 'parqueadero de 4 m²', d: { type: 'parking', area_m2: 4, price: 20_000_000 } },
  ] as const;
  for (const { que, d } of imposibles) {
    assert.equal(motivoImplausible(d), 'area_minima', `${que} debería descartarse por área`);
  }
});

test('plausibilidad: los mínimos nuevos no tocan el percentil 1 real de cada tipo', () => {
  // Cada uno es el área del 1% más pequeño medido en el inventario activo. Si
  // alguno cayera, el mínimo estaría borrando inventario legítimo en vez de
  // basura, que es exactamente lo que no puede pasar.
  const p1 = [
    { que: 'apartamento p1 (30 m²)', d: { type: 'apartment', area_m2: 30, price: 130_000_000 } },
    { que: 'casa p1 (55 m²)', d: { type: 'house', area_m2: 55, price: 170_000_000 } },
    { que: 'oficina p1 (14 m²)', d: { type: 'office', area_m2: 14, price: 90_000_000 } },
    { que: 'local p1 (8 m²)', d: { type: 'commercial', area_m2: 8, price: 50_000_000 } },
    { que: 'bodega p1 (80 m²)', d: { type: 'warehouse', area_m2: 80, price: 250_000_000 } },
    { que: 'lote p1 (50 m²)', d: { type: 'lot', area_m2: 50, price: 60_000_000 } },
    { que: 'parqueadero p1 (11 m²)', d: { type: 'parking', area_m2: 11, price: 45_000_000 } },
  ] as const;
  for (const { que, d } of p1) {
    assert.equal(esPlausible(d), true, `${que} NO debería descartarse (motivo: ${motivoImplausible(d)})`);
  }
});

test('plausibilidad: un tipo sin mínimo declarado no se descarta por pequeño', () => {
  // `rights` y los tipos que la fuente no sabe clasificar no tienen mínimo físico
  // conocido, y a falta de medida se prefiere no opinar antes que inventar un
  // umbral.
  assert.equal(esPlausible({ type: 'rights', area_m2: 2, price: 8_000_000 }), true);
  assert.equal(esPlausible({ type: null, area_m2: 2, price: 8_000_000 }), true);
});

test('plausibilidad: la explicación nombra el dato que falla', () => {
  // «No se pudo evaluar» no dice nada. Que el área o el precio del aviso parezcan
  // equivocados sí, y además es lo que el usuario puede verificar mirando el aviso.
  assert.match(explicacionImplausible('area_minima'), /área/i);
  assert.match(explicacionImplausible('area_maxima'), /área/i);
  assert.match(explicacionImplausible('ppm2_alto'), /precio por metro/i);
  assert.match(explicacionImplausible('ppm2_bajo'), /precio por metro/i);
});

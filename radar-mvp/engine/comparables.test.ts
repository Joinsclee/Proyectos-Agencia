/**
 * Tests del motor de comparables y estadística robusta.
 * Correr: node --import tsx --test engine/comparables.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, quantile, robustMedian, trimOutliers, haversineKm, robustSpread } from './stats.js';
import { evaluate, DEFAULT_CONFIG, type Candidate, type Comp } from './comparables.js';

test('median: impar y par', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('quantile: Q1/Q3 estilo R-7', () => {
  const xs = [1, 2, 3, 4, 5];
  assert.equal(quantile(xs, 0.25), 2);
  assert.equal(quantile(xs, 0.75), 4);
});

test('trimOutliers descarta el penthouse atípico', () => {
  const xs = [100, 102, 98, 101, 99, 100, 1000]; // 1000 es outlier
  const trimmed = trimOutliers(xs);
  assert.ok(!trimmed.includes(1000), 'debe quitar 1000');
});

test('robustMedian ignora el outlier; el promedio no', () => {
  const xs = [100, 102, 98, 101, 99, 100, 1000];
  const rm = robustMedian(xs);
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(rm <= 102, `robustMedian=${rm} debe rondar 100`);
  assert.ok(avg > 200, `avg=${avg} se va por el outlier`);
});

test('robustSpread: mercado homogéneo → spread bajo', () => {
  assert.ok(robustSpread([100, 101, 99, 100, 102, 98]) < 0.1);
});

test('haversine: Medellín centro ↔ El Poblado ~ 4-6 km', () => {
  const d = haversineKm(6.2442, -75.5812, 6.2086, -75.5659);
  assert.ok(d > 3 && d < 7, `dist=${d}`);
});

// ── Helpers para construir pool sintético ──────────────────────────
const comp = (over: Partial<Comp>): Comp => ({
  source_id: Math.random().toString(36).slice(2),
  type: 'apartment',
  ppm2: 3_000_000,
  area_m2: 60,
  lat: 6.27,
  lng: -75.61,
  stratum: 3,
  city: 'medellin',
  zone: 'robledo',
  ...over,
});

test('evaluate: candidato 30% bajo mercado → oportunidad alta (geo)', () => {
  // 20 comparables homogéneas a ~3M/m² → confianza alta + cola baja → is_high
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) => comp({ ppm2: 3_000_000 + i * 10_000, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'x', source: 'davivienda', source_id: 'D1', type: 'apartment',
    price: 126_000_000, area_m2: 60, // 2.1M/m² → 30% bajo 3M
    lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.equal(v.evaluable, true);
  assert.equal(v.is_opportunity, true);
  assert.equal(v.is_high, true);
  assert.equal(v.confidence, 'high');
  assert.ok(v.discount_pct! >= 25, `descuento=${v.discount_pct}`);
  assert.ok(v.method.startsWith('geo:'), v.method);
});

test('evaluate: candidato a precio de mercado → NO oportunidad', () => {
  const pool: Comp[] = Array.from({ length: 12 }, () => comp({}));
  const candidate: Candidate = {
    id: 'y', source: 'bbva', source_id: 'B1', type: 'apartment',
    price: 180_000_000, area_m2: 60, // 3M/m² = mercado
    lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.equal(v.is_opportunity, false);
});

test('evaluate: sin área → insuficiente', () => {
  const pool: Comp[] = Array.from({ length: 12 }, () => comp({}));
  const v = evaluate(
    { id: 'z', source: 'aval', source_id: 'A1', type: 'apartment', price: 100_000_000, area_m2: null, lat: 6.27, lng: -75.61, stratum: 3, city: 'medellin', zone: null },
    pool, DEFAULT_CONFIG,
  );
  assert.equal(v.evaluable, false);
  assert.equal(v.confidence, 'insufficient');
});

test('evaluate: pocas comparables → no marca oportunidad firme', () => {
  const pool: Comp[] = Array.from({ length: 3 }, () => comp({})); // < minComparables(8)
  const candidate: Candidate = {
    id: 'w', source: 'davivienda', source_id: 'D2', type: 'apartment',
    price: 120_000_000, area_m2: 60, lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.equal(v.is_opportunity, false);
  assert.equal(v.confidence, 'insufficient');
});

test('evaluate: leave-one-out excluye al propio candidato', () => {
  // 8 comparables idénticas + el candidato (que también está en el pool por source_id)
  const pool: Comp[] = [
    ...Array.from({ length: 8 }, () => comp({ ppm2: 3_000_000 })),
    comp({ source_id: 'SELF', ppm2: 1_000_000 }), // el propio, barato
  ];
  const candidate: Candidate = {
    id: 'self', source: 'fincaraiz', source_id: 'SELF', type: 'apartment',
    price: 60_000_000, area_m2: 60, lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  // El mercado debe ser ~3M (sin contar el propio 1M), no arrastrado hacia abajo
  assert.ok(v.market_ppm2! >= 2_500_000, `market=${v.market_ppm2}`);
});

test('evaluate: régimen textual cuando el candidato no tiene geo (banco PDF)', () => {
  const pool: Comp[] = Array.from({ length: 10 }, () => comp({ ppm2: 3_000_000 }));
  const candidate: Candidate = {
    id: 'pdf', source: 'davivienda', source_id: 'P1', type: 'apartment',
    price: 120_000_000, area_m2: 60, // 2M/m² → 33% bajo
    lat: null, lng: null, stratum: 3, city: 'medellin', zone: 'robledo',
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.equal(v.evaluable, true);
  assert.ok(v.method.startsWith('texto:'), v.method);
  assert.equal(v.is_opportunity, true);
});

// ── Condicionales nuevas: habitaciones y parqueadero ───────────────
test('comparables: habitaciones filtran (1 alcoba NO se compara con 4 alcobas)', () => {
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) =>
    comp({ ppm2: 3_000_000 + i * 10_000, bedrooms: 4, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'x', source: 'davivienda', source_id: 'D9', type: 'apartment',
    price: 126_000_000, area_m2: 60,
    lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
    bedrooms: 1, garages: null,
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  // Los niveles que exigen habitaciones no deben matchear → cae a uno más laxo.
  assert.ok(!/:(estricto|sin-parqueadero|sin-estrato)$/.test(v.method),
    `no debe usar un nivel que exige habitaciones, usó: ${v.method}`);
});

test('comparables: parqueadero separa (con parqueadero NO se compara con sin)', () => {
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) =>
    comp({ ppm2: 3_000_000 + i * 10_000, bedrooms: 3, garages: 0, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'x', source: 'davivienda', source_id: 'D8', type: 'apartment',
    price: 126_000_000, area_m2: 60,
    lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
    bedrooms: 3, garages: 2,
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.ok(!/:estricto$/.test(v.method),
    `el nivel estricto exige mismo parqueadero, usó: ${v.method}`);
});

test('evaluate: descuento imposible (99%) NO es oportunidad (error de datos)', () => {
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) =>
    comp({ ppm2: 3_000_000 + i * 10_000, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'err', source: 'fincaraiz', source_id: 'E1', type: 'apartment',
    price: 1_800_000, area_m2: 60, // 30k/m² → ~99% "bajo mercado" = dato erróneo
    lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.ok((v.discount_pct ?? 0) > 90, `descuento calculado: ${v.discount_pct}`);
  assert.equal(v.is_opportunity, false, 'un 99% de descuento es error, no oportunidad');
});

// ── Regresiones encontradas en la revisión adversarial ──

test('confianza ALTA es alcanzable en los niveles nuevos de la cascada', () => {
  // Antes: confidenceFor tenía una lista blanca de nombres ('estricto',
  // 'sin-estrato'), así que al añadir 'sin-parqueadero'/'sin-habitaciones' la
  // confianza alta —y con ella la insignia OPORTUNIDAD ALTA— se volvía inalcanzable.
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) =>
    comp({ ppm2: 3_000_000 + i * 20_000, bedrooms: 3, garages: 0, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'x', source: 'davivienda', source_id: 'D9', type: 'apartment',
    price: 117_000_000, area_m2: 60, // ≈ $1.95M/m² → muy por debajo del P10
    lat: 6.2705, lng: -75.6102, stratum: 3, city: 'medellin', zone: 'robledo',
    bedrooms: 3, garages: 2, // el parqueadero no casa → cae a 'sin-parqueadero'
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  assert.match(v.method, /sin-parqueadero/, `debe caer a sin-parqueadero, usó: ${v.method}`);
  assert.equal(v.confidence, 'high', 'evidencia homogénea y n alto ⇒ confianza alta');
  assert.ok(v.is_high, 'con descuento fuerte + confianza alta debe ser OPORTUNIDAD ALTA');
});

test('los criterios no afirman condiciones que no se aplicaron', () => {
  // Los inmuebles de banco salen de PDFs sin habitaciones ni parqueadero: la
  // condición pasa "vacía". La ficha no debe presumir de haber filtrado por ellas.
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) =>
    comp({ ppm2: 3_000_000 + i * 20_000, bedrooms: null, garages: null, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'x', source: 'aval', source_id: 'A1', type: 'apartment',
    price: 117_000_000, area_m2: 60,
    lat: 6.2705, lng: -75.6102, stratum: null, city: 'medellin', zone: 'robledo',
    bedrooms: null, garages: null, // sin datos → no se pudo filtrar por ellos
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  const texto = v.criteria.join(' | ');
  assert.ok(!/habitacion/i.test(texto), `no debe afirmar habitaciones: ${texto}`);
  assert.ok(!/parqueadero/i.test(texto), `no debe afirmar parqueadero: ${texto}`);
  assert.ok(!/estrato/i.test(texto), `no debe afirmar estrato: ${texto}`);
  assert.ok(/tipo/i.test(texto) && /sector|barrio|ciudad/i.test(texto), `sí debe declarar tipo y ubicación: ${texto}`);
});

test('los criterios SÍ declaran lo que de verdad se filtró', () => {
  const pool: Comp[] = Array.from({ length: 20 }, (_, i) =>
    comp({ ppm2: 3_000_000 + i * 20_000, bedrooms: 3, garages: 1, stratum: 4, lat: 6.27 + i * 0.0001 }));
  const candidate: Candidate = {
    id: 'x', source: 'bbva', source_id: 'B1', type: 'apartment',
    price: 117_000_000, area_m2: 60,
    lat: 6.2705, lng: -75.6102, stratum: 4, city: 'medellin', zone: 'robledo',
    bedrooms: 3, garages: 1,
  };
  const v = evaluate(candidate, pool, DEFAULT_CONFIG);
  const texto = v.criteria.join(' | ');
  assert.match(texto, /3 habitaciones/);
  assert.match(texto, /con parqueadero/);
  assert.match(texto, /estrato 4/);
  assert.match(texto, /área similar/);
});

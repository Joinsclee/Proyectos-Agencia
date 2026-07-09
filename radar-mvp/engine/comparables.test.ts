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

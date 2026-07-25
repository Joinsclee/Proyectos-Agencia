import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeRentalMarket,
  type RentalPoolRow,
} from './rental-comparables.js';
import { mapFincaRaizRental } from '../scrapers/CO/fincaraiz/parser.js';
import type { RadarZona } from '../scrapers/CO/fincaraiz/zonas.js';
import { canMarkSourceStale } from '../scrapers/CO/fincaraiz/index.js';

const rental = (overrides: Partial<RentalPoolRow> = {}): RentalPoolRow => ({
  type: 'apartment',
  monthly_rent: 2_000_000,
  area_m2: 60,
  rent_per_m2: 33_333,
  zone: 'Laureles',
  lat: 6.244,
  lng: -75.59,
  bedrooms: 2,
  garages: 1,
  source_id: Math.random().toString(36).slice(2),
  ...overrides,
});

test('canon de mercado usa mediana robusta y rango central', () => {
  const pool = [
    rental({ monthly_rent: 1_900_000 }),
    rental({ monthly_rent: 2_000_000 }),
    rental({ monthly_rent: 2_100_000 }),
    rental({ monthly_rent: 2_200_000 }),
    rental({ monthly_rent: 2_300_000 }),
    rental({ monthly_rent: 30_000_000 }),
  ];
  const result = summarizeRentalMarket(pool, 'Medellín', 'apartment', {
    area_m2: 60,
    zone: 'Laureles',
    bedrooms: 2,
    garages: 1,
  });

  assert.equal(result.available, true);
  assert.ok((result.median_monthly_rent ?? 0) >= 2_000_000);
  assert.ok((result.median_monthly_rent ?? 0) <= 2_300_000);
  assert.ok((result.p75_monthly_rent ?? 0) < 5_000_000, 'el atípico no debe dominar el rango');
});

test('prioriza área similar antes de estimar el canon', () => {
  const similar = Array.from({ length: 5 }, (_, index) =>
    rental({ monthly_rent: 1_900_000 + index * 50_000, area_m2: 58 + index }));
  const grandes = Array.from({ length: 6 }, (_, index) =>
    rental({ monthly_rent: 5_000_000 + index * 100_000, area_m2: 180 + index }));

  const result = summarizeRentalMarket([...similar, ...grandes], 'medellin', 'apartment', {
    area_m2: 60,
    zone: 'Laureles',
  });

  assert.equal(result.n, 5);
  assert.match(result.criteria.join(' | '), /área similar/);
  assert.ok((result.median_monthly_rent ?? 0) < 2_500_000);
});

test('nunca mezcla casas con apartamentos para completar la muestra', () => {
  const houses = Array.from({ length: 3 }, () => rental({ type: 'house', monthly_rent: 3_000_000 }));
  const apartments = Array.from({ length: 12 }, () => rental({ type: 'apartment' }));
  const result = summarizeRentalMarket([...houses, ...apartments], 'medellin', 'house', {
    zone: 'Laureles',
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, 'insufficient');
  assert.equal(result.n, 3);
});

test('el parser de arriendo conserva atributos pero separa el canon', () => {
  const zone: RadarZona = {
    country_code: 'CO',
    city: 'Medellín',
    portal: 'fincaraiz',
    operation: 'arriendo',
    property_type: 'apartamentos',
    neighborhood_slug: null,
    city_slug: 'medellin',
    dept_slug: 'antioquia',
    location_id: null,
    price_min: null,
    price_max: null,
    area_min: null,
    area_max: null,
    stratum_min: null,
    stratum_max: null,
    bedrooms_min: null,
    max_pages: 1,
    min_comparables: 4,
  };
  const parsed = mapFincaRaizRental({
    id: 123,
    price: { amount: 2_500_000 },
    m2: 75,
    bedrooms: 3,
    active: true,
    link: '/arriendo/apartamento/123',
    property_type: { name: 'Apartamento' },
    operation_type: { name: 'Arriendo' },
  }, zone);

  assert.equal(parsed?.monthly_rent, 2_500_000);
  assert.equal(parsed?.area_m2, 75);
  assert.equal(parsed?.features.bedrooms, 3);
  assert.equal(parsed?.features.operation, 'Arriendo');
});

test('el lifecycle no desactiva avisos cuando faltó una zona o página', () => {
  assert.equal(canMarkSourceStale(2, [{ completed: true }, { completed: true }], 0, false, false), true);
  assert.equal(canMarkSourceStale(2, [{ completed: true }], 0, false, false), false);
  assert.equal(canMarkSourceStale(2, [{ completed: true }, { completed: false }], 1, false, false), false);
  assert.equal(canMarkSourceStale(2, [{ completed: true }, { completed: true }], 0, true, false), false);
});

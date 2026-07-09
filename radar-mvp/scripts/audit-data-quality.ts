/**
 * Auditoría de calidad de datos del baseline FincaRaíz.
 * Calcula, por ciudad y global: cobertura de campos, fotos, outliers de precio/m²,
 * sanidad de geocodificación, distribución de oportunidades y estimación de duplicados.
 *
 * Uso: tsx scripts/audit-data-quality.ts
 */
import { supabase } from '../lib/supabase.js';

type Row = {
  id: string; city: string | null; type: string | null;
  price: number | null; area_m2: number | null; price_per_m2: number | null;
  is_opportunity: boolean | null; discount_pct: number | null;
  stratum: number | null; bedrooms: number | null; bathrooms: number | null;
  garages: number | null; floor: number | null; administracion: number | null;
  antiguedad: string | null; lat: number | null; lng: number | null;
  image_count: number | null; is_project: boolean | null; conf: string | null;
};

const SLIM =
  'id,city,type,price,area_m2,price_per_m2,is_opportunity,discount_pct,' +
  'stratum:features->stratum,bedrooms:features->bedrooms,bathrooms:features->bathrooms,' +
  'garages:features->garages,floor:features->floor,administracion:features->administracion,' +
  'antiguedad:features->antiguedad,lat:features->lat,lng:features->lng,' +
  'image_count:features->image_count,is_project:features->is_project,conf:features->market->>confidence';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

async function loadAll(): Promise<Row[]> {
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('inmuebles').select(SLIM)
      .eq('is_active', true).eq('source', 'fincaraiz')
      .order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as any[];
    rows.push(...batch.map((r) => ({
      ...r, stratum: num(r.stratum), bedrooms: num(r.bedrooms), bathrooms: num(r.bathrooms),
      garages: num(r.garages), floor: num(r.floor), administracion: num(r.administracion),
      lat: num(r.lat), lng: num(r.lng), image_count: num(r.image_count),
    })) as Row[]);
    if (batch.length < PAGE) break;
  }
  return rows;
}

// Bounding boxes aproximados por ciudad (lat min,max / lng min,max) para sanidad geo.
const CITY_BBOX: Record<string, [number, number, number, number]> = {
  bogota: [4.4, 4.9, -74.25, -73.95], medellin: [6.1, 6.4, -75.7, -75.5],
  cali: [3.3, 3.55, -76.6, -76.45], barranquilla: [10.9, 11.1, -74.9, -74.7],
  cartagena: [10.3, 10.5, -75.6, -75.4], bucaramanga: [7.0, 7.2, -73.2, -73.0],
  pereira: [4.75, 4.9, -75.8, -75.6], manizales: [5.0, 5.13, -75.6, -75.4],
};
const inColombia = (lat: number, lng: number) => lat > 0 && lat < 14 && lng > -82 && lng < -66;

function pct(n: number, d: number) { return d ? +((n / d) * 100).toFixed(1) : 0; }

async function main() {
  console.log('Cargando baseline…');
  const rows = await loadAll();
  console.log(`Total fincaraiz activos: ${rows.length}\n`);

  const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))] as string[];
  const FIELDS: Array<[string, (r: Row) => boolean]> = [
    ['precio', (r) => r.price != null && r.price > 0],
    ['area_m2', (r) => r.area_m2 != null && r.area_m2 > 0],
    ['precio/m²', (r) => r.price_per_m2 != null],
    ['estrato', (r) => r.stratum != null && r.stratum > 0],
    ['alcobas', (r) => r.bedrooms != null && r.bedrooms > 0],
    ['baños', (r) => r.bathrooms != null && r.bathrooms > 0],
    ['garaje', (r) => r.garages != null && r.garages > 0],
    ['piso', (r) => r.floor != null],
    ['administración', (r) => r.administracion != null && r.administracion > 0],
    ['antigüedad', (r) => !!r.antiguedad],
    ['lat/lng', (r) => r.lat != null && r.lng != null],
    ['≥1 foto', (r) => (r.image_count ?? 0) > 0],
  ];

  // ── Cobertura de campos (global) ──
  console.log('═══ COBERTURA DE CAMPOS (global) ═══');
  for (const [name, has] of FIELDS) {
    const c = rows.filter(has).length;
    console.log(`  ${name.padEnd(16)} ${String(pct(c, rows.length)).padStart(5)}%  (${c}/${rows.length})`);
  }
  const imgCounts = rows.map((r) => r.image_count ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const medImg = imgCounts.length ? imgCounts[Math.floor(imgCounts.length / 2)] : 0;
  console.log(`  fotos: mediana ${medImg}, máx ${imgCounts[imgCounts.length - 1] ?? 0}, sin fotos: ${rows.filter((r) => (r.image_count ?? 0) === 0).length}`);

  // ── Outliers de precio/m² y área ──
  console.log('\n═══ OUTLIERS (posible mala calidad) ═══');
  const cheap = rows.filter((r) => r.price_per_m2 != null && r.price_per_m2 < 800_000);
  const dear = rows.filter((r) => r.price_per_m2 != null && r.price_per_m2 > 25_000_000);
  const tinyArea = rows.filter((r) => r.area_m2 != null && r.area_m2 < 15);
  const hugeArea = rows.filter((r) => r.area_m2 != null && r.area_m2 > 1000);
  const lowPrice = rows.filter((r) => r.price != null && r.price < 30_000_000);
  console.log(`  precio/m² < $800k:   ${cheap.length} (${pct(cheap.length, rows.length)}%)`);
  console.log(`  precio/m² > $25M:    ${dear.length} (${pct(dear.length, rows.length)}%)`);
  console.log(`  área < 15 m²:        ${tinyArea.length}`);
  console.log(`  área > 1000 m²:      ${hugeArea.length}`);
  console.log(`  precio < $30M:       ${lowPrice.length}`);

  // ── Sanidad geográfica ──
  console.log('\n═══ GEOCODIFICACIÓN ═══');
  const withGeo = rows.filter((r) => r.lat != null && r.lng != null);
  const outCol = withGeo.filter((r) => !inColombia(r.lat!, r.lng!));
  console.log(`  con lat/lng: ${withGeo.length} (${pct(withGeo.length, rows.length)}%) · fuera de Colombia: ${outCol.length}`);
  for (const c of cities) {
    const bb = CITY_BBOX[c]; if (!bb) continue;
    const cg = withGeo.filter((r) => r.city === c);
    const outside = cg.filter((r) => !(r.lat! >= bb[0] && r.lat! <= bb[1] && r.lng! >= bb[2] && r.lng! <= bb[3]));
    console.log(`  ${c.padEnd(13)} fuera del bbox ciudad: ${outside.length}/${cg.length} (${pct(outside.length, cg.length)}%)`);
  }

  // ── Tipos y proyectos ──
  console.log('\n═══ TIPOS / PROYECTOS ═══');
  const byType: Record<string, number> = {};
  for (const r of rows) { const t = r.type ?? 'null'; byType[t] = (byType[t] ?? 0) + 1; }
  console.log('  ' + Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join('  '));
  console.log(`  proyectos preventa (is_project): ${rows.filter((r) => r.is_project === true).length}`);

  // ── Oportunidades por ciudad ──
  console.log('\n═══ OPORTUNIDADES POR CIUDAD ═══');
  console.log('  Ciudad'.padEnd(15) + 'Total'.padStart(8) + 'Oport.'.padStart(8) + '%'.padStart(7) + 'Altas'.padStart(7));
  for (const c of cities.sort()) {
    const cr = rows.filter((r) => r.city === c);
    const opp = cr.filter((r) => r.is_opportunity).length;
    const high = cr.filter((r) => r.is_opportunity && r.conf === 'high' && (r.discount_pct ?? 0) >= 25).length;
    console.log('  ' + c.padEnd(13) + String(cr.length).padStart(8) + String(opp).padStart(8) + (pct(opp, cr.length) + '%').padStart(7) + String(high).padStart(7));
  }

  // ── Estimación de duplicados (proxy sin dirección) ──
  console.log('\n═══ DUPLICADOS (proxy precio|área|alcobas|baños|geo4) ═══');
  const seen = new Map<string, number>();
  let dups = 0;
  for (const r of rows) {
    if (r.is_project || r.price == null || r.area_m2 == null || r.lat == null || r.lng == null) continue;
    const key = [r.price, r.area_m2, r.bedrooms ?? '', r.bathrooms ?? '', r.lat.toFixed(4), r.lng.toFixed(4)].join('|');
    const c = (seen.get(key) ?? 0) + 1; seen.set(key, c);
    if (c > 1) dups++;
  }
  console.log(`  posibles duplicados de contenido: ${dups} (${pct(dups, rows.length)}%)`);

  console.log('\n✅ Auditoría completa.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

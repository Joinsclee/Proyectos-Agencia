/**
 * Cuenta cuántas URLs del sitemap están vivas (HTTP 200) vs 404 zombies,
 * usando HEAD requests paralelos (mucho más rápido que browser).
 */
import 'dotenv/config';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const BASE = 'https://rematandobienes.com';

async function main() {
  const sitemaps = [1, 2, 3, 4].map((i) => `${BASE}/remates-judiciales-sitemap${i}.xml`);
  const urls: string[] = [];
  for (const sm of sitemaps) {
    const r = await fetch(sm, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) continue;
    const xml = await r.text();
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].forEach((m) => {
      const u = m[1]!.trim();
      if (/\/remates-judiciales\/[^/]+\/?$/.test(u)) urls.push(u);
    });
  }
  console.log(`Total URLs en sitemaps: ${urls.length}`);

  // HEAD paralelo en batches de 20
  const BATCH = 20;
  const alive: string[] = [];
  const dead: string[] = [];
  let processed = 0;

  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (u) => {
      try {
        const r = await fetch(u, {
          method: 'HEAD',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          redirect: 'manual',
        });
        return { u, status: r.status };
      } catch {
        return { u, status: 0 };
      }
    }));
    for (const { u, status } of results) {
      if (status === 200) alive.push(u);
      else dead.push(u);
    }
    processed += batch.length;
    if (processed % 100 === 0 || processed === urls.length) {
      console.log(`  …${processed}/${urls.length} alive=${alive.length} dead=${dead.length}`);
    }
  }

  console.log(`\n✓ Activos (HTTP 200): ${alive.length}`);
  console.log(`✗ Muertos (404/error): ${dead.length}`);

  const out = join(process.cwd(), '_session', 'remates-sitemap-alive.json');
  writeFileSync(out, JSON.stringify({ count: alive.length, urls: alive }, null, 2));
  console.log(`Lista vivos: ${out}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

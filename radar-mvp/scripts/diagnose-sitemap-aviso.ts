/**
 * Diagnostica POR QUÉ los avisos del sitemap están siendo rechazados.
 *
 * Toma un aviso al azar del sitemap, abre la página autenticada y reporta:
 *  - cuántos jet-listing-dynamic-field tiene
 *  - si tiene link a /departamento/x/ o /ciudad/y/
 *  - si su primera línea de texto incluye los labels esperados
 *  - HTTP status (¿redirige a home?)
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import 'dotenv/config';

const BASE = 'https://rematandobienes.com';
const STORAGE = join(process.cwd(), '_session', 'remates-storage.json');

async function main() {
  // Sacamos URLs del sitemap 1
  const r = await fetch(`${BASE}/remates-judiciales-sitemap1.xml`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const xml = await r.text();
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1]!.trim())
    .filter((u) => /\/remates-judiciales\/[^/]+\/?$/.test(u));

  // Muestreamos 5 al azar
  const sample = [
    all[0],
    all[10],
    all[50],
    all[100],
    all[150],
  ].filter(Boolean) as string[];

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    storageState: STORAGE,
  });
  const page = await context.newPage();

  for (const url of sample) {
    console.log(`\n━━━ ${url} ━━━`);
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 60_000 }).catch(() => null);
    const finalUrl = page.url();
    console.log(`  HTTP: ${resp?.status()}  finalUrl: ${finalUrl}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    const info = await page.evaluate(() => {
      const jets = document.querySelectorAll('.elementor-widget-jet-listing-dynamic-field');
      const deptLink = document.querySelector('a[href*="/departamento/"]') as HTMLAnchorElement | null;
      const cityLink = document.querySelector('a[href*="/ciudad/"]') as HTMLAnchorElement | null;
      const hasLabels = /Avalúo del bien|Fecha de Audiencia|Postura mínima/i.test(document.body.innerText);
      const title = (document.querySelector('h1')?.textContent || '').trim();
      const firstChars = document.body.innerText.substring(0, 200).replace(/\n+/g, ' | ');
      return {
        jet_count: jets.length,
        dept_link: deptLink?.href ?? null,
        city_link: cityLink?.href ?? null,
        has_labels: hasLabels,
        h1: title,
        first_chars: firstChars,
      };
    });

    console.log(`  h1: "${info.h1}"`);
    console.log(`  jet-listing-dynamic-field: ${info.jet_count}`);
    console.log(`  link departamento: ${info.dept_link ?? '(no)'}`);
    console.log(`  link ciudad:       ${info.city_link ?? '(no)'}`);
    console.log(`  tiene labels esperados: ${info.has_labels}`);
    console.log(`  primeros 200: ${info.first_chars}`);
  }

  await browser.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

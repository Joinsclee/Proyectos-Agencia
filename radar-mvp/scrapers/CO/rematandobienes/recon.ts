/**
 * Recon de rematandobienes.com (autenticado)
 *
 * Requisito previo: haber corrido `npm run remates:login` y tener
 * `_session/remates-storage.json`.
 *
 * Qué hace:
 *  1. Restaura la sesión guardada.
 *  2. Hace un crawl ligero: home autenticada → enlaces de departamentos →
 *     una ciudad muestra → un aviso muestra.
 *  3. Vuelca a `_session/remates-recon.json` con: lista de departamentos,
 *     lista de ciudades de la muestra, lista de avisos, HTML/atributos
 *     clave del aviso (selectores tentativos para el scraper).
 *
 * Salida pensada para revisión humana. Ningún dato se sube a Supabase aún.
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { createLogger } from '../../../lib/logger.js';

const log = createLogger('remates-recon');

const BASE_URL = process.env.REMATES_BASE_URL ?? 'https://rematandobienes.com';
const STORAGE_PATH = join(process.cwd(), '_session', 'remates-storage.json');
const OUT_PATH = join(process.cwd(), '_session', 'remates-recon.json');

interface ReconOutput {
  scraped_at: string;
  base_url: string;
  session_valid: boolean;
  departments: Array<{ name: string; url: string }>;
  sample_cities: Array<{ department: string; name: string; url: string }>;
  sample_listings: Array<{ city: string; title: string; url: string }>;
  sample_aviso: {
    url: string;
    title: string;
    full_text: string;
    jet_fields: Array<{ class_name: string; text: string }>;
    avaluo_first_guess: string | null;
    html_excerpt: string;
  } | null;
  notes: string[];
}

async function openSession(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (!existsSync(STORAGE_PATH)) {
    throw new Error(`No hay sesión guardada en ${STORAGE_PATH}. Corre primero: npm run remates:login`);
  }
  // Cloudflare da challenges silenciosos en headless; corremos headed por ahora.
  // Después podemos optimizar con browser-launch flags antibot.
  const headless = process.env.REMATES_HEADLESS === '1';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: STORAGE_PATH,
  });
  context.setDefaultNavigationTimeout(90_000);
  context.setDefaultTimeout(45_000);
  return { browser, context };
}

async function gotoSafe(page: Awaited<ReturnType<BrowserContext['newPage']>>, url: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      // Espera adicional por si Cloudflare interpone JS
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      return true;
    } catch (e) {
      log.warn(`  intento ${i + 1} falló: ${(e as Error).message.substring(0, 80)}`);
    }
  }
  return false;
}

async function main() {
  const { browser, context } = await openSession();
  const page = await context.newPage();
  const out: ReconOutput = {
    scraped_at: new Date().toISOString(),
    base_url: BASE_URL,
    session_valid: false,
    departments: [],
    sample_cities: [],
    sample_listings: [],
    sample_aviso: null,
    notes: [],
  };

  // 1. Validar sesión
  log.info('Validando sesión…');
  const okMyAccount = await gotoSafe(page, `${BASE_URL}/my-account-2/`);
  if (!okMyAccount) {
    out.notes.push('Timeout navegando a /my-account-2/. Posible Cloudflare en headless o sitio caído.');
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    await browser.close();
    return;
  }
  const hasLogout = await page.$('a[href*="customer-logout"], a[href*="logout"]');
  out.session_valid = !!hasLogout;
  if (!out.session_valid) {
    out.notes.push('SESIÓN INVÁLIDA: re-corre `npm run remates:login`. Recon abortado.');
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    await browser.close();
    return;
  }
  log.info('  ✓ sesión activa');

  // 2. Home / buscar listado de departamentos
  log.info('Buscando departamentos…');
  await gotoSafe(page, BASE_URL);

  // Heurística: enlaces a /departamento/{slug}/
  const departments = await page.$$eval('a[href*="/departamento/"]', (els) => {
    const seen = new Set<string>();
    const list: Array<{ name: string; url: string }> = [];
    for (const el of els) {
      const a = el as HTMLAnchorElement;
      const url = a.href.split('?')[0].split('#')[0];
      if (seen.has(url)) continue;
      seen.add(url);
      list.push({ name: (a.innerText || '').trim().substring(0, 60), url });
    }
    return list;
  });
  out.departments = departments;
  log.info(`  ${departments.length} departamentos`);

  // 3. Muestra: tomar el primero, listar ciudades
  if (departments.length > 0) {
    const dept = departments[0]!;
    log.info(`Muestreando departamento: ${dept.name} (${dept.url})`);
    await gotoSafe(page, dept.url);
    const cities = await page.$$eval('a[href*="/ciudad/"]', (els) => {
      const seen = new Set<string>();
      const list: Array<{ name: string; url: string }> = [];
      for (const el of els) {
        const a = el as HTMLAnchorElement;
        const url = a.href.split('?')[0].split('#')[0];
        if (seen.has(url)) continue;
        seen.add(url);
        list.push({ name: (a.innerText || '').trim().substring(0, 60), url });
      }
      return list;
    });
    out.sample_cities = cities.slice(0, 30).map((c) => ({ department: dept.name, ...c }));
    log.info(`  ${cities.length} ciudades`);

    // 4. Muestra: una ciudad → avisos
    if (cities.length > 0) {
      const city = cities[0]!;
      log.info(`Muestreando ciudad: ${city.name}`);
      await gotoSafe(page, city.url);
      // Avisos típicos: /remates-judiciales/{slug}/  o   /aviso/{slug}/
      const listings = await page.$$eval(
        'a[href*="/remates-judiciales/"], a[href*="/aviso/"], a[href*="/remate/"]',
        (els) => {
          const seen = new Set<string>();
          const list: Array<{ title: string; url: string }> = [];
          for (const el of els) {
            const a = el as HTMLAnchorElement;
            const url = a.href.split('?')[0].split('#')[0];
            if (seen.has(url)) continue;
            seen.add(url);
            const t = (a.getAttribute('title') || a.innerText || '').trim().substring(0, 140);
            list.push({ title: t, url });
          }
          return list;
        },
      );
      out.sample_listings = listings.slice(0, 30).map((l) => ({ city: city.name, ...l }));
      log.info(`  ${listings.length} avisos`);

      // 5. Muestra: 1 aviso completo
      if (listings.length > 0) {
        const aviso = listings[0]!;
        log.info(`Inspeccionando aviso: ${aviso.url}`);
        await gotoSafe(page, aviso.url);

        // NOTA: evaluate corre en el contexto del browser. Evitamos funciones
        // helper internas porque tsx/esbuild las transforma con __name y rompe.
        // Toda la lógica va inline con arrow functions cortas.
        const data = await page.evaluate(() => {
          const titleEl = document.querySelector('h1, .post-title, .entry-title') as HTMLElement | null;
          const titleText = titleEl ? (titleEl.innerText || '').trim() : '';

          const avaluoEl = document.querySelector('[data-name="avaluo"], .jet-listing-dynamic-field__content') as HTMLElement | null;
          const avaluoText = avaluoEl ? (avaluoEl.innerText || '').trim() : null;

          // Listado de TODOS los bloques dinámicos JetEngine para identificar campos por su clase/contenido
          const jetFields: Array<{ class_name: string; text: string }> = [];
          const jetBlocks = document.querySelectorAll('.jet-listing-dynamic-field, .elementor-widget-jet-listing-dynamic-field');
          jetBlocks.forEach((el) => {
            const html = el as HTMLElement;
            jetFields.push({
              class_name: html.className.substring(0, 200),
              text: (html.innerText || '').trim().substring(0, 300),
            });
          });

          // Pares label:valor que se vean tipo "Avaluo: $X" en el cuerpo
          const fullText = document.body.innerText.substring(0, 6000);

          const main = document.querySelector('main, article, .entry-content') as HTMLElement | null;
          const htmlExcerpt = main ? main.innerHTML.substring(0, 8000) : document.body.innerHTML.substring(0, 8000);

          return {
            title: titleText || document.title,
            full_text: fullText,
            jet_fields: jetFields.slice(0, 60),
            avaluo_first_guess: avaluoText,
            html_excerpt: htmlExcerpt,
          };
        });

        out.sample_aviso = {
          url: aviso.url,
          title: data.title || '',
          full_text: data.full_text,
          jet_fields: data.jet_fields,
          avaluo_first_guess: data.avaluo_first_guess,
          html_excerpt: data.html_excerpt,
        };
      }
    }
  }

  // 6. Dump
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  log.info(`✅ Recon dump: ${OUT_PATH}`);
  log.info('   Inspecciona ese JSON para definir los selectores definitivos del scraper.');

  await browser.close();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Recon falló:', e);
  process.exit(1);
});

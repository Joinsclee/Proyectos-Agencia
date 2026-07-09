/**
 * Login one-shot a rematandobienes.com
 *
 * Estrategia:
 *  - Abre Chromium VISIBLE (headed).
 *  - Auto-rellena usuario/contraseña desde .env.
 *  - El reCAPTCHA v2 (checkbox) lo resuelve la persona MANUALMENTE en la ventana.
 *  - Cuando el login es exitoso, guarda `storageState.json` con cookies + localStorage.
 *  - Esa sesión se reutiliza desde el scraper hasta que expire.
 *
 * Uso:
 *  npm run remates:login
 *
 * Re-login: solo cuando el scraper detecte que la sesión expiró.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { createLogger } from '../../../lib/logger.js';

const log = createLogger('remates-login');

const BASE_URL = process.env.REMATES_BASE_URL ?? 'https://rematandobienes.com';
const LOGIN_PATH = '/my-account-2/';
const USERNAME_SELECTOR = 'input[name="username"], input#username';
const PASSWORD_SELECTOR = 'input[name="password"], input#password';
const SUBMIT_SELECTOR = 'button[name="login"], button[type="submit"]';

const SESSION_DIR = join(process.cwd(), '_session');
const STORAGE_PATH = join(SESSION_DIR, 'remates-storage.json');

async function main() {
  const user = process.env.REMATES_USERNAME;
  const pass = process.env.REMATES_PASSWORD;
  if (!user || !pass) {
    throw new Error('Faltan REMATES_USERNAME / REMATES_PASSWORD en .env');
  }

  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

  log.info('Abriendo Chromium visible…');
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  log.info(`Navegando a ${BASE_URL}${LOGIN_PATH}`);
  await page.goto(`${BASE_URL}${LOGIN_PATH}`, { waitUntil: 'domcontentloaded' });

  // Cloudflare a veces interpone una verificación: damos margen.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => { /* ignore */ });

  // Algunas instalaciones de WooCommerce esconden el form en una pestaña; aseguramos que esté visible.
  try {
    await page.waitForSelector(USERNAME_SELECTOR, { timeout: 15_000 });
  } catch {
    log.warn('No encontré el form de login automáticamente; revisa la ventana e ingresa manualmente.');
  }

  log.info('Llenando credenciales (la contraseña no se imprime en logs)…');
  await page.fill(USERNAME_SELECTOR, user).catch(() => undefined);
  await page.fill(PASSWORD_SELECTOR, pass).catch(() => undefined);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  👉 RESUELVE EL reCAPTCHA EN LA VENTANA Y HAZ CLICK EN');
  console.log('     "Acceder" / "Iniciar sesión".');
  console.log('  ⏳ Esta terminal espera hasta que el FORM DE LOGIN');
  console.log('     desaparezca (señal de login real exitoso).');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Detección estricta: el FORM de login debe desaparecer del DOM.
  // (La heurística laxa anterior matcheaba con links de logout pre-rendered
  //  en menús, lo que hacía falsos positivos antes de que la persona escribiera nada).
  // Damos hasta 5 minutos para que la persona resuelva el captcha.
  // OJO: la firma de waitForFunction es (pageFunction, arg, options).
  // Pasamos `undefined` como arg explícitamente para que el objeto siguiente
  // sea interpretado como options y NO como arg (que usaría timeout default 30s).
  await page.waitForFunction(
    () => {
      const loginForm = document.querySelector(
        'form.login, form.woocommerce-form-login, form[name="login"]',
      ) as HTMLElement | null;
      if (!loginForm) return true;
      // o que esté visualmente oculto
      const cs = window.getComputedStyle(loginForm);
      return cs.display === 'none' || cs.visibility === 'hidden' || loginForm.offsetParent === null;
    },
    undefined,
    { timeout: 5 * 60_000 },
  );

  const finalUrl = page.url();
  log.info(`✓ Form de login desapareció. URL: ${finalUrl}`);

  // Doble verificación: pedir una ruta protegida del dashboard de WooCommerce
  // y validar que muestra contenido autenticado real (saludo o navegación de cuenta).
  await page.goto(`${BASE_URL}/my-account-2/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => { /* ignore */ });

  const authMarkers = await page.evaluate(() => {
    const dashboard = document.querySelector('.woocommerce-MyAccount-content') as HTMLElement | null;
    const greeting = document.body.innerText.match(/Hola\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+/);
    const logoutLink = document.querySelector('a[href*="customer-logout"]') as HTMLAnchorElement | null;
    const loginFormStill = document.querySelector('form.woocommerce-form-login, form.login') as HTMLElement | null;
    return {
      has_dashboard_content: !!dashboard && (dashboard.innerText || '').trim().length > 20,
      has_greeting: !!greeting,
      greeting_text: greeting ? greeting[0] : null,
      has_logout_link: !!logoutLink,
      logout_href: logoutLink ? logoutLink.href : null,
      login_form_still_visible: !!loginFormStill && loginFormStill.offsetParent !== null,
    };
  });

  log.info('Marcadores de autenticación:', authMarkers);

  if (authMarkers.login_form_still_visible || (!authMarkers.has_dashboard_content && !authMarkers.has_greeting)) {
    log.error('❌ NO se detectó sesión válida. NO se guardó storage.');
    log.error('   Revisa que hayas escrito usuario + contraseña + captcha + click Acceder.');
    await browser.close();
    process.exit(2);
  }

  await context.storageState({ path: STORAGE_PATH });
  log.info(`✅ Sesión guardada en ${STORAGE_PATH}`);
  log.info('   Esta sesión se usará en scrapeos siguientes. Re-login solo si expira.');

  await browser.close();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Login falló:', e);
  process.exit(1);
});

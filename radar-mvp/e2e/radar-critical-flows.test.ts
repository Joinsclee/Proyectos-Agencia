import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const port = Number(process.env.E2E_PORT || 8790);
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, '');
const baseUrl = externalBaseUrl || `http://127.0.0.1:${port}`;
const screenshotsDir = '.gstack/qa-reports/screenshots';

let browser: Browser;
let server: ChildProcess | undefined;
let serverOutput = '';

async function waitForHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'sin respuesta';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`El servidor E2E no respondió en ${baseUrl}: ${lastError}\n${serverOutput.slice(-4_000)}`);
}

async function waitForResults(page: Page) {
  await page.waitForFunction(() => {
    const value = document.getElementById('count')?.textContent || '';
    return /\d[\d.,]*\s+resultados?/.test(value);
  }, undefined, { timeout: 30_000 });
  assert.ok(await page.locator('#grid article.card').count(), 'La grilla debe contener al menos un inmueble');
}

async function openIsolatedPage(options?: { mobile?: boolean }) {
  const context = await browser.newContext(options?.mobile
    ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 }
    : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  return {
    context,
    page,
    assertClean() {
      assert.deepEqual(pageErrors, [], `Errores JavaScript en la página: ${pageErrors.join(' | ')}`);
      assert.deepEqual(consoleErrors, [], `Errores en consola: ${consoleErrors.join(' | ')}`);
    },
  };
}

before(async () => {
  await mkdir(screenshotsDir, { recursive: true });

  if (!externalBaseUrl) {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server = child;
    const rememberOutput = (chunk: Buffer) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-12_000);
    };
    child.stdout.on('data', rememberOutput);
    child.stderr.on('data', rememberOutput);
    child.on('exit', (code, signal) => {
      if (code && code !== 0) serverOutput += `\nServidor finalizó con código ${code} (${signal || 'sin señal'}).`;
    });
  }

  await waitForHealth();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      server?.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
});

describe('Radar de Oportunidades · recorridos críticos', { concurrency: 1 }, () => {
  test('carga el dashboard y expone APIs/configuración sanas', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      const health = await page.request.get(`${baseUrl}/health`);
      assert.equal(health.status(), 200);

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await waitForResults(page);

      await page.getByRole('heading', { name: /Radar de Oportunidades Inmobiliarias/i }).waitFor();
      assert.equal(await page.locator('#tabs .tab-btn[aria-current="page"]').getAttribute('data-tab'), 'portal');

      const config = await page.evaluate(async () => {
        const response = await fetch('/api/config');
        return response.json();
      });
      assert.match(config.supabaseUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co$/i);

      await page.screenshot({ path: `${screenshotsDir}/01-dashboard-desktop.png`, fullPage: true });
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('navega entre Bancos y Remates con filtros coherentes', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await waitForResults(page);

      await page.locator('button[data-tab="bancos"]').click();
      await page.waitForFunction(() => document.querySelector('button[data-tab="bancos"]')?.getAttribute('aria-current') === 'page');
      await waitForResults(page);
      assert.equal(await page.locator('#filters').getByText('Estrato', { exact: true }).count(), 0);
      await page.screenshot({ path: `${screenshotsDir}/02-bancos-desktop.png`, fullPage: true });

      await page.locator('button[data-tab="remates"]').click();
      await page.waitForFunction(() => document.querySelector('button[data-tab="remates"]')?.getAttribute('aria-current') === 'page');
      await waitForResults(page);
      assert.ok((await page.locator('#count').textContent())?.includes('resultado'));
      await page.screenshot({ path: `${screenshotsDir}/03-remates-desktop.png`, fullPage: true });
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('guarda un inmueble anónimo, persiste y lo muestra en Guardados', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await waitForResults(page);

      const firstFavorite = page.locator('#grid article.card').first().getByRole('button', { name: 'Guardar inmueble' });
      await firstFavorite.click();
      await page.waitForFunction(() => document.getElementById('c-guardados')?.textContent === '1');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForResults(page);
      assert.equal(await page.locator('#c-guardados').textContent(), '1');

      await page.locator('button[data-tab="guardados"]').click();
      await page.waitForFunction(() => document.getElementById('count')?.textContent?.includes('1 guardado'));
      assert.equal(await page.locator('#grid article.card').count(), 1);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('mantiene las reglas correctas de registro, login y Google OAuth', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });

      const password = page.locator('#password');
      assert.equal(await password.getAttribute('minlength'), '8');
      assert.equal(await password.getAttribute('autocomplete'), 'new-password');
      await page.getByRole('tab', { name: 'Iniciar sesión' }).click();
      assert.equal(await password.getAttribute('minlength'), null);
      assert.equal(await password.getAttribute('autocomplete'), 'current-password');

      const googleButton = page.getByRole('button', { name: 'Continuar con Google' });
      assert.equal(await googleButton.isEnabled(), true);
      await page.screenshot({ path: `${screenshotsDir}/04-login-desktop.png`, fullPage: true });
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('expone la base comercial de Fase 2 sin fingir cobros ni permisos', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      const plansApi = await page.request.get(`${baseUrl}/api/plans`);
      assert.equal(plansApi.status(), 200);
      const plans = (await plansApi.json()).plans;
      assert.deepEqual(plans.map((plan: { code: string }) => plan.code), ['free', 'pro']);
      assert.equal(plans[1].priceMonthlyCop, null);

      const accountApi = await page.request.get(`${baseUrl}/api/account`);
      assert.equal(accountApi.status(), 401);
      const csvExport = await page.request.get(`${baseUrl}/api/account/export.csv`);
      assert.equal(csvExport.status(), 401);
      const adminApi = await page.request.get(`${baseUrl}/api/admin/summary`);
      assert.equal(adminApi.status(), 401);
      const commercialQueue = await page.request.get(`${baseUrl}/api/admin/plan-interests`);
      assert.equal(commercialQueue.status(), 401);
      const subscriptionMutation = await page.request.patch(
        `${baseUrl}/api/admin/subscriptions/00000000-0000-4000-8000-000000000000`,
        { data: { status: 'active', note: 'prueba no autorizada' } },
      );
      assert.equal(subscriptionMutation.status(), 401);
      const alertDispatch = await page.request.post(`${baseUrl}/api/internal/alerts/run`);
      assert.equal(alertDispatch.status(), 503);
      assert.equal((await alertDispatch.json()).configured, false);

      await page.goto(`${baseUrl}/planes`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Elige cuánto quieres profundizar' }).waitFor();
      await page.getByText('Por definir').waitFor();
      assert.equal(await page.getByText('No se realizará ningún cargo desde esta versión.').count(), 1);

      await page.goto(`${baseUrl}/cuenta`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Inicia sesión para continuar' }).waitFor();
      assert.equal(await page.locator('#export-csv-link').getAttribute('href'), '/api/account/export.csv');

      await page.goto(`${baseUrl}/comparador`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/login$/);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('ofrece navegación y filtros utilizables en móvil', async () => {
    const { context, page, assertClean } = await openIsolatedPage({ mobile: true });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await waitForResults(page);

      for (const tab of ['portal', 'bancos', 'remates', 'guardados']) {
        await page.locator(`button[data-tab="${tab}"]`).waitFor({ state: 'visible' });
      }

      const filtersToggle = page.locator('#filters-toggle');
      await filtersToggle.click();
      assert.equal(await filtersToggle.getAttribute('aria-expanded'), 'true');
      await page.locator('#filters-panel select').first().waitFor({ state: 'visible' });
      await page.screenshot({ path: `${screenshotsDir}/05-dashboard-mobile.png`, fullPage: true });
      assertClean();
    } finally {
      await context.close();
    }
  });
});

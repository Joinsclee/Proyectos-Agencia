import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

const port = Number(process.env.E2E_LAYOUT_PORT || 8791);
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, '');
const baseUrl = externalBaseUrl || `http://127.0.0.1:${port}`;
let browser: Browser;
let server: ChildProcess | undefined;

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // El servidor todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('El servidor de la prueba de layout no respondió');
}

before(async () => {
  if (!externalBaseUrl) {
    server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
    });
  }
  await waitForHealth();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server && !server.killed) server.kill('SIGTERM');
});

test('organiza los filtros en una columna lateral y los oculta en Guardados', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // El tutorial de bienvenida tapa la portada en la primera visita; estas pruebas
  // miden la disposición de filtros y resultados, no el tutorial.
  await context.addInitScript(() => {
    try { localStorage.setItem('radar_onboarding_v1', '1'); } catch { /* modo privado */ }
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /\d[\d.,]*\s+resultados?/.test(document.getElementById('count')?.textContent || ''));

  const filtersBox = await page.locator('.controls').boundingBox();
  const resultsBox = await page.locator('#results').boundingBox();
  assert.ok(filtersBox && resultsBox);
  assert.ok(filtersBox.x < resultsBox.x, 'Los filtros deben quedar a la izquierda de los resultados');
  assert.ok(filtersBox.width < resultsBox.width, 'El panel lateral no debe competir con la grilla');

  await page.locator('button[data-tab="guardados"]').click();
  await page.waitForFunction(() => document.querySelector('.controls')?.hasAttribute('hidden'));
  assert.equal(await page.locator('.controls').isVisible(), false);

  await context.close();
});

test('mantiene los filtros como panel desplegable en móvil', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  // El tutorial de bienvenida tapa la portada en la primera visita; estas pruebas
  // miden la disposición de filtros y resultados, no el tutorial.
  await context.addInitScript(() => {
    try { localStorage.setItem('radar_onboarding_v1', '1'); } catch { /* modo privado */ }
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /\d[\d.,]*\s+resultados?/.test(document.getElementById('count')?.textContent || ''));

  const toggle = page.locator('#filters-toggle');
  assert.equal(await toggle.isVisible(), true);
  assert.equal(await page.locator('#filters-panel').isVisible(), false);
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#filters-panel').isVisible(), true);

  await context.close();
});

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

/**
 * La portada es ahora la primera pantalla: al entrar no hay listado que esperar.
 * Los recorridos que prueban el BUSCADOR se van a su pestaña con `irAPestana`;
 * los que solo necesitan que la página haya terminado de cargar esperan aquí.
 */
async function esperarPortada(page: Page) {
  await page.locator('#home .home-bloque .top-item').first().waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => document.getElementById('home')?.getAttribute('aria-busy') !== 'true',
    undefined,
    { timeout: 30_000 },
  );
}

/** Cambia de pestaña y espera a que quede seleccionada, sin adivinar tiempos. */
async function irAPestana(page: Page, pestana: string) {
  await page.locator(`button[data-tab="${pestana}"]`).click();
  await page.waitForFunction(
    (destino) => document.querySelector(`button[data-tab="${destino}"]`)?.getAttribute('aria-current') === 'page',
    pestana,
    { timeout: 30_000 },
  );
}

async function openIsolatedPage(options?: { mobile?: boolean; conOnboarding?: boolean }) {
  const context = await browser.newContext(options?.mobile
    ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 }
    : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  // El tutorial de bienvenida se abre sobre la portada en la primera visita y
  // tapa todo lo demás, que es justo lo que debe hacer con una persona. Los
  // recorridos que prueban OTRA cosa parten de una sesión que ya lo vio; el que
  // lo prueba a él pide `conOnboarding`.
  if (!options?.conOnboarding) {
    await context.addInitScript(() => {
      try { localStorage.setItem('radar_onboarding_v1', '1'); } catch { /* modo privado */ }
    });
  }
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

/**
 * Fija si el listado llega bloqueado o abierto, conservando el resto de la
 * respuesta real. Qué fichas concretas bloquea el muro depende del inventario del
 * día; una prueba que dependa de eso falla los días en que la portada trae otra
 * mezcla, sin que nada se haya roto.
 */
/**
 * Fuerza el estado de acceso de las fichas, para probar la interfaz sin depender
 * de qué haya bloqueado hoy el inventario.
 *
 * Intercepta DOS rutas, y esa es la parte importante: el listado y la ficha
 * individual. Desde que se corrigió el muro, abrir una tarjeta ya no dibuja la
 * fila que el navegador tenía —eso era justo el fallo que dejaba el plan gratuito
 * inalcanzable— sino que la pide a `/api/property`. Interceptar solo el listado
 * dejaba el modal mostrando el veredicto real del servidor y contradiciendo lo
 * que la prueba acababa de forzar.
 */
async function forzarBloqueoDelListado(page: Page, bloqueadas: boolean) {
  const acceso = bloqueadas
    ? { completa: false, motivo: 'oportunidad', avisoRiesgo: false, requiere: 'registro' }
    : { completa: true, motivo: null, avisoRiesgo: false };
  const sellar = (fila: Record<string, unknown>) => ({
    ...fila,
    _bloqueada: bloqueadas || undefined,
    _acceso: acceso,
  });

  for (const patron of ['**/api/portal?*', '**/api/property?*']) {
    await page.unroute(patron).catch(() => {});
    await page.route(patron, async (route) => {
      const original = await route.fetch();
      const cuerpo = await original.json();
      if (Array.isArray(cuerpo.data)) cuerpo.data = cuerpo.data.map(sellar);
      else if (cuerpo.data && typeof cuerpo.data === 'object') cuerpo.data = sellar(cuerpo.data);
      // Se reconstruye la respuesta en vez de reusar la original: al cambiar el
      // cuerpo, las cabeceras de la original (largo y codificación) dejan de
      // describirlo y el navegador se queda esperando bytes que no llegan.
      await route.fulfill({
        status: original.status(),
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(cuerpo),
      });
    });
  }
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
    const exitedCleanly = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2_000);
      server?.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    assert.equal(exitedCleanly, true, 'El servidor debe cerrar antes del timeout de despliegue');
    assert.equal(server.exitCode, 0, `El cierre SIGTERM debe terminar con código 0.\n${serverOutput.slice(-2_000)}`);
  }
});

describe('Radar de Oportunidades · recorridos críticos', { concurrency: 1 }, () => {
  test('recibe al visitante nuevo con un recorrido guiado por la herramienta', async () => {
    // El recorrido ilumina elementos REALES y navega solo entre secciones: quien
    // lo sigue termina habiendo visitado el producto, no habiendo leído sobre él.
    // Lo que se prueba aquí es justo eso —que el foco se pega a algo que existe y
    // que el paseo cambia de pestaña— porque es lo que lo distingue de un modal.
    const { context, page, assertClean } = await openIsolatedPage({ conOnboarding: true });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const globo = page.locator('#tour-globo');
      const foco = page.locator('#tour-foco');
      await globo.waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(1_200);

      const pasos = await page.locator('.tour-puntos li').count();
      // Un visitante sin cuenta no ve los pasos de guardados ni personalización,
      // porque esas partes de la interfaz tampoco están para él.
      assert.ok(pasos >= 3 && pasos <= 8, `el recorrido debe tener entre 3 y 8 pasos, tiene ${pasos}`);

      // El primero es la bienvenida: no ilumina nada y el globo va centrado.
      assert.equal(await globo.evaluate((el) => el.classList.contains('es-centrado') || el.classList.contains('es-movil')), true);

      // A partir del segundo, el foco tiene que estar pegado a algo con tamaño.
      await page.locator('.tour-cta').click();
      // El resalte ANIMA su tamaño entre pasos, así que hay que esperar a que se
      // estabilice antes de medirlo: a mitad de la transición devuelve un valor
      // intermedio —se midió 84×10 en un fotograma— que no es el del elemento.
      await page.waitForFunction(
        () => {
          const el = document.getElementById('tour-foco');
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const previo = Number(el.dataset.medidoW || 0);
          el.dataset.medidoW = String(r.width);
          return r.width > 40 && r.height > 20 && Math.abs(r.width - previo) < 1;
        },
        undefined,
        { timeout: 15_000 },
      );
      const caja = await foco.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      assert.ok(caja.w > 40 && caja.h > 20, `el resalte debe cubrir un elemento real, mide ${caja.w}×${caja.h}`);

      // Atrás vuelve, y en el primer paso no se ofrece.
      await page.locator('.tour-atras').click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator('.tour-atras').count(), 0, 'en el primer paso no hay vuelta atrás');

      // El paseo cambia de sección por su cuenta: se avanza hasta el final y en
      // algún momento la pestaña activa deja de ser la portada.
      const visitadas = new Set<string>();
      for (let i = 1; i < pasos; i += 1) {
        await page.locator('.tour-cta').click();
        await page.waitForTimeout(4_000);
        const tab = await page.locator('#tabs .tab-btn[aria-current="page"]').getAttribute('data-tab');
        if (tab) visitadas.add(tab);
      }
      assert.ok(visitadas.size >= 2, `el recorrido debe pasear por varias secciones, visitó: ${[...visitadas].join(', ')}`);

      // Al terminar se retira entero: ni resalte ni globo ni scroll bloqueado.
      await page.locator('.tour-cta').click();
      await page.waitForTimeout(900);
      assert.equal(await globo.count(), 0, 'el globo debe retirarse al terminar');
      assert.equal(await foco.count(), 0, 'el resalte debe retirarse al terminar');
      assert.equal(await page.evaluate(() => document.body.classList.contains('tour-abierto')), false,
        'la página debe volver a poder desplazarse');

      // No reaparece: es una bienvenida, no un peaje.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await esperarPortada(page);
      await page.waitForTimeout(1_500);
      assert.equal(await globo.count(), 0, 'el recorrido no debe repetirse solo');

      // Pero tiene que poder recuperarse sin buscarlo.
      await page.locator('#ver-tutorial').click();
      await globo.waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('.tour-cerrar').click();
      await page.waitForTimeout(600);
      assert.equal(await globo.count(), 0);

      assertClean();
    } finally {
      await context.close();
    }
  });

  test('muestra skeletons geométricos y los retira al completar la carga', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      const demorar = async (route: import('playwright').Route) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.continue();
      };
      await page.route('**/api/home', demorar);
      await page.route('**/api/portal?*', demorar);

      // La portada carga primero: sus esqueletos son los mismos del listado, para
      // que la espera de la primera pantalla se sienta igual que la de una búsqueda.
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#home .skeleton-card').first().waitFor();
      assert.equal(await page.locator('#home').getAttribute('aria-busy'), 'true');
      await esperarPortada(page);
      assert.equal(await page.locator('#home .skeleton-card').count(), 0);
      assert.equal(await page.locator('#home').getAttribute('aria-busy'), null);

      await irAPestana(page, 'portal');
      await page.locator('#grid .skeleton-card').first().waitFor();
      assert.equal(await page.locator('#grid .skeleton-card').count(), 9);
      assert.equal(await page.locator('#grid').getAttribute('aria-busy'), 'true');
      assert.equal(await page.locator('#loading').getAttribute('role'), 'status');

      await waitForResults(page);
      assert.equal(await page.locator('#grid .skeleton-card').count(), 0);
      assert.equal(await page.locator('#grid').getAttribute('aria-busy'), null);
      assert.equal(await page.locator('#loading').isVisible(), false);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('abre en la portada con destacados explicados y detrás del muro', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await esperarPortada(page);

      // Es la primera pantalla: se entra por ella, no por el listado del portal.
      assert.equal(await page.locator('#tabs .tab-btn[aria-current="page"]').getAttribute('data-tab'), 'home');
      assert.equal(await page.locator('#search-workspace').isVisible(), false, 'el buscador no compite con la portada');

      const bloques = page.locator('#home .home-bloque');
      const cuantos = await bloques.count();
      assert.ok(cuantos >= 3, `la portada debe traer sus bloques de destacados, trajo ${cuantos}`);

      // Ningún bloque puede decir "destacados" a secas: cada uno publica su regla.
      for (let i = 0; i < cuantos; i += 1) {
        const criterio = (await bloques.nth(i).locator('.home-criterio').textContent()) ?? '';
        assert.ok(criterio.trim().length > 60, `el bloque ${i} no explica con qué criterio eligió`);
      }
      // Y cada fila dice por qué está ella, no solo el bloque.
      const fichas = await page.locator('#home .home-bloque .top-item').count();
      assert.equal(await page.locator('#home .top-motivo').count(), fichas);
      assert.match(
        (await page.locator('#home .top-motivo').first().textContent()) ?? '',
        /por debajo de/,
      );
      // Es un ranking: la posición tiene que estar numerada y empezar en 1.
      assert.equal((await page.locator('#home .top-pos').first().textContent())?.trim(), '1');
      // Un bloque por fuente, que es como el cliente describió el producto.
      const titulos = await page.locator('#home .home-bloque h3').allTextContents();
      for (const esperado of ['portal', 'banco', 'remate']) {
        assert.ok(
          titulos.some((t) => t.toLowerCase().includes(esperado)),
          `falta el bloque de ${esperado}; hay: ${titulos.join(' | ')}`,
        );
      }

      // El muro NO se salta en la portada: un anónimo recibe las fichas recortadas
      // desde el servidor, no tapadas con CSS. Ya hubo un incidente por esto.
      const respuesta = await page.request.get(`${baseUrl}/api/home`);
      assert.equal(respuesta.status(), 200);
      const portada = await respuesta.json();
      assert.equal(portada.plan, 'anonimo');
      const todas = portada.bloques.flatMap((b: any) => b.grupos.flatMap((g: any) => g.fichas));
      assert.ok(todas.length > 0, 'la portada llegó sin fichas');
      for (const ficha of todas) {
        assert.ok(ficha._acceso, `la ficha ${ficha.id} salió sin pasar por el control de acceso`);
        if (!ficha._acceso.completa) {
          assert.equal(ficha.address, null, `la ficha ${ficha.id} filtró su dirección`);
          assert.equal(ficha.source_url, null, `la ficha ${ficha.id} filtró el enlace a la fuente`);
        }
      }
      assert.ok(portada.bloqueo.bloqueadas > 0, 'un anónimo no debería poder abrirlo todo');
      await page.locator('#home-aviso .aviso-bloqueo').waitFor();

      // Una tarjeta de la portada abre la ficha PIDIÉNDOLA a `/api/property`: es la
      // ruta que aplica el plan y gasta el cupo del mes. Dibujarla con la fila
      // recortada que ya tiene el navegador saltaría las dos cosas.
      const [fichaPedida] = await Promise.all([
        page.waitForRequest((peticion) => peticion.url().includes('/api/property?kind=')),
        page.locator('#home .top-item .top-open').first().click(),
      ]);
      assert.ok(fichaPedida.url().includes('id='), 'la portada abrió la ficha sin pedirla por id');
      await page.locator('#modal.open').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#modal').waitFor({ state: 'hidden' });

      // Ir al buscador y volver no rompe nada.
      await irAPestana(page, 'portal');
      await waitForResults(page);
      assert.equal(await page.locator('#home').isVisible(), false);
      await irAPestana(page, 'home');
      await esperarPortada(page);
      assert.equal(await page.locator('#search-workspace').isVisible(), false);

      await page.screenshot({ path: `${screenshotsDir}/00-portada-destacados.png`, fullPage: true });
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('enseña un recorte de cada bloque y despliega el resto sin volver a la red', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await esperarPortada(page);

      // Se elige el primer bloque de UN SOLO grupo que tenga algo plegado. No se
      // fija cuál —los tamaños son decisión de producto y van a seguir moviéndose—
      // pero sí que sea de un grupo: en el bloque por ciudad las tarjetas de la
      // sección son la suma de varias filas y la cuenta no diría lo que parece.
      const respuesta = await (await page.request.get(`${baseUrl}/api/home`)).json();
      let indice = -1;
      let grupo: any = null;
      respuesta.bloques.forEach((b: any, i: number) => {
        if (indice >= 0 || b.grupos.length !== 1) return;
        if (b.grupos[0].fichas.length > b.grupos[0].preview) { indice = i; grupo = b.grupos[0]; }
      });
      assert.ok(grupo, 'ningún bloque de la portada tiene fichas plegadas que desplegar');

      const seccion = page.locator('#home .home-bloque').nth(indice);
      const tarjetas = seccion.locator('.top-item');
      assert.equal(await tarjetas.count(), grupo.preview,
        'la portada pintó de entrada algo distinto del recorte que mandó el servidor');

      // Expandir no puede costar una petición: las fichas ya llegaron —y ya pasaron
      // por el muro— en la respuesta de la portada. Una segunda ruta sería una
      // segunda oportunidad de olvidarse de aplicar el plan del usuario.
      const peticiones: string[] = [];
      const espia = (peticion: any) => {
        if (peticion.url().includes('/api/')) peticiones.push(peticion.url());
      };
      page.on('request', espia);

      const boton = seccion.locator('.home-mas-btn').first();
      assert.match((await boton.textContent()) ?? '', /Ver las \d+ restantes/);
      await boton.click();
      await tarjetas.nth(grupo.fichas.length - 1).waitFor();
      assert.equal(await tarjetas.count(), grupo.fichas.length);
      page.off('request', espia);
      assert.deepEqual(peticiones, [], `desplegar pidió a la red: ${peticiones.join(', ')}`);

      // Las que acaban de aparecer explican su porqué igual que las primeras: si el
      // motivo se pintara por índice sobre el grupo entero, las nuevas saldrían con
      // el texto de otra ficha o sin texto.
      assert.equal(await seccion.locator('.top-motivo').count(), grupo.fichas.length);
      assert.match((await seccion.locator('.top-motivo').last().textContent()) ?? '', /por debajo de/);

      // Y se puede volver a plegar.
      assert.match((await boton.textContent()) ?? '', /Ver solo las primeras/);
      await boton.click();
      await tarjetas.nth(grupo.preview).waitFor({ state: 'detached' });
      assert.equal(await tarjetas.count(), grupo.preview);

      assertClean();
    } finally {
      await context.close();
    }
  });

  test('ofrece los municipios del mismo mercado que la ciudad filtrada', async () => {
    // En Colombia el área metropolitana ES el mercado: quien busca en Medellín
    // compra en Envigado o Sabaneta sin pestañear. Un filtro por ciudad exacta le
    // esconde justo la mitad de su mercado, que suele ser donde está el precio.
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await esperarPortada(page);
      await irAPestana(page, 'portal');
      await waitForResults(page);

      // Sin ciudad no se ofrece nada: no hay mercado del que hablar.
      assert.equal(await page.locator('#vecinas .vecina').count(), 0);

      const ciudad = page.locator('#f-city');
      if (!(await ciudad.locator('option[value="medellin"]').count())) return; // sin inventario hoy
      await ciudad.selectOption('medellin');
      await waitForResults(page);

      const vecinas = (await page.locator('#vecinas .vecina').allTextContents()).map((t) => t.trim().toLowerCase());
      assert.ok(vecinas.length > 0, 'Medellín debería ofrecer municipios del Valle de Aburrá');
      assert.ok(
        vecinas.some((v) => ['envigado', 'sabaneta', 'bello', 'itagui', 'la estrella'].includes(v)),
        `las vecinas ofrecidas no son del Valle de Aburrá: ${vecinas.join(', ')}`,
      );
      // Y nunca se ofrece a sí misma: sería un clic que no lleva a ninguna parte.
      assert.ok(!vecinas.includes('medellin'), 'se ofreció la propia ciudad filtrada');

      // Pulsar una vecina cambia el filtro de verdad y trae SUS resultados.
      const destino = vecinas[0];
      await page.locator('#vecinas .vecina').first().click();
      await waitForResults(page);
      assert.equal(await ciudad.inputValue(), destino, 'el clic no movió el filtro de ciudad');

      assertClean();
    } finally {
      await context.close();
    }
  });

  test('carga el dashboard y expone APIs/configuración sanas', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      const health = await page.request.get(`${baseUrl}/health`);
      assert.equal(health.status(), 200);
      const healthBody = await health.json();
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.status, 'alive');
      assert.equal(typeof healthBody.uptime_s, 'number');

      const readiness = await page.request.get(`${baseUrl}/ready`);
      assert.equal(readiness.status(), 200);
      const readinessBody = await readiness.json();
      assert.equal(readinessBody.ok, true);
      assert.equal(readinessBody.status, 'ready');
      assert.equal(typeof readinessBody.uptime_s, 'number');

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await esperarPortada(page);
      await irAPestana(page, 'portal');
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
      await esperarPortada(page);

      await irAPestana(page, 'bancos');
      await waitForResults(page);
      assert.equal(await page.locator('#filters').getByText('Estrato', { exact: true }).count(), 0);
      await page.screenshot({ path: `${screenshotsDir}/02-bancos-desktop.png`, fullPage: true });

      await irAPestana(page, 'remates');
      await waitForResults(page);
      assert.ok((await page.locator('#count').textContent())?.includes('resultado'));
      await page.screenshot({ path: `${screenshotsDir}/03-remates-desktop.png`, fullPage: true });
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('muestra el canon estimado y recalcula la rentabilidad con comparables de arriendo', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.route('**/api/rental-market?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            rental_market: {
              available: true,
              reason: 'ok',
              city: 'medellin',
              type: 'apartment',
              scope: 'zona',
              scope_label: 'barrio Laureles',
              radius_km: null,
              criteria: ['mismo tipo de inmueble', 'mismo barrio (Laureles)', 'área similar (±25% de 82 m²)'],
              n: 14,
              n_rent_per_m2: 12,
              median_monthly_rent: 4_850_000,
              p25_monthly_rent: 4_200_000,
              p75_monthly_rent: 5_500_000,
              median_rent_per_m2: 59_146,
              spread: 0.22,
              confidence: 'high',
              sample: [],
            },
          }),
        });
      });

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await esperarPortada(page);
      await irAPestana(page, 'portal');
      await waitForResults(page);
      await page.locator('#grid article.card .card-open').first().click();

      const rentalPanel = page.locator('[data-rental-market]');
      await rentalPanel.getByText('Canon estimado de mercado').waitFor();
      assert.match(await rentalPanel.textContent() ?? '', /4[.\s]850[.\s]000\/mes/);
      assert.match(await page.locator('[data-rent]').inputValue(), /4[.\s]850[.\s]000/);
      assert.match(await page.locator('.rent-result').textContent() ?? '', /\d+[,.]\d+%/);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('ofrece el reporte descargable y al anónimo le pide cuenta en vez del archivo', async () => {
    // La lógica del cupo se prueba en `server/reporte.test.ts`; lo que no puede
    // comprobar una prueba pura es el cableado: que el bloque aparezca en la
    // ficha, que su objetivo táctil siga siendo de 44px y que al visitante se le
    // ofrezca la cuenta —que es lo que le falta— y no un botón que va a fallar.
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      // Se fuerza el estado de acceso de las fichas del listado: cuáles están
      // bloqueadas depende del inventario del día, y no es lo que se prueba aquí.
      await forzarBloqueoDelListado(page, false);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      // La app abre en la portada desde que existen los destacados: este recorrido
      // prueba el reporte desde una ficha del BUSCADOR, así que hay que ir allí.
      await esperarPortada(page);
      await irAPestana(page, 'portal');
      await waitForResults(page);
      await page.locator('#grid article.card .card-open').first().click();

      const cta = page.locator('.reporte-box .reporte-cta');
      await cta.waitFor();
      assert.equal(await cta.evaluate((el) => el.tagName), 'A', 'al anónimo se le ofrece un enlace, no un botón');
      assert.match(new URL(await cta.getAttribute('href') ?? '', baseUrl).pathname, /^\/login$/);
      const alto = await cta.evaluate((el) => el.getBoundingClientRect().height);
      assert.ok(alto >= 44, `El objetivo táctil debe ser de al menos 44px (medido: ${alto}px)`);
      assert.match(
        await page.locator('.reporte-box').textContent() ?? '',
        /20 reportes al mes/,
        'debe decir cuántos reportes trae el plan gratuito antes de registrarse',
      );

      // Y en una ficha bloqueada no se ofrece: el servidor rechazaría el reporte
      // y el muro de al lado ya explica qué falta.
      await page.locator('#modal-close').click();
      await forzarBloqueoDelListado(page, true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      // La recarga devuelve a la portada, igual que la primera visita.
      await esperarPortada(page);
      await irAPestana(page, 'portal');
      await waitForResults(page);
      await page.locator('#grid article.card .card-open').first().click();
      await page.locator('.muro-sus').waitFor();
      assert.equal(await page.locator('.reporte-box').count(), 0);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('a quien no tiene cuenta no se le ofrece guardar ni personalizar', async () => {
    // Decisión de producto: explorar es libre, pero guardados y personalización
    // necesitan cuenta para significar algo. Unos favoritos que viven en el
    // navegador se pierden al cambiar de dispositivo, y unas preferencias sin
    // cuenta no pueden alimentar las alertas por correo —no hay a quién
    // escribirle—. Ofrecerlos antes de tiempo promete una continuidad que el
    // producto no puede cumplir.
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await esperarPortada(page);

      assert.equal(
        await page.locator('button[data-tab="guardados"]').isVisible(),
        false,
        'la pestaña de Guardados no debe ofrecerse sin cuenta',
      );
      // El corazón se retira junto con la pestaña: dejar uno sin la otra sería
      // dar un botón de guardar que no lleva a ninguna parte.
      assert.equal(await page.locator('#home .fav-btn:visible').count(), 0);

      await irAPestana(page, 'portal');
      await waitForResults(page);
      assert.equal(await page.locator('#grid .fav-btn:visible').count(), 0);
      assert.equal(
        ((await page.locator('#radar-setup').textContent()) ?? '').trim(),
        '',
        'la personalización del Radar tampoco se ofrece sin cuenta',
      );

      // Y lo que SÍ puede hacer sigue intacto: explorar y filtrar.
      assert.ok(await page.locator('#grid article.card').count() > 0, 'debe poder explorar el listado');
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

  test('expone el checkout demo de Fase 2 sin abrir rutas protegidas', async () => {
    const { context, page, assertClean } = await openIsolatedPage();
    try {
      const plansApi = await page.request.get(`${baseUrl}/api/plans`);
      assert.equal(plansApi.status(), 200);
      const plans = (await plansApi.json()).plans;
      assert.deepEqual(plans.map((plan: { code: string }) => plan.code), ['free', 'pro']);
      assert.equal(plans[1].priceMonthlyCop, 49_900);
      assert.equal(plans[1].billingPeriodDays, 30);
      assert.equal(plans[1].renewalMode, 'manual');

      const accountApi = await page.request.get(`${baseUrl}/api/account`);
      assert.equal(accountApi.status(), 401);
      const csvExport = await page.request.get(`${baseUrl}/api/account/export.csv`);
      assert.equal(csvExport.status(), 401);
      const checkout = await page.request.post(`${baseUrl}/api/account/checkout`);
      assert.equal(checkout.status(), 401);
      const payment = await page.request.get(`${baseUrl}/api/account/payment?reference=RADAR-ABC123ABC123ABC123ABC123`);
      assert.equal(payment.status(), 401);
      const adminApi = await page.request.get(`${baseUrl}/api/admin/summary`);
      assert.equal(adminApi.status(), 401);
      const commercialQueue = await page.request.get(`${baseUrl}/api/admin/plan-interests`);
      assert.equal(commercialQueue.status(), 401);
      // Las oportunidades por zona son inventario agregado del negocio: sin
      // sesión no se asoman, igual que el resto del panel.
      const zoneStats = await page.request.get(`${baseUrl}/api/admin/oportunidades-por-zona`);
      assert.equal(zoneStats.status(), 401);
      // Las métricas de operación no traen datos personales, pero sí revelan
      // cómo y cuándo corre el sistema por dentro: van con el resto del panel.
      const operationMetrics = await page.request.get(`${baseUrl}/api/admin/metricas`);
      assert.equal(operationMetrics.status(), 401);
      // Los porcentajes de gastos se LEEN en público (`/api/config`), pero
      // escribirlos le cambia el número a todos los usuarios a la vez.
      const expenseWrite = await page.request.fetch(`${baseUrl}/api/admin/parametros-gastos`, {
        method: 'PUT',
        data: { notaria: 0.04, impuestoRegistro: 0.04, derechosRegistro: 0.02 },
      });
      assert.equal(expenseWrite.status(), 401);
      // Leerlos, en cambio, es público y NUNCA puede quedarse sin respuesta: si
      // la tabla no está aplicada el servidor degrada a los valores compilados,
      // y la calculadora de la ficha tiene que seguir teniendo tres porcentajes
      // utilizables. Un cero aquí sería una ficha que promete gastos gratis.
      const publicConfig = await (await page.request.get(`${baseUrl}/api/config`)).json();
      assert.ok(publicConfig.gastos, '/api/config debe publicar los porcentajes de gastos');
      assert.ok(
        ['base', 'valores-por-defecto'].includes(publicConfig.gastos.origen),
        `origen inesperado: ${publicConfig.gastos.origen}`,
      );
      for (const campo of ['notaria', 'impuestoRegistro', 'derechosRegistro'] as const) {
        const valor = publicConfig.gastos[campo];
        assert.ok(
          typeof valor === 'number' && valor > 0 && valor <= 0.05,
          `${campo} fuera de rango utilizable: ${valor}`,
        );
      }
      const subscriptionMutation = await page.request.patch(
        `${baseUrl}/api/admin/subscriptions/00000000-0000-4000-8000-000000000000`,
        { data: { status: 'active', note: 'prueba no autorizada' } },
      );
      assert.equal(subscriptionMutation.status(), 401);
      const alertDispatch = await page.request.post(`${baseUrl}/api/internal/alerts/run`);
      assert.ok(
        alertDispatch.status() === 401 || alertDispatch.status() === 503,
        `El despacho interno sin credencial debe fallar cerrado; recibió HTTP ${alertDispatch.status()}`,
      );
      const alertDispatchBody = await alertDispatch.json();
      assert.equal(alertDispatchBody.ok, false);
      if (alertDispatch.status() === 503) assert.equal(alertDispatchBody.configured, false);

      await page.goto(`${baseUrl}/planes`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Elige cuánto quieres profundizar' }).waitFor();
      await page.getByText('$49.900', { exact: false }).waitFor();
      // La insignia depende de qué puerta está abierta, y son tres estados
      // distintos que el cliente ve de forma distinta: «Wompi Sandbox» con la
      // pasarela de prueba conectada, «Piloto Pro» cuando el modo demostración
      // regala el acceso, y «Próximamente» cuando no hay ninguna de las dos —que
      // es el estado con el que se sale, por decisión de la reunión del 28-jul:
      // generar expectativa y quedarse con los datos de quien la pide.
      const insignia = (await page.locator('.plan-badge').first().textContent())?.trim();
      assert.ok(
        ['Wompi Sandbox', 'Piloto Pro', 'Próximamente'].includes(insignia ?? ''),
        `insignia inesperada en el plan de pago: ${insignia}`,
      );
      assert.equal(await page.getByText('sin cobros automáticos', { exact: false }).count() >= 1, true);
      await page.screenshot({ path: `${screenshotsDir}/06-planes-wompi-demo.png`, fullPage: true });

      await page.goto(`${baseUrl}/pago?reference=RADAR-ABC123ABC123ABC123ABC123`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Inicia sesión para consultar el pago' }).waitFor();
      assert.equal(await page.getByText('Wompi Sandbox · entorno de prueba').count(), 1);
      await page.screenshot({ path: `${screenshotsDir}/07-pago-demo-signed-out.png`, fullPage: true });

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
      await esperarPortada(page);

      // Sin 'guardados': esa pestaña solo existe con cuenta, y este recorrido es
      // el de un visitante anónimo en móvil.
      for (const tab of ['home', 'portal', 'bancos', 'remates']) {
        await page.locator(`button[data-tab="${tab}"]`).waitFor({ state: 'visible' });
      }
      // La barra inferior sigue siendo UNA fila con la pestaña nueva dentro: si se
      // partiera en dos, el pulgar taparía media pantalla de resultados.
      const filas = await page.evaluate(() => new Set(
        Array.from(document.querySelectorAll('.tabs-inner button, .tabs-inner a'))
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => Math.round(el.getBoundingClientRect().y)),
      ).size);
      assert.equal(filas, 1, 'la navegación móvil se partió en varias filas');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        true,
        'la portada desborda horizontalmente en 375px',
      );

      await irAPestana(page, 'portal');
      await waitForResults(page);
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

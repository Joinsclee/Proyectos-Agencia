// Test rápido del tracker: crear hábito, intentar marcar día, ver qué pasa
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text());
  });

  await page.goto('http://localhost:8765/tracker.html');
  await page.waitForLoadState('networkidle');

  // ¿Hay hábitos?
  const hasHabits = await page.evaluate(() => {
    const list = document.querySelector('ul li');
    return !!list;
  });
  console.log('¿Tiene hábitos al cargar?', hasHabits);

  if (!hasHabits) {
    console.log('Agregando hábito...');
    await page.click('button:has-text("Agregar mi primer hábito")');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="caminar"]', 'Caminar 10 minutos');
    await page.click('button:has-text("Crear hábito")');
    await page.waitForTimeout(500);
  }

  // Verificar que hay un SVG con cells
  const cellCount = await page.locator('path.tracker-cell').count();
  console.log('Cells SVG renderizadas:', cellCount);

  // Verificar estado seleccionado
  const estado = await page.evaluate(() => {
    const root = document.querySelector('[x-data]');
    return root && root._x_dataStack ? root._x_dataStack[0].estadoSeleccionado : 'no-encontrado';
  });
  console.log('Estado seleccionado:', estado);

  // Intentar click en el día 5
  const day5Selector = 'path.tracker-cell:nth-of-type(5)';
  const day5Exists = await page.locator(day5Selector).count();
  console.log('Day 5 selector existe:', day5Exists);

  // Mejor: click en el primer cell
  await page.locator('path.tracker-cell').first().click({ force: true });
  await page.waitForTimeout(400);

  // Verificar si el cell cambió de clase
  const firstCellClass = await page.locator('path.tracker-cell').first().getAttribute('class');
  console.log('Primer cell después del click:', firstCellClass);

  // Verificar el estado del tracker en memoria
  const trackerState = await page.evaluate(() => {
    const root = document.querySelector('[x-data]');
    if (!root || !root._x_dataStack) return 'no-state';
    return JSON.stringify(root._x_dataStack[0].tracker.registros, null, 2);
  });
  console.log('Estado de registros:', trackerState);

  // Verificar localStorage
  const stored = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('mis_pliegues'));
    return keys.map(k => ({ key: k, value: localStorage.getItem(k) }));
  });
  console.log('localStorage:', JSON.stringify(stored, null, 2));

  // Tomar screenshot
  await page.screenshot({ path: '/tmp/tracker-after-click.png', fullPage: true });
  console.log('Screenshot: /tmp/tracker-after-click.png');

  if (errors.length) {
    console.log('\n=== ERRORES ===');
    errors.forEach(e => console.log(e));
  } else {
    console.log('\n(Sin errores en consola)');
  }

  await browser.close();
})();

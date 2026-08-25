import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const readProjectFile = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('usa el subconjunto local de Reicon sin emojis dependientes del sistema', async () => {
  const [html, app, styles, paymentHtml, paymentJs, paymentStyles, notices] = await Promise.all([
    readProjectFile('server/public/index.html'),
    readProjectFile('server/public/app.js'),
    readProjectFile('server/public/styles.css'),
    readProjectFile('server/public/pago.html'),
    readProjectFile('server/public/pago.js'),
    readProjectFile('server/public/portal.css'),
    readProjectFile('THIRD_PARTY_NOTICES.md'),
  ]);

  for (const symbol of ['i-check-circle', 'i-alert-triangle', 'i-magnifier']) {
    assert.match(html, new RegExp(`<symbol id="${symbol}"`));
  }

  assert.match(styles, /\.ic-reicon\s*\{/);
  assert.match(app, /emptyState\('alert-triangle'/);
  assert.doesNotMatch(app, /[✅⚠️🔎🟢🟡🟠]/u);
  assert.match(paymentHtml, /payment-spinner/);
  assert.match(paymentJs, /PAYMENT_ICONS/);
  assert.doesNotMatch(paymentJs, /icon\.textContent/);
  assert.match(paymentStyles, /@keyframes payment-spin/);
  assert.match(notices, /Reicon 1\.1\.103/);
  assert.match(notices, /MIT License/);
});

test('el botón de comunidad no se pinta si no hay comunidad a la que ir', async () => {
  const [html, css, app, index] = await Promise.all([
    readProjectFile('server/public/index.html'),
    readProjectFile('server/public/styles.css'),
    readProjectFile('server/public/app.js'),
    readProjectFile('server/index.ts'),
  ]);

  assert.match(html, /<symbol id="i-comunidad"/, 'el icono tiene que existir en el sprite');
  // Nace oculto y solo lo enciende la configuración. Un icono que lleva a `#`
  // es peor que no tener icono.
  assert.match(html, /id="comunidad-link"[\s\S]{0,400}?hidden/, 'el botón nace oculto');
  assert.match(app, /c\.comunidadUrl/, 'quien lo enciende es /api/config, no el HTML');
  assert.match(index, /comunidadUrl: env\.RADAR_COMUNIDAD_URL/, 'la URL viene del entorno');

  // Y la regla que hace que «oculto» signifique oculto.
  //
  // `.auth-icono` declara `display: inline-flex`, que GANA al `display: none` que
  // el navegador aplica por defecto a [hidden]. Sin la regla de abajo el botón se
  // vería igual, apuntando a `#`. Es el mismo caso que `.asis-btn[hidden]`, que
  // ya mordió una vez: allí el asistente se le aparecía a los visitantes anónimos.
  assert.match(css, /\.auth-icono\[hidden\]\s*\{\s*display:\s*none/, 'sin esto, [hidden] no oculta nada');

  // Los dos logotipos llevan al inicio.
  assert.match(html, /<a class="cuenta-marca" href="\/"/, 'pulsar el logotipo tiene que llevar al inicio');
});

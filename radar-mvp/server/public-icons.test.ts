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

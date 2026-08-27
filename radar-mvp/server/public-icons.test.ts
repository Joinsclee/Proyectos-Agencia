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

test('los acuerdos de la reunión que se pierden sin hacer ruido', async () => {
  const [html, css, app] = await Promise.all([
    readProjectFile('server/public/index.html'),
    readProjectFile('server/public/styles.css'),
    readProjectFile('server/public/app.js'),
  ]);

  // ── El sello de beta ──
  // «Es importante porque eso nos valida los posibles detalles que surjan.» Un
  // fallo bajo un sello de beta es algo esperado; el mismo fallo sin él es una
  // decepción, y quien se decepciona se va callado en vez de reportarlo.
  assert.match(html, /class="sello-beta"/, 'el sello de beta se pidió en la reunión');
  assert.ok(
    html.indexOf('sello-beta') > html.indexOf('cuenta-marca'),
    'va pegado al nombre del producto, no flotando en una esquina',
  );

  // ── «Aprende con Andrés Giraldo» ──
  // El logotipo del socio hace de botón, y por eso tuvo que salir de la esquina
  // superior izquierda: ahí todo el mundo espera que un clic devuelva al inicio.
  assert.match(html, /id="aprende-btn"/);
  assert.ok(
    html.indexOf('aprende-btn') > html.indexOf('id="nav-right"'),
    'el logotipo del socio va en la barra derecha; la esquina izquierda es del producto',
  );
  assert.match(html, /class="aprende-eyebrow"/, '«Aprende con» es lo que convierte una firma en una invitación');
  assert.doesNotMatch(
    css,
    /\.aprende-eyebrow\s*\{\s*display:\s*none/,
    'sin el rótulo el botón dice solo «Andrés Giraldo», que no se lee como algo que se pulsa',
  );
  // Y la regla que hace que «oculto» signifique oculto: `.menu-cuenta` declara
  // `position: relative` con display por defecto, pero el botón entero nace
  // `hidden` hasta que haya un destino. Es el mismo caso de `.auth-icono[hidden]`
  // y `.asis-btn[hidden]`, que ya mordió dos veces.
  assert.match(css, /\.menu-cuenta\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(app, /montarMenuDeFormacion/, 'lo enciende /api/config, no el HTML');

  // ── El copy que Andrés pidió cambiar ──
  // «Mediana» es palabra de estadístico, y es la cifra contra la que se mide
  // todo: si esa no se entiende, no se entiende ni el porcentaje ni las
  // estrellas. La mediana se sigue calculando; cambia cómo se llama en pantalla.
  const visibles = app
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  assert.doesNotMatch(visibles, /[Mm]ediana/, 'no puede quedar ninguna «mediana» a la vista del usuario');
  assert.match(app, /Precio por m² de este inmueble/, '«Este inmueble» no decía de qué cifra hablaba');
  assert.match(app, /Precio medio de comparables/);
});

test('los dos desplegables de la barra no pueden quedar abiertos a la vez', async () => {
  const app = await readProjectFile('server/public/app.js');
  const fn = app.slice(app.indexOf('function conectarDesplegable'));
  // Sin comentarios: el propio comentario que explica por qué no hay
  // `stopPropagation` contiene la palabra, y sin esto la prueba se caza a sí
  // misma. El guardián tiene que mirar el código, no la prosa que lo justifica.
  const cuerpo = fn
    .slice(0, fn.indexOf('\n}\n') + 2)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  // La mecánica llevaba `stopPropagation` en el botón, y funcionaba mientras hubo
  // UN solo desplegable. Con dos —cuenta y formación— el clic sobre el botón de
  // uno dejaba de llegar a `document`, así que el oyente del otro no se enteraba
  // y su panel se quedaba abierto: los dos desplegados a la vez, solapándose.
  assert.doesNotMatch(
    cuerpo,
    /stopPropagation/,
    'con dos desplegables, cortar la propagación deja el otro abierto',
  );
  // Lo que lo sustituye: cada panel se cierra salvo que el clic sea dentro de él
  // o sobre su propio botón. El botón se excluye porque su oyente ya corrió —los
  // eventos burbujean de dentro afuera— y cerrar aquí desharía la apertura.
  assert.match(cuerpo, /panel\.contains\(e\.target\) \|\| btn\.contains\(e\.target\)/);

  // Y que de verdad haya DOS usándola, que es lo que hace que esto importe.
  assert.match(app, /conectarDesplegable\(\$\('auth-menu-btn'\), \$\('auth-menu'\)\)/);
  assert.match(app, /conectarDesplegable\(btn, panel\)/);
});

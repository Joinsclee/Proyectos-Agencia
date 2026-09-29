/**
 * Dos fallos que salieron de la misma raíz: un error que nadie tradujo.
 *
 * Uno tumbaba el contenedor y el otro publicaba el estado de la factura, y los
 * dos llevaban meses en producción sin que ninguna prueba los mirara.
 *
 *  1. `new URL(req.url)` estaba FUERA del `try` del handler. `GET //[` es una
 *     ruta que el analizador HTTP de Node acepta y que `URL` rechaza con
 *     `ERR_INVALID_URL`; al estar en el cuerpo de una función `async` sin try,
 *     el error se vuelve un rechazo sin capturar, y Node 20 los trata como
 *     fatales. Reproducido en un servidor aislado con la misma estructura:
 *     proceso terminado con código 1 en la PRIMERA petición. Una sola línea de
 *     `curl` dejaba el Radar sin servicio para todo el mundo.
 *
 *  2. El `catch` del análisis devolvía `e.message` al navegador. Con la cuenta
 *     de OpenAI sin saldo, la ficha mostraba a cualquiera que pulsara el botón
 *     el cuerpo del 429 entero: «You have no credits remaining. Add credits to
 *     continue using the API at https://platform.openai.com/settings/...». Al
 *     usuario no le sirve de nada y de paso cuenta cómo está montado el
 *     servicio y cómo está la factura.
 *
 * Las dos comprobaciones son de código, no de red: el fallo 1 solo se manifiesta
 * con una petición malformada que ninguna prueba de integración enviaría, y el 2
 * solo cuando el proveedor falla, que es justo cuando nadie está mirando.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

test('el parseo de la URL no puede quedar fuera de un try', async () => {
  const index = await leer('server/index.ts');
  const desde = index.indexOf('const server = createServer(');
  assert.ok(desde > 0, 'no se encuentra el handler');
  // La cabecera del handler: de `createServer(` al primer `try {`.
  const cabecera = index.slice(desde, index.indexOf('try {', desde));
  assert.ok(
    !/new URL\(/.test(cabecera),
    'hay un `new URL(...)` antes del primer `try` del handler. Con `GET //[` eso mata '
      + 'el proceso: el rechazo sin capturar es fatal en Node 20.',
  );
  // Y donde sí está, tiene que tener su propia salida por 400.
  assert.match(
    index.slice(desde, desde + 2_000),
    /catch \{[\s\S]*?sendJSON\(res, 400/,
    'el parseo de la URL necesita su propio catch que responda 400',
  );
});

test('el servidor sobrevive a una promesa rechazada en segundo plano', async () => {
  const index = await leer('server/index.ts');
  // El arranque lanza precalentamientos, y los baseline de comparables se
  // refrescan solos. Cualquiera que rechace sin `catch` mata el proceso, y un
  // timeout al refrescar una caché no es motivo para dejar a nadie sin Radar.
  assert.match(
    index,
    /process\.on\('unhandledRejection'/,
    'falta la red de seguridad para promesas rechazadas en tareas de fondo',
  );
  // Registrarlo es obligatorio: si esto se traga en silencio, deja de ser una red
  // y pasa a ser un sitio donde esconder errores.
  const red = index.slice(index.indexOf("process.on('unhandledRejection'"));
  assert.match(red.slice(0, 400), /log\.error/, 'el rechazo tiene que quedar en el log');
});

test('el texto de error del proveedor de IA no llega al navegador', async () => {
  const analysis = await leer('server/analysis.ts');

  // `e.message` en la respuesta es exactamente lo que publicó el 429 de OpenAI.
  const fugas = analysis
    .split('\n')
    .map((linea, i) => [i + 1, linea] as const)
    .filter(([, l]) => /error:\s*e instanceof Error \? e\.message/.test(l))
    .map(([n, l]) => `analysis.ts:${n} ${l.trim().slice(0, 90)}`);
  assert.deepEqual(
    fugas,
    [],
    'el mensaje del proveedor viaja al usuario. Pasa por `avisoDeFalloIA`, que lo '
      + `registra en el log y devuelve un texto redactado:\n  ${fugas.join('\n  ')}`,
  );

  // Y el aviso que sí se muestra no puede nombrar al proveedor ni su facturación.
  const aviso = analysis.slice(analysis.indexOf('function avisoDeFalloIA'));
  const cuerpo = aviso.slice(0, aviso.indexOf('\n}\n'));
  for (const prohibido of ['OpenAI', 'credits', 'billing', 'http']) {
    assert.ok(
      !new RegExp(`return[\\s\\S]*?${prohibido}`, 'i').test(cuerpo.slice(cuerpo.indexOf('return'))),
      `el aviso al usuario menciona «${prohibido}»; el proveedor y su factura no son asunto suyo`,
    );
  }
  // El error real tiene que quedar registrado, o el arreglo se vuelve invisible.
  assert.match(cuerpo, /console\.error/, 'el error real tiene que ir al log del servidor');
});

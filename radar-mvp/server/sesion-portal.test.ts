/**
 * Las páginas del portal tienen que saber renovar la sesión.
 *
 * `app.js` lo hacía desde el principio; las otras cinco leían `radar_token` de
 * `localStorage` y lo mandaban tal cual. El efecto no se parecía a una sesión
 * caducada, y por eso pasó desapercibido: entrabas, usabas el Radar sin
 * problema, ibas a «Planes» y la barra te ofrecía «Ingresar». La sesión estaba
 * viva —el token de refresco seguía valiendo— pero esa página no sabía pedirlo y
 * trataba un 401 recuperable como «este visitante es anónimo».
 *
 * Es un fallo que solo aparece cuando el token de acceso caduca, así que no sale
 * en ninguna prueba manual: recién iniciada la sesión, todo funciona.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** Las páginas que viven fuera de `app.js` y hablan con la API con sesión. */
const PAGINAS = ['planes', 'cuenta', 'comparador', 'admin', 'pago'];

test('ninguna página del portal llama a la API sin poder renovar la sesión', async () => {
  for (const pagina of PAGINAS) {
    const js = await leer(`server/public/${pagina}.js`);
    const html = await leer(`server/public/${pagina}.html`);

    assert.ok(
      html.includes('/sesion.js'),
      `${pagina}.html no carga sesion.js, así que su script no puede renovar nada`,
    );
    // El orden importa: `sesion.js` define `window.RadarSesion` y son scripts
    // clásicos, no módulos. Cargado después, el de la página se ejecuta primero y
    // revienta en la primera llamada.
    assert.ok(
      html.indexOf('/sesion.js') < html.indexOf(`/${pagina}.js`),
      `${pagina}.html carga sesion.js DESPUÉS de ${pagina}.js`,
    );

    // Un `fetch(` suelto es una petición que no reintenta: si vuelve 401 con la
    // sesión todavía renovable, esa página se comporta como si nadie hubiera
    // iniciado sesión.
    const sueltas = js
      .split('\n')
      .map((linea, i) => [i + 1, linea] as const)
      .filter(([, linea]) => /(?<![.\w])fetch\(/.test(linea))
      .map(([n, linea]) => `${pagina}.js:${n} ${linea.trim().slice(0, 80)}`);
    assert.deepEqual(
      sueltas,
      [],
      `hay peticiones que no pasan por RadarSesion.fetch:\n  ${sueltas.join('\n  ')}`,
    );
  }
});

test('sesion.js renueva una sola vez y no se llama a sí misma', async () => {
  const js = await leer('server/public/sesion.js');

  // El token de refresco es de un solo uso. Sin serializar, al caducar fallan
  // todas las peticiones de la página a la vez y la segunda renovación llegaría
  // con uno ya gastado — cerrando de verdad la sesión que se quería salvar.
  assert.match(js, /if \(renovando\) return renovando/, 'la renovación tiene que ir serializada');

  // El propio refresco no puede ir por `pedir`: sería una recursión infinita en
  // cuanto el token de refresco dejara de valer.
  const refresco = js.slice(js.indexOf('async function renovar'), js.indexOf('async function pedir'));
  assert.ok(
    refresco.includes("await fetch('/api/auth/refresh'"),
    'el refresco se pide con `fetch` pelado, no a través de la propia envoltura',
  );

  // Si el refresco tampoco vale, las credenciales muertas se tiran: dejarlas
  // haría que cada página siguiente repitiera el mismo intento fallido.
  assert.match(js, /localStorage\.removeItem\('radar_refresh'\)/);
});

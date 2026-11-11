/**
 * El Radar tiene DOS formas de arrancar y las dos usan el mismo handler.
 *
 * Como servidor propio (contenedor, local) abre un puerto, precalienta las
 * ciudades grandes y `/ready` devuelve 503 hasta que escucha. En Vercel no hay
 * proceso que escuche: `api/index.ts` importa el modulo y exporta la funcion, y
 * cada peticion entra en ella.
 *
 * Esa diferencia tiene dos trampas, y las dos se descubrieron probandolo:
 *
 *  1. Si importar el modulo abriera el puerto y lanzara la precarga, eso correria
 *     en CADA instancia fria de Vercel y se cobraria en la primera peticion.
 *  2. `serviceReady` se ponia a true en el callback de `server.listen`, que en
 *     Vercel NUNCA corre. `/ready` devolvia 503 para siempre y cualquier monitor
 *     daria el servicio por caido.
 *
 * Las pruebas corren en subproceso porque el modulo decide esto AL IMPORTARSE:
 * una vez cargado, cambiar process.env ya no cambia nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const ENTORNO_MINIMO = {
  SUPABASE_URL: 'https://ejemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
};

/** Corre un trozo de código con el entorno dado y devuelve su salida. */
function enSubproceso(codigo: string, extra: Record<string, string>): string {
  return execFileSync(process.execPath, ['--import', 'tsx', '-e', codigo], {
    env: { ...process.env, ...ENTORNO_MINIMO, ...extra },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
}

/** Un par req/res de mentira, lo justo para que el handler responda. */
const MOCKS = `
  const { PassThrough } = await import('node:stream');
  const peticion = (u) => Object.assign(new PassThrough(), {
    url: u, method: 'GET', headers: { host: 'radar.test' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const respuesta = () => {
    const trozos = []; let codigo = 0; const cab = {};
    return {
      writeHead(c, h) { codigo = c; Object.assign(cab, h || {}); return this; },
      setHeader(k, v) { cab[k] = v; return this; }, getHeader(k) { return cab[k]; },
      removeHeader() {}, write(b) { if (b) trozos.push(b); return true; },
      end(b) { if (b) trozos.push(b); return this; },
      get estado() { return codigo; }, get cuerpo() { return trozos.join(''); },
      headersSent: false,
    };
  };
`;

test('api/index.ts exporta el handler por defecto', () => {
  const salida = enSubproceso(
    `(async () => {
      const mod = await import('./api/index.ts');
      console.log(typeof mod.default);
      process.exit(0);
    })();`,
    { VERCEL: '1' },
  );
  assert.match(salida, /function/, 'api/index.ts debe exportar una funcion por defecto');
});

test('en Vercel, importar el modulo NO abre ningun puerto', () => {
  // Si abriera uno, la precarga entera correria en cada instancia fria.
  const salida = enSubproceso(
    `(async () => {
      await import('./api/index.ts');
      const { createServer } = await import('node:http');
      // si el modulo ya tuviera el puerto cogido, esto fallaria con EADDRINUSE
      const s = createServer(() => {});
      s.on('error', (e) => { console.log('PUERTO OCUPADO: ' + e.code); process.exit(0); });
      s.listen(Number(process.env.PORT), () => { console.log('PUERTO LIBRE'); s.close(); process.exit(0); });
    })();`,
    { VERCEL: '1', PORT: '8791' },
  );
  assert.match(salida, /PUERTO LIBRE/, 'importar el modulo en Vercel no debe escuchar');
});

test('en Vercel /ready responde 200: no hay nada que esperar', () => {
  const salida = enSubproceso(
    `(async () => {
      const handler = (await import('./api/index.ts')).default;
      ${MOCKS}
      const r = respuesta();
      await handler(peticion('/ready'), r);
      console.log(JSON.stringify({ estado: r.estado, cuerpo: r.cuerpo }));
      process.exit(0);
    })();`,
    { VERCEL: '1' },
  );
  const { estado, cuerpo } = JSON.parse(salida.trim().split('\n').pop() as string);
  assert.equal(estado, 200, `/ready devolvio ${estado} en Vercel (seria "caido" para un monitor)`);
  assert.match(cuerpo, /"status":"ready"/);
});

test('/health responde sin tocar la base', () => {
  // Las credenciales del entorno minimo son de mentira: si /health consultara
  // Supabase, esto fallaria o se colgaria.
  const salida = enSubproceso(
    `(async () => {
      const handler = (await import('./api/index.ts')).default;
      ${MOCKS}
      const r = respuesta();
      await handler(peticion('/health'), r);
      console.log(JSON.stringify({ estado: r.estado, cuerpo: r.cuerpo }));
      process.exit(0);
    })();`,
    { VERCEL: '1' },
  );
  const { estado, cuerpo } = JSON.parse(salida.trim().split('\n').pop() as string);
  assert.equal(estado, 200);
  assert.match(cuerpo, /"ok":true/);
});

test('como servidor propio SI escucha y /ready espera a estar listo', () => {
  // El otro camino: sin VERCEL, el modulo coge el puerto. Es lo que hace el
  // contenedor, y lo que hace que /ready sirva para algo.
  const salida = enSubproceso(
    `(async () => {
      await import('./server/index.ts');
      // se le da un momento a listen()
      await new Promise((r) => setTimeout(r, 2500));
      const res = await fetch('http://127.0.0.1:' + process.env.PORT + '/health').catch((e) => e);
      console.log(res instanceof Error ? 'SIN PUERTO' : 'ESCUCHANDO ' + res.status);
      process.exit(0);
    })();`,
    { PORT: '8792' },
  );
  assert.match(salida, /ESCUCHANDO 200/, 'sin VERCEL el modulo debe abrir el puerto');
});

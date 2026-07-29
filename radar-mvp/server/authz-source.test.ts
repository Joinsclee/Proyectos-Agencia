/**
 * Guardia de código fuente contra la reintroducción de la escalada de privilegios.
 *
 * `server/account-metadata.ts` solo protege mientras TODOS los lectores pasen por
 * él. Basta con que alguien vuelva a escribir `isAdminMetadata(user.user_metadata)`
 * —que es como estaba hasta el 2026-07-27— para que cualquier usuario registrado
 * se ascienda otra vez a administrador, y ninguna prueba de comportamiento lo
 * notaría: el objeto tiene la misma forma y todo sigue compilando.
 *
 * Por eso la prueba mira el texto. Es tosca a propósito: falla ruidosamente en la
 * revisión, que es exactamente cuando hace falta.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** Lectores de autorización que NUNCA deben recibir `user_metadata` directamente. */
const LECTORES = [
  'isAdminMetadata',
  'entitledPlanFromMetadata',
  'commercialPlanFromMetadata',
  'subscriptionStatusFromMetadata',
];

test('autorización: ningún lector de permisos recibe user_metadata directamente', async () => {
  for (const ruta of ['server/account.ts', 'server/favorites.ts', 'server/index.ts']) {
    const fuente = await leer(ruta);
    for (const lector of LECTORES) {
      const patron = new RegExp(`${lector}\\(\\s*[\\w.]*\\.?user_metadata`);
      assert.doesNotMatch(
        fuente,
        patron,
        `${ruta}: ${lector}() no puede leer user_metadata — usa metadatosDeCuenta(user)`,
      );
    }
  }
});

/**
 * Guardias de administrador que hoy protegen el panel. Añadir un endpoint
 * administrativo obliga a tocar esta lista: es el recordatorio de que el guardia
 * se escribe SIEMPRE igual, y de que un endpoint nuevo sin él pasaría
 * desapercibido en la revisión.
 */
const GUARDIAS_ADMIN = 6; // resumen · zonas · métricas · parámetros de gastos · cola comercial · suscripción de terceros

test('autorización: todos los guardias de administrador separan la bolsa', async () => {
  // Cada uno recibe el `requester` recién leído de Supabase, así que es ahí
  // donde importa de qué bolsa sale el rol.
  const fuente = await leer('server/account.ts');
  const separados = fuente.match(/isAdminMetadata\(metadatosDeCuenta\(requester\)\)/g) ?? [];
  assert.equal(
    separados.length,
    GUARDIAS_ADMIN,
    `deben ser ${GUARDIAS_ADMIN} y todos con la bolsa separada`,
  );
  assert.doesNotMatch(
    fuente,
    /isAdminMetadata\(\s*requester/,
    'un guardia lee el requester sin separar la bolsa',
  );
  // Ninguna OTRA forma de llamarlo: además de los cuatro guardias solo se admite
  // `isAdminMetadata(metadata)`, donde `metadata` ya es la vista separada que
  // arma `publicAccount`. Cualquier argumento nuevo —empezando por
  // `user.user_metadata`— hace fallar esto en la revisión, que es cuando sirve.
  const ARGUMENTOS_PERMITIDOS = ['metadatosDeCuenta', 'metadata'];
  for (const [, argumento] of fuente.matchAll(/isAdminMetadata\(\s*([\w.]+)/g)) {
    assert.ok(
      ARGUMENTOS_PERMITIDOS.includes(argumento),
      `isAdminMetadata(${argumento}) no lee la bolsa separada`,
    );
  }
});

test('autorización: la sesión se construye desde la vista separada', async () => {
  // `getUserFromToken` es el camino que decide si se entregan las fichas de
  // oportunidad (`server/acceso.ts`). Es el más caro de equivocar.
  const fuente = await leer('server/favorites.ts');
  assert.match(fuente, /const metadata = metadatosDeCuenta\(data\.user\)/);
});

test('autorización: se escriben las dos bolsas al actualizar la cuenta', async () => {
  // Si `updateMetadata` volviera a escribir solo `user_metadata`, los permisos
  // que pusiera el servidor se perderían en silencio en la siguiente escritura.
  const fuente = await leer('server/account.ts');
  assert.match(fuente, /separarMetadatos\(/);
  assert.match(fuente, /user_metadata: userMetadata/);
  assert.match(fuente, /app_metadata: appMetadata/);
});

/**
 * Todo límite mensual tiene que vivir en `app_metadata`.
 *
 * `separarMetadatos` manda a `user_metadata` cualquier clave que no esté en
 * `CAMPOS_AUTORIZACION`, y esa bolsa la reescribe el titular con un
 * `PUT /auth/v1/user`. Así que olvidar un cupo en esa lista no da ningún error: el
 * contador simplemente pasa a ser editable por quien está limitado.
 *
 * Ya pasó con `assistant_quota` al añadir el asistente —el límite más caro de los
 * tres, porque cada consulta cuesta tokens—. Esta prueba busca las claves de cupo
 * en el código que las escribe y comprueba que estén declaradas.
 */
test('autorización: ningún cupo mensual se escribe fuera de app_metadata', async () => {
  const { CAMPOS_AUTORIZACION } = await import('./account-metadata.js');
  const declarados = new Set<string>(CAMPOS_AUTORIZACION);

  const account = await leer('server/account.ts');
  // Las asignaciones del tipo `metadata.<clave> = …` dentro de `updateMetadata`:
  // es el único camino por el que se escribe en la metadata de una cuenta.
  const escritas = [...account.matchAll(/metadata\.([a-z_]+)\s*=/g)].map((m) => m[1]);
  assert.ok(escritas.length >= 3, 'no se encontraron las escrituras de metadata; ¿cambió el patrón?');

  // Solo los límites. `name` o `preferences` se escriben igual y ahí SÍ deben ir a
  // `user_metadata`: son datos del usuario y cambiarlos es su derecho. Lo que no
  // puede tocar es cuánto le queda.
  const limites = escritas.filter((c) => /quota|limite|cupo|consultas/.test(c));
  assert.ok(limites.length >= 3, `se esperaban al menos tres cupos, se vieron: ${limites.join(', ') || 'ninguno'}`);

  for (const clave of limites) {
    assert.ok(
      declarados.has(clave),
      `«${clave}» se escribe en la metadata pero no está en CAMPOS_AUTORIZACION: `
      + 'acabaría en user_metadata, donde el usuario puede reescribirlo',
    );
  }
});

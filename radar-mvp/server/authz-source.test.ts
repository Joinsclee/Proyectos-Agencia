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

test('autorización: los tres guardias de administrador separan la bolsa', async () => {
  // Son los que protegen el panel: resumen, cola comercial y cambio de
  // suscripción de terceros. Cada uno recibe el `requester` recién leído de
  // Supabase, así que es ahí donde importa de qué bolsa sale el rol.
  const fuente = await leer('server/account.ts');
  const separados = fuente.match(/isAdminMetadata\(metadatosDeCuenta\(requester\)\)/g) ?? [];
  assert.equal(separados.length, 3, 'deben ser tres y los tres con la bolsa separada');
  assert.doesNotMatch(
    fuente,
    /isAdminMetadata\(\s*requester/,
    'un guardia lee el requester sin separar la bolsa',
  );
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

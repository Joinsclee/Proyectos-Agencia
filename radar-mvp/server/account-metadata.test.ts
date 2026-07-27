/**
 * Esta frontera es lo único que separa a un usuario registrado de ascenderse a
 * Pro —el contenido que se vende— o a administrador. Se prueba el caso hostil
 * primero: el usuario escribiendo a mano lo que no le corresponde.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMPOS_AUTORIZACION,
  metadatosDeCuenta,
  pareceIntentoDeAscenso,
  privilegiosEnBolsaDelUsuario,
  separarMetadatos,
} from './account-metadata.js';
import { entitledPlanFromMetadata, isAdminMetadata } from './commercial.js';

test('cuenta: un plan escrito por el usuario se ignora', () => {
  const vista = metadatosDeCuenta({
    user_metadata: { name: 'Ana', plan: 'pro', subscription_status: 'active' },
    app_metadata: { provider: 'email' },
  });
  assert.equal(vista.plan, undefined);
  assert.equal(vista.subscription_status, undefined);
  assert.equal(vista.name, 'Ana', 'lo que sí es suyo se conserva');
  assert.equal(entitledPlanFromMetadata(vista), 'free');
});

test('cuenta: un rol admin escrito por el usuario se ignora', () => {
  const vista = metadatosDeCuenta({
    user_metadata: { role: 'admin', is_admin: true },
    app_metadata: {},
  });
  assert.equal(isAdminMetadata(vista), false);
});

test('cuenta: el plan que puso el servidor sí manda', () => {
  const vista = metadatosDeCuenta({
    user_metadata: { name: 'Ana' },
    app_metadata: { plan: 'pro', subscription_status: 'active' },
  });
  assert.equal(entitledPlanFromMetadata(vista), 'pro');
});

test('cuenta: app_metadata gana aunque el usuario escriba lo contrario', () => {
  // El caso que importa de verdad: el servidor canceló la suscripción y el
  // usuario intenta revivirla desde su propia bolsa.
  const vista = metadatosDeCuenta({
    user_metadata: { plan: 'pro', subscription_status: 'active' },
    app_metadata: { plan: 'free', subscription_status: 'canceled' },
  });
  assert.equal(entitledPlanFromMetadata(vista), 'free');
  assert.equal(vista.subscription_status, 'canceled');
});

test('cuenta: no hay respaldo al valor viejo de user_metadata', () => {
  // Un respaldo "si no está en app_metadata, léelo de user_metadata" reabriría
  // el agujero entero: basta con que el usuario borre nada.
  const vista = metadatosDeCuenta({
    user_metadata: { plan: 'pro' },
    app_metadata: { provider: 'email' },
  });
  assert.equal(vista.plan, undefined);
});

test('cuenta: separar devuelve cada campo a su bolsa', () => {
  const { userMetadata, appMetadata } = separarMetadatos(
    { name: 'Ana', favorites: [{ kind: 'banco', id: '1' }], plan: 'pro', role: 'admin' },
    { provider: 'email', providers: ['email'] },
  );
  assert.deepEqual(Object.keys(userMetadata).sort(), ['favorites', 'name']);
  assert.equal(appMetadata.plan, 'pro');
  assert.equal(appMetadata.role, 'admin');
  assert.equal(appMetadata.provider, 'email', 'no se pisan las claves de Supabase');
});

test('cuenta: separar borra de app_metadata lo que el updater quitó', () => {
  const { appMetadata } = separarMetadatos(
    { name: 'Ana' },
    { provider: 'email', plan: 'pro', subscription_status: 'active' },
  );
  assert.equal(appMetadata.plan, undefined);
  assert.equal(appMetadata.subscription_status, undefined);
  assert.equal(appMetadata.provider, 'email');
});

test('cuenta: ida y vuelta conserva los valores del servidor', () => {
  const original = {
    user_metadata: { name: 'Ana', radar_preferences: { city: 'Bogotá' } },
    app_metadata: { provider: 'email', plan: 'pro', subscription_status: 'active' },
  };
  const vista = metadatosDeCuenta(original);
  const { userMetadata, appMetadata } = separarMetadatos(vista, original.app_metadata);
  assert.deepEqual(metadatosDeCuenta({ user_metadata: userMetadata, app_metadata: appMetadata }), vista);
});

test('cuenta: se detectan los privilegios que quedan en la bolsa del usuario', () => {
  assert.deepEqual(privilegiosEnBolsaDelUsuario({ name: 'Ana' }), []);
  assert.deepEqual(
    privilegiosEnBolsaDelUsuario({ name: 'Ana', plan: 'pro', role: 'admin' }).sort(),
    ['plan', 'role'],
  );
});

test('cuenta: se distingue un ascenso de un resto inofensivo', () => {
  assert.equal(pareceIntentoDeAscenso({ plan: 'free' }), false);
  assert.equal(pareceIntentoDeAscenso({ subscription_status: 'none' }), false);
  assert.equal(pareceIntentoDeAscenso({ plan: 'pro' }), true);
  assert.equal(pareceIntentoDeAscenso({ plan: 'suscrito' }), true);
  assert.equal(pareceIntentoDeAscenso({ role: 'admin' }), true);
  assert.equal(pareceIntentoDeAscenso({ is_admin: true }), true);
  assert.equal(pareceIntentoDeAscenso({ subscription_status: 'active' }), true);
});

test('cuenta: la lista de campos cubre todo lo que decide acceso', () => {
  // Si alguien añade un campo de permiso nuevo y olvida meterlo aquí, vuelve a
  // ser escribible por el usuario sin que nada lo avise.
  for (const campo of ['plan', 'role', 'is_admin', 'subscription_status', 'subscription_audit']) {
    assert.ok(
      (CAMPOS_AUTORIZACION as readonly string[]).includes(campo),
      `${campo} debe estar en CAMPOS_AUTORIZACION`,
    );
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

type Listener = (...args: any[]) => void;

function fakeElement() {
  const listeners: Record<string, Listener> = {};
  const attributes: Record<string, string> = {};
  const classes = new Set<string>();

  return {
    listeners,
    attributes,
    className: '',
    hidden: false,
    style: {} as Record<string, string>,
    textContent: '',
    value: '',
    classList: {
      toggle(name: string, enabled: boolean) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener(name: string, listener: Listener) {
      listeners[name] = listener;
    },
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
    removeAttribute(name: string) {
      delete attributes[name];
    },
  };
}

test('login permite contraseñas antiguas de menos de 8 caracteres', async () => {
  const ids = [
    'pending-context',
    'tab-register',
    'tab-login',
    'name-field',
    'title',
    'subtitle',
    'submit',
    'password',
    'msg',
    'google-btn',
    'form',
    'email',
    'name',
    // Los del formulario de recuperación. Van aquí porque `login.js` les engancha
    // sus manejadores al cargarse: si faltan, el guion revienta antes de llegar a
    // lo que esta prueba quiere comprobar.
    'olvide-fila',
    'olvide',
    'olvide-volver',
    'form-olvide',
    'olvide-email',
    'olvide-enviar',
    'olvide-msg',
    'legal',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, fakeElement()]));
  const storage = new Map<string, string>();
  const source = await readFile(new URL('./public/login.js', import.meta.url), 'utf8');

  vm.runInNewContext(source, {
    document: {
      getElementById(id: string) {
        return elements[id];
      },
      // La recuperación esconde las pestañas mientras está a la vista.
      querySelector() {
        return fakeElement();
      },
    },
    fetch: async () => {
      throw new Error('fetch no debe ejecutarse en esta prueba');
    },
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
    location: { origin: 'http://localhost:8787', href: '' },
    URL,
    window: { setTimeout },
  });

  assert.equal(elements.password.attributes.minlength, '8');
  elements['tab-login'].listeners.click();
  assert.equal(elements.password.attributes.autocomplete, 'current-password');
  assert.equal(elements.password.attributes.placeholder, 'Tu contraseña');
  assert.equal(elements.password.attributes.minlength, undefined);
});

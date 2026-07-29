/**
 * Guardia sobre la ficha pendiente.
 *
 * Las dos reglas que la hacen útil y no molesta son invisibles en una revisión:
 * que CADUQUE y que solo devuelva tipos que `/api/property` acepta. Un plazo que
 * se alarga por descuido convierte la mejora en una ventana que le salta encima
 * al usuario días después, y eso no lo nota nadie hasta que lo cuenta un cliente.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

interface FichaPendiente {
  guardar(kind: string, id: string, titulo?: string): void;
  leer(): { kind: string; id: string; titulo: string } | null;
  olvidar(): void;
  VIGENCIA_MS: number;
}

async function cargar() {
  const source = await readFile(new URL('./public/ficha-pendiente.js', import.meta.url), 'utf8');
  const almacen = new Map<string, string>();
  const ventana: Record<string, unknown> = {};
  vm.runInNewContext(source, {
    window: ventana,
    localStorage: {
      getItem: (key: string) => almacen.get(key) ?? null,
      setItem: (key: string, value: string) => { almacen.set(key, value); },
      removeItem: (key: string) => { almacen.delete(key); },
    },
  });
  return { api: ventana.__fichaPendiente as FichaPendiente, almacen };
}

const CLAVE = 'radar_ficha_pendiente_v1';

test('la ficha pendiente sobrevive al viaje a /login y vuelve entera', async () => {
  const { api } = await cargar();
  api.guardar('portal', 'abc-123', 'Apartamento en Pasto');
  const vuelta = api.leer();
  // Campo a campo: el objeto nace en otro realm (`vm`) y no comparte prototipo.
  assert.equal(vuelta?.kind, 'portal');
  assert.equal(vuelta?.id, 'abc-123');
  assert.equal(vuelta?.titulo, 'Apartamento en Pasto');
});

test('la ficha pendiente caduca dentro de la misma sesión, no días después', async () => {
  const { api, almacen } = await cargar();
  // El plazo se comprueba por su efecto, no por su valor: lo que no puede pasar
  // es que una ficha de ayer reabra sola una ventana encima del usuario.
  assert.ok(api.VIGENCIA_MS <= 60 * 60 * 1000, 'el plazo no puede pasar de una hora');

  const guardada = (edadMs: number) => almacen.set(CLAVE, JSON.stringify({
    kind: 'portal', id: 'abc-123', titulo: '', ts: Date.now() - edadMs,
  }));

  guardada(api.VIGENCIA_MS - 5_000);
  assert.ok(api.leer(), 'dentro del plazo sigue viva');

  guardada(api.VIGENCIA_MS + 5_000);
  assert.equal(api.leer(), null, 'pasado el plazo no se reabre');
  assert.equal(almacen.get(CLAVE), undefined, 'y se borra sola al detectarla caducada');

  guardada(3 * 24 * 60 * 60 * 1000);
  assert.equal(api.leer(), null, 'una ficha de hace tres días nunca vuelve');
});

test('la ficha pendiente solo devuelve tipos que la API acepta', async () => {
  const { api, almacen } = await cargar();
  // El valor viaja a /api/property?kind=…: lo que salga de aquí tiene que ser uno
  // de los tres, venga como venga del almacenamiento del navegador.
  api.guardar('cualquiera', 'abc-123');
  assert.equal(api.leer(), null, 'un tipo inventado no se guarda');

  almacen.set(CLAVE, JSON.stringify({ kind: 'admin', id: 'x', ts: Date.now() }));
  assert.equal(api.leer(), null, 'un tipo manipulado a mano no se devuelve');

  almacen.set(CLAVE, '{no es json');
  assert.equal(api.leer(), null, 'basura en el almacenamiento no rompe el arranque');
});

test('la ficha pendiente se puede olvidar: es un billete de un solo viaje', async () => {
  const { api } = await cargar();
  api.guardar('remate', 'r-9');
  api.olvidar();
  assert.equal(api.leer(), null);
});

/**
 * La herramienta de auditoría de comparables no puede ser la puerta de atrás del
 * muro de pago.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fuente = await readFile(new URL('./comparables-detalle.ts', import.meta.url), 'utf8');

test('comparables: la respuesta no lleva enlace ni identificador de la fuente', async () => {
  // Entre los comparables hay fichas que el Radar cobra —una de cada diez,
  // medido— y a esas `redactar()` les anula `source_url` y `source_id` en todas
  // las demás rutas. Servirlos aquí, sin sesión y a un clic de cualquier ficha,
  // dejaba la llave puesta en la puerta de atrás.
  //
  // La pregunta que esta herramienta contesta —«¿contra qué se comparó mi
  // inmueble?»— se responde con tipo, área, precio y zona. El enlace no aporta
  // nada a eso.
  assert.doesNotMatch(fuente, /url:\s*urls\.get/, 'no se resuelve la URL de la fuente');
  assert.doesNotMatch(fuente, /urlsPorSourceId/, 'la función que las resolvía ya no existe');
  assert.match(fuente, /source_id: _sinId, url: _sinUrl/, 'identificador y enlace se descartan al construir la fila');
});

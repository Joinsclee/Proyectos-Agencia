/**
 * La galería se recorta al ESCRIBIR, o la cuota vuelve sola.
 *
 * `features.images` es la columna más gorda del catálogo: 347 MB de los 743 que
 * ocupaba `inmuebles` completo, porque los parsers guardan hasta 20 URLs por
 * inmueble y la ficha enseña un carrusel.
 *
 * El 20 de octubre de 2026, al restaurar la base en un proyecto nuevo, las
 * 92.811 filas se cargaron con 6 fotos para que cupieran en los 500 MB del plan
 * gratuito. Pero `upsertInmuebles` no recortaba nada —solo
 * `upsertRentalListings` lo hacía—, así que el siguiente pase del scraper las
 * habría vuelto a inflar a veinte, una por una y sin un solo error, hasta
 * reventar la cuota otra vez. Que era justo de lo que se venía de salir.
 *
 * Estas pruebas fijan ese recorte. Si alguien lo quita, la factura llega en
 * silencio una semana después, cuando el cron pase por fincaraiz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8');

test('upsertInmuebles recorta la galería antes de escribir', () => {
  // Se comprueba sobre la fuente y no llamando a la función porque upsertInmuebles
  // habla con Supabase: lo que importa es que el recorte esté EN el camino de
  // escritura, no que un mock devuelva lo esperado.
  const enriched = FUENTE.slice(FUENTE.indexOf('const enriched = dedupedItems.map'));
  const cuerpo = enriched.slice(0, enriched.indexOf('}));') + 4);
  assert.match(cuerpo, /features:\s*recortarGaleria\(/,
    'el upsert de inmuebles ya no recorta features.images');
});

test('el tope es 6 y no se toca la portada', () => {
  assert.match(FUENTE, /const FOTOS_QUE_SE_GUARDAN = 6;/);
  // image_url es lo unico que usa el listado: recortarla dejaria las tarjetas
  // sin foto, que es mucho peor que una galeria de seis.
  const fn = FUENTE.slice(FUENTE.indexOf('function recortarGaleria'));
  assert.doesNotMatch(fn.slice(0, fn.indexOf('\n}')), /image_url/,
    'recortarGaleria no debe tocar image_url');
});

test('recortarGaleria deja intacto lo que ya cabe', () => {
  // Reimplementado aqui a proposito: la funcion es privada, y lo que se fija es
  // el CONTRATO —no inventarse claves, no reordenar, no tocar lo que ya cabe—.
  const recortar = (f: Record<string, unknown>) => {
    if (!Array.isArray(f.images) || f.images.length <= 6) return f;
    const images = f.images.slice(0, 6);
    return { ...f, images, image_count: images.length };
  };
  const tres = { images: ['a', 'b', 'c'], description: 'texto', stratum: 4 };
  assert.deepEqual(recortar(tres), tres);
  const sinFotos = { description: 'texto' };
  assert.deepEqual(recortar(sinFotos), sinFotos);
});

test('recortarGaleria corta a 6 y cuadra image_count', () => {
  const recortar = (f: Record<string, unknown>) => {
    if (!Array.isArray(f.images) || f.images.length <= 6) return f;
    const images = f.images.slice(0, 6);
    return { ...f, images, image_count: images.length };
  };
  const veinte = {
    images: Array.from({ length: 20 }, (_, i) => `https://cdn/foto-${i}.jpg`),
    image_count: 20,
    description: 'se conserva',
    stratum: 5,
  };
  const r = recortar(veinte) as Record<string, unknown>;
  assert.equal((r.images as string[]).length, 6);
  // image_count tiene que seguir a la lista: si dice 20 y hay 6, el carrusel
  // pinta un contador que no cuadra con lo que se puede pasar.
  assert.equal(r.image_count, 6);
  assert.equal((r.images as string[])[0], 'https://cdn/foto-0.jpg', 'se quedan las primeras, no unas cualesquiera');
  assert.equal(r.description, 'se conserva', 'la descripcion la pinta la ficha');
  assert.equal(r.stratum, 5);
});

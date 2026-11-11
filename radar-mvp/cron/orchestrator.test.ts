/**
 * Tests de la retencion del orquestador.
 *
 * Lo que se prueba es el guardia, que es justo donde un error no se ve: si la
 * purga corre cuando ningun portal vio nada, borra fichas VIVAS —porque nadie
 * refresco su `last_seen_at`— y eso no da ningun error, solo catalogo vacio.
 * Con el cron parado un mes (paso de verdad: el servidor se cayo el 4/11) el
 * siguiente run habria barrido todo lo que llevara 45 dias sin tocarse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debePurgar } from './orchestrator.js';

test('retencion: si algun portal vio inmuebles, se purga', () => {
  assert.equal(debePurgar([{ found: 0 }, { found: 120 }, { found: 0 }]), true);
});

test('retencion: si NINGUN portal vio nada, no se purga', () => {
  assert.equal(debePurgar([{ found: 0 }, { found: 0 }]), false);
});

test('retencion: un resumen vacio (todos los portales reventaron) no purga', () => {
  assert.equal(debePurgar([]), false);
});

test('retencion: basta un solo portal con un solo inmueble', () => {
  assert.equal(debePurgar([{ found: 1 }]), true);
});

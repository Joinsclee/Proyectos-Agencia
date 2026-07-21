import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarDemandante, isBankPlaintiff, bankName } from './bank-detect.js';

test('limpiarDemandante: recorta el aviso desbordado en el nombre real', () => {
  // Casos REALES del scrape del 2026-07-21, donde el valor arrastró medio aviso.
  const casos: Array<[string, string]> = [
    ['BANCO DAVIVIENDA S.A NIT. 860.034.313-7 DEMANDADO: ALEJANDRO RIVERA VALENCIA C.C. 5.886.281. Dentro del proceso ejecutivo…', 'BANCO DAVIVIENDA S.A'],
    ['BANCO FINANDINA S.A. Demandados: MAYERLY DIAZ FONSECA PASA AL DESPACHO…', 'BANCO FINANDINA S.A'],
    ['SOCIEDAD SAN FRANCISCO CAMPESTRE S.A.S. NIT 901145544-6.', 'SOCIEDAD SAN FRANCISCO CAMPESTRE S.A.S'],
    ['Laura Sofia Chica Nieto NIT/Cédula: 1.007.426.684 Demandado: Ligia Lozano', 'Laura Sofia Chica Nieto'],
    ['BANCO AGRARIO DE COLOMBIA NIT 800.037.800-8 DEMANDADO: GUILLERMO', 'BANCO AGRARIO DE COLOMBIA'],
    ['Banco Davivienda S.A. Nit 860034313-7. DEMANDADO: Jorge Enrique', 'Banco Davivienda S.A'],
  ];
  for (const [entrada, esperado] of casos) {
    assert.equal(limpiarDemandante(entrada), esperado, `"${entrada.slice(0, 40)}…"`);
  }
});

test('limpiarDemandante: no toca nombres ya limpios', () => {
  assert.equal(limpiarDemandante('BANCOLOMBIA S.A.'), 'BANCOLOMBIA S.A');
  assert.equal(limpiarDemandante('MARIA ISABEL PRADA SERRANO, SONIA YOHANA PRADA SERRANO, JUAN PABLO PRADA SERRANO'),
    'MARIA ISABEL PRADA SERRANO, SONIA YOHANA PRADA SERRANO, JUAN PABLO PRADA SERRANO');
  assert.equal(limpiarDemandante('ANDRÉI EMILIO BUSTAMANTE GÓMEZ y MARTHA RUTH CATAÑO CRUZ'),
    'ANDRÉI EMILIO BUSTAMANTE GÓMEZ y MARTHA RUTH CATAÑO CRUZ');
});

test('limpiarDemandante: vacío / nulo', () => {
  assert.equal(limpiarDemandante(null), null);
  assert.equal(limpiarDemandante(''), null);
  assert.equal(limpiarDemandante('   '), null);
});

test('limpiarDemandante + bankName: el banco se detecta tras limpiar', () => {
  const sucio = 'BANCO DAVIVIENDA S.A NIT. 860.034.313-7 DEMANDADO: ALEJANDRO RIVERA';
  const limpio = limpiarDemandante(sucio)!;
  assert.equal(bankName(limpio), 'Davivienda');
  assert.ok(isBankPlaintiff(limpio));
});

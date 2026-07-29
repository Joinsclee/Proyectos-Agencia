/**
 * Qué cuenta el panel como usuario, y qué no.
 *
 * El panel decía «32 usuarios» cuando hay tres personas: las otras 29 las habían
 * creado las suites de pruebas y los agentes de QA. Eso no es un detalle
 * cosmético — el panel existe para medir cuántos se registran y cuántos piden el
 * plan, y con esa proporción de ruido no mide nada.
 *
 * Lo que protege esta prueba es el otro lado: que el filtro NO se lleve por
 * delante a una persona real. Un correo de alguien que se registró y no aparece
 * en el panel es peor que un contador inflado.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { esCuentaDePrueba } from './account.js';

test('cuentas de prueba: se reconocen las que generan las suites', () => {
  const generadas = [
    'e2e_1784524102137@test.com',
    'fav_test_1781812961@test.com',
    'favui_1781813571935@test.com',
    'nav_1781827087970@test.com',
    'diag_1781813671799@test.com',
    'sus_1784522348@test.com',
    'free_1781841746662@test.com',
    'verificacion_visual@test.com',
    'qaplan_1785270609237@example.com',
    'qaadm_1785270504091@radarqa.test',
    'verif_muro_1785272595992@example.com',
  ];
  for (const correo of generadas) {
    assert.equal(esCuentaDePrueba(correo), true, `${correo} debería contarse como cuenta de prueba`);
  }
});

test('cuentas de prueba: NO se lleva por delante a una persona real', () => {
  // Las tres cuentas reales del proyecto y un puñado de correos corrientes que
  // empiezan parecido a los prefijos de prueba. Excluir a alguien que sí se
  // registró es un fallo peor que contar de más.
  const personas = [
    'ajgiraldovargas@gmail.com',
    'dineroconsciente.digital@gmail.com',
    'osoriomonsalvejuancamilo@gmail.com',
    'favio.restrepo@gmail.com',      // empieza por «fav» pero no por «fav_»
    'navarro@hotmail.com',           // «nav» sin guion bajo
    'qatar.inversiones@outlook.com', // empieza por «qa» pero es un dominio real
    'diagonal.sur@empresa.co',
    'test.driven@gmail.com',         // lleva «test» pero el dominio es real
    'alguien@test.com.co',           // dominio colombiano real, no el reservado
  ];
  for (const correo of personas) {
    assert.equal(esCuentaDePrueba(correo), false, `${correo} es una persona y quedó fuera del panel`);
  }
});

test('cuentas de prueba: sin correo no se descarta a nadie', () => {
  // Una cuenta sin correo (OAuth con el dato aún sin propagar) es una persona
  // hasta que se demuestre lo contrario.
  for (const vacio of [null, undefined, '']) {
    assert.equal(esCuentaDePrueba(vacio), false);
  }
});

/**
 * Las cifras que devuelve el modelo, comprobadas antes de enseñarlas.
 *
 * La ficha pinta el estimado de la IA junto al veredicto del motor. Si el modelo
 * dice que una oficina vale dos pesos, el usuario ve dos cifras oficiales que se
 * contradicen y no tiene cómo saber cuál creer: eso destruye la confianza en toda
 * la pantalla, no solo en el módulo de IA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valorDeMercadoCreible, descuentoCreible, type AiResult, type AiPropertyFacts } from './ai.js';
import type { MarketContext } from '../engine/zone-comps.js';

test('IA: un valor de mercado imposible no se enseña', () => {
  // El caso reportado en la auditoría: «valores estimados de $2 COP en oficinas».
  // Era reproducible por diseño: el parseo acotaba el puntaje a 0-100 pero dejaba
  // pasar cualquier número en el campo de pesos.
  assert.equal(valorDeMercadoCreible(2), null, '$2 no es el valor de un inmueble');
  assert.equal(valorDeMercadoCreible(0), null);
  assert.equal(valorDeMercadoCreible(-5_000_000), null);
  assert.equal(valorDeMercadoCreible(999_999_999_999_999), null);
  assert.equal(valorDeMercadoCreible('no es un número'), null);
  assert.equal(valorDeMercadoCreible(null), null);
  // Un valor creíble sí pasa, y sin tocarlo.
  assert.equal(valorDeMercadoCreible(420_000_000), 420_000_000);
});

test('IA: un descuento fuera de rango no se enseña', () => {
  // Por debajo de -100% habría que pagar por llevárselo; por encima de 95% sería
  // regalado. En los dos extremos es más probable un error que una ganga.
  assert.equal(descuentoCreible(-415), null, 'el «+415% sobre mercado» del informe');
  assert.equal(descuentoCreible(99.9), null);
  assert.equal(descuentoCreible(37.44), 37.4, 'se redondea a un decimal');
  assert.equal(descuentoCreible(-36), -36, 'un sobreprecio moderado sí es informativo');
});

test('IA: un descuento que contradice a su propia estimación no se enseña', async () => {
  // El caso real del informe: la IA dijo «-30% de descuento» sobre un inmueble de
  // $30.000.000 cuyo valor de mercado ella misma estimó en $22.105.265. Eso no es
  // un descuento del 30%: es un sobreprecio del 36%. El signo contradecía a su
  // propio número, y la ficha lo pintaba al lado del veredicto del motor, que
  // decía lo contrario.
  //
  // Quien lee no puede detectar la contradicción ni rehacer la cuenta, así que el
  // riesgo no es un número feo: es entusiasmarse con algo sobrevalorado creyendo
  // que está barato.
  const { descuentoCoherente } = await import('./ai.js');
  // Un inmueble de 30 millones con mercado estimado en 22 está por ENCIMA, así que
  // un porcentaje positivo —que en esta escala significa «más barato»— miente
  // sobre la dirección. Se descarta.
  assert.equal(descuentoCoherente(30, 30_000_000, 22_105_265), null, 'dice barato lo que está caro');
  // El negativo sí describe la realidad (sobreprecio del ~36%), así que se
  // conserva. Lo que engañaba en la ficha no era este número sino su etiqueta,
  // que lo llamaba «descuento» aunque fuera un sobreprecio: eso se arregló en la
  // interfaz, no aquí.
  assert.equal(descuentoCoherente(-35, 30_000_000, 22_105_265), -35, 'el sobreprecio bien declarado se conserva');
});

test('IA: un descuento que cuadra sí se enseña', async () => {
  const { descuentoCoherente } = await import('./ai.js');
  // 400M sobre un mercado de 500M son un 20% real: coincide con lo declarado.
  assert.equal(descuentoCoherente(20, 400_000_000, 500_000_000), 20);
  // Diferencias pequeñas se toleran: aquí no se persigue precisión decimal, solo
  // se impide que el signo mienta.
  assert.equal(descuentoCoherente(25, 400_000_000, 500_000_000), 25);
  // Una desviación grande sí se descarta, aunque el signo coincida.
  assert.equal(descuentoCoherente(60, 400_000_000, 500_000_000), null);
});

test('IA: sin con qué contrastar, el descuento pasa como antes', async () => {
  // No se puede comprobar coherencia contra un dato que no existe, y quedarse sin
  // la cifra por eso sería perder información buena por precaución.
  const { descuentoCoherente } = await import('./ai.js');
  assert.equal(descuentoCoherente(20, null, 500_000_000), 20);
  assert.equal(descuentoCoherente(20, 400_000_000, null), 20);
});

/*
 * ─── H-04: la IA no puede llevarle la contraria al motor en la misma ficha ───
 *
 * El hallazgo más grave de la auditoría, y distinto del anterior: ahí la IA se
 * contradecía a sí misma; aquí contradice al motor. Los dos ejemplos del informe
 * están reproducidos con sus cifras reales.
 */
const mercado = (over: Partial<MarketContext> = {}): MarketContext => ({
  city: 'carmen de apicalá', type: 'lote', matched_type: true, scope: 'barrio',
  scope_label: '1.5 km a la redonda', radius_km: 1.5, criteria: [],
  n: 14, n_ppm2: 14,
  median_total: 37_000_000, p25_total: 30_000_000,
  median_ppm2: null, p25_ppm2: null,
  spread: null, confidence: 'medium', sample: [],
  ...over,
});

const analisis = (over: Partial<AiResult> = {}): AiResult => ({
  veredicto: 'neutral', puntaje: 50, estimado_mercado_cop: null, descuento_estimado_pct: null,
  resumen: '', a_favor: [], en_contra: [], riesgos_due_diligence: [], recomendacion: '',
  _meta: { model: 'test', generated_at: '2026-08-01T00:00:00.000Z', comparables_n: 14, confidence: 'medium' },
  ...over,
});

const lote: AiPropertyFacts = {
  kind: 'portal', tipo: 'lote', ciudad: 'carmen de apicalá', zona: null,
  area_m2: null, estrato: null, precio_lista_cop: 30_000_000,
};

test('IA: Ejemplo 1 del informe — el motor dice «por debajo» y la IA dice «riesgosa»', async () => {
  const { contradiceAlMotor } = await import('./ai.js');
  // $30.000.000 contra una mediana de $37.000.000 son un 19% por debajo: es el
  // sello que la propia ficha mostraba arriba. Llamar «riesgosa» a eso, unos
  // centímetros más abajo, deja al usuario sin saber a cuál de las dos creerle.
  const choque = contradiceAlMotor(analisis({ veredicto: 'riesgosa', puntaje: 40 }), lote, mercado());
  assert.match(choque ?? '', /19% por debajo.*riesgosa/);

  // Y el mismo veredicto sobre un inmueble que el motor deja al borde del precio
  // de mercado no contradice nada: ahí la ficha no le pone estrella, y la IA sí
  // puede pesar cosas que el motor no ve —el estado, el texto del aviso—.
  assert.equal(
    contradiceAlMotor(analisis({ veredicto: 'riesgosa' }), lote, mercado({ median_total: 31_000_000 })),
    null,
  );
});

test('IA: Ejemplo 2 del informe — los dos porcentajes apuntan a lados opuestos', async () => {
  const { contradiceAlMotor } = await import('./ai.js');
  // La oficina de Cúcuta: la ficha calculaba +38% sobre el mercado y la IA
  // anunciaba un 30% de descuento. Uno de los dos miente y no hay forma de saber
  // cuál desde la pantalla.
  const oficina: AiPropertyFacts = {
    kind: 'portal', tipo: 'oficina', ciudad: 'cúcuta', zona: null,
    area_m2: 5, estrato: null, precio_lista_cop: 30_000_000,
  };
  const choque = contradiceAlMotor(
    analisis({ descuento_estimado_pct: 30, estimado_mercado_cop: 22_105_265 }),
    oficina,
    mercado({ city: 'cúcuta', type: 'oficina', median_ppm2: 4_350_000, median_total: null }),
  );
  assert.match(choque ?? '', /por encima.*por debajo/);
});

test('IA: un análisis que va en la misma dirección que el motor se publica', async () => {
  const { contradiceAlMotor } = await import('./ai.js');
  // Los dos coinciden en que está por debajo: no hay nada que descartar.
  assert.equal(
    contradiceAlMotor(analisis({ veredicto: 'atractiva', descuento_estimado_pct: 22 }), lote, mercado()),
    null,
  );
  // Diferencias de magnitud tampoco son contradicción: dos estimaciones del mismo
  // mercado nunca coinciden al decimal, y lo que se persigue es el signo.
  assert.equal(
    contradiceAlMotor(analisis({ descuento_estimado_pct: 35 }), lote, mercado()),
    null,
  );
  // Sin comparables no hay veredicto del motor con el que chocar.
  assert.equal(
    contradiceAlMotor(analisis({ veredicto: 'riesgosa' }), lote, mercado({ n: 0 })),
    null,
  );
});

test('IA: en un remate, «riesgosa» con precio bajo NO es contradicción', async () => {
  const { contradiceAlMotor } = await import('./ai.js');
  // La postura mínima de un remate está por debajo del mercado casi por
  // definición, y «riesgosa» ahí habla del expediente, de la tradición y de la
  // entrega —no del precio—. Descartar el análisis por eso borraría justo la
  // advertencia que más falta hace en la sección más delicada del producto.
  const remate: AiPropertyFacts = {
    kind: 'remate', tipo: 'casa', ciudad: 'cúcuta', zona: null,
    area_m2: null, estrato: null, avaluo_cop: 55_000_000, postura_cop: 39_055_800,
  };
  assert.equal(
    contradiceAlMotor(analisis({ veredicto: 'riesgosa', puntaje: 35 }), remate, mercado({ city: 'cúcuta', median_total: 70_000_000 })),
    null,
  );
  // Pero la aritmética sí se le exige igual que a cualquiera: si el motor lo pone
  // por debajo y la IA anuncia sobreprecio, uno de los dos está mal.
  assert.match(
    contradiceAlMotor(
      analisis({ descuento_estimado_pct: -40 }),
      remate,
      mercado({ city: 'cúcuta', median_total: 70_000_000 }),
    ) ?? '',
    /por debajo.*por encima/,
  );
});

test('IA: se compara contra el sello de la ficha, no contra otra mediana', async () => {
  const { contradiceAlMotor } = await import('./ai.js');
  // El sello que ve el usuario lo produce `evaluateBank` (engine/comparables.ts),
  // que recorre una cascada de comparables DISTINTA de la de `summarizeMarket`.
  // Comprobar la coherencia contra la mediana dejaba pasar justo la contradicción
  // que se ve en pantalla, que es la única que importa.
  //
  // Aquí la mediana deja el inmueble en zona neutra (30M contra 31M) pero el sello
  // dice «22% por debajo». Con la mediana no habría choque; con el sello, sí.
  const choque = contradiceAlMotor(
    analisis({ veredicto: 'riesgosa' }),
    lote,
    mercado({ median_total: 31_000_000 }),
    22,
  );
  assert.match(choque ?? '', /22% por debajo.*riesgosa/, 'manda el sello, no la mediana');

  // Y al revés: sin sello se sigue usando la mediana, que es lo correcto en
  // remates y en las fichas que el motor no pudo evaluar.
  assert.equal(
    contradiceAlMotor(analisis({ veredicto: 'riesgosa' }), lote, mercado({ median_total: 31_000_000 }), null),
    null,
  );

  // Un sello de 0 es un dato, no un hueco: no debe confundirse con «no hay sello».
  assert.equal(
    contradiceAlMotor(analisis({ descuento_estimado_pct: 40 }), lote, mercado({ n: 0 }), 0),
    null,
    'sello 0 = precio de mercado, y 40% de descuento no lo contradice por signo',
  );
});

test('IA: un valor de mercado que no salió de los comparables tumba el análisis', async () => {
  const { contradiceAlMotor } = await import('./ai.js');
  // El caso real, encontrado abriendo la ficha en producción: sobre el lote de
  // Carmen de Apicalá el modelo declaró un mercado de $18.000.000 cuando la
  // mediana de sus propios comparables era $88.500.000. Contra esos 18 millones
  // todo lo que dijo después es coherente y falso.
  const choque = contradiceAlMotor(
    analisis({ estimado_mercado_cop: 18_000_000, veredicto: 'riesgosa' }),
    lote,
    mercado({ median_total: 88_500_000 }),
  );
  assert.match(choque ?? '', /no salió de los datos/);
  assert.match(choque ?? '', /4\.9×/, 'dice cuánto se desvió');

  // El margen es enorme a propósito: la mediana es de precios totales y un
  // inmueble concreto puede ser mucho más pequeño que el típico de su zona.
  assert.equal(
    contradiceAlMotor(analisis({ estimado_mercado_cop: 30_000_000 }), lote, mercado({ median_total: 88_500_000 })),
    null,
    'tres veces por debajo sigue siendo una lectura posible',
  );
  // Y también se caza al revés, cuando el modelo infla el mercado.
  assert.match(
    contradiceAlMotor(analisis({ estimado_mercado_cop: 400_000_000 }), lote, mercado({ median_total: 88_500_000 })) ?? '',
    /no salió de los datos/,
  );
  // Sin mediana con la que contrastar no se descarta nada.
  assert.equal(
    contradiceAlMotor(analisis({ estimado_mercado_cop: 18_000_000 }), lote, mercado({ median_total: null })),
    null,
  );
});

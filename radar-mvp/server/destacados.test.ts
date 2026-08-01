/**
 * La portada afirma "esto es una oportunidad" a alguien que no ha preguntado
 * nada. Si la selección se equivoca, el producto pierde credibilidad en la
 * primera pantalla y no hay segunda oportunidad de explicarse.
 *
 * Se prueban las dos mitades del criterio: QUÉ entra (y sobre todo qué NO) y POR
 * QUÉ se dice que entra, que es lo que el cliente lee.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESCUENTO_MAX,
  DESCUENTO_MIN,
  TAMANOS,
  armarDestacados,
  bloqueCiudades,
  bloqueFuentes,
  bloqueMes,
  bloqueSemana,
  descuentoRemate,
  esInmuebleDestacable,
  esRemateDestacable,
  fechaCorta,
  fichasDe,
  huellaDeFicha,
  inicioDeMes,
  nombreMes,
  sellarInmueble,
  sellarRemate,
  type FilaInmueble,
  type FilaRemate,
} from './destacados.js';

/** Inmueble mínimo que SÍ pasa el corte; cada prueba rompe una sola cosa. */
const inmueble = (over: Partial<FilaInmueble> = {}): FilaInmueble => ({
  id: over.id ?? 'i-1',
  source: 'fincaraiz',
  city: 'medellin',
  zone: 'Laureles',
  type: 'apartment',
  price: 300_000_000,
  area_m2: 80,
  discount_pct: 40,
  crece_index: 0.6,
  crece_tier: 'oportunidad_fuerte',
  cascada_nivel: 'barrio',
  is_high: true,
  first_seen_at: '2026-07-10T12:00:00Z',
  features: {},
  ...over,
});

const remate = (over: Partial<FilaRemate> = {}): FilaRemate => ({
  id: over.id ?? 'r-1',
  city: 'cali',
  property_type: 'house',
  minimum_bid: 70_000_000,
  appraisal_value: 100_000_000,
  auction_date: '2026-08-04',
  cuota_parte: 100,
  origen_demandante: 'particular_otro',
  ...over,
});

// ─────────────────────────────  qué entra y qué no  ─────────────────────────────

test('destacables: solo entran las dos categorías que el negocio vende', () => {
  // "Interesante" es una oportunidad de verdad, pero es contenido gratuito: si la
  // portada la destaca junto a las de pago, el muro parece arbitrario.
  assert.equal(esInmuebleDestacable(inmueble({ crece_tier: 'oportunidad_fuerte' })), true);
  assert.equal(esInmuebleDestacable(inmueble({ crece_tier: 'oportunidad' })), true);
  assert.equal(esInmuebleDestacable(inmueble({ crece_tier: 'interesante' })), false);
  assert.equal(esInmuebleDestacable(inmueble({ crece_tier: null })), false);
});

test('destacables: el descuento imposible es un dato roto, no una ganga', () => {
  // La base tiene fichas de portal con 99% de descuento: son áreas o precios mal
  // cargados. Justo esas serían las primeras si se ordenara sin banda.
  assert.equal(esInmuebleDestacable(inmueble({ discount_pct: DESCUENTO_MAX + 0.1 })), false);
  assert.equal(esInmuebleDestacable(inmueble({ discount_pct: 99 })), false);
  assert.equal(esInmuebleDestacable(inmueble({ discount_pct: DESCUENTO_MAX })), true);
});

test('destacables: por debajo del umbral no hay nada que destacar', () => {
  assert.equal(esInmuebleDestacable(inmueble({ discount_pct: DESCUENTO_MIN - 0.1 })), false);
  assert.equal(esInmuebleDestacable(inmueble({ discount_pct: DESCUENTO_MIN })), true);
  assert.equal(esInmuebleDestacable(inmueble({ discount_pct: null })), false);
});

test('destacables: un aviso cuyos datos no pueden ser ciertos no llega a la portada', () => {
  // La auditoría abrió «Oficina en Cúcuta · 5 m²» con la descripción de una
  // vivienda de tres habitaciones. El motor ya no le concede veredicto
  // (engine/plausibilidad.ts), pero la categoría que le calculó ANTES sigue escrita
  // en su fila hasta el próximo barrido completo, y con ella podría colarse en la
  // portada. Aquí se comprueba con el dato delante y no se espera al motor.
  const oficinaImposible = inmueble({ type: 'office', area_m2: 5, price: 30_000_000 });
  assert.equal(esInmuebleDestacable(oficinaImposible), false);
  // Misma ficha con un área creíble para una oficina: entra sin problema.
  assert.equal(esInmuebleDestacable(inmueble({ type: 'office', area_m2: 60, price: 300_000_000 })), true);
  // Y el otro extremo: el precio por m² imposible, que es como se colaban las de
  // «+416% sobre el mercado».
  assert.equal(esInmuebleDestacable(inmueble({ type: 'house', area_m2: 150, price: 6_000_000_000 })), false);
});

test('destacables: una comparación con confianza baja no puede ser portada', () => {
  const flojo = inmueble({ source: 'aval', features: { market: { confidence: 'low', n_comparables: 7 } } });
  assert.equal(esInmuebleDestacable(flojo), false);
  const solido = inmueble({ source: 'aval', features: { market: { confidence: 'medium', n_comparables: 40 } } });
  assert.equal(esInmuebleDestacable(solido), true);
  // El portal no guarda `features.market`: su garantía es `is_high`, y no puede
  // quedar fuera por no tener un campo que el motor nunca le escribe.
  assert.equal(esInmuebleDestacable(inmueble({ features: {} })), true);
});

test('remates: la cuota-parte nunca se destaca', () => {
  // Quien puja creyendo que compra la casa y compra el 50% queda de copropietario
  // con un desconocido. Puede buscarse en su pestaña; no se recomienda de entrada.
  assert.equal(esRemateDestacable(remate({ cuota_parte: 50 })), false);
  assert.equal(esRemateDestacable(remate({ cuota_parte: 100 })), true);
  assert.equal(esRemateDestacable(remate({ cuota_parte: null })), true);
});

test('remates: un radar inmobiliario no abre con un carro', () => {
  assert.equal(esRemateDestacable(remate({ property_type: 'vehicle' })), false);
  assert.equal(esRemateDestacable(remate({ property_type: 'rights' })), false);
  assert.equal(esRemateDestacable(remate({ property_type: 'lot' })), true);
});

test('remates: sin avalúo o sin postura no hay métrica que enseñar', () => {
  assert.equal(descuentoRemate(remate()), 30);
  assert.equal(descuentoRemate(remate({ appraisal_value: null })), null);
  assert.equal(descuentoRemate(remate({ appraisal_value: 0 })), null);
  assert.equal(esRemateDestacable(remate({ minimum_bid: null })), false);
  assert.equal(esRemateDestacable(remate({ auction_date: null })), false);
});

// ─────────────────────────────  por qué está ahí  ─────────────────────────────

test('sello: el motivo dice contra qué se comparó, no "destacado"', () => {
  const { _destacado } = sellarInmueble(inmueble({ discount_pct: 37.4 }));
  assert.equal(_destacado.fuente, 'portal');
  // «sector» y no «barrio»: la comparación cubre 1,5 km, que son varios barrios.
  // «ofertas similares» y no «los precios»: al otro lado hay avisos parecidos, no
  // el precio medio de todo lo que se vende alrededor.
  assert.equal(_destacado.motivo, '37% por debajo de ofertas similares de su sector');
  assert.match(_destacado.respaldo ?? '', /Oportunidad Fuerte/);
});

test('sello: el respaldo no enseña jerga interna', () => {
  // El Índice CRECE es interno y el listado ya lo ocultaba; la portada se saltaba
  // esa regla y enseñaba «índice CRECE 0,60», que no significa nada para quien no
  // conoce la escala. Y «confianza alta del motor» habla de un motor que el
  // usuario no sabe que existe. Cuando no hay un número de comparables real que
  // enseñar, callar es mejor que rellenar con jerga.
  const { _destacado } = sellarInmueble(inmueble({ discount_pct: 37.4 }));
  assert.doesNotMatch(_destacado.respaldo ?? '', /índice CRECE/i);
  assert.doesNotMatch(_destacado.respaldo ?? '', /confianza alta del motor/i);
  assert.doesNotMatch(_destacado.respaldo ?? '', /propio barrio/i);
});

test('sello: la referencia cambia con el nivel de la cascada', () => {
  // Decir "de su propio barrio" cuando el motor tuvo que abrirse a la ciudad
  // entera sería vender una precisión que no hubo.
  assert.match(sellarInmueble(inmueble({ cascada_nivel: 'zona_ampliada' }))._destacado.referencia, /de su zona$/);
  assert.match(sellarInmueble(inmueble({ cascada_nivel: 'ciudad' }))._destacado.referencia, /de su ciudad$/);
});

test('sello: un banco enseña sus comparables y su confianza', () => {
  const ficha = sellarInmueble(inmueble({
    source: 'bancolombia',
    features: { market: { confidence: 'medium', n_comparables: 289 } },
  }));
  assert.equal(ficha._kind, 'banco');
  assert.match(ficha._destacado.respaldo ?? '', /289 comparables, confianza media/);
});

test('sello: el remate se explica con las dos cifras que enseña la tarjeta', () => {
  // `minimum_bid_pct` viene nula en más de la mitad de los avisos y cuando trae
  // número no es la relación postura/avalúo: el porcentaje se recalcula.
  const { _destacado } = sellarRemate(remate({ minimum_bid_pct: 40, origen_demandante: 'bancario' }));
  assert.equal(_destacado.motivo, '30% por debajo del avalúo oficial del juzgado');
  assert.match(_destacado.respaldo ?? '', /postura mínima = 70% del avalúo/);
  assert.match(_destacado.respaldo ?? '', /dominio pleno/);
  assert.match(_destacado.respaldo ?? '', /audiencia 4 ago/);
  assert.match(_destacado.respaldo ?? '', /demandante bancario/);
});

// ─────────────────────────────  los bloques  ─────────────────────────────

const pool = (n: number, desde = 60): FilaInmueble[] =>
  Array.from({ length: n }, (_, i) => inmueble({
    id: `i-${i}`,
    city: `ciudad-${i % 5}`,
    price: 100_000_000 + i,
    discount_pct: Math.max(DESCUENTO_MIN, desde - i * 0.5),
  }));

test('semana: dentro de la misma semana la selección no se mueve', () => {
  // Es la razón por la que se ROTA en vez de barajar: barajar cambiaría el orden
  // en cada petición y un enlace compartido enseñaría otra cosa.
  const fichas = pool(48).map(sellarInmueble);
  const a = fichasDe(bloqueSemana(fichas, 31)).map((f) => f.id);
  const b = fichasDe(bloqueSemana(fichas, 31)).map((f) => f.id);
  assert.deepEqual(a, b);
});

test('semana: al cambiar de semana entra otra selección', () => {
  const fichas = pool(48).map(sellarInmueble);
  const s31 = fichasDe(bloqueSemana(fichas, 31)).map((f) => f.id);
  const s32 = fichasDe(bloqueSemana(fichas, 32)).map((f) => f.id);
  assert.notDeepEqual(s31, s32, 'quien vuelve la semana siguiente debe ver caras nuevas');
});

test('semana: la muestra recorre el tramo alto en vez de repetir el mismo número', () => {
  // Con datos reales hay decenas de fichas clavadas en el mismo descuento: seis
  // posiciones seguidas darían seis tarjetas idénticas y la portada parecería rota.
  const empatadas = Array.from({ length: 48 }, (_, i) => inmueble({
    id: `e-${i}`, price: 100_000_000 + i, discount_pct: 60 - Math.floor(i / 8),
  })).map(sellarInmueble);
  const descuentos = fichasDe(bloqueSemana(empatadas, 1)).map((f) => f._destacado.descuento);
  assert.equal(new Set(descuentos).size > 1, true, `todas salieron con el mismo descuento: ${descuentos}`);
});

test('semana: el criterio que se publica menciona la semana en curso', () => {
  assert.match(bloqueSemana(pool(10).map(sellarInmueble), 7).criterio, /semana ISO \(vas por la 7\)/);
});

test('mes: manda el Índice CRECE, no el tamaño de la rebaja', () => {
  const fichas = [
    sellarInmueble(inmueble({ id: 'caro', crece_index: 0.75, discount_pct: 55 })),
    sellarInmueble(inmueble({ id: 'barato', crece_index: 0.45, discount_pct: 30 })),
  ];
  assert.equal(fichasDe(bloqueMes(fichas, '2026-07'))[0].id, 'barato');
  assert.equal(bloqueMes(fichas, '2026-07').titulo, 'Destacados de julio');
});

test('ciudades: se ordenan por inventario marcado y no se anuncian ciudades a medias', () => {
  const fichas = [
    ...Array.from({ length: 5 }, (_, i) => inmueble({ id: `bog-${i}`, city: 'bogota', price: 1 + i })),
    ...Array.from({ length: 3 }, (_, i) => inmueble({ id: `med-${i}`, city: 'medellin', price: 10 + i })),
    // Una sola ficha no llena la fila: un título de ciudad con un hueco al lado se
    // lee como un error, no como una recomendación.
    inmueble({ id: 'sola', city: 'tunja' }),
  ].map(sellarInmueble);
  const bloque = bloqueCiudades(fichas);
  assert.deepEqual(bloque.grupos.map((g) => g.etiqueta), ['bogota', 'medellin']);
  // Se entregan TODAS las que tiene la ciudad hasta el tope del bloque: el recorte
  // a la fila visible lo hace `preview`, no la selección.
  assert.equal(bloque.grupos[0].fichas.length, 5);
  assert.equal(bloque.grupos[0].preview, TAMANOS.previewCiudad);
  assert.match(bloque.grupos[0].detalle ?? '', /5 oportunidades marcadas/);
});

test('ciudades: el corte para entrar se mide contra la fila visible, no contra el tope', () => {
  // Con `porCiudad` en 12, exigir doce fichas para poder enseñar tres dejaría la
  // portada casi vacía: medido en producción, solo 27 ciudades pasan de diez.
  const justas = Array.from({ length: TAMANOS.previewCiudad }, (_, i) =>
    inmueble({ id: `pop-${i}`, city: 'popayan', price: 1 + i })).map(sellarInmueble);
  const bloque = bloqueCiudades(justas);
  assert.deepEqual(bloque.grupos.map((g) => g.etiqueta), ['popayan']);
  assert.equal(bloque.grupos[0].preview, TAMANOS.previewCiudad);
});

test('preview: nunca promete más fichas de las que trae el grupo', () => {
  // Si `preview` superara a `fichas.length`, la interfaz ofrecería un botón de
  // "ver las N restantes" con N negativo y no habría nada que desplegar.
  const flaco = pool(2).map(sellarInmueble);
  for (const bloque of [bloqueSemana(flaco, 1), bloqueMes(flaco, '2026-07'), bloqueCiudades(flaco)]) {
    for (const grupo of bloque.grupos) {
      assert.ok(grupo.preview <= grupo.fichas.length,
        `${bloque.id}: preview ${grupo.preview} > ${grupo.fichas.length} fichas`);
      assert.ok(grupo.preview > 0, `${bloque.id}: un grupo sin nada visible no debería existir`);
    }
  }
});

test('fuentes: se intercalan las tres, no se ordenan todas juntas', () => {
  // Ordenar la fila entera por descuento dejaría fuera una fuente completa y el
  // cruce —que es el producto— dejaría de verse.
  const portal = pool(5).map(sellarInmueble);
  const bancos = pool(5).map((f) => sellarInmueble({ ...f, id: `b-${f.id}`, source: 'bbva' }));
  const remates = Array.from({ length: 5 }, (_, i) => remate({ id: `r-${i}` })).map(sellarRemate);
  const bloque = bloqueFuentes(portal, bancos, remates);
  const fuentes = fichasDe(bloque).map((f) => f._kind);
  // El patrón se comprueba por repetición y no con una lista literal: el tope por
  // fuente es una decisión de producto que va a seguir moviéndose, y lo que la
  // prueba defiende es el CRUCE, no el número.
  assert.equal(fuentes.length, 15);
  for (let i = 0; i < fuentes.length; i += 3) {
    assert.deepEqual(fuentes.slice(i, i + 3), ['portal', 'banco', 'remate'], `ronda ${i / 3}`);
  }
  assert.equal(bloque.grupos[0].preview, TAMANOS.preview);
});

test('fuentes: los remates se ordenan por riesgo jurídico, no por descuento', () => {
  // Todos los remates sanos dan el mismo 30% (la base legal es el 70% del avalúo),
  // así que ordenarlos por descuento sería ordenar por ruido.
  const remates = [
    remate({ id: 'particular-pronto', origen_demandante: 'particular_otro', auction_date: '2026-08-01' }),
    remate({ id: 'banco-tarde', origen_demandante: 'bancario', auction_date: '2026-09-01' }),
    remate({ id: 'banco-pronto', origen_demandante: 'bancario', auction_date: '2026-08-05' }),
  ].map(sellarRemate);
  const orden = fichasDe(bloqueFuentes([], [], remates)).map((f) => f.id);
  assert.deepEqual(orden, ['banco-pronto', 'banco-tarde', 'particular-pronto']);
});

// ─────────────────────────────  la portada completa  ─────────────────────────────

const AHORA = new Date('2026-07-28T15:00:00Z');

test('portada: ninguna ficha se repite entre bloques', () => {
  const { bloques } = armarDestacados(
    { portal: pool(120), bancos: [], remates: [] },
    { ahora: AHORA },
  );
  const ids = bloques.flatMap((b) => fichasDe(b).map((f) => `${f._kind}:${f.id}`));
  assert.equal(new Set(ids).size, ids.length, 'una tarjeta repetida hace ver la portada más pequeña de lo que es');
});

test('portada: el mismo inmueble cargado dos veces con ids distintos sale una sola vez', () => {
  // Caso real: un local de 404,69 m² en Bogotá está en la base por partida doble.
  const gemelas = [
    inmueble({ id: 'a', city: 'bogota', type: 'commercial', price: 926_598_000, area_m2: 404.69, discount_pct: 55 }),
    inmueble({ id: 'b', city: 'bogota', type: 'commercial', price: 926_598_000, area_m2: 404.69, discount_pct: 55 }),
  ];
  assert.equal(huellaDeFicha(sellarInmueble(gemelas[0])), huellaDeFicha(sellarInmueble(gemelas[1])));
  const { bloques } = armarDestacados({ portal: gemelas, bancos: [], remates: [] }, { ahora: AHORA });
  const todas = bloques.flatMap(fichasDe);
  assert.equal(todas.length, 1);
});

test('portada: el bloque del mes solo trae lo que entró este mes', () => {
  const { bloques } = armarDestacados({
    portal: [
      inmueble({ id: 'viejo', price: 1, first_seen_at: '2026-05-02T10:00:00Z' }),
      inmueble({ id: 'nuevo', price: 2, first_seen_at: '2026-07-20T10:00:00Z' }),
      inmueble({ id: 'otro-nuevo', price: 3, first_seen_at: '2026-07-02T10:00:00Z' }),
    ],
    bancos: [],
    remates: [],
  }, { ahora: AHORA });
  const mes = bloques.find((b) => b.id === 'mes');
  const ids = mes ? fichasDe(mes).map((f) => f.id) : [];
  assert.equal(ids.includes('viejo'), false, 'una ficha de mayo no es un destacado de julio');
});

test('portada: un bloque sin fichas no se anuncia', () => {
  // Prometer "destacados del mes" y no enseñar ninguno es peor que no tener la fila.
  const { bloques } = armarDestacados({
    portal: [inmueble({ id: 'viejo', first_seen_at: '2026-01-02T10:00:00Z' })],
    bancos: [], remates: [],
  }, { ahora: AHORA });
  assert.equal(bloques.some((b) => b.id === 'mes'), false);
  assert.equal(bloques.every((b) => fichasDe(b).length > 0), true);
});

test('portada: una base vacía no revienta ni inventa bloques', () => {
  const vacio = armarDestacados({ portal: [], bancos: [], remates: [] }, { ahora: AHORA });
  assert.deepEqual(vacio.bloques, []);
  assert.equal(vacio.total, 0);
  assert.equal(vacio.periodo, '2026-07');
});

test('portada: la basura de la base no se cuela por ningún bloque', () => {
  const basura = armarDestacados({
    portal: [
      inmueble({ id: 'rota-1', discount_pct: 99, crece_index: 0.01 }),
      inmueble({ id: 'rota-2', crece_tier: 'mercado', discount_pct: 3 }),
    ],
    bancos: [inmueble({ id: 'floja', source: 'aval', features: { market: { confidence: 'low', n_comparables: 3 } } })],
    remates: [remate({ id: 'media-casa', cuota_parte: 50 }), remate({ id: 'carro', property_type: 'vehicle' })],
  }, { ahora: AHORA });
  assert.equal(basura.total, 0);
});

// ─────────────────────────────  fechas  ─────────────────────────────

test('mes: el corte es el primero en hora de Colombia, igual que el cupo', () => {
  // 2026-08-01T02:00Z son todavía las 21:00 del 31 de julio en Bogotá: esa ficha
  // pertenece a julio, como en `server/cupo.ts`.
  assert.equal(inicioDeMes(new Date('2026-08-01T02:00:00Z')).toISOString(), '2026-07-01T05:00:00.000Z');
  assert.equal(inicioDeMes(new Date('2026-08-01T06:00:00Z')).toISOString(), '2026-08-01T05:00:00.000Z');
});

test('fechas: se leen de la cadena, sin pasar por la zona horaria del contenedor', () => {
  // `new Date('2026-08-04')` es medianoche UTC = 19:00 del 3 en Bogotá, y la
  // audiencia saldría un día antes de lo que dice el aviso del juzgado.
  assert.equal(fechaCorta('2026-08-04'), '4 ago');
  assert.equal(fechaCorta('2026-01-31T00:00:00Z'), '31 ene');
  assert.equal(fechaCorta(null), null);
  assert.equal(fechaCorta('sin fecha'), null);
  assert.equal(nombreMes('2026-12'), 'diciembre');
});

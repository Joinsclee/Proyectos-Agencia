/**
 * El reporte es lo único del Radar que sale del sistema y sigue existiendo
 * después: un archivo que el usuario archiva, imprime y le enseña a un tercero.
 * Dos cosas no pueden fallar nunca ahí.
 *
 * 1. QUE NO LLEVE LO QUE EL PLAN NO CUBRE. El muro sirve de poco si la dirección
 *    exacta se puede sacar por la puerta del reporte.
 * 2. QUE NO EJECUTE NI ROMPA NADA. Todo el contenido viene de scraping de
 *    portales y de avisos de juzgado; es texto ajeno, y llega a traer HTML
 *    pegado de la publicación original.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MENSAJE_RECHAZO,
  construirReporte,
  datosDeInmueble,
  decidirReporte,
  escaparHtml,
  fechaCorta,
  nombreArchivoReporte,
  urlSegura,
  type DatosReporte,
} from './reporte.js';
import { CUPO_REPORTES_FREE, type CupoReportes } from './cupo-reportes.js';

const GENERADO = new Date('2026-07-28T15:30:00Z');
const cupo = (o: Partial<CupoReportes> = {}): CupoReportes => ({ periodo: '2026-07', generados: [], ...o });
const LIBRE = { completa: true } as const;

const datos = (o: Partial<DatosReporte> = {}): DatosReporte => ({
  kind: 'banco',
  id: 'abc-123',
  titulo: 'Apartamento en Medellín',
  ciudad: 'Medellín',
  zona: 'Laureles',
  departamento: 'Antioquia',
  fuente: 'Bancolombia',
  precio: 320_000_000,
  precioPorM2: 4_000_000,
  descuentoPct: 27,
  crece: { lectura: 'Oportunidad Fuerte', desviacion: '27% por debajo', estrellas: 3 },
  caracteristicas: [{ etiqueta: 'Área', valor: '80 m²' }, { etiqueta: 'Habitaciones', valor: '3' }],
  comparables: {
    n: 14, medianaPpm2: 5_500_000, medianaTotal: 440_000_000, confianza: 'high',
    alcance: '1.5 km a la redonda', criterios: ['mismo tipo de inmueble'],
    mismoTipo: true, ambitoCiudad: false,
  },
  arriendo: null,
  remate: null,
  direccion: 'Carrera 70 # 44-12',
  enlace: 'https://banco.example/inmueble/9',
  contacto: 'ventas@banco.example',
  generadoEn: GENERADO,
  plan: 'suscrito',
  ...o,
});

// ───────────────────────────── Quién puede pedirlo ─────────────────────────────

test('reporte: al anónimo no se le entrega, se le invita a crear cuenta', () => {
  const d = decidirReporte({ plan: 'anonimo', acceso: LIBRE, cupo: cupo(), id: 'x' });
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.requiere, 'registro');
  assert.match(MENSAJE_RECHAZO.registro, /cuenta gratis/i);
});

test('reporte: si la ficha está bloqueada NO se cobra el reporte', () => {
  // Generar un documento con huecos y encima descontarle una unidad del mes sería
  // venderle el hueco: se le dice qué le falta y su cupo queda intacto.
  const conCupoDeFichas = decidirReporte({
    plan: 'free', acceso: { completa: false, requiere: 'cupo' }, cupo: cupo(), id: 'x',
  });
  assert.equal(conCupoDeFichas.ok, false);
  assert.equal(conCupoDeFichas.ok === false && conCupoDeFichas.requiere, 'ficha');
  assert.deepEqual(conCupoDeFichas.cupo.generados, [], 'no se le gastó nada');

  // `plan` y no `suscripcion`: son dos rechazos distintos y decirlos igual llevó a
  // que a alguien con 19 reportes disponibles se le anunciara que los había
  // agotado, contradiciendo al contador que viajaba en la misma respuesta. Lo que
  // le falta aquí es el plan para ABRIR la ficha, no más reportes.
  const sinCupoDeFichas = decidirReporte({
    plan: 'free', acceso: { completa: false, requiere: 'suscripcion' }, cupo: cupo(), id: 'x',
  });
  assert.equal(sinCupoDeFichas.ok === false && sinCupoDeFichas.requiere, 'plan');
  assert.deepEqual(sinCupoDeFichas.cupo.generados, [], 'no se le gastó nada');
  assert.doesNotMatch(MENSAJE_RECHAZO.plan, /agotaste/i, 'no se le puede decir que agotó lo que no ha usado');
});

test('reporte: una ficha abierta para todos no gasta cupo de reportes', () => {
  // El cupo de reportes existe para el contenido de pago. Cobrarlo por una ficha
  // que el Radar le enseña hasta a un anónimo hace que el plan gratuito se quede
  // sin sus 20 descargas sin haber abierto una sola ficha cerrada.
  const gratis = decidirReporte({
    plan: 'free', acceso: LIBRE, cupo: cupo(), id: 'abierta-para-todos', esDePago: false,
  });
  assert.equal(gratis.ok, true);
  assert.equal(gratis.ok === true && gratis.consume, false, 'no debe consumir');
  assert.deepEqual(gratis.cupo.generados, [], 'el contador no se movió');

  // Y la de pago sigue cobrando.
  const dePago = decidirReporte({
    plan: 'free', acceso: LIBRE, cupo: cupo(), id: 'de-pago', esDePago: true,
  });
  assert.equal(dePago.ok === true && dePago.consume, true);
});

test('reporte: el registrado gasta uno y repetirlo no le cuesta otro', () => {
  const primera = decidirReporte({ plan: 'free', acceso: LIBRE, cupo: cupo(), id: 'ficha-1' });
  assert.equal(primera.ok, true);
  assert.equal(primera.ok === true && primera.consume, true);
  assert.deepEqual(primera.cupo.generados, ['ficha-1']);

  const segunda = decidirReporte({ plan: 'free', acceso: LIBRE, cupo: primera.cupo, id: 'ficha-1' });
  assert.equal(segunda.ok === true && segunda.consume, false);
});

test('reporte: al llegar a 20 en el mes se bloquea y se ofrece el plan', () => {
  const agotado = cupo({ generados: Array.from({ length: CUPO_REPORTES_FREE }, (_, i) => `id-${i}`) });
  const d = decidirReporte({ plan: 'free', acceso: LIBRE, cupo: agotado, id: 'nueva' });
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.requiere, 'suscripcion');
  assert.match(MENSAJE_RECHAZO.suscripcion, /sin límite/i);
});

test('reporte: el suscrito descarga sin límite', () => {
  const agotado = cupo({ generados: Array.from({ length: CUPO_REPORTES_FREE }, (_, i) => `id-${i}`) });
  const d = decidirReporte({ plan: 'suscrito', acceso: LIBRE, cupo: agotado, id: 'nueva' });
  assert.equal(d.ok, true);
  assert.equal(d.ok === true && d.consume, false);
});

test('reporte: la puerta del contenido se revisa ANTES que la del cupo', () => {
  // Si el orden se invirtiera, el usuario perdería un reporte del mes para
  // enterarse de que no podía pedirlo.
  const d = decidirReporte({
    plan: 'free', acceso: { completa: false, requiere: 'cupo' }, cupo: cupo({ generados: ['a'] }), id: 'b',
  });
  assert.deepEqual(d.cupo.generados, ['a'], 'el cupo no se movió');
});

// ─────────────────────────────── Qué lleva dentro ───────────────────────────────

test('reporte: trae precio, precio/m², descuento, categoría CRECE y comparables', () => {
  const html = construirReporte(datos());
  assert.match(html, /\$320\.000\.000/, 'precio');
  assert.match(html, /\$4\.000\.000/, 'precio por m²');
  assert.match(html, /−27%/, 'descuento frente al mercado de su zona');
  assert.match(html, /Oportunidad Fuerte/, 'categoría del Índice CRECE');
  assert.match(html, /27% por debajo/, 'desviación vs. la mediana');
  assert.match(html, />14</, 'número de comparables');
  // El nivel de confianza se retiró del reporte por decisión del cliente: en un
  // documento se lee como una advertencia sobre el dato que lo acompaña. Lo que
  // sostiene la conclusión —comparables y ámbito— sí sigue, y es lo que se
  // comprueba en las dos líneas de alrededor.
  assert.doesNotMatch(html, /Nivel de confianza/, 'el nivel de confianza ya no va en el reporte');
  assert.match(html, /1\.5 km a la redonda/, 'contra qué se comparó');
});

test('reporte: dice la fecha de generación y que es orientativo', () => {
  const html = construirReporte(datos());
  assert.match(html, /28 de julio de 2026/, 'fecha de generación en hora de Colombia');
  assert.match(html, /Información orientativa/);
  assert.match(html, /un estudio de títulos ni asesoría profesional/);
});

test('reporte: cuando no hay comparables lo dice, no calla', () => {
  // Una sección vacía parece un archivo roto; el usuario merece saber que ahí no
  // hay evidencia con la que estimar.
  const html = construirReporte(datos({ comparables: null, crece: null, descuentoPct: null }));
  assert.match(html, /No hubo suficientes avisos comparables/);
});

test('reporte: la estimación de arriendo va con su nivel de confianza', () => {
  const html = construirReporte(datos({
    arriendo: {
      canonMediano: 2_500_000, rangoBajo: 2_100_000, rangoAlto: 3_000_000,
      canonPorM2: 31_250, n: 11, confianza: 'medium', alcance: 'barrio Laureles',
    },
  }));
  assert.match(html, /Estimación del valor de arrendamiento/);
  assert.match(html, /\$2\.500\.000/);
  assert.match(html, /Media/, 'confianza de la estimación');
  assert.match(html, /no con contratos firmados/);
});

test('reporte: sin estimación de arriendo la sección no se dibuja vacía', () => {
  assert.doesNotMatch(construirReporte(datos({ arriendo: null })), /Estimación del valor de arrendamiento/);
});

test('reporte de remate: avalúo, postura, audiencia, juzgado y aviso jurídico', () => {
  const html = construirReporte(datos({
    kind: 'remate',
    fuente: 'Rama Judicial de Colombia',
    precio: null,
    remate: {
      avaluo: 400_000_000, posturaMinima: 280_000_000, posturaPct: 70,
      fechaAudiencia: '2026-08-14', horaAudiencia: '9:00 A.M.', modalidad: 'Virtual',
      juzgado: 'Juzgado Primero Civil del Circuito de Villeta',
      radicado: '25875310300120200006800', demandante: 'Banco Ejemplo S.A.',
      matricula: '156-108676', depositoPct: 40, cuotaParte: 100,
    },
  }));
  assert.match(html, /\$400\.000\.000/, 'avalúo');
  assert.match(html, /\$280\.000\.000/, 'postura mínima');
  assert.match(html, /14 de agosto de 2026/, 'fecha de audiencia');
  assert.match(html, /Juzgado Primero Civil del Circuito de Villeta/);
  assert.match(html, /Aviso de riesgo jurídico/);
  assert.match(html, /estudio de títulos/);
  // El descuento del remate se mide contra el avalúo del juzgado. Etiquetarlo como
  // el del portal haría creer que está un 30% bajo el mercado del barrio.
  assert.match(html, /Frente al avalúo judicial/);
  assert.doesNotMatch(html, /Frente al mercado de su zona/);
});

test('reporte de remate: el aviso de riesgo va aunque el remate parezca limpio', () => {
  // No depende de banderas del aviso: comprar en subasta es comprar con un
  // proceso judicial detrás, y el reporte es el documento que se lleva el usuario.
  const html = construirReporte(datos({
    kind: 'remate',
    remate: {
      avaluo: null, posturaMinima: null, posturaPct: null, fechaAudiencia: null,
      horaAudiencia: null, modalidad: null, juzgado: null, radicado: null,
      demandante: null, matricula: null, depositoPct: null, cuotaParte: 100,
    },
  }));
  assert.match(html, /Aviso de riesgo jurídico/);
});

test('reporte de remate: la cuota parte se advierte en grande', () => {
  const html = construirReporte(datos({
    kind: 'remate',
    remate: {
      avaluo: 400_000_000, posturaMinima: 280_000_000, posturaPct: 70,
      fechaAudiencia: '2026-08-14', horaAudiencia: null, modalidad: null,
      juzgado: 'Juzgado X', radicado: null, demandante: null, matricula: null,
      depositoPct: null, cuotaParte: 50,
    },
  }));
  assert.match(html, /Se remata solo el 50% del bien/);
  assert.match(html, /copropietario/);
});

test('reporte: no imprime lo que el plan no cubre', () => {
  // Esta es la prueba del muro: con la ficha redactada, dirección, enlace y
  // contacto llegan en null y no pueden aparecer por ningún lado.
  const html = construirReporte(datos({ direccion: null, enlace: null, contacto: null }));
  assert.doesNotMatch(html, /Carrera 70/);
  assert.doesNotMatch(html, /banco\.example/);
  assert.doesNotMatch(html, /Dirección/);
  assert.doesNotMatch(html, /Contacto de la fuente/);
  // Y lo que sí es gratis sigue estando: el reporte no queda vacío.
  assert.match(html, /\$320\.000\.000/);
});

// ─────────────────────────────── Datos ajenos ───────────────────────────────

test('reporte: el HTML que venga del scraping se escapa, no se ejecuta', () => {
  const html = construirReporte(datos({
    titulo: '<script>alert(1)</script>',
    zona: '"><img src=x onerror=alert(2)>',
    caracteristicas: [{ etiqueta: 'Notas', valor: '<b>negrita</b> & "comillas"' }],
  }));
  // Lo que importa no es que la cadena "onerror" desaparezca —como texto plano es
  // inofensiva— sino que no pueda volver a formar una etiqueta.
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>negrita<\/b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/, 'queda como texto visible, no como etiqueta');
  assert.match(html, /&amp; &quot;comillas&quot;/);
});

test('reporte: el archivo generado no contiene ningún script', () => {
  // Ni siquiera uno propio para imprimir: el archivo acaba en el disco de otra
  // persona y no tiene por qué ejecutar nada para poder leerse.
  assert.doesNotMatch(construirReporte(datos()), /<script/i);
  assert.doesNotMatch(construirReporte(datos()), /\son[a-z]+=/i);
});

test('reporte: un enlace que no sea http(s) no se imprime', () => {
  assert.equal(urlSegura('javascript:alert(1)'), null);
  assert.equal(urlSegura('data:text/html,<script>'), null);
  assert.equal(urlSegura('  '), null);
  assert.equal(urlSegura('https://portal.example/x'), 'https://portal.example/x');
  const html = construirReporte(datos({ enlace: 'javascript:alert(1)' }));
  assert.doesNotMatch(html, /javascript:/);
});

test('reporte: escaparHtml cubre los cinco caracteres peligrosos', () => {
  assert.equal(escaparHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
  assert.equal(escaparHtml(null), '');
  assert.equal(escaparHtml(undefined), '');
});

test('reporte: el nombre del archivo no puede romper la cabecera ni la carpeta', () => {
  const nombre = nombreArchivoReporte({ kind: 'banco', id: '../../etc/passwd', ciudad: 'Bogotá D.C. "x"' });
  assert.match(nombre, /^radar-reporte-banco-[a-z0-9-]+\.html$/);
  assert.doesNotMatch(nombre, /["/\\.]{2}/);
  assert.match(nombreArchivoReporte({ kind: 'remate', id: 'abc', ciudad: 'Medellín' }), /medellin/);
});

test('reporte: una fecha suelta no se corre un día al pasarla a hora de Colombia', () => {
  // `2026-08-14` interpretado como medianoche UTC son las 19:00 del 13 en Bogotá.
  assert.equal(fechaCorta('2026-08-14'), '14 de agosto de 2026');
  assert.equal(fechaCorta(null), '—');
  assert.equal(fechaCorta('no-es-fecha'), '—');
});

// ─────────────────────── De fila de base a datos del reporte ───────────────────────

test('reporte: la fila redactada no puede aportar dirección, enlace ni contacto', () => {
  // `redactar()` deja esos campos en null; el mapeo no debe rescatarlos de otro
  // sitio (de `features`, por ejemplo).
  const d = datosDeInmueble({
    kind: 'banco',
    fila: {
      id: 'x1', city: 'medellin', type: 'apartment', price: 300_000_000, price_per_m2: 4_000_000,
      discount_pct: 25, crece_tier: 'oportunidad', crece_index: 0.78,
      address: null, source_url: null, source: 'bancolombia',
      features: { bedrooms: 3, bathrooms: 2, garages: 1, stratum: 5, images: ['a.jpg'] },
    },
    comparables: null, arriendo: null, plan: 'free',
  });
  assert.equal(d.direccion, null);
  assert.equal(d.enlace, null);
  assert.equal(d.contacto, null);
  assert.equal(d.crece?.lectura, 'Oportunidad');
  assert.equal(d.crece?.desviacion, '22% por debajo');
  assert.deepEqual(
    d.caracteristicas.map((c) => c.etiqueta),
    ['Tipo', 'Habitaciones', 'Baños', 'Garajes', 'Estrato'],
  );
});

test('reporte: las características que faltan no salen como "—"', () => {
  const d = datosDeInmueble({
    kind: 'portal',
    fila: { id: 'x', city: 'cali', type: 'lot', price: 90_000_000, area_m2: 500, features: {} },
    comparables: null, arriendo: null, plan: 'free',
  });
  assert.deepEqual(d.caracteristicas, [
    { etiqueta: 'Tipo', valor: 'Lote' },
    { etiqueta: 'Área', valor: '500 m²' },
  ]);
});

test('reporte: un lote no imprime alcobas, garajes ni antigüedad', () => {
  // El portal rellena esos tres campos en 8.715 de los 8.773 lotes activos —casi
  // siempre con cero y con «1 a 8 años»—, así que preguntar «¿trae el dato?» no
  // distingue nada. En un documento que el usuario lleva a una reunión, «Garajes:
  // 0 · Antigüedad: 1 a 8 años» bajo un terreno se lee como una plantilla mal
  // rellenada, y arrastra la credibilidad de lo que sí es cierto.
  const lote = datosDeInmueble({
    kind: 'portal',
    fila: {
      id: 'x', city: 'girardot', type: 'lot', price: 32_000_000, area_m2: 200,
      features: { bedrooms: 0, bathrooms: 0, garages: 0, floor: 1, antiguedad: '1 a 8 años', stratum: 3 },
    },
    comparables: null, arriendo: null, plan: 'free',
  });
  assert.deepEqual(
    lote.caracteristicas.map((c) => c.etiqueta),
    ['Tipo', 'Área', 'Estrato'],
  );

  // Un local sí tiene baños y parqueaderos reales; lo que no tiene son alcobas.
  const local = datosDeInmueble({
    kind: 'portal',
    fila: {
      id: 'y', city: 'espinal', type: 'commercial', price: 55_000_000, area_m2: 30,
      features: { bedrooms: 2, bathrooms: 1, garages: 1, antiguedad: '9 a 15 años' },
    },
    comparables: null, arriendo: null, plan: 'free',
  });
  assert.deepEqual(
    local.caracteristicas.map((c) => c.etiqueta),
    ['Tipo', 'Área', 'Baños', 'Garajes', 'Antigüedad'],
  );
});

test('reporte: un lote no lista «sin parqueadero» como criterio de comparación', () => {
  // El motor declara ese criterio porque el portal publica el campo en cero y no
  // puede distinguir un cero publicado de un campo vacío. En la ficha de un
  // terreno la etiqueta afirma que comparamos parcelas por su garaje.
  const d = datosDeInmueble({
    kind: 'portal',
    fila: { id: 'x', city: 'girardot', type: 'lot', price: 32_000_000, area_m2: 200, features: {} },
    comparables: {
      n: 9, medianaPpm2: 200_000, medianaTotal: null, confianza: 'medium',
      alcance: '1.5 km a la redonda',
      criterios: ['mismo tipo de inmueble', 'mismo sector (1.5 km a la redonda)', 'área similar (±30%)', '0 habitaciones (±1)', 'sin parqueadero'],
      mismoTipo: true, ambitoCiudad: false,
    },
    arriendo: null, plan: 'suscrito',
  });
  assert.deepEqual(d.comparables?.criterios, [
    'mismo tipo de inmueble', 'mismo sector (1.5 km a la redonda)', 'área similar (±30%)',
  ]);
});

test('reporte: cuando la comparación es contra la ciudad entera, el papel lo dice', () => {
  // Los avisos «Confianza baja» se retiraron por decisión del cliente. Los dos
  // hechos que declaraban siguen ahí como dato —contra qué se comparó y si los
  // tipos coincidían—, que es lo que permite juzgar el porcentaje sin que el
  // reporte se desdiga a sí mismo.
  const html = construirReporte(datos({
    comparables: {
      n: 31, medianaPpm2: 2_000_000, medianaTotal: 180_000_000, confianza: 'low',
      alcance: 'espinal (toda la ciudad)', criterios: ['misma ciudad (el aviso no indica barrio exacto)'],
      mismoTipo: false, ambitoCiudad: true,
    },
  }));
  assert.doesNotMatch(html, /Confianza baja/, 'el rótulo de alarma ya no va en el reporte');
  assert.match(html, /Espinal \(toda la ciudad\)/, 'pero el ámbito real sigue declarado');
  assert.match(html, /Tipos mezclados/, 'y que los tipos no coincidían, también');
  // Y cuando la muestra sí es del mismo tipo, la fila lo dice sin ambigüedad.
  assert.match(construirReporte(datos()), /Mismo tipo de inmueble/);
});

test('reporte: el descuento de un remate se mide contra su avalúo, no contra la zona', () => {
  const d = datosDeInmueble({
    kind: 'remate',
    fila: {
      id: 'r1', city: 'bogota', property_type: 'house', appraisal_value: 400_000_000,
      minimum_bid: 280_000_000, minimum_bid_pct: 70, court: 'Juzgado X',
      auction_date: '2026-08-14', cuota_parte: 100, source: 'rematandobienes', features: {},
    },
    comparables: null, arriendo: null, plan: 'suscrito',
  });
  assert.equal(Math.round(d.descuentoPct ?? 0), 30);
  assert.equal(d.remate?.juzgado, 'Juzgado X');
  assert.equal(d.remate?.avaluo, 400_000_000);
  assert.equal(d.titulo, 'Casa en Bogota');
});

test('reporte: un crece_tier desconocido no inventa categoría', () => {
  const d = datosDeInmueble({
    kind: 'banco',
    fila: { id: 'x', city: 'cali', type: 'house', crece_tier: 'categoria_retirada', features: {} },
    comparables: null, arriendo: null, plan: 'free',
  });
  assert.equal(d.crece, null);
});

/**
 * Los textos de la ficha que dependen de una decisión, no de una plantilla.
 *
 * Tres de los hallazgos de la auditoría de copy no se arreglan reescribiendo una
 * frase: hay que decidir algo antes de escribirla —cuántos días son, si el bien
 * se puja o se compra, si el aviso llegó entero—. Esa decisión es la que se
 * comprueba aquí; la frase en sí se ve en una revisión, la decisión no.
 *
 * El cliente son scripts clásicos sin empaquetador, así que no hay nada que
 * importar: se aísla la declaración de `app.js` y se ejecuta en su propio
 * contexto. Si alguien la renombra o la borra, estas pruebas se caen en vez de
 * pasar sobre una función que ya no existe.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const leerApp = () => readFile(new URL('./public/app.js', import.meta.url), 'utf8');

/**
 * Recorta una declaración de nivel superior de `app.js`.
 *
 * Se acumulan líneas desde la declaración hasta que el trozo compila: es la forma
 * de saber que se cerró sin contar llaves a mano, y funciona igual para una
 * función de veinte líneas que para una flecha de una sola.
 */
function declaracion(fuente: string, nombre: string): string {
  const lineas = fuente.split('\n');
  const inicio = lineas.findIndex(
    (l) => l.startsWith(`function ${nombre}(`) || l.startsWith(`const ${nombre} = `),
  );
  assert.notEqual(inicio, -1, `app.js ya no declara «${nombre}»`);
  for (let fin = inicio; fin < lineas.length; fin += 1) {
    const trozo = lineas.slice(inicio, fin + 1).join('\n');
    try {
      new vm.Script(trozo);
      return trozo;
    } catch { /* todavía no cierra: sigue leyendo */ }
  }
  throw new Error(`no se pudo aislar «${nombre}» de app.js`);
}

/**
 * Las líneas que el navegador ejecuta, sin las que solo explican por qué.
 *
 * Los comentarios de este archivo citan los textos viejos para dejar constancia
 * de qué se corrigió; buscarlos ahí sería fallar por la explicación del arreglo.
 */
const lineasDeCodigo = (app: string) =>
  app.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));

/** Ejecuta las declaraciones pedidas en un contexto limpio y las devuelve. */
async function cargar(...nombres: string[]): Promise<Record<string, any>> {
  const fuente = await leerApp();
  const contexto = vm.createContext({});
  const cuerpo = nombres.map((n) => declaracion(fuente, n)).join('\n');
  const expuestas = nombres.map((n) => `this.${n} = ${n};`).join('\n');
  vm.runInContext(`${cuerpo}\n${expuestas}`, contexto);
  return contexto as Record<string, any>;
}

test('el aviso de audiencia concuerda el número con el sustantivo', async () => {
  const { plural } = await cargar('plural');
  // «Audiencia en 2 día(s)» era el texto real de la ficha. El paréntesis es de
  // formulario: lo escribe quien no quiere decidir, y aparece justo en el aviso
  // que le dice a alguien que le queda poco margen para revisar papeles.
  assert.equal(plural(1, 'día', 'días'), '1 día');
  assert.equal(plural(2, 'día', 'días'), '2 días');
  assert.equal(plural(0, 'día', 'días'), '0 días');
  assert.equal(plural(3, 'comparable', 'comparables'), '3 comparables');
});

test('«día(s)» no vuelve a la interfaz por otra puerta', async () => {
  const reincidentes = lineasDeCodigo(await leerApp()).filter((l) => /d[ií]a\(s\)/.test(l));
  assert.deepEqual(reincidentes, [], 'volvió a aparecer «día(s)» en el cliente');
});

test('solo en un remate se puja', async () => {
  const { tituloDueDiligence } = await cargar('tituloDueDiligence');
  assert.equal(tituloDueDiligence('remate'), 'Verificar antes de pujar');
  // Un activo de banco se negocia y se firma: no hay audiencia, ni depósito
  // previo, ni otros postores. Llamarlo «pujar» le hace creer al lector que ese
  // inmueble también sale a subasta, con todo lo que eso implica.
  assert.equal(tituloDueDiligence('banco'), 'Verificar antes de comprar');
  assert.equal(tituloDueDiligence('portal'), 'Verificar antes de comprar');
  assert.equal(tituloDueDiligence(undefined), 'Verificar antes de comprar');
});

test('«pujar» no se escribe suelto en ninguna otra parte del cliente', async () => {
  const sueltas = lineasDeCodigo(await leerApp())
    .filter((l) => /antes de pujar/.test(l) && !l.includes('tituloDueDiligence'));
  assert.deepEqual(sueltas, [], 'hay un «antes de pujar» que no pasa por el tipo de ficha');
});

test('una descripción cortada en la fuente se reconoce', async () => {
  const { descripcionIncompleta } = await cargar(
    'PALABRAS_COLGANTES', 'FINALES_DE_PALABRA', 'descripcionIncompleta',
  );
  // Los cuatro casos son texto real de la base: los bancos publican la
  // descripción dentro de un PDF y se corta donde se acaba la caja.
  assert.ok(descripcionIncompleta(
    'Local ubicado a 1 Km del parque Simón Bolívar de Espinal. El inmueble está dentro '
    + 'de un lote plano, rectangular y esquinero de la urbani',
  ), 'el «…urbani» del informe');
  assert.ok(descripcionIncompleta('Lote de terreno urbano en sector residencial urbani'));
  assert.ok(descripcionIncompleta('Lote donde su relieve esta conformado por una'), 'termina en artículo');
  assert.ok(descripcionIncompleta(
    'Casa de dos plantas, ubicada dentro del perímetro urbano y parcialmente en',
  ), 'termina en preposición');
  assert.ok(descripcionIncompleta(
    'Casa ubicada a 700 metros del centro del municipio de Espinal. Distribución:'
    + 'El predio consta de 2 plantas: Piso 1 – Sala-comedor, cocina,',
  ), 'termina en coma: lo que seguía no cupo');
  assert.ok(descripcionIncompleta(
    'Apartamento amplio para vivir solo o con amigos. Para más información y visitas, contáctanos:',
  ), 'termina en dos puntos y nunca llegó lo que anunciaba');
});

test('una descripción entera no se acusa de incompleta', async () => {
  const { descripcionIncompleta } = await cargar(
    'PALABRAS_COLGANTES', 'FINALES_DE_PALABRA', 'descripcionIncompleta',
  );
  // Marcar de más es peor que marcar de menos: el aviso pone en duda un dato que
  // está bien, y el usuario deja de creerle a los que sí están mal. Todos estos
  // son texto real que NO está cortado, y varios ni siquiera terminan en punto.
  const enteras = [
    'Apartamento con sala-comedor, dos habitaciones, un baño privado. Vetustez de 10 años',
    'Sala, Comedor, 2 Baños, 3 Habitaciones, Cocina, Patio Interior, 2 Balcones, Garaje',
    'Conjunto con zonas comunes como piscinas, canchas, parque para mascotas, entre otros',
    'Casa de dos plantas en el municipio de Santiago de Cali',
    'Apartamento remodelado con portería 24 horas. Ideal CESION DE contrato de leasing',
    'Local comercial en el Centro Comercial Panamá P.H., Local 251C Puerto Colon “C”',
    'Apartamento con vista al parque.',
    'Lote',
  ];
  for (const texto of enteras) {
    assert.equal(descripcionIncompleta(texto), false, `marcó como cortada: «${texto}»`);
  }
  assert.equal(descripcionIncompleta(''), false);
  assert.equal(descripcionIncompleta(null), false);
});

test('la ficha dice quién dejó la descripción a medias', async () => {
  const { bloqueDescripcion, LARGO_MAXIMO_DESCRIPCION } = await cargar(
    'esc', 'PALABRAS_COLGANTES', 'FINALES_DE_PALABRA', 'descripcionIncompleta',
    'LARGO_MAXIMO_DESCRIPCION', 'bloqueDescripcion',
  );

  const cortadaEnOrigen = bloqueDescripcion('Lote de terreno urbano en sector residencial urbani');
  assert.match(cortadaEnOrigen, /Texto incompleto en la fuente original/);

  // Cuando quien corta somos nosotros, el aviso tiene que decir eso y no culpar a
  // la fuente: el aviso original sí trae el resto y el enlace está al pie de la ficha.
  const larguisima = `${'palabra '.repeat(400)}final.`;
  const recortada = bloqueDescripcion(larguisima);
  assert.match(recortada, /Descripción recortada aquí/);
  assert.ok(!recortada.includes('fuente original'), 'no se le echa la culpa a la fuente');
  assert.ok(
    recortada.length < larguisima.length,
    'la descripción larguísima tiene que quedarse en el tope',
  );
  assert.ok(Number(LARGO_MAXIMO_DESCRIPCION) > 0);

  const entera = bloqueDescripcion('Apartamento con vista al parque.');
  assert.ok(!entera.includes('desc-aviso'), 'una descripción entera no lleva nota');

  // El texto del aviso llega tal cual de la fuente y termina en el HTML de la ficha.
  const conHtml = bloqueDescripcion('<img src=x onerror=alert(1)> casa bonita.');
  assert.ok(!conHtml.includes('<img'), 'la descripción se escapa antes de pintarse');

  assert.equal(bloqueDescripcion(''), '');
  assert.equal(bloqueDescripcion(null), '');
});

test('un remate sin tipo lo dice en vez de llamarse «Inmueble» a secas', async () => {
  const { tipoIdentificado } = await cargar('tipoIdentificado');
  // Uno de cada seis avisos del juzgado llega sin tipo. «Inmueble» se lee como un
  // dato —vivienda genérica— cuando ese mismo aviso puede ser un lote, una bodega
  // o un vehículo.
  assert.equal(tipoIdentificado('house'), true);
  assert.equal(tipoIdentificado(null), false);
  assert.equal(tipoIdentificado(undefined), false);
  assert.equal(tipoIdentificado(''), false);
  assert.equal(tipoIdentificado('other'), false, '«Otros» tampoco dice qué se subasta');
  assert.equal(tipoIdentificado('others'), false);

  const app = await leerApp();
  assert.match(app, /const TIPO_POR_CONFIRMAR = 'Tipo por confirmar';/);
});

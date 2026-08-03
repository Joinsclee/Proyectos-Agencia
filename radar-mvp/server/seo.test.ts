/**
 * Lo que Google lee, comprobado.
 *
 * Estas piezas fallan en silencio: un canonical mal formado, un título repetido o
 * un enlace a una ciudad sin inventario no rompen nada en pantalla — nadie se
 * entera hasta que pasan meses y las URLs no están indexadas. Así que lo que se
 * comprueba aquí es sobre todo lo que NO debe pasar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIAS_SEO, metaDeUrl, nombreDeCiudad, robotsTxt, urlDeCategoria,
} from './seo.js';

const meta = (qs: string) => metaDeUrl(new URLSearchParams(qs));

test('SEO: cada combinación tiene su propio título, no el genérico repetido', () => {
  // Era el hallazgo del documento: todas las URLs devolvían «Radar de
  // Oportunidades Inmobiliarias» y ninguna traía descripción, así que para Google
  // eran la misma página muchas veces.
  const casasBogota = meta('tab=remates&type=house&city=bogota');
  const aptosMedellin = meta('tab=remates&type=apartment&city=medellin');
  const portada = meta('');

  assert.match(casasBogota.title, /^Casas en remate en Bogotá \|/);
  assert.match(aptosMedellin.title, /^Apartamentos en remate en Medellín \|/);
  const titulos = new Set([casasBogota.title, aptosMedellin.title, portada.title]);
  assert.equal(titulos.size, 3, 'tres URLs distintas, tres títulos distintos');

  // Y cada una con su descripción, que es lo que se lee bajo el enlace en Google.
  for (const m of [casasBogota, aptosMedellin, portada]) {
    assert.ok(m.description.length > 60, 'una descripción corta no la usa Google');
    assert.ok(m.description.length < 200, 'una descripción larga la corta Google');
  }
  // En remates se nombra lo que de verdad hay en la ficha, no un genérico.
  assert.match(casasBogota.description, /postura mínima|avalúo|audiencia/);
});

test('SEO: «apartamentos baratos» se dice en masculino', () => {
  // La construcción sale de «Apartamentos» + «baratas» y hay que corregirla; un
  // título con una concordancia rota se lee como una página generada por una
  // máquina, que es exactamente lo que no conviene parecer en un resultado.
  assert.match(meta('tab=portal&tier=oportunidad_fuerte&type=apartment&city=cali').title,
    /^Apartamentos baratos en Cali/);
  assert.match(meta('tab=portal&tier=oportunidad_fuerte&type=house&city=cali').title,
    /^Casas baratas en Cali/);
});

test('SEO: la canónica descarta lo que no cambia el contenido', () => {
  // El orden, la página y los rangos de precio multiplican variantes de la misma
  // lista. Sin canonical, Google las trata como duplicados y reparte entre todas
  // la relevancia que debería ir a una.
  const conRuido = meta('tab=portal&type=house&city=cali&order=precio_desc&page=3&priceMax=500');
  assert.equal(conRuido.canonical, '/?tab=portal&type=house&city=cali');
  // La portada es la raíz, no «/?».
  assert.equal(meta('').canonical, '/');
  assert.equal(meta('tab=home').canonical, '/');
});

test('SEO: las URLs de las categorías son las que entiende la app', () => {
  // Si el orden o el nombre de un parámetro se desvía de lo que lee
  // `url-estado.js`, el enlace abre la app sin filtrar y el visitante aterriza en
  // una lista que no pidió.
  const remates = CATEGORIAS_SEO.find((c) => c.id === 'casas-remate')!;
  assert.equal(urlDeCategoria(remates, 'bogota'), '/?tab=remates&type=house&city=bogota');
  assert.equal(urlDeCategoria(remates), '/?tab=remates&type=house');

  const baratas = CATEGORIAS_SEO.find((c) => c.id === 'casas-baratas')!;
  assert.equal(urlDeCategoria(baratas, 'pereira'),
    '/?tab=portal&tier=oportunidad_fuerte&type=house&city=pereira');
});

test('SEO: los nombres de ciudad se escriben con tilde', () => {
  // El slug de la base va sin tildes porque así se filtra, pero el texto del
  // enlace lo lee una persona —y es el texto que Google asocia a la URL—.
  assert.equal(nombreDeCiudad('bogota'), 'Bogotá');
  assert.equal(nombreDeCiudad('medellin'), 'Medellín');
  assert.equal(nombreDeCiudad('cucuta'), 'Cúcuta');
  // Una ciudad que no está en la tabla no se queda en minúsculas.
  assert.equal(nombreDeCiudad('sopo'), 'Sopo');
  assert.equal(nombreDeCiudad('santa marta'), 'Santa Marta');
});

test('SEO: robots.txt no deja fuera el sitio ni deja dentro la API', () => {
  const txt = robotsTxt('https://radarcrece.com');
  assert.match(txt, /^User-agent: \*/m);
  assert.match(txt, /^Allow: \/$/m, 'el sitio se rastrea');
  assert.match(txt, /^Disallow: \/api\//m, 'la API no aporta nada en un buscador');
  assert.match(txt, /^Disallow: \/cuenta$/m);
  assert.match(txt, /Sitemap: https:\/\/radarcrece\.com\/sitemap\.xml/);
  // Lo que nunca puede aparecer: un bloqueo total. Se ha ido más de un sitio a
  // cero de tráfico por un `Disallow: /` que quedó de una versión de pruebas.
  assert.doesNotMatch(txt, /^Disallow: \/$/m);
});

/**
 * La red para uno de los fallos que mordió tres veces en esta rama.
 *
 * `styles.css` no agrupa sus media queries al final: tiene 49 bloques `@media`
 * repartidos entre las reglas normales. Como ninguno sube la especificidad, un
 * bloque móvil escrito ANTES de la regla base que pretende corregir pierde por
 * orden de cascada y no se aplica nunca. En silencio: no hay error, no hay
 * advertencia, y en una captura de móvil no se nota.
 *
 * Eso es lo que vigila esta prueba, y solo eso. Conviene decir qué NO cubre,
 * porque las otras dos veces el fallo fue de otra clase:
 *
 *  · SÍ lo caza — la regla responsive inalcanzable. `.marca-ag { height: 20px }`
 *    escrito 350 líneas por encima de `.marca-ag { height: 26px }`: el logotipo
 *    se quedaba a tamaño de escritorio. La prueba lo señala con las dos líneas.
 *
 *  · NO lo caza — la regla responsive que sí se aplica pero ya no debería.
 *    `.sub { font-size: 0.94rem }` en un bloque de 760 px era CSS perfectamente
 *    válido y ganaba como corresponde; el problema es que sobrevivió al rediseño
 *    que convirtió `.sub` en el titular de la portada, y dejó el titular en
 *    15 px en móvil. Eso no es un error de cascada: es una regla obsoleta, y
 *    para saber que lo es hay que conocer la intención. Se detecta midiendo en
 *    el navegador, no leyendo el archivo.
 *
 *  · NO lo caza — la regla inalcanzable por culpa del padre.
 *    `@media (max-width: 560px) { .marca-ag { display: none } }` no llegaba a
 *    ejecutarse porque a 760 px el contenedor ya estaba oculto. Para verlo hay
 *    que resolver el árbol del documento, no la hoja.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** Un `selector { … }` con la posición donde empieza y si está dentro de un @media. */
type Regla = { selector: string; propiedades: Set<string>; enMedia: boolean; linea: number; posicion: number };

/**
 * Trocea la hoja en reglas planas.
 *
 * No es un analizador de CSS y no pretende serlo: solo necesita saber, para cada
 * bloque `selector { … }`, qué propiedades declara y si está dentro de un
 * `@media`. Un solo recorrido con una pila —un elemento por llave abierta, que
 * dice si esa llave era una regla «at» condicional—; contar la profundidad con
 * un número se desincroniza en cuanto aparece un `@keyframes` o un bloque
 * anidado, y entonces la prueba deja de ver justo lo que viene a vigilar.
 *
 * Los comentarios se blanquean antes, conservando la longitud para que las
 * posiciones sigan sirviendo para calcular el número de línea: este archivo
 * tiene muchos y llevan llaves y punto y coma dentro.
 */
function trocear(css: string): Regla[] {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const reglas: Regla[] = [];
  const pila: boolean[] = [];          // true = esta llave la abrió un @media/@supports
  let preludioDesde = 0;
  let linea = 1;

  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (c === '\n') linea += 1;
    if (c === '{') {
      const preludio = limpio.slice(preludioDesde, i).trim().replace(/\s+/g, ' ');
      const esCondicional = /^@(media|supports|container)\b/.test(preludio);
      const esOtraAt = preludio.startsWith('@') && !esCondicional;
      pila.push(esCondicional);
      if (!preludio.startsWith('@')) {
        // Es una regla de verdad. Su cuerpo llega hasta la llave que la cierra.
        const cuerpo = cuerpoDe(limpio, i);
        const propiedades = new Set(
          cuerpo
            .split(';')
            .map((d) => d.split(':')[0]?.trim().toLowerCase())
            .filter((d): d is string => !!d && /^[a-z-]+$/.test(d)),
        );
        const enMedia = pila.slice(0, -1).some(Boolean);
        for (const selector of preludio.split(',')) {
          const s = selector.trim().replace(/\s+/g, ' ');
          if (s) reglas.push({ selector: s, propiedades, enMedia, linea, posicion: i });
        }
      }
      if (esOtraAt) {
        // @keyframes y compañía: dentro no hay selectores que nos interesen.
        const fin = finDe(limpio, i);
        for (let j = i; j < fin; j += 1) if (limpio[j] === '\n') linea += 1;
        pila.pop();
        i = fin;
      }
      preludioDesde = i + 1;
    } else if (c === '}') {
      pila.pop();
      preludioDesde = i + 1;
    } else if (c === ';' && !pila.length) {
      preludioDesde = i + 1;           // @import, @charset y demás sentencias sueltas
    }
  }
  return reglas;
}

/** El texto entre la llave que abre en `abre` y la que la cierra. */
function cuerpoDe(css: string, abre: number): string {
  return css.slice(abre + 1, finDe(css, abre));
}

/** Posición de la llave que cierra la que abre en `abre`. */
function finDe(css: string, abre: number): number {
  let nivel = 0;
  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === '{') nivel += 1;
    else if (css[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return i;
    }
  }
  return css.length;
}

const HOJAS = ['server/public/styles.css', 'server/public/portal.css', 'server/public/legal.css'];

test('ninguna regla de @media queda anulada por su propia regla base escrita más abajo', async () => {
  const anuladas: string[] = [];

  for (const hoja of HOJAS) {
    const css = await leer(hoja);
    const reglas = trocear(css);
    const base = reglas.filter((r) => !r.enMedia);

    for (const movil of reglas.filter((r) => r.enMedia)) {
      for (const b of base) {
        if (b.selector !== movil.selector) continue;
        // Misma especificidad y más abajo en el archivo: gana la base, y la
        // regla responsive no llega a aplicarse nunca.
        if (b.posicion <= movil.posicion) continue;
        for (const prop of movil.propiedades) {
          if (b.propiedades.has(prop)) {
            anuladas.push(`${hoja}: \`${movil.selector} { ${prop} }\` de la línea ${movil.linea} lo pisa la regla base de la línea ${b.linea}`);
          }
        }
      }
    }
  }

  assert.deepEqual(
    anuladas,
    [],
    'Hay reglas responsive que el navegador no aplica nunca. Mueve el bloque @media DEBAJO '
      + 'de la regla base que corrige, o sube su especificidad:\n  - ' + anuladas.join('\n  - '),
  );
});

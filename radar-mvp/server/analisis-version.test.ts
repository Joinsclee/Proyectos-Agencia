/**
 * La red que faltaba: que nadie cambie las reglas del análisis sin caducar lo ya
 * guardado.
 *
 * Este caché ha mordido tres veces, y las tres el arreglo del código era correcto:
 * lo que faltó fue subir `VERSION_ANALISIS`. Pasa porque el defecto se corrige en
 * `server/ai.ts` —el prompt, las validaciones— y la versión vive en
 * `server/analysis.ts`, así que es fácil arreglar una cosa y olvidar la otra. El
 * síntoma no aparece en pruebas: la generación queda impecable y el usuario sigue
 * viendo el texto viejo, porque su ficha ya estaba analizada.
 *
 * Así que se firma el contenido de `ai.ts` (sin comentarios ni espacios, para que
 * reescribir una explicación no dispare la alarma) y se ata esa firma a la
 * versión. Si cambian las reglas, esta prueba falla y dice exactamente qué hacer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** El código de verdad: sin comentarios, sin líneas en blanco, sin sangría. */
function esqueleto(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')      // bloques /* … */
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}

const firmaDe = (ruta: string) => createHash('sha256').update(esqueleto(ruta)).digest('hex').slice(0, 16);

/**
 * Firma de `server/ai.ts` con la versión 4. Si esta prueba falla:
 *
 *  1. ¿Tu cambio altera lo que el modelo responde o lo que se publica de su
 *     respuesta? Entonces sube `VERSION_ANALISIS` en server/analysis.ts EN ESTE
 *     MISMO COMMIT, y pega aquí la firma nueva que imprime el error.
 *  2. ¿Es un cambio que no afecta a nada de eso (renombrar una variable, mover
 *     una función)? Pega la firma nueva y sigue: la versión no hace falta.
 *
 * Lo que NO se puede hacer es ignorarla. Sin el número nuevo, el arreglo solo
 * alcanza a las fichas que nadie ha abierto todavía.
 */
const FIRMA_ESPERADA = 'b1871c6c7d492288';
const VERSION_DECLARADA = 5;

test('análisis: cambiar las reglas de la IA obliga a caducar lo ya guardado', () => {
  const firma = firmaDe(join(AQUI, 'ai.ts'));
  assert.equal(
    firma,
    FIRMA_ESPERADA,
    `Cambiaron las reglas de server/ai.ts.\n`
      + `Si el cambio altera lo que se le muestra al usuario, sube VERSION_ANALISIS `
      + `(hoy ${VERSION_DECLARADA}) en server/analysis.ts en este mismo commit.\n`
      + `Después, pon FIRMA_ESPERADA = '${firma}' en esta prueba.`,
  );

  // Y que la versión declarada aquí sea la de verdad, para que el mensaje de
  // arriba no envejezca en silencio.
  const analysis = readFileSync(join(AQUI, 'analysis.ts'), 'utf8');
  const real = Number(/const VERSION_ANALISIS = (\d+)/.exec(analysis)?.[1]);
  assert.equal(real, VERSION_DECLARADA, 'actualiza VERSION_DECLARADA en esta prueba');
});

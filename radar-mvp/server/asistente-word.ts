/**
 * Los documentos de Word se convierten a texto AQUÍ, antes de salir hacia n8n.
 *
 * POR QUÉ AQUÍ Y NO EN n8n, que es donde se extraen el PDF y el texto plano: n8n
 * no tiene un extractor de Word. Su nodo de texto plano sobre un `.docx` devuelve
 * los bytes del zip, y el modelo responde —con razón— que no puede abrirlo. Se
 * probó y falla.
 *
 * POR QUÉ NO EN EL NAVEGADOR, que es como lo resuelven las páginas de los tutores
 * legal y tributario: ellas cargan la biblioteca desde un CDN, y la política de
 * seguridad del Radar es `script-src 'self'`. Servirla desde aquí significaría
 * meter 150 KB de JavaScript en la carga inicial de todo el mundo para algo que
 * usa una minoría, y además el servidor tendría que fiarse del texto que le
 * mandara el navegador.
 *
 * El resultado viaja como texto plano, así que n8n lo trata por el mismo camino
 * que un `.txt` y el workflow no necesita saber que los Word existen.
 */
import mammoth from 'mammoth';
import { createLogger } from '../lib/logger.js';

const log = createLogger('asistente');

/** Las extensiones que llegan aquí. */
export const EXTENSIONES_WORD = ['doc', 'docx'] as const;

export function esWord(nombre: string): boolean {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  return (EXTENSIONES_WORD as readonly string[]).includes(ext);
}

export type ResultadoWord =
  | { ok: true; texto: string }
  | { ok: false; error: string };

/**
 * Saca el texto de un `.docx`.
 *
 * Solo el formato moderno. El `.doc` de Word 97-2003 no es un zip sino un
 * contenedor binario propietario, y mammoth no lo abre: falla con el mismo error
 * que cualquier archivo que no sea un zip. En vez de dejar que el usuario lo
 * descubra gastando una consulta de su cupo, se le dice qué hacer —guardarlo como
 * `.docx`, que es un menú en su propio Word—.
 */
export async function textoDeWord(base64: string, nombre: string): Promise<ResultadoWord> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, error: 'No pude leer ese archivo. Vuelve a adjuntarlo.' };
  }
  if (!buffer.length) return { ok: false, error: 'El archivo llegó vacío. Vuelve a intentarlo.' };

  try {
    const { value } = await mammoth.extractRawText({ buffer });
    const texto = value.trim();
    if (!texto) {
      // Un Word que solo tiene imágenes dentro. No es un error del sistema, así
      // que se explica en vez de fallar.
      return {
        ok: false,
        error: 'Ese documento no tiene texto que pueda leer. Si el contenido son imágenes escaneadas, '
          + 'súbelas como imagen (JPG o PNG) y sí puedo mirarlas.',
      };
    }
    return { ok: true, texto };
  } catch (e) {
    log.warn(`no se pudo extraer «${nombre}»: ${e instanceof Error ? e.message : String(e)}`);
    const antiguo = (nombre.split('.').pop() ?? '').toLowerCase() === 'doc';
    return {
      ok: false,
      error: antiguo
        ? 'Ese Word está en el formato antiguo (.doc), que no puedo abrir. Ábrelo en Word y guárdalo '
          + 'como .docx («Guardar como» → Documento de Word), o pégame aquí el texto.'
        : 'No pude leer ese documento de Word. Puede estar dañado o protegido con contraseña.',
    };
  }
}

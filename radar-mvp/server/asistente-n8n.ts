/**
 * El puente entre el Radar y el workflow del asistente en n8n.
 *
 * POR QUÉ EXISTE, y no se llama al webhook desde el navegador como hacen los
 * tutores legal y tributario en sus propias páginas. Dos razones, y las dos son
 * dirimentes:
 *
 *  1. El límite de 30 consultas al mes sería decorativo. Un webhook al que llega
 *     el navegador es un webhook al que llega cualquiera: bastaría con abrir la
 *     consola y repetir la petición para preguntar sin límite, y cada pregunta
 *     cuesta tokens que pagamos nosotros.
 *  2. La política de seguridad del Radar es `connect-src 'self'`. El navegador no
 *     puede hablar con otro dominio, y abrirla para n8n significaría abrirla para
 *     todo lo que viva en ese dominio.
 *
 * De paso resuelve un tercer problema: el webhook y su secreto no aparecen en el
 * código que se descarga el visitante.
 */
import { env } from '../lib/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('asistente');

/** Cuánto se espera a n8n antes de rendirse. */
const TIMEOUT_MS = 90_000;

export function asistenteDisponible(): boolean {
  return Boolean(env.RADAR_ASISTENTE_WEBHOOK && env.RADAR_ASISTENTE_SECRETO);
}

export interface PeticionAsistente {
  pregunta: string;
  /** Identifica la conversación. Es el id de la cuenta: la memoria es del usuario. */
  sessionId: string;
  adjunto?: { nombre: string; mime: string; base64: string };
}

export type RespuestaAsistente =
  | { ok: true; respuesta: string }
  | { ok: false; error: string };

/**
 * Manda la pregunta al workflow y devuelve la respuesta del agente.
 *
 * El contrato de salida es el mismo que ya usan los dos tutores: la respuesta
 * puede venir como objeto o dentro de un array de un elemento, y el texto puede
 * llamarse `output` o alguno de sus alias. Se aceptan todos porque n8n cambia la
 * forma según por qué rama del workflow salió, y una respuesta buena que no
 * sabemos leer se ve igual que un fallo.
 */
export async function preguntarAlAsistente(peticion: PeticionAsistente): Promise<RespuestaAsistente> {
  if (!env.RADAR_ASISTENTE_WEBHOOK || !env.RADAR_ASISTENTE_SECRETO) {
    return { ok: false, error: 'El asistente no está disponible en este momento.' };
  }
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(env.RADAR_ASISTENTE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: control.signal,
      body: JSON.stringify({
        pregunta: peticion.pregunta,
        sessionId: peticion.sessionId,
        // El secreto viaja en el cuerpo porque es lo que el workflow reenvía luego
        // en la cabecera de la herramienta de búsqueda, y allí solo tiene acceso a
        // `$json.body`.
        secreto: env.RADAR_ASISTENTE_SECRETO,
        adjunto_base64: peticion.adjunto?.base64 ?? '',
        adjunto_nombre: peticion.adjunto?.nombre ?? '',
        adjunto_mime: peticion.adjunto?.mime ?? '',
      }),
    });
    if (!res.ok) {
      log.error(`n8n devolvió ${res.status}`);
      return { ok: false, error: 'El asistente no pudo responder. Vuelve a intentarlo en un momento.' };
    }
    const crudo: unknown = await res.json();
    const texto = extraerTexto(crudo);
    if (!texto) {
      log.error('n8n respondió sin texto reconocible');
      return { ok: false, error: 'El asistente no pudo responder. Vuelve a intentarlo en un momento.' };
    }
    return { ok: true, respuesta: texto };
  } catch (e) {
    // Un aborto por tiempo se distingue de un fallo de red: la respuesta que ve
    // el usuario es distinta, porque en un caso puede reintentar ya y en el otro
    // conviene que espere.
    const porTiempo = e instanceof Error && e.name === 'AbortError';
    log.error(`consulta fallida${porTiempo ? ' (tiempo agotado)' : ''}: ${e instanceof Error ? e.message : String(e)}`);
    return {
      ok: false,
      error: porTiempo
        ? 'La consulta está tardando más de lo normal. Prueba con una pregunta más corta.'
        : 'No pude conectarme con el asistente. Vuelve a intentarlo en un momento.',
    };
  } finally {
    clearTimeout(reloj);
  }
}

/** Los nombres que puede tener el texto de la respuesta, en orden de preferencia. */
const ALIAS = ['output', 'respuesta', 'respuesta_final', 'response', 'message', 'text'] as const;

export function extraerTexto(crudo: unknown): string | null {
  const dato = Array.isArray(crudo) ? crudo[0] : crudo;
  if (!dato || typeof dato !== 'object') return null;
  for (const alias of ALIAS) {
    const valor = (dato as Record<string, unknown>)[alias];
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
  }
  return null;
}

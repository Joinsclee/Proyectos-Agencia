/**
 * El asistente del Radar: cuántas preguntas puede hacer cada quien, y qué puede
 * adjuntar.
 *
 * Es el hermano de `server/cupo.ts` —mismo patrón, mismo sitio de
 * almacenamiento— pero cuenta otra cosa. El cupo de fichas mide contenido
 * consumido; esto mide conversaciones, que cuestan dinero real por token en cada
 * turno. Separarlos importa: alguien que gastó sus 20 fichas sigue pudiendo
 * preguntar, y alguien que agotó las preguntas sigue pudiendo abrir fichas. Un
 * solo contador para las dos cosas convertiría cada pregunta en una ficha menos,
 * que no es lo que se prometió en ninguno de los dos sitios.
 *
 * Los tres modos, igual que en el resto del producto:
 *   · anónimo   → no lo ve siquiera; el botón no se pinta
 *   · free      → LIMITE_CONSULTAS_FREE preguntas por mes calendario
 *   · suscrito  → sin límite
 *
 * DÓNDE VIVE: en `app_metadata`, como el cupo de fichas. Nunca en el navegador ni
 * en `user_metadata`. Un límite que el limitado puede reescribir no es un límite,
 * y aquí cada consulta cuesta dinero: si el contador viviera en `localStorage`,
 * vaciarlo sería gratis y la factura la pagaríamos nosotros.
 */
import { z } from 'zod';
import { diasParaReinicio, periodoDe } from './cupo.js';

/** Preguntas que un registrado del plan gratuito puede hacer por mes calendario. */
export const LIMITE_CONSULTAS_FREE = 30;

export const ConsultasSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  usadas: z.number().int().min(0).max(100_000),
});

export type Consultas = z.infer<typeof ConsultasSchema>;

export interface EstadoConsultas {
  /** `null` para suscritos: sin límite. */
  limite: number | null;
  usadas: number;
  restantes: number | null;
  periodo: string;
  ilimitado: boolean;
  /** Solo cuando hay límite: lo necesita el aviso de «se te acabaron». */
  diasParaReinicio?: number;
}

/**
 * Consultas del periodo vigente. Si lo guardado es de un mes anterior se
 * devuelve en cero: el reinicio ocurre AL LEER, sin ningún proceso programado
 * que pueda no correr. Mismo criterio que `leerCupo`, y por la misma razón —un
 * cron que se cae dejaría a la gente sin su mes nuevo.
 */
export function leerConsultas(
  metadata: Record<string, unknown> | null | undefined,
  ahora: Date = new Date(),
): Consultas {
  const periodo = periodoDe(ahora);
  const parsed = ConsultasSchema.safeParse(metadata?.assistant_quota);
  if (!parsed.success || parsed.data.periodo !== periodo) return { periodo, usadas: 0 };
  return parsed.data;
}

export function estadoConsultas(
  consultas: Consultas,
  plan: 'anonimo' | 'free' | 'suscrito',
): EstadoConsultas {
  if (plan === 'suscrito') {
    return { limite: null, usadas: 0, restantes: null, periodo: consultas.periodo, ilimitado: true };
  }
  const limite = plan === 'free' ? LIMITE_CONSULTAS_FREE : 0;
  const usadas = Math.min(consultas.usadas, limite);
  return {
    limite,
    usadas,
    restantes: Math.max(0, limite - usadas),
    periodo: consultas.periodo,
    ilimitado: false,
    diasParaReinicio: diasParaReinicio(ahora()),
  };
}

// `estadoConsultas` no recibe la fecha: se calcula al vuelo para que el número de
// días sea el de AHORA y no el del momento en que se leyó la metadata.
function ahora(): Date {
  return new Date();
}

export type ResultadoConsulta =
  | { permitido: true; consultas: Consultas }
  | { permitido: false; motivo: 'anonimo' | 'agotado'; consultas: Consultas };

/**
 * Decide si esta pregunta se atiende y devuelve el contador resultante. No
 * escribe nada: la persistencia se hace fuera, para poder probar la decisión sin
 * tocar Supabase.
 *
 * El anónimo se distingue del agotado a propósito. Son dos mensajes distintos
 * —«crea tu cuenta» y «vuelve el día 1»— y una sola respuesta genérica dejaría a
 * la mitad de la gente sin saber qué hacer a continuación.
 */
export function consumirConsulta(
  consultas: Consultas,
  plan: 'anonimo' | 'free' | 'suscrito',
): ResultadoConsulta {
  if (plan === 'suscrito') return { permitido: true, consultas };
  if (plan === 'anonimo') return { permitido: false, motivo: 'anonimo', consultas };
  if (consultas.usadas >= LIMITE_CONSULTAS_FREE) {
    return { permitido: false, motivo: 'agotado', consultas };
  }
  return { permitido: true, consultas: { periodo: consultas.periodo, usadas: consultas.usadas + 1 } };
}

// ──────────────────────────── Adjuntos ────────────────────────────

/**
 * ¿Puede este plan adjuntar documentos e imágenes?
 *
 * Solo el de pago. Un adjunto se convierte en texto y ese texto entra completo en
 * la ventana de contexto de cada turno siguiente, así que una consulta con un
 * contrato de veinte páginas cuesta varias veces lo que una pregunta suelta. Con 30
 * consultas gratuitas al mes por persona, eso se acumula rápido.
 *
 * Lo decidió el cliente al preguntar justamente por el coste: «tal vez podríamos
 * dejar que en la versión free no hubiese carga de documentos, ni imágenes, sino
 * dejarlos para la versión de pago».
 */
export function puedeAdjuntar(plan: 'anonimo' | 'free' | 'suscrito'): boolean {
  return plan === 'suscrito';
}

/**
 * 10 MB, el mismo tope que los tutores legal y tributario.
 *
 * No es un número elegido aquí: quien ya usó esos asistentes aprendió ese límite,
 * y darle otro distinto en la misma marca sería gratuito de evitar. Cubre de
 * sobra lo que la gente adjunta —una promesa de compraventa escaneada, un
 * certificado de tradición, la foto de un aviso— y deja fuera el vídeo, que este
 * asistente no sabría leer de todos modos.
 */
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;

/** Lo mismo, ya escrito, para no formatearlo en cuatro sitios distintos. */
export const MAX_ADJUNTO_ETIQUETA = '10 MB';

/**
 * Qué se puede subir.
 *
 * Documentos, como los tutores, más imágenes: el cliente las pidió expresamente y
 * en este dominio son la mitad de los casos —la foto de un aviso pegado en una
 * reja, el pantallazo de un edicto, la captura de una publicación de remate—.
 * Quien tiene eso en el móvil no tiene el PDF.
 */
export const TIPOS_ADJUNTO = [
  { ext: 'pdf', mime: 'application/pdf', clase: 'documento' },
  { ext: 'doc', mime: 'application/msword', clase: 'documento' },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', clase: 'documento' },
  { ext: 'txt', mime: 'text/plain', clase: 'documento' },
  { ext: 'jpg', mime: 'image/jpeg', clase: 'imagen' },
  { ext: 'jpeg', mime: 'image/jpeg', clase: 'imagen' },
  { ext: 'png', mime: 'image/png', clase: 'imagen' },
  { ext: 'webp', mime: 'image/webp', clase: 'imagen' },
] as const;

/** Para el `accept` del `<input type="file">` y para el texto de ayuda. */
export const ACCEPT_ADJUNTO = TIPOS_ADJUNTO.map((t) => `.${t.ext}`).join(',');

export type ErrorAdjunto = { ok: false; error: string };
export type AdjuntoValido = { ok: true; ext: string; clase: 'documento' | 'imagen' };

/**
 * Comprueba un adjunto ANTES de aceptarlo.
 *
 * Se valida por extensión y no por el `Content-Type` que declara el navegador
 * porque ese lo pone quien sube: un `.exe` renombrado llegaría anunciándose como
 * `application/pdf` sin que nadie lo impida. La extensión tampoco prueba nada por
 * sí sola, pero es lo que el usuario ve, y quien decide de verdad qué hacer con
 * el contenido es n8n, que lo abre en su propio entorno y nunca en el nuestro.
 *
 * Los mensajes dicen el límite y el formato concretos porque un «archivo no
 * válido» a secas obliga a adivinar cuál de las dos cosas falló.
 */
export function validarAdjunto(
  nombre: string,
  tamanoBytes: number,
): AdjuntoValido | ErrorAdjunto {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  const tipo = TIPOS_ADJUNTO.find((t) => t.ext === ext);
  if (!tipo) {
    return {
      ok: false,
      error: `Ese formato no lo puedo leer. Acepto PDF, Word, texto e imágenes (${ACCEPT_ADJUNTO}).`,
    };
  }
  if (tamanoBytes <= 0) {
    return { ok: false, error: 'El archivo llegó vacío. Vuelve a intentarlo.' };
  }
  if (tamanoBytes > MAX_ADJUNTO_BYTES) {
    return {
      ok: false,
      error: `Ese archivo pesa ${formatearBytes(tamanoBytes)} y el máximo es ${MAX_ADJUNTO_ETIQUETA}.`,
    };
  }
  return { ok: true, ext, clase: tipo.clase };
}

/** Tamaño legible: lo lee una persona a la que acaban de rechazarle un archivo. */
export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

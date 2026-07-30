/**
 * Recuperar la contraseña olvidada.
 *
 * Dos pasos separados: pedir el enlace (`solicitarRecuperacion`) y usarlo para
 * poner una contraseña nueva (`restablecerPassword`).
 *
 * EL CORREO LO MANDAMOS NOSOTROS, no Supabase. Supabase sabe enviarlo solo, pero
 * su remitente de cortesía tiene un tope de unos pocos correos por hora y escribe
 * en inglés: en el día que a diez personas se les olvide la contraseña, la mitad
 * no recibiría nada y no habría forma de saberlo. Aquí se genera el enlace con la
 * API de administración y se envía por el mismo Resend que ya despacha las
 * alertas, con el texto en español y con registro de lo que pasó.
 *
 * NUNCA se dice si un correo existe. Ni en la respuesta, ni en el mensaje de
 * error, ni por omisión: pedir recuperación para una dirección desconocida
 * responde exactamente lo mismo que para una registrada. Un formulario que
 * distingue ambos casos es una lista de clientes que cualquiera puede consultar
 * probando direcciones, y aquí los clientes son inversionistas inmobiliarios.
 */
import { z } from 'zod';
import { supabase, authClient } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { env } from '../lib/env.js';

const log = createLogger('recuperar');

const SolicitudSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
});

const CambioSchema = z.object({
  token: z.string().min(20, 'El enlace no es válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
});

/** Lo que ve quien pide recuperar, exista o no la cuenta. */
const RESPUESTA_NEUTRA = {
  ok: true as const,
  mensaje: 'Si ese correo tiene cuenta en el Radar, te llega un enlace en un par de minutos. '
    + 'Revisa también la carpeta de spam.',
};

export type ResultadoSolicitud = typeof RESPUESTA_NEUTRA | { ok: false; error: string };

export function correoDeRecuperacionDisponible(): boolean {
  return Boolean(env.RESEND_API_KEY && env.ALERTS_FROM_EMAIL);
}

/**
 * Pide el enlace para poner una contraseña nueva.
 *
 * Un fallo al generar el enlace o al enviar el correo se registra pero NO se le
 * cuenta a quien lo pidió: decir «no se pudo enviar» a una dirección y «listo» a
 * otra es la misma filtración por la puerta de atrás.
 */
export async function solicitarRecuperacion(input: unknown): Promise<ResultadoSolicitud> {
  const parsed = SolicitudSchema.safeParse(input);
  // El correo mal escrito sí se dice: no revela nada sobre quién tiene cuenta y
  // sin ese aviso la persona se queda esperando un correo que nunca pidió bien.
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Correo inválido' };
  const { email } = parsed.data;

  if (!correoDeRecuperacionDisponible()) {
    log.error(`no hay correo configurado: la recuperación de ${email.slice(0, 3)}*** no salió`);
    return RESPUESTA_NEUTRA;
  }

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${env.APP_BASE_URL.replace(/\/$/, '')}/auth/callback` },
    });
    // Aquí es donde Supabase delata si la cuenta existe. Se traga a propósito.
    if (error || !data?.properties?.action_link) {
      log.info(`recuperación pedida para una dirección sin cuenta o no generable`);
      return RESPUESTA_NEUTRA;
    }

    // Recuperar la contraseña solo tiene sentido para quien se registró con
    // correo y contraseña. Quien entra con Google o Microsoft no tiene ninguna
    // que recuperar, y mandarle el enlace lo llevaría a inventarse una que no
    // necesita —o a quedarse esperando un correo que no le resuelve el problema—.
    // A esa persona se le manda un correo distinto, diciéndole por dónde entra.
    // Lo que NO cambia es la respuesta en pantalla: sigue siendo la misma para
    // todos, porque si variara volvería a delatar qué cuentas existen y de qué
    // tipo son.
    const proveedor = proveedorExterno(data.user);
    if (proveedor) {
      await enviarCorreoDeCuentaExterna(email, proveedor);
      log.info(`recuperación pedida por una cuenta de ${proveedor}: se le indica su vía de acceso`);
      return RESPUESTA_NEUTRA;
    }

    await enviarCorreoDeRecuperacion(email, data.properties.action_link);
    log.info('enlace de recuperación enviado');
  } catch (e) {
    log.error(`no se pudo enviar la recuperación: ${String(e)}`);
  }
  return RESPUESTA_NEUTRA;
}

/** Cómo se llama, para el usuario, cada proveedor externo. */
const NOMBRE_PROVEEDOR: Record<string, string> = { google: 'Google', azure: 'Microsoft' };

/**
 * Con qué proveedor externo entra esta cuenta, si es que no tiene contraseña.
 *
 * Una cuenta puede tener varias identidades a la vez: quien se registró con
 * correo y además vinculó Google tiene las dos, y esa persona SÍ tiene contraseña
 * que recuperar. Por eso la comprobación es «tiene externa y NO tiene la de
 * correo», no «tiene externa».
 */
export function proveedorExterno(user: { identities?: Array<{ provider?: string }> | null } | null | undefined): string | null {
  const identidades = user?.identities ?? [];
  if (!identidades.length) return null;
  if (identidades.some((i) => i.provider === 'email')) return null;
  for (const i of identidades) {
    const nombre = NOMBRE_PROVEEDOR[String(i.provider ?? '')];
    if (nombre) return nombre;
  }
  return null;
}

async function enviarCorreoDeCuentaExterna(destino: string, proveedor: string): Promise<void> {
  const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/login`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.ALERTS_FROM_EMAIL,
      to: [destino],
      subject: `Tu cuenta del Radar entra con ${proveedor}`,
      html: `<!doctype html><html lang="es"><body style="margin:0;background:#f7f4fa;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2130">
        <div style="max-width:520px;margin:0 auto;padding:32px 24px">
          <p style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#8a7f93;margin:0 0 18px">Radar de Oportunidades</p>
          <h1 style="font-size:1.5rem;line-height:1.25;margin:0 0 14px;color:#2a1338">No tienes contraseña que recuperar</h1>
          <p style="font-size:0.98rem;line-height:1.6;margin:0 0 20px">Tu cuenta entra con <strong>${proveedor}</strong>, así que nunca creaste una contraseña para el Radar. Pulsa el botón de ${proveedor} en la pantalla de acceso y entrarás directo.</p>
          <p style="margin:0 0 26px"><a href="${url}" style="display:inline-block;background:#5b2c6f;color:#fff;text-decoration:none;font-weight:700;font-size:0.95rem;padding:14px 26px;border-radius:999px">Ir a la pantalla de acceso</a></p>
          <p style="font-size:0.85rem;line-height:1.55;color:#6f6579;margin:0">Si no pediste esto, no tienes que hacer nada: nadie ha tocado tu cuenta.</p>
        </div>
      </body></html>`,
      text: [
        `Tu cuenta del Radar entra con ${proveedor}.`,
        '',
        `Nunca creaste una contraseña, así que no hay ninguna que recuperar: pulsa el botón de ${proveedor} en la pantalla de acceso y entrarás directo.`,
        url,
        '',
        'Si no pediste esto, no tienes que hacer nada: nadie ha tocado tu cuenta.',
      ].join('\n'),
    }),
  });
  if (!response.ok) throw new Error(`Resend respondió HTTP ${response.status}`);
}

async function enviarCorreoDeRecuperacion(destino: string, enlace: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ALERTS_FROM_EMAIL,
      to: [destino],
      subject: 'Restablece tu contraseña del Radar',
      html: cuerpoHtml(enlace),
      text: cuerpoTexto(enlace),
    }),
  });
  if (!response.ok) throw new Error(`Resend respondió HTTP ${response.status}`);
}

/**
 * El correo dice la verdad sobre lo que pasa si no fuiste tú.
 *
 * Un correo de recuperación llega a veces a alguien que no lo pidió, y esa
 * persona necesita saber en una línea que no tiene que hacer nada. Sin esa frase,
 * lo normal es asustarse y pulsar el enlace «para ver», que es justo lo único que
 * no conviene.
 */
function cuerpoHtml(enlace: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f7f4fa;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2130">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px">
      <p style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#8a7f93;margin:0 0 18px">Radar de Oportunidades</p>
      <h1 style="font-size:1.5rem;line-height:1.25;margin:0 0 14px;color:#2a1338">Restablece tu contraseña</h1>
      <p style="font-size:0.98rem;line-height:1.6;margin:0 0 22px">Pulsa el botón y elige una contraseña nueva. El enlace vale una sola vez y caduca en una hora.</p>
      <p style="margin:0 0 26px">
        <a href="${enlace}" style="display:inline-block;background:#5b2c6f;color:#fff;text-decoration:none;font-weight:700;font-size:0.95rem;padding:14px 26px;border-radius:999px">Elegir contraseña nueva</a>
      </p>
      <p style="font-size:0.85rem;line-height:1.55;color:#6f6579;margin:0 0 8px">Si no pediste esto, no tienes que hacer nada: tu contraseña sigue siendo la de siempre y este enlace caduca solo.</p>
      <p style="font-size:0.78rem;line-height:1.5;color:#8a7f93;margin:22px 0 0;word-break:break-all">Si el botón no abre, copia esta dirección en tu navegador:<br>${enlace}</p>
    </div>
  </body></html>`;
}

function cuerpoTexto(enlace: string): string {
  return [
    'Restablece tu contraseña del Radar',
    '',
    'Abre este enlace para elegir una contraseña nueva. Vale una sola vez y caduca en una hora:',
    enlace,
    '',
    'Si no pediste esto, no tienes que hacer nada: tu contraseña sigue siendo la de siempre.',
  ].join('\n');
}

/**
 * Cambia la contraseña con el token que trae el enlace del correo.
 *
 * El token se valida con `authClient` y el cambio se hace con la API de
 * administración, en dos pasos deliberados: así en ningún momento se le fija la
 * sesión del usuario al cliente de datos. Hacerlo de un tirón con el cliente
 * compartido es exactamente el fallo que una vez dejó a TODOS los usuarios del
 * Radar viendo cero filas.
 */
export async function restablecerPassword(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = CambioSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { token, password } = parsed.data;

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return {
      ok: false,
      error: 'Este enlace ya no sirve: caducó o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».',
    };
  }

  const { error: errorCambio } = await supabase.auth.admin.updateUserById(data.user.id, { password });
  if (errorCambio) {
    log.error(`no se pudo cambiar la contraseña de ${data.user.id.slice(0, 8)}: ${errorCambio.message}`);
    return { ok: false, error: 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' };
  }
  log.info(`contraseña restablecida: ${data.user.id.slice(0, 8)}`);
  return { ok: true };
}

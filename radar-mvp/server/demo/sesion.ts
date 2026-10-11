/**
 * La sesión de la demo: un usuario Pro fijo, sin Supabase Auth.
 *
 * Sin esto la demo enseña la experiencia ANÓNIMA —todo con candado, «crea tu
 * cuenta gratis» en cada tarjeta—, que es justo lo contrario de lo que se le
 * quiere enseñar a alguien: el producto se vende por dentro, no por el muro.
 *
 * Hay un solo punto de entrada a propósito. Con dos formas de autenticarse
 * —una real y una de demo— acaba habiendo caminos donde solo una de las dos
 * se comprueba, que es exactamente cómo nacen los agujeros de autorización.
 * Aquí el modo demo sustituye a la real, no convive con ella:
 * `getUserFromToken` pregunta primero por esto y, si el modo está apagado,
 * nunca llega a mirarlo.
 *
 * Y es de mentira a propósito: no hay registro, no hay contraseñas, no se
 * escribe nada. Lo que se guarde en la demo vive en memoria y se pierde al
 * reiniciar, que para enseñar el producto sobra.
 */
import { MODO_DEMO } from '../../lib/supabase.js';
import type { AuthUser } from '../favorites.js';

/** El token que reparte el login de la demo. No es un JWT ni lo finge. */
export const TOKEN_DEMO = 'demo-radar-crece';

/**
 * El usuario que ve quien entra en la demo.
 *
 * Va como `pro` y con cupo ilimitado porque la demo tiene que enseñar el
 * producto COMPLETO: fichas abiertas, dirección, enlace a la fuente, reportes
 * y asistente. Enseñar el plan gratuito sería enseñar el muro.
 */
function usuarioDemo(): AuthUser {
  return {
    id: '00000000-0000-4000-8000-00000000d3m0',
    email: 'demo@radarcrece.co',
    name: 'Demo',
    plan: 'pro',
    subscriptionStatus: 'active',
    role: 'user',
    // Cupos en su forma «ilimitada»: la demo no cuenta fichas.
    cupo: { mes: null, desbloqueadas: [], usadas: 0 },
    cupoReportes: { mes: null, descargados: [], usadas: 0 },
    consultas: { mes: null, usadas: 0 },
  } as unknown as AuthUser;
}

/**
 * ¿Este token es el de la demo?
 *
 * Devuelve `null` —y no lanza— cuando el modo está apagado, para que el
 * llamador siga su camino normal sin tener que saber que esto existe.
 */
export function usuarioDeDemo(_token: string | null): AuthUser | null {
  if (!MODO_DEMO) return null;
  // Ni token hace falta. En la demo NO hay inicio de sesión: quien entra ve la
  // aplicación completa desde el primer clic. Pedir que alguien se registre
  // —aunque la contraseña dé igual— es fricción en mitad de una presentación, y
  // además deja a la vista un formulario que no hace lo que dice.
  //
  // El token se ignora a propósito: así tampoco importa lo que haya quedado en
  // el navegador de una visita anterior.
  return usuarioDemo();
}

/** La respuesta del login en modo demo. Acepta cualquier correo. */
export function loginDeDemo(email?: string) {
  const u = usuarioDemo();
  return {
    ok: true as const,
    token: TOKEN_DEMO,
    refreshToken: TOKEN_DEMO,
    user: { id: u.id, email: email?.trim() || u.email, name: u.name },
  };
}

/**
 * Auth del Radar — server-side con service_role (sin exponer claves al cliente).
 * Registro = captura de correo (el "gate" freemium que pidió el cliente: ver
 * parcial → registrar email → suscripción). Login valida contra Supabase Auth.
 */
import { z } from 'zod';
import { supabase, authClient } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('auth');

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Nombre muy corto').max(80).optional(),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
});
const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: { id: string; email: string; name?: string };
  token?: string;
  /** Token de refresco: lo guarda el navegador para renovar cuando el otro caduque. */
  refreshToken?: string;
}

export async function registerUser(input: unknown): Promise<AuthResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { name, email, password } = parsed.data;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // MVP: sin verificación por correo todavía
    user_metadata: name ? { name } : {},
  });

  if (error) {
    // Correo ya registrado → mensaje claro, no error 500.
    // NO se dice que el correo ya existe.
    //
    // La recuperación de contraseña se cuida mucho de no delatar qué direcciones
    // tienen cuenta —ahí está el argumento, en `recuperar-password.ts`— y este
    // formulario lo regalaba en texto plano: probar correos aquí devolvía «ya está
    // registrado» o «cuenta creada», que es un oráculo perfecto. Cerrar una puerta
    // y dejar la otra abierta no protege nada.
    //
    // El mensaje sirve igual a quien de verdad se equivocó de pestaña: le dice qué
    // hacer sin confirmarle a un desconocido que esa dirección existe.
    if (/already.*regist|already.*exist|duplicate/i.test(error.message)) {
      return {
        ok: false,
        error: 'No pudimos crear la cuenta con ese correo. Si ya tienes una, inicia sesión; '
          + 'y si olvidaste la contraseña, puedes recuperarla.',
      };
    }
    log.error(`register ${email}: ${error.message}`);
    return { ok: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' };
  }
  log.info(`Nuevo registro: ${email}`);
  return { ok: true, user: { id: data.user!.id, email, name } };
}

export async function loginUser(input: unknown): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { email, password } = parsed.data;

  // authClient (NO el cliente de datos): signInWithPassword fija la sesión del
  // cliente; en el compartido contaminaría todas las consultas (RLS → 0 filas).
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { ok: false, error: 'Correo o contraseña incorrectos.' };
  }
  return {
    ok: true,
    token: data.session.access_token,
    // El de refresco viaja también, y esto NO es un extra: el token de acceso
    // caduca a la hora, y sin forma de renovarlo la sesión se apagaba sola sin
    // avisar. La pestaña seguía diciendo «Mi cuenta» —el token seguía en el
    // almacenamiento— pero cada petición nueva llegaba sin sesión válida, así que
    // el servidor respondía como a un anónimo: al cambiar un filtro, a alguien
    // registrado le aparecía «crea tu cuenta gratis». El acceso por Google ya lo
    // guardaba; el de correo y contraseña, no.
    refreshToken: data.session.refresh_token,
    user: {
      id: data.user!.id,
      email,
      name: (data.user!.user_metadata?.name as string | undefined) ?? undefined,
    },
  };
}

/**
 * Cambia un token de refresco por una sesión nueva.
 *
 * Lo pide el navegador cuando descubre que su token ya no vale. Va contra
 * `authClient` por la misma razón que el inicio de sesión: fijar la sesión en el
 * cliente de datos compartido rompería RLS para todo el mundo.
 */
export async function refreshSession(body: unknown): Promise<
  { ok: true; token: string; refreshToken: string } | { ok: false; error: string }
> {
  const refreshToken = (body as { refreshToken?: unknown } | null)?.refreshToken;
  if (typeof refreshToken !== 'string' || refreshToken.length < 10) {
    return { ok: false, error: 'Sesión no renovable' };
  }
  const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' };
  return { ok: true, token: data.session.access_token, refreshToken: data.session.refresh_token };
}

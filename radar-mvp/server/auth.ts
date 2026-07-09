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
    if (/already.*regist|already.*exist|duplicate/i.test(error.message)) {
      return { ok: false, error: 'Ese correo ya está registrado. Inicia sesión.' };
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
    user: {
      id: data.user!.id,
      email,
      name: (data.user!.user_metadata?.name as string | undefined) ?? undefined,
    },
  };
}

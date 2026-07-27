/**
 * Favoritos del Radar — propiedades guardadas por un usuario registrado.
 *
 * Almacenamiento: `user_metadata.favorites` del usuario en Supabase Auth (vía
 * service_role). Pragmático para el MVP: no requiere tabla/migración y queda
 * atado al usuario. Si escala (vistas "quién guardó X", conteos), migrar a una
 * tabla `radar_favoritos` — toda la I/O está aislada en este módulo.
 *
 * Auth: el cliente manda su access_token (Bearer); `getUserFromToken` lo valida
 * contra Supabase Auth y devuelve el usuario.
 */
import { supabase, authClient } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { entitledPlanFromMetadata, subscriptionStatusFromMetadata, type SubscriptionStatus } from './commercial.js';
import {
  metadatosDeCuenta,
  pareceIntentoDeAscenso,
  privilegiosEnBolsaDelUsuario,
  type CuentaSupabase,
} from './account-metadata.js';

const log = createLogger('favorites');

/**
 * Después de migrar, ninguna cuenta debería traer permisos en su propia bolsa.
 * Si los trae con un valor que concede algo, o la cuenta no se migró, o alguien
 * está probando a ascenderse con `PUT /auth/v1/user`. En ambos casos el valor ya
 * se ignoró; esto solo deja rastro para poder verlo.
 */
function avisarSiHayPrivilegiosPropios(user: CuentaSupabase & { id?: string }): void {
  if (!pareceIntentoDeAscenso(user.user_metadata)) return;
  const campos = privilegiosEnBolsaDelUsuario(user.user_metadata).join(', ');
  log.warn(`cuenta ${String(user.id ?? '').slice(0, 8)}: privilegios en user_metadata ignorados (${campos})`);
}

export type FavKind = 'portal' | 'banco' | 'remate';
export interface FavRef { kind: FavKind; id: string; at: string }
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  /** 'free' | 'suscrito' | 'pro'. Decide si se entregan las fichas de oportunidad. */
  plan?: string;
  subscriptionStatus?: SubscriptionStatus;
  role?: 'user' | 'admin';
}

const MAX_FAVS = 500;

/** Valida el access_token y devuelve el usuario (o null si inválido/expirado). */
export async function getUserFromToken(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token); // cliente aislado (no contamina datos)
  if (error || !data.user) return null;
  // Vista con los permisos tomados de app_metadata: lo que el usuario escriba en
  // su propia bolsa no decide su plan ni su rol. Ver `account-metadata.ts`.
  const metadata = metadatosDeCuenta(data.user);
  avisarSiHayPrivilegiosPropios(data.user);
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    name: (metadata.name as string | undefined) ?? undefined,
    // El permiso efectivo considera el ciclo de vida, no solo la etiqueta del plan.
    plan: entitledPlanFromMetadata(metadata),
    subscriptionStatus: subscriptionStatusFromMetadata(metadata),
    role: metadata.role === 'admin' || metadata.is_admin === true
      ? 'admin'
      : 'user',
  };
}

function readFavs(user: any): FavRef[] {
  const f = user?.user_metadata?.favorites;
  return Array.isArray(f) ? (f as FavRef[]).filter((x) => x && x.id && x.kind) : [];
}
const keyOf = (f: { kind: string; id: string }) => `${f.kind}:${f.id}`;

export async function listFavorites(userId: string): Promise<FavRef[]> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) { log.error(`listFavorites ${userId}: ${error.message}`); return []; }
  return readFavs(data.user);
}

/** Alterna un favorito (agrega si no está, quita si está). Devuelve el estado nuevo. */
export async function toggleFavorite(userId: string, kind: FavKind, id: string): Promise<{ favorited: boolean; favorites: FavRef[] }> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error('usuario no encontrado');
  const cur = readFavs(data.user);
  const target = keyOf({ kind, id });
  const exists = cur.some((f) => keyOf(f) === target);
  const next = exists
    ? cur.filter((f) => keyOf(f) !== target)
    : [{ kind, id, at: new Date().toISOString() }, ...cur].slice(0, MAX_FAVS);
  const { error: upErr } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...(data.user.user_metadata ?? {}), favorites: next },
  });
  if (upErr) throw new Error(upErr.message);
  return { favorited: !exists, favorites: next };
}

/** Trae las filas completas de las propiedades guardadas, en orden de guardado. */
export async function favoriteProperties(userId: string): Promise<any[]> {
  const favs = await listFavorites(userId);
  if (!favs.length) return [];
  const inmIds = favs.filter((f) => f.kind !== 'remate').map((f) => f.id);
  const remIds = favs.filter((f) => f.kind === 'remate').map((f) => f.id);
  const [inm, rem] = await Promise.all([
    inmIds.length ? supabase.from('inmuebles').select('*').in('id', inmIds) : Promise.resolve({ data: [] as any[] }),
    remIds.length ? supabase.from('remates').select('*').in('id', remIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const byId = new Map<string, any>();
  for (const r of (inm.data ?? [])) byId.set(r.id, r);
  for (const r of (rem.data ?? [])) byId.set(r.id, r);
  // Conserva el orden de guardado (más reciente primero) y adjunta el kind guardado.
  return favs
    .map((f) => { const r = byId.get(f.id); return r ? { ...r, _kind: f.kind, _fav_at: f.at } : null; })
    .filter(Boolean);
}

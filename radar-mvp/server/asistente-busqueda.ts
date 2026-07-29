/**
 * La búsqueda que el asistente hace en nombre de un usuario.
 *
 * Es la herramienta `buscar_propiedades` del workflow de n8n: el agente la llama
 * cuando alguien describe lo que busca, y devuelve fichas con su enlace para que
 * pueda abrirlas.
 *
 * LO IMPORTANTE ESTÁ EN QUIÉN PREGUNTA. Esta ruta consulta el inventario **en
 * nombre de una persona concreta**, y por tanto pasa por la misma puerta que
 * cualquier listado del Radar: `redactarLista`. Si devolviera filas crudas, el
 * chat sería la puerta trasera del muro —quien no quisiera pagar solo tendría que
 * preguntarle al asistente— y además reexpondría los datos personales de terceros
 * que aparecen en los remates (demandado, secuestre, juzgado), que es exactamente
 * el incidente que ya corregimos una vez.
 *
 * El id del usuario lo pone n8n desde el cuerpo del webhook, que a su vez lo puso
 * el Radar al validar el token. El modelo no lo elige: si fuera un parámetro que
 * el agente rellena, bastaría con pedirle «busca como el usuario tal» para leer el
 * inventario con el plan de otro.
 */
import { supabase } from '../lib/supabase.js';
import { metadatosDeCuenta } from './account-metadata.js';
import { planDe, redactarLista } from './acceso.js';
import { entitledPlanFromMetadata } from './commercial.js';
import { estadoCupo, leerCupo } from './cupo.js';
import { queryBancos, queryPortal, queryRemates, type ListQuery } from './queries.js';
import { env } from '../lib/env.js';

/** Cuántas fichas se le devuelven al agente. */
const MAX_RESULTADOS = 6;

export type FuenteBusqueda = 'portal' | 'banco' | 'remate';

export interface ParametrosBusqueda {
  ciudad?: string;
  tipo?: string;
  fuente?: FuenteBusqueda;
  precioMin?: number;
  precioMax?: number;
  tier?: string;
}

export interface FichaParaAgente {
  fuente: FuenteBusqueda;
  titulo: string;
  ciudad: string;
  barrio?: string;
  precio: number | null;
  area_m2: number | null;
  valoracion: string | null;
  descuento_pct: number | null;
  enlace: string;
  /** Verdadero cuando esta persona todavía no puede ver la ficha completa. */
  bloqueada: boolean;
}

/**
 * Lee el plan y el cupo de un usuario por su id.
 *
 * Va contra Supabase en vez de recibir el usuario ya resuelto porque quien llama
 * es n8n, que no tiene el token de nadie: solo el identificador que le dimos.
 */
async function contextoDelUsuario(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const metadata = metadatosDeCuenta(data.user);
  // La misma traducción que usa el resto del servidor. Hacerla a mano aquí sería
  // un segundo sitio donde decidir quién es «suscrito», y el día que cambie el
  // criterio comercial este se quedaría viejo sin que nadie lo note.
  const plan = planDe({ plan: entitledPlanFromMetadata(metadata) });
  const cupo = leerCupo(metadata);
  return { plan, cupo, estado: estadoCupo(cupo, plan) };
}

/** Convierte lo que pidió el modelo en una consulta del Radar, descartando lo que no entienda. */
function aConsulta(p: ParametrosBusqueda): ListQuery {
  const q: ListQuery = { page: 1, pageSize: MAX_RESULTADOS };
  if (p.ciudad) q.city = p.ciudad.trim().toLowerCase();
  if (p.tipo && ['apartment', 'house', 'lot', 'commercial'].includes(p.tipo)) q.type = p.tipo;
  if (Number.isFinite(p.precioMin)) q.priceMin = Number(p.precioMin);
  if (Number.isFinite(p.precioMax)) q.priceMax = Number(p.precioMax);
  // El orden por defecto del asistente es por descuento: quien pregunta por
  // oportunidades quiere las mejores primero, no las más recientes.
  q.order = 'discount_desc';
  return q;
}

export async function buscarParaAsistente(
  userId: string,
  p: ParametrosBusqueda,
): Promise<{ ok: true; resultados: FichaParaAgente[]; total: number } | { ok: false; error: string }> {
  const contexto = await contextoDelUsuario(userId);
  if (!contexto) return { ok: false, error: 'No se pudo identificar la cuenta.' };

  const q = aConsulta(p);
  const esRemate = p.fuente === 'remate';
  if (p.tier && !esRemate) q.tier = p.tier;

  const r = esRemate ? await queryRemates(q)
    : p.fuente === 'banco' ? await queryBancos(q)
      : await queryPortal(q);

  const filas = redactarLista(r.data as any[], contexto.plan, esRemate ? 'remate' : 'inmueble', {
    desbloqueadas: contexto.cupo.desbloqueadas,
    restantes: contexto.estado.restantes,
  });

  const fuente: FuenteBusqueda = esRemate ? 'remate' : p.fuente === 'banco' ? 'banco' : 'portal';
  return {
    ok: true,
    total: r.total ?? filas.length,
    resultados: filas.slice(0, MAX_RESULTADOS).map((f) => aFicha(f, fuente)),
  };
}

/**
 * Lo que ve el agente de cada ficha.
 *
 * Es un subconjunto corto a propósito: el modelo no necesita las cuarenta columnas
 * de la tabla para decir «mira esta», y cada campo de más es contexto que paga el
 * usuario en tokens y ruido donde el modelo puede equivocarse. Todo lo que sale de
 * aquí ya pasó por `redactarLista`, así que lo reservado viene borrado.
 */
function aFicha(f: Record<string, any>, fuente: FuenteBusqueda): FichaParaAgente {
  const base = env.APP_BASE_URL.replace(/\/$/, '');
  return {
    fuente,
    titulo: String(f.title ?? f.property_type_raw ?? 'Inmueble'),
    ciudad: String(f.city ?? ''),
    barrio: f.zone ? String(f.zone) : undefined,
    precio: numeroONulo(fuente === 'remate' ? f.minimum_bid : f.price),
    area_m2: numeroONulo(f.area_m2),
    valoracion: f.crece_lectura ? String(f.crece_lectura) : null,
    descuento_pct: numeroONulo(f.discount_pct),
    enlace: `${base}/?kind=${fuente}&id=${encodeURIComponent(String(f.id))}`,
    // `redactar` deja marcada la ficha que este usuario no puede abrir. Se le dice
    // al modelo para que sepa que ahí hay algo que ofrecer —desbloquearla— en vez
    // de inventarse los datos que faltan.
    bloqueada: f._bloqueada === true || f._acceso?.completa === false,
  };
}

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

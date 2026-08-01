/**
 * Los comparables que sustentan el veredicto de una ficha, uno por uno.
 *
 * POR QUÉ EXISTE. El cliente abrió un inmueble marcado a «416% sobre el valor del
 * mercado» y preguntó lo único que se puede preguntar: ¿contra qué lo está
 * comparando? En otra ficha vio un lote cuyo veredicto salía de comparar contra
 * parqueaderos. Sin poder mirar la lista, la única respuesta posible es «confía en
 * el motor», y un producto que da cifras de cientos de millones no se puede
 * permitir eso.
 *
 * ES UNA HERRAMIENTA DE VERIFICACIÓN, no una función del producto. Se acordó así:
 * «para verificarlo nosotros podemos ponerlo que lo demuestre, y ya una vez
 * verificado… temporalmente». De ahí dos decisiones:
 *
 *  · Va detrás de `RADAR_AUDITORIA_COMPARABLES`. Apagada, la ruta no existe. El
 *    cliente avisó del coste —«si hay 100 personas al tiempo y todas consultando
 *    comparables, va a tener impacto de procesamiento»— y tenía razón: recalcular
 *    la cascada exige el pool de la ciudad entera.
 *  · Tiene su propio límite por usuario, aparte del resto.
 */
import { evaluateBank, loadCityPool } from '../engine/zone-comps.js';
import { supabase } from '../lib/supabase.js';
import { env } from '../lib/env.js';
import type { ComparableUsado } from '../engine/comparables.js';

/** Cuántos se devuelven. Con más de esto la lista deja de poder leerse. */
const MAX_FILAS = 60;

export function auditoriaHabilitada(): boolean {
  return env.RADAR_AUDITORIA_COMPARABLES === '1';
}

export interface DetalleComparables {
  ok: true;
  /** El inmueble que se está juzgando, para poder situarlo en la lista. */
  candidato: { tipo: string | null; zona: string | null; area_m2: number | null; precio: number | null; ppm2: number | null };
  veredicto: {
    ppm2_mercado: number | null;
    descuento_pct: number | null;
    n_comparables: number;
    nivel: string | null;
    criterios: string[];
  };
  comparables: Array<Omit<ComparableUsado, 'source_id' | 'url'> & { esDeOtroTipo: boolean }>;
  /** Cuántos quedaron fuera del recorte, para no dar a entender que están todos. */
  omitidos: number;
}

export async function detalleDeComparables(
  id: string,
): Promise<DetalleComparables | { ok: false; error: string }> {
  const { data } = await supabase
    .from('inmuebles')
    .select('id, source, source_id, type, price, area_m2, city, zone, features')
    .eq('id', id)
    .single();
  if (!data) return { ok: false, error: 'inmueble no encontrado' };

  const f = (data.features ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const zone = data.zone ?? (f.neighborhood as string | null) ?? null;
  const propio = data.source === 'fincaraiz' ? data.source_id : null;
  const pool = await loadCityPool(data.city ?? '');

  const veredicto = evaluateBank(
    {
      id: data.id, source: data.source, source_id: data.source_id, type: data.type,
      price: num(data.price), area_m2: num(data.area_m2),
      lat: num(f.lat), lng: num(f.lng), stratum: num(f.stratum),
      city: data.city, zone,
      bedrooms: num(f.bedrooms), garages: num(f.garages),
    },
    propio ? pool.filter((r) => r.source_id !== propio) : pool,
    { incluirComparables: true },
  );

  const usados = veredicto.comparables ?? [];
  const recortados = usados.slice(0, MAX_FILAS);

  return {
    ok: true,
    candidato: {
      tipo: data.type ?? null,
      zona: zone,
      area_m2: num(data.area_m2),
      precio: num(data.price),
      ppm2: veredicto.candidate_ppm2,
    },
    veredicto: {
      ppm2_mercado: veredicto.market_ppm2,
      descuento_pct: veredicto.discount_pct,
      n_comparables: veredicto.n_comparables,
      nivel: veredicto.cascada_nivel,
      criterios: veredicto.criteria,
    },
    // NI `url` NI `source_id`.
    //
    // Esta herramienta existe para responder «¿contra qué se comparó mi
    // inmueble?», y eso se contesta con el tipo, el área, el precio y la zona de
    // cada comparable. El enlace a la fuente no aporta nada a esa pregunta y sí
    // rompe el muro: entre los comparables hay fichas que el Radar cobra —una de
    // cada diez, medido—, y a esas `redactar()` les anula `source_url` y
    // `source_id` en todas las demás rutas. Servirlos aquí era dejar la llave
    // puesta en la puerta de atrás, sin sesión y a un clic de cualquier ficha.
    comparables: recortados.map(({ source_id: _sinId, url: _sinUrl, ...c }) => ({
      ...c,
      // Lo que hay que poder ver de un golpe: si el motor metió en la comparación
      // algo que no es del mismo tipo. Es la pregunta exacta que se hizo el
      // cliente al ver un lote medido contra parqueaderos.
      esDeOtroTipo: !!(data.type && c.type && data.type !== c.type),
    })),
    omitidos: Math.max(0, usados.length - recortados.length),
  };
}



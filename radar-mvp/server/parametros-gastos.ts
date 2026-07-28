/**
 * Porcentajes de la calculadora de gastos de escrituración, editables desde el panel.
 *
 * Los tres porcentajes que la ficha usa para estimar cuánto cuesta escriturar
 * una compra estaban compilados en `server/public/app.js`. Son cifras de LEY:
 * el impuesto de registro lo fija cada departamento dentro de la banda que le
 * permite la Ley 223 de 1995, y la tarifa notarial la actualiza cada año la
 * Superintendencia de Notariado. Cada uno de esos cambios obligaba a tocar
 * código y desplegar para corregir un número que el administrador conoce mejor
 * que quien programa.
 *
 * DEGRADACIÓN, QUE ES LO IMPORTANTE DE ESTE ARCHIVO: la tabla puede no estar
 * aplicada todavía en la base de producción. Mientras no lo esté —o si Supabase
 * se cae, o si la consulta se pasa de tiempo— la lectura devuelve
 * `GASTOS_POR_DEFECTO`, que son EXACTAMENTE los mismos valores que estaban
 * compilados. El producto se comporta igual que antes hasta el día en que
 * alguien aplique la migración; no hay ventana en la que la calculadora quede
 * sin porcentajes ni muestre ceros. Ese patrón ya estaba resuelto en
 * `lib/sesion-scraper.ts` y en `alertDispatchEnabled()` de `server/notifications.ts`.
 *
 * El `origen` viaja con los valores a propósito: sin él, un administrador que
 * cambia un porcentaje y no ve el efecto no tiene forma de saber si el problema
 * es suyo o es que la tabla no existe. Con él, el panel se lo dice.
 */
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('parametros-gastos');
const TABLA = 'radar_parametros_gastos';
/** Una sola fila vigente; el CHECK de la migración impide que aparezca otra. */
const FILA_VIGENTE = 'vigente';

export interface ParametrosGastos {
  /** Fracción del valor: 0.0027 = 0,27 %. */
  notaria: number;
  impuestoRegistro: number;
  derechosRegistro: number;
}

export interface ParametrosGastosPublicados extends ParametrosGastos {
  /**
   * `base` = salieron de la tabla. `valores-por-defecto` = la tabla no existe,
   * está vacía o la lectura falló, y se está sirviendo lo compilado.
   */
  origen: 'base' | 'valores-por-defecto';
  /** Cuándo se guardaron; `null` cuando son los valores por defecto. */
  actualizadoEn: string | null;
  nota: string | null;
}

/**
 * Los MISMOS valores que estaban en `app.js` antes de que esto existiera.
 *
 * Notaría: la tarifa notarial completa (~0,54 %) se reparte 50/50 entre las
 * partes, así que al comprador le toca ~0,27 %. Impuesto de registro
 * (beneficencia departamental): 1 %. Derechos de registro de la Oficina de
 * Registro de Instrumentos Públicos: 0,5 %.
 */
export const GASTOS_POR_DEFECTO: Readonly<ParametrosGastos> = Object.freeze({
  notaria: 0.0027,
  impuestoRegistro: 0.01,
  derechosRegistro: 0.005,
});

/**
 * Techo por línea. Hoy la mayor de las tres es el 1 % del impuesto de registro,
 * que es además el máximo legal para actos con cuantía; con un recargo
 * departamental de beneficencia una línea podría rondar el 2 %. El 5 % deja
 * holgura de sobra y sigue rechazando el error de dedo que de verdad ocurre:
 * escribir 0,5 (50 %) o 5 (500 %) creyendo que el campo pide porcentaje y no
 * fracción.
 */
export const MAX_PORCENTAJE_LINEA = 0.05;

/**
 * Techo de la SUMA. Tres valores individualmente plausibles pueden sumar un
 * disparate; por encima del 10 % del valor del inmueble esto ya no es un costo
 * de registro sino un error de captura. Va aquí y en un CHECK de la migración:
 * un `UPDATE` a mano desde el editor SQL de Supabase se salta este archivo.
 */
export const MAX_PORCENTAJE_TOTAL = 0.10;

/**
 * Un porcentaje aceptable.
 *
 * `finite` no es decorativo: sin él, `Number('')` daría 0 y `NaN` pasaría los
 * comparadores de rango sin quejarse, guardando un `NaN` que después convierte
 * en `NaN` el total de gastos de todas las fichas del producto.
 */
const Porcentaje = z.number()
  .finite('El porcentaje debe ser un número')
  .min(0, 'Un porcentaje de gastos no puede ser negativo')
  .max(MAX_PORCENTAJE_LINEA, `El porcentaje no puede pasar de ${MAX_PORCENTAJE_LINEA * 100} %`);

export const ParametrosGastosSchema = z.object({
  notaria: Porcentaje,
  impuestoRegistro: Porcentaje,
  derechosRegistro: Porcentaje,
}).refine(
  (v) => v.notaria + v.impuestoRegistro + v.derechosRegistro <= MAX_PORCENTAJE_TOTAL + 1e-9,
  { message: `Los tres porcentajes no pueden sumar más del ${MAX_PORCENTAJE_TOTAL * 100} % del valor` },
);

export type ResultadoValidacion =
  | { ok: true; parametros: ParametrosGastos }
  | { ok: false; error: string };

/**
 * Valida lo que llega del formulario del panel.
 *
 * Es una función aparte y pura para que se pueda probar sin red: es el único
 * punto donde un número escrito por una persona se convierte en un porcentaje
 * que va a multiplicar el precio de un inmueble en la pantalla de un cliente.
 */
export function validarParametrosGastos(entrada: unknown): ResultadoValidacion {
  const parsed = ParametrosGastosSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' };
  }
  return { ok: true, parametros: parsed.data };
}

/**
 * Convierte una fila de la base en parámetros utilizables.
 *
 * `numeric` de Postgres puede llegar como TEXTO por el driver —le pasa a
 * `discount_pct` en `server/zonas.ts`—, así que se normaliza antes de validar.
 * Y se valida aunque venga de la base: los CHECK cubren un `UPDATE` manual, pero
 * no cubren que alguien haya alterado la tabla después. Si la fila no pasa, se
 * degrada a los valores por defecto en vez de publicar una tarifa absurda.
 */
export function parametrosDesdeFila(fila: unknown): ParametrosGastos | null {
  if (!fila || typeof fila !== 'object') return null;
  const f = fila as Record<string, unknown>;
  const parsed = validarParametrosGastos({
    notaria: Number(f.notaria),
    impuestoRegistro: Number(f.impuesto_registro),
    derechosRegistro: Number(f.derechos_registro),
  });
  return parsed.ok ? parsed.parametros : null;
}

/** Lo que se sirve cuando no hay tabla, no hay fila o la lectura falló. */
function porDefecto(): ParametrosGastosPublicados {
  return { ...GASTOS_POR_DEFECTO, origen: 'valores-por-defecto', actualizadoEn: null, nota: null };
}

/**
 * Caché con el mismo trato que `stats()` y `alertDispatchEnabled()`.
 *
 * La calculadora se pinta en CADA ficha que se abre, así que estos valores se
 * piden constantemente y cambian como mucho un par de veces al año. El TTL es
 * largo por eso; lo que sí se hace es invalidar en cuanto el panel guarda, para
 * que el administrador vea su cambio de inmediato y no dentro de diez minutos
 * (que es exactamente cuando dejaría de creerle al formulario).
 */
const TTL_MS = 10 * 60_000;
/** `/api/config` es sonda del monitor y bloquea el arranque del frontend: esta
 *  consulta no puede tardar más que esto. Mismo presupuesto que el despachador. */
const TIMEOUT_MS = 800;
let cache: { at: number; datos: ParametrosGastosPublicados } | null = null;
let enVuelo: Promise<ParametrosGastosPublicados> | null = null;

export async function parametrosGastos(ahora = Date.now()): Promise<ParametrosGastosPublicados> {
  if (cache && ahora - cache.at < TTL_MS) return cache.datos;
  // Se memoriza la PROMESA, no solo el valor: `/api/config` no tiene límite de
  // tasa y una ráfaga sobre la caché fría dispararía N consultas simultáneas.
  if (enVuelo) return enVuelo;

  enVuelo = (async () => {
    try {
      const { data, error } = await supabase
        .from(TABLA)
        .select('notaria, impuesto_registro, derechos_registro, actualizado_en, nota')
        .eq('id', FILA_VIGENTE)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
        .maybeSingle();
      if (error) throw new Error(error.message);

      const parametros = parametrosDesdeFila(data);
      if (!parametros) {
        // Tabla aplicada pero sin fila, o con una fila que no pasa la
        // validación. No se cachea el fallo: si alguien inserta la fila
        // correcta, se recoge en la siguiente lectura y no dentro de 10 minutos.
        if (data) log.warn('La fila vigente no pasó la validación; se sirven los valores por defecto.');
        return porDefecto();
      }

      const fila = data as { actualizado_en?: string | null; nota?: string | null };
      const datos: ParametrosGastosPublicados = {
        ...parametros,
        origen: 'base',
        actualizadoEn: typeof fila.actualizado_en === 'string' ? fila.actualizado_en : null,
        nota: typeof fila.nota === 'string' ? fila.nota : null,
      };
      cache = { at: Date.now(), datos };
      return datos;
    } catch (e) {
      // La tabla puede sencillamente no existir todavía —la migración no se ha
      // aplicado en producción— y eso NO es una avería: es el estado esperado
      // hasta que alguien la aplique. Se avisa una vez por ventana y se sigue
      // con lo compilado. Tampoco se cachea el fallo: un hipo de Supabase no
      // puede congelar los valores por defecto durante diez minutos si la tabla
      // sí existe y responde a la siguiente.
      log.warn(`parametrosGastos: ${e instanceof Error ? e.message : String(e)} — se usan los valores por defecto`);
      return porDefecto();
    } finally {
      enVuelo = null;
    }
  })();

  return enVuelo;
}

/** Precalienta al arrancar, como `warmStats()`: la primera ficha no debe esperar. */
export async function warmParametrosGastos(): Promise<void> {
  try { await parametrosGastos(); } catch { /* best-effort */ }
}

/**
 * Tira la caché.
 *
 * Se llama justo después de guardar. Sin esto, el administrador cambiaría un
 * porcentaje, abriría una ficha, vería el valor viejo y concluiría —con razón—
 * que el formulario no sirve.
 */
export function invalidarCacheParametros(): void {
  cache = null;
}

export type ResultadoGuardado =
  | { ok: true; parametros: ParametrosGastosPublicados }
  | { ok: false; error: string };

/**
 * Guarda los porcentajes. La comprobación de rol NO está aquí: vive en
 * `server/account.ts`, con el mismo guardia que los demás endpoints del panel,
 * para que no pueda quedarse desactualizada por su cuenta.
 */
export async function guardarParametrosGastos(
  entrada: unknown,
  autor: { id: string; nota?: string },
): Promise<ResultadoGuardado> {
  const validado = validarParametrosGastos(entrada);
  if (!validado.ok) return validado;

  const nota = typeof autor.nota === 'string' ? autor.nota.trim().slice(0, 500) : '';
  const actualizadoEn = new Date().toISOString();
  const { error } = await supabase.from(TABLA).upsert({
    id: FILA_VIGENTE,
    notaria: validado.parametros.notaria,
    impuesto_registro: validado.parametros.impuestoRegistro,
    derechos_registro: validado.parametros.derechosRegistro,
    nota: nota || null,
    actualizado_por: autor.id,
    actualizado_en: actualizadoEn,
  }, { onConflict: 'id' });

  if (error) {
    // El caso más probable con diferencia: la migración todavía no se aplicó.
    // Se dice así, con el nombre del archivo, porque el mensaje lo va a leer
    // quien puede arreglarlo y no un desarrollador con el repositorio delante.
    log.warn(`guardarParametrosGastos: ${error.message}`);
    return {
      ok: false,
      error: /schema cache|does not exist|relation/i.test(error.message)
        ? 'La tabla de parámetros todavía no existe en la base. Aplica la migración '
          + '20260728000003_parametros_gastos.sql y vuelve a intentarlo; mientras tanto la '
          + 'calculadora sigue usando los valores por defecto.'
        : `No se pudieron guardar los parámetros: ${error.message}`,
    };
  }

  invalidarCacheParametros();
  return { ok: true, parametros: await parametrosGastos() };
}

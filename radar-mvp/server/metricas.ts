/**
 * Agregación de las MÉTRICAS DE OPERACIÓN que el panel dibuja como gráficas.
 *
 * El panel ya tenía tarjetas de números y la tabla de oportunidades por ciudad:
 * sabe CUÁNTO hay. Lo que no sabía es si la máquina que lo consigue está viva.
 * Esa pregunta —«¿el scraping corrió esta semana y salió bien?»— se respondía
 * abriendo los logs del contenedor, que es exactamente lo que un panel de
 * administración existe para evitar.
 *
 * ESTE ARCHIVO NO HABLA CON SUPABASE, igual que `server/zonas.ts`. Recibe filas
 * ya traídas y devuelve series listas para pintar, para que la aritmética —que
 * es donde de verdad se puede equivocar un gráfico— se pruebe sin red ni
 * navegador con `node --import tsx --test`.
 *
 * POR QUÉ LOS TRAMOS DEL EJE SE CALCULAN AQUÍ Y NO EN EL NAVEGADOR: es la única
 * cuenta del gráfico que puede fallar en silencio. Un eje que se queda corto no
 * lanza ningún error: simplemente dibuja la barra más alta saliéndose del marco
 * —o recortada— y el operador lee un número que no es. Calculándolo en el
 * servidor se puede probar; en `admin.js` solo quedaría la geometría, que si
 * está mal se ve a simple vista.
 */

/* ────────────────────────  Corridas de scraping  ──────────────────────── */

/** Fila de `scraping_logs`, solo lo que la gráfica necesita. */
export interface FilaCorrida {
  source?: string | null;
  status?: string | null;
  started_at?: string | null;
  records_found?: number | string | null;
  records_inserted?: number | string | null;
}

/**
 * Estados posibles de una corrida. Son los cuatro del CHECK de la tabla
 * (`running | success | partial | error`), traducidos a los cuatro colores
 * semánticos del gráfico. `running` es un caso real que hay que representar: una
 * corrida que arrancó y nunca cerró es un cron colgado, no un hueco.
 */
export type EstadoCorrida = 'exito' | 'parcial' | 'error' | 'enCurso';

export interface DiaCorridas {
  /** `YYYY-MM-DD` en hora de Colombia. */
  dia: string;
  exito: number;
  parcial: number;
  error: number;
  enCurso: number;
  total: number;
  /** Registros insertados ese día, sumando todas las corridas. */
  insertados: number;
}

export interface SerieCorridas {
  dias: DiaCorridas[];
  /** Corridas del periodo, por si el resumen quiere decirlo sin volver a sumar. */
  totalCorridas: number;
  totalFallidas: number;
  /** Fuentes distintas que aparecieron en el periodo. */
  fuentes: string[];
  /** Alto del eje ya redondeado, y sus marcas. */
  maxEje: number;
  marcasEje: number[];
}

/** Colombia no tiene horario de verano: el desfase es fijo y no hay que consultar nada. */
const HORAS_BOGOTA = -5;
const MS_DIA = 86_400_000;

/**
 * Día calendario colombiano de un instante.
 *
 * Se agrupa por el día que vivió el operador, no por el día UTC: una corrida de
 * las 20:00 de Bogotá es `2026-07-27T01:00Z`, y agrupando por UTC aparecería al
 * día siguiente. El panel lo lee alguien que estuvo ahí ese día.
 */
export function diaBogota(iso: string | Date): string {
  const t = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t + HORAS_BOGOTA * 3_600_000).toISOString().slice(0, 10);
}

/** `numeric`/`int` de Postgres pueden llegar como texto según el driver. */
function entero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function estadoDe(valor: unknown): EstadoCorrida {
  switch (String(valor ?? '')) {
    case 'success': return 'exito';
    case 'partial': return 'parcial';
    case 'running': return 'enCurso';
    // Cualquier cosa que no reconozcamos cuenta como error, no como éxito. Un
    // estado nuevo que el panel no conoce es exactamente lo que hay que mirar.
    default: return 'error';
  }
}

/**
 * Serie diaria de corridas, con los días vacíos incluidos.
 *
 * LOS HUECOS SON EL DATO. Si solo se pintaran los días con corridas, una semana
 * entera sin scrapear se vería como cuatro columnas juntas y parecería
 * actividad normal. Dibujando el día vacío, el silencio se ve.
 */
export function serieCorridasPorDia(
  filas: readonly FilaCorrida[],
  opciones: { dias?: number; hasta?: Date } = {},
): SerieCorridas {
  const ventana = Math.max(1, Math.trunc(opciones.dias ?? 30));
  const hasta = opciones.hasta ?? new Date();
  const ultimoDia = diaBogota(hasta);

  const porDia = new Map<string, DiaCorridas>();
  // El eje de días se arma primero y completo, para que existan también los
  // días sin ninguna corrida.
  const finMs = Date.parse(`${ultimoDia}T00:00:00Z`);
  for (let i = ventana - 1; i >= 0; i -= 1) {
    const dia = new Date(finMs - i * MS_DIA).toISOString().slice(0, 10);
    porDia.set(dia, { dia, exito: 0, parcial: 0, error: 0, enCurso: 0, total: 0, insertados: 0 });
  }

  const fuentes = new Set<string>();
  let totalCorridas = 0;
  let totalFallidas = 0;

  for (const fila of filas) {
    if (!fila?.started_at) continue;
    const dia = diaBogota(String(fila.started_at));
    const bucket = porDia.get(dia);
    if (!bucket) continue; // fuera de la ventana: no se inventa una columna

    const estado = estadoDe(fila.status);
    bucket[estado] += 1;
    bucket.total += 1;
    bucket.insertados += entero(fila.records_inserted);
    totalCorridas += 1;
    if (estado === 'error') totalFallidas += 1;
    const fuente = typeof fila.source === 'string' ? fila.source.trim() : '';
    if (fuente) fuentes.add(fuente);
  }

  const dias = [...porDia.values()];
  const marcasEje = marcasDeEje(Math.max(...dias.map((d) => d.total), 0));
  return {
    dias,
    totalCorridas,
    totalFallidas,
    fuentes: [...fuentes].sort((a, b) => a.localeCompare(b, 'es')),
    maxEje: marcasEje[marcasEje.length - 1] ?? 1,
    marcasEje,
  };
}

/* ─────────────────────  Salud de los trabajos del cron  ───────────────────── */

/** Fila de `radar_cron_jobs`, solo lo que la gráfica necesita. */
export interface FilaTrabajo {
  nombre?: string | null;
  cadencia_dias?: number | string | null;
  habilitado?: boolean | null;
  ultima_corrida?: string | null;
  ultimo_estado?: string | null;
  corriendo_desde?: string | null;
}

export interface TrabajoAutomatico {
  nombre: string;
  habilitado: boolean;
  /** `ok` y `error` vienen de la base; `sin-datos` es «nunca ha corrido». */
  estado: 'ok' | 'error' | 'sin-datos';
  corriendo: boolean;
  cadenciaDias: number;
  ultimaCorrida: string | null;
  /** Días transcurridos desde la última corrida; `null` si nunca corrió. */
  diasDesde: number | null;
  /**
   * Cuánto se ha consumido de su cadencia, de 0 a 1 (topado en 1 para dibujar).
   * `null` cuando nunca corrió: ahí no hay proporción que mostrar, y un 0 diría
   * «recién corrido», que es lo contrario de la verdad.
   */
  avance: number | null;
  /** Debía haber corrido y no lo ha hecho. */
  vencido: boolean;
}

/**
 * Estado de cada trabajo automático frente a SU PROPIA cadencia.
 *
 * No se comparan trabajos entre sí —el motor corre a diario y los bancos cada
 * semana, así que «hace 3 días» significa cosas opuestas en cada uno—: cada
 * barra mide su retraso contra su propio plazo, que es la única comparación
 * honesta y la única que responde «¿qué hay que ir a mirar hoy?».
 */
export function estadoTrabajos(
  filas: readonly FilaTrabajo[],
  ahora: Date = new Date(),
): TrabajoAutomatico[] {
  const t = ahora.getTime();
  return filas
    .map((fila): TrabajoAutomatico => {
      const cadencia = Math.max(1, entero(fila?.cadencia_dias) || 1);
      const ultimaMs = fila?.ultima_corrida ? Date.parse(String(fila.ultima_corrida)) : NaN;
      const tiene = Number.isFinite(ultimaMs);
      const diasDesde = tiene ? Math.max(0, (t - ultimaMs) / MS_DIA) : null;
      const habilitado = fila?.habilitado === true;
      return {
        nombre: String(fila?.nombre ?? '').trim() || 'sin nombre',
        habilitado,
        estado: !tiene ? 'sin-datos' : (String(fila?.ultimo_estado ?? '') === 'ok' ? 'ok' : 'error'),
        corriendo: Boolean(fila?.corriendo_desde),
        cadenciaDias: cadencia,
        ultimaCorrida: tiene ? new Date(ultimaMs).toISOString() : null,
        diasDesde: diasDesde === null ? null : Math.round(diasDesde * 10) / 10,
        avance: diasDesde === null ? null : Math.min(1, diasDesde / cadencia),
        // Un trabajo deshabilitado NUNCA está vencido: nadie lo espera. Marcarlo
        // en rojo enseñaría al operador a ignorar el rojo, que es peor que no
        // tener color.
        vencido: habilitado && diasDesde !== null && diasDesde > cadencia,
      };
    })
    // Lo que hay que mirar primero, primero: vencidos arriba, y dentro de ellos
    // el más atrasado respecto a su propio plazo.
    .sort((a, b) => Number(b.vencido) - Number(a.vencido)
      || (b.avance ?? 2) - (a.avance ?? 2)
      || a.nombre.localeCompare(b.nombre, 'es'));
}

/* ────────────────────────────  Escalas del eje  ──────────────────────────── */

/**
 * Marcas «redondas» que cubren el máximo, de 0 al tope.
 *
 * El tope SIEMPRE es mayor o igual que el máximo real: es la garantía de que
 * ninguna barra se sale del marco ni se dibuja recortada. Los pasos se eligen
 * de la familia 1 · 2 · 5 × 10ⁿ, que es la que produce números que una persona
 * lee sin pensar (0, 5, 10, 15) en vez de los que salen de dividir el máximo
 * entre cuatro (0, 3,25, 6,5…).
 */
export function marcasDeEje(maximo: number, objetivo = 4): number[] {
  const max = Number.isFinite(maximo) ? Math.max(0, maximo) : 0;
  // Sin datos el eje sigue existiendo: un gráfico vacío con eje 0–1 se lee como
  // «no hubo nada», y uno sin eje se lee como «esto está roto».
  if (max <= 0) return [0, 1];

  const objetivoPasos = Math.max(1, Math.trunc(objetivo));
  const crudo = max / objetivoPasos;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const normalizado = crudo / magnitud;
  const paso = (normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10) * magnitud;

  const marcas: number[] = [];
  for (let v = 0; v < max - 1e-9; v += paso) marcas.push(redondearPaso(v, paso));
  marcas.push(redondearPaso(marcas.length * paso, paso));
  return marcas;
}

/**
 * Quita la basura del coma flotante que deja acumular `v += paso`.
 *
 * Sin esto un eje de pasos de 0,1 llega a mostrar «0,30000000000000004», que es
 * el tipo de detalle que hace que el cliente deje de confiar en el resto de los
 * números de la pantalla.
 */
function redondearPaso(valor: number, paso: number): number {
  const decimales = Math.max(0, -Math.floor(Math.log10(paso)) + 1);
  return Number(valor.toFixed(Math.min(10, decimales)));
}

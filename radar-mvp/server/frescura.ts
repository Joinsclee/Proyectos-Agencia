/**
 * ¿De cuándo son los datos que se están mostrando?
 *
 * Hasta el 2026-07-27 el dashboard pintaba «Actualizado: <hoy>» con la fecha del
 * navegador (`server/public/app.js`). Es decir: si el cron llevaba un mes muerto,
 * la pantalla seguía diciendo «hoy». Esa etiqueta es la que sostiene la
 * credibilidad de todo el Radar, así que tiene que salir de la base.
 *
 * La fuente de verdad es `radar_cron_jobs`, no `max(scraped_at)` de `inmuebles`:
 * es una tabla de cinco filas en vez de un máximo sobre 116 000, y responde a la
 * pregunta correcta —cuándo corrió el proceso— en lugar de a «cuál es la ficha
 * más nueva que sobrevivió al filtro».
 */

export interface TrabajoCron {
  nombre: string;
  cadencia_dias: number;
  habilitado: boolean;
  ultima_corrida: string | null;
  ultimo_estado: string | null;
}

export interface FuenteFrescura {
  nombre: string;
  ultimaCorrida: string | null;
  dias: number | null;
  estado: string | null;
  vencida: boolean;
}

export interface Frescura {
  /** La corrida más reciente entre los trabajos activos. */
  actualizadoEn: string | null;
  degradada: boolean;
  /** Frase lista para mostrar cuando algo va mal; null si todo está al día. */
  motivo: string | null;
  fuentes: FuenteFrescura[];
}

const DIA_MS = 86_400_000;

/**
 * Margen sobre la cadencia antes de declarar vencida una fuente.
 *
 * El doble de la cadencia es tolerante a propósito: un scrape que se salta una
 * vuelta por un fallo de portal no debe pintar el dashboard de rojo, pero un cron
 * muerto sí acaba saliendo. Lo que no espera es un fallo declarado: si el propio
 * trabajo se marcó en error, la fuente está vencida ya.
 */
const FACTOR_TOLERANCIA = 2;

export function evaluarFrescura(trabajos: TrabajoCron[], ahora = new Date()): Frescura {
  const activos = trabajos.filter((t) => t.habilitado);

  const fuentes: FuenteFrescura[] = activos.map((t) => {
    const marca = t.ultima_corrida ? Date.parse(t.ultima_corrida) : NaN;
    const dias = Number.isFinite(marca)
      ? Math.max(0, (ahora.getTime() - marca) / DIA_MS)
      : null;
    const limite = Math.max(1, t.cadencia_dias) * FACTOR_TOLERANCIA;
    const vencida = dias === null || dias > limite || t.ultimo_estado === 'error';
    return {
      nombre: t.nombre,
      ultimaCorrida: t.ultima_corrida,
      dias: dias === null ? null : Math.round(dias * 10) / 10,
      estado: t.ultimo_estado,
      vencida,
    };
  });

  const marcas = fuentes
    .map((f) => (f.ultimaCorrida ? Date.parse(f.ultimaCorrida) : NaN))
    .filter((n) => Number.isFinite(n));
  const actualizadoEn = marcas.length ? new Date(Math.max(...marcas)).toISOString() : null;

  const vencidas = fuentes.filter((f) => f.vencida);
  return {
    actualizadoEn,
    degradada: vencidas.length > 0,
    motivo: vencidas.length ? describir(vencidas) : null,
    fuentes,
  };
}

function describir(vencidas: FuenteFrescura[]): string {
  const conError = vencidas.filter((f) => f.estado === 'error').map((f) => f.nombre);
  if (conError.length) {
    return `La última corrida de ${lista(conError)} terminó en error.`;
  }
  const nuncaCorrio = vencidas.filter((f) => f.dias === null).map((f) => f.nombre);
  if (nuncaCorrio.length === vencidas.length) {
    return `${lista(nuncaCorrio)} nunca ha corrido.`;
  }
  const peor = vencidas
    .filter((f) => f.dias !== null)
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))[0];
  const dias = Math.floor(peor.dias ?? 0);
  return `${peor.nombre} lleva ${dias} día${dias === 1 ? '' : 's'} sin actualizarse.`;
}

function lista(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

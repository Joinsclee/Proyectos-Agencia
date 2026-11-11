/**
 * Carga el volcado de la demo a memoria.
 *
 * Acepta las dos formas en que pueden llegar los datos, porque dependen de si
 * la conexión directa a Postgres estaba abierta o hubo que exportar a mano:
 *
 *   · `.json` — un array de filas. Es lo que deja `psql ... -t -A -c "select
 *     json_agg(...)"` o `scripts/demo/traer-datos.ts`.
 *   · `.csv`  — lo que descarga el editor SQL del panel: una cabecera `datos`
 *     y UNA celda con el JSON entero entrecomillado.
 *
 * El volcado NO va al repositorio (`scripts/demo/datos/.gitignore`): son filas
 * reales de producción, con direcciones y enlaces de la fuente.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('demo');

/** Dónde vive el volcado. Relativo a la raíz del proyecto. */
export const CARPETA_DATOS = 'scripts/demo/datos';

/** Qué archivo alimenta qué tabla. El cliente falso busca por nombre de tabla. */
const MAPA: Array<{ archivo: string; tabla: string }> = [
  { archivo: 'portal', tabla: 'inmuebles' },
  { archivo: 'bancos', tabla: 'inmuebles' },      // misma tabla: portal y banco conviven en `inmuebles`
  { archivo: 'remates', tabla: 'remates' },
  { archivo: 'arriendos', tabla: 'rental_listings' },
];

/**
 * Saca el JSON de una celda de CSV.
 *
 * El editor de Supabase entrecomilla la celda y duplica las comillas de dentro.
 * No se puede usar un parser de CSV genérico sin arrastrar una dependencia, y
 * tampoco hace falta: la forma es siempre la misma —una cabecera y una celda—.
 */
function jsonDesdeCsv(texto: string): unknown {
  const sinCabecera = texto.replace(/^[^\n]*\n/, '').trim();
  if (!sinCabecera) return [];
  let crudo = sinCabecera;
  if (crudo.startsWith('"')) {
    // Quitar las comillas externas y deshacer el duplicado interno.
    crudo = crudo.slice(1, crudo.lastIndexOf('"')).replace(/""/g, '"');
  }
  return JSON.parse(crudo);
}

function leerArchivo(base: string, nombre: string): unknown[] | null {
  for (const ext of ['.json', '.csv']) {
    const ruta = join(base, CARPETA_DATOS, nombre + ext);
    if (!existsSync(ruta)) continue;
    const texto = readFileSync(ruta, 'utf8');
    const datos = ext === '.csv' ? jsonDesdeCsv(texto) : JSON.parse(texto);
    return Array.isArray(datos) ? datos : [];
  }
  return null;
}

export interface VolcadoDemo {
  tablas: Record<string, Record<string, any>[]>;
  /** Los totales REALES del catálogo, para que la portada no mienta. */
  stats: Record<string, unknown> | null;
  exportadoEn: string | null;
}

/**
 * Lee el volcado. Si no hay nada, lo dice claro y falla: arrancar en modo demo
 * sin datos deja una aplicación que carga y está vacía, que es peor que no
 * arrancar — en una demo no da tiempo a averiguar por qué.
 */
export function cargarVolcado(raizProyecto: string): VolcadoDemo {
  const dir = join(raizProyecto, CARPETA_DATOS);
  if (!existsSync(dir)) {
    throw new Error(`modo demo: no existe ${CARPETA_DATOS}. Ver scripts/demo/exportar-desde-el-panel.sql`);
  }

  const tablas: Record<string, Record<string, any>[]> = {};
  const resumen: string[] = [];

  for (const { archivo, tabla } of MAPA) {
    const filas = leerArchivo(raizProyecto, archivo);
    if (filas === null) continue;
    tablas[tabla] = (tablas[tabla] ?? []).concat(filas as Record<string, any>[]);
    resumen.push(`${archivo}: ${filas.length}`);
  }

  const total = Object.values(tablas).reduce((n, f) => n + f.length, 0);
  if (total === 0) {
    const hay = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
    throw new Error(
      `modo demo: ${CARPETA_DATOS} no tiene datos utilizables`
      + (hay.length ? ` (encontrado: ${hay.join(', ')})` : ' (está vacía)')
      + '. Ver scripts/demo/exportar-desde-el-panel.sql',
    );
  }

  let stats: Record<string, unknown> | null = null;
  const crudoStats = leerArchivo(raizProyecto, 'stats');
  if (crudoStats) stats = (Array.isArray(crudoStats) ? crudoStats[0] : crudoStats) as Record<string, unknown>;
  else {
    const ruta = join(dir, 'stats.csv');
    if (existsSync(ruta)) {
      try { stats = jsonDesdeCsv(readFileSync(ruta, 'utf8')) as Record<string, unknown>; } catch { /* opcional */ }
    }
  }

  log.info(`Modo demo: ${resumen.join(' · ')} (${total} filas, sin tocar Supabase)`);
  return { tablas, stats, exportadoEn: (stats?.exportado_en as string) ?? null };
}

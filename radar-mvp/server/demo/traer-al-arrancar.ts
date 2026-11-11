/**
 * Trae el volcado de la demo al arrancar, hablando con Postgres directamente.
 *
 * La restricción por cuota de Supabase bloquea PostgREST y GoTrue —402 en todo—
 * pero NO la base. Comprobado: la API devuelve 402 mientras `select count(*)
 * from inmuebles` responde 182.171. Esto entra por ahí.
 *
 * Va al arrancar y no desde un archivo del repositorio a propósito: el volcado
 * son filas reales con direcciones y enlaces de la fuente, y no tienen por qué
 * quedarse en el historial de git para siempre. Como efecto secundario, cada
 * despliegue se lleva datos frescos.
 *
 * Las consultas son LAS MISMAS que `scripts/demo/exportar-desde-el-panel.sql`,
 * leídas de ese archivo: si se corrige el export, se corrige para los dos
 * caminos. Dos copias del mismo SQL se separan, siempre.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('demo');

/** De qué archivo del export sale cada tabla. */
const MAPA: Record<string, string> = {
  portal: 'inmuebles',
  bancos: 'inmuebles',       // portal y banco conviven en la misma tabla
  remates: 'remates',
  arriendos: 'rental_listings',
};

/** Trocea el .sql por sus separadores y devuelve `nombre → consulta`. */
export function consultasDelExport(sql: string): Array<{ nombre: string; consulta: string }> {
  const salida: Array<{ nombre: string; consulta: string }> = [];
  for (const bloque of sql.split(/^-- ─── /m).slice(1)) {
    const m = bloque.match(/guardar como\s+([\w.-]+)\.csv/);
    if (!m) continue;
    const i = bloque.toLowerCase().indexOf('select');
    if (i < 0) continue;
    salida.push({ nombre: m[1], consulta: `${bloque.slice(i).split(';').slice(0, -1).join(';')};` });
  }
  return salida;
}

export interface VolcadoTraido {
  tablas: Record<string, Record<string, any>[]>;
  stats: Record<string, unknown> | null;
}

/**
 * Se conecta, corre las cinco consultas y devuelve el volcado en memoria.
 *
 * No escribe a disco: el contenedor puede tener el sistema de archivos de solo
 * lectura y, de todos modos, lo que se quiere es que cada arranque traiga lo
 * último.
 */
export async function traerVolcado(url: string): Promise<VolcadoTraido> {
  // Import diferido: `pg` solo se carga si de verdad hace falta.
  const { Client } = await import('pg');
  const cliente = new Client({
    connectionString: url,
    // El pooler de Supabase exige TLS, pero presenta un certificado que la
    // cadena por defecto de Node no valida. `rejectUnauthorized: false`
    // mantiene el cifrado y relaja solo la verificación del emisor, que es lo
    // que hace el propio `psql` con `sslmode=require`.
    ssl: { rejectUnauthorized: false },
    // Si la base no responde, es mejor arrancar sin datos y decirlo que dejar
    // el contenedor colgado y que la plataforma lo reinicie en bucle.
    connectionTimeoutMillis: 20_000,
    query_timeout: 180_000,
  });

  await cliente.connect();
  try {
    const sqlPath = fileURLToPath(new URL('../../scripts/demo/exportar-desde-el-panel.sql', import.meta.url));
    const consultas = consultasDelExport(readFileSync(sqlPath, 'utf8'));

    const tablas: Record<string, Record<string, any>[]> = {};
    let stats: Record<string, unknown> | null = null;
    const resumen: string[] = [];

    for (const { nombre, consulta } of consultas) {
      const r = await cliente.query(consulta);
      // Cada consulta devuelve UNA celda con el JSON.
      const celda = r.rows[0] ? Object.values(r.rows[0])[0] : null;
      if (celda == null) { resumen.push(`${nombre}: vacío`); continue; }
      const datos = typeof celda === 'string' ? JSON.parse(celda) : celda;

      if (nombre === 'stats') { stats = datos as Record<string, unknown>; continue; }
      const tabla = MAPA[nombre];
      if (!tabla) continue;
      const filas = Array.isArray(datos) ? datos : [];
      tablas[tabla] = (tablas[tabla] ?? []).concat(filas);
      resumen.push(`${nombre}: ${filas.length}`);
    }

    const total = Object.values(tablas).reduce((n, f) => n + f.length, 0);
    log.info(`Modo demo: traído de Postgres · ${resumen.join(' · ')} (${total} filas)`);
    return { tablas, stats };
  } finally {
    await cliente.end().catch(() => { /* cerrar es best-effort */ });
  }
}

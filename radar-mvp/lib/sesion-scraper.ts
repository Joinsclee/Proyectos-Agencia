/**
 * Transporte de sesiones autenticadas hasta el contenedor del cron.
 *
 * El scraper de remates entra con sesión iniciada, y esa sesión solo puede
 * crearla una persona: el portal pide un reCAPTCHA. El archivo que produce el
 * login vive en el disco de quien lo corre, pero el contenedor del planificador
 * es desechable y se construye desde el repositorio, donde ese archivo no está
 * —ni debe estar, son cookies—. Por eso la corrida automática del 2026-07-28
 * falló nada más arrancar.
 *
 * Aquí la sesión viaja por la base: se sube una vez desde el equipo donde se hizo
 * el login y el contenedor la deja en disco antes de scrapear. No hay que montar
 * volúmenes, no hay que copiar archivos al servidor, y sobrevive a los
 * despliegues.
 *
 * Esto NO renueva sesiones: cuando la de arriba expire, alguien tiene que volver
 * a hacer el login. Lo que sí hace es que ese login valga para el servidor y no
 * solo para el portátil de quien lo hizo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { supabase } from './supabase.js';
import { createLogger } from './logger.js';

const log = createLogger('sesion-scraper');
const TABLA = 'radar_sesiones_scraper';

export interface SesionGuardada {
  actualizadoEn: string;
  nota: string | null;
}

/** Sube al almacén compartido la sesión que acaba de crear el login manual. */
export async function publicarSesion(
  nombre: string,
  rutaArchivo: string,
  nota?: string,
): Promise<void> {
  if (!existsSync(rutaArchivo)) {
    throw new Error(`No existe ${rutaArchivo}: no hay nada que publicar`);
  }
  const storageState = JSON.parse(readFileSync(rutaArchivo, 'utf8'));
  const { error } = await supabase.from(TABLA).upsert({
    nombre,
    storage_state: storageState,
    actualizado_en: new Date().toISOString(),
    nota: nota ?? null,
  }, { onConflict: 'nombre' });
  if (error) throw new Error(`No se pudo publicar la sesión: ${error.message}`);
  log.info(`Sesión "${nombre}" publicada: el contenedor del cron ya puede usarla.`);
}

/** Metadatos de la sesión publicada, sin descargar las cookies. */
export async function consultarSesion(nombre: string): Promise<SesionGuardada | null> {
  const { data, error } = await supabase
    .from(TABLA)
    .select('actualizado_en, nota')
    .eq('nombre', nombre)
    .maybeSingle();
  if (error || !data) return null;
  const fila = data as { actualizado_en: string; nota: string | null };
  return { actualizadoEn: fila.actualizado_en, nota: fila.nota };
}

/**
 * Deja la sesión en disco si no está ya, descargándola del almacén compartido.
 *
 * Devuelve de dónde salió, para que el log del scrape diga con qué sesión corrió
 * — es el primer dato que se busca cuando un scrape autenticado devuelve cero
 * resultados.
 */
export async function asegurarSesionLocal(
  nombre: string,
  rutaArchivo: string,
): Promise<'disco' | 'base' | 'ninguna'> {
  if (existsSync(rutaArchivo)) return 'disco';

  const { data, error } = await supabase
    .from(TABLA)
    .select('storage_state, actualizado_en')
    .eq('nombre', nombre)
    .maybeSingle();

  if (error) { log.warn(`No se pudo leer la sesión publicada: ${error.message}`); return 'ninguna'; }
  if (!data) return 'ninguna';

  const fila = data as { storage_state: unknown; actualizado_en: string };
  mkdirSync(dirname(rutaArchivo), { recursive: true });
  writeFileSync(rutaArchivo, JSON.stringify(fila.storage_state), 'utf8');
  const dias = Math.floor((Date.now() - Date.parse(fila.actualizado_en)) / 86_400_000);
  log.info(`Sesión "${nombre}" recuperada de la base (login de hace ${dias} día${dias === 1 ? '' : 's'}).`);
  return 'base';
}

/**
 * Publica la sesión de rematandobienes para que la use el contenedor del cron.
 *
 * Cuándo se usa: cuando ya existe un `_session/remates-storage.json` válido en
 * este equipo —porque alguien corrió `npm run remates:login` antes de que el
 * login publicara solo— y se quiere subir sin repetir el captcha.
 *
 * De aquí en adelante `npm run remates:login` publica por su cuenta, así que
 * este script es para el caso puntual de una sesión que ya estaba en disco.
 *
 * Uso:
 *   npx tsx scripts/publicar-sesion-remates.ts
 */
import 'dotenv/config';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import { consultarSesion, publicarSesion } from '../lib/sesion-scraper.js';

const log = createLogger('publicar-sesion');
const NOMBRE = 'rematandobienes';
const RUTA = join(process.cwd(), '_session', 'remates-storage.json');

if (isEntrypoint(import.meta.url)) {
  (async () => {
    const previa = await consultarSesion(NOMBRE);
    if (previa) {
      const dias = Math.floor((Date.now() - Date.parse(previa.actualizadoEn)) / 86_400_000);
      log.info(`Ya había una sesión publicada de hace ${dias} día${dias === 1 ? '' : 's'}. Se reemplaza.`);
    }
    await publicarSesion(NOMBRE, RUTA, `publicada a mano desde ${hostname()}`);
    const ahora = await consultarSesion(NOMBRE);
    log.info(`Confirmado: sesión disponible para el cron (${ahora?.actualizadoEn.slice(0, 19)}).`);
  })()
    .then(() => process.exit(0))
    .catch((e) => { log.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}

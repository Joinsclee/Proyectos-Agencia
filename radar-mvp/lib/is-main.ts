import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * Detección cross-platform de "¿este módulo es el entrypoint CLI?".
 *
 * El patrón viejo `import.meta.url === \`file://${process.argv[1]}\`` funciona en
 * macOS/Linux pero FALLA en Windows: ahí `process.argv[1]` usa backslashes y la
 * URL es `file:///C:/...`, así que la comparación de strings nunca coincide y el
 * bloque CLI no se ejecuta (el scraper "no hace nada" al correrlo directo).
 * Comparamos rutas de archivo resueltas en su lugar.
 *
 * Uso:  if (isEntrypoint(import.meta.url)) { ... }
 */
export function isEntrypoint(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const modulePath = resolve(fileURLToPath(importMetaUrl));
    const entryPath = resolve(entry);
    // Windows: el sistema de archivos es case-insensitive.
    return process.platform === 'win32'
      ? modulePath.toLowerCase() === entryPath.toLowerCase()
      : modulePath === entryPath;
  } catch {
    return false;
  }
}

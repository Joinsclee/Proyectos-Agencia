import { chromium, type BrowserContext } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERFIL = resolve(__dirname, '..', '.chrome-profile-auto');

async function main(): Promise<void> {
  if (!existsSync(PERFIL)) {
    console.error(
      `No existe el clon del perfil en ${PERFIL}.\n` +
      `Ejecuta primero:  npm run clonar-perfil\n`
    );
    process.exit(1);
  }

  console.log('Abriendo Chrome con perfil clonado...');
  const ctx: BrowserContext = await chromium.launchPersistentContext(PERFIL, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [
      '--no-default-browser-check',
      '--no-first-run',
      '--restore-last-session',
    ],
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.google.com');

  console.log('\nChrome abierto. Cierra la ventana para terminar el script.');

  ctx.on('close', () => {
    console.log('Contexto cerrado. Saliendo.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

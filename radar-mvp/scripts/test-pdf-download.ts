/**
 * Test: descargar 1 PDF de BBVA vía Firecrawl proxy.
 * Si funciona, podemos procesarlo localmente como Aval.
 */
import { downloadPdf } from '../lib/pdf-pages.js';

async function main() {
  const url = 'https://www.bbva.com.co/content/dam/public-web/colombia/documents/promociones/remates-advance/Apartamentos-Inventario-Bienes-0403.pdf';
  const out = '/tmp/pdf-explore/bbva-apartamentos-fc.pdf';

  const result = await downloadPdf(url, out, 'https://www.bbva.com.co/personas/promocion/remates.html');
  console.log(JSON.stringify(result, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

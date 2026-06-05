/**
 * Utilidades para procesar PDFs página por página.
 *
 * Requiere poppler-utils instalado (pdftoppm, pdftotext, pdfinfo) en el PATH:
 *   - macOS:   brew install poppler
 *   - Windows: choco install poppler   (o scoop install poppler)
 *   - Linux:   apt-get install poppler-utils
 *
 * Flow:
 * 1. downloadPdfDirect(url) o downloadPdfViaFirecrawl(url) → archivo local
 * 2. getPdfPageCount(path) → número de páginas
 * 3. renderPage(path, pageNum, outDir) → JPG de la página
 * 4. extractPageText(path, pageNum) → texto plano con layout preservado
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('pdf-pages');

/** User-Agent realista para descargas directas. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Descarga directa con fetch. Falla si el servidor tiene WAF. */
export async function downloadPdfDirect(url: string, outPath: string, referer?: string): Promise<{ ok: boolean; size?: number; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept': 'application/pdf,*/*',
      'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
    };
    if (referer) headers['Referer'] = referer;

    const res = await fetch(url, { headers, redirect: 'follow' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const contentType = res.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await res.arrayBuffer());

    // Validar que sea PDF de verdad (no una página HTML de error/WAF)
    const firstBytes = buffer.subarray(0, 4).toString('utf8');
    if (firstBytes !== '%PDF') {
      return { ok: false, error: `No es PDF (content-type=${contentType}, first=${firstBytes})` };
    }

    writeFileSync(outPath, buffer);
    return { ok: true, size: buffer.length };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Descarga vía Firecrawl proxy (bypassa WAF). Usa endpoint /v2/scrape pidiendo rawHtml. */
export async function downloadPdfViaFirecrawl(url: string, outPath: string): Promise<{ ok: boolean; size?: number; error?: string }> {
  // Firecrawl v2 puede devolver `changeTracking.changeStatus` y formats incluyendo `screenshot`, `rawHtml`.
  // Para PDFs, Firecrawl los parsea por defecto y devuelve markdown. NO devuelve los bytes crudos del PDF.
  // Workaround: pedir solo el rawHtml — para un PDF, Firecrawl puede devolver representación texto.
  //
  // Solución correcta: usar el endpoint /v2/scrape de Firecrawl con `parsePDF: false` para que devuelva
  // los bytes en base64 dentro de `rawHtml`. Esto se hace vía API directa.

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { ok: false, error: 'FIRECRAWL_API_KEY missing' };

  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['rawHtml'],
        parsePDF: false,
        onlyMainContent: false,
      }),
    });

    if (!res.ok) return { ok: false, error: `Firecrawl HTTP ${res.status}: ${await res.text()}` };
    const data = await res.json() as { success?: boolean; data?: { rawHtml?: string } };

    if (!data.success || !data.data?.rawHtml) {
      return { ok: false, error: `Firecrawl sin rawHtml: ${JSON.stringify(data).substring(0, 200)}` };
    }

    // rawHtml en caso de PDF puede venir como base64 o como texto. Validamos.
    const raw = data.data.rawHtml;
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
      // Probablemente vino como texto / no como base64
      return { ok: false, error: `Firecrawl rawHtml no parece PDF base64 (primeros 50: ${raw.substring(0, 50)})` };
    }

    writeFileSync(outPath, buffer);
    return { ok: true, size: buffer.length };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Descarga con fallback: directo → Firecrawl. */
export async function downloadPdf(url: string, outPath: string, referer?: string): Promise<{ ok: boolean; size?: number; via?: 'direct' | 'firecrawl'; error?: string }> {
  log.info(`Descargando ${url}`);
  const direct = await downloadPdfDirect(url, outPath, referer);
  if (direct.ok) {
    log.info(`  ✓ Directo · ${((direct.size ?? 0) / 1024 / 1024).toFixed(1)} MB`);
    return { ...direct, via: 'direct' };
  }
  log.warn(`  ✗ Directo falló: ${direct.error}. Reintentando vía Firecrawl…`);
  const fc = await downloadPdfViaFirecrawl(url, outPath);
  if (fc.ok) {
    log.info(`  ✓ Firecrawl · ${((fc.size ?? 0) / 1024 / 1024).toFixed(1)} MB`);
    return { ...fc, via: 'firecrawl' };
  }
  log.error(`  ✗ Firecrawl falló: ${fc.error}`);
  return { ok: false, error: `direct=${direct.error}; firecrawl=${fc.error}` };
}

export function getPdfPageCount(pdfPath: string): number {
  const out = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
  const m = out.match(/Pages:\s+(\d+)/);
  return m ? parseInt(m[1]!, 10) : 0;
}

/**
 * Renderiza UNA página del PDF como JPG.
 * Retorna ruta absoluta de la JPG generada.
 */
export function renderPage(pdfPath: string, pageNum: number, outDir: string, opts: { dpi?: number; quality?: number; prefix?: string } = {}): string {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const dpi = opts.dpi ?? 150;
  const quality = opts.quality ?? 85;
  const prefix = opts.prefix ?? 'page';
  const outBase = join(outDir, prefix);

  execSync(
    `pdftoppm -jpeg -jpegopt quality=${quality} -r ${dpi} -f ${pageNum} -l ${pageNum} "${pdfPath}" "${outBase}"`,
    { stdio: 'pipe' },
  );

  // pdftoppm pad's pageNum según total pages. Buscamos la ruta exacta.
  const totalPages = getPdfPageCount(pdfPath);
  const pad = String(totalPages).length;
  const paddedNum = String(pageNum).padStart(pad, '0');
  const expectedPath = `${outBase}-${paddedNum}.jpg`;

  if (!existsSync(expectedPath)) {
    // Fallback: probar con diferentes padding
    for (let p = 1; p <= 4; p++) {
      const alt = `${outBase}-${String(pageNum).padStart(p, '0')}.jpg`;
      if (existsSync(alt)) return alt;
    }
    throw new Error(`No se encontró JPG renderizada para página ${pageNum}: probé ${expectedPath}`);
  }

  return expectedPath;
}

/** Extrae texto de UNA página preservando layout. */
export function extractPageText(pdfPath: string, pageNum: number): string {
  return execSync(`pdftotext -layout -f ${pageNum} -l ${pageNum} "${pdfPath}" -`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** Lee JPG como Buffer (para upload). */
export function readJpg(path: string): Buffer {
  return readFileSync(path);
}

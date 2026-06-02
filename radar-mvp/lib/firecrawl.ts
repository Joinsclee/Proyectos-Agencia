import FirecrawlApp from '@mendable/firecrawl-js';
import { env } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('firecrawl');

/**
 * Cliente Firecrawl. Por defecto usa cloud (api.firecrawl.dev).
 * Si FIRECRAWL_API_URL está seteado (self-host), apunta allí.
 */
export const fc = new FirecrawlApp({
  apiKey: env.FIRECRAWL_API_KEY,
  ...(env.FIRECRAWL_API_URL ? { apiUrl: env.FIRECRAWL_API_URL } : {}),
});

/**
 * Scrape de una URL con schema JSON estructurado.
 * Firecrawl usa el LLM interno para extraer según el schema → más resiliente que regex.
 *
 * @param url URL a scrapear
 * @param schema JSON Schema con los campos a extraer
 * @param prompt Instrucción para el LLM sobre cómo extraer
 * @param actions Opcional: clicks/waits para SPAs con JS
 */
export async function scrapeWithSchema<T = unknown>(opts: {
  url: string;
  schema: Record<string, unknown>;
  prompt: string;
  actions?: Array<Record<string, unknown>>;
  waitFor?: number;
}): Promise<{ data: T | null; error: string | null; rawMarkdown?: string }> {
  try {
    const params: Record<string, unknown> = {
      formats: [
        'markdown',
        {
          type: 'json',
          prompt: opts.prompt,
          schema: opts.schema,
        },
      ],
      onlyMainContent: true,
    };
    if (opts.waitFor) params.waitFor = opts.waitFor;
    if (opts.actions) params.actions = opts.actions;

    const result = await fc.scrapeUrl(opts.url, params);

    if (!result.success) {
      return { data: null, error: result.error || 'unknown error' };
    }

    // En v2 los datos vienen en result.json o result.data.json según versión SDK
    const data = (result as { json?: T; data?: { json?: T } }).json
      ?? (result as { json?: T; data?: { json?: T } }).data?.json
      ?? null;

    return {
      data,
      error: null,
      rawMarkdown: (result as { markdown?: string; data?: { markdown?: string } }).markdown
        ?? (result as { markdown?: string; data?: { markdown?: string } }).data?.markdown,
    };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

/**
 * Scrape simple (solo markdown, sin schema). Útil para listados donde solo necesitas
 * extraer URLs después con tu propio parsing.
 */
export async function scrapeMarkdown(opts: {
  url: string;
  actions?: Array<Record<string, unknown>>;
  waitFor?: number;
  onlyMainContent?: boolean;
}): Promise<{ markdown: string | null; html: string | null; error: string | null }> {
  try {
    const params: Record<string, unknown> = {
      formats: ['markdown', 'html', 'links'],
      onlyMainContent: opts.onlyMainContent ?? false,
    };
    if (opts.waitFor) params.waitFor = opts.waitFor;
    if (opts.actions) params.actions = opts.actions;

    const result = await fc.scrapeUrl(opts.url, params);

    if (!result.success) {
      return { markdown: null, html: null, error: result.error || 'unknown error' };
    }

    const r = result as { markdown?: string; html?: string; data?: { markdown?: string; html?: string } };
    return {
      markdown: r.markdown ?? r.data?.markdown ?? null,
      html: r.html ?? r.data?.html ?? null,
      error: null,
    };
  } catch (err) {
    return { markdown: null, html: null, error: (err as Error).message };
  }
}

/**
 * Batch scrape: múltiples URLs con el mismo schema.
 * Más eficiente que llamar scrapeWithSchema N veces.
 */
export async function batchScrapeWithSchema<T = unknown>(opts: {
  urls: string[];
  schema: Record<string, unknown>;
  prompt: string;
}): Promise<Array<{ url: string; data: T | null; error: string | null }>> {
  try {
    const result = await fc.batchScrapeUrls(opts.urls, {
      formats: [
        {
          type: 'json',
          prompt: opts.prompt,
          schema: opts.schema,
        },
      ],
      onlyMainContent: true,
    });

    if (!result.success) {
      log.error('Batch scrape falló', result.error);
      return opts.urls.map((url) => ({ url, data: null, error: result.error || 'batch failed' }));
    }

    const items = (result as { data?: Array<{ json?: T; metadata?: { sourceURL?: string } }> }).data ?? [];
    return items.map((item) => ({
      url: item.metadata?.sourceURL ?? '',
      data: item.json ?? null,
      error: item.json ? null : 'no json in response',
    }));
  } catch (err) {
    const msg = (err as Error).message;
    return opts.urls.map((url) => ({ url, data: null, error: msg }));
  }
}

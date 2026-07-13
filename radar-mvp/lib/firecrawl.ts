import { Firecrawl, type Document } from '@mendable/firecrawl-js';
import { env } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('firecrawl');

/**
 * Cliente Firecrawl v4. Por defecto cloud (api.firecrawl.dev).
 * Si FIRECRAWL_API_URL está seteado (self-host), apunta allí.
 */
export const fc = new Firecrawl({
  // La key es opcional en el entorno (el servidor web no scrapea). Si alguien
  // importa este cliente sin key, falla aquí con un mensaje claro en vez de
  // impedir que arranque cualquier proceso que sólo toque este módulo de refilón.
  apiKey: env.FIRECRAWL_API_KEY ?? '',
  ...(env.FIRECRAWL_API_URL ? { apiUrl: env.FIRECRAWL_API_URL } : {}),
});

/** Los scrapers que sí necesitan Firecrawl lo exigen explícitamente al arrancar. */
export function requireFirecrawlKey(): string {
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error('Falta FIRECRAWL_API_KEY: este scraper la necesita (el servidor web no).');
  }
  return env.FIRECRAWL_API_KEY;
}

/**
 * Scrape de una URL con schema JSON estructurado.
 * Firecrawl usa LLM interno para extraer según el schema → más resiliente que regex.
 *
 * Errores se lanzan como excepción y se capturan acá → retorno uniforme.
 */
export async function scrapeWithSchema<T = unknown>(opts: {
  url: string;
  schema: Record<string, unknown>;
  prompt: string;
  actions?: Array<Record<string, unknown>>;
  waitFor?: number;
}): Promise<{ data: T | null; error: string | null; rawMarkdown?: string }> {
  try {
    // Firecrawl v4: formats es array de strings o objetos { type, ...config }
    const formats: Array<unknown> = [
      'markdown',
      {
        type: 'json',
        prompt: opts.prompt,
        schema: opts.schema,
      },
    ];

    const result = await fc.scrape(opts.url, {
      formats: formats as never,
      onlyMainContent: true,
      ...(opts.waitFor ? { waitFor: opts.waitFor } : {}),
      ...(opts.actions ? { actions: opts.actions as never } : {}),
    });

    return {
      data: (result.json as T) ?? null,
      error: null,
      rawMarkdown: result.markdown,
    };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

/**
 * Scrape simple (markdown + html + links). Sin schema extraction.
 * Útil para listados donde extraes URLs con tu propio regex.
 */
export async function scrapeMarkdown(opts: {
  url: string;
  actions?: Array<Record<string, unknown>>;
  waitFor?: number;
  onlyMainContent?: boolean;
}): Promise<{ markdown: string | null; html: string | null; links: string[]; error: string | null }> {
  try {
    const result = await fc.scrape(opts.url, {
      formats: ['markdown', 'html', 'links'] as never,
      onlyMainContent: opts.onlyMainContent ?? false,
      ...(opts.waitFor ? { waitFor: opts.waitFor } : {}),
      ...(opts.actions ? { actions: opts.actions as never } : {}),
    });
    return {
      markdown: result.markdown ?? null,
      html: result.html ?? null,
      links: result.links ?? [],
      error: null,
    };
  } catch (err) {
    return { markdown: null, html: null, links: [], error: (err as Error).message };
  }
}

/**
 * Batch scrape: múltiples URLs con el mismo schema.
 * En SDK v4 batchScrape espera a que el job termine (bloqueante) y devuelve snapshot final.
 */
export async function batchScrapeWithSchema<T = unknown>(opts: {
  urls: string[];
  schema: Record<string, unknown>;
  prompt: string;
}): Promise<Array<{ url: string; data: T | null; error: string | null }>> {
  if (opts.urls.length === 0) return [];

  try {
    // En SDK v4 los formats van anidados en options
    const job = await fc.batchScrape(opts.urls, {
      options: {
        formats: [
          {
            type: 'json',
            prompt: opts.prompt,
            schema: opts.schema,
          },
        ] as never,
        onlyMainContent: true,
      },
    });

    if (job.status !== 'completed') {
      log.warn(`Batch job status: ${job.status} (${job.completed}/${job.total})`);
    }

    const docs: Document[] = job.data ?? [];

    // Mapear cada doc por su sourceURL para asegurar que la respuesta coincide con la url pedida
    const byUrl = new Map<string, Document>();
    for (const d of docs) {
      const src = d.metadata?.sourceURL;
      if (src) byUrl.set(src, d);
    }

    return opts.urls.map((url) => {
      const d = byUrl.get(url);
      if (!d) return { url, data: null, error: 'no result for url' };
      const data = (d.json as T) ?? null;
      return {
        url,
        data,
        error: data ? null : 'json field empty',
      };
    });
  } catch (err) {
    const msg = (err as Error).message;
    log.error('batchScrape falló', msg);
    return opts.urls.map((url) => ({ url, data: null, error: msg }));
  }
}

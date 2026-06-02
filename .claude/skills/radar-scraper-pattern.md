---
name: radar-scraper-pattern
description: Patrón canónico para escribir scrapers Firecrawl del proyecto radar-mvp. Úsalo al agregar un nuevo scraper de un portal de bancos o portal masivo (Bancolombia, Davivienda, BBVA, Aval, remates, FincaRaíz, etc.), o al ajustar parsers existentes. NO usar para Aura v2 (workflow n8n separado).
---

# Radar Scraper Pattern (Firecrawl)

Stack: **Firecrawl Cloud Free tier** + Supabase + zod. Scrapers en `radar-mvp/scrapers/{country}/{portal}/index.ts`.

## Dos patrones según el portal

### Patrón A — Listado + Detalle (Davivienda, Bancolombia)
Para portales con muchas propiedades, cada una en su propia ficha URL.

```ts
import { scrapeMarkdown, batchScrapeWithSchema } from '../../../lib/firecrawl.js';
import { upsertInmuebles, startScrapingLog, finishScrapingLog } from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import type { Inmueble, ScrapingRunResult } from '../../../lib/types.js';

const SOURCE = 'davivienda';
const COUNTRY = 'CO';
const log = createLogger(SOURCE);

// 1) Schema: campos que el LLM extrae de cada ficha. Mantén PEQUEÑO el schema
//    para que el extract sea barato y predecible.
const FICHA_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string', description: 'minúsculas sin tildes' },
    type: { type: 'string', enum: ['apartment','house','commercial','lot'] },
    price: { type: 'number', description: 'COP, solo número' },
    area_m2: { type: 'number', nullable: true },
    // ...
  },
  required: ['city', 'type', 'price'],
};

// 2) Listado: scrape markdown, regex para URLs candidatas
async function obtenerURLsDetalle() {
  const { html, markdown } = await scrapeMarkdown({ url: LISTADO_URL });
  return [...(html ?? markdown ?? '').matchAll(URL_PATTERN)].map(...);
}

// 3) Detalles: batch scrape con schema
const fichas = await batchScrapeWithSchema({ urls, schema: FICHA_SCHEMA, prompt: PROMPT });

// 4) Normalizar → upsert
await upsertInmuebles(fichas.map(toInmueble).filter(Boolean));
```

### Patrón B — Listado-único (BBVA, Aval, sites con pocos inmuebles en 1 página)
Para portales que muestran TODAS sus propiedades en una sola página.

```ts
import { scrapeWithSchema } from '../../../lib/firecrawl.js';

// Schema con array "inmuebles" — el LLM extrae todos en un solo call
const LISTADO_SCHEMA = {
  type: 'object',
  properties: {
    inmuebles: {
      type: 'array',
      items: { /* mismos campos que ficha */ }
    }
  },
  required: ['inmuebles'],
};

const { data } = await scrapeWithSchema<{ inmuebles: any[] }>({
  url: PORTAL_URL,
  schema: LISTADO_SCHEMA,
  prompt: PROMPT,
  waitFor: 2000,
});
```

## Para SPAs con JS pesado (Bancolombia, La Haus)

Usar `actions` para esperar/scrollear/clickear:

```ts
await scrapeMarkdown({
  url: LISTADO_URL,
  waitFor: 3000,
  actions: [
    { type: 'wait', milliseconds: 2000 },
    { type: 'scroll', direction: 'down' },
    { type: 'wait', milliseconds: 1500 },
  ],
});
```

## Para sitios con login (Fase 2, remates)

`actions` puede hacer login antes del scrape:

```ts
await scrapeMarkdown({
  url: 'https://rematandobienes.com/listados',
  actions: [
    { type: 'click', selector: 'a.login' },
    { type: 'type', selector: '#email', text: env.REMATES_USERNAME },
    { type: 'type', selector: '#password', text: env.REMATES_PASSWORD },
    { type: 'click', selector: 'button[type=submit]' },
    { type: 'wait', milliseconds: 3000 },
  ],
});
```

## Para PDFs (Aval)

Firecrawl detecta PDFs automáticamente. Si la página linkea a un PDF,
agregar `parsers: [{type: 'pdf', maxPages: 50}]` al scrape.

```ts
await scrapeWithSchema({
  url: PORTAL_URL,
  schema: SCHEMA,
  prompt: PROMPT,
  // El LLM extrae del markdown del PDF parseado
});
```

Si Firecrawl no parsea bien el PDF (escaneado/imagen), fallback al pipeline
custom del plan v1.1: descarga manual + `pdf-parse` + Claude Vision.

## `source_id` — clave de upsert

Es la 2da parte de la clave única `(country_code, source, source_id)`.
Debe ser estable entre runs para que upsert sea idempotente.

| Portal | Estrategia source_id |
|---|---|
| Davivienda | Segmento numérico final URL (`/apartamentos-000000004512` → `000000004512`) |
| Bancolombia | ID en URL o data attribute |
| BBVA | Hash MD5 de `address+price+area_m2+city` (no siempre hay ID estable) |
| Aval | `source_id_external` del schema si aparece, sino hash MD5 |
| Remates | Número de expediente jurídico |

## Reglas obligatorias

- ✅ Validar zod (`InmuebleSchema`) ANTES de upsert. Lo hace `upsertInmuebles()`.
- ✅ Cada run abre y cierra fila en `scraping_logs`.
- ✅ Devolver `null` desde `toInmueble()` si no hay `price` o `city` (no entran a BD).
- ✅ `city` en minúsculas sin tildes.
- ✅ `currency: 'COP'` por defecto en CO; ISO 4217 para otros países.
- ❌ NO inventar IDs aleatorios — debe ser determinístico.
- ❌ NO escribir parsers regex manuales — para eso está el schema de Firecrawl.
- ❌ NO insertar directo en `inmuebles` — siempre via `upsertInmuebles()`.
- ❌ NO usar Playwright manual — el legacy está en `_legacy/`.

## Debug

```bash
# Run con verbose
SCRAPE_LOG_LEVEL=debug npm run scrape:davivienda -- --max=2

# Smoke test los 4 portales (consume ~12 créditos Firecrawl)
npm run test:portals
```

Si un schema extract devuelve datos vacíos:
1. Revisa que el `prompt` es preciso (enums, formatos, qué hacer si no hay dato)
2. Sube `waitFor` para SPAs (la página puede no estar hidratada)
3. Agrega `actions: [{type:'scroll'}]` si hay lazy load
4. En último caso, scrape sin schema (`scrapeMarkdown`) y haz parsing propio del markdown

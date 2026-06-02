# Radar MVP — Scraping inmobiliario CRECE

Sistema de ingesta automatizada que rastrea portales bancarios y de remates en Colombia
para detectar oportunidades de inversión inmobiliaria.

Stack según [Plan de Trabajo Técnico MVP v1.1](../Andres%20Giraldo/Radar_Inmobiliario_Plan_MVP.docx).

## Stack

- **Runtime**: Node 20+ con TypeScript (ESM)
- **Scraping**: [Firecrawl](https://www.firecrawl.dev/) (Cloud Free tier inicial; self-host OSS disponible)
- **BD**: Supabase (PostgreSQL) — proyecto `cojwzekyeehqtxdvoldj`
- **Validación**: zod
- **Skills Claude Code**: `.claude/skills/radar-scraper-pattern.md`

## Por qué Firecrawl en vez de Playwright manual

- ✅ Schema JSON extraction → el LLM extrae datos estructurados sin parsers regex frágiles
- ✅ Maneja SPAs (React/Vue/Next) con `actions` (click, scroll, wait)
- ✅ Login automatizado para sites con auth (Fase 2: remates)
- ✅ Parser PDF nativo (Aval)
- ✅ Anti-bot / Cloudflare gestionado automáticamente (Cloud)
- ✅ Free tier alcanza para el MVP (~1.6k scrapes/mes vs 1k free)
- ✅ Plugin oficial para Claude Code: `npx -y firecrawl-cli@latest init --all --browser`

## Setup local

```bash
cd radar-mvp

# 1) Instalar deps
npm install

# 2) Configurar .env (copia y rellena)
cp .env.example .env
# Editar y completar:
#   FIRECRAWL_API_KEY=fc-...     (obtener en firecrawl.dev)
#   SUPABASE_SERVICE_ROLE_KEY=... (Supabase Dashboard → Settings → API)
```

## Aplicar schema en Supabase

Pegar [supabase/migrations/20260531000001_inmuebles_multipais.sql](supabase/migrations/20260531000001_inmuebles_multipais.sql)
en el SQL Editor del proyecto `cojwzekyeehqtxdvoldj.supabase.co`.

Verifica que aparezcan: tabla `inmuebles`, `precios_mercado`, `scraping_logs` + vistas `oportunidades_publicas` y `oportunidades_stats`.

## Comandos

```bash
# Smoke test: corre los 4 portales con 2-3 fichas cada uno (~12 créditos Firecrawl)
npm run test:portals

# Scraper individual
npm run scrape:davivienda -- --max=5
npm run scrape:bancolombia -- --max=5
npm run scrape:bbva
npm run scrape:aval

# Verbose
SCRAPE_LOG_LEVEL=debug npm run scrape:davivienda -- --max=3

# Typecheck
npm run typecheck
```

## Estructura

```
radar-mvp/
├── scrapers/CO/
│   ├── davivienda/     ✅ HTML estático + schema
│   ├── bancolombia/    ✅ SPA React (actions)
│   ├── bbva/           ✅ listado único
│   └── aval/           ✅ PDF parser nativo
├── engine/             📋 Fase 3: motor de comparables vs FincaRaíz
├── cron/               📋 Orchestrator + node-cron
├── lib/
│   ├── env.ts          validación zod de .env
│   ├── types.ts        InmuebleSchema (zod)
│   ├── logger.ts
│   ├── supabase.ts     upsertInmuebles + scraping_logs
│   └── firecrawl.ts    scrapeWithSchema + scrapeMarkdown + batchScrapeWithSchema
├── scripts/
│   └── test-all-portals.ts   smoke test matriz de viabilidad
├── supabase/migrations/
│   └── 20260531000001_inmuebles_multipais.sql
└── _legacy/            🗄 playwright.ts.bak (versión Playwright anterior)
```

## Fases

| Fase | Objetivo | Estado |
|---|---|---|
| 1 | Scraping bancario (Davivienda, Bancolombia, BBVA, Aval) | 🚧 en validación |
| 2 | Rematandobienes con login + eval Octoparse | ⏳ |
| 3 | Motor de comparables vs FincaRaíz → marcar `is_opportunity` | ⏳ |
| 4 | Frontend Next.js + paywall Wompi/Stripe | ⏳ |

## Convenciones

- Tablas y campos en **inglés** (multi-país desde día 1)
- Country code ISO 3166-1 alpha-2 (`CO`, `MX`, `PE`)
- Moneda ISO 4217 (`COP`, `MXN`, `PEN`)
- Upsert key: `(country_code, source, source_id)`

## Costos esperados

- **Firecrawl Free**: 1,000 scrapes/mes — alcanza para validar
- **Firecrawl Hobby**: $16/mes — 5,000 scrapes/mes (cuando pasemos a producción)
- **Railway**: ~$5/mes (cron runner sin browsers, súper liviano)
- **OpenAI/Anthropic**: $0 (Firecrawl Cloud incluye el LLM de extracción)

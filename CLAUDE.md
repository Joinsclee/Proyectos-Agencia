# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Qué es este repositorio

Este es el **workspace de trabajo de una agencia/freelance** (Cristhian / JoinsClee) que aloja las
entregas de **múltiples clientes independientes**: landing pages, embudos de venta, calculadoras,
dashboards y una app de scraping/analítica inmobiliaria. No es un producto único — cada carpeta de
primer nivel es una unidad de entrega casi autónoma para un cliente o marca distinta.

> Nota histórica: este archivo describía antes el repo open-source `n8n-skills`. Esa identidad ya
> no aplica a este directorio — el contenido real es el descrito abajo.

## Estructura por cliente/marca

| Carpeta | Cliente / marca | Contenido típico |
|---|---|---|
| `Andres Giraldo/` | Andrés Giraldo — Sistema CRECE | Landings, calculadoras/simuladores, embudo Hotmart |
| `radar-mvp/` | Andrés Giraldo — Radar de Oportunidades | App TS en capas: scraping + analítica inmobiliaria (ver abajo) |
| `Lina Toro/` | SAVIAS / Lina Toro | Embudo Ruta Jabonera, dashboard "Universo Lina", calculadoras, PDFs de clase |
| `JoinsClee Embudo/`, `JoinsClee-Checklist/`, `JoinsClee-Portal/`, `JoisnClee/` | JoinsClee (la agencia) | Sitio de agencia, checklist app, landings inmobiliario, portal de cliente |
| `Paulina/` | Paulina Valencia | App "Mi Barco" (Barco de Papel/Origami), build propio para GHL |
| `Andy/` | Vuela / Andy | Presentaciones (`deck-stage`, motor de decks reutilizado por otros clientes) |
| `Ivan/` | Iván Castrillón — La Huerta LAB | Universo de herramientas (login + 6 miniapps + agente IA), calculadoras de finca regenerativa |
| `Liz Pinto/`, `Nico/` | Otros clientes | Landings, calculadoras, workflows n8n puntuales |
| `Dashboard Financiero/` | Multi-cliente | Dashboards financieros (Lina, Paulina) sobre Supabase |
| `remotion-visitas/` | Transversal | Motor de video compartido (ver abajo) |
| `Playwright/` | Transversal | Arnés de automatización de navegador compartido |
| `n8n-Workflows/` | Transversal | Workflows n8n sueltos (JSON) |

Cada carpeta de cliente es casi independiente: sus propias páginas HTML, sus propios assets, y —
cuando necesita backend — su **propia** carpeta `supabase/migrations` (no se comparte esquema entre
clientes). No hay build ni dependencias compartidas a nivel raíz.

## Piezas de infraestructura compartida

Solo dos cosas son transversales de verdad y tienen sus propias reglas — **léelas antes de tocarlas**:

- **`remotion-visitas/`** — motor de video (Remotion/React) usado por todos los clientes. Cada pieza
  es una composición `.tsx` en `src/`, agrupada por cliente (`jc/` = JoinsClee, `crece/`, `radar/`,
  `vsl/`...). Tiene su propio `remotion-visitas/CLAUDE.md` con convenciones obligatorias (determinismo,
  formato de captions, `theme.ts`) y el skill `/video-editor-pro` para craft de edición de retención.
- **`Playwright/`** — automatización de navegador reutilizable, con perfil de Chrome clonado (ver
  `Playwright/README.md`).
- **`radar-mvp/`** — la única carpeta con arquitectura en capas real: `engine/`+`lib/` son el núcleo
  puro (stats, comparables, sin llamadas salientes), `scrapers/CO/<banco>/` extrae datos de portales
  bancarios/remates vía Firecrawl, `server/` expone el dashboard sobre Supabase, y `cron/`+`scripts/`
  son los entry points batch. Ver `radar-mvp/README.md` y `radar-mvp/docs/` para decisiones de stack
  ya documentadas (p. ej. Firecrawl vs Octoparse).

## Patrones a seguir

- **HTML autocontenido por defecto**: las páginas de cliente embeben su propio CSS/JS (y a veces
  datos) para poder abrirse con doble-click o deployarse copiando el archivo. No añadas un bundler
  a menos que el cliente ya lo tenga (radar-mvp, remotion-visitas, Paulina/app).
- **Un Supabase por cliente**: si un cliente necesita backend, crea su propia carpeta de migraciones
  dentro de su carpeta — nunca reutilices el esquema/proyecto de otro cliente.
- **Video → siempre por `remotion-visitas/`**, nunca edición manual ad-hoc, para mantener el motor
  y las convenciones (determinismo, captions) consistentes entre clientes.
- **Todo vídeo, con cualquier motor, pasa por la doctrina `edicion-humana-clee`** (no tapar ni encoger la
  cara, quitar antes que añadir, estilo del cliente en su variante mínima) y por su `revisar.py` antes de
  entregarse. Manda sobre las reglas de cada motor.
- Antes de un cambio no trivial en `radar-mvp/`, revisa `radar-mvp/docs/` — ya hay decisiones de
  stack documentadas ahí; sigue ese mismo formato si tomas una decisión nueva.

## Memoria de dominio (contexto de cliente, bugs ya resueltos, reglas de negocio)

El conocimiento específico de cada cliente (qué se rompió, qué decisión se tomó y por qué, reglas de
marca, credenciales/entornos) **no vive en este archivo** — vive en el vault de memoria persistente
del usuario (`/Users/cristhian/Vault`), indexado por el protocolo de recall configurado globalmente.
Antes de trabajar en un cliente específico, recupera el contexto de esa entidad desde ahí en vez de
asumir que este archivo lo tiene.

## Un ADR vive en codebase-memory

Este repo está indexado en el MCP `codebase-memory` como
`Users-cristhian-Downloads-Paginas-Web`, y tiene un ADR con el detalle arquitectónico completo
(stack, capas de radar-mvp, tradeoffs, filosofía de entrega). Consúltalo con
`manage_adr(project="Users-cristhian-Downloads-Paginas-Web", mode="get")` antes de asumir estructura
que no esté ya en este archivo.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

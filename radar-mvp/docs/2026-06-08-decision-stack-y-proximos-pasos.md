# Radar Inmobiliario (Andrés Giraldo) — Decisión de stack y próximos pasos

> **Fecha:** 2026-06-08
> **Proyecto:** Radar de Oportunidades Inmobiliarias · Sistema CRECE (`radar-mvp/`)
> **Estado:** Fase 1 (bancos) funcionando · Fase 2 (remates) autorizada por el cliente

---

## 1. Contexto

El **Radar** rastrea portales de bancos y de remates judiciales en Colombia para detectar
oportunidades de inversión inmobiliaria. Hoy alimenta un dashboard con **430 inmuebles reales**
extraídos de los bancos.

**Stack actual:** Node 20+/TypeScript · **Firecrawl** (scraping + extracción con LLM) ·
**Supabase/Postgres** (almacenamiento con upsert idempotente) · **zod** (validación) ·
**poppler** (procesado de PDFs página por página).

**Dashboard:** [`Andres Giraldo/RadarMVP-Dashboard.html`](../../Andres%20Giraldo/RadarMVP-Dashboard.html)
— HTML autocontenido (datos embebidos), se abre con doble-click.

---

## 2. Feedback del cliente (esta ronda)

Andrés revisó el MVP y pidió, por texto y audio:

1. **Comparar Octoparse vs. la herramienta actual** (Firecrawl) en relación **calidad-precio**.
2. El **link de precios** de la herramienta que usamos.
3. **Frecuencia:** bancos **2×/semana**, remates **1×/semana** (cree que publican los lunes).
4. **PDFs:** ya se extraen bien; mejorar la **presentación** (vista de 1ª página o algo más pulido).
5. **Fase 2 — remates** (`rematandobienes.com`): autoriza la prueba y entrega credenciales.
   Hay un **captcha** que romper.
6. **Remates por ciudad** (como los bancos), **sin fotos** → poner imágenes de apoyo por tipo
   (casa, lote, local…), y con **datos distintos** (de remate, no specs de propiedad) — se necesitan **todos**.
7. **(Audio) Lo que más valora:** saber qué registros son **nuevos vs. los que se conservan**,
   e incorporar **solo lo nuevo** cada semana. Precisión.

---

## 3. Decisión de stack: Octoparse vs Firecrawl

**Veredicto: para el stack que ya tenemos, Firecrawl gana en calidad-precio.**
Octoparse no resuelve mejor el problema real y es peor justo donde más trabajamos (PDFs).

### Comparativa (precios verificados a fuente oficial, junio 2026)

| Criterio (nuestro caso) | 🔥 Firecrawl | 🐙 Octoparse |
|---|---|---|
| Precio base | Free $0 (1.000 créd.) · **Hobby $16/mo** (5.000 créd.) · Standard $83/mo (100.000 créd.) | Free $0 (sin nube/captcha) · **Standard $69/mo anual** (~$83 mensual) · Pro $249/mo anual |
| **PDF (Aval, BBVA)** | ✅ Nativo + OCR. **Ya funciona** (~300 inmuebles del PDF de Aval) | ❌ Débil (su doc lo admite; recomiendan herramienta externa) |
| **Captcha (remates)** | ❌ No lo rompe; lo *previene* con proxies stealth | ✅ Built-in ($1 / 1.000 captchas) |
| Login con contraseña | ✅ `actions` + endpoint `/interact` (sesión persistente) | ✅ Módulo de login + cookies |
| Export a Supabase | ✅ API → worker → Supabase (limpio, serverless) | ⚠️ Requiere "Auto-Export Tool" **local abierta** desde tu IP |
| Reporte nuevos/conservados | ✅ Vive en *nuestro* Supabase | ⚠️ Más difícil con su modelo |
| Modelo | Código (ya construido, versionado en Git) | No-code |
| Costos ocultos | Proxy stealth = 5× créditos en sitios protegidos | Proxies residenciales **$3/GB** + captcha $1/1k → suben el costo real **50-80%** |

**Links de precios:** Firecrawl → https://www.firecrawl.dev/pricing · Octoparse → https://www.octoparse.com/pricing

### El dato que inclina la balanza

El único superpoder de Octoparse era el **captcha built-in**. Pero el recon técnico mostró que el
captcha de `rematandobienes.com` es **reCAPTCHA v2 y solo aparece en el login** — una vez con sesión
iniciada **no se repite**. Como Andrés **es suscriptor pagado legítimo**, la solución correcta es
**loguearse una vez, guardar la cookie de sesión y reusarla**. Si reaparece, un solver como
**CapSolver cuesta $0,80 / 1.000** → a 1 vez/semana son **centavos al año**. El captcha deja de ser
un motivo para pagar Octoparse.

### Recomendación

- **Fase 1 (bancos + PDFs):** quedarse en **Firecrawl** (migrar destruiría código que ya funciona
  y Octoparse es peor en PDF).
- **Fase 2 (remates):** **Firecrawl/Playwright + sesión persistente + CapSolver de respaldo.**
- **Plan/costo:** Firecrawl **Hobby $16/mo** para validar → **Standard $83/mo** en producción.
  + Railway ~$5/mo (cron). **Total ~$21–88/mo** vs. ~$69–148/mo real de Octoparse.
- **Único caso donde Octoparse tiene sentido:** que el scraper de remates lo opere/mantenga alguien
  **sin tocar código**. Es un trade-off operativo, no técnico.

---

## 4. Recon técnico de `rematandobienes.com`

| Aspecto | Hallazgo |
|---|---|
| Plataforma | WordPress (Woodmart + Elementor Pro + **JetEngine** + WooCommerce + **Paid Member Subscriptions**) sobre Hostinger/LiteSpeed detrás de Cloudflare |
| Login | `/my-account-2/` (form WooCommerce: `username`/`password`) + **reCAPTCHA v2** (checkbox). `/wp-login.php` está oculto (404) |
| Captcha | **reCAPTCHA v2, solo en el login.** Navegación autenticada **no** lo repite |
| Bloqueo Cloudflare | Dirigido a bots de IA; con cabeceras de navegador normal el sitio responde 200 (no es un muro universal) |
| Estructura | `/departamento/{x}/` → `/ciudad/{x}/` → aviso `/remates-judiciales/{slug}/`. Categorías por tipo (casas, apartamentos, fincas, lotes, locales) |
| Campos del aviso | juzgado, n.º de proceso, avalúo, **base/postura mínima**, **fecha y hora de diligencia**, **secuestre**, dirección, matrícula, % de depósito (datos de remate, no specs) |
| API | El custom post type **no** está en la REST pública → extraer parseando el HTML de JetEngine |
| Barrera técnica (con suscripción) | **Baja-media** |

**Enfoque recomendado:** Playwright + `storageState` (login una vez, reusar cookies) + IP/UA estable;
CapSolver solo como fallback si la sesión expira y reaparece el captcha. Cron semanal.

> Nota: revisar Términos de Servicio del sitio antes de operar en producción y usar rate-limiting suave.

---

## 5. Estado del código (`radar-mvp`)

El código **ya está estabilizado y es cross-platform** (commit `dfdb708`, 2026-06-05, **ya en GitHub**).
Incluye:

- `cron/orchestrator.ts` — corre los 4 portales (`npm run scrape:all`).
- `lib/is-main.ts` — detección de entrypoint cross-platform (el patrón viejo rompía en Windows).
- `os.tmpdir()` en los scrapers de PDF (en vez de `/tmp`).
- Dashboard con **ruta relativa** al repo (antes apuntaba a un disco Mac hardcodeado).
- `npm scripts` y smoke test apuntando a las versiones **v2** (las buenas, las de PDF).

### Para correr las pruebas localmente

1. `.env` — copiar `.env.example` y llenar `FIRECRAWL_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY`.
2. **poppler** en el PATH: Windows `choco install poppler` · Mac `brew install poppler` · Linux `apt-get install poppler-utils`.
3. `npm install` → `npm run test:portals` (matriz de viabilidad de los 4 portales).
4. Regenerar dashboard: `tsx scripts/build-dashboard.ts`.

> **Nota de entorno:** el repo vive en OneDrive y se desarrolla en Mac; el sync puede mostrar copias
> cacheadas/desfasadas en Windows. Confiar en `git` como fuente de verdad del estado real.

---

## 6. Próximos pasos (priorizados)

| # | Paso | Por qué |
|---|---|---|
| 1 | **Fase 2 — scraper de remates** | Login + `storageState` + parser por departamento/ciudad/tipo + modelo de datos de remate + imágenes placeholder por tipo. Es el reto que el cliente autorizó |
| 2 | **Reporte semanal nuevos / salidos / conservados** | Lo que Andrés **más valora** (audio). El upsert ya deduplica; falta la capa de diff/snapshot |
| 3 | **Frecuencia / cron** | Bancos 2×/semana, remates 1×/semana (lunes). Se configura en el deploy, no en el orchestrator |
| 4 | **Mejorar presentación de PDFs** | Pasar de "página A4 completa" a ficha limpia: foto recortada + datos estructurados |
| 5 | **Limpieza dead code** | Borrar v1 superseded (`aval/index.ts`, `bbva/index.ts`, `scrape-full.ts`, `scrape-bbva-aval.ts`) + agregar `npm run build:dashboard` |
| 6 | **Deploy a la nube** | Railway/Linux con `poppler-utils` + el cron de frecuencia. Objetivo de producción |

---

## 7. Respuesta enviada al cliente (resumen)

Se le confirmó a Andrés: (a) la comparación Octoparse vs Firecrawl con la recomendación de **mantener
el stack actual**; (b) los dos links de precios; (c) la frecuencia anotada; (d) propuesta de mejorar la
presentación de PDFs; (e) viabilidad de la Fase 2 con extracción por departamento→ciudad→tipo, imágenes
de apoyo por tipo y todos los campos del remate; (f) que el sistema ya detecta nuevos vs. conservados y
se le sumará un reporte semanal de cambios.

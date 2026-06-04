/**
 * Dashboard local: limpia datos en BD + genera HTML con los inmuebles
 * embebidos para visualización offline.
 *
 * v2: cards con foto principal + modal al click con galería completa,
 *     descripción, amenities y todos los datos del inmueble.
 *
 * Uso: tsx scripts/build-dashboard.ts → /tmp/radar-dashboard.html
 */

import { supabase } from '../lib/supabase.js';
import { normalizeCity, isReasonableInmueble } from '../lib/types.js';
import { createLogger } from '../lib/logger.js';
import { writeFileSync } from 'node:fs';

const log = createLogger('dashboard');

async function cleanup() {
  log.info('Paso 1: Cleanup');
  const { data: allRows } = await supabase.from('inmuebles').select('id, city');
  const updates = (allRows ?? [])
    .map((row) => ({ id: row.id, original: row.city, normalized: normalizeCity(row.city) }))
    .filter((u) => u.normalized !== u.original && u.normalized.length > 0);
  log.info(`  ${updates.length} cities a normalizar`);
  for (const u of updates) {
    await supabase.from('inmuebles').update({ city: u.normalized }).eq('id', u.id);
  }
  const { data: detailed } = await supabase.from('inmuebles').select('id, price, area_m2');
  const outliers = (detailed ?? []).filter((r) => !isReasonableInmueble(r));
  log.info(`  ${outliers.length} outliers a eliminar`);
  if (outliers.length > 0) {
    await supabase.from('inmuebles').delete().in('id', outliers.map((o) => o.id));
  }
}

async function fetchAllInmuebles() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('*')
    .order('scraped_at', { ascending: false });
  if (error) throw new Error(`fetchAll: ${error.message}`);
  return data ?? [];
}

function buildHTML(inmuebles: Record<string, unknown>[]): string {
  const json = JSON.stringify(inmuebles, null, 0);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Radar MVP · ${inmuebles.length} inmuebles</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tilt+Warp&family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
</head>
<body>

<!-- ╔══════════════════════════════════════════════════════════════════════╗
     ║  IMPORTANTE PARA GHL: este <style> va DENTRO de <body>,             ║
     ║  porque el widget "Custom HTML" de GHL solo conserva el body.       ║
     ║  Las secciones con clase .band rompen el ancho del container        ║
     ║  para que los fondos (hero/controls/footer) ocupen el viewport.     ║
     ╚══════════════════════════════════════════════════════════════════════╝ -->
<style>
    :root { --pp: #613174; --gold: #F1C901; --pp-dark: #4a2560; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; overflow-x: hidden; }
    body { font-family: 'Barlow Semi Condensed', sans-serif; background: #f7f4fa; color: #1a1a1a; }
    .font-tilt { font-family: 'Tilt Warp', cursive; }

    /* force-full-width: cada banda va de borde a borde del viewport,
       aunque GHL la meta dentro de una columna angosta con max-width */
    .band {
      position: relative;
      width: 100vw;
      left: 50%;
      right: 50%;
      margin-left: -50vw;
      margin-right: -50vw;
    }

    /* ───── HERO ───── */
    .hero {
      background: linear-gradient(135deg, #0f0a14 0%, #1e0a2e 40%, #2d1044 70%, #1a0528 100%);
      color: #fff; padding: 50px 24px 40px; text-align: center; position: relative; overflow: hidden;
    }
    .hero::before {
      content: ''; position: absolute; inset: 0;
      background:
        radial-gradient(ellipse at 30% 40%, rgba(97,49,116,0.35) 0%, transparent 60%),
        radial-gradient(ellipse at 70% 60%, rgba(241,201,1,0.08) 0%, transparent 50%);
      pointer-events: none;
    }
    .hero-content { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; }
    .pill {
      display: inline-block; background: linear-gradient(90deg, #F1C901, #e6b800);
      color: #1a1a1a; font-weight: 700; font-size: 0.7rem;
      padding: 5px 16px; border-radius: 99px; margin-bottom: 18px;
      letter-spacing: 0.1em; text-transform: uppercase;
    }
    h1 { font-family: 'Tilt Warp', cursive; font-size: clamp(2rem, 5vw, 3.2rem); margin: 0 0 12px; line-height: 1.1; }
    h1 .gold { color: var(--gold); }
    .sub { color: rgba(255,255,255,0.7); font-size: 1rem; max-width: 700px; margin: 0 auto 24px; }
    .stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px 40px; }
    .stat { text-align: center; }
    .stat-num { font-family: 'Tilt Warp', cursive; color: var(--gold); font-size: clamp(2rem, 5vw, 2.8rem); line-height: 1; }
    .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); margin-top: 4px; }
    .divider { width: 1px; background: rgba(255,255,255,0.18); min-height: 40px; }

    /* ───── CONTROLS ───── */
    /* No usar .band aquí: sticky requiere position: sticky y .band aplica relative
       con 100vw, lo cual rompe el sticky. El fondo se ajusta al ancho del container. */
    .controls {
      background: #fff; border-bottom: 2px solid #f0f0f0; padding: 16px 24px;
      box-shadow: 0 2px 20px rgba(97,49,116,0.10);
      position: sticky; top: 0; z-index: 50;
    }
    .controls-inner { max-width: 1280px; margin: 0 auto; display: grid; gap: 12px; }
    .filters-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    @media (max-width: 900px) { .filters-row { grid-template-columns: repeat(2, 1fr); } }
    .filter-label { display: block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 700; margin-bottom: 4px; }
    .filter-input {
      border: 2px solid #e5e7eb; border-radius: 8px; padding: 8px 10px;
      font-size: 0.85rem; font-weight: 500; font-family: inherit; width: 100%; background: #fff;
    }
    .filter-input:focus { outline: none; border-color: var(--pp); }
    .results-info { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #6b7280; }
    .btn-clear { color: var(--pp); font-weight: 600; font-size: 0.78rem; text-decoration: underline; background: none; border: none; cursor: pointer; }

    /* ───── GRID ───── */
    .content { max-width: 1280px; margin: 0 auto; padding: 28px 24px; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 18px; }

    /* ───── CARD ───── */
    .card {
      background: #fff; border-radius: 16px; border: 1px solid #ece4f1; overflow: hidden;
      box-shadow: 0 1px 3px rgba(97,49,116,0.04);
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex; flex-direction: column;
      cursor: pointer;
    }
    .card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(97,49,116,0.18); }

    .card-img-wrap {
      position: relative; width: 100%; aspect-ratio: 16/10; overflow: hidden;
      background: linear-gradient(135deg, #4a2560 0%, #613174 100%);
    }
    .card-img-wrap img {
      width: 100%; height: 100%; object-fit: cover; display: block;
      transition: transform 0.4s;
    }
    .card:hover .card-img-wrap img { transform: scale(1.06); }

    /* PDFs (BBVA/Aval): la imagen es una página completa A4 (vertical).
       Aspect-ratio más alto + crop desde arriba para que se vea la foto del inmueble
       y el bloque de precio, no el medio aleatorio del texto. */
    .card-img-wrap.is-pdf {
      aspect-ratio: 4/5;
      background: #ffffff;
    }
    .card-img-wrap.is-pdf img {
      object-fit: cover;
      object-position: top center;
    }
    .card:hover .card-img-wrap.is-pdf img { transform: scale(1.04); }

    .card-img-placeholder {
      width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.7); position: relative; overflow: hidden;
    }
    .card-img-placeholder::before {
      content: ''; position: absolute; inset: 0;
      background-image:
        radial-gradient(circle at 30% 30%, rgba(241,201,1,0.15) 0%, transparent 50%),
        radial-gradient(circle at 70% 70%, rgba(97,49,116,0.4) 0%, transparent 50%);
    }
    .card-img-placeholder-icon { font-size: 3rem; opacity: 0.5; position: relative; z-index: 1; }
    .card-img-placeholder-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-top: 6px; position: relative; z-index: 1; color: rgba(255,255,255,0.7); }

    .source-badge-overlay {
      position: absolute; top: 10px; right: 10px;
      font-size: 0.6rem; padding: 4px 10px; border-radius: 99px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      background: rgba(255,255,255,0.96); color: #4a2560; backdrop-filter: blur(8px); z-index: 2;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .photo-count-overlay {
      position: absolute; bottom: 10px; right: 10px;
      font-size: 0.7rem; padding: 4px 10px; border-radius: 99px; font-weight: 700;
      background: rgba(0,0,0,0.65); color: #fff; backdrop-filter: blur(8px); z-index: 2;
      display: flex; align-items: center; gap: 5px;
    }

    .card-header {
      background: linear-gradient(135deg, var(--pp) 0%, var(--pp-dark) 100%);
      color: #fff; padding: 12px 14px;
    }
    .card-price { font-family: 'Tilt Warp', cursive; font-size: 1.3rem; color: var(--gold); line-height: 1; }
    .card-price-m2 { font-size: 0.68rem; color: rgba(255,255,255,0.75); margin-top: 4px; font-weight: 500; }

    .card-body { padding: 12px 14px; flex: 1; }
    .card-titulo { font-size: 0.84rem; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin-bottom: 5px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card-ubic { font-size: 0.74rem; color: #6b7280; margin-bottom: 10px; }
    .card-ubic strong { color: var(--pp); font-weight: 600; }
    .card-features {
      display: flex; flex-wrap: wrap; gap: 8px 12px; font-size: 0.7rem; color: #4b5563;
      padding-top: 8px; border-top: 1px dashed #ece4f1;
    }
    .card-cta {
      text-align: center; padding: 8px;
      background: rgba(97,49,116,0.04); color: var(--pp); font-size: 0.7rem;
      font-weight: 600; letter-spacing: 0.04em;
    }

    /* ───── EMPTY ───── */
    .empty { text-align: center; padding: 60px 20px; color: #6b7280; }

    /* ───── FOOTER ───── */
    .footer { background: #0f0a14; color: rgba(255,255,255,0.65); padding: 28px 20px; text-align: center; font-size: 0.8rem; }
    .footer strong { color: var(--gold); font-family: 'Tilt Warp', cursive; }

    /* ───────────────────────────────────────── */
    /* MODAL                                      */
    /* ───────────────────────────────────────── */
    .modal-backdrop {
      display: none;
      position: fixed; inset: 0; background: rgba(15,10,20,0.85);
      backdrop-filter: blur(6px); z-index: 1000;
      align-items: center; justify-content: center; padding: 20px;
      animation: fadeIn 0.2s ease;
    }
    .modal-backdrop.open { display: flex; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .modal {
      background: #fff; border-radius: 20px;
      max-width: 1320px; width: 100%; max-height: 94vh;
      overflow: hidden; display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(440px, 1fr);
      box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalIn { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

    @media (max-width: 1024px) {
      .modal { grid-template-columns: 1fr; max-height: 96vh; }
    }

    .modal-close {
      position: absolute; top: 18px; right: 22px;
      width: 38px; height: 38px; border-radius: 50%;
      background: rgba(255,255,255,0.96); border: none; cursor: pointer;
      color: var(--pp); font-size: 1.3rem; font-weight: 700;
      z-index: 1010; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s;
    }
    .modal-close:hover { transform: scale(1.1) rotate(90deg); }

    /* ── Gallery ── */
    .gallery {
      position: relative; background: #0f0a14;
      display: flex; flex-direction: column;
      min-height: 0; max-height: 94vh;
    }
    .gallery-main {
      flex: 1; position: relative; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      min-height: 320px;
    }
    .gallery-main img {
      max-width: 100%; max-height: 100%; object-fit: contain; display: block;
    }
    .gallery-placeholder {
      width: 100%; height: 100%; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: rgba(255,255,255,0.4);
    }
    .gallery-placeholder-icon { font-size: 5rem; margin-bottom: 12px; opacity: 0.5; }
    .gallery-placeholder-text { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.12em; }

    .gallery-nav {
      position: absolute; top: 50%; transform: translateY(-50%);
      width: 44px; height: 44px; border-radius: 50%;
      background: rgba(255,255,255,0.92); border: none; cursor: pointer;
      color: var(--pp); font-size: 1.4rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: transform 0.15s;
    }
    .gallery-nav:hover { transform: translateY(-50%) scale(1.1); }
    .gallery-nav.prev { left: 16px; }
    .gallery-nav.next { right: 16px; }
    .gallery-nav.hidden { display: none; }

    .gallery-counter {
      position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: #fff; padding: 6px 14px;
      border-radius: 99px; font-size: 0.75rem; font-weight: 600;
      backdrop-filter: blur(8px);
    }

    .gallery-thumbs {
      display: flex; gap: 8px; padding: 12px;
      overflow-x: auto; background: rgba(0,0,0,0.4);
      scrollbar-width: thin;
    }
    .gallery-thumbs::-webkit-scrollbar { height: 6px; }
    .gallery-thumbs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
    .gallery-thumb {
      flex-shrink: 0; width: 70px; height: 50px; border-radius: 6px;
      overflow: hidden; cursor: pointer; opacity: 0.55;
      transition: opacity 0.2s, transform 0.2s;
      border: 2px solid transparent;
    }
    .gallery-thumb:hover { opacity: 0.9; }
    .gallery-thumb.active { opacity: 1; border-color: var(--gold); }
    .gallery-thumb img { width: 100%; height: 100%; object-fit: cover; }

    /* ── Detalle ── */
    .modal-detail {
      overflow-y: auto; padding: 36px 40px 32px;
      max-height: 94vh;
      scrollbar-width: thin;
      scrollbar-color: #d6c4e0 transparent;
    }
    .modal-detail::-webkit-scrollbar { width: 8px; }
    .modal-detail::-webkit-scrollbar-thumb { background: #d6c4e0; border-radius: 4px; }
    @media (max-width: 1024px) {
      .modal-detail { padding: 24px 22px; }
    }
    .modal-source-pill {
      display: inline-block; font-size: 0.72rem; padding: 5px 12px;
      border-radius: 99px; font-weight: 700; letter-spacing: 0.08em;
      background: var(--gold); color: var(--pp-dark);
      text-transform: uppercase; margin-bottom: 12px;
    }
    .modal-title {
      font-family: 'Tilt Warp', cursive;
      font-size: 1.85rem; color: var(--pp-dark); line-height: 1.15;
      margin: 0 0 10px; letter-spacing: -0.01em;
    }
    .modal-ubic { font-size: 1rem; color: #4b5563; margin-bottom: 22px; line-height: 1.4; }
    .modal-ubic strong { color: var(--pp); font-weight: 700; }

    .modal-price-block {
      background: linear-gradient(135deg, var(--pp) 0%, var(--pp-dark) 100%);
      color: #fff; padding: 22px 26px; border-radius: 14px; margin-bottom: 24px;
      box-shadow: 0 8px 24px rgba(97,49,116,0.18);
    }
    .modal-price {
      font-family: 'Tilt Warp', cursive;
      font-size: 2.4rem; color: var(--gold); line-height: 1;
      letter-spacing: -0.02em;
    }
    .modal-price-m2 {
      font-size: 0.95rem; color: rgba(255,255,255,0.88);
      margin-top: 10px; font-weight: 500;
    }

    .modal-features-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
      margin-bottom: 26px;
    }
    @media (max-width: 1200px) {
      .modal-features-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .modal-feature-item {
      background: #faf6fc; padding: 12px 14px; border-radius: 12px;
      display: flex; align-items: center; gap: 10px;
      font-size: 0.95rem; color: #1a1a1a; font-weight: 600;
      border: 1px solid #f0e6f7;
    }
    .modal-feature-icon { font-size: 1.25rem; line-height: 1; }
    .modal-feature-text {
      display: flex; flex-direction: column; min-width: 0;
    }
    .modal-feature-text strong {
      color: var(--pp); font-size: 0.7rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      margin-bottom: 2px;
    }
    .modal-feature-text span {
      font-size: 0.95rem; font-weight: 700; color: #1a1a1a;
    }

    .modal-section { margin-bottom: 24px; }
    .modal-section:last-of-type { margin-bottom: 0; }
    .modal-section-title {
      font-size: 0.78rem; color: var(--pp); font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .modal-section-title::before {
      content: ''; width: 4px; height: 16px; background: var(--gold); border-radius: 2px;
    }
    .modal-section p {
      font-size: 0.95rem; line-height: 1.65; color: #374151; margin: 0;
    }

    .amenities-list {
      display: flex; flex-wrap: wrap; gap: 8px;
    }
    .amenity-chip {
      background: #f0e6f7; color: var(--pp);
      padding: 6px 14px; border-radius: 99px;
      font-size: 0.85rem; font-weight: 600;
      border: 1px solid rgba(97,49,116,0.12);
    }

    .modal-cta {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background: linear-gradient(135deg, var(--pp), var(--pp-dark));
      color: #fff !important; text-decoration: none;
      padding: 16px 20px; border-radius: 12px;
      font-weight: 700; font-size: 0.95rem; letter-spacing: 0.04em;
      text-transform: uppercase; margin-top: 26px;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 6px 18px rgba(97,49,116,0.25);
    }
    .modal-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(97,49,116,0.35); }
</style>

<!-- HERO -->
<header class="hero band">
  <div class="hero-content">
    <div class="pill">Radar MVP · Dashboard interno</div>
    <h1>Inmuebles <span class="gold">extraídos</span></h1>
    <p class="sub">Dashboard local con datos reales del catálogo de bancos colombianos. Click en una propiedad para ver galería completa + detalles.</p>
    <div class="stats">
      <div class="stat"><div class="stat-num" id="s-total">—</div><div class="stat-label">Inmuebles</div></div>
      <div class="divider"></div>
      <div class="stat"><div class="stat-num" id="s-fotos">—</div><div class="stat-label">Con fotos</div></div>
      <div class="divider"></div>
      <div class="stat"><div class="stat-num" id="s-ciudades">—</div><div class="stat-label">Ciudades</div></div>
      <div class="divider"></div>
      <div class="stat"><div class="stat-num" id="s-promedio">—</div><div class="stat-label">Precio promedio</div></div>
    </div>
  </div>
</header>

<!-- FILTROS -->
<div class="controls">
  <div class="controls-inner">
    <div class="filters-row">
      <div>
        <label class="filter-label">Portal</label>
        <select id="f-portal" class="filter-input"><option value="">Todos</option></select>
      </div>
      <div>
        <label class="filter-label">Ciudad</label>
        <select id="f-city" class="filter-input"><option value="">Todas</option></select>
      </div>
      <div>
        <label class="filter-label">Tipo</label>
        <select id="f-type" class="filter-input"><option value="">Todos</option></select>
      </div>
      <div>
        <label class="filter-label">Precio máx (millones)</label>
        <input type="number" id="f-pricemax" class="filter-input" placeholder="ej. 500" min="0">
      </div>
      <div>
        <label class="filter-label">Orden</label>
        <select id="f-orden" class="filter-input">
          <option value="precio_m2_asc">Precio/m² menor</option>
          <option value="precio_asc">Precio menor</option>
          <option value="precio_desc">Precio mayor</option>
          <option value="recent">Más recientes</option>
        </select>
      </div>
    </div>
    <div class="results-info">
      <span id="results-count">0 inmuebles</span>
      <button id="btn-clear" class="btn-clear">Limpiar filtros</button>
    </div>
  </div>
</div>

<!-- GRID -->
<main class="content">
  <div id="grid" class="cards-grid"></div>
  <div id="empty" class="empty" style="display:none;">
    <div style="font-size: 2.5rem;">🔍</div>
    <div style="font-size: 1.1rem; font-weight: 700; color: var(--pp); margin-top: 10px;">Sin resultados</div>
    <div style="font-size: 0.85rem; margin-top: 6px;">Ajusta los filtros o limpia para ver todos.</div>
  </div>
</main>

<!-- MODAL -->
<div class="modal-backdrop" id="modal">
  <button class="modal-close" id="modal-close" aria-label="Cerrar">✕</button>
  <div class="modal" id="modal-content">
    <!-- Inyectado dinámicamente -->
  </div>
</div>

<footer class="footer band">
  <strong>Sistema CRECE</strong> · Radar MVP · Generado el ${new Date().toLocaleString('es-CO')} · ${inmuebles.length} inmuebles
</footer>

<script>
  const DATA = ${json};
  const fmtCOP = (n) => n ? '$' + Number(n).toLocaleString('es-CO') : '—';
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const sourceLabel = (s) => ({ davivienda:'Davivienda', bancolombia:'Bancolombia', bbva:'BBVA', aval:'Aval' }[s] || s);
  const typeLbl = (t) => ({ apartment:'Apartamento', house:'Casa', commercial:'Local/Comercial', lot:'Lote' }[t] || t);
  const sourceIcon = (s) => ({ davivienda:'🏛', bancolombia:'🏦', bbva:'🏛', aval:'🏢' }[s] || '🏠');

  // Helpers EXACTOS: priorizan los valores literales (*_raw) del portal/PDF
  const displayPrice = (p) => {
    const raw = p.features?.price_raw;
    if (raw && typeof raw === 'string' && raw.includes('$')) return raw;
    return fmtCOP(p.price);
  };
  const displayArea = (p) => {
    const raw = p.features?.area_raw;
    if (raw && typeof raw === 'string') return raw;
    if (p.area_m2 == null) return null;
    // Sin redondeo: si tiene decimales mostrarlos, sino entero
    const n = Number(p.area_m2);
    return (Number.isInteger(n) ? n : n.toFixed(2)) + ' m²';
  };
  const displayPricePerM2 = (p) => {
    if (!p.price_per_m2) return null;
    const n = Number(p.price_per_m2);
    return '$' + Math.round(n).toLocaleString('es-CO');
  };

  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const resultsCount = document.getElementById('results-count');
  const filters = {
    portal: document.getElementById('f-portal'),
    city: document.getElementById('f-city'),
    type: document.getElementById('f-type'),
    pricemax: document.getElementById('f-pricemax'),
    orden: document.getElementById('f-orden')
  };

  // Stats
  document.getElementById('s-total').textContent = DATA.length;
  document.getElementById('s-fotos').textContent = DATA.filter(d => d.image_url || (d.features?.images?.length > 0)).length;
  document.getElementById('s-ciudades').textContent = new Set(DATA.map(d => d.city).filter(Boolean)).size;
  const precios = DATA.map(d => d.price).filter(p => p && p > 0);
  const promedio = precios.length > 0 ? Math.round(precios.reduce((a,b) => a+b, 0) / precios.length) : 0;
  document.getElementById('s-promedio').textContent = '$' + (promedio / 1_000_000).toFixed(0) + 'M';

  // Poblar filtros
  function poblarSelect(sel, values, fmt) {
    [...new Set(values)].filter(Boolean).sort().forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = fmt ? fmt(v) : cap(v);
      sel.appendChild(opt);
    });
  }
  poblarSelect(filters.portal, DATA.map(d => d.source), sourceLabel);
  poblarSelect(filters.city, DATA.map(d => d.city));
  poblarSelect(filters.type, DATA.map(d => d.type), typeLbl);

  function getAllImages(p) {
    const arr = [];
    if (p.image_url) arr.push(p.image_url);
    if (Array.isArray(p.features?.images)) {
      p.features.images.forEach(u => { if (u && !arr.includes(u)) arr.push(u); });
    }
    return arr;
  }

  // ── RENDER GRID ──
  function render() {
    let list = DATA.filter(d => {
      if (filters.portal.value && d.source !== filters.portal.value) return false;
      if (filters.city.value && d.city !== filters.city.value) return false;
      if (filters.type.value && d.type !== filters.type.value) return false;
      if (filters.pricemax.value && d.price > parseInt(filters.pricemax.value) * 1_000_000) return false;
      return true;
    });

    const orden = filters.orden.value;
    if (orden === 'precio_asc') list.sort((a,b) => (a.price||Infinity) - (b.price||Infinity));
    else if (orden === 'precio_desc') list.sort((a,b) => (b.price||0) - (a.price||0));
    else if (orden === 'precio_m2_asc') list.sort((a,b) => (a.price_per_m2||Infinity) - (b.price_per_m2||Infinity));
    else if (orden === 'recent') list.sort((a,b) => new Date(b.scraped_at) - new Date(a.scraped_at));

    resultsCount.textContent = list.length + ' ' + (list.length === 1 ? 'inmueble' : 'inmuebles');

    if (list.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = list.map((p, i) => cardHtml(p, i)).join('');

    // Click handlers
    grid.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const idx = parseInt(c.dataset.idx, 10);
        const id = c.dataset.id;
        const item = list.find(x => x.id === id);
        if (item) openModal(item);
      });
    });
  }

  function cardHtml(p, i) {
    const f = p.features || {};
    const imgs = getAllImages(p);
    const sLabel = sourceLabel(p.source);
    const principal = imgs[0];
    // BBVA y Aval son PDFs: imagen es una página A4 vertical
    const isPdf = p.source === 'bbva' || p.source === 'aval';
    const wrapCls = isPdf ? 'card-img-wrap is-pdf' : 'card-img-wrap';

    const imgHtml = principal
      ? \`<img src="\${principal}" alt="\${typeLbl(p.type)} en \${cap(p.city)}" loading="lazy"
            onerror="this.parentElement.innerHTML=getPlaceholderHTML('\${sLabel}', '\${sourceIcon(p.source)}')">\`
      : getPlaceholderHTML(sLabel, sourceIcon(p.source));

    const countBadge = imgs.length > 1
      ? \`<span class="photo-count-overlay">📷 \${imgs.length}</span>\`
      : '';

    return \`
      <article class="card" data-id="\${p.id}" data-idx="\${i}">
        <div class="\${wrapCls}">
          \${imgHtml}
          <span class="source-badge-overlay">\${sLabel}</span>
          \${countBadge}
        </div>
        <div class="card-header">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div>
              <div class="card-price">\${displayPrice(p)}</div>
              <div class="card-price-m2">\${displayPricePerM2(p) ? displayPricePerM2(p) + ' / m²' : '—'}</div>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="card-titulo">\${typeLbl(p.type)}\${p.address ? ' · ' + p.address.substring(0, 80) : ''}</div>
          <div class="card-ubic">
            📍 \${p.zone ? p.zone + ' · ' : ''}<strong>\${cap(p.city)}</strong>
          </div>
          <div class="card-features">
            \${displayArea(p) ? \`<span>📐 \${displayArea(p)}</span>\` : ''}
            \${f.bedrooms ? \`<span>🛏 \${f.bedrooms}</span>\` : ''}
            \${f.bathrooms ? \`<span>🛁 \${f.bathrooms}</span>\` : ''}
            \${f.garages ? \`<span>🚗 \${f.garages}</span>\` : ''}
            \${f.stratum ? \`<span style="color: var(--pp); font-weight: 700;">E\${f.stratum}</span>\` : ''}
          </div>
        </div>
        <div class="card-cta">VER DETALLE COMPLETO →</div>
      </article>
    \`;
  }

  function getPlaceholderHTML(sLabel, icon) {
    return \`<div class="card-img-placeholder">
        <div class="card-img-placeholder-icon">\${icon}</div>
        <div class="card-img-placeholder-label">\${sLabel}</div>
      </div>\`;
  }

  // ── MODAL ──
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  const modalClose = document.getElementById('modal-close');
  let currentImgIdx = 0;
  let currentImgs = [];

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') prevImg();
    if (e.key === 'ArrowRight') nextImg();
  });

  function openModal(p) {
    const f = p.features || {};
    currentImgs = getAllImages(p);
    currentImgIdx = 0;

    const galleryHtml = currentImgs.length > 0
      ? \`
        <div class="gallery">
          <div class="gallery-main" id="g-main"></div>
          \${currentImgs.length > 1 ? \`
            <button class="gallery-nav prev" onclick="prevImg()">‹</button>
            <button class="gallery-nav next" onclick="nextImg()">›</button>
            <div class="gallery-counter" id="g-counter"></div>
            <div class="gallery-thumbs" id="g-thumbs"></div>
          \` : ''}
        </div>
      \`
      : \`
        <div class="gallery">
          <div class="gallery-main">
            <div class="gallery-placeholder">
              <div class="gallery-placeholder-icon">\${sourceIcon(p.source)}</div>
              <div class="gallery-placeholder-text">\${sourceLabel(p.source)}</div>
              <div style="font-size:0.7rem; margin-top:8px; opacity:0.5;">Esta propiedad viene de PDF · Sin galería</div>
            </div>
          </div>
        </div>
      \`;

    const features = [];
    const areaVal = displayArea(p);
    if (areaVal) features.push({ icon: '📐', label: 'Área', value: areaVal });
    if (f.bedrooms) features.push({ icon: '🛏', label: 'Habs', value: f.bedrooms });
    if (f.bathrooms) features.push({ icon: '🛁', label: 'Baños', value: f.bathrooms });
    if (f.garages) features.push({ icon: '🚗', label: 'Garajes', value: f.garages });
    if (f.stratum) features.push({ icon: '🏘', label: 'Estrato', value: f.stratum });
    if (f.year_built) features.push({ icon: '📅', label: 'Año', value: f.year_built });
    if (f.antiguedad) features.push({ icon: '⏳', label: 'Antigüedad', value: f.antiguedad });
    if (f.administracion) features.push({ icon: '💳', label: 'Admin.', value: fmtCOP(f.administracion) + '/mes' });

    const featuresHtml = features.map(ft => \`
      <div class="modal-feature-item">
        <span class="modal-feature-icon">\${ft.icon}</span>
        <div class="modal-feature-text">
          <strong>\${ft.label}</strong>
          <span>\${ft.value}</span>
        </div>
      </div>
    \`).join('');

    const amenitiesHtml = Array.isArray(f.amenities) && f.amenities.length > 0
      ? \`<div class="modal-section">
          <h3 class="modal-section-title">Amenidades</h3>
          <div class="amenities-list">
            \${f.amenities.map(a => \`<span class="amenity-chip">\${a}</span>\`).join('')}
          </div>
        </div>\`
      : '';

    const descriptionHtml = f.description
      ? \`<div class="modal-section">
          <h3 class="modal-section-title">Descripción</h3>
          <p>\${f.description.substring(0, 800)}\${f.description.length > 800 ? '…' : ''}</p>
        </div>\`
      : '';

    const addressHtml = p.address
      ? \`<div class="modal-section">
          <h3 class="modal-section-title">Dirección completa</h3>
          <p>\${p.address}</p>
        </div>\`
      : '';

    modalContent.innerHTML = \`
      \${galleryHtml}
      <div class="modal-detail">
        <span class="modal-source-pill">\${sourceLabel(p.source)}</span>
        <h2 class="modal-title">\${typeLbl(p.type)} en \${cap(p.city)}</h2>
        <div class="modal-ubic">📍 \${p.zone ? p.zone + ', ' : ''}<strong>\${cap(p.city)}</strong></div>

        <div class="modal-price-block">
          <div class="modal-price">\${displayPrice(p)}</div>
          <div class="modal-price-m2">\${displayPricePerM2(p) ? displayPricePerM2(p) + ' por m²' : 'Precio por m² no disponible'}</div>
        </div>

        <div class="modal-features-grid">\${featuresHtml}</div>

        \${addressHtml}
        \${descriptionHtml}
        \${amenitiesHtml}

        <a href="\${p.source_url}" target="_blank" rel="noopener" class="modal-cta">
          Ver en \${sourceLabel(p.source)} ↗
        </a>
      </div>
    \`;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (currentImgs.length > 0) {
      renderGalleryMain();
      if (currentImgs.length > 1) renderThumbs();
    }
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderGalleryMain() {
    const main = document.getElementById('g-main');
    if (!main) return;
    main.innerHTML = \`<img src="\${currentImgs[currentImgIdx]}" alt="Foto \${currentImgIdx + 1}" onerror="this.style.display='none'">\`;
    const counter = document.getElementById('g-counter');
    if (counter) counter.textContent = \`\${currentImgIdx + 1} / \${currentImgs.length}\`;
    document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
      t.classList.toggle('active', i === currentImgIdx);
    });
  }

  function renderThumbs() {
    const thumbs = document.getElementById('g-thumbs');
    if (!thumbs) return;
    thumbs.innerHTML = currentImgs.map((u, i) => \`
      <div class="gallery-thumb \${i === 0 ? 'active' : ''}" onclick="goImg(\${i})">
        <img src="\${u}" alt="Thumb \${i+1}" onerror="this.style.display='none'">
      </div>
    \`).join('');
  }

  function prevImg() {
    if (currentImgs.length < 2) return;
    currentImgIdx = (currentImgIdx - 1 + currentImgs.length) % currentImgs.length;
    renderGalleryMain();
  }
  function nextImg() {
    if (currentImgs.length < 2) return;
    currentImgIdx = (currentImgIdx + 1) % currentImgs.length;
    renderGalleryMain();
  }
  function goImg(i) {
    currentImgIdx = i;
    renderGalleryMain();
  }
  window.prevImg = prevImg;
  window.nextImg = nextImg;
  window.goImg = goImg;
  window.getPlaceholderHTML = getPlaceholderHTML;

  // ── Filtros ──
  Object.values(filters).forEach(f => f.addEventListener('change', render));
  filters.pricemax.addEventListener('input', render);
  document.getElementById('btn-clear').addEventListener('click', () => {
    Object.values(filters).forEach(f => { f.value = ''; });
    filters.orden.value = 'precio_m2_asc';
    render();
  });

  render();
</script>

</body>
</html>`;
}

async function main() {
  await cleanup();
  log.info('Paso 2: Fetch');
  const inmuebles = await fetchAllInmuebles();
  log.info(`  Total: ${inmuebles.length} inmuebles`);

  log.info('Paso 3: HTML');
  const html = buildHTML(inmuebles);

  const permanentPath = '/Users/cristhian/Downloads/Paginas Web/Andres Giraldo/RadarMVP-Dashboard.html';
  const tmpPath = '/tmp/radar-dashboard.html';
  writeFileSync(permanentPath, html, 'utf8');
  writeFileSync(tmpPath, html, 'utf8');
  log.info(`✅ ${permanentPath} (${(html.length / 1024).toFixed(0)} KB)`);
  log.info(`✅ ${tmpPath} (copia temporal)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

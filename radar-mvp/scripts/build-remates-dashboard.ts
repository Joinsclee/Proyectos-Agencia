/**
 * Dashboard de Remates Judiciales — autocontenido (datos embebidos).
 *
 * Diseñado para el caso de uso de remates: fecha de audiencia destacada,
 * postura mínima vs avalúo, juzgado, secuestre, link al aviso original.
 *
 * Salida: <repo>/Andres Giraldo/RadarMVP-Remates.html
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = createLogger('dashboard-remates');

async function fetchRemates() {
  const { data, error } = await supabase
    .from('remates')
    .select('*')
    .eq('is_active', true)
    .order('auction_date', { ascending: true });
  if (error) throw new Error(`fetch: ${error.message}`);
  return data ?? [];
}

function buildHTML(remates: Record<string, unknown>[]): string {
  const json = JSON.stringify(remates, null, 0);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Radar Remates · ${remates.length} avisos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tilt+Warp&family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
</head>
<body>

<!-- GHL: estilos dentro del body (Custom HTML Widget conserva solo body) -->
<style>
  :root { --pp: #613174; --gold: #F1C901; --pp-dark: #4a2560; --red: #dc2626; --green: #16a34a; --orange: #ea580c; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; overflow-x: hidden; }
  body { font-family: 'Barlow Semi Condensed', sans-serif; background: #f7f4fa; color: #1a1a1a; }

  /* force-full-width: hero y footer ocupan viewport completo aún en GHL */
  .band {
    position: relative;
    width: 100vw;
    left: 50%;
    right: 50%;
    margin-left: -50vw;
    margin-right: -50vw;
  }

  /* ─── HERO ─── */
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
  .sub { color: rgba(255,255,255,0.7); font-size: 1rem; max-width: 760px; margin: 0 auto 24px; }
  .stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px 40px; }
  .stat { text-align: center; }
  .stat-num { font-family: 'Tilt Warp', cursive; color: var(--gold); font-size: clamp(2rem, 5vw, 2.8rem); line-height: 1; }
  .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); margin-top: 4px; }
  .divider { width: 1px; background: rgba(255,255,255,0.18); min-height: 40px; }

  /* ─── CONTROLS ─── */
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

  /* ─── GRID ─── */
  .content { max-width: 1280px; margin: 0 auto; padding: 28px 24px; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }

  /* ─── CARD ─── */
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
  .card-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .source-badge {
    position: absolute; top: 10px; right: 10px;
    font-size: 0.6rem; padding: 4px 10px; border-radius: 99px; font-weight: 700;
    letter-spacing: 0.05em; text-transform: uppercase;
    background: rgba(255,255,255,0.96); color: #4a2560; backdrop-filter: blur(8px); z-index: 2;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .countdown-badge {
    position: absolute; bottom: 10px; left: 10px;
    font-size: 0.72rem; font-weight: 800;
    padding: 5px 11px; border-radius: 99px;
    backdrop-filter: blur(8px); z-index: 2;
    background: rgba(0,0,0,0.75); color: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    letter-spacing: 0.03em;
  }
  .countdown-badge.soon { background: var(--orange); }
  .countdown-badge.now  { background: var(--red); }
  .countdown-badge.past { background: rgba(0,0,0,0.45); }

  .card-header {
    background: linear-gradient(135deg, var(--pp) 0%, var(--pp-dark) 100%);
    color: #fff; padding: 12px 14px;
  }
  .card-price { font-family: 'Tilt Warp', cursive; font-size: 1.3rem; color: var(--gold); line-height: 1; }
  .card-price-label { font-size: 0.62rem; color: rgba(255,255,255,0.7); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; margin-top: 4px; }
  .card-postura { font-size: 0.78rem; color: rgba(255,255,255,0.95); margin-top: 8px; font-weight: 600; }
  .card-postura strong { color: var(--gold); font-weight: 800; }

  .card-body { padding: 12px 14px; flex: 1; }
  .card-titulo {
    font-size: 0.82rem; color: #1a1a1a; font-weight: 700; line-height: 1.3;
    text-transform: uppercase; letter-spacing: 0.02em;
    margin-bottom: 6px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-ubic { font-size: 0.74rem; color: #6b7280; margin-bottom: 10px; }
  .card-ubic strong { color: var(--pp); font-weight: 700; }

  .card-meta {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding-top: 8px; border-top: 1px dashed #ece4f1;
    font-size: 0.7rem; color: #4b5563;
  }
  .card-meta span { display: inline-flex; align-items: center; gap: 4px; }
  .card-meta .virtual { color: var(--green); font-weight: 700; cursor: help; }
  .card-meta .presencial { color: var(--orange); font-weight: 700; cursor: help; }
  .card-meta .auction { color: var(--pp); font-weight: 700; }

  /* ─── Leyenda de modalidades ─── */
  .legend {
    max-width: 1280px; margin: 0 auto; padding: 18px 24px 0;
  }
  .legend-card {
    background: linear-gradient(135deg, #faf6fc 0%, #f4ebf8 100%);
    border: 1px solid #e3d4ee; border-radius: 14px;
    padding: 16px 20px;
    display: flex; flex-wrap: wrap; align-items: center; gap: 18px 28px;
    font-size: 0.84rem; color: #4b5563;
  }
  .legend-title {
    font-size: 0.7rem; font-weight: 800;
    color: var(--pp); letter-spacing: 0.1em; text-transform: uppercase;
    display: flex; align-items: center; gap: 6px;
  }
  .legend-item { display: flex; align-items: center; gap: 8px; }
  .legend-dot {
    width: 10px; height: 10px; border-radius: 50%;
    display: inline-block; flex-shrink: 0;
  }
  .legend-dot.virtual { background: var(--green); }
  .legend-dot.presencial { background: var(--orange); }
  .legend-item strong { color: #1a1a1a; font-weight: 700; }

  .card-cta {
    text-align: center; padding: 8px;
    background: rgba(97,49,116,0.04); color: var(--pp); font-size: 0.7rem;
    font-weight: 600; letter-spacing: 0.04em;
  }

  /* ─── EMPTY ─── */
  .empty { text-align: center; padding: 60px 20px; color: #6b7280; }

  /* ─── FOOTER ─── */
  .footer { background: #0f0a14; color: rgba(255,255,255,0.65); padding: 28px 20px; text-align: center; font-size: 0.8rem; }
  .footer strong { color: var(--gold); font-family: 'Tilt Warp', cursive; }

  /* ─── MODAL ─── */
  .modal-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(15,10,20,0.85);
    backdrop-filter: blur(6px); z-index: 1000;
    align-items: center; justify-content: center; padding: 20px;
    animation: fadeIn 0.2s ease;
  }
  .modal-backdrop.open { display: flex; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: #fff; border-radius: 20px;
    max-width: 1100px; width: 100%; max-height: 94vh;
    overflow: hidden; display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(440px, 1fr);
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
    animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes modalIn { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (max-width: 1024px) { .modal { grid-template-columns: 1fr; max-height: 96vh; } }

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

  .modal-image { background: #0f0a14; display: flex; align-items: center; justify-content: center; min-height: 320px; }
  .modal-image img { max-width: 100%; max-height: 100%; display: block; object-fit: contain; }

  .modal-detail {
    overflow-y: auto; padding: 36px 40px 32px; max-height: 94vh;
    scrollbar-width: thin; scrollbar-color: #d6c4e0 transparent;
  }
  .modal-detail::-webkit-scrollbar { width: 8px; }
  .modal-detail::-webkit-scrollbar-thumb { background: #d6c4e0; border-radius: 4px; }
  @media (max-width: 1024px) { .modal-detail { padding: 24px 22px; } }

  .modal-source-pill {
    display: inline-block; font-size: 0.72rem; padding: 5px 12px;
    border-radius: 99px; font-weight: 700; letter-spacing: 0.08em;
    background: var(--gold); color: var(--pp-dark); text-transform: uppercase; margin-bottom: 12px;
  }
  .modal-title {
    font-family: 'Tilt Warp', cursive;
    font-size: 1.6rem; color: var(--pp-dark); line-height: 1.15;
    margin: 0 0 10px; letter-spacing: -0.01em;
  }
  .modal-ubic { font-size: 1rem; color: #4b5563; margin-bottom: 22px; line-height: 1.4; }
  .modal-ubic strong { color: var(--pp); font-weight: 700; }

  .modal-auction-block {
    background: linear-gradient(135deg, #fff7d6, #fef3c7);
    border: 2px solid var(--gold);
    padding: 18px 20px; border-radius: 14px; margin-bottom: 22px;
    text-align: center;
  }
  .modal-auction-date { font-family: 'Tilt Warp', cursive; font-size: 1.5rem; color: var(--pp-dark); line-height: 1; }
  .modal-auction-time { font-size: 1rem; color: var(--pp); font-weight: 700; margin-top: 8px; }
  .modal-auction-mode { font-size: 0.78rem; color: #6b7280; margin-top: 6px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }

  .modal-price-block {
    background: linear-gradient(135deg, var(--pp) 0%, var(--pp-dark) 100%);
    color: #fff; padding: 22px 26px; border-radius: 14px; margin-bottom: 22px;
    box-shadow: 0 8px 24px rgba(97,49,116,0.18);
  }
  .price-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; flex-wrap: wrap; }
  .price-col-label { font-size: 0.68rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 6px; }
  .price-avaluo { font-family: 'Tilt Warp', cursive; font-size: 1.8rem; color: rgba(255,255,255,0.92); line-height: 1; }
  .price-min { font-family: 'Tilt Warp', cursive; font-size: 2.1rem; color: var(--gold); line-height: 1; }
  .price-pct { font-size: 0.85rem; color: rgba(255,255,255,0.88); margin-top: 8px; font-weight: 600; }

  .modal-section { margin-bottom: 22px; }
  .modal-section:last-of-type { margin-bottom: 0; }
  .modal-section-title {
    font-size: 0.78rem; color: var(--pp); font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .modal-section-title::before {
    content: ''; width: 4px; height: 16px; background: var(--gold); border-radius: 2px;
  }
  .modal-section p {
    font-size: 0.93rem; line-height: 1.55; color: #374151; margin: 0;
  }
  .modal-section .court-email {
    display: inline-block; margin-top: 6px;
    font-size: 0.82rem; color: var(--pp); font-weight: 600; text-decoration: none;
  }
  .modal-section .court-email:hover { text-decoration: underline; }

  .kv { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; font-size: 0.9rem; color: #1a1a1a; }
  .kv .k { color: var(--pp); font-weight: 700; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.06em; padding-top: 2px; }
  .kv .v { font-weight: 500; }
  .kv .v.monoish { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.84rem; }

  .modal-cta {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: linear-gradient(135deg, var(--pp), var(--pp-dark));
    color: #fff !important; text-decoration: none;
    padding: 16px 20px; border-radius: 12px;
    font-weight: 700; font-size: 0.95rem; letter-spacing: 0.04em;
    text-transform: uppercase; margin-top: 24px;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 6px 18px rgba(97,49,116,0.25);
  }
  .modal-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(97,49,116,0.35); }
</style>

<!-- HERO -->
<header class="hero band">
  <div class="hero-content">
    <div class="pill">Radar de Remates · Sistema CRECE</div>
    <h1>Oportunidades en <span class="gold">remates judiciales</span></h1>
    <p class="sub">Avisos judiciales activos en Colombia. Click en cualquier remate para ver datos completos del juzgado, proceso, secuestre y diligencia.</p>
    <div class="stats">
      <div class="stat"><div class="stat-num" id="s-total">—</div><div class="stat-label">Avisos activos</div></div>
      <div class="divider"></div>
      <div class="stat"><div class="stat-num" id="s-cities">—</div><div class="stat-label">Ciudades</div></div>
      <div class="divider"></div>
      <div class="stat"><div class="stat-num" id="s-soon">—</div><div class="stat-label">Diligencias &lt; 30 días</div></div>
      <div class="divider"></div>
      <div class="stat"><div class="stat-num" id="s-avgmin">—</div><div class="stat-label">Postura promedio</div></div>
    </div>
  </div>
</header>

<!-- FILTROS -->
<div class="controls">
  <div class="controls-inner">
    <div class="filters-row">
      <div>
        <label class="filter-label">Departamento</label>
        <select id="f-dept" class="filter-input"><option value="">Todos</option></select>
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
        <label class="filter-label">Modalidad</label>
        <select id="f-mode" class="filter-input"><option value="">Todas</option><option value="virtual">Virtual</option><option value="presencial">Presencial</option></select>
      </div>
      <div>
        <label class="filter-label">Orden</label>
        <select id="f-orden" class="filter-input">
          <option value="auction_asc">Fecha audiencia (próximas)</option>
          <option value="auction_desc">Fecha audiencia (lejanas)</option>
          <option value="min_asc">Postura menor</option>
          <option value="min_desc">Postura mayor</option>
          <option value="avaluo_asc">Avalúo menor</option>
          <option value="avaluo_desc">Avalúo mayor</option>
        </select>
      </div>
    </div>
    <div class="results-info">
      <span id="results-count">0 remates</span>
      <button id="btn-clear" class="btn-clear">Limpiar filtros</button>
    </div>
  </div>
</div>

<!-- LEYENDA ─ Qué significa cada modalidad de remate -->
<div class="legend">
  <div class="legend-card">
    <span class="legend-title">⚖️ Modalidades de remate</span>
    <span class="legend-item">
      <span class="legend-dot virtual"></span>
      <strong>Virtual</strong> · la audiencia se hace por videoconferencia, puedes participar desde cualquier ciudad
    </span>
    <span class="legend-item">
      <span class="legend-dot presencial"></span>
      <strong>Presencial</strong> · hay que ir al juzgado físicamente a la hora indicada
    </span>
    <span class="legend-item" style="opacity:0.65;">
      <span class="legend-dot" style="background:#9ca3af"></span>
      <strong>Sin etiqueta</strong> · el aviso no lo especifica
    </span>
  </div>
</div>

<!-- GRID -->
<main class="content">
  <div id="grid" class="cards-grid"></div>
  <div id="empty" class="empty" style="display:none;">
    <div style="font-size: 2.5rem;">⚖️</div>
    <div style="font-size: 1.1rem; font-weight: 700; color: var(--pp); margin-top: 10px;">Sin resultados</div>
    <div style="font-size: 0.85rem; margin-top: 6px;">Ajusta los filtros o limpia para ver todos.</div>
  </div>
</main>

<!-- MODAL -->
<div class="modal-backdrop" id="modal">
  <button class="modal-close" id="modal-close" aria-label="Cerrar">✕</button>
  <div class="modal" id="modal-content"></div>
</div>

<footer class="footer band">
  <strong>Sistema CRECE</strong> · Radar Remates · Generado el ${new Date().toLocaleString('es-CO')} · ${remates.length} avisos
</footer>

<script>
  const DATA = ${json};
  const fmtCOP = (n) => n ? '$' + Number(n).toLocaleString('es-CO') : '—';
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const typeLbl = (t) => ({
    house: 'Casa', apartment: 'Apartamento', lot: 'Lote',
    farm: 'Finca', commercial: 'Local', office: 'Oficina'
  }[t] || (t ? cap(t) : 'Inmueble'));
  const modeLbl = (m) => ({ virtual: 'Virtual', presencial: 'Presencial', mixto: 'Mixto' }[m] || '');

  // Días hasta la audiencia (puede ser negativo si ya pasó)
  function daysToAuction(iso) {
    if (!iso) return null;
    const now = new Date();
    const d = new Date(iso + 'T12:00:00');
    return Math.round((d - now) / (1000 * 60 * 60 * 24));
  }

  function countdownBadge(iso) {
    const d = daysToAuction(iso);
    if (d == null) return '';
    if (d < 0) return '<span class="countdown-badge past">Ya realizada</span>';
    if (d === 0) return '<span class="countdown-badge now">¡HOY!</span>';
    if (d === 1) return '<span class="countdown-badge soon">⏰ Mañana</span>';
    if (d <= 7) return '<span class="countdown-badge soon">⏰ En ' + d + ' días</span>';
    if (d <= 30) return '<span class="countdown-badge">📅 En ' + d + ' días</span>';
    return '<span class="countdown-badge">📅 En ' + d + ' días</span>';
  }

  function fmtAuctionDate(iso, raw) {
    if (!iso) return raw || '—';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const resultsCount = document.getElementById('results-count');
  const filters = {
    dept: document.getElementById('f-dept'),
    city: document.getElementById('f-city'),
    type: document.getElementById('f-type'),
    mode: document.getElementById('f-mode'),
    orden: document.getElementById('f-orden')
  };

  // Stats
  document.getElementById('s-total').textContent = DATA.length;
  document.getElementById('s-cities').textContent = new Set(DATA.map(d => d.city).filter(Boolean)).size;
  document.getElementById('s-soon').textContent = DATA.filter(d => { const x = daysToAuction(d.auction_date); return x != null && x >= 0 && x <= 30; }).length;
  const mins = DATA.map(d => Number(d.minimum_bid)).filter(n => n > 0);
  const avg = mins.length > 0 ? Math.round(mins.reduce((a,b) => a+b, 0) / mins.length) : 0;
  document.getElementById('s-avgmin').textContent = '$' + (avg / 1_000_000).toFixed(0) + 'M';

  // Poblar filtros
  function poblarSelect(sel, values, fmt) {
    [...new Set(values)].filter(Boolean).sort().forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = fmt ? fmt(v) : cap(v);
      sel.appendChild(opt);
    });
  }
  poblarSelect(filters.dept, DATA.map(d => d.department));
  poblarSelect(filters.city, DATA.map(d => d.city));
  poblarSelect(filters.type, DATA.map(d => d.property_type), typeLbl);

  // ─── RENDER ───
  function render() {
    let list = DATA.filter(d => {
      if (filters.dept.value && d.department !== filters.dept.value) return false;
      if (filters.city.value && d.city !== filters.city.value) return false;
      if (filters.type.value && d.property_type !== filters.type.value) return false;
      if (filters.mode.value && d.auction_mode !== filters.mode.value) return false;
      return true;
    });

    const orden = filters.orden.value;
    if (orden === 'auction_asc') list.sort((a,b) => (a.auction_date || '9999-12-31').localeCompare(b.auction_date || '9999-12-31'));
    else if (orden === 'auction_desc') list.sort((a,b) => (b.auction_date || '0000-01-01').localeCompare(a.auction_date || '0000-01-01'));
    else if (orden === 'min_asc') list.sort((a,b) => (a.minimum_bid || Infinity) - (b.minimum_bid || Infinity));
    else if (orden === 'min_desc') list.sort((a,b) => (b.minimum_bid || 0) - (a.minimum_bid || 0));
    else if (orden === 'avaluo_asc') list.sort((a,b) => (a.appraisal_value || Infinity) - (b.appraisal_value || Infinity));
    else if (orden === 'avaluo_desc') list.sort((a,b) => (b.appraisal_value || 0) - (a.appraisal_value || 0));

    resultsCount.textContent = list.length + ' ' + (list.length === 1 ? 'remate' : 'remates');

    if (list.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    grid.innerHTML = list.map((p) => cardHtml(p)).join('');

    grid.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const id = c.dataset.id;
        const item = list.find(x => x.id === id);
        if (item) openModal(item);
      });
    });
  }

  function cardHtml(p) {
    const pct = (p.minimum_bid && p.appraisal_value)
      ? Math.round((Number(p.minimum_bid) / Number(p.appraisal_value)) * 100)
      : null;
    const title = (p.features?.title_raw) || (typeLbl(p.property_type) + ' en ' + cap(p.city));
    return \`
      <article class="card" data-id="\${p.id}">
        <div class="card-img-wrap">
          \${p.image_url ? \`<img src="\${p.image_url}" alt="\${typeLbl(p.property_type)}">\` : ''}
          <span class="source-badge">⚖️ Remate</span>
          \${countdownBadge(p.auction_date)}
        </div>
        <div class="card-header">
          <div class="card-price">\${fmtCOP(p.minimum_bid)}</div>
          <div class="card-price-label">Postura mínima\${pct ? ' · ' + pct + '% del avalúo' : ''}</div>
          <div class="card-postura">Avalúo: <strong>\${fmtCOP(p.appraisal_value)}</strong></div>
        </div>
        <div class="card-body">
          <div class="card-titulo">\${title}</div>
          <div class="card-ubic">📍 \${cap(p.city)}\${p.department ? ', ' + cap(p.department) : ''}</div>
          <div class="card-meta">
            <span class="auction">📅 \${fmtAuctionDate(p.auction_date, p.auction_date_raw)}</span>
            \${p.auction_time ? \`<span>🕐 \${p.auction_time}</span>\` : ''}
            \${p.auction_mode ? \`<span class="\${p.auction_mode}" title="\${p.auction_mode === 'virtual' ? 'Diligencia por videoconferencia — puedes participar sin viajar al juzgado' : p.auction_mode === 'presencial' ? 'Hay que ir físicamente al juzgado a la hora indicada' : 'Modalidad mixta'}">⚡ \${modeLbl(p.auction_mode)}</span>\` : ''}
          </div>
        </div>
        <div class="card-cta">VER DETALLES DEL REMATE →</div>
      </article>
    \`;
  }

  // ─── MODAL ───
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('open') && e.key === 'Escape') closeModal();
  });

  function openModal(p) {
    const pct = (p.minimum_bid && p.appraisal_value)
      ? Math.round((Number(p.minimum_bid) / Number(p.appraisal_value)) * 100)
      : null;
    const title = (p.features?.title_raw) || (typeLbl(p.property_type) + ' en ' + cap(p.city));

    const sectionDescription = p.description ? \`
      <div class="modal-section">
        <h3 class="modal-section-title">Descripción del bien</h3>
        <p>\${p.description}</p>
      </div>\` : '';

    const sectionAddress = p.address ? \`
      <div class="modal-section">
        <h3 class="modal-section-title">Dirección</h3>
        <p>\${p.address}</p>
      </div>\` : '';

    const sectionCourt = p.court ? \`
      <div class="modal-section">
        <h3 class="modal-section-title">Juzgado</h3>
        <p>\${p.court}</p>
        \${p.court_email ? \`<a class="court-email" href="mailto:\${p.court_email}">📧 \${p.court_email}</a>\` : ''}
      </div>\` : '';

    const partes = [];
    if (p.case_number) partes.push({ k: 'N° proceso', v: p.case_number, monoish: true });
    if (p.matricula_inmobiliaria) partes.push({ k: 'Matrícula', v: p.matricula_inmobiliaria, monoish: true });
    if (p.plaintiff) partes.push({ k: 'Demandante', v: p.plaintiff });
    if (p.defendant) partes.push({ k: 'Demandado', v: p.defendant });
    const sectionPartes = partes.length > 0 ? \`
      <div class="modal-section">
        <h3 class="modal-section-title">Proceso y partes</h3>
        <div class="kv">
          \${partes.map(x => \`<div class="k">\${x.k}</div><div class="v\${x.monoish ? ' monoish' : ''}">\${x.v}</div>\`).join('')}
        </div>
      </div>\` : '';

    const sectionTrustee = p.trustee ? \`
      <div class="modal-section">
        <h3 class="modal-section-title">Secuestre</h3>
        <p>\${p.trustee}</p>
      </div>\` : '';

    modalContent.innerHTML = \`
      <div class="modal-image">
        \${p.image_url ? \`<img src="\${p.image_url}" alt="\${typeLbl(p.property_type)}">\` : ''}
      </div>
      <div class="modal-detail">
        <span class="modal-source-pill">⚖️ Remate judicial</span>
        <h2 class="modal-title">\${title}</h2>
        <div class="modal-ubic">📍 \${cap(p.city)}\${p.department ? ', ' + cap(p.department) : ''}</div>

        <div class="modal-auction-block">
          <div class="modal-auction-date">📅 \${fmtAuctionDate(p.auction_date, p.auction_date_raw)}</div>
          \${p.auction_time ? \`<div class="modal-auction-time">🕐 \${p.auction_time}</div>\` : ''}
          \${p.auction_mode ? \`<div class="modal-auction-mode">⚡ Diligencia \${modeLbl(p.auction_mode)}</div>\` : ''}
        </div>

        <div class="modal-price-block">
          <div class="price-row">
            <div>
              <div class="price-col-label">Avalúo</div>
              <div class="price-avaluo">\${fmtCOP(p.appraisal_value)}</div>
            </div>
            <div style="text-align: right;">
              <div class="price-col-label">Postura mínima</div>
              <div class="price-min">\${fmtCOP(p.minimum_bid)}</div>
              \${pct ? \`<div class="price-pct">\${pct}% del avalúo</div>\` : ''}
            </div>
          </div>
          \${p.deposit_pct ? \`<div class="price-pct" style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">💵 Depósito requerido para participar: <strong style="color: var(--gold)">\${p.deposit_pct}%</strong></div>\` : ''}
        </div>

        \${sectionAddress}
        \${sectionDescription}
        \${sectionCourt}
        \${sectionPartes}
        \${sectionTrustee}

        <a href="\${p.source_url}" target="_blank" rel="noopener" class="modal-cta">
          Ver aviso en rematandobienes.com ↗
        </a>
      </div>
    \`;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Filtros
  Object.values(filters).forEach(f => f.addEventListener('change', render));
  document.getElementById('btn-clear').addEventListener('click', () => {
    Object.values(filters).forEach(f => { f.value = ''; });
    filters.orden.value = 'auction_asc';
    render();
  });

  render();
</script>

</body>
</html>`;
}

async function main() {
  log.info('Paso 1: Fetch remates activos');
  const remates = await fetchRemates();
  log.info(`  Total: ${remates.length} avisos`);

  log.info('Paso 2: Build HTML');
  const html = buildHTML(remates);

  // Ruta relativa al repo: <repo>/Andres Giraldo/RadarMVP-Remates.html
  const here = dirname(fileURLToPath(import.meta.url));
  const permanentPath = resolve(here, '..', '..', 'Andres Giraldo', 'RadarMVP-Remates.html');
  const tmpPath = join(tmpdir(), 'radar-remates-dashboard.html');
  writeFileSync(permanentPath, html, 'utf8');
  writeFileSync(tmpPath, html, 'utf8');
  log.info(`✅ ${permanentPath} (${(html.length / 1024).toFixed(0)} KB)`);
  log.info(`✅ ${tmpPath} (copia temporal)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

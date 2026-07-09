/**
 * Dashboard UNIFICADO — Bancos + Remates en una sola página con tabs.
 *
 * 3 tabs:
 *  - 🏦 Bancos (datos de tabla `inmuebles`): cards con galería + modal con
 *      todos los datos + foto principal del portal.
 *  - ⚖️ Remates (datos de tabla `remates` activos): cards con foto placeholder
 *      Unsplash + modal con datos jurídicos + badge Virtual/Presencial.
 *  - 📊 Todo: vista mixta consolidada por precio o por fecha.
 *
 * Salida: <repo>/Andres Giraldo/RadarMVP.html
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = createLogger('dashboard-unified');

async function fetchInmuebles() {
  // Tab Bancos: solo fuentes bancarias (excluye fincaraiz, que es portal abierto).
  // Filtramos por is_active=true para mostrar solo lo que sigue en los portales.
  const { data, error } = await supabase
    .from('inmuebles')
    .select('*')
    .eq('is_active', true)
    .neq('source', 'fincaraiz')
    .order('scraped_at', { ascending: false });
  if (error) throw new Error(`fetch inmuebles: ${error.message}`);
  return data ?? [];
}

async function fetchPortal() {
  // Tab Portal Abierto: listados de FincaRaíz del SEGMENTO objetivo (low-mid
  // ticket ≤ 420M). El baseline completo (incluye premium) vive en BD para el
  // motor de comparables, pero el dashboard muestra solo lo accionable.
  // Las oportunidades (is_opportunity) las calcula engine/run.ts. Orden: mayor
  // descuento primero para que las gangas salten arriba.
  const { data, error } = await supabase
    .from('inmuebles')
    .select('*')
    .eq('is_active', true)
    .eq('source', 'fincaraiz')
    .lte('price', 420_000_000)
    .order('discount_pct', { ascending: false, nullsFirst: false })
    .range(0, 899);
  if (error) throw new Error(`fetch portal: ${error.message}`);
  // Excluir proyectos (preventa) y quedarnos con los 700 de mayor descuento
  // (las oportunidades más fuertes). El inventario completo vive en la BD/app;
  // el HTML embebido en GHL debe quedar liviano.
  return (data ?? [])
    .filter((r) => !(r.features as { is_project?: boolean })?.is_project)
    .slice(0, 700);
}

async function fetchRemates() {
  const { data, error } = await supabase
    .from('remates')
    .select('*')
    .eq('is_active', true)
    .order('auction_date', { ascending: true });
  if (error) throw new Error(`fetch remates: ${error.message}`);
  return data ?? [];
}

/** Stats de lifecycle: cuántos desactivados / nuevos en los últimos 7 días, por fuente. */
async function fetchLifecycleStats() {
  const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [newInm, deactInm, newRem, deactRem] = await Promise.all([
    supabase.from('inmuebles').select('id', { count: 'exact', head: true })
      .gte('first_seen_at', weekAgoISO),
    supabase.from('inmuebles').select('id', { count: 'exact', head: true })
      .eq('is_active', false).gte('deactivated_at', weekAgoISO),
    supabase.from('remates').select('id', { count: 'exact', head: true })
      .gte('first_seen_at', weekAgoISO),
    supabase.from('remates').select('id', { count: 'exact', head: true })
      .eq('is_active', false).gte('deactivated_at', weekAgoISO),
  ]);
  return {
    inmuebles_new_7d: newInm.count ?? 0,
    inmuebles_out_7d: deactInm.count ?? 0,
    remates_new_7d: newRem.count ?? 0,
    remates_out_7d: deactRem.count ?? 0,
  };
}

function buildHTML(
  inmuebles: Record<string, unknown>[],
  remates: Record<string, unknown>[],
  portal: Record<string, unknown>[],
  lifecycle: { inmuebles_new_7d: number; inmuebles_out_7d: number; remates_new_7d: number; remates_out_7d: number },
): string {
  const inmueblesJSON = JSON.stringify(inmuebles, null, 0);
  const rematesJSON = JSON.stringify(remates, null, 0);
  // Portal viene enriquecido (~17 fotos + descripción larga por aviso). Para no
  // inflar el HTML embebido (GHL), adelgazamos: máx 8 fotos para la galería y
  // descripción a 320 chars. Los datos completos siguen en la BD.
  const slimPortal = portal.map((p) => {
    const f = (p.features ?? {}) as Record<string, unknown>;
    const imgs = Array.isArray(f.images) ? (f.images as string[]).slice(0, 6) : f.images;
    const desc = typeof f.description === 'string' ? f.description.slice(0, 320) : f.description;
    return { ...p, features: { ...f, images: imgs, description: desc } };
  });
  const portalJSON = JSON.stringify(slimPortal, null, 0);
  const totalNew = lifecycle.inmuebles_new_7d + lifecycle.remates_new_7d;
  const totalOut = lifecycle.inmuebles_out_7d + lifecycle.remates_out_7d;
  const totalActive = inmuebles.length + remates.length;
  // "Primera carga": casi todo aparece como nuevo y nada como salido → el
  // tracking aún no maduró. Mostramos un mensaje limpio en vez de "+561/−0".
  const isFirstLoad = totalOut === 0 && totalNew >= totalActive * 0.9;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Radar de Oportunidades · ${inmuebles.length + remates.length} avisos · Sistema CRECE</title>
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

  /* force-full-width para fondos */
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
    color: #fff; padding: 50px 24px 30px; text-align: center; position: relative; overflow: hidden;
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
  h1 { font-family: 'Tilt Warp', cursive; font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 12px; line-height: 1.1; }
  h1 .gold { color: var(--gold); }
  .sub { color: rgba(255,255,255,0.7); font-size: 1rem; max-width: 760px; margin: 0 auto; }

  /* Barra de resumen — diseño editorial plano y sobrio */
  .summary-bar {
    margin: 34px auto 0;
    display: flex; flex-wrap: wrap; justify-content: center; align-items: stretch;
    border-top: 1px solid rgba(255,255,255,0.12);
    border-bottom: 1px solid rgba(255,255,255,0.12);
    padding: 18px 0;
    max-width: 820px;
  }
  .summary-stat {
    flex: 1 1 0;
    padding: 2px 26px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center;
    border-right: 1px solid rgba(255,255,255,0.12);
    min-width: 120px;
  }
  .summary-stat:last-child { border-right: none; }
  .summary-stat .num {
    font-family: 'Tilt Warp', cursive;
    font-size: 1.9rem; line-height: 1; letter-spacing: -0.01em;
    color: var(--gold);
  }
  .summary-stat.muted .num { color: #fff; font-size: 1.25rem; }
  .summary-stat .lbl {
    font-size: 0.64rem; color: rgba(255,255,255,0.55);
    letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;
    margin-top: 8px;
  }
  /* Línea de movimiento semanal (chips sutiles, solo cuando hay datos) */
  .movement {
    margin: 16px auto 0;
    display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center;
    gap: 8px 10px;
    font-size: 0.8rem; color: rgba(255,255,255,0.7);
  }
  .movement .mv {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 8px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.10);
    font-weight: 600;
  }
  .movement .mv.up   { color: #6ee7a8; }
  .movement .mv.down { color: #fca5a5; }
  .movement .mv b { font-weight: 800; }
  .movement .mv-note {
    color: rgba(255,255,255,0.45); font-style: italic; font-weight: 500;
    padding: 5px 4px;
  }
  @media (max-width: 640px) {
    .summary-bar { flex-direction: column; gap: 0; max-width: 300px; padding: 8px 0; }
    .summary-stat {
      border-right: none; border-bottom: 1px solid rgba(255,255,255,0.12);
      padding: 12px 16px; flex-direction: row; justify-content: space-between;
    }
    .summary-stat:last-child { border-bottom: none; }
    .summary-stat .lbl { margin-top: 0; }
  }

  /* ───── TABS ───── */
  .tabs-bar {
    background: #fff; border-bottom: 2px solid #f0f0f0;
    padding: 0; position: sticky; top: 0; z-index: 50;
    box-shadow: 0 2px 18px rgba(97,49,116,0.10);
  }
  .tabs-inner {
    max-width: 1280px; margin: 0 auto;
    display: flex; align-items: stretch; gap: 0;
    padding: 0 16px;
    overflow-x: auto; scrollbar-width: none;
  }
  .tabs-inner::-webkit-scrollbar { display: none; }
  .tab-btn {
    background: transparent; border: none; cursor: pointer;
    padding: 18px 22px 16px;
    font-family: inherit; font-weight: 700; font-size: 0.92rem;
    color: #6b7280; letter-spacing: 0.02em;
    border-bottom: 3px solid transparent;
    display: flex; align-items: center; gap: 8px;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .tab-btn:hover { color: var(--pp); }
  .tab-btn.active {
    color: var(--pp);
    border-bottom-color: var(--gold);
  }
  .tab-btn .tab-emoji { font-size: 1.2rem; }
  .tab-btn .tab-count {
    background: #f0e6f7; color: var(--pp);
    font-size: 0.72rem; font-weight: 800;
    padding: 2px 9px; border-radius: 99px;
    font-variant-numeric: tabular-nums;
  }
  .tab-btn.active .tab-count {
    background: var(--gold); color: var(--pp-dark);
  }

  /* ───── STATS BAR (cambia por tab) ───── */
  .stats-bar {
    background: #faf6fc; border-bottom: 1px solid #ece4f1;
    padding: 14px 24px;
  }
  .stats-inner {
    max-width: 1280px; margin: 0 auto;
    display: flex; flex-wrap: wrap; justify-content: center; gap: 22px 38px;
  }
  .stat { text-align: center; }
  .stat-num {
    font-family: 'Tilt Warp', cursive; color: var(--pp-dark);
    font-size: clamp(1.4rem, 3vw, 1.9rem); line-height: 1;
  }
  .stat-label {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: #6b7280; margin-top: 4px; font-weight: 700;
  }

  /* ───── CONTROLS (cambia por tab) ───── */
  .controls {
    background: #fff; border-bottom: 1px solid #f0f0f0;
    padding: 14px 24px;
  }
  .controls-inner { max-width: 1280px; margin: 0 auto; display: grid; gap: 12px; }
  .filters-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  @media (max-width: 900px) { .filters-row { grid-template-columns: repeat(2, 1fr); } }
  .filter-label { display: block; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 700; margin-bottom: 4px; }
  .filter-input {
    border: 2px solid #e5e7eb; border-radius: 8px; padding: 7px 10px;
    font-size: 0.85rem; font-weight: 500; font-family: inherit; width: 100%; background: #fff;
  }
  .filter-input:focus { outline: none; border-color: var(--pp); }
  .results-info { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: #6b7280; }
  .btn-clear { color: var(--pp); font-weight: 700; font-size: 0.76rem; text-decoration: underline; background: none; border: none; cursor: pointer; }

  /* ───── LEYENDA (solo en tab remates) ───── */
  .legend {
    max-width: 1280px; margin: 16px auto 0; padding: 0 24px;
  }
  .legend-card {
    background: linear-gradient(135deg, #faf6fc 0%, #f4ebf8 100%);
    border: 1px solid #e3d4ee; border-radius: 14px;
    padding: 14px 18px;
    display: flex; flex-wrap: wrap; align-items: center; gap: 14px 26px;
    font-size: 0.82rem; color: #4b5563;
  }
  .legend-title {
    font-size: 0.66rem; font-weight: 800;
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

  /* ───── GRID ───── */
  .content { max-width: 1280px; margin: 0 auto; padding: 26px 24px; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 18px; }

  /* ───── CARD (común) ───── */
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
  .card-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s; }
  .card:hover .card-img-wrap img { transform: scale(1.06); }

  /* Cards de bancos con PDF: aspect-ratio 4/5 + position top */
  .card-img-wrap.is-pdf { aspect-ratio: 4/5; background: #ffffff; }
  .card-img-wrap.is-pdf img { object-fit: cover; object-position: top center; }
  .card:hover .card-img-wrap.is-pdf img { transform: scale(1.04); }

  .source-badge {
    position: absolute; top: 10px; right: 10px;
    font-size: 0.6rem; padding: 4px 10px; border-radius: 99px; font-weight: 700;
    letter-spacing: 0.05em; text-transform: uppercase;
    background: rgba(255,255,255,0.96); color: #4a2560; backdrop-filter: blur(8px); z-index: 2;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .photo-count {
    position: absolute; bottom: 10px; right: 10px;
    font-size: 0.7rem; padding: 4px 10px; border-radius: 99px; font-weight: 700;
    background: rgba(0,0,0,0.65); color: #fff; backdrop-filter: blur(8px); z-index: 2;
  }
  /* Badge de oportunidad (motor de comparables) */
  .opp-badge {
    position: absolute; top: 10px; left: 10px;
    font-size: 0.62rem; padding: 5px 10px; border-radius: 99px; font-weight: 800;
    letter-spacing: 0.04em; text-transform: uppercase; z-index: 3;
    background: var(--green); color: #fff;
    box-shadow: 0 3px 10px rgba(22,163,74,0.4);
  }
  .opp-badge.high {
    background: linear-gradient(135deg, var(--gold), #e0a800); color: var(--pp-dark);
    box-shadow: 0 3px 12px rgba(241,201,1,0.5);
  }
  /* Sección de análisis de mercado en el modal */
  .market-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; margin-bottom: 12px;
  }
  .market-grid > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .market-lbl { font-size: 0.66rem; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
  .market-grid strong { font-size: 1.1rem; color: rgba(255,255,255,0.95); font-weight: 800; line-height: 1.1; }
  .market-sub { font-size: 0.72rem; color: rgba(255,255,255,0.5); font-weight: 600; }
  .market-note { font-size: 0.78rem; color: rgba(255,255,255,0.55); line-height: 1.5; margin: 0; }
  .countdown-badge {
    position: absolute; bottom: 10px; left: 10px;
    font-size: 0.72rem; font-weight: 800;
    padding: 5px 11px; border-radius: 99px;
    backdrop-filter: blur(8px); z-index: 2;
    background: rgba(0,0,0,0.75); color: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .countdown-badge.soon { background: var(--orange); }
  .countdown-badge.now  { background: var(--red); }
  .countdown-badge.past { background: rgba(0,0,0,0.45); }

  .card-header {
    background: linear-gradient(135deg, var(--pp) 0%, var(--pp-dark) 100%);
    color: #fff; padding: 12px 14px;
  }
  .card-price { font-family: 'Tilt Warp', cursive; font-size: 1.3rem; color: var(--gold); line-height: 1; }
  .card-price-sub { font-size: 0.68rem; color: rgba(255,255,255,0.75); margin-top: 4px; font-weight: 500; }
  .card-price-extra { font-size: 0.78rem; color: rgba(255,255,255,0.95); margin-top: 8px; font-weight: 600; }
  .card-price-extra strong { color: var(--gold); font-weight: 800; }

  .card-body { padding: 12px 14px; flex: 1; }
  .card-titulo {
    font-size: 0.84rem; color: #1a1a1a; font-weight: 700; line-height: 1.3;
    margin-bottom: 6px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-ubic { font-size: 0.74rem; color: #6b7280; margin-bottom: 10px; }
  .card-ubic strong { color: var(--pp); font-weight: 700; }
  .card-meta {
    display: flex; flex-wrap: wrap; gap: 7px 12px;
    padding-top: 8px; border-top: 1px dashed #ece4f1;
    font-size: 0.7rem; color: #4b5563;
  }
  .card-meta .virtual { color: var(--green); font-weight: 700; cursor: help; }
  .card-meta .presencial { color: var(--orange); font-weight: 700; cursor: help; }
  .card-meta .auction { color: var(--pp); font-weight: 700; }
  .card-cta {
    text-align: center; padding: 8px;
    background: rgba(97,49,116,0.04); color: var(--pp); font-size: 0.7rem;
    font-weight: 600; letter-spacing: 0.04em;
  }

  /* ───── EMPTY ───── */
  .empty { text-align: center; padding: 60px 20px; color: #6b7280; }
  .empty .icon { font-size: 2.5rem; }
  .empty .h { font-size: 1.1rem; font-weight: 700; color: var(--pp); margin-top: 10px; }
  .empty .p { font-size: 0.85rem; margin-top: 6px; }

  /* ───── FOOTER ───── */
  .footer { background: #0f0a14; color: rgba(255,255,255,0.65); padding: 28px 20px; text-align: center; font-size: 0.8rem; }
  .footer strong { color: var(--gold); font-family: 'Tilt Warp', cursive; }

  /* ───────────────────────── */
  /* MODAL                     */
  /* ───────────────────────── */
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
    max-width: 1320px; width: 100%; max-height: 94vh;
    overflow: hidden; display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(440px, 1fr);
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
  .gallery-main img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .gallery-nav {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 44px; height: 44px; border-radius: 50%;
    background: rgba(255,255,255,0.92); border: none; cursor: pointer;
    color: var(--pp); font-size: 1.4rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: transform 0.15s;
  }
  .gallery-nav:hover { transform: translateY(-50%) scale(1.1); }
  .gallery-nav.prev { left: 16px; }
  .gallery-nav.next { right: 16px; }
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
    transition: opacity 0.2s; border: 2px solid transparent;
  }
  .gallery-thumb:hover { opacity: 0.9; }
  .gallery-thumb.active { opacity: 1; border-color: var(--gold); }
  .gallery-thumb img { width: 100%; height: 100%; object-fit: cover; }

  .modal-detail {
    overflow-y: auto; padding: 36px 40px 32px;
    max-height: 94vh;
    scrollbar-width: thin; scrollbar-color: #d6c4e0 transparent;
  }
  .modal-detail::-webkit-scrollbar { width: 8px; }
  .modal-detail::-webkit-scrollbar-thumb { background: #d6c4e0; border-radius: 4px; }
  @media (max-width: 1024px) { .modal-detail { padding: 24px 22px; } }

  .modal-source-pill {
    display: inline-block; font-size: 0.72rem; padding: 5px 12px;
    border-radius: 99px; font-weight: 700; letter-spacing: 0.08em;
    background: var(--gold); color: var(--pp-dark);
    text-transform: uppercase; margin-bottom: 12px;
  }
  .modal-title {
    font-family: 'Tilt Warp', cursive;
    font-size: 1.7rem; color: var(--pp-dark); line-height: 1.15;
    margin: 0 0 10px; letter-spacing: -0.01em;
  }
  .modal-ubic { font-size: 1rem; color: #4b5563; margin-bottom: 22px; line-height: 1.4; }
  .modal-ubic strong { color: var(--pp); font-weight: 700; }

  .modal-price-block {
    background: linear-gradient(135deg, var(--pp) 0%, var(--pp-dark) 100%);
    color: #fff; padding: 22px 26px; border-radius: 14px; margin-bottom: 22px;
    box-shadow: 0 8px 24px rgba(97,49,116,0.18);
  }
  .modal-price { font-family: 'Tilt Warp', cursive; font-size: 2.2rem; color: var(--gold); line-height: 1; letter-spacing: -0.02em; }
  .modal-price-m2 { font-size: 0.95rem; color: rgba(255,255,255,0.88); margin-top: 10px; font-weight: 500; }

  .modal-auction-block {
    background: linear-gradient(135deg, #fff7d6, #fef3c7);
    border: 2px solid var(--gold);
    padding: 16px 18px; border-radius: 14px; margin-bottom: 20px;
    text-align: center;
  }
  .modal-auction-date { font-family: 'Tilt Warp', cursive; font-size: 1.4rem; color: var(--pp-dark); line-height: 1; }
  .modal-auction-time { font-size: 0.95rem; color: var(--pp); font-weight: 700; margin-top: 6px; }
  .modal-auction-mode { font-size: 0.75rem; color: #6b7280; margin-top: 5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }

  .modal-features-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
    margin-bottom: 22px;
  }
  @media (max-width: 1200px) { .modal-features-grid { grid-template-columns: repeat(2, 1fr); } }
  .modal-feature-item {
    background: #faf6fc; padding: 12px 14px; border-radius: 12px;
    display: flex; align-items: center; gap: 10px;
    font-size: 0.92rem; color: #1a1a1a; font-weight: 600;
    border: 1px solid #f0e6f7;
  }
  .modal-feature-icon { font-size: 1.2rem; }
  .modal-feature-text { display: flex; flex-direction: column; }
  .modal-feature-text strong { color: var(--pp); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
  .modal-feature-text span { font-size: 0.92rem; font-weight: 700; }

  .modal-section { margin-bottom: 22px; }
  .modal-section-title {
    font-size: 0.76rem; color: var(--pp); font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .modal-section-title::before {
    content: ''; width: 4px; height: 16px; background: var(--gold); border-radius: 2px;
  }
  .modal-section p { font-size: 0.93rem; line-height: 1.6; color: #374151; margin: 0; }
  .modal-section .court-email {
    display: inline-block; margin-top: 6px;
    font-size: 0.82rem; color: var(--pp); font-weight: 600; text-decoration: none;
  }
  .modal-section .court-email:hover { text-decoration: underline; }

  .kv { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; font-size: 0.88rem; }
  .kv .k { color: var(--pp); font-weight: 700; text-transform: uppercase; font-size: 0.66rem; letter-spacing: 0.06em; padding-top: 2px; }
  .kv .v.monoish { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.82rem; }

  .amenities-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .amenity-chip {
    background: #f0e6f7; color: var(--pp);
    padding: 5px 12px; border-radius: 99px;
    font-size: 0.82rem; font-weight: 600;
    border: 1px solid rgba(97,49,116,0.12);
  }

  .modal-cta {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: linear-gradient(135deg, var(--pp), var(--pp-dark));
    color: #fff !important; text-decoration: none;
    padding: 14px 20px; border-radius: 12px;
    font-weight: 700; font-size: 0.9rem; letter-spacing: 0.04em;
    text-transform: uppercase; margin-top: 22px;
    transition: transform 0.15s;
    box-shadow: 0 6px 18px rgba(97,49,116,0.25);
  }
  .modal-cta:hover { transform: translateY(-2px); }

  /* Mini-mapa de Google */
  .map-wrap {
    position: relative; width: 100%; aspect-ratio: 16/9;
    border-radius: 12px; overflow: hidden; border: 1px solid #ece4f1;
    background: #f0e6f7;
  }
  .map-frame { width: 100%; height: 100%; border: 0; display: block; }
  .map-link {
    display: inline-block; margin-top: 10px;
    font-size: 0.84rem; color: var(--pp); font-weight: 700; text-decoration: none;
  }
  .map-link:hover { text-decoration: underline; }

  /* Ficha PDF (bancos BBVA/Aval): botón + visor embebido */
  .pdf-ficha-toggle {
    display: inline-flex; align-items: center; gap: 8px;
    background: #faf6fc; border: 1.5px solid #e3d4ee; color: var(--pp);
    padding: 11px 16px; border-radius: 10px; cursor: pointer;
    font-family: inherit; font-weight: 700; font-size: 0.86rem;
    transition: background 0.15s, border-color 0.15s;
  }
  .pdf-ficha-toggle:hover { background: #f0e6f7; border-color: var(--pp); }
  .pdf-ficha-img {
    margin-top: 14px; width: 100%; border-radius: 12px;
    border: 1px solid #ece4f1; display: none;
  }
  .pdf-ficha-img.open { display: block; }

  /* ───── view-switching ───── */
  .view[hidden] { display: none !important; }
</style>

<!-- HERO -->
<header class="hero band">
  <div class="hero-content">
    <div class="pill">Sistema CRECE · Andrés Giraldo</div>
    <h1>Radar de <span class="gold">oportunidades inmobiliarias</span></h1>
    <p class="sub">Inmuebles en venta de bancos y avisos de remates judiciales activos en Colombia. Cambia entre las pestañas para ver cada fuente segmentada.</p>
    <div class="summary-bar">
      <div class="summary-stat">
        <span class="num">${inmuebles.length + remates.length}</span>
        <span class="lbl">Oportunidades</span>
      </div>
      <div class="summary-stat">
        <span class="num">${inmuebles.length}</span>
        <span class="lbl">De bancos</span>
      </div>
      <div class="summary-stat">
        <span class="num">${remates.length}</span>
        <span class="lbl">Remates jud.</span>
      </div>
      <div class="summary-stat muted">
        <span class="num">${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
        <span class="lbl">Actualizado</span>
      </div>
    </div>
    ${isFirstLoad
      ? `<div class="movement"><span class="mv-note">El seguimiento de altas y bajas semanales empieza en la próxima actualización.</span></div>`
      : `<div class="movement" title="Cambios desde la actualización de la semana pasada">
          <span class="mv up">🆕 <b>+${totalNew}</b> nuevos esta semana</span>
          <span class="mv down">✓ <b>${totalOut}</b> retirados (vendidos o dados de baja)</span>
        </div>`}
  </div>
</header>

<!-- TABS -->
<nav class="tabs-bar">
  <div class="tabs-inner" role="tablist">
    <button class="tab-btn active" data-tab="bancos" role="tab">
      <span class="tab-emoji">🏦</span>
      <span>Bancos</span>
      <span class="tab-count">${inmuebles.length}</span>
    </button>
    <button class="tab-btn" data-tab="remates" role="tab">
      <span class="tab-emoji">⚖️</span>
      <span>Remates judiciales</span>
      <span class="tab-count">${remates.length}</span>
    </button>
    <button class="tab-btn" data-tab="portal" role="tab">
      <span class="tab-emoji">🏘</span>
      <span>Portal abierto</span>
      <span class="tab-count">${portal.length}</span>
    </button>
    <button class="tab-btn" data-tab="todo" role="tab">
      <span class="tab-emoji">📊</span>
      <span>Todo</span>
      <span class="tab-count">${inmuebles.length + remates.length}</span>
    </button>
  </div>
</nav>

<!-- ═══════════════════ VIEW: BANCOS ═══════════════════ -->
<div class="view" data-view="bancos">
  <div class="stats-bar">
    <div class="stats-inner">
      <div class="stat"><div class="stat-num" id="bs-total">—</div><div class="stat-label">Inmuebles</div></div>
      <div class="stat"><div class="stat-num" id="bs-fotos">—</div><div class="stat-label">Con fotos</div></div>
      <div class="stat"><div class="stat-num" id="bs-ciudades">—</div><div class="stat-label">Ciudades</div></div>
      <div class="stat"><div class="stat-num" id="bs-promedio">—</div><div class="stat-label">Precio promedio</div></div>
    </div>
  </div>
  <div class="controls">
    <div class="controls-inner">
      <div class="filters-row">
        <div><label class="filter-label">Portal</label><select id="bf-portal" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Ciudad</label><select id="bf-city" class="filter-input"><option value="">Todas</option></select></div>
        <div><label class="filter-label">Tipo</label><select id="bf-type" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Precio máx (M)</label><input type="number" id="bf-pricemax" class="filter-input" placeholder="ej. 500" min="0"></div>
        <div>
          <label class="filter-label">Orden</label>
          <select id="bf-orden" class="filter-input">
            <option value="precio_m2_asc">Precio/m² menor</option>
            <option value="precio_asc">Precio menor</option>
            <option value="precio_desc">Precio mayor</option>
            <option value="recent">Más recientes</option>
          </select>
        </div>
      </div>
      <div class="results-info">
        <span id="bresults-count">0 inmuebles</span>
        <button class="btn-clear" data-clear="bancos">Limpiar filtros</button>
      </div>
    </div>
  </div>
  <main class="content">
    <div id="bgrid" class="cards-grid"></div>
    <div id="bempty" class="empty" style="display:none;">
      <div class="icon">🔍</div><div class="h">Sin resultados</div><div class="p">Ajusta los filtros o limpia para ver todos.</div>
    </div>
  </main>
</div>

<!-- ═══════════════════ VIEW: REMATES ═══════════════════ -->
<div class="view" data-view="remates" hidden>
  <div class="stats-bar">
    <div class="stats-inner">
      <div class="stat"><div class="stat-num" id="rs-total">—</div><div class="stat-label">Avisos activos</div></div>
      <div class="stat"><div class="stat-num" id="rs-cities">—</div><div class="stat-label">Ciudades</div></div>
      <div class="stat"><div class="stat-num" id="rs-soon">—</div><div class="stat-label">Diligencias &lt;30 días</div></div>
      <div class="stat"><div class="stat-num" id="rs-avgmin">—</div><div class="stat-label">Postura promedio</div></div>
    </div>
  </div>
  <div class="legend">
    <div class="legend-card">
      <span class="legend-title">⚖️ Modalidades de remate</span>
      <span class="legend-item"><span class="legend-dot virtual"></span><strong>Virtual</strong> · audiencia por videoconferencia, puedes participar desde cualquier ciudad</span>
      <span class="legend-item"><span class="legend-dot presencial"></span><strong>Presencial</strong> · hay que ir al juzgado físicamente</span>
      <span class="legend-item" style="opacity:0.65;"><span class="legend-dot" style="background:#9ca3af"></span><strong>Sin etiqueta</strong> · el aviso no lo especifica</span>
    </div>
  </div>
  <div class="controls">
    <div class="controls-inner">
      <div class="filters-row">
        <div><label class="filter-label">Departamento</label><select id="rf-dept" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Ciudad</label><select id="rf-city" class="filter-input"><option value="">Todas</option></select></div>
        <div><label class="filter-label">Tipo</label><select id="rf-type" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Modalidad</label><select id="rf-mode" class="filter-input"><option value="">Todas</option><option value="virtual">Virtual</option><option value="presencial">Presencial</option></select></div>
        <div>
          <label class="filter-label">Orden</label>
          <select id="rf-orden" class="filter-input">
            <option value="auction_asc">Audiencia próxima primero</option>
            <option value="auction_desc">Audiencia lejana primero</option>
            <option value="min_asc">Postura menor</option>
            <option value="min_desc">Postura mayor</option>
            <option value="avaluo_asc">Avalúo menor</option>
            <option value="avaluo_desc">Avalúo mayor</option>
          </select>
        </div>
      </div>
      <div class="results-info">
        <span id="rresults-count">0 remates</span>
        <button class="btn-clear" data-clear="remates">Limpiar filtros</button>
      </div>
    </div>
  </div>
  <main class="content">
    <div id="rgrid" class="cards-grid"></div>
    <div id="rempty" class="empty" style="display:none;">
      <div class="icon">⚖️</div><div class="h">Sin resultados</div><div class="p">Ajusta los filtros o limpia para ver todos.</div>
    </div>
  </main>
</div>

<!-- ═══════════════════ VIEW: PORTAL ABIERTO ═══════════════════ -->
<div class="view" data-view="portal" hidden>
  <div class="stats-bar">
    <div class="stats-inner">
      <div class="stat"><div class="stat-num" id="ps-total">—</div><div class="stat-label">Listados</div></div>
      <div class="stat"><div class="stat-num" id="ps-opp">—</div><div class="stat-label">Oportunidades</div></div>
      <div class="stat"><div class="stat-num" id="ps-barrios">—</div><div class="stat-label">Barrios</div></div>
      <div class="stat"><div class="stat-num" id="ps-m2">—</div><div class="stat-label">Precio/m² mediano</div></div>
    </div>
  </div>
  <div class="legend">
    <div class="legend-card">
      <span class="legend-title">🏘 Cómo leer el Portal Abierto</span>
      <span class="legend-item"><span class="opp-badge high" style="position:static">★ ALTA</span> señal fuerte: precio/m² en el decil más bajo de comparables, descuento grande y alta confianza</span>
      <span class="legend-item"><span class="opp-badge" style="position:static">▼ OPORTUNIDAD</span> precio/m² en el cuartil más bajo frente a inmuebles similares de la zona</span>
      <span class="legend-item" style="opacity:0.7">Es una señal de cribado sobre precios de <strong>oferta</strong> (no de cierre); revisa siempre piso, antigüedad y estado.</span>
    </div>
  </div>
  <div class="controls">
    <div class="controls-inner">
      <div class="filters-row">
        <div><label class="filter-label">Ciudad</label><select id="pf-city" class="filter-input"><option value="">Todas</option></select></div>
        <div><label class="filter-label">Barrio</label><select id="pf-zone" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Tipo</label><select id="pf-type" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Precio máx (M)</label><input type="number" id="pf-pricemax" class="filter-input" placeholder="ej. 300" min="0"></div>
        <div><label class="filter-label">Solo oportunidades</label><select id="pf-opp" class="filter-input"><option value="">No</option><option value="1">Sí</option><option value="high">Solo altas</option></select></div>
        <div>
          <label class="filter-label">Orden</label>
          <select id="pf-orden" class="filter-input">
            <option value="discount_desc">Mayor descuento</option>
            <option value="precio_m2_asc">Precio/m² menor</option>
            <option value="precio_asc">Precio menor</option>
            <option value="precio_desc">Precio mayor</option>
            <option value="recent">Más recientes</option>
          </select>
        </div>
      </div>
      <div class="results-info">
        <span id="presults-count">0 listados</span>
        <button class="btn-clear" data-clear="portal">Limpiar filtros</button>
      </div>
    </div>
  </div>
  <main class="content">
    <div id="pgrid" class="cards-grid"></div>
    <div id="pempty" class="empty" style="display:none;">
      <div class="icon">🏘</div><div class="h">Sin resultados</div><div class="p">Ajusta los filtros o limpia para ver todos.</div>
    </div>
  </main>
</div>

<!-- ═══════════════════ VIEW: TODO ═══════════════════ -->
<div class="view" data-view="todo" hidden>
  <div class="stats-bar">
    <div class="stats-inner">
      <div class="stat"><div class="stat-num">${inmuebles.length + remates.length}</div><div class="stat-label">Total avisos</div></div>
      <div class="stat"><div class="stat-num">${inmuebles.length}</div><div class="stat-label">De bancos</div></div>
      <div class="stat"><div class="stat-num">${remates.length}</div><div class="stat-label">Remates judiciales</div></div>
    </div>
  </div>
  <div class="controls">
    <div class="controls-inner">
      <div class="filters-row">
        <div><label class="filter-label">Fuente</label><select id="tf-fuente" class="filter-input"><option value="">Ambas</option><option value="banco">Solo Bancos</option><option value="remate">Solo Remates</option></select></div>
        <div><label class="filter-label">Ciudad</label><select id="tf-city" class="filter-input"><option value="">Todas</option></select></div>
        <div><label class="filter-label">Tipo</label><select id="tf-type" class="filter-input"><option value="">Todos</option></select></div>
        <div><label class="filter-label">Precio máx (M)</label><input type="number" id="tf-pricemax" class="filter-input" placeholder="ej. 500" min="0"></div>
        <div>
          <label class="filter-label">Orden</label>
          <select id="tf-orden" class="filter-input">
            <option value="precio_asc">Precio menor</option>
            <option value="precio_desc">Precio mayor</option>
            <option value="recent">Más recientes</option>
          </select>
        </div>
      </div>
      <div class="results-info">
        <span id="tresults-count">0 avisos</span>
        <button class="btn-clear" data-clear="todo">Limpiar filtros</button>
      </div>
    </div>
  </div>
  <main class="content">
    <div id="tgrid" class="cards-grid"></div>
    <div id="tempty" class="empty" style="display:none;">
      <div class="icon">🔍</div><div class="h">Sin resultados</div><div class="p">Ajusta los filtros o limpia para ver todos.</div>
    </div>
  </main>
</div>

<!-- MODAL único -->
<div class="modal-backdrop" id="modal">
  <button class="modal-close" id="modal-close" aria-label="Cerrar">✕</button>
  <div class="modal" id="modal-content"></div>
</div>

<footer class="footer band">
  <strong>Sistema CRECE</strong> · Radar de Oportunidades Inmobiliarias · Generado el ${new Date().toLocaleString('es-CO')} · ${inmuebles.length + remates.length} avisos
</footer>

<script>
  // ════════════════ DATOS ════════════════
  const BANCOS = ${inmueblesJSON};
  const REMATES = ${rematesJSON};
  const PORTAL = ${portalJSON};

  // ════════════════ HELPERS ════════════════
  const fmtCOP = (n) => n ? '$' + Number(n).toLocaleString('es-CO') : '—';
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const sourceLabel = (s) => ({ davivienda:'Davivienda', bancolombia:'Bancolombia', bbva:'BBVA', aval:'Aval', rematandobienes:'Remates', fincaraiz:'FincaRaíz' }[s] || s);
  const typeLbl = (t) => ({
    apartment: 'Apartamento', house: 'Casa', commercial: 'Local',
    lot: 'Lote', farm: 'Finca', office: 'Oficina',
    vehicle: 'Vehículo', parking: 'Parqueadero', rights: 'Derechos'
  }[t] || (t ? cap(t) : 'Inmueble'));
  const sourceIcon = (s) => ({ davivienda:'🏛', bancolombia:'🏦', bbva:'🏛', aval:'🏢', fincaraiz:'🏘' }[s] || '🏠');
  const modeLbl = (m) => ({ virtual: 'Virtual', presencial: 'Presencial', mixto: 'Mixto' }[m] || '');

  // Bancos en PDF (BBVA/Aval): no tienen foto del inmueble, solo la página del PDF.
  // Mostramos tarjeta branded de referencia como portada y dejamos la ficha PDF
  // accesible dentro del modal.
  const PLACEHOLDER_BASE = 'https://uqlfgnylvnefhyuvtncd.supabase.co/storage/v1/object/public/inmuebles-pdf/placeholders';
  const BANK_TYPES = ['house','apartment','lot','farm','commercial','office'];
  const isPdfBank = (p) => p.source === 'bbva' || p.source === 'aval';
  const bankCard = (type) => PLACEHOLDER_BASE + '/bank/' + (BANK_TYPES.includes(type) ? type : 'unknown') + '.svg';
  // La ficha PDF es el image_url original (la página renderizada del PDF) para bbva/aval.
  const pdfFichaUrl = (p) => isPdfBank(p) ? p.image_url : null;

  // Mini-mapa de Google (iframe gratis, sin API key). Usa dirección + ciudad.
  // Si no hay dirección, no muestra mapa.
  function mapEmbed(address, city, dept) {
    const q = [address, city, dept, 'Colombia'].filter(Boolean).join(', ');
    if (!address && !city) return '';
    const src = 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed';
    const link = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    return \`
      <div class="modal-section">
        <h3 class="modal-section-title">Ubicación en el mapa</h3>
        <div class="map-wrap">
          <iframe class="map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                  src="\${src}" allowfullscreen></iframe>
        </div>
        <a class="map-link" href="\${link}" target="_blank" rel="noopener">📍 Abrir en Google Maps ↗</a>
      </div>\`;
  }
  // Mapa preferiendo coordenadas exactas (FincaRaíz las trae geocodificadas);
  // si no hay, cae a búsqueda por dirección/ciudad.
  function mapSection(p) {
    const f = p.features || {};
    if (f.lat != null && f.lng != null) {
      const q = f.lat + ',' + f.lng;
      const src = 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&z=16&output=embed';
      const link = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
      return \`
        <div class="modal-section">
          <h3 class="modal-section-title">Ubicación aproximada en el mapa</h3>
          <div class="map-wrap">
            <iframe class="map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="\${src}" allowfullscreen></iframe>
          </div>
          <a class="map-link" href="\${link}" target="_blank" rel="noopener">📍 Abrir en Google Maps ↗</a>
        </div>\`;
    }
    return mapEmbed(p.address, p.city, null);
  }

  // Helpers EXACTOS para bancos
  const displayPrice = (p) => {
    const raw = p.features?.price_raw;
    if (raw && typeof raw === 'string' && raw.includes('$')) return raw;
    return fmtCOP(p.price);
  };
  const displayArea = (p) => {
    const raw = p.features?.area_raw;
    if (raw && typeof raw === 'string') return raw;
    if (p.area_m2 == null) return null;
    const n = Number(p.area_m2);
    return (Number.isInteger(n) ? n : n.toFixed(2)) + ' m²';
  };
  const displayPricePerM2 = (p) => {
    if (!p.price_per_m2) return null;
    return '$' + Math.round(Number(p.price_per_m2)).toLocaleString('es-CO');
  };

  // Días hasta audiencia para remates
  function daysToAuction(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return Math.round((d - new Date()) / (1000 * 60 * 60 * 24));
  }
  function countdownBadge(iso) {
    const d = daysToAuction(iso);
    if (d == null) return '';
    if (d < 0) return '<span class="countdown-badge past">Ya realizada</span>';
    if (d === 0) return '<span class="countdown-badge now">¡HOY!</span>';
    if (d === 1) return '<span class="countdown-badge soon">⏰ Mañana</span>';
    if (d <= 7) return '<span class="countdown-badge soon">⏰ En ' + d + ' días</span>';
    return '<span class="countdown-badge">📅 En ' + d + ' días</span>';
  }
  function fmtAuctionDate(iso, raw) {
    if (!iso) return raw || '—';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function getAllImages(p) {
    const arr = [];
    if (p.image_url) arr.push(p.image_url);
    if (Array.isArray(p.features?.images)) {
      p.features.images.forEach(u => { if (u && !arr.includes(u)) arr.push(u); });
    }
    return arr;
  }

  // ── Oportunidad (motor de comparables) ──────────────────────────
  // Badge sobre la foto: dorado = alta, verde = oportunidad.
  function oppBadge(p) {
    if (!p.is_opportunity) return '';
    const pct = p.discount_pct != null ? Math.round(p.discount_pct) + '%' : '';
    const high = p.features?.market?.confidence === 'high' && p.discount_pct >= 25;
    return high
      ? \`<span class="opp-badge high" title="Señal fuerte y bien soportada">★ OPORTUNIDAD ALTA \${pct}</span>\`
      : \`<span class="opp-badge" title="Precio/m² en el cuartil más bajo de comparables">▼ OPORTUNIDAD \${pct}</span>\`;
  }
  // Sección de modal con la trazabilidad del veredicto de mercado.
  function marketSection(p) {
    const m = p.features?.market;
    if (!m || m.market_ppm2 == null) return '';
    const confLbl = { high:'Alta', medium:'Media', low:'Baja', insufficient:'Sin datos' }[m.confidence] || m.confidence;
    const cand = m.candidate_ppm2 ? '$' + Number(m.candidate_ppm2).toLocaleString('es-CO') : '—';
    const mkt = '$' + Number(m.market_ppm2).toLocaleString('es-CO');
    const discTxt = p.discount_pct != null
      ? \`\${p.discount_pct >= 0 ? '−' : '+'}\${Math.abs(Math.round(p.discount_pct))}% vs mercado\`
      : '—';
    const discColor = p.discount_pct != null && p.discount_pct >= 0 ? '#22c55e' : '#f87171';
    return \`
      <div class="modal-section">
        <h3 class="modal-section-title">Análisis de mercado</h3>
        <div class="market-grid">
          <div><span class="market-lbl">Este inmueble</span><strong>\${cand}/m²</strong></div>
          <div><span class="market-lbl">Mediana comparables</span><strong>\${mkt}/m²</strong></div>
          <div><span class="market-lbl">Posición</span><strong style="color:\${discColor}">\${discTxt}</strong></div>
          <div><span class="market-lbl">Comparables</span><strong>\${m.n_comparables}</strong><span class="market-sub">confianza \${confLbl}</span></div>
        </div>
        <p class="market-note">Comparado contra precios de OFERTA de \${m.n_comparables} inmuebles similares (mismo tipo, área y zona). Es una señal de cribado, no un avalúo: el precio bajo puede reflejar piso, antigüedad o estado no visibles aquí.</p>
      </div>\`;
  }

  // ════════════════ TABS ════════════════
  const tabBtns = document.querySelectorAll('.tab-btn');
  const views = document.querySelectorAll('.view');
  function setTab(name) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    views.forEach(v => v.hidden = v.dataset.view !== name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  tabBtns.forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ════════════════ MODAL único ════════════════
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  let currentImgIdx = 0;
  let currentImgs = [];

  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') prevImg();
    if (e.key === 'ArrowRight') nextImg();
  });
  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ════════════════ BANCOS ════════════════
  const bfilters = {
    portal: document.getElementById('bf-portal'),
    city: document.getElementById('bf-city'),
    type: document.getElementById('bf-type'),
    pricemax: document.getElementById('bf-pricemax'),
    orden: document.getElementById('bf-orden'),
  };
  const bgrid = document.getElementById('bgrid');
  const bempty = document.getElementById('bempty');
  const bresultsCount = document.getElementById('bresults-count');

  document.getElementById('bs-total').textContent = BANCOS.length;
  document.getElementById('bs-fotos').textContent = BANCOS.filter(d => d.image_url || (d.features?.images?.length > 0)).length;
  document.getElementById('bs-ciudades').textContent = new Set(BANCOS.map(d => d.city).filter(Boolean)).size;
  const bprecios = BANCOS.map(d => d.price).filter(p => p > 0);
  const bpromedio = bprecios.length ? Math.round(bprecios.reduce((a,b) => a+b, 0) / bprecios.length) : 0;
  document.getElementById('bs-promedio').textContent = '$' + (bpromedio / 1_000_000).toFixed(0) + 'M';

  function poblar(sel, values, fmt) {
    [...new Set(values)].filter(Boolean).sort().forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = fmt ? fmt(v) : cap(v); sel.appendChild(opt);
    });
  }
  poblar(bfilters.portal, BANCOS.map(d => d.source), sourceLabel);
  poblar(bfilters.city, BANCOS.map(d => d.city));
  poblar(bfilters.type, BANCOS.map(d => d.type), typeLbl);

  function bcardHtml(p, i) {
    const f = p.features || {};
    const imgs = getAllImages(p);
    const sLabel = sourceLabel(p.source);
    // PDFs (BBVA/Aval): portada = tarjeta branded de referencia (no la página del PDF).
    // Bancos con foto real (Davivienda/Bancolombia): foto del inmueble.
    const principal = isPdfBank(p) ? bankCard(p.type) : imgs[0];
    const imgHtml = principal
      ? \`<img src="\${principal}" alt="\${typeLbl(p.type)} en \${cap(p.city)}" loading="lazy"
            onerror="this.parentElement.innerHTML=getPlaceholderHTML('\${sLabel}', '\${sourceIcon(p.source)}')">\`
      : getPlaceholderHTML(sLabel, sourceIcon(p.source));
    // Badge de fotos solo cuando hay galería real (no para PDFs)
    const countBadge = (!isPdfBank(p) && imgs.length > 1) ? \`<span class="photo-count">📷 \${imgs.length}</span>\` : '';
    return \`
      <article class="card" data-id="\${p.id}" data-kind="banco">
        <div class="card-img-wrap">
          \${imgHtml}
          <span class="source-badge">\${sLabel}</span>
          \${countBadge}
          \${oppBadge(p)}
        </div>
        <div class="card-header">
          <div class="card-price">\${displayPrice(p)}</div>
          <div class="card-price-sub">\${displayPricePerM2(p) ? displayPricePerM2(p) + ' / m²' : '—'}</div>
        </div>
        <div class="card-body">
          <div class="card-titulo">\${typeLbl(p.type)}\${p.address ? ' · ' + p.address.substring(0, 80) : ''}</div>
          <div class="card-ubic">📍 \${p.zone ? p.zone + ' · ' : ''}<strong>\${cap(p.city)}</strong></div>
          <div class="card-meta">
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
    return \`<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,0.7);background:linear-gradient(135deg,#4a2560,#613174);">
      <div style="font-size:3rem;opacity:0.5;">\${icon}</div>
      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-top:6px;color:rgba(255,255,255,0.7);">\${sLabel}</div>
    </div>\`;
  }
  window.getPlaceholderHTML = getPlaceholderHTML;

  function brender() {
    let list = BANCOS.filter(d => {
      if (bfilters.portal.value && d.source !== bfilters.portal.value) return false;
      if (bfilters.city.value && d.city !== bfilters.city.value) return false;
      if (bfilters.type.value && d.type !== bfilters.type.value) return false;
      if (bfilters.pricemax.value && d.price > parseInt(bfilters.pricemax.value) * 1_000_000) return false;
      return true;
    });
    const o = bfilters.orden.value;
    if (o === 'precio_asc') list.sort((a,b) => (a.price||Infinity) - (b.price||Infinity));
    else if (o === 'precio_desc') list.sort((a,b) => (b.price||0) - (a.price||0));
    else if (o === 'precio_m2_asc') list.sort((a,b) => (a.price_per_m2||Infinity) - (b.price_per_m2||Infinity));
    else if (o === 'recent') list.sort((a,b) => new Date(b.scraped_at) - new Date(a.scraped_at));
    bresultsCount.textContent = list.length + ' inmueble' + (list.length === 1 ? '' : 's');
    if (list.length === 0) { bgrid.innerHTML = ''; bempty.style.display = 'block'; return; }
    bempty.style.display = 'none';
    bgrid.innerHTML = list.map((p, i) => bcardHtml(p, i)).join('');
    bgrid.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const item = list.find(x => x.id === c.dataset.id);
        if (item) openBancoModal(item);
      });
    });
  }
  Object.values(bfilters).forEach(f => f.addEventListener('change', brender));
  bfilters.pricemax.addEventListener('input', brender);

  // ════════════════ PORTAL ABIERTO (FincaRaíz) ════════════════
  const pfilters = {
    city: document.getElementById('pf-city'),
    zone: document.getElementById('pf-zone'),
    type: document.getElementById('pf-type'),
    pricemax: document.getElementById('pf-pricemax'),
    opp: document.getElementById('pf-opp'),
    orden: document.getElementById('pf-orden'),
  };
  const pgrid = document.getElementById('pgrid');
  const pempty = document.getElementById('pempty');
  const presultsCount = document.getElementById('presults-count');
  const isHighOpp = (d) => d.is_opportunity && d.features?.market?.confidence === 'high' && d.discount_pct >= 25;

  document.getElementById('ps-total').textContent = PORTAL.length;
  document.getElementById('ps-opp').textContent = PORTAL.filter(d => d.is_opportunity).length;
  document.getElementById('ps-barrios').textContent = new Set(PORTAL.map(d => d.zone).filter(Boolean)).size;
  const pm2arr = PORTAL.map(d => Number(d.price_per_m2)).filter(x => x > 0).sort((a,b) => a-b);
  const pmed = pm2arr.length ? pm2arr[Math.floor(pm2arr.length/2)] : 0;
  document.getElementById('ps-m2').textContent = pmed ? '$' + (pmed/1_000_000).toFixed(1) + 'M' : '—';

  poblar(pfilters.city, PORTAL.map(d => d.city));
  poblar(pfilters.zone, PORTAL.map(d => d.zone));
  poblar(pfilters.type, PORTAL.map(d => d.type), typeLbl);

  // Al elegir ciudad, el filtro de Barrio se repuebla con los barrios de esa ciudad.
  pfilters.city.addEventListener('change', () => {
    const c = pfilters.city.value;
    pfilters.zone.innerHTML = '<option value="">Todos</option>';
    poblar(pfilters.zone, PORTAL.filter(d => !c || d.city === c).map(d => d.zone));
  });

  function prender() {
    let list = PORTAL.filter(d => {
      if (pfilters.city.value && d.city !== pfilters.city.value) return false;
      if (pfilters.zone.value && d.zone !== pfilters.zone.value) return false;
      if (pfilters.type.value && d.type !== pfilters.type.value) return false;
      if (pfilters.pricemax.value && d.price > parseInt(pfilters.pricemax.value) * 1_000_000) return false;
      if (pfilters.opp.value === '1' && !d.is_opportunity) return false;
      if (pfilters.opp.value === 'high' && !isHighOpp(d)) return false;
      return true;
    });
    const o = pfilters.orden.value;
    if (o === 'discount_desc') list.sort((a,b) => (b.discount_pct ?? -999) - (a.discount_pct ?? -999));
    else if (o === 'precio_m2_asc') list.sort((a,b) => (a.price_per_m2||Infinity) - (b.price_per_m2||Infinity));
    else if (o === 'precio_asc') list.sort((a,b) => (a.price||Infinity) - (b.price||Infinity));
    else if (o === 'precio_desc') list.sort((a,b) => (b.price||0) - (a.price||0));
    else if (o === 'recent') list.sort((a,b) => new Date(b.scraped_at) - new Date(a.scraped_at));
    presultsCount.textContent = list.length + ' listado' + (list.length === 1 ? '' : 's');
    if (list.length === 0) { pgrid.innerHTML = ''; pempty.style.display = 'block'; return; }
    pempty.style.display = 'none';
    pgrid.innerHTML = list.map((p, i) => bcardHtml(p, i)).join('');
    pgrid.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const item = list.find(x => x.id === c.dataset.id);
        if (item) openBancoModal(item);
      });
    });
  }
  Object.values(pfilters).forEach(f => f.addEventListener('change', prender));
  pfilters.pricemax.addEventListener('input', prender);

  function openBancoModal(p) {
    const f = p.features || {};
    const pdfBank = isPdfBank(p);
    // Galería: PDFs muestran la tarjeta branded; los demás, fotos reales.
    currentImgs = pdfBank ? [bankCard(p.type)] : getAllImages(p);
    currentImgIdx = 0;
    const galleryHtml = currentImgs.length > 0 ? \`
      <div class="gallery">
        <div class="gallery-main" id="g-main"></div>
        \${currentImgs.length > 1 ? \`
          <button class="gallery-nav prev" onclick="prevImg()">‹</button>
          <button class="gallery-nav next" onclick="nextImg()">›</button>
          <div class="gallery-counter" id="g-counter"></div>
          <div class="gallery-thumbs" id="g-thumbs"></div>
        \` : ''}
      </div>\` : \`
      <div class="gallery"><div class="gallery-main">
        <div style="color:rgba(255,255,255,0.4);text-align:center;">
          <div style="font-size:5rem;opacity:0.5;">\${sourceIcon(p.source)}</div>
          <div style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.12em;margin-top:12px;">\${sourceLabel(p.source)}</div>
        </div>
      </div></div>\`;
    // Sección ficha PDF: botón que revela la página renderizada del PDF original.
    const fichaUrl = pdfFichaUrl(p);
    const sectionFicha = fichaUrl ? \`
      <div class="modal-section">
        <h3 class="modal-section-title">Ficha original del banco</h3>
        <button class="pdf-ficha-toggle" onclick="this.nextElementSibling.classList.toggle('open'); this.textContent = this.nextElementSibling.classList.contains('open') ? '▲ Ocultar ficha del PDF' : '📄 Ver ficha original (PDF)';">📄 Ver ficha original (PDF)</button>
        <img class="pdf-ficha-img" src="\${fichaUrl}" alt="Ficha PDF \${sourceLabel(p.source)}" loading="lazy">
      </div>\` : '';
    const sectionMapB = mapSection(p);
    const feats = [];
    const areaVal = displayArea(p);
    if (areaVal) feats.push({ icon: '📐', label: 'Área', value: areaVal });
    if (f.bedrooms) feats.push({ icon: '🛏', label: 'Habs', value: f.bedrooms });
    if (f.bathrooms) feats.push({ icon: '🛁', label: 'Baños', value: f.bathrooms });
    if (f.garages) feats.push({ icon: '🚗', label: 'Garajes', value: f.garages });
    if (f.stratum) feats.push({ icon: '🏘', label: 'Estrato', value: f.stratum });
    if (f.floor) feats.push({ icon: '🛗', label: 'Piso', value: f.floor });
    if (f.m2_private) feats.push({ icon: '📐', label: 'Área priv.', value: (Number.isInteger(Number(f.m2_private)) ? f.m2_private : Number(f.m2_private).toFixed(1)) + ' m²' });
    if (f.year_built) feats.push({ icon: '📅', label: 'Año', value: f.year_built });
    if (f.antiguedad) feats.push({ icon: '⏳', label: 'Antigüedad', value: f.antiguedad });
    if (f.administracion) feats.push({ icon: '💳', label: 'Admin', value: fmtCOP(f.administracion) + '/mes' });
    const featsHtml = feats.map(x => \`
      <div class="modal-feature-item"><span class="modal-feature-icon">\${x.icon}</span>
        <div class="modal-feature-text"><strong>\${x.label}</strong><span>\${x.value}</span></div></div>\`).join('');
    const amenHtml = Array.isArray(f.amenities) && f.amenities.length > 0
      ? \`<div class="modal-section"><h3 class="modal-section-title">Amenidades</h3>
          <div class="amenities-list">\${f.amenities.map(a => \`<span class="amenity-chip">\${a}</span>\`).join('')}</div></div>\` : '';
    const descHtml = f.description
      ? \`<div class="modal-section"><h3 class="modal-section-title">Descripción</h3><p>\${f.description.substring(0, 800)}\${f.description.length > 800 ? '…' : ''}</p></div>\` : '';
    const addrHtml = p.address
      ? \`<div class="modal-section"><h3 class="modal-section-title">Dirección completa</h3><p>\${p.address}</p></div>\` : '';

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
        <div class="modal-features-grid">\${featsHtml}</div>
        \${marketSection(p)}\${addrHtml}\${sectionMapB}\${descHtml}\${amenHtml}\${sectionFicha}
        <a href="\${p.source_url}" target="_blank" rel="noopener" class="modal-cta">Ver en \${sourceLabel(p.source)} ↗</a>
      </div>
    \`;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (currentImgs.length > 0) {
      renderGalleryMain();
      if (currentImgs.length > 1) renderThumbs();
    }
  }

  function renderGalleryMain() {
    const main = document.getElementById('g-main');
    if (!main) return;
    main.innerHTML = \`<img src="\${currentImgs[currentImgIdx]}" alt="" onerror="this.style.display='none'">\`;
    const counter = document.getElementById('g-counter');
    if (counter) counter.textContent = \`\${currentImgIdx + 1} / \${currentImgs.length}\`;
    document.querySelectorAll('.gallery-thumb').forEach((t, i) => t.classList.toggle('active', i === currentImgIdx));
  }
  function renderThumbs() {
    const thumbs = document.getElementById('g-thumbs');
    if (!thumbs) return;
    thumbs.innerHTML = currentImgs.map((u, i) => \`
      <div class="gallery-thumb \${i === 0 ? 'active' : ''}" onclick="goImg(\${i})">
        <img src="\${u}" alt="" onerror="this.style.display='none'">
      </div>\`).join('');
  }
  function prevImg() { if (currentImgs.length < 2) return; currentImgIdx = (currentImgIdx - 1 + currentImgs.length) % currentImgs.length; renderGalleryMain(); }
  function nextImg() { if (currentImgs.length < 2) return; currentImgIdx = (currentImgIdx + 1) % currentImgs.length; renderGalleryMain(); }
  function goImg(i) { currentImgIdx = i; renderGalleryMain(); }
  window.prevImg = prevImg; window.nextImg = nextImg; window.goImg = goImg;

  // ════════════════ REMATES ════════════════
  const rfilters = {
    dept: document.getElementById('rf-dept'),
    city: document.getElementById('rf-city'),
    type: document.getElementById('rf-type'),
    mode: document.getElementById('rf-mode'),
    orden: document.getElementById('rf-orden'),
  };
  const rgrid = document.getElementById('rgrid');
  const rempty = document.getElementById('rempty');
  const rresultsCount = document.getElementById('rresults-count');

  document.getElementById('rs-total').textContent = REMATES.length;
  document.getElementById('rs-cities').textContent = new Set(REMATES.map(d => d.city).filter(Boolean)).size;
  document.getElementById('rs-soon').textContent = REMATES.filter(d => { const x = daysToAuction(d.auction_date); return x != null && x >= 0 && x <= 30; }).length;
  const rmins = REMATES.map(d => Number(d.minimum_bid)).filter(n => n > 0);
  const rmavg = rmins.length ? Math.round(rmins.reduce((a,b) => a+b, 0) / rmins.length) : 0;
  document.getElementById('rs-avgmin').textContent = '$' + (rmavg / 1_000_000).toFixed(0) + 'M';

  poblar(rfilters.dept, REMATES.map(d => d.department));
  poblar(rfilters.city, REMATES.map(d => d.city));
  poblar(rfilters.type, REMATES.map(d => d.property_type), typeLbl);

  function rcardHtml(p) {
    const pct = (p.minimum_bid && p.appraisal_value)
      ? Math.round((Number(p.minimum_bid) / Number(p.appraisal_value)) * 100) : null;
    const title = (p.features?.title_raw) || (typeLbl(p.property_type) + ' en ' + cap(p.city));
    return \`
      <article class="card" data-id="\${p.id}" data-kind="remate">
        <div class="card-img-wrap">
          \${p.image_url ? \`<img src="\${p.image_url}" alt="\${typeLbl(p.property_type)}">\` : ''}
          <span class="source-badge">⚖️ Remate</span>
          \${countdownBadge(p.auction_date)}
        </div>
        <div class="card-header">
          <div class="card-price">\${fmtCOP(p.minimum_bid)}</div>
          <div class="card-price-sub">Postura mínima\${pct ? ' · ' + pct + '% del avalúo' : ''}</div>
          <div class="card-price-extra">Avalúo: <strong>\${fmtCOP(p.appraisal_value)}</strong></div>
        </div>
        <div class="card-body">
          <div class="card-titulo">\${title}</div>
          <div class="card-ubic">📍 \${cap(p.city)}\${p.department ? ', ' + cap(p.department) : ''}</div>
          <div class="card-meta">
            <span class="auction">📅 \${fmtAuctionDate(p.auction_date, p.auction_date_raw)}</span>
            \${p.auction_time ? \`<span>🕐 \${p.auction_time}</span>\` : ''}
            \${p.auction_mode ? \`<span class="\${p.auction_mode}" title="\${p.auction_mode === 'virtual' ? 'Audiencia por videoconferencia — puedes participar sin viajar al juzgado' : p.auction_mode === 'presencial' ? 'Hay que ir físicamente al juzgado a la hora indicada' : 'Modalidad mixta'}">⚡ \${modeLbl(p.auction_mode)}</span>\` : ''}
          </div>
        </div>
        <div class="card-cta">VER DETALLES DEL REMATE →</div>
      </article>
    \`;
  }
  function rrender() {
    let list = REMATES.filter(d => {
      if (rfilters.dept.value && d.department !== rfilters.dept.value) return false;
      if (rfilters.city.value && d.city !== rfilters.city.value) return false;
      if (rfilters.type.value && d.property_type !== rfilters.type.value) return false;
      if (rfilters.mode.value && d.auction_mode !== rfilters.mode.value) return false;
      return true;
    });
    const o = rfilters.orden.value;
    if (o === 'auction_asc') list.sort((a,b) => (a.auction_date || '9999-12-31').localeCompare(b.auction_date || '9999-12-31'));
    else if (o === 'auction_desc') list.sort((a,b) => (b.auction_date || '0000-01-01').localeCompare(a.auction_date || '0000-01-01'));
    else if (o === 'min_asc') list.sort((a,b) => (a.minimum_bid || Infinity) - (b.minimum_bid || Infinity));
    else if (o === 'min_desc') list.sort((a,b) => (b.minimum_bid || 0) - (a.minimum_bid || 0));
    else if (o === 'avaluo_asc') list.sort((a,b) => (a.appraisal_value || Infinity) - (b.appraisal_value || Infinity));
    else if (o === 'avaluo_desc') list.sort((a,b) => (b.appraisal_value || 0) - (a.appraisal_value || 0));
    rresultsCount.textContent = list.length + ' remate' + (list.length === 1 ? '' : 's');
    if (list.length === 0) { rgrid.innerHTML = ''; rempty.style.display = 'block'; return; }
    rempty.style.display = 'none';
    rgrid.innerHTML = list.map(p => rcardHtml(p)).join('');
    rgrid.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const item = list.find(x => x.id === c.dataset.id);
        if (item) openRemateModal(item);
      });
    });
  }
  Object.values(rfilters).forEach(f => f.addEventListener('change', rrender));

  function openRemateModal(p) {
    const pct = (p.minimum_bid && p.appraisal_value)
      ? Math.round((Number(p.minimum_bid) / Number(p.appraisal_value)) * 100) : null;
    const title = (p.features?.title_raw) || (typeLbl(p.property_type) + ' en ' + cap(p.city));
    const sectionDesc = p.description ? \`<div class="modal-section"><h3 class="modal-section-title">Descripción del bien</h3><p>\${p.description}</p></div>\` : '';
    const sectionAddr = p.address ? \`<div class="modal-section"><h3 class="modal-section-title">Dirección</h3><p>\${p.address}</p></div>\` : '';
    const sectionMapR = mapEmbed(p.address, p.city, p.department);
    const sectionCourt = p.court ? \`<div class="modal-section"><h3 class="modal-section-title">Juzgado</h3><p>\${p.court}</p>
      \${p.court_email ? \`<a class="court-email" href="mailto:\${p.court_email}">📧 \${p.court_email}</a>\` : ''}</div>\` : '';
    const partes = [];
    if (p.case_number) partes.push({ k: 'N° proceso', v: p.case_number, monoish: true });
    if (p.matricula_inmobiliaria) partes.push({ k: 'Matrícula', v: p.matricula_inmobiliaria, monoish: true });
    if (p.plaintiff) partes.push({ k: 'Demandante', v: p.plaintiff });
    if (p.defendant) partes.push({ k: 'Demandado', v: p.defendant });
    const sectionPartes = partes.length > 0 ? \`
      <div class="modal-section"><h3 class="modal-section-title">Proceso y partes</h3>
        <div class="kv">\${partes.map(x => \`<div class="k">\${x.k}</div><div class="v\${x.monoish ? ' monoish' : ''}">\${x.v}</div>\`).join('')}</div>
      </div>\` : '';
    const sectionTrustee = p.trustee ? \`<div class="modal-section"><h3 class="modal-section-title">Secuestre</h3><p>\${p.trustee}</p></div>\` : '';

    modalContent.innerHTML = \`
      <div class="gallery"><div class="gallery-main">\${p.image_url ? \`<img src="\${p.image_url}" alt="\${typeLbl(p.property_type)}">\` : ''}</div></div>
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
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap;">
            <div>
              <div style="font-size:0.68rem;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:6px;">Avalúo</div>
              <div style="font-family:'Tilt Warp',cursive;font-size:1.6rem;color:rgba(255,255,255,0.92);line-height:1;">\${fmtCOP(p.appraisal_value)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.68rem;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:6px;">Postura mínima</div>
              <div class="modal-price">\${fmtCOP(p.minimum_bid)}</div>
              \${pct ? \`<div style="font-size:0.85rem;color:rgba(255,255,255,0.88);margin-top:8px;font-weight:600;">\${pct}% del avalúo</div>\` : ''}
            </div>
          </div>
          \${p.deposit_pct ? \`<div style="font-size:0.85rem;color:rgba(255,255,255,0.88);margin-top:14px;border-top:1px solid rgba(255,255,255,0.15);padding-top:12px;font-weight:600;">💵 Depósito requerido para participar: <strong style="color: var(--gold)">\${p.deposit_pct}%</strong></div>\` : ''}
        </div>
        \${sectionAddr}\${sectionMapR}\${sectionDesc}\${sectionCourt}\${sectionPartes}\${sectionTrustee}
        <a href="\${p.source_url}" target="_blank" rel="noopener" class="modal-cta">Ver aviso en rematandobienes.com ↗</a>
      </div>
    \`;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ════════════════ TODO ════════════════
  const tfilters = {
    fuente: document.getElementById('tf-fuente'),
    city: document.getElementById('tf-city'),
    type: document.getElementById('tf-type'),
    pricemax: document.getElementById('tf-pricemax'),
    orden: document.getElementById('tf-orden'),
  };
  const tgrid = document.getElementById('tgrid');
  const tempty = document.getElementById('tempty');
  const tresultsCount = document.getElementById('tresults-count');

  // Vista TODO: union normalizada {kind, id, city, type, price, scraped_at, raw}
  const TODO = [
    ...BANCOS.map(p => ({ kind: 'banco', id: p.id, city: p.city, type: p.type, price: p.price, scraped_at: p.scraped_at, raw: p })),
    ...REMATES.map(p => ({ kind: 'remate', id: p.id, city: p.city, type: p.property_type, price: p.minimum_bid, scraped_at: p.scraped_at, raw: p })),
  ];
  poblar(tfilters.city, TODO.map(d => d.city));
  poblar(tfilters.type, TODO.map(d => d.type), typeLbl);

  function trender() {
    let list = TODO.filter(d => {
      if (tfilters.fuente.value && d.kind !== tfilters.fuente.value) return false;
      if (tfilters.city.value && d.city !== tfilters.city.value) return false;
      if (tfilters.type.value && d.type !== tfilters.type.value) return false;
      if (tfilters.pricemax.value && d.price > parseInt(tfilters.pricemax.value) * 1_000_000) return false;
      return true;
    });
    const o = tfilters.orden.value;
    if (o === 'precio_asc') list.sort((a,b) => (a.price||Infinity) - (b.price||Infinity));
    else if (o === 'precio_desc') list.sort((a,b) => (b.price||0) - (a.price||0));
    else if (o === 'recent') list.sort((a,b) => new Date(b.scraped_at) - new Date(a.scraped_at));
    tresultsCount.textContent = list.length + ' aviso' + (list.length === 1 ? '' : 's');
    if (list.length === 0) { tgrid.innerHTML = ''; tempty.style.display = 'block'; return; }
    tempty.style.display = 'none';
    tgrid.innerHTML = list.map(item => item.kind === 'banco' ? bcardHtml(item.raw) : rcardHtml(item.raw)).join('');
    tgrid.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const item = list.find(x => x.id === c.dataset.id);
        if (item) (item.kind === 'banco' ? openBancoModal(item.raw) : openRemateModal(item.raw));
      });
    });
  }
  Object.values(tfilters).forEach(f => f.addEventListener('change', trender));
  tfilters.pricemax.addEventListener('input', trender);

  // ════════════════ Botones limpiar ════════════════
  document.querySelectorAll('[data-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.clear;
      const map = { bancos: bfilters, remates: rfilters, portal: pfilters, todo: tfilters };
      const fs = map[kind];
      Object.values(fs).forEach(f => { f.value = ''; });
      // restore default orden por tab
      if (kind === 'bancos') fs.orden.value = 'precio_m2_asc';
      else if (kind === 'remates') fs.orden.value = 'auction_asc';
      else if (kind === 'portal') fs.orden.value = 'discount_desc';
      else fs.orden.value = 'precio_asc';
      ({ bancos: brender, remates: rrender, portal: prender, todo: trender })[kind]();
    });
  });

  // Initial render
  brender();
  rrender();
  prender();
  trender();
</script>

</body>
</html>`;
}

async function main() {
  log.info('Paso 1: Fetch bancos + remates + portal + lifecycle stats');
  const [inmuebles, remates, portal, lifecycle] = await Promise.all([
    fetchInmuebles(),
    fetchRemates(),
    fetchPortal(),
    fetchLifecycleStats(),
  ]);
  const oportPortal = portal.filter((p) => (p as { is_opportunity?: boolean }).is_opportunity).length;
  log.info(`  Bancos: ${inmuebles.length} · Remates: ${remates.length} · Portal: ${portal.length} (${oportPortal} oportunidades)`);
  log.info(`  Lifecycle 7d: bancos +${lifecycle.inmuebles_new_7d}/-${lifecycle.inmuebles_out_7d}, remates +${lifecycle.remates_new_7d}/-${lifecycle.remates_out_7d}`);

  log.info('Paso 2: Build HTML');
  const html = buildHTML(inmuebles, remates, portal, lifecycle);

  const here = dirname(fileURLToPath(import.meta.url));
  const permanentPath = resolve(here, '..', '..', 'Andres Giraldo', 'RadarMVP.html');
  const tmpPath = join(tmpdir(), 'radar-unified.html');
  writeFileSync(permanentPath, html, 'utf8');
  writeFileSync(tmpPath, html, 'utf8');
  log.info(`✅ ${permanentPath} (${(html.length / 1024).toFixed(0)} KB)`);
  log.info(`✅ ${tmpPath}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

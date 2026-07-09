/**
 * Genera tarjetas branded profesionales por tipo de inmueble y las sube a
 * Supabase Storage. El portal de remates NO trae fotos del inmueble — solo datos
 * jurídicos — así que mostramos una tarjeta clara que NO genera falsa expectativa
 * (no es una foto del inmueble real, sino una representación gráfica del TIPO).
 *
 * Diseño: gradient morado Sistema CRECE + ícono line-art del tipo + "REMATE DE X"
 * + sello judicial (balanza) + wordmark. Texto perfecto (SVG, sin riesgo de IA).
 *
 * Salida: `inmuebles-pdf/placeholders/{type}.svg` — compartidas por tipo.
 *
 * NOTA: si el cliente quiere las imágenes "persona IA con cartel", se generan
 * aparte (requiere generador de imágenes) y se suben con el mismo path; el
 * dashboard las toma automáticamente.
 */
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('placeholders');
const BUCKET = 'inmuebles-pdf';

// Íconos line-art (paths SVG en viewBox 0 0 24 24, stroke). Limpios y reconocibles.
const ICON_PATHS: Record<string, string> = {
  house:      'M3 11.5 12 4l9 7.5M5 10v10h14V10M10 20v-6h4v6',
  apartment:  'M5 21V4h9v17M14 21h5V9h-5M8 7h2M8 11h2M8 15h2M17 12h-1M17 15h-1',
  lot:        'M3 20h18M5 20V9l4-3 4 3M13 20V11l3-2 3 2v9M7 20v-4h2v4',
  farm:       'M3 21h18M4 21v-9l5-4 5 4v9M9 21v-5h2v5M14 21v-6h6v6M16 15v-2l2-1.5 2 1.5v2',
  commercial: 'M4 9h16l-1-4H5L4 9ZM4 9v11h16V9M9 20v-6h6v6M4 9l1 0M20 9l-1 0',
  office:     'M4 21V4h12v17M16 21h4V10h-4M7 7h2M11 7h2M7 11h2M11 11h2M7 15h2M11 15h2',
  vehicle:    'M5 17h14M5 17a2 2 0 0 1-2-2v-3l2-4h12l2 4v3a2 2 0 0 1-2 2M5 17v2H3v-2M19 17v2h2v-2M7 17a1.5 1.5 0 1 0 0-3M17 17a1.5 1.5 0 1 0 0-3M5 11h14',
  parking:    'M4 4h16v16H4zM9 17V8h4a2.5 2.5 0 0 1 0 5H9',
  rights:     'M12 3v18M7 21h10M5 7h14M12 5 6 7l-2.2 5a3 3 0 0 0 5.4 0L7 7M18 7l-2.2 5a3 3 0 0 0 5.4 0L19 7',
  unknown:    'M3 11.5 12 4l9 7.5M5 10v10h14V10',
};

const LABELS: Record<string, string> = {
  house: 'CASA',
  apartment: 'APARTAMENTO',
  lot: 'LOTE',
  farm: 'FINCA',
  commercial: 'LOCAL',
  office: 'OFICINA',
  vehicle: 'VEHÍCULO',
  parking: 'PARQUEADERO',
  rights: 'DERECHOS',
  unknown: 'INMUEBLE',
};

/** Tarjeta 1200x750 (16:10). variant: 'remate' (sello judicial) | 'bank' (en venta). */
function svgFor(type: string, variant: 'remate' | 'bank'): string {
  const iconPath = ICON_PATHS[type] ?? ICON_PATHS.unknown!;
  const label = LABELS[type] ?? LABELS.unknown!;
  const eyebrowText = variant === 'remate' ? 'REMATE JUDICIAL' : 'INMUEBLE EN VENTA';
  const overText = variant === 'remate' ? 'REMATE DE' : 'INMUEBLE ·';
  // Ícono de la esquina: balanza (remate) o etiqueta de precio (banco)
  const cornerIcon = variant === 'remate'
    ? 'M12 3v18M7 21h10M5 7h14M12 5 6 7l-2.2 5a3 3 0 0 0 5.4 0L7 7M18 7l-2.2 5a3 3 0 0 0 5.4 0L19 7'
    : 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h6.6a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8ZM7.5 7.5h.01';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a0a28"/>
      <stop offset="45%" stop-color="#4a2560"/>
      <stop offset="100%" stop-color="#2d1044"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="36%" r="55%">
      <stop offset="0%" stop-color="rgba(241,201,1,0.16)"/>
      <stop offset="60%" stop-color="rgba(241,201,1,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="750" fill="url(#bg)"/>
  <rect width="1200" height="750" fill="url(#glow)"/>

  <g transform="translate(60,54)" opacity="0.92">
    <g transform="scale(1.5)" fill="none" stroke="#F1C901" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="${cornerIcon}"/>
    </g>
    <text x="56" y="20" font-family="-apple-system, 'Segoe UI', sans-serif" font-weight="800"
          font-size="18" fill="#F1C901" letter-spacing="0.16em">${eyebrowText}</text>
  </g>

  <g transform="translate(600,300)">
    <g transform="scale(9) translate(-12,-12)" fill="none" stroke="#ffffff" stroke-width="1.4"
       stroke-linecap="round" stroke-linejoin="round" opacity="0.96">
      <path d="${iconPath}"/>
    </g>
  </g>

  <text x="600" y="540" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-weight="600" font-size="30" fill="#dcc4ec" text-anchor="middle"
        letter-spacing="0.22em">${overText}</text>
  <text x="600" y="612" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-weight="800" font-size="76" fill="#F1C901" text-anchor="middle"
        letter-spacing="0.02em">${label}</text>

  <text x="600" y="704" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-weight="700" font-size="22" fill="rgba(255,255,255,0.5)" text-anchor="middle"
        letter-spacing="0.2em">SISTEMA CRECE</text>
</svg>`;
}

async function ensureSvgAllowed() {
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  const allowed = (bucket?.allowed_mime_types ?? []) as string[];
  if (allowed.length && !allowed.includes('image/svg+xml')) {
    const { error } = await supabase.storage.updateBucket(BUCKET, {
      public: bucket?.public ?? true,
      allowedMimeTypes: [...allowed, 'image/svg+xml'],
    });
    if (error) throw new Error(`updateBucket: ${error.message}`);
    log.info(`  ✓ bucket "${BUCKET}" ahora permite image/svg+xml`);
  }
}

async function main() {
  await ensureSvgAllowed();
  // Set REMATE: placeholders/{type}.svg  ·  Set BANCO: placeholders/bank/{type}.svg
  for (const variant of ['remate', 'bank'] as const) {
    for (const type of Object.keys(LABELS)) {
      const svg = svgFor(type, variant);
      const path = variant === 'remate' ? `placeholders/${type}.svg` : `placeholders/bank/${type}.svg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, svg, {
        contentType: 'image/svg+xml',
        upsert: true,
        cacheControl: '604800',
      });
      if (error) { log.error(`  ✗ ${path}: ${error.message}`); continue; }
    }
    log.info(`  ✓ set "${variant}" subido (${Object.keys(LABELS).length} tarjetas)`);
  }
  log.info('✅ Tarjetas branded (remate + banco) listas.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

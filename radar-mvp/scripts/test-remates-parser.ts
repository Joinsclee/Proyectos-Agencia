/**
 * Test del parser contra el aviso del recon.
 * No toca BD ni red. Solo lee `_session/remates-recon.json` y parsea.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAviso } from '../scrapers/CO/rematandobienes/parser.js';
import type { RemateAvisoRaw } from '../scrapers/CO/rematandobienes/types.js';

const RECON_PATH = join(process.cwd(), '_session', 'remates-recon.json');
const recon = JSON.parse(readFileSync(RECON_PATH, 'utf8'));

const sa = recon.sample_aviso;
if (!sa) {
  console.error('No hay sample_aviso en el recon');
  process.exit(1);
}

// jet_field_texts: tomar solo los TEXTOS, deduplicados.
// El recon trae 2 entradas por campo (wrapper Elementor + jet-listing interno).
// Tomamos solo los pares (índices pares).
const allTexts: string[] = sa.jet_fields.map((f: { text: string }) => f.text);
const dedup: string[] = [];
for (let i = 0; i < allTexts.length; i++) {
  if (i % 2 === 0) dedup.push(allTexts[i]!);
}

const raw: RemateAvisoRaw = {
  url: sa.url,
  slug: sa.url.split('/remates-judiciales/')[1]?.replace(/\/$/, '') ?? sa.url,
  department_slug: 'cundinamarca',
  city_slug: 'la-vega',
  city_label: 'La Vega',
  jet_field_texts: dedup,
  full_text: sa.full_text,
  categories: [], // el recon no lo trae todavía; el scraper sí
  title: sa.title,
};

const remate = parseAviso(raw);
console.log(JSON.stringify(remate, null, 2));

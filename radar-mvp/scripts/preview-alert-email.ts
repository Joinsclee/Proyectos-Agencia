import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAlertDigestHtml, type AlertMatch } from '../server/notifications.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'output', 'email', 'alert-premium-preview.html');
const alert = {
  id: 'preview-alert',
  city: 'bogota',
  budget: '500',
  type: 'apartment' as const,
  frequency: 'weekly' as const,
  active: true,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
};
const matches: AlertMatch[] = [
  {
    id: 'preview-1',
    source: 'fincaraiz',
    type: 'apartment',
    city: 'bogota',
    zone: 'Chapinero Alto',
    address: 'Sector Rosales',
    price: 315_000_000,
    discount_pct: 56.8,
    area_m2: 72,
  },
  {
    id: 'preview-2',
    source: 'fincaraiz',
    type: 'apartment',
    city: 'bogota',
    zone: 'Cedritos',
    price: 350_000_000,
    discount_pct: 56,
    area_m2: 81,
  },
  {
    id: 'preview-3',
    source: 'bancolombia',
    type: 'apartment',
    city: 'bogota',
    zone: 'Suba',
    price: 220_000_000,
    discount_pct: 55.5,
    area_m2: 64,
  },
  {
    id: 'preview-4',
    source: 'davivienda',
    type: 'apartment',
    city: 'bogota',
    zone: 'Teusaquillo',
    price: 380_000_000,
    discount_pct: 54.2,
    area_m2: 90,
  },
];

await mkdir(dirname(output), { recursive: true });
await writeFile(output, buildAlertDigestHtml(alert, matches), 'utf8');
console.log(output);

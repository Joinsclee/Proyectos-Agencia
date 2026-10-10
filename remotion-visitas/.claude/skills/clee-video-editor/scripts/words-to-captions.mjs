#!/usr/bin/env node
// words-to-captions.mjs IN.json OUT.json — convierte el JSON word-level de whisper-cli en Caption[] de @remotion/captions.
// Caption = { text, startMs, endMs, timestampMs, confidence }. Consúmelo con createTikTokStyleCaptions() en Remotion.

import { readFileSync, writeFileSync } from 'node:fs';

const [IN, OUT] = process.argv.slice(2);
if (!IN || !OUT) {
  console.error('uso: words-to-captions.mjs <in.json> <out.json>');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(IN, 'utf8'));

const captions = (raw.transcription || [])
  .map((seg) => {
    const startMs = seg.offsets?.from ?? seg.t0 ?? null;
    const endMs = seg.offsets?.to ?? seg.t1 ?? null;
    // Preservar el espacio inicial (convención whisper/OpenAI): mantiene los límites de palabra al recombinar.
    const text = (seg.text || '').replace(/\r?\n/g, ' ');
    return { text, startMs, endMs };
  })
  .filter((c) => c.text.trim() && c.startMs != null && c.endMs != null && c.endMs > c.startMs)
  .map((c) => ({
    text: c.text,
    startMs: c.startMs,
    endMs: c.endMs,
    timestampMs: Math.round((c.startMs + c.endMs) / 2),
    confidence: null,
  }));

if (captions.length === 0) {
  console.error('No hay palabras válidas en el JSON.');
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(captions, null, 2), 'utf8');
console.log(`Caption[] -> ${OUT}  ·  ${captions.length} palabras`);

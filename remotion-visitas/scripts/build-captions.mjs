// Convierte la salida JSON-full de whisper.cpp (-ojf) en el formato de
// captions que consume CaptionedVideo: [{ show, hide, words:[{t,start,end}] }]
//
// Uso: node scripts/build-captions.mjs <whisper.json> <captions.json> [maxWords] [maxTimeSeg]
//
// maxTimeSeg = duración real del video (s). whisper.cpp a veces "rellena" el
// último segmento más allá del audio real; cuando un segmento termina después
// de maxTime se reescalan linealmente sus tokens para que quepa en el tiempo
// real (evita que la última palabra quede fuera del video).
//
// Detalles del formato whisper.cpp -ojf:
//   { transcription: [ { offsets:{from,to}, text, tokens:[ { text, offsets:{from,to} } ] } ] }
// Los offsets vienen en milisegundos. Los tokens de palabra empiezan con
// espacio inicial; los subtokens (continuaciones) no lo tienen. Tokens
// especiales tipo [_BEG_] / [_TT_123] se descartan.

import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath, maxWordsArg, maxTimeArg] = process.argv;

if (!inPath || !outPath) {
  console.error("Uso: node build-captions.mjs <whisper.json> <captions.json> [maxWords] [maxTimeSeg]");
  process.exit(1);
}

const MAX_WORDS = Number(maxWordsArg) || 5;
const MAX_TIME = Number(maxTimeArg) > 0 ? Number(maxTimeArg) : Infinity;

// Tokens especiales de whisper.cpp: [_BEG_], [_EOT_], [_TT_250], etc.
const isSpecial = (text) => /^\s*\[_.*\]\s*$/.test(text);
const round2 = (n) => Math.round(n * 100) / 100;

const raw = JSON.parse(readFileSync(inPath, "utf8"));
const segments = raw.transcription ?? [];

// 1) Aplanar tokens -> palabras con timing por palabra
const words = [];
for (const seg of segments) {
  const segFrom = (seg.offsets?.from ?? 0) / 1000;
  const segTo = (seg.offsets?.to ?? segFrom) / 1000;
  // Si el segmento se pasa del tiempo real, comprime sus tokens para que quepa
  let scale = 1;
  if (segTo > MAX_TIME + 0.02 && segTo > segFrom) {
    scale = (Math.max(MAX_TIME, segFrom) - segFrom) / (segTo - segFrom);
  }
  const remap = (sec) =>
    Math.min(segFrom + (sec - segFrom) * scale, MAX_TIME);

  for (const tok of seg.tokens ?? []) {
    const text = tok.text ?? "";
    if (isSpecial(text)) continue;
    const start = remap((tok.offsets?.from ?? 0) / 1000);
    const end = remap((tok.offsets?.to ?? (tok.offsets?.from ?? 0)) / 1000);

    const startsNewWord = /^\s/.test(text) || words.length === 0;
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean === "") continue;

    if (startsNewWord) {
      words.push({ t: clean, start, end });
    } else {
      // continuación de la palabra anterior (subtoken)
      const prev = words[words.length - 1];
      prev.t += clean;
      prev.end = end;
    }
  }
}

// Saltar palabras vacías o degeneradas y asegurar monotonía de tiempos
const cleaned = words
  .filter((w) => w.t && w.end >= w.start)
  .map((w) => ({ t: w.t, start: round2(w.start), end: round2(w.end) }));

// 2) Agrupar palabras en líneas naturales
//    - corta tras MAX_WORDS palabras
//    - corta antes si la palabra termina en . ? ! … (fin de frase) y la línea ya tiene >=2
//    - corta tras coma si la línea ya tiene >=4
const endsSentence = (t) => /[.?!…]$/.test(t);
const endsClause = (t) => /[,;:]$/.test(t);

const lines = [];
let current = [];
for (const w of cleaned) {
  current.push(w);
  const len = current.length;
  const shouldBreak =
    len >= MAX_WORDS ||
    (endsSentence(w.t) && len >= 2) ||
    (endsClause(w.t) && len >= 4);
  if (shouldBreak) {
    lines.push(current);
    current = [];
  }
}
if (current.length) lines.push(current);

// 3) Construir captions con show/hide contiguos
const captions = lines.map((lineWords, i) => {
  const show = lineWords[0].start;
  const lastEnd = lineWords[lineWords.length - 1].end;
  return { show, hide: lastEnd, words: lineWords, _next: i };
});

// hide contiguo = show de la siguiente línea (evita parpadeos entre líneas)
for (let i = 0; i < captions.length - 1; i++) {
  captions[i].hide = captions[i + 1].show;
}
// última línea: deja un pequeño remanente (sin pasar del tiempo real)
if (captions.length) {
  const last = captions[captions.length - 1];
  const tail = last.words[last.words.length - 1].end + 0.6;
  last.hide = round2(Math.min(tail, MAX_TIME));
}

const final = captions.map(({ show, hide, words }) => ({
  show: round2(show),
  hide: round2(hide),
  words,
}));

writeFileSync(outPath, JSON.stringify(final));

const totalWords = cleaned.length;
const dur = final.length ? final[final.length - 1].hide : 0;
console.log(
  `OK -> ${outPath}\n  líneas: ${final.length}  palabras: ${totalWords}  fin: ${dur}s`
);

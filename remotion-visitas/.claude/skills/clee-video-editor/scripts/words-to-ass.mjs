#!/usr/bin/env node
// words-to-ass.mjs IN.json OUT.ass [opts] — convierte el JSON word-level de whisper-cli en subtítulos ASS.
// Dos modos: --mode highlight (una línea por palabra activa, resaltada) | --mode karaoke (\k fill progresivo).
// Requiere quemar con FFSUB (libass). Colores de entrada en RRGGBB.
//
// Opts: --mode karaoke|highlight (def highlight) --lead 150 --max-words 5 --gap 800
//       --text FFFFFF --active FFD400 --outline 3 --shadow 1 --marginv 360 --fontsize 96 --font Arial --bold 1
//       --playw 1080 --playh 1920 --align 2

import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.error('uso: words-to-ass.mjs <in.json> <out.ass> [--mode highlight|karaoke] [--active RRGGBB] ...');
  process.exit(2);
}
const [IN, OUT] = argv;
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const o = {
  mode: opt('mode', 'highlight'),
  lead: Number(opt('lead', 150)),
  maxWords: Number(opt('max-words', 5)),
  gap: Number(opt('gap', 800)),
  text: opt('text', 'FFFFFF'),
  active: opt('active', 'FFD400'),
  outline: Number(opt('outline', 3)),
  shadow: Number(opt('shadow', 1)),
  marginv: Number(opt('marginv', 360)),
  fontsize: Number(opt('fontsize', 96)),
  font: opt('font', 'Arial'),
  bold: opt('bold', '1') === '1' ? -1 : 0,
  playw: Number(opt('playw', 1080)),
  playh: Number(opt('playh', 1920)),
  align: Number(opt('align', 2)),
};

// --- color: RRGGBB -> ASS. 8-dig (&HAABBGGRR) para Styles, 6-dig (&HBBGGRR&) para override inline \c ---
const parts = (rgb) => {
  const h = rgb.replace(/^#/, '').padStart(6, '0');
  return [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)]; // rr, gg, bb
};
const ass8 = (rgb) => { const [rr, gg, bb] = parts(rgb); return `&H00${bb}${gg}${rr}`.toUpperCase(); };
const ass6 = (rgb) => { const [rr, gg, bb] = parts(rgb); return `&H${bb}${gg}${rr}&`.toUpperCase(); };

// --- tiempo ms -> H:MM:SS.cc ---
const msToAss = (ms) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p2 = (n) => String(n).padStart(2, '0');
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`;
};
const esc = (t) => t.replace(/[{}]/g, '').replace(/\r?\n/g, ' ').trim();

// --- leer palabras del JSON whisper (-oj): {transcription:[{text, offsets:{from,to}}]} ---
const raw = JSON.parse(readFileSync(IN, 'utf8'));
const words = (raw.transcription || [])
  .map((seg) => ({
    text: esc(seg.text || ''),
    from: seg.offsets?.from ?? seg.t0 ?? null,
    to: seg.offsets?.to ?? seg.t1 ?? null,
  }))
  .filter((w) => w.text && w.from != null && w.to != null && w.to > w.from);

if (words.length === 0) { console.error('No hay palabras válidas en el JSON.'); process.exit(1); }

// --- agrupar en páginas de <=maxWords, cortando en gaps > o.gap ---
const pages = words.reduce((acc, w) => {
  const cur = acc[acc.length - 1];
  if (!cur || cur.length >= o.maxWords || w.from - cur[cur.length - 1].to > o.gap) {
    acc.push([w]);
  } else {
    cur.push(w);
  }
  return acc;
}, []);

// --- construir eventos ---
const events = [];
if (o.mode === 'karaoke') {
  for (const page of pages) {
    const start = page[0].from - o.lead;
    const end = page[page.length - 1].to - o.lead;
    const body = page
      .map((w) => `{\\k${Math.max(1, Math.round((w.to - w.from) / 10))}}${w.text} `)
      .join('')
      .trimEnd();
    events.push({ start, end, text: body });
  }
} else {
  const active6 = ass6(o.active);
  const text6 = ass6(o.text);
  for (const page of pages) {
    const pageEnd = page[page.length - 1].to;
    for (let i = 0; i < page.length; i++) {
      const start = page[i].from - o.lead;
      const rawEnd = i < page.length - 1 ? page[i + 1].from : pageEnd;
      const end = rawEnd - o.lead + 80; // hold extra de la palabra activa
      const line = page
        .map((w, j) => (j === i ? `{\\c${active6}}${w.text}{\\c${text6}}` : w.text))
        .join(' ');
      events.push({ start, end: Math.max(start + 10, end), text: line });
    }
  }
}

// --- Style: en karaoke Primary=activo (fill), Secondary=texto base; en highlight Primary=texto ---
const primary = o.mode === 'karaoke' ? ass8(o.active) : ass8(o.text);
const secondary = o.mode === 'karaoke' ? ass8(o.text) : ass8(o.text);
const outlineCol = '&H00000000'; // negro
const backCol = '&H64000000';

const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${o.playw}
PlayResY: ${o.playh}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CLEE,${o.font},${o.fontsize},${primary},${secondary},${outlineCol},${backCol},${o.bold},0,0,0,100,100,0,0,1,${o.outline},${o.shadow},${o.align},60,60,${o.marginv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

const body = events
  .map((e) => `Dialogue: 0,${msToAss(e.start)},${msToAss(e.end)},CLEE,,0,0,0,,${e.text}`)
  .join('\n');

writeFileSync(OUT, `${header}\n${body}\n`, 'utf8');
console.log(`ASS (${o.mode}) -> ${OUT}  ·  ${events.length} eventos, ${pages.length} páginas`);

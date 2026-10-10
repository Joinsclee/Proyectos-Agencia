// Genera src/jc/jc-data.json a partir de src/jc/jc-words.json (whisper word-level)
// Produce: introLines (captions kinéticos 0-44.6s), moments (captions puntuales
// del screencast) y quoteWords (cita Blair Warren con timing por palabra).
//
// Uso: node scripts/build-jc-data.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lines = JSON.parse(readFileSync(join(root, "src/jc/jc-words.json"), "utf8"));

// Correcciones de transcripción (whisper) para texto visible
const FIXES = new Map([
  ["Cristian", "Cristhian"],
  ["valla", "buyer"],
  ["Valla", "Buyer"],
  ["vallar", "buyer"],
  ["llama", "llamada"], // "agendas una llama de consultoría"
]);

const fixWord = (t) => {
  const m = t.match(/^([¿¡"«(]*)(.+?)([.,;:!?…")»]*)$/);
  if (!m) return t;
  const [, pre, core, post] = m;
  return pre + (FIXES.get(core) ?? core) + post;
};

const clean = (w) => ({ ...w, t: fixWord(w.t) });
const strip = (t) => t.toLowerCase().replace(/[^a-záéíóúüñ0-9]/gi, "");

// Palabras que quedan en dorado permanente (por momento)
const INTRO_HL = new Set([
  "marca", "personal", "historia", "tú", "sí", "consultoría",
  "cristhian", "fonseca", "quedarse",
]);

// ── Intro: líneas 0 → 44.3s ──────────────────────────────────────────────
const ACCENT_SHOWS = new Set(["5.72", "26.81", "43.42"]); // serif + banda dorada

const introLines = [];
for (const l of lines) {
  if (l.show >= 44.3) break;
  const words = l.words.map(clean).map((w) => ({
    ...w,
    hl: INTRO_HL.has(strip(w.t)),
  }));
  introLines.push({
    show: l.show,
    hide: l.hide,
    words,
    accent: ACCENT_SHOWS.has(l.show.toFixed(2)),
  });
}
// La línea final ("como bien sabes, ha venido para") absorbe "quedarse." de la
// siguiente y cierra justo antes del corte a screencast (44.6s)
const last = introLines[introLines.length - 1];
const next = lines.find((l) => l.show > 44.2 && l.show < 44.4);
if (last && next) {
  const q = next.words.find((w) => strip(w.t).startsWith("quedarse"));
  if (q) last.words.push({ ...clean(q), hl: true });
  last.hide = 44.55;
}

// ── Momentos kinéticos del screencast ────────────────────────────────────
// from/to: rango de líneas a incluir; hl: palabras en dorado permanente
const MOMENTS = [
  { from: 67.5, to: 70.15, hl: ["buyer", "persona", "avatar"] },
  { from: 94.81, to: 98.48, hl: ["punto", "a", "b"] },
  { from: 143.22, to: 147.6, hl: ["preguntarle", "audiencia"] },
  { from: 201.47, to: 206.45, hl: ["mentorías", "libros"] },
  { from: 223.98, to: 225.46, hl: ["optimizar", "oferta"] },
  { from: 237.39, to: 242.88, hl: ["coherencia", "marca", "comunicación"] },
  { from: 325.39, to: 333.12, hl: ["7", "horas"] },
  { from: 358.76, to: 361.2, hl: ["mini", "lanzamiento"] },
  { from: 653.55, to: 659.48, hl: ["historia", "tú", "sí"] },
];

const moments = MOMENTS.map(({ from, to, hl }) => {
  const hlSet = new Set(hl.map(strip));
  const ls = lines
    .filter((l) => l.show >= from - 0.05 && l.show < to)
    .map((l) => ({
      show: l.show,
      hide: Math.min(l.hide, to),
      words: l.words.map(clean).map((w) => ({ ...w, hl: hlSet.has(strip(w.t)) })),
    }));
  return { from, to, lines: ls };
});

// ── Cita Blair Warren (lectura 568.2 → 576.98) ───────────────────────────
const quoteWords = [];
outer: for (const l of lines) {
  if (l.show < 567.3 || l.show > 576.98) continue;
  for (const w of l.words) {
    if (w.start < 568.1) continue; // descarta "Bay Warren, dijo,"
    quoteWords.push(clean(w));
    if (strip(w.t).startsWith("enemigos")) break outer;
  }
}

const out = { introLines, moments, quoteWords };
writeFileSync(join(root, "src/jc/jc-data.json"), JSON.stringify(out));
console.log(
  `OK -> src/jc/jc-data.json | intro: ${introLines.length} líneas | momentos: ${moments.length} | cita: ${quoteWords.length} palabras`
);

// Genera src/jc/comunicacion-data.json desde src/jc/comunicacion-words.json
// (whisper word-level ya agrupado en líneas de 6 palabras). Produce:
//   introLines: captions kinéticos de la intro (0–19.8s), con accent + hl
//   moments:    captions overlay puntuales del cuerpo, con hl
//
// Uso: node scripts/build-comunicacion-data.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lines = JSON.parse(readFileSync(join(root, "src/jc/comunicacion-words.json"), "utf8"));

// Correcciones de transcripción para texto visible
const FIXES = new Map([
  ["CLI", "CLEE"],
  ["cli", "CLEE"],
]);
const fixWord = (t) => {
  const m = t.match(/^([¿¡"«(]*)(.+?)([.,;:!?…")»]*)$/);
  if (!m) return t;
  const [, pre, core, post] = m;
  return pre + (FIXES.get(core) ?? core) + post;
};
const clean = (w) => ({ ...w, t: fixWord(w.t) });
const strip = (t) => t.toLowerCase().replace(/[^a-záéíóúüñ0-9]/gi, "");

const INTRO_END = 19.8;

// Palabras que quedan en dorado permanente en la intro
const INTRO_HL = new Set([
  "estrategia", "comunicación", "comunicacion", "minutos", "agencia",
  "youtube", "ventas", "vertical", "verticales",
]);
// Líneas de acento (serif italic + banda dorada) por la palabra que contienen
const ACCENT_WORDS = new Set(["comunicación", "comunicacion", "ventas", "agencia", "minutos"]);

const introLines = [];
for (const l of lines) {
  if (l.show >= INTRO_END) break;
  const words = l.words.map(clean).map((w) => ({ ...w, hl: INTRO_HL.has(strip(w.t)) }));
  const accent = words.some((w) => ACCENT_WORDS.has(strip(w.t)));
  introLines.push({ show: l.show, hide: l.hide, words, accent });
}

// ── Momentos kinéticos del cuerpo (overlay) ──────────────────────────────
const MOMENTS = [
  { from: 43, to: 53.5, hl: ["comunicación", "comunicarte", "IA"] },
  { from: 156, to: 166, hl: ["siete", "horas", "confianza"] },
  { from: 353.5, to: 372.5, hl: ["transformación", "transformacion", "resultados"] },
  { from: 473, to: 483.5, hl: ["omnicanal"] },
  { from: 557.8, to: 567, hl: ["una", "idea"] },
  { from: 765, to: 775.5, hl: ["agendar", "llamada", "llamadas"] },
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

const out = { introLines, moments };
writeFileSync(join(root, "src/jc/comunicacion-data.json"), JSON.stringify(out));
console.log(
  `OK -> src/jc/comunicacion-data.json | intro: ${introLines.length} líneas (${introLines.filter((l) => l.accent).length} acento) | momentos: ${moments.length}`
);

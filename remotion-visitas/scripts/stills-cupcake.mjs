// Renderiza stills de revisión de la composición CupcakeJabon.
// Empaqueta UNA vez y renderiza varios frames (mucho más rápido que `remotion still` N veces).
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "out", "stills-cupcake");
const fps = 30;
const F = (sec) => Math.round(sec * fps);

// [nombre, segundo, gradeOverride?]
const SHOTS = [
  ["00-marca", 2],
  ["01a-subscribe-in", 35.8],
  ["01b-subscribe-click", 37.7],
  ["01c-subscribe-bell", 39.2],
  ["02-ppe", 50],
  ["03-herramientas", 73],
  ["04-base", 267],
  ["05-frambuesas", 414],
  ["06-frosting", 707],
  ["07-qr-1654", 1017],
  ["08-qr-1922", 1165],
  ["09-color-CON", 267, true],
  ["10-color-SIN", 267, false],
];

const main = async () => {
  console.log("Empaquetando proyecto…");
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src", "index.ts"),
    onProgress: () => {},
  });
  console.log("Bundle listo. Renderizando stills…");

  for (const [name, sec, grade] of SHOTS) {
    const inputProps = grade === undefined ? {} : { grade };
    const composition = await selectComposition({
      serveUrl,
      id: "CupcakeJabon",
      inputProps,
    });
    const output = path.join(outDir, `${name}.png`);
    await renderStill({
      composition,
      serveUrl,
      output,
      frame: F(sec),
      inputProps,
      imageFormat: "png",
      overwrite: true,
    });
    console.log(`  ✓ ${name}.png  (t=${sec}s, frame=${F(sec)})`);
  }
  console.log("Listo →", outDir);
  // Limpia el bundle temporal (Remotion copia public/ ~5GB y no lo borra solo).
  try {
    if (serveUrl && !serveUrl.startsWith("http")) {
      fs.rmSync(serveUrl.replace(/^file:\/\//, ""), { recursive: true, force: true });
      console.log("bundle temporal limpiado");
    }
  } catch {}
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import remotionPlugin from "@remotion/eslint-plugin";
import tseslint from "typescript-eslint";

// @remotion/eslint-plugin es CommonJS: en ESM hay que tomar el default y
// desestructurar (el named import "flatPlugin" no se expone vía interop).
const { flatPlugin } = remotionPlugin;

// Lint enfocado en las reglas oficiales de Remotion: atrapa los bugs de render
// (animaciones CSS no puras que parpadean, aleatoriedad no determinista, assets
// sin staticFile, dimensiones impares, etc.). Usamos el parser de TypeScript solo
// para poder leer .ts/.tsx; no activamos reglas de estilo de TS para evitar ruido.
export default [
  {
    ignores: ["out/**", "node_modules/**", "scripts/**", "**/*.json"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: flatPlugin.plugins,
    rules: {
      ...flatPlugin.rules,
      // No incluida en el preset recommended: avisa de efectos GPU lentos
      // (boxShadow / textShadow / filter) que ralentizan el render.
      "@remotion/slow-css-property": "warn",
    },
  },
];

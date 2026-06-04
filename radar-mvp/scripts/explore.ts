/**
 * Script exploratorio: hace scrape simple (sin schema) de los portales fallidos
 * y guarda el markdown/html en /tmp para inspección visual.
 *
 * Uso: tsx scripts/explore.ts
 */
import { scrapeMarkdown } from '../lib/firecrawl.js';
import { writeFileSync } from 'node:fs';

const TARGETS = [
  { name: 'bancolombia', url: 'https://inmobiliariotu360.bancolombia.com/', waitFor: 5000 },
  { name: 'bbva', url: 'https://www.bbva.com.co/personas/promocion/remates.html', waitFor: 3000 },
  { name: 'aval', url: 'https://www.avalvc.com.co/portal-inmobiliario', waitFor: 3000 },
];

async function main() {
  for (const t of TARGETS) {
    console.log(`\n🔍 Explorando ${t.name}: ${t.url}`);
    const { markdown, html, links, error } = await scrapeMarkdown({
      url: t.url,
      waitFor: t.waitFor,
      onlyMainContent: false,
    });

    if (error) {
      console.log(`  ❌ Error: ${error}`);
      continue;
    }

    const mdSize = markdown?.length ?? 0;
    const htmlSize = html?.length ?? 0;
    console.log(`  Markdown: ${mdSize} chars | HTML: ${htmlSize} chars | Links: ${links.length}`);

    if (markdown) {
      writeFileSync(`/tmp/explore-${t.name}.md`, markdown);
      console.log(`  Markdown → /tmp/explore-${t.name}.md`);
    }
    if (html) {
      writeFileSync(`/tmp/explore-${t.name}.html`, html);
      console.log(`  HTML     → /tmp/explore-${t.name}.html`);
    }

    // Sample primeros 5 links
    if (links.length > 0) {
      console.log(`  Sample links:`);
      links.slice(0, 8).forEach((l) => console.log(`    · ${l}`));
    }

    // Buscar URLs que parezcan de propiedades
    const candidatosURL = links.filter((l) =>
      /\/(?:propiedad|inmueble|inmuebles|propiedades|detalle|listado|busqueda|search)\b/i.test(l)
    );
    if (candidatosURL.length > 0) {
      console.log(`  ⭐ Candidatos URL propiedad (${candidatosURL.length}):`);
      candidatosURL.slice(0, 5).forEach((l) => console.log(`    · ${l}`));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

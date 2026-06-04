/**
 * Diagnóstico rápido de cobertura de datos enriquecidos en DV + BC
 */
import { supabase } from '../lib/supabase.js';

async function main() {
  const { data } = await supabase
    .from('inmuebles')
    .select('source, features, image_url, address, zone, city')
    .in('source', ['davivienda', 'bancolombia']);

  const rows = data ?? [];
  const conGal = rows.filter((d) => {
    const f = d.features as Record<string, unknown>;
    return Array.isArray(f?.images) && (f.images as unknown[]).length > 0;
  });
  const conDesc = rows.filter((d) => (d.features as Record<string, unknown>)?.description);
  const conAmen = rows.filter((d) => {
    const f = d.features as Record<string, unknown>;
    return Array.isArray(f?.amenities) && (f.amenities as unknown[]).length > 0;
  });
  const conAdmin = rows.filter((d) => (d.features as Record<string, unknown>)?.administracion);
  const conAnt = rows.filter((d) => (d.features as Record<string, unknown>)?.antiguedad);
  const conImgPrincipal = rows.filter((d) => d.image_url);

  const totalFotos = rows.reduce((acc, d) => {
    const f = d.features as Record<string, unknown>;
    return acc + ((f?.images as unknown[] | undefined)?.length ?? 0);
  }, 0);

  console.log('═══════════════════════════════════════');
  console.log(`DV + BC total: ${rows.length} inmuebles`);
  console.log('───────────────────────────────────────');
  console.log(`📷 con foto principal:  ${conImgPrincipal.length}`);
  console.log(`🖼  con galería >0:      ${conGal.length}`);
  console.log(`📝 con descripción:     ${conDesc.length}`);
  console.log(`✨ con amenities:       ${conAmen.length}`);
  console.log(`💳 con administración:  ${conAdmin.length}`);
  console.log(`⏳ con antigüedad:       ${conAnt.length}`);
  console.log(`───────────────────────────────────────`);
  console.log(`Total fotos en galerías: ${totalFotos}`);
  console.log(`Promedio fotos/inmueble c/galería: ${(totalFotos / Math.max(conGal.length, 1)).toFixed(1)}`);

  // Ejemplo de uno rico
  const rico = conGal.find((d) => (d.features as any)?.description && (d.features as any)?.amenities?.length > 2);
  if (rico) {
    const f = rico.features as Record<string, any>;
    console.log('\n═══════════ EJEMPLO COMPLETO ═══════════');
    console.log(`📍 ${rico.zone ?? '—'}, ${rico.city}`);
    console.log(`🏠 ${rico.address ?? '—'}`);
    console.log(`📷 ${f.images?.length ?? 0} fotos`);
    console.log(`💳 admin: ${f.administracion ?? '—'}`);
    console.log(`✨ amenities: ${(f.amenities ?? []).slice(0, 5).join(', ')}`);
    console.log(`📝 descripción: ${(f.description ?? '').substring(0, 120)}…`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

import { supabase } from '../lib/supabase.js';

async function main() {
  const { data } = await supabase
    .from('inmuebles')
    .select('*')
    .eq('source', 'aval')
    .order('updated_at', { ascending: false })
    .limit(5);
  (data ?? []).forEach((d) => {
    const f = d.features as Record<string, unknown>;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('source_id:', d.source_id);
    console.log('precio (num):', d.price, '| raw:', f?.price_raw);
    console.log('área (num):', d.area_m2, '| raw:', f?.area_raw);
    console.log('tipo:', d.type, '| raw:', f?.type_raw);
    console.log('ciudad:', d.city, '| address:', d.address);
    console.log('image_url:', d.image_url);
    console.log('pdf_page:', f?.pdf_page);
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

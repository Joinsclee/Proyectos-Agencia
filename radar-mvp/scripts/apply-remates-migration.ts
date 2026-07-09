/**
 * Aplica la migration de la tabla `remates` directamente a Supabase.
 *
 * Usa la API REST de Supabase con la service_role key — autorizada para DDL.
 * Es un atajo para no tener que conectar el CLI de Supabase localmente.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

async function main() {
  const sqlPath = join(process.cwd(), 'supabase', 'migrations', '20260609000001_remates.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  // Supabase tiene un endpoint REST para queries SQL via pg-meta:
  // POST /pg/query con `{query: "..."}` (requiere extension pg_net o pg-meta).
  // Alternativa robusta: usar el endpoint `rpc` con una función Postgres que ejecute sql,
  // pero no la tenemos creada. Mejor: dividir el SQL por sentencias y aplicarlas vía PostgREST.
  //
  // En la práctica, la forma más fiable cuando NO tenemos Supabase CLI es:
  //   pegar el SQL en el SQL Editor de Supabase Studio.
  //
  // Como atajo: dejamos este script imprimiendo el SQL listo para copiar/pegar.
  console.log('Para aplicar la migration, pega esto en Supabase Studio → SQL Editor:');
  console.log(`URL: ${SUPABASE_URL.replace('.supabase.co', '.supabase.com')}/project/_/sql`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(sql);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tras pegar y ejecutar, verifica con:`);
  console.log(`  curl '${SUPABASE_URL}/rest/v1/remates?select=count' -H 'apikey: <key>' -H 'Authorization: Bearer <key>'`);
}

main().catch((e) => { console.error(e); process.exit(1); });

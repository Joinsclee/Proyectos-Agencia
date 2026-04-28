#!/usr/bin/env node
// Sync Google Drive → Supabase pgvector (corre LOCAL en tu Mac, no en Edge Function)
//
// Uso:
//   node scripts/sync-knowledge.mjs
//
// Configuración: edita .env.local en la misma carpeta del script con:
//   SUPABASE_URL=https://cojwzekyeehqtxdvoldj.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...
//   OPENAI_API_KEY=sk-proj-...
//   GOOGLE_DRIVE_FOLDER_ID=1Xs8L4---3IIEvl2vwszonB7sOANtx1gM
//   GOOGLE_SERVICE_ACCOUNT_JSON_PATH=../joinsclee-knowledge-base-19bb1da34944.json

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Carga .env.local --------------------------------------
const envPath = resolve(__dirname, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const FOLDER_ID    = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SA_PATH      = resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || '');

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY || !FOLDER_ID || !SA_PATH) {
  console.error('Faltan variables de entorno. Verifica scripts/.env.local');
  process.exit(1);
}
if (!existsSync(SA_PATH)) {
  console.error(`No encontré el JSON de service account en: ${SA_PATH}`);
  process.exit(1);
}

const SA = JSON.parse(readFileSync(SA_PATH, 'utf8'));

const EMBED_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const SUPPORTED_MIMES = new Set([
  'application/vnd.google-apps.document',
  'text/plain',
  'text/markdown',
  'application/pdf',
]);

// --- Supabase REST ------------------------------------------
const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function supaSelect(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SUPA_HEADERS });
  if (!r.ok) throw new Error(`select ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function supaUpsert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}
async function supaInsert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${await r.text()}`);
}
async function supaDelete(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: SUPA_HEADERS,
  });
  if (!r.ok) throw new Error(`delete ${table}: ${r.status} ${await r.text()}`);
}

// --- Google JWT auth ----------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s/g, '');
  return Buffer.from(b64, 'base64');
}

let cachedToken = null;
async function getGoogleToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const toSign = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(SA.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, Buffer.from(toSign));
  const jwt = `${toSign}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`google token: ${res.status} ${await res.text()}`);
  const j = await res.json();
  cachedToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cachedToken.token;
}

// --- Drive helpers ------------------------------------------
async function listDriveFiles(token) {
  const files = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`drive list: ${r.status} ${await r.text()}`);
    const j = await r.json();
    files.push(...(j.files ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadDriveText(token, file) {
  const auth = { Authorization: `Bearer ${token}` };
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
      { headers: auth }
    );
    if (!r.ok) throw new Error(`export ${file.name}: ${r.status}`);
    return r.text();
  }
  if (file.mimeType === 'text/plain' || file.mimeType === 'text/markdown') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: auth }
    );
    if (!r.ok) throw new Error(`download ${file.name}: ${r.status}`);
    return r.text();
  }
  if (file.mimeType === 'application/pdf') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: auth }
    );
    if (!r.ok) throw new Error(`pdf ${file.name}: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const text = buf.toString('latin1');
    const out = [];
    const re = /\(([^()\\]{2,})\)\s*Tj/g;
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

// --- Chunk + embed -------------------------------------------
function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const lastBreak = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! ')
      );
      if (lastBreak > size * 0.5) end = i + lastBreak + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter((c) => c.length > 30);
}

async function embedBatch(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!r.ok) throw new Error(`embed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data.map((d) => d.embedding);
}

// --- Sync principal -----------------------------------------
async function main() {
  console.log('🌿 Sync de knowledge base SAVIAS\n');

  const token = await getGoogleToken();
  const driveFiles = await listDriveFiles(token);
  console.log(`📂 ${driveFiles.length} archivos en Drive\n`);

  const dbDocs = await supaSelect('kb_documents', 'select=id,modified_time,name');
  const dbMap = new Map(dbDocs.map((d) => [d.id, d]));
  const driveIds = new Set(driveFiles.map((f) => f.id));

  const summary = { updated: 0, skipped: 0, deleted: 0, errors: 0, totalChunks: 0 };

  for (const file of driveFiles) {
    if (!SUPPORTED_MIMES.has(file.mimeType)) {
      console.log(`⏭  ${file.name} (mime no soportado: ${file.mimeType})`);
      summary.skipped++;
      continue;
    }
    const existing = dbMap.get(file.id);
    if (existing && new Date(existing.modified_time).getTime() >= new Date(file.modifiedTime).getTime()) {
      console.log(`✓  ${file.name} (sin cambios)`);
      summary.skipped++;
      continue;
    }
    try {
      console.log(`⟳  ${file.name} ...`);
      const text = await downloadDriveText(token, file);
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        console.log(`   (vacío, skip)`);
        summary.skipped++;
        continue;
      }

      await supaDelete('kb_chunks', `document_id=eq.${file.id}`);

      // Embed en batch (local no tiene problema de memoria)
      const embeds = await embedBatch(chunks);

      await supaUpsert('kb_documents', [{
        id: file.id,
        name: file.name,
        mime_type: file.mimeType,
        modified_time: file.modifiedTime,
        synced_at: new Date().toISOString(),
        chunk_count: chunks.length,
      }]);

      // Insert chunks (embedding como string pgvector)
      const rows = chunks.map((content, idx) => ({
        document_id: file.id,
        chunk_index: idx,
        content,
        embedding: `[${embeds[idx].join(',')}]`,
      }));
      for (let i = 0; i < rows.length; i += 50) {
        await supaInsert('kb_chunks', rows.slice(i, i + 50));
      }

      console.log(`   ✓ ${chunks.length} chunks embebidos`);
      summary.updated++;
      summary.totalChunks += chunks.length;
    } catch (err) {
      console.error(`   ✗ ERROR: ${err.message}`);
      summary.errors++;
    }
  }

  // Borrar docs que ya no están en Drive
  for (const doc of dbDocs) {
    if (!driveIds.has(doc.id)) {
      console.log(`🗑  Borrando ${doc.name} (ya no está en Drive)`);
      await supaDelete('kb_chunks', `document_id=eq.${doc.id}`);
      await supaDelete('kb_documents', `id=eq.${doc.id}`);
      summary.deleted++;
    }
  }

  console.log('\n📊 Resumen:');
  console.log(`   Actualizados: ${summary.updated}`);
  console.log(`   Sin cambios:  ${summary.skipped}`);
  console.log(`   Borrados:     ${summary.deleted}`);
  console.log(`   Errores:      ${summary.errors}`);
  console.log(`   Total chunks: ${summary.totalChunks}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});

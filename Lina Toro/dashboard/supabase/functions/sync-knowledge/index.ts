// Supabase Edge Function: sync-knowledge
// Lee carpeta de Google Drive → chunkea → embed (OpenAI) → upsert vía REST a Supabase.
// Usa fetch puro (sin @supabase/supabase-js) para minimizar memoria/CPU en cold start.
//
// Procesa máximo 3 archivos por invocación (configurable con ?max=N) para encajar
// en los límites del worker. La primera sincronización requiere lanzar el curl
// varias veces hasta que devuelva 0 archivos pendientes. El cron horario se
// encarga del mantenimiento.
//
// Secrets requeridos:
//   GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID,
//   OPENAI_API_KEY, SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto)

// Sin imports de std — usamos Deno.serve nativo (más liviano)

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SA_JSON_RAW    = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '';
const FOLDER_ID      = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID') ?? '';

const EMBED_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 10;
const DEFAULT_MAX_FILES_PER_RUN = 3;

const SUPPORTED_MIMES = new Set([
  'application/vnd.google-apps.document',
  'text/plain',
  'text/markdown',
  'application/pdf',
]);

// ---------- Supabase REST helpers ----------------------------
const SUPA_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function supaSelect<T = any>(table: string, query: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: SUPA_HEADERS,
  });
  if (!r.ok) throw new Error(`select ${table}: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function supaUpsert(table: string, rows: any[], onConflict?: string) {
  const params = onConflict ? `?on_conflict=${onConflict}` : '';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}

async function supaInsert(table: string, rows: any[]) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${await r.text()}`);
}

async function supaDelete(table: string, query: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: SUPA_HEADERS,
  });
  if (!r.ok) throw new Error(`delete ${table}: ${r.status} ${await r.text()}`);
}

// ---------- Google JWT auth ----------------------------------
function base64urlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  if (!SA_JSON_RAW) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurada');
  const sa = JSON.parse(SA_JSON_RAW);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const toSign = `${headerB64}.${payloadB64}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(toSign),
  );
  const jwt = `${toSign}.${base64urlEncode(sigBuf)}`;

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

// ---------- Google Drive helpers -----------------------------
type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string };

type DriveFileFull = DriveFile & { size?: string };

async function listDriveFiles(token: string, folderId: string): Promise<DriveFileFull[]> {
  const files: DriveFileFull[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
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

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB hard cap per archivo

async function downloadDriveText(token: string, file: DriveFile): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
      { headers: auth },
    );
    if (!r.ok) throw new Error(`export ${file.name}: ${r.status}`);
    return await r.text();
  }
  if (file.mimeType === 'text/plain' || file.mimeType === 'text/markdown') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: auth },
    );
    if (!r.ok) throw new Error(`download ${file.name}: ${r.status}`);
    return await r.text();
  }
  if (file.mimeType === 'application/pdf') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: auth },
    );
    if (!r.ok) throw new Error(`pdf ${file.name}: ${r.status}`);
    return extractPdfText(new Uint8Array(await r.arrayBuffer()));
  }
  return '';
}

function extractPdfText(buf: Uint8Array): string {
  const text = new TextDecoder('latin1').decode(buf);
  const out: string[] = [];
  const re = /\(([^()\\]{2,})\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// ---------- Chunking + embeddings ----------------------------
function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const lastBreak = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! '),
      );
      if (lastBreak > size * 0.5) end = i + lastBreak + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter((c) => c.length > 30);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!r.ok) throw new Error(`embed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding);
}

// ---------- Sync de un solo archivo --------------------------
async function syncOne(
  token: string,
  file: DriveFileFull,
): Promise<{ status: 'updated' | 'skipped' | 'unsupported' | 'too_large'; chunks?: number }> {
  if (!SUPPORTED_MIMES.has(file.mimeType)) return { status: 'unsupported' };
  if (file.size && parseInt(file.size, 10) > MAX_FILE_SIZE_BYTES) return { status: 'too_large' };

  console.log(`[${file.name}] download start`);
  const text = await downloadDriveText(token, file);
  console.log(`[${file.name}] downloaded ${text.length} chars`);

  const chunks = chunkText(text);
  console.log(`[${file.name}] chunked into ${chunks.length} chunks`);
  if (chunks.length === 0) return { status: 'skipped' };

  await supaDelete('kb_chunks', `document_id=eq.${file.id}`);
  console.log(`[${file.name}] old chunks deleted`);

  // Embed UNO por UNO (en vez de batch) para minimizar memoria
  const allEmbeds: number[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[${file.name}] embedding ${i + 1}/${chunks.length}`);
    const e = await embedBatch([chunks[i]]);
    allEmbeds.push(e[0]);
  }
  console.log(`[${file.name}] all embeddings done`);

  await supaUpsert(
    'kb_documents',
    [{
      id: file.id,
      name: file.name,
      mime_type: file.mimeType,
      modified_time: file.modifiedTime,
      synced_at: new Date().toISOString(),
      chunk_count: chunks.length,
    }],
    'id',
  );
  console.log(`[${file.name}] doc upserted`);

  // Insert chunks UNO por UNO con embedding como string pgvector
  for (let i = 0; i < chunks.length; i++) {
    const embeddingStr = `[${allEmbeds[i].join(',')}]`;
    await supaInsert('kb_chunks', [{
      document_id: file.id,
      chunk_index: i,
      content: chunks[i],
      embedding: embeddingStr,
    }]);
    console.log(`[${file.name}] chunk ${i + 1}/${chunks.length} inserted`);
  }

  return { status: 'updated', chunks: chunks.length };
}

// ---------- Entry point --------------------------------------
Deno.serve(async (req) => {
  try {
    if (!FOLDER_ID) return jsonRes({ error: 'GOOGLE_DRIVE_FOLDER_ID not set' }, 500);
    if (!OPENAI_API_KEY) return jsonRes({ error: 'OPENAI_API_KEY not set' }, 500);

    const url = new URL(req.url);
    const max = parseInt(url.searchParams.get('max') ?? String(DEFAULT_MAX_FILES_PER_RUN), 10);
    const onlyFileId = url.searchParams.get('fileId') ?? undefined;
    const listOnly = url.searchParams.get('listOnly') === 'true';

    const token = await getGoogleAccessToken();
    const driveFiles = await listDriveFiles(token, FOLDER_ID);

    if (listOnly) {
      return jsonRes({
        ok: true,
        count: driveFiles.length,
        files: driveFiles.map((f) => ({
          name: f.name,
          mimeType: f.mimeType,
          sizeKB: f.size ? Math.round(parseInt(f.size, 10) / 1024) : 'n/a (Google Doc)',
          modified: f.modifiedTime,
          supported: SUPPORTED_MIMES.has(f.mimeType),
        })),
      });
    }

    // Estado actual en BD
    const dbDocs = await supaSelect<{ id: string; modified_time: string; name: string }>(
      'kb_documents', 'select=id,modified_time,name',
    );
    const dbMap = new Map(dbDocs.map((d) => [d.id, d]));
    const driveIds = new Set(driveFiles.map((f) => f.id));

    // Determinar qué archivos hay que procesar
    const pending = driveFiles.filter((f) => {
      if (onlyFileId && f.id !== onlyFileId) return false;
      const existing = dbMap.get(f.id);
      if (!existing) return true; // nuevo
      return new Date(existing.modified_time).getTime() < new Date(f.modifiedTime).getTime();
    });

    const toProcess = pending.slice(0, max);
    const summary: Array<{ name: string; status: string; chunks?: number; error?: string }> = [];

    for (const file of toProcess) {
      try {
        const r = await syncOne(token, file);
        summary.push({ name: file.name, status: r.status, chunks: r.chunks });
      } catch (err) {
        console.error(`fail ${file.name}:`, err);
        summary.push({
          name: file.name, status: 'error',
          error: String((err as Error)?.message ?? err),
        });
      }
    }

    // Borrar documentos que ya no están en Drive (solo si no es modo single-file)
    let deletedCount = 0;
    if (!onlyFileId) {
      for (const doc of dbDocs) {
        if (!driveIds.has(doc.id)) {
          await supaDelete('kb_chunks', `document_id=eq.${doc.id}`);
          await supaDelete('kb_documents', `id=eq.${doc.id}`);
          summary.push({ name: doc.name, status: 'deleted' });
          deletedCount++;
        }
      }
    }

    return jsonRes({
      ok: true,
      total_in_drive: driveFiles.length,
      pending_before: pending.length,
      processed_now: toProcess.length,
      remaining: pending.length - toProcess.length,
      deleted: deletedCount,
      summary,
    });
  } catch (err) {
    console.error('sync-knowledge error', err);
    return jsonRes({ error: String((err as Error)?.message ?? err) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

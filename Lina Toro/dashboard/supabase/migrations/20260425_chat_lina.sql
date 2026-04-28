-- ============================================================
--  Universo Lina · Chat IA + Knowledge Base (pgvector + Drive)
-- ============================================================
--  Pegar UNA SOLA VEZ en Supabase → SQL Editor → Run.
--  Crea: extensiones, tablas KB y chat, función de búsqueda
--        semántica, RLS, y el cron horario para sync de Drive.
-- ============================================================

create extension if not exists vector;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- Knowledge base ----------------------------------
create table if not exists public.kb_documents (
  id            text primary key,                -- Drive fileId
  name          text not null,
  mime_type     text not null,
  modified_time timestamptz not null,
  synced_at     timestamptz not null default now(),
  chunk_count   int not null default 0
);

create table if not exists public.kb_chunks (
  id           bigserial primary key,
  document_id  text not null references public.kb_documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(1536) not null,            -- text-embedding-3-small
  created_at   timestamptz not null default now()
);

create index if not exists kb_chunks_doc_idx
  on public.kb_chunks(document_id);

create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------- Conversaciones / mensajes -----------------------
create table if not exists public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id              bigserial primary key,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists chat_conv_user_idx
  on public.chat_conversations(user_id, updated_at desc);
create index if not exists chat_msg_conv_idx
  on public.chat_messages(conversation_id, created_at);

-- ---------- Función de búsqueda semántica -------------------
create or replace function public.match_kb_chunks(
  query_embedding vector(1536),
  match_count     int default 5
) returns table (
  content    text,
  doc_name   text,
  similarity float
) language sql stable as $$
  select
    c.content,
    d.name as doc_name,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- RLS ---------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "own conversations"     on public.chat_conversations;
drop policy if exists "insert own conv"       on public.chat_conversations;
drop policy if exists "update own conv"       on public.chat_conversations;
drop policy if exists "delete own conv"       on public.chat_conversations;
drop policy if exists "own messages"          on public.chat_messages;
drop policy if exists "insert own messages"   on public.chat_messages;

create policy "own conversations" on public.chat_conversations
  for select using (auth.uid() = user_id);
create policy "insert own conv" on public.chat_conversations
  for insert with check (auth.uid() = user_id);
create policy "update own conv" on public.chat_conversations
  for update using (auth.uid() = user_id);
create policy "delete own conv" on public.chat_conversations
  for delete using (auth.uid() = user_id);

create policy "own messages" on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );
create policy "insert own messages" on public.chat_messages
  for insert with check (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- KB queda sin RLS porque solo se lee desde la Edge Function
-- (con service-role) o vía RPC pública match_kb_chunks.
alter table public.kb_documents disable row level security;
alter table public.kb_chunks    disable row level security;

-- ---------- Cron: sync Drive cada hora ----------------------
-- La función fue desplegada con --no-verify-jwt, así que no necesita
-- Authorization header. Internamente usa el service role inyectado.

select cron.unschedule('sync-knowledge-hourly')
where exists (select 1 from cron.job where jobname = 'sync-knowledge-hourly');

select cron.schedule(
  'sync-knowledge-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://cojwzekyeehqtxdvoldj.supabase.co/functions/v1/sync-knowledge',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

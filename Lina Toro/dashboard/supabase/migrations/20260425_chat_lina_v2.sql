-- ============================================================
--  Universo Lina · Chat IA + RAG (esquema compatible n8n + LangChain)
-- ============================================================
--  REEMPLAZA la migración anterior. Esta versión usa el esquema
--  estándar de @n8n/n8n-nodes-langchain.vectorStoreSupabase
--  (table=documents, function=match_documents) para que el
--  workflow de n8n funcione plug-and-play.
-- ============================================================

create extension if not exists vector;

-- ---------- Limpieza de esquema viejo ------------------------
drop function if exists public.match_kb_chunks(vector(1536), int);
drop table if exists public.kb_chunks;
drop table if exists public.kb_documents;

-- ---------- Tabla principal de vectores ---------------------
create table if not exists public.documents (
  id        bigserial primary key,
  content   text,                  -- Document.pageContent
  metadata  jsonb,                 -- Document.metadata (incluye file_id, file_title, file_url)
  embedding vector(1536)           -- text-embedding-3-small
);

create index if not exists documents_embedding_idx
  on public.documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists documents_metadata_file_id_idx
  on public.documents using gin ((metadata -> 'file_id'));

-- ---------- Tabla de metadatos de archivos ------------------
create table if not exists public.document_metadata (
  id         text primary key,
  title      text,
  url        text,
  created_at timestamp default now(),
  schema     text
);

-- ---------- Función de búsqueda semántica -------------------
create or replace function public.match_documents (
  query_embedding vector(1536),
  match_count     int default null,
  filter          jsonb default '{}'
) returns table (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity float
) language plpgsql as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ---------- Conversaciones del chat (sin cambios) -----------
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

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "own conversations"   on public.chat_conversations;
drop policy if exists "insert own conv"     on public.chat_conversations;
drop policy if exists "update own conv"     on public.chat_conversations;
drop policy if exists "delete own conv"     on public.chat_conversations;
drop policy if exists "own messages"        on public.chat_messages;
drop policy if exists "insert own messages" on public.chat_messages;

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
    exists (select 1 from public.chat_conversations c
            where c.id = chat_messages.conversation_id and c.user_id = auth.uid())
  );
create policy "insert own messages" on public.chat_messages
  for insert with check (
    exists (select 1 from public.chat_conversations c
            where c.id = chat_messages.conversation_id and c.user_id = auth.uid())
  );

-- ---------- Cron viejo: eliminar (n8n se encarga del sync) --
select cron.unschedule('sync-knowledge-hourly')
where exists (select 1 from cron.job where jobname = 'sync-knowledge-hourly');

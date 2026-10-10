-- Universo de La Huerta LAB · historial del asistente Tierra
--
-- Solo hace falta si se activa el backend (SUPABASE_URL en la página).
-- Sin estas tablas la edge function sigue respondiendo: guarda el historial
-- si puede y, si no, lo omite. Las cuentas las gestiona Supabase Auth.

create extension if not exists "pgcrypto";

create table if not exists public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists chat_conversations_user_idx
  on public.chat_conversations (user_id, updated_at desc);
create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

-- RLS: cada persona ve solo lo suyo. Sin esto, cualquier usuario autenticado
-- leería las conversaciones de los demás.
alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists "conversaciones propias" on public.chat_conversations;
create policy "conversaciones propias"
  on public.chat_conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mensajes de mis conversaciones" on public.chat_messages;
create policy "mensajes de mis conversaciones"
  on public.chat_messages
  for all
  using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

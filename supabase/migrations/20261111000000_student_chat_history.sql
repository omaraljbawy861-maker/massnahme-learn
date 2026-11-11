-- Secure, persistent chat history for each authenticated student
create table if not exists public.study_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  assistant_gender text not null default 'female' check (assistant_gender in ('female','male')),
  language text not null default 'auto',
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 180),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists study_chat_sessions_user_started_idx
  on public.study_chat_sessions(user_id, started_at desc);

create table if not exists public.study_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists study_chat_messages_session_created_idx
  on public.study_chat_messages(session_id, created_at);

alter table public.study_chat_sessions enable row level security;
alter table public.study_chat_messages enable row level security;

drop policy if exists "Students manage own chat sessions" on public.study_chat_sessions;
create policy "Students manage own chat sessions" on public.study_chat_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Students manage own chat messages" on public.study_chat_messages;
create policy "Students manage own chat messages" on public.study_chat_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.study_chat_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.study_chat_sessions to authenticated;
grant select, insert, update, delete on public.study_chat_messages to authenticated;

-- English school records are private to each authenticated student.
create table if not exists public.english_school_records (
 user_id uuid primary key references auth.users(id) on delete cascade,
 school_data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.english_school_records enable row level security;
revoke all on table public.english_school_records from anon, authenticated;
grant select, insert, update, delete on table public.english_school_records to authenticated;
create policy "Students read own English school record" on public.english_school_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students insert own English school record" on public.english_school_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students update own English school record" on public.english_school_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Students delete own English school record" on public.english_school_records for delete to authenticated using ((select auth.uid()) = user_id);

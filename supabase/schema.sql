-- MAßNAHME LEARN: private per-student progress storage
-- Run this script in Supabase Dashboard > SQL Editor for the connected project.
create table if not exists public.student_progress (
  student_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{"completed":[],"scores":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.student_progress enable row level security;

drop policy if exists "Students can read their own progress" on public.student_progress;
create policy "Students can read their own progress" on public.student_progress
for select to authenticated using (auth.uid() = student_id);

drop policy if exists "Students can insert their own progress" on public.student_progress;
create policy "Students can insert their own progress" on public.student_progress
for insert to authenticated with check (auth.uid() = student_id);

drop policy if exists "Students can update their own progress" on public.student_progress;
create policy "Students can update their own progress" on public.student_progress
for update to authenticated using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- Authenticated students can use the table; row-level policies restrict each row to its owner.
revoke all on table public.student_progress from anon;
grant select, insert, update on table public.student_progress to authenticated;

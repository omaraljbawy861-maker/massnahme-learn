drop policy if exists "Students can read their own progress" on public.student_progress;
drop policy if exists "Students can insert their own progress" on public.student_progress;
drop policy if exists "Students can update their own progress" on public.student_progress;
create policy "Students can read their own progress" on public.student_progress for select to authenticated using ((select auth.uid()) = student_id);
create policy "Students can insert their own progress" on public.student_progress for insert to authenticated with check ((select auth.uid()) = student_id);
create policy "Students can update their own progress" on public.student_progress for update to authenticated using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);
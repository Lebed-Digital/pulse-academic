create table public.checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  focus text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  root_check_id uuid,
  participant_ids uuid[] not null,
  unique (id, class_id),
  foreign key (root_check_id, class_id) references public.checks(id, class_id) on delete cascade
);
create index checks_class_started_idx on public.checks (class_id, started_at desc);

create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  check_id uuid not null references public.checks(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  result text check (result in ('got-it', 'almost', 'needs-help', 'absent')),
  note text,
  created_at timestamptz not null default now(),
  unique (check_id, student_id)
);

-- Phase 0: this schema's default privileges auto-grant anon and authenticated ALL
-- (including TRUNCATE, which bypasses RLS) on every new table. Strip them first.
revoke all on public.checks, public.check_results from anon, authenticated;
grant select, insert, update, delete on public.checks to authenticated;
grant select, insert, update, delete on public.checks to service_role;
grant select, insert, update, delete on public.check_results to authenticated;
grant select, insert, update, delete on public.check_results to service_role;
alter table public.checks enable row level security;
alter table public.check_results enable row level security;

create policy checks_select on public.checks for select to authenticated
  using (user_id = (select auth.uid()));
create policy checks_insert on public.checks for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.classes c where c.id = class_id and c.user_id = (select auth.uid())));
-- Only open checks change (focus edit, Done for now). Ended checks are read-only.
create policy checks_update_open on public.checks for update to authenticated
  using (user_id = (select auth.uid()) and ended_at is null)
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.classes c where c.id = class_id and c.user_id = (select auth.uid())));

create policy check_results_select on public.check_results for select to authenticated
  using (user_id = (select auth.uid()));
create policy check_results_insert_open on public.check_results for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.checks k where k.id = check_id and k.user_id = (select auth.uid()) and k.ended_at is null)
    and exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())));
create policy check_results_update_open on public.check_results for update to authenticated
  using (user_id = (select auth.uid())
    and exists (select 1 from public.checks k where k.id = check_id and k.ended_at is null))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.checks k where k.id = check_id and k.user_id = (select auth.uid()) and k.ended_at is null)
    and exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())));

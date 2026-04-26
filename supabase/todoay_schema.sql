create table if not exists public.todoay_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.todoay_snapshots enable row level security;

drop policy if exists "Users can read their own Todoay snapshot" on public.todoay_snapshots;
create policy "Users can read their own Todoay snapshot"
on public.todoay_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own Todoay snapshot" on public.todoay_snapshots;
create policy "Users can insert their own Todoay snapshot"
on public.todoay_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Todoay snapshot" on public.todoay_snapshots;
create policy "Users can update their own Todoay snapshot"
on public.todoay_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Todoay snapshot" on public.todoay_snapshots;
create policy "Users can delete their own Todoay snapshot"
on public.todoay_snapshots
for delete
to authenticated
using ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todoay_snapshots'
  ) then
    alter publication supabase_realtime add table public.todoay_snapshots;
  end if;
end
$$;

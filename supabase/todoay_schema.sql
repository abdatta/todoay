create table if not exists public.todoay_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.todoay_snapshot_commits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  revision bigint not null,
  state jsonb not null default '{}'::jsonb,
  source jsonb not null default '{}'::jsonb,
  reason text not null default 'sync',
  restored_from_revision bigint,
  task_count integer not null default 0,
  note_count integer not null default 0,
  thread_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists todoay_snapshot_commits_user_created_idx
on public.todoay_snapshot_commits (user_id, created_at desc);

create unique index if not exists todoay_snapshot_commits_user_revision_idx
on public.todoay_snapshot_commits (user_id, revision);

alter table public.todoay_snapshot_commits
drop constraint if exists todoay_snapshot_commits_reason_check;

alter table public.todoay_snapshot_commits
add constraint todoay_snapshot_commits_reason_check
check (reason in ('sync', 'restore', 'revert'));

alter table public.todoay_snapshots enable row level security;
alter table public.todoay_snapshot_commits enable row level security;

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

drop policy if exists "Users can read their own Todoay history" on public.todoay_snapshot_commits;
create policy "Users can read their own Todoay history"
on public.todoay_snapshot_commits
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own Todoay history" on public.todoay_snapshot_commits;
create policy "Users can insert their own Todoay history"
on public.todoay_snapshot_commits
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Todoay history" on public.todoay_snapshot_commits;
create policy "Users can delete their own Todoay history"
on public.todoay_snapshot_commits
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop function if exists public.todoay_write_snapshot_commit(
  jsonb,
  jsonb,
  text,
  bigint,
  integer,
  integer,
  integer,
  timestamptz
);

create or replace function public.todoay_write_snapshot_commit(
  p_state jsonb,
  p_source jsonb,
  p_reason text default 'sync',
  p_restored_from_revision bigint default null,
  p_task_count integer default 0,
  p_note_count integer default 0,
  p_thread_count integer default 0,
  p_created_at timestamptz default timezone('utc', now())
)
returns table (
  snapshot_revision bigint,
  snapshot_updated_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_updated_at timestamptz := coalesce(p_created_at, timezone('utc', now()));
begin
  if v_user_id is null then
    raise exception 'Todoay snapshot writes require an authenticated user.';
  end if;

  if p_reason not in ('sync', 'restore', 'revert') then
    raise exception 'Unsupported Todoay snapshot commit reason: %', p_reason;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select coalesce(todoay_snapshots.revision, 0) + 1
  into v_revision
  from public.todoay_snapshots
  where todoay_snapshots.user_id = v_user_id
  for update;

  if v_revision is null then
    v_revision := 1;
  end if;

  insert into public.todoay_snapshots (
    user_id,
    state,
    revision,
    updated_at
  )
  values (
    v_user_id,
    p_state,
    v_revision,
    v_updated_at
  )
  on conflict (user_id)
  do update set
    state = excluded.state,
    revision = excluded.revision,
    updated_at = excluded.updated_at;

  insert into public.todoay_snapshot_commits (
    user_id,
    revision,
    state,
    source,
    reason,
    restored_from_revision,
    task_count,
    note_count,
    thread_count,
    created_at
  )
  values (
    v_user_id,
    v_revision,
    p_state,
    coalesce(p_source, '{}'::jsonb),
    p_reason,
    p_restored_from_revision,
    greatest(coalesce(p_task_count, 0), 0),
    greatest(coalesce(p_note_count, 0), 0),
    greatest(coalesce(p_thread_count, 0), 0),
    v_updated_at
  );

  delete from public.todoay_snapshot_commits
  where user_id = v_user_id
    and created_at < v_updated_at - interval '30 days';

  delete from public.todoay_snapshot_commits
  where id in (
    select id
    from (
      select
        id,
        row_number() over (
          partition by user_id
          order by created_at desc, revision desc, id desc
        ) as commit_rank
      from public.todoay_snapshot_commits
      where user_id = v_user_id
    ) ranked_commits
    where commit_rank > 100
  );

  snapshot_revision := v_revision;
  snapshot_updated_at := v_updated_at;
  return next;
end;
$$;

revoke all on function public.todoay_write_snapshot_commit(
  jsonb,
  jsonb,
  text,
  bigint,
  integer,
  integer,
  integer,
  timestamptz
) from public;

grant execute on function public.todoay_write_snapshot_commit(
  jsonb,
  jsonb,
  text,
  bigint,
  integer,
  integer,
  integer,
  timestamptz
) to authenticated;

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

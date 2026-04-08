create extension if not exists pgcrypto;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  name text not null,
  description text not null default '',
  plan text not null default 'free' check (plan in ('free', 'team', 'enterprise')),
  created_at bigint not null,
  last_modified bigint not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.patent_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null default '',
  status text not null default 'disclosure_collecting' check (
    status in (
      'disclosure_collecting',
      'disclosure_review',
      'drafting',
      'editing',
      'ready_to_submit'
    )
  ),
  patent_type text check (patent_type is null or patent_type in ('invention', 'utility')),
  technical_field text,
  created_at bigint not null,
  last_modified bigint not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists organizations_owner_id_idx
  on public.organizations (owner_id);

create index if not exists organizations_last_modified_idx
  on public.organizations (last_modified desc);

create index if not exists patent_projects_user_id_idx
  on public.patent_projects (user_id);

create index if not exists patent_projects_organization_id_idx
  on public.patent_projects (organization_id);

create index if not exists patent_projects_last_modified_idx
  on public.patent_projects (last_modified desc);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_row_updated_at();

drop trigger if exists patent_projects_set_updated_at on public.patent_projects;
create trigger patent_projects_set_updated_at
before update on public.patent_projects
for each row
execute function public.set_row_updated_at();

alter table public.organizations enable row level security;
alter table public.patent_projects enable row level security;

drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own
on public.organizations
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists organizations_insert_own on public.organizations;
create policy organizations_insert_own
on public.organizations
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists organizations_update_own on public.organizations;
create policy organizations_update_own
on public.organizations
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists organizations_delete_own on public.organizations;
create policy organizations_delete_own
on public.organizations
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists patent_projects_select_owned on public.patent_projects;
create policy patent_projects_select_owned
on public.patent_projects
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organizations
    where organizations.id = patent_projects.organization_id
      and organizations.owner_id = auth.uid()
  )
);

drop policy if exists patent_projects_insert_owned on public.patent_projects;
create policy patent_projects_insert_owned
on public.patent_projects
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organizations
    where organizations.id = patent_projects.organization_id
      and organizations.owner_id = auth.uid()
  )
);

drop policy if exists patent_projects_update_owned on public.patent_projects;
create policy patent_projects_update_owned
on public.patent_projects
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organizations
    where organizations.id = patent_projects.organization_id
      and organizations.owner_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organizations
    where organizations.id = patent_projects.organization_id
      and organizations.owner_id = auth.uid()
  )
);

drop policy if exists patent_projects_delete_owned on public.patent_projects;
create policy patent_projects_delete_owned
on public.patent_projects
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organizations
    where organizations.id = patent_projects.organization_id
      and organizations.owner_id = auth.uid()
  )
);
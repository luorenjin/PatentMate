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
  plan text not null default 'free' check (plan in ('free', 'basic', 'pro', 'enterprise')),
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

create table if not exists public.subscription_plan_catalog (
  plan_key text not null,
  display_name text not null,
  price_label text not null default '',
  price_amount integer,
  currency text not null default 'CNY',
  billing_interval text not null default 'month' check (
    billing_interval in ('month', 'year', 'custom')
  ),
  subtitle text not null default '',
  description text not null default '',
  badge text not null default '',
  features text[] not null default '{}',
  allowed_roles text[] not null default '{}',
  resources jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (plan_key)
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

create index if not exists subscription_plan_catalog_sort_idx
  on public.subscription_plan_catalog (sort_order, plan_key);

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

drop trigger if exists subscription_plan_catalog_set_updated_at on public.subscription_plan_catalog;
create trigger subscription_plan_catalog_set_updated_at
before update on public.subscription_plan_catalog
for each row
execute function public.set_row_updated_at();

alter table public.organizations enable row level security;
alter table public.patent_projects enable row level security;
alter table public.subscription_plan_catalog enable row level security;

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

drop policy if exists subscription_plan_catalog_select_all on public.subscription_plan_catalog;
create policy subscription_plan_catalog_select_all
on public.subscription_plan_catalog
for select
to authenticated, anon
using (true);

insert into public.subscription_plan_catalog (
  plan_key,
  display_name,
  price_label,
  price_amount,
  currency,
  billing_interval,
  subtitle,
  description,
  badge,
  features,
  allowed_roles,
  resources,
  is_active,
  sort_order,
  payload
)
values
  (
    'free',
    'Free',
    '¥0 / 月',
    0,
    'CNY',
    'month',
    '适合个人试用与基础协作',
    '覆盖交底、评估与基础撰写流程，AI配额较低。',
    '入门',
    array['个人或小团队起步使用', '每月 50 次 AI 调用', '组织成员 3 席上限'],
    array['owner', 'member'],
    jsonb_build_array(
      jsonb_build_object(
        'key', 'organization.members',
        'label', '成员席位',
        'description', '组织中可占用的总成员数量。',
        'unit', '席',
        'limit', 3,
        'limitLabel', '3 席',
        'usageMetric', 'organization.members.total'
      ),
      jsonb_build_object(
        'key', 'organization.admins',
        'label', '管理员配额',
        'description', '可分配 owner 或 admin 的人数上限。',
        'unit', '位',
        'limit', 1,
        'limitLabel', '1 位',
        'usageMetric', 'organization.members.admin'
      ),
      jsonb_build_object(
        'key', 'ai.monthly_calls',
        'label', 'AI 调用配额',
        'description', '每月可发起的 AI 生成请求次数。',
        'unit', '次/月',
        'limit', 50,
        'limitLabel', '50 次 / 月',
        'usageMetric', 'user.ai.calls.monthly'
      )
    ),
    true,
    0,
    '{}'::jsonb
  ),
  (
    'basic',
    'Basic',
    '¥99 / 月',
    9900,
    'CNY',
    'month',
    '适合常规个人使用',
    '覆盖更高频的 AI 调用需求。',
    '进阶',
    array['每月 500 次 AI 调用', '标准 AI 模型', '优先支持', '数据导出'],
    array['owner', 'admin', 'member', 'viewer'],
    jsonb_build_array(
      jsonb_build_object(
        'key', 'organization.members',
        'label', '成员席位',
        'description', '组织中可占用的总成员数量。',
        'unit', '席',
        'limit', 5,
        'limitLabel', '5 席',
        'usageMetric', 'organization.members.total'
      ),
      jsonb_build_object(
        'key', 'organization.admins',
        'label', '管理员配额',
        'description', '可分配 owner 或 admin 的人数上限。',
        'unit', '位',
        'limit', 2,
        'limitLabel', '2 位',
        'usageMetric', 'organization.members.admin'
      ),
      jsonb_build_object(
        'key', 'ai.monthly_calls',
        'label', 'AI 调用配额',
        'description', '每月可发起的 AI 生成请求次数。',
        'unit', '次/月',
        'limit', 500,
        'limitLabel', '500 次 / 月',
        'usageMetric', 'user.ai.calls.monthly'
      )
    ),
    true,
    1,
    '{}'::jsonb
  ),
  (
    'pro',
    'Pro',
    '¥299 / 月',
    29900,
    'CNY',
    'month',
    '适合高频 AI 写作团队',
    '为协作型团队提供高配额 AI 及核心团队能力。',
    '推荐',
    array['每月 2000 次高级 AI 调用', '包含 10 个成员席位', '优先队列及团队协作管理'],
    array['owner', 'admin', 'member', 'viewer'],
    jsonb_build_array(
      jsonb_build_object(
        'key', 'organization.members',
        'label', '成员席位',
        'description', '组织中可占用的总成员数量。',
        'unit', '席',
        'limit', 10,
        'limitLabel', '10 席',
        'usageMetric', 'organization.members.total'
      ),
      jsonb_build_object(
        'key', 'organization.admins',
        'label', '管理员配额',
        'description', '可分配 owner 或 admin 的人数上限。',
        'unit', '位',
        'limit', 3,
        'limitLabel', '3 位',
        'usageMetric', 'organization.members.admin'
      ),
      jsonb_build_object(
        'key', 'ai.monthly_calls',
        'label', 'AI 调用配额',
        'description', '每月可发起的 AI 生成请求次数。',
        'unit', '次/月',
        'limit', 2000,
        'limitLabel', '2000 次 / 月',
        'usageMetric', 'user.ai.calls.monthly'
      )
    ),
    true,
    2,
    '{}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    '定制报价',
    null,
    'CNY',
    'custom',
    '适合企业级定制接入',
    '面向多角色、多项目与长期治理需求，适配企业实施场景。',
    '旗舰',
    array['全量资源无上限', '无限专属客户经理', '定制化服务与私有部署'],
    array['owner', 'admin', 'member', 'viewer'],
    jsonb_build_array(
      jsonb_build_object(
        'key', 'organization.members',
        'label', '成员席位',
        'description', '组织中可占用的总成员数量。',
        'unit', '席',
        'limit', null,
        'limitLabel', '不限',
        'usageMetric', 'organization.members.total'
      ),
      jsonb_build_object(
        'key', 'organization.admins',
        'label', '管理员配额',
        'description', '可分配 owner 或 admin 的人数上限。',
        'unit', '位',
        'limit', null,
        'limitLabel', '不限',
        'usageMetric', 'organization.members.admin'
      ),
      jsonb_build_object(
        'key', 'ai.monthly_calls',
        'label', 'AI 调用配额',
        'description', '每月可发起的 AI 生成请求次数。',
        'unit', '次/月',
        'limit', null,
        'limitLabel', '不限',
        'usageMetric', 'user.ai.calls.monthly'
      )
    ),
    true,
    3,
    '{}'::jsonb
  )
on conflict (plan_key) do update
set
  display_name = excluded.display_name,
  price_label = excluded.price_label,
  price_amount = excluded.price_amount,
  currency = excluded.currency,
  billing_interval = excluded.billing_interval,
  subtitle = excluded.subtitle,
  description = excluded.description,
  badge = excluded.badge,
  features = excluded.features,
  allowed_roles = excluded.allowed_roles,
  resources = excluded.resources,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  payload = excluded.payload,
  updated_at = timezone('utc', now());
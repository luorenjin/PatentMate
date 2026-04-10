-- Migration: Create subscription_plan_catalog table for backend-configurable pricing and resource limits
-- Date: 2026-04-09
-- Purpose: Centralize subscription pricing, features, and resource constraints for organization plans and AI quotas

CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_plan_catalog'
      AND column_name = 'scope'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscription_plan_catalog_legacy_20260409'
  ) THEN
    ALTER TABLE public.subscription_plan_catalog
      RENAME TO subscription_plan_catalog_legacy_20260409;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.subscription_plan_catalog (
  plan_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  price_label TEXT NOT NULL DEFAULT '',
  price_amount INTEGER,
  currency TEXT NOT NULL DEFAULT 'CNY',
  billing_interval TEXT NOT NULL DEFAULT 'month' CHECK (
    billing_interval IN ('month', 'year', 'custom')
  ),
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  features TEXT[] NOT NULL DEFAULT '{}',
  allowed_roles TEXT[] NOT NULL DEFAULT '{}',
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (plan_key)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_catalog_sort
ON public.subscription_plan_catalog(sort_order, plan_key);

DROP TRIGGER IF EXISTS subscription_plan_catalog_set_updated_at ON public.subscription_plan_catalog;
CREATE TRIGGER subscription_plan_catalog_set_updated_at
BEFORE UPDATE ON public.subscription_plan_catalog
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

ALTER TABLE public.subscription_plan_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plan_catalog_select_all ON public.subscription_plan_catalog;
CREATE POLICY subscription_plan_catalog_select_all
ON public.subscription_plan_catalog
FOR SELECT
TO authenticated, anon
USING (TRUE);

INSERT INTO public.subscription_plan_catalog (
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
VALUES
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
    ARRAY['个人或小团队起步使用', '每月 50 次 AI 调用', '组织成员 3 席上限'],
    ARRAY['owner', 'member'],
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
    TRUE,
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
    ARRAY['每月 500 次 AI 调用', '标准 AI 模型', '优先支持', '数据导出'],
    ARRAY['owner', 'admin', 'member', 'viewer'],
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
    TRUE,
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
    ARRAY['每月 2000 次高级 AI 调用', '包含 10 个成员席位', '优先队列及团队协作管理'],
    ARRAY['owner', 'admin', 'member', 'viewer'],
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
    TRUE,
    2,
    '{}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    '定制报价',
    NULL,
    'CNY',
    'custom',
    '适合企业级定制接入',
    '面向多角色、多项目与长期治理需求，适配企业实施场景。',
    '旗舰',
    ARRAY['全量资源无上限', '无限专属客户经理', '定制化服务与私有部署'],
    ARRAY['owner', 'admin', 'member', 'viewer'],
    jsonb_build_array(
      jsonb_build_object(
        'key', 'organization.members',
        'label', '成员席位',
        'description', '组织中可占用的总成员数量。',
        'unit', '席',
        'limit', NULL,
        'limitLabel', '不限',
        'usageMetric', 'organization.members.total'
      ),
      jsonb_build_object(
        'key', 'organization.admins',
        'label', '管理员配额',
        'description', '可分配 owner 或 admin 的人数上限。',
        'unit', '位',
        'limit', NULL,
        'limitLabel', '不限',
        'usageMetric', 'organization.members.admin'
      ),
      jsonb_build_object(
        'key', 'ai.monthly_calls',
        'label', 'AI 调用配额',
        'description', '每月可发起的 AI 生成请求次数。',
        'unit', '次/月',
        'limit', NULL,
        'limitLabel', '不限',
        'usageMetric', 'user.ai.calls.monthly'
      )
    ),
    TRUE,
    3,
    '{}'::jsonb
  )

ON CONFLICT (plan_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  price_label = EXCLUDED.price_label,
  price_amount = EXCLUDED.price_amount,
  currency = EXCLUDED.currency,
  billing_interval = EXCLUDED.billing_interval,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  badge = EXCLUDED.badge,
  features = EXCLUDED.features,
  allowed_roles = EXCLUDED.allowed_roles,
  resources = EXCLUDED.resources,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  payload = EXCLUDED.payload,
  updated_at = timezone('utc', now());

COMMENT ON TABLE public.subscription_plan_catalog IS 'Backend-configurable subscription pricing, resources, and plan constraints';
COMMENT ON COLUMN public.subscription_plan_catalog.price_amount IS 'Price amount in minor currency units, NULL means custom quote';
COMMENT ON COLUMN public.subscription_plan_catalog.resources IS 'JSON array of resource definitions and limits used for plan enforcement';
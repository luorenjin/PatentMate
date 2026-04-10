import type {
  PlanResourceDefinition,
  SubscriptionBillingInterval,
  SubscriptionPlanDefinition,
  SubscriptionPlan,
} from "../types";
import { supabase } from "./supabaseService";

const SUBSCRIPTION_PLAN_CATALOG_TABLE = "subscription_plan_catalog";
const SUBSCRIPTION_PLAN_CACHE_KEY = "patentmate_subscription_plan_catalog";
const SUBSCRIPTION_PLAN_CACHE_TTL_MS = 5 * 60 * 1000;
const SUBSCRIPTION_PLAN_KEYS = ["free", "basic", "pro", "enterprise"] as const;
const SUBSCRIPTION_BILLING_INTERVALS = ["month", "year", "custom"] as const;

interface SubscriptionPlanCatalogRow {
  plan_key: string;
  display_name: string;
  price_label: string;
  price_amount: number | null;
  currency: string;
  billing_interval: string;
  subtitle: string;
  description: string;
  badge: string;
  features: string[] | null;
  allowed_roles: string[] | null;
  resources: PlanResourceDefinition[] | null;
  sort_order: number;
  is_active: boolean;
  payload: Partial<SubscriptionPlanDefinition> | null;
}

const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanDefinition[] = [
  {
    key: "free",
    label: "Free",
    priceLabel: "¥0 / 月",
    priceAmount: 0,
    currency: "CNY",
    billingInterval: "month",
    subtitle: "适合个人试用与基础协作",
    description: "覆盖交底、评估与基础撰写流程，AI配额较低。",
    badge: "入门",
    features: [
      "个人或小团队起步使用",
      "每月 50 次 AI 调用",
      "组织成员 3 席上限",
    ],
    resources: [
      {
        key: "organization.members",
        label: "成员席位",
        description: "组织中可占用的总成员数量。",
        unit: "席",
        limit: 3,
        limitLabel: "3 席",
        usageMetric: "organization.members.total",
      },
      {
        key: "organization.admins",
        label: "管理员配额",
        description: "可分配 owner 或 admin 的人数上限。",
        unit: "位",
        limit: 1,
        limitLabel: "1 位",
        usageMetric: "organization.members.admin",
      },
      {
        key: "ai.monthly_calls",
        label: "AI 调用配额",
        description: "每月可发起的 AI 生成请求次数。",
        unit: "次/月",
        limit: 50,
        limitLabel: "50 次 / 月",
        usageMetric: "user.ai.calls.monthly",
      },
    ],
    allowedRoles: ["owner", "member"],
    sortOrder: 0,
    isActive: true,
  },
  {
    key: "basic",
    label: "Basic",
    priceLabel: "¥99 / 月",
    priceAmount: 9900,
    currency: "CNY",
    billingInterval: "month",
    subtitle: "适合常规个人使用",
    description: "覆盖更高频的 AI 调用需求。",
    badge: "进阶",
    features: ["每月 500 次 AI 调用", "标准 AI 模型", "优先支持", "数据导出"],
    resources: [
      {
        key: "organization.members",
        label: "成员席位",
        description: "组织中可占用的总成员数量。",
        unit: "席",
        limit: 5,
        limitLabel: "5 席",
        usageMetric: "organization.members.total",
      },
      {
        key: "organization.admins",
        label: "管理员配额",
        description: "可分配 owner 或 admin 的人数上限。",
        unit: "位",
        limit: 2,
        limitLabel: "2 位",
        usageMetric: "organization.members.admin",
      },
      {
        key: "ai.monthly_calls",
        label: "AI 调用配额",
        description: "每月可发起的 AI 生成请求次数。",
        unit: "次/月",
        limit: 500,
        limitLabel: "500 次 / 月",
        usageMetric: "user.ai.calls.monthly",
      },
    ],
    allowedRoles: ["owner", "admin", "member", "viewer"],
    sortOrder: 1,
    isActive: true,
  },
  {
    key: "pro",
    label: "Pro",
    priceLabel: "¥299 / 月",
    priceAmount: 29900,
    currency: "CNY",
    billingInterval: "month",
    subtitle: "适合高频 AI 写作团队",
    description: "为协作型团队提供高配额 AI 及核心团队能力。",
    badge: "推荐",
    features: [
      "每月 2000 次高级 AI 调用",
      "包含 10 个成员席位",
      "优先队列及团队协作管理",
    ],
    resources: [
      {
        key: "organization.members",
        label: "成员席位",
        description: "组织中可占用的总成员数量。",
        unit: "席",
        limit: 10,
        limitLabel: "10 席",
        usageMetric: "organization.members.total",
      },
      {
        key: "organization.admins",
        label: "管理员配额",
        description: "可分配 owner 或 admin 的人数上限。",
        unit: "位",
        limit: 3,
        limitLabel: "3 位",
        usageMetric: "organization.members.admin",
      },
      {
        key: "ai.monthly_calls",
        label: "AI 调用配额",
        description: "每月可发起的 AI 生成请求次数。",
        unit: "次/月",
        limit: 2000,
        limitLabel: "2000 次 / 月",
        usageMetric: "user.ai.calls.monthly",
      },
    ],
    allowedRoles: ["owner", "admin", "member", "viewer"],
    sortOrder: 2,
    isActive: true,
  },
  {
    key: "enterprise",
    label: "Enterprise",
    priceLabel: "定制报价",
    priceAmount: null,
    currency: "CNY",
    billingInterval: "custom",
    subtitle: "适合企业级定制接入",
    description: "面向多角色、多项目与长期治理需求，适配企业实施场景。",
    badge: "旗舰",
    features: [
      "全量资源无上限",
      "无限专属客户经理",
      "定制化服务与私有部署",
    ],
    resources: [
      {
        key: "organization.members",
        label: "成员席位",
        description: "组织中可占用的总成员数量。",
        unit: "席",
        limit: null,
        limitLabel: "不限",
        usageMetric: "organization.members.total",
      },
      {
        key: "organization.admins",
        label: "管理员配额",
        description: "可分配 owner 或 admin 的人数上限。",
        unit: "位",
        limit: null,
        limitLabel: "不限",
        usageMetric: "organization.members.admin",
      },
      {
        key: "ai.monthly_calls",
        label: "AI 调用配额",
        description: "每月可发起的 AI 生成请求次数。",
        unit: "次/月",
        limit: null,
        limitLabel: "不限",
        usageMetric: "user.ai.calls.monthly",
      },
    ],
    allowedRoles: ["owner", "admin", "member", "viewer"],
    sortOrder: 3,
    isActive: true,
  },
];

let subscriptionPlanCatalogLoadedAt: number | null = null;
let subscriptionPlanCatalogCache: SubscriptionPlanDefinition[] | null = null;

const normalizeSubscriptionPlanKey = (value: unknown): SubscriptionPlan => {
  if (value === "team") {
    return "pro";
  }

  return SUBSCRIPTION_PLAN_KEYS.includes(value as SubscriptionPlan)
    ? (value as SubscriptionPlan)
    : "free";
};

const getDefaultSubscriptionPlanByKey = (
  key: SubscriptionPlan,
): SubscriptionPlanDefinition => {
  return DEFAULT_SUBSCRIPTION_PLANS.find((plan) => plan.key === key)
    ?? DEFAULT_SUBSCRIPTION_PLANS[0]!;
};

const cloneSubscriptionPlanDefinition = (
  plan: SubscriptionPlanDefinition,
): SubscriptionPlanDefinition => ({
  ...plan,
  features: [...plan.features],
  resources: plan.resources.map((r) => ({ ...r })),
  allowedRoles: [...plan.allowedRoles],
});

export const getDefaultSubscriptionPlans = (): SubscriptionPlanDefinition[] => {
  return DEFAULT_SUBSCRIPTION_PLANS.map(cloneSubscriptionPlanDefinition);
};

const normalizeSubscriptionPlanDefinition = (
  plan: Partial<SubscriptionPlanDefinition>,
): SubscriptionPlanDefinition => {
  const key = normalizeSubscriptionPlanKey(plan.key);
  const fallback = getDefaultSubscriptionPlanByKey(key);

  return {
    key,
    label:
      typeof plan.label === "string" && plan.label.trim().length > 0
        ? plan.label
        : fallback.label,
    priceLabel:
      typeof plan.priceLabel === "string" ? plan.priceLabel : fallback.priceLabel,
    priceAmount:
      typeof plan.priceAmount === "number" || plan.priceAmount === null
        ? plan.priceAmount
        : fallback.priceAmount,
    currency:
      typeof plan.currency === "string" && plan.currency.trim().length > 0
        ? plan.currency
        : fallback.currency,
    billingInterval: SUBSCRIPTION_BILLING_INTERVALS.includes(
      plan.billingInterval as SubscriptionBillingInterval,
    )
      ? (plan.billingInterval as SubscriptionBillingInterval)
      : fallback.billingInterval,
    subtitle:
      typeof plan.subtitle === "string" ? plan.subtitle : fallback.subtitle,
    description:
      typeof plan.description === "string"
        ? plan.description
        : fallback.description,
    badge: typeof plan.badge === "string" ? plan.badge : fallback.badge,
    features: Array.isArray(plan.features)
      ? [...plan.features]
      : [...fallback.features],
    resources: Array.isArray(plan.resources) && plan.resources.length > 0
      ? plan.resources.map((resource) => ({ ...resource }))
      : fallback.resources.map((resource) => ({ ...resource })),
    allowedRoles: Array.isArray(plan.allowedRoles)
      ? [...plan.allowedRoles]
      : [...fallback.allowedRoles],
    sortOrder:
      typeof plan.sortOrder === "number" ? plan.sortOrder : fallback.sortOrder,
    isActive:
      typeof plan.isActive === "boolean" ? plan.isActive : fallback.isActive,
  };
};

const mergeSubscriptionPlans = (
  plans: Array<Partial<SubscriptionPlanDefinition>>,
): SubscriptionPlanDefinition[] => {
  const mergedPlans = new Map<SubscriptionPlan, SubscriptionPlanDefinition>(
    getDefaultSubscriptionPlans().map((plan) => [plan.key, plan]),
  );

  plans.forEach((plan) => {
    const normalizedPlan = normalizeSubscriptionPlanDefinition(plan);
    mergedPlans.set(normalizedPlan.key, normalizedPlan);
  });

  return Array.from(mergedPlans.values())
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(cloneSubscriptionPlanDefinition);
};

const getLocalSubscriptionPlans = (): SubscriptionPlanDefinition[] => {
  try {
    const localData = localStorage.getItem(SUBSCRIPTION_PLAN_CACHE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData) as Array<Partial<SubscriptionPlanDefinition>>;
      if (Array.isArray(parsed)) {
        const normalizedPlans = mergeSubscriptionPlans(parsed);
        subscriptionPlanCatalogLoadedAt = Date.now();
        subscriptionPlanCatalogCache = normalizedPlans;
        return normalizedPlans;
      }
    }
  } catch (error) {
    console.error("Failed to load local subscription plan catalog:", error);
  }

  return getDefaultSubscriptionPlans();
};

const setCachedSubscriptionPlans = (
  plans: SubscriptionPlanDefinition[],
): SubscriptionPlanDefinition[] => {
  const normalizedPlans = mergeSubscriptionPlans(plans);
  subscriptionPlanCatalogLoadedAt = Date.now();
  subscriptionPlanCatalogCache = normalizedPlans;

  try {
    localStorage.setItem(
      SUBSCRIPTION_PLAN_CACHE_KEY,
      JSON.stringify(subscriptionPlanCatalogCache),
    );
  } catch (error) {
    console.error("Failed to persist subscription plan catalog cache:", error);
  }

  return normalizedPlans;
};

export const getSubscriptionPlans = (): SubscriptionPlanDefinition[] => {
  if (subscriptionPlanCatalogCache && subscriptionPlanCatalogCache.length > 0) {
    return subscriptionPlanCatalogCache.map(cloneSubscriptionPlanDefinition);
  }
  return getLocalSubscriptionPlans();
};

const isSupabaseRelationMissingError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code: string }).code === "42P01";
  }
  if (error instanceof Error) {
    return error.message.includes("relation") && error.message.includes("does not exist");
  }
  return false;
};

const mapRowToSubscriptionPlanDefinition = (
  row: Partial<SubscriptionPlanCatalogRow>,
): SubscriptionPlanDefinition => {
  const payload = row.payload || {};

  return normalizeSubscriptionPlanDefinition({
    ...payload,
    key: row.plan_key,
    label: row.display_name || "Unknown Plan",
    priceLabel: row.price_label || "",
    priceAmount: typeof row.price_amount === "number" ? row.price_amount : null,
    currency: row.currency || "CNY",
    billingInterval: (SUBSCRIPTION_BILLING_INTERVALS.includes(
      row.billing_interval as SubscriptionBillingInterval,
    )
      ? row.billing_interval
      : "month") as SubscriptionBillingInterval,
    subtitle: row.subtitle || "",
    description: row.description || "",
    badge: row.badge || "",
    features: Array.isArray(row.features) ? row.features : [],
    resources: Array.isArray(row.resources)
      ? row.resources
      : [],
    allowedRoles: Array.isArray(row.allowed_roles) ? row.allowed_roles : [],
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    isActive: typeof row.is_active === "boolean" ? row.is_active : true,
  });
};

export const loadSubscriptionPlans = async (): Promise<SubscriptionPlanDefinition[]> => {
  if (
    subscriptionPlanCatalogLoadedAt &&
    subscriptionPlanCatalogCache &&
    subscriptionPlanCatalogCache.length > 0 &&
    Date.now() - subscriptionPlanCatalogLoadedAt < SUBSCRIPTION_PLAN_CACHE_TTL_MS
  ) {
    return subscriptionPlanCatalogCache.map(cloneSubscriptionPlanDefinition);
  }

  if (!supabase) {
    return getLocalSubscriptionPlans();
  }

  try {
    const { data, error } = await supabase
      .from(SUBSCRIPTION_PLAN_CATALOG_TABLE)
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      if (isSupabaseRelationMissingError(error)) {
        console.error(
          "Supabase table subscription_plan_catalog is missing. Falling back to local subscription plan catalog.",
          error,
        );
      } else {
        console.error("loadSubscriptionPlans failed:", error);
      }

      return setCachedSubscriptionPlans(getLocalSubscriptionPlans());
    }

    if (!Array.isArray(data) || data.length === 0) {
      return setCachedSubscriptionPlans(getDefaultSubscriptionPlans());
    }

    return setCachedSubscriptionPlans(
      data.map((row) => mapRowToSubscriptionPlanDefinition(row as Partial<SubscriptionPlanCatalogRow>)),
    );
  } catch (error) {
    console.error("loadSubscriptionPlans failed:", error);
    return setCachedSubscriptionPlans(getLocalSubscriptionPlans());
  }
};

export const getSubscriptionPlan = (
  key: string,
): SubscriptionPlanDefinition => {
  const plans = getSubscriptionPlans();
  const plan = plans.find((p) => p.key === key);
  if (!plan) {
    const defaultPlans = getDefaultSubscriptionPlans();
    return cloneSubscriptionPlanDefinition(
      defaultPlans.find((p) => p.key === key) || defaultPlans[0]!,
    );
  }
  return cloneSubscriptionPlanDefinition(plan);
};

export const getPlanResourceDefinition = (
  plan: SubscriptionPlanDefinition,
  resourceKey: string,
): PlanResourceDefinition | undefined => {
  return plan.resources.find((r) => r.key === resourceKey);
};

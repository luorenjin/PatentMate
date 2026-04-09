/**
 * 用户配额管理服务（P1-1）
 *
 * 功能：
 * 1. AI 调用次数限制和追踪
 * 2. 订阅计划管理
 * 3. 配额重置机制（按月）
 * 4. 使用量统计
 */

import type {
  SubscriptionPlan,
  PlanLimits,
  QuotaConfig,
  QuotaUsage,
  QuotaCheckResult,
} from "../types";
import { supabase } from "./supabaseService";
import { captureError, captureMessage } from "./sentryService";

const QUOTA_STORAGE_KEY = "patentmate_user_quotas";
const SUPABASE_QUOTAS_TABLE = "user_quotas";

// 订阅计划配额限制
const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    monthlyQuota: 50,
    features: ["基础功能", "标准 AI 模型"],
  },
  basic: {
    monthlyQuota: 500,
    features: ["基础功能", "标准 AI 模型", "优先支持", "数据导出"],
  },
  pro: {
    monthlyQuota: 2000,
    features: [
      "基础功能",
      "高级 AI 模型",
      "优先支持",
      "数据导出",
      "团队协作",
      "批量处理",
    ],
  },
  enterprise: {
    monthlyQuota: -1, // -1 表示无限制
    features: [
      "所有功能",
      "专属客户经理",
      "定制化服务",
      "SLA 保障",
      "私有部署",
    ],
  },
};

/**
 * 获取订阅计划的配额限制
 */
export const getPlanLimits = (plan: SubscriptionPlan): PlanLimits => {
  return PLAN_LIMITS[plan];
};

/**
 * 计算下个月重置日期（每月1日 00:00:00）
 */
const getNextResetDate = (): number => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth.getTime();
};

/**
 * 规范化配额配置数据
 */
const normalizeQuotaConfig = (quota: Partial<QuotaConfig>): QuotaConfig => {
  const now = Date.now();
  const plan = quota.plan || "free";
  const limits = getPlanLimits(plan);

  return {
    userId: quota.userId || "",
    organizationId: quota.organizationId,
    plan,
    monthlyQuota: limits.monthlyQuota,
    currentUsage: typeof quota.currentUsage === "number" ? quota.currentUsage : 0,
    resetDate: typeof quota.resetDate === "number" ? quota.resetDate : getNextResetDate(),
    createdAt: typeof quota.createdAt === "number" ? quota.createdAt : now,
    lastModified: typeof quota.lastModified === "number" ? quota.lastModified : now,
  };
};

/**
 * 从 localStorage 读取所有配额配置
 */
const getQuotasFromCache = (): QuotaConfig[] => {
  try {
    const data = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!data) return [];

    const parsed = JSON.parse(data) as Array<Partial<QuotaConfig>>;
    return Array.isArray(parsed) ? parsed.map(normalizeQuotaConfig) : [];
  } catch (error) {
    console.error("Failed to load quotas from cache:", error);
    return [];
  }
};

/**
 * 保存配额配置到 localStorage
 */
const saveQuotasToCache = (quotas: QuotaConfig[]): void => {
  try {
    localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(quotas));
  } catch (error) {
    console.error("Failed to save quotas to cache:", error);
  }
};

/**
 * 从 Supabase 加载用户配额配置
 */
const loadQuotaFromSupabase = async (
  userId: string
): Promise<QuotaConfig | null> => {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from(SUPABASE_QUOTAS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned - user doesn't have quota config yet
        return null;
      }
      console.error("loadQuotaFromSupabase failed:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return normalizeQuotaConfig({
      userId: data.user_id,
      organizationId: data.organization_id,
      plan: data.plan as SubscriptionPlan,
      monthlyQuota: data.monthly_quota,
      currentUsage: data.current_usage,
      resetDate: data.reset_date,
      createdAt: data.created_at,
      lastModified: data.last_modified,
    });
  } catch (error) {
    console.error("loadQuotaFromSupabase exception:", error);
    return null;
  }
};

/**
 * 保存配额配置到 Supabase
 */
const saveQuotaToSupabase = async (quota: QuotaConfig): Promise<Error | null> => {
  if (!supabase) {
    return null;
  }

  try {
    const { error } = await supabase.from(SUPABASE_QUOTAS_TABLE).upsert(
      {
        user_id: quota.userId,
        organization_id: quota.organizationId,
        plan: quota.plan,
        monthly_quota: quota.monthlyQuota,
        current_usage: quota.currentUsage,
        reset_date: quota.resetDate,
        created_at: quota.createdAt,
        last_modified: quota.lastModified,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("saveQuotaToSupabase failed:", error);
      return error;
    }

    return null;
  } catch (error) {
    console.error("saveQuotaToSupabase exception:", error);
    return error as Error;
  }
};

/**
 * 获取或创建用户配额配置
 * @param userId 用户 ID
 * @param organizationId 组织 ID（可选）
 * @returns 用户配额配置
 */
export const getOrCreateQuotaConfig = async (
  userId: string,
  organizationId?: string
): Promise<QuotaConfig> => {
  // 1. Try loading from Supabase
  const remoteQuota = await loadQuotaFromSupabase(userId);
  if (remoteQuota) {
    // Check if quota needs reset
    if (Date.now() >= remoteQuota.resetDate) {
      return await resetQuota(userId);
    }
    return remoteQuota;
  }

  // 2. Try loading from localStorage cache
  const quotas = getQuotasFromCache();
  let quota = quotas.find((q) => q.userId === userId);

  if (quota) {
    // Check if quota needs reset
    if (Date.now() >= quota.resetDate) {
      return await resetQuota(userId);
    }
    return quota;
  }

  // 3. Create new quota config with free plan
  quota = normalizeQuotaConfig({
    userId,
    organizationId,
    plan: "free",
    currentUsage: 0,
    resetDate: getNextResetDate(),
  });

  // Save to cache
  quotas.push(quota);
  saveQuotasToCache(quotas);

  // Save to Supabase (background, don't wait)
  void saveQuotaToSupabase(quota);

  return quota;
};

/**
 * 检查用户是否有剩余配额
 * @param userId 用户 ID
 * @returns 检查结果
 */
export const checkQuota = async (userId: string): Promise<QuotaCheckResult> => {
  try {
    const quota = await getOrCreateQuotaConfig(userId);

    // Enterprise plan has unlimited quota
    if (quota.plan === "enterprise" || quota.monthlyQuota === -1) {
      return {
        allowed: true,
        remaining: -1,
      };
    }

    const remaining = quota.monthlyQuota - quota.currentUsage;

    if (remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        message: `您本月的 AI 调用配额已用完（${quota.plan} 计划：${quota.monthlyQuota}次/月）。请升级订阅计划以继续使用。`,
      };
    }

    return {
      allowed: true,
      remaining,
    };
  } catch (error) {
    console.error("checkQuota failed:", error);
    captureError(error as Error, { operation: "checkQuota", userId });

    // Fail-open: 如果配额检查失败，允许调用（避免阻塞用户）
    return {
      allowed: true,
      remaining: -1,
      message: "配额检查失败，临时允许调用",
    };
  }
};

/**
 * 递增用户的 AI 使用量
 * @param userId 用户 ID
 * @param count 递增数量（默认 1）
 */
export const incrementUsage = async (
  userId: string,
  count: number = 1
): Promise<void> => {
  try {
    const quota = await getOrCreateQuotaConfig(userId);

    // Update usage
    const updatedQuota: QuotaConfig = {
      ...quota,
      currentUsage: quota.currentUsage + count,
      lastModified: Date.now(),
    };

    // Save to cache
    const quotas = getQuotasFromCache();
    const index = quotas.findIndex((q) => q.userId === userId);
    if (index >= 0) {
      quotas[index] = updatedQuota;
    } else {
      quotas.push(updatedQuota);
    }
    saveQuotasToCache(quotas);

    // Save to Supabase (background)
    void saveQuotaToSupabase(updatedQuota);

    // Log warning if approaching limit (80%)
    if (
      updatedQuota.monthlyQuota > 0 &&
      updatedQuota.currentUsage >= updatedQuota.monthlyQuota * 0.8
    ) {
      const remaining = updatedQuota.monthlyQuota - updatedQuota.currentUsage;
      captureMessage(
        `User ${userId} approaching quota limit: ${remaining} calls remaining`,
        "warning"
      );
    }
  } catch (error) {
    console.error("incrementUsage failed:", error);
    captureError(error as Error, { operation: "incrementUsage", userId, count });
  }
};

/**
 * 获取用户配额使用情况
 * @param userId 用户 ID
 * @returns 配额使用状态
 */
export const getQuotaUsage = async (userId: string): Promise<QuotaUsage> => {
  try {
    const quota = await getOrCreateQuotaConfig(userId);

    // Enterprise plan has unlimited quota
    if (quota.plan === "enterprise" || quota.monthlyQuota === -1) {
      return {
        used: quota.currentUsage,
        remaining: -1,
        total: -1,
        percentage: 0,
        resetDate: quota.resetDate,
      };
    }

    const remaining = Math.max(0, quota.monthlyQuota - quota.currentUsage);
    const percentage = Math.min(
      100,
      Math.round((quota.currentUsage / quota.monthlyQuota) * 100)
    );

    return {
      used: quota.currentUsage,
      remaining,
      total: quota.monthlyQuota,
      percentage,
      resetDate: quota.resetDate,
    };
  } catch (error) {
    console.error("getQuotaUsage failed:", error);
    captureError(error as Error, { operation: "getQuotaUsage", userId });

    // Return default quota status on error
    return {
      used: 0,
      remaining: 50,
      total: 50,
      percentage: 0,
      resetDate: getNextResetDate(),
    };
  }
};

/**
 * 重置用户配额（每月自动调用）
 * @param userId 用户 ID
 * @returns 重置后的配额配置
 */
export const resetQuota = async (userId: string): Promise<QuotaConfig> => {
  try {
    const quota = await getOrCreateQuotaConfig(userId);

    const resetQuota: QuotaConfig = {
      ...quota,
      currentUsage: 0,
      resetDate: getNextResetDate(),
      lastModified: Date.now(),
    };

    // Save to cache
    const quotas = getQuotasFromCache();
    const index = quotas.findIndex((q) => q.userId === userId);
    if (index >= 0) {
      quotas[index] = resetQuota;
    } else {
      quotas.push(resetQuota);
    }
    saveQuotasToCache(quotas);

    // Save to Supabase
    void saveQuotaToSupabase(resetQuota);

    captureMessage(`Quota reset for user ${userId}`, "info");

    return resetQuota;
  } catch (error) {
    console.error("resetQuota failed:", error);
    captureError(error as Error, { operation: "resetQuota", userId });
    throw error;
  }
};

/**
 * 升级用户订阅计划
 * @param userId 用户 ID
 * @param newPlan 新订阅计划
 */
export const upgradePlan = async (
  userId: string,
  newPlan: SubscriptionPlan
): Promise<QuotaConfig> => {
  try {
    const quota = await getOrCreateQuotaConfig(userId);
    const newLimits = getPlanLimits(newPlan);

    const updatedQuota: QuotaConfig = {
      ...quota,
      plan: newPlan,
      monthlyQuota: newLimits.monthlyQuota,
      lastModified: Date.now(),
    };

    // Save to cache
    const quotas = getQuotasFromCache();
    const index = quotas.findIndex((q) => q.userId === userId);
    if (index >= 0) {
      quotas[index] = updatedQuota;
    } else {
      quotas.push(updatedQuota);
    }
    saveQuotasToCache(quotas);

    // Save to Supabase
    const error = await saveQuotaToSupabase(updatedQuota);
    if (error) {
      console.error("Failed to save plan upgrade to Supabase:", error);
    }

    captureMessage(
      `User ${userId} upgraded from ${quota.plan} to ${newPlan}`,
      "info"
    );

    return updatedQuota;
  } catch (error) {
    console.error("upgradePlan failed:", error);
    captureError(error as Error, {
      operation: "upgradePlan",
      userId,
      newPlan,
    });
    throw error;
  }
};

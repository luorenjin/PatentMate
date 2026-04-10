/**
 * 用户配额显示组件（P1-1）
 *
 * 功能：
 * 1. 显示当前用户的 AI 调用配额使用情况
 * 2. 显示配额重置日期
 * 3. 提供升级订阅计划的入口
 * 4. 配额不足时显示警告
 */

import React, { useState, useEffect } from "react";
import type { QuotaUsage } from "../types";
import {
  getQuotaUsage,
  subscribeToQuotaChanges,
} from "../services/quotaService";

interface QuotaIndicatorProps {
  userId: string;
  compact?: boolean; // 紧凑模式（仅显示简要信息）
  onUpgrade?: () => void; // 升级订阅回调
  refreshKey?: number;
}

const QuotaIndicator: React.FC<QuotaIndicatorProps> = ({
  userId,
  compact = false,
  onUpgrade,
  refreshKey = 0,
}) => {
  const [usage, setUsage] = useState<QuotaUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadQuotaUsage();
  }, [userId, refreshKey]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    return subscribeToQuotaChanges((event) => {
      if (event.userId === userId) {
        void loadQuotaUsage();
      }
    });
  }, [userId]);

  const loadQuotaUsage = async () => {
    if (!userId) {
      setError("未登录");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const quotaUsage = await getQuotaUsage(userId);
      setUsage(quotaUsage);
    } catch (err) {
      console.error("Failed to load quota usage:", err);
      setError("加载失败");
    } finally {
      setIsLoading(false);
    }
  };

  const formatResetDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 80) return "text-amber-600";
    return "text-emerald-600";
  };

  const getProgressBarColor = (percentage: number): string => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 80) return "bg-amber-500";
    return "bg-emerald-500";
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        加载配额...
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="text-sm text-gray-400">
        {error || "配额不可用"}
      </div>
    );
  }

  // Enterprise plan (unlimited)
  if (usage.total === -1) {
    return compact ? (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-purple-600 font-medium">企业版</span>
        <span className="text-gray-500">无限制</span>
      </div>
    ) : (
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-purple-900">企业版订阅</span>
          <span className="text-xs text-purple-600">无限制</span>
        </div>
        <p className="text-xs text-purple-700">
          您当前是企业版用户，享有无限 AI 调用次数
        </p>
      </div>
    );
  }

  // Regular plans
  const usageColor = getUsageColor(usage.percentage);
  const progressColor = getProgressBarColor(usage.percentage);
  const isWarning = usage.percentage >= 80;
  const compactUsageColor = usage.percentage >= 90
    ? "text-red-400"
    : usage.percentage >= 80
      ? "text-amber-400"
      : "text-emerald-400";

  if (compact) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
            AI 配额
          </span>
          <span className="text-[11px] text-slate-500">
            {formatResetDate(usage.resetDate)}重置
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={`text-sm font-semibold ${compactUsageColor}`}>
              {usage.remaining} / {usage.total}
            </div>
            <div className="text-xs text-slate-400">
              已使用 {usage.used} 次
            </div>
          </div>

          {isWarning && onUpgrade && (
            <button
              onClick={onUpgrade}
              className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-700"
            >
              升级
            </button>
          )}
        </div>

        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700">
          <div
            className={`${progressColor} h-1.5 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(100, usage.percentage)}%` }}
          ></div>
        </div>

        {isWarning && (
          <div className="mt-2 text-[11px] text-amber-300">
            {usage.remaining === 0 ? "配额已用完" : "配额即将用完"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">AI 调用配额</h3>
        <span className="text-xs text-gray-500">
          {formatResetDate(usage.resetDate)}重置
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className={`text-2xl font-bold ${usageColor}`}>
            {usage.remaining}
          </span>
          <span className="text-sm text-gray-500">
            / {usage.total} 次剩余
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`${progressColor} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(100, usage.percentage)}%` }}
          ></div>
        </div>
      </div>

      {isWarning && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          ⚠️ 配额即将用完，建议升级订阅计划
        </div>
      )}

      {usage.remaining === 0 && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          ❌ 配额已用完，请升级订阅计划以继续使用
        </div>
      )}

      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          升级订阅计划
        </button>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          已使用 {usage.used} 次（{usage.percentage}%）
        </p>
      </div>
    </div>
  );
};

export default QuotaIndicator;

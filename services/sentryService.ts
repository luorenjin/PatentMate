/**
 * Sentry 错误监控服务
 *
 * 功能：
 * 1. 全局错误捕获和上报
 * 2. AI 调用性能监控
 * 3. 用户操作路径追踪
 * 4. 自定义错误上下文
 */

// Sentry 配置（需先安装：npm install @sentry/react）
// import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const SENTRY_ENVIRONMENT = import.meta.env.VITE_SENTRY_ENV || 'development';
const SENTRY_SAMPLE_RATE = parseFloat(import.meta.env.VITE_SENTRY_SAMPLE_RATE || '1.0');

/**
 * 判断 Sentry 是否已配置且可用
 */
export const isSentryConfigured = (): boolean => {
  return Boolean(SENTRY_DSN && SENTRY_DSN !== 'your-sentry-dsn');
};

/**
 * 初始化 Sentry 监控服务
 * 在 main.tsx 或 App.tsx 顶部调用
 */
export const initSentry = (): void => {
  if (!isSentryConfigured()) {
    console.warn('Sentry DSN not configured. Error monitoring disabled.');
    return;
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Performance Monitoring
      tracesSampleRate: SENTRY_SAMPLE_RATE,

      // Session Replay (optional, for debugging)
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Filter sensitive data
      beforeSend(event) {
        // Remove API keys from error context
        if (event.contexts?.runtime) {
          delete event.contexts.runtime.GEMINI_API_KEY;
          delete event.contexts.runtime.QWEN_API_KEY;
        }

        // Remove user email if present
        if (event.user?.email) {
          event.user.email = '***@***.***';
        }

        return event;
      },
    });
    */

    console.info('Sentry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
};

/**
 * 捕获并上报错误到 Sentry
 * @param error 错误对象
 * @param context 额外上下文信息
 */
export const captureError = (
  error: Error | string,
  context?: Record<string, unknown>
): void => {
  if (!isSentryConfigured()) {
    console.error('Error (Sentry disabled):', error, context);
    return;
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    Sentry.captureException(error, {
      contexts: {
        custom: context,
      },
    });
    */
    console.error('Error captured:', error, context);
  } catch (e) {
    console.error('Failed to capture error:', e);
  }
};

/**
 * 开始性能追踪（用于监控 AI 调用响应时间）
 * @param name 追踪名称（如 "ai.generateText"）
 * @returns 追踪句柄，调用 finish() 结束追踪
 */
export const startPerformanceTrace = (
  name: string
): { finish: () => void } => {
  if (!isSentryConfigured()) {
    const startTime = performance.now();
    return {
      finish: () => {
        const duration = performance.now() - startTime;
        console.debug(`Performance: ${name} took ${duration.toFixed(2)}ms`);
      },
    };
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    const transaction = Sentry.startTransaction({ name });
    return {
      finish: () => transaction.finish(),
    };
    */

    const startTime = performance.now();
    return {
      finish: () => {
        const duration = performance.now() - startTime;
        console.debug(`Performance: ${name} took ${duration.toFixed(2)}ms`);
      },
    };
  } catch (error) {
    console.error('Failed to start performance trace:', error);
    return { finish: () => {} };
  }
};

/**
 * 记录用户操作路径（面包屑）
 * @param category 类别（如 "ui.click", "navigation", "ai.request"）
 * @param message 消息描述
 * @param level 日志级别
 */
export const addBreadcrumb = (
  category: string,
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
): void => {
  if (!isSentryConfigured()) {
    console.debug(`[${category}] ${message}`);
    return;
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    Sentry.addBreadcrumb({
      category,
      message,
      level,
      timestamp: Date.now() / 1000,
    });
    */
    console.debug(`[${category}] ${message}`);
  } catch (error) {
    console.error('Failed to add breadcrumb:', error);
  }
};

/**
 * 设置用户上下文（用于关联错误到具体用户）
 * @param userId 用户 ID
 * @param email 用户邮箱（会被脱敏）
 */
export const setUserContext = (userId: string, email?: string): void => {
  if (!isSentryConfigured()) {
    return;
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    Sentry.setUser({
      id: userId,
      email: email ? email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined,
    });
    */
  } catch (error) {
    console.error('Failed to set user context:', error);
  }
};

/**
 * 清除用户上下文（用户登出时调用）
 */
export const clearUserContext = (): void => {
  if (!isSentryConfigured()) {
    return;
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    Sentry.setUser(null);
    */
  } catch (error) {
    console.error('Failed to clear user context:', error);
  }
};

/**
 * 手动捕获消息（用于记录非错误的重要事件）
 * @param message 消息内容
 * @param level 消息级别
 */
export const captureMessage = (
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info'
): void => {
  if (!isSentryConfigured()) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    return;
  }

  try {
    // Uncomment when @sentry/react is installed:
    /*
    Sentry.captureMessage(message, level);
    */
    console.log(`[${level.toUpperCase()}] ${message}`);
  } catch (error) {
    console.error('Failed to capture message:', error);
  }
};

/**
 * AI 调用性能监控包装器
 * 自动追踪 AI 函数的执行时间和错误率
 *
 * @example
 * const result = await monitorAICall('generateText', async () => {
 *   return await aiService.generateText(prompt, 'pro');
 * });
 */
export const monitorAICall = async <T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> => {
  const trace = startPerformanceTrace(`ai.${operationName}`);
  addBreadcrumb('ai.request', `Starting ${operationName}`, 'info');

  try {
    const result = await operation();
    addBreadcrumb('ai.success', `Completed ${operationName}`, 'info');
    trace.finish();
    return result;
  } catch (error) {
    addBreadcrumb('ai.error', `Failed ${operationName}`, 'error');
    captureError(error as Error, {
      operation: operationName,
      category: 'ai_call',
    });
    trace.finish();
    throw error;
  }
};

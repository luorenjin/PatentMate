# Sentry 错误监控集成指南

## 概述

PatentMate 已集成 Sentry 错误监控服务，用于生产环境的错误追踪、性能监控和用户行为分析。

## 功能特性

### ✅ 已实现功能

1. **全局错误捕获**
   - React Error Boundary 组件捕获 UI 渲染错误
   - 自动上报到 Sentry，包含组件堆栈信息
   - 友好降级 UI（重试/刷新按钮）

2. **AI 调用性能监控**
   - 自动追踪所有 AI 函数的执行时间
   - 记录成功率和失败原因
   - 性能瓶颈识别

3. **用户操作路径追踪**
   - 面包屑记录用户操作流程
   - 错误发生时可回溯操作历史
   - 帮助复现和调试问题

4. **自定义错误上下文**
   - 关联用户 ID 和邮箱（脱敏）
   - 操作类别标签（ai_call, ui_interaction, etc.）
   - 自定义元数据

## 安装步骤

### 1. 安装依赖

```bash
npm install @sentry/react
```

### 2. 配置环境变量

在 `.env.local` 文件中添加 Sentry 配置：

```bash
# Sentry DSN（在 Sentry 控制台获取）
VITE_SENTRY_DSN=https://your-public-key@sentry.io/your-project-id

# 环境标识（development/staging/production）
VITE_SENTRY_ENV=production

# 采样率（0.0-1.0，1.0 表示 100% 采样）
VITE_SENTRY_SAMPLE_RATE=1.0
```

### 3. 取消注释 Sentry API 调用

在 `services/sentryService.ts` 文件中，取消注释所有 `Sentry.*` 相关代码：

```typescript
// 搜索以下注释并删除：
// Uncomment when @sentry/react is installed:
/*
Sentry.init({ ... });
*/

// 修改为：
Sentry.init({ ... });
```

需要取消注释的函数：
- `initSentry()` - 初始化配置
- `captureError()` - 错误捕获
- `startPerformanceTrace()` - 性能追踪
- `addBreadcrumb()` - 面包屑
- `setUserContext()` - 用户上下文
- `captureMessage()` - 消息捕获

### 4. 初始化 Sentry（可选，如需全局初始化）

在 `main.tsx` 或 `App.tsx` 顶部调用：

```typescript
import { initSentry } from './services/sentryService';

// 应用启动时初始化
initSentry();
```

**注意**：当前实现中，Sentry 已通过 `sentryService.ts` 模块加载时自动初始化。如果需要延迟初始化，可将 `initSentry()` 移至其他位置。

## 获取 Sentry DSN

### 步骤 1: 创建 Sentry 账号

访问 [https://sentry.io](https://sentry.io) 并注册账号（提供免费套餐）。

### 步骤 2: 创建项目

1. 登录 Sentry 控制台
2. 点击 "Create Project"
3. 选择平台：**React**
4. 输入项目名称：**PatentMate**
5. 选择团队（Team）
6. 点击 "Create Project"

### 步骤 3: 获取 DSN

项目创建成功后，Sentry 会显示 DSN（Data Source Name）：

```
https://your-public-key@o123456.ingest.sentry.io/7890123
```

复制该 DSN 并添加到 `.env.local` 文件。

### 步骤 4: 配置项目设置（可选）

在 Sentry 控制台 → Settings → Projects → PatentMate：

- **Issue Grouping**: 设置错误分组规则
- **Alerts**: 配置错误通知（邮件/Slack/Webhook）
- **Integrations**: 集成 GitHub/Jira/Slack
- **Releases**: 关联 Git 版本和部署

## 验证集成

### 方法 1: 手动触发错误

在任意组件中抛出测试错误：

```typescript
const TestComponent = () => {
  const triggerError = () => {
    throw new Error("Sentry 测试错误");
  };

  return <button onClick={triggerError}>触发错误</button>;
};
```

### 方法 2: 使用 Error Boundary

Error Boundary 会自动捕获子组件中的错误并上报到 Sentry。

### 方法 3: 查看 Sentry 控制台

1. 访问 [https://sentry.io](https://sentry.io)
2. 进入 PatentMate 项目
3. 查看 Issues 页面，应该能看到刚才触发的错误
4. 点击错误详情，查看堆栈信息、面包屑、用户上下文等

## 功能使用示例

### 1. 捕获自定义错误

```typescript
import { captureError } from '@/services/sentryService';

try {
  // 业务逻辑
  await riskyOperation();
} catch (error) {
  captureError(error, {
    category: 'business_logic',
    operation: 'riskyOperation',
    userId: currentUser.id,
  });
}
```

### 2. 监控 AI 调用性能

```typescript
import { monitorAICall } from '@/services/sentryService';

const result = await monitorAICall('generateAbstract', async () => {
  return await aiService.generateText(prompt, 'pro');
});
```

### 3. 添加用户操作面包屑

```typescript
import { addBreadcrumb } from '@/services/sentryService';

addBreadcrumb('ui.click', '用户点击了保存按钮', 'info');
addBreadcrumb('navigation', '用户进入编辑器页面', 'info');
addBreadcrumb('ai.request', '开始生成权利要求书', 'info');
```

### 4. 设置用户上下文

```typescript
import { setUserContext, clearUserContext } from '@/services/sentryService';

// 用户登录时
setUserContext(user.id, user.email);

// 用户登出时
clearUserContext();
```

### 5. 记录重要事件

```typescript
import { captureMessage } from '@/services/sentryService';

captureMessage('用户完成专利申请撰写', 'info');
captureMessage('AI 调用配额即将耗尽', 'warning');
```

## 高级配置

### 1. 过滤敏感数据

Sentry 配置中已内置 `beforeSend` hook，自动过滤以下敏感信息：

- API Keys（`GEMINI_API_KEY`, `QWEN_API_KEY`）
- 用户邮箱（脱敏为 `***@***.***`）

如需过滤更多字段，修改 `services/sentryService.ts` 中的 `beforeSend` 函数：

```typescript
beforeSend(event) {
  // 移除敏感字段
  if (event.contexts?.custom?.sensitiveField) {
    delete event.contexts.custom.sensitiveField;
  }

  return event;
},
```

### 2. Session Replay（会话重放）

Sentry 已配置 Session Replay 功能，可在错误发生时自动录制用户操作视频：

```typescript
Sentry.replayIntegration({
  maskAllText: true,        // 脱敏所有文本
  blockAllMedia: true,      // 阻止媒体录制
}),

replaysSessionSampleRate: 0.1,  // 正常会话采样 10%
replaysOnErrorSampleRate: 1.0,  // 错误会话采样 100%
```

**注意**：Session Replay 会增加带宽和存储成本，建议在生产环境谨慎使用。

### 3. 性能监控

Sentry 已集成 Browser Tracing，自动追踪页面加载和路由跳转性能：

```typescript
tracesSampleRate: 1.0,  // 100% 性能追踪采样
```

在 Sentry 控制台 → Performance 页面可查看：

- 页面加载时间（FCP, LCP, TTFB）
- AI 调用响应时间
- 用户交互延迟

### 4. 自定义标签

为错误事件添加自定义标签，便于分类和过滤：

```typescript
import * as Sentry from '@sentry/react';

Sentry.setTag('feature', 'patent_drafting');
Sentry.setTag('ai_provider', 'gemini');
```

## 常见问题

### Q1: Sentry 未配置时会影响应用运行吗？

**A**: 不会。`sentryService.ts` 包含 `isSentryConfigured()` 检查，未配置时所有调用会回退到 `console` 输出，不会抛出错误。

### Q2: 如何临时禁用 Sentry？

**A**: 方法一：删除 `.env.local` 中的 `VITE_SENTRY_DSN`。
方法二：设置 `VITE_SENTRY_DSN` 为空字符串或占位符（如 `your-sentry-dsn`）。

### Q3: Sentry 采样率如何配置？

**A**: 通过 `VITE_SENTRY_SAMPLE_RATE` 环境变量控制：

- `1.0` = 100% 采样（开发/测试环境推荐）
- `0.1` = 10% 采样（生产环境节省配额）
- `0.0` = 禁用性能追踪

### Q4: 如何关联 GitHub Issues？

**A**: 在 Sentry 控制台 → Settings → Integrations → GitHub：

1. 授权 GitHub 访问
2. 选择 `PatentMate` 仓库
3. 配置自动创建 Issue 规则
4. Sentry 错误会自动同步到 GitHub Issues

### Q5: 如何在 Sentry 中查看 AI 性能数据？

**A**: Sentry 控制台 → Performance → Transactions → 筛选 `ai.generateText_*`。

可查看：
- P50/P90/P99 响应时间
- 成功率 / 失败率
- 按 AI 提供商分组（Gemini vs Qwen）

## 最佳实践

### 1. 错误分级

使用不同 `level` 区分错误严重程度：

| Level | 用途 | 示例 |
|-------|------|------|
| `debug` | 开发调试 | 变量值记录 |
| `info` | 正常事件 | 用户完成操作 |
| `warning` | 需注意但不影响功能 | API 调用慢 |
| `error` | 功能异常 | AI 调用失败 |
| `fatal` | 系统崩溃 | 数据库连接失败 |

### 2. 错误分组

使用自定义 `fingerprint` 控制错误分组：

```typescript
Sentry.captureException(error, {
  fingerprint: ['{{ default }}', 'ai_generation_failure'],
});
```

### 3. 避免过度上报

- 不要在循环中捕获错误并上报（会产生大量重复事件）
- 使用 `throttle` 限制高频错误的上报频率
- 对已知可恢复错误，使用 `console.warn` 而非 `captureError`

### 4. 及时更新 Release

在部署新版本时，使用 Sentry Release 功能关联版本号和 Git Commit：

```bash
# 创建 Release
npx @sentry/cli releases new <VERSION>

# 关联 Commit
npx @sentry/cli releases set-commits <VERSION> --auto

# 部署完成
npx @sentry/cli releases finalize <VERSION>
```

## 监控指标建议

### 关键指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 错误率 | < 1% | 用户会话错误率 |
| AI 成功率 | > 95% | AI 调用成功率 |
| P99 响应时间（AI） | < 10s | 99% 请求在 10 秒内完成 |
| P90 响应时间（AI） | < 5s | 90% 请求在 5 秒内完成 |

### 告警配置

在 Sentry 控制台 → Alerts 配置：

1. **错误激增告警**：1 小时内错误数 > 50
2. **AI 调用失败率告警**：5 分钟内失败率 > 10%
3. **性能降级告警**：P95 响应时间 > 15s

## 相关文件

- `services/sentryService.ts` - Sentry 服务封装
- `components/ErrorBoundary.tsx` - React Error Boundary
- `App.tsx` - 全局集成
- `services/aiService.ts` - AI 性能监控示例

## 参考资料

- [Sentry React 文档](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Performance Monitoring](https://docs.sentry.io/platforms/javascript/guides/react/performance/)
- [Sentry Session Replay](https://docs.sentry.io/platforms/javascript/guides/react/session-replay/)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)

---

**更新日期**: 2026-04-08
**版本**: PatentMate v1.0 P0-2 Complete

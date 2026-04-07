---
applyTo: services/**
---

# services/ 代码规范

适用于 `services/aiService.ts`、`services/storageService.ts`、`services/markdownService.ts` 及未来所有服务文件。

---

## 导出与 import 顺序

```typescript
// 1. 第三方库
import { GoogleGenAI } from "@google/genai";

// 2. 本地类型（仅从 ../types 导入）
import type { PatentData, ReviewResult } from "../types";

// 所有函数使用 named export，禁止 export default
export const myServiceFunc = async (...) => { ... };
```

---

## 模型名称常量

所有 Gemini 模型名称**必须**定义为顶部常量，禁止在函数体内硬编码字符串：

```typescript
// ✅ 正确
const MODEL_FAST = "gemini-2.5-flash";   // 新颖性检索、轻量分析
const MODEL_PRO  = "gemini-2.5-pro";     // 撰写、润色、审查

// ❌ 错误：直接在调用处写字符串
model: 'gemini-3-pro-preview'
```

存储键名等配置字符串同理，统一在文件顶部定义常量（参考 `storageService.ts` 中的 `STORAGE_KEY`）。

---

## 错误处理规范

### AI 服务函数（`aiService.ts`）

- **所有** async 函数必须有 `try/catch`，包括 `createChatSession()`
- `catch` 块必须 `console.error()`，然后**返回合理的 fallback 值**，禁止 `throw`（避免调用方需要二次 try/catch）
- 返回 fallback 时，确保类型与签名一致

```typescript
// ✅ 正确模式
export const someAIFunc = async (input: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({ model: MODEL_PRO, contents: input });
    return response.text ?? "";
  } catch (error) {
    console.error("someAIFunc failed:", error);
    return "";           // 返回同类型的空值
  }
};

// ❌ 错误：抛异常（调用方必须处理，容易遗漏）
throw new Error("AI generation failed");
```

### 存储服务函数（`storageService.ts`）

- 只需在 `getPatents()`（根数据源）加 `try/catch`，其他函数依赖其安全性即可
- fallback 统一返回空数组 `[]` 或空操作

### Markdown 渲染（`markdownService.ts`）

- `marked.parse()` 调用应包裹在 `try/catch` 中防止边缘崩溃
- KaTeX 保持 `throwOnError: false`，捕获异常后返回原始公式文本

---

## JSON 解析规范

从 AI 返回文本中解析 JSON 时，**必须**先用正则提取 JSON 块再解析，防止模型在 JSON 前后附加说明文字：

```typescript
// ✅ 正确：两层防御
const jsonMatch = responseText.match(/\{[\s\S]*\}/);
const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
try {
  const result = JSON.parse(jsonStr) as ExpectedType;
  // 防御性字段检查
  if (!Array.isArray(result.items)) result.items = [];
  return result;
} catch (e) {
  console.error("JSON parse failed, raw text:", responseText);
  return DEFAULT_FALLBACK;
}

// ❌ 错误：直接解析可能包含 markdown 代码块的响应
return JSON.parse(responseText);
```

---

## 注释规范

所有**导出函数**必须有 JSDoc 块注释，说明：功能、参数语义、返回值、副作用（如有）。

```typescript
/**
 * 对专利章节文本进行润色或法言法语转化。
 * @param text 待处理的纯文本（HTML 已剥离）
 * @param action 润色模式：'polish' 通用润色 | 'expand' 扩充细节 | 'fix_legal' 法言法语
 * @returns 处理后的 Markdown 文本；调用失败时返回原文本
 */
export const refineText = async (text: string, action: 'expand' | 'polish' | 'fix_legal'): Promise<string> => {
```

内部实现注释使用中文，JSDoc 描述可中英混合。

---

## AI Prompt 管理

- 超过 5 行的 prompt 字符串使用模板字面量并赋给具名变量，便于维护：

```typescript
// ✅ 具名 prompt 变量
const prompt = `
  你是一位 CNIPA 审查员。请对以下专利草稿进行实质审查……
  发明名称：${patentData.title}
  权利要求书：${claims}
`;
const response = await ai.models.generateContent({ model: MODEL_PRO, contents: prompt });

// ❌ 内联冗长字符串
contents: `你是...${very_long_prompt_inline}...`
```

- Prompt 中涉及专利文本时，先用 `stripHtml()` 去除 HTML 标签，再传给 AI

---

## 类型安全

- 使用 `as SomeType` 类型断言后，**必须**立即做关键字段的防御性检查（特别是数组和嵌套对象）
- 函数返回类型必须显式声明，禁止依赖 TypeScript 推断返回 `any`

```typescript
// ✅ 断言后立即防御
const result = JSON.parse(jsonStr) as ReviewResult;
if (typeof result.score !== 'number') result.score = 0;
if (!result.feedback) result.feedback = "审查失败，请重试。";
```

---

## 禁止事项

| 禁止 | 原因 |
|------|------|
| 在 `services/` 中访问 DOM（`document.*`） | 服务层应保持环境无关 |
| 在 `services/` 中使用 `useState` / React hooks | 服务层是纯函数，不含 React 状态 |
| 硬编码模型名称字符串 | 更换版本需逐一修改 |
| AI 函数中使用 `throw` 作为主错误路径 | 组件调用方必须二次处理，容易遗漏 |
| `console.log` 打印含 API Key 的变量 | 避免敏感信息泄露到日志 |

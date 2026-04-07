# PatentMate — Copilot 工作区指引

PatentMate 是一款 AI 驱动的专利撰写辅助工具，集成 Google Gemini API，提供新颖性评估、智能撰写、文书润色和模拟审查等完整专利申请工作流。

---

## 快速启动

```bash
npm install
cp .env.local.example .env.local   # 填写 GEMINI_API_KEY
npm run dev      # 开发服务器: http://localhost:3000
npm run build    # 生产构建
npm run preview  # 预览生产版本
```

> **必须**在 `.env.local` 设置 `GEMINI_API_KEY`，否则所有 AI 功能将无法工作。
> 该文件已加入 `.gitignore`，**禁止**将 API Key 硬编码到源码中。

---

## 技术栈

| 层面 | 技术 |
|------|------|
| UI 框架 | React 19 + TypeScript 5.8（严格模式） |
| 构建工具 | Vite 6 |
| AI 服务 | Google Gemini API (`@google/genai ^1.30.0`) |
| 样式 | Tailwind CSS（CDN，无本地 CSS 文件） |
| Markdown | `marked` 12 + KaTeX 0.16 |
| 数据持久化 | `localStorage`（通过 `storageService.ts` 封装） |
| 路径别名 | `@/` → 项目根目录 |

> Tailwind、KaTeX 和部分依赖通过 `index.html` 内的 ImportMap / CDN 引入，**断网时应用不可用**。

---

## 项目架构

### 用户工作流（4 个视图）

```
Dashboard（工作台）
  └─ PatentDraft（技术交底）        ← 专利类型、技术领域、交底问卷
    └─ NoveltySearch（方案评估） ← Gemini 2.5 Flash + Google Search 工具
      └─ DraftingContainer（申请撰写） ← 分阶段生成摘要/权利要求/说明书
        └─ Editor（审校定稿）      ← 法言法语润色 + 模拟审查 + 导出
```

### 目录职责

```
/components/
  Dashboard.tsx        工作台：草稿列表、新建、删除
  PatentDraft.tsx      技术交底：类型、领域、问卷与交底确认
  NoveltySearch.tsx    方案评估：检索报告、优化建议、保护策略
  Drafting/            申请撰写：分阶段生成专利文本
  Editor.tsx           审校定稿：编辑、审查、导出
  ChatAssistant.tsx    浮窗聊天机器人（法律咨询）
  Sidebar.tsx          左侧导航 + 聊天开关
  RichTextEditor.tsx   富文本编辑器（Markdown + LaTeX）

/services/
  aiService.ts         AI 服务封装（双提供商，多个导出函数）
  storageService.ts    localStorage CRUD（4 个函数）
  markdownService.ts   Markdown + LaTeX → HTML 渲染

/types.ts              全局 TypeScript 接口（PatentData、AppView 等）
/App.tsx               顶层状态管理 + 视图路由
```

### 状态管理

- 所有共享状态（`patentData`、`currentView`）保存在 `App.tsx`
- 通过 props 向下传递：`patentData`, `updatePatentData`, `onSave`, `onBack`
- 没有 Redux / Zustand，使用 `useState` + Props Drilling

---

## 核心代码约定

### 组件结构

```typescript
interface FooProps {
  patentData: PatentData;
  updatePatentData: (field: keyof PatentData, value: any) => void;
  onBack: () => void;
}

const Foo: React.FC<FooProps> = ({ patentData, updatePatentData, onBack }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ...
};
export default Foo;
```

### AI 调用模式（必须遵守）

```typescript
const handleAIAction = async () => {
  if (!validInput) { setError("请先填写..."); return; }
  setError(null);
  setIsLoading(true);
  try {
    const text = await aiService.someFunc(params);
    const html = renderMarkdown(text);     // AI 返回 Markdown → 渲染为 HTML
    updatePatentData('fieldName', html);
  } catch (err) {
    setError("AI 操作失败，请重试。");
  } finally {
    setIsLoading(false);
  }
};
```

### HTML / 纯文本互转（内部常用）

```typescript
// HTML → 纯文本（发给 AI 前去除 HTML 标签）
const stripHtml = (html: string) =>
  document.createElement('DIV').textContent = html, html; 
// 实际用法见各组件中的 stripHtml 函数
```

### 样式规范（Tailwind）

| 用途 | Class |
|------|-------|
| 主操作按钮 | `bg-blue-600 hover:bg-blue-700 text-white` |
| AI 功能按钮 | `bg-indigo-600 hover:bg-indigo-700` |
| 成功/正面 | `text-emerald-600` / `bg-emerald-50` |
| 警告 | `text-amber-600` |
| 错误 | `text-red-600` |
| 卡片 | `rounded-xl shadow-sm border border-gray-200` |
| 输入框 | `rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500` |

---

## 关键类型（`types.ts`）

```typescript
enum AppView { DASHBOARD, NOVELTY_SEARCH, DRAFTER, EDITOR }

interface PatentData {
  id: string;                       // UUID
  title: string;                    // 发明名称
  status: 'draft' | 'ready_to_submit';
  createdAt: number; lastModified: number;
  technicalField: string;           // IPC 技术领域
  backgroundArt: string;            // 背景技术
  inventionContent: string;         // 核心发明方案
  detailedDescription?: string;     // 具体实施方式（HTML）
  claims?: string;                  // 权利要求书（HTML）
  abstract?: string;                // 摘要（HTML）
  drawings?: string[];              // Base64 图片数组
}
```

---

## 常见陷阱与注意事项

### 安全
- **API Key 绝不能提交到 Git**——Vite 将其注入为 `process.env.GEMINI_API_KEY` 后在浏览器全局可见，仅用于本地/受控环境
- 避免在客户端代码中打印或暴露 API Key

### AI 返回处理
- Gemini 返回值通常是 **Markdown 纯文本**，存入 `PatentData` 前需经 `renderMarkdown()` 转为 HTML
- JSON 解析使用 `responseText.match(/\{[\s\S]*\}/)` 提取，需包裹 try/catch 防止 AI 格式不符导致崩溃

### 模型版本
- 当前使用 `gemini-2.5-flash`（新颖性检索）和 `gemini-2.5-pro`（撰写/润色），均在 `aiService.ts` 顶部常量定义；如需更换，只改该文件

### 依赖 CDN
- Tailwind CSS、KaTeX、部分包从 CDN 加载，**离线环境无法正常使用**

### 无测试框架
- 项目目前无单元测试；新增功能时请在对应 service 函数中做好输入校验和错误处理

---

## 提交前清单

- [ ] `.env.local` 不在提交范围内
- [ ] 无硬编码 API Key 或敏感字符串
- [ ] `npm run build` 无 TypeScript 错误
- [ ] AI 调用路径均有 `try/catch` 和 loading 状态

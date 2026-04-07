<div align="center">
<img width="1200" height="475" alt="PatentMate Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# PatentMate — AI 驱动的专利撰写助手

**从技术披露到正式申请文件，全流程 AI 辅助**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![Gemini](https://img.shields.io/badge/Gemini_API-2.5-4285F4?logo=google)

</div>

---

## 项目简介

PatentMate 是一款 AI 驱动的专利撰写 SaaS 应用，集成 Google Gemini / 阿里通义千问 API，为发明人和专利代理人提供从技术披露收集、新颖性评估、智能撰写到文书导出的完整工作流。

### 核心功能

| 阶段 | 功能 |
|------|------|
| 📋 **技术披露** | 结构化问卷引导，AI 辅助深挖技术亮点 |
| 🔍 **新颖性评估** | 接入 Google 搜索，生成先有技术分析报告 |
| ✍️ **智能撰写** | 分段生成摘要、权利要求书、具体实施方式 |
| 📝 **文书润色** | 法言法语转化、模拟审查、一键导出 DOCX / PDF |
| 💬 **法律咨询** | 浮窗 AI 聊天机器人，随时解答专利问题 |

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- Gemini API Key（或阿里云通义千问 API Key）
- Supabase 项目（用于用户认证，可选）

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入必要的 API Key

# 3. 启动开发服务器
npm run dev        # http://localhost:3000

# 4. 生产构建
npm run build
npm run preview    # 预览生产版本
```

---

## 环境变量配置

复制 `.env.local.example` 为 `.env.local` 并按需填写：

### 认证配置（Supabase）

```bash
# 从 https://supabase.com/dashboard 获取
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> 若未配置 Supabase，应用将在本地模式下运行（跳过登录，数据保存到 localStorage）。

### AI 提供商配置

**默认：Google Gemini**

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key

# 可选：覆盖模型版本
GEMINI_MODEL_FAST=gemini-2.5-flash   # 用于新颖性检索等轻量任务
GEMINI_MODEL_PRO=gemini-2.5-pro      # 用于撰写、润色等高质量任务
```

**切换至阿里通义千问（OpenAI 兼容接口）**

```bash
AI_PROVIDER=qwen
QWEN_API_KEY=your_qwen_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL_FAST=qwen-plus
QWEN_MODEL_PRO=qwen-max
```

---

## 用户工作流

```
Dashboard（草稿工作台）
  └─ Disclosure（技术披露向导）   ← 结构化问卷 + AI 深挖访谈
       └─ NoveltySearch（新颖性评估） ← Gemini + Google Search 工具
            └─ Drafter（智能撰写）    ← 分段 AI 生成，逐步确认
                 └─ Editor（文书润色） ← 润色 + 模拟审查 + 导出
```

---

## 技术栈

| 层面 | 技术 |
|------|------|
| UI 框架 | React 19 + TypeScript ~6.0（严格模式） |
| 构建工具 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| AI 服务 | Google Gemini API / 阿里通义千问（OpenAI 兼容） |
| 认证 | Supabase Auth |
| Markdown 渲染 | `marked` 17 + KaTeX 0.16 |
| 文档导出 | `docx` + `jspdf` |
| 数据持久化 | localStorage（via `storageService.ts`） |

---

## 项目结构

```
PatentMate/
├── App.tsx                  # 根组件，状态管理 + 视图路由
├── types.ts                 # 全局 TypeScript 接口
├── index.tsx                # React 应用入口
├── index.html               # HTML 入口
├── components/
│   ├── Dashboard.tsx        # 工作台：草稿列表、新建、删除
│   ├── PatentDraft.tsx      # 技术披露向导
│   ├── NoveltySearch.tsx    # 新颖性评估
│   ├── Drafting/            # 智能撰写（分段生成）
│   ├── Editor.tsx           # 文书润色与导出
│   ├── ChatAssistant.tsx    # 浮窗 AI 法律咨询
│   ├── Sidebar.tsx          # 左侧导航
│   ├── Auth/                # 登录 / 注册 / 密码重置
│   └── Settings/            # 组织设置
└── services/
    ├── geminiService.ts     # AI 接口封装（双提供商）
    ├── storageService.ts    # localStorage CRUD
    ├── markdownService.ts   # Markdown + LaTeX 渲染
    ├── supabaseService.ts   # Supabase 认证封装
    ├── organizationService.ts # 组织管理
    ├── exportService.ts     # DOCX / PDF 导出
    └── disclosureTemplateService.ts # 披露模板
```

---

## 安全须知

- **API Key 禁止提交到 Git**：`.env.local` 已加入 `.gitignore`，请勿将密钥硬编码到源码中
- Supabase 匿名密钥（`ANON_KEY`）仅用于客户端，受行级安全（RLS）策略保护
- 所有 AI 输出在渲染前经过 HTML 转义处理

---

## 开发指南

详细的代码规范、组件模式和 AI 调用约定请参阅：

- [`CLAUDE.md`](CLAUDE.md) — 完整开发者指引
- [`services/AGENTS.md`](services/AGENTS.md) — 服务层代码规范
- [`components/AGENTS.md`](components/AGENTS.md) — 组件开发规范

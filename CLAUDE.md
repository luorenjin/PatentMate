# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # Set GEMINI_API_KEY
npm run dev      # Dev server: http://localhost:3000
npm run build    # Production build
npm run preview  # Preview production build
```

**Required**: Set `GEMINI_API_KEY` in `.env.local` for AI features to work. The file is in `.gitignore`.

## Technology Stack

| Layer | Technology |
|-------|------------|
| UI | React 19 + TypeScript ~6.0 (strict mode) |
| Build | Vite 8 |
| AI | Google Gemini API (`@google/genai`) or Qwen (OpenAI-compatible) |
| Styling | Tailwind CSS via CDN |
| Markdown | `marked` + KaTeX |
| Storage | localStorage via `storageService.ts` |
| Path alias | `@/` → project root |

## Architecture

### User Workflow (4 Views)

```
Dashboard (工作台)
  └─ NoveltySearch（新颖性评估）   ← Gemini 2.5 Flash + Google Search
       └─ PatentDrafter（智能撰写） ← Gemini generates abstract/claims/embodiments
            └─ Editor（文书润色）   ← Polish + Mock review + Export
```

### Directory Structure

```
/components/
  Dashboard.tsx        - Draft list, create, delete
  NoveltySearch.tsx    - Novelty assessment with search report
  PatentDrafter.tsx    - AI-powered patent drafting assistant
  Editor.tsx           - Text editing, review, export
  ChatAssistant.tsx    - Floating patent law chatbot
  Sidebar.tsx          - Left navigation + chat toggle
  RichTextEditor.tsx   - Markdown + LaTeX editor

/services/
  geminiService.ts     - All AI functions (dual-provider: Gemini/Qwen)
  storageService.ts    - localStorage CRUD operations
  markdownService.ts   - Markdown + LaTeX → HTML rendering

types.ts               - TypeScript interfaces (PatentData, AppView, etc.)
App.tsx                - Root state management + view routing
```

### State Management

- All shared state (`patentData`, `currentView`) in `App.tsx`
- Passed via props: `patentData`, `updatePatentData`, `onSave`, `onBack`
- No Redux/Zustand — uses `useState` + Props Drilling

### Patent Status Flow

```
disclosure_collecting → disclosure_review → drafting → editing → ready_to_submit
```

## Key Patterns

### Component Props Interface

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

### AI Calling Pattern

```typescript
const handleAIAction = async () => {
  if (!validInput) { setError("请先填写..."); return; }
  setError(null);
  setIsLoading(true);
  try {
    const text = await geminiService.someFunc(params);
    const html = renderMarkdown(text);      // Markdown → HTML
    updatePatentData('fieldName', html);
  } catch (err) {
    setError("AI 操作失败，请重试。");
  } finally {
    setIsLoading(false);
  }
};
```

### HTML ↔ Plain Text Conversion

```typescript
// HTML → Plain text (strip tags before sending to AI)
const stripHtml = (html: string) =>
  document.createElement('DIV').textContent = html, html;
```

## AI Provider Configuration

Supports dual AI providers configured via environment variables:

```bash
# Gemini (default)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key

# Qwen (Alibaba)
AI_PROVIDER=qwen
QWEN_API_KEY=your_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL_FAST=qwen3.5-flash
QWEN_MODEL_PRO=qwen3.6-plus
```

Model versions are defined in `services/geminiService.ts`:

- Fast model: `gemini-3.0-flash` / `qwen3.5-flash`
- Pro model: `gemini-3.1-pro` / `qwen3.6-plus`

Environment variables for model selection:

- `GEMINI_MODEL_FAST=gemini-3.0-flash`
- `GEMINI_MODEL_PRO=gemini-3.1-pro`
- `QWEN_MODEL_FAST=qwen3.5-flash`
- `QWEN_MODEL_PRO=qwen3.6-plus`

## Common Gotchas

- **API Key Security**: Never commit API keys. Vite injects them as `process.env.*` and they're visible in browser globals. Direct `.env` file edits are blocked by a Claude hook — edit `.env.local.example` instead.
- **AI Output Processing**: Gemini returns Markdown plain text; convert to HTML via `renderMarkdown()` before storing.
- **JSON Parsing**: Use `responseText.match(/\{[\s\S]*\}/)` to extract JSON; wrap in try/catch.
- **CDN Dependencies**: Tailwind CSS, KaTeX load from CDN — offline usage will fail.
- **No Test Framework**: Project has no unit tests; add input validation and error handling in service functions.

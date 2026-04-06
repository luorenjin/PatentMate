# PatentMate

## Purpose
AI-powered patent drafting SaaS application that guides users through the complete patent application process: from novelty search and technical disclosure collection, through AI-assisted drafting, to document polishing and export.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Project dependencies and npm scripts |
| `tsconfig.json` | TypeScript configuration with strict mode |
| `vite.config.ts` | Vite build configuration with React plugin and path aliases |
| `index.html` | Entry HTML file |
| `index.tsx` | React application entry point |
| `App.tsx` | Root component with state management and view routing |
| `types.ts` | TypeScript interfaces for patent data, views, and AI responses |
| `CLAUDE.md` | AI developer guidance document |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | React UI components for each workflow stage (see `components/AGENTS.md`) |
| `services/` | Business logic services (AI, storage, markdown) (see `services/AGENTS.md`) |
| `docs/` | Project documentation and plans (see `docs/AGENTS.md`) |
| `.github/` | GitHub Copilot/Agent configurations (see `.github/AGENTS.md`) |

## For AI Agents

### Working In This Project
- Use TypeScript strict mode for all code
- Follow component props interface pattern defined in CLAUDE.md
- All AI output must be converted to HTML via `renderMarkdown()` before storing
- Use localStorage via `storageService.ts` for persistence - no backend database
- API keys must never be committed - use `.env.local` (gitignored)

### Technology Stack
- **UI**: React 19 + TypeScript ~6.0 (strict mode)
- **Build**: Vite 8
- **AI**: Google Gemini API or Qwen (OpenAI-compatible)
- **Styling**: Tailwind CSS via CDN
- **Markdown**: `marked` + KaTeX

### Testing Requirements
- Project has no unit tests - add input validation and error handling in service functions
- Test AI interactions manually via browser dev tools

### Common Patterns

**Component Props Interface:**
```typescript
interface FooProps {
  patentData: PatentData;
  updatePatentData: (field: keyof PatentData, value: any) => void;
  onBack: () => void;
}
```

**AI Calling Pattern:**
```typescript
const handleAIAction = async () => {
  setIsLoading(true);
  try {
    const text = await geminiService.someFunc(params);
    const html = renderMarkdown(text);
    updatePatentData('fieldName', html);
  } catch (err) {
    setError("操作失败，请重试");
  } finally {
    setIsLoading(false);
  }
};
```

### User Workflow
```
Dashboard (工作台)
  └─ NoveltySearch（新颖性评估）   ← Gemini + Google Search
       └─ PatentDrafter（智能撰写） ← Gemini generates abstract/claims/embodiments
            └─ Editor（文书润色）   ← Polish + Mock review + Export
```

## Dependencies

### External
- `react` ^19.2.0 - UI framework
- `react-dom` ^19.2.0 - React DOM rendering
- `@google/genai` ^1.30.0 - Google Gemini SDK
- `marked` 17.0.5 - Markdown parsing
- `katex` 0.16.44 - LaTeX math rendering
- `@vitejs/plugin-react` ^6.0.1 - Vite React plugin
- `typescript` ~6.0.2 - Type safety
- `vite` ^8.0.3 - Build tool

### Internal
- `components/` - React UI components
- `services/` - Business logic (AI, storage, markdown)
- `types.ts` - Shared TypeScript interfaces
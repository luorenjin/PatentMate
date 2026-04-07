<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-06 | Updated: 2026-04-06 -->

# components

## Purpose

React UI components implementing the 4-stage patent drafting workflow. Each component corresponds to a major workflow stage with lazy loading for optimal performance.

## Key Files

| File | Description |
|------|-------------|
| `Dashboard.tsx` | Draft list management with create/delete functionality - the app entry point |
| `Sidebar.tsx` | Left navigation sidebar with view switching and chat toggle |
| `PatentDraft.tsx` | Technical disclosure intake: patent type, field, questionnaire, and summary confirmation |
| `NoveltySearch.tsx` | Disclosure evaluation, novelty assessment, and protection strategy refinement |
| `Drafting/DraftingContainer.tsx` | Stage-based drafting flow for abstract, claims, description, embodiment, and drawings |
| `Editor.tsx` | Document polishing, mock review, and export functionality |
| `ChatAssistant.tsx` | Floating patent law chatbot (lazy loaded) |
| `RichTextEditor.tsx` | Markdown + LaTeX editor component |

## For AI Agents

### Working In This Directory

- All components follow the standard props interface pattern
- Components are lazy loaded in App.tsx for performance
- Use Tailwind CSS classes for styling (CDN-loaded)
- Each view component receives: `patentData`, `updatePatentData`, `onBack`, and optionally `onSave`, `setView`

### Props Interface Pattern

```typescript
interface FooProps {
  patentData: PatentData;
  updatePatentData: (key: keyof PatentData, value: any) => void;
  onBack: () => void;
  // Optional:
  onSave?: () => void;
  setView?: (view: AppView) => void;
}
```

### State Management

- Local state via `useState` for UI state (loading, errors, form inputs)
- Patent data passed via props from App.tsx (no Redux/Zustand)
- Use standard pattern: `const [isLoading, setIsLoading] = useState(false);`

### Common Patterns

**Loading State + Error Handling:**

```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleAction = async () => {
  if (!validInput) { setError("请先填写..."); return; }
  setError(null);
  setIsLoading(true);
  try {
    const result = await service.someMethod(params);
    updatePatentData('fieldName', result);
  } catch (err) {
    setError("操作失败，请重试");
  } finally {
    setIsLoading(false);
  }
};
```

**Back Navigation:**

```typescript
const handleBack = () => {
  if (onSave) onSave();  // Auto-save on back
  onBack();
};
```

## Component Details

### Dashboard.tsx

- Lists all patent drafts from localStorage
- Create new patent button
- Open/delete existing patents
- Displays last modified time and status

### Sidebar.tsx

- Navigation menu: Dashboard + 4-stage patent workflow
- Active view indicator
- Chat assistant toggle button
- Disable views when no patent is active

### PatentDraft.tsx

- Step 1 technical disclosure workflow
- Patent type selection, technical field selection, and disclosure questionnaire
- Resume user progress from stored patent data

### NoveltySearch.tsx

- Step 2 evaluation workflow after disclosure completion
- Technical disclosure summary generation and refinement
- Novelty search report with prior art analysis
- Google Search integration via AI

### Drafting/DraftingContainer.tsx

- Step 3 stage-based drafting workflow
- Progress stepper for abstract, claims, description, embodiment, and drawings
- Confirmation gate before moving to the next drafting stage
- Writes final drafting outputs back into patentData for Editor

### Editor.tsx

- Rich text editing with Markdown + LaTeX support
- Mock review simulation
- Patent readiness scoring
- Export to text/markdown
- Review summary generation

### ChatAssistant.tsx

- Floating patent law chatbot
- Lazy loaded for performance
- Context-aware based on current view and patent data

### RichTextEditor.tsx

- Markdown input with live preview
- KaTeX LaTeX math support
- Toolbar for common formatting

## Dependencies

### Internal

- `types.ts` - PatentData, AppView types
- `services/aiService.ts` - AI functions
- `services/markdownService.ts` - renderMarkdown
- `services/storageService.ts` - localStorage operations

### External

- `react` - UI framework
- `marked` - Markdown rendering
- `katex` - LaTeX math

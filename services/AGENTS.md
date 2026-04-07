<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-06 | Updated: 2026-04-06 -->

# services

## Purpose

Business logic services for AI interactions, localStorage persistence, and Markdown/LaTeX rendering.

## Key Files

| File | Description |
| ------ | ------------- |
| `aiService.ts` | Dual-provider AI service (Gemini/Qwen) for all patent-related AI operations |
| `storageService.ts` | localStorage CRUD operations for patent drafts |
| `markdownService.ts` | Markdown + KaTeX LaTeX to HTML rendering |

## For AI Agents

### Working In This Directory

- All AI outputs must be converted to HTML via `renderMarkdown()` before storing in patent data
- Use `document.createElement('DIV').textContent = html` to strip HTML tags before sending to AI
- All service functions should have try/catch error handling
- Return appropriate error messages in Chinese for user-facing errors

### Error Handling Pattern

```typescript
try {
  const result = await service.method(params);
  return result;
} catch (error) {
  console.error("Method failed:", error);
  return defaultValue; // or throw
}
```

## Service Details

### aiService.ts

Core AI service with dual-provider support (Gemini/Qwen). Key functions:

**Disclosure Interview:**

- `runDisclosureInterview()` - Q&A loop for technical disclosure collection
- Generates summary, technical problem, highlights, embodiments

**Novelty Search:**

- `generateNoveltySearchReport()` - Prior art analysis with Google Search grounding

**Patent Drafting:**

- `generateClaimStrategyPackage()` - Claim strategy with independent/dependent claims
- `generatePatentSection()` - Generate abstract, claims, detailed description
- `generatePatentDrawing()` - AI image generation for patent drawings
- `refineText()` - Text polishing and improvement

**Review:**

- `generateMockReview()` - Simulated patent review with scoring
- `generateReviewSummary()` - Overall review summary

**Chat:**

- `createChatSession()` - Patent law chatbot with context awareness

**Configuration:**

- Uses environment variables: `AI_PROVIDER`, `GEMINI_API_KEY`, `QWEN_API_KEY`, model versions
- Fallback from Qwen to Gemini if API key missing

### storageService.ts

localStorage operations for patent persistence:

**Functions:**

- `savePatentToStorage()` - Save/update patent draft
- `loadAllPatents()` - Get all patents sorted by lastModified
- `loadPatentById()` - Get single patent by ID
- `deletePatentFromStorage()` - Remove patent
- `createNewPatentData()` - Initialize new patent with defaults
- `clearAllPatents()` - Development helper (use with caution)

**Storage Key:** `patent_mate_drafts`

### markdownService.ts

Markdown + LaTeX rendering:

**Functions:**

- `renderMarkdown()` - Convert Markdown to HTML with KaTeX support
- `stripHtml()` - Strip HTML tags to get plain text

**Features:**

- GitHub Flavored Markdown support
- KaTeX for LaTeX math rendering (`$inline$` and `$$block$$`)
- Syntax highlighting for code blocks
- Tables, task lists, strikethrough

## Dependencies

### Internal

- `types.ts` - TypeScript interfaces (PatentData, ClaimStrategyPackage, etc.)
- `@/` path alias resolves to project root

### External

- `@google/genai` ^1.30.0 - Google Gemini SDK
- `marked` 17.0.5 - Markdown parsing
- `katex` 0.16.44 - LaTeX math rendering

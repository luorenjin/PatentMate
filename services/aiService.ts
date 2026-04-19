import { GoogleGenAI } from "@google/genai";
import type {
  ClaimStrategyPackage,
  DisclosureAnswer,
  DisclosureData,
  DisclosureInterviewTurn,
  DisclosureInnovationAssessment,
  NoveltyReport,
  PatentData,
  PatentType,
  ReviewResult,
  TechnicalField,
  TechnicalDisclosureSummary,
} from "../types";
import { generateDeepQuestionnaire } from "./disclosureTemplateService";
import { captureError, monitorAICall, addBreadcrumb } from "./sentryService";
import { checkQuota, incrementUsage } from "./quotaService";

const PROVIDER_GEMINI = "gemini";
const PROVIDER_QWEN = "qwen";

const AI_PROVIDER = (process.env.AI_PROVIDER || PROVIDER_GEMINI).toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
const QWEN_API_KEY = process.env.QWEN_API_KEY || "";
const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

const MODEL_GEMINI_FAST = process.env.GEMINI_MODEL_FAST || "gemini-2.5-flash";
const MODEL_GEMINI_PRO = process.env.GEMINI_MODEL_PRO || "gemini-2.5-pro";
const MODEL_GEMINI_VISION = process.env.GEMINI_MODEL_VISION || MODEL_GEMINI_PRO;
const MODEL_GEMINI_IMAGE =
  process.env.GEMINI_MODEL_IMAGE || "imagen-4.0-generate-001";

const MODEL_QWEN_FAST = process.env.QWEN_MODEL_FAST || "qwen-plus";
const MODEL_QWEN_PRO = process.env.QWEN_MODEL_PRO || "qwen-max";
const MODEL_QWEN_VISION = process.env.QWEN_MODEL_VISION || "";
const MODEL_QWEN_IMAGE = process.env.QWEN_MODEL_IMAGE || "wanx2.1-t2i-turbo";

const DEFAULT_REVIEW_RESULT: ReviewResult = {
  score: 0,
  feedback: "审查服务暂时不可用，请稍后重试。",
  passed: false,
  detailedIssues: [],
};

const geminiClient = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

interface QwenMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

interface QwenChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface ChatSessionResponse {
  text?: string;
}

export interface ChatSession {
  sendMessage: (input: { message: string }) => Promise<ChatSessionResponse>;
}

interface AIRequestOptions {
  userId?: string;
}

interface ChatSessionOptions extends AIRequestOptions {
  contextPrompt?: string;
}

interface DisclosureInterviewResult {
  assistantReply: string;
  summary: string;
  technicalProblem: string;
  existingSolutionIssues: string;
  technicalHighlights: string[];
  embodiments: string[];
  advantages: string[];
  alternativeSolutions: string[];
  evidenceMaterials: string[];
  pendingQuestions: string[];
  risks: string[];
}

export interface DocumentDisclosureExtractionResult {
  sourceSummary: string;
  keyPoints: string[];
  technicalProblem: string;
  existingSolutionIssues: string;
  answers: DisclosureAnswer[];
  technicalHighlights: string[];
  embodiments: string[];
  advantages: string[];
  alternativeSolutions: string[];
  evidenceMaterials: string[];
  risks: string[];
  innovationAssessment: DisclosureInnovationAssessment;
}

export type RefineTextAction = "expand" | "polish" | "fix_legal";

export type RefineTextSection = Extract<
  keyof PatentData,
  | "abstract"
  | "claims"
  | "technicalField"
  | "backgroundArt"
  | "inventionContent"
  | "descriptionOfDrawings"
  | "detailedDescription"
>;

export interface RefineTextOptions {
  section?: RefineTextSection;
  title?: string;
  patentType?: PatentData["patentType"];
  operationScope?: "section" | "selection";
  technicalField?: string;
  technicalProblem?: string;
  backgroundArt?: string;
  inventionContent?: string;
  descriptionOfDrawings?: string;
  claimStrategy?: string;
  userId?: string;
}

const REFINE_ACTION_LABELS: Record<RefineTextAction, string> = {
  expand: "智能扩充",
  polish: "语言润色",
  fix_legal: "法言法语",
};

const REFINE_SECTION_LABELS: Record<RefineTextSection, string> = {
  abstract: "摘要",
  claims: "权利要求书",
  technicalField: "技术领域",
  backgroundArt: "背景技术",
  inventionContent: "发明内容",
  descriptionOfDrawings: "附图说明",
  detailedDescription: "具体实施方式",
};

const REFINE_TEXT_SYSTEM_INSTRUCTION = `
  你是一位资深中国专利代理师，熟悉 CNIPA 审查口径、说明书充分公开要求、权利要求撰写规范以及常见驳回风险。
  你只改写用户提供的专利文本，不输出解释、不做寒暄、不写代码块。
  你必须严格遵守以下原则：
  1. 保留原文已披露的技术事实、编号、公式、图号、层级结构和技术逻辑。
  2. 不编造实验数据、性能提升比例、绝对化效果、实施例编号或不存在的附图。
  3. “语言润色”只优化表达和逻辑，不改变技术边界；“智能扩充”只在已有披露基础上补足细节；“法言法语”要改成专利申请文体，但不能硬造新方案。
  4. 避免口语化、宣传性和绝对化措辞，如“最佳”“完美”“完全解决”“显著优于一切现有技术”。
`;

const PAGE_OCR_SYSTEM_INSTRUCTION = `
  你是一位精通中文技术资料识别的 OCR 助手，擅长从专利交底、机械图纸说明、工艺文件和研发报告页面中提取正文。
  你只输出识别后的纯文本，不输出解释、总结、编号说明或 Markdown 代码块。
  如果图片中存在页眉页脚、页码、水印或重复章标题，仅在其对技术理解有帮助时保留。
  如果存在表格，请尽量按“字段：值”或逐行文本的形式还原。
`;

const DOCUMENT_DISCLOSURE_SYSTEM_INSTRUCTION = `
  你是一位资深中国专利代理师，擅长把研发资料、技术交底模板、测试报告和机械结构说明整理为可直接起草专利的结构化交底。
  你必须只依据资料中已经出现的内容填写答案，不得编造参数、实验结论、创新点或实施例。
  如果资料信息不足，可以留空字符串或空数组，但要在 risks 和 innovationAssessment 中指出缺口。
  对机械类资料，优先识别结构组成、连接关系、运动/受力路径、材料与强度、加工工艺、装配关系、技术效果与量化证据。
`;

const useGemini = (): boolean => AI_PROVIDER !== PROVIDER_QWEN;

const createEmptyInnovationAssessment = (): DisclosureInnovationAssessment => {
  return {
    novelty: "",
    creativity: "",
    utility: "",
    optimizationSuggestions: [],
    recommendedFocus: [],
  };
};

const getTextModel = (level: "fast" | "pro"): string => {
  if (useGemini()) {
    return level === "fast" ? MODEL_GEMINI_FAST : MODEL_GEMINI_PRO;
  }
  return level === "fast" ? MODEL_QWEN_FAST : MODEL_QWEN_PRO;
};

const extractTextFromResponse = (raw: string): string => {
  const text = raw.trim();
  if (!text) return "";

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return text;
};

// 更健壮地提取 JSON 对象，兼容 Qwen 可能的多余文本、JSON 字符串等
const extractJsonObject = (raw: string): string => {
  const text = extractTextFromResponse(raw);
  // 1. 直接是 JSON 字符串
  if (/^\s*\{[\s\S]*\}\s*$/.test(text)) return text.trim();
  // 2. 可能是 JSON 外包裹文本
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  // 3. 可能是 JSON 字符串（带转义）
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) return text;
  } catch {}
  return text;
};

const requestQwenChat = async (
  messages: QwenMessage[],
  model: string,
  jsonMode: boolean = false,
): Promise<string> => {
  try {
    if (!QWEN_API_KEY) {
      console.error("QWEN_API_KEY is missing.");
      return "";
    }

    const response = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${QWEN_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Qwen request failed:", errText);
      return "";
    }

    const data = (await response.json()) as QwenChatCompletionResponse;
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("requestQwenChat failed:", error);
    return "";
  }
};

const getQuotaExceededMessage = async (
  userId?: string,
): Promise<string | null> => {
  if (!userId) {
    return null;
  }

  const quotaCheck = await checkQuota(userId);
  if (quotaCheck.allowed) {
    return null;
  }

  const message =
    quotaCheck.message ||
    "您本月的 AI 调用配额已用完，请升级订阅计划后继续使用。";
  addBreadcrumb("ai.quota_exceeded", message, "warning");
  return message;
};

export const generateText = async (
  prompt: string,
  level: "fast" | "pro",
  options?: {
    systemInstruction?: string;
    useGoogleSearch?: boolean;
    jsonMode?: boolean;
    userId?: string; // P1-1: Add userId for quota checking
  },
): Promise<{
  text: string;
  groundingLinks: Array<{ title: string; uri: string }>;
}> => {
  return monitorAICall(`generateText_${level}`, async () => {
    try {
      // P1-1: Check quota before AI call
      if (options?.userId) {
        const quotaCheck = await checkQuota(options.userId);
        if (!quotaCheck.allowed) {
          const error = new Error(quotaCheck.message || "配额不足");
          captureError(error, {
            operation: "generateText",
            userId: options.userId,
            quotaRemaining: quotaCheck.remaining,
          });
          addBreadcrumb(
            "ai.quota_exceeded",
            quotaCheck.message || "配额不足",
            "warning",
          );
          return {
            text: "",
            groundingLinks: [],
          };
        }
      }

      addBreadcrumb(
        "ai.request",
        `generateText (${level}, ${prompt.length} chars)`,
        "info",
      );

      const model = getTextModel(level);

      if (useGemini()) {
        if (!geminiClient) {
          const error = new Error("Gemini API key is missing");
          captureError(error, {
            operation: "generateText",
            provider: "gemini",
          });
          console.error("Gemini API key is missing.");
          return { text: "", groundingLinks: [] };
        }

        const response = await geminiClient.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(options?.useGoogleSearch
              ? { tools: [{ googleSearch: {} }] }
              : {}),
            ...(options?.jsonMode
              ? { responseMimeType: "application/json" }
              : {}),
            ...(options?.systemInstruction
              ? { systemInstruction: options.systemInstruction }
              : {}),
          },
        });

        const groundingChunks =
          response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const groundingLinks = Array.isArray(groundingChunks)
          ? groundingChunks
              .filter(
                (chunk) =>
                  typeof chunk?.web?.title === "string" &&
                  typeof chunk?.web?.uri === "string",
              )
              .map((chunk) => ({
                title: chunk.web!.title as string,
                uri: chunk.web!.uri as string,
              }))
          : [];

        addBreadcrumb(
          "ai.response",
          `generateText completed (${response.text?.length || 0} chars)`,
          "info",
        );

        // P1-1: Increment usage after successful call
        if (options?.userId && response.text) {
          void incrementUsage(options.userId, 1);
        }

        return {
          text: response.text || "",
          groundingLinks,
        };
      }

      const qwenMessages: QwenMessage[] = [];
      if (options?.systemInstruction) {
        qwenMessages.push({
          role: "system",
          content: options.systemInstruction,
        });
      }
      qwenMessages.push({ role: "user", content: prompt });

      const text = await requestQwenChat(
        qwenMessages,
        model,
        !!options?.jsonMode,
      );

      addBreadcrumb(
        "ai.response",
        `generateText completed (${text?.length || 0} chars)`,
        "info",
      );

      // P1-1: Increment usage after successful call
      if (options?.userId && text) {
        void incrementUsage(options.userId, 1);
      }

      return { text, groundingLinks: [] };
    } catch (error) {
      captureError(error as Error, {
        operation: "generateText",
        level,
        provider: useGemini() ? "gemini" : "qwen",
      });
      console.error("generateText failed:", error);
      return { text: "", groundingLinks: [] };
    }
  });
};

const truncateForPrompt = (value: string, maxLength: number = 1200): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}\n……（以下内容已截断，共省略 ${normalized.length - maxLength} 个字符）`;
};

const getPatentTypeLabel = (patentType?: PatentData["patentType"]): string => {
  return patentType === "utility" ? "实用新型专利" : "发明专利";
};

const getRefineActionRules = (
  action: RefineTextAction,
  options?: RefineTextOptions,
): string[] => {
  const scopeLabel =
    options?.operationScope === "selection" ? "所选片段" : "当前章节";

  switch (action) {
    case "expand":
      return [
        `在原文已经披露的技术方案基础上补足 ${scopeLabel} 的实现细节、部件关系、步骤衔接、限定条件或可选实施方式。`,
        "优先补充能支撑专利授权和充分公开的内容，如模块交互、处理流程、结构连接方式、参数关系或实施变体。",
        "如果原文缺少依据，宁可克制扩写，也不要杜撰实验数据、具体数值、对比结论或新的核心技术特征。",
      ];
    case "fix_legal":
      return [
        `将 ${scopeLabel} 改写为中国专利申请常用文体，统一术语和句式，使其更适合正式专利文本。`,
        "删除口语化、宣传性和结论先行的表达，改为审慎、客观、可审查的措辞。",
        "避免绝对化表述，必要时使用“可选地”“进一步地”“在一些实施方式中”等稳妥表达。",
      ];
    case "polish":
    default:
      return [
        `仅优化 ${scopeLabel} 的行文、术语、逻辑衔接和语病，不新增无依据的技术内容。`,
        "保留原有技术事实、保护边界、结论方向和段落结构，避免越润色越跑题。",
        "优先消除歧义、重复、代词指代不清和工程描述中过于口语化的问题。",
      ];
  }
};

const getRefineSectionRules = (
  section?: RefineTextSection,
  action?: RefineTextAction,
): string[] => {
  switch (section) {
    case "abstract":
      return [
        "摘要应围绕技术问题、核心方案和主要效果进行客观概括，不写营销性评价。",
        "不要把摘要改成权利要求式长句；若使用“本发明/本实用新型公开了……”，后续要紧接技术方案描述。",
        action === "expand"
          ? "扩充时优先补足关键技术特征和主要处理逻辑，不要扩成实施例全文。"
          : "保持摘要精炼，避免无意义铺陈。",
      ];
    case "claims":
      return [
        "保留现有权利要求编号顺序、引用关系和层级，不随意增删权利要求。",
        "每条权利要求尽量保持为一句完整法律句式，特征之间的关系要明确。",
        action === "fix_legal"
          ? "独立权利要求优先使用“其特征在于”，从属权利要求优先使用“根据权利要求X所述……其特征在于……”。"
          : "润色或扩充时不要无依据扩大保护范围，也不要把从属特征写回独立权利要求。",
      ];
    case "technicalField":
      return [
        "技术领域通常使用“本发明涉及……技术领域，尤其涉及……”或对应实用新型表达。",
        "保持篇幅简洁，只说明所属技术领域，不展开背景、效果或实施细节。",
      ];
    case "backgroundArt":
      return [
        "先客观交代现有技术，再指出其缺陷或不足，且缺陷应与待解决的技术问题对应。",
        "避免直接贬损现有技术或作无法验证的对比结论。",
      ];
    case "inventionContent":
      return [
        "优先写清技术问题、解决方案和有益效果三层逻辑，结构要清楚。",
        "扩充时重点补足核心技术手段之间的配合关系，而不是泛泛描述目标。",
      ];
    case "descriptionOfDrawings":
      return [
        "按图号逐项说明，常用句式为“图1为……示意图”“图2为……流程图”。",
        "不得新增原文不存在的图号，也不要把附图说明写成具体实施方式。",
      ];
    case "detailedDescription":
      return [
        "围绕实施例展开，明确模块组成、连接关系、步骤顺序、参数条件和可选变形。",
        "适当使用“可选地”“进一步地”“在一些实施方式中”等专利文体连接语。",
      ];
    default:
      return [
        "保持原文结构、编号和公式不变，使文本更符合中国专利申请文件的表达习惯。",
      ];
  }
};

const buildRefineContextLines = (options?: RefineTextOptions): string[] => {
  if (!options) {
    return [];
  }

  const lines = [
    options.title ? `发明名称：${truncateForPrompt(options.title, 120)}` : "",
    `文稿类型：${getPatentTypeLabel(options.patentType)}`,
    options.section
      ? `当前章节：${REFINE_SECTION_LABELS[options.section]}`
      : "",
    options.technicalField
      ? `技术领域参考：${truncateForPrompt(options.technicalField, 220)}`
      : "",
    options.technicalProblem
      ? `待解决问题参考：${truncateForPrompt(options.technicalProblem, 260)}`
      : "",
    options.backgroundArt
      ? `背景技术参考：${truncateForPrompt(options.backgroundArt, 360)}`
      : "",
    options.inventionContent
      ? `核心技术方案参考：${truncateForPrompt(options.inventionContent, 520)}`
      : "",
    options.descriptionOfDrawings
      ? `附图说明参考：${truncateForPrompt(options.descriptionOfDrawings, 240)}`
      : "",
    options.claimStrategy
      ? `保护策略参考：${truncateForPrompt(options.claimStrategy, 320)}`
      : "",
  ].filter(Boolean);

  return lines;
};

const buildDisclosureQuestionnaireSchema = (
  patentType: PatentType,
  technicalField: TechnicalField,
): string => {
  return generateDeepQuestionnaire(patentType, technicalField)
    .map((question, index) => {
      return [
        `${index + 1}. ${question.id}｜${question.question}`,
        `   仅在资料中存在直接依据时才允许映射：${question.helpText}`,
      ].join("\n");
    })
    .join("\n");
};

const normalizeDisclosureAnswerList = (
  value: unknown,
  validQuestionIds: Set<string>,
): DisclosureAnswer[] => {
  const now = Date.now();

  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is { questionId?: string; answer?: string } =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        questionId:
          typeof item.questionId === "string" ? item.questionId.trim() : "",
        answer: typeof item.answer === "string" ? item.answer.trim() : "",
      }))
      .filter(
        (item) =>
          item.questionId &&
          item.answer &&
          validQuestionIds.has(item.questionId),
      )
      .map((item) => ({
        questionId: item.questionId,
        answer: item.answer,
        lastModified: now,
      }));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(
        ([questionId, answer]) =>
          validQuestionIds.has(questionId) &&
          typeof answer === "string" &&
          answer.trim(),
      )
      .map(([questionId, answer]) => ({
        questionId,
        answer: (answer as string).trim(),
        lastModified: now,
      }));
  }

  return [];
};

const normalizeInnovationAssessment = (
  value: unknown,
): DisclosureInnovationAssessment => {
  const fallback = createEmptyInnovationAssessment();

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const assessment = value as Record<string, unknown>;

  return {
    novelty: typeof assessment.novelty === "string" ? assessment.novelty : "",
    creativity:
      typeof assessment.creativity === "string" ? assessment.creativity : "",
    utility: typeof assessment.utility === "string" ? assessment.utility : "",
    optimizationSuggestions: Array.isArray(assessment.optimizationSuggestions)
      ? assessment.optimizationSuggestions.filter(
          (item): item is string => typeof item === "string",
        )
      : fallback.optimizationSuggestions,
    recommendedFocus: Array.isArray(assessment.recommendedFocus)
      ? assessment.recommendedFocus.filter(
          (item): item is string => typeof item === "string",
        )
      : fallback.recommendedFocus,
  };
};

/**
 * 对扫描页图片执行 OCR，提取可继续用于技术交底整理的正文文本。
 * @param imageBase64 PDF 页面渲染后的 PNG Base64 内容，不含 data URL 前缀。
 * @param pageNumber 当前页码，仅用于提示词上下文。
 * @param options AI 调用配置，主要用于配额统计。
 * @returns OCR 得到的纯文本；失败时返回空字符串。
 */
export const extractTextFromPageImage = async (
  imageBase64: string,
  pageNumber: number,
  options?: AIRequestOptions,
): Promise<string> => {
  if (!imageBase64.trim()) {
    return "";
  }

  const prompt = `
    请识别这张技术资料图片中的文字内容。当前图片来自资料第 ${pageNumber} 页。

    输出要求：
    1. 仅输出识别后的正文纯文本，不要解释、不加前缀、不加 Markdown 代码块。
    2. 保留关键标题、项目符号、序号、参数值、材料牌号、尺寸、公差、步骤顺序和测试数据。
    3. 如果是机械类资料，请重点保留结构名称、连接关系、工艺步骤、性能指标和实验数据。
    4. 如有模糊或不可辨认内容，可跳过，不要猜测未显示清楚的数字。
  `;

  try {
    const quotaExceededMessage = await getQuotaExceededMessage(options?.userId);
    if (quotaExceededMessage) {
      return "";
    }

    if (geminiClient) {
      const response = await geminiClient.models.generateContent({
        model: MODEL_GEMINI_VISION,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: imageBase64,
                },
              },
            ],
          },
        ] as any,
        config: {
          systemInstruction: PAGE_OCR_SYSTEM_INSTRUCTION,
        },
      } as any);

      const text = extractTextFromResponse(response.text || "");
      if (options?.userId && text) {
        void incrementUsage(options.userId, 1);
      }
      return text;
    }

    if (!QWEN_API_KEY || !MODEL_QWEN_VISION) {
      console.error("Vision OCR requires Gemini API key or QWEN_MODEL_VISION.");
      return "";
    }

    const qwenMessages: QwenMessage[] = [
      { role: "system", content: PAGE_OCR_SYSTEM_INSTRUCTION },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${imageBase64}` },
          },
        ],
      },
    ];

    const text = await requestQwenChat(qwenMessages, MODEL_QWEN_VISION);
    const normalized = extractTextFromResponse(text);
    if (options?.userId && normalized) {
      void incrementUsage(options.userId, 1);
    }
    return normalized;
  } catch (error) {
    console.error("extractTextFromPageImage failed:", error);
    return "";
  }
};

/**
 * 将上传的研发资料整理为结构化技术交底答案，并补充创新点审查视角下的优化建议。
 * @param title 发明名称。
 * @param patentType 专利类型，用于绑定不同问卷结构。
 * @param technicalField 技术领域，用于生成领域特定问题和机械类定向约束。
 * @param documentText 从 DOCX/PDF 中提取的纯文本内容。
 * @param options AI 调用配置，主要用于配额统计。
 * @returns 可直接回填到 DisclosureData.answers 的答案集合及创新点评估；失败时返回空结构。
 */
export const extractStructuredDisclosureFromDocument = async (
  title: string,
  patentType: PatentType,
  technicalField: TechnicalField,
  documentText: string,
  options?: AIRequestOptions,
): Promise<DocumentDisclosureExtractionResult> => {
  const fallback: DocumentDisclosureExtractionResult = {
    sourceSummary: "",
    keyPoints: [],
    technicalProblem: "",
    existingSolutionIssues: "",
    answers: [],
    technicalHighlights: [],
    embodiments: [],
    advantages: [],
    alternativeSolutions: [],
    evidenceMaterials: [],
    risks: [],
    innovationAssessment: createEmptyInnovationAssessment(),
  };

  if (!documentText.trim()) {
    return fallback;
  }

  const questions = generateDeepQuestionnaire(patentType, technicalField);
  const validQuestionIds = new Set(questions.map((question) => question.id));
  const questionnaireSchema = buildDisclosureQuestionnaireSchema(
    patentType,
    technicalField,
  );
  const fieldFocus =
    technicalField === "机械"
      ? "当前资料为机械类申请，请重点提取结构构成、连接关系、运动路径、材料牌号、强度校核、加工工艺、公差和技术效果。"
      : `当前资料技术领域为${technicalField}，请优先提取与该领域审查关注点对应的关键技术特征、参数和效果证据。`;
  const prompt = `
    请先完整理解下面上传的研发资料，再整理成供后续专利评估与撰写使用的结构化交底结果。

    发明名称：${title}
    专利类型：${getPatentTypeLabel(patentType)}
    技术领域：${technicalField}
    ${fieldFocus}

    可选问卷映射参考（只有在资料中存在直接、明确依据时才允许填写 questionAnswers；绝不能为了覆盖率猜测或补全）：
    ${questionnaireSchema}

    原始资料文本（可能包含 OCR 噪声）：
    ${truncateForPrompt(documentText, 18000)}

    处理要求：
    1. 必须以“材料事实”为中心组织结果，优先抽取技术问题、现有不足、核心方案、关键特征、实施方式、证据材料和风险，不要先按问卷思考。
    2. sourceSummary：用 180-260 字概括资料中的核心技术方案。
    3. technicalProblem：提炼资料中明确要解决的技术问题或工程痛点。
    4. existingSolutionIssues：提炼现有方案、现有结构或现有工艺的不足。
    5. keyPoints：提炼 4-8 条资料中最值得继续保护或补充证明的技术要点。
    6. technicalHighlights、embodiments、advantages、alternativeSolutions、evidenceMaterials、risks 的提取规则与现有技术交底一致，尤其不要把量化数据写进 alternativeSolutions。
    7. questionAnswers 只是可选输出：仅当某个问卷问题能被资料中的原句、明确事实、明确参数或明确结构关系直接支撑时才填写；无法直接对应时必须省略，不得猜测、归纳补全或按模板硬凑。
    8. innovationAssessment 需要分别从新颖性、创造性、实用性三个角度评估当前创新点质量，并给出 optimizationSuggestions 与 recommendedFocus。
    9. 如资料疑似机械模板，请保持部件名称、编号、参数和装配关系的一致性。

    请返回 JSON：
    {
      "sourceSummary": "...",
      "technicalProblem": "...",
      "existingSolutionIssues": "...",
      "keyPoints": ["..."],
      "questionAnswers": [
        { "questionId": "q1", "answer": "..." }
      ],
      "technicalHighlights": ["..."],
      "embodiments": ["..."],
      "advantages": ["..."],
      "alternativeSolutions": ["..."],
      "evidenceMaterials": ["..."],
      "risks": ["..."],
      "innovationAssessment": {
        "novelty": "...",
        "creativity": "...",
        "utility": "...",
        "optimizationSuggestions": ["..."],
        "recommendedFocus": ["..."]
      }
    }
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      systemInstruction: DOCUMENT_DISCLOSURE_SYSTEM_INSTRUCTION,
      userId: options?.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as {
      sourceSummary?: string;
      technicalProblem?: string;
      existingSolutionIssues?: string;
      keyPoints?: unknown;
      questionAnswers?: unknown;
      technicalHighlights?: unknown;
      embodiments?: unknown;
      advantages?: unknown;
      alternativeSolutions?: unknown;
      evidenceMaterials?: unknown;
      risks?: unknown;
      innovationAssessment?: unknown;
    };

    return {
      sourceSummary:
        typeof result.sourceSummary === "string" ? result.sourceSummary : "",
      technicalProblem:
        typeof result.technicalProblem === "string"
          ? result.technicalProblem
          : "",
      existingSolutionIssues:
        typeof result.existingSolutionIssues === "string"
          ? result.existingSolutionIssues
          : "",
      keyPoints: Array.isArray(result.keyPoints)
        ? result.keyPoints.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      answers: normalizeDisclosureAnswerList(
        result.questionAnswers,
        validQuestionIds,
      ),
      technicalHighlights: Array.isArray(result.technicalHighlights)
        ? result.technicalHighlights.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      embodiments: Array.isArray(result.embodiments)
        ? result.embodiments.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      advantages: Array.isArray(result.advantages)
        ? result.advantages.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      alternativeSolutions: Array.isArray(result.alternativeSolutions)
        ? result.alternativeSolutions.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      evidenceMaterials: Array.isArray(result.evidenceMaterials)
        ? result.evidenceMaterials.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      risks: Array.isArray(result.risks)
        ? result.risks.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      innovationAssessment: normalizeInnovationAssessment(
        result.innovationAssessment,
      ),
    };
  } catch (error) {
    console.error("extractStructuredDisclosureFromDocument failed:", error);
    return fallback;
  }
};

/**
 * Performs a Novelty Search using gemini-2.5-flash and Google Search Grounding.
 * This fulfills Requirement 2: "Check patent system, judge success probability".
 */
export const performNoveltySearch = async (
  title: string,
  description: string,
  options?: AIRequestOptions,
): Promise<NoveltyReport> => {
  const prompt = `
    作为一位资深的中国专利审查员，请对以下发明创意进行新颖性检索和评估。
    
    发明名称：${title}
    简要说明：${description}
    
    任务：
    1. 使用 Google Search 搜索现有的类似技术、专利或学术论文（Prior Art）。
    2. 分析该创意的“新颖性”、“创造性”和“实用性”。
    3. 给出一个 0-100 的预估授权成功率分数。
    4. 筛选出最相关的3个现有技术链接。
    
    JSON输出要求（非常重要）：
    - 返回一个纯 JSON 对象。
    - **analysis 字段**：只包含对技术方案的新颖性、创造性分析文字。**严禁**在此字段中重复列出“分数”或“链接列表”，也不要包含“综上所述”之类的废话。请使用 Markdown 格式（如列表、粗体）排版分析内容。
    - **score 字段**：只包含数字（0-100）。
    - **priorArtLinks 字段**：包含链接对象的数组。
    
    如果涉及数学公式，请必须使用 **LaTeX** 格式（例如 $ E=mc^2 $）。
    
    JSON结构如下：
    {
      "score": number,  // 总分 0-100
      "scoreBreakdown": {
        "novelty": number,      // 新颖性 0-40
        "creativity": number,   // 创造性 0-40
        "utility": number       // 实用性 0-20
      },
      "analysis": "详细的定性分析报告（不要包含分数和链接列表）...",
      "priorArtLinks": [{"title": "标题", "uri": "URL"}],
      "avoidanceRecommendations": ["规避建议1", "规避建议2"]
    }
  `;

  try {
    const { text, groundingLinks } = await generateText(prompt, "fast", {
      useGoogleSearch: useGemini(),
      userId: options?.userId,
    });

    if (!text) {
      return {
        score: 0,
        analysis: "检索服务暂时不可用，请稍后重试。",
        priorArtLinks: [],
      };
    }

    const jsonString = extractJsonObject(text);

    /** 从任意文本中尽力提取 0-100 数字分数 */
    const extractScore = (src: string): number => {
      // 1. "score": 82 或 "score": "82"
      const explicit = src.match(/"score"\s*:\s*["']?(\d{1,3})["']?/);
      if (explicit) {
        const n = parseInt(explicit[1], 10);
        if (n >= 0 && n <= 100) return n;
      }
      // 2. 退化到全文第一个 1-3 位整数（粗略）
      const loose = src.match(/\b([1-9]\d{0,2})\b/);
      if (loose) {
        const n = parseInt(loose[1], 10);
        if (n >= 0 && n <= 100) return n;
      }
      return 50; // 无法解析时给中性分，不误导用户
    };

    let report: NoveltyReport;
    try {
      report = JSON.parse(jsonString) as NoveltyReport;
      // score 可能是字符串 "82" 而非数字 82
      const rawScore = (report as any).score;
      report.score =
        typeof rawScore === "number"
          ? rawScore
          : typeof rawScore === "string"
            ? parseInt(rawScore, 10) || extractScore(jsonString)
            : extractScore(jsonString);
      if (report.score < 0 || report.score > 100)
        report.score = extractScore(jsonString);
      if (typeof report.analysis !== "string") report.analysis = "";
      if (!Array.isArray(report.priorArtLinks)) report.priorArtLinks = [];

      // 处理评分细分
      if (report.scoreBreakdown) {
        const breakdown = report.scoreBreakdown;
        if (
          typeof breakdown.novelty !== "number" ||
          breakdown.novelty < 0 ||
          breakdown.novelty > 40
        ) {
          delete report.scoreBreakdown;
        } else if (
          typeof breakdown.creativity !== "number" ||
          breakdown.creativity < 0 ||
          breakdown.creativity > 40
        ) {
          delete report.scoreBreakdown;
        } else if (
          typeof breakdown.utility !== "number" ||
          breakdown.utility < 0 ||
          breakdown.utility > 20
        ) {
          delete report.scoreBreakdown;
        }
      }

      // 处理规避建议
      if (!Array.isArray(report.avoidanceRecommendations)) {
        report.avoidanceRecommendations = [];
      }
    } catch (e) {
      // JSON 解析失败：用正则从原文中分别提取各字段
      const score = extractScore(jsonString);

      let analysis = "";
      // 尝试提取 analysis 字段值（允许内部有换行和引号）
      const analysisMatch = jsonString.match(
        /"analysis"\s*:\s*"([\s\S]*?)(?<!\\)",/,
      );
      if (analysisMatch) {
        analysis = analysisMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
      } else {
        const altMatch = jsonString.match(
          /analysis\s*[:=]\s*(["']?)([\s\S]*?)\1[,}]/,
        );
        if (altMatch) analysis = altMatch[2];
      }
      if (!analysis) analysis = text; // 最坏情况把原始文本投给前端

      report = { score, analysis, priorArtLinks: [] };
    }

    if (groundingLinks.length > 0) {
      const existingUris = new Set(
        report.priorArtLinks.map((item) => item.uri),
      );
      groundingLinks.forEach((link) => {
        if (!existingUris.has(link.uri)) {
          report.priorArtLinks.push(link);
        }
      });
    }

    report.priorArtLinks = report.priorArtLinks.slice(0, 3);
    return report;
  } catch (error) {
    console.error("Novelty search failed:", error);
    return {
      score: 0,
      analysis: "检索服务暂时不可用，请稍后重试。",
      priorArtLinks: [],
    };
  }
};

/**
 * Optimizes the invention content based on the novelty report analysis.
 */
export const optimizeInventionContent = async (
  currentContent: string,
  noveltyReport: Pick<NoveltyReport, "analysis" | "avoidanceRecommendations">,
  options?: AIRequestOptions,
): Promise<string> => {
  const avoidanceRecommendations = Array.isArray(
    noveltyReport.avoidanceRecommendations,
  )
    ? noveltyReport.avoidanceRecommendations
    : [];
  const avoidanceSummary =
    avoidanceRecommendations.length > 0
      ? avoidanceRecommendations
          .map((item, index) => `${index + 1}. ${item}`)
          .join("\n")
      : "未提供明确规避建议，请根据下方分析自行提炼差异化方向。";

  const prompt = `
    你是一位专业的专利工程师和技术专家。
    
    当前的发明内容概要：
    ${currentContent}
    
    请优先落实以下“专利规避建议”（这是本次改写的最高优先级）：
    ${avoidanceSummary}

    辅助参考的新颖性审查/分析意见（指出了现有技术的重合点或不足）：
    ${noveltyReport.analysis}
    
    任务：
    请输出一版可以直接替换“结构化交底摘要”的完整新文本，以提高其新颖性和授权概率。
    1. **规避现有技术**：优先根据“专利规避建议”加入真正能拉开差异的限制特征、结构关系、流程顺序、参数边界或应用条件。
    2. **突出创造性**：明确现有技术解决不了什么问题，以及本方案为什么不是顺手拼接出来的常规组合。
    3. **深化技术细节**：补足落地实施所需的关键步骤、部件协同关系或作用链条，但不得编造原始交底中没有出现的实验数据。
    4. **输出形态**：必须输出完整替代稿，不要写“补充如下”“新增如下”“在原基础上增加”等追加式措辞。
    5. **禁止项**：不要输出评分、授权概率、说明前言、标题或客套话。
    
    请直接返回优化后的文本内容，不要包含“好的”、“优化后的内容如下”等客套话。
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      userId: options?.userId,
    });
    return text || currentContent;
  } catch (error) {
    console.error("Optimization failed:", error);
    return currentContent;
  }
};

/**
 * Generates a plausible invention technical content based on the title.
 * "I'm feeling lucky" feature.
 */
export const generateInventionIdea = async (
  title: string,
  options?: AIRequestOptions,
): Promise<string> => {
  const prompt = `
    假设你是一位极具创造力的资深技术专家和发明家。
    请根据专利名称“${title}”，构思一个**具有突出的实质性特点和显著进步**的创新技术方案。
    
    思维指引（仅用于辅助构思，**禁止在输出中提及**）：
    你可以尝试运用分割、抽取、局部质量、非对称、合并、多用性等创新原理来解决潜在的技术矛盾，但输出必须是纯粹的技术语言。
    
    要求：
    1. **深度创新**：不要提供常规或显而易见的技术方案。思考如何通过独特的算法、新颖的结构设计、特殊的材料应用或跨领域的组合来解决问题。
    2. **技术落地**：具体描述核心技术手段（如具体的深度学习模型架构、特殊的机械连接结构、独特的化学反应条件等）。
    3. **输出规范**：内容必须是专业的技术描述，**严禁出现“TRIZ”、“发明原理”、“技术矛盾”等理论术语**。不要像教科书一样解释原理，而是直接描述技术本身。

    请以Markdown格式简要描述（300-500字）：
    1. **技术痛点**：本发明解决的特定问题。
    2. **核心技术方案**：详细展开，包含具体实施细节。
    3. **有益效果**：相比现有技术的具体优势。
    
    请直接输出发明内容描述，不要包含“好的”、“以下是方案”等客套话。
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      userId: options?.userId,
    });
    return text || "";
  } catch (error) {
    console.error("Failed to generate invention idea:", error);
    return "";
  }
};

/**
 * Analyzes the invention to extract Technical Field and Background Art (Defects).
 * Used for auto-filling data when moving to Drafter.
 */
export const analyzePatentBasics = async (
  title: string,
  inventionContent: string,
  options?: AIRequestOptions,
): Promise<{ technicalField: string; backgroundArt: string }> => {
  const prompt = `
    基于以下发明信息：
    名称：${title}
    内容：${inventionContent}
    
    请分析并提取以下两个信息，以JSON格式返回：
    1. technicalField: 该发明所属的IPC技术领域（如“计算机视觉”、“机械制造”）。
    2. backgroundArt: 基于该发明解决的问题，逆向推导“背景技术”中现有技术存在的缺陷和不足（即本发明要解决的痛点）。
    
    JSON格式示例：
    {
      "technicalField": "...",
      "backgroundArt": "..."
    }
    请直接返回JSON。
  `;

  try {
    const { text } = await generateText(prompt, "fast", {
      jsonMode: true,
      userId: options?.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as {
      technicalField?: string;
      backgroundArt?: string;
    };
    return {
      technicalField:
        typeof result.technicalField === "string" ? result.technicalField : "",
      backgroundArt:
        typeof result.backgroundArt === "string" ? result.backgroundArt : "",
    };
  } catch (error) {
    console.error("Failed to analyze patent basics:", error);
    return { technicalField: "", backgroundArt: "" };
  }
};

/**
 * 将工程师的原始技术口述整理为结构化技术交底书要点。
 * @param title 发明名称。
 * @param notes 工程师输入的原始技术说明、访谈记录或要点草稿。
 * @returns 结构化的交底摘要对象；失败时返回空结构。
 */
export const summarizeTechnicalDisclosure = async (
  title: string,
  notes: string,
  options?: AIRequestOptions,
): Promise<TechnicalDisclosureSummary> => {
  const fallback: TechnicalDisclosureSummary = {
    summary: "",
    technicalHighlights: [],
    embodiments: [],
    advantages: [],
    alternativeSolutions: [],
    evidenceMaterials: [],
    risks: [],
  };

  const prompt = `
    你是一位资深中国专利代理师，请把下面的工程师原始说明整理成“技术交底书要点”。

    发明名称：${title}
    原始说明：${notes}

    输出要求：
    1. 返回一个纯 JSON 对象。
    2. summary：用 150-250 字概括技术方案，不写空话。
    3. technicalHighlights：提炼 3-6 个必须保护的关键技术特征。
    4. embodiments：提炼 2-5 个可实施的实施方式或实施步骤。
    5. advantages：提炼 2-5 个技术效果或业务价值。
    6. alternativeSolutions：【仅】提炼可替代的技术实现路径或结构变体，描述形式为"A可改用B实现"或"模块C可替换为D"；【严禁】将实验数据、量化指标或工艺参数混入此字段；没有则返回空数组。
    7. evidenceMaterials：【仅】提炼已知的量化数据、测试结论、实验对比或关键工艺参数，格式如"与现有方法相比XX提升18%"或"关键参数：采样频率200Hz"；【严禁】将替代方案或定性描述混入此字段；没有则返回空数组。
    8. risks：指出仍然缺失的信息，如边界条件、关键参数、与现有技术差异不够明确等。

    JSON 结构如下：
    {
      "summary": "...",
      "technicalHighlights": ["..."],
      "embodiments": ["..."],
      "advantages": ["..."],
      "alternativeSolutions": ["..."],
      "evidenceMaterials": ["..."],
      "risks": ["..."]
    }
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      userId: options?.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as TechnicalDisclosureSummary;

    return {
      summary: typeof result.summary === "string" ? result.summary : "",
      technicalHighlights: Array.isArray(result.technicalHighlights)
        ? result.technicalHighlights.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      embodiments: Array.isArray(result.embodiments)
        ? result.embodiments.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      advantages: Array.isArray(result.advantages)
        ? result.advantages.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      alternativeSolutions: Array.isArray(result.alternativeSolutions)
        ? result.alternativeSolutions.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      evidenceMaterials: Array.isArray(result.evidenceMaterials)
        ? result.evidenceMaterials.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      risks: Array.isArray(result.risks)
        ? result.risks.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    };
  } catch (error) {
    console.error("summarizeTechnicalDisclosure failed:", error);
    return fallback;
  }
};

/**
 * 基于当前交底上下文执行一轮 AI 访谈，返回追问回复和增量整理结果。
 * @param patentData 当前技术交底任务的结构化上下文。
 * @param userMessage 本轮用户输入的技术说明。
 * @returns 访谈回复、更新后的交底摘要和待追问问题；失败时返回兜底结果。
 */
export const runDisclosureInterviewTurn = async (
  patentData: PatentData,
  userMessage: string,
): Promise<DisclosureInterviewResult> => {
  const fallback: DisclosureInterviewResult = {
    assistantReply:
      "我已记录这部分信息。请继续补充现有方案缺陷、关键技术特征、实施方式或效果证据。",
    summary: patentData.disclosureSummary,
    technicalProblem: patentData.technicalProblem,
    existingSolutionIssues: patentData.existingSolutionIssues,
    technicalHighlights: patentData.technicalHighlights,
    embodiments: patentData.embodiments,
    advantages: patentData.advantages,
    alternativeSolutions: patentData.alternativeSolutions,
    evidenceMaterials: patentData.evidenceMaterials,
    pendingQuestions: patentData.disclosurePendingQuestions,
    risks: patentData.strategyRisks,
  };

  const historyText = patentData.disclosureInterview
    .slice(-8)
    .map((item) => `${item.role === "model" ? "AI" : "工程师"}: ${item.text}`)
    .join("\n");

  const prompt = `
    你是一位正在访谈工程师的中国专利代理师。你的目标不是直接写专利，而是把技术交底信息问全、问透、问具体。

    当前项目：${patentData.title}
    已有交底摘要：${patentData.disclosureSummary}
    已识别技术问题：${patentData.technicalProblem}
    已识别现有方案缺陷：${patentData.existingSolutionIssues}
    已识别关键特征：${patentData.technicalHighlights.join("；")}
    已识别实施方式：${patentData.embodiments.join("；")}
    已识别技术效果：${patentData.advantages.join("；")}
    已识别替代方案：${patentData.alternativeSolutions.join("；")}
    已识别证据材料：${patentData.evidenceMaterials.join("；")}
    最近对话：
    ${historyText}

    本轮工程师新增说明：${userMessage}

    任务：
    1. 用 2-4 句话回复工程师，确认你理解了哪些信息，并只追问最关键的缺口。
    2. 更新结构化交底结果，不丢失原有信息。字段填写规则：
       - alternativeSolutions：【仅】记录"A可替换为B"形式的替代实现路径，【严禁】混入数值数据或实验结论。
       - evidenceMaterials：【仅】记录已知的量化指标、实验对比数据或关键工艺参数，【严禁】混入替代方案描述；已识别的所有证据条目必须完整保留，并从本轮说明追加新提取的量化数据，禁止缩短或清空该字段。
    3. pendingQuestions 最多给出 3 个下一轮追问，必须具体，不要泛泛而谈。若当前 evidenceMaterials 少于 2 条，其中至少 1 个问题必须明确要求工程师提供可量化的对比数据、关键参数或实验结论（如精度指标、处理时延、良率提升比例、关键尺寸/阈值等）。
    4. risks 列出仍然影响保护策略质量的信息缺口。若 evidenceMaterials 缺乏可量化数据，务必在 risks 中标注"缺少量化证据或关键参数，建议补充对比实验数据"。

    请返回 JSON：
    {
      "assistantReply": "...",
      "summary": "...",
      "technicalProblem": "...",
      "existingSolutionIssues": "...",
      "technicalHighlights": ["..."],
      "embodiments": ["..."],
      "advantages": ["..."],
      "alternativeSolutions": ["..."],
      "evidenceMaterials": ["..."],
      "pendingQuestions": ["..."],
      "risks": ["..."]
    }
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      userId: patentData.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as DisclosureInterviewResult;

    return {
      assistantReply:
        typeof result.assistantReply === "string"
          ? result.assistantReply
          : fallback.assistantReply,
      summary:
        typeof result.summary === "string" ? result.summary : fallback.summary,
      technicalProblem:
        typeof result.technicalProblem === "string"
          ? result.technicalProblem
          : fallback.technicalProblem,
      existingSolutionIssues:
        typeof result.existingSolutionIssues === "string"
          ? result.existingSolutionIssues
          : fallback.existingSolutionIssues,
      technicalHighlights: Array.isArray(result.technicalHighlights)
        ? result.technicalHighlights.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.technicalHighlights,
      embodiments: Array.isArray(result.embodiments)
        ? result.embodiments.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.embodiments,
      advantages: Array.isArray(result.advantages)
        ? result.advantages.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.advantages,
      alternativeSolutions: Array.isArray(result.alternativeSolutions)
        ? result.alternativeSolutions.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.alternativeSolutions,
      evidenceMaterials: Array.isArray(result.evidenceMaterials)
        ? result.evidenceMaterials.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.evidenceMaterials,
      pendingQuestions: Array.isArray(result.pendingQuestions)
        ? result.pendingQuestions
            .filter((item): item is string => typeof item === "string")
            .slice(0, 3)
        : fallback.pendingQuestions,
      risks: Array.isArray(result.risks)
        ? result.risks.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.risks,
    };
  } catch (error) {
    console.error("runDisclosureInterviewTurn failed:", error);
    return fallback;
  }
};

/**
 * 根据当前技术交底和风险信息生成显式的权利要求策略包。
 * @param patentData 当前技术交底任务数据。
 * @returns 含独立权利要求骨架、从属层级建议和风险提示的策略包；失败时返回空结构。
 */
export const generateClaimStrategyPackage = async (
  patentData: PatentData,
): Promise<ClaimStrategyPackage> => {
  const fallback: ClaimStrategyPackage = {
    claimStrategy: patentData.claimStrategy,
    independentClaimSkeleton: patentData.independentClaimSkeleton,
    dependentClaimOptions: patentData.dependentClaimOptions,
    strategyRisks: patentData.strategyRisks,
  };

  const prompt = `
    你是一位资深中国专利代理师。请基于下列技术交底信息生成“保护策略包”，重点是帮助后续起草权利要求，不要写成完整申请书。

    发明名称：${patentData.title}
    技术问题：${patentData.technicalProblem}
    现有方案缺陷：${patentData.existingSolutionIssues}
    交底摘要：${patentData.disclosureSummary}
    关键技术特征：${patentData.technicalHighlights.join("；")}
    实施方式：${patentData.embodiments.join("；")}
    技术效果：${patentData.advantages.join("；")}
    替代方案：${patentData.alternativeSolutions.join("；")}
    证据材料：${patentData.evidenceMaterials.join("；")}
    当前风险：${patentData.strategyRisks.join("；")}

    输出要求：
    1. claimStrategy：用中文概括保护思路，分点说明独立权利要求、从属权利要求和规避风险处理。
    2. independentClaimSkeleton：输出一版独立权利要求骨架，用“包括……其特征在于……”这种骨架方式，但不要过度展开到正式稿。
    3. dependentClaimOptions：输出 3-6 条从属层级建议，每条一句。
    4. strategyRisks：列出当前保护策略仍然存在的风险或信息缺口。

    返回 JSON：
    {
      "claimStrategy": "...",
      "independentClaimSkeleton": "...",
      "dependentClaimOptions": ["..."],
      "strategyRisks": ["..."]
    }
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      userId: patentData.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as ClaimStrategyPackage;

    return {
      claimStrategy:
        typeof result.claimStrategy === "string"
          ? result.claimStrategy
          : fallback.claimStrategy,
      independentClaimSkeleton:
        typeof result.independentClaimSkeleton === "string"
          ? result.independentClaimSkeleton
          : fallback.independentClaimSkeleton,
      dependentClaimOptions: Array.isArray(result.dependentClaimOptions)
        ? result.dependentClaimOptions.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.dependentClaimOptions,
      strategyRisks: Array.isArray(result.strategyRisks)
        ? result.strategyRisks.filter(
            (item): item is string => typeof item === "string",
          )
        : fallback.strategyRisks,
    };
  } catch (error) {
    console.error("generateClaimStrategyPackage failed:", error);
    return fallback;
  }
};

/**
 * 在审查回写后基于最新交底与风险重新生成保护策略包。
 * @param patentData 已合并审查意见的专利任务数据。
 * @returns 更新后的权利要求策略包；失败时返回当前已有策略内容。
 */
export const regenerateClaimStrategyFromReview = async (
  patentData: PatentData,
): Promise<ClaimStrategyPackage> => {
  try {
    return await generateClaimStrategyPackage(patentData);
  } catch (error) {
    console.error("regenerateClaimStrategyFromReview failed:", error);
    return {
      claimStrategy: patentData.claimStrategy,
      independentClaimSkeleton: patentData.independentClaimSkeleton,
      dependentClaimOptions: patentData.dependentClaimOptions,
      strategyRisks: patentData.strategyRisks,
    };
  }
};

/**
 * Generates a specific section of the patent using gemini-3-pro-preview.
 * This fulfills Requirement 1: "Write patent application based on name/input".
 */
export const generatePatentSection = async (
  sectionName: string,
  patentData: PatentData,
  instructions: string = "",
): Promise<string> => {
  const prompt = `
    你是一位专业的中国专利代理师。请根据以下提供的发明信息，撰写专利申请书的【${sectionName}】部分。
    
    发明名称：${patentData.title}
    技术问题：${patentData.technicalProblem}
    现有方案缺陷：${patentData.existingSolutionIssues}
    交底摘要：${patentData.disclosureSummary}
    关键技术特征：${patentData.technicalHighlights.join("；")}
    典型实施方式：${patentData.embodiments.join("；")}
    技术效果：${patentData.advantages.join("；")}
    可替代方案：${patentData.alternativeSolutions.join("；")}
    证据材料：${patentData.evidenceMaterials.join("；")}
    权利要求策略：${patentData.claimStrategy}
    技术领域：${patentData.technicalField}
    背景技术概要（现有缺陷）：${patentData.backgroundArt}
    发明内容（核心方案）：${patentData.inventionContent}
    附图情况：${patentData.drawings?.length ? `已提供${patentData.drawings.length}幅附图` : "无"}
    
    撰写要求：
    1. 严格遵守中国《专利法》及《专利审查指南》的格式和用语规范。
    2. 语言正式、严谨、逻辑清晰。
    3. 使用Markdown格式（如列表、加粗），如果有数学公式请使用LaTeX格式（$ E=mc^2 $）。
    4. ${instructions || "请根据标准专利撰写要求进行扩展和深化。"}
    
    仅返回【${sectionName}】的内容，不要包含其他解释性文字。
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      userId: patentData.userId,
    });
    return text || "";
  } catch (error) {
    console.error(`Failed to generate section ${sectionName}:`, error);
    return "生成失败，请重试。";
  }
};

/**
 * Generates a patent drawing via DashScope Wanx (Qwen provider).
 * Uses async task polling: submit → poll → fetch image → base64.
 */
const generatePatentDrawingQwen = async (prompt: string): Promise<string> => {
  if (!QWEN_API_KEY) {
    console.error("Qwen API key is missing for image generation.");
    return "";
  }

  const DASHSCOPE_IMAGE_URL =
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
  const DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/";

  // 1. Submit task
  let taskId: string;
  try {
    const submitRes = await fetch(DASHSCOPE_IMAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${QWEN_API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: MODEL_QWEN_IMAGE,
        input: { prompt },
        parameters: { size: "1024*768", n: 1 },
      }),
    });
    if (!submitRes.ok) {
      console.error(
        "Qwen image task submission failed:",
        await submitRes.text(),
      );
      return "";
    }
    const submitData = (await submitRes.json()) as {
      output?: { task_id?: string };
    };
    taskId = submitData.output?.task_id ?? "";
    if (!taskId) {
      console.error("Qwen image task submission returned no task_id.");
      return "";
    }
  } catch (error) {
    console.error("Qwen image task submission error:", error);
    return "";
  }

  // 2. Poll until SUCCEEDED or FAILED (max 60s, interval 3s)
  const MAX_POLLS = 20;
  let imageUrl = "";
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const pollRes = await fetch(`${DASHSCOPE_TASK_URL}${taskId}`, {
        headers: { Authorization: `Bearer ${QWEN_API_KEY}` },
      });
      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json()) as {
        output?: {
          task_status?: string;
          results?: Array<{ url?: string }>;
        };
      };
      const status = pollData.output?.task_status;
      if (status === "SUCCEEDED") {
        imageUrl = pollData.output?.results?.[0]?.url ?? "";
        break;
      }
      if (status === "FAILED") {
        console.error("Qwen image task failed.");
        return "";
      }
    } catch (error) {
      console.error("Qwen image task poll error:", error);
    }
  }

  if (!imageUrl) {
    console.error("Qwen image generation timed out or returned no URL.");
    return "";
  }

  // 3. Fetch image and convert to base64
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error("Failed to fetch generated image from URL.");
      return "";
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error("Failed to convert Qwen image to base64:", error);
    return "";
  }
};

/**
 * Generates a schematic drawing for the patent using Imagen.
 */
export const generatePatentDrawing = async (
  title: string,
  drawingDescription: string,
): Promise<string> => {
  // Update: Prompt now relies on the user's "Description of Drawings" text to be more specific.
  // Using the user's provided Chinese description in the prompt context.
  const prompt = `
    Create a professional patent line drawing (schematic) for an invention titled "${title}".
    
    Drawing Description (Content to depict):
    ${drawingDescription}
    
    Style requirements: Black and white technical line art, high contrast, white background, no shading, no text labels, clean isometric or cross-sectional view. 
    Ensure it looks like a formal figure for a patent application.
  `;

  try {
    if (!useGemini()) {
      return generatePatentDrawingQwen(prompt);
    }

    if (!geminiClient) {
      console.error("Gemini API key is missing for image generation.");
      return "";
    }

    const response = await geminiClient.models.generateImages({
      model: MODEL_GEMINI_IMAGE,
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "4:3",
        outputMimeType: "image/jpeg",
      },
    });

    return response.generatedImages?.[0]?.image?.imageBytes || "";
  } catch (error) {
    console.error("Failed to generate drawing:", error);
    return "";
  }
};

/**
 * 对专利文本执行语言润色、智能扩充或法言法语改写。
 * @param text 待处理的纯文本，调用方应先去除 HTML 标签并保留必要编号结构。
 * @param action 处理动作：expand 为智能扩充，polish 为语言润色，fix_legal 为法言法语。
 * @param options 当前章节和专利上下文，用于约束输出风格、结构和授权风险。
 * @returns 改写后的 Markdown/纯文本；若调用失败则返回原文本。
 */
export const refineText = async (
  text: string,
  action: RefineTextAction,
  options?: RefineTextOptions,
): Promise<string> => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return text;
  }

  const sectionLabel = options?.section
    ? REFINE_SECTION_LABELS[options.section]
    : "当前文本";
  const actionLabel = REFINE_ACTION_LABELS[action];
  const actionRules = getRefineActionRules(action, options)
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join("\n");
  const sectionRules = getRefineSectionRules(options?.section, action)
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join("\n");
  const contextLines = buildRefineContextLines(options).join("\n");
  const scopeRule =
    options?.operationScope === "selection"
      ? "你输出的结果必须能直接替换所选片段，与前后文自然衔接，不要额外补章节标题。"
      : "如原文已有标题、列表、编号或分段，请默认保留其组织方式。";

  const prompt = `
    现在请对专利文本执行“${actionLabel}”。

    处理对象：${sectionLabel}
    ${contextLines ? `专利上下文：\n${contextLines}\n` : ""}
    处理目标：
    ${actionRules}

    章节规范：
    ${sectionRules}

    输出要求：
    1. 只输出改写后的正文，不要解释、不加提示语、不加代码块。
    2. 保留 Markdown 结构、LaTeX 公式、图号、步骤号、权利要求编号和原有层级。
    3. 不编造实验数据、数值范围、实施例编号、对比结论、法律结论或新附图。
    4. ${scopeRule}

    原文开始
    ${normalizedText}
    原文结束
  `;

  try {
    const { text: generated } = await generateText(prompt, "pro", {
      systemInstruction: REFINE_TEXT_SYSTEM_INSTRUCTION,
      userId: options?.userId,
    });
    return generated || text;
  } catch (error) {
    console.error("Refinement failed:", error);
    return text;
  }
};

/**
 * Chat with AI Assistant.
 * Fulfills feature: "AI powered chatbot".
 */
export const createChatSession = (
  options?: ChatSessionOptions,
): ChatSession => {
  const systemInstruction = `
    你是一位精通中国专利法（CNIPA）的AI助手。你可以回答用户关于专利申请流程、法律法规的问题，或者帮助用户分析他们当前的专利草稿。回答要简练、专业。
    ${options?.contextPrompt ? `当前业务上下文如下：\n${options.contextPrompt}` : ""}
  `;

  if (useGemini() && geminiClient) {
    const geminiChat = geminiClient.chats.create({
      model: getTextModel("pro"),
      config: { systemInstruction },
    });

    return {
      sendMessage: async ({
        message,
      }: {
        message: string;
      }): Promise<ChatSessionResponse> => {
        try {
          const quotaExceededMessage = await getQuotaExceededMessage(
            options?.userId,
          );
          if (quotaExceededMessage) {
            return { text: quotaExceededMessage };
          }

          const response = await geminiChat.sendMessage({ message });
          const text = response.text || "";

          if (options?.userId && text) {
            void incrementUsage(options.userId, 1);
          }

          return { text };
        } catch (error) {
          console.error("Gemini chat failed:", error);
          return { text: "抱歉，我现在无法回答，请稍后再试。" };
        }
      },
    };
  }

  const qwenHistory: QwenMessage[] = [
    { role: "system", content: systemInstruction },
  ];

  return {
    sendMessage: async ({
      message,
    }: {
      message: string;
    }): Promise<ChatSessionResponse> => {
      try {
        const quotaExceededMessage = await getQuotaExceededMessage(
          options?.userId,
        );
        if (quotaExceededMessage) {
          return { text: quotaExceededMessage };
        }

        qwenHistory.push({ role: "user", content: message });
        const text = await requestQwenChat(qwenHistory, getTextModel("pro"));
        const answer = text || "抱歉，我现在无法回答，请稍后再试。";

        if (options?.userId && text) {
          void incrementUsage(options.userId, 1);
        }

        qwenHistory.push({ role: "assistant", content: answer });
        return { text: answer };
      } catch (error) {
        console.error("Qwen chat failed:", error);
        return { text: "抱歉，我现在无法回答，请稍后再试。" };
      }
    },
  };
};

/**
 * Simulate a formal Patent Examination.
 * Used in the final stage to decide if the patent is ready for submission.
 */
export const runFinalPatentReview = async (
  patentData: PatentData,
): Promise<ReviewResult> => {
  const prompt = `
      你现在是中国国家知识产权局（CNIPA）的资深审查员。请对以下专利申请书草稿进行严格的实质审查。

      发明名称：${patentData.title}

      权利要求书内容：
      ${patentData.claims || "（未提供）"}

      说明书内容摘要（含具体实施方式）：
      ${patentData.abstract || ""}
      ${patentData.detailedDescription || ""}

      审查标准：
      1. 权利要求是否清楚、完整，保护范围是否明确（CNIPA标准）。
      2. 说明书是否充分公开了发明内容，能够支撑权利要求。
      3. 是否具备明显的新颖性和创造性迹象。
      4. 语言是否符合法律文书规范。

      请仔细找出草稿中的具体问题，并为每个问题提供修改后的建议文本（重写相关章节）。

      **重要：suggestion 字段必须直接包含可以替换到对应章节的完整内容，不要添加任何说明性文字、前缀或"示例："等标记。**

      请返回JSON格式结果，格式如下：
      {
        "score": number, // 0-100分。只有 > 80 分才算合格。
        "feedback": "整体评价总结。",
        "passed": boolean, // score > 80 为 true
        "detailedIssues": [
           {
             "section": "claims" | "abstract" | "detailedDescription" | "backgroundArt" | "descriptionOfDrawings", // 必须是这几个字符串之一
             "severity": "critical" | "major" | "minor", // 严重程度
             "category": "新颖性" | "创造性" | "公开充分" | "格式规范" | "权利要求" | "术语一致性", // 问题类别
             "issue": "具体问题的详细描述",
             "suggestion": "针对该章节的完整重写建议内容（直接以【章节名】开头的正文内容，不要包含任何指导性说明）"
           }
        ]
      }
    `;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      userId: patentData.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as ReviewResult;

    if (typeof result.score !== "number") result.score = 0;
    if (typeof result.feedback !== "string")
      result.feedback = DEFAULT_REVIEW_RESULT.feedback;
    if (typeof result.passed !== "boolean") result.passed = result.score > 80;
    if (!Array.isArray(result.detailedIssues)) result.detailedIssues = [];

    // 确保每个 issue 都有 severity 和 category
    result.detailedIssues = result.detailedIssues.map((issue) => {
      if (!issue.severity) {
        issue.severity =
          issue.issue.includes("不符合") || issue.issue.includes("错误")
            ? "major"
            : "minor";
      }
      if (!issue.category) {
        issue.category = "格式规范";
      }
      return issue;
    });

    return result;
  } catch (error) {
    console.error("Review failed:", error);
    return DEFAULT_REVIEW_RESULT;
  }
};

// ============================================
// Step 4: AI Generation Module - 5 new methods
// ============================================

/**
 * Generate patent abstract from disclosure data
 */
export const generateAbstract = async (
  disclosureData: DisclosureData,
): Promise<string> => {
  const answers = disclosureData.answers.reduce(
    (acc, curr) => {
      acc[curr.questionId] = curr.answer;
      return acc;
    },
    {} as Record<string, string>,
  );

  const prompt = `
    你是一位专业的中国专利代理师。请根据以下技术交底信息，生成专利摘要（200-300字）。

    发明名称：${disclosureData.title}
    专利类型：${disclosureData.type === "invention" ? "发明专利" : "实用新型"}
    技术领域：${disclosureData.field}
    技术问题/发明目的：${answers["q1"] || answers["purpose"] || ""}
    现有技术缺陷：${answers["q2"] || answers["background"] || ""}
    技术解决方案：${answers["q3"] || answers["solution"] || ""}
    核心技术特征：${answers["q4"] || answers["innovation"] || ""}
    具体实施方式：${answers["q5"] || answers["embodiment"] || ""}
    技术效果：${answers["q6"] || answers["effect"] || ""}

    要求：
    1. 包含技术问题、解决方案、技术效果三个核心要素
    2. 避免使用商业宣传用语，保持客观专业
    3. 语法规范，符合国家知识产权局要求
    4. 直接输出摘要文本，不要包含解释性文字
  `;

  try {
    const { text } = await generateText(prompt, "fast", {
      userId: disclosureData.userId,
    });
    return text || "";
  } catch (error) {
    console.error("generateAbstract failed:", error);
    return "";
  }
};

/**
 * Generate patent claims from disclosure data
 * Returns JSON with independent and dependent claims
 */
export const generateClaims = async (
  disclosureData: DisclosureData,
): Promise<string> => {
  const answers = disclosureData.answers.reduce(
    (acc, curr) => {
      acc[curr.questionId] = curr.answer;
      return acc;
    },
    {} as Record<string, string>,
  );

  const prompt = `
    你是一位专业的中国专利代理师。请根据以下技术交底信息，生成权利要求书。

    发明名称：${disclosureData.title}
    专利类型：${disclosureData.type === "invention" ? "发明专利" : "实用新型"}
    技术领域：${disclosureData.field}
    技术问题/发明目的：${answers["q1"] || answers["purpose"] || ""}
    现有技术缺陷：${answers["q2"] || answers["background"] || ""}
    技术解决方案：${answers["q3"] || answers["solution"] || ""}
    核心技术特征：${answers["q4"] || answers["innovation"] || ""}
    具体实施方式：${answers["q5"] || answers["embodiment"] || ""}
    技术效果：${answers["q6"] || answers["effect"] || ""}

    要求：
    1. 返回JSON格式，包含 independentClaims 和 dependentClaims
    2. **独立权利要求必须是一个完整句子**，不得包含句号分段，必须采用"一种……，包括……；其特征在于……"的标准结构
    3. 从属权利要求2-4个，每条必须明确引用编号："根据权利要求N所述的……，其特征在于……"
    4. 每条权利要求只能包含一个主句，技术特征之间用"，"或"；"连接
    5. 权利要求术语必须与技术方案描述一致
    6. 直接返回JSON，不要包含解释性文字

    JSON格式：
    {
      "independentClaims": ["独立权利要求1"],
      "dependentClaims": ["从属权利要求1", "从属权利要求2", "从属权利要求3"]
    }
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      userId: disclosureData.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as {
      independentClaims?: string[];
      dependentClaims?: string[];
    };

    const independent = result.independentClaims?.[0] || "权利要求生成失败";
    const dependent = result.dependentClaims || [];

    return JSON.stringify(
      { independentClaims: [independent], dependentClaims: dependent },
      null,
      2,
    );
  } catch (error) {
    console.error("generateClaims failed:", error);
    return JSON.stringify(
      { independentClaims: ["生成失败，请重试"], dependentClaims: [] },
      null,
      2,
    );
  }
};

/**
 * Generate patent description from disclosure data
 * Returns description with background, purpose, solution sections
 */
export const generateDescription = async (
  disclosureData: DisclosureData,
): Promise<string> => {
  const answers = disclosureData.answers.reduce(
    (acc, curr) => {
      acc[curr.questionId] = curr.answer;
      return acc;
    },
    {} as Record<string, string>,
  );

  const prompt = `
    你是一位专业的中国专利代理师。请根据以下技术交底信息，生成专利说明书的主要部分。

    发明名称：${disclosureData.title}
    专利类型：${disclosureData.type === "invention" ? "发明专利" : "实用新型"}
    技术领域：${disclosureData.field}

    ## 背景技术（现有技术及其缺陷）
    ${answers["q2"] || answers["background"] || ""}

    ## 发明目的
    ${answers["q1"] || answers["purpose"] || ""}

    ## 技术解决方案
    ${answers["q3"] || answers["solution"] || ""}

    ## 核心创新点
    ${answers["q4"] || answers["innovation"] || ""}

    ## 具体实施方式
    ${answers["q5"] || answers["embodiment"] || ""}

    ## 技术效果
    ${answers["q6"] || answers["effect"] || ""}

    要求：
    1. 严格遵守中国《专利法》及《专利审查指南》的格式和用语规范
    2. 语言正式、严谨、逻辑清晰
    3. 使用Markdown格式（标题、列表等）
    4. 输出包含以下部分：技术领域、背景技术、发明目的、技术方案、有益效果
    5. 直接输出说明书内容，不要包含解释性文字
  `;

  try {
    const { text } = await generateText(prompt, "pro", {
      userId: disclosureData.userId,
    });
    return text || "";
  } catch (error) {
    console.error("generateDescription failed:", error);
    return "生成失败，请重试。";
  }
};

/**
 * Generate patent embodiments from disclosure data
 * Returns array of embodiment descriptions
 */
export const generateEmbodiments = async (
  disclosureData: DisclosureData,
): Promise<string> => {
  const answers = disclosureData.answers.reduce(
    (acc, curr) => {
      acc[curr.questionId] = curr.answer;
      return acc;
    },
    {} as Record<string, string>,
  );

  const prompt = `
    你是一位专业的中国专利代理师。请根据以下技术交底信息，生成专利的具体实施方式（实施例）。

    发明名称：${disclosureData.title}
    专利类型：${disclosureData.type === "invention" ? "发明专利" : "实用新型"}
    技术领域：${disclosureData.field}

    技术解决方案：${answers["q3"] || answers["solution"] || ""}
    核心创新点：${answers["q4"] || answers["innovation"] || ""}
    基础实施方式：${answers["q5"] || answers["embodiment"] || ""}
    技术效果：${answers["q6"] || answers["effect"] || ""}

    要求：
    1. 返回JSON格式，包含 embodiments 数组
    2. 生成2-3个具体实施例，包含详细的参数、步骤、结构描述
    3. 每个实施例应该具体、可实施，包含足够的细节使本领域技术人员能够实现
    4. 如果有优选参数、替代方案也应该包含
    5. 直接返回JSON，不要包含解释性文字

    JSON格式：
    {
      "embodiments": [
        {
          "title": "实施例1标题",
          "description": "实施例1的详细描述",
          "parameters": {"参数1": "值1", "参数2": "值2"}
        }
      ]
    }
  `;

  try {
    const { text } = await generateText(prompt, "fast", {
      jsonMode: true,
      userId: disclosureData.userId,
    });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as {
      embodiments?: Array<{
        title?: string;
        description?: string;
        parameters?: Record<string, string>;
      }>;
    };

    if (!result.embodiments || result.embodiments.length === 0) {
      return JSON.stringify(
        {
          embodiments: [
            {
              title: "实施例1",
              description: "生成失败，请重试",
              parameters: {},
            },
          ],
        },
        null,
        2,
      );
    }

    return JSON.stringify({ embodiments: result.embodiments }, null, 2);
  } catch (error) {
    console.error("generateEmbodiments failed:", error);
    return JSON.stringify(
      {
        embodiments: [
          { title: "实施例1", description: "生成失败，请重试", parameters: {} },
        ],
      },
      null,
      2,
    );
  }
};

/**
 * Generate drawings description from embodiments
 */
export const generateDrawingsDescription = async (
  embodimentsJson: string,
  options?: AIRequestOptions,
): Promise<string> => {
  let embodiments: Array<{ title?: string; description?: string }> = [];
  try {
    const parsed = JSON.parse(embodimentsJson);
    embodiments = parsed.embodiments || [];
  } catch {
    embodiments = [];
  }

  const prompt = `
    你是一位专业的中国专利代理师。请根据以下实施例信息，生成专利的附图说明。

    实施例信息：
    ${embodiments.map((e, i) => `实施例${i + 1}: ${e.title} - ${e.description}`).join("\n")}

    要求：
    1. 描述每一幅附图的内容和要表达的技术方案
    2. 使用"图1"、"图2"等编号
    3. 语言简洁、专业，符合专利局格式要求
    4. 直接输出附图说明，不要包含其他解释性文字

    输出格式示例：
    图1是本发明的整体结构示意图；
    图2是本发明的局部放大图；
    图3是本发明的工作流程图。
  `;

  try {
    const { text } = await generateText(prompt, "fast", {
      userId: options?.userId,
    });
    return text || "";
  } catch (error) {
    console.error("generateDrawingsDescription failed:", error);
    return "生成失败，请重试。";
  }
};

/**
 * Generate Mermaid diagram code for each figure described in the patent.
 * Returns an array of Mermaid code strings, one per figure.
 */
export const generateMermaidDiagrams = async (
  title: string,
  inventionContent: string,
  detailedDescription: string,
  descriptionOfDrawings: string,
  options?: AIRequestOptions,
): Promise<string[]> => {
  // Parse figure count strictly from descriptionOfDrawings
  const figureMatches = descriptionOfDrawings.match(/图\s*(\d+)/g) || [];
  const uniqueFigures = [
    ...new Set(figureMatches.map((m) => m.replace(/\s/g, ""))),
  ];
  const figureCount = Math.min(Math.max(uniqueFigures.length || 1, 1), 6);

  const prompt = `
你是一位专业的中国专利代理师兼技术绘图专家。你的任务是严格根据【附图说明】中每幅图的文字描述，结合专利技术内容，为每一幅附图生成对应的 Mermaid 图表代码。

发明名称：${title}

发明内容摘要：
${inventionContent}

具体实施方式（节选）：
${detailedDescription.slice(0, 1500)}

【附图说明】（核心依据，必须严格遵照）：
${descriptionOfDrawings}

核心要求：
1. 附图说明中共有 ${figureCount} 幅图（${uniqueFigures.join("、")}），必须为每一幅图单独生成一个 Mermaid 图表
2. 每幅图的内容必须严格对应附图说明中该图的文字描述，不得凭空创造附图说明中未提及的内容
3. 根据图的描述选择最合适的 Mermaid 图类型：
   - 流程图/方法步骤 → flowchart TD
   - 系统架构/模块关系 → graph LR 或 graph TB
   - 时序/交互 → sequenceDiagram
   - 类/数据结构 → classDiagram
4. 节点文字用中文，简洁清晰，每个节点不超过10个字
5. 图表要真实反映附图说明中该图所描述的技术内容
6. 严格输出合法的 Mermaid 语法，不要包含任何解释性文字
7. 返回 JSON 格式，diagrams 数组长度必须等于 ${figureCount}

JSON 格式：
{
  "diagrams": [
    "flowchart TD\\n    A[开始] --> B[步骤1]\\n    B --> C[结束]",
    "graph LR\\n    A[模块A] --> B[模块B]"
  ]
}
`;

  try {
    const { text } = await generateText(prompt, "pro", {
      jsonMode: true,
      userId: options?.userId,
    });
    const jsonStr = extractJsonObject(text);
    const result = JSON.parse(jsonStr) as { diagrams?: string[] };
    return result.diagrams || [];
  } catch (error) {
    console.error("generateMermaidDiagrams failed:", error);
    return [];
  }
};

import { GoogleGenAI } from "@google/genai";
import type {
  ClaimStrategyPackage,
  DisclosureInterviewTurn,
  NoveltyReport,
  PatentData,
  ReviewResult,
  TechnicalDisclosureSummary,
} from "../types";

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
const MODEL_GEMINI_IMAGE =
  process.env.GEMINI_MODEL_IMAGE || "imagen-4.0-generate-001";

const MODEL_QWEN_FAST = process.env.QWEN_MODEL_FAST || "qwen-plus";
const MODEL_QWEN_PRO = process.env.QWEN_MODEL_PRO || "qwen-max";

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
  content: string;
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

interface ChatSessionOptions {
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

const useGemini = (): boolean => AI_PROVIDER !== PROVIDER_QWEN;

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

const generateText = async (
  prompt: string,
  level: "fast" | "pro",
  options?: {
    systemInstruction?: string;
    useGoogleSearch?: boolean;
    jsonMode?: boolean;
  },
): Promise<{
  text: string;
  groundingLinks: Array<{ title: string; uri: string }>;
}> => {
  try {
    const model = getTextModel(level);

    if (useGemini()) {
      if (!geminiClient) {
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

      return {
        text: response.text || "",
        groundingLinks,
      };
    }

    const qwenMessages: QwenMessage[] = [];
    if (options?.systemInstruction) {
      qwenMessages.push({ role: "system", content: options.systemInstruction });
    }
    qwenMessages.push({ role: "user", content: prompt });

    const text = await requestQwenChat(
      qwenMessages,
      model,
      !!options?.jsonMode,
    );
    return { text, groundingLinks: [] };
  } catch (error) {
    console.error("generateText failed:", error);
    return { text: "", groundingLinks: [] };
  }
};

/**
 * Performs a Novelty Search using gemini-2.5-flash and Google Search Grounding.
 * This fulfills Requirement 2: "Check patent system, judge success probability".
 */
export const performNoveltySearch = async (
  title: string,
  description: string,
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
      "score": number,
      "analysis": "详细的定性分析报告（不要包含分数和链接列表）...",
      "priorArtLinks": [{"title": "标题", "uri": "URL"}]
    }
  `;

  try {
    const { text, groundingLinks } = await generateText(prompt, "fast", {
      useGoogleSearch: useGemini(),
    });

    if (!text) {
      return {
        score: 0,
        analysis: "检索服务暂时不可用，请稍后重试。",
        priorArtLinks: [],
      };
    }

    const jsonString = extractJsonObject(text);

    let report: NoveltyReport;
    try {
      report = JSON.parse(jsonString) as NoveltyReport;
      if (typeof report.score !== "number") report.score = 0;
      if (typeof report.analysis !== "string") report.analysis = "";
      if (!Array.isArray(report.priorArtLinks)) report.priorArtLinks = [];
    } catch (e) {
      // 解析失败，尝试用正则提取 analysis 字段
      let analysis = "";
      const analysisMatch = jsonString.match(
        /"analysis"\s*:\s*"([\s\S]*?)"[,}]/,
      );
      if (analysisMatch) {
        analysis = analysisMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
      } else {
        // 尝试匹配 analysis: ... 形式
        const altMatch = jsonString.match(
          /analysis\s*[:=]\s*(["']?)([\s\S]*?)\1[,}]/,
        );
        if (altMatch) analysis = altMatch[2];
      }
      if (!analysis) analysis = jsonString;
      report = {
        score: 0,
        analysis,
        priorArtLinks: [],
      };
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
  analysis: string,
): Promise<string> => {
  const prompt = `
    你是一位专业的专利工程师和技术专家。
    
    当前的发明内容概要：
    ${currentContent}
    
    根据以下的新颖性审查/分析意见（指出了现有技术的重合点或不足）：
    ${analysis}
    
    任务：
    请重写并优化“发明内容概要”，以提高其新颖性和授权概率。
    1. **规避现有技术**：针对审查意见中提到的对比文件，通过增加独特的限制特征来构建“护城河”。
    2. **突出创造性**：强调本发明解决了现有技术无法解决的技术难题，并未产生预料不到的技术效果。
    3. **深化技术细节**：增加具体实施方式的描述，使其看起来更像一个成熟、可落地的技术方案。
    
    请直接返回优化后的文本内容，不要包含“好的”、“优化后的内容如下”等客套话。
  `;

  try {
    const { text } = await generateText(prompt, "pro");
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
export const generateInventionIdea = async (title: string): Promise<string> => {
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
    const { text } = await generateText(prompt, "pro");
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
    const { text } = await generateText(prompt, "fast", { jsonMode: true });
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
    6. alternativeSolutions：提炼可替代实现、变体或扩展方向；没有则返回空数组。
    7. evidenceMaterials：提炼实验数据、对比结果、工艺参数、结构尺寸、流程图等可补充证据；没有则返回空数组。
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
    const { text } = await generateText(prompt, "pro", { jsonMode: true });
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
    2. 更新结构化交底结果，不丢失原有信息。
    3. pendingQuestions 最多给出 3 个下一轮最值得问的问题，必须具体，不要泛泛而谈。
    4. risks 列出仍然影响保护策略质量的信息缺口。

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
    const { text } = await generateText(prompt, "pro", { jsonMode: true });
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
    const { text } = await generateText(prompt, "pro", { jsonMode: true });
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
    const { text } = await generateText(prompt, "pro");
    return text || "";
  } catch (error) {
    console.error(`Failed to generate section ${sectionName}:`, error);
    return "生成失败，请重试。";
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
      console.error(
        "Qwen provider does not support image generation in current implementation.",
      );
      return "";
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
 * Refines/Polishes a text segment.
 * Fulfills Requirement 3: "Support modification, completion, beautification".
 */
export const refineText = async (
  text: string,
  action: "expand" | "polish" | "fix_legal",
): Promise<string> => {
  let instruction = "";
  switch (action) {
    case "expand":
      instruction = "扩充这段文字，使其更加详尽，增加具体实施方式的细节。";
      break;
    case "polish":
      instruction = "润色这段文字，使其语言更加通顺、专业，消除语病。";
      break;
    case "fix_legal":
      instruction =
        "将这段文字转化为标准的专利法律术语，使其符合权利要求的规范性。";
      break;
  }

  const prompt = `
    原文：
    "${text}"
    
    任务：${instruction}
    
    要求：保持Markdown格式，保留原有的数学公式（LaTeX）。
    
    请直接输出修改后的文本，不需要解释。
  `;

  try {
    const { text: generated } = await generateText(prompt, "pro");
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
          const response = await geminiChat.sendMessage({ message });
          return { text: response.text || "" };
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
        qwenHistory.push({ role: "user", content: message });
        const text = await requestQwenChat(qwenHistory, getTextModel("pro"));
        const answer = text || "抱歉，我现在无法回答，请稍后再试。";
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
      
      请返回JSON格式结果，格式如下：
      {
        "score": number, // 0-100分。只有 > 80 分才算合格。
        "feedback": "整体评价总结。",
        "passed": boolean, // score > 80 为 true
        "detailedIssues": [
           {
             "section": "claims" | "abstract" | "detailedDescription" | "backgroundArt" | "descriptionOfDrawings", // 必须是这几个字符串之一
             "issue": "具体问题的详细描述",
             "suggestion": "针对该章节的完整重写建议内容（Fix）"
           }
        ]
      }
    `;

  try {
    const { text } = await generateText(prompt, "pro", { jsonMode: true });
    const jsonString = extractJsonObject(text);
    const result = JSON.parse(jsonString) as ReviewResult;

    if (typeof result.score !== "number") result.score = 0;
    if (typeof result.feedback !== "string")
      result.feedback = DEFAULT_REVIEW_RESULT.feedback;
    if (typeof result.passed !== "boolean") result.passed = result.score > 80;
    if (!Array.isArray(result.detailedIssues)) result.detailedIssues = [];

    return result;
  } catch (error) {
    console.error("Review failed:", error);
    return DEFAULT_REVIEW_RESULT;
  }
};
